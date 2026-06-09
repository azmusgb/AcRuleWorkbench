const fs = require('fs');
const http = require('http');
const path = require('path');
const { test, expect } = require('@playwright/test');

const rootDir = path.resolve(__dirname, '../..');
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
      const fullPath = path.resolve(rootDir, `.${decoded}`);
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
  viewerUrl = `http://127.0.0.1:${port}/ac-rule-viewer.html`;
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise(resolve => server.close(resolve));
});

async function openNormal(page) {
  await page.goto(viewerUrl);
  await expect(page.getByText('FW Companion').first()).toBeVisible();
  await expect(page.locator('#statusPill')).not.toContainText(/Loading/i, { timeout: 15000 });
}

test.describe('FW Companion normal mode', () => {
  test('keeps the left navigation visible and populated with global resources', async ({ page }) => {
    await openNormal(page);
    await expect(page.locator('body')).toHaveClass(/product-shell-v70/);
    await expect(page.locator('body')).toHaveClass(/fw-companion-shell/);
    await expect(page.locator('body')).not.toHaveClass(/editor-mode/);
    const leftPane = page.locator('.pane.left');
    await expect(leftPane).toBeVisible();
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('.main-head')).toBeVisible();
    await expect(page.locator('#globalNav')).toBeVisible();
    await expect(page.locator('#scopeTitle')).not.toContainText(/Configuration Window|AC Rule Workbench|FWD TREE/i);
    await expect(page.locator('#scopeTitle')).toContainText(/Overview|UDFs|Rule Lists|Functions|Tables|SelectionLists|Resources/i);
    await expect(page.locator('.pane.right')).toBeHidden();
    await expect(page.getByRole('button', { name: /^Overview/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^UDFs/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Functions/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Resources/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Tables/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^SelectionLists/i })).toBeVisible();
  });

  test('left navigation opens UDFs and other global resource views', async ({ page }) => {
    await openNormal(page);
    await page.getByRole('button', { name: /^UDFs/i }).first().click();
    await expect(page.locator('#scopeTitle')).toContainText(/UDFs/i);
    await page.getByRole('button', { name: /^Resources/i }).first().click();
    await expect(page.locator('#scopeTitle')).toContainText(/Resources/i);
    await page.getByRole('button', { name: /^SelectionLists/i }).first().click();
    await expect(page.locator('#scopeTitle')).toContainText(/SelectionLists/i);
  });

  test('does not expose advanced graph/runtime navigation or search rows', async ({ page }) => {
    await openNormal(page);
    await expect(page.getByRole('button', { name: /Object Graph/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Runtime Impact/i })).toHaveCount(0);

    const search = page.locator('#globalSearch');
    await search.fill('runtime impact');
    await expect(page.locator('[data-search-index]')).not.toContainText(/Runtime Impact|Object Graph|RuntimeImpact|ObjectGraph/i);
    await search.fill('object graph');
    await expect(page.locator('[data-search-index]')).not.toContainText(/Runtime Impact|Object Graph|RuntimeImpact|ObjectGraph/i);
  });

  test('does not render advanced terms from function/resource detail in normal mode', async ({ page }) => {
    await openNormal(page);

    await page.getByRole('button', { name: /^Functions/i }).first().click();
    await expect(page.locator('body')).not.toContainText(/Object Graph|Runtime Impact|Rule Impact Summary|AC Rule Workbench|Configuration Window|FWD TREE/i);

    await page.getByRole('button', { name: /^Resources/i }).first().click();
    await expect(page.locator('body')).not.toContainText(/Object Graph|Runtime Impact|Rule Impact Summary|AC Rule Workbench|Configuration Window|FWD TREE/i);
  });

  test('normal FWD sidecar does not include advanced graph/runtime payload fields', async () => {
    const payload = require('../../ac-rule-viewer.fwd.json');
    expect(payload.objectGraph).toBeUndefined();
    expect(payload.runtimeImpact).toBeUndefined();
    const functions = payload.functions?.items || [];
    expect(functions.some(f => Object.prototype.hasOwnProperty.call(f, 'runtimeImpacts'))).toBe(false);
  });

  test('shows UDF unavailable state plainly when internal rule list is absent', async ({ page }) => {
    await openNormal(page);
    await page.getByRole('button', { name: /^UDFs/i }).first().click();
    await expect(page.getByText(/Internal Rule List unavailable|rule list unavailable/i)).toBeVisible();
  });

  test('separates SelectionList usage candidates from parsed schemas', async ({ page }) => {
    await openNormal(page);
    await page.getByRole('button', { name: /^SelectionLists/i }).first().click();
    await expect(page.getByText(/usage candidate|not a parsed schema/i)).toBeVisible();
  });
});

test.describe('FW Companion advanced mode', () => {
  test('exposes Object Graph and Runtime Impact only when advanced is enabled', async ({ page }) => {
    await page.goto(`${viewerUrl}?advanced=1`);
    await expect(page.getByRole('button', { name: /Object Graph/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Runtime Impact/i }).first()).toBeVisible();
  });
});
