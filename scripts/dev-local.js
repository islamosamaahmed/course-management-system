import dotenv from 'dotenv';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const host = '127.0.0.1';
const port = Number(process.env.LOCAL_PGPORT || 5432);
const env = { ...process.env };
env.LOCAL_DEV = '1';
env.NODE_ENV = 'development';
env.TRUST_PROXY = '0';
env.HOST = host;
env.LOCAL_PGHOST = host;
env.LOCAL_PGPORT = String(port);
env.DATABASE_URL_LOCAL = `postgresql://postgres:postgres@${host}:${port}/postgres`;
env.DATABASE_URL = env.DATABASE_URL_LOCAL;
env.DATABASE_URL_UNPOOLED = env.DATABASE_URL_LOCAL;

const delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
const canConnect = () => new Promise(resolveConnection => {
  const socket = net.createConnection({ host, port });
  socket.setTimeout(250);
  socket.once('connect', () => {
    socket.destroy();
    resolveConnection(true);
  });
  socket.once('error', () => {
    socket.destroy();
    resolveConnection(false);
  });
  socket.once('timeout', () => {
    socket.destroy();
    resolveConnection(false);
  });
});
const waitForDatabase = async child => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`Local PostgreSQL exited with code ${child.exitCode}.`);
    }
    if (await canConnect()) return;
    await delay(100);
  }
  throw new Error(`Local PostgreSQL did not become available at ${host}:${port}.`);
};
const runScript = script => new Promise((resolveRun, rejectRun) => {
  const child = spawn(process.execPath, [resolve(process.cwd(), script)], {
    cwd: process.cwd(),
    env,
    stdio: 'inherit'
  });
  child.once('error', rejectRun);
  child.once('exit', code => {
    if (code === 0) resolveRun();
    else rejectRun(new Error(`${script} exited with code ${code}.`));
  });
});
const stop = child => new Promise(resolveStop => {
  if (!child || child.exitCode !== null) return resolveStop();
  child.once('exit', resolveStop);
  child.kill('SIGTERM');
});

let database;
let server;
let ownsDatabase = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server?.kill(signal);
    if (!server) database?.kill(signal);
  });
}

try {
  if (!await canConnect()) {
    database = spawn(process.execPath, [resolve(process.cwd(), 'scripts/local-postgres.js')], {
      cwd: process.cwd(),
      env,
      stdio: 'inherit'
    });
    ownsDatabase = true;
    database.once('error', error => console.error('Failed to start local PostgreSQL:', error));
    await waitForDatabase(database);
  }

  await runScript('scripts/migrate.js');
  server = spawn(process.execPath, [resolve(process.cwd(), 'server/index.js')], {
    cwd: process.cwd(),
    env,
    stdio: 'inherit'
  });
  const exitCode = await new Promise((resolveExit, rejectExit) => {
    server.once('error', rejectExit);
    server.once('exit', (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
  });
  process.exitCode = exitCode;
} finally {
  await stop(server);
  if (ownsDatabase) await stop(database);
}
