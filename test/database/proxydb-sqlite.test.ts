import { ProxyDB } from '../../src/database/ProxyDB.js';

describe('ProxyDB SQLite', () => {
  let proxy_db: ProxyDB;

  beforeAll(async () => {
    proxy_db = new ProxyDB({ db_type: 'sqlite', sqlite_filename: ':memory:' });
    await proxy_db.initialize();
  });

  afterAll(async () => {
    await proxy_db.close();
  });

  test('should perform CRUD operations on proxies table', async () => {
    const proxiesTable = await proxy_db.proxies();
    const proxyAddress = '127.0.0.1:1080';

    // 1. Insert
    const insertResult = await proxiesTable.insert({
      proxy: proxyAddress,
      type: 'socks5',
      country: 'ID',
      status: 'alive',
      anonymity: 'high'
    });
    expect(insertResult.insertId).toBeDefined();

    // 2. Find
    const found = await proxiesTable.findOne({ proxy: proxyAddress });
    expect(found).toBeDefined();
    expect(found.proxy).toBe(proxyAddress);
    expect(found.status).toBe('alive');

    // 3. Update
    const updateResult = await proxiesTable.update({ status: 'dead', latency: '200ms' }, { proxy: proxyAddress });
    expect(updateResult.affectedRows).toBe(1);

    // 4. Verify update
    const updated = await proxiesTable.findOne({ proxy: proxyAddress });
    expect(updated.status).toBe('dead');
    expect(updated.latency).toBe('200ms');

    // 5. Delete
    const deleteResult = await proxiesTable.delete({ proxy: proxyAddress });
    expect(deleteResult.affectedRows).toBe(1);

    // 6. Verify deletion
    const deleted = await proxiesTable.findOne({ proxy: proxyAddress });
    expect(deleted).toBeNull();
  });
});
