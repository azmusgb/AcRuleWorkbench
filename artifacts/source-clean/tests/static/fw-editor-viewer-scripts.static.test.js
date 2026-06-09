const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));

const start = read('scripts/start-fw-editor-viewer.ps1');
const compat = read('scripts/start-workbench.ps1');
const rootLauncher = read('start-fw-editor-viewer.cmd');
const runWorkbench = exists('run-workbench.cmd') ? read('run-workbench.cmd') : '';

for (const token of [
  '[switch]$ForceViewerRefresh',
  '[switch]$NoBuild',
  '[switch]$KillExisting',
  '[switch]$OpenWhenLive',
  '[int]$ReadyTimeoutSeconds',
  '[switch]$DryRun',
  '[switch]$SnapshotWarmup',
  '[switch]$NoLiveLazy'
]) {
  assert(start.includes(token), `canonical start-fw-editor-viewer.ps1 is missing ${token}`);
}

assert(start.includes('function Start-WbViewerOpenHelper'), 'canonical start-fw-editor-viewer.ps1 must be the real startup engine');
assert(start.includes('Dry run completed'), 'canonical startup script must support dry-run plan validation');
assert(start.includes('--live-lazy'), 'canonical startup script must pass --live-lazy by default');
assert(start.includes('--snapshot-warmup'), 'canonical startup script must support explicit snapshot warm-up');
assert(compat.toLowerCase().includes('deprecated'), 'start-workbench.ps1 should be a deprecated wrapper only');
assert(compat.includes('start-fw-editor-viewer.ps1'), 'start-workbench.ps1 should forward to start-fw-editor-viewer.ps1');
assert(compat.length < 7000, 'deprecated start-workbench.ps1 should stay small');
assert(rootLauncher.includes('scripts\\start-fw-editor-viewer.ps1') || rootLauncher.includes('scripts\start-fw-editor-viewer.ps1'), 'root launcher must call scripts\\start-fw-editor-viewer.ps1');
assert(!exists('scripts/dev-workbench.ps1'), 'scripts/dev-workbench.ps1 must be moved out of the active script surface');
assert(!exists('scripts/dev-workbench.cmd'), 'scripts/dev-workbench.cmd must be moved out of the active script surface');
if (runWorkbench) {
  assert(runWorkbench.toLowerCase().includes('deprecated'), 'run-workbench.cmd must be a deprecation wrapper');
  assert(runWorkbench.includes('start-fw-editor-viewer.cmd'), 'run-workbench.cmd must delegate to start-fw-editor-viewer.cmd');
}

console.log('FW Editor Viewer script contract checks passed.');
