import { createHash, randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { audit, digest, token, transaction } from './db.js';

const STATE_LIFETIME_MS = 10 * 60 * 1000;
const DEFAULT_SESSION_MS = 8 * 60 * 60 * 1000;
const REMEMBER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const UNLINKED_MESSAGE = 'حساب Google غير مرتبط بحساب في الكورس. سجّل الدخول باسم المستخدم وكلمة المرور اللذين استلمتهما من إدارة الكورس، ثم اربط Google من ملفك الشخصي.';

class GoogleAuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function oauthConfiguration(options) {
  const clientId = options.clientId ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = options.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET;
  const localBaseUrl = process.env.LOCAL_DEV === '1'
    ? `http://127.0.0.1:${process.env.PORT || 3000}`
    : '';
  const configuredBaseUrl = options.appBaseUrl ?? process.env.APP_BASE_URL ?? localBaseUrl;
  if (!clientId || !clientSecret || !configuredBaseUrl) {
    throw new GoogleAuthError(503, 'تسجيل الدخول بواسطة Google غير مهيأ حاليًا.');
  }

  let baseUrl;
  try {
    baseUrl = new URL(configuredBaseUrl);
  } catch {
    throw new GoogleAuthError(503, 'تسجيل الدخول بواسطة Google غير مهيأ حاليًا.');
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol) ||
      (process.env.NODE_ENV === 'production' && baseUrl.protocol !== 'https:') ||
      baseUrl.username || baseUrl.password || baseUrl.pathname !== '/' ||
      baseUrl.search || baseUrl.hash) {
    throw new GoogleAuthError(503, 'إعداد عنوان الموقع لتسجيل الدخول بواسطة Google غير صالح.');
  }

  return {
    clientId,
    clientSecret,
    redirectUri: new URL('/auth/google/callback', baseUrl.origin).toString()
  };
}

function safeRedirect(res, result) {
  res.redirect(303, `/?google=${encodeURIComponent(result)}`);
}

