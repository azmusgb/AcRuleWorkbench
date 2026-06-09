const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));
const readDir = rel => fs.readdirSync(path.join(root, rel));
const readSortedConcat = rel => readDir(rel).filter(name => /\.(js|css)$/.test(name)).sort().map(name => read(path.join(rel, name))).join('');
const viewerBuild = read('viewer-build.txt').trim();
const versionMatch = /^v(\d+)-fw-editor-viewer$/.exec(viewerBuild);
assert(versionMatch, `viewer-build.txt has unexpected format: ${viewerBuild}`);
const cacheKey = `fw-editor-viewer-v${versionMatch[1]}`;

const files = {
  html: read('ac-rule-viewer.html'),
  js: read('ac-rule-viewer.js'),
  css: read('ac-rule-viewer.css'),
  coreHtml: read('AcRuleWorkbench.Core/Viewer/ac-rule-viewer.html'),
  coreTemplate: read('AcRuleWorkbench.Core/Viewer/ac-viewer-template.html'),
  coreJs: read('AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js'),
  coreCss: read('AcRuleWorkbench.Core/Viewer/ac-rule-viewer.css'),
  start: read('scripts/start-fw-editor-viewer.ps1'),
  compatStart: read('scripts/start-workbench.ps1'),
  packageJson: read('package.json'),
  srcJs: read('src/viewer/ac-rule-viewer.js'),
  srcCss: read('src/viewer/ac-rule-viewer.css'),
  testsCsproj: read('AcRuleWorkbench.Tests/AcRuleWorkbench.Tests.csproj'),
  sourcePackageScript: read('scripts/package-source-clean.ps1')
};

const csharpFiles = {
  extractionClient: read('AcRuleWorkbench.Core/FormWorksExtractionClient.cs'),
  extractionViewerExport: read('AcRuleWorkbench.Core/FormWorksExtractionClient.ViewerExport.cs'),
  extractionViewerPayload: exists('AcRuleWorkbench.Core/FormWorksExtractionClient.ViewerPayload.cs') ? read('AcRuleWorkbench.Core/FormWorksExtractionClient.ViewerPayload.cs') : '',
  extractionViewerPrivateTree: exists('AcRuleWorkbench.Core/FormWorksExtractionClient.ViewerPrivateTree.cs') ? read('AcRuleWorkbench.Core/FormWorksExtractionClient.ViewerPrivateTree.cs') : '',
  extractionResources: read('AcRuleWorkbench.Core/FormWorksExtractionClient.Resources.cs'),
  extractionRelationships: read('AcRuleWorkbench.Core/FormWorksExtractionClient.Relationships.cs'),
  apiService: read('AcRuleWorkbench/Api/V1/WorkbenchApiService.cs'),
  apiFunctions: read('AcRuleWorkbench/Api/V1/WorkbenchApiService.Functions.cs'),
  apiTables: read('AcRuleWorkbench/Api/V1/WorkbenchApiService.Tables.cs'),
  apiUdfs: read('AcRuleWorkbench/Api/V1/WorkbenchApiService.Udfs.cs'),
  apiRuleDetails: read('AcRuleWorkbench/Api/V1/WorkbenchApiService.RuleDetails.cs'),
  snapshotCache: read('AcRuleWorkbench/Api/V1/WorkbenchSnapshotCache.cs'),
  snapshotBuilder: read('AcRuleWorkbench/Api/V1/WorkbenchSnapshot.cs'),
  server: read('AcRuleWorkbench/WorkbenchApiServer.cs'),
  serverStatic: exists('AcRuleWorkbench/WorkbenchApiServer.StaticViewer.cs') ? read('AcRuleWorkbench/WorkbenchApiServer.StaticViewer.cs') : '',
  serverDebug: exists('AcRuleWorkbench/WorkbenchApiServer.Debug.cs') ? read('AcRuleWorkbench/WorkbenchApiServer.Debug.cs') : ''
};

