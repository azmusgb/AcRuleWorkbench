<#
.SYNOPSIS
  Repairs FW Editor Viewer source bundles and browser tests.

.DESCRIPTION
  Windows PowerShell 5.1 compatible. This script intentionally overwrites the
  viewer build/sync scripts and Playwright fixture specs with deterministic,
  parse-safe versions.

  It fixes:
  - unsafe $PSScriptRoot defaults in viewer build/sync scripts
  - UTF-8 BOM drift in generated viewer bundles
  - direct/generated bundle drift by patching src/viewer/js modules first
  - fwdApi=off still probing hosted API bootstrap
  - brittle Playwright selectors and fixture 404 console noise

.PARAMETER RepoRoot
  Repository root. Defaults to C:\dev\AcRuleWorkbench if not provided.

.PARAMETER SkipTests
  Patch only; do not run npm validation.

.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\patch-fw-viewer-v2.ps1

.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\patch-fw-viewer-v2.ps1 -SkipTests
#>

[CmdletBinding()]
param(
    [string]$RepoRoot = "C:\dev\AcRuleWorkbench",
    [switch]$SkipTests
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[...] $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Resolve-RepoRoot {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        $Path = "C:\dev\AcRuleWorkbench"
    }

    $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
    $root = $resolved.ProviderPath

    if (-not (Test-Path -LiteralPath (Join-Path $root "AcRuleWorkbench.sln") -PathType Leaf)) {
        throw "Repo root does not contain AcRuleWorkbench.sln: $root"
    }

    if (-not (Test-Path -LiteralPath (Join-Path $root "src\viewer") -PathType Container)) {
        throw "Repo root does not contain src\viewer: $root"
    }

    return $root
}

function Get-FullPath {
    param([Parameter(Mandatory = $true)][string]$RelativePath)

    if ([System.IO.Path]::IsPathRooted($RelativePath)) {
        return [System.IO.Path]::GetFullPath($RelativePath)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $script:RepoRootResolved $RelativePath))
}

function Read-Text {
    param([Parameter(Mandatory = $true)][string]$RelativePath)

    $fullPath = Get-FullPath $RelativePath
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        throw "Missing file: $RelativePath"
    }

    return [System.IO.File]::ReadAllText($fullPath)
}

function Write-TextNoBom {
    param(
        [Parameter(Mandatory = $true)][string]$RelativePath,
        [Parameter(Mandatory = $true)][string]$Text
    )

    $fullPath = Get-FullPath $RelativePath
    $directory = [System.IO.Path]::GetDirectoryName($fullPath)

    if (-not [string]::IsNullOrWhiteSpace($directory) -and -not (Test-Path -LiteralPath $directory)) {
        [void][System.IO.Directory]::CreateDirectory($directory)
    }

    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($fullPath, $Text, $encoding)
}

function Normalize-NoBom {
    param([Parameter(Mandatory = $true)][string]$RelativePath)

    $fullPath = Get-FullPath $RelativePath
    if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
        $text = [System.IO.File]::ReadAllText($fullPath)
        Write-TextNoBom $RelativePath $text
    }
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$FailureMessage
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FailureMessage. Exit code: $LASTEXITCODE"
    }
}

function Write-ViewerBuildScripts {
    $buildJs = @'
[CmdletBinding()]
param(
    [string]$Root = ""
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Root)) {
    $scriptRoot = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
        $PSScriptRoot
    }
    elseif ($MyInvocation.MyCommand.Path) {
        Split-Path -Parent $MyInvocation.MyCommand.Path
    }
    else {
        (Get-Location).Path
    }

    $Root = (Resolve-Path -LiteralPath (Join-Path $scriptRoot "..")).ProviderPath
}
else {
    $Root = (Resolve-Path -LiteralPath $Root).ProviderPath
}

$moduleDir = Join-Path $Root "src\viewer\js"
$output = Join-Path $Root "src\viewer\ac-rule-viewer.js"

if (-not (Test-Path -LiteralPath $moduleDir -PathType Container)) {
    throw "Missing viewer JS module directory: $moduleDir"
}

$modules = @(Get-ChildItem -LiteralPath $moduleDir -Filter "*.js" -File | Sort-Object Name)
if ($modules.Count -eq 0) {
    throw "No viewer JS modules found in $moduleDir"
}

$bundle = New-Object System.Text.StringBuilder
foreach ($module in $modules) {
    [void]$bundle.Append([System.IO.File]::ReadAllText($module.FullName))
}

$encoding = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($output, $bundle.ToString(), $encoding)

Write-Host "Built viewer JS bundle from $($modules.Count) module(s): $output" -ForegroundColor Green
'@

    $buildCss = @'
