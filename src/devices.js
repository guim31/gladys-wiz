// -----------------------------------------------------------------------------
// From a WiZ device to a Gladys device, and back: discovery payload, state
// values, and the setPilot parameters of each command.
//
// One Gladys device per WiZ light or plug, keyed on its MAC address. Only what
// the model can do is published: a dimmable filament bulb has no colour, a
// tunable white bulb gets the white range of its model, a plug a switch (and
// its power draw when it measures it).
//
// Feature keys are part of the external ids: permanent.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import {
  DIMMING_MAX,
  DIMMING_MIN,
  KINDS,
  SPEED_MAX,
  SPEED_MIN,
  clamp,
  intToRgb,
  rgbToInt,
  rgbToWiz,
  wizToRgb,
} from './wiz/model.js';
import { sceneById, sceneName } from './wiz/scenes.js';

export const DEVICE_TYPE = 'wiz';

export const FEATURE_KEYS = {
  POWER: 'power',
  BRIGHTNESS: 'brightness',
  COLOR: 'color',
  TEMPERATURE: 'color-temperature',
  SCENE: 'scene',
  SPEED: 'scene-speed',
  POWER_DRAW: 'power-draw',
};

// Value of the scene list when no WiZ scene runs (plain white or colour):
// Gladys ignores an empty text state.
export const NO_SCENE = 'none';

// Feature and device names are frozen when the user creates the device:
// written in the language chosen in the configuration at that moment.
export const NAMES = {
  en: {
    light: 'Light',
    socket: 'Socket',
    brightness: 'Brightness',
    color: 'Color',
    'color-temperature': 'Color temperature',
    scene: 'WiZ scene',
    'scene-speed': 'Scene speed',
    'power-draw': 'Power draw',
    noScene: 'None',
    [KINDS.COLOR]: 'color',
    [KINDS.TUNABLE_WHITE]: 'tunable white',
    [KINDS.DIMMABLE_WHITE]: 'dimmable',
    [KINDS.SOCKET]: 'socket',
  },
  fr: {
    light: 'Éclairage',
    socket: 'Prise',
    brightness: 'Luminosité',
    color: 'Couleur',
    'color-temperature': 'Température de couleur',
    scene: 'Scène WiZ',
    'scene-speed': 'Vitesse de la scène',
    'power-draw': 'Puissance consommée',
    noScene: 'Aucune',
    [KINDS.COLOR]: 'couleur',
    [KINDS.TUNABLE_WHITE]: 'blanc réglable',
    [KINDS.DIMMABLE_WHITE]: 'variable',
    [KINDS.SOCKET]: 'prise',
  },
  de: {
    light: 'Licht',
    socket: 'Steckdose',
    brightness: 'Helligkeit',
    color: 'Farbe',
    'color-temperature': 'Farbtemperatur',
    scene: 'WiZ-Szene',
    'scene-speed': 'Szenengeschwindigkeit',
    'power-draw': 'Leistungsaufnahme',
    noScene: 'Keine',
    [KINDS.COLOR]: 'Farbe',
    [KINDS.TUNABLE_WHITE]: 'Weißtöne',
    [KINDS.DIMMABLE_WHITE]: 'dimmbar',
    [KINDS.SOCKET]: 'Steckdose',
  },
  es: {
    light: 'Luz',
    socket: 'Enchufe',
    brightness: 'Brillo',
    color: 'Color',
    'color-temperature': 'Temperatura de color',
    scene: 'Escena WiZ',
    'scene-speed': 'Velocidad de la escena',
    'power-draw': 'Consumo',
    noScene: 'Ninguna',
    [KINDS.COLOR]: 'color',
    [KINDS.TUNABLE_WHITE]: 'blanco regulable',
    [KINDS.DIMMABLE_WHITE]: 'regulable',
    [KINDS.SOCKET]: 'enchufe',
  },
};

export const namesFor = (language) => NAMES[language] ?? NAMES.en;

/** External ids of the Gladys device of a WiZ device. */
export const deviceIds = (gladys, mac) => gladys.externalIds(DEVICE_TYPE, mac);

/** Default name: "WiZ <kind> <end of the MAC>", the user renames it in Gladys. */
export function deviceName(record, language) {
  const kind = namesFor(language)[record.caps.kind];
  return `WiZ ${kind} ${record.mac.slice(-6).toUpperCase()}`;
}

/** Options of the scene list: "None", then the model's scenes by name. */
export function sceneOptions(caps, language) {
  const scenes = caps.scenes
    .map((id) => sceneById(id))
    .filter(Boolean)
    .map((scene) => ({ value: String(scene.id), label: sceneName(scene, language) }))
    .sort((a, b) => a.label.localeCompare(b.label, language, { sensitivity: 'base' }));
  return [{ value: NO_SCENE, label: namesFor(language).noScene }, ...scenes];
}

