import path from 'upath';
import { isDevelopmentMode } from '../utils/env.js';
import { ProxyDB } from './ProxyDB.js';
import SQLiteModel from './SQLiteModel.js';
import { createSettings, Settings } from './Settings.js';
import SQLHelper from './SQLHelper.js';
import type { MySQLConfig } from './SQLHelper.js';

// Singleton instances for connection reuse
let productionMySQLInstance: ProxyDB | null = null;
let localMySQLInstance: ProxyDB | null = null;
let centralizedSQLiteInstance: ProxyDB | null = null;

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
 * Get or create the centralized SQLite singleton.
 *
 * Environment variables:
 *   SQLITE_DBNAME (required) – base filename, e.g. "myproject.sqlite"
 *   DEBUG_DEVICES (optional) – comma‑separated hostnames for dev detection
 *
 * In development mode (hostname matches DEBUG_DEVICES) the filename gets a "-test"
 * suffix before the .sqlite extension.
 *
 * The first call initializes the ProxyDB instance. Callers are responsible for
 * running any migrations via their own migration files (e.g. SQLiteModel-migration.ts).
 */
export async function getSQLite(): Promise<ProxyDB> {
  if (!centralizedSQLiteInstance) {
    const dbNameBase = process.env.SQLITE_DBNAME;
    if (!dbNameBase) {
      throw new Error(
        'SQLITE_DBNAME environment variable is not set. It is required for SQLite database configuration.'
      );
    }
    // Enforce .sqlite extension and apply dev suffix
    const ext = path.extname(dbNameBase);
    const name = path.basename(dbNameBase, ext);
    const suffix = isDevelopmentMode() ? '-test' : '';
    const dbName = `${name}${suffix}${ext || '.sqlite'}`;
    const dbPath = path.join(process.cwd(), 'tmp', 'database', dbName);
    centralizedSQLiteInstance = new ProxyDB({
      db_type: 'sqlite',
      sqlite_filename: dbPath
    });
    await centralizedSQLiteInstance.initialize();
  }
  return centralizedSQLiteInstance;
}

/**
 * Shared SQLiteModel instance for models database (uses the centralized SQLite instance)
 */
export async function getSharedModels(): Promise<SQLiteModel> {
  const db = await getSQLite();
  return new SQLiteModel(db);
}

// Singleton instance for settings
let settingsInstance: Settings | null = null;

/**
 * Get or initialize the settings instance.
 * Uses environment variables to determine database type:
 *   DATABASE_TYPE - 'sqlite' (default) or 'mysql'
 *   SQLITE_DBNAME - SQLite database filename (default: 'settings.db')
 *   MYSQL_HOST, MYSQL_USER, MYSQL_PASS, MYSQL_DBNAME, MYSQL_PORT - MySQL connection params
 *
 * @returns The settings instance, or null if initialization failed
 */
export async function getSettings(): Promise<Settings | null> {
  if (settingsInstance) return settingsInstance;

  const envDbType = process.env.DATABASE_TYPE || 'sqlite';
  const dbType = envDbType as 'sqlite' | 'mysql';
  let helper: SQLHelper;

  try {
    if (dbType === 'sqlite') {
      // Reuse the centralized SQLite instance
      const proxyDb = await getSQLite();
      helper = proxyDb.helper as SQLHelper;
    } else if (dbType === 'mysql') {
      // Create a separate SQLHelper for MySQL settings
      const config: MySQLConfig = {
        host: process.env.MYSQL_HOST || '127.0.0.1',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASS || '',
        database: process.env.MYSQL_DBNAME || 'app',
        port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT, 10) : 3306
      };
      helper = new SQLHelper('mysql', config);
    } else {
      console.warn(`Unknown DATABASE_TYPE: ${dbType}`);
      return null;
    }

    settingsInstance = createSettings(helper);
    await settingsInstance.initialize();
    return settingsInstance;
  } catch (error) {
    console.error('Failed to initialize settings:', error);
    return null;
  }
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

  if (centralizedSQLiteInstance) {
    closePromises.push(centralizedSQLiteInstance.close());
    centralizedSQLiteInstance = null;
  }

  if (settingsInstance) {
    closePromises.push(settingsInstance.close());
    settingsInstance = null;
  }

  await Promise.all(closePromises);
}

export default {
  getProductionMySQL,
  getLocalMySQL,
  getSharedModels,
  getSQLite,
  getSettings,
  closeAllDatabases
};
