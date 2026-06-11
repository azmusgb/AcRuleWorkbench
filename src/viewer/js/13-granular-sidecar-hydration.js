/*
  Phase 8: granular sidecar loading.

  This module is intentionally additive and fallback-safe:
  - If ac-rule-viewer.manifest.json/ac-rule-viewer.index.json are absent, the existing boot-sidecar path continues.
  - If a granular FWD workspace index is absent, Phase 7 lazy ac-rule-viewer.fwd.json loading continues.
  - If a scope sidecar fails, the viewer keeps the currently loaded preview and reports the failure.
*/

const granularSidecarState = {
  enabled: false,
  manifest: null,
  index: null,
  defaultScopeId: '',
  loadedScopes: new Set(),
  loadingScopes: new Map(),
  loadedFwdWorkspaces: new Set(),
  loadingFwdWorkspaces: new Map(),
  errors: []
};

function granularQueryFlag(name){
  try { return new URLSearchParams(window.location.search).get(name); } catch { return null; }
}

function granularFalseyFlag(name){
  return /^(0|false|no|off)$/i.test(text(granularQueryFlag(name) || ''));
}

function granularList(value){
  if(!value) return [];
  if(Array.isArray(value)) return value;
  if(Array.isArray(value.items)) return value.items;
  if(Array.isArray(value.Items)) return value.Items;
  return [];
}

function granularFirst(){
  for(let i=0;i<arguments.length;i++){
    if(arguments[i]!==undefined&&arguments[i]!==null) return arguments[i];
  }
  return undefined;
}

function granularText(value){
  return value===undefined||value===null?'':String(value);
}

function granularSafeKey(value){
  return granularText(value||'unknown')
    .replace(/^[.\\/]+/,'')
    .replace(/[\\/]+/g,'_')
    .replace(/[^A-Za-z0-9._-]+/g,'_')
    .replace(/_+/g,'_')
    .replace(/^_+|_+$/g,'')
    .slice(0,180)||'unknown';
}

function granularItemId(item){
  return granularText(granularFirst(item&&item.NodeId,item&&item.nodeId,item&&item.Id,item&&item.id,item&&item.RuleGuid,item&&item.ruleGuid,item&&item.Guid,item&&item.guid,item&&item.Key,item&&item.key,item&&item.Name,item&&item.name));
}

function granularNodeScope(node){
  return granularText(granularFirst(node&&node.ScopePath,node&&node.scopePath,node&&node.ScopeId,node&&node.scopeId,node&&node.ScopeKey,node&&node.scopeKey,node&&node.RuleListScope,node&&node.ruleListScope));
}

function granularRuleScope(rule){
  return granularText(granularFirst(rule&&rule.ScopePath,rule&&rule.scopePath,rule&&rule.ScopeId,rule&&rule.scopeId,rule&&rule.RuleListScope,rule&&rule.ruleListScope));
}

function granularRuleGuid(rule){
  return granularText(granularFirst(rule&&rule.RuleGuid,rule&&rule.ruleGuid,rule&&rule.Guid,rule&&rule.guid));
}

function granularNodeGuid(node){
  return granularText(granularFirst(node&&node.RuleGuid,node&&node.ruleGuid,node&&node.Guid,node&&node.guid));
}

function granularFetchCandidates(fileName){
  const clean=granularText(fileName||'').replace(/^\/+/, '');
  const candidates=[clean,'/'+clean];
  try{
    const url=new URL(window.location.href);
    const parts=(url.pathname||'').split('/').filter(Boolean);
    if(parts.length){
      parts.pop();
      const base='/'+parts.join('/');
      if(base&&base!=='/') candidates.push(base+'/'+clean);
    }
  }catch{}
  return [...new Set(candidates.filter(Boolean))];
}

async function granularFetchJson(fileName, options={}){
  const candidates=granularFetchCandidates(fileName);
  const failures=[];
  for(const url of candidates){
    const started=Date.now();
    try{
      const response=await fetch(url,{cache:'no-store'});
      const elapsed=Date.now()-started;
      if(typeof recordViewerFetch==='function')recordViewerFetch(fileName,url,response.status,elapsed,{phase8:true,...options});
      if(!response.ok){
        failures.push({url,status:response.status});
        continue;
      }
      return await response.json();
    }catch(error){
      const elapsed=Date.now()-started;
      if(typeof recordViewerFetch==='function')recordViewerFetch(fileName,url,0,elapsed,{phase8:true,message:error&&error.message?error.message:String(error||'fetch failed'),...options});
      failures.push({url,error:error&&error.message?error.message:String(error||'fetch failed')});
    }
  }
  const err=new Error('Unable to load '+fileName+' from '+candidates.join(', '));
  err.failures=failures;
  throw err;
}

