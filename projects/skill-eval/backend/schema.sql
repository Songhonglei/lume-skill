CREATE TABLE IF NOT EXISTS schema_versions (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS administrator (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  csrf_hash text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS login_limits (
  identity text PRIMARY KEY,
  failures integer NOT NULL,
  window_start timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS skills (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  default_set_id uuid,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS skill_versions (
  id uuid PRIMARY KEY,
  skill_id uuid NOT NULL REFERENCES skills(id),
  revision integer NOT NULL,
  declared_version text NOT NULL DEFAULT '',
  blob text NOT NULL,
  original_blob text NOT NULL,
  manifest jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(skill_id, revision),
  UNIQUE(skill_id, blob)
);
CREATE TABLE IF NOT EXISTS evaluation_sets (
  id uuid PRIMARY KEY,
  skill_id uuid NOT NULL REFERENCES skills(id),
  name text NOT NULL,
  active_version_id uuid,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS set_versions (
  id uuid PRIMARY KEY,
  set_id uuid NOT NULL REFERENCES evaluation_sets(id),
  source_skill_version_id uuid NOT NULL REFERENCES skill_versions(id),
  kind text NOT NULL CHECK (kind IN ('DRAFT','SAVED')),
  revision integer NOT NULL,
  edit_number integer NOT NULL DEFAULT 1,
  blob text NOT NULL,
  original_blob text,
  validation jsonb NOT NULL DEFAULT '{}',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(set_id, revision)
);
CREATE TABLE IF NOT EXISTS enrollment_codes (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS workers (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  capabilities jsonb NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  builtin boolean NOT NULL DEFAULT false,
  probe_request jsonb,
  probe_result jsonb,
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_builtin_worker ON workers (builtin) WHERE builtin AND NOT revoked;
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('evaluate','generate')),
  skill_id uuid NOT NULL REFERENCES skills(id),
  idempotency_key text NOT NULL UNIQUE,
  request_hash text NOT NULL,
  input jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('QUEUED','RUNNING','CANCEL_REQUESTED','SUCCEEDED','FAILED','CANCELLED','INTERRUPTED')),
  verdict text CHECK (verdict IN ('PASSED','FAILED','INCOMPLETE')),
  summary jsonb,
  current_attempt_id uuid,
  state_version integer NOT NULL DEFAULT 1,
  queued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS task_queue ON tasks(created_at) WHERE state='QUEUED';
CREATE TABLE IF NOT EXISTS attempts (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES tasks(id),
  number integer NOT NULL,
  worker_id uuid NOT NULL REFERENCES workers(id),
  lease_hash text NOT NULL,
  lease_until timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('ACTIVE','COMPLETED','CANCELLED','EXPIRED')),
  receipt_hash text,
  result_blob text,
  late_blob text,
  summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(task_id,number)
);
CREATE UNIQUE INDEX IF NOT EXISTS worker_single_execution ON attempts(worker_id) WHERE state='ACTIVE';
CREATE TABLE IF NOT EXISTS events (
  attempt_id uuid NOT NULL REFERENCES attempts(id),
  sequence bigint NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(attempt_id,sequence)
);
CREATE TABLE IF NOT EXISTS task_retries (
  idempotency_key text PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES tasks(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS artifacts (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES tasks(id),
  attempt_id uuid NOT NULL REFERENCES attempts(id),
  kind text NOT NULL,
  blob text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(attempt_id,kind,blob)
);
CREATE OR REPLACE FUNCTION protect_skill_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Skill source versions are immutable';
END;
$$;
CREATE OR REPLACE TRIGGER skill_version_immutable BEFORE UPDATE OR DELETE ON skill_versions
  FOR EACH ROW EXECUTE FUNCTION protect_skill_version();

CREATE OR REPLACE FUNCTION protect_saved_set_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.kind='SAVED' THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Saved suite versions must be archived'; END IF;
    IF ROW(NEW.id,NEW.set_id,NEW.source_skill_version_id,NEW.kind,NEW.revision,NEW.blob,NEW.original_blob,NEW.created_at)
       IS DISTINCT FROM ROW(OLD.id,OLD.set_id,OLD.source_skill_version_id,OLD.kind,OLD.revision,OLD.blob,OLD.original_blob,OLD.created_at)
    THEN RAISE EXCEPTION 'Saved suite content is immutable'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER saved_set_immutable BEFORE UPDATE OR DELETE ON set_versions
  FOR EACH ROW EXECUTE FUNCTION protect_saved_set_version();

CREATE OR REPLACE FUNCTION protect_task_input() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.kind,NEW.skill_id,NEW.input,NEW.idempotency_key,NEW.request_hash,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.kind,OLD.skill_id,OLD.input,OLD.idempotency_key,OLD.request_hash,OLD.created_at)
  THEN RAISE EXCEPTION 'Frozen task input is immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER task_input_immutable BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION protect_task_input();
INSERT INTO schema_versions(version) VALUES (1) ON CONFLICT DO NOTHING;
