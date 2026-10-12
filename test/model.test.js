// -----------------------------------------------------------------------------
// What a WiZ device can do, from its real answers (test/fixtures/wiz), and the
// colour conversions, checked against pywizlight's own results.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KINDS,
  capabilitiesOf,
  intToRgb,
  kelvinRange,
  normalizeMac,
  parseModule,
  rgbToInt,
  rgbToWiz,
  wizToRgb,
} from '../src/wiz/model.js';
import {
  DIMMABLE_WHITE_SCENE_IDS,
  SCENES,
  SCENE_IDS,
  TUNABLE_WHITE_SCENE_IDS,
  findScene,
  sceneById,
} from '../src/wiz/scenes.js';
import { FIXTURE_NAMES, loadFixture } from './helpers/fakeWiz.js';

function capsOf(name) {
  const fixture = loadFixture(name);
  const result = (method) => fixture[method].result ?? null;
  return capabilitiesOf({
    system: result('getSystemConfig'),
    model: result('getModelConfig'),
    user: result('getUserConfig'),
    power: typeof result('getPower')?.power === 'number',
  });
}

// Expected from pywizlight's BulbType.from_data on the same answers.
const EXPECTED = {
  'color-bulb-esp01-shrgb-03-1.25.0': { kind: KINDS.COLOR, kelvin: [2200, 6500], scenes: 37 },
  'light-strip-esp20-shrgb-01abi-1.21.4': { kind: KINDS.COLOR, kelvin: [2700, 6500], scenes: 37 },
  'color-bulb-esp01-shrgb1c-31-1.17.1': { kind: KINDS.COLOR, kelvin: [2700, 6500], scenes: 37 },
  'dual-head-esp20-dhrgb-01b-1.21.40': { kind: KINDS.COLOR, kelvin: [2200, 6500], scenes: 37 },
  'hero-esp20-shrgb-01bt-1.23.70': { kind: KINDS.COLOR, kelvin: [2200, 6500], scenes: 37 },
  'tunable-white-esp21-shtw-01-1.25.0': {
    kind: KINDS.TUNABLE_WHITE,
    kelvin: [2700, 5000],
    scenes: 17,
  },
  'tunable-white-esp05-shtw-21-1.10.0': {
    kind: KINDS.TUNABLE_WHITE,
    kelvin: [2700, 6500],
    scenes: 17,
  },
  'tunable-white-esp14-shtw1c-01-1.18.0': {
    kind: KINDS.TUNABLE_WHITE,
    kelvin: [2700, 6500],
    scenes: 17,
  },
  'filament-esp05-shdw-21-1.25.0': { kind: KINDS.DIMMABLE_WHITE, kelvin: null, scenes: 8 },
  'filament-esp06-shdw9-01-1.11.7': { kind: KINDS.DIMMABLE_WHITE, kelvin: null, scenes: 8 },
  'dimmable-typeid0-1.8.0': { kind: KINDS.DIMMABLE_WHITE, kelvin: null, scenes: 8 },
  'wall-dimmer-esp01-dimtriacs-01-1.16.68': { kind: KINDS.DIMMABLE_WHITE, kelvin: null, scenes: 0 },
  'ceiling-fan-esp03-fandims-31-1.31.32': { kind: KINDS.DIMMABLE_WHITE, kelvin: null, scenes: 0 },
  'socket-esp10-socket-06-1.16.71': { kind: KINDS.SOCKET, kelvin: null, scenes: 0, power: false },
  'socket-esp10-socket-06-1.25.0': { kind: KINDS.SOCKET, kelvin: null, scenes: 0, power: false },
  'socket-meter-esp25-socket-01-1.26.2': {
    kind: KINDS.SOCKET,
    kelvin: null,
    scenes: 0,
    power: true,
  },
};

test('every fixture has its expectation', () => {
  assert.deepEqual(Object.keys(EXPECTED).sort(), FIXTURE_NAMES);
});

for (const [name, expected] of Object.entries(EXPECTED)) {
  test(`capabilities of ${name}`, () => {
    const caps = capsOf(name);
    assert.equal(caps.kind, expected.kind);
    assert.deepEqual(caps.kelvin && [caps.kelvin.min, caps.kelvin.max], expected.kelvin);
    assert.equal(caps.scenes.length, expected.scenes);
    assert.equal(caps.speed, expected.scenes > 0);
    assert.equal(caps.color, expected.kind === KINDS.COLOR);
    assert.equal(caps.brightness, expected.kind !== KINDS.SOCKET);
    assert.equal(caps.power, expected.power === true);
  });
}

