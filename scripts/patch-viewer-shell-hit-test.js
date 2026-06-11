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

/* PATCH: shell hit-test correction.
   The shell container must not intercept pointer events from visible tab/button descendants. */
.shell {
  pointer-events: none;
}

.shell button,
.shell a,
.shell input,
.shell select,
.shell textarea,
.shell label,
.shell summary,
.shell [role="button"],
.shell [role="tab"],
.shell [data-action],
.shell [data-scope],
.shell .workspace-tab,
.shell .global-view-row,
.shell .tree-node,
.shell .chip,
.shell .btn {
  pointer-events: auto;
}

.workspace-tabs,
.rule-property-tabs,
[role="tablist"] {
  position: relative;
  z-index: 100;
  pointer-events: auto;
}

.workspace-tab,
.rule-property-tab,
button[role="tab"],
[role="tab"] {
  position: relative;
  z-index: 101;
  pointer-events: auto;
}
`;

const cssFile = path.join(root, "src", "viewer", "styles", "96-shell-hit-test-fix.css");
let existingCss = fs.existsSync(cssFile) ? read(cssFile) : "";

if (!existingCss.includes("PATCH: shell hit-test correction")) {
  existingCss += cssPatch;
  write(cssFile, existingCss);
  console.log("[OK] Added shell hit-test CSS fix.");
} else {
  console.log("[OK] Shell hit-test CSS fix already present.");
}

// Rebuild generated CSS.
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
