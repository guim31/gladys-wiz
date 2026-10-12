// -----------------------------------------------------------------------------
// The WiZ local protocol: JSON datagrams on UDP port 38899, one request, one
// reply from the device ({"method": "getPilot", "params": {}} → {"method":
// "getPilot", "env": "pro", "result": {...}}). No account, no key.
//
// One socket for every device, bound on an ephemeral port: a reply is matched
// on the address it comes from and on its method. UDP loses datagrams, so a
// request is sent again with a growing delay until the reply or the deadline,
// like pywizlight does (the devices answer each copy, late ones are ignored).
// One request at a time per device, so two replies to the same method never
// cross.
// -----------------------------------------------------------------------------

import dgram from 'node:dgram';

export const WIZ_PORT = 38899;

export const TRANSPORT_TIMINGS = {
  // Total wait for a reply (polls, scan probes).
  timeoutMs: 4_000,
  // Commands: the user waits, but a lost datagram should not fail them.
  commandTimeoutMs: 6_000,
  firstRetryMs: 750,
  maxRetryMs: 3_000,
};

// JSON-RPC error a device answers to a method its firmware does not have.
const METHOD_NOT_FOUND = -32601;

export class WizError extends Error {
  /**
   * @param {string} message
   * @param {object} [details]
   * @param {'timeout'|'method-not-found'|'device-error'|'socket'} [details.kind]
   */
  constructor(message, { kind = 'device-error' } = {}) {
    super(message);
    this.name = 'WizError';
    this.kind = kind;
  }

  get unreachable() {
    return this.kind === 'timeout' || this.kind === 'socket';
  }
}

export class WizTransport {
  /**
   * @param {object} [options]
   * @param {() => object} [options.createSocket] test seam: a dgram-like socket
   * @param {number} [options.port] destination port of the devices
   * @param {object} [options.timings] TRANSPORT_TIMINGS overrides
   * @param {object} [options.logger]
   */
  constructor({ createSocket, port = WIZ_PORT, timings, logger } = {}) {
    this.createSocket = createSocket ?? (() => dgram.createSocket('udp4'));
    this.port = port;
    this.timings = { ...TRANSPORT_TIMINGS, ...timings };
    this.logger = logger;
    this.socket = null;
    this.opening = null;
    /** @type {Map<string, { resolve: Function }>} by `${address}|${method}` */
    this.pending = new Map();
    /** @type {Map<string, Promise>} tail of the requests of each device */
    this.queues = new Map();
    this.closed = false;
  }

  /** Bind the socket (once). */
  open() {
    if (this.socket) {
      return Promise.resolve();
    }
    this.opening ??= new Promise((resolve, reject) => {
      const socket = this.createSocket();
      const onError = (err) => {
        this.opening = null;
        reject(new WizError(`Cannot open the UDP socket: ${err.message}`, { kind: 'socket' }));
      };
      socket.once('error', onError);
      socket.on('message', (message, remote) => this.receive(message, remote));
      socket.bind(0, () => {
        socket.off('error', onError);
        socket.on('error', (err) => this.logger?.warn(`UDP socket error: ${err.message}`));
        // Never keep the process alive for the socket alone.
        socket.unref?.();
        this.socket = socket;
        resolve();
      });
    });
    return this.opening;
  }

  close() {
    this.closed = true;
    for (const { resolve } of this.pending.values()) {
      resolve({ closed: true });
    }
    this.pending.clear();
    try {
      this.socket?.close();
    } catch {
      // Already closed.
    }
    this.socket = null;
    this.opening = null;
  }

  receive(message, remote) {
    let decoded;
    try {
      decoded = JSON.parse(message.toString('utf8'));
    } catch {
      this.logger?.debug(`Ignored a datagram that is not JSON from ${remote?.address}`);
      return;
    }
    if (!decoded || typeof decoded !== 'object' || typeof decoded.method !== 'string') {
      return;
    }
    const key = `${remote.address}|${decoded.method}`;
    const waiting = this.pending.get(key);
    if (waiting) {
      this.pending.delete(key);
      waiting.resolve({ reply: decoded });
    }
  }

  /**
   * Send one request to a device and resolve with its `result`.
   * @param {string} host IPv4 address of the device
   * @param {string} method e.g. 'getPilot'
   * @param {object} [params]
   * @param {{ timeoutMs?: number }} [options]
   * @returns {Promise<object>} the `result` object of the reply
   */
  request(host, method, params = {}, options = {}) {
    const previous = this.queues.get(host) ?? Promise.resolve();
    const run = previous.then(() => this.exchange(host, method, params, options));
    const tail = run.catch(() => {});
    this.queues.set(host, tail);
    tail.then(() => {
      if (this.queues.get(host) === tail) {
        this.queues.delete(host);
      }
    });
    return run;
  }

  async exchange(host, method, params, { timeoutMs = this.timings.timeoutMs } = {}) {
    if (this.closed) {
      throw new WizError('The integration is stopping', { kind: 'socket' });
    }
    await this.open();
    const data = Buffer.from(JSON.stringify({ method, params }));
    const key = `${host}|${method}`;
    let retryTimer = null;
    let deadline = null;
    let entry = null;
    const outcome = await new Promise((resolve) => {
      entry = { resolve };
      this.pending.set(key, entry);
      let delay = this.timings.firstRetryMs;
      const send = () => {
        this.socket?.send(data, this.port, host, (err) => {
          if (err) {
            this.logger?.debug(`Cannot send ${method} to ${host}: ${err.message}`);
          }
        });
        retryTimer = setTimeout(send, delay);
        delay = Math.min(delay * 2, this.timings.maxRetryMs);
      };
      deadline = setTimeout(() => resolve({ timeout: true }), timeoutMs);
      send();
    });
    clearTimeout(retryTimer);
    clearTimeout(deadline);
    if (this.pending.get(key) === entry) {
      this.pending.delete(key);
    }
    if (outcome.closed) {
      throw new WizError('The integration is stopping', { kind: 'socket' });
    }
    if (outcome.timeout) {
      throw new WizError(`${host} did not answer ${method}`, { kind: 'timeout' });
    }
    const { reply } = outcome;
    if (reply.error) {
      const notFound = reply.error.code === METHOD_NOT_FOUND;
      throw new WizError(
        `${host} answered ${method} with an error: ${reply.error.message ?? reply.error.code}`,
        { kind: notFound ? 'method-not-found' : 'device-error' },
      );
    }
    return reply.result && typeof reply.result === 'object' ? reply.result : {};
  }
}
