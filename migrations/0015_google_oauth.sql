CREATE TABLE google_accounts (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_sub TEXT NOT NULL UNIQUE,
  google_email TEXT NOT NULL,
  linked_at TEXT NOT NULL
);

CREATE TABLE google_auth_states (
  state_hash TEXT PRIMARY KEY,
  flow TEXT NOT NULL CHECK(flow IN ('login','link')),
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  code_verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  remember BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at BIGINT NOT NULL,
  CHECK ((flow='login' AND user_id IS NULL) OR (flow='link' AND user_id IS NOT NULL))
);

CREATE INDEX google_auth_states_expires_idx ON google_auth_states(expires_at);
