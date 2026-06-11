
function commandRegistry(){return Object.freeze({});}
function executeCommand(action){return handleAction(action);}
function handleAction(a){if(text(a).startsWith('message-filter-')){selectMessageFilter(text(a).replace(/^message-filter-/,''));return;}if(a==='open-global-detail'){state.globalDetailKind=state.workspaceView;state.modal='global-detail';renderModal();return;}if(a==='go-structure'){state.workspaceView='structure';state.treeFilter='all';state.query='';state.treeQuery='';state.focusNodeId='';renderAll();toast('Rule List ready');return;}if(a==='clear-tree-search'){state.query='';state.treeQuery='';syncQueryInputs();renderContent();renderDiagnosticsDock();renderInspector();renderViewbar();closeSearchPopover();window.setTimeout(()=>focusActiveSearch(),0);return;}if(a==='show-messages'){const d=firstDiagnosticForFilter(state.messageFilter)||scopedDiags()[0];if(d){state.selectedType='diag';state.selectedId=d.id;document.body.classList.add('inspector-open');renderAll();}else toast('No diagnostics in this scope');return;}if(a==='open-help'){state.modal='help';renderModal();return;}if(a==='help-action-list'||a==='help-model'||a==='help-disabled'){state.modal=a.replace(/^help-/,'help-');renderModal();return;}if(a==='close-modal'){closeModalRender();return;}if(a==='toggle-theme'){state.theme=state.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=state.theme;syncThemeControl();saveState();toast(`${state.theme==='dark'?'Dark':'Light'} mode`);return;}if(a==='toggle-mobile-nav'){const open=document.body.classList.toggle('mobile-nav-open');const btn=optionalElement('mobileNavToggle')||document.querySelector('[data-action="toggle-mobile-nav"]');if(btn)btn.setAttribute('aria-expanded',open?'true':'false');return;}if(a==='close-inspector'){document.body.classList.remove('inspector-open');applyPaneLayout();syncInspectorVisibility();saveState();return;}if(a==='show-inspector'){document.body.classList.add('inspector-open');applyPaneLayout();syncInspectorVisibility();saveState();return;}if(a==='reset-pane-layout'){resetPaneLayout();return;}if(a==='expand-all'){const count=scopedRuleNodes().length;if(count>2500&&!confirm(`Expand ${fmt(count)} structural rules and all action lists? This can be slow.`))return;scopedNodes().forEach(n=>state.expanded.add(n.id));state.collapsedActionLists.clear();renderAll();return;}if(a==='collapse-all'){state.expanded.clear();(model.rootsByScope.get(state.scopeId)||[]).forEach(id=>state.expanded.add(String(id)));state.collapsedActionLists=new Set(allActionListKeysForScope(state.scopeId));renderAll();return;}if(a==='expand-selected-depth'){const n=selectedNode();if(!n){toast('Select a rule first');return;}state.expanded.add(n.id);collapseActionListsForNode(n.id);renderAll();return;}if(a==='expand-selected-subtree'){const n=selectedNode();if(!n){toast('Select a rule first');return;}subtreeNodes(n.id).forEach(x=>state.expanded.add(x.id));childActionListGroups(n.id).forEach(g=>state.collapsedActionLists.delete(actionListKey(n.id,g)));renderAll();return;}if(a==='collapse-siblings'){const n=selectedNode();if(!n){toast('Select a rule first');return;}const parent=model.parentByChild.get(n.id);if(parent){childIds(parent).filter(id=>id!==n.id).forEach(id=>state.expanded.delete(id));}renderAll();return;}if(a==='expand-action-groups'){allActionListKeysForScope(state.scopeId).forEach(k=>state.collapsedActionLists.delete(k));renderAll();return;}if(a==='collapse-action-groups'){allActionListKeysForScope(state.scopeId).forEach(k=>state.collapsedActionLists.add(k));renderAll();return;}if(a==='clear-focus'){state.focusNodeId='';renderAll();return;}if(a==='focus-selected'){const n=selectedNode();if(n){state.focusNodeId=n.id;state.expanded.add(n.id);collapseActionListsForNode(n.id);renderAll();}return;}if(a==='open-linked-node'){const obj=selectedInventory()||selectedRel();if(obj&&obj.nodeId){selectNode(obj.nodeId);}else toast('No linked Rule List node');return;}if(a==='copy-action-list-path'){const b=selectedActionList();if(b){copyText(JSON.stringify({schema:'FwEditorViewer.ActionListPath',scopeId:b.scopeId,path:actionListPathObjects(b)},null,2));return;}const n=selectedNode();if(!n){toast('Select a rule or Action List first');return;}copyText(JSON.stringify(selectedPathPacket(n),null,2));return;}if(a==='copy-rule-config'){const b=selectedActionList();if(b){copyText(JSON.stringify(actionListPacket(b),null,2));return;}const n=selectedNode();if(!n){toast('Select a rule or Action List first');return;}copyText(JSON.stringify(selectedRuleConfigPacket(n),null,2));return;}if(a==='copy-rule-explanation'){const n=selectedNode();if(!n){toast('Select a rule first');return;}copyText(rulePlainLanguageNarrative(n));return;}if(a==='first-warning-scope'){const s=model.scopes.find(x=>x.warnings>0);if(s)selectScope(s.scopeId);return;}if(a==='largest-scope'){const s=[...model.scopes].sort((a,b)=>b.structural-a.structural)[0];if(s)selectScope(s.scopeId);return;}}
function viewSearchMeta(){
  if(state.workspaceView==='structure')return {label:'Filter structure',placeholder:'Filter rules by name, function, status result, action list, field, or disabled state'};
  if(state.workspaceView==='field-resolution')return {label:'Filter field resolution',placeholder:'Filter field references by field name, rule, function, or parameter'};
  if(state.workspaceView==='resources')return {label:'Filter resources',placeholder:'Filter resource definitions and references'};
  if(state.workspaceView==='functions')return {label:'Filter functions',placeholder:'Filter functions by name, category, status result, parameter, behavior, or rule usage'};
  if(state.workspaceView==='tables')return {label:'Filter tables',placeholder:'Filter tables by name, column, scope, or rule reference'};
  if(state.workspaceView==='drivers')return {label:'Filter drivers',placeholder:'Filter drivers and process findings'};
  if(state.workspaceView==='udfs')return {label:'Filter UDFs',placeholder:'Filter UDF names, real parameter names, internal rules, caller rules, or status results'};
  if(isLoadStatusView())return {label:'Filter load status',placeholder:'Filter load status by severity, title, detail, scope, or linked rule'};
  return {label:'Filter viewer',placeholder:'Filter current view'};
}
function syncViewSearchMeta(){
  const meta=viewSearchMeta();
  const label=document.querySelector('label[for="viewSearch"]');
  if(label)label.textContent=meta.label;
  const input=optionalElement('viewSearch');
  if(input){
    input.setAttribute('aria-label',meta.label);
    input.placeholder=meta.placeholder;
  }
  const editorInput=optionalElement('editorSearch');
  if(editorInput){
    editorInput.setAttribute('aria-label',meta.label);
    editorInput.placeholder=meta.placeholder;
  }
}
function syncQueryInputs(){const q=state.query;const g=optionalElement('globalSearch');if(g&&g.value!==q)g.value=q;const v=optionalElement('viewSearch');if(v&&v.value!==q)v.value=q;const editor=optionalElement('editorSearch');if(editor&&editor.value!==q)editor.value=q;document.querySelectorAll('[data-action="clear-tree-search"]').forEach(btn=>{btn.disabled=!text(q).trim();});syncViewSearchMeta();}
function applyQueryInput(value,sourceId=''){state.query=value;state.treeQuery=value;syncQueryInputs();renderContent();renderDiagnosticsDock();renderInspector();if(sourceId==='globalSearch')renderSearchPopover();else closeSearchPopover();}
function focusActiveSearch(){
  const target=isEditorMode()?optionalElement('editorSearch'):optionalElement('globalSearch');
  target?.focus?.();
  target?.select?.();
}
function applyEditorPaneVariables(root=document.querySelector('.fweditor-root,.fweditor-udf-root')){
  if(!root)return;
  root.className=String(root.className)
    .replace(/\bfw-tree-w-\d+\b/g,'')
    .replace(/\bfw-message-h-\d+\b/g,'')
    .replace(/\s{2,}/g,' ')
    .trim();
  root.classList.add(`fw-tree-w-${normalizedEditorTreeWidth()}`,`fw-message-h-${normalizedEditorMessageHeight()}`);
  root.classList.toggle('message-expanded',state.editorMessageExpanded);
  const messageWindow=root.querySelector('.fweditor-load-status-window');
  messageWindow?.classList.toggle('expanded',state.editorMessageExpanded);
  const toggle=messageWindow?.querySelector('[data-action="toggle-editor-message"]');
  if(toggle)toggle.textContent=state.editorMessageExpanded?'Collapse':'Expand';
}
function setEditorPaneSize(kind,value,root=document.querySelector('.fweditor-root,.fweditor-udf-root')){
  if(kind==='tree'){
    state.editorTreeWidth=normalizedEditorTreeWidth(value);
  }else if(kind==='message'){
    state.editorMessageHeight=normalizedEditorMessageHeight(value);
    state.editorMessageExpanded=state.editorMessageHeight>130;
  }else{
    return;
  }
  applyEditorPaneVariables(root);
}
function resetEditorPaneSize(kind,root=document.querySelector('.fweditor-root,.fweditor-udf-root')){
  if(kind==='tree')state.editorTreeWidth=276;
  if(kind==='message'){
    state.editorMessageHeight=104;
    state.editorMessageExpanded=false;
  }
  applyEditorPaneVariables(root);
  saveState();
}
function wireEditorPaneResizers(){
  document.addEventListener('pointerdown',e=>{
    const splitter=e.target.closest?.('[data-editor-resize]');
    if(!splitter||e.button!==0)return;
    const kind=splitter.dataset.editorResize;
    const root=splitter.closest('.fweditor-root,.fweditor-udf-root');
    if(!root||!['tree','message'].includes(kind))return;
    e.preventDefault();
    activeEditorResize={
      pointerId:e.pointerId,
      kind,
      root,
      startX:e.clientX,
      startY:e.clientY,
      startValue:kind==='tree'?normalizedEditorTreeWidth():normalizedEditorMessageHeight()
    };
    splitter.setPointerCapture?.(e.pointerId);
    splitter.classList.add('resizing');
    document.body.classList.add('editor-pane-resizing');
  });
  document.addEventListener('pointermove',e=>{
    const active=activeEditorResize;
    if(!active||active.pointerId!==e.pointerId)return;
    e.preventDefault();
    const delta=active.kind==='tree'?e.clientX-active.startX:active.startY-e.clientY;
    setEditorPaneSize(active.kind,active.startValue+delta,active.root);
  });
  const finishResize=e=>{
    const active=activeEditorResize;
    if(!active||e.pointerId!==active.pointerId)return;
    active.root.querySelector(`[data-editor-resize="${active.kind}"]`)?.classList.remove('resizing');
    document.body.classList.remove('editor-pane-resizing');
    activeEditorResize=null;
    saveState();
  };
  document.addEventListener('pointerup',finishResize);
  document.addEventListener('pointercancel',finishResize);
  document.addEventListener('dblclick',e=>{
    const splitter=e.target.closest?.('[data-editor-resize]');
    if(!splitter)return;
    e.preventDefault();
    resetEditorPaneSize(splitter.dataset.editorResize,splitter.closest('.fweditor-root,.fweditor-udf-root'));
  });
  document.addEventListener('keydown',e=>{
    const splitter=e.target.closest?.('[data-editor-resize]');
    if(!splitter)return;
    const kind=splitter.dataset.editorResize;
    const root=splitter.closest('.fweditor-root,.fweditor-udf-root');
    let value=kind==='tree'?normalizedEditorTreeWidth():normalizedEditorMessageHeight();
    if(e.key==='Home')value=kind==='tree'?220:80;
    else if(e.key==='End')value=kind==='tree'?520:420;
    else if(kind==='tree'&&e.key==='ArrowLeft')value-=12;
    else if(kind==='tree'&&e.key==='ArrowRight')value+=12;
    else if(kind==='message'&&e.key==='ArrowUp')value+=12;
    else if(kind==='message'&&e.key==='ArrowDown')value-=12;
    else return;
    e.preventDefault();
    setEditorPaneSize(kind,value,root);
    saveState();
  });
}
// Surface concise guidance from control titles in the top action hint region for mouse and keyboard users.
function wireGuidanceHints(){
  const host=document.body;
  const hintEl=optionalElement('topActionHint');
  if(!hintEl)return;
  const selectors=['.top-actions [title]','#viewbar [title]','.tree-detail-actions [title]','.inspector-head [title]'];
  const findTarget=target=>target?.closest?.(selectors.join(','));
  const showFrom=target=>{const t=findTarget(target);hintEl.textContent=t?text(t.getAttribute('title')):'';};
  host.addEventListener('mouseover',e=>showFrom(e.target));
  host.addEventListener('focusin',e=>showFrom(e.target));
  host.addEventListener('mouseout',e=>{if(findTarget(e.target))hintEl.textContent='';});
  host.addEventListener('focusout',e=>{if(findTarget(e.target))hintEl.textContent='';});
}
function wireOnboardingChecklist(){
  const toggleBtn=optionalElement('toggleChecklistBtn');
  const dismissBtn=optionalElement('dismissChecklistBtn');
  if(toggleBtn){
    toggleBtn.addEventListener('click',()=>{
      const collapsed=readStorage(checklistCollapsedKey)==='true';
      writeStorage(checklistCollapsedKey,collapsed?'false':'true');
      syncOnboardingChecklist();
    });
  }
  if(dismissBtn){
    dismissBtn.addEventListener('click',()=>dismissOnboardingChecklist());
  }
}
function handleRulePropertyTabKeyboard(e){
  const active=e.target?.closest?.('[data-rule-property-tab]');
  if(!active)return false;
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return false;
  const host=active.closest('.fweditor-property-tabs');
  const tabs=[...host.querySelectorAll('[data-rule-property-tab]')];
  if(!tabs.length)return false;
  e.preventDefault();
  const current=Math.max(0,tabs.indexOf(active));
  const nextIndex=e.key==='Home'?0:e.key==='End'?tabs.length-1:clampNumber(current+(e.key==='ArrowRight'?1:-1),0,tabs.length-1);
  const next=tabs[nextIndex];
  setRulePropertyPage(next.dataset.rulePropertyTab);
  window.setTimeout(()=>document.querySelector(`[data-rule-property-tab="${cssEscape(next.dataset.rulePropertyTab)}"]`)?.focus(),0);
  return true;
}
function wire(){document.addEventListener('click',e=>{if(!isSearchUiTarget(e.target))closeSearchPopover();const act=e.target.closest('[data-action]')?.dataset.action;if(act){if(act==='toggle-editor-message'){e.preventDefault();state.editorMessageExpanded=!state.editorMessageExpanded;state.editorMessageHeight=state.editorMessageExpanded?Math.max(normalizedEditorMessageHeight(),240):104;renderContent();saveState();return;}if(act==='select-process'){e.preventDefault();selectProcessContext(e.target.closest('[data-process-name]')?.dataset.processName);return;}if(act.startsWith('view-')&&validWorkspaceViews().includes(normalizeWorkspaceViewName(act.replace(/^view-/,'')))){e.preventDefault();state.workspaceView=normalizeWorkspaceViewName(act.replace(/^view-/,''));document.body.classList.remove('mobile-nav-open');const navBtn=document.querySelector('[data-action="toggle-mobile-nav"]');if(navBtn)navBtn.setAttribute('aria-expanded','false');if(isGlobalDefinitionView()){document.body.classList.remove('inspector-open');applyPaneLayout();}if(typeof maybeHydrateWorkspaceOnDemand==='function'&&maybeHydrateWorkspaceOnDemand(state.workspaceView,act))return;renderAll();return;}if(act==='nav-documents'||act==='nav-pages'||act==='nav-batches'||act==='nav-processes'){e.preventDefault();document.body.classList.remove('mobile-nav-open');const navBtn=document.querySelector('[data-action="toggle-mobile-nav"]');if(navBtn)navBtn.setAttribute('aria-expanded','false');applyEditorNavPreset(act.replace(/^nav-/,''));saveState();return;}e.preventDefault();executeCommand(act);return;}const sr=e.target.closest('[data-search-index]')?.dataset.searchIndex;if(sr!==undefined){const results=$('searchPopover')?._results||[];jumpToSearchResult(results[Number(sr)]);return;}const rulePropertyTab=e.target.closest('[data-rule-property-tab]')?.dataset.rulePropertyTab;if(rulePropertyTab){e.preventDefault();setRulePropertyPage(rulePropertyTab);return;}
const inspectorTab=e.target.closest('[data-inspector-tab]')?.dataset.inspectorTab;if(inspectorTab){state.inspectorView=inspectorTab;renderInspector();saveState();return;}const editorEl=e.target.closest('[data-editor-kind][data-editor-key]');if(editorEl){e.preventDefault();if(openGlobalDefinition(editorEl.dataset.editorKind,editorEl.dataset.editorKey))return;}const defEl=e.target.closest('[data-def-kind][data-def-key]');if(defEl){e.preventDefault();if(openGlobalDefinition(defEl.dataset.defKind,defEl.dataset.defKey))return;}const udfTab=e.target.closest('[data-udf-tab]')?.dataset.udfTab;if(udfTab){e.preventDefault();state.udfEditorTab=udfTab;renderContent();saveState();return;}const udfFilter=e.target.closest('[data-udf-filter]')?.dataset.udfFilter;if(udfFilter){state.udfFilter=udfFilter;state.selectedUdfName='';renderAll();return;}const fieldFilter=e.target.closest('[data-field-filter]')?.dataset.fieldFilter;if(fieldFilter){state.fieldResolutionFilter=fieldFilter;renderContent();renderDiagnosticsDock();saveState();return;}const sf=e.target.closest('[data-scope-filter]')?.dataset.scopeFilter;if(sf){state.scopeKindFilter=sf;saveState();renderScopes();return;}const sc=e.target.closest('[data-scope]')?.dataset.scope;if(sc){selectScope(sc);return;}const tog=e.target.closest('[data-toggle-node]')?.dataset.toggleNode;if(tog){const nodeId=String(tog);if(state.expanded.has(nodeId)){state.expanded.delete(nodeId);}else{state.expanded.add(nodeId);collapseActionListsForNode(nodeId);}renderContent();renderViewbar();renderDiagnosticsDock();renderInspector();return;}const br=e.target.closest('[data-toggle-action-list]')?.dataset.toggleActionList;if(br){state.collapsedActionLists.has(br)?state.collapsedActionLists.delete(br):state.collapsedActionLists.add(br);renderContent();renderViewbar();renderDiagnosticsDock();renderInspector();return;}const actionList=e.target.closest('[data-action-list]')?.dataset.actionList;if(actionList){selectActionList(actionList);return;}const nodeEl=e.target.closest('[data-node]');const node=nodeEl?.dataset.node;if(node){selectNodeInScope(node,nodeEl?.dataset.nodeScope||'');return;}const inv=e.target.closest('[data-inventory]')?.dataset.inventory;if(inv){state.selectedType='inventory';state.selectedId=inv;document.body.classList.add('inspector-open');renderAll();return;}const rel=e.target.closest('[data-rel]')?.dataset.rel;if(rel){state.selectedType='rel';state.selectedId=rel;document.body.classList.add('inspector-open');renderAll();return;}const diag=e.target.closest('[data-diag]')?.dataset.diag;if(diag){state.selectedType='diag';state.selectedId=diag;document.body.classList.add('inspector-open');renderAll();return;}});
  document.addEventListener('input',e=>{if(e.target.id==='scopeSearch'){closeSearchPopover();state.scopeQuery=e.target.value;renderScopes();}else if(e.target.id==='globalSearch'||e.target.id==='viewSearch'||e.target.id==='editorSearch'){if(searchDebounceTimer)window.clearTimeout(searchDebounceTimer);const sourceId=e.target.id;searchDebounceTimer=window.setTimeout(()=>applyQueryInput(e.target.value,sourceId),120);}});
  document.addEventListener('search',e=>{if(e.target.id==='globalSearch'||e.target.id==='viewSearch'||e.target.id==='editorSearch')applyQueryInput(e.target.value,e.target.id);});
  document.addEventListener('change',e=>{if(e.target.id==='treeFilter'){state.treeFilter=e.target.value;renderContent();renderDiagnosticsDock();renderInspector();renderViewbar();return;}if(e.target.id==='disclosureLevel'){state.disclosureLevel=Number(e.target.value)||2;saveState();renderContent();renderDiagnosticsDock();renderViewbar();return;}});
  document.addEventListener('keydown',e=>{
    if(state.modal)handleModalFocusTrap(e);
    const activeTag=document.activeElement?.tagName||'';
    const typing=/INPUT|TEXTAREA|SELECT/.test(activeTag);
    if(typing&&handleSearchPopoverKeydown(e))return;
    const key=lower(e.key);
    const commandSearch=(e.ctrlKey||e.metaKey)&&key==='k';
    if(commandSearch){
      e.preventDefault();
      state.searchActiveIndex=0;
      focusActiveSearch();
      if(!isEditorMode())renderSearchPopover();
      return;
    }
    if(e.key==='Escape'){
      if(state.modal){closeModalRender();return;}
      closeSearchPopover();
      document.body.classList.remove('inspector-open');
      applyPaneLayout();
      return;
    }
    if(!typing&&e.key==='/'){
      e.preventDefault();
      focusActiveSearch();
      return;
    }
    if(!typing&&e.key==='?'){
      e.preventDefault();
      state.modal='help';
      renderModal();
      return;
    }
    if(!typing&&e.altKey&&key==='i'){
      e.preventDefault();
      document.body.classList.toggle('inspector-open');
      applyPaneLayout();
      saveState();
      return;
    }
    if(!typing&&e.altKey&&key==='c'){
      e.preventDefault();
      handleAction('copy-rule-config');
      return;
    }
    if(!typing&&e.altKey&&key==='s'){
      e.preventDefault();
      handleAction('focus-selected');
      return;
    }
    if(!typing&&e.altKey&&key==='r'){
      e.preventDefault();
      handleAction('reset-pane-layout');
      return;
    }
    if(!typing&&e.altKey&&key==='a'){e.preventDefault();handleAction('expand-all');return;}
    if(!typing&&e.altKey&&key==='d'){e.preventDefault();handleAction('expand-selected-depth');return;}
    if(!typing&&e.altKey&&key==='p'){e.preventDefault();handleAction('collapse-siblings');return;}
    if(!typing&&e.altKey&&key==='f'){e.preventDefault();handleAction('clear-focus');return;}
    if(!typing&&handleRulePropertyTabKeyboard(e))return;
    if(!typing&&handleEditorTreeNavigation(e))return;
    const inRuleTree=!!document.activeElement?.closest?.('.workspace-tree,.tree');
    if(!typing&&inRuleTree&&(e.key==='ArrowDown'||e.key==='ArrowUp')){
      e.preventDefault();
      moveSelection(e.key==='ArrowDown'?1:-1);
      return;
    }
    if(!typing&&inRuleTree&&(e.key==='ArrowRight'||e.key==='ArrowLeft'||e.key===' '||e.key==='Enter'||e.key==='Home'||e.key==='End')){
      handleTreeKey(e);
    }
  });
}
function wireTableSelection(){document.addEventListener('click',e=>{const tableName=e.target.closest('[data-table-name]')?.dataset.tableName;if(!tableName)return;state.selectedTableName=tableName;renderContent();saveState();});}
function wireUdfSelection(){document.addEventListener('click',e=>{const udfName=e.target.closest('[data-udf-name]')?.dataset.udfName;if(!udfName)return;state.selectedUdfName=udfName;renderContent();saveState();});}
function wireGlobalDefinitionSelection(){document.addEventListener('click',e=>{const row=e.target.closest('[data-global-kind][data-global-key]');if(!row)return;const kind=row.dataset.globalKind,key=row.dataset.globalKey;if(kind==='resources')state.selectedResourceKey=key;else if(kind==='functions')state.selectedFunctionName=key;else if(kind==='selection-lists')state.selectedSelectionListName=key;else if(kind==='drivers')state.selectedDriverKey=key;else if(kind==='tables')state.selectedTableName=key;else if(kind==='udfs')state.selectedUdfName=key;else if(kind==='rule-lists')state.selectedRuleListKey=key;else if(kind==='object-graph')state.selectedObjectGraphKey=key;else if(kind==='runtime-impact')state.selectedRuntimeImpactKey=key;else return;e.preventDefault();renderContent();saveState();});}
function wireEditorPropertyPages(){document.addEventListener('click',e=>{const page=e.target.closest('[data-editor-page]')?.dataset.editorPage;if(!page)return;e.preventDefault();state.editorPropertyPage=normalizeEditorPropertyPage(page);renderContent();saveState();});}
function editorTreeNavigationRows(){
  const tree=document.activeElement?.closest?.('.fweditor-fwd-tree-window');
  if(!tree)return [];
  return [...tree.querySelectorAll('.fweditor-tree-folder > summary,.fweditor-tree-item')].filter(row=>{
    let parent=row.parentElement;
    while(parent&&parent!==tree){
      if(parent.tagName==='DETAILS'&&!parent.open&&parent.querySelector(':scope > summary')!==row)return false;
      parent=parent.parentElement;
    }
    return true;
  });
}
function focusEditorTreeRow(row){
  if(!row)return;
  row.focus();
  row.scrollIntoView({block:'nearest'});
}
function handleEditorTreeNavigation(e){
  const active=document.activeElement;
  if(!active?.closest?.('.fweditor-fwd-tree-window'))return false;
  const rows=editorTreeNavigationRows();
  if(!rows.length)return false;
  const row=active.closest('.fweditor-tree-item,summary');
  let index=Math.max(0,rows.indexOf(row));
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();
    index=clampNumber(index+(e.key==='ArrowDown'?1:-1),0,rows.length-1);
    focusEditorTreeRow(rows[index]);
    return true;
  }
  if(e.key==='Home'||e.key==='End'){
    e.preventDefault();
    focusEditorTreeRow(e.key==='Home'?rows[0]:rows[rows.length-1]);
    return true;
  }
  if(e.key==='Enter'||e.key===' '){
    e.preventDefault();
    row?.click();
    return true;
  }
  if(e.key==='ArrowRight'){
    const folder=row?.tagName==='SUMMARY'?row.parentElement:null;
    if(folder&&!folder.open){
      e.preventDefault();
      folder.open=true;
      return true;
    }
  }
  if(e.key==='ArrowLeft'){
    const folder=row?.tagName==='SUMMARY'?row.parentElement:row?.closest('details[open]');
    if(folder?.open){
      e.preventDefault();
      folder.open=false;
      focusEditorTreeRow(folder.querySelector(':scope > summary'));
      return true;
    }
  }
  return false;
}
function focusableRows(){return [...document.querySelectorAll('.tree-row[data-node],.action-list-row[data-action-list]')];}
function moveSelection(delta){const rows=focusableRows();if(!rows.length)return;let idx=rows.findIndex(r=>(r.dataset.node&&state.selectedId===r.dataset.node)||(r.dataset.actionList&&state.selectedId===r.dataset.actionList));idx=idx<0?0:Math.max(0,Math.min(rows.length-1,idx+delta));const row=rows[idx];if(row.dataset.node)selectNode(row.dataset.node);else if(row.dataset.actionList)selectActionList(row.dataset.actionList);row.focus();}
function handleTreeKey(e){const active=document.activeElement;const node=active?.closest?.('[data-node]')?.dataset.node;const actionList=active?.closest?.('[data-action-list]')?.dataset.actionList;if(e.key==='Home'){e.preventDefault();focusableRows()[0]?.focus();return;}if(e.key==='End'){e.preventDefault();const rows=focusableRows();rows[rows.length-1]?.focus();return;}if(e.key==='Enter'){e.preventDefault();if(actionList)selectActionList(actionList);else if(node)selectNode(node);return;}if(e.key===' '){e.preventDefault();if(actionList){state.collapsedActionLists.has(actionList)?state.collapsedActionLists.delete(actionList):state.collapsedActionLists.add(actionList);}else if(node){state.expanded.has(node)?state.expanded.delete(node):(state.expanded.add(node),collapseActionListsForNode(node));}renderContent();renderDiagnosticsDock();renderInspector();return;}if(e.key==='ArrowRight'){e.preventDefault();if(actionList)state.collapsedActionLists.delete(actionList);else if(node){state.expanded.add(node);collapseActionListsForNode(node);}renderContent();renderDiagnosticsDock();renderInspector();return;}if(e.key==='ArrowLeft'){e.preventDefault();if(actionList)state.collapsedActionLists.add(actionList);else if(node)state.expanded.delete(node);renderContent();renderDiagnosticsDock();renderInspector();return;}}


