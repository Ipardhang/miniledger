import crypto from 'crypto';
import { NextFunction, Request, Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { pool } from './db';
import { ah, HttpError } from './errors';
import { consumeRateLimit } from './rateLimit';
import { sendOtpSms } from './sms';
import { audit } from './audit';
import { requestOtpSchema, verifyOtpSchema } from './validation';

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export const authRouter = Router();

authRouter.post(
  '/request-otp',
  ah(async (req, res) => {
    const { phone } = requestOtpSchema.parse(req.body);
    const ip = clientIp(req);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const phoneLimit = await consumeRateLimit(
        client,
        `otp:phone:${phone}`,
        config.otpRequestMaxPerPhone,
        config.otpRequestWindowMs,
      );
      const ipLimit = await consumeRateLimit(
        client,
        `otp:ip:${ip}`,
        config.otpRequestMaxPerIp,
        config.otpRequestWindowMs,
      );

      const { rows: lastRows } = await client.query(
        'SELECT created_at FROM otps WHERE phone = $1',
        [phone],
      );

      if (!phoneLimit.allowed || !ipLimit.allowed) {
        await client.query('ROLLBACK');
        const retryAfter = Math.max(phoneLimit.retryAfterSeconds, ipLimit.retryAfterSeconds);
        res.setHeader('Retry-After', String(retryAfter));
        throw new HttpError(429, 'Too many OTP requests. Please try again later.');
      }

      if (lastRows[0]) {
        const ageMs = Date.now() - new Date(lastRows[0].created_at).getTime();
        if (ageMs < config.otpCooldownMs) {
          await client.query('ROLLBACK');
          res.setHeader('Retry-After', String(Math.ceil((config.otpCooldownMs - ageMs) / 1000)));
          throw new HttpError(429, 'Please wait before requesting another code.');
        }
      }

      const code = config.mockOtp || String(crypto.randomInt(100000, 1000000));
      await client.query(
        `INSERT INTO otps (phone, code_hash, expires_at, attempts, created_at)
         VALUES ($1, $2, $3, 0, now())
         ON CONFLICT (phone) DO UPDATE
           SET code_hash = EXCLUDED.code_hash,
               expires_at = EXCLUDED.expires_at,
               attempts = 0,
               created_at = now()`,
        [phone, sha256(code), new Date(Date.now() + config.otpTtlMs)],
      );

      await client.query('COMMIT');

      try {
        await sendOtpSms(phone, code);
      } catch (error) {
        await audit('auth.otp_delivery_failed', null, res.locals.requestId, {
          phoneHash: sha256(phone),
        });
        throw error;
      }

      await audit('auth.otp_requested', null, res.locals.requestId, {
        phoneHash: sha256(phone),
      });

      res.json({ message: 'Verification code sent.' });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }),
);

authRouter.post(
  '/verify-otp',
  ah(async (req, res) => {
    const { phone, otp } = verifyOtpSchema.parse(req.body);
    const ip = clientIp(req);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const verifyLimit = await consumeRateLimit(
        client,
        `otp:verify:${phone}:${ip}`,
        config.otpVerifyMaxPerPhone,
        config.otpVerifyWindowMs,
      );
      if (!verifyLimit.allowed) {
        await client.query('ROLLBACK');
        res.setHeader('Retry-After', String(verifyLimit.retryAfterSeconds));
        throw new HttpError(429, 'Too many verification attempts. Please try again later.');
      }

      const { rows } = await client.query(
        'SELECT code_hash, expires_at, attempts FROM otps WHERE phone = $1 FOR UPDATE',
        [phone],
      );
      const rec = rows[0];

      if (!rec || new Date(rec.expires_at) < new Date()) {
        await client.query('ROLLBACK');
        throw new HttpError(401, 'OTP expired or not requested. Please request a new one.');
      }

      if (rec.attempts >= config.otpMaxAttempts) {
        await client.query('ROLLBACK');
        throw new HttpError(429, 'Too many wrong attempts. Please request a new OTP.');
      }

      if (rec.code_hash !== sha256(otp)) {
        await client.query('UPDATE otps SET attempts = attempts + 1 WHERE phone = $1', [phone]);
        await client.query('COMMIT');
        await audit('auth.login_failed', null, res.locals.requestId, {
          phoneHash: sha256(phone),
          reason: 'invalid_otp',
        });
        throw new HttpError(401, 'Incorrect OTP');
      }

      await client.query('DELETE FROM otps WHERE phone = $1', [phone]);

      const { rows: users } = await client.query(
        `INSERT INTO users (phone) VALUES ($1)
         ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
         RETURNING id, phone`,
        [phone],
      );

      const refreshToken = randomToken();
      const refreshHash = sha256(refreshToken);
      await client.query(
        `INSERT INTO sessions (user_id, refresh_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [users[0].id, refreshHash, new Date(Date.now() + config.refreshTokenTtlMs)],
      );

      await client.query('COMMIT');

      const accessToken = jwt.sign({ sub: users[0].id, sid: refreshHash }, config.jwtSecret, {
        expiresIn: config.accessTokenTtl,
      });

      await audit('auth.login_success', users[0].id, res.locals.requestId);
      res.json({
        accessToken,
        refreshToken,
        user: users[0],
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }),
);

authRouter.post(
  '/refresh',
  ah(async (req, res) => {
    const token = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
    if (!token) throw new HttpError(401, 'Refresh token required');

    const hash = sha256(token);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT id, user_id FROM sessions
         WHERE refresh_hash = $1
           AND revoked_at IS NULL
           AND expires_at > now()
         FOR UPDATE`,
        [hash],
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        throw new HttpError(401, 'Invalid refresh token');
      }

      await client.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [rows[0].id]);
      const newRefreshToken = randomToken();
      await client.query(
        `INSERT INTO sessions (user_id, refresh_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [rows[0].user_id, sha256(newRefreshToken), new Date(Date.now() + config.refreshTokenTtlMs)],
      );
      await client.query('COMMIT');

      const accessToken = jwt.sign({ sub: rows[0].user_id }, config.jwtSecret, {
        expiresIn: config.accessTokenTtl,
      });
      res.json({ accessToken, refreshToken: newRefreshToken });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }),
);

authRouter.post(
  '/logout',
  ah(async (req, res) => {
    const token = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
    if (token) {
      await pool.query(
        'UPDATE sessions SET revoked_at = now() WHERE refresh_hash = $1 AND revoked_at IS NULL',
        [sha256(token)],
      );
    }
    res.status(204).send();
  }),
);

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
