import { getLocalMySQL } from '../../src/database/shared.js';
import { jest } from '@jest/globals';

describe('ProxyDB MySQL', () => {
  jest.setTimeout(20000);
  let proxy_db: any;

  beforeAll(async () => {
    proxy_db = getLocalMySQL();
    await proxy_db.initialize();
  });

  afterAll(async () => {
    await proxy_db.close();
  });

  test('should perform CRUD operations on proxies table', async () => {
    const proxiesTable = await proxy_db.proxies();
    const proxyAddress = '192.168.1.1:8080';

    // 1. Insert
    const insertResult = await proxiesTable.insert({
      proxy: proxyAddress,
      type: 'http',
      country: 'US',
      region: 'California',
      city: 'San Francisco',
      status: 'alive',
      anonymity: 'high',
      https: 'yes'
    });
    expect(insertResult.insertId).toBeDefined();

    // 2. Find
    const found = await proxiesTable.findOne({ proxy: proxyAddress });
    expect(found).toBeDefined();
    expect(found.proxy).toBe(proxyAddress);
    expect(found.status).toBe('alive');

    // 3. Update
    const updateResult = await proxiesTable.update({ status: 'dead', latency: '150ms' }, { proxy: proxyAddress });
    expect(updateResult.affectedRows).toBe(1);

    // 4. Verify update
    const updated = await proxiesTable.findOne({ proxy: proxyAddress });
    expect(updated.status).toBe('dead');
    expect(updated.latency).toBe('150ms');

    // 5. Find by country
    const usProxies = await proxiesTable.findByCountry('US');
    expect(usProxies.length).toBeGreaterThanOrEqual(1);

    // 6. Count
    const count = await proxiesTable.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // 7. Upsert (update existing)
    const upsertResult = await proxiesTable.update({ status: 'alive', latency: '50ms' }, { proxy: proxyAddress });
    expect(upsertResult.affectedRows).toBe(1);

    // 8. Delete
    const deleteResult = await proxiesTable.delete({ proxy: proxyAddress });
    expect(deleteResult.affectedRows).toBe(1);

    // 9. Verify deletion
    const deleted = await proxiesTable.findOne({ proxy: proxyAddress });
    expect(deleted).toBeNull();
  });
});
