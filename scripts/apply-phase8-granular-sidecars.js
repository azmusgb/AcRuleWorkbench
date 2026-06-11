#!/usr/bin/env node
/*
  Applies Phase 8 granular sidecars to an existing AcRuleWorkbench source tree.

  Usage:
    node .\scripts\apply-phase8-granular-sidecars.js

  The zip already contains the new source files. This script patches the small number
  of existing integration points, rebuilds viewer bundles, and attempts to generate
  granular sidecars from the currently available static viewer JSON files.
*/

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const root = process.cwd();

function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/, '');
}

function read(file) {
  return stripBom(fs.readFileSync(path.join(root, file), 'utf8'));
}

function write(file, text) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, stripBom(text), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function log(message) {
  console.log(message);
}

function patchRuntimeLoader() {
  const file = 'src/viewer/js/10-runtime-prologue.js';
  if (!exists(file)) throw new Error(`Missing ${file}`);
  let text = read(file);

  const loadStart = "recordViewerDiagnostic('info','load-viewer-data-start',{href:window.location.href});";
  const granularBlock = `
  if(typeof tryLoadGranularIndexMode==='function'){
    const granularLoaded = await tryLoadGranularIndexMode();
    if(granularLoaded){
      recordViewerDiagnostic('info','load-viewer-data-complete',{source:'granular-index',counts:payloadCounts()});
      return;
    }
  }`;

  if (!text.includes('source:\'granular-index\'')) {
    if (!text.includes(loadStart)) throw new Error(`Could not find loadViewerData start marker in ${file}`);
    text = text.replace(loadStart, loadStart + granularBlock);
    log('[OK] Patched loadViewerData to prefer granular index sidecars.');
  } else {
    log('[OK] Granular index loader already wired.');
  }

  if (!text.includes('granularSidecarState:')) {
    const marker = "fwdApiHydrationState: typeof fwdApiHydrationState==='undefined'?null:{mode:fwdApiHydrationState.mode,failedEndpoints:[...list(fwdApiHydrationState.failedEndpoints||[])]},";
    if (text.includes(marker)) {
      text = text.replace(marker, marker + "\n    granularSidecarState: typeof window.fwViewerGranularState==='function'?window.fwViewerGranularState():null,");
      log('[OK] Added granular state to fwViewerDiagnostics().');
    } else {
      log('[WARN] Could not patch fwViewerDiagnostics(); runtime still works but diagnostics will not expose granular state there.');
    }
  } else {
    log('[OK] Granular diagnostics already present.');
  }

  write(file, text);
}

function patchServerGenericJsonSidecars() {
  const file = 'AcRuleWorkbench/WorkbenchApiServer.cs';
  if (!exists(file)) {
    log('[SKIP] WorkbenchApiServer.cs not found; skipping hosted sidecar route patch.');
    return;
  }

  let text = read(file);

  if (!text.includes('IsViewerGranularSidecarRoute')) {
    const routeMarker = `        if (routeKey == "api/workbench/status")`;
    const routeBlock = `        if (IsViewerGranularSidecarRoute(routeKey))
        {
            string assetName = routeKey.StartsWith("viewer/", StringComparison.OrdinalIgnoreCase)
                ? routeKey.Substring("viewer/".Length)
                : routeKey;
            WriteViewerTextAsset(context, assetName, "application/json; charset=utf-8", "{}");
            return;
        }

`;
    if (!text.includes(routeMarker)) throw new Error('Could not locate route insertion marker in WorkbenchApiServer.cs');
    text = text.replace(routeMarker, routeBlock + routeMarker);

    const methodMarker = '    private sealed class WorkbenchRefreshState';
    const method = `    private static bool IsViewerGranularSidecarRoute(string routeKey)
    {
        if (string.IsNullOrWhiteSpace(routeKey))
            return false;

        string key = routeKey.StartsWith("viewer/", StringComparison.OrdinalIgnoreCase)
            ? routeKey.Substring("viewer/".Length)
            : routeKey;

        if (!key.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
            return false;

        foreach (char ch in key)
        {
            bool safe = char.IsLetterOrDigit(ch) || ch == '.' || ch == '-' || ch == '_';
            if (!safe)
                return false;
        }

        return key.Equals("ac-rule-viewer.manifest.json", StringComparison.OrdinalIgnoreCase)
            || key.Equals("ac-rule-viewer.index.json", StringComparison.OrdinalIgnoreCase)
            || key.StartsWith("rules.", StringComparison.OrdinalIgnoreCase)
            || key.StartsWith("fwd.", StringComparison.OrdinalIgnoreCase)
            || key.StartsWith("ac-rule-viewer.boot", StringComparison.OrdinalIgnoreCase)
            || key.StartsWith("ac-rule-viewer.fwd", StringComparison.OrdinalIgnoreCase);
    }


`;
    if (!text.includes(methodMarker)) throw new Error('Could not locate method insertion marker in WorkbenchApiServer.cs');
    text = text.replace(methodMarker, method + methodMarker);
    log('[OK] Patched WorkbenchApiServer with safe generic viewer JSON sidecar route.');
  } else {
    log('[OK] Generic granular sidecar route already present.');
  }

  write(file, text);
}

