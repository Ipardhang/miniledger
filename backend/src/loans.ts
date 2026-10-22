import fs from 'fs';
import path from 'path';
import { Request, Router } from 'express';
import { requireAuth } from './auth';
import { config } from './config';
import { pool } from './db';
import { ah, HttpError } from './errors';
import { receiptUpload } from './upload';
import { createLoanSchema, idSchema } from './validation';

// Dates are returned as plain YYYY-MM-DD strings to avoid timezone surprises.
// "Overdue" = not repaid and due before today (database date).
const LOAN_COLS = `
  id,
  friend_name AS "friendName",
  amount::float8 AS amount,
  to_char(due_date, 'YYYY-MM-DD') AS "dueDate",
  repaid_at AS "repaidAt",
  (repaid_at IS NOT NULL) AS "isRepaid",
  (repaid_at IS NULL AND due_date < CURRENT_DATE) AS "isOverdue",
  (receipt_path IS NOT NULL) AS "hasReceipt",
  created_at AS "createdAt"`;

export const loansRouter = Router();
loansRouter.use(requireAuth);

const loanId = (req: Request): string => {
  const parsed = idSchema.safeParse(req.params.id);
  if (!parsed.success) throw new HttpError(404, 'Loan not found');
  return parsed.data;
};

// List: unrepaid first (soonest due first), then repaid.
loansRouter.get(
  '/',
  ah(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT ${LOAN_COLS} FROM loans WHERE user_id = $1
       ORDER BY (repaid_at IS NOT NULL), due_date ASC, created_at DESC`,
      [res.locals.userId],
    );
    res.json(rows);
  }),
);

// Summary (declared before /:id routes).
loansRouter.get(
  '/summary',
  ah(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(amount), 0)::float8 AS "totalLent",
         COALESCE(SUM(amount) FILTER (WHERE repaid_at IS NOT NULL), 0)::float8 AS "totalRepaid",
         COALESCE(SUM(amount) FILTER (WHERE repaid_at IS NULL AND due_date < CURRENT_DATE), 0)::float8
           AS "overdueAmount",
         (COUNT(*) FILTER (WHERE repaid_at IS NULL AND due_date < CURRENT_DATE))::int AS "overdueCount"
       FROM loans WHERE user_id = $1`,
      [res.locals.userId],
    );
    const s = rows[0];
    res.json({ ...s, outstanding: Math.round((s.totalLent - s.totalRepaid) * 100) / 100 });
  }),
);

// Create. Accepts JSON, or multipart/form-data with an optional `receipt` image.
loansRouter.post(
  '/',
  receiptUpload.single('receipt'),
  ah(async (req, res) => {
    const parsed = createLoanSchema.safeParse(req.body);
    if (!parsed.success) {
      if (req.file) await fs.promises.unlink(req.file.path).catch(() => undefined);
      throw parsed.error;
    }
    const { friendName, amount, dueDate } = parsed.data;
    const { rows } = await pool.query(
      `INSERT INTO loans (user_id, friend_name, amount, due_date, receipt_path)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${LOAN_COLS}`,
      [res.locals.userId, friendName, amount, dueDate, req.file?.filename ?? null],
    );
    res.status(201).json(rows[0]);
  }),
);

// Mark as repaid.
loansRouter.patch(
  '/:id/repay',
  ah(async (req, res) => {
    const id = loanId(req);
    const { rows } = await pool.query(
      `UPDATE loans SET repaid_at = now()
       WHERE id = $1 AND user_id = $2 AND repaid_at IS NULL
       RETURNING ${LOAN_COLS}`,
      [id, res.locals.userId],
    );
    if (rows[0]) {
      res.json(rows[0]);
      return;
    }
    const exists = await pool.query('SELECT 1 FROM loans WHERE id = $1 AND user_id = $2', [
      id,
      res.locals.userId,
    ]);
    throw exists.rowCount
      ? new HttpError(409, 'Loan is already marked as repaid')
      : new HttpError(404, 'Loan not found');
  }),
);

// Receipt image (authenticated; only the owner can fetch it).
loansRouter.get(
  '/:id/receipt',
  ah(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT receipt_path FROM loans WHERE id = $1 AND user_id = $2',
      [loanId(req), res.locals.userId],
    );
    if (!rows[0]?.receipt_path) throw new HttpError(404, 'No receipt for this entry');
    res.sendFile(path.resolve(config.uploadDir, rows[0].receipt_path));
  }),
);
