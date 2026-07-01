const fs = require('fs-extra');
const path = require('upath');
const cluster = require('cluster');

/**
 * PersistentLogger - Multi-process safe file logger
 *
 * Features:
 * - Supports both cluster workers and independent child processes
 * - IPC-based routing for cluster workers (guarantees zero interleaving)
 * - Atomic append mode for independent processes
 * - Custom filename and path support
 * - No file locks or corruption between processes
 *
 * @example
 * const { PersistentLogger } = require('./logs.cjs');
 * const logger = new PersistentLogger('./app.log');
 * logger.log('Hello from process!');
 */
class PersistentLogger {
  /**
   * @param {string} filename - Path to log file (relative or absolute)
   */
  constructor(filename) {
    this.filePath = path.resolve(filename);
    this.logStream = null;

    // If we are the primary process in a cluster, set up IPC message handler
    if (cluster.isPrimary || cluster.isMaster) {
      this._initializePrimaryHandler();
    }
  }

  /**
   * Initialize the primary process to handle log messages from workers
   * @private
   */
  _initializePrimaryHandler() {
    // Only set up once globally since cluster is a singleton EventEmitter
    if (!PersistentLogger._primaryHandlerInitialized) {
      cluster.on('message', (worker, message) => {
        if (message && message.type === 'PERSISTENT_LOG' && message.filePath === this.filePath) {
          this._writeToFile(message.payload);
        }
      });
      PersistentLogger._primaryHandlerInitialized = true;
    }
  }

  static _primaryHandlerInitialized = false;

  /**
   * Write data directly to file (primary process only)
   * @private
   * @param {string} data - Log line to write
   */
  _writeToFile(data) {
    try {
      // Ensure the directory exists
      fs.ensureDirSync(path.dirname(this.filePath));
      // Use append mode with synchronous write to ensure atomicity
      fs.appendFileSync(this.filePath, data, { flag: 'a', encoding: 'utf8' });
    } catch (error) {
      console.error(`[PersistentLogger] Failed to write to ${this.filePath}:`, error.message);
    }
  }

  /**
   * Log a message to file
   * - In cluster primary: writes directly
   * - In cluster worker: sends via IPC to primary
   * - In independent process: writes directly with atomic append
   *
   * @param {string} message - Message to log
   * @param {{ console?: boolean, timestamp?: boolean }} [options]
   * @param {boolean} [options.console=false] - Also log to console.log
   * @param {boolean} [options.timestamp=true] - Include timestamp prefix
   * @returns {Promise<void>}
   */
  async log(message, options = {}) {
    const { console: consoleOutput = false, timestamp: includeTimestamp = true } = options;
    const timestamp = includeTimestamp ? new Date().toISOString() : null;
    const logLine = timestamp
      ? `[${timestamp}] [PID:${process.pid}] ${message}\n`
      : `[PID:${process.pid}] ${message}\n`;

    if (consoleOutput) {
      console.log(message);
    }

    if (cluster.isWorker) {
      // Worker process: send to primary via IPC
      if (process.send) {
        process.send({
          type: 'PERSISTENT_LOG',
          filePath: this.filePath,
          payload: logLine
        });
      } else {
        // Fallback if IPC is not available (shouldn't happen in normal cluster usage)
        this._writeToFile(logLine);
      }
    } else {
      // Primary process or independent process: write directly
      this._writeToFile(logLine);
    }
  }

  /**
   * Synchronous version of log (useful for process exit handlers)
   * @param {string} message - Message to log
   * @param {{ console?: boolean, timestamp?: boolean }} [options]
   * @param {boolean} [options.console=false] - Also log to console.log
   * @param {boolean} [options.timestamp=true] - Include timestamp prefix
   */
  logSync(message, options = {}) {
    const { console: consoleOutput = false, timestamp: includeTimestamp = true } = options;
    const timestamp = includeTimestamp ? new Date().toISOString() : null;
    const logLine = timestamp
      ? `[${timestamp}] [PID:${process.pid}] ${message}\n`
      : `[PID:${process.pid}] ${message}\n`;

    if (consoleOutput) {
      console.log(message);
    }

    if (cluster.isWorker && process.send) {
      // For workers, we still try IPC but don't wait
      process.send({
        type: 'PERSISTENT_LOG',
        filePath: this.filePath,
        payload: logLine
      });
    } else {
      this._writeToFile(logLine);
    }
  }

  /**
   * Reset/clear the log file
   * Useful for clearing logs on application startup
   */
  reset() {
    try {
      // Ensure the directory exists
      fs.ensureDirSync(path.dirname(this.filePath));
      // Truncate the file (creates if doesn't exist)
      fs.writeFileSync(this.filePath, '', { encoding: 'utf8' });
    } catch (error) {
      console.error(`[PersistentLogger] Failed to reset ${this.filePath}:`, error.message);
    }
  }

  /**
   * Close the log stream (if using stream mode)
   * Call this on graceful shutdown
   */
  close() {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}

/**
 * Create a logger instance with custom path
 * @param {string} filename - Path to log file
 * @returns {PersistentLogger}
 */
function createLogger(filename) {
  return new PersistentLogger(filename);
}

module.exports = {
  PersistentLogger,
  createLogger
};
