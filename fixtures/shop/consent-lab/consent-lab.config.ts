import { defineConfig } from '@autumntrace/consent-lab';
import { shopAdapter } from './adapter.ts';

export default defineConfig({
  baseURL: process.env.SHOP_URL ?? 'http://localhost:3100',
  startPath: '/',
  navigation: { link: 'Products', path: '/products' },
  adapter: shopAdapter,
  policy: './policy.json',
  category: 'analytics',
  collector: { url: process.env.COLLECTOR_URL ?? 'http://127.0.0.1:4318' },
  observationWindowMs: 1000,
  browsers: ['chromium', 'firefox'],
});
