import multer from 'multer';
import { HttpError } from './errors';

export const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 10,
    parts: 12,
    fieldSize: 10 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new HttpError(400, 'Receipt must be a JPEG, PNG or WebP image'));
    }
  },
});
