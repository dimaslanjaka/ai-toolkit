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

CREATE TABLE IF NOT EXISTS "providers" (
  "provider" TEXT PRIMARY KEY,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "config" TEXT
);

-- Default provider configurations
INSERT
OR IGNORE INTO "providers" ("provider", "enabled", "priority")
VALUES
  ('opencode', 1, 10);

INSERT
OR IGNORE INTO "providers" ("provider", "enabled", "priority")
VALUES
  ('puter', 1, 20);

INSERT
OR IGNORE INTO "providers" ("provider", "enabled", "priority")
VALUES
  ('chatgpt', 1, 30);
