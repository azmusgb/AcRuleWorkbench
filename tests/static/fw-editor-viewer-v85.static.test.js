const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '../..');
const viewerJs = fs.readFileSync(path.join(root, 'ac-rule-viewer.js'), 'utf8');
const viewerCss = fs.readFileSync(path.join(root, 'ac-rule-viewer.css'), 'utf8');
const viewerHtml = fs.readFileSync(path.join(root, 'ac-rule-viewer.html'), 'utf8');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

assert(viewerHtml.includes('FW Editor Viewer'), 'viewer HTML should use FW Editor Viewer naming');
assert(viewerHtml.includes('data-ui-build="v85-fw-editor-viewer"'), 'viewer HTML should advertise v85 build marker');
assert(viewerJs.includes("const viewerStateBuild='v85-fw-editor-viewer'"), 'viewer JS state key should use v85 build marker');
assert(!/FW Companion/.test(viewerHtml + viewerJs + viewerCss), 'viewer assets should not use FW Companion naming');

assert(viewerJs.includes("document.body.classList.toggle('advanced-mode',isAdvancedMode())"), 'advanced mode should be reflected as a body class');
assert(viewerJs.includes("document.body.classList.remove('editor-mode')"), 'normal FW Editor Viewer shell must not apply the obsolete editor-mode body class');
assert(!viewerJs.includes("document.body.classList.toggle('editor-mode',editorShell)"), 'normal shell must not toggle legacy editor-mode; it breaks the topbar/main header layout');
assert(!viewerJs.includes("function renderMainHead(){\n  if(isEditorMode())return;"), 'FW Editor Viewer mode must still update the main header instead of leaving No scope selected static markup');
assert(viewerCss.includes('the normal FW Editor Viewer shell'), 'CSS should include a final shell integrity override for the normal FW Editor Viewer shell');
assert(/id="diagnosticsDock"[^>]*advanced-only[^>]*hidden/.test(viewerHtml), 'diagnostics dock should be advanced-only and hidden in static HTML');
assert(viewerCss.includes('body.editor-mode:not(.advanced-mode) .fweditor-load-status-window'), 'normal editor mode should hide message windows');
assert(viewerCss.includes('body:not(.advanced-mode) .advanced-only'), 'normal mode should hide advanced-only elements');

assert(viewerJs.includes('fweditorRulePropertiesHtml'), 'selected-rule property sheet should be present');
assert(viewerJs.includes('rulePropertyPage'), 'rule property page state should be separate from the developer-only inspector state');
assert(viewerJs.includes('handleRulePropertyTabKeyboard'), 'rule property tabs should support keyboard navigation');
assert(viewerJs.includes('Fields / Parameters'), 'FW Editor-style Fields / Parameters property page should be present');
assert(viewerJs.includes('Status Results'), 'FW Editor-style Status Results property page should be present');
assert(viewerJs.includes('data-rule-property-tab'), 'rule property tabs should be interactive');
assert(viewerCss.includes('.fweditor-rulelist-toolbar'), 'Rule List toolbar CSS should be present');

assert(!/Read-only FWD snapshot analysis/.test(viewerJs), 'normal viewer should avoid analysis framing');
assert(!/view-messages/.test(viewerJs), 'workspace navigation should use load-status, not view-messages');
assert(viewerJs.includes("normalizeWorkspaceViewName(view)"), 'workspace view names should be normalized through a single function');
assert(!/function renderGlobalNavigation\(\)[\s\S]*function renderGlobalNavigation\(\)[\s\S]*function renderGlobalNavigation\(\)/.test(viewerJs), 'global navigation renderer should not be declared three times');
assert(!/usage candidate/i.test(viewerJs), 'default viewer language should avoid usage-candidate framing');
assert(!/No Messages messages/.test(viewerJs), 'viewer should not contain duplicated Messages wording');
assert(packageJson.includes('fw-editor-viewer-v85.static.test.js'), 'package test script should reference the v85 static test');


assert(viewerJs.includes('liveMinRefreshSeconds'), 'live view API calls should use a throttled live refresh interval.');
assert(viewerJs.includes("snapshotMode==='live'?`&liveMinRefreshSeconds=${liveMinRefreshSeconds}`:''"), 'live API hydration should pass liveMinRefreshSeconds instead of forcing full rebuilds per request.');
const cacheCs = fs.readFileSync(path.join(root, 'AcRuleWorkbench', 'Api', 'V1', 'WorkbenchSnapshotCache.cs'), 'utf8');
const serviceCs = fs.readFileSync(path.join(root, 'AcRuleWorkbench', 'Api', 'V1', 'WorkbenchApiService.cs'), 'utf8');
const apiTests = fs.readFileSync(path.join(root, 'AcRuleWorkbench.Tests', 'ApiContractTests.cs'), 'utf8');
assert(cacheCs.includes('GetLiveOrBuild'), 'snapshot cache should provide non-blocking live-coherent reads.');
assert(cacheCs.includes('return current;'), 'live-coherent reads should return the warm model immediately when available.');
assert(serviceCs.includes('SnapshotModeRequest.Rebuild'), 'forced rebuild should be separate from normal live view behavior.');
assert(serviceCs.includes('GetLiveOrBuild(path, process, requireNativeOk'), 'snapshotMode=live should use live-coherent cache, not per-request rebuild.');
assert(apiTests.includes('Dispatch_Snapshot_WithSnapshotModeLive_DoesNotSynchronouslyRebuildForEachRequest'), 'API tests should guard live mode against per-click full rebuilds.');
assert(apiTests.includes('Dispatch_Snapshot_WithSnapshotModeRebuild_ForcesRebuildForEachRequest'), 'API tests should keep explicit rebuild behavior available for developer verification.');

