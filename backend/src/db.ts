import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { config } from './config';

export const pool = new Pool({ connectionString: config.databaseUrl });

/** Creates tables if they don't exist (schema.sql lives next to src/ and dist/). */
export async function migrate(): Promise<void> {
  const sql = readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(sql);
}