function granularRecord(level,event,details={}){
  if(typeof recordViewerDiagnostic==='function')recordViewerDiagnostic(level,event,details);
}

function granularResetCaches(){
  try{globalDefinitionLookupCache=null;}catch{}
  try{globalTableDefinitionsCache=null;}catch{}
  try{globalUdfDefinitionsCache=null;}catch{}
  try{globalFunctionDefinitionsCache=null;}catch{}
  try{globalNavigationCountsCache=null;}catch{}
  try{productCountsCache=null;}catch{}
  try{ruleListPacketDefinitionsCache=null;}catch{}
  try{scopeFieldResolutionCache=new Map();}catch{}
  try{if(model){model.visibleRowsCache=null;model.treeMatchCache=null;}}catch{}
}

function granularApplyIndexPayload(manifest,index){
  const preview=index&&index.bootPreview;
  if(!preview||!preview.rulesData||!preview.treeData){
    throw new Error('Granular index did not contain a usable bootPreview payload.');
  }

  rulesData=preview.rulesData;
  treeData=preview.treeData;
  relData=preview.relData||{Relationships:[]};

  granularSidecarState.enabled=true;
  granularSidecarState.manifest=manifest;
  granularSidecarState.index=index;
  granularSidecarState.defaultScopeId=granularText(preview.scopeId||index.defaultScopeId||'');
  if(granularSidecarState.defaultScopeId){
    granularSidecarState.loadedScopes.add(granularSidecarState.defaultScopeId+':preview');
    try{state.scopeId=granularSidecarState.defaultScopeId;}catch{}
  }

  if(typeof fwdApiHydrationState!=='undefined'){
    fwdApiHydrationState.mode='granular-index';
    fwdApiHydrationState.failedEndpoints=[];
  }

  granularRecord('info','granular-index-applied',{
    defaultScopeId:granularSidecarState.defaultScopeId,
    counts:typeof payloadCounts==='function'?payloadCounts():null,
    previewLimit:index.previewLimit||0
  });
}

async function tryLoadGranularIndexMode(){
  if(granularFalseyFlag('granular')||granularFalseyFlag('phase8'))return false;
  try{
    granularRecord('info','granular-index-start',{});
    const manifest=await granularFetchJson('ac-rule-viewer.manifest.json',{kind:'manifest'});
    if(!manifest||manifest.mode!=='granular-sidecars'){
      granularRecord('warn','granular-manifest-ignored',{mode:manifest&&manifest.mode});
      return false;
    }
    const indexFile=(manifest.files&&manifest.files.index)||'ac-rule-viewer.index.json';
    const index=await granularFetchJson(indexFile,{kind:'index'});
    granularApplyIndexPayload(manifest,index);
    return true;
  }catch(error){
    granularSidecarState.errors.push({event:'granular-index-failed',message:error&&error.message?error.message:String(error||'Unknown error')});
    granularRecord('warn','granular-index-unavailable',{message:error&&error.message?error.message:String(error||'Unknown error'),failures:error&&error.failures?error.failures:[]});
    return false;
  }
}

function granularScopeEntry(scopeId){
  const id=granularText(scopeId||'');
  const manifestScopes=granularList(granularSidecarState.manifest&&granularSidecarState.manifest.scopes);
  const indexScopes=granularList(granularSidecarState.index&&granularSidecarState.index.scopes);
  return [...manifestScopes,...indexScopes].find(s=>granularText(s.scopeId)===id)||null;
}

function granularScopeFile(scopeId){
  const entry=granularScopeEntry(scopeId);
  if(entry&&entry.file)return entry.file;
  return 'rules.scope.'+granularSafeKey(scopeId)+'.tree.json';
}

function granularScopeFullyLoaded(scopeId){
  return granularSidecarState.loadedScopes.has(granularText(scopeId));
}

function granularArrayWithoutScope(items,scopeId,kind){
  const id=granularText(scopeId||'');
  if(!id)return granularList(items);
  if(kind==='node')return granularList(items).filter(item=>granularNodeScope(item)!==id);
  if(kind==='rule')return granularList(items).filter(item=>granularRuleScope(item)!==id);
  if(kind==='diag')return granularList(items).filter(item=>{
    const direct=granularText(granularFirst(item&&item.ScopePath,item&&item.scopePath,item&&item.ScopeId,item&&item.scopeId));
    return direct!==id;
  });
  if(kind==='rel')return granularList(items).filter(item=>{
    const direct=granularText(granularFirst(item&&item.ScopePath,item&&item.scopePath,item&&item.ScopeId,item&&item.scopeId));
    return direct!==id;
  });
  return granularList(items);
}

