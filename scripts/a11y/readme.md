Run this from PowerShell:

cd scripts/a11y
npm ci
node run-axe-playwright.js http://127.0.0.1:8787/

Notes:
- The WorkbenchApiServer must be started using scripts/start-workbench.ps1 with a valid FWD path.
- The script writes a11y-report.json in this folder.
