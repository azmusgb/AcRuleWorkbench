const fs = require('fs');
const { defineConfig, devices } = require('@playwright/test');

const linuxChromium = '/usr/bin/chromium';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (process.platform === 'linux' && fs.existsSync(linuxChromium) ? linuxChromium : undefined);

module.exports = defineConfig({
  testDir: '.',
  timeout: 30000,
  expect: { timeout: 10000 },
  workers: process.env.CI ? 1 : undefined,
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    launchOptions: executablePath ? { executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'] } : undefined
  }
});
