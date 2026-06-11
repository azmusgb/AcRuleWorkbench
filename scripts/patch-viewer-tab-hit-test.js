const fs = require("fs");
const path = require("path");

const root = process.cwd();

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

function write(file, text) {
  fs.writeFileSync(file, text.replace(/^\uFEFF/, ""), "utf8");
}

const patch = `

/* PATCH: ensure inspector/workspace tabs are real hit-test targets above shell chrome. */
.workspace-tabs,
.rule-property-tabs,
[role="tablist"] {
  position: relative;
  z-index: 20;
  pointer-events: auto;
}

.workspace-tab,
.rule-property-tab,
button[role="tab"],
[role="tab"] {
  position: relative;
  z-index: 21;
  pointer-events: auto;
}

.shell .workspace-tab,
.shell button[role="tab"] {
  isolation: isolate;
}
`;

const targetCss = path.join(root, "src", "viewer", "styles", "95-hit-test-fixes.css");

let existing = fs.existsSync(targetCss) ? read(targetCss) : "";
if (!existing.includes("PATCH: ensure inspector/workspace tabs")) {
  existing += patch;
  write(targetCss, existing);
  console.log("[OK] Added hit-test CSS patch.");
} else {
  console.log("[OK] Hit-test CSS patch already present.");
}

// Rebuild CSS from source styles.
const stylesDir = path.join(root, "src", "viewer", "styles");
const css = fs.readdirSync(stylesDir)
  .filter(f => f.endsWith(".css"))
  .sort()
  .map(f => read(path.join(stylesDir, f)))
  .join("\n\n");

write(path.join(root, "src", "viewer", "ac-rule-viewer.css"), css);
write(path.join(root, "AcRuleWorkbench.Core", "Viewer", "ac-rule-viewer.css"), css);
write(path.join(root, "AcRuleWorkbench.Core", "Viewer", "ac-viewer-template.css"), css);

// Sync root served CSS too.
write(path.join(root, "ac-rule-viewer.css"), css);

console.log("[OK] Rebuilt and synced viewer CSS.");
