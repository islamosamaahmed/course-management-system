import { writeFileSync, appendFileSync } from 'node:fs';
const LOG = 'tmp-repro-log.txt';
writeFileSync(LOG, `=== repro started ${new Date().toISOString()} ===\n`);
const log = line => { const l = `${new Date().toISOString()} ${line}`; console.log(l); appendFileSync(LOG, l + '\n'); };

const TOKEN = process.argv[2];
const base = 'http://127.0.0.1:3000';
const get = async (path, ms = 6000) => {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(base + path, { headers: { Cookie: `course_session=${TOKEN}` }, signal: controller.signal });
    const text = await response.text().catch(() => '');
    log(`GET ${path} -> ${response.status} in ${Date.now() - started}ms :: ${text.slice(0, 150)}`);
  } catch (error) {
    log(`GET ${path} -> ${error.name}: ${error.message} in ${Date.now() - started}ms`);
  } finally {
    clearTimeout(timer);
  }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

log('STEP 1: /api/me (baseline)');
await get('/api/me');
log('STEP 2: /api/system-reset/requests (THE page)');
await get('/api/system-reset/requests');
log('STEP 3: /api/me again (is DB wedged?)');
await get('/api/me');
log('STEP 4: /api/dashboard (other pages broken?)');
await get('/api/dashboard');
log('STEP 5: wait 70s to check idle-timeout self-heal...');
await sleep(70000);
log('STEP 6: /api/me after 70s');
await get('/api/me');
log('=== repro finished ===');
