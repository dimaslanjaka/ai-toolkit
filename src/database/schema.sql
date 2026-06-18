CREATE TABLE IF NOT EXISTS "proxies" (
  "id" INTEGER,
  "proxy" TEXT NOT NULL UNIQUE,
  "latency" TEXT NULL,
  "last_check" TEXT NULL,
  "type" TEXT NULL,
  "region" TEXT NULL,
  "city" TEXT NULL,
  "country" TEXT NULL,
  "timezone" TEXT NULL,
  "latitude" TEXT NULL,
  "longitude" TEXT NULL,
  "anonymity" TEXT NULL,
  "https" TEXT NULL,
  "status" TEXT NULL,
  "private" TEXT NULL,
  "lang" TEXT NULL,
  "useragent" TEXT NULL,
  "webgl_vendor" TEXT NULL,
  "webgl_renderer" TEXT NULL,
  "browser_vendor" TEXT NULL,
  "username" TEXT NULL,
  "password" TEXT NULL,
  PRIMARY KEY ("id" AUTOINCREMENT)
);

CREATE TABLE IF NOT EXISTS "processed_proxies" ("updated" TEXT, "proxy" TEXT NOT NULL UNIQUE);

CREATE TABLE IF NOT EXISTS "added_proxies" ("updated" TEXT, "proxy" TEXT NOT NULL UNIQUE);

CREATE TABLE IF NOT EXISTS "meta" (key TEXT PRIMARY KEY, value TEXT);
