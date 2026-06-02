Implemented fixes:

- Updated AcRuleWorkbench.Core/Viewer/ac-viewer-template.html
  - Converted console tablist to proper ARIA tabs pattern:
	- Added role="tab" on tab buttons, unique ids, aria-controls for each tab.
	- Added tabpanel containers (role="tabpanel") with aria-labelledby, hidden by default.

- Updated AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js
  - Added keyboard navigation handling for tabs (ArrowLeft/Right/Home/End/Enter/Space).
  - Updated renderShellStatePanels to toggle aria-selected/tabindex and show/hide corresponding tabpanel content.
  - Populated active panel content into the .console-body inside the active tabpanel.

Notes:
- Kept changes minimal and focused on the critical axe violations reported: aria-required-children and aria-controls unresolved references.
- The repo-root copy (ac-rule-viewer.js) still needs identical updates. Consider synchronizing changes.
