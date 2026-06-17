import Database from 'better-sqlite3';
import fs from 'fs-extra';
import path from 'upath';
import moment from 'moment-timezone';

export type ValidUntil = string | number | null | undefined;

export interface SQLiteMarkerOptions {
  tableName?: string;
  keyColumn?: string;
  baseDir?: string;
  timezone?: string;
}

export interface UnseenResultJson {
  cleaned: string[];
  pending: string[];
  already_checked: number;
}

interface MarkerRow {
  marker_value: string;
}

interface TableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

const PROJECT_ROOT = process.cwd();
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DEFAULT_TIMEZONE = 'Asia/Jakarta';
const DATE_FORMAT = 'YYYY-MM-DDTHH:mm:ssZ';

export class UnseenResult {
  cleaned: Set<string>;
  pending: Set<string>;
  already_checked: number;

  constructor({
    cleaned = new Set<string>(),
    pending = new Set<string>(),
    already_checked = 0
  }: {
    cleaned?: Set<string>;
    pending?: Set<string>;
    already_checked?: number;
  } = {}) {
    this.cleaned = cleaned;
    this.pending = pending;
    this.already_checked = already_checked;
  }

  toJSON(): UnseenResultJson {
    return {
      cleaned: [...this.cleaned],
      pending: [...this.pending],
      already_checked: this.already_checked
    };
  }
}

export class SQLiteMarker {
  private readonly tableName: string;
  private readonly keyColumn: string;
  private readonly db: Database.Database;
  private readonly timezone: string;

  constructor(
    dbFilename: string,
    {
      tableName = 'markers',
      keyColumn = 'marker',
      baseDir = 'tmp/database',
      timezone = DEFAULT_TIMEZONE
    }: SQLiteMarkerOptions = {}
  ) {
    this.tableName = this.validateIdentifier(tableName);
    this.keyColumn = this.validateIdentifier(keyColumn);
    this.timezone = timezone;

    const dbDir = this.getRelativePath(baseDir);
    fs.ensureDirSync(dbDir);

    const dbPath = path.join(dbDir, dbFilename);
    this.db = new Database(dbPath);

    this.configureSqlite();
    this.createTable();
    this.ensureExpiresColumn();
  }

  private getRelativePath(...parts: string[]): string {
    return path.resolve(PROJECT_ROOT, ...parts);
  }

  private validateIdentifier(value: string): string {
    if (!IDENTIFIER_RE.test(value)) {
      throw new Error(`Invalid SQL identifier: ${value}`);
    }

    return value;
  }

  private quoteIdentifier(value: string): string {
    return `"${value}"`;
  }

  private now(): string {
    return moment().tz(this.timezone).format(DATE_FORMAT);
  }

  private configureSqlite(): void {
    try {
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('temp_store = MEMORY');
      this.db.pragma('cache_size = -20000');
      this.db.pragma('busy_timeout = 30000');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[sqlite] PRAGMA error: ${message}`);
    }
  }

  private createTable(): void {
    const table = this.quoteIdentifier(this.tableName);
    const key = this.quoteIdentifier(this.keyColumn);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${table} (
        ${key} TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        expires_at TEXT
      )
    `);
  }

  private columnExists(columnName: string): boolean {
    const table = this.quoteIdentifier(this.tableName);

    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as TableInfoRow[];

    return rows.some((row) => row.name === columnName);
  }

  private ensureExpiresColumn(): void {
    if (this.columnExists('expires_at')) {
      return;
    }

    const table = this.quoteIdentifier(this.tableName);

    this.db.exec(`
      ALTER TABLE ${table}
      ADD COLUMN expires_at TEXT
    `);
  }

  private normalizeDate(value: string): string {
    const text = String(value).trim();

    if (!text) {
      throw new Error('Date value is required');
    }

    const parsed = moment.parseZone(text);

    if (!parsed.isValid()) {
      throw new Error(`Invalid date value: ${value}`);
    }

    return parsed.tz(this.timezone).format(DATE_FORMAT);
  }

  private resolveValidUntil(validUntil: ValidUntil): string | null {
    if (validUntil === null || validUntil === undefined) {
      return null;
    }

    if (typeof validUntil === 'number' && isFinite(validUntil)) {
      return moment()
        .tz(this.timezone)
        .add(validUntil, 'days')
        .format(DATE_FORMAT);
    }

    return this.normalizeDate(String(validUntil));
  }

  getExisting(values: Iterable<unknown>, asOf: string | null = null): Set<string> {
    const normalized: string[] = [];

    for (const value of values) {
      if (value === null || value === undefined) {
        continue;
      }
      const text = String(value).trim();

      if (text) {
        normalized.push(text);
      }
    }

    if (normalized.length === 0) {
      return new Set<string>();
    }

    const asOfValue = asOf ? this.normalizeDate(asOf) : this.now();

    const table = this.quoteIdentifier(this.tableName);
    const key = this.quoteIdentifier(this.keyColumn);

    const chunkSize = 900;
    const existing = new Set<string>();

    for (let i = 0; i < normalized.length; i += chunkSize) {
      const chunk = normalized.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '?').join(',');

      const sql = `
        SELECT ${key} AS marker_value
        FROM ${table}
        WHERE ${key} IN (${placeholders})
        AND (expires_at IS NULL OR expires_at > ?)
      `;

      const rows = this.db.prepare(sql).all(...chunk, asOfValue) as MarkerRow[];

      for (const row of rows) {
        if (row.marker_value) {
          existing.add(String(row.marker_value));
        }
      }
    }

    return existing;
  }

  filterUnseen(values: Iterable<unknown>, asOf: string | null = null): UnseenResult {
    const cleaned = new Set<string>();
    const ordered = new Set<string>();

    for (const value of values) {
      if (value === null || value === undefined) {
        continue;
      }
      const text = String(value).trim();

      if (!text || cleaned.has(text)) {
        continue;
      }

      cleaned.add(text);
      ordered.add(text);
    }

    if (ordered.size === 0) {
      return new UnseenResult();
    }

    const existing = this.getExisting(ordered, asOf);
    const pending = new Set<string>();

    for (const value of ordered) {
      if (!existing.has(value)) {
        pending.add(value);
      }
    }

    return new UnseenResult({
      cleaned,
      pending,
      already_checked: existing.size
    });
  }

  mark(value: unknown, validUntil: ValidUntil = null): void {
    if (value === null || value === undefined) {
      return;
    }
    const text = String(value).trim();

    if (!text) {
      return;
    }

    const now = this.now();
    const expires = this.resolveValidUntil(validUntil);

    const table = this.quoteIdentifier(this.tableName);
    const key = this.quoteIdentifier(this.keyColumn);

    const sql = `
      INSERT INTO ${table} (${key}, created_at, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(${key})
      DO UPDATE SET
        created_at = excluded.created_at,
        expires_at = excluded.expires_at
    `;

    this.db.prepare(sql).run(text, now, expires);
  }

  close(): void {
    this.db.close();
  }
}

export default SQLiteMarker;
