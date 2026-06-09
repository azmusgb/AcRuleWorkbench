
function buildModel(){
  const scopes=new Map();
  const upsertScope=x=>{
    const id=scopeIdOf(x);
    const current=scopes.get(id)||{scopeId:id,name:scopeNameOf(x),kind:scopeKindOf(x),structural:0,inventory:0,flatOnly:0,refs:0,diags:0,directDisabled:0,inheritedDisabled:0,warnings:0,coverageDelta:0,coverageRatio:1,health:'unknown'};
    current.name=current.name||scopeNameOf(x);
    current.kind=current.kind||scopeKindOf(x);
    scopes.set(id,current);
    return current;
  };
  list(treeData.Scopes).forEach(s=>{ upsertScope(s); });

  const nodes=list(treeData.Nodes).map((n,i)=>{
    const id=text(first(n.NodeId,n.nodeId,`synthetic-${i}`));
    const scope=upsertScope(n);
    const disabled=disabledOf(n);
    if(n.IsRuleNode)scope.structural++;
    if(disabled==='direct')scope.directDisabled++;
    if(disabled==='inherited')scope.inheritedDisabled++;
    return {...n,id,scopeId:scopeIdOf(n),title:titleOf(n),fn:fnOf(n),depth:Number(first(n.HierarchyLevel,n.depth,0))||0,disabled,isRule:!!n.IsRuleNode,isSection:!n.IsRuleNode||!fnOf(n)||/^\*{4,}$/.test(titleOf(n))||/read this comment/i.test(titleOf(n)),searchBlob:''};
  });
  const nodesById=new Map(nodes.map(n=>[n.id,n]));
  nodes.forEach(n=>{n.searchBlob=[n.title,n.fn,n.RuleGuid,n.RuleId,n.ScopePath,n.Description,paramText(n.Parameters),actionNamesOf(n).join(' ')].join(' ').toLowerCase();});

  const edges=list(treeData.Edges).map((e,i)=>({...e,id:`edge-${i}`,from:text(first(e.FromNodeId,e.fromNodeId,e.From,e.from,'')),to:text(first(e.ToNodeId,e.toNodeId,e.To,e.to,'')),scopeId:scopeIdOf(e),kind:text(first(e.EdgeKind,e.kind,e.relationship,'Edge')),label:actionListName(e),routeState:actionListState(e),resolved:actionListResolved(e)}));
  const childrenByParent=new Map(),parentByChild=new Map(),incomingByChild=new Map(),incomingEdgesByChild=new Map(),edgesByParent=new Map();
  edges.forEach(e=>{
    if(!e.from||!e.to)return;
    if(!childrenByParent.has(e.from))childrenByParent.set(e.from,[]);
    childrenByParent.get(e.from).push(e.to);
    if(!parentByChild.has(e.to))parentByChild.set(e.to,e.from);
    if(!incomingEdgesByChild.has(e.to))incomingEdgesByChild.set(e.to,[]);
    incomingEdgesByChild.get(e.to).push(e);
    if(!incomingByChild.has(e.to))incomingByChild.set(e.to,e);
    if(!edgesByParent.has(e.from))edgesByParent.set(e.from,[]);
    edgesByParent.get(e.from).push(e);
  });

  const rootsByScope=new Map();
  nodes.forEach(n=>{
    const parent=text(first(n.ParentNodeId,''));
    const isRoot=!parentByChild.has(n.id)||parent==='-1'||parent===''||!nodesById.has(parentByChild.get(n.id));
    if(isRoot){
      if(!rootsByScope.has(n.scopeId))rootsByScope.set(n.scopeId,[]);
      rootsByScope.get(n.scopeId).push(n.id);
    }
  });

  const structuralByKey=new Map(),structuralByGuid=new Map(),structuralByNameFn=new Map();
  nodes.forEach(n=>{structuralByKey.set(ruleKeyParts(n),n.id);addUniqueIndex(structuralByGuid,scopedGuidKey(n),n.id);addUniqueIndex(structuralByNameFn,scopedNameFunctionKey(n),n.id);});

  const inventory=list(rulesData.Rules).map((r,i)=>{
    const scope=upsertScope(r);
    const nodeId=correlationNodeId(r,structuralByKey,structuralByGuid,structuralByNameFn);
    const structuralNode=nodeId?nodesById.get(String(nodeId)):null;
    const flatDisabled=disabledOf(r);
    const disabled=structuralNode?structuralNode.disabled:flatDisabled;
    const row={...r,id:`flat-${i}`,scopeId:scopeIdOf(r),title:titleOf(r),fn:fnOf(r),flatDisabled,disabled,disabledAuthority:structuralNode?'Structural':'FlatInventory',nodeId,classification:nodeId?'StructuralMatch':'AdditionalRule',searchBlob:''};
    row.searchBlob=[row.title,row.fn,row.RuleGuid,row.RuleId,row.ScopePath,row.classification,paramText(row.Parameters),flatDisabled,disabled].join(' ').toLowerCase();
    scope.inventory++;
    if(!nodeId)scope.flatOnly++;
    return row;
  });

  const rels=list(first(relData.Relationships,relData.Edges,[])).map((r,i)=>{
    const nodeId=correlationNodeId(r,structuralByKey,structuralByGuid,structuralByNameFn);
    const row={...r,id:`rel-${i}`,scopeId:scopeIdOf(r),nodeId,kind:text(first(r.Kind,r.EdgeKind,'Reference')),targetType:text(first(r.TargetType,'Unknown')),target:text(first(r.Target,'')),matchLevel:text(first(r.MatchLevel,r.Confidence,'Medium')),searchBlob:''};
    row.searchBlob=[row.kind,row.targetType,row.target,row.matchLevel,row.ScopePath,row.RuleName,row.FunctionName].join(' ').toLowerCase();
    const scope=upsertScope(row);scope.refs++;
    return row;
  });

  const diags=list(first(treeData['Diag'+'nostics'],rulesData['Diag'+'nostics'],relData['Diag'+'nostics'],[])).map((d,i)=>{
    const severity=text(first(d.Severity,d.severity,'Info'));
    const row={...d,id:`diag-${i}`,scopeId:scopeIdOf(d),severity,title:text(first(d.Title,d.Code,d.Message,'Message')),detail:text(first(d.Detail,d.Message,d.Recommendation,'')),nodeId:text(first(d.NodeId,d.nodeId,'')),searchBlob:''};
    row.searchBlob=[row.severity,row.title,row.detail,row.scopeId,row.nodeId].join(' ').toLowerCase();
    const scope=upsertScope(row);scope.diags++;if(/warn|error/i.test(row.severity))scope.warnings++;
    return row;
  });

  const nodesByScope=new Map(),ruleNodesByScope=new Map(),inventoryByScope=new Map(),relsByScope=new Map(),diagsByScope=new Map(),edgesByScope=new Map(),diagsByNode=new Map(),actionListGroupsByParent=new Map(),actionListVmByKey=new Map(),actionListKeysByScope=new Map();
  function pushMapList(map,key,value){
    const k=text(key||'');
    if(!map.has(k))map.set(k,[]);
    map.get(k).push(value);
  }
  nodes.forEach(n=>{pushMapList(nodesByScope,n.scopeId,n);if(n.isRule)pushMapList(ruleNodesByScope,n.scopeId,n);});
  inventory.forEach(r=>pushMapList(inventoryByScope,r.scopeId,r));
  rels.forEach(r=>pushMapList(relsByScope,r.scopeId,r));
  diags.forEach(d=>{pushMapList(diagsByScope,d.scopeId,d);if(d.nodeId)pushMapList(diagsByNode,d.nodeId,d);});
  edges.forEach(e=>pushMapList(edgesByScope,e.scopeId,e));
  edgesByParent.forEach((parentEdges,parentId)=>{
    const groups=[];
    const byKey=new Map();
    parentEdges.filter(e=>e&&e.to&&e.routeState!=='Root').forEach(e=>{
      const key=[e?.routeState||'',e?.label||'',first(e?.ActionListIndex,e?.actionListIndex,'')].join('|');
      let g=byKey.get(key);
      if(!g){
        g={key,edge:e,label:e.label||'Unnamed action list',routeState:e.routeState||'UnnamedAction',resolved:!!e.resolved,actionListIndex:first(e.ActionListIndex,e.actionListIndex,null),childIds:[]};
        byKey.set(key,g);
        groups.push(g);
      }
      g.childIds.push(String(e.to));
    });
    actionListGroupsByParent.set(String(parentId),groups);
    const parent=nodesById.get(String(parentId));
    groups.forEach(g=>{
      const key=`${String(parentId)}::${g.key}`;
      pushMapList(actionListKeysByScope,parent?.scopeId||'',key);
      const childNodes=g.childIds.map(id=>nodesById.get(String(id))).filter(Boolean);
      actionListVmByKey.set(key,{kind:'ActionList',key,actionListId:`${text(parent?.scopeId||'')}|${String(parentId)}|action:${text(first(g?.actionListIndex,g?.key,g?.label,'action')).replace(/\s+/g,'_')}`,scopeId:parent?.scopeId||'',parent,group:g,childNodes,childIds:g.childIds,childCount:g.childIds.length,actionListState:g.routeState||'UnnamedAction',resolved:!!g.resolved,label:g.label||'Unnamed action list',actionListIndex:g.actionListIndex});
    });
  });
  const ruleUsageByFunctionName=new Map();
  function pushFunctionUsage(fnName,usage){
    const key=lower(fnName);
    if(!key)return;
    if(!ruleUsageByFunctionName.has(key))ruleUsageByFunctionName.set(key,[]);
    ruleUsageByFunctionName.get(key).push(usage);
  }
  nodes.forEach(n=>pushFunctionUsage(n.fn,{scopeId:n.scopeId,ruleName:n.title,functionName:n.fn,node:n,nodeId:n.id,target:n.fn,targetType:'Function',relationshipKind:'Structural rule',statusResults:actionNamesOf(n).map(text).filter(Boolean),parameters:n.Parameters||{}}));
  inventory.forEach(r=>pushFunctionUsage(r.fn,{scopeId:r.scopeId,ruleName:r.title,functionName:r.fn,node:r.nodeId?nodesById.get(String(r.nodeId)):null,nodeId:text(r.nodeId),target:r.fn,targetType:'Function',relationshipKind:r.classification||'Flat inventory',statusResults:actionNamesOf(r).map(text).filter(Boolean),parameters:r.Parameters||{}}));
  ruleUsageByFunctionName.forEach(rows=>rows.sort((a,b)=>a.scopeId.localeCompare(b.scopeId,undefined,{sensitivity:'base'})||a.ruleName.localeCompare(b.ruleName,undefined,{sensitivity:'base'})));
  const searchIndexReady=false;

scopes.forEach(scope=>{
    scope.coverageDelta=Math.max(0,scope.inventory-scope.structural);
    scope.coverageRatio=scope.structural>0?scope.inventory/Math.max(scope.structural,1):(scope.inventory>0?Infinity:1);
    const severeCoverage=(scope.inventory>50&&scope.structural===0)||(scope.inventory>100&&scope.structural>0&&scope.inventory>scope.structural*2)||scope.coverageDelta>500;
    const warningCoverage=!severeCoverage&&(scope.coverageDelta>100||scope.flatOnly>50||scope.coverageRatio>1.35);
    scope.health=severeCoverage?'coverage-failure':scope.warnings?'warning':warningCoverage?'coverage-warning':'healthy';
    // v62: coverage/count mismatches remain scope metadata only. Do not create synthetic
    // user-facing messages; this page is a read-only FWD representation, not a separate health dashboard.
  });

  const scopeList=[...scopes.values()].sort((a,b)=>{
    const rank={'coverage-failure':0,'warning':1,'coverage-warning':2,'healthy':3,'unknown':4};
    return (rank[a.health]??9)-(rank[b.health]??9)||(b.structural-a.structural)||a.name.localeCompare(b.name);
  });
  return {scopes:scopeList,nodes,nodesById,edges,childrenByParent,parentByChild,incomingByChild,incomingEdgesByChild,edgesByParent,rootsByScope,inventory,rels,diags,fwd:fwdData,nodesByScope,ruleNodesByScope,inventoryByScope,relsByScope,diagsByScope,edgesByScope,diagsByNode,actionListGroupsByParent,actionListVmByKey,actionListKeysByScope,ruleUsageByFunctionName,visibleRowsCache:null,treeMatchCache:null,searchIndexReady};
}
let model;
const bootState={phase:'loading',detail:'Loading FWD snapshot...'};

function fwdHydrationSummary(){
  if(fwdApiHydrationState.mode==='full')return {level:'ready',label:'FWD API loaded'};
  if(fwdApiHydrationState.mode==='embedded')return {level:'ready',label:'Embedded FWD globals loaded'};
  if(fwdApiHydrationState.mode==='partial+embedded')return {level:'ready',label:'FWD API partial; embedded globals merged'};
  return {level:'ready',label:'FWD snapshot loaded'};
}

function setBootPhase(phase,detail=''){
  bootState.phase=phase;
  bootState.detail=detail||'';
  document.body.setAttribute('aria-busy',phase==='loading'?'true':'false');
  optionalElement('content')?.setAttribute('aria-busy',phase==='loading'?'true':'false');
}

function renderBootLoading(){
  setBootPhase('loading','Loading FWD snapshot...');
  document.body.classList.add('no-scope-selector');
  $('sourceSubtitle').textContent='Loading FWD snapshot...';
  $('statusPill').innerHTML='<span class="dot"></span><span>Loading FWD</span>';
  $('globalNav').innerHTML='';
  const scopeHost=optionalElement('scopeList');
  if(scopeHost){
    scopeHost.hidden=true;
    scopeHost.setAttribute('aria-hidden','true');
    scopeHost.innerHTML='';
  }
  $('content').innerHTML=emptyHtml('Preparing read-only FWD viewer','Loading FWD rules, global definitions, and action lists...');
}
function seedExpanded(scopeId=state.scopeId){
  state.expanded.clear();
  (model.rootsByScope.get(scopeId)||[]).forEach(id=>state.expanded.add(String(id)));
}
function currentScope(){return model.scopes.find(s=>s.scopeId===state.scopeId)||model.scopes[0];}
function scopedNodes(){return list(model.nodesByScope?.get(state.scopeId));}
function scopedRuleNodes(){return list(model.ruleNodesByScope?.get(state.scopeId));}
function scopedInventory(){return list(model.inventoryByScope?.get(state.scopeId));}
function scopedRels(){return list(model.relsByScope?.get(state.scopeId));}
function scopedDiags(){return [...list(model.diagsByScope?.get(state.scopeId)),...list(model.diagsByScope?.get('')),...list(model.diagsByScope?.get('Unscoped'))];}
function scopedEdges(){return list(model.edgesByScope?.get(state.scopeId));}
function scopedActionListStats(){const edges=scopedEdges();const root=edges.filter(e=>e.routeState==='Root').length;const named=edges.filter(e=>e.routeState==='NamedAction').length;const indexed=edges.filter(e=>e.routeState==='IndexedAction').length;const unnamed=edges.filter(e=>e.routeState==='UnnamedAction').length;return {edges:edges.length,root,resolved:named,indexOnly:indexed,unnamed:unnamed,named,indexed,unnamed,nonRoot:Math.max(0,edges.length-root)};}
function scopeStatusStripHtml(){const s=currentScope(),stats=scopedActionListStats();const totalNonRoot=Math.max(1,stats.nonRoot);const decodedPct=Math.round((stats.resolved/totalNonRoot)*100);return `<div class="trust-strip" aria-label="Scope model status"><div class="trust-item info"><b>Scope</b><span>${esc(s.kind||'Scope')}</span></div><div class="trust-item good"><b>Structure</b><span>${fmt(scopedRuleNodes().length)} rules</span></div><div class="trust-item ${stats.indexOnly||stats.unnamed?'warn':'good'}"><b>Action lists</b><span>${fmt(stats.resolved)} named / ${fmt(stats.indexOnly+stats.unnamed)} unnamed</span></div><div class="trust-item ${s.warnings?'warn':'good'}"><b>Warnings</b><span>${s.warnings?fmt(s.warnings):'None'}</span></div></div><div class="caption caption-block">Action-list mapping: ${decodedPct}% of non-root structural edges have resolved parent status-result action names. This shows the FWD configuration model as extracted for this scope.</div>`;}

