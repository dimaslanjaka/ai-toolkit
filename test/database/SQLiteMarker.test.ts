import fs from 'fs-extra';
import upath from 'upath';
import Database from 'better-sqlite3';
import moment from 'moment-timezone';
import SQLiteMarker, { UnseenResult } from '../../src/database/SQLiteMarker';

const TEST_BASE_DIR = 'tmp/test-sqlite-marker';
const TEST_TIMEZONE = 'Asia/Jakarta';
const DATE_FORMAT = 'YYYY-MM-DDTHH:mm:ssZ';

function createDbName(name: string): string {
  return `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`;
}

function getDbPath(dbName: string): string {
  return upath.resolve(process.cwd(), TEST_BASE_DIR, dbName);
}

describe('SQLiteMarker', () => {
  beforeEach(() => {
    fs.ensureDirSync(upath.resolve(process.cwd(), TEST_BASE_DIR));
  });

  afterEach(() => {
    fs.removeSync(upath.resolve(process.cwd(), TEST_BASE_DIR));
  });

  test('creates database file and marker table', () => {
    const dbName = createDbName('create-table');

    const marker = new SQLiteMarker(dbName, {
      baseDir: TEST_BASE_DIR,
      timezone: TEST_TIMEZONE
    });

    marker.close();

    const dbPath = getDbPath(dbName);
    expect(fs.existsSync(dbPath)).toBe(true);

    const db = new Database(dbPath);
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get('markers') as
      | { name: string }
      | undefined;

    db.close();

    expect(table?.name).toBe('markers');
  });

  test('marks a value and returns it from getExisting', () => {
    const dbName = createDbName('mark-existing');

    const marker = new SQLiteMarker(dbName, {
      baseDir: TEST_BASE_DIR,
      timezone: TEST_TIMEZONE
    });

    marker.mark('proxy-1');

    const existing = marker.getExisting(['proxy-1', 'proxy-2']);

    marker.close();

    expect(existing.has('proxy-1')).toBe(true);
    expect(existing.has('proxy-2')).toBe(false);
  });

  test('trims empty values before checking existing markers', () => {
    const dbName = createDbName('trim-values');

    const marker = new SQLiteMarker(dbName, {
      baseDir: TEST_BASE_DIR,
      timezone: TEST_TIMEZONE
    });

    marker.mark('proxy-1');

    const existing = marker.getExisting([' proxy-1 ', '', '   ', null]);

    marker.close();

    expect(existing).toEqual(new Set(['proxy-1']));
  });

  test('filterUnseen deduplicates values and separates pending markers', () => {
    const dbName = createDbName('filter-unseen');

    const marker = new SQLiteMarker(dbName, {
      baseDir: TEST_BASE_DIR,
      timezone: TEST_TIMEZONE
    });

    marker.mark('proxy-1');

    const result = marker.filterUnseen(['proxy-1', 'proxy-2', 'proxy-2', ' proxy-3 ', '', '   ']);

    marker.close();

    expect(result).toBeInstanceOf(UnseenResult);
    expect(result.cleaned).toEqual(new Set(['proxy-1', 'proxy-2', 'proxy-3']));
    expect(result.pending).toEqual(new Set(['proxy-2', 'proxy-3']));
    expect(result.already_checked).toBe(1);
  });

  test('filterUnseen returns empty result when all values are empty', () => {
    const dbName = createDbName('filter-empty');

    const marker = new SQLiteMarker(dbName, {
      baseDir: TEST_BASE_DIR,
      timezone: TEST_TIMEZONE
    });

    const result = marker.filterUnseen(['', '   ', null, undefined]);

    marker.close();

    expect(result.cleaned.size).toBe(0);
    expect(result.pending.size).toBe(0);
    expect(result.already_checked).toBe(0);
  });

  test('mark updates existing marker using upsert', () => {
    const dbName = createDbName('upsert');

    const marker = new SQLiteMarker(dbName, {
      baseDir: TEST_BASE_DIR,
      timezone: TEST_TIMEZONE
    });

    marker.mark('proxy-1', -1);
    expect(marker.getExisting(['proxy-1']).has('proxy-1')).toBe(false);

    marker.mark('proxy-1', 7);
    expect(marker.getExisting(['proxy-1']).has('proxy-1')).toBe(true);

    marker.close();
  });

  test('expired markers are ignored', () => {
    const dbName = createDbName('expired');

    const marker = new SQLiteMarker(dbName, {
      baseDir: TEST_BASE_DIR,
      timezone: TEST_TIMEZONE
    });

    marker.mark('expired-proxy', -1);

    const existing = marker.getExisting(['expired-proxy']);

    marker.close();

    expect(existing.has('expired-proxy')).toBe(false);
  });

  test('future expiry markers are treated as existing', () => {
    const dbName = createDbName('future-expiry');

    const marker = new SQLiteMarker(dbName, {
      baseDir: TEST_BASE_DIR,
      timezone: TEST_TIMEZONE
    });

    marker.mark('future-proxy', 7);

    const existing = marker.getExisting(['future-proxy']);

    marker.close();

    expect(existing.has('future-proxy')).toBe(true);
  });

  test('accepts explicit date string using timezone format', () => {
    const dbName = createDbName('explicit-date');

    const marker = new SQLiteMarker(dbName, {
      baseDir: TEST_BASE_DIR,
      timezone: TEST_TIMEZONE
    });

    const validUntil = moment().tz(TEST_TIMEZONE).add(1, 'day').format(DATE_FORMAT);

    marker.mark('date-proxy', validUntil);

    const existing = marker.getExisting(['date-proxy']);

    marker.close();

    expect(existing.has('date-proxy')).toBe(true);
  });

  test('uses asOf date when checking expiry', () => {
    const dbName = createDbName('as-of');

    const marker = new SQLiteMarker(dbName, {
      baseDir: TEST_BASE_DIR,
      timezone: TEST_TIMEZONE
    });

    const expiresAt = moment().tz(TEST_TIMEZONE).add(1, 'day').format(DATE_FORMAT);

    const beforeExpiry = moment().tz(TEST_TIMEZONE).add(12, 'hours').format(DATE_FORMAT);

    const afterExpiry = moment().tz(TEST_TIMEZONE).add(2, 'days').format(DATE_FORMAT);

    marker.mark('asof-proxy', expiresAt);

    const existingBefore = marker.getExisting(['asof-proxy'], beforeExpiry);
    const existingAfter = marker.getExisting(['asof-proxy'], afterExpiry);

    marker.close();

    expect(existingBefore.has('asof-proxy')).toBe(true);
    expect(existingAfter.has('asof-proxy')).toBe(false);
  });

  test('supports custom table name and key column', () => {
    const dbName = createDbName('custom-table');

    const marker = new SQLiteMarker(dbName, {
      tableName: 'proxy_markers',
      keyColumn: 'proxy',
      baseDir: TEST_BASE_DIR,
      timezone: TEST_TIMEZONE
    });

    marker.mark('proxy-custom');

    const existing = marker.getExisting(['proxy-custom']);

    marker.close();

    expect(existing.has('proxy-custom')).toBe(true);

    const db = new Database(getDbPath(dbName));
    const row = db.prepare('SELECT proxy FROM proxy_markers WHERE proxy = ?').get('proxy-custom') as
      | { proxy: string }
      | undefined;

    db.close();

    expect(row?.proxy).toBe('proxy-custom');
  });

  test('throws error for invalid table name', () => {
    const dbName = createDbName('invalid-table');

    expect(() => {
      new SQLiteMarker(dbName, {
        tableName: 'markers; DROP TABLE users;',
        baseDir: TEST_BASE_DIR
      });
    }).toThrow('Invalid SQL identifier');
  });

  test('throws error for invalid key column', () => {
    const dbName = createDbName('invalid-column');

    expect(() => {
      new SQLiteMarker(dbName, {
        keyColumn: 'marker-name',
        baseDir: TEST_BASE_DIR
      });
    }).toThrow('Invalid SQL identifier');
  });

  test('toJSON converts sets into arrays', () => {
    const result = new UnseenResult({
      cleaned: new Set(['a', 'b']),
      pending: new Set(['b']),
      already_checked: 1
    });

    expect(result.toJSON()).toEqual({
      cleaned: ['a', 'b'],
      pending: ['b'],
      already_checked: 1
    });
  });

  it('should support fractional days in mark', () => {
    const marker = new SQLiteMarker('test-fraction.db', { baseDir: TEST_BASE_DIR, timezone: TEST_TIMEZONE });
    const key = 'proxy-1h';
    // mark for 1 hour
    marker.mark(key, 1 / 24);

    const unseen = marker.filterUnseen([key]);
    expect(unseen.pending.has(key)).toBe(false);
    expect(unseen.already_checked).toBe(1);

    marker.close();
  });

  it('should expire fractional days properly', () => {
    const marker = new SQLiteMarker('test-fraction-expire.db', { baseDir: TEST_BASE_DIR, timezone: TEST_TIMEZONE });
    const key = 'proxy-expired';
    
    // mark for 1 second ago (very small fraction)
    // 1 second = 1 / (24 * 3600) days
    const oneSecond = 1 / (24 * 3600);
    
    // We can't easily travel in time here without mocks, 
    // but we can pass an asOf date to filterUnseen
    marker.mark(key, oneSecond);
    
    const future = moment().add(2, 'seconds').toISOString();
    const unseen = marker.filterUnseen([key], future);
    
    expect(unseen.pending.has(key)).toBe(true);
    expect(unseen.already_checked).toBe(0);

    marker.close();
  });
});