function granularMergeByKey(existing,incoming,keyFn){
  const map=new Map();
  for(const item of granularList(existing)){
    const key=keyFn(item)||JSON.stringify(item);
    if(!map.has(key))map.set(key,item);
  }
  for(const item of granularList(incoming)){
    const key=keyFn(item)||JSON.stringify(item);
    map.set(key,item);
  }
  return [...map.values()];
}

function granularApplyScopeSidecar(payload,scopeId){
  const sidecar=payload&&payload.data&&typeof payload.data==='object'?payload.data:payload;
  if(!sidecar||typeof sidecar!=='object')throw new Error('Scope sidecar was not an object.');
  const id=granularText(sidecar.scopeId||scopeId||'');
  const incomingTree=sidecar.treeData||sidecar.tree||{};
  const incomingRules=sidecar.rulesData||sidecar.rules||{};
  const incomingRel=sidecar.relData||sidecar.relationshipsData||{};

  const currentTree=treeData||{};
  const currentRules=rulesData||{};
  const currentRel=relData||{};

  const existingScopes=granularList(granularFirst(currentTree.Scopes,currentTree.scopes));
  const incomingScopes=granularList(granularFirst(incomingTree.Scopes,incomingTree.scopes));
  const existingNodes=granularArrayWithoutScope(granularFirst(currentTree.Nodes,currentTree.nodes),id,'node');
  const existingEdges=granularArrayWithoutScope(granularFirst(currentTree.Edges,currentTree.edges),id,'node');
  const existingDiags=granularArrayWithoutScope(granularFirst(currentTree.Diagnostics,currentTree.diagnostics),id,'diag');
  const existingRules=granularArrayWithoutScope(granularFirst(currentRules.Rules,currentRules.rules),id,'rule');
  const existingRels=granularArrayWithoutScope(granularFirst(currentRel.Relationships,currentRel.relationships,currentRel.Edges,currentRel.edges),id,'rel');

  treeData={
    ...currentTree,
    Scopes:granularMergeByKey(existingScopes,incomingScopes,s=>granularText(granularFirst(s&&s.ScopePath,s&&s.scopePath,s&&s.ScopeId,s&&s.scopeId,s&&s.Key,s&&s.key,s&&s.Name,s&&s.name))),
    Nodes:[...existingNodes,...granularList(granularFirst(incomingTree.Nodes,incomingTree.nodes))],
    Edges:[...existingEdges,...granularList(granularFirst(incomingTree.Edges,incomingTree.edges))],
    Diagnostics:[...existingDiags,...granularList(granularFirst(incomingTree.Diagnostics,incomingTree.diagnostics))]
  };
  rulesData={
    ...currentRules,
    Rules:[...existingRules,...granularList(granularFirst(incomingRules.Rules,incomingRules.rules))]
  };
  relData={
    ...currentRel,
    Relationships:[...existingRels,...granularList(granularFirst(incomingRel.Relationships,incomingRel.relationships,incomingRel.Edges,incomingRel.edges))]
  };

  granularSidecarState.loadedScopes.add(id);
  granularResetCaches();
  if(typeof model!=='undefined'&&model)model=buildModel();
  try{seedExpanded(id);}catch{}

  granularRecord('info','granular-scope-applied',{
    scopeId:id,
    counts:sidecar.counts||{},
    payloadCounts:typeof payloadCounts==='function'?payloadCounts():null,
    modelCounts:typeof modelCounts==='function'?modelCounts():null
  });
}

async function granularLoadScope(scopeId,reason='scope-open'){
  const id=granularText(scopeId||'');
  if(!granularSidecarState.enabled||!id)return false;
  if(granularScopeFullyLoaded(id))return true;
  if(granularSidecarState.loadingScopes.has(id))return granularSidecarState.loadingScopes.get(id);

  const file=granularScopeFile(id);
  const promise=granularFetchJson(file,{kind:'scope',scopeId:id,reason})
    .then(payload=>{
      granularApplyScopeSidecar(payload,id);
      return true;
    })
    .catch(error=>{
      granularSidecarState.errors.push({event:'granular-scope-load-failed',scopeId:id,message:error&&error.message?error.message:String(error||'Unknown scope load failure')});
      granularRecord('error','granular-scope-load-failed',{scopeId:id,file,message:error&&error.message?error.message:String(error||'Unknown scope load failure'),failures:error&&error.failures?error.failures:[]});
      return false;
    })
    .finally(()=>granularSidecarState.loadingScopes.delete(id));

  granularSidecarState.loadingScopes.set(id,promise);
  granularRecord('info','granular-scope-load-start',{scopeId:id,file,reason});
  return promise;
}

