Current documentation authority:

For current FormWorks Editor, AC function, UDF, SelectionList/table, project-code, and Editor-gap interpretation, use `../../README.md`, `../../docs/formworks-editor-ac-reference-guide.md`, `../../docs/project-code-catalog.md`, and `../../docs/editor-gap-closure-plan.md`. This file only covers accessibility test tooling.

Run this from PowerShell:

cd scripts/a11y
npm ci
node run-axe-playwright.js http://127.0.0.1:8787/

Notes:
- The WorkbenchApiServer must be started using scripts/start-workbench.ps1 with a valid FWD path.
- The script writes a11y-report.json in this folder.
