import { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Forwards rejected promises from async route handlers to the error middleware. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    res.status(400).json({ error: details[0]?.message ?? 'Invalid input', details });
    return;
  }
  if (err instanceof multer.MulterError) {
    const error = err.code === 'LIMIT_FILE_SIZE' ? 'Receipt must be 5 MB or smaller' : err.message;
    res.status(400).json({ error });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err?.message === 'Origin not allowed') {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON body' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
