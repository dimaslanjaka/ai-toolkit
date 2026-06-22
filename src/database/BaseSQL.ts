/**
 * Abstract base class for SQL database implementations.
 * Defines the contract that SQLite and MySQL implementations must follow.
 */

/**
 * Abstract base class for SQL database helpers.
 * Provides a common interface for database operations across different SQL implementations.
 */
export abstract class BaseSQL {
  /**
   * Whether the database connection is ready for use
   */
  public abstract readonly ready: boolean;

  /**
   * Initialize the database connection.
   * Must be called before any other operations.
   * Safe to call multiple times - subsequent calls should be no-ops if already initialized.
   */
  abstract initialize(): Promise<void>;

  /**
   * Execute a SELECT query and return all results.
   *
   * @param sql - The SQL query string
   * @param params - Optional query parameters for prepared statements
   * @returns Array of query results
   */
  abstract query<T = any>(sql: string, params?: any[]): Promise<T[]>;

  /**
   * Execute an INSERT, UPDATE, or DELETE statement.
   *
   * @param sql - The SQL statement
   * @param params - Optional statement parameters for prepared statements
   * @returns Object containing number of affected rows and optional insert ID
   */
  abstract execute(sql: string, params?: any[]): Promise<{ affectedRows: number; insertId?: number }>;

  /**
   * Execute a transaction with the provided callback function.
   * The callback receives a connection object specific to the database implementation.
   * If the callback throws, the transaction is rolled back.
   *
   * @param fn - Callback function to execute within the transaction
   * @returns The result returned by the callback function
   */
  abstract transaction<T>(fn: (conn: any) => Promise<T>): Promise<T>;

  /**
   * Close the database connection and clean up resources.
   * Safe to call multiple times.
   */
  abstract close(): Promise<void>;
}

export default BaseSQL;
