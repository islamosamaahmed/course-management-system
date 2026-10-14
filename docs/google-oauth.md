# Google sign-in configuration

Google sign-in is an additional way to access an existing S.T.C. account. It
does not register users: a student or staff member must first have an account
created by the course administration and link Google while signed in with that
account.

## Environment variables

Set these values in the deployment environment, including Vercel Production and
any Preview environment where Google sign-in should be enabled:

- `GOOGLE_CLIENT_ID`: the OAuth 2.0 Web application client ID.
- `GOOGLE_CLIENT_SECRET`: the matching client secret. Store it as a secret; do
  not add its value to source control.
- `APP_BASE_URL`: the canonical origin of this deployment, including `https://`
  and without a path. For example, `https://courses.example.com`.

For local development, put the credentials and
`APP_BASE_URL=http://127.0.0.1:3000` in the ignored `.env.local` file and open
the site using that same host and port. The local callback is:

`http://127.0.0.1:3000/auth/google/callback`

For production, use the actual deployed origin. The callback is:

`<APP_BASE_URL>/auth/google/callback`

For example, if `APP_BASE_URL` is `https://courses.example.com`, register
`https://courses.example.com/auth/google/callback` in Google Cloud Console.
Do not use the example domain unless it is the actual deployed domain.

## Google Cloud Console

1. Create or select a Google Cloud project and configure the OAuth consent
   screen. Add the intended users as test users while the app is in Testing.
2. Create an OAuth client with application type **Web application**.
3. Add the local and production origins to **Authorized JavaScript origins**:
   `http://127.0.0.1:3000` and the actual `APP_BASE_URL`.
4. Add the local and actual production callback URLs above to **Authorized
   redirect URIs**.
5. Set the client ID, client secret, and matching `APP_BASE_URL` in local
   `.env.local` and the appropriate Vercel environment scopes. Redeploy Vercel
   after changing its environment variables.

The application requests OpenID Connect identity plus the user's email and
basic profile. Google subject (`sub`), not email, is the unique external
identity key.

## Database migration

Run the non-destructive migration against the target database before deploying
the new application code:

```sh
npm run db:upgrade
```

This applies migration 0015, which adds Google identity links and short-lived
OAuth state records without changing existing users, roles, passwords, or
sessions. Username/password authentication remains available.