function assertIncludes(name, text, value) { assert(text.includes(value), `${name} should include ${value}`); }
function functionNames(js) { return [...js.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]); }
function lineCount(text) { return text.split(/\r?\n/).length; }
function countOccurrences(text, needle) { return (text.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length; }

for (const [name, text] of Object.entries({ html: files.html, coreHtml: files.coreHtml, coreTemplate: files.coreTemplate })) {
  assertIncludes(name, text, `data-ui-build="${viewerBuild}"`);
  assertIncludes(name, text, `ac-rule-viewer.css?v=${cacheKey}`);
  assertIncludes(name, text, `ac-rule-viewer.js?v=${cacheKey}`);
  assert(!/data-ui-build="v(?:8[0-9]|9[0-2])-fw-editor-viewer"/.test(text), `${name} must not advertise stale pre-${viewerBuild} markers`);
}

assertIncludes('root JS', files.js, `const viewerStateBuild='${viewerBuild}'`);
assertIncludes('core JS', files.coreJs, `const viewerStateBuild='${viewerBuild}'`);
assertIncludes('startup stale marker source', files.start, 'Get-WbViewerBuildMarker');
assert(!/v\d+-fw-editor-viewer/.test(files.start), 'startup script must not hardcode release-specific viewer build markers');
assert(!/fw-editor-viewer-v(?:8[0-9]|9[0-2])/.test(files.html + files.coreTemplate), 'viewer HTML must not keep stale cache-busting query strings');
assert.strictEqual(JSON.parse(files.packageJson).viewerBuild, viewerBuild, 'package.json viewerBuild must match viewer-build.txt');
const editorModeContractTest = read('AcRuleWorkbench.Tests/ViewerEditorModeContractTests.cs');
assert(editorModeContractTest.includes('ReadViewerBuild(repoRoot)'), 'ViewerEditorModeContractTests must read viewer-build.txt instead of hardcoding release markers');
assert(!/v\d+-fw-editor-viewer/.test(editorModeContractTest), 'ViewerEditorModeContractTests must not hardcode release-specific viewer build markers');

assertIncludes('package.json', files.packageJson, 'fw-editor-viewer.static.test.js');
assert(!/fw-editor-viewer-v\d+\.static\.test\.js/.test(files.packageJson), 'package test script must not reference version-specific static tests');

assert.strictEqual(files.js, files.srcJs, 'root viewer JS must be generated from src/viewer/ac-rule-viewer.js');
assert.strictEqual(files.coreJs, files.srcJs, 'Core viewer JS must be generated from src/viewer/ac-rule-viewer.js');
assert.strictEqual(files.css, files.srcCss, 'root viewer CSS must be generated from src/viewer/ac-rule-viewer.css');
assert.strictEqual(files.coreCss, files.srcCss, 'Core viewer CSS must be generated from src/viewer/ac-rule-viewer.css');
assert.strictEqual(files.srcJs, readSortedConcat('src/viewer/js'), 'src/viewer/ac-rule-viewer.js must equal concatenated src/viewer/js modules');
assert.strictEqual(files.srcCss, readSortedConcat('src/viewer/styles'), 'src/viewer/ac-rule-viewer.css must equal concatenated src/viewer/styles layers');
assert(exists('scripts/build-viewer-js.ps1'), 'viewer JS build script is required');
assert(exists('scripts/build-viewer-css.ps1'), 'viewer CSS build script is required');
assert(readDir('src/viewer/js').filter(name => name.endsWith('.js')).length >= 8, 'viewer JS should be split into source modules');
assert(readDir('src/viewer/styles').filter(name => name.endsWith('.css')).length >= 5, 'viewer CSS should be split into source layers');
assert(exists('tests/fixtures/viewer-minimal/ac-rule-viewer.rules.json'), 'browser fixture rules sidecar is required');
assert(exists('tests/fixtures/viewer-minimal/ac-rule-viewer.rel.json'), 'browser fixture relationships sidecar is required');
assert(exists('tests/fixtures/viewer-minimal/ac-rule-viewer.tree.json'), 'browser fixture tree sidecar is required');
assert(exists('tests/fixtures/viewer-minimal/ac-rule-viewer.fwd.json'), 'browser fixture FWD resource sidecar is required');
assert(!read('tests/browser/fw-editor-viewer.behavior.spec.js').includes('describe.skip'), 'browser behavior tests must not skip in source-clean packages');
assert(!read('tests/browser/fw-editor-viewer-resource-workspaces.spec.js').includes('describe.skip'), 'resource browser tests must not skip in source-clean packages');

const rootFns = functionNames(files.js);
const dupes = rootFns.filter((name, index) => rootFns.indexOf(name) !== index);
assert.deepStrictEqual([...new Set(dupes)], [], `Duplicate top-level JS function declarations: ${[...new Set(dupes)].join(', ')}`);
for (const helper of ['selectedPathIds','isHotspotNode','selectedActionList','childActionListGroups','renderGlobalDefinitionExplorer','isGlobalDefinitionView','globalWorkspaceViews','commandRegistry','executeCommand']) {
  assert(rootFns.includes(helper), `Missing required viewer helper function: ${helper}`);
}

assert(files.js.includes("const globalMode=isGlobalDefinitionView(state.workspaceView||'structure');"), 'fweditor-global-mode must be limited to global resource views');
assert(!files.js.includes("const workspaceActive=validWorkspaceViews().includes(state.workspaceView||'structure');"), 'fweditor-global-mode must not be derived from every valid workspace');
assert(!files.js.includes('lower(JSON.stringify([u.parameterNames,u.statusResults,u.rules]))'), 'UDF filtering must use precomputed searchBlob, not per-render JSON.stringify');
assert(files.js.includes('searchBlob:lower([displayName'), 'canonical UDF rows should precompute searchBlob');
assert(files.js.includes('function pagedRows('), 'resource and catalog lists should use simple pagination helpers');

for (const [name, css] of Object.entries({ css: files.css, coreCss: files.coreCss })) {
  assert(!/body\.fweditor-global-mode\s+\.main-head\s*\{\s*display\s*:\s*none\s*!important\s*;?\s*\}/m.test(css), `${name} must not hide .main-head in fweditor-global-mode`);
  assert(!/body\.fweditor-global-mode\s+#content\s*\{[^}]*overflow\s*:\s*hidden\s*;[^}]*\}/m.test(css), `${name} must not force #content overflow:hidden in fweditor-global-mode`);
  assert(!/body\.editor-mode\b/.test(css), `${name} default bundle must not contain body.editor-mode legacy selectors`);
  const importantCount = countOccurrences(css, '!important');
  assert(importantCount <= 2000, `${name} !important budget exceeded: ${importantCount}`);
}

assert(files.start.includes('function Start-WbViewerOpenHelper'), 'start-fw-editor-viewer.ps1 should be the real startup engine');
assert(files.start.includes('[switch]$ForceViewerRefresh'), 'canonical launcher must support -ForceViewerRefresh');
assert(files.start.includes('[switch]$NoBuild'), 'canonical launcher must support -NoBuild');
assert(files.start.includes('[switch]$DryRun'), 'canonical launcher must support -DryRun');
assert(files.start.includes('[switch]$SnapshotWarmup'), 'canonical launcher must support explicit -SnapshotWarmup opt-in');
assert(files.start.includes('[switch]$NoLiveLazy'), 'canonical launcher must support disabling live-lazy mode');
assert(files.start.includes('--live-lazy'), 'canonical launcher must pass --live-lazy to the API by default');
assert(files.compatStart.includes('deprecated'), 'start-workbench.ps1 should be a deprecated wrapper only');
assert(files.compatStart.includes('start-fw-editor-viewer.ps1'), 'deprecated start-workbench.ps1 should forward to start-fw-editor-viewer.ps1');
assert(files.compatStart.length < 7000, 'deprecated start-workbench.ps1 should remain a small wrapper, not the real engine');
assert(!exists('scripts/dev-workbench.ps1'), 'scripts/dev-workbench.ps1 must not be active in source-clean package');
assert(!exists('AcRuleWorkbench/scripts/start-workbench.ps1'), 'nested AcRuleWorkbench/scripts wrappers must not be included in source-clean package');
assert(files.sourcePackageScript.includes('^AcRuleWorkbench/scripts'), 'source package script must exclude nested project script wrappers');

assert(exists('viewer-build.txt'), 'viewer-build.txt build constant is required');
assert(exists('src/viewer/README.md'), 'canonical viewer source README is required');
assert(files.testsCsproj.includes('archive/**/*.cs'), 'test project must exclude archived stale C# test files');
assert(exists('scripts/remove-stale-fwcompanion-tests.ps1'), 'stale FWCompanion cleanup script is required');
assert(exists('scripts/remove-stale-workbench-surfaces.ps1'), 'stale active workbench-surface cleanup script is required');
assert(read('scripts/remove-stale-workbench-surfaces.ps1').includes('dev-workbench.ps1'), 'workbench surface cleanup must quarantine active dev-workbench scripts');
assert(read('scripts/remove-stale-fwcompanion-tests.ps1').includes(".archive\\stale-fwcompanion-tests"), 'stale FWCompanion cleanup must move files outside the test project');
assert(read('scripts/remove-stale-fwcompanion-tests.ps1').includes("$staleFiles = @(Get-ChildItem"), 'stale FWCompanion cleanup must array-wrap Get-ChildItem so .Count works under StrictMode with one file');
assert(read('scripts/remove-stale-fwcompanion-tests.ps1').includes("$remaining = @(Get-ChildItem"), 'stale FWCompanion cleanup must array-wrap archive enumeration under StrictMode');
assert(!read('README.md').includes('README_FW_EDITOR_VIEWER_V91.md'), 'README.md must not point to stale v91 notes');
assert(read('README.md').includes('README_FW_EDITOR_VIEWER_V101.md'), 'README.md must point to current release notes');
assert(!read('UPDATE_FILES_MANIFEST.txt').includes('v89'), 'update manifest must not mention stale v89 package');

assert(csharpFiles.extractionClient.includes('public sealed partial class FormWorksExtractionClient'), 'FormWorksExtractionClient must be partial after C# split');
assert(csharpFiles.apiService.includes('internal sealed partial class WorkbenchApiService'), 'WorkbenchApiService must remain partial after API split');
assert(exists('AcRuleWorkbench.Core/FormWorksExtractionClient.ViewerExport.cs'), 'viewer export extraction partial is required');
assert(exists('AcRuleWorkbench.Core/FormWorksExtractionClient.ViewerPayload.cs'), 'viewer payload extraction partial is required');
assert(exists('AcRuleWorkbench.Core/FormWorksExtractionClient.ViewerPrivateTree.cs'), 'viewer private-tree extraction partial is required');
assert(exists('AcRuleWorkbench/WorkbenchApiServer.StaticViewer.cs'), 'server static viewer partial is required');
assert(csharpFiles.server.includes('internal sealed partial class WorkbenchApiServer'), 'WorkbenchApiServer should be partial after server split');
assert(lineCount(csharpFiles.extractionClient) < 2500, `FormWorksExtractionClient.cs remains too large after split: ${lineCount(csharpFiles.extractionClient)}`);
assert(lineCount(csharpFiles.apiService) < 3000, `WorkbenchApiService.cs remains too large after split: ${lineCount(csharpFiles.apiService)}`);
assert(lineCount(csharpFiles.extractionViewerExport) < 1800, `FormWorksExtractionClient.ViewerExport.cs remains too large after split: ${lineCount(csharpFiles.extractionViewerExport)}`);
assert(lineCount(csharpFiles.server) < 2200, `WorkbenchApiServer.cs remains too large after split: ${lineCount(csharpFiles.server)}`);
assert(csharpFiles.snapshotCache.includes('CancellationTokenSource'), 'snapshot cache should cancel superseded/cleared builds');
assert(csharpFiles.snapshotCache.includes('CancelPendingBuildIfAny'), 'snapshot cache should explicitly cancel same-key rebuilds');
assert(csharpFiles.snapshotCache.includes('TaskCreationOptions.RunContinuationsAsynchronously'), 'snapshot cache continuations must run asynchronously');
assert(csharpFiles.snapshotCache.includes('_lastCurrentGeneration'), 'snapshot cache should separate per-key caching from global current selection');
assert(exists('AcRuleWorkbench/Api/V1/LiveFwdSessionCache.cs'), 'live-lazy mode requires a lightweight FWD session cache');
assert(exists('AcRuleWorkbench/Api/V1/WorkbenchApiService.ViewerBootstrap.cs'), 'live-lazy mode requires a lightweight viewer bootstrap API partial');
assert(read('AcRuleWorkbench/Api/V1/WorkbenchApiService.cs').includes('viewer/bootstrap'), 'API dispatch must expose /api/v1/viewer/bootstrap');
assert(read('AcRuleWorkbench/Api/V1/WorkbenchApiService.ViewerBootstrap.cs').includes('BuildViewerBootstrap'), 'viewer bootstrap API partial must build a lightweight payload');
assert(read('AcRuleWorkbench/Api/V1/LiveFwdSessionCache.cs').includes('IReadOnlyList<string> Documents'), 'live session must retain document names for viewer bootstrap');
assert(read('AcRuleWorkbench/Api/V1/LiveFwdSessionCache.cs').includes('ResourceTypes = Array.Empty<string>()'), 'live-lazy session must avoid full resource traversal');
assert(read('AcRuleWorkbench/WorkbenchApiServer.cs').includes('StartLiveSessionWarmupMonitor'), 'API startup must open a lightweight live FWD session instead of full snapshot warm-up in live-lazy mode');
assert(files.js.includes('loadHostedApiViewerBootstrap'), 'viewer must use hosted live-lazy bootstrap when static sidecars are absent or empty');
assert(files.js.includes('snapshotSidecarsHaveContent'), 'viewer must reject empty JSON sidecar fallbacks instead of rendering a blank body');
assert(files.js.includes('ensureUsefulWorkspaceSelection'), 'viewer must auto-route away from empty default workspaces after boot/hydration');
assert(files.js.includes('product-empty-metrics'), 'viewer must render an actionable no-rule empty state with metrics');
assert(files.start.includes('ac-rule-viewer.fwd.json'), 'static viewer refresh must validate the FWD sidecar, not only rules/rel/tree JSON');
assert(read('AcRuleWorkbench/Api/V1/WorkbenchApiService.cs').includes('SnapshotStrategyLabel()'), 'API status/readiness must expose live-lazy snapshot strategy');
assert(csharpFiles.snapshotBuilder.includes('CancellationToken cancellationToken'), 'snapshot builder should accept a cancellation token');
assert(csharpFiles.snapshotBuilder.includes('cancellationToken.ThrowIfCancellationRequested'), 'snapshot builder should check cancellation during extraction');
assert(files.packageJson.includes('"lint:viewer"'), 'package.json must expose viewer lint script');
assert(exists('eslint.config.mjs'), 'ESLint no-undef config is required');
assert(read('eslint.config.mjs').includes('"no-undef": "error"'), 'ESLint must enforce no-undef');

console.log(`FW Editor Viewer static checks passed for ${viewerBuild}.`);
