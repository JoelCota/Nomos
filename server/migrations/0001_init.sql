-- Every synced record is a document: (collection, id) -> JSON data.
-- Last writer wins per document, using the client's timestamp (updated_at);
-- seq is a global, ever-growing change counter that clients use to pull changes.
CREATE TABLE docs (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  device TEXT NOT NULL DEFAULT '',
  seq INTEGER NOT NULL,
  PRIMARY KEY (collection, id)
);
CREATE INDEX docs_seq ON docs (seq);

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT INTO meta (key, value) VALUES ('seq', 0);
