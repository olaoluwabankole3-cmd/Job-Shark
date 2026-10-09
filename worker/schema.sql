-- Job-Shark D1 schema foundation.
-- Apply only after creating the D1 database and reviewing the deployment setup.
-- User-owned records must be protected by authenticated API handlers before any
-- production endpoint reads or writes these tables.

CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  target_role TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  work_types TEXT NOT NULL DEFAULT '',
  skills_json TEXT NOT NULL DEFAULT '[]',
  cv_object_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_opportunities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  url TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  work_type TEXT NOT NULL DEFAULT '',
  salary TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  fit_score INTEGER,
  eligibility_status TEXT NOT NULL DEFAULT 'unverified',
  status TEXT NOT NULL DEFAULT 'discovered',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_status
  ON job_opportunities(user_id, status);

CREATE INDEX IF NOT EXISTS idx_jobs_user_created
  ON job_opportunities(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS application_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES job_opportunities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_application_events_job
  ON application_events(user_id, job_id, created_at DESC);