function granularScopeLoadingHtml(scopeId){
  const entry=granularScopeEntry(scopeId)||{};
  const label=entry.name||scopeId||'scope';
  return `<section class="product-workspace product-catalog lazy-hydration-workspace" aria-label="Loading ${esc(label)}"><div class="product-empty-state product-empty-state-actionable lazy-hydration-card"><div class="empty-status-row"><span class="badge blue">Granular sidecar</span><span class="badge green">Index mode</span></div><h3>Loading ${esc(label)} rule tree</h3><p>The viewer has painted the lightweight startup index. It is now loading the selected Page/Document/UDF rule sidecar.</p><div class="lazy-hydration-progress" aria-hidden="true"><span></span></div></div></section>`;
}

function granularRenderScopeLoading(scopeId){
  const host=optionalElement('content');
  if(host)host.innerHTML=granularScopeLoadingHtml(scopeId);
  const title=optionalElement('scopeTitle');
  if(title)title.textContent='Loading scope';
  const caption=optionalElement('scopeCaption');
  if(caption)caption.textContent='Loading the granular rule tree sidecar for this scope.';
}

function maybeHydrateScopeOnDemand(scopeId,reason='scope-open'){
  const id=granularText(scopeId||'');
  if(!granularSidecarState.enabled||!id)return false;
  if(granularScopeFullyLoaded(id))return false;
  granularRenderScopeLoading(id);
  granularLoadScope(id,reason).then(ok=>{
    if(state.scopeId!==id)return;
    if(ok){
      try{seedExpanded(id);}catch{}
    }
    renderAll();
  });
  return true;
}

function granularFwdWorkspaceFile(view){
  const normalized=normalizeWorkspaceViewName(view||'');
  const fromManifest=granularSidecarState.manifest&&granularSidecarState.manifest.fwdWorkspaceIndexes&&granularSidecarState.manifest.fwdWorkspaceIndexes[normalized];
  if(fromManifest)return fromManifest;
  const map={
    'rule-lists':'fwd.rule-lists.index.json',
    'udfs':'fwd.udfs.index.json',
    'functions':'fwd.functions.index.json',
    'tables':'fwd.tables.index.json',
    'selection-lists':'fwd.selection-lists.index.json',
    'resources':'fwd.resources.index.json',
    'drivers':'fwd.drivers.index.json'
  };
  return map[normalized]||'';
}

function granularWorkspaceNeedsFwd(view){
  const normalized=normalizeWorkspaceViewName(view||'');
  return ['rule-lists','udfs','functions','tables','selection-lists','resources','drivers'].includes(normalized);
}

function granularMergeFwdPayload(payload,workspace){
  const incoming=payload&&payload.data&&typeof payload.data==='object'?payload.data:payload;
  if(!incoming||typeof incoming!=='object')throw new Error('FWD workspace sidecar was not an object.');
  const current=fwdData||fwdSidecarData||{};
  const next={...current};
  for(const [key,value] of Object.entries(incoming)){
    if(['schema','schemaVersion','workspace','generatedAtUtc','counts'].includes(key))continue;
    if(Array.isArray(value)||value&&Array.isArray(value.items)||value&&Array.isArray(value.Items)){
      next[key]=value;
    }else if(value&&typeof value==='object'){
      next[key]={...(next[key]&&typeof next[key]==='object'?next[key]:{}),...value};
    }else if(value!==undefined){
      next[key]=value;
    }
  }
  fwdSidecarData=next;
  fwdData=next;
  try{applyAdvancedSidecarsToFwdData();}catch{}
  if(typeof fwdApiHydrationState!=='undefined'){
    fwdApiHydrationState.mode='granular-index+lazy-fwd';
    fwdApiHydrationState.failedEndpoints=[];
  }
  granularSidecarState.loadedFwdWorkspaces.add(normalizeWorkspaceViewName(workspace||incoming.workspace||''));
  try{
    if(typeof lazyDetailHydrationState!=='undefined'){
      lazyDetailHydrationState.fwdStatus='granular';
      lazyDetailHydrationState.fwdLoadedAtUtc=new Date().toISOString();
      lazyDetailHydrationState.hydratedWorkspaces.add(workspace||incoming.workspace||'fwd');
    }
  }catch{}
  granularResetCaches();
  if(typeof model!=='undefined'&&model)model=buildModel();
  granularRecord('info','granular-fwd-workspace-applied',{workspace,counts:incoming.counts||{},payloadCounts:typeof payloadCounts==='function'?payloadCounts():null});
}

