import { PoolClient } from 'pg';

export async function consumeRateLimit(
  client: PoolClient,
  key: string,
  max: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = new Date();

  await client.query(
    `INSERT INTO rate_limits (key, window_start, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (key) DO NOTHING`,
    [key, now],
  );

  const { rows } = await client.query(
    'SELECT window_start, count FROM rate_limits WHERE key = $1 FOR UPDATE',
    [key],
  );
  const record = rows[0];

  if (!record) {
    throw new Error('Rate limit record disappeared');
  }

  const started = new Date(record.window_start);
  if (now.getTime() - started.getTime() >= windowMs) {
    await client.query(
      'UPDATE rate_limits SET window_start = $2, count = 1 WHERE key = $1',
      [key, now],
    );
    return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  const count = Number(record.count);
  if (count >= max) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowMs - (now.getTime() - started.getTime())) / 1000),
    );
    return { allowed: false, retryAfterSeconds };
  }

  await client.query(
    'UPDATE rate_limits SET count = count + 1 WHERE key = $1',
    [key],
  );

  return {
    allowed: true,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((windowMs - (now.getTime() - started.getTime())) / 1000),
    ),
  };
}
