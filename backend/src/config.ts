
import 'dotenv/config';
import path from 'path';

const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET;

if (isProduction && (!jwtSecret || jwtSecret.length < 32)) {
  throw new Error(
    'Production requires a JWT_SECRET of at least 32 characters.',
  );
}

if (isProduction && process.env.MOCK_OTP) {
  throw new Error('MOCK_OTP must not be configured in production.');
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://miniledger:miniledger@localhost:5432/miniledger',
  jwtSecret: jwtSecret || 'dev-only-secret-change-me',
  // Development/testing only; production must deliver OTPs through an SMS provider.
  mockOtp: process.env.MOCK_OTP || undefined,
  otpTtlMs: 5 * 60 * 1000,
  otpMaxAttempts: 5,
  uploadDir: process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads'),
};
