import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['dispatch-preflight.spec.ts', 'dispatch-candidate-selector.spec.ts'],
  timeout: 90000,
  expect: { timeout: 15000 },
  workers: 1,
  reporter: 'list',
  outputDir: '../../../../.artifacts/pro-transport-pilot/playwright',
  use: {
    baseURL: process.env.PRO_PILOT_ORIGIN || 'http://localhost:3006',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 }
  }
})
