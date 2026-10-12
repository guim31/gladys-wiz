// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status and the "Search for WiZ devices" report. Four languages,
// the four of the Gladys interface; German says "du", Spanish "usted".
// test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

// Shown by Gladys under the integration name when it is not connected.
export const CONNECTION_TEXT = {
  noDevice: {
    en: 'No WiZ device found. Check that it is on the same network as Gladys, or enter its IP address.',
    fr: "Aucun appareil WiZ trouvé. Vérifiez qu'il est sur le même réseau que Gladys, ou saisissez son adresse IP.",
    de: 'Kein WiZ-Gerät gefunden. Prüfe, ob es im selben Netzwerk wie Gladys ist, oder gib seine IP-Adresse ein.',
    es: 'No se ha encontrado ningún dispositivo WiZ. Compruebe que está en la misma red que Gladys o introduzca su dirección IP.',
  },
  noAnswer: {
    en: 'No WiZ device answers.',
    fr: 'Aucun appareil WiZ ne répond.',
    de: 'Kein WiZ-Gerät antwortet.',
    es: 'Ningún dispositivo WiZ responde.',
  },
};

const MAX_LISTED = 8;

// The pieces of the "Search" report, one table per language.
export const SEARCH_TEXT = {
  en: {
    none: 'No WiZ device found.',
    count: (total, reachable) => `${total} device(s), ${reachable} answering:`,
    unreachable: 'not answering',
    unavailable:
      'Automatic discovery through Gladys is unavailable (Gladys 5.1 or later needed): enter the IP addresses.',
    busy: 'A search has just run: the automatic discovery is available again in 10 seconds.',
    ignored: (list) => `Ignored addresses: ${list}.`,
  },
  fr: {
    none: 'Aucun appareil WiZ trouvé.',
    count: (total, reachable) => `${total} appareil(s), ${reachable} répondent :`,
    unreachable: 'ne répond pas',
    unavailable:
      'La découverte automatique par Gladys est indisponible (Gladys 5.1 ou plus récent) : saisissez les adresses IP.',
    busy: 'Une recherche vient de tourner : la découverte automatique est de nouveau possible dans 10 secondes.',
    ignored: (list) => `Adresses ignorées : ${list}.`,
  },
  de: {
    none: 'Kein WiZ-Gerät gefunden.',
    count: (total, reachable) => `${total} Gerät(e), davon ${reachable} erreichbar:`,
    unreachable: 'antwortet nicht',
    unavailable:
      'Die automatische Erkennung über Gladys ist nicht verfügbar (Gladys 5.1 oder neuer nötig): Gib die IP-Adressen ein.',
    busy: 'Gerade lief eine Suche: Die automatische Erkennung ist in 10 Sekunden wieder möglich.',
    ignored: (list) => `Ignorierte Adressen: ${list}.`,
  },
  es: {
    none: 'No se ha encontrado ningún dispositivo WiZ.',
    count: (total, reachable) => `${total} dispositivo(s), ${reachable} responden:`,
    unreachable: 'no responde',
    unavailable:
      'El descubrimiento automático a través de Gladys no está disponible (se necesita Gladys 5.1 o posterior): introduzca las direcciones IP.',
    busy: 'Se acaba de realizar una búsqueda: el descubrimiento automático vuelve a estar disponible en 10 segundos.',
    ignored: (list) => `Direcciones ignoradas: ${list}.`,
  },
};

/** The report shown under the "Search" button, in every language. */
export function searchMessage(summary) {
  return Object.fromEntries(
    Object.entries(SEARCH_TEXT).map(([language, text]) => [
      language,
      searchReport(summary, text, language),
    ]),
  );
}

function searchReport({ devices, scan, invalidHosts }, text, language) {
  const lines = [];
  if (devices.length === 0) {
    lines.push(text.none);
  } else {
    const reachable = devices.filter((device) => device.reachable).length;
    lines.push(text.count(devices.length, reachable));
    // The first ones: the message stays readable under the button.
    const list = devices
      .slice(0, MAX_LISTED)
      .map(
        ({ names, host, module, reachable: up }) =>
          `${names[language]} (${host}${module ? `, ${module}` : ''}${up ? '' : `, ${text.unreachable}`})`,
      );
    lines.push(`${list.join(', ')}${devices.length > MAX_LISTED ? '…' : '.'}`);
  }
  if (scan === 'unavailable') {
    lines.push(text.unavailable);
  } else if (scan === 'busy') {
    lines.push(text.busy);
  }
  if (invalidHosts.length > 0) {
    lines.push(text.ignored(invalidHosts.slice(0, 3).join(', ')));
  }
  return lines.join(' ');
}
