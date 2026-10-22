import 'dotenv/config';
import path from 'path';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://miniledger:miniledger@localhost:5432/miniledger',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  // Optional fixed OTP for demos/tests. Unset/empty => random OTP per request.
  mockOtp: process.env.MOCK_OTP || undefined,
  otpTtlMs: 5 * 60 * 1000,
  otpMaxAttempts: 5,
  uploadDir: process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads'),
};
