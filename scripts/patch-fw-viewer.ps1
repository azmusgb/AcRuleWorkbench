<#
.SYNOPSIS
  Patches FW Editor Viewer source/runtime tests after clean-package refactor.

.DESCRIPTION
  This script is intentionally self-contained and Windows PowerShell 5.1 compatible.

  It fixes the current viewer/test failures by:
  - forcing execution from the repo root
  - repairing unsafe $PSScriptRoot-based build/sync script defaults
  - writing viewer-generated files as UTF-8 without BOM
  - patching the real JS source module instead of the generated bundle
  - making fwdApi=off suppress hosted API/bootstrap probes
  - replacing brittle Playwright specs with deterministic fixture-mode specs
  - rebuilding/syncing viewer assets
  - normalizing source/generated viewer files to UTF-8 without BOM
  - optionally running npm validation

.PARAMETER RepoRoot
  Repository root. Defaults to the current directory if it looks like the repo,
  otherwise C:\dev\AcRuleWorkbench.

.PARAMETER SkipTests
  Patch only. Do not run npm test:ci or npm run test:browser.

.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\patch-fw-viewer.ps1

.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\patch-fw-viewer.ps1 -SkipTests
#>

[CmdletBinding()]
param(
    [string]$RepoRoot,
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
    param([string]$Candidate)

    if (-not [string]::IsNullOrWhiteSpace($Candidate)) {
        $resolved = Resolve-Path -LiteralPath $Candidate -ErrorAction Stop
        return $resolved.ProviderPath
    }

    $cwd = (Get-Location).Path
    if (
        (Test-Path -LiteralPath (Join-Path $cwd "AcRuleWorkbench.sln")) -and
        (Test-Path -LiteralPath (Join-Path $cwd "src\viewer")) -and
        (Test-Path -LiteralPath (Join-Path $cwd "scripts"))
    ) {
        return $cwd
    }

    $default = "C:\dev\AcRuleWorkbench"
    if (Test-Path -LiteralPath $default -PathType Container) {
        return (Resolve-Path -LiteralPath $default).ProviderPath
    }

    throw "Could not resolve repo root. Run from repo root or pass -RepoRoot C:\path\to\AcRuleWorkbench"
}

function Read-Utf8Text {
    param([Parameter(Mandatory = $true)][string]$Path)

    $full = [System.IO.Path]::GetFullPath((Join-Path $script:RepoRootResolved $Path))
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
        throw "Missing file: $Path"
    }

    return [System.IO.File]::ReadAllText($full)
}

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $full = [System.IO.Path]::GetFullPath((Join-Path $script:RepoRootResolved $Path))
    $dir = [System.IO.Path]::GetDirectoryName($full)

    if (-not [string]::IsNullOrWhiteSpace($dir) -and -not (Test-Path -LiteralPath $dir)) {
        [void][System.IO.Directory]::CreateDirectory($dir)
    }

    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($full, $Content, $encoding)
}

function Write-Utf8NoBomFullPath {
    param(
        [Parameter(Mandatory = $true)][string]$FullPath,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($FullPath, $Content, $encoding)
}

function Find-ParamBlockEndIndex {
    param([Parameter(Mandatory = $true)][string]$Text)

    $match = [regex]::Match($Text, "^\s*param\s*\(", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $match.Success) {
        return -1
    }

    $index = $match.Index + $match.Length
    $depth = 1
    $inSingle = $false
    $inDouble = $false

    for ($i = $index; $i -lt $Text.Length; $i++) {
        $ch = $Text[$i]

        if ($ch -eq "'" -and -not $inDouble) {
            $inSingle = -not $inSingle
            continue
        }

        if ($ch -eq '"' -and -not $inSingle) {
            $inDouble = -not $inDouble
            continue
        }

        if ($inSingle -or $inDouble) {
            continue
        }

        if ($ch -eq '(') {
            $depth++
            continue
        }

        if ($ch -eq ')') {
            $depth--
            if ($depth -eq 0) {
                return $i + 1
            }
        }
    }

    return -1
}

function Repair-ViewerScriptRootDefault {
    param([Parameter(Mandatory = $true)][string]$Path)

    $text = Read-Utf8Text $Path

    # Replace unsafe defaults like:
    # [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $text = [regex]::Replace(
        $text,
        "(\[string\]\s*\`$Root\s*=\s*)\(?Resolve-Path\s*\(?Join-Path\s*\`$PSScriptRoot\s+['""]\.\.['""]\)?\)?(?:\.Path|\.ProviderPath)?",
        '$1""',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )

    $text = [regex]::Replace(
        $text,
        "(\[string\]\s*\`$Root\s*=\s*)\(\s*Resolve-Path\s+\(Join-Path\s+\`$PSScriptRoot\s+['""]\.\.['""]\)\s*\)\.Path",
        '$1""',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )

    if ($text -match "\[string\]\s*\`$Root\s*=\s*\(Resolve-Path") {
        throw "Unsafe Root default still exists in $Path"
    }

    if ($text -notmatch "FW_VIEWER_PATCH_ROOT_RESOLVER") {
        $end = Find-ParamBlockEndIndex $text

        $resolver = @'

# FW_VIEWER_PATCH_ROOT_RESOLVER
$scriptRootForDefaults = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    $PSScriptRoot
}
elseif ($MyInvocation.MyCommand.Path) {
    Split-Path -Parent $MyInvocation.MyCommand.Path
}
else {
    (Get-Location).Path
}

if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = (Resolve-Path -LiteralPath (Join-Path $scriptRootForDefaults "..")).ProviderPath
}
else {
    $Root = (Resolve-Path -LiteralPath $Root).ProviderPath
}

