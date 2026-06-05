---
name: Mockup sandbox port
description: The mockup sandbox Vite server changed port from 23636 to 3001 after a git rebase recovery wiped the workflow config.
---

The mockup sandbox originally ran on port 23636 (mapped to externalPort 3001 in .replit). After a failed git rebase corrupted the workflow config, the workflow was recreated using port 3001 directly.

**Current config:**
- Workflow name: `artifacts/mockup-sandbox: Component Preview Server`
- Command: `cd artifacts/mockup-sandbox && PORT=3001 BASE_PATH=/__mockup npm run dev`
- waitForPort: 3001

**Why:** Port 23636 is not in Replit's allowed workflow ports list. Port 3001 is allowed and matches the existing externalPort mapping in .replit.

**How to apply:** When restarting or recreating the mockup sandbox workflow, always use `PORT=3001 BASE_PATH=/__mockup` as env vars in the command. Canvas iframe URLs use the dev domain + `/__mockup/preview/workbench-variants/ComponentName`.