/**
 * Feature specs of a device, in publication order.
 * @param {object} caps capabilitiesOf() of the device
 * @param {string} language
 */
export function featureSpecs(caps, language) {
  const names = namesFor(language);
  const specs = [];
  if (caps.light) {
    specs.push({
      key: FEATURE_KEYS.POWER,
      name: names.light,
      category: CATEGORIES.LIGHT,
      type: TYPES.LIGHT.BINARY,
      min: 0,
      max: 1,
      history: true,
    });
  } else {
    specs.push({
      key: FEATURE_KEYS.POWER,
      name: names.socket,
      category: CATEGORIES.SWITCH,
      type: TYPES.SWITCH.BINARY,
      min: 0,
      max: 1,
      history: true,
    });
  }
  if (caps.brightness) {
    specs.push({
      key: FEATURE_KEYS.BRIGHTNESS,
      name: names.brightness,
      category: CATEGORIES.LIGHT,
      type: TYPES.LIGHT.BRIGHTNESS,
      unit: UNITS.PERCENT,
      min: 0,
      max: 100,
      history: true,
    });
  }
  if (caps.color) {
    specs.push({
      key: FEATURE_KEYS.COLOR,
      name: names.color,
      category: CATEGORIES.LIGHT,
      type: TYPES.LIGHT.COLOR,
      min: 0,
      max: 0xffffff,
      history: true,
    });
  }
  if (caps.temperature) {
    // In kelvins, the bounds of the model: the Gladys slider reads the
    // `kelvin` unit as a physical scale (warm on the left).
    specs.push({
      key: FEATURE_KEYS.TEMPERATURE,
      name: names['color-temperature'],
      category: CATEGORIES.LIGHT,
      type: TYPES.LIGHT.TEMPERATURE,
      unit: UNITS.KELVIN,
      min: caps.kelvin.min,
      max: caps.kelvin.max,
      history: true,
    });
  }
  if (caps.scenes.length > 0) {
    // A list the dashboard can drive (light/effect-mode is display-only).
    specs.push({
      key: FEATURE_KEYS.SCENE,
      name: names.scene,
      category: CATEGORIES.TEXT,
      type: TYPES.TEXT.SELECT,
      min: 0,
      max: 0,
      history: false,
      supported_options: sceneOptions(caps, language).map((option, index) => ({
        ...option,
        sort_order: index,
      })),
    });
  }
  if (caps.speed) {
    // A slider the dashboard can drive (light/effect-speed is display-only),
    // in % of the scene's normal pace like the WiZ app.
    specs.push({
      key: FEATURE_KEYS.SPEED,
      name: names['scene-speed'],
      category: CATEGORIES.SWITCH,
      type: TYPES.SWITCH.DIMMER,
      min: SPEED_MIN,
      max: SPEED_MAX,
      history: false,
    });
  }
  if (caps.power) {
    specs.push({
      key: FEATURE_KEYS.POWER_DRAW,
      name: names['power-draw'],
      category: CATEGORIES.SWITCH,
      type: TYPES.SWITCH.POWER,
      unit: UNITS.WATT,
      min: 0,
      max: 3680,
      read_only: true,
      history: true,
    });
  }
  return specs;
}

/** Discovery payload of one WiZ device. */
export function buildDevice(gladys, record, language) {
  const ids = deviceIds(gladys, record.mac);
  return {
    name: deviceName(record, language),
    external_id: ids.device,
    model: record.caps.module ?? 'WiZ',
    // The container reads every device itself at the configured pace: the
    // Gladys scheduler cannot pace it, nor follow the WiZ app's changes.
    should_poll: false,
    params: [
      { name: 'IP_ADDRESS', value: record.host },
      { name: 'MAC_ADDRESS', value: record.mac },
      ...(record.caps.firmware ? [{ name: 'FIRMWARE', value: record.caps.firmware }] : []),
    ],
    features: featureSpecs(record.caps, language).map((spec) => {
      const feature = {
        name: spec.name,
        external_id: ids.feature(spec.key),
        category: spec.category,
        type: spec.type,
        min: spec.min,
        max: spec.max,
        read_only: spec.read_only === true,
        has_feedback: true,
        keep_history: spec.history,
      };
      if (spec.unit) {
        feature.unit = spec.unit;
      }
      if (spec.supported_options) {
        feature.supported_options = spec.supported_options;
      }
      return feature;
    }),
  };
}

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** True when the light runs a scene the list knows. */
export function activeSceneId(record) {
  const id = record.pilot?.sceneId;
  return isNumber(id) && record.caps.scenes.includes(id) ? id : null;
}

