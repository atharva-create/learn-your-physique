import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:5173',
    viewport: { width: 1440, height: 1050 },
    channel: process.env.BROWSER_CHANNEL || undefined,
    launchOptions: { args: process.env.BROWSER_CHANNEL ? [] : ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: process.env.TEST_BASE_URL ? undefined : { command: 'npm run dev -- --port 5173', url: 'http://localhost:5173', reuseExistingServer: true },
});
