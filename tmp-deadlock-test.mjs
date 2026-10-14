import dotenv from 'dotenv';
import { resolve } from 'node:path';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
const { default: pg } = await import('pg');
const url = process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL;

console.log('--- Test 1: simple query on fresh connection ---');
try {
  const a = new pg.Client({ connectionString: url, connectionTimeoutMillis: 4000 });
  await a.connect();
  const r = await Promise.race([
    a.query('SELECT 1 AS ok'),
    new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT 4s')), 4000))
  ]);
  console.log('fresh query OK:', r.rows);
  await a.end();
} catch (error) {
  console.log('fresh query FAILED:', error.message);
}

console.log('--- Test 2: BEGIN+advisory lock on conn A, query on conn B (mirrors withSystemDataLock) ---');
const A = new pg.Client({ connectionString: url, connectionTimeoutMillis: 4000 });
const B = new pg.Client({ connectionString: url, connectionTimeoutMillis: 4000 });
try {
  await A.connect();
  await B.connect();
  await A.query('BEGIN');
  await A.query('SELECT pg_advisory_xact_lock($1)', [1414743888]);
  console.log('A: lock acquired');
  const result = await Promise.race([
    B.query('SELECT 1 AS ok'),
    new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT: B query blocked behind A transaction')), 5000))
  ]);
  console.log('B query OK:', result.rows);
  await A.query('COMMIT');
} catch (error) {
  console.log('RESULT:', error.message);
} finally {
  try { await A.query('ROLLBACK').catch(() => {}); } catch {}
  try { await A.end(); } catch {}
  try { await B.end(); } catch {}
}
console.log('--- Test 3: fresh query after test 2 ---');
try {
  const C = new pg.Client({ connectionString: url, connectionTimeoutMillis: 4000 });
  await C.connect();
  const r = await Promise.race([
    C.query('SELECT 1 AS ok'),
    new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT 4s: PGlite still wedged')), 4000))
  ]);
  console.log('post-test query OK:', r.rows);
  await C.end();
} catch (error) {
  console.log('post-test FAILED:', error.message);
}
