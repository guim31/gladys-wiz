// -----------------------------------------------------------------------------
// Where to look for WiZ devices: the replies to a discovery broadcast the
// Gladys core emits for the integration, the addresses typed in the
// configuration, and the addresses already known.
//
// The integration container sits on a bridge network: a broadcast it sent
// would never reach the LAN, and the replies come back in unicast to whoever
// broadcast. So the core broadcasts (mediated `udp-active-broadcast`
// discovery, port declared in the manifest `network_discovery`): the
// integration forges the request, the core relays the raw replies. The MAC
// address in each reply identifies the device whatever address it answers on.
// -----------------------------------------------------------------------------

import { WIZ_PORT } from './wiz/transport.js';
import { normalizeMac } from './wiz/model.js';

export const SCAN_TIMEOUT_SECONDS = 5;

// The request pywizlight broadcasts: a registration with `register: false`
// asks for nothing (no push updates), every WiZ device answers it with its MAC.
export const DISCOVERY_REQUEST = Buffer.from(
  JSON.stringify({
    method: 'registration',
    params: { phoneMac: 'AAAAAAAAAAAA', register: false, phoneIp: '1.2.3.4', id: '1' },
  }),
);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** The broadcast request of a discovery scan (`scanNetwork` options). */
export function scanRequest() {
  return { port: WIZ_PORT, payload: DISCOVERY_REQUEST, timeoutSeconds: SCAN_TIMEOUT_SECONDS };
}

/**
 * Devices that answered a discovery scan: `[{ host, mac }]`, one per MAC.
 * @param {Array} replies raw results `[{ source_ip, source_port, payload_base64 }]`
 */
export function parseScanReplies(replies) {
  const found = new Map();
  for (const reply of Array.isArray(replies) ? replies : []) {
    if (!reply || typeof reply.source_ip !== 'string' || !IPV4.test(reply.source_ip)) {
      continue;
    }
    let decoded;
    try {
      decoded = JSON.parse(Buffer.from(String(reply.payload_base64 ?? ''), 'base64').toString());
    } catch {
      continue;
    }
    const mac = normalizeMac(decoded?.result?.mac);
    if (mac && !found.has(mac)) {
      found.set(mac, { host: reply.source_ip, mac });
    }
  }
  return [...found.values()];
}

/**
 * Run `task` on every item, `limit` at a time; resolves with the results in
 * order (`{ value }` or `{ error }`).
 */
export async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { value: await task(items[index]) };
      } catch (error) {
        results[index] = { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
