#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join } = require("node:path");

const lintTargets = [
  "src/viewer/ac-rule-viewer.js",
  "tests/static/*.js",
  "tests/browser/*.js",
  "scripts/lint-viewer.js"
];
const localEslint = join(process.cwd(), "node_modules", "eslint", "bin", "eslint.js");

function run(command, commandArgs, label) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: false,
    windowsHide: true
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  const status = result.status === null ? 1 : result.status;
  if (status === 0) {
    console.log(`Viewer lint passed (${label}).`);
  }

  process.exit(status);
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

if (existsSync(localEslint)) {
  run(process.execPath, [localEslint, ...lintTargets], "local eslint");
}

console.warn("Local eslint install was not found. Using npm exec with eslint@9 for this run.");
console.warn("For repeatable local runs, execute: npm install");
run(npmCommand(), ["exec", "--yes", "--package=eslint@9", "--", "eslint", ...lintTargets], "npm exec eslint@9");
