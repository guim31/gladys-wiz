// -----------------------------------------------------------------------------
// What a WiZ device is and what it can do, from its own answers: the module
// name of getSystemConfig, the white range of getModelConfig (firmware 1.22+)
// or getUserConfig (older firmware). A port of pywizlight's bulblibrary.py
// (MIT), plus the conversions between a plain RGB colour and the WiZ
// red/green/blue + white channels (pywizlight's rgbcw.py).
//
// Module names read `<family>_<identifier>_<revision>`: ESP01_SHRGB_03 is a
// single-head colour bulb, ESP21_SHTW_01 a tunable white one, ESP05_SHDW_21 a
// dimmable white filament, ESP10_SOCKET_06 a smart plug.
// -----------------------------------------------------------------------------

import { DIMMABLE_WHITE_SCENE_IDS, SCENE_IDS, TUNABLE_WHITE_SCENE_IDS } from './scenes.js';

export const KINDS = {
  COLOR: 'color',
  TUNABLE_WHITE: 'tunable-white',
  DIMMABLE_WHITE: 'dimmable-white',
  SOCKET: 'socket',
};

// White range of a light that reports none (pywizlight refuses such a
// colour or tunable white light; WiZ lights span at least this).
const FALLBACK_KELVIN = { min: 2700, max: 6500 };

// WiZ accepts 10 % to 100 %: lower values are refused by older firmware.
export const DIMMING_MIN = 10;
export const DIMMING_MAX = 100;
// Speed of the dynamic scenes, in % of their normal pace.
export const SPEED_MIN = 10;
export const SPEED_MAX = 200;

/** Lower-case 12-digit MAC address, or null. */
export function normalizeMac(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const mac = raw.toLowerCase().replace(/[^0-9a-f]/g, '');
  return /^[0-9a-f]{12}$/.test(mac) ? mac : null;
}

/**
 * The kind of device from getSystemConfig (`moduleName`, or `typeId` on the
 * 1.8 firmware that has no module name). Null when it cannot be told.
 * @param {object} system the `result` of getSystemConfig
 */
export function parseModule(system) {
  const moduleName = typeof system?.moduleName === 'string' ? system.moduleName : '';
  if (moduleName) {
    const identifier = moduleName.split('_')[1];
    if (!identifier) {
      return null;
    }
    if (identifier.includes('RGB')) {
      return { kind: KINDS.COLOR, effects: true };
    }
    // Ceiling fans with a tunable white light (DDTW) are lights here: the fan
    // itself is not driven by this integration.
    if (identifier.includes('TW')) {
      return { kind: KINDS.TUNABLE_WHITE, effects: true };
    }
    if (identifier.includes('SOCKET')) {
      return { kind: KINDS.SOCKET, effects: false };
    }
    if (identifier.includes('FANDIM')) {
      return { kind: KINDS.DIMMABLE_WHITE, effects: false };
    }
    // Plain dimmable white: filament bulbs (SHDW) run the white scenes, a
    // dimmer module (DIMTRIACS) does not.
    return {
      kind: KINDS.DIMMABLE_WHITE,
      effects: identifier.includes('DH') || identifier.includes('SH'),
    };
  }
  if (Number.isInteger(system?.typeId)) {
    // Firmware 1.8: only type 0 (dimmable white) is known.
    return { kind: KINDS.DIMMABLE_WHITE, effects: true };
  }
  return null;
}

/**
 * The white range in kelvins: cctRange of getModelConfig (1.22+), else
 * extRange then whiteRange of getUserConfig. Null when none is reported.
 */
export function kelvinRange(model, user) {
  const candidates = [model?.cctRange, model?.extRange, user?.extRange, user?.whiteRange];
  for (const range of candidates) {
    if (Array.isArray(range)) {
      const values = range.map(Number).filter((value) => Number.isFinite(value) && value > 0);
      if (values.length > 0) {
        return { min: Math.min(...values), max: Math.max(...values) };
      }
    }
  }
  return null;
}

/**
 * Everything the integration publishes for a device, from its stored answers.
 * @param {{ system: object, model?: object|null, user?: object|null, power?: boolean }} record
 * @returns {object|null} null for a device of an unknown kind
 */
export function capabilitiesOf({ system, model = null, user = null, power = false }) {
  const parsed = parseModule(system);
  if (!parsed) {
    return null;
  }
  const { kind, effects } = parsed;
  const light = kind !== KINDS.SOCKET;
  const range = kelvinRange(model, user);
  const temperature = kind === KINDS.COLOR || kind === KINDS.TUNABLE_WHITE;
  let sceneIds = [];
  if (effects) {
    sceneIds =
      kind === KINDS.COLOR
        ? SCENE_IDS
        : kind === KINDS.TUNABLE_WHITE
          ? TUNABLE_WHITE_SCENE_IDS
          : DIMMABLE_WHITE_SCENE_IDS;
  }
  return {
    kind,
    light,
    brightness: light,
    color: kind === KINDS.COLOR,
    temperature,
    kelvin: temperature ? (range && range.max > range.min ? range : FALLBACK_KELVIN) : null,
    scenes: sceneIds,
    speed: sceneIds.length > 0,
    power: kind === KINDS.SOCKET && power === true,
    module: typeof system.moduleName === 'string' ? system.moduleName : null,
    firmware: typeof system.fwVersion === 'string' ? system.fwVersion : null,
  };
}

