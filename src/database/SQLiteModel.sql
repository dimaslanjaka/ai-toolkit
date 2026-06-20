CREATE TABLE IF NOT EXISTS "models" (
  "id" TEXT NOT NULL,
  "object" TEXT NOT NULL,
  "created" INTEGER,
  "owned_by" TEXT,
  "permission" TEXT,
  "root" TEXT,
  "parent" TEXT,
  "provider" TEXT NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY ("id", "provider")
);

CREATE TABLE IF NOT EXISTS "meta" (key TEXT PRIMARY KEY, value TEXT);