function scopeHealthClass(s){return s?.health==='coverage-failure'?'bad':s?.health==='coverage-warning'||s?.health==='warning'?'warn':'good';}
function scopeHealthLabel(s){return s?.health==='coverage-failure'?'Count mismatch':s?.health==='coverage-warning'?'Count warning':s?.health==='warning'?'Warnings':'Loaded';}
function scopeHealthNoticeHtml(s=currentScope()){
  if(!s)return '';
  const cls=scopeHealthClass(s);
  const stats=scopedActionListStats();
  const message=s.health==='coverage-failure'
    ? `Inventory row has ${fmt(s.inventory)} row(s), but structural tree has ${fmt(s.structural)} rule node(s). Open the unmatched rows before using this scope for order-sensitive review.`
    : s.health==='coverage-warning'
      ? `Inventory row exceeds structural coverage. Open the unmatched rows before using this scope for order-sensitive review.`
      : `Structure and inventory counts are within the expected review range for this scope.`;
  return `<div class="scope-health-banner ${cls}"><div><b>${esc(scopeHealthLabel(s))}</b><span>${esc(message)}</span></div><div class="health-metrics"><span>${fmt(s.structural)} structural</span><span>${fmt(s.flatOnly)} Additional Rules</span><span>${fmt(stats.indexOnly+stats.unnamed)} unnamed action lists</span></div></div>`;
}
function selectedNode(){return state.selectedType==='node'?model.nodesById.get(String(state.selectedId)):null;}
function selectedInventory(){return state.selectedType==='inventory'?model.inventory.find(x=>x.id===state.selectedId):null;}
function selectedRel(){return state.selectedType==='rel'?model.rels.find(x=>x.id===state.selectedId):null;}
function selectedDiag(){return state.selectedType==='diag'?model.diags.find(x=>x.id===state.selectedId):null;}
function actionListIdFor(parentId,g,scopeId=state.scopeId){return `${text(scopeId||state.scopeId)}|${String(parentId)}|action:${text(first(g?.actionListIndex,g?.key,g?.label,'action')).replace(/\s+/g,'_')}`;}
function actionListVmFromKey(key,scopeId=state.scopeId){
  const targetKey=String(key||'');
  if(!targetKey||!model)return null;
  const cached=model.actionListVmByKey?.get(targetKey);
  if(cached&&(!scopeId||cached.scopeId===scopeId))return cached;
  return cached||null;
}
function selectedActionList(){return state.selectedType==='action-list'?actionListVmFromKey(state.selectedId):null;}
function selectedObject(){return selectedNode()||selectedActionList()||selectedInventory()||selectedRel()||selectedDiag()||currentScope();}
function selectActionList(key){
  const b=actionListVmFromKey(key);
  if(!b)return;
  state.workspaceView='structure';
  state.selectedType='action-list';
  state.selectedId=String(key);
  state.expanded.add(b.parent.id);
  document.body.classList.add('inspector-open');
  renderAll();
  setTimeout(()=>document.querySelector(`[data-action-list="${cssEscape(String(key))}"]`)?.scrollIntoView({block:'nearest'}),0);
}
function selectScope(id){
  if(!id)return;
  if(id===state.scopeId){
    if(isGlobalDefinitionView()){
      state.workspaceView='structure';
      document.body.classList.remove('inspector-open');
      renderAll();
    }
    return;
  }
  state.scopeId=id;
  if(isGlobalDefinitionView())state.workspaceView='structure';
  noteRecentScope(id);
  state.selectedType='scope';
  state.selectedId='';
  state.focusNodeId='';
  state.collapsedActionLists.clear();
  seedExpanded(id);
  document.body.classList.remove('inspector-open');
  markOnboardingComplete();
  announceContentStatus(`Scope selected: ${currentScope()?.name||id}`);
  renderAll();
}
function selectNodeInScope(id,scopeId=''){
  const nodeId=String(id);
  const node=model.nodesById.get(nodeId);
  const targetScope=text(scopeId||node?.scopeId||state.scopeId);
  if(targetScope&&targetScope!==state.scopeId){
    state.scopeId=targetScope;
    noteRecentScope(targetScope);
    state.collapsedActionLists.clear();
    seedExpanded(targetScope);
  }
  if(state.modal)state.modal='';
  state.workspaceView='structure';
  state.selectedType='node';
  state.selectedId=nodeId;
  state.focusNodeId=nodeId;
  state.expanded.add(nodeId);
  let child=nodeId;
  let p=model.parentByChild.get(child);
  while(p){
    state.expanded.add(p);
    const incoming=model.incomingByChild.get(child);
    if(incoming)state.collapsedActionLists.delete(actionListKeyFromEdge(p,incoming));
    child=p;
    p=model.parentByChild.get(p);
  }
  document.body.classList.add('inspector-open');
  renderAll();
  setTimeout(()=>{const row=document.querySelector(`[data-node="${cssEscape(nodeId)}"]`);row?.scrollIntoView({block:'nearest'});row?.focus();},0);
}
function isGlobalDefinitionView(view=state.workspaceView){
  return globalWorkspaceViews().includes(view);
}
function globalWorkspaceViews(){
  return ['resources','functions','selection-lists','tables','udfs','rule-lists','drivers',...advancedWorkspaceViews()];
}
function appShellRequested(){
  const params=new URLSearchParams(window.location.search||'');
  const shell=text(first(params.get('shell'),params.get('ui'),''));
  const explicitDeveloperShell=params.get('developerShell')==='1'||params.get('legacy')==='1'||/^(app|product|shell)$/i.test(shell)||params.get('editor')==='0'||params.get('fw-editor')==='0';
  return isAdvancedMode()&&explicitDeveloperShell;
}
function isEditorMode(view=state.workspaceView){
  // Default mode is locked to the read-only FW Editor-style shell. The older app shell is developer-only and requires ?advanced=1 plus an explicit shell request.
  return !appShellRequested()&&validWorkspaceViews().includes(view);
}
function setEditorModeClasses(){
  const editorShell=isEditorMode();
  const globalMode=isGlobalDefinitionView(state.workspaceView||'structure');
  // Do not use the legacy `editor-mode` body class for the normal FW Editor Viewer shell.
  // That class belongs to an older full-screen mimic layer and hides the topbar/main head.
  // The current read-only shell is controlled by `fw-editor-viewer-shell` only.
  document.body.classList.remove('editor-mode');
  document.body.classList.toggle('advanced-mode',isAdvancedMode());
  document.body.classList.toggle('fweditor-global-mode',globalMode);
  document.body.classList.toggle('global-workspace',globalMode);
  document.body.classList.toggle('fw-editor-viewer-shell',editorShell);
  document.body.classList.toggle('developer-app-shell',!editorShell);
  document.body.dataset.workspaceView=state.workspaceView||'structure';
  syncInspectorVisibility();
}
function syncInspectorVisibility(){
  const inspector=optionalElement('inspectorBody')?.closest?.('.pane.right')||optionalElement('inspectorTitle')?.closest?.('.pane.right');
  if(!inspector)return;
  const open=document.body.classList.contains('inspector-open')&&!isEditorMode();
  inspector.setAttribute('aria-hidden',open?'false':'true');
}

function globalViewHeading(view=state.workspaceView){
  const map={
    resources:{title:'Resources',caption:'FWD-level shared definitions. Page and document rules reference these definitions; they remain global.'},
    functions:{title:'Functions',caption:'AC function catalog, configured status results, behavior flags, parameter roles, and rule usage.'},
    'selection-lists':{title:'SelectionLists',caption:'SelectionList schemas shown separately from rule references. Table references are not promoted to SelectionLists unless configuration data exists.'},
    tables:{title:'Tables',caption:'Table resources and rule usage references. Tables are kept separate from parsed SelectionList configuration.'},
    'rule-lists':{title:'Rule Lists',caption:'Snapshot-wide Rule List packet with Status Result and Action List rollups.'},
    drivers:{title:'Drivers',caption:'Input, output, and process-private driver definitions from the FWD.'},
    udfs:{title:'UDFs',caption:'User Defined Function interfaces, internal rules, status results, and caller mappings.'}
  };
  return map[view]||null;
}

