CREATE TABLE IF NOT EXISTS "opencode_keys" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL UNIQUE,
  "key" TEXT NOT NULL,
  "proxy_id" INTEGER,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "last_used" TEXT,
  "last_status" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (datetime ('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime ('now'))
);

CREATE INDEX IF NOT EXISTS "idx_opencode_keys_enabled" ON "opencode_keys" ("enabled");

CREATE INDEX IF NOT EXISTS "idx_opencode_keys_name" ON "opencode_keys" ("name");
