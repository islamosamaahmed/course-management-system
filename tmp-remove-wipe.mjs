import { readFileSync, writeFileSync } from 'node:fs';

function apply(file, ops) {
  let text = readFileSync(file, 'utf8');
  for (const [pattern, replacement] of ops) {
    const before = text;
    text = text.replace(pattern, replacement);
    if (text === before) throw new Error(`No match in ${file}: ${pattern}`);
  }
  writeFileSync(file, text);
  console.log(`OK ${file}`);
}

apply('server/app.js', [
  // remove the 423 wipe-in-progress middleware
  [/\n    const resetInProgress = \(await db\.query\([\s\S]*?\n    \}\r?\n    next\(\);/, '\n    next();'],
  // remove route registration
  [/\r?\n  registerSystemResetRoutes\(app, db, \{ onComplete: \(\) => \{ settingsCache = undefined; \} \}\);/, '']
]);

apply('server/session-reminders.js', [
  [/import \{ withSystemDataLock \} from '\.\/system-reset\.js';\r?\n/, ''],
  [/import \{ audit, transaction \} from '\.\/db\.js';/, "import { audit, transaction, withSystemDataLock } from './db.js';"]
]);

apply('server/index.js', [
  [/import \{ SYSTEM_DATA_LOCK_ID \} from '\.\/system-reset\.js';\r?\n/, ''],
  [/import \{ openDatabase \} from '\.\/db\.js';/, "import { openDatabase, SYSTEM_DATA_LOCK_ID } from './db.js';"]
]);

apply('public/app.js', [
  // nav entries for admin/doctor/assistant
  [/, \['system-reset', 'triangle-alert', '[^\]]*\]/g, ''],
  // mobile drawer name
  [/, 'system-reset': '[^']*'/g, ''],
  // route dispatch
  [/^\s*if \(state\.route === 'system-reset'\) return await renderSystemReset\(\);\r?\n/m, ''],
  // renderSystemReset + sendSystemWipeRequest + approveSystemWipe + cancelSystemWipe
  [/async function renderSystemReset\(\)[\s\S]*?\r?\nfunction themeToggleMarkup/, 'function themeToggleMarkup'],
  // delete-button enhancement selector
  [/,button\[data-system-wipe-approve\]/, ''],
  // click delegation handlers
  [/  const wipeApprove = event\.target\.closest\('\[data-system-wipe-approve\]'\);\r?\n  if \(wipeApprove\) return approveSystemWipe\([\s\S]*?systemWipeApprove, wipeApprove\);\r?\n  const wipeCancel = event\.target\.closest\('\[data-system-wipe-cancel\]'\);\r?\n  if \(wipeCancel\) return cancelSystemWipe\([\s\S]*?systemWipeCancel, wipeCancel\);\r?\n/, '']
]);

apply('package.json', [
  [/ && node --check server\/system-reset\.js/, ''],
  [/ && node --check tests\/system-reset\.test\.js/, '']
]);

apply('tests/payment-receipt.test.js', [
  [/\r?\n\s*if \(sql\.includes\("FROM system_wipe_requests"\)[^\n]*/g, '']
]);

console.log('ALL DONE');
