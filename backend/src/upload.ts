
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import { config } from './config';
import { HttpError } from './errors';

const isVercel = Boolean(process.env.VERCEL);

// Local development can create an uploads directory.
// Vercel must not attempt to write to its deployed application directory.
if (!isVercel) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

const EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const receiptUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      if (isVercel) {
        cb(
          new Error(
            'Receipt uploads are not configured on this deployment yet.',
          ),
          '',
        );
        return;
      }

      cb(null, config.uploadDir);
    },
    // Random server-side name: never trust the client's filename.
    filename: (_req, file, cb) =>
      cb(null, crypto.randomUUID() + EXT[file.mimetype]),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (EXT[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new HttpError(400, 'Receipt must be a JPEG, PNG or WebP image'));
    }
  },
});

