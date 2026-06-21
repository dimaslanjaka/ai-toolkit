const { writefile, readfile } = require('sbg-utility');
const path = require('upath');
const net = require('net');
const fs = require('fs-extra');

const STATE_FILE = path.join(process.cwd(), 'tmp/database/openai-server.json');

/**
 * @typedef {object} ServerState
 * @property {number} port - The port the server is running on.
 * @property {number} pid - The process ID of the server.
 * @property {string} startedAt - The ISO string of when the server started.
 * @property {string} url - The URL of the server.
 * @property {import('net').Server} [server] - The server instance (optional).
 */

/**
 * Save server state to a persistent file (excludes server instance)
 * @param {ServerState} state - The server state to save.
 */
function saveServerState(state) {
  const { server: _server, ...serializableState } = state;
  writefile(STATE_FILE, JSON.stringify(serializableState, null, 2));
}

/**
 * Read server state from the persistent file.
 * Automatically deletes the state file if the port is unreachable.
 * @returns {Promise<ServerState | null>} The server state, or null if not found, not reachable, or an error occurred.
 */
async function getServerState() {
  try {
    const content = readfile(STATE_FILE);
    if (!content) return null;
    /** @type {ServerState} */
    const state = JSON.parse(content);

    // Auto-delete if the port is unreachable
    if (state && state.port) {
      const reachable = await checkServerPort({ port: state.port });
      if (!reachable) {
        if (fs.existsSync(STATE_FILE)) {
          fs.unlinkSync(STATE_FILE);
        }
        return null;
      }
    }

    return state;
  } catch {
    return null;
  }
}

/**
 * Check if a TCP port is reachable on a host.
 *
 * This performs a low-level TCP connection test. It does NOT validate HTTP/HTTPS response,
 * only whether the port is accepting connections.
 *
 * @param {Object} options
 * @param {string} [options.host="127.0.0.1"] - Target host (e.g. localhost, 127.0.0.1, or remote IP)
 * @param {number} options.port - Port number to check
 * @param {number} [options.timeout=1000] - Timeout in milliseconds before failing
 * @returns {Promise<boolean>} Resolves true if port is reachable, false otherwise
 *
 * @example
 * checkServerPort({ host: "localhost", port: 5758 })
 *   .then(console.log); // true or false
 */
function checkServerPort({ host = '127.0.0.1', port, timeout = 1000 }) {
  if (!port) {
    throw new Error('port is required');
  }

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);

    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));

    socket.connect(port, host);
  });
}

module.exports = { getServerState, saveServerState, checkServerPort };
