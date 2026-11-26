import { describe, expect, it } from 'vitest';
import { checkRunOptions } from '../src/runner.js';
import type { BrowserName, ScenarioId } from '../src/types.js';

const valid = { windowMs: 1000, browsers: ['chromium', 'firefox'] as BrowserName[], scenarios: null };

describe('checkRunOptions', () => {
  it('accepts the defaults and an explicit scenario list', () => {
    expect(() => checkRunOptions(valid)).not.toThrow();
    expect(() => checkRunOptions({ ...valid, scenarios: ['reject', 'revoke'] })).not.toThrow();
  });

  it('refuses a window that is not a whole number of milliseconds above 0', () => {
    // `--window 1s` reaches the runner as Number('1s'), which is NaN.
    for (const windowMs of [Number('1s'), 0, -500, 250.5, Infinity]) {
      expect(() => checkRunOptions({ ...valid, windowMs })).toThrow(/observation window/);
    }
  });

  it('refuses unknown browsers by name, before any launch', () => {
    expect(() => checkRunOptions({ ...valid, browsers: ['chromium', 'chrome'] as BrowserName[] })).toThrow(
      /unknown browser\(s\): chrome \(use chromium, firefox, webkit\)/,
    );
  });

  it('refuses a run with nothing in it, which would otherwise pass with 0 runs', () => {
    expect(() => checkRunOptions({ ...valid, browsers: [] })).toThrow(/no browser to run/);
    expect(() => checkRunOptions({ ...valid, scenarios: [] })).toThrow(/no scenario to run/);
  });

  it('refuses unknown scenario ids from a config file as well as from the command line', () => {
    expect(() => checkRunOptions({ ...valid, scenarios: ['reject', 'rejected'] as ScenarioId[] })).toThrow(
      /unknown scenario\(s\): rejected/,
    );
  });
});