test('module names pywizlight cannot read are refused', () => {
  assert.equal(parseModule({ moduleName: 'INVALID' }), null);
  assert.equal(parseModule({}), null);
  assert.deepEqual(parseModule({ moduleName: 'ESP01_FANDDTW_01' }), {
    kind: KINDS.TUNABLE_WHITE,
    effects: true,
  });
});

test('a colour light without a white range gets the usual WiZ one', () => {
  const caps = capabilitiesOf({ system: { moduleName: 'ESP01_SHRGB_03' } });
  assert.deepEqual(caps.kelvin, { min: 2700, max: 6500 });
  assert.deepEqual(kelvinRange({ cctRange: [2200, 2700, 6500, 6500] }, null), {
    min: 2200,
    max: 6500,
  });
  assert.deepEqual(kelvinRange(null, { whiteRange: [2700, 6500] }), { min: 2700, max: 6500 });
});

test('MAC addresses are normalized', () => {
  assert.equal(normalizeMac('A8:BB:50:00:00:01'), 'a8bb50000001');
  assert.equal(normalizeMac('a8bb5000'), null);
  assert.equal(normalizeMac(42), null);
});

test('RGB to WiZ channels: the values of pywizlight rgb2rgbcw', () => {
  // Computed with pywizlight 0.6 (rgbcw.py) on the same colours.
  const cases = [
    [[255, 0, 0], { r: 255, g: 0, b: 0, w: 0 }],
    [[255, 128, 0], { r: 255, g: 128, b: 0, w: 34 }],
    [[255, 200, 200], { r: 109, g: 0, b: 0, w: 128 }],
    [[10, 20, 200], { r: 0, g: 13, b: 255, w: 70 }],
    [[255, 255, 255], { r: 0, g: 0, b: 0, w: 128 }],
    [[0, 255, 128], { r: 0, g: 255, b: 128, w: 34 }],
    [[120, 30, 250], { r: 104, g: 0, b: 255, w: 63 }],
  ];
  for (const [rgb, expected] of cases) {
    assert.deepEqual(rgbToWiz(rgb), expected, String(rgb));
  }
});

test('WiZ channels back to a plain colour: hue and paleness kept', () => {
  assert.deepEqual(wizToRgb({ r: 255, g: 0, b: 0, w: 0 }), [255, 0, 0]);
  assert.deepEqual(wizToRgb({ r: 0, g: 0, b: 0, w: 128 }), [255, 255, 255]);
  assert.deepEqual(wizToRgb({ r: 0, g: 0, b: 255 }), [0, 0, 255]);
  const [r, g, b] = wizToRgb(rgbToWiz([255, 200, 200]));
  assert.ok(r === 255 && Math.abs(g - 200) <= 2 && Math.abs(b - 200) <= 2, `${r},${g},${b}`);
  assert.equal(rgbToInt([255, 128, 0]), 0xff8000);
  assert.deepEqual(intToRgb(0xff8000), [255, 128, 0]);
  assert.deepEqual(intToRgb(-5), [0, 0, 0]);
});

test('scenes: ids, lists per kind and names in four languages', () => {
  assert.equal(SCENES.length, 37);
  assert.equal(new Set(SCENE_IDS).size, SCENE_IDS.length);
  for (const id of [...TUNABLE_WHITE_SCENE_IDS, ...DIMMABLE_WHITE_SCENE_IDS]) {
    assert.ok(sceneById(id), `scene ${id}`);
  }
  for (const scene of SCENES) {
    assert.deepEqual(Object.keys(scene.names), ['en', 'fr', 'de', 'es']);
  }
  assert.equal(findScene('Océan').id, 1);
  assert.equal(findScene('ocean').id, 1);
  assert.equal(findScene('coucher de soleil').id, 3);
  assert.equal(findScene('WARMWEISS'), null);
  assert.equal(findScene('Warmweiß').id, 11);
  assert.equal(findScene('dim-to-warm').id, 40);
  assert.equal(findScene(' 4 ').id, 4);
  assert.equal(findScene('1000'), null);
  assert.equal(findScene(''), null);
});
