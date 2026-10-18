import { defineConfig, devices } from '@playwright/test';

const PORT = 4100;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Two-person live tests need CPU headroom; more parallel browsers made them time out here.
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  // Uses the Microsoft Edge already installed on Windows (Chromium-based), so no browser
  // download is needed. Phone sizes are emulated per test with explicit viewports.
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.js/, use: { channel: 'msedge' } },
    {
      name: 'desktop-edge',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge',
        // Signed in as the shared e2e account; auth journey tests opt out per file.
        storageState: 'e2e/.auth/signed-in.json',
      },
    },
    {
      // Publishes a new build while the app is open: runs alone, after everything else.
      name: 'update-flow',
      testMatch: /update\.flow\.js/,
      dependencies: ['desktop-edge'],
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge',
        storageState: 'e2e/.auth/signed-in.json',
      },
    },
  ],
  webServer: {
    command: 'node e2e/startTestServer.js',
    url: `http://localhost:${PORT}/api/health/ready`,
    env: { E2E_PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
