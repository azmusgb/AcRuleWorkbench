const fs = require("fs");
const path = require("path");

const root = process.cwd();

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

function write(file, text) {
  fs.writeFileSync(file, text.replace(/^\uFEFF/, ""), "utf8");
}

function patchHtml(file) {
  if (!fs.existsSync(file)) {
    console.log(`[SKIP] Missing HTML: ${file}`);
    return;
  }

  let text = read(file);

  if (text.includes('id="fwBootPlaceholder"')) {
    console.log(`[OK] Boot placeholder already present: ${file}`);
    return;
  }

  const placeholder = `
  <div id="fwBootPlaceholder" class="fw-boot-placeholder" role="status" aria-live="polite">
    <div class="fw-boot-placeholder-card">
      <div class="fw-boot-placeholder-mark" aria-hidden="true">FW</div>
      <div class="fw-boot-placeholder-copy">
        <div class="fw-boot-placeholder-title">Loading FW Editor Viewer</div>
        <div class="fw-boot-placeholder-detail" data-fw-boot-detail>Loading FWD snapshot...</div>
      </div>
      <div class="fw-boot-placeholder-bar" aria-hidden="true">
        <span></span>
      </div>
    </div>
  </div>`;

  const next = text.replace(/<body\b([^>]*)>/i, match => `${match}\n${placeholder}`);

  if (next === text) {
    throw new Error(`Could not find <body> tag in ${file}`);
  }

  write(file, next);
  console.log(`[OK] Added boot placeholder: ${file}`);
}

[
  path.join(root, "src", "viewer", "ac-rule-viewer.html"),
  path.join(root, "AcRuleWorkbench.Core", "Viewer", "ac-rule-viewer.html"),
  path.join(root, "AcRuleWorkbench.Core", "Viewer", "ac-viewer-template.html"),
  path.join(root, "ac-rule-viewer.html")
].forEach(patchHtml);

const cssFile = path.join(root, "src", "viewer", "styles", "98-boot-placeholder.css");

const cssPatch = `
/* PATCH: immediate boot placeholder so the viewer body never appears blank during startup. */
.fw-boot-placeholder {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: grid;
  place-items: center;
  padding: 32px;
  background:
    radial-gradient(circle at 20% 12%, rgba(37, 99, 235, 0.10), transparent 32%),
    linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
  color: #0f172a;
  pointer-events: none;
  opacity: 1;
  visibility: visible;
  transition: opacity 180ms ease, visibility 180ms ease;
}

.fw-boot-placeholder.fw-boot-placeholder-done {
  opacity: 0;
  visibility: hidden;
}

.fw-boot-placeholder-card {
  width: min(520px, 92vw);
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 22px 70px rgba(15, 23, 42, 0.16);
  padding: 24px;
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 16px;
  align-items: center;
}

.fw-boot-placeholder-mark {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  font-weight: 800;
  letter-spacing: -0.04em;
  background: #0f172a;
  color: #ffffff;
}

.fw-boot-placeholder-title {
  font-size: 18px;
  font-weight: 750;
  letter-spacing: -0.02em;
}

.fw-boot-placeholder-detail {
  margin-top: 4px;
  font-size: 13px;
  color: #475569;
}

.fw-boot-placeholder-bar {
  grid-column: 1 / -1;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: #e2e8f0;
  margin-top: 8px;
}

.fw-boot-placeholder-bar span {
  display: block;
  height: 100%;
  width: 42%;
  border-radius: inherit;
  background: #2563eb;
  animation: fwBootPlaceholderBar 1.1s ease-in-out infinite;
}

.fw-boot-placeholder[data-state="error"] .fw-boot-placeholder-mark,
.fw-boot-placeholder[data-state="error"] .fw-boot-placeholder-bar span {
  background: #b91c1c;
}

@keyframes fwBootPlaceholderBar {
  0% { transform: translateX(-110%); }
  100% { transform: translateX(260%); }
}

@media (prefers-color-scheme: dark) {
  .fw-boot-placeholder {
    background:
      radial-gradient(circle at 20% 12%, rgba(96, 165, 250, 0.18), transparent 32%),
      linear-gradient(180deg, #020617 0%, #0f172a 100%);
    color: #e5e7eb;
  }

  .fw-boot-placeholder-card {
    background: rgba(15, 23, 42, 0.92);
    border-color: rgba(51, 65, 85, 0.95);
    box-shadow: 0 22px 70px rgba(0, 0, 0, 0.38);
  }

  .fw-boot-placeholder-mark {
    background: #e5e7eb;
    color: #020617;
  }

  .fw-boot-placeholder-detail {
    color: #94a3b8;
  }

  .fw-boot-placeholder-bar {
    background: #1e293b;
  }
}
`;

let existingCss = fs.existsSync(cssFile) ? read(cssFile) : "";
if (!existingCss.includes("PATCH: immediate boot placeholder")) {
  existingCss += cssPatch;
  write(cssFile, existingCss);
  console.log("[OK] Added boot placeholder CSS.");
} else {
  console.log("[OK] Boot placeholder CSS already present.");
}

const runtimeFile = path.join(root, "src", "viewer", "js", "10-runtime-prologue.js");
let runtime = read(runtimeFile);

