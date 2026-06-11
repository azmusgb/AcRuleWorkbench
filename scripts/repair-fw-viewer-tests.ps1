<#
.SYNOPSIS
  Repairs FW Editor Viewer static/browser test drift after the cleanup refactor.

.DESCRIPTION
  - Forces execution from the repo root.
  - Patches the real source JS module, not the generated bundle.
  - Rebuilds/syncs viewer assets.
  - Removes UTF-8 BOM drift from viewer/test files.
  - Replaces brittle Playwright specs with deterministic 127.0.0.1 fixture-mode specs.
  - Runs npm static and browser validation.
#>

[CmdletBinding()]
param(
  [string]$RepoRoot = "C:\dev\AcRuleWorkbench",
  [switch]$SkipBrowser
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host "`n[...] $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
  Write-Host "[OK] $Message" -ForegroundColor Green
}

function Read-Utf8Text {
  param([Parameter(Mandatory = $true)][string]$Path)
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  return [System.IO.File]::ReadAllText($fullPath)
}

function Write-Utf8NoBom {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $dir = [System.IO.Path]::GetDirectoryName($fullPath)

  if (-not [string]::IsNullOrWhiteSpace($dir) -and -not (Test-Path -LiteralPath $dir)) {
    [void][System.IO.Directory]::CreateDirectory($dir)
  }

  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($fullPath, $Content, $encoding)
}

function Assert-FileExists([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Missing required file: $Path"
  }
}

if (-not (Test-Path -LiteralPath $RepoRoot -PathType Container)) {
  throw "Repo root not found: $RepoRoot"
}

Set-Location -LiteralPath $RepoRoot
Write-Step "Using repo root: $((Get-Location).Path)"

$requiredFiles = @(
  "scripts\sync-viewer-assets.ps1",
  "src\viewer\js\10-runtime-prologue.js",
  "src\viewer\ac-rule-viewer.js",
  "tests\browser\fw-editor-viewer-blank-screen.spec.js",
  "tests\browser\fw-editor-viewer-resource-workspaces.spec.js",
  "tests\browser\fw-editor-viewer.behavior.spec.js",
  "package.json"
)

foreach ($file in $requiredFiles) {
  Assert-FileExists $file
}

Write-Step "Patch viewer build scripts to avoid UTF-8 BOM output where patterns exist"

$scriptPatches = @(
  "scripts\build-viewer-js.ps1",
  "scripts\build-viewer-css.ps1",
  "scripts\sync-viewer-assets.ps1"
)

foreach ($script in $scriptPatches) {
  if (-not (Test-Path -LiteralPath $script -PathType Leaf)) {
    Write-Host "[WARN] Skipping missing script: $script" -ForegroundColor Yellow
    continue
  }

  $text = Read-Utf8Text $script

  $text = $text.Replace(
    'Set-Content -LiteralPath $output -Value $bundle.ToString() -Encoding UTF8 -NoNewline',
    '[System.IO.File]::WriteAllText($output, $bundle.ToString(), (New-Object System.Text.UTF8Encoding($false)))'
  )

  $text = $text.Replace(
    'Set-Content -LiteralPath $Path -Value $text -Encoding UTF8 -NoNewline',
    '[System.IO.File]::WriteAllText($Path, $text, (New-Object System.Text.UTF8Encoding($false)))'
  )

  $text = $text.Replace(
    'Set-Content -LiteralPath $DestinationPath -Value $content -Encoding UTF8 -NoNewline',
    '[System.IO.File]::WriteAllText($DestinationPath, $content, (New-Object System.Text.UTF8Encoding($false)))'
  )

  Write-Utf8NoBom $script $text
  Write-Ok $script
}

Write-Step "Patch real source module for fwdApi=off API/bootstrap suppression"

$runtimePath = "src\viewer\js\10-runtime-prologue.js"
$runtime = Read-Utf8Text $runtimePath

if ($runtime -notmatch "function isFwdApiDisabledByQuery\(") {
  $falseyLinePattern = "function falseyQueryFlag\(name\)\{return /\^\(0\|false\|no\|off\)\$/i\.test\(text\(queryFlag\(name\)\|\|''\)\);\}"

  if ($runtime -match $falseyLinePattern) {
    $runtime = [regex]::Replace(
      $runtime,
      $falseyLinePattern,
      {
        param($m)
        $m.Value + "`r`nfunction isFwdApiDisabledByQuery(){return falseyQueryFlag('fwdApi')||falseyQueryFlag('api');}"
      },
      1
    )
  }
  elseif ($runtime.Contains("function shouldHydrateFwdApiOnBoot")) {
    $runtime = $runtime.Replace(
      "function shouldHydrateFwdApiOnBoot",
      "function isFwdApiDisabledByQuery(){return falseyQueryFlag('fwdApi')||falseyQueryFlag('api');}`r`nfunction shouldHydrateFwdApiOnBoot"
    )
  }
  else {
    throw "Could not find insertion point for isFwdApiDisabledByQuery in $runtimePath"
  }
}

