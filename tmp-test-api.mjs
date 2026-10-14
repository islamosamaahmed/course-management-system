const TOKEN = process.argv[2];
const PATH = process.argv[3] || '/api/me';
const base = 'http://127.0.0.1:3000';
const started = Date.now();
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 6000);
try {
  const response = await fetch(base + PATH, {
    headers: { Cookie: `course_session=${TOKEN}` },
    signal: controller.signal
  });
  const text = await response.text().catch(() => '');
  console.log(`GET ${PATH} -> ${response.status} in ${Date.now() - started}ms :: ${text.slice(0, 300)}`);
} catch (error) {
  console.log(`GET ${PATH} -> ${error.name}: ${error.message} in ${Date.now() - started}ms`);
} finally {
  clearTimeout(timer);
}