function workspaceHeroHtml(options={}){
  const eyebrow=text(options.eyebrow||'FW Editor Viewer');
  const title=text(options.title||'FW Editor Viewer');
  const caption=text(options.caption||'Read-only FWD configuration browsing.');
  const metrics=list(options.metrics).filter(Boolean);
  const actions=text(options.actions||'');
  const chips=list(options.chips).filter(Boolean).map(chip=>`<span class="workspace-chip ${esc(chip.tone||'')}">${esc(chip.label||chip)}</span>`).join('');
  const metricsHtml=metrics.length?`<div class="workspace-hero-metrics">${metrics.map(metric=>`<div class="workspace-metric ${esc(metric.tone||'')}"><b>${esc(metric.value)}</b><span>${esc(metric.label)}</span></div>`).join('')}</div>`:'';
  return `<header class="workspace-hero"><div class="workspace-hero-copy"><div class="workspace-eyebrow">${esc(eyebrow)}</div><h3>${esc(title)}</h3><p>${esc(caption)}</p>${chips?`<div class="workspace-chip-row">${chips}</div>`:''}</div>${metricsHtml}${actions?`<div class="workspace-hero-actions">${actions}</div>`:''}</header>`;
}
function workspaceSectionHtml(title,body,options={}){
  const caption=text(options.caption||'');
  const tone=text(options.tone||'');
  const action=text(options.action||'');
  return `<section class="workspace-card ${esc(tone)}"><div class="workspace-card-head"><div><h4>${esc(title)}</h4>${caption?`<p>${esc(caption)}</p>`:''}</div>${action}</div>${body}</section>`;
}
function workspacePageHtml(kind,hero,body,options={}){
  const classes=['workspace-page',`workspace-page-${kind}`];
  if(options.dense)classes.push('dense');
  if(options.split)classes.push('split');
  return `<section class="${classes.map(esc).join(' ')}">${hero}<div class="workspace-page-body">${body}</div></section>`;
}
function structureWorkspaceSummary(rows){
  const visibleRules=rows.filter(r=>r.type!=='action-list').length;
  const actionLists=rows.length-visibleRules;
  const selected=selectedObject();
  const scoped=scopedRuleNodes();
  const warnings=scoped.filter(n=>list(n.messages).length||list(n.diags).length||list(n.Diagnostics).length).length;
  return {
    visibleRules,
    actionLists,
    selected,
    scopedTotal:scoped.length,
    warnings
  };
}
function selectedRuleSummaryHtml(selected){
  if(!selected)return `<div class="selected-rule-empty"><b>No item selected</b><span>Click a rule, Action List, UDF, table, or function to inspect it here and in the right pane.</span></div>`;
  const type=selected.isRule?'Rule':'Action List';
  const title=text(selected.title||selected.name||selected.RuleName||selected.id||'Selected item');
  const path=text(first(selected.DisplayPath,selected.displayPath,selected.StructuralPath,selected.structuralPath,selected.RuleListPath,selected.ruleListPath,''));
  return `<div class="selected-rule-summary"><span class="badge blue">${esc(type)}</span><b>${esc(title)}</b>${path?`<small>${esc(path)}</small>`:''}</div>`;
}
function editorScopeKind(scope=currentScope()){
  const hay=lower(`${scope?.kind||''} ${scope?.name||''} ${scope?.scopeId||''}`);
  if(/batch/.test(hay))return 'Batch';
  if(/document|doc/.test(hay))return 'Document';
  if(/variant/.test(hay))return 'Page Variant';
  if(/page/.test(hay))return 'Page';
  if(/process|\bac\b|\bdv\b|\bfip\b|\bocr\b|store|scan|inventory/.test(hay))return 'Process';
  return text(scope?.kind||'Scope');
}
function processNamesForScope(scope=currentScope()){
  const kind=editorScopeKind(scope).toLowerCase();
  if(kind.includes('page'))return ['AC','DV','FIP','OCR','OCRepair','Store'];
  if(kind.includes('document'))return ['AC','Collator','Store'];
  if(kind.includes('batch'))return ['Collator','FIP','Scan','Inventory'];
  if(kind.includes('process'))return ['AC','Collator','FIP','OCR','Store','TwainScan','Inventory'];
  return ['AC','DV','FIP','OCR','Store'];
}
function observedProcessText(scope=currentScope()){
  const processItems=[
    ...list(model.fwd?.processes?.items).map(p=>first(p.name,p.processName,'')),
    ...list(model.fwd?.processDrivers?.items).map(p=>first(p.processName,p.name,'')),
    ...scopedRuleNodes().map(n=>n.fn)
  ];
  return lower(processItems.map(text).join(' '));
}
function processPanelHtml(scope=currentScope()){
  const processText=observedProcessText(scope);
  const scopeRules=scopedRuleNodes().length;
  const diags=scopedDiags();
  const activeProcess=lower(state.selectedProcessName);
  return `<div class="process-panel" aria-label="Scope processes">${processNamesForScope(scope).map(name=>{
    const key=lower(name);
    const configured=hasProcessToken(name,processText)||((key==='ac'||key==='dv')&&scopeRules>0);
    const warnings=diags.filter(d=>hasProcessToken(name,`${d.title} ${d.detail} ${d.scopeId}`)).length;
    const active=activeProcess===key;
    return `<button class="process-pill ${configured?'configured':'not-configured'} ${warnings?'warn':''} ${active?'active':''}" type="button" data-action="select-process" data-process-name="${esc(name)}" aria-pressed="${active?'true':'false'}" title="Select ${esc(name)} process context"><span>${esc(name)}</span><b>${warnings?`${fmt(warnings)} msg`:configured?'configured':'not found'}</b></button>`;
  }).join('')}</div>`;
}
function scopeBannerHtml(scope=currentScope()){
  const kind=editorScopeKind(scope);
  const process=text(state.selectedProcessName).trim();
  return `<div class="editor-scope-banner"><div><span class="workspace-eyebrow">FW Editor Viewer</span><b>Scope: ${esc(kind)} / ${esc(scope.name||scope.scopeId)}</b><small>${esc(scope.scopeId||'FWD scope')} - read-only FW Editor-style AC configuration.</small></div><div class="editor-scope-badges"><span class="head-chip kind">${esc(kind)}</span>${process?`<span class="head-chip active">Process: ${esc(process)}</span>`:''}<span class="head-chip">${fmt(scopedRuleNodes().length)} rules</span><span class="head-chip">read-only</span></div></div>`;
}
function statusActionPreviewHtml(){
  const actionList=selectedActionList();
  if(actionList){
    const children=actionList.childNodes.length?actionList.childNodes.slice(0,8).map(n=>`<button class="mini-row" type="button" data-node="${esc(n.id)}"><span><b>${esc(n.title)}</b><small>${esc(n.fn||'No function')}</small></span><span class="badge blue">child</span></button>`).join(''):'<div class="muted">No child rules under this action list.</div>';
    return `<div class="status-action-preview"><div class="status-action-context"><b>${esc(actionList.label)}</b><span>Parent: ${esc(actionList.parent.title)} - ${esc(actionList.actionListState)}</span></div>${children}</div>`;
  }
  const node=selectedNode();
  if(!node)return '<div class="muted">Select a rule or action list to inspect Status Result dispatch.</div>';
  return statusActionsBlockForRule(node);
}
function ruleEditorHostPreviewHtml(){
  const node=selectedNode();
  if(!node)return '<div class="muted">Select a rule to see the function-specific editor host.</div>';
  const paramCount=Object.keys(node.Parameters||{}).length;
  const attrCount=attributeEntriesForRule(node).length;
  const udf=udfForFunctionName(node.fn||'');
  const editor=udf?'UDF invocation editor':/table|lookup|select/i.test(node.fn||'')?'Table/SelectionList editor':'Default Fields / Attributes editor';
  return `<div class="rule-editor-host-preview"><div><span class="badge blue">${esc(editor)}</span><b>${esc(node.fn||'No function mapped')}</b></div><div class="mini-list"><div class="mini-row"><span>Fields / Parameters</span><b>${fmt(paramCount)}</b></div><div class="mini-row"><span>Attributes</span><b>${fmt(attrCount)}</b></div><div class="mini-row"><span>Status Results</span><b>${fmt(actionListRowsForRule(node).length)}</b></div></div></div>`;
}
function workspaceTabDefinitions(){
  if(isGlobalDefinitionView()){
    return [
      ['resources','Resources','FWD resources and resource-type definitions'],
      ['functions','Functions','AC function catalog and observed rule usage'],
      ['selection-lists','SelectionLists','SelectionList schemas and rule references kept separate'],
      ['tables','Tables','Table resources and usage references'],
      ['udfs','UDFs','Reusable rule-list functions and caller bindings'],
      ['rule-lists','Rule Lists','Snapshot-wide Rule Lists, Status Results, and Action Lists'],
      ['drivers','Drivers','Driver definitions and process-private findings']
    ];
  }
  return [
    ['structure','Rule List','Rule List hierarchy, Status Results, and Action Lists'],
    ['field-resolution','Fields / Parameters','Field and parameter references resolved against the FWD catalog'],
    ...(isAdvancedMode()?[[ 'load-status','Load Status','Developer load status' ]]:[])
  ];
}
function fweditorMenuStripHtml(){
  return `<div class="fweditor-menu-strip"><span>File</span><span>Edit</span><span>Resources</span><span>Rule</span><span>Window</span><span>Help</span><b>Read-only FW Editor Viewer</b></div>`;
}
function fweditorViewStripHtml(activeView=state.workspaceView){
  const groups=[
    [['structure','Rule List'],['field-resolution','Fields / Parameters'],...(isAdvancedMode()?[[ 'load-status','Load Status' ]]:[])],
    [['resources','Resources'],['functions','Functions'],['selection-lists','SelectionLists'],['tables','Tables'],['udfs','UDFs']],
    [['rule-lists','Rule Lists'],['drivers','Drivers']]
  ];
  const tabs=groups.map((group,groupIndex)=>`${groupIndex?'<span class="fweditor-view-separator" aria-hidden="true"></span>':''}${group.map(([view,label])=>`<button class="${view===activeView?'active':''}" type="button" data-action="view-${esc(view)}" aria-selected="${view===activeView?'true':'false'}">${esc(label)}</button>`).join('')}`).join('');
  return `<div class="fweditor-view-strip"><div class="fweditor-view-tabs" role="tablist" aria-label="Editor windows">${tabs}</div><label class="fweditor-command-search" for="editorSearch"><span>Find</span><input id="editorSearch" type="search" value="${esc(state.query)}" placeholder="${esc(viewSearchMeta().placeholder)}" autocomplete="off"><button type="button" data-action="clear-tree-search" title="Clear search" aria-label="Clear search" ${text(state.query).trim()?'':'disabled'}>&times;</button><kbd>Ctrl+K</kbd></label></div>`;
}
function normalizedEditorTreeWidth(value=state.editorTreeWidth){return clampNumber(Number(value)||276,220,520);}
function normalizedEditorMessageHeight(value=state.editorMessageHeight){return clampNumber(Number(value)||104,80,420);}
function fweditorRootClass(baseClass){
  return `${baseClass}${state.editorMessageExpanded?' message-expanded':''}`;
}
function fweditorRootStyle(){
  return `--fw-tree-w:${Math.round(normalizedEditorTreeWidth())}px;--fw-message-h:${Math.round(normalizedEditorMessageHeight())}px`;
}
function fweditorTreeSplitterHtml(){
  return `<div class="fweditor-splitter fweditor-tree-splitter" role="separator" aria-label="Resize FW Editor Viewer navigation" aria-orientation="vertical" tabindex="0" data-editor-resize="tree"></div>`;
}
function fweditorMessageSplitterHtml(){
  return `<div class="fweditor-splitter fweditor-load-status-splitter" role="separator" aria-label="Resize Load Status" aria-orientation="horizontal" tabindex="0" data-editor-resize="message"></div>`;
}
function fweditorScopePageTabsHtml(activePage=state.workspaceView){
  const tabs=[
    ['structure','Rule List'],
    ['field-resolution','Fields / Parameters'],
    ...(isAdvancedMode()?[[ 'load-status','Load Status' ]]:[])
  ];
  return `<div class="fweditor-form-pages" role="tablist" aria-label="Configuration pages">${tabs.map(([view,label])=>`<button class="${view===activePage?'active':''}" type="button" role="tab" data-action="view-${esc(view)}" aria-selected="${view===activePage?'true':'false'}">${esc(label)}</button>`).join('')}</div>`;
}
function fweditorScopeTreeHtml(selectedScopeId=state.scopeId){
  const groups=new Map();
  model.scopes.forEach(scope=>{
    const kind=editorScopeKind(scope)||'Scope';
    if(!groups.has(kind))groups.set(kind,[]);
    groups.get(kind).push(scope);
  });
  const ordered=[...groups.entries()].sort((a,b)=>{
    const rank={Document:0,Page:1,Batch:2,Process:3,Scope:9};
    return (rank[a[0]]??5)-(rank[b[0]]??5)||a[0].localeCompare(b[0],undefined,{sensitivity:'base'});
  });
  const total=model.scopes.length;
  const body=ordered.map(([kind,items])=>{
    const open=items.some(s=>s.scopeId===selectedScopeId)||ordered.length<=4;
    const rows=items.slice(0,700).sort((a,b)=>text(a.name||a.scopeId).localeCompare(text(b.name||b.scopeId),undefined,{sensitivity:'base'})).map(scope=>{
      const selected=scope.scopeId===selectedScopeId;
      const count=Number(scope.structural||scope.rules||0)||model.nodes.filter(n=>n.scopeId===scope.scopeId).length;
      return `<button class="fweditor-tree-item ${selected?'selected':''}" type="button" data-scope="${esc(scope.scopeId)}" aria-current="${selected?'true':'false'}"><span class="fweditor-tree-glyph">${esc(kind.slice(0,1)||'S')}</span><span class="fweditor-tree-label"><b>${esc(scope.name||scope.scopeId)}</b><small>${esc(scope.scopeId)}${count?` - ${fmt(count)} rules`:''}</small></span>${Number(scope.warnings||0)?'<span class="fweditor-tree-warn">!</span>':''}</button>`;
    }).join('');
    const omitted=items.length>700?`<div class="fweditor-note">${fmt(items.length-700)} additional ${esc(kind)} scopes hidden; use command search.</div>`:'';
    return `<details class="fweditor-tree-folder nested" ${open?'open':''}><summary><span class="fweditor-folder-icon">+</span><b>${esc(kind)}</b><small>${fmt(items.length)}</small></summary><div class="fweditor-tree-children">${rows}${omitted}</div></details>`;
  }).join('');
  return `<div class="fweditor-fwd-tree-body" role="tree" aria-label="FW Editor Viewer navigation scopes"><details class="fweditor-tree-folder root" open><summary><span class="fweditor-folder-icon">+</span><b>FWD</b><small>${fmt(total)}</small></summary><div class="fweditor-tree-children">${body}</div></details></div>`;
}
function fweditorScopeMessageWindowHtml(scope=currentScope()){
  const stats=messageWindowStats(scope);
  const rows=filteredDiags().slice(0,18).map(d=>({sev:d.severity||'Info',object:d.nodeId?`Rule ${d.nodeId}`:scope.name||scope.scopeId,message:d.title||d.detail||d.Message||'Message'}));
  if(!rows.length)rows.push({sev:'Info',object:scope.name||scope.scopeId,message:'No diagnostics match the current scope filter.'});
  rows.push({sev:'Info',object:'Scope',message:`${fmt(stats.diags.length)} messages, ${fmt(stats.warningCount)} warnings, ${fmt(stats.missingRefs)} missing references.`});
  return `<section class="fweditor-load-status-window ${state.editorMessageExpanded?'expanded':''}" aria-label="Advanced diagnostics"><div class="fweditor-load-status-title"><span>Load Status</span><button class="fweditor-title-button" type="button" data-action="toggle-editor-message">${state.editorMessageExpanded?'Collapse':'Expand'}</button></div><table class="fweditor-load-status-table"><thead><tr><th>Sev</th><th>Object</th><th>Message</th></tr></thead><tbody>${rows.map(r=>`<tr><td><span class="sev ${lower(r.sev)}">${esc(r.sev)}</span></td><td>${esc(r.object)}</td><td>${esc(r.message)}</td></tr>`).join('')}</tbody></table></section>`;
}
function fweditorScopeConfigurationWindowHtml(activePage,title,bodyHtml,options={}){
  const scope=currentScope();
  const path=options.path||`FW Editor Viewer navigation \\ ${editorScopeKind(scope)} \\ ${scope.name||scope.scopeId} \\ ${title}`;
  const chips=list(options.chips).map((chip,index)=>`<span class="fweditor-state-chip ${index===0?'primary':''}">${esc(chip)}</span>`).join('');
  return `<section class="fweditor-config-window fweditor-scope-config-window" aria-label="FW Editor Viewer configuration view"><div class="fweditor-window-titlebar"><span>${esc(title)}</span><span class="fweditor-window-buttons"><i></i><i></i><i></i></span></div><div class="fweditor-config-toolbar"><span class="fweditor-breadcrumb">${esc(path)}</span>${chips}</div><div class="fweditor-config-body">${fweditorScopePageTabsHtml(activePage)}<div class="fweditor-active-page" role="tabpanel">${bodyHtml}</div></div></section>`;
}
function fweditorScopeRootHtml(activePage,title,bodyHtml,options={}){
  const scope=currentScope();
  const advancedMessages=isAdvancedMode()?`${fweditorMessageSplitterHtml()}${fweditorScopeMessageWindowHtml(scope)}`:'';
  return `<section class="${fweditorRootClass('fweditor-root fweditor-scope-root')}" style="${fweditorRootStyle()}" aria-label="FW Editor Viewer scope view">${fweditorMenuStripHtml()}${fweditorViewStripHtml(activePage)}<div class="fweditor-workarea fweditor-scope-workarea"><aside class="fweditor-fwd-tree-window" aria-label="FW Editor Viewer navigation"><div class="fweditor-pane-title">FWD Tree</div><div class="fweditor-tree-tools"><div class="fweditor-tree-count"><b>${fmt(model.scopes.length)}</b><span>Scopes</span></div><div class="fweditor-filter-note">Search filters the current Editor window.</div></div>${fweditorScopeTreeHtml(scope.scopeId)}</aside>${fweditorTreeSplitterHtml()}${fweditorScopeConfigurationWindowHtml(activePage,title,bodyHtml,options)}</div>${advancedMessages}</section>`;
}