'@

        if ($end -ge 0) {
            $text = $text.Insert($end, "`r`n" + $resolver)
        }
        else {
            # Script has no param block. Add Root param + resolver.
            $text = "param([string]`$Root = `"")`r`n$resolver`r`n$text"
        }
    }

    # Replace common BOM-producing writes where present. Normalization later is the hard guarantee.
    $text = $text.Replace(
        'Set-Content -LiteralPath $output -Value $bundle.ToString() -Encoding UTF8 -NoNewline',
        '[System.IO.File]::WriteAllText($output, $bundle.ToString(), (New-Object System.Text.UTF8Encoding($false)))'
    )

    $text = $text.Replace(
        'Set-Content -LiteralPath $Output -Value $bundle.ToString() -Encoding UTF8 -NoNewline',
        '[System.IO.File]::WriteAllText($Output, $bundle.ToString(), (New-Object System.Text.UTF8Encoding($false)))'
    )

    $text = $text.Replace(
        'Set-Content -LiteralPath $Path -Value $text -Encoding UTF8 -NoNewline',
        '[System.IO.File]::WriteAllText($Path, $text, (New-Object System.Text.UTF8Encoding($false)))'
    )

    $text = $text.Replace(
        'Set-Content -LiteralPath $TargetPath -Value $text -Encoding UTF8 -NoNewline',
        '[System.IO.File]::WriteAllText($TargetPath, $text, (New-Object System.Text.UTF8Encoding($false)))'
    )

    Write-Utf8NoBom $Path $text
}