[CmdletBinding()]
param(
    [string]$Root = ""
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Root)) {
    $scriptRoot = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
        $PSScriptRoot
    }
    elseif ($MyInvocation.MyCommand.Path) {
        Split-Path -Parent $MyInvocation.MyCommand.Path
    }
    else {
        (Get-Location).Path
    }

    $Root = (Resolve-Path -LiteralPath (Join-Path $scriptRoot "..")).ProviderPath
}
else {
    $Root = (Resolve-Path -LiteralPath $Root).ProviderPath
}

$layerDir = Join-Path $Root "src\viewer\styles"
$output = Join-Path $Root "src\viewer\ac-rule-viewer.css"

if (-not (Test-Path -LiteralPath $layerDir -PathType Container)) {
    throw "Missing viewer CSS layer directory: $layerDir"
}

$layers = @(Get-ChildItem -LiteralPath $layerDir -Filter "*.css" -File | Sort-Object Name)
if ($layers.Count -eq 0) {
    throw "No viewer CSS layers found in $layerDir"
}

$bundle = New-Object System.Text.StringBuilder
foreach ($layer in $layers) {
    [void]$bundle.Append([System.IO.File]::ReadAllText($layer.FullName))
}

$encoding = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($output, $bundle.ToString(), $encoding)

Write-Host "Built viewer CSS bundle from $($layers.Count) layer(s): $output" -ForegroundColor Green
'@

    $sync = @'
[CmdletBinding()]
param(
    [string]$Root = ""
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Root)) {
    $scriptRoot = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
        $PSScriptRoot
    }
    elseif ($MyInvocation.MyCommand.Path) {
        Split-Path -Parent $MyInvocation.MyCommand.Path
    }
    else {
        (Get-Location).Path
    }

    $Root = (Resolve-Path -LiteralPath (Join-Path $scriptRoot "..")).ProviderPath
}
else {
    $Root = (Resolve-Path -LiteralPath $Root).ProviderPath
}

$sourceDir = Join-Path $Root "src\viewer"
$coreDir = Join-Path $Root "AcRuleWorkbench.Core\Viewer"

$jsBuilder = Join-Path $Root "scripts\build-viewer-js.ps1"
$cssBuilder = Join-Path $Root "scripts\build-viewer-css.ps1"

if (Test-Path -LiteralPath $jsBuilder -PathType Leaf) {
    & $jsBuilder -Root $Root
    if ($LASTEXITCODE -ne 0) {
        throw "build-viewer-js.ps1 failed with exit code $LASTEXITCODE"
    }
}

if (Test-Path -LiteralPath $cssBuilder -PathType Leaf) {
    & $cssBuilder -Root $Root
    if ($LASTEXITCODE -ne 0) {
        throw "build-viewer-css.ps1 failed with exit code $LASTEXITCODE"
    }
}

function Get-FwEditorViewerBuild {
    param([Parameter(Mandatory = $true)][string]$RootPath)

    $buildFile = Join-Path $RootPath "viewer-build.txt"
    if (-not (Test-Path -LiteralPath $buildFile -PathType Leaf)) {
        throw "Missing viewer build marker file: $buildFile"
    }

    return ([System.IO.File]::ReadAllText($buildFile)).Trim()
}

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Text
    )

    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Text, $encoding)
}

function Apply-FwEditorViewerBuildMarker {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$ViewerBuild
    )

    $major = if ($ViewerBuild -match "^v(\d+)-fw-editor-viewer$") {
        $Matches[1]
    }
    else {
        throw "Unexpected viewer build marker: $ViewerBuild"
    }

    $cacheKey = "fw-editor-viewer-v$major"
    $text = [System.IO.File]::ReadAllText($Path)
    $text = [regex]::Replace($text, "v\d+-fw-editor-viewer", $ViewerBuild)
    $text = [regex]::Replace($text, "fw-editor-viewer-v\d+", $cacheKey)
    Write-Utf8NoBom -Path $Path -Text $text
}

$viewerBuild = Get-FwEditorViewerBuild -RootPath $Root

foreach ($asset in @("ac-rule-viewer.html", "ac-rule-viewer.js", "ac-rule-viewer.css")) {
    $sourceAsset = Join-Path $sourceDir $asset
    if (-not (Test-Path -LiteralPath $sourceAsset -PathType Leaf)) {
        throw "Missing canonical viewer asset: $sourceAsset"
    }

    Apply-FwEditorViewerBuildMarker -Path $sourceAsset -ViewerBuild $viewerBuild
}

if (-not (Test-Path -LiteralPath $coreDir -PathType Container)) {
    [void][System.IO.Directory]::CreateDirectory($coreDir)
}

foreach ($asset in @("ac-rule-viewer.html", "ac-rule-viewer.js", "ac-rule-viewer.css")) {
    Copy-Item -LiteralPath (Join-Path $sourceDir $asset) -Destination (Join-Path $coreDir $asset) -Force
}

