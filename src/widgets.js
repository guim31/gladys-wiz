// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `wiz`.
//
// The Gladys device box already has the switch, the brightness, the colour,
// the white and the scene list. What the widget adds: the WiZ scenes chosen in
// its settings as one-tap buttons, what the light is showing at a glance, and
// an on/off button that follows the real state.
//
// Budget (8 components, 2 texts, 1 status, 4 buttons): a caption, one live
// tile, one status list, up to three scene buttons and the on/off button. The
// running scene is marked by its icon (`check-circle`), never by the button
// style: `primary` is invisible in dark mode.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { FEATURE_KEYS, activeSceneId, currentColor, deviceIds, namesFor } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import { sceneById, sceneName } from './wiz/scenes.js';

const ACTIVE_ICON = 'check-circle';
const MAX_SCENE_BUTTONS = 3;
const SCENE_ACTION_PREFIX = 'scene_';
const POWER_ACTION = 'power';

// What a widget shows before its settings are touched: scenes most WiZ
// lights run (a filament bulb only has the night light of the three).
export const DEFAULT_WIDGET_SCENES = ['11', '16', '14'];

export const TEXT = {
  pick: {
    en: 'Choose a WiZ device in the settings of this widget.',
    fr: 'Choisissez un appareil WiZ dans les réglages de ce widget.',
    de: 'Wähle in den Einstellungen dieses Widgets ein WiZ-Gerät aus.',
    es: 'Elija un dispositivo WiZ en la configuración de este widget.',
  },
  unknown: {
    en: 'This WiZ device is not known yet: run a search in the integration.',
    fr: 'Cet appareil WiZ est inconnu : lancez une recherche dans l’intégration.',
    de: 'Dieses WiZ-Gerät ist noch unbekannt: Starte eine Suche in der Integration.',
    es: 'Este dispositivo WiZ aún no es conocido: inicie una búsqueda en la integración.',
  },
  brightness: { en: 'Brightness', fr: 'Luminosité', de: 'Helligkeit', es: 'Brillo' },
  powerDraw: { en: 'Power', fr: 'Puissance', de: 'Leistung', es: 'Potencia' },
  mode: { en: 'Mode', fr: 'Mode', de: 'Modus', es: 'Modo' },
  white: { en: 'White', fr: 'Blanc', de: 'Weiß', es: 'Blanco' },
  color: { en: 'Color', fr: 'Couleur', de: 'Farbe', es: 'Color' },
  on: { en: 'On', fr: 'Allumé', de: 'Ein', es: 'Encendido' },
  off: { en: 'Off', fr: 'Éteint', de: 'Aus', es: 'Apagado' },
  turnOn: { en: 'Turn on', fr: 'Allumer', de: 'Einschalten', es: 'Encender' },
  turnOff: { en: 'Turn off', fr: 'Éteindre', de: 'Ausschalten', es: 'Apagar' },
  unreachable: {
    en: 'not answering',
    fr: 'ne répond pas',
    de: 'antwortet nicht',
    es: 'no responde',
  },
  sceneStarted: {
    en: 'Scene started: ',
    fr: 'Scène lancée : ',
    de: 'Szene gestartet: ',
    es: 'Escena iniciada: ',
  },
  switchedOn: { en: 'Turned on', fr: 'Allumé', de: 'Eingeschaltet', es: 'Encendido' },
  switchedOff: { en: 'Turned off', fr: 'Éteint', de: 'Ausgeschaltet', es: 'Apagado' },
};

const t = (text, language) => text[language] ?? text.en;

/**
 * The scenes of the widget settings the device can run, in order. Settings
 * never saved get the defaults; an empty choice means none.
 */
export function widgetScenes(record, settings) {
  const raw = settings?.scenes;
  const ids = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : DEFAULT_WIDGET_SCENES;
  const scenes = [];
  for (const id of ids) {
    const scene = sceneById(String(id).trim());
    if (scene && record.caps.scenes.includes(scene.id) && !scenes.includes(scene)) {
      scenes.push(scene);
    }
  }
  return scenes.slice(0, MAX_SCENE_BUTTONS);
}

