
function wireDesktopScrollPanFallback(){
  if(wireDesktopScrollPanFallback.installed)return;
  wireDesktopScrollPanFallback.installed=true;

  // Keep only the pane-resize safety cleanup. Earlier v62 desktop builds tried
  // to "help" by rerouting wheel events and adding drag-to-pan. That made normal
  // movement feel unpredictable, especially with a mouse wheel/trackpad. Native
  // browser scrolling is now the source of truth.
  const clearResizeState=()=>document.body?.classList?.remove('is-resizing-pane','is-panning-pane');
  window.addEventListener('blur',clearResizeState);
  document.addEventListener('pointerup',clearResizeState,true);
  document.addEventListener('pointercancel',clearResizeState,true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearResizeState();});
}

function movementScrollPanes(){
  return ['scopeList','content','inspectorBody'].map(id=>optionalElement(id)).filter(Boolean);
}
function closestMovementPane(target){
  const el=target&&target.nodeType===1?target:target?.parentElement;
  return el?.closest?.('#scopeList,#content,#inspectorBody,.modal-body,.search-popover')||null;
}
function isMovementInteractiveTarget(target){
  const el=target&&target.nodeType===1?target:target?.parentElement;
  return !!el?.closest?.('button,a,input,select,textarea,summary,[role="button"],[role="tab"],[role="menuitem"],[contenteditable="true"],.pane-resizer');
}
function markActiveMovementPane(pane){
  if(!pane||!pane.id)return;
  document.body.dataset.activeScrollPane=pane.id;
}
function installDesktopPaneMovement(){
  if(installDesktopPaneMovement.installed)return;
  installDesktopPaneMovement.installed=true;

  // Native movement model: panes are real scroll containers. We only annotate
  // them for focus/accessibility and active-pane styling; no global key capture,
  // wheel hijacking, middle-click panning, or Alt-drag behavior.
  const annotatePanes=()=>{
    movementScrollPanes().forEach(pane=>{
      pane.dataset.scrollPane='true';
      pane.classList.add('desktop-scroll-pane');
      pane.classList.remove('is-panning');
      if(!pane.hasAttribute('tabindex'))pane.tabIndex=0;
      pane.removeAttribute('aria-keyshortcuts');
      pane.addEventListener('pointerenter',()=>markActiveMovementPane(pane),{passive:true});
      pane.addEventListener('focus',()=>markActiveMovementPane(pane),{passive:true});
      pane.addEventListener('scroll',()=>markActiveMovementPane(pane),{passive:true});
    });
  };
  annotatePanes();
  window.addEventListener('resize',()=>requestAnimationFrame(annotatePanes),{passive:true});
}

