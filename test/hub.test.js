// -----------------------------------------------------------------------------
// The hub against fake WiZ devices and the SDK's fake Gladys: discovery,
// polling, commands, reachability, the scene trigger, persistence.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GladysApiError } from '@gladysassistant/integration-sdk';
import { FEATURE_KEYS, NO_SCENE } from '../src/devices.js';
import { DISCOVERY_REQUEST } from '../src/discovery.js';
import { SOURCES, TRIGGER, WIDGET_KEY } from '../src/hub.js';
import {
  COLOR_BULB,
  FILAMENT_BULB,
  FakeWiz,
  METER_SOCKET,
  TUNABLE_BULB,
  createAll,
  createWorld,
  deviceId,
  featureId,
} from './helpers/world.js';

const MAC = 'a8bb50000001'; // COLOR_BULB

async function createdWorld(options) {
  const world = await createWorld(options);
  await createAll(world);
  return world;
}

const lastState = (world, key, mac = MAC) =>
  world.fake.lastState(featureId(world.gladys, mac, key));

test('discovery: the core broadcasts the WiZ request on port 38899, the MAC identifies the device', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const [scan] = world.fake.scans;
  assert.equal(scan.type, 'udp-active-broadcast');
  assert.equal(scan.port, 38899);
  assert.equal(Buffer.from(scan.payload_base64, 'base64').toString(), DISCOVERY_REQUEST.toString());
  assert.ok(DISCOVERY_REQUEST.length <= 512);

  const [device] = world.fake.discoveredDevices;
  assert.equal(device.external_id, deviceId(world.gladys, MAC));
  assert.equal(device.model, 'ESP01_SHRGB_03');
  assert.equal(device.should_poll, false);
  assert.deepEqual(device.params, [
    { name: 'IP_ADDRESS', value: '192.0.2.10' },
    { name: 'MAC_ADDRESS', value: MAC },
    { name: 'FIRMWARE', value: '1.25.0' },
  ]);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
});

test('discovery: a typed address is enough when the scan finds nothing', async (t) => {
  const world = await createWorld({
    devices: [new FakeWiz(TUNABLE_BULB, '192.0.2.20')],
    scan: false,
    config: { hosts: '192.0.2.20, 300.1.1.1' },
  });
  t.after(() => world.app.stop());
  assert.equal(world.fake.discoveredDevices.length, 1);
  assert.equal(world.hub.summary().invalidHosts[0], '300.1.1.1');
});

test('discovery: a core without the active scan leaves the typed addresses working', async (t) => {
  const world = await createWorld({ connect: false, scan: false, config: { hosts: '192.0.2.10' } });
  t.mock.method(world.gladys, 'scanNetwork', async () => {
    throw new GladysApiError(403, 'FORBIDDEN', 'network_discovery not declared');
  });
  await world.gladys.connect();
  await world.app.ready;
  t.after(() => world.app.stop());
  assert.equal(world.fake.discoveredDevices.length, 1);
  assert.equal(world.hub.summary().scan, 'unavailable');
});

test('discovery: a device found at a new address (DHCP) moves, without a new device', async (t) => {
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const world = await createdWorld({ devices: [bulb] });
  t.after(() => world.app.stop());
  bulb.host = '192.0.2.99';
  world.fake.scanResults['udp-active-broadcast'] = world.network.scanReplies();
  await world.fake.scanRequest();
  const devices = world.fake.discoveredDevices;
  assert.equal(devices.length, 1);
  assert.equal(devices[0].params[0].value, '192.0.2.99');
});

test('discovery: an unknown kind of device is left out, the others are published', async (t) => {
  const odd = new FakeWiz(COLOR_BULB, '192.0.2.30');
  odd.answers.getSystemConfig.result = {
    ...odd.answers.getSystemConfig.result,
    mac: 'a8bb500000ff',
    moduleName: 'INVALID',
  };
  odd.mac = 'a8bb500000ff';
  const world = await createWorld({ devices: [new FakeWiz(COLOR_BULB, '192.0.2.10'), odd] });
  t.after(() => world.app.stop());
  assert.equal(world.fake.discoveredDevices.length, 1);
});