function severityIsProblem(severity){return /warn|error|fatal/i.test(text(severity));}
function severityIsError(severity){return /error|fatal/i.test(text(severity));}
function messageWindowStats(scope=currentScope()){
  const diags=scopedDiags();
  const fieldSummary=getScopeFieldResolutionIndex(scope.scopeId).summary;
  const actionLists=scopedActionListStats();
  const unnamedActionLists=actionLists.indexOnly+actionLists.unnamed;
  const errorCount=diags.filter(d=>severityIsError(d.severity)).length;
  const warningCount=diags.filter(d=>severityIsProblem(d.severity)).length;
  const infoCount=diags.filter(d=>!severityIsProblem(d.severity)).length;
  const linkedCount=diags.filter(d=>!!d.nodeId).length;
  const missingRefs=fieldSummary.unresolved+unnamedActionLists;
  const validationCount=warningCount+missingRefs;
  return {diags,fieldSummary,actionLists,unnamedActionLists,errorCount,warningCount,infoCount,linkedCount,missingRefs,validationCount};
}
function diagMatchesMessageFilter(d,filter=state.messageFilter){
  if(!hasVisibleQuery(d))return false;
  const mode=normalizeMessageFilter(filter);
  const sev=text(d.severity);
  const blob=lower(`${d.title} ${d.detail} ${d.Message} ${d.scopeId}`);
  if(mode==='error')return severityIsError(sev);
  if(mode==='warning')return severityIsProblem(sev);
  if(mode==='info')return !severityIsProblem(sev);
  if(mode==='linked')return !!d.nodeId;
  if(mode==='rule-validation')return !!d.nodeId||severityIsProblem(sev)||/rule|action|status|validation/.test(blob);
  if(mode==='missing-refs')return /missing|unresolved|dangling|reference|field/.test(blob);
  return true;
}
function filteredDiags(){return scopedDiags().filter(d=>diagMatchesMessageFilter(d));}
function firstDiagnosticForFilter(filter=state.messageFilter){return scopedDiags().find(d=>diagMatchesMessageFilter(d,filter))||null;}
function messageFilterLabel(filter=state.messageFilter){
  const map={
    all:'All messages',
    error:'Errors',
    warning:'Warnings',
    info:'Info',
    'rule-validation':'Rule validation',
    'missing-refs':'Missing refs',
    linked:'Linked messages'
  };
  return map[normalizeMessageFilter(filter)]||map.all;
}
function diagnosticsTabHtml(mode,label,count){
  const active=state.messageFilter===mode;
  return `<button class="diagnostics-tab ${count?'has-count':''}" type="button" role="tab" data-action="message-filter-${esc(mode)}" aria-selected="${active?'true':'false'}"><span>${esc(label)}</span><b>${fmt(count)}</b></button>`;
}
function renderDiagnosticsDock(){
  const host=optionalElement('diagnosticsDock');
  if(!host)return;
  if(isEditorMode()||!isAdvancedMode()){host.innerHTML='';host.hidden=true;return;}
  host.hidden=false;
  if(!model||bootState.phase==='loading'){
    host.innerHTML='<div class="diagnostics-dock-empty">Loading messages.</div>';
    return;
  }
  const scope=currentScope();
  const stats=messageWindowStats(scope);
  const hydration=fwdHydrationSummary();
  const rows=filteredDiags();
  const messagePreview=rows.slice(0,3).map(d=>`<button class="diagnostics-message ${state.selectedId===d.id?'active':''}" type="button" data-diag="${esc(d.id)}"><span class="badge ${severityIsProblem(d.severity)?'amber':'blue'}">${esc(d.severity||'Info')}</span><span>${esc(d.title||'Message')}</span></button>`).join('');
  const missingRefsNote=state.messageFilter==='missing-refs'&&stats.missingRefs?`<button class="diagnostics-message active" type="button" data-action="view-field-resolution"><span class="badge amber">${fmt(stats.missingRefs)}</span><span>Open unresolved references</span></button>`:'';
  const messageBody=messagePreview||missingRefsNote||'<span class="diagnostics-note">No diagnostics match this filter.</span>';
  const tabs=[
    diagnosticsTabHtml('all','All',stats.diags.length),
    diagnosticsTabHtml('error','Errors',stats.errorCount),
    diagnosticsTabHtml('warning','Warnings',stats.warningCount),
    diagnosticsTabHtml('info','Info',stats.infoCount),
    diagnosticsTabHtml('linked','Linked',stats.linkedCount),
    diagnosticsTabHtml('rule-validation','Rule validation',stats.validationCount),
    diagnosticsTabHtml('missing-refs','Missing refs',stats.missingRefs)
  ].join('');
  host.innerHTML=`<div class="load-status-window-title"><b>Load Status</b><span>${esc(editorScopeKind(scope))} - ${esc(messageFilterLabel())}</span></div><div class="diagnostics-tabbar" role="tablist" aria-label="Message filters">${tabs}</div><div class="diagnostics-feed"><span class="diagnostics-scope">${esc(scope.name||scope.scopeId)}</span>${messageBody}<span class="diagnostics-note">${esc(hydration.label)}</span>${stats.warningCount?`<span class="diagnostics-warn">${fmt(stats.warningCount)} warning${stats.warningCount===1?'':'s'}</span>`:''}</div>`;
}
function bars(rows){if(!rows.length)return '<div class="muted">No values.</div>';const max=Math.max(...rows.map(r=>r.count),1);return `<div class="mini-list">${rows.slice(0,10).map(r=>`<div class="mini-row"><span class="mono">${esc(r.name)}</span><b>${fmt(r.count)}</b><div class="bar bar-span-all"><i style="--bar-w:${Math.max(3,r.count/max*100)}%"></i></div></div>`).join('')}</div>`;}
function topCounts(values){const m=new Map();values.map(text).filter(Boolean).forEach(v=>m.set(v,(m.get(v)||0)+1));return [...m].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));}
function childIds(id){return list(model.childrenByParent.get(String(id))).map(String);}
function edgeActionListKey(e){return [e?.routeState||'',e?.label||'',first(e?.ActionListIndex,e?.actionListIndex,'')].join('|');}
function actionListKey(parentId,g){return `${String(parentId)}::${g?.key||edgeActionListKey(g?.edge)||g?.label||'action'}`;}
function actionListKeyFromEdge(parentId,e){return `${String(parentId)}::${edgeActionListKey(e)}`;}
function childActionListGroups(id){return list(model.actionListGroupsByParent?.get(String(id)));}
function allActionListKeysForScope(scopeId=state.scopeId){return list(model.actionListKeysByScope?.get(scopeId));}
function collapseActionListsForNode(id){childActionListGroups(String(id)).forEach(g=>state.collapsedActionLists.add(actionListKey(String(id),g)));}
function collapsedActionListCountForScope(scopeId=state.scopeId){return allActionListKeysForScope(scopeId).filter(k=>state.collapsedActionLists.has(k)).length;}
function hasGroupedActionLists(id){return childActionListGroups(id).some(g=>g.childIds.length>0);}
function hasDiag(n){return list(model.diagsByNode?.get(String(n.id))).length>0;}
function hasActions(n){return hasGroupedActionLists(n.id);}
function passesTreeFilter(n){if(state.treeFilter==='disabled')return n.disabled!=='none';if(state.treeFilter==='inherited')return n.disabled==='inherited';if(state.treeFilter==='warnings')return hasDiag(n);if(state.treeFilter==='actions')return hasActions(n);if(state.treeFilter==='sections')return n.isSection;return true;}
function treeMatchCacheKey(){
  return [state.scopeId,text(state.query).trim().toLowerCase(),state.treeFilter||'all'].join('|');
}
function treeHasMatch(id,seen=new Set()){
  if(seen.has(id))return false;
  const cacheKey=treeMatchCacheKey();
  if(!model.treeMatchCache||model.treeMatchCache.key!==cacheKey)model.treeMatchCache={key:cacheKey,map:new Map()};
  if(model.treeMatchCache.map.has(String(id)))return model.treeMatchCache.map.get(String(id));
  seen.add(id);
  const n=model.nodesById.get(String(id));
  let result=false;
  if(n){
    result=(passesTreeFilter(n)&&hasVisibleQuery(n))||childIds(id).some(c=>treeHasMatch(c,seen));
  }
  model.treeMatchCache.map.set(String(id),result);
  return result;
}
function visibleRowsCacheKey(){
  const expandedSize=state.expanded?.size||0;
  const collapsedSize=state.collapsedActionLists?.size||0;
  const focus=state.focusNodeId||'';
  // Revision by size is intentionally cheap; explicit toggles also call renderContent immediately.
  return [state.scopeId,text(state.query).trim().toLowerCase(),state.treeFilter||'all',focus,expandedSize,collapsedSize].join('|');
}
function visibleStructureRows(){
  const cacheKey=visibleRowsCacheKey();
  if(model.visibleRowsCache&&model.visibleRowsCache.key===cacheKey)return model.visibleRowsCache.rows;
  const roots=state.focusNodeId?[String(state.focusNodeId)]:(model.rootsByScope.get(state.scopeId)||[]).map(String);
  const rows=[];
  const filtered=!!text(state.query).trim()||state.treeFilter!=='all';
  function walk(id,level){
    const n=model.nodesById.get(String(id));
    if(!n||n.scopeId!==state.scopeId)return;
    const include=filtered?treeHasMatch(id):true;
    const selfOk=passesTreeFilter(n)&&hasVisibleQuery(n);
    if(include)rows.push({type:'node',n,level,visible:selfOk||!filtered,context:filtered&&!selfOk});
    const expanded=filtered||state.expanded.has(id)||id===state.focusNodeId;
    if(!expanded)return;
    const groups=childActionListGroups(id).map(g=>({...g,childIds:g.childIds.filter(cid=>!filtered||treeHasMatch(cid))})).filter(g=>g.childIds.length>0);
    const groupedChildIds=new Set(groups.flatMap(g=>g.childIds));
    if(groups.length){
      groups.forEach(g=>{
        const key=actionListKey(id,g);
        const open=filtered||!state.collapsedActionLists.has(key);
        rows.push({type:'action-list',parent:n,group:g,key,open,level:level+1});
        if(open)g.childIds.forEach(c=>walk(c,level+2));
      });
      childIds(id).filter(c=>!groupedChildIds.has(String(c))).forEach(c=>{if(!filtered||treeHasMatch(c))walk(c,level+1);});
    }else{
      childIds(id).forEach(c=>walk(c,level+1));
    }
  }
  roots.forEach(r=>walk(r,0));
  model.visibleRowsCache={key:cacheKey,rows};
  return rows;
}
function visibleTreeNodes(){return visibleStructureRows().filter(r=>r.type==='node');}
function actionListChip(e){
  if(!e)return '<span class="action-list-chip root">root rule list</span>';
  if(e.kind==='RootListEntry'||e.label==='Root rule list'||e.routeState==='Root')return '<span class="action-list-chip root" title="Root rule-list entry">root rule list</span>';
  const cls=e.resolved?'resolved':'unresolved';
  const title=e.resolved?'Named status-result action list':'Indexed action list with no extracted action name';
  return `<span class="action-list-chip ${cls}" title="${esc(title)}"><span class="action-list-prefix">Action List</span> ${esc(e.label)}</span>`;
}
function filteredInventory(){return scopedInventory().filter(r=>{if(!hasVisibleQuery(r))return false;if(state.inventoryFilter==='StructuralMatch')return r.classification==='StructuralMatch';if((state.inventoryFilter==='FlatOnly'||state.inventoryFilter==='AdditionalRule'))return (r.classification==='FlatOnly'||r.classification==='AdditionalRule');if(state.inventoryFilter==='direct')return r.disabled==='direct';if(state.inventoryFilter==='inherited')return r.disabled==='inherited';return true;});}
function renderInventory(){const rows=filteredInventory();$('content').innerHTML=`<div class="notice"><div class="notice-icon">!</div><div><b>Additional Rules are readable/searchable but not placed.</b> Use Additional Rules for completeness; only Placed Rules link to confirmed Rule List hierarchy.</div></div><div class="table-list">${rows.slice(0,5000).map(r=>`<div class="data-row ${state.selectedId===r.id?'selected':''}" data-inventory="${esc(r.id)}"><div><div class="data-title">${esc(r.title)}</div><div class="data-sub">${esc(r.scopeId)} · ${esc(r.RuleGuid||r.RuleId||'no id')}</div></div><div class="mono">${esc(r.fn||'no function')}</div><div>${(r.classification==='FlatOnly'||r.classification==='AdditionalRule')?'<span class="badge amber">Additional Rule</span>':'<span class="badge green">Placed Rule</span>'}</div><div>${r.nodeId?'<span class="badge blue">Linked</span>':''}</div></div>`).join('')||emptyHtml('No inventory rows match','Adjust search or filter.')}</div>${rows.length>5000?'<div class="notice"><div class="notice-icon">i</div><div>Showing first 5,000 matching inventory rows for browser performance. Narrow the filter for full review.</div></div>':''}`;}
function messageFilterToolbarHtml(){
  const scope=currentScope();
  const stats=messageWindowStats(scope);
  const defs=[
    ['all','All',stats.diags.length],
    ['error','Errors',stats.errorCount],
    ['warning','Warnings',stats.warningCount],
    ['info','Info',stats.infoCount],
    ['linked','Linked',stats.linkedCount],
    ['rule-validation','Rule validation',stats.validationCount],
    ['missing-refs','Missing refs',stats.missingRefs]
  ];
  return `<div class="scope-kind-filter load-status-filter-toolbar" role="toolbar" aria-label="Message filters">${defs.map(([mode,label,count])=>`<button class="chip-btn ${state.messageFilter===mode?'active':''}" type="button" data-action="message-filter-${esc(mode)}">${esc(label)} <b>${fmt(count)}</b></button>`).join('')}</div>`;
}
function messageRowHtml(d){
  const linkedNode=d.nodeId?model.nodesById.get(String(d.nodeId)):null;
  const severityClass=severityIsError(d.severity)?'red':severityIsProblem(d.severity)?'amber':'blue';
  return `<button class="data-row message-row ${state.selectedType==='diag'&&state.selectedId===d.id?'selected':''}" type="button" data-diag="${esc(d.id)}"><div><div class="data-title">${esc(d.title||'Message')}</div><div class="data-sub">${esc(d.detail||d.Message||'No detail text extracted.')}</div></div><div><span class="badge ${severityClass}">${esc(d.severity||'Info')}</span></div><div>${linkedNode?`<span class="badge blue">Rule ${esc(linkedNode.id)}</span>`:'<span class="badge">Scope</span>'}</div><div>${linkedNode?`<span class="mono">${esc(linkedNode.fn||linkedNode.title||'linked')}</span>`:''}</div></button>`;
}
function domainRowsByView(view){
  const fwd=model.fwd;
  if(fwd&&view==='resources'){
    const buckets=list(fwd.resources?.buckets);
    return buckets.map(b=>({name:`${text(b.type)}: ${fmt(list(b.names).length)} items`,count:list(b.names).length}));
  }
  if(fwd&&view==='functions'){
    const items=list(fwd.functions?.items);
    if(items.length)return items.map(f=>({name:text(f.name),count:Number(first(f.observedRuleCount,f.relationshipCount,0))||0}));
  }
  if(fwd&&view==='drivers'){
    const items=list(fwd.processDrivers?.items);
    if(items.length)return items.map(p=>({name:`${text(p.processName)} (${fmt(first(p.findingCount,0))} findings)`,count:Number(first(p.findingCount,0))||0}));
    const processItems=list(fwd.processes?.items);
    if(processItems.length)return processItems.map(p=>({name:`${text(p.name)} (process node)`,count:1}));
  }
  if(fwd&&view==='tables'){
    const selectionItems=list(fwd.selectionLists?.items);
    if(selectionItems.length)return selectionItems.map(t=>({name:text(t.name),count:Number(first(list(t.usageLinks).length,list(t.matchFields).length+list(t.plugFields).length,0))||0}));
    const tableItems=list(fwd.tables?.items);
    if(tableItems.length)return tableItems.map(t=>({name:text(t.name),count:Number(first(t.referenceCount,t.ruleCount,0))||0}));
  }
  if(fwd&&view==='udfs'){
    const items=list(fwd.canonicalUdfs?.items).length?list(fwd.canonicalUdfs?.items):list(fwd.udfs?.items);
    if(items.length)return items.map(u=>{
      const type=text(u.resourceType);
      const name=text(u.name);
      const label=/^function$/i.test(type)?name:`${type}: ${name}`;
      return {name:label,count:Number(first(u.usedByRuleCount,0))||0};
    });
  }
  const rels=list(model.rels);
  if(view==='resources'){
    const rows=rels.filter(r=>{
      const t=lower(r.targetType),k=lower(r.kind),target=lower(r.target);
      if(t==='field'||t==='rule')return false;
      return /source|option|parameter|attribute|reject/.test(t)||/source|option|parameter|attribute|reject/.test(k)||/resource|fileref|inventory/.test(target);
    });
    return topCounts(rows.map(r=>`${r.targetType||'Resource'}: ${r.target||'(empty)'}`)).map(x=>({name:x.name,count:x.count}));
  }
  if(view==='functions'){
    const allFns=[...list(model.nodes).map(n=>n.fn),...list(model.inventory).map(r=>r.fn)].map(text).filter(Boolean);
    return topCounts(allFns).map(x=>({name:x.name,count:x.count}));
  }
  if(view==='tables'){
    const rows=rels.filter(r=>/table|indexed|lookup|db|database/i.test(`${r.targetType} ${r.kind} ${r.target}`));
    return topCounts(rows.map(r=>r.target||'(empty table target)')).map(x=>({name:x.name,count:x.count}));
  }
  if(view==='drivers'){
    const rows=rels.filter(r=>/driver|twain|scan|ocr|fip|store|output|input/i.test(`${r.targetType} ${r.kind} ${r.target}`));
    return topCounts(rows.map(r=>`${r.kind||'Uses'} -> ${r.target||'(empty driver target)'}`)).map(x=>({name:x.name,count:x.count}));
  }
  const allFns=[...list(model.nodes).map(n=>n.fn),...list(model.inventory).map(r=>r.fn)].map(text).filter(Boolean);
  const udfFns=allFns.filter(f=>/udf|user.?defined|custom/i.test(f));
  return topCounts(udfFns).map(x=>({name:x.name,count:x.count}));
}

