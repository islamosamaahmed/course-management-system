import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const root = 'C:/course/public';
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.avif': 'image/avif', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  if (p.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}'); return; }
  try { const data = await readFile(join(root, normalize(p))); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(data); }
  catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(4600, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:4600/__logout-preview.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// قياسات
const metrics = await page.evaluate(() => {
  const btn = document.querySelector('.topbar-logout');
  const topbar = document.querySelector('.topbar');
  const drawerBtn = document.querySelector('.mobile-drawer-logout');
  const r = btn.getBoundingClientRect();
  const t = topbar.getBoundingClientRect();
  const d = drawerBtn.getBoundingClientRect();
  const cs = getComputedStyle(btn);
  return {
    btn: `${Math.round(r.width)}x${Math.round(r.height)} @y=${Math.round(r.top)}`,
    topbar: `${Math.round(t.width)}x${Math.round(t.height)} @y=${Math.round(t.top)}`,
    fitsTopbar: r.top >= t.top && r.bottom <= t.bottom,
    drawerBtn: `${Math.round(d.width)}x${Math.round(d.height)}`,
    drawerMinHeight: getComputedStyle(drawerBtn).minHeight,
    faceBg: getComputedStyle(btn, '::before').backgroundColor,
    textColor: getComputedStyle(btn.querySelector('.btn-text')).color,
    transition: cs.transitionProperty
  };
});
console.log(JSON.stringify(metrics, null, 2));

await page.screenshot({ path: 'C:/course/tmp-logout-audit/1-idle.png' });

// الأنيميشن — نقرة على زر التوب بار
await page.click('.topbar-logout');
await page.waitForTimeout(450); // clicked + anim1
await page.screenshot({ path: 'C:/course/tmp-logout-audit/2-anim1.png' });
await page.waitForTimeout(700); // anim2 — الرجل بيلف وقع
await page.screenshot({ path: 'C:/course/tmp-logout-audit/3-anim2.png' });
await page.waitForTimeout(1700); // logged-out
await page.screenshot({ path: 'C:/course/tmp-logout-audit/4-logged-out.png' });

const finalState = await page.evaluate(() => {
  const b = document.querySelector('.topbar-logout');
  return { classes: b.className, text: b.querySelector('.btn-text').textContent, disabled: b.disabled };
});
console.log('final:', JSON.stringify(finalState));

await browser.close();
server.close();
