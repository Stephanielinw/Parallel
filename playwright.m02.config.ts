import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /(?:m02-safari-smoke|m03-backup-preflight|m03b-indexeddb-shadow|m03c-storage-pressure-race|m03d-cutover-rollback|m04-incremental-idb|m07-ui-state-isolation)\.spec\.ts/,
  timeout: 45_000,
  expect: {timeout: 15_000},
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html',{open:'never',outputFolder:'playwright-report'}]] : [['list']],
  use: {
    browserName: 'webkit',
    headless: true,
    viewport: {width: 390, height: 844},
    isMobile: true,
    hasTouch: true,
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --base=/Parallel/ --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/Parallel/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});