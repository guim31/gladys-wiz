// -----------------------------------------------------------------------------
// The scenes built into WiZ lights (`sceneId` of setPilot / getPilot), with
// the lists each kind of light accepts. Ids and lists come from pywizlight
// (scenes.py, MIT), the names follow the WiZ app in each language.
//
// Left out on purpose: Rhythm (1000, a schedule of the WiZ app, not a scene
// one can start) and the custom modes (256-265, set up per light in the app).
// The ids are stored in feature options, widget settings and scenes:
// permanent.
// -----------------------------------------------------------------------------

export const SCENES = [
  { id: 1, names: { en: 'Ocean', fr: 'Océan', de: 'Ozean', es: 'Océano' } },
  { id: 2, names: { en: 'Romance', fr: 'Romance', de: 'Romantik', es: 'Romance' } },
  {
    id: 3,
    names: { en: 'Sunset', fr: 'Coucher de soleil', de: 'Sonnenuntergang', es: 'Puesta de sol' },
  },
  { id: 4, names: { en: 'Party', fr: 'Fête', de: 'Party', es: 'Fiesta' } },
  { id: 5, names: { en: 'Fireplace', fr: 'Cheminée', de: 'Kamin', es: 'Chimenea' } },
  { id: 6, names: { en: 'Cozy', fr: 'Cosy', de: 'Gemütlich', es: 'Acogedor' } },
  { id: 7, names: { en: 'Forest', fr: 'Forêt', de: 'Wald', es: 'Bosque' } },
  {
    id: 8,
    names: {
      en: 'Pastel colors',
      fr: 'Couleurs pastel',
      de: 'Pastellfarben',
      es: 'Colores pastel',
    },
  },
  { id: 9, names: { en: 'Wake-up', fr: 'Réveil', de: 'Aufwachen', es: 'Despertar' } },
  { id: 10, names: { en: 'Bedtime', fr: 'Coucher', de: 'Schlafenszeit', es: 'Hora de dormir' } },
  { id: 11, names: { en: 'Warm white', fr: 'Blanc chaud', de: 'Warmweiß', es: 'Blanco cálido' } },
  { id: 12, names: { en: 'Daylight', fr: 'Lumière du jour', de: 'Tageslicht', es: 'Luz de día' } },
  { id: 13, names: { en: 'Cool white', fr: 'Blanc froid', de: 'Kaltweiß', es: 'Blanco frío' } },
  { id: 14, names: { en: 'Night light', fr: 'Veilleuse', de: 'Nachtlicht', es: 'Luz nocturna' } },
  { id: 15, names: { en: 'Focus', fr: 'Concentration', de: 'Fokus', es: 'Concentración' } },
  { id: 16, names: { en: 'Relax', fr: 'Détente', de: 'Entspannung', es: 'Relajación' } },
  {
    id: 17,
    names: { en: 'True colors', fr: 'Vraies couleurs', de: 'Echte Farben', es: 'Colores reales' },
  },
  { id: 18, names: { en: 'TV time', fr: 'Télévision', de: 'Fernsehzeit', es: 'Hora de la tele' } },
  {
    id: 19,
    names: {
      en: 'Plant growth',
      fr: 'Croissance des plantes',
      de: 'Pflanzenwachstum',
      es: 'Crecimiento de plantas',
    },
  },
  { id: 20, names: { en: 'Spring', fr: 'Printemps', de: 'Frühling', es: 'Primavera' } },
  { id: 21, names: { en: 'Summer', fr: 'Été', de: 'Sommer', es: 'Verano' } },
  { id: 22, names: { en: 'Fall', fr: 'Automne', de: 'Herbst', es: 'Otoño' } },
  { id: 23, names: { en: 'Deep dive', fr: 'Plongée', de: 'Tiefsee', es: 'Inmersión' } },
  { id: 24, names: { en: 'Jungle', fr: 'Jungle', de: 'Dschungel', es: 'Selva' } },
  { id: 25, names: { en: 'Mojito', fr: 'Mojito', de: 'Mojito', es: 'Mojito' } },
  { id: 26, names: { en: 'Club', fr: 'Club', de: 'Club', es: 'Club' } },
  { id: 27, names: { en: 'Christmas', fr: 'Noël', de: 'Weihnachten', es: 'Navidad' } },
  { id: 28, names: { en: 'Halloween', fr: 'Halloween', de: 'Halloween', es: 'Halloween' } },
  {
    id: 29,
    names: { en: 'Candlelight', fr: 'Bougie', de: 'Kerzenlicht', es: 'Luz de velas' },
  },
  {
    id: 30,
    names: { en: 'Golden white', fr: 'Blanc doré', de: 'Goldweiß', es: 'Blanco dorado' },
  },
  { id: 31, names: { en: 'Pulse', fr: 'Pulsation', de: 'Puls', es: 'Pulso' } },
  { id: 32, names: { en: 'Steampunk', fr: 'Steampunk', de: 'Steampunk', es: 'Steampunk' } },
  { id: 33, names: { en: 'Diwali', fr: 'Diwali', de: 'Diwali', es: 'Diwali' } },
  { id: 34, names: { en: 'White', fr: 'Blanc', de: 'Weiß', es: 'Blanco' } },
  { id: 35, names: { en: 'Alarm', fr: 'Alarme', de: 'Alarm', es: 'Alarma' } },
  {
    id: 36,
    names: { en: 'Snowy sky', fr: 'Ciel enneigé', de: 'Schneehimmel', es: 'Cielo nevado' },
  },
  {
    id: 40,
    names: {
      en: 'Dim to warm',
      fr: 'Variation chaude',
      de: 'Warm dimmen',
      es: 'Atenuación cálida',
    },
  },
];

// Scenes a tunable white or a dimmable white light accepts (pywizlight
// TW_SCENES and DW_SCENES); a colour light accepts them all.
export const TUNABLE_WHITE_SCENE_IDS = [
  6, 9, 10, 11, 12, 13, 14, 15, 16, 18, 29, 30, 31, 32, 33, 35, 40,
];
export const DIMMABLE_WHITE_SCENE_IDS = [9, 10, 14, 29, 31, 32, 34, 35];

export const SCENE_IDS = SCENES.map((scene) => scene.id);

/** The scene of an id, or null. */
export function sceneById(id) {
  const number = Number(id);
  return SCENES.find((scene) => scene.id === number) ?? null;
}

/** Name of a scene in a language (English for an unknown language). */
export function sceneName(scene, language) {
  return scene.names[language] ?? scene.names.en;
}

/**
 * A scene from what a user typed or chose: its id, or its name in any of the
 * four languages (any case, accents ignored).
 */
export function findScene(reference) {
  if (reference === undefined || reference === null) {
    return null;
  }
  const text = String(reference).trim();
  if (text === '') {
    return null;
  }
  if (/^\d+$/.test(text)) {
    return sceneById(text);
  }
  const wanted = fold(text);
  return (
    SCENES.find((scene) => Object.values(scene.names).some((name) => fold(name) === wanted)) ?? null
  );
}

const fold = (text) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\s-]+/g, ' ')
    .toLowerCase()
    .trim();
