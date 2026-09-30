import { defineConfig } from '@playwright/test';
import regressionConfig from './playwright.config';

// These deployment checks require explicitly provisioned fixtures and an
// opt-in environment flag. The regression coverage reporter requires every
// mandatory scenario, so it does not apply to these separately invoked checks.
export default defineConfig({
  ...regressionConfig,
  testMatch: ['authorization-live-smoke.spec.ts', 'authorization-shadow-smoke.spec.ts'],
  testIgnore: [],
  reporter: [['list']],
});
