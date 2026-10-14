import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
const { default: pg } = await import('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const digest = v => createHash('sha256').update(v).digest('hex');
const raw = randomBytes(32).toString('hex');
const csrf = randomBytes(32).toString('hex');
// sessions table: token_hash, user_id, csrf, expires_at (INSERT INTO auth_sessions VALUES(?,?,?,?))
await pool.query('INSERT INTO auth_sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,$4)', [digest(raw), 1, csrf, Date.now() + 3600_000]);
console.log('SESSION_TOKEN=' + raw);
console.log('CSRF=' + csrf);
await pool.end();
