const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const source = read('src/viewer/ac-rule-viewer.html');
const embedded = read('AcRuleWorkbench.Core/Viewer/ac-rule-viewer.html');
const template = read('AcRuleWorkbench.Core/Viewer/ac-viewer-template.html');

assert.strictEqual(embedded, source, 'embedded viewer HTML must match canonical source HTML');
assert.strictEqual(template, source, 'viewer template HTML must match canonical source HTML');

assert(source.includes('data-ui-build="v104-fw-editor-viewer"'), 'motion work must preserve the active viewer build marker');
assert(source.includes('id="workbenchMotionStyles" type="text/plain"'), 'motion CSS payload must remain style-surface compliant');
assert(source.includes('id="workbenchMotionRuntime"'), 'motion runtime marker is required');
assert(source.includes("document.createElement('style')"), 'motion runtime must install its audited CSS payload');
assert(source.includes("window.matchMedia?.('(prefers-reduced-motion: reduce)')"), 'reduced-motion support is required');
assert(source.includes('Element.prototype.animate'), 'Web Animations feature detection is required');
assert(source.includes('new MutationObserver'), 'dynamic viewer surfaces must be observed');
assert(source.includes('.slice(0, 10)'), 'staggered child animation must stay bounded');
assert(source.includes("target.closest('#statusPill,#sourceSummaryWarnings')"), 'status emphasis must respond to content changes');
assert(source.includes('let helpWasVisible = false;'), 'modal visibility transitions must be edge-triggered');
assert(!source.includes("if (target.id === 'statusPill' || target.id === 'sourceSummaryWarnings')"), 'status class mutations must not retrigger themselves');
assert(!/<style\b/i.test(source), 'viewer HTML must not contain literal style blocks');
assert(!/<[^>]+\sstyle\s*=/i.test(source), 'viewer HTML must not contain inline style attributes');

console.log('Workbench Motion static contracts passed.');
