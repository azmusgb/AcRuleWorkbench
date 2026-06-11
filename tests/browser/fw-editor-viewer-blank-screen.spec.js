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
test('viewer boot never leaves a blank main workspace', async ({ page }) => {
  const { pageErrors, consoleErrors } = await openViewer(page);

  await expect(page.locator('body')).toHaveClass(/fw-editor-viewer-shell/);
  await expect(page.locator('#globalNav')).toBeVisible();
  await expect(page.locator('#content')).toBeVisible();
  await expect(page.locator('#content')).not.toBeEmpty();
  await expect(page.locator('#content')).toContainText(/Rule|Configuration|No rule|FWD|Editor/i);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});