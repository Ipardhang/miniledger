import crypto from 'crypto';
import { pool } from './db';

export function hashIdentifier(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function audit(
  eventType: string,
  userId: string | null,
  requestId: string | undefined,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_events (user_id, event_type, request_id, metadata)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [userId, eventType, requestId ?? null, JSON.stringify(metadata)],
    );
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'audit_write_failed',
      eventType,
      requestId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}
