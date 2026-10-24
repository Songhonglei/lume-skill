ALTER TABLE tasks ADD COLUMN repair_run_id TEXT REFERENCES repair_runs(id);
ALTER TABLE repair_runs ADD COLUMN task_id TEXT REFERENCES tasks(id);
ALTER TABLE repair_runs ADD COLUMN target_version TEXT;
ALTER TABLE repair_runs ADD COLUMN planned_version_id TEXT;
ALTER TABLE repair_runs ADD COLUMN baseline_version_id TEXT;
ALTER TABLE repair_runs ADD COLUMN baseline_current_id TEXT;
ALTER TABLE repair_runs ADD COLUMN max_rounds INTEGER NOT NULL DEFAULT 3;
ALTER TABLE repair_runs ADD COLUMN published_version_id TEXT REFERENCES versions(id);
ALTER TABLE repair_runs ADD COLUMN failure_code TEXT;
ALTER TABLE repair_runs ADD COLUMN finished_at TEXT;
ALTER TABLE repair_runs ADD COLUMN result_digest TEXT;
CREATE TABLE repair_rounds (
 id TEXT PRIMARY KEY, repair_run_id TEXT NOT NULL REFERENCES repair_runs(id),
 round_number INTEGER NOT NULL, attempt_id TEXT NOT NULL REFERENCES task_attempts(id),
 artifact_id TEXT NOT NULL REFERENCES artifacts(id), content_digest TEXT NOT NULL,
 diff_json TEXT NOT NULL, review_json TEXT, review_digest TEXT,
 created_at TEXT NOT NULL, UNIQUE(repair_run_id,round_number)
);
CREATE INDEX repair_round_lookup ON repair_rounds(repair_run_id,round_number);
