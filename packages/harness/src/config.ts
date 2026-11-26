import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPolicy } from './policy.js';
import type { RunOptions } from './runner.js';
import type { BrowserName, ConsentLabConfig, ScenarioId } from './types.js';

export function defineConfig(config: ConsentLabConfig): ConsentLabConfig {
  return config;
}

export const defaultConfigFiles = ['consent-lab.config.ts', 'consent-lab.config.mjs', 'consent-lab.config.js'];

export interface Overrides {
  browsers?: BrowserName[];
  scenarios?: ScenarioId[];
  windowMs?: number;
  label?: string;
  policy?: string;
}

// Loads a config module. Node 24 runs .ts files directly (type stripping), so a TypeScript
// config needs no build step as long as it only uses erasable syntax.
export async function loadConfig(path: string | undefined, overrides: Overrides = {}): Promise<RunOptions> {
  const file = path ? resolve(path) : defaultConfigFiles.map((f) => resolve(f)).find((f) => existsSync(f));
  if (!file || !existsSync(file)) {
    throw new Error(`no config file found (looked for ${path ?? defaultConfigFiles.join(', ')})`);
  }
  const module = (await import(pathToFileURL(file).href)) as { default?: ConsentLabConfig };
  const config = module.default;
  if (!config) throw new Error(`${file} has no default export`);

  let policySource = '(inline)';
  let policy;
  let sha256 = '';
  if (overrides.policy) {
    policySource = resolve(overrides.policy);
    ({ policy, sha256 } = await loadPolicy(policySource));
  } else if (typeof config.policy === 'string') {
    policySource = resolve(dirname(file), config.policy);
    ({ policy, sha256 } = await loadPolicy(policySource));
  } else {
    policy = config.policy;
  }

  return {
    baseURL: config.baseURL,
    startPath: config.startPath ?? '/',
    navigation: config.navigation,
    adapter: config.adapter,
    policy,
    policySource,
    policySha256: sha256,
    category: config.category ?? 'analytics',
    collectorURL: config.collector?.url ?? null,
    windowMs: overrides.windowMs ?? config.observationWindowMs ?? 1000,
    browsers: overrides.browsers ?? config.browsers ?? ['chromium'],
    scenarios: overrides.scenarios ?? config.scenarios ?? null,
    label: overrides.label ?? null,
  };
}