test('states: every value is published once the device is created, then only the changes', async (t) => {
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const world = await createWorld({ devices: [bulb] });
  t.after(() => world.app.stop());
  assert.equal(world.fake.states.length, 0, 'nothing for a device not created yet');

  await createAll(world);
  assert.equal(lastState(world, FEATURE_KEYS.POWER), 1);
  assert.equal(lastState(world, FEATURE_KEYS.BRIGHTNESS), 100);
  assert.equal(lastState(world, FEATURE_KEYS.COLOR), 0x0000ff);
  assert.equal(lastState(world, FEATURE_KEYS.SCENE), NO_SCENE);
  assert.ok(world.fake.widgetRefreshes.includes(WIDGET_KEY));
  assert.deepEqual(world.fake.transports.at(-1), {
    device_external_id: deviceId(world.gladys, MAC),
    transport: 'local',
  });

  const count = world.fake.states.length;
  await world.hub.pollAll();
  assert.equal(world.fake.states.length, count, 'no change, nothing sent');

  bulb.pilot.dimming = 40;
  await world.hub.pollAll();
  assert.equal(world.fake.states.length, count + 1);
  assert.equal(lastState(world, FEATURE_KEYS.BRIGHTNESS), 40);
});

test('states: a white, a scene and its speed, a plug meter', async (t) => {
  const tunable = new FakeWiz(TUNABLE_BULB, '192.0.2.11');
  const socket = new FakeWiz(METER_SOCKET, '192.0.2.12');
  const world = await createdWorld({ devices: [tunable, socket] });
  t.after(() => world.app.stop());
  const tw = tunable.mac;
  assert.equal(lastState(world, FEATURE_KEYS.TEMPERATURE, tw), 3000);
  assert.equal(world.fake.lastState(featureId(world.gladys, tw, FEATURE_KEYS.COLOR)), undefined);

  tunable.pilot = { ...tunable.pilot, sceneId: 16, speed: 150, temp: undefined };
  await world.hub.pollAll();
  assert.equal(lastState(world, FEATURE_KEYS.SCENE, tw), '16');
  assert.equal(lastState(world, FEATURE_KEYS.SPEED, tw), 150);

  assert.equal(lastState(world, FEATURE_KEYS.POWER_DRAW, socket.mac), 1065.4);
  assert.equal(lastState(world, FEATURE_KEYS.POWER, socket.mac), 1);
});

test('commands: on/off, brightness, colour, white, scene and speed reach the device', async (t) => {
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const world = await createdWorld({ devices: [bulb] });
  t.after(() => world.app.stop());
  const device = world.gladys.devices[0];
  const set = async (key, value) => {
    const ack = await world.fake.setValue(
      device,
      { external_id: featureId(world.gladys, MAC, key) },
      value,
    );
    assert.equal(ack.success, true, `${key}: ${ack.error}`);
    return bulb.received.filter((request) => request.method === 'setPilot').at(-1)?.params;
  };

  assert.deepEqual(await set(FEATURE_KEYS.POWER, 0), { state: false });
  assert.equal(lastState(world, FEATURE_KEYS.POWER), 0);

  assert.deepEqual(await set(FEATURE_KEYS.BRIGHTNESS, 5), { state: true, dimming: 10 });
  assert.equal(lastState(world, FEATURE_KEYS.POWER), 1);
  assert.deepEqual(await set(FEATURE_KEYS.BRIGHTNESS, 0), { state: false });

  // pywizlight's conversion: orange is its hue plus warm white.
  assert.deepEqual(await set(FEATURE_KEYS.COLOR, 0xff8000), {
    state: true,
    r: 255,
    g: 128,
    b: 0,
    c: 0,
    w: 34,
  });
  // The colour Gladys sent is shown back, not its approximate reverse.
  await world.hub.pollAll();
  assert.equal(lastState(world, FEATURE_KEYS.COLOR), 0xff8000);

  assert.deepEqual(await set(FEATURE_KEYS.TEMPERATURE, 9000), { state: true, temp: 6500 });
  assert.equal(lastState(world, FEATURE_KEYS.TEMPERATURE), 6500);

  assert.deepEqual(await set(FEATURE_KEYS.SCENE, '1'), { state: true, sceneId: 1 });
  assert.equal(lastState(world, FEATURE_KEYS.SCENE), '1');
  assert.deepEqual(await set(FEATURE_KEYS.SPEED, 250), { speed: 200 });

  const before = bulb.count('setPilot');
  await set(FEATURE_KEYS.SCENE, NO_SCENE);
  assert.equal(bulb.count('setPilot'), before, '"None" sends nothing');
  assert.equal(lastState(world, FEATURE_KEYS.SCENE), '1', 'and shows the real scene back');

  const refused = await world.fake.setValue(
    device,
    { external_id: featureId(world.gladys, MAC, FEATURE_KEYS.SCENE) },
    '999',
  );
  assert.equal(refused.success, false);
});