function usageRowsForDefinition(matches){
  const rows=[];
  const seen=new Set();
  list(model.rels).forEach(r=>{
    if(!matches(r))return;
    const node=r.nodeId?model.nodesById.get(String(r.nodeId)):null;
    const key=[r.id,node?.id||'',r.scopeId,r.kind,r.targetType,r.target].join('|');
    if(seen.has(key))return;
    seen.add(key);
    rows.push({rel:r,node,scopeId:text(r.scopeId||node?.scopeId||'Unscoped'),ruleName:text(r.RuleName||r.SourceRuleName||node?.title||r.target||'Reference'),functionName:text(r.fn||r.FunctionName||node?.fn||''),target:text(r.target||''),targetType:text(r.targetType||''),relationshipKind:text(r.kind||''),matchLevel:text(first(r.matchLevel,r.confidence)||'')});
  });
  return rows.sort((a,b)=>a.scopeId.localeCompare(b.scopeId,undefined,{sensitivity:'base'})||a.ruleName.localeCompare(b.ruleName,undefined,{sensitivity:'base'}));
}
function resourceNameFromItem(item){return typeof item==='string'?item:text(first(item?.name,item?.Name,item?.value,item?.Value,''));}
function buildGlobalResourceDefinitions(){
  const buckets=list(model.fwd?.resources?.buckets);
  if(buckets.length){
    const names=new Set();
    buckets.forEach(b=>list(b.names).forEach(item=>{const n=resourceNameFromItem(item).toLowerCase();if(n)names.add(n);}));
    const usageByTarget=new Map();
    usageRowsForDefinition(r=>names.has(text(r.target).toLowerCase())).forEach(row=>{
      const key=row.target.toLowerCase();
      if(!usageByTarget.has(key))usageByTarget.set(key,[]);
      usageByTarget.get(key).push(row);
    });
    return buckets.flatMap(bucket=>{
      const type=text(bucket.type||'Resource');
      return list(bucket.names).map(item=>{
        const name=resourceNameFromItem(item);
        const usage=usageByTarget.get(name.toLowerCase())||[];
        return {key:`${type}|${name}`,name,type,source:'FWD resource',defined:true,metric:Number(first(item?.usedByRuleCount,item?.count,usage.length,0))||usage.length,usage,details:first(item?.details,item?.Details,null)};
      }).filter(r=>r.name);
    }).sort((a,b)=>a.type.localeCompare(b.type,undefined,{sensitivity:'base'})||a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
  }
  return domainRowsByView('resources').map(r=>({key:text(r.name),name:text(r.name),type:'Resource reference',source:'Relationship reference',defined:false,metric:Number(first(r.count,0))||0,usage:[],details:null}));
}
function objectGraphNodesForResource(row){
  const graph=model.fwd?.objectGraph||model.fwd?.editorModel?.objectGraph||{};
  const nodes=list(graph.nodes);
  const resourceName=text(row?.name||'').trim();
  const resourceType=text(row?.type||'').trim();
  if(!resourceName)return [];
  return nodes.filter(n=>{
    const meta=n.metadata||{};
    const nodeName=text(n.name||'').trim();
    const metaName=text(meta.resourceName||'').trim();
    const metaType=text(meta.resourceType||'').trim();
    return (nodeName.toLowerCase()===resourceName.toLowerCase()&&(!resourceType||!metaType||metaType.toLowerCase()===resourceType.toLowerCase()))
      || metaName.toLowerCase()===resourceName.toLowerCase();
  });
}
function objectGraphPreviewHtml(row){
  if(!isAdvancedMode())return '';
  const graph=model.fwd?.objectGraph||model.fwd?.editorModel?.objectGraph||{};
  const nodes=objectGraphNodesForResource(row);
  const privateNodes=nodes.filter(n=>text(n.kind)==='ResourcePrivateNode');
  if(!list(graph.nodes).length)return '';
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Object Graph</h4><p>Canonical FWD object graph nodes and private resource children linked to this definition.</p></div><span class="badge blue">${fmt(nodes.length)} nodes</span></div>${nodes.length?`<div class="mini-list">${nodes.slice(0,10).map(n=>`<div class="mini-row"><span><b>${esc(text(n.kind||'Object'))}</b> ${esc(text(n.name||n.id||''))}</span><span class="mono">${esc(text(first(n.metadata?.path,n.id,'')))}</span></div>`).join('')}</div>${privateNodes.length?`<div class="caption mt-8">${fmt(privateNodes.length)} private resource node(s) exposed for drill-through.</div>`:''}`:'<div class="global-empty-state compact">No object graph node is linked to this resource name.</div>'}</section>`;
}

function objectGraphPacket(){
  return model.fwd?.objectGraph||model.fwd?.editorModel?.objectGraph||{};
}
function objectGraphEdgeEndpoint(edge,names){
  for(const name of names){
    const value=text(first(edge?.[name],edge?.[name.charAt(0).toUpperCase()+name.slice(1)],''));
    if(value)return value;
  }
  return '';
}
function objectGraphEdgesForNode(nodeId){
  const id=text(nodeId);
  return list(objectGraphPacket().edges).filter(edge=>{
    const from=objectGraphEdgeEndpoint(edge,['from','fromId','source','sourceId','parent','parentId']);
    const to=objectGraphEdgeEndpoint(edge,['to','toId','target','targetId','child','childId']);
    return from===id||to===id;
  });
}
function usageRowsForObjectGraphNode(node){
  const meta=node?.metadata||{};
  const resourceName=text(first(meta.resourceName,node?.name,'')).trim().toLowerCase();
  const scopeId=text(first(meta.scopeId,meta.scopePath,'')).trim();
  if(scopeId){
    return model.nodes
      .filter(n=>n.scopeId===scopeId&&n.isRule)
      .slice(0,160)
      .map(n=>({scopeId:n.scopeId,ruleName:n.title,functionName:n.fn,node:n,target:text(node.name),targetType:text(node.kind),relationshipKind:'RuleList member'}));
  }
  if(resourceName){
    return usageRowsForDefinition(r=>text(r.target).trim().toLowerCase()===resourceName).slice(0,160);
  }
  return [];
}
function buildObjectGraphDefinitions(){
  if(!isAdvancedMode())return [];
  const graph=objectGraphPacket();
  const nodes=list(graph.nodes);
  return nodes.map((node,index)=>{
    const key=text(first(node.id,node.nodeId,`object-${index}`));
    const edges=objectGraphEdgesForNode(key);
    const meta=node.metadata||{};
    const path=text(first(meta.path,meta.resourceName,meta.scopeId,''));
    return {
      key,
      name:text(first(node.name,key,`Object ${index+1}`)),
      type:text(first(node.kind,'Object')),
      source:text(first(node.source,'ObjectGraph')),
      defined:true,
      metric:edges.length,
      usage:usageRowsForObjectGraphNode(node),
      node,
      edges,
      searchBlob:[key,node.name,node.kind,node.source,path,JSON.stringify(meta)].join(' ')
    };
  }).sort((a,b)=>a.type.localeCompare(b.type,undefined,{sensitivity:'base'})||a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
}
function objectGraphDetailHtml(row){
  const node=row.node||{};
  const meta=node.metadata||{};
  const facts=[
    ['Kind',esc(row.type||'Object')],
    ['Source',esc(row.source||'ObjectGraph')],
    ['Confidence',esc(text(first(node.confidence,'Medium')))],
    ['Edges',fmt(list(row.edges).length)],
    ['Usage rows',fmt(list(row.usage).length)],
    ['Handle',esc(row.key)]
  ];
  const edgeRows=list(row.edges).slice(0,80).map(edge=>{
    const from=objectGraphEdgeEndpoint(edge,['from','fromId','source','sourceId','parent','parentId']);
    const to=objectGraphEdgeEndpoint(edge,['to','toId','target','targetId','child','childId']);
    const label=text(first(edge.kind,edge.label,edge.relationship,'edge'));
    return `<div class="mini-row"><span><b>${esc(label)}</b> ${esc(from)} -> ${esc(to)}</span><span class="mono">${esc(text(first(edge.source,'')))}</span></div>`;
  }).join('');
  const metadata=Object.keys(meta).length?`<div class="table-columns-head">Typed handle metadata</div>${previewJsonHtml(meta,{maxDepth:3,maxArray:30,maxKeys:60,maxChars:9000})}`:'';
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Object Node</h4><p>Canonical FWD object graph identity and typed source handle.</p></div><span class="badge blue">${esc(row.type||'Object')}</span></div><div class="kv">${facts.map(([k,v])=>kv(k,v)).join('')}</div></section>${edgeRows?`<section class="udf-section-card"><div class="udf-section-head"><div><h4>Graph Edges</h4><p>Incoming and outgoing graph links for this node.</p></div><span class="badge blue">${fmt(list(row.edges).length)} edges</span></div><div class="mini-list">${edgeRows}</div></section>`:''}${metadata}<div class="table-columns-head">Usage preview</div>${usagePreviewHtml(row.usage)}<div class="table-columns-head">Raw node</div>${previewJsonHtml(node,{maxDepth:4,maxArray:50,maxKeys:80,maxChars:16000})}`;
}
function renderObjectGraphDefinitions(){
  if(!isAdvancedMode())return;
  renderGlobalDefinitionExplorer('object-graph',buildObjectGraphDefinitions(),state.selectedObjectGraphKey,'selectedObjectGraphKey',{title:'Object Graph',body:'Canonical FWD object nodes, resource-private descendants, typed handles, and object references.',emptyTitle:'No object graph nodes found',emptyBody:'No object graph packet was loaded.'},objectGraphDetailHtml);
}

function buildRuleListPacketDefinitions(){
  if(ruleListPacketDefinitionsCache)return ruleListPacketDefinitionsCache;
  const packetItems=list(model.fwd?.ruleLists?.items);
  const byScope=new Map(model.scopes.map(scope=>[scope.scopeId,scope]));
  packetItems.forEach(item=>{
    const scopeId=text(first(item.scopeId,item.ScopeId,item.path,item.name,''));
    if(scopeId&&!byScope.has(scopeId))byScope.set(scopeId,{scopeId,name:text(first(item.name,scopeId)),kind:text(first(item.kind,'RuleList')),structural:0,warnings:0});
  });
  const result=[...byScope.values()].map(scope=>{
    const nodes=list(model.nodesByScope?.get(scope.scopeId));
    const ruleNodes=list(model.ruleNodesByScope?.get(scope.scopeId));
    const actionLists=nodes.flatMap(n=>childActionListGroups(n.id).map(group=>({parent:n,group})));
    const statuses=[...new Set(nodes.flatMap(n=>actionNamesOf(n).map(text).filter(Boolean)))].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
    const usage=ruleNodes.slice(0,200).map(n=>({scopeId:n.scopeId,ruleName:n.title,functionName:n.fn,node:n,target:scope.scopeId,targetType:'RuleList',relationshipKind:'ContainsRule'}));
    return {
      key:scope.scopeId,
      name:text(scope.name||scope.scopeId),
      type:text(scope.kind||'RuleList'),
      source:'RuleList packet',
      defined:true,
      metric:ruleNodes.length,
      usage,
      ruleList:{scopeId:scope.scopeId,name:scope.name,kind:scope.kind,ruleCount:ruleNodes.length,actionListCount:actionLists.length,statusResults:statuses,actionLists,nodes}
    };
  }).sort((a,b)=>a.type.localeCompare(b.type,undefined,{sensitivity:'base'})||a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
  ruleListPacketDefinitionsCache=result;
  return result;
}
function ruleListPacketDetailHtml(row){
  const packet=row.ruleList||{};
  const statuses=list(packet.statusResults);
  const actionLists=list(packet.actionLists);
  const openScope=`<button class="btn" type="button" data-scope="${esc(packet.scopeId||row.key)}">Open Rule Tree</button>`;
  const facts=[
    ['Scope id',esc(packet.scopeId||row.key)],
    ['Kind',esc(packet.kind||row.type||'RuleList')],
    ['Rules',fmt(packet.ruleCount||0)],
    ['Status Results',fmt(statuses.length)],
    ['Action Lists',fmt(packet.actionListCount||0)],
    ['Source',esc(row.source)]
  ];
  const actionListRows=actionLists.slice(0,80).map(({parent,group})=>`<div class="mini-row"><span><b>${esc(group.label||'Unnamed Action List')}</b> ${esc(parent.title||'Parent rule')}</span><span class="badge blue">${fmt(list(group.childIds).length)} child rules</span></div>`).join('');
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Rule List Packet</h4><p>Snapshot-wide Rule List identity with Status Result and Action List rollups.</p></div>${openScope}</div><div class="kv">${facts.map(([k,v])=>kv(k,v)).join('')}</div></section><section class="udf-section-card"><div class="udf-section-head"><div><h4>Status Results</h4><p>Unique configured status result names inside this Rule List scope.</p></div><span class="badge blue">${fmt(statuses.length)} statuses</span></div>${functionTokenStripHtml(statuses,'amber','No Status Result names were extracted for this Rule List.')}</section>${actionListRows?`<section class="udf-section-card"><div class="udf-section-head"><div><h4>Action Lists</h4><p>Nested Action List groups resolved from parent rule status results.</p></div><span class="badge blue">${fmt(actionLists.length)} action lists</span></div><div class="mini-list">${actionListRows}</div></section>`:''}<div class="table-columns-head">Rule preview</div>${usagePreviewHtml(row.usage)}<div class="table-columns-head">Raw packet</div>${previewJsonHtml(packet,{maxDepth:3,maxArray:60,maxKeys:80,maxChars:16000})}`;
}
function buildGlobalDriverDefinitions(){
  const items=list(model.fwd?.processDrivers?.items);
  if(items.length){
    return items.map(item=>{
      const name=text(item.processName||item.name||'Process driver');
      const findings=list(item.findings).map((f,i)=>({scopeId:text(f.path||f.Path||name),ruleName:text(f.name||f.Name||`Finding ${i+1}`),functionName:'',target:text(first(f.valuePreview,f.dataPreview,'')),targetType:text(item.classification||'DriverLikePrivateNode'),relationshipKind:text(f.source||item.source||''),matchLevel:text(f.matchLevel||'Medium'),node:null,rel:f}));
      const usage=usageRowsForDefinition(r=>/driver|twain|scan|ocr|fip|store|output|input/i.test(`${r.targetType} ${r.kind} ${r.target}`)&&lower(`${r.target} ${r.kind} ${r.targetType}`).includes(name.toLowerCase()));
      return {key:name,name,type:text(item.classification||'Process driver'),source:text(item.source||'FWD process config'),defined:true,metric:Number(first(item.findingCount,findings.length,usage.length,0))||0,usage:[...findings,...usage],details:item};
    }).sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
  }
  return domainRowsByView('drivers').map(r=>({key:text(r.name),name:text(r.name),type:'Driver reference',source:'Relationship reference',defined:false,metric:Number(first(r.count,0))||0,usage:[],details:null}));
}
function tableUsageIndex(tableNames){
  const known=new Set(tableNames.map(x=>text(x).toLowerCase()).filter(Boolean));
  const byTarget=new Map();
  usageRowsForDefinition(r=>known.has(text(r.target).toLowerCase())||/table|indexed|lookup|db|database/i.test(`${r.targetType} ${r.kind} ${r.target}`)).forEach(row=>{
    const key=row.target.toLowerCase();
    if(!key)return;
    if(!byTarget.has(key))byTarget.set(key,[]);
    byTarget.get(key).push(row);
  });
  return byTarget;
}
function globalHeroHtml(copy,metrics){
  return `<div class="global-hero"><div><div class="tree-detail-kicker">GLOBAL DEFINITIONS</div><h3>${esc(copy.title)}</h3><p>${esc(copy.body)}</p></div><div class="global-hero-metrics">${metrics.map(m=>`<div><b>${fmt(m.value)}</b><span>${esc(m.label)}</span></div>`).join('')}</div></div>`;
}
function summaryTilesHtml(items){
  return `<div class="global-summary-tiles">${items.map(x=>`<div class="global-summary-tile ${x.tone||''}"><span>${esc(x.label)}</span><b>${x.value}</b></div>`).join('')}</div>`;
}
function definitionListHtml(kind,rows,selectedKey){
  const metricLabel=kind==='udfs'?'caller rules':kind==='functions'?'observed rules':kind==='selection-lists'?'fields':kind==='tables'?'rule refs':kind==='rule-lists'?'rules':kind==='object-graph'?'edges':kind==='runtime-impact'?'signals':'rule refs';
  const listLabel=kind==='udfs'?'UDFs':kind==='functions'?'Functions':kind==='selection-lists'?'SelectionLists':kind==='tables'?'Tables':kind==='rule-lists'?'Rule Lists':kind==='object-graph'?'Object Graph':kind==='runtime-impact'?'Runtime Impact':kind==='drivers'?'Drivers':'Definitions';
  return `<div class="global-list-head"><span>${esc(listLabel)}</span><b>${fmt(rows.length)}</b></div><div class="table-index-list global-def-list">${rows.slice(0,800).map(row=>{
    const referenceLabel=kind==='udfs'?'Reference-only':kind==='functions'?'Observed':'Referenced';
    const exceptionBadge=row.defined?'':`<span class="badge amber">${esc(referenceLabel)}</span>`;
    const metric=fmt(list(row.usage).length||row.metric);
    return `<button class="table-index-row ${row.key===selectedKey?'active':''}" type="button" data-global-kind="${esc(kind)}" data-global-key="${esc(row.key)}"><span class="table-index-main"><b>${esc(row.name)}</b><span>${esc(row.type)} · ${metric} ${metricLabel}</span></span><span class="table-index-side">${exceptionBadge}</span></button>`;
  }).join('')}</div>`;
}

let globalDefinitionLookupCache=null;
let globalTableDefinitionsCache=null;
let globalUdfDefinitionsCache=null;
let globalFunctionDefinitionsCache=null;
let globalNavigationCountsCache=null;
let productCountsCache=null;
let ruleListPacketDefinitionsCache=null;
function definitionLookupKey(value){return lower(text(value).trim());}
function addDefinitionLookup(lookup,kind,key,label,aliases=[]){
  const resolvedKey=text(key||label).trim();
  const resolvedLabel=text(label||key).trim();
  if(!resolvedKey||!resolvedLabel)return;
  const bucket=lookup[kind];
  if(!bucket)return;
  [resolvedKey,resolvedLabel,...list(aliases)].map(text).map(x=>x.trim()).filter(Boolean).forEach(alias=>{
    const normalized=definitionLookupKey(alias);
    if(normalized&&!bucket.has(normalized))bucket.set(normalized,{kind,key:resolvedKey,label:resolvedLabel});
  });
}
function globalDefinitionLookup(){
  if(globalDefinitionLookupCache)return globalDefinitionLookupCache;
  const lookup={resources:new Map(),functions:new Map(),tables:new Map(),drivers:new Map(),udfs:new Map(),'selection-lists':new Map(),'rule-lists':new Map(),'object-graph':new Map(),'runtime-impact':new Map()};
  try{buildGlobalResourceDefinitions().forEach(r=>addDefinitionLookup(lookup,'resources',r.key,r.name,[r.type]));}catch{}
  try{buildGlobalFunctionDefinitions().forEach(r=>addDefinitionLookup(lookup,'functions',r.key,r.name,[r.fn?.name,r.fn?.displayName]));}catch{}
  try{buildSelectionListPacketDefinitions().forEach(r=>addDefinitionLookup(lookup,'selection-lists',r.key,r.name,[r.type,r.selectionList?.resourceType,r.selectionList?.tableDriver]));}catch{}
  try{buildGlobalTableDefinitions().forEach(r=>addDefinitionLookup(lookup,'tables',r.name,r.name,[r.raw?.name,r.raw?.Name,r.resourceType]));}catch{}
  try{buildRuleListPacketDefinitions().forEach(r=>addDefinitionLookup(lookup,'rule-lists',r.key,r.name,[r.type,r.ruleList?.scopeId,r.ruleList?.kind]));}catch{}
  if(isAdvancedMode()){
    try{buildObjectGraphDefinitions().forEach(r=>addDefinitionLookup(lookup,'object-graph',r.key,r.name,[r.type,r.node?.metadata?.path,r.node?.metadata?.resourceName,r.node?.metadata?.scopeId]));}catch{}
    try{buildRuntimeImpactDefinitions().forEach(r=>addDefinitionLookup(lookup,'runtime-impact',r.key,r.name,[r.type,r.impact?.scopeId,r.impact?.ruleGuid,r.impact?.ruleName,r.impact?.functionName]));}catch{}
  }
  try{buildGlobalDriverDefinitions().forEach(r=>addDefinitionLookup(lookup,'drivers',r.key,r.name,[r.type]));}catch{}
  try{buildUdfDefinitions().forEach(u=>addDefinitionLookup(lookup,'udfs',u.key,u.displayName||u.rawName||u.key,[u.rawName,u.displayName,...list(u.rules)]));}catch{}
  globalDefinitionLookupCache=lookup;
  return lookup;
}
function definitionKindPriority(hint=''){
  const h=lower(hint);
  if(/runtime|impact|operator/.test(h))return visibleDefinitionPriority(['runtime-impact','functions','rule-lists','selection-lists','tables','resources','udfs','drivers','object-graph']);
  if(/udf|user.?defined/.test(h))return visibleDefinitionPriority(['udfs','functions','runtime-impact','resources','selection-lists','tables','drivers','rule-lists','object-graph']);
  if(/table|selection.?list|lookup|database|\bdb\b/.test(h))return visibleDefinitionPriority(['selection-lists','tables','resources','functions','udfs','runtime-impact','drivers','object-graph','rule-lists']);
  if(/rule.?list|status.?result|action.?list/.test(h))return visibleDefinitionPriority(['rule-lists','runtime-impact','functions','udfs','resources','object-graph','selection-lists','tables','drivers']);
  if(/object.?graph|handle|node/.test(h))return visibleDefinitionPriority(['object-graph','resources','rule-lists','selection-lists','tables','drivers','functions','udfs','runtime-impact']);
  if(/driver|process|input|output|twain|scan|ocr/.test(h))return visibleDefinitionPriority(['drivers','resources','object-graph','functions','selection-lists','tables','udfs','rule-lists','runtime-impact']);
  if(/resource|source/.test(h))return visibleDefinitionPriority(['resources','object-graph','selection-lists','tables','drivers','functions','udfs','rule-lists','runtime-impact']);
  if(/function|rule/.test(h))return visibleDefinitionPriority(['udfs','functions','runtime-impact','rule-lists','resources','selection-lists','tables','drivers','object-graph']);
  return visibleDefinitionPriority(['selection-lists','udfs','tables','functions','resources','rule-lists','object-graph','drivers','runtime-impact']);
}
function candidateDefinitionNames(value){
  const raw=text(value).trim();
  if(!raw)return [];
  const parts=[raw];
  if(raw.includes(':'))parts.push(raw.split(':').slice(1).join(':').trim());
  if(raw.includes('|'))parts.push(raw.split('|').pop().trim());
  return [...new Set(parts.map(x=>x.trim()).filter(Boolean))];
}
function resolveDefinitionNav(value,hint=''){
  const values=candidateDefinitionNames(value);
  if(!values.length)return null;
  const generic=new Set(['table','tables','selectionlist','selection list','source','sources','field','fields','rule','rules','rulelist','rule list','status','status result','action','action list','object','object graph','node','handle','impact','runtime impact','option','options','parameter','parameters','function','functions','udf','udfs']);
  const lookup=globalDefinitionLookup();
  for(const value of values){
    const priority=definitionKindPriority(`${hint} ${value}`);
    const normalized=definitionLookupKey(value);
    if(!normalized)continue;
    if(generic.has(normalized)&&!/udf|table|selection.?list|function|resource|driver|rule.?list|status.?result|action.?list|object.?graph|runtime|impact/i.test(hint))continue;
    for(const kind of priority){
      const match=lookup[kind]?.get(normalized);
      if(match)return match;
    }
  }
  return null;
}
function definitionButtonHtml(match,label,extraClass=''){
  if(!match)return `<span class="${esc(extraClass)}">${esc(label)}</span>`;
  const kindLabel=match.kind==='udfs'?'UDF':match.kind==='tables'?'table':match.kind==='functions'?'function':match.kind==='resources'?'resource':match.kind==='selection-lists'?'SelectionList':match.kind==='rule-lists'?'Rule List':match.kind==='object-graph'?'object graph node':match.kind==='runtime-impact'?'runtime impact':'definition';
  return `<button class="definition-link ${esc(extraClass)}" type="button" data-def-kind="${esc(match.kind)}" data-def-key="${esc(match.key)}" title="Open ${esc(kindLabel)} definition: ${esc(match.label)}">${esc(label||match.label)}<span aria-hidden="true">↗</span></button>`;
}
function linkedDefinitionHtml(value,hint='',extraClass=''){
  const label=text(value).trim();
  if(!label)return '';
  return definitionButtonHtml(resolveDefinitionNav(label,hint),label,extraClass);
}
function relationshipTargetHtml(r){
  const hint=[r?.targetType,r?.kind,r?.ParameterRole,r?.FunctionName].map(text).join(' ');
  const label=text(r?.target||r?.Target||'');
  return linkedDefinitionHtml(label,hint,'reference-target-link')||esc(label);
}
function openGlobalDefinition(kind,key){
  const normalizedKind=text(kind);
  const normalizedKey=text(key);
  if(!normalizedKind||!normalizedKey)return false;
  if(!globalWorkspaceViews().includes(normalizedKind))return false;
  state.workspaceView=normalizedKind;
  if(normalizedKind==='resources')state.selectedResourceKey=normalizedKey;
  else if(normalizedKind==='functions')state.selectedFunctionName=normalizedKey;
  else if(normalizedKind==='selection-lists')state.selectedSelectionListName=normalizedKey;
  else if(normalizedKind==='drivers')state.selectedDriverKey=normalizedKey;
  else if(normalizedKind==='tables')state.selectedTableName=normalizedKey;
  else if(normalizedKind==='udfs')state.selectedUdfName=normalizedKey;
  else if(normalizedKind==='rule-lists')state.selectedRuleListKey=normalizedKey;
  else if(normalizedKind==='object-graph')state.selectedObjectGraphKey=normalizedKey;
  else if(normalizedKind==='runtime-impact')state.selectedRuntimeImpactKey=normalizedKey;
  state.selectedType='scope';
  state.selectedId='';
  document.body.classList.remove('inspector-open');
  renderAll();
  return true;
}
function usagePreviewHtml(rows){
  const usage=list(rows);
  if(!usage.length)return '<div class="global-empty-state">No rule references are mapped for this definition in the current FWD snapshot.</div>';
  return `<div class="global-usage-preview">${usage.slice(0,8).map(row=>{
    const scopeId=text(row.scopeId||row.node?.scopeId||'');
    const nodeId=text(row.node?.id||'');
    const openButton=nodeId
      ? `<button class="btn ghost" type="button" data-node="${esc(nodeId)}" data-node-scope="${esc(scopeId)}" title="Open this rule and show its configuration">Open FW Editor details</button>`
      : '<span class="badge amber">Unlinked</span>';
    const context=linkedDefinitionHtml(row.target,[row.targetType,row.relationshipKind,row.functionName].join(' '),'usage-target-link');
    return `<div class="global-usage-mini"><div><b>${esc(row.ruleName)}</b><span>${esc(scopeId)} · ${esc(row.functionName||row.relationshipKind||row.targetType||'Reference')}</span>${context?`<small>${context}</small>`:''}</div>${openButton}</div>`;
  }).join('')}</div>${usage.length>8?`<div class="caption mt-8">${fmt(usage.length-8)} more row(s) in Definition details.</div>`:''}`;
}
function genericParamSlotIndex(name){
  const m=text(name).trim().match(/^_?ParamList(?:OMRIndex)?(\d+)$/i);
  return m?Number(m[1]):null;
}
function isGenericParamSlotName(name){ return genericParamSlotIndex(name)!==null; }
function realUdfParameterNames(names){
  return list(names).map(text).map(x=>x.trim()).filter(Boolean).filter(x=>!isGenericParamSlotName(x));
}
function effectiveUdfParameterNames(u){
  const explicit=realUdfParameterNames(u?.parameterNames);
  if(explicit.length)return explicit;
  return list(u?.parameterNames).map(text).filter(Boolean);
}
function displayUdfParameterName(rawName,interfaceNames){
  const key=text(rawName).trim();
  const idx=genericParamSlotIndex(key);
  if(idx!==null){
    const mapped=text(list(interfaceNames)[idx]||'').trim();
    if(mapped && !isGenericParamSlotName(mapped)) return mapped;
    return `Field List ${idx+1}`;
  }
  return key;
}
function callerParameterEntries(parameters,interfaceNames){
  return Object.entries(parameters||{}).map(([name,raw])=>({
    rawName:text(name).trim(),
    displayName:displayUdfParameterName(name,interfaceNames),
    values:list(raw).map(text).filter(Boolean)
  })).filter(x=>x.rawName);
}
function parameterMatrixHtml(callers,interfaceNames=[]){
  const byName=new Map();
  list(callers).forEach(c=>callerParameterEntries(c.parameters,interfaceNames).forEach(entry=>{
    const key=entry.displayName;if(!key)return;
    if(!byName.has(key))byName.set(key,{name:key,rawNames:new Set(),values:new Map(),callers:new Set()});
    const row=byName.get(key);row.callers.add(text(c.nodeId||c.ruleName));row.rawNames.add(entry.rawName);
    entry.values.forEach(v=>{const value=text(v);row.values.set(value,(row.values.get(value)||0)+1);});
  }));
  const rows=[...byName.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
  if(!rows.length)return '<div class="global-empty-state">No caller parameters were extracted.</div>';
  return `<div class="global-param-matrix">${rows.map(row=>{
    const raw=[...row.rawNames].filter(x=>x!==row.name).join(', ');
    const rawHint=raw?`<small class="udf-param-raw">FWD slot: ${esc(raw)}</small>`:'';
    return `<div class="global-param-card"><b>${esc(row.name)}</b>${rawHint}<span>${fmt(row.callers.size)} caller rule(s)</span><div>${[...row.values.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([v,c])=>`<span class="badge blue" title="${esc(v)}">${esc(v||'(blank)')} ${fmt(c)}</span>`).join('')}</div></div>`;
  }).join('')}</div>`;
}
function udfFilterCounts(rows){
  const all=list(rows);
  return {
    all:all.length,
    'with-callers':all.filter(r=>list(r.callerRules).length>0||list(r.rules).length>0).length,
    defined:all.filter(r=>!!r.defined).length,
    unparsed:all.filter(r=>r.definitionParsed===false||list(r.messages).length>0).length,
    'usage-only':all.filter(r=>!r.defined&&list(r.rules).length>0).length
  };
}
function udfFilterBarHtml(allRows=null){
  const counts=allRows?udfFilterCounts(allRows):null;
  return `<div class="udf-filter-strip udf-filter-strip-polished" role="group" aria-label="UDF filters">${['all','with-callers','defined','unparsed','usage-only'].map(f=>{
    const count=counts?`<span>${fmt(counts[f]||0)}</span>`:'';
    return `<button class="${state.udfFilter===f?'active':''}" type="button" data-udf-filter="${f}" aria-pressed="${state.udfFilter===f?'true':'false'}"><b>${esc(udfFilterLabel(f))}</b>${count}</button>`;
  }).join('')}</div>`;
}
function udfShortName(u){
  const name=text(u?.displayName||u?.rawName||u?.key||'');
  return name.includes(': ')?name.split(': ').slice(1).join(': '):name;
}
function udfPrefix(u){
  const rhs=udfShortName(u);
  const idx=rhs.indexOf('_');
  if(idx>0)return `${rhs.slice(0,idx)}_`;
  const alpha=(rhs.match(/^[A-Za-z]+/)||['Other'])[0];
  return alpha&&alpha!=='Other'?`${alpha}`:'Other';
}
function udfRuleListAvailable(u){
  return list(u?.internalRules).length>0||text(u?.availabilityState)==='RuleListAvailable';
}
function udfAvailabilityMessage(u){
  return text(u?.availabilityMessage)|| (udfRuleListAvailable(u)
    ? 'Internal UDF Rule List rows are available in this snapshot.'
    : 'The internal UDF Rule List was not available in this snapshot payload. Caller bindings and interface details remain available when extracted.');
}
function udfStatusTone(u){
  if(!u.defined)return 'amber';
  if(udfRuleListAvailable(u))return 'green';
  if(u.definitionParsed)return 'blue';
  return 'amber';
}
function udfStatusLabel(u){
  if(!u.defined)return 'reference-only';
  if(udfRuleListAvailable(u))return 'rule list available';
  if(u.definitionParsed)return 'interface parsed';
  return 'rule list unavailable';
}
function udfCallerCount(u){return list(u?.callerRules).length||list(u?.rules).length||Number(u?.count||0)||0;}
function udfParamCount(u){return effectiveUdfParameterNames(u).length||list(u?.parameterNames).length||list(u?.parameterBindings).length||0;}
function udfDefinitionSearchText(u){
  return lower([
    u?.displayName,u?.rawName,u?.key,u?.type,u?.source,u?.classification,u?.matchLevel,
    ...list(u?.parameterNames),...list(u?.statusResults),...list(u?.rules),
    ...list(u?.messages),...list(u?.callerRules).map(c=>`${c.ruleName} ${c.scopeId} ${c.functionName}`)
  ].map(text).join(' '));
}
function udfOverviewMetrics(allRows,filteredRows,selected){
  const all=list(allRows),filtered=list(filteredRows);
  return [
    {label:'total UDFs',value:fmt(all.length),tone:'blue'},
    {label:'shown',value:fmt(filtered.length),tone:'teal'},
    {label:'defined',value:fmt(all.filter(r=>r.defined).length),tone:'green'},
    {label:'with callers',value:fmt(all.filter(r=>udfCallerCount(r)>0).length),tone:'amber'},
    selected?{label:'selected params',value:fmt(udfParamCount(selected)),tone:'neutral'}:null
  ].filter(Boolean);
}
function udfIndexRowHtml(u,selectedKey){
  const params=udfParamCount(u);
  const callers=udfCallerCount(u);
  const statuses=list(u.statusResults).length;
  const internal=list(u.internalRules).length;
  const messages=list(u.messages).length;
  const active=u.key===selectedKey;
  const badges=[
    `<span class="badge ${udfStatusTone(u)}">${esc(udfStatusLabel(u))}</span>`,
    callers?`<span class="badge blue">${fmt(callers)} caller${callers===1?'':'s'}</span>`:'<span class="badge neutral">0 callers</span>',
    params?`<span class="badge green">${fmt(params)} params</span>`:'',
    internal?`<span class="badge blue">${fmt(internal)} internal</span>`:'',
    statuses?`<span class="badge amber">${fmt(statuses)} statuses</span>`:'',
    messages?`<span class="badge amber">${fmt(messages)} msg</span>`:''
  ].filter(Boolean).join('');
  return `<button class="udf-index-row ${active?'active':''}" type="button" data-global-kind="udfs" data-global-key="${esc(u.key)}" aria-current="${active?'true':'false'}"><span class="udf-index-title"><b>${esc(udfShortName(u))}</b>${u.rawName&&u.rawName!==udfShortName(u)?`<small>${esc(u.rawName)}</small>`:''}</span><span class="udf-index-meta">${esc(u.type||'UDF')} · ${esc(u.source||'FWD')}</span><span class="udf-index-badges">${badges}</span></button>`;
}
function udfIndexHtml(rows,selectedKey){
  const groups=new Map();
  list(rows).forEach(u=>{
    const key=udfPrefix(u);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(u);
  });
  const ordered=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'}));
  return `<div class="udf-index-shell"><div class="global-list-head udf-list-head"><span>UDF inventory</span><b>${fmt(rows.length)}</b></div><div class="udf-index-list">${ordered.map(([group,items],idx)=>{
    const containsSelected=items.some(x=>x.key===selectedKey);
    return `<details class="udf-index-group" ${containsSelected||idx<8?'open':''}><summary><span>${esc(group)}</span><b>${fmt(items.length)}</b></summary><div class="udf-index-group-body">${items.map(u=>udfIndexRowHtml(u,selectedKey)).join('')}</div></details>`;
  }).join('')}</div></div>`;
}
function udfStateSummaryHtml(u,callers){
  const facts=[
    ['Definition',u.defined?'FWD-defined':'Reference-only'],
    ['Parse state',udfStatusLabel(u)],
    ['Raw name',u.rawName?`<span class="mono">${esc(u.rawName)}</span>`:'<span class="muted">not exported</span>'],
    ['Resource type',esc(u.type||'UDF')],
    ['Source',esc(u.source||'FWD resource')],
    ['Callers',fmt(callers.length)],
    ['Parameters',fmt(udfParamCount(u))],
    ['Status results',fmt(list(u.statusResults).length)],
    ['Internal rules',fmt(list(u.internalRules).length)],
    ['Load Status Items',fmt(list(u.messages).length)]
  ];
  return `<section class="udf-overview-card"><div class="udf-overview-title"><div><span class="workspace-eyebrow">UDF interface</span><h3>${esc(udfShortName(u))}</h3><p>${u.defined?'Reusable FormWorks rule-list function with caller bindings and extracted interface details.':'Reference-only UDF call target. Caller rules are known, but the full UDF definition was not exported in this snapshot.'}</p></div><div class="tree-detail-badges"><span class="badge ${udfStatusTone(u)}">${esc(udfStatusLabel(u))}</span><span class="badge blue">${fmt(callers.length)} callers</span></div></div><div class="udf-overview-facts">${facts.map(([k,v])=>kv(k,v)).join('')}</div></section>`;
}
function udfParameterInterfaceGridHtml(u,callers){
  const interfaceNames=effectiveUdfParameterNames(u);
  const rows=new Map();
  interfaceNames.forEach((name,idx)=>{
    const key=text(name).trim()||`Field List ${idx+1}`;
    rows.set(key,{name:key,index:idx+1,rawSlots:new Set(),values:new Map(),callers:new Set(),binding:null});
  });
  list(u.parameterBindings).forEach((b,idx)=>{
    const name=text(first(b.parameterName,b.name,b.displayName,interfaceNames[idx],`Field List ${idx+1}`)).trim();
    if(!name)return;
    if(!rows.has(name))rows.set(name,{name,index:idx+1,rawSlots:new Set(),values:new Map(),callers:new Set(),binding:null});
    const row=rows.get(name);
    row.binding=b;
    if(text(b.callerSlot))row.rawSlots.add(text(b.callerSlot));
    if(text(b.slot))row.rawSlots.add(text(b.slot));
    if(text(b.callerValue))row.values.set(text(b.callerValue),(row.values.get(text(b.callerValue))||0)+1);
  });
  list(callers).forEach(c=>callerParameterEntries(c.parameters,interfaceNames).forEach(entry=>{
    const name=entry.displayName||entry.rawName;
    if(!rows.has(name))rows.set(name,{name,index:rows.size+1,rawSlots:new Set(),values:new Map(),callers:new Set(),binding:null});
    const row=rows.get(name);
    row.callers.add(text(c.nodeId||c.ruleName));
    if(entry.rawName&&entry.rawName!==entry.displayName)row.rawSlots.add(entry.rawName);
    entry.values.forEach(v=>{const value=text(v);row.values.set(value,(row.values.get(value)||0)+1);});
  }));
  const sorted=[...rows.values()].sort((a,b)=>(a.index||999)-(b.index||999)||a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
  if(!sorted.length)return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Parameter Interface</h4><p>No named UDF parameters or caller-observed parameter bindings were extracted.</p></div><span class="badge amber">0</span></div></section>`;
  return `<section class="udf-section-card udf-parameter-card"><div class="udf-section-head"><div><h4>Parameter Interface</h4><p>Canonical field-list names are shown first. Generic FWD slots are mapped to names when the interface could be inferred.</p></div><span class="badge blue">${fmt(sorted.length)} parameters</span></div><div class="udf-param-grid">${sorted.map(row=>{
    const values=[...row.values.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);
    const raw=[...row.rawSlots].filter(Boolean).join(', ');
    const confidence=text(first(row.binding?.confidence,row.binding?.Confidence,''));
    return `<div class="udf-param-card"><div class="udf-param-card-head"><span>${fmt(row.index||0)}</span><b>${esc(row.name)}</b></div><div class="udf-param-card-meta"><span>${fmt(row.callers.size)} caller use${row.callers.size===1?'':'s'}</span>${raw?`<span>slot: <code>${esc(raw)}</code></span>`:''}${confidence?`<span>${esc(confidence)}</span>`:''}</div><div class="udf-param-values">${values.length?values.map(([v,c])=>`<span class="udf-value-chip" title="${esc(v)}">${esc(v||'(blank)')} <b>${fmt(c)}</b></span>`).join(''):'<span class="muted">No caller values observed.</span>'}</div></div>`;
  }).join('')}</div></section>`;
}
function udfStatusResultsHtml(u){
  const status=list(first(u.statusResults,u.statuses,u.results,[])).map(text).filter(Boolean);
  if(!status.length)return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Status Results</h4><p>No explicit status-result list was extracted for this UDF.</p></div><span class="badge neutral">0</span></div></section>`;
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Status Results</h4><p>Configured return/status tokens that may select Action Lists inside caller or internal rule flow.</p></div><span class="badge amber">${fmt(status.length)} statuses</span></div>${functionTokenStripHtml(status,'amber')}</section>`;
}
function udfInterfaceHtml(u,callers){
  return `${udfStateSummaryHtml(u,callers)}${udfParameterInterfaceGridHtml(u,callers)}${udfStatusResultsHtml(u)}`;
}
function udfLoadStatusHtml(u){
  const bindings=list(u.parameterBindings);
  const loadInfo=u['resource'+'Evidence']||{};
  const attrHits=list(loadInfo.attributeHits);
  const treeHits=list(loadInfo.privateTreeHits);
  const diagnostics=list(u.messages).map(text).filter(Boolean);
  const rawAvailable=!!u.rawResourceDetails;
  return `<section class="udf-section-card udf-load-status-card"><div class="udf-section-head"><div><h4>Load Status</h4><p>Definition availability, resource config state, caller-slot bindings, and messages.</p></div><span class="badge ${diagnostics.length?'amber':u.definitionParsed?'green':'blue'}">${diagnostics.length?`${fmt(diagnostics.length)} messages`:u.definitionParsed?'parsed':'partial'}</span></div><div class="udf-load-status-grid"><div>${kv('Definition parsed',u.definitionParsed?'Yes':'No')}${kv('Body parsed',u.bodyParsed?'Yes':'No')}${kv('Resource config',loadInfo.hasConfig?'Available':'Unavailable')}</div><div>${kv('Private tree',loadInfo.hasPrivateTree?'Available':'Unavailable')}${kv('Raw details',rawAvailable?'Available':'Not loaded')}${kv('Status hits',fmt(attrHits.length+treeHits.length+bindings.length))}</div></div>${bindings.length?`<div class="table-columns-head">Caller slot bindings</div><div class="global-param-matrix compact">${bindings.slice(0,24).map(b=>`<div class="global-param-card"><b>${esc(text(first(b.parameterName,b.name,'')))}</b><small class="udf-param-raw">${esc(text(first(b.callerSlot,b.slot,'')))}</small><span>${esc(text(first(b.callerValue,b.value,b.confidence,'')))}</span></div>`).join('')}</div>`:''}${treeHits.length?`<div class="table-columns-head">Private body hits</div><div class="mini-list">${treeHits.slice(0,10).map(h=>`<div class="mini-row"><span><b>${esc(text(h.role||''))}</b> ${esc(text(h.name||''))}</span><span class="mono">${esc(text(h.path||''))}</span></div>`).join('')}</div>`:''}${diagnostics.length?`<div class="table-columns-head">Status Items</div>${functionTokenStripHtml(diagnostics,'amber')}`:''}</section>`;
}
function udfCallerRulesHtml(callers,u){
  const rows=list(callers);
  if(!rows.length)return '<section class="udf-section-card"><div class="udf-section-head"><div><h4>Caller Rules</h4><p>No caller rules are mapped for this UDF.</p></div><span class="badge neutral">0</span></div></section>';
  const interfaceNames=effectiveUdfParameterNames(u);
  return `<section class="udf-section-card udf-callers-card polished"><div class="udf-section-head"><div><h4>Caller Rules</h4><p>Rules that invoke this UDF. Open a row to inspect the configured rule, field-list values, attributes, and action lists.</p></div><span class="badge blue">${fmt(rows.length)} callers</span></div><div class="udf-caller-table"><div class="udf-caller-table-head"><span>Rule</span><span>Scope</span><span>Parameter preview</span><span></span></div>${rows.slice(0,260).map(c=>{
    const node=c.nodeId?model.nodesById.get(String(c.nodeId)):null;
    const scopeId=text(c.scopeId||node?.scopeId||'');
    const nodeId=text(c.nodeId||node?.id||'');
    const open=nodeId?`<button class="btn ghost" type="button" data-node="${esc(nodeId)}" data-node-scope="${esc(scopeId)}">Open</button>`:'<span class="badge amber">Unlinked</span>';
    const entries=callerParameterEntries(c.parameters||{},interfaceNames);
    const paramPreview=entries.length?entries.slice(0,4).map(entry=>`<span title="${esc(entry.values.join(', '))}"><b>${esc(entry.displayName)}</b>: ${esc(entry.values.slice(0,2).join(', ')||'(blank)')}</span>`).join(''):'<span class="muted">No parsed parameters</span>';
    return `<div class="udf-caller-table-row"><div><b>${esc(c.ruleName||'Unnamed rule')}</b><small>${esc(c.functionName||u.rawName||'UDF call')}</small></div><div class="mono">${esc(scopeId||'unscoped')}</div><div class="udf-caller-param-preview">${paramPreview}</div><div>${open}</div></div>`;
  }).join('')}</div>${rows.length>260?`<div class="caption mt-8">Showing first 260 of ${fmt(rows.length)} caller rules.</div>`:''}</section>`;
}

function normalizeUdfInternalRules(u,udfName='',callers=[]){
  const out=[];
  const seen=new Set();
  function addRule(raw,idx=0){
    if(!raw)return;
    if(typeof raw==='string'){
      const key=`string|${raw}`.toLowerCase();
      if(seen.has(key))return;seen.add(key);
      out.push({ruleName:raw,functionName:'',scopeId:'',nodeId:'',parameters:{},raw});
      return;
    }
    if(typeof raw!=='object')return;
    const ruleName=text(first(raw.ruleName,raw.RuleName,raw.name,raw.Name,raw.title,raw.Title,`Rule ${idx+1}`));
    const functionName=text(first(raw.functionName,raw.FunctionName,raw.fn,raw.Function,''));
    const nodeId=text(first(raw.nodeId,raw.NodeId,raw.id,raw.Id,''));
    const scopeId=text(first(raw.scopeId,raw.ScopePath,raw.ScopeId,''));
    const parameters=first(raw.parameters,raw.Parameters,{});
    const statusResults=list(first(raw.statusResults,raw.StatusResults,raw.actions,raw.ActionNames,[])).map(text).filter(Boolean);
    const key=[nodeId,scopeId,ruleName,functionName,idx].join('|').toLowerCase();
    if(seen.has(key))return;seen.add(key);
    out.push({ruleName,functionName,scopeId,nodeId,parameters,statusResults,raw});
  }
  const direct=first(u?.internalRules,u?.InternalRules,u?.internalRulePreview,u?.ruleBody,u?.RuleBody,u?.bodyRules,u?.BodyRules,u?.definition?.ruleBody,u?.definition?.rules,[]);
  list(direct).forEach(addRule);
  list(first(u?.internalRuleTree?.candidateRuleNodes,[])).forEach((hit,i)=>addRule({
    ruleName:text(hit.name||`Private rule ${i+1}`),
    functionName:text(hit.role||'UDF private tree'),
    scopeId:'UDF private body',
    nodeId:'',
    parameters:{},
    raw:hit
  },i));
  const privateTree=first(u?.rawResourceDetails?.privateTree,u?.rawResourceDetails?.private_tree,null);
  if(privateTree&&typeof privateTree==='object'){
    const candidates=list(first(privateTree.rules,privateTree.Rules,privateTree.children,privateTree.Children,[]));
    candidates.forEach(addRule);
  }
  return out;
}
function udfInternalRulesHtml(u){
  const rules=list(u.internalRules);
  if(!rules.length)return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Internal Rule Body</h4><p>The internal UDF rule body is not present in the current snapshot payload.</p></div><span class="badge blue">0</span></div></section>`;
  const interfaceNames=effectiveUdfParameterNames(u);
  return `<section class="udf-section-card udf-internal-rules-card polished"><div class="udf-section-head"><div><h4>Internal Rule Body</h4><p>Rules inside this UDF definition. Linked rows open with the same read-only configuration inspector.</p></div><span class="badge blue">${fmt(rules.length)} rules</span></div><div class="udf-internal-timeline">${rules.slice(0,220).map((r,i)=>{
    const node=r.nodeId?model.nodesById.get(String(r.nodeId)):null;
    const scopeId=text(r.scopeId||node?.scopeId||'');
    const nodeId=text(r.nodeId||node?.id||'');
    const paramPreview=callerParameterEntries(r.parameters||{},interfaceNames).slice(0,3).map(entry=>`<span><b>${esc(entry.displayName)}</b>: ${esc(entry.values.slice(0,2).join(', ')||'(blank)')}</span>`).join('');
    const open=nodeId?`<button class="btn ghost" type="button" data-node="${esc(nodeId)}" data-node-scope="${esc(scopeId)}">Open</button>`:'<span class="badge blue">definition</span>';
    return `<div class="udf-internal-row"><div class="udf-internal-step">${fmt(i+1)}</div><div class="udf-internal-main"><b>${esc(r.ruleName||`Rule ${i+1}`)}</b><span>${esc(r.functionName||'no function')}${scopeId?` · ${esc(scopeId)}`:''}</span>${paramPreview?`<small>${paramPreview}</small>`:''}</div><div class="udf-internal-actions">${list(r.statusResults).length?`<span class="badge amber">${fmt(list(r.statusResults).length)} statuses</span>`:''}${open}</div></div>`;
  }).join('')}</div>${rules.length>220?`<div class="caption mt-8">Showing first 220 internal rules.</div>`:''}</section>`;
}

function globalDetailRecord(){
  if(state.globalDetailKind==='resources')return {kind:'resources',label:'Resource details',row:buildGlobalResourceDefinitions().find(r=>r.key===state.selectedResourceKey)};
  if(state.globalDetailKind==='functions')return {kind:'functions',label:'Function details',row:buildGlobalFunctionDefinitions().find(r=>r.key===state.selectedFunctionName)};
  if(state.globalDetailKind==='drivers')return {kind:'drivers',label:'Driver details',row:buildGlobalDriverDefinitions().find(r=>r.key===state.selectedDriverKey)};
  if(isAdvancedMode()&&state.globalDetailKind==='object-graph')return {kind:'object-graph',label:'Object graph node',row:buildObjectGraphDefinitions().find(r=>r.key===state.selectedObjectGraphKey)};
  if(state.globalDetailKind==='rule-lists')return {kind:'rule-lists',label:'Rule List packet',row:buildRuleListPacketDefinitions().find(r=>r.key===state.selectedRuleListKey)};
  if(state.globalDetailKind==='selection-lists')return {kind:'selection-lists',label:'SelectionList packet',row:buildSelectionListPacketDefinitions().find(r=>r.key===state.selectedSelectionListName)};
  if(isAdvancedMode()&&state.globalDetailKind==='runtime-impact')return {kind:'runtime-impact',label:'Runtime impact row',row:buildRuntimeImpactDefinitions().find(r=>r.key===state.selectedRuntimeImpactKey)};
  if(state.globalDetailKind==='tables'){
    const table=buildGlobalTableDefinitions().find(r=>r.name===state.selectedTableName);
    return table?{kind:'tables',label:'Table details',row:{...table,key:table.name,name:table.name,type:table.hasParsedSchema?'Parsed table':'Table',source:table.inferred?'Derived from rule usage':'FWD payload',usage:list(table.usage)}}:null;
  }
  if(state.globalDetailKind==='udfs'){
    const udf=buildUdfDefinitions().find(r=>r.key===state.selectedUdfName);
    return udf?{kind:'udfs',label:'UDF callers',row:{...udf,name:udf.displayName||udf.key}}:null;
  }
  return null;
}
function renderGlobalDefinitionModal(){
  const record=globalDetailRecord();
  if(!record?.row)return '<div class="empty"><div class="empty-card"><h2>No definition selected</h2><p>Select a global definition first.</p></div></div>';
  const row=record.row;
  if(record.kind==='udfs'){
    const callers=list(row.callerRules);
    return `<div class="global-modal-shell"><div class="global-modal-summary">${summaryTilesHtml([{label:'Parameters',value:fmt(list(row.parameterNames).length)},{label:'Caller rules',value:fmt(callers.length)},{label:'Type',value:esc(row.type||'UDF')}])}</div><div class="table-columns-head">Parameters</div>${parameterMatrixHtml(callers,effectiveUdfParameterNames(row))}<div class="table-columns-head">Caller hierarchy</div>${usagePreviewHtml(callers.map(c=>({scopeId:c.scopeId,ruleName:c.ruleName,functionName:c.functionName,node:c.nodeId?model.nodesById.get(String(c.nodeId)):null,target:'',targetType:'UDF caller',relationshipKind:'Calls'})))}</div>`;
  }
  if(record.kind==='functions'){
    const f=row.fn||row;
    return `<div class="global-modal-shell"><div class="global-modal-summary">${summaryTilesHtml([{label:'Observed rules',value:fmt(first(f.observedRuleCount,row.metric,0))},{label:'Statuses',value:fmt(list(f.statusResults).length)},{label:'Category',value:esc(first(f.category,row.type,'Function'))}])}</div>${functionConfigurationHtml(f,row)}<div class="table-columns-head">Rule usage</div>${usagePreviewHtml(row.usage)}</div>`;
  }
  const usage=list(row.usage);
  const exceptionalOrigin=!row.defined;
  const tiles=[{label:'Usage rows',value:fmt(usage.length)},{label:'Type',value:esc(row.type||'Definition')}];
  if(exceptionalOrigin)tiles.splice(1,0,{label:'Origin',value:esc(row.source||'Inferred from usage')});
  return `<div class="global-modal-shell"><div class="global-modal-summary">${summaryTilesHtml(tiles)}</div><div class="table-columns-head">Rule usage</div>${usage.length?`<div class="global-usage-list">${usage.slice(0,160).map(u=>`<div class="global-usage-row"><div><b>${esc(u.ruleName)}</b><span>${esc(u.scopeId)} · ${esc(u.functionName||u.relationshipKind||u.targetType||'Reference')}</span></div>${u.node?`<button class="btn ghost" type="button" data-node="${esc(u.node.id)}" data-node-scope="${esc(u.scopeId||u.node.scopeId||'')}">Open FW Editor details</button>`:`<span class="badge amber">Unlinked</span>`}<div class="definition-preview">${esc(u.target||'')}</div></div>`).join('')}</div>`:'<div class="global-empty-state">No rule usage is mapped for this definition.</div>'}</div>`;
}
function definitionOriginUi(kind,row){
  const defined=row?.defined===true;
  const type=text(row?.type||'Definition');
  const source=text(row?.source||'').trim();
  if(defined){
    return {
      defined:true,
      eyebrow:type,
      caption:'Canonical global definition with usage details from the snapshot.',
      badge:'Defined',
      badgeTone:'green',
      origin:source||'FWD payload',
      status:'Definition available'
    };
  }
  if(kind==='udfs'){
    return {
      defined:false,
      eyebrow:`${type} · reference-only`,
      caption:'This UDF name is observed in rule calls, but the snapshot did not include a canonical UDF definition/signature. Caller inventory is available; definition/body details are marked unavailable.',
      badge:'Reference-only',
      badgeTone:'amber',
      origin:source||'Observed rule calls',
      status:'Definition not exported'
    };
  }
  if(kind==='tables'){
    return {
      defined:false,
      eyebrow:`${type} · reference-only`,
      caption:'Rules reference this table or SelectionList name, but the snapshot did not include a parsed table schema/payload. Usage and referenced fields are shown from rule relationships.',
      badge:'Reference-only',
      badgeTone:'amber',
      origin:source||'Observed table references',
      status:'Schema not exported'
    };
  }
  if(kind==='functions'){
    return {
      defined:false,
      eyebrow:`${type} · observed usage`,
      caption:'This function appears in rule configuration or inventory details. The editor viewer can show observed callers even when no richer function metadata was exported.',
      badge:'Observed',
      badgeTone:'amber',
      origin:source||'Observed rule usage',
      status:'Metadata not exported'
    };
  }
  return {
    defined:false,
    eyebrow:`${type} · observed reference`,
    caption:'This definition is reconstructed from rule relationships. Usage links are available even when a full source definition was not exported.',
    badge:'Referenced',
    badgeTone:'amber',
    origin:source||'Observed relationships',
    status:'Definition not exported'
  };
}


function fweditorKindTitle(kind){
  const map={
    resources:'Resources',
    functions:'Functions',
    'selection-lists':'SelectionLists',
    tables:'Tables',
    drivers:'Drivers',
    'rule-lists':'Rule Lists',
    'object-graph':'Object Graph',
    'runtime-impact':'Runtime Impact',
    udfs:'User Defined Functions'
  };
  return map[kind]||kind;
}
function fweditorObjectNoun(kind){
  const map={
    resources:'Resource',
    functions:'Function',
    'selection-lists':'SelectionList',
    tables:'Table',
    drivers:'Driver',
    'rule-lists':'Rule List',
    'object-graph':'Object',
    'runtime-impact':'Runtime Impact',
    udfs:'UDF'
  };
  return map[kind]||'Definition';
}
function fweditorDefinitionRootPath(kind){
  const map={
    resources:'FW Editor Viewer navigation \\ Resources',
    functions:'FW Editor Viewer navigation \\ Resources \\ Functions',
    'selection-lists':'FW Editor Viewer navigation \\ Resources \\ SelectionLists',
    tables:'FW Editor Viewer navigation \\ Resources \\ Tables',
    udfs:'FW Editor Viewer navigation \\ Resources \\ Functions',
    drivers:'FW Editor Viewer navigation \\ Processes \\ Drivers',
    'rule-lists':'FW Editor Viewer navigation \\ Rule Lists',
    'object-graph':'FW Editor Viewer navigation \\ Object Graph',
    'runtime-impact':'FW Editor Viewer navigation \\ Runtime Impact'
  };
  return map[kind]||'FW Editor Viewer navigation \\ Resources';
}
function fweditorDefinitionPath(kind,row){
  const type=text(row?.type||fweditorObjectNoun(kind));
  const name=text(row?.name||row?.key||'Selected definition');
  return `${fweditorDefinitionRootPath(kind)} \\ ${type} \\ ${name}`;
}
function fweditorDefinitionCategory(row){
  const type=text(row?.type||'Other').trim();
  return type||'Other';
}
function fweditorGlobalViewMenu(activeKind){
  return fweditorViewStripHtml(activeKind);
}
function fweditorDefinitionTreeHtmlLegacy(kind,rows,selectedKey){
  const groups=new Map();
  list(rows).forEach(row=>{
    const group=fweditorDefinitionCategory(row);
    if(!groups.has(group))groups.set(group,[]);
    groups.get(group).push(row);
  });
  const ordered=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'}));
  const total=list(rows).length;
  const body=ordered.map(([group,items])=>{
    const open=items.some(r=>r.key===selectedKey)||ordered.length<=6;
    const itemHtml=items.slice(0,600).map(row=>{
      const selected=row.key===selectedKey;
      const origin=definitionOriginUi(kind,row);
      const usage=list(row.usage).length||row.metric||0;
      const warn=!origin.defined||list(row.messages).length;
      return `<button class="fweditor-tree-item ${selected?'selected':''}" type="button" data-editor-kind="${esc(kind)}" data-editor-key="${esc(row.key)}" data-def-kind="${esc(kind)}" data-def-key="${esc(row.key)}" title="${esc(row.name)}"><span class="fweditor-tree-glyph">${kind==='functions'?'ƒ':kind==='tables'?'▦':kind==='rule-lists'?'R':kind==='object-graph'?'◇':'◆'}</span><span class="fweditor-tree-label"><b>${esc(row.name)}</b><small>${esc(text(row.source||origin.origin||''))}${usage?` · ${fmt(usage)} usage`:''}</small></span>${warn?'<span class="fweditor-tree-warn">!</span>':''}</button>`;
    }).join('');
    const omitted=items.length>600?`<div class="fweditor-note">${fmt(items.length-600)} additional ${esc(group)} items hidden; narrow the search.</div>`:'';
    return `<details class="fweditor-tree-folder" ${open?'open':''}><summary><span class="fweditor-folder-icon">▾</span><b>${esc(group)}</b><small>${fmt(items.length)}</small></summary><div class="fweditor-tree-children">${itemHtml}${omitted}</div></details>`;
  }).join('');
  return `<div class="fweditor-fwd-tree-body"><details class="fweditor-tree-folder" open><summary><span class="fweditor-folder-icon">▾</span><b>Resources</b><small>${fmt(total)}</small></summary><div class="fweditor-tree-children"><details class="fweditor-tree-folder nested" open><summary><span class="fweditor-folder-icon">▾</span><b>${esc(fweditorKindTitle(kind))}</b><small>${fmt(total)}</small></summary><div class="fweditor-tree-children">${body}</div></details></div></details></div>`;
}
function fweditorDefinitionTreeHtml(kind,rows,selectedKey){
  const groups=new Map();
  list(rows).forEach(row=>{
    const group=fweditorDefinitionCategory(row);
    if(!groups.has(group))groups.set(group,[]);
    groups.get(group).push(row);
  });
  const ordered=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'}));
  const total=list(rows).length;
  const body=ordered.map(([group,items])=>{
    const open=items.some(r=>r.key===selectedKey)||ordered.length<=6;
    const itemHtml=items.slice(0,600).map(row=>{
      const selected=row.key===selectedKey;
      const origin=definitionOriginUi(kind,row);
      const usage=list(row.usage).length||row.metric||0;
      const warn=!origin.defined||list(row.messages).length;
      const glyph=kind==='functions'?'f':kind==='tables'?'T':kind==='rule-lists'?'R':kind==='object-graph'?'O':'*';
      return `<button class="fweditor-tree-item ${selected?'selected':''}" type="button" data-editor-kind="${esc(kind)}" data-editor-key="${esc(row.key)}" data-def-kind="${esc(kind)}" data-def-key="${esc(row.key)}" title="${esc(row.name)}"><span class="fweditor-tree-glyph">${esc(glyph)}</span><span class="fweditor-tree-label"><b>${esc(row.name)}</b><small>${esc(text(row.source||origin.origin||''))}${usage?` - ${fmt(usage)} usage`:''}</small></span>${warn?'<span class="fweditor-tree-warn">!</span>':''}</button>`;
    }).join('');
    const omitted=items.length>600?`<div class="fweditor-note">${fmt(items.length-600)} additional ${esc(group)} items hidden; narrow the search.</div>`:'';
    return `<details class="fweditor-tree-folder" ${open?'open':''}><summary><span class="fweditor-folder-icon">+</span><b>${esc(group)}</b><small>${fmt(items.length)}</small></summary><div class="fweditor-tree-children">${itemHtml}${omitted}</div></details>`;
  }).join('');
  const rootSegments=fweditorDefinitionRootPath(kind).split('\\').map(x=>x.trim()).filter(Boolean);
  const leaf=rootSegments[rootSegments.length-1]||fweditorKindTitle(kind);
  return `<div class="fweditor-fwd-tree-body"><details class="fweditor-tree-folder root" open><summary><span class="fweditor-folder-icon">+</span><b>${esc(leaf)}</b><small>${fmt(total)}</small></summary><div class="fweditor-tree-children">${body}</div></details></div>`;
}
function fweditorGlobalFactsHtml(kind,row,originUi,usageCount){
  const facts=[
    ['Name',esc(text(row.name||row.key||''))],
    ['Object type',esc(text(row.type||fweditorObjectNoun(kind)))],
    ['Definition state',esc(text(originUi.status||originUi.badge||''))],
    ['Source',esc(text(row.source||originUi.origin||''))],
    ['Usage / references',fmt(usageCount)],
    ['Key / handle',esc(text(row.key||''))]
  ];
  return `<fieldset class="fweditor-fieldset"><legend>General</legend><div class="fweditor-property-grid">${facts.map(([k,v])=>`<label>${esc(k)}</label><div>${v}</div>`).join('')}</div></fieldset>`;
}
function normalizeEditorPropertyPage(value){
  const page=value;
  const allowed=['general','usage',...(isAdvancedMode()?['reader-status','raw']:[])];
  return allowed.includes(page)?page:'general';
}
function fweditorGlobalPropertyTabsHtml(active=state.editorPropertyPage){
  const selected=normalizeEditorPropertyPage(active);
  const tabs=[['general','General'],['usage','Usage'],...(isAdvancedMode()?[[ 'reader-status','Load Status' ],[ 'raw','Advanced / Raw' ]]:[])];
  return `<div class="fweditor-form-pages" role="tablist" aria-label="Definition property pages">${tabs.map(([key,label])=>`<button class="${key===selected?'active':''}" type="button" role="tab" data-editor-page="${esc(key)}" aria-selected="${key===selected?'true':'false'}">${esc(label)}</button>`).join('')}</div>`;
}
function fweditorGlobalUsagePageHtml(row){
  const usage=list(row?.usage);
  if(!usage.length)return `<fieldset class="fweditor-fieldset"><legend>Usage</legend><div class="fweditor-empty">No caller or relationship usage rows were extracted for this definition.</div></fieldset>`;
  return `<fieldset class="fweditor-fieldset"><legend>Usage</legend><div class="global-usage-preview">${usagePreviewHtml(usage)}</div></fieldset>`;
}
function fweditorGlobalStatusStatusPageHtml(row,originUi){
  const messages=list(row?.messages).map(text).filter(Boolean);
  const readerStatus=[
    ['Definition state',text(originUi.status||originUi.badge||'')],
    ['Source',text(row?.source||originUi.origin||'')],
    ['Key / handle',text(row?.key||'')],
    ['Usage rows',fmt(list(row?.usage).length)]
  ];
  return `<fieldset class="fweditor-fieldset"><legend>Load Status</legend><div class="fweditor-property-grid reader-status">${readerStatus.map(([k,v])=>`<label>${esc(k)}</label><div>${esc(v)}</div>`).join('')}</div>${messages.length?`<div class="fweditor-diagnostic-list">${messages.slice(0,24).map(m=>`<div class="fweditor-message-row warn"><span>Warning</span><b>${esc(m)}</b></div>`).join('')}</div>`:'<div class="fweditor-empty">No diagnostics were attached to this definition.</div>'}</fieldset>`;
}
function fweditorGlobalRawPageHtml(row){
  const raw=JSON.stringify(row,null,2);
  return `<fieldset class="fweditor-fieldset"><legend>Advanced / Raw</legend><pre class="raw-block">${esc(raw)}</pre></fieldset>`;
}
function fweditorGlobalActivePageHtml(kind,row,originUi,usageCount,detailHtml){
  const active=normalizeEditorPropertyPage(state.editorPropertyPage);
  if(active==='usage')return fweditorGlobalUsagePageHtml(row);
  if(active==='reader-status')return fweditorGlobalStatusStatusPageHtml(row,originUi);
  if(active==='raw')return fweditorGlobalRawPageHtml(row);
  return `${fweditorGlobalFactsHtml(kind,row,originUi,usageCount)}<fieldset class="fweditor-fieldset"><legend>${esc(fweditorObjectNoun(kind))} Configuration</legend><div class="fweditor-definition-body">${detailHtml(row)}</div></fieldset>`;
}
function fweditorGlobalMessageWindowHtml(kind,selected,rows,originUi){
  const messages=[];
  const usage=list(selected?.usage).length||selected?.metric||0;
  messages.push({sev:originUi.defined?'Info':'Warning',object:text(selected?.name||fweditorKindTitle(kind)),message:originUi.caption||originUi.status||'Definition loaded.'});
  messages.push({sev:'Info',object:fweditorKindTitle(kind),message:`${fmt(rows.length)} ${fweditorObjectNoun(kind).toLowerCase()} definition rows shown. ${fmt(usage)} references on the selected item.`});
  list(selected?.messages).slice(0,8).forEach(m=>messages.push({sev:'Warning',object:text(selected?.name||''),message:text(m)}));
  return `<section class="fweditor-load-status-window ${state.editorMessageExpanded?'expanded':''}" aria-label="Advanced diagnostics"><div class="fweditor-load-status-title"><span>Load Status</span><button class="fweditor-title-button" type="button" data-action="toggle-editor-message">${state.editorMessageExpanded?'Collapse':'Expand'}</button></div><table class="fweditor-load-status-table"><thead><tr><th>Sev</th><th>Object</th><th>Message</th></tr></thead><tbody>${messages.map(r=>`<tr><td><span class="sev ${lower(r.sev)}">${esc(r.sev)}</span></td><td>${esc(r.object)}</td><td>${esc(r.message)}</td></tr>`).join('')}</tbody></table></section>`;
}
function fweditorGlobalConfigurationWindowHtml(kind,copy,selected,originUi,usageCount,detailHtml){
  const title=fweditorKindTitle(kind);
  const noun=fweditorObjectNoun(kind);
  return `<section class="fweditor-config-window" aria-label="FW Editor Viewer configuration view"><div class="fweditor-window-titlebar"><span>${esc(noun)} - ${esc(text(selected.name||selected.key||''))}</span><span class="fweditor-window-buttons"><i></i><i></i><i></i></span></div><div class="fweditor-config-toolbar"><span class="fweditor-breadcrumb">${esc(fweditorDefinitionPath(kind,selected))}</span><span class="fweditor-state-chip primary">${esc(originUi.badge||'Loaded')}</span><span class="fweditor-state-chip">${fmt(usageCount)} references</span></div><div class="fweditor-config-body"><div class="fweditor-resource-header"><div><div class="fweditor-resource-kicker">${esc(title)}</div><h2>${esc(text(selected.name||selected.key||''))}</h2><p>${esc(copy.body||originUi.caption||'Read-only FormWorks Editor configuration view.')}</p></div><button class="fweditor-command-button" type="button" data-action="open-global-detail" data-global-kind="${esc(kind)}">Details</button></div>${fweditorGlobalPropertyTabsHtml()}<div class="fweditor-active-page" role="tabpanel">${fweditorGlobalActivePageHtml(kind,selected,originUi,usageCount,detailHtml)}</div></div></section>`;
}