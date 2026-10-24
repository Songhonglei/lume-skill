CREATE TABLE users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','maintainer')),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at TEXT NOT NULL
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE skills (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 owner_id TEXT NOT NULL REFERENCES users(id), current_version_id TEXT REFERENCES versions(id),
 created_at TEXT NOT NULL
);
CREATE TABLE artifacts (
 id TEXT PRIMARY KEY, digest TEXT NOT NULL UNIQUE, byte_size INTEGER NOT NULL,
 media_type TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE versions (
 id TEXT PRIMARY KEY, skill_id TEXT NOT NULL REFERENCES skills(id), version TEXT NOT NULL,
 content_digest TEXT NOT NULL, artifact_id TEXT NOT NULL REFERENCES artifacts(id),
 manifest_json TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, UNIQUE(skill_id,version)
);
CREATE TABLE audit_runs (
 id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES versions(id), depth TEXT NOT NULL,
 rule_version TEXT NOT NULL, verdict TEXT NOT NULL DEFAULT 'pending',
 delivery_status TEXT NOT NULL DEFAULT 'pending', report_digest TEXT, result_json TEXT, created_at TEXT NOT NULL
);
CREATE TABLE findings (
 id TEXT PRIMARY KEY, audit_run_id TEXT NOT NULL REFERENCES audit_runs(id), rule_id TEXT NOT NULL,
 severity TEXT NOT NULL, review_required INTEGER NOT NULL DEFAULT 0, finding_json TEXT NOT NULL
);
CREATE TABLE repair_runs (
 id TEXT PRIMARY KEY, audit_run_id TEXT NOT NULL REFERENCES audit_runs(id), authorized_by TEXT NOT NULL REFERENCES users(id),
 authorization_json TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', round INTEGER NOT NULL DEFAULT 0,
 candidate_digest TEXT, created_at TEXT NOT NULL
);
CREATE TABLE workers (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, credential_hash TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL DEFAULT 'offline', last_seen_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE worker_enrollments (
 id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL,
 consumed_at TEXT, revoked_at TEXT, worker_id TEXT REFERENCES workers(id),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE tasks (
 id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES versions(id), kind TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued', idempotency_key TEXT NOT NULL UNIQUE,
 manifest_json TEXT NOT NULL, lease_generation INTEGER NOT NULL DEFAULT 0,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE task_attempts (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), worker_id TEXT NOT NULL REFERENCES workers(id),
 generation INTEGER NOT NULL, lease_until INTEGER NOT NULL, state TEXT NOT NULL,
 result_digest TEXT, UNIQUE(task_id,generation)
);
CREATE TABLE events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT, kind TEXT NOT NULL,
 subject_id TEXT, detail_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX versions_by_skill ON versions(skill_id,created_at);
CREATE INDEX sessions_by_expiry ON sessions(expires_at);
