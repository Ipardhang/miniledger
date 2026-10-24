// Runs before each test file, before any app code is imported.
import 'dotenv/config';
import os from 'os';
import path from 'path';

process.env.MOCK_OTP = '123456';
process.env.OTP_COOLDOWN_MS = '0';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'miniledger-test-uploads');
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgres://miniledger:miniledger@localhost:5432/miniledger';
