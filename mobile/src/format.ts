// Change these two constants to switch currency.
const CURRENCY = 'INR';
const LOCALE = 'en-IN';

export const formatMoney = (n: number): string =>
  new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY }).format(n);

const pad = (n: number) => String(n).padStart(2, '0');

/** Parses 'YYYY-MM-DD' as a local date (not UTC) so it never shifts a day. */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Accepts either 'YYYY-MM-DD' or a full ISO timestamp. */
export function formatDate(s: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? parseLocalDate(s) : new Date(s);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function daysOverdue(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - parseLocalDate(dueDate).getTime()) / 86_400_000));
}

export function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