test('commands: a scene a filament bulb cannot run is refused', async (t) => {
  const bulb = new FakeWiz(FILAMENT_BULB, '192.0.2.10');
  const world = await createdWorld({ devices: [bulb] });
  t.after(() => world.app.stop());
  await assert.rejects(
    world.hub.startScene(deviceId(world.gladys, bulb.mac), { scene: 'Party' }),
    /cannot run/,
  );
  const scene = await world.hub.startScene(deviceId(world.gladys, bulb.mac), {
    scene: 'veilleuse',
    brightness: 30,
  });
  assert.equal(scene.id, 14);
  assert.deepEqual(bulb.received.at(-1).params, { state: true, sceneId: 14, dimming: 30 });
});

test('commands: a device that does not answer fails the command and turns unreachable', async (t) => {
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const world = await createdWorld({ devices: [bulb], timings: { unreachableAfter: 1 } });
  t.after(() => world.app.stop());
  bulb.online = false;
  const ack = await world.fake.setValue(
    world.gladys.devices[0],
    { external_id: featureId(world.gladys, MAC, FEATURE_KEYS.POWER) },
    0,
  );
  assert.equal(ack.success, false);
  assert.match(ack.error, /does not answer/);
  assert.equal(world.fake.transports.at(-1).transport, 'unreachable');
});

test('a lost datagram is sent again', async (t) => {
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const world = await createdWorld({ devices: [bulb] });
  t.after(() => world.app.stop());
  bulb.drop = 1;
  bulb.pilot.dimming = 20;
  await world.hub.pollAll();
  assert.equal(lastState(world, FEATURE_KEYS.BRIGHTNESS), 20);
});

test('trigger: a light switched from the WiZ app fires once, a Gladys command never', async (t) => {
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const world = await createdWorld({ devices: [bulb] });
  t.after(() => world.app.stop());
  bulb.pilot.state = false;
  await world.hub.pollAll();
  await world.hub.pollAll();
  await world.hub.idle();
  assert.deepEqual(world.fake.sceneEvents, [
    {
      key: TRIGGER,
      data: { device: deviceId(world.gladys, MAC), state: 'off', source: SOURCES.WIZ },
    },
  ]);

  await world.fake.setValue(
    world.gladys.devices[0],
    { external_id: featureId(world.gladys, MAC, FEATURE_KEYS.POWER) },
    1,
  );
  await world.hub.pollAll();
  await world.hub.idle();
  assert.equal(world.fake.sceneEvents.length, 1, 'no event for a Gladys command');
});