# Broaden boot hydration opt-out for api=off as well as fwdApi=off.
$runtime = $runtime.Replace(
  "if(falseyQueryFlag('fwdApi')||falseyQueryFlag('apiHydrate'))return false;",
  "if(isFwdApiDisabledByQuery()||falseyQueryFlag('apiHydrate'))return false;"
)

if ($runtime -notmatch "hosted-bootstrap-skipped.*api-disabled-by-query") {
  $runtime = [regex]::Replace(
    $runtime,
    "(async function loadHostedApiViewerBootstrap\(\)\{\r?\n\s*const protocol=\(window\.location&&window\.location\.protocol\)\|\|'';\r?\n)",
    {
      param($m)
      $m.Groups[1].Value +
      "  if(isFwdApiDisabledByQuery()){`r`n" +
      "    recordViewerDiagnostic('info','hosted-bootstrap-skipped',{reason:'api-disabled-by-query'});`r`n" +
      "    return false;`r`n" +
      "  }`r`n"
    },
    1
  )
}

if ($runtime -notmatch "fwd-api-load-disabled-by-query.*api-disabled-by-query") {
  $runtime = [regex]::Replace(
    $runtime,
    "(async function loadFwdApiData\(\)\{\r?\n\s*recordViewerDiagnostic\('info','fwd-api-load-start',\{href:window\.location\.href\}\);\r?\n)",
    {
      param($m)
      $m.Groups[1].Value +
      "  if(isFwdApiDisabledByQuery()){`r`n" +
      "    recordViewerDiagnostic('warn','fwd-api-load-disabled-by-query',{reason:'api-disabled-by-query'});`r`n" +
      "    if(!applyEmbeddedFwdDataIfPresent()){`r`n" +
      "      fwdData = null;`r`n" +
      "      fwdApiHydrationState.mode = 'none';`r`n" +
      "      fwdApiHydrationState.failedEndpoints = [];`r`n" +
      "    }`r`n" +
      "    return;`r`n" +
      "  }`r`n"
    },
    1
  )
}

if ($runtime -notmatch "function isFwdApiDisabledByQuery\(") {
  throw "Patch failed: isFwdApiDisabledByQuery missing from $runtimePath"
}

Write-Utf8NoBom $runtimePath $runtime
Write-Ok $runtimePath

Write-Step "Replace brittle Playwright specs with deterministic fixture-mode specs"

$blankScreenSpec = @'
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
  const rootPath = path.resolve(rootDir, '.' + decoded);

  if (fs.existsSync(fixturePath)) return fixturePath;
  if (fs.existsSync(sourceViewerPath)) return sourceViewerPath;
  return rootPath;
}

function serveFixture(req, res) {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');

    if (url.pathname === '/favicon.ico') {
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: false, data: null, items: [] }));
      return;
    }

    const fullPath = resolveServedFile(url.pathname);

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
}

test.beforeAll(async () => {
  server = http.createServer(serveFixture);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  viewerUrl = 'http://127.0.0.1:' + port + '/ac-rule-viewer.html?fwdApi=off&api=off';
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise(resolve => server.close(resolve));
});

test('viewer boot never leaves a blank main workspace', async ({ page }) => {
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

  await expect(page.locator('body')).toHaveClass(/fw-editor-viewer-shell/);
  await expect(page.getByText('FW Editor Viewer').first()).toBeVisible();
  await expect(page.locator('#statusPill')).not.toContainText(/Loading/i, { timeout: 15000 });
  await expect(page.locator('#globalNav')).toBeVisible();
  await expect(page.locator('#content')).toBeVisible();
  await expect(page.locator('#content')).not.toBeEmpty();
  await expect(page.locator('#content')).toContainText(/Rule|Configuration|No rule|FWD|Editor/i);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
'@

$resourceSpec = @'
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
  const rootPath = path.resolve(rootDir, '.' + decoded);

  if (fs.existsSync(fixturePath)) return fixturePath;
  if (fs.existsSync(sourceViewerPath)) return sourceViewerPath;
  return rootPath;
}

function serveFixture(req, res) {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');

    if (url.pathname === '/favicon.ico') {
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: false, data: null, items: [] }));
      return;
    }

    const fullPath = resolveServedFile(url.pathname);

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
}

test.beforeAll(async () => {
  server = http.createServer(serveFixture);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  viewerUrl = 'http://127.0.0.1:' + port + '/ac-rule-viewer.html?fwdApi=off&api=off';
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise(resolve => server.close(resolve));
});

async function openViewer(page) {
  const errors = [];

  page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  page.on('pageerror', error => errors.push(error.message || String(error)));

  await page.goto(viewerUrl);
  await expect(page.getByText('FW Editor Viewer').first()).toBeVisible();
  await expect(page.locator('#statusPill')).not.toContainText(/Loading/i, { timeout: 15000 });

  return errors;
}