function patchStartScript() {
  const file = 'scripts/start-fw-editor-viewer.ps1';
  if (!exists(file)) {
    log('[SKIP] start-fw-editor-viewer.ps1 not found; granular sidecars can be built manually.');
    return;
  }

  let text = read(file);
  if (text.includes('build-viewer-granular-sidecars.js')) {
    log('[OK] Start script already builds granular sidecars.');
    return;
  }

  const block = `
# Phase 8: build granular viewer sidecars from the generated static viewer JSON.
$phase8GranularSidecarBuilder = Join-Path $repoRoot "scripts\\build-viewer-granular-sidecars.js"
if (Test-Path -LiteralPath $phase8GranularSidecarBuilder -PathType Leaf) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCommand) {
        Write-WbProgress "Build granular viewer sidecars"
        & node $phase8GranularSidecarBuilder $repoRoot $repoRoot
        if ($LASTEXITCODE -ne 0) {
            Write-WbWarning "Granular sidecar generation failed; viewer will fall back to boot/fwd sidecars. Exit code: $LASTEXITCODE"
        }
    }
    else {
        Write-WbWarning "Node.js was not found; granular sidecars were not generated. Viewer will fall back to boot/fwd sidecars."
    }
}

`;

  const marker = '$appArgs = @(';
  if (text.includes(marker)) {
    text = text.replace(marker, block + marker);
  } else {
    text += '\n' + block;
  }

  write(file, text);
  log('[OK] Patched start script to build granular sidecars before API launch.');
}

function rebuildBundles() {
  const jsDir = path.join(root, 'src/viewer/js');
  const cssDir = path.join(root, 'src/viewer/styles');

  if (!fs.existsSync(jsDir)) throw new Error('Missing src/viewer/js');
  if (!fs.existsSync(cssDir)) throw new Error('Missing src/viewer/styles');

  const jsBundle = fs.readdirSync(jsDir)
    .filter(file => file.endsWith('.js'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map(file => read(path.join('src/viewer/js', file)))
    .join('\n\n');

  const cssBundle = fs.readdirSync(cssDir)
    .filter(file => file.endsWith('.css'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map(file => read(path.join('src/viewer/styles', file)))
    .join('\n\n');

  const jsTargets = [
    'src/viewer/ac-rule-viewer.js',
    'AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js',
    'ac-rule-viewer.js'
  ];

  const cssTargets = [
    'src/viewer/ac-rule-viewer.css',
    'AcRuleWorkbench.Core/Viewer/ac-rule-viewer.css',
    'AcRuleWorkbench.Core/Viewer/ac-viewer-template.css',
    'ac-rule-viewer.css'
  ];

  for (const target of jsTargets) {
    if (target === 'ac-rule-viewer.js' || exists(path.dirname(target))) write(target, jsBundle);
  }
  for (const target of cssTargets) {
    if (target === 'ac-rule-viewer.css' || exists(path.dirname(target))) write(target, cssBundle);
  }

  log('[OK] Rebuilt and synced viewer JS/CSS bundles.');
}

function assertSyntax() {
  for (const file of [
    'scripts/build-viewer-granular-sidecars.js',
    'scripts/test-phase8-granular-sidecars.js',
    'scripts/apply-phase8-granular-sidecars.js'
  ]) {
    if (!exists(file)) continue;
    childProcess.execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
  }
  log('[OK] Node script syntax checks passed.');
}

function buildSidecarsIfPossible() {
  if (!exists('scripts/build-viewer-granular-sidecars.js')) {
    log('[WARN] Granular sidecar builder is missing.');
    return;
  }

  const hasSource = exists('ac-rule-viewer.boot.json') || exists('ac-rule-viewer.tree.json') || exists('ac-rule-viewer.rules.json');
  if (!hasSource) {
    log('[INFO] No generated viewer JSON sidecars found yet. They will be built by the start script after viewer export.');
    return;
  }

  try {
    childProcess.execFileSync(process.execPath, [path.join(root, 'scripts/build-viewer-granular-sidecars.js'), root, root], { stdio: 'inherit' });
    log('[OK] Generated granular sidecars from current viewer JSON.');
  } catch (error) {
    log('[WARN] Granular sidecar generation failed. Existing viewer remains fallback-safe.');
    log(error && error.message ? error.message : String(error));
  }
}

function main() {
  patchRuntimeLoader();
  patchServerGenericJsonSidecars();
  patchStartScript();
  rebuildBundles();
  assertSyntax();
  buildSidecarsIfPossible();
  log('[COMPLETE] Phase 8 granular sidecar patch applied.');
}

main();