test('trigger: a wall switch cuts the power, then gives it back', async (t) => {
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const world = await createdWorld({ devices: [bulb] });
  t.after(() => world.app.stop());
  bulb.online = false;
  await world.hub.pollAll();
  assert.equal(world.fake.transports.at(-1).transport, 'local', 'one silent poll is not enough');
  await world.hub.pollAll();
  await world.hub.idle();
  assert.equal(world.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(lastState(world, FEATURE_KEYS.POWER), 0, 'a light without power is off');
  assert.deepEqual(world.fake.connectionStatus.connected, false);

  // Powered again: WiZ lights come back on.
  bulb.online = true;
  await world.hub.pollAll();
  await world.hub.idle();
  assert.equal(lastState(world, FEATURE_KEYS.POWER), 1);
  assert.equal(world.fake.transports.at(-1).transport, 'local');
  assert.deepEqual(
    world.fake.sceneEvents.map((event) => [event.data.state, event.data.source]),
    [
      ['off', SOURCES.POWER],
      ['on', SOURCES.POWER],
    ],
  );
});

test('trigger: nothing fires for a device the user has not created', async (t) => {
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const world = await createWorld({ devices: [bulb] });
  t.after(() => world.app.stop());
  bulb.pilot.state = false;
  await world.hub.pollAll();
  await world.hub.idle();
  assert.deepEqual(world.fake.sceneEvents, []);
});

test('a reading started before a command is dropped', async (t) => {
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const world = await createdWorld({ devices: [bulb] });
  t.after(() => world.app.stop());
  const record = world.hub.records.get(MAC);
  // The poll leaves first, the command lands while it waits for its answer.
  const polling = world.hub.refresh(record);
  record.commandSeq += 1;
  bulb.pilot.state = false;
  await polling;
  await world.hub.idle();
  assert.deepEqual(world.fake.sceneEvents, []);
  assert.equal(lastState(world, FEATURE_KEYS.POWER), 1);
});

test('the devices known from /data are published at once, unreachable until they answer', async (t) => {
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const first = await createdWorld({ devices: [bulb] });
  await first.app.stop();

  bulb.online = false;
  const created = first.gladys.devices;
  const second = await createWorld({
    devices: [bulb],
    dataDir: first.dataDir,
    created,
    scan: false,
  });
  t.after(() => second.app.stop());
  assert.equal(second.fake.discoveredDevices.length, 1);
  assert.equal(second.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(second.fake.connectionStatus.connected, false);
  assert.deepEqual(second.fake.sceneEvents, []);
  assert.equal(bulb.count('getModelConfig'), 1, 'the model is not asked again');

  bulb.online = true;
  await second.hub.pollAll();
  await second.hub.idle();
  assert.equal(second.fake.transports.at(-1).transport, 'local');
  assert.deepEqual(
    second.fake.sceneEvents.map((event) => event.data.source),
    [SOURCES.POWER],
  );
});

test('a Gladys restart re-sends every state', async (t) => {
  const world = await createdWorld();
  t.after(() => world.app.stop());
  const count = world.fake.states.length;
  await world.gladys.disconnect();
  await world.gladys.connect();
  assert.ok(world.fake.states.length >= count * 2);
});

test('no WiZ device at all: the configuration screen says so', async (t) => {
  const world = await createWorld({ devices: [] });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /Aucun appareil WiZ/);
});

test('the search action reports the devices in four languages', async (t) => {
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const world = await createWorld({ devices: [bulb, new FakeWiz(METER_SOCKET, '192.0.2.12')] });
  t.after(() => world.app.stop());
  const ack = await world.fake.action('search', {});
  assert.equal(ack.success, true);
  assert.match(
    ack.data.message.en,
    /2 device\(s\), 2 answering: WiZ color 000001 \(192\.0\.2\.10, ESP01_SHRGB_03\)/,
  );
  assert.match(ack.data.message.fr, /2 appareil\(s\), 2 répondent : WiZ couleur 000001/);
});

test('changing the refresh interval or the language needs no restart', async (t) => {
  const world = await createdWorld({ config: { language: 'en' } });
  t.after(() => world.app.stop());
  await world.fake.configUpdated({ language: 'de', poll_interval: '30' });
  assert.equal(world.hub.config.pollSeconds, 30);
  assert.match(world.fake.discoveredDevices[0].name, /^WiZ Farbe/);
});
