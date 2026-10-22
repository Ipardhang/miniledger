import crypto from 'crypto';
import { NextFunction, Request, Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { pool } from './db';
import { ah, HttpError } from './errors';
import { requestOtpSchema, verifyOtpSchema } from './validation';

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export const authRouter = Router();

// Step 1: ask for an OTP. It is "sent" by printing it to the server log.
authRouter.post(
  '/request-otp',
  ah(async (req, res) => {
    const { phone } = requestOtpSchema.parse(req.body);
    const code = config.mockOtp || String(crypto.randomInt(100000, 1000000));

    await pool.query(
      `INSERT INTO otps (phone, code_hash, expires_at, attempts) VALUES ($1, $2, $3, 0)
       ON CONFLICT (phone) DO UPDATE
         SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0`,
      [phone, sha256(code), new Date(Date.now() + config.otpTtlMs)],
    );

    console.log(`[MOCK OTP] ${phone} -> ${code} (valid for 5 minutes)`);
    res.json({ message: 'OTP sent. Check the server log.' });
  }),
);

// Step 2: exchange phone + OTP for a JWT. The user is created on first login.
authRouter.post(
  '/verify-otp',
  ah(async (req, res) => {
    const { phone, otp } = verifyOtpSchema.parse(req.body);

    const { rows } = await pool.query(
      'SELECT code_hash, expires_at, attempts FROM otps WHERE phone = $1',
      [phone],
    );
    const rec = rows[0];
    if (!rec || new Date(rec.expires_at) < new Date()) {
      throw new HttpError(401, 'OTP expired or not requested. Please request a new one.');
    }
    if (rec.attempts >= config.otpMaxAttempts) {
      throw new HttpError(429, 'Too many wrong attempts. Please request a new OTP.');
    }
    if (rec.code_hash !== sha256(otp)) {
      await pool.query('UPDATE otps SET attempts = attempts + 1 WHERE phone = $1', [phone]);
      throw new HttpError(401, 'Incorrect OTP');
    }

    await pool.query('DELETE FROM otps WHERE phone = $1', [phone]);
    const { rows: users } = await pool.query(
      `INSERT INTO users (phone) VALUES ($1)
       ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
       RETURNING id, phone`,
      [phone],
    );

    const token = jwt.sign({ sub: users[0].id }, config.jwtSecret, { expiresIn: '30d' });
    res.json({ token, user: users[0] });
  }),
);

/** Protects routes; puts the user's id on res.locals.userId. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (typeof payload === 'string' || !payload.sub) throw new Error('bad token');
    res.locals.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