Copy-Item -LiteralPath (Join-Path $sourceDir "ac-rule-viewer.html") -Destination (Join-Path $coreDir "ac-viewer-template.html") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ac-rule-viewer.css") -Destination (Join-Path $coreDir "ac-viewer-template.css") -Force

foreach ($asset in @("ac-rule-viewer.html", "ac-rule-viewer.js", "ac-rule-viewer.css", "ac-viewer-template.html", "ac-viewer-template.css")) {
    $candidate = Join-Path $coreDir $asset
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        Write-Utf8NoBom -Path $candidate -Text ([System.IO.File]::ReadAllText($candidate))
    }
}

Write-Host "Viewer assets synchronized from src\viewer to AcRuleWorkbench.Core\Viewer." -ForegroundColor Green
'@

    Write-TextNoBom "scripts\build-viewer-js.ps1" $buildJs
    Write-TextNoBom "scripts\build-viewer-css.ps1" $buildCss
    Write-TextNoBom "scripts\sync-viewer-assets.ps1" $sync
}

function Patch-RuntimeModule {
    $path = "src\viewer\js\10-runtime-prologue.js"
    $runtime = Read-Text $path

    $runtime = $runtime.Replace([string][char]0xFEFF, "")
    $runtime = $runtime.Replace("`r`n", "`n")

    # Remove prior helper insertions to avoid duplicate top-level functions.
    $runtime = [regex]::Replace(
        $runtime,
        "function isFwdApiDisabledByQuery\(\)\s*\{[^}]*\}\s*\n?",
        ""
    )

    $falseyLine = "function falseyQueryFlag(name){return /^(0|false|no|off)$/i.test(text(queryFlag(name)||''));}"
    $helperLine = "function isFwdApiDisabledByQuery(){return falseyQueryFlag('fwdApi')||falseyQueryFlag('api');}"

    if (-not $runtime.Contains($falseyLine)) {
        throw "Could not find falseyQueryFlag insertion point in $path"
    }

    $runtime = $runtime.Replace($falseyLine, $falseyLine + "`n" + $helperLine)

    # Remove prior hosted-bootstrap opt-out insertion, then insert exactly once.
    $runtime = [regex]::Replace(
        $runtime,
        "\n\s*if\(isFwdApiDisabledByQuery\(\)\)\{\n\s*recordViewerDiagnostic\('info','hosted-bootstrap-skipped',\{reason:'api-disabled-by-query'\}\);\n\s*return false;\n\s*\}\n",
        "`n"
    )

    $hostedNeedle = "async function loadHostedApiViewerBootstrap(){`n  const protocol=(window.location&&window.location.protocol)||'';"
    $hostedReplacement = "async function loadHostedApiViewerBootstrap(){`n  const protocol=(window.location&&window.location.protocol)||'';`n  if(isFwdApiDisabledByQuery()){`n    recordViewerDiagnostic('info','hosted-bootstrap-skipped',{reason:'api-disabled-by-query'});`n    return false;`n  }"

    if (-not $runtime.Contains($hostedNeedle)) {
        throw "Could not find loadHostedApiViewerBootstrap insertion point in $path"
    }

    $runtime = $runtime.Replace($hostedNeedle, $hostedReplacement)

    # Add an early FWD API hydration opt-out if a newer one is not already present.
    if (-not $runtime.Contains("fwd-api-load-disabled-by-query',{reason:'api-disabled-by-query'}")) {
        $fwdNeedle = "async function loadFwdApiData(){`n  recordViewerDiagnostic('info','fwd-api-load-start',{href:window.location.href});"
        $fwdBlock = "async function loadFwdApiData(){`n  recordViewerDiagnostic('info','fwd-api-load-start',{href:window.location.href});`n  if(isFwdApiDisabledByQuery()){`n    recordViewerDiagnostic('warn','fwd-api-load-disabled-by-query',{reason:'api-disabled-by-query'});`n    if(!applyEmbeddedFwdDataIfPresent()){`n      fwdData = null;`n      fwdApiHydrationState.mode = 'none';`n      fwdApiHydrationState.failedEndpoints = [];`n    }`n    return;`n  }"

        if ($runtime.Contains($fwdNeedle)) {
            $runtime = $runtime.Replace($fwdNeedle, $fwdBlock)
        }
        else {
            Write-Warn "Could not find loadFwdApiData insertion point; hosted bootstrap opt-out is still patched."
        }
    }

    Write-TextNoBom $path $runtime
}

