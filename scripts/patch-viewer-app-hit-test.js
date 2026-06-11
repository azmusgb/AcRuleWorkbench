const fs = require("fs");
const path = require("path");

const root = process.cwd();

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

function write(file, text) {
  fs.writeFileSync(file, text.replace(/^\uFEFF/, ""), "utf8");
}

const cssPatch = `

/* PATCH: app/shell hit-test correction.
   Prevent chrome wrapper layers from intercepting clicks intended for visible controls. */
.app,
.shell {
  pointer-events: none !important;
}

.app button,
.app a,
.app input,
.app select,
.app textarea,
.app label,
.app summary,
.app [role="button"],
.app [role="tab"],
.app [data-action],
.app [data-scope],
.app .workspace-tab,
.app .rule-property-tab,
.app .global-view-row,
.app .scope-shortcut,
.app .tree-node,
.app .btn,
.app .icon-btn,
.app .chip,
.app .pill,
.app .search-input,
.app .modal,
.app .modal *,
.app #modalBackdrop {
  pointer-events: auto !important;
}

.workspace-tabs,
.rule-property-tabs,
[role="tablist"] {
  position: relative !important;
  z-index: 1000 !important;
  pointer-events: auto !important;
}

.workspace-tab,
.rule-property-tab,
button[role="tab"],
[role="tab"] {
  position: relative !important;
  z-index: 1001 !important;
  pointer-events: auto !important;
  transform: translateZ(0);
}
`;

const cssFile = path.join(root, "src", "viewer", "styles", "97-app-hit-test-fix.css");

let existing = fs.existsSync(cssFile) ? read(cssFile) : "";
if (!existing.includes("PATCH: app/shell hit-test correction")) {
  existing += cssPatch;
  write(cssFile, existing);
  console.log("[OK] Added app/shell hit-test CSS fix.");
} else {
  console.log("[OK] App/shell hit-test CSS fix already present.");
}

// Rebuild generated CSS bundle.
const stylesDir = path.join(root, "src", "viewer", "styles");
const css = fs.readdirSync(stylesDir)
  .filter(f => f.endsWith(".css"))
  .sort()
  .map(f => read(path.join(stylesDir, f)))
  .join("\n\n");

write(path.join(root, "src", "viewer", "ac-rule-viewer.css"), css);
write(path.join(root, "AcRuleWorkbench.Core", "Viewer", "ac-rule-viewer.css"), css);
write(path.join(root, "AcRuleWorkbench.Core", "Viewer", "ac-viewer-template.css"), css);
write(path.join(root, "ac-rule-viewer.css"), css);

console.log("[OK] Rebuilt and synced viewer CSS.");
