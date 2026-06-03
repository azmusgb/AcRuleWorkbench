# AC Rule Workbench v62.1 — Light Theme Repair

This update fixes the viewer theme defaults and dark/light toggle behavior.

## Changes

- Defaults the viewer to light mode.
- Bumps the cache key to `readonly-editor-v62-1`.
- Resets theme persistence to a new v62.1-specific key so older saved dark-mode state does not override the new default.
- Adds a final authoritative light/dark variable layer in CSS so both modes define the same layout/color variables.
- Light mode now has complete `--bg-*`, amber/accent, surface, panel, border, and text tokens.
- Dark mode is softened from near-black to a more readable dark slate palette.
- The theme toggle now displays a small toast confirming Light/Dark mode.

## Apply

```powershell
.\copy-replacement-files.ps1 `
  -RepoRoot C:\dev\AcRuleWorkbench `
  -CleanBuildOutputs
```

Then rebuild/start normally.
