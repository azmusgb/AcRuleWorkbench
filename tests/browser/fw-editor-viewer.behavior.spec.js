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

function resolveServedFile(pathname) {
  const requested = pathname === '/' ? '/ac-rule-viewer.html' : pathname;
  const decoded = decodeURIComponent(requested);
  const relative = decoded.replace(/^\//, '');

  const fixturePath = path.resolve(fixtureDir, relative);
  const sourceViewerPath = path.resolve(rootDir, 'src', 'viewer', relative);
  const rootPath = path.resolve(rootDir, `.${decoded}`);

  if (fs.existsSync(fixturePath)) return fixturePath;
  if (fs.existsSync(sourceViewerPath)) return sourceViewerPath;
  return rootPath;
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

      if (url.pathname.startsWith('/api/')) {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ ok: false, data: null, meta: { fixture: true, apiDisabled: true } }));
        return;
      }

      const fullPath = resolveServedFile(url.pathname);

      if (!fullPath.startsWith(rootDir + path.sep) && fullPath !== rootDir) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        if (url.pathname.endsWith('.json')) {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
          });
          res.end('{}');
          return;
        }

        res.writeHead(404);
        res.end('Not found');
        return;
      }

      res.writeHead(200, {
        'Content-Type': contentType(fullPath),
        'Cache-Control': 'no-store'
      });

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

async function openViewer(page) {
  const pageErrors = [];
  const consoleErrors = [];

  page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  page.on('pageerror', error => pageErrors.push(error.message || String(error)));
  page.on('console', message => {
    if (message.type() !== 'error') return;

    const value = message.text();
    if (/Failed to load resource: the server responded with a status of 404/i.test(value)) return;

    consoleErrors.push(value);
  });

  await page.goto(viewerUrl);
  await expect(page.getByText('FW Editor Viewer').first()).toBeVisible();
  await expect(page.locator('#statusPill')).not.toContainText(/Loading/i, { timeout: 15000 });

  return { pageErrors, consoleErrors };
}

async function clickViewerAction(page, action, fallbackName) {
  const byAction = page.locator(`[data-action="${action}"]`).first();

  if (await byAction.count()) {
    await expect(byAction).toBeVisible({ timeout: 10000 });
    await byAction.scrollIntoViewIfNeeded();
    await byAction.evaluate(element => element.click());
    return;
  }

  const byRole = page.getByRole('button', { name: fallbackName }).first();
  await expect(byRole).toBeVisible({ timeout: 10000 });
  await byRole.click({ force: true });
}
test.describe('FW Editor Viewer normal mode', () => {
  test('opens in read-only FW Editor mode by default', async ({ page }) => {
    const { pageErrors, consoleErrors } = await openViewer(page);

    await expect(page.locator('body')).toHaveClass(/fw-editor-viewer-shell/);
    await expect(page.locator('body')).not.toHaveClass(/editor-mode/);
    await expect(page.locator('.fweditor-root')).toBeVisible();
    await expect(page.locator('.fweditor-menu-strip')).toContainText(/File/);
    await expect(page.locator('.fweditor-fwd-tree-window')).toBeVisible();
    await expect(page.locator('.fweditor-config-window')).toBeVisible();
    await expect(page.locator('.fweditor-rule-properties-fieldset')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/Evidence|Runtime Impact|Object Graph|FW Companion/i);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('uses FW Editor-style selected rule property pages', async ({ page }) => {
    const { pageErrors, consoleErrors } = await openViewer(page);

    const firstRule = page.locator('[data-node]').first();
    await expect(firstRule).toBeVisible({ timeout: 10000 });
    await firstRule.evaluate(element => element.click());

    await expect(page.getByLabel('Rule property pages').getByRole('tab', { name: 'General' })).toBeVisible();
    await expect(page.getByLabel('Rule property pages').getByRole('tab', { name: 'Fields / Parameters' })).toBeVisible();
    await expect(page.getByLabel('Rule property pages').getByRole('tab', { name: 'Attributes' })).toBeVisible();
    await expect(page.getByLabel('Rule property pages').getByRole('tab', { name: 'Status Results' })).toBeVisible();
    await expect(page.getByLabel('Rule property pages').getByRole('tab', { name: 'Description' })).toBeVisible();

    await page.getByLabel('Rule property pages').getByRole('tab', { name: 'Fields / Parameters' }).evaluate(element => element.click());
    await expect(page.locator('.fweditor-property-body')).toContainText(/Field|Parameter|No parsed/i);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('hides advanced diagnostics unless explicitly enabled', async ({ page }) => {
    const { pageErrors, consoleErrors } = await openViewer(page);

    await expect(page.getByRole('button', { name: /Object Graph/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Runtime Impact/i })).toHaveCount(0);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('FW Editor Viewer advanced mode', () => {
  test('exposes advanced diagnostics only when advanced is enabled', async ({ page }) => {
    page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto(`${viewerUrl}&advanced=1`);

    await expect(page.getByRole('button', { name: /Object Graph/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Runtime Impact/i }).first()).toBeVisible();
  });
});