CREATE TABLE IF NOT EXISTS "models" (
  "id" TEXT PRIMARY KEY,
  "object" TEXT NOT NULL,
  "created" INTEGER,
  "owned_by" TEXT,
  "permission" TEXT,
  "root" TEXT,
  "parent" TEXT,
  "provider" TEXT NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS "meta" (key TEXT PRIMARY KEY, value TEXT);
