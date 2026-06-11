const fs = require("fs");
const path = require("path");

const root = process.cwd();

function p(...parts) {
  return path.join(root, ...parts);
}

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text.replace(/^\uFEFF/, ""), { encoding: "utf8" });
}

function mustExist(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required file: ${path.relative(root, file)}`);
  }
}

function listFiles(dir, ext) {
  return fs.readdirSync(dir)
    .filter(name => name.toLowerCase().endsWith(ext))
    .sort((a, b) => a.localeCompare(b))
    .map(name => path.join(dir, name));
}

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function patchRuntimeModule() {
  const file = p("src", "viewer", "js", "10-runtime-prologue.js");
  mustExist(file);

  let text = normalizeNewlines(read(file));

  // Remove bad previous verbose helper insertion.
  text = text.replace(
    /\n\s*function isFwdApiDisabledByQuery\(\)\{\s*\n\s*const params = new URLSearchParams\(window\.location\.search \|\| ''\);\s*\n\s*const value = params\.get\('fwdApi'\) \|\| params\.get\('api'\);\s*\n\s*return !!\(value && \/\^\(off\|false\|0\|no\)\$\/i\.test\(value\)\);\s*\n\s*\}\s*\n/g,
    "\n"
  );

  // Remove duplicate compact helpers, then insert exactly once.
  text = text.replace(
    /\n?function isFwdApiDisabledByQuery\(\)\{return falseyQueryFlag\('fwdApi'\)\|\|falseyQueryFlag\('api'\);\}\n?/g,
    "\n"
  );

  const falseyLine = "function falseyQueryFlag(name){return /^(0|false|no|off)$/i.test(text(queryFlag(name)||''));}";
  const helperLine = "function isFwdApiDisabledByQuery(){return falseyQueryFlag('fwdApi')||falseyQueryFlag('api');}";

  if (!text.includes(falseyLine)) {
    throw new Error("Could not find falseyQueryFlag insertion point.");
  }

  text = text.replace(falseyLine, `${falseyLine}\n${helperLine}`);

  // Ensure boot hydration uses the central helper.
  text = text.replace(
    "if(falseyQueryFlag('fwdApi')||falseyQueryFlag('apiHydrate'))return false;",
    "if(isFwdApiDisabledByQuery()||falseyQueryFlag('apiHydrate'))return false;"
  );

  // Remove duplicate hosted-bootstrap opt-out blocks.
  text = text.replace(
    /\n\s*if\(isFwdApiDisabledByQuery\(\)\)\{\s*\n\s*recordViewerDiagnostic\('info','hosted-bootstrap-skipped',\{reason:'api-disabled-by-query'\}\);\s*\n\s*return false;\s*\n\s*\}\s*\n/g,
    "\n"
  );

  const hostedNeedle = "async function loadHostedApiViewerBootstrap(){\n  const protocol=(window.location&&window.location.protocol)||'';";
  const hostedReplacement = "async function loadHostedApiViewerBootstrap(){\n  const protocol=(window.location&&window.location.protocol)||'';\n  if(isFwdApiDisabledByQuery()){\n    recordViewerDiagnostic('info','hosted-bootstrap-skipped',{reason:'api-disabled-by-query'});\n    return false;\n  }";

  if (!text.includes(hostedNeedle)) {
    throw new Error("Could not find loadHostedApiViewerBootstrap insertion point.");
  }

  text = text.replace(hostedNeedle, hostedReplacement);

  write(file, text);
}

function buildViewerJs() {
  const moduleDir = p("src", "viewer", "js");
  const out = p("src", "viewer", "ac-rule-viewer.js");

  mustExist(moduleDir);

  const modules = listFiles(moduleDir, ".js");
  if (!modules.length) {
    throw new Error("No JS modules found.");
  }

  const bundle = modules.map(read).join("");
  write(out, bundle);

  console.log(`[OK] Built src/viewer/ac-rule-viewer.js from ${modules.length} module(s).`);
}

function buildViewerCss() {
  const layerDir = p("src", "viewer", "styles");
  const out = p("src", "viewer", "ac-rule-viewer.css");

  mustExist(layerDir);

  const layers = listFiles(layerDir, ".css");
  if (!layers.length) {
    throw new Error("No CSS layers found.");
  }

  const bundle = layers.map(read).join("");
  write(out, bundle);

  console.log(`[OK] Built src/viewer/ac-rule-viewer.css from ${layers.length} layer(s).`);
}

function syncCoreViewerAssets() {
  const src = p("src", "viewer");
  const core = p("AcRuleWorkbench.Core", "Viewer");

  for (const name of ["ac-rule-viewer.html", "ac-rule-viewer.js", "ac-rule-viewer.css"]) {
    const source = path.join(src, name);
    const target = path.join(core, name);

    mustExist(source);
    write(target, read(source));
  }

  write(path.join(core, "ac-viewer-template.html"), read(path.join(src, "ac-rule-viewer.html")));
  write(path.join(core, "ac-viewer-template.css"), read(path.join(src, "ac-rule-viewer.css")));

  console.log("[OK] Synced viewer assets into AcRuleWorkbench.Core/Viewer.");
}

function writeStableSyncScript() {
  const script = String.raw`[CmdletBinding()]
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

node .\scripts\repair-viewer-state.js
if ($LASTEXITCODE -ne 0) {
    throw "repair-viewer-state.js failed with exit code $LASTEXITCODE"
}
`;

  write(p("scripts", "sync-viewer-assets.ps1"), script);
  console.log("[OK] Replaced sync-viewer-assets.ps1 with stable Node-backed sync.");
}

function patchBrowserSelectorStrictness() {
  const file = p("tests", "browser", "fw-editor-viewer.behavior.spec.js");
  mustExist(file);

  let text = read(file);

  text = text.replaceAll(
    "page.getByRole('tab', { name: 'General' })",
    "page.getByLabel('Rule property pages').getByRole('tab', { name: 'General' })"
  );

  text = text.replaceAll(
    "page.getByRole('tab', { name: 'Fields / Parameters' })",
    "page.getByLabel('Rule property pages').getByRole('tab', { name: 'Fields / Parameters' })"
  );

  text = text.replaceAll(
    "page.getByRole('tab', { name: 'Attributes' })",
    "page.getByLabel('Rule property pages').getByRole('tab', { name: 'Attributes' })"
  );

  text = text.replaceAll(
    "page.getByRole('tab', { name: 'Status Results' })",
    "page.getByLabel('Rule property pages').getByRole('tab', { name: 'Status Results' })"
  );

  text = text.replaceAll(
    "page.getByRole('tab', { name: 'Description' })",
    "page.getByLabel('Rule property pages').getByRole('tab', { name: 'Description' })"
  );

  write(file, text);
  console.log("[OK] Scoped duplicate tab selectors to Rule property pages.");
}

function verifyEquality() {
  const srcJs = read(p("src", "viewer", "ac-rule-viewer.js"));
  const coreJs = read(p("AcRuleWorkbench.Core", "Viewer", "ac-rule-viewer.js"));

  if (srcJs !== coreJs) {
    throw new Error("Core viewer JS still does not exactly equal src/viewer/ac-rule-viewer.js.");
  }

  const srcCss = read(p("src", "viewer", "ac-rule-viewer.css"));
  const coreCss = read(p("AcRuleWorkbench.Core", "Viewer", "ac-rule-viewer.css"));

  if (srcCss !== coreCss) {
    throw new Error("Core viewer CSS still does not exactly equal src/viewer/ac-rule-viewer.css.");
  }

  console.log("[OK] Source/Core viewer JS and CSS match exactly.");
}

function main() {
  mustExist(p("AcRuleWorkbench.sln"));
  mustExist(p("src", "viewer", "js", "10-runtime-prologue.js"));
  mustExist(p("tests", "browser", "fw-editor-viewer.behavior.spec.js"));

  patchRuntimeModule();
  buildViewerJs();
  buildViewerCss();
  syncCoreViewerAssets();
  patchBrowserSelectorStrictness();
  writeStableSyncScript();
  verifyEquality();

  console.log("[COMPLETE] Viewer state repaired.");
}

main();
