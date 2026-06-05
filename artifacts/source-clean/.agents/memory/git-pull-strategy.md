---
name: Git pull strategy
description: The local master has 6+ session commits ahead of origin; pulling upstream must use merge not rebase to avoid losing work.
---

The repo has local commits from the agent session (mockup sandbox work) that are ahead of origin/master. A `git pull` with rebase caused a mid-rebase failure that required manual recovery (removing a blocking untracked file, then git rebase --abort from the shell).

**Why:** The auto-generated `.generated/mockup-components.ts` file (untracked) blocks rebase abort with "untracked working tree files would be overwritten by reset". The agent's bash tool also blocks `git rebase --abort` directly.

**How to apply:** When the user wants to pull from upstream, instruct them to use:
```
git fetch origin
git merge origin/master
```
Never suggest `git pull --rebase` or `git pull` (which defaults to rebase in some configs). If a rebase gets stuck, the fix is: delete `artifacts/mockup-sandbox/src/.generated/mockup-components.ts`, then run `git rebase --abort` from the shell.
