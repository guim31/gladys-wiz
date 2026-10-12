# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-12

### Added

- One Gladys device per WiZ light or plug (bulbs, filament bulbs, light
  strips, lamps, Philips Smart LED Wi-Fi), found automatically on the local
  network through Gladys, or by IP address. No account, no cloud.
- Only what the model can do: on/off, brightness, colour, white within the
  range of the model, the WiZ scenes the light can run (37 on a colour light,
  17 on a tunable white one, 8 on a filament bulb) and their speed; on/off
  and power draw for the plugs that measure it.
- Changes made from the WiZ app, a remote or a wall switch reach Gladys within
  the refresh interval (15 seconds by default, 5 to 60). A light switched off
  at the wall is shown off and unreachable.
- A "WiZ" dashboard widget: up to three favourite scene buttons, the current
  scene or white, and an on/off button.
- Scene trigger "WiZ device switched outside Gladys", filtered by device,
  on/off and origin (WiZ app, remote or schedule; wall switch or power cut).
- Scene action "Start a WiZ scene", with an optional brightness and speed.
- A "Search for WiZ devices" button in the Configuration screen.
- Device and feature names, interface texts and documentation in English,
  French, German and Spanish; names in French by default.

[Unreleased]: https://github.com/guim31/gladys-wiz/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-wiz/releases/tag/v1.0.0
