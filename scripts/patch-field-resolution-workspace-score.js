const fs = require("fs");
const path = require("path");

const root = process.cwd();

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

function write(file, text) {
  fs.writeFileSync(file, text.replace(/^\uFEFF/, ""), "utf8");
}

const target = path.join(root, "src", "viewer", "js", "90-render-bootstrap.js");
let text = read(target);

const needle = "if(normalized==='structure')return list(model.nodes).length+list(model.inventory).length+list(model.scopes).reduce((sum,scope)=>sum+scopeRuleContentScore(scope),0);";

if (!text.includes("normalized==='field-resolution'")) {
  if (!text.includes(needle)) {
    throw new Error("Could not find workspaceContentScore structure branch.");
  }

  text = text.replace(
    needle,
    needle + `
  if(normalized==='field-resolution'){
    // Field Resolution is a scope-local workspace. It must be considered valid
    // even when the current filter produces zero rows, otherwise
    // ensureUsefulWorkspaceSelection() immediately falls back to structure.
    const scopedRules = typeof scopedRuleNodes === 'function' ? scopedRuleNodes().length : 0;
    const scopedNodeCount = typeof scopedNodes === 'function' ? scopedNodes().length : 0;
    return Math.max(scopedRules, scopedNodeCount, 1);
  }`
  );

  write(target, text);
  console.log("[OK] Patched workspaceContentScore for field-resolution.");
} else {
  console.log("[OK] field-resolution workspace score already present.");
}

// Rebuild generated JS bundle.
const jsDir = path.join(root, "src", "viewer", "js");
const bundle = fs.readdirSync(jsDir)
  .filter(f => f.endsWith(".js"))
  .sort()
  .map(f => read(path.join(jsDir, f)))
  .join("\n\n");

write(path.join(root, "src", "viewer", "ac-rule-viewer.js"), bundle);
write(path.join(root, "AcRuleWorkbench.Core", "Viewer", "ac-rule-viewer.js"), bundle);
write(path.join(root, "ac-rule-viewer.js"), bundle);

console.log("[OK] Rebuilt and synced viewer JS.");
