import request from 'supertest';
import { createApp } from '../src/app';
import { migrate, pool } from '../src/db';

// Integration tests: need a running PostgreSQL (see README). Each run uses fresh
// phone numbers and deletes them afterwards, so it is safe on your dev database.
const app = createApp();
const suffix = String(Date.now()).slice(-8);
const phoneA = `+9198${suffix}`;
const phoneB = `+9197${suffix}`;

async function login(phone: string): Promise<string> {
  await request(app).post('/auth/request-otp').send({ phone }).expect(200);
  const res = await request(app).post('/auth/verify-otp').send({ phone, otp: '123456' }).expect(200);
  return res.body.token;
}

let tokenA: string;
let tokenB: string;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const addLoan = (t: string, body: object) =>
  request(app).post('/loans').set(auth(t)).send(body);

beforeAll(async () => {
  await migrate();
  tokenA = await login(phoneA);
  tokenB = await login(phoneB);
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE phone = ANY($1)', [[phoneA, phoneB]]);
  await pool.query('DELETE FROM otps WHERE phone = ANY($1)', [[phoneA, phoneB]]);
  await pool.end();
});

describe('auth', () => {
  it('rejects an invalid phone number', async () => {
    await request(app).post('/auth/request-otp').send({ phone: '123' }).expect(400);
  });

  it('rejects a wrong OTP', async () => {
    await request(app).post('/auth/request-otp').send({ phone: phoneA }).expect(200);
    await request(app).post('/auth/verify-otp').send({ phone: phoneA, otp: '000000' }).expect(401);
  });

  it('protects loan routes', async () => {
    await request(app).get('/loans').expect(401);
    await request(app).get('/loans/summary').set(auth('not-a-token')).expect(401);
  });
});

describe('loans', () => {
  let overdueId: string;
  let repaidId: string;

  it('rejects invalid input', async () => {
    const good = { friendName: 'Rohan', amount: 100, dueDate: '2999-01-01' };
    const bad = [
      { ...good, amount: -5 },
      { ...good, amount: 10.123 },
      { ...good, friendName: '  ' },
      { ...good, dueDate: '2025-02-30' },
      { ...good, dueDate: 'tomorrow' },
    ];
    for (const body of bad) await addLoan(tokenB, body).expect(400);
  });

  it('creates entries and marks one repaid', async () => {
    overdueId = (await addLoan(tokenB, { friendName: 'Asha', amount: 500, dueDate: '2000-01-01' }).expect(201)).body.id;
    await addLoan(tokenB, { friendName: 'Ravi', amount: 300, dueDate: '2999-12-31' }).expect(201);
    repaidId = (await addLoan(tokenB, { friendName: 'Meera', amount: 200, dueDate: '2000-01-01' }).expect(201)).body.id;

    const res = await request(app).patch(`/loans/${repaidId}/repay`).set(auth(tokenB)).expect(200);
    expect(res.body.isRepaid).toBe(true);
    expect(res.body.isOverdue).toBe(false);
  });

  it('flags overdue entries in the list', async () => {
    const { body } = await request(app).get('/loans').set(auth(tokenB)).expect(200);
    expect(body).toHaveLength(3);
    expect(body.find((l: any) => l.id === overdueId).isOverdue).toBe(true);
    expect(body.find((l: any) => l.friendName === 'Ravi').isOverdue).toBe(false);
    expect(body[body.length - 1].id).toBe(repaidId); // repaid entries sort last
  });

  it('returns a correct summary', async () => {
    const { body } = await request(app).get('/loans/summary').set(auth(tokenB)).expect(200);
    expect(body).toMatchObject({
      totalLent: 1000,
      totalRepaid: 200,
      overdueAmount: 500,
      overdueCount: 1,
      outstanding: 800,
    });
  });

  it('returns 409 when repaying twice', async () => {
    await request(app).patch(`/loans/${repaidId}/repay`).set(auth(tokenB)).expect(409);
  });

  it("does not let another user see or change someone else's loan", async () => {
    await request(app).patch(`/loans/${overdueId}/repay`).set(auth(tokenA)).expect(404);
    const { body } = await request(app).get('/loans').set(auth(tokenA)).expect(200);
    expect(body).toHaveLength(0);
    await request(app).patch('/loans/not-a-uuid/repay').set(auth(tokenA)).expect(404);
  });

  it('accepts an image receipt and serves it only to the owner', async () => {
    const res = await request(app)
      .post('/loans')
      .set(auth(tokenA))
      .field('friendName', 'Kabir')
      .field('amount', '75.25')
      .field('dueDate', '2999-06-01')
      .attach('receipt', Buffer.from('fake-image-bytes'), { filename: 'r.png', contentType: 'image/png' })
      .expect(201);
    expect(res.body.hasReceipt).toBe(true);
    expect(res.body.amount).toBe(75.25);

    await request(app).get(`/loans/${res.body.id}/receipt`).set(auth(tokenA)).expect(200);
    await request(app).get(`/loans/${res.body.id}/receipt`).set(auth(tokenB)).expect(404);
  });

  it('rejects non-image receipts', async () => {
    await request(app)
      .post('/loans')
      .set(auth(tokenA))
      .field('friendName', 'Kabir')
      .field('amount', '10')
      .field('dueDate', '2999-06-01')
      .attach('receipt', Buffer.from('hello'), { filename: 'notes.txt', contentType: 'text/plain' })
      .expect(400);
  });
});
