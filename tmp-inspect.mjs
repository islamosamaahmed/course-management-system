import dotenv from 'dotenv';
import { resolve } from 'node:path';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
const { default: pg } = await import('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const client = await pool.connect();
try {
  const reqs = await client.query(`SELECT id,status,approved_at,created_at,finished_at,failure_reason FROM system_wipe_requests ORDER BY created_at DESC LIMIT 10`);
  console.log('--- system_wipe_requests ---');
  console.table(reqs.rows);
  const locks = await client.query(`SELECT locktype,database,page,transactionid,classid,objid,virtualtransaction,pid,mode,granted FROM pg_locks WHERE locktype='advisory'`);
  console.log('--- advisory locks ---');
  console.table(locks.rows);
  const idleTx = await client.query(`SELECT pid,state,query_start,LEFT(query,80) AS query FROM pg_stat_activity WHERE state <> 'idle' AND query NOT ILIKE '%pg_stat_activity%'`);
  console.log('--- active backends ---');
  console.table(idleTx.rows);
} finally {
  client.release();
  await pool.end();
}
