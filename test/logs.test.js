// -----------------------------------------------------------------------------
// What the container writes at the default level (info): the life of the
// devices and of Gladys, never one line per reading, and a repeated failure
// once. Also: the hub reads the devices by its own timer, without onPoll.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GladysApiError } from '@gladysassistant/integration-sdk';
import { FEATURE_KEYS } from '../src/devices.js';
import { COLOR_BULB, FakeWiz, createAll, createWorld, featureId } from './helpers/world.js';

const MAC = 'a8bb50000001'; // COLOR_BULB

/** Everything written on stdout and stderr while `fn` runs, at LOG_LEVEL=info. */
async function capture(t, fn) {
  const lines = [];
  const level = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  const write = (chunk) => {
    lines.push(...String(chunk).split('\n').filter(Boolean));
    return true;
  };
  const stdout = t.mock.method(process.stdout, 'write', write);
  const stderr = t.mock.method(process.stderr, 'write', write);
  try {
    await fn();
  } finally {
    stdout.mock.restore();
    stderr.mock.restore();
    process.env.LOG_LEVEL = level;
  }
  return lines;
}

async function createdWorld(t, options) {
  const world = await createWorld(options);
  t.after(() => world.app.stop());
  await createAll(world);
  return world;
}

const lastState = (world, key) => world.fake.lastState(featureId(world.gladys, MAC, key));

test('logs: normal readings, with changes, write nothing at the info level', async (t) => {
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const world = await createdWorld(t, { devices: [bulb] });
  const lines = await capture(t, async () => {
    for (const dimming of [20, 40, 60, 60]) {
      bulb.pilot.dimming = dimming;
      await world.hub.pollAll();
    }
    await world.hub.rediscover();
    await world.hub.idle();
  });
  assert.equal(lastState(world, FEATURE_KEYS.BRIGHTNESS), 60);
  assert.deepEqual(lines, []);
});

test('logs: Gladys refusing the states at every reading is said once, and its return once', async (t) => {
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const world = await createdWorld(t, { devices: [bulb] });
  const refusal = t.mock.method(world.gladys, 'publishChangedStates', async () => {
    throw new GladysApiError(503, 'SERVICE_UNAVAILABLE', 'Gladys is restarting');
  });
  const failing = await capture(t, async () => {
    for (const dimming of [20, 30, 40, 50]) {
      bulb.pilot.dimming = dimming;
      await world.hub.pollAll();
    }
    await world.hub.idle();
  });
  assert.equal(failing.length, 1, failing.join('\n'));
  assert.match(failing[0], /\[WARN\].*Gladys does not take the WiZ updates: Gladys is restarting/);

  refusal.mock.restore();
  const back = await capture(t, async () => {
    await world.hub.pollAll();
    await world.hub.pollAll();
  });
  assert.equal(back.length, 1, back.join('\n'));
  assert.match(back[0], /\[INFO\].*Gladys takes the WiZ updates again/);
  assert.equal(lastState(world, FEATURE_KEYS.BRIGHTNESS), 50);
});

test('logs: a device answering errors is said once per device, and its return once', async (t) => {
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const world = await createdWorld(t, { devices: [bulb] });
  const handle = bulb.handle.bind(bulb);
  bulb.handle = (request) =>
    request.method === 'getPilot'
      ? { method: 'getPilot', env: 'pro', error: { code: -32000, message: 'Busy' } }
      : handle(request);
  const failing = await capture(t, async () => {
    for (let poll = 0; poll < 4; poll += 1) {
      await world.hub.pollAll();
    }
  });
  assert.equal(failing.length, 1, failing.join('\n'));
  assert.match(failing[0], /\[WARN\].*Cannot read 192\.0\.2\.10/);

  bulb.handle = handle;
  const back = await capture(t, async () => {
    await world.hub.pollAll();
    await world.hub.pollAll();
  });
  assert.equal(back.length, 1, back.join('\n'));
  assert.match(back[0], /\[INFO\].*reads again/);
});

test('logs: a core without the active scan is said once; a busy scan is not a warning', async (t) => {
  const world = await createdWorld(t);
  const scan = t.mock.method(world.gladys, 'scanNetwork', async () => {
    throw new GladysApiError(403, 'FORBIDDEN', 'network_discovery not declared');
  });
  const refused = await capture(t, async () => {
    for (let round = 0; round < 3; round += 1) {
      await world.hub.track(world.hub.rediscover());
    }
  });
  assert.equal(refused.length, 1, refused.join('\n'));
  assert.match(refused[0], /\[WARN\].*WiZ discovery through Gladys failed/);

  scan.mock.mockImplementation(async () => {
    throw new GladysApiError(429, 'TOO_MANY_REQUESTS', 'A scan ran less than 10 s ago');
  });
  const busy = await capture(t, async () => {
    await world.hub.track(world.hub.rediscover());
  });
  assert.deepEqual(busy, []);
  assert.equal(world.hub.summary().scan, 'busy');
});

test('logs: a bug in a background task is logged with its stack, not hidden', async (t) => {
  const world = await createdWorld(t);
  t.mock.method(world.hub, 'publishTransports', async () => {
    throw new RangeError('a bug');
  });
  const lines = await capture(t, async () => {
    await world.hub.track(world.hub.rediscover());
  });
  const text = lines.join('\n');
  assert.match(text, /\[ERROR\].*Background task failed/);
  assert.match(text, /RangeError: a bug\n\s+at /);
});

test('polling: the hub reads by its own timer, without any onPoll; devices have should_poll false', async (t) => {
  // Only the intervals are simulated: the UDP retries keep their real timers.
  t.mock.timers.enable({ apis: ['setInterval'] });
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const world = await createdWorld(t, { devices: [bulb], timers: true });
  assert.ok(world.fake.discoveredDevices.every((device) => device.should_poll === false));
  const polls = t.mock.method(world.hub, 'refresh');

  bulb.pilot.dimming = 30;
  t.mock.timers.tick(14_000);
  await world.hub.idle();
  assert.equal(polls.mock.callCount(), 0, 'not before the interval');
  t.mock.timers.tick(1_000);
  await world.hub.idle();
  assert.equal(polls.mock.callCount(), 1);
  assert.equal(lastState(world, FEATURE_KEYS.BRIGHTNESS), 30);
});
