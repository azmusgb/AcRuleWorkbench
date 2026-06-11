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

if (!text.includes("fwViewerModalSafetyPatch")) {
  const insert = `

function fwViewerModalSafetyPatch(){
  if(window.__fwViewerModalSafetyPatchApplied) return;
  window.__fwViewerModalSafetyPatchApplied = true;

  function closeOpenModal(){
    const backdrop = document.getElementById('modalBackdrop');
    const modal = document.querySelector('.modal.open, [role="dialog"].open, .help-modal.open');

    if(backdrop){
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.style.display = 'none';
    }

    if(modal){
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      modal.style.display = 'none';
    }

    document.body?.classList?.remove('modal-open');
  }

  document.addEventListener('keydown', event => {
    if(event.key === 'Escape'){
      closeOpenModal();
    }
  }, true);

  document.addEventListener('click', event => {
    const target = event.target;

    if(target && target.id === 'modalBackdrop'){
      closeOpenModal();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const navTarget = target && target.closest
      ? target.closest('[data-action^="view-"], [data-scope], [role="tab"]')
      : null;

    const backdrop = document.getElementById('modalBackdrop');
    const modalOpen = !!(backdrop && backdrop.classList.contains('open'));

    if(modalOpen && navTarget){
      closeOpenModal();
      // Let the user's next click perform navigation. Avoid dispatching through a closing modal.
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  recordViewerDiagnostic('info', 'modal-safety-patch-applied', {});
}

`;

  const marker = "async function boot(){";
  if (!text.includes(marker)) {
    throw new Error("Could not find async function boot() marker.");
  }

  text = text.replace(marker, insert + "\n" + marker);
}

if (!text.includes("fwViewerModalSafetyPatch();")) {
  text = text.replace(
    /recordViewerDiagnostic\('info','boot-start'[\s\S]*?\);\s*/,
    match => match + "\n  fwViewerModalSafetyPatch();\n"
  );
}

write(runtime, text);

// Rebuild generated JS and sync all served copies.
const jsDir = path.join(root, "src", "viewer", "js");
const bundle = fs.readdirSync(jsDir)
  .filter(f => f.endsWith(".js"))
  .sort()
  .map(f => read(path.join(jsDir, f)))
  .join("\n\n");

write(path.join(root, "src", "viewer", "ac-rule-viewer.js"), bundle);
write(path.join(root, "AcRuleWorkbench.Core", "Viewer", "ac-rule-viewer.js"), bundle);
write(path.join(root, "ac-rule-viewer.js"), bundle);

console.log("[OK] Applied modal safety patch and rebuilt viewer JS.");
