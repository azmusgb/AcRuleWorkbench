const fs = require("fs");
const path = require("path");

const root = process.cwd();

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

function write(file, text) {
  fs.writeFileSync(file, text.replace(/^\uFEFF/, ""), "utf8");
}

const runtime = path.join(root, "src", "viewer", "js", "10-runtime-prologue.js");
let text = read(runtime);

// Disable automatic full-sidecar hydration after initial boot.
// Full hydration must become explicit/lazy later; automatic renderAll() causes the body to blank/reappear.
text = text.replace(
  /scheduleStaticFullSidecarHydration\('initial-boot-sidecar'\);\s*/g,
  "recordViewerDiagnostic('info','static-full-sidecar-hydration-skipped',{reason:'disabled-to-prevent-full-body-rerender'});\n    "
);

// Hard-disable the function as a safety net if some other click path calls it.
text = text.replace(
  /function scheduleStaticFullSidecarHydration\(reason = 'boot-sidecar'\)\{[\s\S]*?return staticFullSidecarHydrationPromise;\s*\}/,
  `function scheduleStaticFullSidecarHydration(reason = 'boot-sidecar'){
  recordViewerDiagnostic('info', 'static-full-sidecar-hydration-skipped', {
    reason,
    detail: 'Disabled because background full hydration causes full-body rerender flicker.'
  });
  return null;
}`
);

write(runtime, text);

// Rebuild generated JS from source modules.
const jsDir = path.join(root, "src", "viewer", "js");
const bundle = fs.readdirSync(jsDir)
  .filter(f => f.endsWith(".js"))
  .sort()
  .map(f => read(path.join(jsDir, f)))
  .join("\n\n");

write(path.join(root, "src", "viewer", "ac-rule-viewer.js"), bundle);
write(path.join(root, "AcRuleWorkbench.Core", "Viewer", "ac-rule-viewer.js"), bundle);

// Sync root shell JS used by the local viewer.
write(path.join(root, "ac-rule-viewer.js"), bundle);

console.log("[OK] Disabled automatic full-sidecar hydration and rebuilt viewer JS.");
