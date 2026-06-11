const fs = require('fs');
const path = require('path');

const root = process.cwd();
const packageRoot = path.resolve(__dirname, '..');

function read(file){ return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); }
function write(file,text){ fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, text.replace(/^\uFEFF/, ''), 'utf8'); }
function exists(file){ return fs.existsSync(file); }
function copyIfPresent(src,dst){ if(!exists(src)) throw new Error(`Package file missing: ${src}`); write(dst, read(src)); console.log(`[OK] Wrote ${path.relative(root,dst)}`); }

function patchWorkspaceActionHook(){
  const file = path.join(root, 'src', 'viewer', 'js', '70-actions-commands.js');
  let text = read(file);

  if(text.includes('maybeHydrateWorkspaceOnDemand(state.workspaceView,act)')){
    console.log('[OK] Workspace lazy-hydration action hook already present.');
    return;
  }

  const oldText = "if(isGlobalDefinitionView()){document.body.classList.remove('inspector-open');applyPaneLayout();}renderAll();return;";
  const newText = "if(isGlobalDefinitionView()){document.body.classList.remove('inspector-open');applyPaneLayout();}if(typeof maybeHydrateWorkspaceOnDemand==='function'&&maybeHydrateWorkspaceOnDemand(state.workspaceView,act))return;renderAll();return;";

  if(!text.includes(oldText)){
    throw new Error('Could not find workspace view action renderAll hook in src/viewer/js/70-actions-commands.js');
  }

  text = text.replace(oldText, newText);
  write(file, text);
  console.log('[OK] Patched workspace action hook for lazy detail hydration.');
}

function patchFieldResolutionWorkspaceScore(){
  const file = path.join(root, 'src', 'viewer', 'js', '90-render-bootstrap.js');
  let text = read(file);

  if(text.includes("normalized==='field-resolution'")){
    console.log('[OK] Field-resolution workspace score already present.');
    return;
  }

  const needle = "if(normalized==='structure')return list(model.nodes).length+list(model.inventory).length+list(model.scopes).reduce((sum,scope)=>sum+scopeRuleContentScore(scope),0);";
  if(!text.includes(needle)){
    throw new Error('Could not find workspaceContentScore structure branch.');
  }

  const insertion = needle + `\n  if(normalized==='field-resolution'){\n    const scopedRules = typeof scopedRuleNodes === 'function' ? scopedRuleNodes().length : 0;\n    const scopedNodeCount = typeof scopedNodes === 'function' ? scopedNodes().length : 0;\n    return Math.max(scopedRules, scopedNodeCount, 1);\n  }`;

  text = text.replace(needle, insertion);
  write(file, text);
  console.log('[OK] Patched field-resolution workspace scoring.');
}

function rebuildJs(){
  const jsDir = path.join(root, 'src', 'viewer', 'js');
  const bundle = fs.readdirSync(jsDir)
    .filter(f => f.endsWith('.js'))
    .sort()
    .map(f => read(path.join(jsDir, f)))
    .join('\n\n');

  const targets = [
    path.join(root, 'src', 'viewer', 'ac-rule-viewer.js'),
    path.join(root, 'AcRuleWorkbench.Core', 'Viewer', 'ac-rule-viewer.js'),
    path.join(root, 'ac-rule-viewer.js')
  ];

  for(const target of targets){
    if(target.endsWith(path.join('AcRuleWorkbench.Core','Viewer','ac-rule-viewer.js')) || exists(path.dirname(target))){
      write(target, bundle);
      console.log(`[OK] Synced ${path.relative(root,target)}`);
    }
  }
}

function rebuildCss(){
  const stylesDir = path.join(root, 'src', 'viewer', 'styles');
  const bundle = fs.readdirSync(stylesDir)
    .filter(f => f.endsWith('.css'))
    .sort()
    .map(f => read(path.join(stylesDir, f)))
    .join('\n\n');

  const targets = [
    path.join(root, 'src', 'viewer', 'ac-rule-viewer.css'),
    path.join(root, 'AcRuleWorkbench.Core', 'Viewer', 'ac-rule-viewer.css'),
    path.join(root, 'AcRuleWorkbench.Core', 'Viewer', 'ac-viewer-template.css'),
    path.join(root, 'ac-rule-viewer.css')
  ];

  for(const target of targets){
    if(target.endsWith(path.join('AcRuleWorkbench.Core','Viewer','ac-viewer-template.css')) || exists(path.dirname(target))){
      write(target, bundle);
      console.log(`[OK] Synced ${path.relative(root,target)}`);
    }
  }
}

function main(){
  const required = [
    path.join(root, 'src', 'viewer', 'js', '70-actions-commands.js'),
    path.join(root, 'src', 'viewer', 'js', '90-render-bootstrap.js'),
    path.join(root, 'src', 'viewer', 'styles')
  ];
  for(const file of required){
    if(!exists(file)) throw new Error(`Run from repo root. Missing ${file}`);
  }

  copyIfPresent(
    path.join(packageRoot, 'src', 'viewer', 'js', '12-lazy-detail-hydration.js'),
    path.join(root, 'src', 'viewer', 'js', '12-lazy-detail-hydration.js')
  );
  copyIfPresent(
    path.join(packageRoot, 'src', 'viewer', 'styles', '99-lazy-hydration.css'),
    path.join(root, 'src', 'viewer', 'styles', '99-lazy-hydration.css')
  );

  patchWorkspaceActionHook();
  patchFieldResolutionWorkspaceScore();
  rebuildJs();
  rebuildCss();

  console.log('\n[COMPLETE] Phase 7 lazy detail hydration patch applied.');
  console.log('Next: dotnet build .\\AcRuleWorkbench.sln -c Debug -p:Platform=x86 -p:PlatformTarget=x86');
}

main();
