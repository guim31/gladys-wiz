# WiZ fixtures

Real answers of WiZ devices to the local UDP protocol (`getSystemConfig`,
`getModelConfig`, `getUserConfig`, `getPower`), taken from the test suite of
[pywizlight](https://github.com/sbidy/pywizlight) (`pywizlight/tests/fake_bulb.py`,
MIT License, © Stephan Traub and contributors), where they were recorded on the
devices. An answer missing there is the device's own "Method not found" error,
as older firmware sends it.

The `getPilot` answers follow the format of the real ones in pywizlight and in
the Home Assistant `wiz` tests (Apache License 2.0): white, colour and scene
states written for each kind of device.

Anonymized: the MAC addresses are invented (`a8bb5000000x`), the WiZ home and
room ids are set to 0.
