-- Phase 2: phones linked with their own token, Web Push subscriptions and a
-- small key/value table (VAPID keys, pairing code, reminder state...).
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  notify TEXT NOT NULL DEFAULT 'always',
  created_at INTEGER NOT NULL,
  last_seen INTEGER
);

CREATE TABLE push_subs (
  endpoint TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX push_subs_device ON push_subs (device_id);

CREATE TABLE kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
