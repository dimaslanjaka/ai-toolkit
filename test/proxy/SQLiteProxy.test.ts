import fs from 'fs';
import path from 'path';
import { createLocalSQLite } from '../../src/database/shared.js';
import { SQLiteProxy } from '../../src/proxy/SQLiteProxy.js';

describe('SQLiteProxy', () => {
  let db: SQLiteProxy;
  const dbPath = path.join(process.cwd(), 'tmp/database/proxydb-test.sqlite');

  beforeAll(async () => {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create instance and initialize
    const proxyDB = createLocalSQLite();
    // Re-cast to SQLiteProxy to use its methods, but ProxyDB config is the same
    db = new SQLiteProxy((proxyDB as any)._config);
    await db.initialize();
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
    // Optional: cleanup db file
    // if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  test('should create tables from schema', async () => {
    // Check if tables exist by trying to count rows
    const proxyCount = await (await db.proxy_entries()).count();
    const hostCount = await (await db.hosts()).count();
    const proxyHostCount = await (await db.proxy_hosts()).count();

    expect(typeof proxyCount).toBe('number');
    expect(typeof hostCount).toBe('number');
    expect(typeof proxyHostCount).toBe('number');
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
    await proxies.update({ is_active: 0 }, { id });
    const updated = await proxies.findOne({ id });
    expect(updated?.is_active).toBe(0);

    // Delete
    await proxies.delete({ id });
    const deleted = await proxies.findOne({ id });
    expect(deleted).toBeNull();
  });

  test('should perform CRUD on hosts', async () => {
    const hosts = await db.hosts();

    // Insert
    const res = await hosts.insert({
      host: 'google.com',
      match_type: 'exact'
    });
    expect(res.affectedRows).toBe(1);
    const id = res.insertId!;

    // Find
    const entry = await hosts.findOne({ id });
    expect(entry).toBeDefined();
    expect(entry?.host).toBe('google.com');

    // Delete
    await hosts.delete({ id });
  });

  test('should handle proxy_hosts relationships', async () => {
    const proxies = await db.proxy_entries();
    const hosts = await db.hosts();
    const proxyHosts = await db.proxy_hosts();

    const pRes = await proxies.insert({ proxy: '1.2.3.4:1080', type: 'socks5' });
    const hRes = await hosts.insert({ host: 'example.com', match_type: 'subdomain' });

    const proxy_id = pRes.insertId!;
    const host_id = hRes.insertId!;

    // Upsert (Insert)
    await proxyHosts.upsert({
      proxy_id,
      host_id,
      status: 'working',
      latency: 150
    });

    const rel = await proxyHosts.findOne({ proxy_id, host_id });
    expect(rel?.status).toBe('working');
    expect(rel?.latency).toBe(150);

    // Upsert (Update)
    await proxyHosts.upsert({
      proxy_id,
      host_id,
      status: 'failed',
      latency: 0
    });

    const updatedRel = await proxyHosts.findOne({ proxy_id, host_id });
    expect(updatedRel?.status).toBe('failed');

    // Cleanup
    await proxies.delete({ id: proxy_id }); // Should cascade to proxy_hosts
    const relAfterProxyDelete = await proxyHosts.findOne({ proxy_id, host_id });
    expect(relAfterProxyDelete).toBeNull();

    await hosts.delete({ id: host_id });
  });
});
