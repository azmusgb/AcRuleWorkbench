const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const excludedDirs = new Set(['.git', '.vs', 'bin', 'obj', 'node_modules', 'artifacts', 'packages', '_disabled_legacy_layers']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excludedDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (/\.(html?|css|js)$/i.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function count(re, text) {
  return (text.match(re) || []).length;
}

const files = walk(root);
assert(files.length > 0, 'style surface audit found no HTML/CSS/JS files');

const activeViewerCss = new Set([
  'ac-rule-viewer.css',
  'src/viewer/ac-rule-viewer.css',
  'AcRuleWorkbench.Core/Viewer/ac-rule-viewer.css',
  'AcRuleWorkbench.Core/Viewer/ac-viewer-template.css'
]);

const allowedImportantBudgets = new Map([
  ['ac-rule-viewer.css', 2000],
  ['src/viewer/ac-rule-viewer.css', 2000],
  ['AcRuleWorkbench.Core/Viewer/ac-rule-viewer.css', 2000],
  ['AcRuleWorkbench.Core/Viewer/ac-viewer-template.css', 2000],
  ['AcRuleWorkbench/ApiHarness/api-harness.css', 100],
  ['src/viewer/styles/00-reset-tokens.css', 0],
  ['src/viewer/styles/10-app-shell.css', 0],
  ['src/viewer/styles/20-left-nav.css', 0],
  ['src/viewer/styles/30-rule-list.css', 0],
  ['src/viewer/styles/40-inspector.css', 0],
  ['src/viewer/styles/90-legacy-runtime-bundle.css', 2000],
]);

const violations = [];
const cssRows = [];

for (const file of files) {
  const relative = rel(file);
  const ext = path.extname(file).toLowerCase();
  const text = fs.readFileSync(file, 'utf8');

  if (ext === '.html' || ext === '.htm') {
    const styleBlocks = count(/<style\b/gi, text);
    const inlineAttrs = count(/<[^>]+\sstyle\s*=/gi, text);
    if (styleBlocks) violations.push(`${relative}: contains ${styleBlocks} <style> block(s)`);
    if (inlineAttrs) violations.push(`${relative}: contains ${inlineAttrs} inline style attribute(s)`);
  }

  if (ext === '.js' && relative !== 'tests/static/style-surfaces.static.test.js') {
    const generatedInlineAttrs = count(/["`][^"`\n]*\sstyle\s*=/gi, text);
    const domStyleMutations = count(/\.style\b|setAttribute\(\s*['"]style/gi, text);
    if (generatedInlineAttrs) violations.push(`${relative}: generates ${generatedInlineAttrs} inline style attribute(s)`);
    if (domStyleMutations) violations.push(`${relative}: mutates DOM inline style ${domStyleMutations} time(s)`);
  }

  if (ext === '.css') {
    const important = count(/!important/g, text);
    cssRows.push({ relative, important });
    const budget = allowedImportantBudgets.get(relative);
    if (budget !== undefined) {
      assert(important <= budget, `${relative} !important budget exceeded: ${important} > ${budget}`);
    } else {
      assert.strictEqual(important, 0, `${relative} has unaudited !important declarations: ${important}`);
    }
  }
}

assert.deepStrictEqual(violations, [], `Style surface violations:\n${violations.join('\n')}`);

const srcCss = fs.readFileSync(path.join(root, 'src/viewer/ac-rule-viewer.css'), 'utf8');
const coreCss = fs.readFileSync(path.join(root, 'AcRuleWorkbench.Core/Viewer/ac-rule-viewer.css'), 'utf8');
const templateCss = fs.readFileSync(path.join(root, 'AcRuleWorkbench.Core/Viewer/ac-viewer-template.css'), 'utf8');

assert.strictEqual(coreCss, srcCss, 'Core viewer CSS must match canonical src/viewer/ac-rule-viewer.css');
assert.strictEqual(templateCss, srcCss, 'Core viewer template CSS must match canonical src/viewer/ac-rule-viewer.css');

assert(srcCss.includes('Audited dynamic styling utilities'), 'viewer CSS must include audited dynamic utility classes');
assert(srcCss.includes('Audited shell layout widths'), 'viewer CSS must include audited shell width classes');
assert(srcCss.includes('Audited meter widths'), 'viewer CSS must include audited meter width classes');

console.log(`Style surface checks passed for ${files.length} HTML/CSS/JS files.`);
