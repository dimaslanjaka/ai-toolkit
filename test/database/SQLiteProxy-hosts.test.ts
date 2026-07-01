import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { SQLiteProxy } from '../../src/database/SQLiteProxy.js';

describe('SQLiteProxy - Hosts and Proxies', () => {
  let db: SQLiteProxy;

  beforeAll(async () => {
    // Use in-memory SQLite DB for isolated testing
    db = new SQLiteProxy({
      db_type: 'sqlite',
      sqlite_filename: ':memory:'
    } as any);
    await db.initialize();
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
    // No file cleanup needed for in-memory DB
  });

  test('should get working proxies for a specific host', async () => {
    const proxies = await db.proxy_entries();
    const hosts = await db.hosts();
    const proxyHosts = await db.proxy_hosts();

    // Add test proxies
    const p1Res = await proxies.insert({ proxy: '10.0.0.1:8080', type: 'http' });
    const p2Res = await proxies.insert({ proxy: '10.0.0.2:8080', type: 'http' });
    const p3Res = await proxies.insert({ proxy: '10.0.0.3:8080', type: 'socks5' });

    // Add test hosts
    const h1Res = await hosts.insert({ host: 'api.example.com' });
    const h2Res = await hosts.insert({ host: 'www.example.com' });

    const proxy1_id = p1Res.insertId!;
    const proxy2_id = p2Res.insertId!;
    const proxy3_id = p3Res.insertId!;
    const host1_id = h1Res.insertId!;
    const host2_id = h2Res.insertId!;

    // Add proxy relationships
    // Host 1 (api.example.com): proxy1 active, proxy2 active
    await proxyHosts.insert({
      proxy_id: proxy1_id,
      host_id: host1_id,
      status: 'active'
    });
    await proxyHosts.insert({
      proxy_id: proxy2_id,
      host_id: host1_id,
      status: 'active'
    });

    // Host 2 (www.example.com): proxy1 active, proxy3 failed
    await proxyHosts.insert({
      proxy_id: proxy1_id,
      host_id: host2_id,
      status: 'active'
    });
    await proxyHosts.insert({
      proxy_id: proxy3_id,
      host_id: host2_id,
      status: 'failed'
    });

    // Query working proxies for host 1
    const workingForHost1 = await db.query(
      `SELECT p.* FROM proxies p
       JOIN proxy_hosts ph ON p.id = ph.proxy_id
       WHERE ph.host_id = ? AND ph.status = 'active'`,
      [host1_id]
    );

    expect(workingForHost1).toHaveLength(2);
    expect(workingForHost1.map((p: any) => p.proxy)).toContain('10.0.0.1:8080');
    expect(workingForHost1.map((p: any) => p.proxy)).toContain('10.0.0.2:8080');

    // Query working proxies for host 2
    const workingForHost2 = await db.query(
      `SELECT p.* FROM proxies p
       JOIN proxy_hosts ph ON p.id = ph.proxy_id
       WHERE ph.host_id = ? AND ph.status = 'active'`,
      [host2_id]
    );

    expect(workingForHost2).toHaveLength(1);
    expect(workingForHost2[0].proxy).toBe('10.0.0.1:8080');

    // Cleanup
    await proxyHosts.delete({ proxy_id: proxy1_id, host_id: host1_id });
    await proxyHosts.delete({ proxy_id: proxy2_id, host_id: host1_id });
    await proxyHosts.delete({ proxy_id: proxy1_id, host_id: host2_id });
    await proxyHosts.delete({ proxy_id: proxy3_id, host_id: host2_id });
    await proxies.delete({ id: proxy1_id });
    await proxies.delete({ id: proxy2_id });
    await proxies.delete({ id: proxy3_id });
    await hosts.delete({ id: host1_id });
    await hosts.delete({ id: host2_id });
  });

  test('should add proxy via addProxy and query by host', async () => {
    // Add proxies using addProxy method
    await db.addProxy({ proxy: '20.0.0.1:9090', type: 'http', host: 'api.test.com' });
    await db.addProxy({ proxy: '20.0.0.2:9090', type: 'socks5', host: 'api.test.com' });
    await db.addProxy({ proxy: '20.0.0.1:9090', type: 'http', host: 'web.test.com' });

    // Query working proxies for api.test.com
    const workingProxies = await db.query(
      `SELECT p.proxy, p.type FROM proxies p
       JOIN proxy_hosts ph ON p.id = ph.proxy_id
       JOIN hosts h ON ph.host_id = h.id
       WHERE h.host = ? AND ph.status = 'active'`,
      ['api.test.com']
    );

    expect(workingProxies).toHaveLength(2);
    expect(workingProxies.map((p: any) => p.proxy)).toContain('20.0.0.1:9090');
    expect(workingProxies.map((p: any) => p.proxy)).toContain('20.0.0.2:9090');

    // Query for web.test.com
    const webProxies = await db.query(
      `SELECT p.proxy, p.type FROM proxies p
       JOIN proxy_hosts ph ON p.id = ph.proxy_id
       JOIN hosts h ON ph.host_id = h.id
       WHERE h.host = ? AND ph.status = 'active'`,
      ['web.test.com']
    );

    expect(webProxies).toHaveLength(1);
    expect(webProxies[0].proxy).toBe('20.0.0.1:9090');
  });

  test('getProxyForHost should return first active proxy for a host', async () => {
    // Add test proxies
    const proxies = await db.proxy_entries();
    const hosts = await db.hosts();
    const proxyHosts = await db.proxy_hosts();

    const p1Res = await proxies.insert({ proxy: '30.0.0.1:7070', type: 'http', status: 'active' });
    const p2Res = await proxies.insert({ proxy: '30.0.0.2:7070', type: 'socks5', status: 'active' });

    const hRes = await hosts.insert({ host: 'proxy.test.com' });

    const proxy1_id = p1Res.insertId!;
    const proxy2_id = p2Res.insertId!;
    const host_id = hRes.insertId!;

    // Add active proxy relationships
    await proxyHosts.insert({
      proxy_id: proxy1_id,
      host_id: host_id,
      status: 'active'
    });
    await proxyHosts.insert({
      proxy_id: proxy2_id,
      host_id: host_id,
      status: 'active'
    });

    // Test getProxyForHost - should return first active proxy
    const result = await db.getProxyForHost('proxy.test.com');
    expect(result).toBeDefined();
    expect(result?.proxy).toBe('30.0.0.1:7070');

    // Cleanup
    await proxyHosts.delete({ proxy_id: proxy1_id, host_id: host_id });
    await proxyHosts.delete({ proxy_id: proxy2_id, host_id: host_id });
    await proxies.delete({ id: proxy1_id });
    await proxies.delete({ id: proxy2_id });
    await hosts.delete({ id: host_id });
  });

  test('getProxyForHost should return undefined for non-existent host', async () => {
    const result = await db.getProxyForHost('non.existent.host');
    expect(result).toBeUndefined();
  });

  test('getProxyForHost should return undefined when host has no active proxies', async () => {
    // Add test proxy and host
    const proxies = await db.proxy_entries();
    const hosts = await db.hosts();
    const proxyHosts = await db.proxy_hosts();

    const pRes = await proxies.insert({ proxy: '40.0.0.1:6060', type: 'http', status: 'dead' });
    const hRes = await hosts.insert({ host: 'dead.proxy.com' });

    const proxy_id = pRes.insertId!;
    const host_id = hRes.insertId!;

    // Add failed proxy relationship (not active)
    await proxyHosts.insert({
      proxy_id: proxy_id,
      host_id: host_id,
      status: 'failed'
    });

    // Test getProxyForHost - should return undefined (no active proxies)
    const result = await db.getProxyForHost('dead.proxy.com');
    expect(result).toBeUndefined();

    // Cleanup
    await proxyHosts.delete({ proxy_id: proxy_id, host_id: host_id });
    await proxies.delete({ id: proxy_id });
    await hosts.delete({ id: host_id });
  });
});