function udfHasInternalRules(u){return list(u?.internalRules).length>0||/RuleListAvailable/i.test(text(u?.availabilityState));}

/* FW Editor Viewer shell v80 -------------------------------------------------
   Default mode is a read-only FW Editor-style configuration browser.
   Advanced diagnostics remain available only behind ?advanced=1. */
function localWorkspaceViews(){
  return ['structure','field-resolution',...(isAdvancedMode()?['load-status']:[])];
}
function normalizeWorkspaceViewName(view){
  const normalized=text(view).trim();
  if(normalized==='messages')return 'load-status';
  return normalized;
}
function isLoadStatusView(view=state.workspaceView){
  return normalizeWorkspaceViewName(view)==='load-status';
}
function validWorkspaceViews(){
  return [...localWorkspaceViews(),...globalWorkspaceViews()];
}
function productViewTitle(view=state.workspaceView){
  const map={
    overview:['Rule List','Open the selected scope Rule List.'],
    structure:['Rule Lists','Read-only Rule Lists with Status Results and Action Lists.'],
    'field-resolution':['Fields','Field and parameter references resolved against the FWD catalog.'],
    'load-status':['Load Status','Advanced load status and configuration warnings.'],
    resources:['Resources','Global shared FWD resources.'],
    functions:['Functions','AC function catalog, parameters, status results, and usage.'],
    'selection-lists':['SelectionLists','SelectionList schemas and rule references kept separate.'],
    tables:['Tables','Table resources and rule usage references.'],
    udfs:['UDFs','User Defined Function interfaces, callers, and internal Rule List status.'],
    'rule-lists':['Rule Lists','Snapshot-wide Rule List, Status Result, and Action List inventory.'],
    drivers:['Drivers','Input, output, and process-private driver definitions.']
  };
  if(isAdvancedMode()){
    map['object-graph']=['Object Graph','Developer object graph.'];
    map['runtime-impact']=['Runtime Impact','Developer static impact records.'];
  }
  return map[view]||map.overview;
}
function renderMainHead(){
  const [title,caption]=productViewTitle();
  const selectedScope=currentScope();
  $('scopeTitle').textContent=title;
  $('scopeCaption').innerHTML=`<span class="scope-caption-note">${esc(caption)}</span>`;
  const crumbParts=['FW Editor Viewer'];
  if(state.workspaceView==='structure'&&selectedScope)crumbParts.push(selectedScope.name||selectedScope.scopeId);
  $('crumbs').innerHTML=`${crumbParts.map(x=>`<span class="head-chip">${esc(x)}</span>`).join('')}<span class="head-chip">Read-only</span>${fwdHydrationSummary().level==='warn'?'<span class="head-chip warning">Status partial</span>':'<span class="head-chip success">Loaded</span>'}`;
  renderWorkspaceTabs();
  renderViewbar();
}
function renderWorkspaceTabs(){
  const host=$('tabs');
  if(state.workspaceView==='overview'||isGlobalDefinitionView()){
    host.innerHTML='';
    host.setAttribute('aria-hidden','true');
    return;
  }
  host.removeAttribute('aria-hidden');
  const tabs=[['structure','Rule List'],['field-resolution','Fields / Parameters'],...(isAdvancedMode()?[[ 'load-status','Load Status' ]]:[])];
  host.innerHTML=tabs.map(([id,label])=>`<button class="workspace-tab ${state.workspaceView===id?'active':''}" type="button" role="tab" data-action="view-${esc(id)}" aria-selected="${state.workspaceView===id?'true':'false'}"><span>${esc(label)}</span></button>`).join('');
}
function renderViewbar(){
  const view=state.workspaceView||'overview';
  const [title]=productViewTitle(view);
  const search=viewSearchMeta();
  const showSearch=view!=='overview';
  $('viewbar').innerHTML=`<div class="product-viewbar"><div class="product-view-pill"><span>${esc(title)}</span><b>${isGlobalDefinitionView(view)?'Global resource':'Workspace'}</b></div>${showSearch?`<div class="field tree-filter"><label class="sr-only" for="viewSearch">${esc(search.label)}</label><input id="viewSearch" type="search" value="${esc(state.query)}" placeholder="${esc(search.placeholder)}"><button class="filter-clear" type="button" data-action="clear-tree-search" ${text(state.query).trim()?'':'disabled'}>Clear</button></div>`:''}${state.workspaceView==='structure'?`<div class="viewbar-right"><select id="treeFilter" aria-label="Rule List filter"><option value="all" ${state.treeFilter==='all'?'selected':''}>All rules</option><option value="disabled" ${state.treeFilter==='disabled'?'selected':''}>Disabled</option><option value="warnings" ${state.treeFilter==='warnings'?'selected':''}>Warnings</option><option value="actions" ${state.treeFilter==='actions'?'selected':''}>Action parents</option></select><button class="btn" type="button" data-action="collapse-all">Collapse</button><button class="btn" type="button" data-action="expand-selected-depth">Open selected</button></div>`:''}</div>`;
}
function productCounts(){
  if(productCountsCache)return productCountsCache;
  const tableRows=buildGlobalTableDefinitions();
  const selectionRows=buildSelectionListPacketDefinitions();
  const udfRows=buildUdfDefinitions();
  const functionRows=buildGlobalFunctionDefinitions();
  const ruleCount=Number(first(treeData?.RuleCount,Array.from(model.ruleNodesByScope?.values()||[]).reduce((sum,rows)=>sum+rows.length,0),0));
  const additional=Number(first(treeData?.AdditionalRuleCount,model.nodes.filter(n=>n.isAdditionalRule).length,0));
  productCountsCache={
    rules:ruleCount,
    placed:Math.max(0,ruleCount-additional),
    additional,
    scopes:model.scopes.length,
    udfs:udfRows.length,
    udfAvailable:udfRows.filter(u=>list(u.internalRules).length||/available/i.test(text(u.availabilityState))).length,
    functions:functionRows.length,
    tables:tableRows.length,
    selectionLists:selectionRows.length,
    parsedSelectionLists:selectionRows.filter(r=>r.selectionList?.schemaParsed===true).length,
    resources:buildGlobalResourceDefinitions().length,
    warnings:model.scopes.reduce((sum,s)=>sum+Number(first(s.warnings,0)),0)
  };
  return productCountsCache;
}
function renderOverview(){
  const c=productCounts();
  const hydration=fwdHydrationSummary();
  const areas=[
    ['view-rule-lists','Rule Lists',`${fmt(c.rules)} rules`, 'Inspect placed rules, Action Lists, Status Results, and Additional Rules.'],
    ['view-udfs','UDFs',`${fmt(c.udfs)} functions`, 'Review UDF interfaces, caller bindings, status results, and internal Rule List availability.'],
    ['view-functions','Functions',`${fmt(c.functions)} functions`, 'Review function categories, parameters, behavior flags, and configured usage.'],
    ['view-tables','Tables',`${fmt(c.tables)} tables`, 'Open table resources and rule usage references.'],
    ['view-selection-lists','SelectionLists',`${fmt(c.selectionLists)} items`, 'Separate parsed SelectionList schemas from rule references.'],
    ['view-resources','Resources',`${fmt(c.resources)} resources`, 'Browse shared resources and FWD-level definitions.'],
    ['nav-documents','Documents / Pages',`${fmt(c.scopes)} scopes`, 'Choose document/page scopes and inspect their Rule Lists.'],
    ...(isAdvancedMode()?[[ 'view-load-status','Load Status',`${fmt(c.warnings)} warnings`, 'Review load status and configuration warnings.' ]]:[])
  ];
  const cards=areas.map(([action,title,metric,body])=>`<button class="product-action-card" type="button" data-action="${esc(action)}"><span>${esc(title)}</span><b>${esc(metric)}</b><small>${esc(body)}</small></button>`).join('');
  const ruleSummary=`<div class="product-summary-grid"><div><span>Total rules</span><b>${fmt(c.rules)}</b></div><div><span>Placed rules</span><b>${fmt(c.placed)}</b></div><div><span>Additional Rules</span><b>${fmt(c.additional)}</b></div><div><span>Status</span><b>${hydration.level==='warn'?'Partial':'Loaded'}</b></div></div>`;
  $('content').innerHTML=`<section class="product-overview"><div class="product-hero"><div><div class="eyebrow">Read-only FW Editor-style configuration viewer</div><h2>Browse this FWD configuration in a read-only FW Editor-style view.</h2><p>Use the navigation to inspect Rule Lists, UDFs, Functions, Tables, SelectionLists, Resources, Documents, and Pages. This viewer does not edit or execute FormWorks configuration.</p></div><div class="product-status-card"><span>Snapshot</span><b>${esc(snapshotId())}</b><small>${esc(hydration.label||'Loaded')}</small></div></div>${ruleSummary}<div class="product-card-grid">${cards}</div><section class="product-callout ${c.additional?'warn':'ok'}"><b>${c.additional?'Additional Rules present':'Rule placement complete'}</b><span>${c.additional?`${fmt(c.additional)} rules are readable/searchable but do not have confirmed Rule List placement in this snapshot.`:'All exported rules are represented in placed Rule Lists.'}</span></section></section>`;
}