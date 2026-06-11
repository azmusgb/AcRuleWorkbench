#!/usr/bin/env node
/*
  Phase 8 browser smoke test.

  Validates:
    - viewer still boots
    - granular sidecar diagnostics are exposed when manifest/index are present
    - FWD-backed workspaces can hydrate from granular workspace sidecars or fallback cleanly
    - no page errors or failed navigation clicks
*/

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://127.0.0.1:8787/viewer?nocache=phase8-granular';
const outDir = path.resolve(process.cwd(), 'artifacts', 'viewer-stability');
fs.mkdirSync(outDir, { recursive: true });

const failures = [];
const events = [];

function log(label, payload) {
  events.push({ utc: new Date().toISOString(), label, payload });
  console.log(`[${label}]`, payload);
}

async function snapshot(page, label) {
  const snap = await page.evaluate(() => ({
    workspaceView: document.body.dataset.workspaceView || '',
    bodyTextLength: document.body.innerText.length,
    bootPlaceholderExists: !!document.getElementById('fwBootPlaceholder'),
    initialShellExists: !!document.getElementById('fwInitialShellSkeleton'),
    diagnostics: window.fwViewerDiagnostics ? window.fwViewerDiagnostics() : null,
    granular: window.fwViewerGranularState ? window.fwViewerGranularState() : null,
    lazy: window.fwViewerLazyHydrationState ? window.fwViewerLazyHydrationState() : null
  }));
  log(`SNAPSHOT:${label}`, snap);
  return snap;
}

async function clickByCenter(page, locator) {
  const handle = await locator.elementHandle();
  if (!handle) throw new Error('No element handle for click target.');
  await handle.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await page.waitForTimeout(80);
  const box = await locator.boundingBox();
  if (!box) throw new Error('No bounding box for click target.');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function clickTarget(page, label, selector, required = true) {
  const locator = page.locator(selector).first();
  const count = await locator.count();
  if (!count) {
    const payload = { label, selector };
    log('target-missing', payload);
    if (required) failures.push({ type: 'target-missing', ...payload });
    return false;
  }
  log('click', { label, selector });
  try {
    await clickByCenter(page, locator);
    await page.waitForTimeout(700);
    await snapshot(page, `after-${label}`);
    return true;
  } catch (error) {
    const payload = { label, selector, message: error && error.message ? error.message : String(error) };
    log('click-failed', payload);
    failures.push({ type: 'click-failed', ...payload });
    return false;
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });

  page.on('console', message => log('console', { level: message.type(), text: message.text().slice(0, 500) }));
  page.on('pageerror', error => {
    const payload = { message: error.message, stack: error.stack };
    log('pageerror', payload);
    failures.push({ type: 'pageerror', ...payload });
  });
  page.on('requestfailed', request => {
    const payload = { url: request.url(), failure: request.failure() };
    log('requestfailed', payload);
    failures.push({ type: 'requestfailed', ...payload });
  });

  log('goto', { url });
  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => document.body.classList.contains('is-loaded') || window.fwViewerDiagnostics, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const initial = await snapshot(page, 'after-load');
  if (!initial.diagnostics) failures.push({ type: 'missing-diagnostics' });
  if (initial.bodyTextLength < 1000) failures.push({ type: 'small-body', bodyTextLength: initial.bodyTextLength });

  // These should work in either true granular mode or fallback mode.
  await clickTarget(page, 'Rule Lists', 'button[data-action="view-rule-lists"]', false);
  await clickTarget(page, 'UDFs', 'button[data-action="view-udfs"]', false);
  await clickTarget(page, 'Tables', 'button[data-action="view-tables"]', false);
  await clickTarget(page, 'Selection Lists', 'button[data-action="view-selection-lists"]', false);
  await clickTarget(page, 'Resources', 'button[data-action="view-resources"]', false);
  await clickTarget(page, 'Drivers', 'button[data-action="view-drivers"]', false);

  // Scope click should either render immediately or trigger granular scope load.
  await clickTarget(page, 'Scope DentalADA', 'button[data-scope="AC/Pages/DentalADA"]', false);
  await clickTarget(page, 'Scope General', 'button[data-scope="AC/Pages/General"]', false);

  const final = await snapshot(page, 'final');
  if (final.granular && final.granular.enabled && final.granular.errors && final.granular.errors.length) {
    failures.push({ type: 'granular-errors', errors: final.granular.errors });
  }

  const reportPath = path.join(outDir, `phase8-granular-sidecars-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ url, failures, events }, null, 2), 'utf8');
  console.log(`\n[COMPLETE] Phase 8 report written: ${reportPath}`);
  console.log(`[SUMMARY] failures: ${failures.length}`);
  for (const failure of failures) console.log('[FAIL]', failure);

  await browser.close();
  process.exitCode = failures.length ? 1 : 0;
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