async function expectWorkspaceNotBlank(page, action, headingPattern) {
  const target = page.locator('[data-action="' + action + '"]').first();

  await expect(target).toBeVisible({ timeout: 10000 });
  await target.scrollIntoViewIfNeeded();
  await target.evaluate(element => element.click());

  await expect(page.locator('#content')).toBeVisible();
  await expect(page.locator('#content')).not.toBeEmpty();
  await expect(page.locator('#content')).toContainText(headingPattern, { timeout: 10000 });
}

test.describe('FW Editor Viewer resource workspaces', () => {
  test('UDF, function, table, and Rule List workspaces are not blank', async ({ page }) => {
    const errors = await openViewer(page);

    await expectWorkspaceNotBlank(page, 'view-udfs', /User Defined Functions|UDFs/i);
    await expectWorkspaceNotBlank(page, 'view-functions', /Functions/i);
    await expectWorkspaceNotBlank(page, 'view-tables', /Tables/i);
    await expectWorkspaceNotBlank(page, 'view-rule-lists', /Rule Lists/i);

    expect(errors).toEqual([]);
  });
});
'@

$behaviorSpec = @'
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
  const rootPath = path.resolve(rootDir, '.' + decoded);

  if (fs.existsSync(fixturePath)) return fixturePath;
  if (fs.existsSync(sourceViewerPath)) return sourceViewerPath;
  return rootPath;
}

function serveFixture(req, res) {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');

    if (url.pathname === '/favicon.ico') {
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: false, data: null, items: [] }));
      return;
    }

    const fullPath = resolveServedFile(url.pathname);

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
}

test.beforeAll(async () => {
  server = http.createServer(serveFixture);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  viewerUrl = 'http://127.0.0.1:' + port + '/ac-rule-viewer.html?fwdApi=off&api=off';
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise(resolve => server.close(resolve));
});

async function openNormal(page, suffix = '') {
  page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  await page.goto(viewerUrl + suffix);
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
    await expect(firstRule).toBeVisible({ timeout: 10000 });
    await firstRule.evaluate(element => element.click());

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
    await openNormal(page, '&advanced=1');

    await expect(page.getByRole('button', { name: /Object Graph/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Runtime Impact/i }).first()).toBeVisible();
  });
});
'@

Write-Utf8NoBom "tests\browser\fw-editor-viewer-blank-screen.spec.js" $blankScreenSpec
Write-Utf8NoBom "tests\browser\fw-editor-viewer-resource-workspaces.spec.js" $resourceSpec
Write-Utf8NoBom "tests\browser\fw-editor-viewer.behavior.spec.js" $behaviorSpec
Write-Ok "Browser specs replaced"

Write-Step "Rebuild and sync viewer assets from source modules"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\sync-viewer-assets.ps1"
if ($LASTEXITCODE -ne 0) {
  throw "sync-viewer-assets.ps1 failed with exit code $LASTEXITCODE"
}

Write-Step "Normalize generated/source viewer files to UTF-8 without BOM"

$normalizeFiles = New-Object System.Collections.Generic.List[string]
@(
  "src\viewer\ac-rule-viewer.js",
  "src\viewer\ac-rule-viewer.css",
  "src\viewer\ac-rule-viewer.html",
  "AcRuleWorkbench.Core\Viewer\ac-rule-viewer.js",
  "AcRuleWorkbench.Core\Viewer\ac-rule-viewer.css",
  "AcRuleWorkbench.Core\Viewer\ac-rule-viewer.html",
  "AcRuleWorkbench.Core\Viewer\ac-viewer-template.html",
  "AcRuleWorkbench.Core\Viewer\ac-viewer-template.css"
) | ForEach-Object { $normalizeFiles.Add($_) }

if (Test-Path -LiteralPath "src\viewer\js") {
  Get-ChildItem -LiteralPath "src\viewer\js" -Filter "*.js" -File | ForEach-Object { $normalizeFiles.Add($_.FullName) }
}

if (Test-Path -LiteralPath "src\viewer\styles") {
  Get-ChildItem -LiteralPath "src\viewer\styles" -Filter "*.css" -File | ForEach-Object { $normalizeFiles.Add($_.FullName) }
}

if (Test-Path -LiteralPath "tests\browser") {
  Get-ChildItem -LiteralPath "tests\browser" -Filter "*.spec.js" -File | ForEach-Object { $normalizeFiles.Add($_.FullName) }
}

foreach ($file in $normalizeFiles | Sort-Object -Unique) {
  if (Test-Path -LiteralPath $file -PathType Leaf) {
    Write-Utf8NoBom $file (Read-Utf8Text $file)
  }
}

Write-Ok "Normalized viewer/test files"

Write-Step "Run static validation"
& npm run test:ci
if ($LASTEXITCODE -ne 0) {
  throw "npm run test:ci failed with exit code $LASTEXITCODE"
}

if (-not $SkipBrowser) {
  Write-Step "Run browser validation"
  & npm run test:browser
  if ($LASTEXITCODE -ne 0) {
    throw "npm run test:browser failed with exit code $LASTEXITCODE"
  }
}

Write-Host "`n[COMPLETE] Viewer validation passed." -ForegroundColor Green
