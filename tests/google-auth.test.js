import assert from 'node:assert/strict';
import test from 'node:test';
import { digest } from '../server/db.js';
import { registerGoogleAuthRoutes } from '../server/google-auth.js';

const accountUser = (id, role = 'student', active = 1, password_hash = 'password-hash') => ({
  id, name: `User ${id}`, username: `user${id}`, role, active, password_hash, can_set_price: 0
});

function createHarness({ users = [accountUser(45)], accounts = [], profile, verifyError, fetchOk = true } = {}) {
  const states = new Map();
  const googleAccounts = new Map(accounts.map(account => [account.user_id, { ...account }]));
  const sessions = [];
  const audits = [];
  const usersById = new Map(users.map(user => [user.id, { ...user }]));
  let callbackNonce;
  const db = {
    pool: {
      async connect() {
        return { async query() {}, release() {} };
      }
    },
    async query(sql, params = []) {
      if (sql.includes('DELETE FROM google_auth_states WHERE expires_at<?')) {
        for (const [stateHash, state] of states) {
          if (state.expires_at < params[0]) states.delete(stateHash);
        }
        return { rows: [], changes: 0 };
      }
      if (sql.includes('INSERT INTO google_auth_states')) {
        states.set(params[0], {
          state_hash: params[0], flow: params[1], user_id: params[2],
          code_verifier: params[3], nonce: params[4], remember: params[5],
          expires_at: params[6]
        });
        return { rows: [{ state_hash: params[0] }], changes: 1 };
      }
      if (sql.includes('SELECT google_email FROM google_accounts WHERE user_id=?')) {
        const account = googleAccounts.get(params[0]);
        return { rows: account ? [{ google_email: account.google_email }] : [] };
      }
      if (sql.includes('DELETE FROM google_auth_states') && sql.includes('RETURNING *')) {
        const state = states.get(params[0]);
        if (!state || state.expires_at <= params[1]) return { rows: [], changes: 0 };
        states.delete(params[0]);
        return { rows: [{ ...state }], changes: 1 };
      }
      if (sql.includes('SELECT id,name,username,role,active FROM users WHERE id=?')) {
        const user = usersById.get(params[0]);
        return { rows: user ? [{ id: user.id, name: user.name, username: user.username, role: user.role, active: user.active }] : [] };
      }
      if (sql.includes('SELECT user_id FROM google_accounts WHERE google_sub=?')) {
        const account = [...googleAccounts.values()].find(item => item.google_sub === params[0]);
        return { rows: account ? [{ user_id: account.user_id }] : [] };
      }
      if (sql.includes('SELECT google_sub FROM google_accounts WHERE user_id=?')) {
        const account = googleAccounts.get(params[0]);
        return { rows: account ? [{ google_sub: account.google_sub }] : [] };
      }
      if (sql.includes('INSERT INTO google_accounts')) {
        const [user_id, google_sub, google_email, linked_at] = params;
        if ([...googleAccounts.values()].some(account => account.google_sub === google_sub) ||
            googleAccounts.has(user_id)) {
          const error = new Error('unique constraint');
          error.code = '23505';
          throw error;
        }
        googleAccounts.set(user_id, { user_id, google_sub, google_email, linked_at });
        return { rows: [{ user_id }], changes: 1 };
      }
      if (sql.includes('FROM google_accounts g JOIN users u')) {
        const account = [...googleAccounts.values()].find(item => item.google_sub === params[0]);
        const user = account && usersById.get(account.user_id);
        return { rows: user ? [{
          id: user.id, name: user.name, username: user.username, role: user.role,
          active: user.active, can_set_price: user.can_set_price
        }] : [] };
      }
      if (sql.includes('DELETE FROM auth_sessions WHERE expires_at<?')) return { rows: [], changes: 0 };
      if (sql.includes('INSERT INTO auth_sessions')) {
        sessions.push(params);
        return { rows: [], changes: 1 };
      }
      if (sql.includes('INSERT INTO audit_logs')) {
        audits.push(params);
        return { rows: [], changes: 1 };
      }
      if (sql.includes('SELECT id,name,username,role,active,password_hash FROM users WHERE id=?')) {
        const user = usersById.get(params[0]);
        return { rows: user ? [{ ...user }] : [] };
      }
      if (sql.includes('DELETE FROM google_accounts WHERE user_id=?')) {
        const existed = googleAccounts.delete(params[0]);
        return { rows: [], changes: existed ? 1 : 0 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers); }
  };
  const cookies = [];
  registerGoogleAuthRoutes(app, db, {
    authenticated: (req, res, next) => next(),
    loginLimit: (req, res, next) => next(),
    setSessionCookie: (...args) => cookies.push(args),
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    appBaseUrl: 'https://courses.example.test',
    fetchImpl: async () => ({
      ok: fetchOk,
      async json() { return { id_token: 'verified-test-id-token' }; }
    }),
    verifyIdToken: async (_idToken, audience) => {
      assert.equal(audience, 'test-client-id');
      if (verifyError) throw verifyError;
      return { ...profile, nonce: callbackNonce };
    }
  });

  async function invoke(method, path, { user = accountUser(45), body = {}, query = {} } = {}) {
    const handlers = routes.get(`${method} ${path}`);
    assert.ok(handlers, `Missing route ${method} ${path}`);
    const res = {
      statusCode: 200,
      headers: {},
      status(code) { this.statusCode = code; return this; },
      set(name, value) { this.headers[name] = value; return this; },
      json(value) { this.body = value; return this; },
      redirect(code, location) { this.statusCode = code; this.location = location; return this; }
    };
    const req = { user, body, query };
    let index = -1;
    const next = async () => {
      index++;
      if (index >= handlers.length) return;
      await handlers[index](req, res, next);
    };
    await next();
    return res;
  }

  async function startLogin(remember = false) {
    const response = await invoke('POST', '/auth/google/login', { body: { remember } });
    const state = new URL(response.body.url).searchParams.get('state');
    return { response, state, stateRecord: states.get(digest(state)) };
  }

  async function callback(state, query = {}) {
    callbackNonce = states.get(digest(state))?.nonce;
    return invoke('GET', '/auth/google/callback', {
      query: { state, code: 'authorization-code', ...query }
    });
  }

  return {
    invoke, startLogin, callback, usersById, states, googleAccounts, sessions, audits, cookies
  };
}

test('Google login starts a PKCE flow without creating an application account', async () => {
  const state = createHarness({
    profile: { sub: 'google-sub-1', email: 'student@example.com', email_verified: true }
  });
  const started = await state.startLogin(true);
  const url = new URL(started.response.body.url);

  assert.equal(started.response.statusCode, 200);
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://courses.example.test/auth/google/callback');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(started.stateRecord.flow, 'login');
  assert.equal(started.stateRecord.remember, true);
  assert.equal(state.usersById.size, 1);
  assert.equal(state.googleAccounts.size, 0);
});

test('an unlinked Google identity is not registered as a new user', async () => {
  const state = createHarness({
    profile: { sub: 'unlinked-sub', email: 'new@example.com', email_verified: true }
  });
  const { state: oauthState } = await state.startLogin();
  const result = await state.callback(oauthState);

  assert.equal(new URL(result.location, 'https://courses.example.test').searchParams.get('google'), 'unlinked');
  assert.equal(state.usersById.size, 1);
  assert.equal(state.googleAccounts.size, 0);
  assert.equal(state.sessions.length, 0);
});

test('a linked Google login creates a normal session for the same active user and role', async () => {
  const state = createHarness({
    users: [accountUser(45, 'student')],
    accounts: [{ user_id: 45, google_sub: 'google-sub-1', google_email: 'student@example.com' }],
    profile: { sub: 'google-sub-1', email: 'student@example.com', email_verified: true }
  });
  const { state: oauthState } = await state.startLogin(true);
  const result = await state.callback(oauthState);

  assert.equal(new URL(result.location, 'https://courses.example.test').searchParams.get('google'), 'connected');
  assert.equal(state.sessions.length, 1);
  assert.equal(state.sessions[0][1], 45);
  assert.equal(state.cookies.length, 1);
  assert.equal(digest(state.cookies[0][1]), state.sessions[0][0]);
  assert.equal(state.cookies[0][2], 30 * 24 * 60 * 60 * 1000);
  assert.equal(state.audits[0][2], 'تسجيل دخول بواسطة Google');
});

test('linking Google attaches the identity to the authenticated user without creating users', async () => {
  const state = createHarness({
    profile: { sub: 'google-sub-1', email: 'student@example.com', email_verified: true }
  });
  const started = await state.invoke('POST', '/api/auth/google/link', {
    user: accountUser(45), body: {}
  });
  const oauthState = new URL(started.body.url).searchParams.get('state');
  const result = await state.callback(oauthState);

  assert.equal(new URL(result.location, 'https://courses.example.test').searchParams.get('google'), 'linked');
  assert.equal(state.usersById.size, 1);
  assert.equal(state.googleAccounts.get(45).google_sub, 'google-sub-1');
  assert.equal(state.googleAccounts.get(45).google_email, 'student@example.com');
  assert.equal(state.sessions.length, 0);
  assert.equal(state.audits[0][2], 'ربط حساب Google');
});

test('an existing Google identity cannot be overwritten or linked to a second user', async () => {
  const state = createHarness({
    users: [accountUser(45), accountUser(46)],
    accounts: [{ user_id: 46, google_sub: 'google-sub-1', google_email: 'other@example.com' }],
    profile: { sub: 'google-sub-1', email: 'student@example.com', email_verified: true }
  });
  const started = await state.invoke('POST', '/api/auth/google/link', {
    user: accountUser(45), body: {}
  });
  const oauthState = new URL(started.body.url).searchParams.get('state');
  const result = await state.callback(oauthState);

  assert.equal(new URL(result.location, 'https://courses.example.test').searchParams.get('google'), 'already-linked');
  assert.equal(state.googleAccounts.size, 1);
  assert.equal(state.googleAccounts.get(46).google_email, 'other@example.com');
});

test('Google login rejects invalid identity tokens and consumes OAuth state', async () => {
  const state = createHarness({ verifyError: new Error('invalid token') });
  const { state: oauthState } = await state.startLogin();
  const result = await state.callback(oauthState);

  assert.equal(new URL(result.location, 'https://courses.example.test').searchParams.get('google'), 'error');
  assert.equal(state.sessions.length, 0);
  assert.equal(state.states.size, 0);
});

test('cancelled Google consent safely returns to the app and consumes state', async () => {
  const state = createHarness();
  const { state: oauthState } = await state.startLogin();
  const result = await state.callback(oauthState, { error: 'access_denied', code: undefined });

  assert.equal(new URL(result.location, 'https://courses.example.test').searchParams.get('google'), 'cancelled');
  assert.equal(state.sessions.length, 0);
  assert.equal(state.states.size, 0);
});

test('a linked but deactivated user cannot authenticate with Google', async () => {
  const state = createHarness({
    users: [accountUser(45, 'student', 0)],
    accounts: [{ user_id: 45, google_sub: 'google-sub-1', google_email: 'student@example.com' }],
    profile: { sub: 'google-sub-1', email: 'student@example.com', email_verified: true }
  });
  const { state: oauthState } = await state.startLogin();
  const result = await state.callback(oauthState);

  assert.equal(new URL(result.location, 'https://courses.example.test').searchParams.get('google'), 'inactive');
  assert.equal(state.sessions.length, 0);
});

test('disconnect keeps the password login available and refuses accounts without recovery', async () => {
  const state = createHarness({
    accounts: [{ user_id: 45, google_sub: 'google-sub-1', google_email: 'student@example.com' }]
  });
  const disconnected = await state.invoke('POST', '/api/auth/google/unlink', {
    user: accountUser(45), body: {}
  });
  assert.equal(disconnected.statusCode, 200);
  assert.equal(state.googleAccounts.size, 0);

  state.googleAccounts.set(45, {
    user_id: 45, google_sub: 'google-sub-1', google_email: 'student@example.com'
  });
  const noPassword = createHarness({
    users: [accountUser(45, 'student', 1, '')],
    accounts: [{ user_id: 45, google_sub: 'google-sub-1', google_email: 'student@example.com' }]
  });
  const recoveryMissing = await noPassword.invoke('POST', '/api/auth/google/unlink', {
    user: accountUser(45), body: {}
  });
  assert.equal(recoveryMissing.statusCode, 409);
  assert.equal(noPassword.googleAccounts.size, 1);
});