function installPaneResizers(){
  ensurePaneResizers();
  applyPaneLayout();
  let active=null;
  const startDrag=(event,kind)=>{
    if(event.button!==undefined&&event.button!==0)return;
    const shell=optionalElement('mainContent')?.closest?.('.shell');
    if(!shell)return;
    active={kind,startX:event.clientX,startLeft:state.paneLeftWidth,startRight:state.paneRightWidth,shell};
    document.body.classList.add('is-resizing-pane');
    event.target?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };
  document.addEventListener('pointerdown',event=>{
    if(document.body.classList.contains('compact-shell'))return;
    const handle=event.target.closest?.('[data-resize-pane]');
    if(!handle)return;
    startDrag(event,handle.dataset.resizePane);
  });
  document.addEventListener('pointermove',event=>{
    if(!active)return;
    const shellWidth=Math.max(1180,active.shell.getBoundingClientRect().width||1180);
    const dx=event.clientX-active.startX;
    if(active.kind==='left'){
      const maxLeft=Math.max(220,Math.min(560,shellWidth-state.paneRightWidth-572));
      state.paneLeftWidth=clampNumber(active.startLeft+dx,220,maxLeft);
    }else{
      const maxRight=Math.max(260,Math.min(680,shellWidth-state.paneLeftWidth-572));
      state.paneRightWidth=clampNumber(active.startRight-dx,260,maxRight);
      document.body.classList.add('inspector-open');
    }
    applyPaneLayout();
  });
  document.addEventListener('pointerup',()=>{
    if(!active)return;
    active=null;
    document.body.classList.remove('is-resizing-pane');
    saveState();
  });
  document.addEventListener('keydown',event=>{
    const handle=event.target.closest?.('[data-resize-pane]');
    if(!handle)return;
    const large=event.shiftKey?40:16;
    if(event.key==='Home'){event.preventDefault();if(handle.dataset.resizePane==='left')state.paneLeftWidth=220;else state.paneRightWidth=260;}
    else if(event.key==='End'){event.preventDefault();if(handle.dataset.resizePane==='left')state.paneLeftWidth=520;else state.paneRightWidth=640;}
    else if(event.key==='ArrowLeft'){event.preventDefault();if(handle.dataset.resizePane==='left')state.paneLeftWidth-=large;else state.paneRightWidth+=large;}
    else if(event.key==='ArrowRight'){event.preventDefault();if(handle.dataset.resizePane==='left')state.paneLeftWidth+=large;else state.paneRightWidth-=large;}
    else{return;}
    if(handle.dataset.resizePane==='right')document.body.classList.add('inspector-open');
    applyPaneLayout();
    saveState();
  });
  window.addEventListener('resize',()=>{applyViewportProfile();applyPaneLayout();});
}
function reportUiError(context,error){
  const message=error&&error.message?error.message:String(error||'Unknown error');
  if(typeof recordViewerDiagnostic==='function')recordViewerDiagnostic('error','ui-error',{context,message,stack:error&&error.stack?String(error.stack).slice(0,4000):''});
  console.error(`FW Editor Viewer ${context} failed:`, error);
  const banner=optionalElement('globalErrorBanner');
  if(banner){
    banner.textContent=`${context==='data load'?'FWD snapshot load error':'Editor viewer error'}: ${message}`;
    banner.hidden=false;
  }
  const toastNode=optionalElement('toast');
  if(toastNode){
    toast(`Editor viewer error: ${message}`,'error',4500);
  }
}
// Keep global actions aligned with actual selection state.
function hasConfigSelection(){
  return !!(selectedNode()||selectedActionList()||selectedInventory()||selectedRel()||selectedDiag());
}
function setButtonAvailability(id,enabled,disabledTitle){
  const button=optionalElement(id);
  if(!button)return;
  button.disabled=!enabled;
  button.setAttribute('aria-disabled',enabled?'false':'true');
  if(!enabled&&disabledTitle)button.title=disabledTitle;
}
function syncActionAvailability(){
  const loaded=!!model&&bootState.phase==='ready';
  const hasSelection=loaded&&hasConfigSelection();
  const hasScope=loaded&&!!currentScope();
  document.querySelectorAll('[data-requires]').forEach(button=>{
    const requirement=button.dataset.requires;
    if(!button.dataset.enabledTitle)button.dataset.enabledTitle=button.title||'';
    if(requirement==='scope'){
      button.disabled=!hasScope;
      button.title=hasScope?button.dataset.enabledTitle:(button.dataset.disabledTitle||'Choose a scope first.');
      button.setAttribute('aria-disabled',hasScope?'false':'true');
      return;
    }
    if(requirement==='selection'){
      button.disabled=!hasSelection;
      button.title=hasSelection?button.dataset.enabledTitle:(button.dataset.disabledTitle||'Select an item first.');
      button.setAttribute('aria-disabled',hasSelection?'false':'true');
    }
  });
  setButtonAvailability('copyConfigBtn',hasSelection,'Select a rule or Action List before copying.');
}
function announceContentStatus(message){
  const node=optionalElement('contentStatus');
  if(node)node.textContent=text(message);
}
function syncOnboardingChecklist(){
  const checklist=optionalElement('onboardingChecklist');
  const toggleBtn=optionalElement('toggleChecklistBtn');
  if(!checklist||!toggleBtn)return;
  const dismissed=readStorage(checklistDismissedKey)==='true';
  const collapsed=readStorage(checklistCollapsedKey)==='true';
  checklist.classList.toggle('is-hidden',dismissed);
  checklist.classList.toggle('is-collapsed',collapsed);
  toggleBtn.textContent=collapsed?'Expand':'Collapse';
  toggleBtn.setAttribute('aria-expanded',collapsed?'false':'true');
}
function dismissOnboardingChecklist(){
  writeStorage(checklistDismissedKey,'true');
  writeStorage(checklistCollapsedKey,'false');
  syncOnboardingChecklist();
}
function markOnboardingComplete(){
  if(readStorage(checklistDismissedKey)==='true')return;
  dismissOnboardingChecklist();
}
function withUiGuard(context,fn){
  try { return fn(); }
  catch(error){ reportUiError(context,error); return undefined; }
}
window.addEventListener('error',event=>reportUiError('script',event.error||event.message));
window.addEventListener('unhandledrejection',event=>reportUiError('promise',event.reason));
function scopeIdOf(x){return text(first(x.ScopePath,x.scopeId,x.ScopeId,x.ScopeName,x.name,'Unscoped'));}
function scopeNameOf(x){return text(first(x.ScopeName,x.name,scopeIdOf(x).split('/').pop()));}
function scopeKindOf(x){return text(first(x.ScopeType,x.kind,'Scope'));}
function titleOf(x){return text(first(x.RuleName,x.Name,x.Title,x.FunctionName,x.RuleId,x.NodeId,'Untitled'));}
function fnOf(x){return text(first(x.FunctionName,x.Function,x.FunctionId,''));}
function disabledOf(x){const raw=lower(first(x.DisabledState,x.disabledState,''));if(raw.includes('possibledisabledsequenceonly')||raw.includes('sequenceonly'))return 'possible';if(raw.includes('inherited')||raw.includes('possiblydisabledinherited'))return 'inherited';if(raw.includes('direct')||raw==='disabled'||raw==='true'||raw==='1')return 'direct';return 'none';}
function paramText(p){if(!p)return'';if(typeof p==='string')return p;if(typeof p!=='object')return text(p);return Object.keys(p).map(k=>`${k}:${list(p[k]).map(text).join('|')}`).join(' ')}
function splitActionNameText(value){
  const raw=text(value).replace(/\\"/g,'"').trim();
  if(!raw)return[];
  if(raw.includes('","'))return raw.split(/"\s*,\s*"/g).map(x=>x.replace(/^"|"$/g,'').trim()).filter(Boolean);
  return [raw.replace(/^"|"$/g,'').trim()].filter(Boolean);
}
function actionNamesOf(n){return list(first(n.ActionNames,n.actionNames,[])).flatMap(splitActionNameText).filter(Boolean)}
function actionListName(e){const name=first(e.ActionName,e.actionName,e.Label,e.label);if(name)return text(name);if(String(first(e.EdgeKind,e.relationship,''))==='RootListEntry'||Number(first(e.ActionListIndex,-1))<0)return 'Root rule list';const idx=first(e.ActionListIndex,e.actionListIndex);return idx===undefined?'Unnamed action list':`Action ${idx}`;}
function actionListState(e){if(!e)return 'Root';const kind=text(first(e.EdgeKind,e.kind,e.relationship,''));const idx=Number(first(e.ActionListIndex,e.actionListIndex,-1));if(kind==='RootListEntry'||idx<0)return 'Root';if(first(e.ActionNameResolved,e.actionNameResolved,false)===true||!!first(e.ActionName,e.actionName,null))return 'NamedAction';return idx>=0?'IndexedAction':'UnnamedAction';}
function actionListResolved(e){const st=actionListState(e);return st==='Root'||st==='NamedAction';}
function ruleKeyParts(x){return [scopeIdOf(x),first(x.RuleGuid,x.ruleGuid,''),first(x.RuleId,x.ruleId,''),titleOf(x),fnOf(x),first(x.RuleIndexWithinScope,x.RuleIndex,'')].map(text).join('|').toLowerCase();}
function scopedGuidKey(x){const guid=first(x.RuleGuid,x.ruleGuid,'');return guid?`${scopeIdOf(x)}|${guid}`.toLowerCase():'';}
function scopedNameFunctionKey(x){const name=titleOf(x),fn=fnOf(x);return name&&fn?`${scopeIdOf(x)}|${name}|${fn}`.toLowerCase():'';}
function addUniqueIndex(map,key,id){if(!key)return;if(!map.has(key))map.set(key,[]);map.get(key).push(id);}
function uniqueLookup(map,key){const hits=key&&map.get(key);return hits&&hits.length===1?hits[0]:'';}
function correlationNodeId(x,exact,guid,nameFn){return exact.get(ruleKeyParts(x))||uniqueLookup(guid,scopedGuidKey(x))||uniqueLookup(nameFn,scopedNameFunctionKey(x))||'';}
/** Build the normalized client-side indexes used by the tree, inspector, and search. */