/** The plain colour a colour light shows, or null (white, scene). */
export function currentColor(record) {
  const pilot = record.pilot ?? {};
  if (!record.caps.color || activeSceneId(record) !== null || pilot.temp > 0) {
    return null;
  }
  if (![pilot.r, pilot.g, pilot.b].every(isNumber)) {
    return null;
  }
  const channels = {
    r: pilot.r,
    g: pilot.g,
    b: pilot.b,
    w: Math.max(isNumber(pilot.w) ? pilot.w : 0, isNumber(pilot.c) ? pilot.c : 0),
  };
  // The colour Gladys sent, while the light still shows it: the conversion
  // to the WiZ channels is not exactly reversible.
  const sent = record.sentColor;
  if (sent && ['r', 'g', 'b', 'w'].every((key) => sent.channels[key] === channels[key])) {
    return sent.value;
  }
  return rgbToInt(wizToRgb(channels));
}

/**
 * Feature values of a device, by feature key: numbers, or `{ text }` for the
 * scene list. Only what the last getPilot (or getPower) told.
 */
export function deviceValues(record) {
  const { caps } = record;
  const pilot = record.pilot ?? {};
  const values = {};
  if (typeof pilot.state === 'boolean') {
    values[FEATURE_KEYS.POWER] = pilot.state ? 1 : 0;
  }
  if (caps.brightness && isNumber(pilot.dimming)) {
    values[FEATURE_KEYS.BRIGHTNESS] = clamp(Math.round(pilot.dimming), 0, 100);
  }
  const color = currentColor(record);
  if (color !== null) {
    values[FEATURE_KEYS.COLOR] = color;
  }
  if (
    caps.temperature &&
    isNumber(pilot.temp) &&
    pilot.temp > 0 &&
    activeSceneId(record) === null
  ) {
    values[FEATURE_KEYS.TEMPERATURE] = clamp(
      Math.round(pilot.temp),
      caps.kelvin.min,
      caps.kelvin.max,
    );
  }
  if (caps.scenes.length > 0) {
    const scene = activeSceneId(record);
    values[FEATURE_KEYS.SCENE] = { text: scene === null ? NO_SCENE : String(scene) };
  }
  if (caps.speed && isNumber(pilot.speed)) {
    values[FEATURE_KEYS.SPEED] = clamp(Math.round(pilot.speed), SPEED_MIN, SPEED_MAX);
  }
  if (caps.power && isNumber(record.watts)) {
    values[FEATURE_KEYS.POWER_DRAW] = Math.round(record.watts * 10) / 10;
  }
  return values;
}

/**
 * The setPilot parameters of a Gladys command, or null when there is nothing
 * to send ("None" in the scene list). Like the other Gladys lights, a
 * brightness, a colour, a white or a scene also turns the light on.
 * @param {object} record the device record (caps, pilot)
 * @param {string} key feature key
 * @param {number|string} value
 */
export function commandFor(record, key, value) {
  const { caps } = record;
  const number = Number(value);
  switch (key) {
    case FEATURE_KEYS.POWER:
      return { state: number > 0 };

    case FEATURE_KEYS.BRIGHTNESS:
      if (!caps.brightness) {
        break;
      }
      if (!(number > 0)) {
        return { state: false };
      }
      return { state: true, dimming: clamp(Math.round(number), DIMMING_MIN, DIMMING_MAX) };

    case FEATURE_KEYS.COLOR: {
      if (!caps.color) {
        break;
      }
      const { r, g, b, w } = rgbToWiz(intToRgb(number));
      return { state: true, r, g, b, c: 0, w };
    }

    case FEATURE_KEYS.TEMPERATURE:
      if (!caps.temperature || !Number.isFinite(number)) {
        break;
      }
      return { state: true, temp: clamp(Math.round(number), caps.kelvin.min, caps.kelvin.max) };

    case FEATURE_KEYS.SCENE: {
      if (value === NO_SCENE) {
        return null;
      }
      const scene = sceneById(value);
      if (!scene || !caps.scenes.includes(scene.id)) {
        throw new Error(`This WiZ device has no scene "${value}"`);
      }
      return { state: true, sceneId: scene.id };
    }

    case FEATURE_KEYS.SPEED:
      if (!caps.speed || !Number.isFinite(number)) {
        break;
      }
      // Without `state`: the firmware ignores the speed of a setPilot that
      // also carries the state (pywizlight).
      return { speed: clamp(Math.round(number), SPEED_MIN, SPEED_MAX) };

    default:
      break;
  }
  throw new Error(`Feature "${key}" cannot be set on this WiZ device`);
}

/**
 * What the device shows once a setPilot is applied, without waiting for the
 * next read: a white clears the colour and the scene, a colour the white and
 * the scene, a scene the colour and the white.
 */
export function applyCommand(pilot, params) {
  const next = { ...pilot, ...params };
  if (params.temp !== undefined) {
    delete next.r;
    delete next.g;
    delete next.b;
    next.sceneId = 0;
  }
  if (params.r !== undefined) {
    delete next.temp;
    next.sceneId = 0;
  }
  if (params.sceneId !== undefined) {
    delete next.temp;
    delete next.r;
    delete next.g;
    delete next.b;
  }
  return next;
}