const helper = `
function fwSetBootPlaceholderDetail(detail, state){
  const root = document.getElementById('fwBootPlaceholder');
  if(!root) return;

  if(state) root.dataset.state = state;

  const detailEl = root.querySelector('[data-fw-boot-detail]');
  if(detailEl && detail){
    detailEl.textContent = detail;
  }
}

function fwClearBootPlaceholder(){
  const root = document.getElementById('fwBootPlaceholder');
  if(!root) return;

  root.classList.add('fw-boot-placeholder-done');
  root.setAttribute('aria-hidden', 'true');

  window.setTimeout(() => {
    if(root && root.parentNode){
      root.parentNode.removeChild(root);
    }
  }, 220);
}

function fwBootPlaceholderDiagnosticBridge(eventName, detail){
  if(!eventName) return;

  if(eventName === 'boot-start'){
    fwSetBootPlaceholderDetail('Starting viewer...', 'loading');
    return;
  }

  if(eventName === 'load-viewer-data-start'){
    fwSetBootPlaceholderDetail('Loading FWD snapshot...', 'loading');
    return;
  }

  if(eventName === 'fetch'){
    const key = detail && detail.key ? detail.key : 'viewer data';
    fwSetBootPlaceholderDetail('Fetching ' + key + '...', 'loading');
    return;
  }

  if(eventName === 'static-boot-sidecar-loaded'){
    fwSetBootPlaceholderDetail('Building rule model...', 'loading');
    return;
  }

  if(eventName === 'viewer-data-loaded-before-model'){
    fwSetBootPlaceholderDetail('Preparing workspace model...', 'loading');
    return;
  }

  if(eventName === 'model-built'){
    fwSetBootPlaceholderDetail('Rendering workspace...', 'loading');
    return;
  }

  if(eventName === 'render-all-start'){
    fwSetBootPlaceholderDetail('Rendering selected rule workspace...', 'loading');
    return;
  }

  if(eventName === 'boot-complete'){
    fwClearBootPlaceholder();
    return;
  }

  if(eventName === 'boot-failed' || eventName === 'load-viewer-data-failed'){
    fwSetBootPlaceholderDetail('Viewer failed to load. See browser console diagnostics.', 'error');
    return;
  }
}

(function fwBootPlaceholderSlowTimer(){
  window.setTimeout(() => {
    const root = document.getElementById('fwBootPlaceholder');
    if(root && !root.classList.contains('fw-boot-placeholder-done')){
      fwSetBootPlaceholderDetail('Still loading viewer data...', 'loading');
    }
  }, 5000);
})();
`;

if (!runtime.includes("function fwSetBootPlaceholderDetail")) {
  const marker = /function\s+recordViewerDiagnostic\s*\(([^)]*)\)\s*\{/;
  const match = runtime.match(marker);

  if (!match) {
    throw new Error("Could not find recordViewerDiagnostic(...) in 10-runtime-prologue.js");
  }

  runtime = runtime.replace(match[0], helper + "\n" + match[0]);

  const args = match[1].split(",").map(x => x.trim());
  const eventArg = args[1] || "eventName";
  const detailArg = args[2] || "detail";

  const patchedSignature = runtime.match(marker);
  if (!patchedSignature) {
    throw new Error("Could not re-find recordViewerDiagnostic(...) after helper insertion.");
  }

  runtime = runtime.replace(
    patchedSignature[0],
    patchedSignature[0] + `\n  try { fwBootPlaceholderDiagnosticBridge(${eventArg}, ${detailArg}); } catch (_) { }`
  );

  write(runtimeFile, runtime);
  console.log("[OK] Added boot placeholder lifecycle bridge.");
} else {
  console.log("[OK] Boot placeholder lifecycle bridge already present.");
}

// Rebuild CSS bundle.
const stylesDir = path.join(root, "src", "viewer", "styles");
const cssBundle = fs.readdirSync(stylesDir)
  .filter(f => f.endsWith(".css"))
  .sort()
  .map(f => read(path.join(stylesDir, f)))
  .join("\n\n");

write(path.join(root, "src", "viewer", "ac-rule-viewer.css"), cssBundle);
write(path.join(root, "AcRuleWorkbench.Core", "Viewer", "ac-rule-viewer.css"), cssBundle);
write(path.join(root, "AcRuleWorkbench.Core", "Viewer", "ac-viewer-template.css"), cssBundle);
write(path.join(root, "ac-rule-viewer.css"), cssBundle);

// Rebuild JS bundle.
const jsDir = path.join(root, "src", "viewer", "js");
const jsBundle = fs.readdirSync(jsDir)
  .filter(f => f.endsWith(".js"))
  .sort()
  .map(f => read(path.join(jsDir, f)))
  .join("\n\n");

write(path.join(root, "src", "viewer", "ac-rule-viewer.js"), jsBundle);
write(path.join(root, "AcRuleWorkbench.Core", "Viewer", "ac-rule-viewer.js"), jsBundle);
write(path.join(root, "ac-rule-viewer.js"), jsBundle);

console.log("[OK] Rebuilt and synced viewer HTML/CSS/JS boot placeholder polish.");
