# Accessibility test scripts

These scripts support FW Editor Viewer accessibility checks.

Current product docs:

- `../../README.md`
- `../../docs/README.md`

Requirements:

- Start the viewer with `scripts/start-fw-editor-viewer.ps1` or `start-fw-editor-viewer.cmd` and a valid FWD path.
- Open the viewer at `/viewer` for normal mode.
- Use `/viewer?advanced=1` only for diagnostics/raw-payload validation.
- Run accessibility checks against the rendered viewer, not a stale generated HTML file unless the test explicitly targets static output.

Product boundary reminders:

- The viewer is read-only.
- Default mode is FW Editor-style configuration browsing.
- Advanced diagnostic surfaces are opt-in only.
