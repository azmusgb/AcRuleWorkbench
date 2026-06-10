const fs = require('fs');
const http = require('http');
const path = require('path');
const { test, expect } = require('@playwright/test');

const rootDir = path.resolve(__dirname, '../..');
const fixtureDir = path.join(rootDir, 'tests', 'fixtures', 'viewer-minimal');
let server;
let viewerUrl;

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/favicon.ico') {
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      const requested = url.pathname === '/' ? '/ac-rule-viewer.html' : url.pathname;
      const decoded = decodeURIComponent(requested);
      const fixturePath = path.resolve(fixtureDir, decoded.replace(/^\//, ''));
      const sourceViewerPath = path.resolve(rootDir, 'src', 'viewer', decoded.replace(/^\//, ''));
      const fullPath = fs.existsSync(fixturePath) ? fixturePath : (fs.existsSync(sourceViewerPath) ? sourceViewerPath : path.resolve(rootDir, `.${decoded}`));
      if (!fullPath.startsWith(rootDir + path.sep) && fullPath !== rootDir) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType(fullPath), 'Cache-Control': 'no-store' });
      fs.createReadStream(fullPath).pipe(res);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error && error.stack ? error.stack : error));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  viewerUrl = `http://127.0.0.1:${port}/ac-rule-viewer.html?fwdApi=off`;
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise(resolve => server.close(resolve));
});

async function openNormal(page) {
  await page.goto(viewerUrl);
  await expect(page.getByText('FW Editor Viewer').first()).toBeVisible();
  await expect(page.locator('#statusPill')).not.toContainText(/Loading/i, { timeout: 15000 });
}

test.describe('FW Editor Viewer normal mode', () => {
  test('opens in read-only FW Editor mode by default', async ({ page }) => {
    await openNormal(page);
    await expect(page.locator('body')).toHaveClass(/fw-editor-viewer-shell/);
    await expect(page.locator('body')).not.toHaveClass(/editor-mode/);
    await expect(page.locator('.fweditor-root')).toBeVisible();
    await expect(page.locator('.fweditor-menu-strip')).toContainText(/File/);
    await expect(page.locator('.fweditor-fwd-tree-window')).toBeVisible();
    await expect(page.locator('.fweditor-config-window')).toBeVisible();
    await expect(page.locator('.fweditor-rule-properties-fieldset')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/Evidence|Runtime Impact|Object Graph|FW Companion/i);
  });

  test('uses FW Editor-style selected rule property pages', async ({ page }) => {
    await openNormal(page);
    const firstRule = page.locator('[data-node]').first();
    await firstRule.click();
    await expect(page.getByRole('tab', { name: 'General' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Fields / Parameters' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Attributes' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Status Results' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Description' })).toBeVisible();
    await page.getByRole('tab', { name: 'Fields / Parameters' }).click();
    await expect(page.locator('.fweditor-property-body')).toContainText(/Field|Parameter|No parsed/i);
  });

  test('hides advanced diagnostics unless explicitly enabled', async ({ page }) => {
    await openNormal(page);
    await expect(page.getByRole('button', { name: /Object Graph/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Runtime Impact/i })).toHaveCount(0);
  });
});

test.describe('FW Editor Viewer advanced mode', () => {
  test('exposes advanced diagnostics only when advanced is enabled', async ({ page }) => {
    await page.goto(`${viewerUrl}&advanced=1`);
    await expect(page.getByRole('button', { name: /Object Graph/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Runtime Impact/i }).first()).toBeVisible();
  });
});