assert(viewerJs.includes('let globalUdfDefinitionsCache=null'), 'UDF definitions should be cached so opening UDFs does not repeatedly rescan every rule.');
assert(viewerJs.includes('if(globalUdfDefinitionsCache)return globalUdfDefinitionsCache'), 'buildUdfDefinitions should return cached rows after first computation.');
assert(viewerJs.includes('let globalFunctionDefinitionsCache=null'), 'function definitions should be cached for global navigation and rule property sheets.');
assert(viewerJs.includes('if(globalFunctionDefinitionsCache)return globalFunctionDefinitionsCache'), 'buildGlobalFunctionDefinitions should return cached rows after first computation.');


assert(viewerJs.includes("const tabs=[['structure','Rule List'],['field-resolution','Fields / Parameters'],...(isAdvancedMode()?[[ 'load-status','Load Status' ]]:[])];"), 'normal scope tabs should not expose load status unless advanced mode is enabled');
assert(viewerJs.includes("const tabs=['summary','actions',...(isAdvancedMode()?['messages','raw']:[])];"), 'Action List inspector should gate Load Status/raw tabs behind advanced mode');
assert(!/renderInspectorTabBar\(\['summary','actions','messages','raw'\]/.test(viewerJs), 'Action List inspector should not always render Load Status/Raw tabs');
assert(viewerJs.includes("...(isAdvancedMode()?[[ 'load-status','Load Status' ]]:[])"), 'UDF Load Status tab should be advanced-only');
assert(!/\['rule-list','Rule List'\],\s*\['messages','Messages'\]/.test(viewerJs), 'UDF message tab should not be present in normal-mode tab list');
assert((viewerJs.match(/function renderGlobalNavigation\(/g)||[]).length === 1, 'there should be exactly one global navigation renderer');
const functionNames = [...viewerJs.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)].map(match => match[1]);
const duplicateFunctions = [...new Set(functionNames.filter((name, index) => functionNames.indexOf(name) !== index))];
assert.deepStrictEqual(duplicateFunctions, [], `top-level viewer functions should not be silently overridden: ${duplicateFunctions.join(', ')}`);
assert(viewerJs.includes('return isAdvancedMode()&&explicitDeveloperShell'), 'older app shell should require advanced mode and an explicit developer-shell request');
assert(!/Use \?editor=0|Use \?shell=app/i.test(viewerJs), 'normal viewer should not advertise older shell escape hatches');
assert(!/function udfEditorEvidenceHtml|function udfEvidenceHtml/.test(viewerJs), 'UDF advanced detail helpers should use Load Status naming, not evidence naming');
assert(!/copy-branch-route|copy-route-path/.test(viewerJs), 'visible copy actions should use Action List vocabulary rather than route vocabulary');
assert(!/aria-label="Legacy inspector"/.test(viewerHtml), 'static HTML should not label the hidden right pane as Legacy inspector');


assert(viewerJs.includes("return ['structure','field-resolution',...(isAdvancedMode()?['load-status']:[])];"), 'local workspace views should use Load Status, not Messages, for the advanced page');
assert(viewerJs.includes("if(normalized==='messages')return 'load-status';"), 'old messages deep links should be normalized to load-status');
assert(!/view-messages/.test(viewerJs), 'visible workspace action id should not use view-messages');
assert(!/Advanced Diagnostics/.test(viewerJs), 'viewer JS should use Load Status / Developer wording instead of Advanced Diagnostics');
assert(!/tables-workbench/.test(viewerCss), 'CSS should not keep table workbench class naming');
assert(!/--workbench-/.test(viewerCss), 'CSS custom properties should not use workbench naming');

assert(viewerJs.includes('function actionListVmFromKey'), 'Action List VM helper should use FW Editor vocabulary');
assert(viewerJs.includes('function selectedActionList'), 'selected Action List helper should use FW Editor vocabulary');
assert(viewerJs.includes('data-action-list'), 'tree Action List rows should use action-list data attributes');
assert(!/data-branch|toggle-branch|branch-row|branch-label|route-chip|route-prefix|route-path|route-step/.test(viewerJs + viewerCss), 'viewer should not use branch/route CSS or DOM vocabulary for Action Lists');
assert(!/function branch[A-Za-z0-9_]*|function [A-Za-z0-9_]*Branch/.test(viewerJs), 'viewer JS should not define branch-named helpers for Action Lists');
assert(!/function route[A-Za-z0-9_]*|function [A-Za-z0-9_]*Route/.test(viewerJs), 'viewer JS should not define route-named helpers for Action Lists');
assert(!/tabbed-workbench|--workbench-|tables-workbench/.test(viewerCss), 'default CSS should not carry workbench naming');
assert(!/FW Companion|companion surface|read-only configuration companion/i.test(viewerCss + viewerJs + viewerHtml), 'viewer assets should not carry companion product framing');

assert(/<body[^>]*fw-editor-viewer-shell/.test(viewerHtml), 'static body should default to the FW Editor Viewer shell');
assert(!viewerJs.includes("function renderTop(){\n  document.body.classList.add('no-scope-selector')"), 'renderTop must not permanently latch no-scope-selector');


const coreTemplate = fs.readFileSync(path.join(root, 'AcRuleWorkbench.Core', 'Viewer', 'ac-viewer-template.html'), 'utf8');
const extractionClient = fs.readFileSync(path.join(root, 'AcRuleWorkbench.Core', 'FormWorksExtractionClient.cs'), 'utf8');
const programCs = fs.readFileSync(path.join(root, 'AcRuleWorkbench', 'Program.cs'), 'utf8');
const serverCs = fs.readFileSync(path.join(root, 'AcRuleWorkbench', 'WorkbenchApiServer.cs'), 'utf8');
assert(coreTemplate.includes('data-ui-build="v85-fw-editor-viewer"'), 'core HTML template should advertise the current FW Editor Viewer shell');
assert(extractionClient.includes('content.IndexOf("FW Editor Viewer", StringComparison.OrdinalIgnoreCase) >= 0'), 'C# template validation must accept the current FW Editor Viewer template');
assert(!extractionClient.includes('content.IndexOf("AC Rule Workbench", StringComparison.OrdinalIgnoreCase) >= 0'), 'C# template validation must not require the obsolete embedded workbench shell');
assert(!extractionClient.includes('Evidence export profile:'), 'viewer export warnings should not expose evidence-profile terminology in normal output');
assert(!extractionClient.includes('Private/full FWD resource evidence is gated'), 'viewer export warnings should not expose full-evidence guidance in normal output');
assert(programCs.includes('FW Editor Viewer Export'), 'CLI viewer export title should use FW Editor Viewer naming');
assert(!programCs.includes('AC Live Viewer Export'), 'CLI viewer export should not use old AC Live Viewer title');
assert(!programCs.includes('Console.WriteLine("Profile       : "'), 'CLI viewer export should not print evidence/export profile in normal output');
assert(serverCs.includes('== FW Editor Viewer API =='), 'server banner should use FW Editor Viewer naming');
assert(!serverCs.includes('== AC Rule Workbench API =='), 'server banner should not use old workbench naming');


const startWorkbench = fs.readFileSync(path.join(root, 'scripts', 'start-workbench.ps1'), 'utf8');
const startFwEditorViewer = fs.readFileSync(path.join(root, 'scripts', 'start-fw-editor-viewer.ps1'), 'utf8');
const buildAndDoctor = fs.readFileSync(path.join(root, 'scripts', 'build-and-doctor.ps1'), 'utf8');
assert(startWorkbench.includes('$effectiveWaitForReadyBeforeOpen = (-not [bool]$OpenWhenLive) -or [bool]$WaitForReadyBeforeOpen'), 'launcher should default to ready-health wait unless -OpenWhenLive is explicitly used');
assert(startWorkbench.includes('Open wait mode') && startWorkbench.includes('live (fast-open)'), 'launcher should report explicit ready/live open wait mode');
assert(startWorkbench.includes('Start-WbViewerOpenHelper -LiveHealthUrl $liveHealthUrl -ReadyHealthUrl $readyHealthUrl -ViewerUrl $viewerUrl -TimeoutSeconds $ReadyTimeoutSeconds -WaitForReady ([bool]$effectiveWaitForReadyBeforeOpen)'), 'foreground open helper should use the effective ready-wait setting');
assert(startWorkbench.includes(`if ($WaitForReady) {\n    exit 2\n}`), 'ready-wait helper should not open the viewer after timeout while the snapshot is still not ready');
assert(startWorkbench.includes('Initialize-WbProgress -TotalSteps $(if ($CheckWorkingTree) { 8 } else { 7 })'), 'startup progress total should match the seven normal launch sections');
assert(startFwEditorViewer.includes('[int]$ReadyTimeoutSeconds = 600'), 'preferred FW Editor Viewer launcher should allow long FWD snapshot warm-up by default');
assert(startFwEditorViewer.includes('[switch]$OpenWhenLive'), 'preferred launcher should expose fast-open only as an explicit opt-in');
assert(startFwEditorViewer.includes("if ($OpenWhenLive) { $forward += '-OpenWhenLive' }"), 'preferred launcher should forward the explicit fast-open opt-in');
assert(buildAndDoctor.includes('.\\start-fw-editor-viewer.cmd -FwdPath .\\fwd.cfd'), 'build-and-doctor should recommend the FW Editor Viewer launcher, not old workbench commands');
assert(!buildAndDoctor.includes('.\\run-workbench.cmd'), 'build-and-doctor should not recommend the old workbench launcher as the primary next step');

console.log('FW Editor Viewer v85 static checks passed.');
