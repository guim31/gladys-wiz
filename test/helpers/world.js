// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, fake WiZ devices on a fake UDP
// network, and a temporary /data, with the integration wired on top through
// registerHandlers. No timer runs unless asked: the tests read the devices
// with `world.hub.pollAll()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { FIXTURE_NAMES, FakeWiz, createNetwork } from './fakeWiz.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

// Fast retries: a device that does not answer fails in 60 ms.
export const FAST_TRANSPORT = {
  timeoutMs: 60,
  commandTimeoutMs: 60,
  firstRetryMs: 20,
  maxRetryMs: 20,
};

export const COLOR_BULB = 'color-bulb-esp01-shrgb-03-1.25.0';
export const TUNABLE_BULB = 'tunable-white-esp21-shtw-01-1.25.0';
export const FILAMENT_BULB = 'filament-esp05-shdw-21-1.25.0';
export const METER_SOCKET = 'socket-meter-esp25-socket-01-1.26.2';

/** One fake device per fixture, at 192.0.2.10, .11... */
export function allDevices() {
  return FIXTURE_NAMES.map((name, index) => new FakeWiz(name, `192.0.2.${10 + index}`));
}

/**
 * @param {object} [options]
 * @param {FakeWiz[]} [options.devices] the fake devices of the network
 * @param {boolean} [options.scan] whether the core's discovery finds them
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.created] devices already created in Gladys
 * @param {boolean} [options.timers] the hub's own timers (off: the tests poll)
 */
export async function createWorld({
  devices = [new FakeWiz(COLOR_BULB, '192.0.2.10')],
  scan = true,
  config = { language: 'en' },
  created = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-wiz-')),
  timings = {},
  timers = false,
} = {}) {
  const network = createNetwork(devices);
  const gladys = createFakeGladys({
    config,
    devices: created,
    scanResults: { 'udp-active-broadcast': scan ? network.scanReplies() : [] },
  });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    createSocket: network.createSocket,
    timers,
    timings,
    transportTimings: FAST_TRANSPORT,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, network, app, hub: app.hub, dataDir };
}

export const deviceId = (gladys, mac) => gladys.externalIds('wiz', mac).device;
export const featureId = (gladys, mac, key) => gladys.externalIds('wiz', mac).feature(key);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
  await world.hub.idle();
}

export { FakeWiz };