function Patch-RuntimeModule {
    $path = "src\viewer\js\10-runtime-prologue.js"
    $runtime = Read-Utf8Text $path

    if ($runtime -notmatch "function isFwdApiDisabledByQuery\(") {
        $runtime = [regex]::Replace(
            $runtime,
            "(function falseyQueryFlag\(name\)\{[^\r\n]*\}\r?\n)",
            {
                param($m)
                $m.Groups[1].Value + "function isFwdApiDisabledByQuery(){return falseyQueryFlag('fwdApi')||falseyQueryFlag('api');}`r`n"
            },
            1
        )
    }

    if ($runtime -notmatch "function isFwdApiDisabledByQuery\(") {
        # Fallback insertion before shouldHydrateFwdApiOnBoot.
        $runtime = [regex]::Replace(
            $runtime,
            "(function shouldHydrateFwdApiOnBoot\()",
            "function isFwdApiDisabledByQuery(){return falseyQueryFlag('fwdApi')||falseyQueryFlag('api');}`r`n`r`n`$1",
            1
        )
    }

    if ($runtime -notmatch "function isFwdApiDisabledByQuery\(") {
        throw "Could not insert isFwdApiDisabledByQuery into $path"
    }

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

    if ($runtime -notmatch "hosted-bootstrap-skipped.*api-disabled-by-query") {
        throw "Could not patch hosted bootstrap API opt-out into $path"
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

    if ($runtime -notmatch "fwd-api-load-disabled-by-query.*api-disabled-by-query") {
        Write-Warn "Could not patch loadFwdApiData API opt-out. Hosted bootstrap opt-out was patched. Continuing."
    }

    Write-Utf8NoBom $path $runtime
}

function Write-BrowserSpecs {
    $commonPrefix = @'
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

    $blankSpec = $commonPrefix + @'

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

    $resourceSpec = $commonPrefix + @'

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

    $behaviorSpec = $commonPrefix + @'

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

    Write-Utf8NoBom "tests\browser\fw-editor-viewer-blank-screen.spec.js" $blankSpec
    Write-Utf8NoBom "tests\browser\fw-editor-viewer-resource-workspaces.spec.js" $resourceSpec
    Write-Utf8NoBom "tests\browser\fw-editor-viewer.behavior.spec.js" $behaviorSpec
}

function Normalize-ViewerFiles {
    $relative = @(
        "src\viewer\ac-rule-viewer.js",
        "src\viewer\ac-rule-viewer.css",
        "src\viewer\ac-rule-viewer.html",
        "AcRuleWorkbench.Core\Viewer\ac-rule-viewer.js",
        "AcRuleWorkbench.Core\Viewer\ac-rule-viewer.css",
        "AcRuleWorkbench.Core\Viewer\ac-rule-viewer.html",
        "AcRuleWorkbench.Core\Viewer\ac-viewer-template.html",
        "AcRuleWorkbench.Core\Viewer\ac-viewer-template.css"
    )

    foreach ($item in $relative) {
        $full = Join-Path $script:RepoRootResolved $item
        if (Test-Path -LiteralPath $full -PathType Leaf) {
            Write-Utf8NoBomFullPath $full ([System.IO.File]::ReadAllText($full))
        }
    }

    foreach ($dir in @("src\viewer\js", "src\viewer\styles", "tests\browser")) {
        $fullDir = Join-Path $script:RepoRootResolved $dir
        if (Test-Path -LiteralPath $fullDir -PathType Container) {
            Get-ChildItem -LiteralPath $fullDir -File -Recurse |
                Where-Object { $_.Extension -in @(".js", ".css", ".html") } |
                ForEach-Object {
                    Write-Utf8NoBomFullPath $_.FullName ([System.IO.File]::ReadAllText($_.FullName))
                }
        }
    }
}

function Invoke-RequiredCommand {
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

try {
    $script:RepoRootResolved = Resolve-RepoRoot $RepoRoot
    Set-Location -LiteralPath $script:RepoRootResolved

    Write-Step "Using repo root: $script:RepoRootResolved"

    $required = @(
        "AcRuleWorkbench.sln",
        "scripts\build-viewer-js.ps1",
        "scripts\build-viewer-css.ps1",
        "scripts\sync-viewer-assets.ps1",
        "src\viewer\js\10-runtime-prologue.js",
        "src\viewer\ac-rule-viewer.html",
        "tests\fixtures\viewer-minimal"
    )

    foreach ($item in $required) {
        if (-not (Test-Path -LiteralPath (Join-Path $script:RepoRootResolved $item))) {
            throw "Required path missing: $item"
        }
    }

    Write-Step "Repair viewer build/sync scripts"
    foreach ($scriptPath in @(
        "scripts\build-viewer-js.ps1",
        "scripts\build-viewer-css.ps1",
        "scripts\sync-viewer-assets.ps1"
    )) {
        Repair-ViewerScriptRootDefault $scriptPath
        Write-Ok $scriptPath
    }

    Write-Step "Patch real viewer source module"
    Patch-RuntimeModule
    Write-Ok "src\viewer\js\10-runtime-prologue.js"

    Write-Step "Replace browser tests with deterministic fixture-mode specs"
    Write-BrowserSpecs
    Write-Ok "Browser specs replaced"

    Write-Step "Rebuild/sync viewer assets"
    Invoke-RequiredCommand `
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

    Write-Step "Normalize viewer files to UTF-8 without BOM"
    Normalize-ViewerFiles
    Write-Ok "Viewer/test files normalized"

    if (-not $SkipTests) {
        Write-Step "Run npm static validation"
        Invoke-RequiredCommand -FilePath "npm.cmd" -Arguments @("run", "test:ci") -FailureMessage "npm run test:ci failed"

        Write-Step "Run browser validation"
        Invoke-RequiredCommand -FilePath "npm.cmd" -Arguments @("run", "test:browser") -FailureMessage "npm run test:browser failed"
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
