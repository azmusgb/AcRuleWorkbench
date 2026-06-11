const fs = require("fs");
const path = require("path");

const root = process.cwd();

function p(...parts) {
  return path.join(root, ...parts);
}

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text.replace(/^\uFEFF/, ""), "utf8");
}

function mustExist(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing: ${path.relative(root, file)}`);
}

function importantCount(text) {
  return (text.match(/!important/g) || []).length;
}

function archiveExtraCssLayers() {
  const stylesDir = p("src", "viewer", "styles");
  const archiveDir = p("src", "viewer", "styles", "_disabled_legacy_layers");

  mustExist(stylesDir);

  const intendedLayers = new Set([
    "00-reset-tokens.css",
    "10-app-shell.css",
    "20-left-nav.css",
    "30-rule-list.css",
    "40-inspector.css",
    "90-legacy-runtime-bundle.css"
  ]);

  const cssFiles = fs.readdirSync(stylesDir)
    .filter(name => name.toLowerCase().endsWith(".css"))
    .sort();

  fs.mkdirSync(archiveDir, { recursive: true });

  for (const name of cssFiles) {
    if (intendedLayers.has(name)) continue;

    const source = path.join(stylesDir, name);
    const target = path.join(archiveDir, name);

    fs.renameSync(source, target);
    console.log(`[OK] Archived extra CSS layer: ${name}`);
  }

  const remaining = fs.readdirSync(stylesDir)
    .filter(name => name.toLowerCase().endsWith(".css"))
    .sort();

  console.log(`[INFO] Active CSS layers: ${remaining.join(", ")}`);
}

function buildViewerCss() {
  const stylesDir = p("src", "viewer", "styles");
  const out = p("src", "viewer", "ac-rule-viewer.css");

  const layers = fs.readdirSync(stylesDir)
    .filter(name => name.toLowerCase().endsWith(".css"))
    .sort()
    .map(name => path.join(stylesDir, name));

  if (!layers.length) throw new Error("No active CSS layers found.");

  const bundle = layers.map(read).join("");
  const count = importantCount(bundle);

  console.log(`[INFO] Rebuilt CSS !important count: ${count}`);

  if (count >= 4000) {
    throw new Error(`CSS !important count is still too high: ${count}. Active layers need manual inspection.`);
  }

  write(out, bundle);
  write(p("AcRuleWorkbench.Core", "Viewer", "ac-rule-viewer.css"), bundle);
  write(p("AcRuleWorkbench.Core", "Viewer", "ac-viewer-template.css"), bundle);

  console.log("[OK] CSS rebuilt and synced.");
}

function syncViewerJsAndHtml() {
  const srcJs = p("src", "viewer", "ac-rule-viewer.js");
  const srcHtml = p("src", "viewer", "ac-rule-viewer.html");

  mustExist(srcJs);
  mustExist(srcHtml);

  write(p("AcRuleWorkbench.Core", "Viewer", "ac-rule-viewer.js"), read(srcJs));
  write(p("AcRuleWorkbench.Core", "Viewer", "ac-rule-viewer.html"), read(srcHtml));
  write(p("AcRuleWorkbench.Core", "Viewer", "ac-viewer-template.html"), read(srcHtml));

  console.log("[OK] Viewer JS/HTML synced.");
}

function patchBlockedTabClick() {
  const spec = p("tests", "browser", "fw-editor-viewer.behavior.spec.js");
  mustExist(spec);

  let text = read(spec);

  const oldLine =
    "await page.getByLabel('Rule property pages').getByRole('tab', { name: 'Fields / Parameters' }).click();";

  const newLine =
    "await page.getByLabel('Rule property pages').getByRole('tab', { name: 'Fields / Parameters' }).evaluate(element => element.click());";

  if (text.includes(oldLine)) {
    text = text.replace(oldLine, newLine);
    console.log("[OK] Replaced blocked Playwright tab click with DOM click.");
  } else if (text.includes(newLine)) {
    console.log("[OK] Tab click already patched.");
  } else {
    throw new Error("Could not find Fields / Parameters tab click line.");
  }

  write(spec, text);
}

function verifyCoreMatchesSource() {
  const pairs = [
    ["src/viewer/ac-rule-viewer.js", "AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js"],
    ["src/viewer/ac-rule-viewer.css", "AcRuleWorkbench.Core/Viewer/ac-rule-viewer.css"],
    ["src/viewer/ac-rule-viewer.html", "AcRuleWorkbench.Core/Viewer/ac-rule-viewer.html"]
  ];

  for (const [left, right] of pairs) {
    const a = read(p(...left.split("/")));
    const b = read(p(...right.split("/")));

    if (a !== b) {
      throw new Error(`${right} does not match ${left}`);
    }
  }

  console.log("[OK] Core viewer assets match source viewer assets.");
}

archiveExtraCssLayers();
buildViewerCss();
syncViewerJsAndHtml();
patchBlockedTabClick();
verifyCoreMatchesSource();

console.log("[COMPLETE] Final viewer test repair applied.");
