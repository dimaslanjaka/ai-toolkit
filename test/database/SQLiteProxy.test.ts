import fs from 'fs';
import path from 'path';
import { SQLiteProxy } from '../../src/database/SQLiteProxy.js';

describe('SQLiteProxy', () => {
  let db: SQLiteProxy;
  const dbPath = path.join(process.cwd(), 'tmp/database/proxydb-test.sqlite');

  beforeAll(async () => {
    // Ensure clean slate - use in-memory DB for tests
    const proxyDB = new SQLiteProxy({
      db_type: 'sqlite',
      sqlite_filename: ':memory:'
    } as any);
    db = proxyDB;
    await db.initialize();
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  test('should create tables from schema', async () => {
    // Check if proxies table exists
    const proxyCount = await (await db.proxy_entries()).count();
    expect(typeof proxyCount).toBe('number');
  });

  test('should perform CRUD on proxies', async () => {
    const proxies = await db.proxy_entries();

    // Insert
    const res = await proxies.insert({
      proxy: '127.0.0.1:8080',
      type: 'http'
    });
    expect(res.affectedRows).toBe(1);
    const id = res.insertId!;

    // Find
    const entry = await proxies.findOne({ id });
    expect(entry).toBeDefined();
    expect(entry?.proxy).toBe('127.0.0.1:8080');

    // Update
    await proxies.update({ status: 'dead' }, { id });
    const updated = await proxies.findOne({ id });
    expect(updated?.status).toBe('dead');

    // Delete
    await proxies.delete({ id });
    const deleted = await proxies.findOne({ id });
    expect(deleted).toBeNull();
  });

  test('should mark proxy as dead', async () => {
    const proxies = await db.proxy_entries();

    // Insert a proxy
    await proxies.insert({ proxy: '3.4.5.6:8080', type: 'http' });

    // Mark as dead
    await db.markProxyDead('3.4.5.6:8080');

    // Verify
    const proxy = await proxies.findOne({ proxy: '3.4.5.6:8080' });
    expect(proxy?.status).toBe('dead');

    // Cleanup
    await proxies.delete({ proxy: '3.4.5.6:8080' });
  });
});
