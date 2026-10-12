// -----------------------------------------------------------------------------
// The UDP transport, on the fake network: replies matched by address and
// method, datagrams sent again until answered, errors of the protocol.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WizError, WizTransport } from '../src/wiz/transport.js';
import { FakeWiz, createNetwork } from './helpers/fakeWiz.js';
import { COLOR_BULB, FAST_TRANSPORT } from './helpers/world.js';

function setup(devices = [new FakeWiz(COLOR_BULB, '192.0.2.10')]) {
  const network = createNetwork(devices);
  const transport = new WizTransport({
    createSocket: network.createSocket,
    timings: FAST_TRANSPORT,
  });
  return { network, transport, device: devices[0] };
}

test('a request resolves with the result of the reply', async (t) => {
  const { transport, device } = setup();
  t.after(() => transport.close());
  const result = await transport.request('192.0.2.10', 'getSystemConfig');
  assert.equal(result.moduleName, 'ESP01_SHRGB_03');
  assert.deepEqual(device.received, [{ method: 'getSystemConfig', params: {} }]);
});

test('a lost datagram is sent again until the device answers', async (t) => {
  const { transport, device } = setup();
  device.drop = 2;
  const transportSlow = new WizTransport({
    createSocket: () => transport.createSocket(),
    timings: { ...FAST_TRANSPORT, timeoutMs: 500 },
  });
  t.after(() => transportSlow.close());
  const pilot = await transportSlow.request('192.0.2.10', 'getPilot');
  assert.equal(pilot.state, true);
  assert.equal(device.count('getPilot'), 3);
});

test('a device that never answers times out as unreachable', async (t) => {
  const { transport, device } = setup();
  t.after(() => transport.close());
  device.online = false;
  await assert.rejects(transport.request('192.0.2.10', 'getPilot'), (err) => {
    assert.ok(err instanceof WizError);
    assert.equal(err.kind, 'timeout');
    assert.equal(err.unreachable, true);
    return true;
  });
  await assert.rejects(transport.request('192.0.2.99', 'getPilot'), /did not answer/);
});

test('an older firmware without the method answers "Method not found"', async (t) => {
  const { transport } = setup([new FakeWiz('tunable-white-esp05-shtw-21-1.10.0', '192.0.2.10')]);
  t.after(() => transport.close());
  await assert.rejects(transport.request('192.0.2.10', 'getModelConfig'), (err) => {
    assert.equal(err.kind, 'method-not-found');
    assert.equal(err.unreachable, false);
    return true;
  });
});

test('a device error is reported, not taken for a timeout', async (t) => {
  const { transport, device } = setup();
  t.after(() => transport.close());
  device.answers.getUserConfig = {
    method: 'getUserConfig',
    env: 'pro',
    error: { code: -32602, message: 'Invalid params' },
  };
  await assert.rejects(transport.request('192.0.2.10', 'getUserConfig'), (err) => {
    assert.equal(err.kind, 'device-error');
    assert.match(err.message, /Invalid params/);
    return true;
  });
});

test('garbage, other addresses and other methods are ignored', async (t) => {
  const { transport } = setup();
  t.after(() => transport.close());
  await transport.open();
  const waiting = transport.request('192.0.2.10', 'getPilot');
  transport.receive(Buffer.from('not json'), { address: '192.0.2.10' });
  transport.receive(Buffer.from('{"method":"getPilot","result":{"state":false}}'), {
    address: '192.0.2.11',
  });
  transport.receive(Buffer.from('{"method":"getSystemConfig","result":{}}'), {
    address: '192.0.2.10',
  });
  assert.equal((await waiting).state, true);
});

test('one request at a time per device, in order', async (t) => {
  const { transport, device } = setup();
  t.after(() => transport.close());
  const results = await Promise.all([
    transport.request('192.0.2.10', 'setPilot', { state: false }),
    transport.request('192.0.2.10', 'getPilot'),
    transport.request('192.0.2.10', 'setPilot', { dimming: 30 }),
    transport.request('192.0.2.10', 'getPilot'),
  ]);
  assert.equal(results[1].state, false);
  assert.equal(results[3].dimming, 30);
  assert.deepEqual(
    device.received.map((request) => request.method),
    ['setPilot', 'getPilot', 'setPilot', 'getPilot'],
  );
});

test('closing fails the requests still waiting', async (t) => {
  const { transport, device } = setup();
  device.online = false;
  const waiting = transport.request('192.0.2.10', 'getPilot');
  await new Promise((resolve) => setTimeout(resolve, 5));
  transport.close();
  await assert.rejects(waiting, /stopping/);
  await assert.rejects(transport.request('192.0.2.10', 'getPilot'), /stopping/);
  t.after(() => transport.close());
});
