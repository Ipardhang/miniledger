import 'dotenv/config';
import path from 'path';

const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET;
const allowedOrigins = (process.env.APP_ORIGINS ?? '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

if (isProduction && (!jwtSecret || jwtSecret.length < 32)) {
  throw new Error('Production requires a JWT_SECRET of at least 32 characters.');
}

if (isProduction && !process.env.APP_ORIGINS) {
  throw new Error('Production requires APP_ORIGINS to protect web clients with an origin allowlist.');
}

if (isProduction && process.env.MOCK_OTP) {
  throw new Error('MOCK_OTP must not be configured in production.');
}

if (isProduction && !process.env.TWILIO_ACCOUNT_SID) {
  throw new Error('Production requires TWILIO_ACCOUNT_SID.');
}

if (isProduction && !process.env.TWILIO_AUTH_TOKEN) {
  throw new Error('Production requires TWILIO_AUTH_TOKEN.');
}

if (isProduction && !process.env.TWILIO_MESSAGING_SERVICE_SID && !process.env.TWILIO_FROM_NUMBER) {
  throw new Error('Production requires TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER.');
}

if (isProduction && process.env.VERCEL && process.env.RECEIPT_STORAGE !== 's3') {
  throw new Error('Vercel production requires RECEIPT_STORAGE=s3.');
}

if (
  isProduction &&
  process.env.RECEIPT_STORAGE === 's3' &&
  (!process.env.S3_ENDPOINT ||
    !process.env.S3_BUCKET ||
    !process.env.S3_ACCESS_KEY_ID ||
    !process.env.S3_SECRET_ACCESS_KEY)
) {
  throw new Error(
    'S3 receipt storage requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.',
  );
}


  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://miniledger:miniledger@localhost:5432/miniledger',
  jwtSecret: jwtSecret || 'dev-only-secret-change-me',
  mockOtp: process.env.MOCK_OTP || undefined,
  otpTtlMs: 5 * 60 * 1000,
  otpMaxAttempts: 5,
  accessTokenTtl: '30m',
  refreshTokenTtlMs: 30 * 24 * 60 * 60 * 1000,
  otpRequestWindowMs: 60 * 60 * 1000,
  otpRequestMaxPerPhone: 5,
  otpRequestMaxPerIp: 20,
  otpCooldownMs: Number(process.env.OTP_COOLDOWN_MS ?? 30 * 1000),
  otpVerifyWindowMs: 15 * 60 * 1000,
  otpVerifyMaxPerPhone: 10,
  uploadDir: process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads'),
  receiptStorage: process.env.RECEIPT_STORAGE ?? 'local',
  s3Endpoint: process.env.S3_ENDPOINT,
  s3Bucket: process.env.S3_BUCKET,
  s3Region: process.env.S3_REGION ?? 'auto',
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID,
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioMessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER,
  appOrigins: allowedOrigins,
};
