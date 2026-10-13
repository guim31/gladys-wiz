// -----------------------------------------------------------------------------
// The WiZ hub: finds the devices, reads them at the configured pace, publishes
// their devices and states to Gladys, runs the commands and fires the scene
// trigger.
//
// Polling only: a WiZ device can push its changes (`syncPilot`) after a
// `registration`, but it sends them to the address given in the registration,
// port 38900. The integration container has a private address on a Docker
// bridge, which the devices of the LAN cannot reach, and Gladys publishes no
// port for it. So the hub reads every device itself (getPilot), every 15 s by
// default; Gladys never polls these devices (should_poll: false).
// -----------------------------------------------------------------------------

import { GladysApiError, createLogger } from '@gladysassistant/integration-sdk';
import {
  FEATURE_KEYS,
  NO_SCENE,
  applyCommand,
  buildDevice,
  commandFor,
  deviceIds,
  deviceName,
  deviceValues,
  featureSpecs,
} from './devices.js';
import { mapLimit, parseScanReplies, scanRequest } from './discovery.js';
import { LANGUAGES } from './config.js';
import { ProblemLog } from './problems.js';
import { CONNECTION_TEXT } from './texts.js';
import {
  DIMMING_MAX,
  DIMMING_MIN,
  SPEED_MAX,
  SPEED_MIN,
  capabilitiesOf,
  clamp,
  normalizeMac,
} from './wiz/model.js';
import { findScene } from './wiz/scenes.js';

const logger = createLogger({ name: 'wiz-hub' });

export const WIDGET_KEY = 'wiz';
export const TRIGGER = 'switched_outside_gladys';
// Where a change seen by the hub came from (the trigger `source` filter).
export const SOURCES = {
  // The WiZ app, a WiZ remote, a WiZ schedule, a voice assistant...
  WIZ: 'wiz',
  // The device lost its power (wall switch, power cut) or got it back.
  POWER: 'power',
};

export const HUB_TIMINGS = {
  // New scan, to follow DHCP changes and find new devices (Home Assistant
  // does the same every 15 minutes).
  rediscoveryMs: 15 * 60_000,
  // Polls in a row without answer before a device is "unreachable".
  unreachableAfter: 2,
};

const PROBE_CONCURRENCY = 8;
const POLL_CONCURRENCY = 8;
// Changes of these features change what the widget shows.
const WIDGET_KEYS = [
  FEATURE_KEYS.POWER,
  FEATURE_KEYS.SCENE,
  FEATURE_KEYS.COLOR,
  FEATURE_KEYS.TEMPERATURE,
];

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/**
 * Gladys refused a call or did not answer (restart, network, rate limit): a
 * passing condition, unlike a bug in the integration.
 */
const isGladysFailure = (err) =>
  err instanceof GladysApiError ||
  err?.name === 'TimeoutError' ||
  err?.name === 'AbortError' ||
  (err instanceof TypeError && err.message === 'fetch failed');

/** "fetch failed (ECONNREFUSED)": the low-level code Node hides in `cause`. */
const describe = (err) => {
  const code = err?.cause?.code;
  return code && !err.message.includes(code) ? `${err.message} (${code})` : err.message;
};

const isGiven = (value) => value !== undefined && value !== null && String(value).trim() !== '';

