const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '../..');
const viewerJs = fs.readFileSync(path.join(root, 'ac-rule-viewer.js'), 'utf8');
const viewerCss = fs.readFileSync(path.join(root, 'ac-rule-viewer.css'), 'utf8');
const viewerHtml = fs.readFileSync(path.join(root, 'ac-rule-viewer.html'), 'utf8');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

assert(viewerHtml.includes('FW Editor Viewer'), 'viewer HTML should use FW Editor Viewer naming');
assert(viewerHtml.includes('data-ui-build="v82-fw-editor-viewer"'), 'viewer HTML should advertise v82 build marker');
assert(viewerJs.includes("const viewerStateBuild='v82-fw-editor-viewer'"), 'viewer JS state key should use v82 build marker');
assert(!/FW Companion/.test(viewerHtml + viewerJs + viewerCss), 'viewer assets should not use FW Companion naming');

assert(viewerJs.includes("document.body.classList.toggle('advanced-mode',isAdvancedMode())"), 'advanced mode should be reflected as a body class');
assert(viewerJs.includes("document.body.classList.remove('editor-mode')"), 'normal FW Editor Viewer shell must not apply the obsolete editor-mode body class');
assert(!viewerJs.includes("document.body.classList.toggle('editor-mode',editorShell)"), 'normal shell must not toggle legacy editor-mode; it breaks the topbar/main header layout');
assert(!viewerJs.includes("function renderMainHead(){\n  if(isEditorMode())return;"), 'FW Editor Viewer mode must still update the main header instead of leaving No scope selected static markup');
assert(viewerCss.includes('v82: the normal FW Editor Viewer shell'), 'CSS should include a final shell integrity override for v82');
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
assert(packageJson.includes('fw-editor-viewer-v82.static.test.js'), 'package test script should reference the v82 static test');


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
assert(coreTemplate.includes('data-ui-build="v82-fw-editor-viewer"'), 'core HTML template should advertise the current FW Editor Viewer shell');
assert(extractionClient.includes('content.IndexOf("FW Editor Viewer", StringComparison.OrdinalIgnoreCase) >= 0'), 'C# template validation must accept the current FW Editor Viewer template');
assert(!extractionClient.includes('content.IndexOf("AC Rule Workbench", StringComparison.OrdinalIgnoreCase) >= 0'), 'C# template validation must not require the obsolete embedded workbench shell');
assert(!extractionClient.includes('Evidence export profile:'), 'viewer export warnings should not expose evidence-profile terminology in normal output');
assert(!extractionClient.includes('Private/full FWD resource evidence is gated'), 'viewer export warnings should not expose full-evidence guidance in normal output');
assert(programCs.includes('FW Editor Viewer Export'), 'CLI viewer export title should use FW Editor Viewer naming');
assert(!programCs.includes('AC Live Viewer Export'), 'CLI viewer export should not use old AC Live Viewer title');
assert(!programCs.includes('Console.WriteLine("Profile       : "'), 'CLI viewer export should not print evidence/export profile in normal output');
assert(serverCs.includes('== FW Editor Viewer API =='), 'server banner should use FW Editor Viewer naming');
assert(!serverCs.includes('== AC Rule Workbench API =='), 'server banner should not use old workbench naming');

console.log('FW Editor Viewer v82 static checks passed.');
