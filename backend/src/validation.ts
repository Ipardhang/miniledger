import { z } from 'zod';

const PHONE_RE = /^\+?[1-9]\d{9,14}$/;

const phone = z
  .string({ required_error: 'Phone number is required' })
  .trim()
  .transform((s) => s.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(PHONE_RE, 'Enter a valid phone number (10–15 digits, optional +)'));

export const requestOtpSchema = z.object({ phone });

export const verifyOtpSchema = z.object({
  phone,
  otp: z
    .string({ required_error: 'OTP is required' })
    .trim()
    .regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

const isoDate = z
  .string({ required_error: 'Due date is required' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be in YYYY-MM-DD format')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Due date is not a real calendar date');

// Past due dates are allowed on purpose: you may be logging an older loan.
export const createLoanSchema = z.object({
  friendName: z
    .string({ required_error: 'Friend name is required' })
    .trim()
    .min(1, 'Friend name is required')
    .max(80, 'Friend name is too long (max 80 characters)'),
  // coerce: multipart form fields arrive as strings
  amount: z.coerce
    .number({ invalid_type_error: 'Amount must be a number' })
    .positive('Amount must be greater than 0')
    .max(10_000_000, 'Amount is too large')
    .multipleOf(0.01, 'Amount can have at most 2 decimal places'),
  dueDate: isoDate,
});

export const idSchema = z.string().uuid();
