/*
Enable foreign key rules in SQLite.

SQLite supports FOREIGN KEY syntax, but it does not enforce it
unless PRAGMA foreign_keys is enabled for the current connection.

This should be executed every time your application opens the database.
*/
PRAGMA foreign_keys = ON;

/*
============================================================
TABLE: hosts
============================================================

This table stores target hosts or domains that proxies are tested against.

Example rows:
- opencode.ai
- google.com
- github.com
*/
CREATE TABLE IF NOT EXISTS "hosts" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "host" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

/*
============================================================
TABLE: proxy_hosts
============================================================

Tracks which proxies are working for which hosts.
*/
CREATE TABLE IF NOT EXISTS "proxy_hosts" (
  "proxy_id" INTEGER NOT NULL,
  "host_id" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'unknown',
  "last_check" TEXT NULL,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("proxy_id", "host_id")
);

CREATE INDEX IF NOT EXISTS "idx_proxy_hosts_status" ON "proxy_hosts" ("status");

CREATE INDEX IF NOT EXISTS "idx_proxy_hosts_host" ON "proxy_hosts" ("host_id");
