/*
  Enable foreign key rules in SQLite.

  SQLite supports FOREIGN KEY syntax, but it does not enforce it
  unless PRAGMA foreign_keys is enabled for the current connection.

  This should be executed every time your application opens the database.
*/
PRAGMA foreign_keys = ON;


/*
  ============================================================
  TABLE: proxies
  ============================================================

  This table stores the proxy identity.

  One row means one proxy endpoint, including:
  - proxy address
  - protocol type
  - optional username
  - optional password

  Example rows:
  - 1.2.3.4:8080 + http
  - 1.2.3.4:1080 + socks5
  - 5.6.7.8:3128 + http + username + password

  This table does NOT store domain compatibility.
  Domain compatibility is stored in proxy_hosts.
*/
CREATE TABLE IF NOT EXISTS "proxies" (
  /*
    Auto-increment primary key.

    SQLite will automatically generate this value.
    Use this ID when linking this proxy to another table.
  */
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,

  /*
    Proxy address only.

    Format:
    ip:port

    Examples:
    127.0.0.1:8080
    1.2.3.4:3128
    proxy.example.com:1080

    Do not include protocol here.
    Store protocol in the "type" column.
  */
  "proxy" TEXT NOT NULL,

  /*
    Proxy protocol.

    Allowed values:
    http
    https
    socks4
    socks5

    CHECK prevents invalid protocol values.
  */
  "type" TEXT NOT NULL CHECK (
    "type" IN ('http', 'https', 'socks4', 'socks5')
  ),

  /*
    Optional proxy username.

    Use NULL when the proxy does not need authentication.
  */
  "username" TEXT NULL,

  /*
    Optional proxy password.

    Use NULL when the proxy does not need authentication.

    Important:
    If this is a production app, consider encrypting this value
    before saving it to the database.
  */
  "password" TEXT NULL,

  /*
    Global active flag.

    1 means the proxy can be used.
    0 means the proxy is disabled globally.

    This is different from proxy_hosts.status.
    proxy_hosts.status is per-host.
  */
  "is_active" INTEGER NOT NULL DEFAULT 1 CHECK (
    "is_active" IN (0, 1)
  ),

  /*
    Row creation timestamp.

    SQLite CURRENT_TIMESTAMP uses UTC time.
  */
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  /*
    Last update timestamp.

    Your application should update this value when editing the row.
  */
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


/*
  Create a unique rule for proxies.

  Why not use UNIQUE("proxy") directly?
  Because the same ip:port may be used with:
  - different protocol
  - different username
  - different password

  COALESCE is used because SQLite treats NULL values as different.
  Without COALESCE, duplicate NULL credentials could bypass uniqueness.
*/
CREATE UNIQUE INDEX IF NOT EXISTS "idx_proxies_unique"
ON "proxies" (
  "type",
  "proxy",
  COALESCE("username", ''),
  COALESCE("password", '')
);


/*
  Speeds up queries filtered by protocol.

  Example:
  SELECT * FROM proxies WHERE type = 'socks5';
*/
CREATE INDEX IF NOT EXISTS "idx_proxies_type"
ON "proxies" ("type");


/*
  Speeds up queries filtered by active status.

  Example:
  SELECT * FROM proxies WHERE is_active = 1;
*/
CREATE INDEX IF NOT EXISTS "idx_proxies_active"
ON "proxies" ("is_active");


/*
  ============================================================
  TABLE: hosts
  ============================================================

  This table stores target hosts or domains.

  Example rows:
  - google.com
  - api.github.com
  - example.com
  - *.example.com

  This table does NOT store proxy data.
  It only stores target host/domain data.
*/
CREATE TABLE IF NOT EXISTS "hosts" (
  /*
    Auto-increment primary key.

    Used by proxy_hosts.host_id.
  */
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,

  /*
    Target host or domain.

    Examples:
    google.com
    api.github.com
    example.com
    *.example.com

    Store only the hostname.
    Do not store full URL here.

    Good:
    example.com

    Bad:
    https://example.com/path
  */
  "host" TEXT NOT NULL,

  /*
    Matching behavior for this host.

    exact:
    Only match this exact host.
    Example: api.example.com only matches api.example.com.

    subdomain:
    Match this host and its subdomains.
    Example: example.com can match example.com and api.example.com.

    wildcard:
    Pattern-style matching.
    Example: *.example.com matches api.example.com.
  */
  "match_type" TEXT NOT NULL DEFAULT 'exact' CHECK (
    "match_type" IN ('exact', 'subdomain', 'wildcard')
  ),

  /*
    Row creation timestamp.
  */
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  /*
    Last update timestamp.
  */
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


/*
  Prevent duplicate host rules.

  This allows:
  - example.com + exact
  - example.com + subdomain

  But it prevents duplicate:
  - example.com + exact
  - example.com + exact
*/
CREATE UNIQUE INDEX IF NOT EXISTS "idx_hosts_unique"
ON "hosts" ("host", "match_type");


/*
  Speeds up host lookup.

  Example:
  SELECT * FROM hosts WHERE host = 'example.com';
*/
CREATE INDEX IF NOT EXISTS "idx_hosts_host"
ON "hosts" ("host");


/*
  ============================================================
  TABLE: proxy_hosts
  ============================================================

  This is the main integration table.

  It connects proxies to hosts.

  One row means:
  "This proxy has this status for this host."

  Example:
  proxy 1 works on google.com
  proxy 1 fails on github.com
  proxy 2 works on github.com

  This table makes the relationship many-to-many:
  - one proxy can work on many hosts
  - one host can have many proxies
*/
CREATE TABLE IF NOT EXISTS "proxy_hosts" (
  /*
    The proxy ID from proxies.id.

    This links the row to one proxy.
  */
  "proxy_id" INTEGER NOT NULL,

  /*
    The host ID from hosts.id.

    This links the row to one host/domain.
  */
  "host_id" INTEGER NOT NULL,

  /*
    Current known status of this proxy for this host.

    working:
    Proxy works for this host.

    failed:
    Proxy failed for this host.

    banned:
    Host blocked or banned this proxy.

    timeout:
    Proxy timed out.

    unknown:
    Not checked yet or result is unclear.
  */
  "status" TEXT NOT NULL DEFAULT 'unknown' CHECK (
    "status" IN (
      'working',
      'failed',
      'banned',
      'timeout',
      'unknown'
    )
  ),

  /*
    Latest latency in milliseconds.

    Example:
    120 means 120 ms.

    NULL means latency is unknown.
  */
  "latency" INTEGER NULL,

  /*
    Last time this proxy was checked for this host.

    Use CURRENT_TIMESTAMP when updating check result.
  */
  "last_check" TEXT NULL,

  /*
    Number of failed checks for this proxy and host.

    Useful for deciding when to stop using a proxy for a host.
  */
  "fail_count" INTEGER NOT NULL DEFAULT 0,

  /*
    Number of successful checks for this proxy and host.

    Useful for ranking reliable proxies.
  */
  "success_count" INTEGER NOT NULL DEFAULT 0,

  /*
    Row creation timestamp.
  */
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  /*
    Last update timestamp.
  */
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  /*
    Composite primary key.

    This prevents duplicate relation rows.

    It means the same proxy_id and host_id pair
    can only appear once.
  */
  PRIMARY KEY ("proxy_id", "host_id"),

  /*
    Foreign key to proxies.id.

    ON DELETE CASCADE means:
    if a proxy is deleted, all related proxy_hosts rows
    will also be deleted.
  */
  FOREIGN KEY ("proxy_id")
    REFERENCES "proxies" ("id")
    ON DELETE CASCADE,

  /*
    Foreign key to hosts.id.

    ON DELETE CASCADE means:
    if a host is deleted, all related proxy_hosts rows
    will also be deleted.
  */
  FOREIGN KEY ("host_id")
    REFERENCES "hosts" ("id")
    ON DELETE CASCADE
);


/*
  Speeds up queries filtered by status.

  Example:
  SELECT * FROM proxy_hosts WHERE status = 'working';
*/
CREATE INDEX IF NOT EXISTS "idx_proxy_hosts_status"
ON "proxy_hosts" ("status");


/*
  Speeds up finding working proxies for one host.

  Example:
  SELECT * FROM proxy_hosts
  WHERE host_id = 1 AND status = 'working';
*/
CREATE INDEX IF NOT EXISTS "idx_proxy_hosts_host_status"
ON "proxy_hosts" ("host_id", "status");


/*
  Speeds up finding supported hosts for one proxy.

  Example:
  SELECT * FROM proxy_hosts
  WHERE proxy_id = 1 AND status = 'working';
*/
CREATE INDEX IF NOT EXISTS "idx_proxy_hosts_proxy_status"
ON "proxy_hosts" ("proxy_id", "status");


/*
  Speeds up queries ordered or filtered by last check time.

  Example:
  Find proxies that have not been checked recently.
*/
CREATE INDEX IF NOT EXISTS "idx_proxy_hosts_last_check"
ON "proxy_hosts" ("last_check");


/*
  ============================================================
  TABLE: proxy_check_logs
  ============================================================

  This table stores check history.

  proxy_hosts stores the latest status.
  proxy_check_logs stores every check attempt.

  This table is optional, but useful for:
  - debugging
  - statistics
  - reliability scoring
  - historical reports
*/
CREATE TABLE IF NOT EXISTS "proxy_check_logs" (
  /*
    Auto-increment primary key for each check log.
  */
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,

  /*
    The checked proxy.
  */
  "proxy_id" INTEGER NOT NULL,

  /*
    The checked host/domain.
  */
  "host_id" INTEGER NOT NULL,

  /*
    Result of this single check attempt.
  */
  "status" TEXT NOT NULL CHECK (
    "status" IN (
      'working',
      'failed',
      'banned',
      'timeout',
      'unknown'
    )
  ),

  /*
    Latency in milliseconds for this check attempt.

    NULL means latency was not measured.
  */
  "latency" INTEGER NULL,

  /*
    Optional error message.

    Examples:
    ECONNRESET
    ETIMEDOUT
    403 Forbidden
    Proxy authentication failed
  */
  "error_message" TEXT NULL,

  /*
    Time when this check happened.
  */
  "checked_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  /*
    Delete check logs automatically when the proxy is deleted.
  */
  FOREIGN KEY ("proxy_id")
    REFERENCES "proxies" ("id")
    ON DELETE CASCADE,

  /*
    Delete check logs automatically when the host is deleted.
  */
  FOREIGN KEY ("host_id")
    REFERENCES "hosts" ("id")
    ON DELETE CASCADE
);


/*
  Speeds up reading check logs for one proxy and one host.

  Example:
  SELECT * FROM proxy_check_logs
  WHERE proxy_id = 1 AND host_id = 2;
*/
CREATE INDEX IF NOT EXISTS "idx_proxy_check_logs_proxy_host"
ON "proxy_check_logs" ("proxy_id", "host_id");


/*
  Speeds up reading recent check logs.

  Example:
  SELECT * FROM proxy_check_logs
  ORDER BY checked_at DESC;
*/
CREATE INDEX IF NOT EXISTS "idx_proxy_check_logs_checked_at"
ON "proxy_check_logs" ("checked_at");


/*
  ============================================================
  TABLE: processed_proxies
  ============================================================

  Optional helper table.

  Use this if you import large proxy lists and want to remember
  which proxy strings have already been processed.

  This prevents checking the same raw proxy repeatedly.
*/
CREATE TABLE IF NOT EXISTS "processed_proxies" (
  /*
    Raw proxy string.

    Example:
    1.2.3.4:8080
  */
  "proxy" TEXT NOT NULL PRIMARY KEY,

  /*
    Last time this proxy string was processed.
  */
  "updated" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


/*
  ============================================================
  TABLE: added_proxies
  ============================================================

  Optional helper table.

  Use this if you want to track which proxy strings were added
  from import, scraper, API, or manual input.
*/
CREATE TABLE IF NOT EXISTS "added_proxies" (
  /*
    Raw proxy string that was added.
  */
  "proxy" TEXT NOT NULL PRIMARY KEY,

  /*
    Last time this proxy string was added or updated.
  */
  "updated" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


/*
  ============================================================
  TABLE: meta
  ============================================================

  Simple key-value storage.

  Useful for app settings, migration version, last import time,
  or crawler checkpoint.
*/
CREATE TABLE IF NOT EXISTS "meta" (
  /*
    Metadata key.

    Examples:
    schema_version
    last_proxy_import
    last_cleanup
  */
  "key" TEXT NOT NULL PRIMARY KEY,

  /*
    Metadata value.

    Stored as TEXT so you can save strings, numbers, dates, or JSON.
  */
  "value" TEXT
);