function Write-BrowserSpecs {
    $common = @'
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
'@

    $blank = $common + @'

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
'@

    $resource = $common + @'

async function expectWorkspaceNotBlank(page, action, fallbackName, headingPattern) {
  await clickViewerAction(page, action, fallbackName);

  await expect(page.locator('#content')).toBeVisible();
  await expect(page.locator('#content')).not.toBeEmpty();
  await expect(page.locator('#content')).toContainText(headingPattern, { timeout: 10000 });
}

test.describe('FW Editor Viewer resource workspaces', () => {
  test('UDF, function, table, and Rule List workspaces are not blank', async ({ page }) => {
    const { pageErrors, consoleErrors } = await openViewer(page);

    await expectWorkspaceNotBlank(page, 'view-udfs', /UDFs|User Defined Functions/i, /User Defined Functions|UDFs/i);
    await expectWorkspaceNotBlank(page, 'view-functions', /Functions/i, /Functions/i);
    await expectWorkspaceNotBlank(page, 'view-tables', /Tables/i, /Tables/i);
    await expectWorkspaceNotBlank(page, 'view-rule-lists', /Rule Lists/i, /Rule Lists/i);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
'@

    $behavior = $common + @'

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

    await expect(page.getByRole('tab', { name: 'General' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Fields / Parameters' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Attributes' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Status Results' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Description' })).toBeVisible();

    await page.getByRole('tab', { name: 'Fields / Parameters' }).click();
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
'@

    Write-TextNoBom "tests\browser\fw-editor-viewer-blank-screen.spec.js" $blank
    Write-TextNoBom "tests\browser\fw-editor-viewer-resource-workspaces.spec.js" $resource
    Write-TextNoBom "tests\browser\fw-editor-viewer.behavior.spec.js" $behavior
}

function Normalize-ViewerAndTestFiles {
    $files = @(
        "src\viewer\ac-rule-viewer.js",
        "src\viewer\ac-rule-viewer.css",
        "src\viewer\ac-rule-viewer.html",
        "AcRuleWorkbench.Core\Viewer\ac-rule-viewer.js",
        "AcRuleWorkbench.Core\Viewer\ac-rule-viewer.css",
        "AcRuleWorkbench.Core\Viewer\ac-rule-viewer.html",
        "AcRuleWorkbench.Core\Viewer\ac-viewer-template.html",
        "AcRuleWorkbench.Core\Viewer\ac-viewer-template.css",
        "tests\browser\fw-editor-viewer-blank-screen.spec.js",
        "tests\browser\fw-editor-viewer-resource-workspaces.spec.js",
        "tests\browser\fw-editor-viewer.behavior.spec.js"
    )

    foreach ($file in $files) {
        Normalize-NoBom $file
    }

    foreach ($dir in @("src\viewer\js", "src\viewer\styles")) {
        $fullDir = Get-FullPath $dir
        if (Test-Path -LiteralPath $fullDir -PathType Container) {
            Get-ChildItem -LiteralPath $fullDir -Recurse -File |
                Where-Object { $_.Extension -in @(".js", ".css") } |
                ForEach-Object {
                    $encoding = New-Object System.Text.UTF8Encoding($false)
                    [System.IO.File]::WriteAllText($_.FullName, [System.IO.File]::ReadAllText($_.FullName), $encoding)
                }
        }
    }
}

try {
    $script:RepoRootResolved = Resolve-RepoRoot $RepoRoot
    Set-Location -LiteralPath $script:RepoRootResolved

    Write-Step "Using repo root: $script:RepoRootResolved"

    Write-Step "Overwrite viewer build/sync scripts with parse-safe versions"
    Write-ViewerBuildScripts
    Write-Ok "Viewer build/sync scripts repaired"

    Write-Step "Patch real viewer source module"
    Patch-RuntimeModule
    Write-Ok "src\viewer\js\10-runtime-prologue.js patched"

    Write-Step "Replace browser specs"
    Write-BrowserSpecs
    Write-Ok "Browser specs replaced"

    Write-Step "Rebuild and sync viewer assets"
    Invoke-Checked `
        -FilePath "powershell.exe" `
        -Arguments @(
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            ".\scripts\sync-viewer-assets.ps1",
            "-Root",
            $script:RepoRootResolved
        ) `
        -FailureMessage "sync-viewer-assets.ps1 failed"

    Write-Step "Normalize viewer/test files to UTF-8 without BOM"
    Normalize-ViewerAndTestFiles
    Write-Ok "Viewer/test files normalized"

    if (-not $SkipTests) {
        Write-Step "Run npm static validation"
        Invoke-Checked -FilePath "npm.cmd" -Arguments @("run", "test:ci") -FailureMessage "npm run test:ci failed"

        Write-Step "Run browser validation"
        Invoke-Checked -FilePath "npm.cmd" -Arguments @("run", "test:browser") -FailureMessage "npm run test:browser failed"
    }
    else {
        Write-Warn "SkipTests enabled; validation was not run."
    }

    Write-Ok "FW Editor Viewer patch complete."
}
catch {
    Write-Fail $_.Exception.Message
    exit 1
}
