// -----------------------------------------------------------------------------
// The `wiz` dashboard widget: content within the core budget, bound to
// features that exist, scene buttons the light can run, and its actions.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { DEFAULT_WIDGET_SCENES, TEXT } from '../src/widgets.js';
import {
  COLOR_BULB,
  FILAMENT_BULB,
  FakeWiz,
  METER_SOCKET,
  createAll,
  createWorld,
  deviceId,
} from './helpers/world.js';

async function world(devices) {
  const created = await createWorld({ devices });
  await createAll(created);
  return created;
}

async function content(w, settings, language = 'en') {
  const ack = await w.fake.widgetGet('wiz', { settings, language, units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  const result = ack.data.content ?? ack.data;
  assert.deepEqual(validateWidgetContent(result), [], 'rendered exactly as sent');
  return result;
}

const buttons = (result) => result.components.filter((component) => component.type === 'button');

function featureIds(w) {
  return new Set(
    w.fake.discoveredDevices.flatMap((device) => device.features.map((f) => f.external_id)),
  );
}

test('a colour bulb: brightness tile, state, scene buttons and on/off', async (t) => {
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const w = await world([bulb]);
  t.after(() => w.app.stop());
  const result = await content(w, { device: deviceId(w.gladys, bulb.mac) }, 'fr');
  const ids = featureIds(w);
  for (const component of result.components) {
    if (component.device_feature) {
      assert.ok(ids.has(component.device_feature), component.device_feature);
    }
  }
  assert.match(result.components[0].text, /^WiZ couleur · 192\.0\.2\.10$/);
  const status = result.components.find((component) => component.type === 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value]),
    [
      ['Éclairage', 'Allumé'],
      ['Mode', 'Couleur'],
    ],
  );
  assert.deepEqual(
    buttons(result).map((button) => button.label),
    ['Blanc chaud', 'Détente', 'Veilleuse', 'Éteindre'],
  );
  assert.equal(DEFAULT_WIDGET_SCENES.length, 3);
});

test('the running scene is marked by its icon, unsupported scenes are left out', async (t) => {
  const bulb = new FakeWiz(FILAMENT_BULB, '192.0.2.10');
  const w = await world([bulb]);
  t.after(() => w.app.stop());
  bulb.pilot = { ...bulb.pilot, state: true, sceneId: 14 };
  await w.hub.pollAll();
  const settings = { device: deviceId(w.gladys, bulb.mac), scenes: ['4', '14', '9', '10', '29'] };
  const result = await content(w, settings);
  assert.deepEqual(
    buttons(result).map((button) => [button.label, button.icon]),
    [
      ['Night light', 'check-circle'],
      ['Wake-up', 'play'],
      ['Bedtime', 'play'],
      ['Turn off', 'power'],
    ],
  );
  assert.ok(buttons(result).every((button) => button.style === 'secondary'));
});

test('a plug with a meter: power tile and on/off only', async (t) => {
  const socket = new FakeWiz(METER_SOCKET, '192.0.2.12');
  const w = await world([socket]);
  t.after(() => w.app.stop());
  const result = await content(w, { device: deviceId(w.gladys, socket.mac) });
  assert.match(result.components[1].device_feature, /:power-draw$/);
  assert.deepEqual(
    buttons(result).map((button) => button.label),
    ['Turn off'],
  );
});

test('the buttons start a scene and toggle the device', async (t) => {
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const w = await world([bulb]);
  t.after(() => w.app.stop());
  const settings = { device: deviceId(w.gladys, bulb.mac), scenes: ['1'] };
  const [sceneButton, powerButton] = buttons(await content(w, settings));

  const started = await w.fake.widgetAction(
    'wiz',
    sceneButton.action.key,
    sceneButton.action.params,
    {
      settings,
    },
  );
  assert.equal(started.success, true, started.error);
  assert.equal(bulb.pilot.sceneId, 1);
  assert.match(JSON.stringify(started.data), /Océan/);

  const off = await w.fake.widgetAction('wiz', powerButton.action.key, {}, { settings });
  assert.equal(off.success, true);
  assert.equal(bulb.pilot.state, false);
  const on = await w.fake.widgetAction('wiz', powerButton.action.key, {}, { settings });
  assert.equal(on.success, true);
  assert.equal(bulb.pilot.state, true);
});

test('without a device, or an unknown one, the widget says what to do', async (t) => {
  const w = await world([new FakeWiz(COLOR_BULB, '192.0.2.10')]);
  t.after(() => w.app.stop());
  assert.equal((await content(w, {}, 'de')).components[0].text, TEXT.pick.de);
  const unknown = await content(w, { device: deviceId(w.gladys, 'a8bb50ffffff') }, 'es');
  assert.equal(unknown.components[0].text, TEXT.unknown.es);
});

test('an unreachable device says so in the caption', async (t) => {
  const bulb = new FakeWiz(COLOR_BULB, '192.0.2.10');
  const w = await world([bulb]);
  t.after(() => w.app.stop());
  bulb.online = false;
  await w.hub.pollAll();
  await w.hub.pollAll();
  const result = await content(w, { device: deviceId(w.gladys, bulb.mac) });
  assert.match(result.components[0].text, /not answering$/);
});
