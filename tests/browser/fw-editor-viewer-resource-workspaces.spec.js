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
      const requested = url.pathname === '/' ? '/ac-rule-viewer.html' : url.pathname;
      const decoded = decodeURIComponent(requested);
      const fixturePath = path.resolve(fixtureDir, decoded.replace(/^\//, ''));
      const fullPath = fs.existsSync(fixturePath) ? fixturePath : path.resolve(rootDir, `.${decoded}`);
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
  viewerUrl = `http://127.0.0.1:${port}/ac-rule-viewer.html`;
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise(resolve => server.close(resolve));
});

async function openViewer(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message || String(error)));
  await page.goto(viewerUrl);
  await expect(page.getByText('FW Editor Viewer').first()).toBeVisible();
  await expect(page.locator('#statusPill')).not.toContainText(/Loading/i, { timeout: 15000 });
  return errors;
}

async function expectWorkspaceNotBlank(page, buttonName, headingPattern) {
  await page.getByRole('button', { name: buttonName }).first().click();
  await expect(page.locator('#content')).toBeVisible();
  await expect(page.locator('#content')).not.toBeEmpty();
  await expect(page.locator('#content')).toContainText(headingPattern, { timeout: 10000 });
  await expect(page.locator('#content .fweditor-global-root, #content .fweditor-root, #content .fweditor-config-window')).toBeVisible();
}

test.describe('FW Editor Viewer resource workspaces', () => {
  test('UDF, function, table, and Rule List workspaces are not blank', async ({ page }) => {
    const errors = await openViewer(page);
    await expectWorkspaceNotBlank(page, /User Defined Functions/i, /User Defined Functions/i);
    await expectWorkspaceNotBlank(page, /^Functions$/i, /Functions/i);
    await expectWorkspaceNotBlank(page, /^Tables$/i, /Tables/i);
    await expectWorkspaceNotBlank(page, /^Rule Lists$/i, /Rule Lists/i);
    expect(errors).toEqual([]);
  });
});
