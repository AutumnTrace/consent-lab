// Starts the local fixture (collector + shop) and runs the harness CLI against it. Used by
// scripts/demo.mjs, scripts/sample-reports.mjs and the release tests.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const collectorURL = 'http://127.0.0.1:4318';
export const defects = ['early-pageview', 'cookie-after-revoke', 'reinit-on-navigation'];

async function up(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function waitFor(url, what, ms = 60_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await up(url)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${what} did not start (${url})`);
}

// Stops exactly the process this module started (and its children).
function stopper(child) {
  return async () => {
    if (child.exitCode !== null) return;
    const exited = new Promise((r) => child.once('exit', r));
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
    await exited;
  };
}

// The collector must be on 127.0.0.1:4318: the shop's policy names that origin. A collector
// that is already running is reused (and left running).
export async function startCollector() {
  if (await up(`${collectorURL}/__health`)) return { url: collectorURL, stop: async () => {} };
  const child = spawn(process.execPath, [join(root, 'fixtures/collector/server.mjs')], { stdio: 'ignore' });
  await waitFor(`${collectorURL}/__health`, 'collector');
  return { url: collectorURL, stop: stopper(child) };
}

// A production build of the shop (pnpm build first), with SHOP_DEFECT set or not.
export async function startShop({ defect = null, port = 3199 } = {}) {
  const url = `http://localhost:${port}`;
  if (await up(url)) throw new Error(`port ${port} is already in use`);
  const next = join(root, 'fixtures/shop/node_modules/next/dist/bin/next');
  const child = spawn(process.execPath, [next, 'start', '-p', String(port)], {
    cwd: join(root, 'fixtures/shop'),
    env: { ...process.env, SHOP_DEFECT: defect ?? '', COLLECTOR_ORIGIN: collectorURL },
    stdio: 'ignore',
  });
  await waitFor(url, 'shop');
  return { url, stop: stopper(child) };
}

// Runs the CLI as a user would and returns its exit code and output.
export function runHarness({ shopURL, out, args = [], label }) {
  const cli = join(root, 'packages/harness/dist/cli.js');
  const config = join(root, 'fixtures/shop/consent-lab/consent-lab.config.ts');
  const argv = [cli, 'run', '--config', config, '--out', out, ...(label ? ['--label', label] : []), ...args];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, argv, { cwd: root, env: { ...process.env, SHOP_URL: shopURL } });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('exit', (code) => resolve({ code, output }));
  });
}
