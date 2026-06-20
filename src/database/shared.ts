import { ProxyDB } from './ProxyDB.js';
import path from 'upath';
import SQLiteModel from './SQLiteModel.js';
import { OPENCODE_PROXY_DB_PATH } from '../proxy/opencode-checker.js';

// Singleton instances for connection reuse
let productionMySQLInstance: ProxyDB | null = null;
let localMySQLInstance: ProxyDB | null = null;
let localSQLiteInstance: ProxyDB | null = null;
let sharedModelsInstance: SQLiteModel | null = null;

/**
 * Get or create singleton ProxyDB instance for production database (read/add/edit only)
 * MYSQL_USER_PRODUCTION="<dbuser>"
 * MYSQL_PASS_PRODUCTION="<dbpass>"
 * MYSQL_HOST_PRODUCTION="<ip>"
 * MYSQL_DBNAME_PRODUCTION="<dbname>"
 */
export function getProductionMySQL(): ProxyDB {
  if (!productionMySQLInstance) {
    productionMySQLInstance = new ProxyDB({
      db_type: 'mysql',
      mysql_host: process.env.MYSQL_HOST_PRODUCTION || '23.94.85.180',
      mysql_user: process.env.MYSQL_USER_PRODUCTION || 'lenarox',
      mysql_password: process.env.MYSQL_PASS_PRODUCTION || 'lenaroxMysqlKu',
      mysql_dbname: process.env.MYSQL_DBNAME_PRODUCTION || 'myproject',
      mysql_port: parseInt(process.env.MYSQL_PORT_PRODUCTION || '3306', 10)
    });
  }
  return productionMySQLInstance;
}

/**
 * Get or create singleton ProxyDB instance for local development database (full operations)
 * MYSQL_USER="<dbuser>"
 * MYSQL_PASS="<dbpass>"
 * MYSQL_DBNAME="<dbname>"
 * MYSQL_HOST="127.0.0.1"
 */
export function getLocalMySQL(): ProxyDB {
  if (!localMySQLInstance) {
    localMySQLInstance = new ProxyDB({
      db_type: 'mysql',
      mysql_host: process.env.MYSQL_HOST || '127.0.0.1',
      mysql_user: process.env.MYSQL_USER || 'root',
      mysql_password: process.env.MYSQL_PASS || '123456',
      mysql_dbname: process.env.MYSQL_DBNAME || 'php_proxy_hunter_test',
      mysql_port: parseInt(process.env.MYSQL_PORT || '3306', 10)
    });
  }
  return localMySQLInstance;
}

/**
 * Get or create singleton ProxyDB instance for local SQLite database (file path: ./tmp/database/proxy-db-test.sqlite)
 *
 * ⚠️ WARNING: This is a PRODUCTION database connection.
 * This function connects to an existing SQLite database file that contains real data.
 * Do NOT use this in tests - it will read/write production data and may cause data loss.
 *
 * For testing, create an in-memory SQLite database instead:
 *   new ProxyDB({ db_type: 'sqlite', sqlite_filename: ':memory:' });
 */
export function getProductionSQLite(): ProxyDB {
  if (!localSQLiteInstance) {
    localSQLiteInstance = new ProxyDB({
      db_type: 'sqlite',
      sqlite_filename: path.join(process.cwd(), 'tmp/database/proxy-db-test.sqlite')
    });
  }
  return localSQLiteInstance;
}

/**
 * Shared SQLiteModel instance for models database
 */
export function getSharedModels(): SQLiteModel {
  if (!sharedModelsInstance) {
    sharedModelsInstance = new SQLiteModel({ sqlite_filename: OPENCODE_PROXY_DB_PATH });
  }
  return sharedModelsInstance;
}

/**
 * Close all database connections
 * Call this on application shutdown to properly clean up connection pools
 */
export async function closeAllDatabases(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  if (productionMySQLInstance) {
    closePromises.push(productionMySQLInstance.close());
    productionMySQLInstance = null;
  }

  if (localMySQLInstance) {
    closePromises.push(localMySQLInstance.close());
    localMySQLInstance = null;
  }

  if (localSQLiteInstance) {
    closePromises.push(localSQLiteInstance.close());
    localSQLiteInstance = null;
  }

  if (sharedModelsInstance) {
    closePromises.push(sharedModelsInstance.close());
    sharedModelsInstance = null;
  }

  await Promise.all(closePromises);
}

export default {
  getProductionMySQL,
  getLocalMySQL,
  getProductionSQLite,
  getSharedModels,
  closeAllDatabases
};
