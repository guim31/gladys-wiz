# WiZ for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for
[WiZ](https://www.wizconnected.com) lights and smart plugs (WiZ, Philips Smart
LED Wi-Fi): bulbs, filament bulbs, light strips, lamps and plugs, driven over
the local network with the WiZ UDP protocol. No account, no cloud.

> **Developed without the hardware: feedback welcome.** Everything was built
> and tested against real answers of WiZ devices (recorded by the pywizlight
> project) and against a simulated device, not against a real bulb. Please
> report what works and what does not on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-wiz/issues).

## Features

- **Automatic discovery**: Gladys broadcasts the WiZ discovery request on the
  local network for the integration, every device answers with its MAC
  address. IP addresses can be typed for the devices on another network.
- **One Gladys device per light or plug**, with only what the model can do:
  - on/off and brightness for every light;
  - colour for colour bulbs and strips;
  - white in kelvins, within the range of the model, for colour and tunable
    white lights;
  - the WiZ scenes the light can run (37 on a colour light, 17 on a tunable
    white one, 8 on a filament bulb), as a list, and their speed;
  - on/off for plugs, and the power draw of the plugs that measure it.
- **Follows the changes made elsewhere** (WiZ app, remote, schedule, wall
  switch) within the refresh interval, 15 seconds by default.
- **Dashboard widget** _WiZ_: up to three favourite scene buttons, the current
  scene or white, an on/off button.
- **Scene trigger** _WiZ device switched outside Gladys_: on or off, from the
  WiZ app, a remote or a schedule, or by a wall switch or a power cut.
- **Scene action** _Start a WiZ scene_, with an optional brightness and speed.
- English, French, German and Spanish, in the interface, the device names and
  the [documentation](docs/en.md) ([fr](docs/fr.md), [de](docs/de.md),
  [es](docs/es.md)).

## Requirements

- Gladys Assistant **5.1.0** or later.
- WiZ devices set up in the WiZ app, on the network of Gladys, with **Allow
  local communication** turned on (WiZ app → Settings → Security).

## Installation

In Gladys, open **Integrations**, then **Install from GitHub**, and enter the
address of this repository:

```
https://github.com/guim31/gladys-wiz
```

Then open the **Discover** tab of the integration and add the devices. The
[documentation](docs/en.md) details the options, the widget and the scenes.

## How it works

- The WiZ local protocol is JSON over UDP, port 38899: `getPilot` (state),
  `setPilot` (command), `getSystemConfig` (MAC, module, firmware),
  `getModelConfig` (white range, firmware 1.22+) or `getUserConfig` (older
  firmware), `getPower` (plugs with a meter). Every request is sent again
  with a growing delay until the device answers, like pywizlight does.
- The integration runs in an isolated container on a Docker bridge: a
  broadcast it sent would never reach the LAN. The **discovery broadcast** is
  sent by the Gladys core (`udp-active-broadcast` mediated discovery, port
  38899 declared in the manifest): the integration forges the request (a
  `registration` with `register: false`, as pywizlight sends it) and reads the
  replies the core relays. The devices are then reached in unicast.
- **Polling, not push**: a WiZ device can push its changes (`syncPilot`) after
  a `registration`, but only to the IP address given in it, port 38900. The
  container has a private address on the Docker bridge that the LAN cannot
  reach, and Gladys publishes no port for it: the integration reads each
  device itself at the configured interval (`should_poll: false` for Gladys).
- A device that stops answering two readings in a row is unreachable: shown
  off (most often a wall switch), with the _unreachable_ badge, and the trigger
  fires with the origin `power`. When it answers again and is on, the trigger
  fires again.
- A plain RGB colour is sent as pywizlight sends it (the saturated hue on the
  RGB LEDs plus warm white for the paler shades), and the reverse conversion
  shows the colour back in Gladys.
- Each device is identified by its MAC address: a device that changes IP
  address (DHCP) keeps its Gladys device. The devices seen are kept in
  `/data/wiz-state.json`, so they are known at once after a restart.

## Checked, and what was not

Checked:

- every kind of device of the fixtures (16 real configuration answers, from
  firmware 1.8 to 1.35: colour bulbs and strips, tunable white and filament
  bulbs, a wall dimmer, a ceiling fan light, plugs with and without a meter)
  against the rules of the Gladys core (feature couples, bounds, units, poll
  frequencies) in the four languages;
- the whole integration against the fake Gladys of the SDK;
- the Docker image in the Gladys sandbox constraints (read-only root
  filesystem, no capabilities, 256 MB), its UDP client against a simulated
  WiZ device on a Docker bridge network.

Not checked, for want of hardware or of a Gladys instance:

- a real WiZ device: the exact answer of each firmware to `setPilot`, the
  pace at which a real bulb accepts commands, the readings of a real power
  meter;
- the discovery broadcast through a real Gladys core on a real LAN;
- the rendering of the widget and of the scene cards in the Gladys interface.

## Limitations

- Changes made outside Gladys are seen at the next reading (5 to 60 s).
- A wall switch is detected as a device that no longer answers (two
  readings); a Wi-Fi outage looks the same.
- Ceiling fans: the light only. Dual-head lamps: one light. The Rhythm and the
  custom modes of the WiZ app are not offered. WiZ motion sensors and remotes
  are not exposed as devices.
- The manual addresses must be IPv4 addresses (WiZ devices announce no name).

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

`tools/fake-wiz.mjs` is a small simulated WiZ device answering on UDP port
38899, to try the integration without a bulb (see [CLAUDE.md](CLAUDE.md)).

## Credits

- [pywizlight](https://github.com/sbidy/pywizlight) (MIT License, © Stephan
  Traub and contributors): the protocol, the table of device kinds, the scene
  list, the colour conversion, and the real device answers used as test
  fixtures.
- The [Home Assistant WiZ integration](https://github.com/home-assistant/core/tree/dev/homeassistant/components/wiz)
  (Apache License 2.0): the discovery and polling choices, and test states.
- Cover: the WiZ logo from [wizconnected.com](https://www.wizconnected.com),
  on the navy of the brand.
- Built from the official
  [Gladys integration template](https://github.com/GladysAssistant/integration-template-js).

## Disclaimer

This project is not affiliated with, endorsed by or connected to WiZ, Signify
or Philips. WiZ is a trademark of Signify Holding.

## License

[Apache License 2.0](LICENSE).
