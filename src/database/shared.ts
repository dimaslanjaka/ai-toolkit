import { ProxyDB } from './ProxyDB.js';
import path from 'upath';

/**
 * Create ProxyDB instance for production database (read/add/edit only)
 * MYSQL_USER_PRODUCTION="<dbuser>"
 * MYSQL_PASS_PRODUCTION="<dbpass>"
 * MYSQL_HOST_PRODUCTION="<ip>"
 * MYSQL_DBNAME_PRODUCTION="<dbname>"
 */
export function createProductionMySQL(): ProxyDB {
  return new ProxyDB({
    db_type: 'mysql',
    mysql_host: process.env.MYSQL_HOST_PRODUCTION || '23.94.85.180',
    mysql_user: process.env.MYSQL_USER_PRODUCTION || 'lenarox',
    mysql_password: process.env.MYSQL_PASS_PRODUCTION || 'lenaroxMysqlKu',
    mysql_dbname: process.env.MYSQL_DBNAME_PRODUCTION || 'myproject',
    mysql_port: parseInt(process.env.MYSQL_PORT_PRODUCTION || '3306', 10)
  });
}

/**
 * Create ProxyDB instance for local development database (full operations)
 * MYSQL_USER="<dbuser>"
 * MYSQL_PASS="<dbpass>"
 * MYSQL_DBNAME="<dbname>"
 * MYSQL_HOST="127.0.0.1"
 */
export function createLocalMySQL(): ProxyDB {
  return new ProxyDB({
    db_type: 'mysql',
    mysql_host: process.env.MYSQL_HOST || '127.0.0.1',
    mysql_user: process.env.MYSQL_USER || 'root',
    mysql_password: process.env.MYSQL_PASS || '123456',
    mysql_dbname: process.env.MYSQL_DBNAME || 'php_proxy_hunter_test',
    mysql_port: parseInt(process.env.MYSQL_PORT || '3306', 10)
  });
}

/**
 * Create ProxyDB instance for local SQLite database (file path: ./tmp/database/proxy-db-test.sqlite)
 *
 * ⚠️ WARNING: This is a PRODUCTION database connection.
 * This function connects to an existing SQLite database file that contains real data.
 * Do NOT use this in tests - it will read/write production data and may cause data loss.
 *
 * For testing, create an in-memory SQLite database instead:
 *   new ProxyDB({ db_type: 'sqlite', sqlite_filename: ':memory:' });
 */
export function createLocalSQLite(): ProxyDB {
  return new ProxyDB({
    db_type: 'sqlite',
    sqlite_filename: path.join(process.cwd(), 'tmp/database/proxy-db-test.sqlite')
  });
}