// --- Colours -------------------------------------------------------------------
//
// A WiZ colour light mixes red, green and blue LEDs with warm (w) and cold (c)
// white ones. pywizlight sends a plain RGB colour as its fully saturated hue on
// the RGB LEDs, plus warm white for the paler shades; the reverse brings back
// the plain colour the dashboard shows.

const EPSILON = 1e-5;
const CW_MAX = 128;
const ANGLE = (Math.PI * 2) / 3;
const BASIS = [0, ANGLE, ANGLE * 2].map((angle) => [Math.cos(angle), Math.sin(angle)]);

const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const length = (a) => {
  const squared = dot(a, a);
  return squared > EPSILON ? Math.sqrt(squared) : 0;
};
const hueVector = (rgb) =>
  BASIS.reduce(
    (sum, basis, index) => [sum[0] + basis[0] * rgb[index], sum[1] + basis[1] * rgb[index]],
    [0, 0],
  );

function trapezoid(hue, saturation) {
  let rgb;
  if (saturation <= EPSILON) {
    rgb = [0, 0, 0];
  } else {
    const maxAngle = Math.cos(ANGLE - EPSILON);
    const mask = BASIS.map((basis) => (dot(hue, basis) > maxAngle ? 1 : 0));
    if (mask.filter(Boolean).length === 1) {
      rgb = mask;
    } else {
      // The colour as the combination of the two closest primaries.
      const [first, second] = BASIS.filter((_, index) => mask[index] === 1);
      const normal = [second[1], -second[0]];
      const coeff0 = dot(hue, normal) / dot(first, normal);
      const intersection = [hue[0] - first[0] * coeff0, hue[1] - first[1] * coeff0];
      let coefficients = [coeff0, dot(intersection, second)];
      const max = Math.max(...coefficients);
      coefficients = coefficients.map((value) => value / max);
      let next = 0;
      rgb = mask.map((on) => (on ? Math.min(coefficients[next++], 1) : 0));
    }
  }
  let cw;
  if (saturation >= 0.5) {
    cw = 1 - (saturation - 0.5) * 2;
  } else {
    cw = 1;
    rgb = rgb.map((value) => value * saturation * 2);
  }
  return {
    r: Math.trunc(rgb[0] * 255),
    g: Math.trunc(rgb[1] * 255),
    b: Math.trunc(rgb[2] * 255),
    w: Math.trunc(Math.max(0, cw * CW_MAX)),
  };
}

/** A plain RGB colour (0-255 each) to the WiZ `r`, `g`, `b`, `w` channels. */
export function rgbToWiz([red, green, blue]) {
  const hue = hueVector([red / 255, green / 255, blue / 255]);
  const saturation = length(hue);
  const unit = saturation > EPSILON ? [hue[0] / saturation, hue[1] / saturation] : hue;
  return trapezoid(unit, saturation);
}

/** The WiZ `r`, `g`, `b` and white channels back to a plain RGB colour. */
export function wizToRgb({ r, g, b, w = 0 }) {
  const rgb = [r / 255, g / 255, b / 255];
  const white = Math.min(w, CW_MAX) / CW_MAX;
  const hue = hueVector(rgb);
  const saturation = white === 1 ? length(hue) * 0.5 : 1 - white / 2;
  let angle = Math.atan2(hue[1], hue[0]);
  while (angle < 0) {
    angle += Math.PI * 2;
  }
  return hsvToRgb((angle * 180) / Math.PI, Math.min(1, Math.max(0, saturation)), 1);
}

function hsvToRgb(hue, saturation, value) {
  const chroma = value * saturation;
  const sector = (hue % 360) / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] =
    sector < 1
      ? [chroma, x, 0]
      : sector < 2
        ? [x, chroma, 0]
        : sector < 3
          ? [0, chroma, x]
          : sector < 4
            ? [0, x, chroma]
            : sector < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const m = value - chroma;
  return [r, g, b].map((channel) => Math.round((channel + m) * 255));
}

export const rgbToInt = ([r, g, b]) => (r << 16) + (g << 8) + b;
export const intToRgb = (value) => {
  const number = Math.max(0, Math.min(0xffffff, Math.round(Number(value) || 0)));
  return [(number >> 16) & 0xff, (number >> 8) & 0xff, number & 0xff];
};

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
