# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: none. The WiZ local protocol has no password nor key, and the
  integration asks for no account.
- **Stored in `/data`**: `wiz-state.json`, the WiZ devices seen so far: their
  MAC and IP addresses, module name, firmware version and white range.
  Nothing else (the WiZ home and room ids the devices report are not kept).
- **Network**: JSON datagrams on UDP port 38899, only to the WiZ devices of
  the local network (the addresses found by the discovery or typed in the
  configuration). The discovery broadcast is emitted by the Gladys core on
  the integration's behalf, on that port only (manifest `network_discovery`).
  The integration opens no listening port, asks the devices for no push
  updates (`registration` is only sent with `register: false`) and calls no
  cloud service.

Anyone on the local network can drive WiZ devices the same way while _Allow
local communication_ is on in the WiZ app: this is how WiZ works, not
something the integration adds.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the WiZ devices and app, and the other devices of your network.
