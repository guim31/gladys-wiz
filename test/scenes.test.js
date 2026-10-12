// -----------------------------------------------------------------------------
// The `start_scene` scene action, as the core relays it: resolved fields,
// declared outputs, errors that fail the action only.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLOR_BULB,
  FakeWiz,
  METER_SOCKET,
  TUNABLE_BULB,
  createAll,
  createWorld,
  deviceId,
} from './helpers/world.js';

async function setup(devices, config) {
  const world = await createWorld({ devices, config });
  await createAll(world);
  return world;
}

test('starts a scene with its brightness and speed, then answers its id and name', async (t) => {
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const world = await setup([bulb], { language: 'fr' });
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('start_scene', {
    device: deviceId(world.gladys, bulb.mac),
    scene: '3',
    brightness: 50,
    speed: 80,
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { scene_id: 3, scene_name: 'Coucher de soleil' });
  const sent = bulb.received.filter((request) => request.method === 'setPilot');
  // The speed goes alone: the firmware ignores it next to a state.
  assert.deepEqual(
    sent.map((request) => request.params),
    [{ state: true, sceneId: 3, dimming: 50 }, { speed: 80 }],
  );
});

test('optional fields left empty send the scene alone', async (t) => {
  const bulb = new FakeWiz(TUNABLE_BULB, '192.0.2.10');
  const world = await setup([bulb]);
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('start_scene', {
    device: deviceId(world.gladys, bulb.mac),
    scene: '11',
    brightness: null,
    speed: '',
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(bulb.received.at(-1).params, { state: true, sceneId: 11 });
});

test('a scene the light cannot run, a plug, an unknown device fail the action', async (t) => {
  const bulb = new FakeWiz(TUNABLE_BULB, '192.0.2.10');
  const socket = new FakeWiz(METER_SOCKET, '192.0.2.11');
  const world = await setup([bulb, socket]);
  t.after(() => world.app.stop());
  const run = (device, scene) =>
    world.fake.sceneAction('start_scene', { device: deviceId(world.gladys, device), scene });
  assert.match((await run(bulb.mac, '4')).error, /cannot run the scene "Party"/);
  assert.match((await run(socket.mac, '11')).error, /cannot run/);
  assert.match((await run('a8bb50ffffff', '11')).error, /Unknown WiZ device/);
  assert.match((await run(bulb.mac, '999')).error, /Unknown WiZ scene/);
});