export class WizHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake)
   * @param {object} options.store persistence (src/store.js)
   * @param {object} options.transport WizTransport
   * @param {boolean} [options.timers] periodic timers (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   */
  constructor({ gladys, store, transport, timers = true, timings }) {
    this.gladys = gladys;
    this.store = store;
    this.transport = transport;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.config = null;
    /** @type {Map<string, object>} device records, by MAC address */
    this.records = new Map();
    this.pending = new Set();
    this.pollTimer = null;
    this.rediscoveryTimer = null;
    this.polling = null;
    this.discovering = null;
    this.lastScan = { status: 'not-run', found: 0 };
    this.stopped = false;
    // Repeated failures (Gladys refusing, a device answering errors): one
    // line when they start and one when they end.
    this.problems = new ProblemLog(logger);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    this.config = config;
    await this.restore();
    await this.discover();
    await this.publishDevices();
    await this.publishAllStates();
    await this.publishTransports();
    await this.publishConnectionStatus();
    this.requestWidgetRefresh();
    this.startTimers();
  }

  /** Gladys came back (restart, network): it may have lost what was published. */
  async resync(config) {
    this.config = config;
    this.gladys.forgetPublishedStates();
    for (const record of this.records.values()) {
      record.published = {};
    }
    await this.publishDevices();
    await this.publishAllStates();
    await this.publishTransports();
    await this.publishConnectionStatus();
    this.gladysRecovered();
    this.requestWidgetRefresh();
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    if (!previous || previous.hosts.join(',') !== config.hosts.join(',')) {
      await this.discover();
    }
    if (previous && previous.pollSeconds !== config.pollSeconds) {
      this.startTimers();
    }
    // New devices, or names in another language for the Discovery list.
    await this.publishDevices();
    await this.publishAllStates();
    await this.publishTransports();
    await this.publishConnectionStatus();
    this.requestWidgetRefresh();
  }

  startTimers() {
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    clearInterval(this.pollTimer);
    clearInterval(this.rediscoveryTimer);
    this.pollTimer = setInterval(() => this.track(this.pollAll()), this.config.pollSeconds * 1000);
    this.rediscoveryTimer = setInterval(
      () => this.track(this.rediscover()),
      this.timings.rediscoveryMs,
    );
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.pollTimer);
    clearInterval(this.rediscoveryTimer);
    await this.idle();
    this.transport.close();
    await this.store.flush();
  }

  /** Keep track of background work, so the tests (and stop) can wait for it. */
  track(promise) {
    const tracked = Promise.resolve(promise)
      .catch((err) => this.backgroundFailed(err))
      .finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
    return tracked;
  }

  /**
   * A periodic task failed. Gladys refusing or away is said once until it
   * accepts again; a bug is logged with its stack, once per message.
   */
  backgroundFailed(err) {
    if (isGladysFailure(err)) {
      this.problems.fail('gladys', `Gladys does not take the WiZ updates: ${describe(err)}`);
    } else {
      this.problems.fail(`bug:${err?.message}`, 'Background task failed', 'error', err);
    }
  }

  gladysRecovered() {
    this.problems.recover('gladys', 'Gladys takes the WiZ updates again');
  }

  /** Resolves once no background work is left. */
  async idle() {
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
  }

  // --- Persistence -----------------------------------------------------------

  async restore() {
    const data = await this.store.load();
    for (const [key, saved] of Object.entries(data.devices ?? {})) {
      const mac = normalizeMac(key);
      if (!mac || !saved || typeof saved.host !== 'string' || !saved.system) {
        continue;
      }
      const record = this.createRecord(mac, saved.host);
      Object.assign(record, {
        system: saved.system,
        model: saved.model ?? null,
        user: saved.user ?? null,
        hasPower: saved.power === true,
      });
      record.caps = capabilitiesOf({ ...record, power: record.hasPower });
      if (record.caps) {
        this.records.set(mac, record);
      }
    }
  }

  save() {
    const devices = {};
    for (const record of this.records.values()) {
      devices[record.mac] = {
        host: record.host,
        system: record.system,
        model: record.model,
        user: record.user,
        power: record.hasPower,
      };
    }
    return this.store.save({ devices });
  }

  // --- Discovery -------------------------------------------------------------

  createRecord(mac, host) {
    return {
      mac,
      host,
      system: null,
      model: null,
      user: null,
      hasPower: false,
      caps: null,
      pilot: null,
      watts: null,
      // null until the first answer or the first scan without one.
      reachable: null,
      failures: 0,
      // Bumped on every command: a poll started before it is stale.
      commandSeq: 0,
      sentColor: null,
      // Last values published, by feature key (for the widget nudges).
      published: {},
    };
  }

  /**
   * Scan through the Gladys core, then probe the typed, found and known
   * addresses. Resolves with the number of devices answering.
   */
  discover() {
    this.discovering ??= this.runDiscovery().finally(() => {
      this.discovering = null;
    });
    return this.discovering;
  }

  async runDiscovery() {
    // Priority when one device answers on several addresses: the typed one,
    // then the one the scan found, then the one known from before.
    const hosts = [];
    const add = (host) => {
      if (!hosts.includes(host)) {
        hosts.push(host);
      }
    };
    this.config.hosts.forEach(add);
    (await this.scan()).forEach((found) => add(found.host));
    [...this.records.values()].forEach((record) => add(record.host));

    const results = await mapLimit(hosts, PROBE_CONCURRENCY, (host) => this.probe(host));
    const answers = new Map();
    results.forEach((result, index) => {
      if (result.error) {
        logger.debug(`No WiZ answer from ${hosts[index]}: ${result.error.message}`);
      } else if (!answers.has(result.value.mac)) {
        answers.set(result.value.mac, result.value);
      }
    });
    for (const answer of answers.values()) {
      const record = this.adopt(answer);
      // States, reachability and the trigger follow the usual path.
      await this.applyReading(record, answer.pilot, answer.watts);
    }
    for (const record of this.records.values()) {
      if (!answers.has(record.mac) && record.reachable === null) {
        // Known from /data, silent since the start: unreachable, no event.
        record.reachable = false;
      }
    }
    await this.save();
    return answers.size;
  }

  /** One discovery broadcast through the Gladys core: `[{ host, mac }]`. */
  async scan() {
    try {
      const found = parseScanReplies(
        await this.gladys.scanNetwork('udp-active-broadcast', scanRequest()),
      );
      this.lastScan = { status: 'ok', found: found.length };
      this.problems.recover('scan', 'WiZ discovery through Gladys works again');
      return found;
    } catch (err) {
      // 403: a core without mediated discovery; 429 or 409: a scan ran less
      // than 10 s ago. The typed and known addresses still work.
      // Said once, not at every rediscovery; "busy" passes by itself.
      const status = err.status === 429 || err.status === 409 ? 'busy' : 'unavailable';
      const message = `WiZ discovery through Gladys failed: ${describe(err)}`;
      if (status === 'busy') {
        logger.debug(message);
      } else {
        this.problems.fail('scan', message);
      }
      this.lastScan = { status, found: 0 };
      return [];
    }
  }

  /**
   * Ask one address what it is: `{ host, mac, system, model, user, hasPower,
   * caps, pilot, watts }`. The configuration answers of a device already
   * known (same module, same firmware) are not asked again.
   */
  async probe(host) {
    // Only what tells the model: the WiZ home and room ids are left out.
    const system = pick(await this.transport.request(host, 'getSystemConfig'), SYSTEM_KEYS);
    const mac = normalizeMac(system.mac);
    if (!mac) {
      throw new Error(`${host} answered without a MAC address`);
    }
    const known = this.records.get(mac);
    let { model, user, hasPower } = known ?? { model: null, user: null, hasPower: false };
    const sameFirmware =
      known?.system?.moduleName === system.moduleName &&
      known?.system?.fwVersion === system.fwVersion;
    if (!sameFirmware) {
      model = await this.optional(host, 'getModelConfig');
      // Firmware older than 1.22 has no getModelConfig: the white range is
      // in the user configuration.
      user = Array.isArray(model?.cctRange) ? null : await this.optional(host, 'getUserConfig');
      hasPower = false;
    }
    let caps = capabilitiesOf({ system, model, user, power: hasPower });
    if (!caps) {
      throw new Error(`${host} is a WiZ device of an unknown kind (${system.moduleName ?? '?'})`);
    }
    let watts = null;
    if (caps.kind === 'socket' && !sameFirmware) {
      // Only the plugs with a meter answer getPower with a value.
      watts = readWatts(await this.optional(host, 'getPower'));
      hasPower = watts !== null;
      caps = capabilitiesOf({ system, model, user, power: hasPower });
    } else if (caps.power) {
      watts = readWatts(await this.optional(host, 'getPower'));
    }
    const pilot = await this.transport.request(host, 'getPilot');
    return { host, mac, system, model, user, hasPower, caps, pilot, watts };
  }

  /** A method older firmware may not have: null instead of an error. */
  async optional(host, method) {
    try {
      return await this.transport.request(host, method);
    } catch (err) {
      if (err.kind === 'method-not-found') {
        return null;
      }
      throw err;
    }
  }

  /** Take a probe answer: a new device is added, a known one may have moved. */
  adopt(answer) {
    let record = this.records.get(answer.mac);
    if (!record) {
      record = this.createRecord(answer.mac, answer.host);
      this.records.set(answer.mac, record);
      logger.info(
        `WiZ ${answer.caps.module ?? answer.caps.kind} ${answer.mac} found at ${answer.host}`,
      );
    } else if (record.host !== answer.host) {
      logger.info(`WiZ device ${answer.mac} moved from ${record.host} to ${answer.host}`);
    }
    Object.assign(record, {
      host: answer.host,
      system: answer.system,
      model: answer.model,
      user: answer.user,
      hasPower: answer.hasPower,
      caps: answer.caps,
    });
    return record;
  }

  async rediscover() {
    await this.discover();
    // New devices, and new addresses (DHCP) for the params of the created
    // devices.
    await this.publishDevices();
    await this.publishTransports();
    await this.publishConnectionStatus();
    this.gladysRecovered();
  }

  // --- Devices ---------------------------------------------------------------

  async publishDevices() {
    const devices = [...this.records.values()].map((record) =>
      buildDevice(this.gladys, record, this.config.language),
    );
    await this.gladys.publishDiscoveredDevices(devices);
  }

  /** The record behind a Gladys device external id, or null. */
  resolveDevice(externalId) {
    if (typeof externalId !== 'string') {
      return null;
    }
    const prefix = deviceIds(this.gladys, '').device;
    if (!externalId.startsWith(prefix)) {
      return null;
    }
    return this.records.get(externalId.slice(prefix.length)) ?? null;
  }

  isCreated(record) {
    const id = deviceIds(this.gladys, record.mac).device;
    return (this.gladys.devices ?? []).some((device) => device.external_id === id);
  }

  require(externalId) {
    const record = this.resolveDevice(externalId);
    if (!record) {
      throw new Error(`Unknown WiZ device ${externalId}`);
    }
    return record;
  }

  // --- States ----------------------------------------------------------------

  /**
   * Publish what changed for one device, if the user created it (Gladys
   * caps states at 300 a minute and re-evaluates scenes on each one).
   * Resolves with the keys that changed.
   */
  async publishStates(record) {
    if (!record.caps || !this.isCreated(record)) {
      return [];
    }
    const ids = deviceIds(this.gladys, record.mac);
    const values = deviceValues(record);
    const states = [];
    const changed = [];
    for (const spec of featureSpecs(record.caps, this.config.language)) {
      const value = values[spec.key];
      if (value === undefined) {
        continue;
      }
      states.push(
        typeof value === 'object'
          ? { device_feature_external_id: ids.feature(spec.key), text: value.text }
          : { device_feature_external_id: ids.feature(spec.key), state: value },
      );
      if (!sameValue(record.published[spec.key], value)) {
        changed.push(spec.key);
      }
    }
    // The SDK sends only the values that changed since its last publication.
    await this.gladys.publishChangedStates(states);
    for (const key of changed) {
      record.published[key] = values[key];
    }
    return changed;
  }

  async publishAllStates() {
    for (const record of this.records.values()) {
      try {
        await this.publishStates(record);
      } catch (err) {
        logger.debug(`Cannot publish the states of ${record.mac}: ${err.message}`);
        this.backgroundFailed(err);
      }
    }
  }

  /**
   * The user added a device: the states sent before were dropped by Gladys,
   * and so was the transport badge. Send them again, nudge the widget.
   */
  async onDeviceCreated(device) {
    const record = this.resolveDevice(device?.external_id);
    if (!record) {
      return;
    }
    record.published = {};
    this.gladys.forgetPublishedStates(device.external_id);
    await this.publishStates(record);
    await this.publishTransports([record]);
    this.requestWidgetRefresh();
  }

  async publishTransports(records = [...this.records.values()]) {
    const entries = records
      .filter((record) => this.isCreated(record))
      .map((record) => ({
        external_id: deviceIds(this.gladys, record.mac).device,
        transport: record.reachable === true ? 'local' : 'unreachable',
      }));
    for (let at = 0; at < entries.length; at += 100) {
      await this.gladys.publishTransports(entries.slice(at, at + 100));
    }
  }

  async publishConnectionStatus() {
    const records = [...this.records.values()];
    if (records.length === 0) {
      await this.gladys.setConnectionStatus(false, CONNECTION_TEXT.noDevice);
    } else if (!records.some((record) => record.reachable === true)) {
      await this.gladys.setConnectionStatus(false, CONNECTION_TEXT.noAnswer);
    } else {
      await this.gladys.setConnectionStatus(true);
    }
  }

  requestWidgetRefresh() {
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  // --- Polling -----------------------------------------------------------------

  /** Read every device once (the timer's job). */
  pollAll() {
    this.polling ??= mapLimit([...this.records.values()], POLL_CONCURRENCY, (record) =>
      this.refresh(record),
    )
      .then((results) => {
        // A device that does not answer is handled by refresh; what is left
        // is Gladys refusing the states (or a bug).
        const errors = results.filter((result) => result.error).map((result) => result.error);
        errors.forEach((err) => this.backgroundFailed(err));
        if (errors.length === 0) {
          this.gladysRecovered();
        }
      })
      .finally(() => {
        this.polling = null;
      });
    return this.polling;
  }

  /** Read one device and publish what changed. */
  async refresh(record) {
    const seq = record.commandSeq;
    let pilot;
    let watts = null;
    try {
      pilot = await this.transport.request(record.host, 'getPilot');
      if (record.caps?.power) {
        watts = readWatts(await this.optional(record.host, 'getPower'));
      }
    } catch (err) {
      if (err.unreachable) {
        await this.failed(record);
      } else {
        this.problems.fail(`read:${record.mac}`, `Cannot read ${record.host}: ${err.message}`);
      }
      return;
    }
    this.problems.recover(`read:${record.mac}`, `${this.label(record)} reads again`);
    if (seq !== record.commandSeq) {
      // A Gladys command ran meanwhile: this reading may predate it.
      return;
    }
    await this.applyReading(record, pilot, watts);
  }

  /**
   * A fresh getPilot: publish what changed, follow the reachability, fire the
   * trigger when the light was switched outside Gladys.
   */
  async applyReading(record, pilot, watts, { own = false } = {}) {
    const wasOn = record.pilot?.state;
    const cameBack = record.reachable === false;
    record.pilot = pilot && typeof pilot === 'object' ? pilot : {};
    if (watts !== null && watts !== undefined) {
      record.watts = watts;
    }
    record.failures = 0;
    if (record.reachable !== true) {
      record.reachable = true;
      logger.info(`${this.label(record)} answers at ${record.host}`);
      await this.publishTransports([record]);
      await this.publishConnectionStatus();
      this.requestWidgetRefresh();
    }
    const isOn = record.pilot.state;
    if (own) {
      // A Gladys command: a scene bound to the trigger must not loop.
    } else if (typeof isOn === 'boolean' && typeof wasOn === 'boolean' && isOn !== wasOn) {
      // Back from a power cut: the WiZ devices light up when powered.
      this.fireSwitched(record, isOn, cameBack ? SOURCES.POWER : SOURCES.WIZ);
    } else if (cameBack && isOn === true && wasOn === undefined) {
      this.fireSwitched(record, true, SOURCES.POWER);
    }
    const changed = await this.publishStates(record);
    if (changed.some((key) => WIDGET_KEYS.includes(key))) {
      this.requestWidgetRefresh();
    }
  }

  /**
   * A poll without answer. After a few in a row the device is unreachable:
   * most often switched off at the wall, so a light that was on is shown off.
   */
  async failed(record) {
    if (this.stopped) {
      return;
    }
    record.failures += 1;
    if (record.failures < this.timings.unreachableAfter || record.reachable === false) {
      return;
    }
    const known = record.reachable === true;
    record.reachable = false;
    logger.info(`${this.label(record)} no longer answers at ${record.host}`);
    if (known && record.pilot?.state === true) {
      record.pilot = { ...record.pilot, state: false };
      this.fireSwitched(record, false, SOURCES.POWER);
      await this.publishStates(record);
    }
    await this.publishTransports([record]);
    await this.publishConnectionStatus();
    this.requestWidgetRefresh();
  }

  fireSwitched(record, on, source) {
    if (!this.isCreated(record)) {
      return;
    }
    this.track(
      this.gladys.publishSceneEvent(TRIGGER, {
        device: deviceIds(this.gladys, record.mac).device,
        state: on ? 'on' : 'off',
        source,
      }),
    );
  }

  label(record) {
    return deviceName(record, 'en');
  }

  // --- Commands ----------------------------------------------------------------

  /** Send a setPilot, then publish the state it gives without waiting. */
  async send(record, params, { color } = {}) {
    record.commandSeq += 1;
    try {
      await this.transport.request(record.host, 'setPilot', params, {
        timeoutMs: this.transport.timings.commandTimeoutMs,
      });
    } catch (err) {
      if (err.unreachable) {
        await this.failed(record);
        throw new Error(`${this.label(record)} does not answer at ${record.host}`, { cause: err });
      }
      throw err;
    }
    record.sentColor =
      color === undefined
        ? params.sceneId !== undefined || params.temp !== undefined
          ? null
          : record.sentColor
        : { value: color, channels: { r: params.r, g: params.g, b: params.b, w: params.w } };
    // Read back at the next poll; the answer proves the device is there.
    await this.applyReading(record, applyCommand(record.pilot ?? {}, params), null, { own: true });
  }

  /** A Gladys command on a feature of one of the devices. */
  async setValue(device, feature, value) {
    const record = this.require(device?.external_id);
    const prefix = `${device.external_id}:`;
    const key = feature?.external_id?.startsWith(prefix)
      ? feature.external_id.slice(prefix.length)
      : null;
    const params = commandFor(record, key, value);
    if (params === null) {
      // "None" in the scene list: nothing to apply, show the real state back.
      delete record.published[FEATURE_KEYS.SCENE];
      this.gladys.forgetPublishedStates(feature.external_id);
      await this.publishStates(record);
      return;
    }
    await this.send(
      record,
      params,
      key === FEATURE_KEYS.COLOR ? { color: Number(value) } : undefined,
    );
  }

  /**
   * Start a WiZ scene, given by id or by name, with an optional brightness
   * (10-100 %) and speed (10-200 %).
   * @returns {object} the scene started
   */
  async startScene(deviceExternalId, { scene, brightness, speed }) {
    const record = this.require(deviceExternalId);
    const found = findScene(scene);
    if (!found) {
      throw new Error(`Unknown WiZ scene "${scene}"`);
    }
    if (!record.caps.scenes.includes(found.id)) {
      throw new Error(`${this.label(record)} cannot run the scene "${found.names.en}"`);
    }
    const params = { state: true, sceneId: found.id };
    if (isGiven(brightness) && Number.isFinite(Number(brightness))) {
      params.dimming = clamp(Math.round(Number(brightness)), DIMMING_MIN, DIMMING_MAX);
    }
    await this.send(record, params);
    if (isGiven(speed) && Number.isFinite(Number(speed)) && record.caps.speed) {
      // A separate setPilot: the firmware ignores a speed sent with a state.
      await this.send(record, { speed: clamp(Math.round(Number(speed)), SPEED_MIN, SPEED_MAX) });
    }
    return found;
  }

  /** Turn a device on or off (the widget's button). */
  async switchPower(deviceExternalId, on) {
    const record = this.require(deviceExternalId);
    await this.send(record, { state: on });
  }

  /** What the Configuration screen's "Search" action reports. */
  summary() {
    return {
      scan: this.lastScan.status,
      invalidHosts: this.config.invalidHosts,
      devices: [...this.records.values()].map((record) => ({
        names: Object.fromEntries(
          LANGUAGES.map((language) => [language, deviceName(record, language)]),
        ),
        host: record.host,
        module: record.caps?.module ?? null,
        reachable: record.reachable === true,
      })),
    };
  }
}

const SYSTEM_KEYS = ['mac', 'moduleName', 'fwVersion', 'typeId'];

function pick(object, keys) {
  return Object.fromEntries(keys.filter((key) => key in object).map((key) => [key, object[key]]));
}

/** Watts from a getPower answer (`power` in milliwatts), or null. */
function readWatts(result) {
  const milliwatts = result?.power;
  return typeof milliwatts === 'number' && Number.isFinite(milliwatts) ? milliwatts / 1000 : null;
}

export { NO_SCENE };
