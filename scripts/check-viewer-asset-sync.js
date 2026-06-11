#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const utf8 = 'utf8';

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), utf8);
}

function readSortedConcat(relativeDir, extension) {
  const directory = path.join(root, relativeDir);
  return fs.readdirSync(directory)
    .filter(name => name.toLowerCase().endsWith(extension))
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map(name => fs.readFileSync(path.join(directory, name), utf8))
    .join('');
}

const expectedJs = readSortedConcat('src/viewer/js', '.js');
const expectedCss = readSortedConcat('src/viewer/styles', '.css');

const files = {
  'src/viewer/ac-rule-viewer.js': expectedJs,
  'AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js': expectedJs,
  'ac-rule-viewer.js': expectedJs,
  'src/viewer/ac-rule-viewer.css': expectedCss,
  'AcRuleWorkbench.Core/Viewer/ac-rule-viewer.css': expectedCss,
  'AcRuleWorkbench.Core/Viewer/ac-viewer-template.css': expectedCss,
  'ac-rule-viewer.css': expectedCss
};

const mismatches = [];
for (const [relativePath, expected] of Object.entries(files)) {
  try {
    assert.strictEqual(read(relativePath), expected);
  } catch {
    mismatches.push(relativePath);
  }
}

if (mismatches.length) {
  console.error('Viewer asset bundles are out of sync with modular source files:');
  for (const file of mismatches) console.error(`- ${file}`);
  console.error('Run: npm run build:viewer');
  process.exitCode = 1;
} else {
  console.log('Viewer asset bundles are in sync.');
}