export function registerGoogleAuthRoutes(app, db, {
  authenticated,
  loginLimit,
  setSessionCookie,
  secureCookies,
  clientId,
  clientSecret,
  appBaseUrl,
  fetchImpl = fetch,
  verifyIdToken
}) {
  const options = { clientId, clientSecret, appBaseUrl };
  const verifyToken = verifyIdToken || (async (idToken, audience) => {
    const ticket = await new OAuth2Client(audience).verifyIdToken({ idToken, audience });
    return ticket.getPayload();
  });

  async function createAuthorizationUrl(flow, userId, remember) {
    const config = oauthConfiguration(options);
    const rawState = token();
    const nonce = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    await db.query('DELETE FROM google_auth_states WHERE expires_at<?', [Date.now()]);
    await db.query(`INSERT INTO google_auth_states
      (state_hash,flow,user_id,code_verifier,nonce,remember,expires_at)
      VALUES(?,?,?,?,?,?,?) RETURNING state_hash`,
    [digest(rawState), flow, userId, codeVerifier, nonce, remember, Date.now() + STATE_LIFETIME_MS]);

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state: rawState,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account'
    }).toString();
    return url.toString();
  }

  app.post('/auth/google/login', loginLimit, async (req, res) => {
    try {
      if (req.body && (Array.isArray(req.body) || typeof req.body !== 'object' ||
          Object.keys(req.body).some(key => key !== 'remember') ||
          (req.body.remember !== undefined && typeof req.body.remember !== 'boolean'))) {
        throw new GoogleAuthError(400, 'طلب تسجيل الدخول غير صالح.');
      }
      const url = await createAuthorizationUrl('login', null, req.body?.remember === true);
      res.set('Cache-Control', 'no-store');
      res.json({ url });
    } catch (error) {
      if (error instanceof GoogleAuthError) return res.status(error.status).json({ error: error.message });
      console.error('Google sign-in initialization failed:', error.name);
      res.status(503).json({ error: 'تعذر بدء تسجيل الدخول بواسطة Google. حاول مرة أخرى.' });
    }
  });

  app.post('/api/auth/google/link', authenticated, async (req, res) => {
    try {
      if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object' || Object.keys(req.body).length) {
        throw new GoogleAuthError(400, 'طلب ربط Google غير صالح.');
      }
      const existing = (await db.query(
        'SELECT google_email FROM google_accounts WHERE user_id=?', [req.user.id]
      )).rows[0];
      if (existing) throw new GoogleAuthError(409, 'يوجد حساب Google مرتبط بالفعل بهذا الحساب.');
      const url = await createAuthorizationUrl('link', req.user.id, false);
      res.set('Cache-Control', 'no-store');
      res.json({ url });
    } catch (error) {
      if (error instanceof GoogleAuthError) return res.status(error.status).json({ error: error.message });
      console.error('Google account linking initialization failed:', error.name);
      res.status(503).json({ error: 'تعذر بدء ربط حساب Google. حاول مرة أخرى.' });
    }
  });

  app.get('/api/auth/google/status', authenticated, async (req, res) => {
    try {
      const account = (await db.query(
        'SELECT google_email,linked_at FROM google_accounts WHERE user_id=?', [req.user.id]
      )).rows[0];
      res.set('Cache-Control', 'no-store');
      res.json(account
        ? { connected: true, email: account.google_email, linkedAt: account.linked_at }
        : { connected: false });
    } catch (error) {
      console.error('Google account status read failed:', error.name);
      res.status(503).json({ error: 'تعذر قراءة حالة حساب Google.' });
    }
  });

  app.post('/api/auth/google/unlink', authenticated, async (req, res) => {
    try {
      if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object' || Object.keys(req.body).length) {
        throw new GoogleAuthError(400, 'طلب فصل Google غير صالح.');
      }
      const user = (await db.query(
        'SELECT id,name,username,role,active,password_hash FROM users WHERE id=?', [req.user.id]
      )).rows[0];
      if (!user?.active) throw new GoogleAuthError(401, 'الحساب غير نشط.');
      if (typeof user.password_hash !== 'string' || !user.password_hash) {
        throw new GoogleAuthError(409, 'لا يمكن فصل Google قبل إعداد طريقة دخول بديلة للحساب.');
      }
      await transaction(db, async () => {
        await db.query('DELETE FROM google_accounts WHERE user_id=?', [user.id]);
        await audit(db, user, 'فصل حساب Google', 'user', user.id);
      });
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof GoogleAuthError) return res.status(error.status).json({ error: error.message });
      console.error('Google account unlink failed:', error.name);
      res.status(503).json({ error: 'تعذر فصل حساب Google. حاول مرة أخرى.' });
    }
  });

  app.get('/auth/google/callback', async (req, res) => {
    const { code, error: providerError, state } = req.query || {};
    if (typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state)) {
      return safeRedirect(res, providerError === 'access_denied' ? 'cancelled' : 'error');
    }

    let oauthState;
    try {
      oauthState = (await db.query(`DELETE FROM google_auth_states
        WHERE state_hash=? AND expires_at>? RETURNING *`, [digest(state), Date.now()])).rows[0];
    } catch (databaseError) {
      console.error('Google OAuth state validation failed:', databaseError.name);
      return safeRedirect(res, 'error');
    }
    if (!oauthState) return safeRedirect(res, providerError === 'access_denied' ? 'cancelled' : 'error');
    if (providerError === 'access_denied') return safeRedirect(res, 'cancelled');
    if (providerError || typeof code !== 'string' || !code || code.length > 4096) {
      return safeRedirect(res, 'error');
    }

    try {
      const config = oauthConfiguration(options);
      const tokenResponse = await fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: oauthState.code_verifier
        }),
        signal: AbortSignal.timeout(10000)
      });
      if (!tokenResponse.ok) return safeRedirect(res, 'error');
      const tokenData = await tokenResponse.json();
      if (typeof tokenData.id_token !== 'string' || !tokenData.id_token) {
        return safeRedirect(res, 'error');
      }
      const profile = await verifyToken(tokenData.id_token, config.clientId);
      if (!profile || typeof profile.sub !== 'string' || !profile.sub ||
          typeof profile.email !== 'string' || !profile.email ||
          profile.email_verified !== true || profile.nonce !== oauthState.nonce) {
        return safeRedirect(res, 'error');
      }

      if (oauthState.flow === 'link') {
        const result = await linkGoogleAccount(db, oauthState.user_id, profile);
        if (result === 'already-linked') return safeRedirect(res, 'already-linked');
        if (result === 'already-connected') return safeRedirect(res, 'already-connected');
        return safeRedirect(res, 'linked');
      }
      if (oauthState.flow !== 'login') return safeRedirect(res, 'error');

      const user = (await db.query(`SELECT u.id,u.name,u.username,u.role,u.active,u.can_set_price
        FROM google_accounts g JOIN users u ON u.id=g.user_id
        WHERE g.google_sub=?`, [profile.sub])).rows[0];
      if (!user) return safeRedirect(res, 'unlinked');
      if (!user.active) return safeRedirect(res, 'inactive');
      const rawSession = token();
      const csrf = token();
      const maxAge = oauthState.remember ? REMEMBER_SESSION_MS : DEFAULT_SESSION_MS;
      await transaction(db, async () => {
        await db.query('DELETE FROM auth_sessions WHERE expires_at<?', [Date.now()]);
        await db.query('INSERT INTO auth_sessions VALUES(?,?,?,?)',
          [digest(rawSession), user.id, csrf, Date.now() + maxAge]);
        await audit(db, user, 'تسجيل دخول بواسطة Google', 'user', user.id);
      });
      setSessionCookie(res, rawSession, maxAge);
      return safeRedirect(res, 'connected');
    } catch (error) {
      if (error instanceof GoogleAuthError) return safeRedirect(res, error.status === 401 ? 'inactive' : 'error');
      console.error('Google OAuth callback failed:', error.name);
      return safeRedirect(res, 'error');
    }
  });
}

async function linkGoogleAccount(db, userId, profile) {
  try {
    return await transaction(db, async () => {
      const user = (await db.query(
        'SELECT id,name,username,role,active FROM users WHERE id=? FOR UPDATE', [userId]
      )).rows[0];
      if (!user?.active) throw new GoogleAuthError(401, 'الحساب غير نشط.');

      const matchingGoogleAccount = (await db.query(
        'SELECT user_id FROM google_accounts WHERE google_sub=?', [profile.sub]
      )).rows[0];
      if (matchingGoogleAccount) {
        if (matchingGoogleAccount.user_id === user.id) return 'already-linked';
        return 'already-linked';
      }
      const currentGoogleAccount = (await db.query(
        'SELECT google_sub FROM google_accounts WHERE user_id=?', [user.id]
      )).rows[0];
      if (currentGoogleAccount) return 'already-connected';

      await db.query(`INSERT INTO google_accounts(user_id,google_sub,google_email,linked_at)
        VALUES(?,?,?,?) RETURNING user_id`,
      [user.id, profile.sub, profile.email, new Date().toISOString()]);
      await audit(db, user, 'ربط حساب Google', 'user', user.id, { google_email: profile.email });
      return 'linked';
    });
  } catch (error) {
    if (error instanceof GoogleAuthError) throw error;
    if (error.code === '23505') return 'already-linked';
    throw error;
  }
}

export { UNLINKED_MESSAGE };
