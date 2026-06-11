#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const utf8 = 'utf8';

function read(filePath) {
  return fs.readFileSync(filePath, utf8);
}

function writeIfChanged(filePath, contents) {
  const existing = fs.existsSync(filePath) ? read(filePath) : null;
  if (existing === contents) {
    return false;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, utf8);
  return true;
}

function listLayerFiles(directory, extension) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error(`Missing viewer source directory: ${path.relative(root, directory)}`);
  }

  const files = fs.readdirSync(directory)
    .filter(name => name.toLowerCase().endsWith(extension))
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map(name => path.join(directory, name));

  if (files.length === 0) {
    throw new Error(`No ${extension} files found in ${path.relative(root, directory)}`);
  }

  return files;
}

function concatFiles(files) {
  return files.map(file => read(file)).join('');
}

function syncFile(source, targets) {
  const contents = read(source);
  const changed = [];
  for (const target of targets) {
    if (writeIfChanged(target, contents)) {
      changed.push(path.relative(root, target));
    }
  }
  return changed;
}

function main() {
  const jsSourceDir = path.join(root, 'src', 'viewer', 'js');
  const cssSourceDir = path.join(root, 'src', 'viewer', 'styles');
  const jsBundlePath = path.join(root, 'src', 'viewer', 'ac-rule-viewer.js');
  const cssBundlePath = path.join(root, 'src', 'viewer', 'ac-rule-viewer.css');

  const jsBundle = concatFiles(listLayerFiles(jsSourceDir, '.js'));
  const cssBundle = concatFiles(listLayerFiles(cssSourceDir, '.css'));

  const changed = [];
  if (writeIfChanged(jsBundlePath, jsBundle)) changed.push(path.relative(root, jsBundlePath));
  if (writeIfChanged(cssBundlePath, cssBundle)) changed.push(path.relative(root, cssBundlePath));

  changed.push(...syncFile(jsBundlePath, [
    path.join(root, 'AcRuleWorkbench.Core', 'Viewer', 'ac-rule-viewer.js'),
    path.join(root, 'ac-rule-viewer.js')
  ]));

  changed.push(...syncFile(cssBundlePath, [
    path.join(root, 'AcRuleWorkbench.Core', 'Viewer', 'ac-rule-viewer.css'),
    path.join(root, 'AcRuleWorkbench.Core', 'Viewer', 'ac-viewer-template.css'),
    path.join(root, 'ac-rule-viewer.css')
  ]));

  const uniqueChanged = [...new Set(changed)].sort();
  if (uniqueChanged.length) {
    console.log(`Viewer assets rebuilt/synced (${uniqueChanged.length} changed):`);
    for (const file of uniqueChanged) console.log(`- ${file}`);
  } else {
    console.log('Viewer assets are already in sync.');
  }
}

try {
  main();
} catch (error) {
  console.error(`build-viewer-assets failed: ${error && error.message ? error.message : error}`);
  process.exitCode = 1;
}
