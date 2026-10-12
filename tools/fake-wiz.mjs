// -----------------------------------------------------------------------------
// A simulated WiZ device on UDP port 38899, to try the integration without a
// bulb: it answers the methods of one fixture of test/fixtures/wiz (real
// answers recorded by pywizlight), applies setPilot to its state, and answers
// the discovery broadcast.
//
//   node tools/fake-wiz.mjs test/fixtures/wiz/color-bulb-esp01-shrgb-03-1.25.0.json
//
// Not part of the image: a development tool only.
// -----------------------------------------------------------------------------

import dgram from 'node:dgram';
import { readFileSync } from 'node:fs';

const [fixturePath, portArgument] = process.argv.slice(2);
if (!fixturePath) {
  console.error('Usage: node tools/fake-wiz.mjs <fixture.json> [port]');
  process.exit(2);
}
const answers = JSON.parse(readFileSync(fixturePath, 'utf8'));
const pilot = structuredClone(answers.getPilot.result);
const mac = answers.getSystemConfig.result.mac;
const port = Number(portArgument ?? 38899);

const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

function reply(request) {
  const { method, params = {} } = request;
  switch (method) {
    case 'getPilot':
      return { method, env: 'pro', result: pilot };
    case 'setPilot':
      Object.assign(pilot, params);
      return { method, env: 'pro', result: { success: true } };
    case 'registration':
      return { method, env: 'pro', result: { mac, success: true } };
    default:
      return (
        answers[method] ?? {
          method,
          env: 'pro',
          error: { code: -32601, message: 'Method not found' },
        }
      );
  }
}

socket.on('message', (message, remote) => {
  let request;
  try {
    request = JSON.parse(message.toString());
  } catch {
    socket.send(
      '{"env":"pro","error":{"code":-32700,"message":"Parse error"}}',
      remote.port,
      remote.address,
    );
    return;
  }
  console.log(`${remote.address}:${remote.port} -> ${JSON.stringify(request)}`);
  const answer = JSON.stringify(reply(request));
  socket.send(answer, remote.port, remote.address);
});

socket.bind(port, () => {
  console.log(
    `Fake WiZ ${answers.getSystemConfig.result.moduleName ?? 'device'} ${mac} on UDP ${port}`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    socket.close();
    process.exit(0);
  });
}
