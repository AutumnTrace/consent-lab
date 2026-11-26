#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from './config.js';
import { renderHtml } from './report/html.js';
import { checkRunOptions, runConsentLab } from './runner.js';
import { scenarioIds } from './scenarios.js';
import type { BrowserName, ScenarioId } from './types.js';

// Exit codes: 0 every run passed, 1 at least one violation, 2 could not run.
const usage = `consent-lab run [options]

  --config <file>      config module (default: consent-lab.config.ts in the current directory)
  --policy <file>      use this policy file instead of the one the config names
  --browser <names>    comma-separated: chromium, firefox, webkit (default: from config, else chromium)
  --scenario <ids>     comma-separated, from: ${scenarioIds.join(', ')}
  --window <ms>        observation window after each action (default: from config, else 1000)
  --out <dir>          where to write report.json and report.html (default: consent-lab-report)
  --label <text>       a label for this run, shown in the report

Exit codes: 0 all runs passed, 1 violations found, 2 the run could not complete.`;

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      policy: { type: 'string' },
      browser: { type: 'string' },
      scenario: { type: 'string' },
      window: { type: 'string' },
      out: { type: 'string' },
      label: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help || positionals[0] !== 'run') {
    console.log(usage);
    return values.help ? 0 : 2;
  }

  const browsers = values.browser?.split(',').map((b) => b.trim()) as BrowserName[] | undefined;
  const scenarios = values.scenario?.split(',').map((s) => s.trim()) as ScenarioId[] | undefined;

  const options = await loadConfig(values.config, {
    ...(browsers ? { browsers } : {}),
    ...(scenarios ? { scenarios } : {}),
    ...(values.window ? { windowMs: Number(values.window) } : {}),
    ...(values.label ? { label: values.label } : {}),
    ...(values.policy ? { policy: values.policy } : {}),
  });
  checkRunOptions(options);
  const out = resolve(values.out ?? 'consent-lab-report');

  console.log(
    `consent-lab · ${options.baseURL} · policy ${relative(process.cwd(), options.policySource)} · window ${options.windowMs} ms`,
  );
  const report = await runConsentLab({ ...options, log: (line) => console.log(line) });

  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(out, 'report.html'), renderHtml(report));

  const s = report.summary;
  console.log(
    `${s.passed}/${s.runs} runs passed, ${s.violations} violation(s), ${s.unclassified} unclassified request URL(s)` +
      `${s.errors ? `, ${s.errors} error(s)` : ''}`,
  );
  console.log(`report: ${relative(process.cwd(), join(out, 'report.html'))}`);
  return report.verdict === 'pass' ? 0 : report.verdict === 'fail' ? 1 : 2;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`consent-lab: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  },
);
