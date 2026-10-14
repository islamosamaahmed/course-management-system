import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../server/app.js';
import { passwordHash } from '../server/db.js';

test('username and password authentication remains available for every existing role', async t => {
  const roles = ['student', 'doctor', 'assistant', 'admin'];
  const users = new Map(roles.map((role, index) => {
    const id = index + 1;
    return [`${role}.user`, {
      id, name: `${role} user`, username: `${role}.user`,
      password_hash: passwordHash(`password for ${role}`),
      role, active: 1, can_set_price: 0
    }];
  }));
  const statements = [];
  const db = {
    pool: {
      async connect() {
        return { async query() {}, release() {} };
      }
    },
    async query(sql, params = []) {
      statements.push(sql);
      if (sql.includes('SELECT * FROM users WHERE username=?')) {
        const user = users.get(params[0]);
        return { rows: user ? [{ ...user }] : [] };
      }
      if (sql.includes('DELETE FROM auth_sessions WHERE expires_at<?') ||
          sql.includes('INSERT INTO auth_sessions') ||
          sql.includes('INSERT INTO audit_logs')) {
        return { rows: [], changes: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const app = createApp({ db, secureCookies: false });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const address = server.address();

  for (const role of roles) {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `${role}.user`, password: `password for ${role}` })
    });
    const payload = await response.json();
    assert.equal(response.status, 200, role);
    assert.equal(payload.user.role, role);
    assert.match(response.headers.get('set-cookie'), /course_session=/);
  }

  assert.equal(users.size, 4);
  assert.equal(statements.filter(sql => sql.includes('INSERT INTO auth_sessions')).length, 4);
});
