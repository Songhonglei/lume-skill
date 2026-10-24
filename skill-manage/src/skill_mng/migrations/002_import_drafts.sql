CREATE TABLE import_drafts (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL REFERENCES users(id), artifact_digest TEXT NOT NULL,
 expires_at INTEGER NOT NULL, result_json TEXT
);
CREATE INDEX drafts_by_expiry ON import_drafts(expires_at);