async function granularLoadFwdWorkspace(view,reason='workspace-open'){
  const normalized=normalizeWorkspaceViewName(view||'');
  if(!granularSidecarState.enabled||!granularWorkspaceNeedsFwd(normalized))return false;
  if(granularSidecarState.loadedFwdWorkspaces.has(normalized))return true;
  if(granularSidecarState.loadingFwdWorkspaces.has(normalized))return granularSidecarState.loadingFwdWorkspaces.get(normalized);
  const file=granularFwdWorkspaceFile(normalized);
  if(!file)return false;
  const promise=granularFetchJson(file,{kind:'fwd-workspace',workspace:normalized,reason})
    .then(payload=>{granularMergeFwdPayload(payload,normalized);return true;})
    .catch(error=>{
      granularSidecarState.errors.push({event:'granular-fwd-workspace-failed',workspace:normalized,message:error&&error.message?error.message:String(error||'Unknown FWD workspace load failure')});
      granularRecord('warn','granular-fwd-workspace-unavailable',{workspace:normalized,file,message:error&&error.message?error.message:String(error||'Unknown FWD workspace load failure'),failures:error&&error.failures?error.failures:[]});
      return false;
    })
    .finally(()=>granularSidecarState.loadingFwdWorkspaces.delete(normalized));
  granularSidecarState.loadingFwdWorkspaces.set(normalized,promise);
  granularRecord('info','granular-fwd-workspace-start',{workspace:normalized,file,reason});
  return promise;
}

function granularInstallRuntimeHooks(){
  if(typeof selectScope==='function'&&!selectScope.__phase8Granular){
    const originalSelectScope=selectScope;
    selectScope=function(id){
      if(!id)return;
      if(granularSidecarState.enabled&&!granularScopeFullyLoaded(id)){
        state.scopeId=id;
        if(isGlobalDefinitionView())state.workspaceView='structure';
        try{noteRecentScope(id);}catch{}
        state.selectedType='scope';
        state.selectedId='';
        state.focusNodeId='';
        try{state.collapsedActionLists.clear();}catch{}
        document.body.classList.remove('inspector-open');
        try{markOnboardingComplete();}catch{}
        try{announceContentStatus('Loading scope: '+id);}catch{}
        if(maybeHydrateScopeOnDemand(id,'scope-select'))return;
      }
      return originalSelectScope(id);
    };
    selectScope.__phase8Granular=true;
  }

  if(typeof maybeHydrateWorkspaceOnDemand==='function'&&!maybeHydrateWorkspaceOnDemand.__phase8Granular){
    const originalMaybeHydrateWorkspaceOnDemand=maybeHydrateWorkspaceOnDemand;
    maybeHydrateWorkspaceOnDemand=function(view,action){
      const normalized=normalizeWorkspaceViewName(view||'');
      if(granularSidecarState.enabled&&granularWorkspaceNeedsFwd(normalized)&&!granularSidecarState.loadedFwdWorkspaces.has(normalized)){
        const file=granularFwdWorkspaceFile(normalized);
        if(file){
          try{renderLazyDetailLoading(normalized,action||'granular-fwd-workspace');}catch{}
          granularLoadFwdWorkspace(normalized,action||'workspace-open').then(ok=>{
            if(state.workspaceView!==normalized)return;
            if(ok){
              if(typeof ensureUsefulWorkspaceSelection==='function')ensureUsefulWorkspaceSelection('granular-fwd-workspace');
              renderAll();
              try{toast('Loaded '+normalized+' index');}catch{}
            }else if(typeof originalMaybeHydrateWorkspaceOnDemand==='function'){
              originalMaybeHydrateWorkspaceOnDemand(normalized,action);
            }else{
              renderAll();
            }
          });
          return true;
        }
      }
      return originalMaybeHydrateWorkspaceOnDemand(view,action);
    };
    maybeHydrateWorkspaceOnDemand.__phase8Granular=true;
  }
}

granularInstallRuntimeHooks();

window.fwViewerGranularState=function(){
  return {
    enabled:granularSidecarState.enabled,
    defaultScopeId:granularSidecarState.defaultScopeId,
    loadedScopes:[...granularSidecarState.loadedScopes],
    loadingScopes:[...granularSidecarState.loadingScopes.keys()],
    loadedFwdWorkspaces:[...granularSidecarState.loadedFwdWorkspaces],
    loadingFwdWorkspaces:[...granularSidecarState.loadingFwdWorkspaces.keys()],
    manifestMode:granularSidecarState.manifest&&granularSidecarState.manifest.mode,
    errors:granularSidecarState.errors.slice(-10)
  };
};