/** What the light shows, in words: its scene, its white or its colour. */
export function modeText(record, language) {
  const scene = sceneById(activeSceneId(record));
  if (scene) {
    return sceneName(scene, language);
  }
  if (currentColor(record) !== null) {
    return t(TEXT.color, language);
  }
  const temp = record.pilot?.temp;
  if (record.caps.temperature && typeof temp === 'number' && temp > 0) {
    return `${t(TEXT.white, language)} ${Math.round(temp)} K`;
  }
  return t(TEXT.white, language);
}

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

async function get(hub, { settings, language = 'en' }) {
  const record = settings?.device ? hub.resolveDevice(settings.device) : null;
  if (!record?.caps) {
    return message(settings?.device ? TEXT.unknown : TEXT.pick, language);
  }
  const { caps } = record;
  const ids = deviceIds(hub.gladys, record.mac);
  const names = namesFor(language);
  const lit = record.pilot?.state === true;
  const reachable = record.reachable === true;

  const caption = [`WiZ ${names[caps.kind]}`, record.host];
  if (!reachable) {
    caption.push(t(TEXT.unreachable, language));
  }
  const components = [{ type: 'text', variant: 'caption', text: caption.join(' · ') }];
  if (caps.brightness) {
    components.push({
      type: 'value',
      device_feature: ids.feature(FEATURE_KEYS.BRIGHTNESS),
      label: t(TEXT.brightness, language),
      icon: 'sun',
    });
  } else if (caps.power) {
    components.push({
      type: 'value',
      device_feature: ids.feature(FEATURE_KEYS.POWER_DRAW),
      label: t(TEXT.powerDraw, language),
      icon: 'zap',
    });
  }
  const items = [
    {
      label: caps.light ? names.light : names.socket,
      icon: 'power',
      value: t(lit ? TEXT.on : TEXT.off, language),
      color: lit ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (caps.light) {
    items.push({
      label: t(TEXT.mode, language),
      icon: 'droplet',
      value: modeText(record, language),
      color: activeSceneId(record) !== null ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
    });
  }
  components.push({ type: 'status', items });

  const active = lit ? activeSceneId(record) : null;
  widgetScenes(record, settings).forEach((scene, index) => {
    components.push({
      type: 'button',
      label: sceneName(scene, language),
      icon: scene.id === active ? ACTIVE_ICON : 'play',
      style: 'secondary',
      // Numbered keys: the core drops a button whose action key is taken.
      action: { key: `${SCENE_ACTION_PREFIX}${index + 1}`, params: { scene: scene.id } },
    });
  });
  components.push({
    type: 'button',
    label: t(lit ? TEXT.turnOff : TEXT.turnOn, language),
    icon: 'power',
    style: 'secondary',
    // The tap toggles the state the device has then, not the one shown.
    action: { key: POWER_ACTION },
  });
  return { ttl_seconds: 60, components };
}

async function action(hub, { actionKey, params = {}, settings }) {
  const device = settings?.device;
  if (!device) {
    throw new Error(TEXT.pick.en);
  }
  if (actionKey.startsWith(SCENE_ACTION_PREFIX)) {
    const scene = await hub.startScene(device, { scene: params.scene });
    return {
      message: Object.fromEntries(
        Object.keys(TEXT.sceneStarted).map((language) => [
          language,
          `${TEXT.sceneStarted[language]}${sceneName(scene, language)}`,
        ]),
      ),
    };
  }
  if (actionKey === POWER_ACTION) {
    const record = hub.require(device);
    const on = record.pilot?.state !== true;
    await hub.switchPower(device, on);
    return { message: on ? TEXT.switchedOn : TEXT.switchedOff };
  }
  throw new Error(`Unknown action ${actionKey}`);
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
