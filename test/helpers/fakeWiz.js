// -----------------------------------------------------------------------------
// Fake WiZ devices on a fake UDP network: `createNetwork(bulbs).createSocket`
// replaces `dgram.createSocket` in the transport. Each device answers the
// methods of its fixture (test/fixtures/wiz), applies setPilot like the
// pywizlight fake bulb does, and can be taken offline or made to lose
// datagrams.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { readFileSync, readdirSync } from 'node:fs';

const FIXTURES = new URL('../fixtures/wiz/', import.meta.url);

/** Every fixture, by file name without `.json`. */
export const FIXTURE_NAMES = readdirSync(FIXTURES)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/, ''))
  .sort();

export function loadFixture(name) {
  return JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURES), 'utf8'));
}

export class FakeWiz {
  /**
   * @param {string} fixture name of a fixture file
   * @param {string} host IPv4 address of the device
   */
  constructor(fixture, host) {
    this.fixture = fixture;
    this.host = host;
    this.answers = loadFixture(fixture);
    this.pilot = structuredClone(this.answers.getPilot.result);
    this.mac = this.answers.getSystemConfig.result.mac;
    this.online = true;
    // Datagrams to drop before answering again (UDP loss).
    this.drop = 0;
    this.received = [];
  }

  /** The reply to one request, or null for no reply. */
  handle(request) {
    this.received.push(request);
    if (!this.online) {
      return null;
    }
    if (this.drop > 0) {
      this.drop -= 1;
      return null;
    }
    const { method, params = {} } = request;
    switch (method) {
      case 'getPilot':
        return { method, env: 'pro', result: structuredClone(this.pilot) };
      case 'setPilot':
        Object.assign(this.pilot, params);
        return { method, env: 'pro', result: { success: true } };
      case 'registration':
        return { method, env: 'pro', result: { mac: this.mac, success: true } };
      default: {
        const answer = this.answers[method];
        return answer
          ? structuredClone(answer)
          : { method, env: 'pro', error: { code: -32601, message: 'Method not found' } };
      }
    }
  }

  /** How many requests of a method the device received. */
  count(method) {
    return this.received.filter((request) => request.method === method).length;
  }

  /** The reply to the discovery broadcast, as the Gladys core relays it. */
  scanReply() {
    const reply = this.handle({ method: 'registration', params: { register: false } });
    return reply
      ? {
          source_ip: this.host,
          source_port: 38899,
          payload_base64: Buffer.from(JSON.stringify(reply)).toString('base64'),
        }
      : null;
  }
}

/**
 * A UDP network of fake devices.
 * @param {FakeWiz[]} devices
 */
export function createNetwork(devices) {
  const network = {
    devices,
    sockets: [],
    byHost: (host) => network.devices.find((device) => device.host === host),
    createSocket() {
      const socket = new EventEmitter();
      socket.bind = (port, callback) => setImmediate(callback);
      socket.unref = () => socket;
      socket.closed = false;
      socket.close = () => {
        socket.closed = true;
      };
      socket.send = (data, port, host, callback) => {
        setImmediate(() => callback?.(null));
        const device = network.byHost(host);
        if (!device || port !== 38899) {
          return;
        }
        const reply = device.handle(JSON.parse(data.toString()));
        if (reply) {
          setImmediate(() => {
            if (!socket.closed) {
              socket.emit('message', Buffer.from(JSON.stringify(reply)), {
                address: host,
                port: 38899,
              });
            }
          });
        }
      };
      network.sockets.push(socket);
      return socket;
    },
    /** What the Gladys core would relay for a discovery broadcast. */
    scanReplies: () => network.devices.map((device) => device.scanReply()).filter(Boolean),
  };
  return network;
}
