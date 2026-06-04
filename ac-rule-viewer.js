(function(){
  const cssCandidates = [
    'ac-rule-viewer.css',
    './ac-rule-viewer.css',
    '../ac-rule-viewer.css',
    '../../ac-rule-viewer.css',
    '../../../ac-rule-viewer.css',
    '../../../../ac-rule-viewer.css',
    '../../../../../ac-rule-viewer.css',
    '/ac-rule-viewer.css'
  ];

  const link = document.getElementById('viewerStylesheet');
  if(!link) return;

  let index = 0;
  link.addEventListener('error', function(){
    index += 1;
    if(index < cssCandidates.length){
      link.setAttribute('href', cssCandidates[index]);
    }
  });
})();

(function(){
'use strict';
// v62.1 read-only FW Editor alignment: light default theme, corrected theme persistence, stable wiring, and refined layout behavior.
/*
  AC Rule Workbench generated viewer.

  Engineering notes:
  - This file is intentionally dependency-free and focused on read-only FWD configuration viewing.
  - Structural tree data is the authority for hierarchy, action routing, and disabled inheritance.
  - The structural FWD model is the user-facing authority for hierarchy and configuration.
  - Inventory row and relationship data are supporting indexes for the read-only FWD model.
*/
let rulesData = null;
let relData = null;
let treeData = null;
let fwdData = null;

const embeddedPayload = (typeof window !== 'undefined' && window.AC_RULE_VIEWER_PAYLOADS) ? window.AC_RULE_VIEWER_PAYLOADS : {
  rulesData: "__RULES_JSON__",
  relData: "__RELATIONSHIPS_JSON__",
  treeData: "__TREE_JSON__",
};

function tryParseEmbeddedPayload(raw){
  if(!raw) return null;
  if(typeof raw==='object') return raw;
  if(typeof raw!=='string' || raw.startsWith('__')) return null;
  try { return JSON.parse(raw); }
  catch { return null; }
}

function applyEmbeddedPayloadIfPresent(){
  const parsed = {
    rulesData: tryParseEmbeddedPayload(embeddedPayload.rulesData),
    relData: tryParseEmbeddedPayload(embeddedPayload.relData),
    treeData: tryParseEmbeddedPayload(embeddedPayload.treeData),
  };

  if(parsed.rulesData && parsed.relData && parsed.treeData){
    rulesData = parsed.rulesData;
    relData = parsed.relData;
    treeData = parsed.treeData;
    return true;
  }

  return false;
}

// Load large FWD snapshot payloads from sidecar JSON files so the viewer shell can bootstrap faster.
async function loadViewerData(){
  if(applyEmbeddedPayloadIfPresent()) return;

  const baseCandidates = [
    '',
    './',
    '../',
    '../../',
    '../../../',
    '../../../../',
    '../../../../../',
    '/'
  ];

  async function fetchJsonWithFallback(file){
    for(const base of baseCandidates){
      try {
        const url = `${base}${file}`;
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 12000);
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        window.clearTimeout(timeoutId);
        if(response.ok) return await response.json();
      } catch {
        // Continue trying fallback locations until one responds.
      }
    }

    throw new Error(`Failed to load ${file}: file was not reachable from known paths.`);
  }

  const files = {
    rulesData: 'ac-rule-viewer.rules.json',
    relData: 'ac-rule-viewer.rel.json',
    treeData: 'ac-rule-viewer.tree.json',
  };
  const entries = Object.entries(files);
  const results = await Promise.all(entries.map(async ([key, file]) => {
    return [key, await fetchJsonWithFallback(file)];
  }));

  for (const [key, value] of results) {
    if (key === 'rulesData') rulesData = value;
    else if (key === 'relData') relData = value;
    else if (key === 'treeData') treeData = value;
  }

  await loadFwdApiData();
}

// Attempt to hydrate defined FWD object surfaces from API v1 when viewer is hosted with the workbench server.
async function loadFwdApiData(){
    // Respect explicit defined opt-out in query string to avoid unnecessary API probing and console 404 noise.
  const fwdApiParam = new URLSearchParams(window.location.search).get('fwdApi');
  if(fwdApiParam && /^(off|false|0|no)$/i.test(fwdApiParam)){
    fwdData = null;
    fwdApiHydrationState.mode = 'none';
    fwdApiHydrationState.failedEndpoints = [];
    return;
  }

  const baseCandidates=['/api/v1','./api/v1','../api/v1','../../api/v1'];
  const snapshotMode=(()=>{const mode=new URLSearchParams(window.location.search).get('snapshotMode');return mode==='live'?'live':'snapshot';})();
  const timeoutMs=8000;
  const endpoints=[
    ['editorModel','editor-model?include=ruleLists,objectGraph,udfs,selectionLists,runtimeImpacts'],
    ['overview','fwd/overview'],
    ['documents','fwd/documents'],
    ['pages','fwd/pages'],
    ['batches','fwd/batches'],
    ['processes','fwd/processes'],
    ['processDrivers','fwd/processes/drivers'],
    ['resources','fwd/resources'],
    ['objectGraph','fwd/object-graph'],
    ['functions','fwd/functions'],
    ['ruleLists','rule-lists'],
    ['tables','fwd/tables'],
    ['selectionLists','fwd/selection-lists'],
    ['udfs','fwd/udfs?includeDetails=true'],
    ['canonicalUdfs','fwd/udfs/canonical'],
    ['runtimeImpact','fwd/runtime-impact'],
    ['pageVariants','fwd/page-variants'],
    ['fields','fwd/fields']
  ];
  async function fetchApi(path){
    for(const base of baseCandidates){
      try{
        const slash=base.endsWith('/')?'':'/';
        const separator=path.includes('?')?'&':'?';
        const withMode=`${base}${slash}${path}${separator}snapshotMode=${snapshotMode}`;
        const controller=new AbortController();
        const timeoutId=window.setTimeout(()=>controller.abort(),timeoutMs);
        const response=await fetch(withMode,{cache:'no-store',signal:controller.signal});
        window.clearTimeout(timeoutId);
        if(!response.ok) continue;
        const payload=await response.json();
        if(payload&&payload.ok===true&&payload.data!==undefined) return {ok:true,data:payload.data};
      }catch{
        // Keep probing candidate bases.
      }
    }
    return {ok:false,data:null};
  }

  const hydrated={};
  const failed=[];
  const settled=await Promise.all(endpoints.map(async ([key,path])=>({key,result:await fetchApi(path)})));
  settled.forEach(entry=>{
    hydrated[entry.key]=entry.result.data;
    if(!entry.result.ok)failed.push(entry.key);
  });

  if(!hydrated.overview){
    fwdData=null;
    fwdApiHydrationState.mode='none';
    fwdApiHydrationState.failedEndpoints=failed;
    return;
  }

  fwdData={
    editorModel:hydrated.editorModel,
    overview:hydrated.overview,
    documents:hydrated.documents,
    pages:hydrated.pages,
    batches:hydrated.batches,
    processes:hydrated.processes,
    processDrivers:hydrated.processDrivers,
    resources:hydrated.resources,
    objectGraph:hydrated.objectGraph,
    functions:hydrated.functions,
    ruleLists:hydrated.ruleLists,
    tables:hydrated.tables,
    selectionLists:hydrated.selectionLists,
    udfs:hydrated.udfs,
    canonicalUdfs:hydrated.canonicalUdfs,
    runtimeImpact:hydrated.runtimeImpact,
    pageVariants:hydrated.pageVariants,
    fields:hydrated.fields
  };

  fwdApiHydrationState.mode=failed.length?'partial':'full';
  fwdApiHydrationState.failedEndpoints=failed;
}
function $(id){
  const el=document.getElementById(id);
  if(!el) throw new Error(`Required UI element was not found: #${id}`);
  return el;
}
function optionalElement(id){ return document.getElementById(id); }
const storeKey='ac-rule-workbench-v62-1-light-default';
const inspectorSections=['summary','parameters','attributes','actions','references','messages','raw'];
const list=x=>Array.isArray(x)?x:(x==null?[]:[x]);
const first=(...xs)=>xs.find(x=>x!==undefined&&x!==null&&String(x).length>0);
const text=x=>String(x??'');
const lower=x=>text(x).toLowerCase();
const fmt=n=>Number(n||0).toLocaleString();
const esc=s=>text(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const slug=s=>text(s).replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'')||'scope';
function safeJson(s,fallback){
  try { return JSON.parse(s); }
  catch (error) {
    console.warn('AC Rule Workbench: failed to parse JSON state; using fallback.', error);
    return fallback;
  }
}
function readStorage(key){
  try { return window.localStorage ? localStorage.getItem(key) : null; }
  catch (error) {
    console.warn('AC Rule Workbench: localStorage read failed.', error);
    return null;
  }
}
function writeStorage(key,value){
  try { if (window.localStorage) localStorage.setItem(key,value); }
  catch (error) { console.warn('AC Rule Workbench: localStorage write failed.', error); }
}
function readState(){
  const saved=safeJson(readStorage(storeKey)||'{}',{});
  return {
    scopeId:saved.scopeId||'',query:'',treeQuery:'',scopeQuery:'',scopeKindFilter:saved.scopeKindFilter||'all',treeFilter:'all',
    selectedType:'scope',selectedId:'',expanded:new Set(),collapsedBranches:new Set(),
    workspaceView:saved.workspaceView||'structure',
    fieldResolutionFilter:saved.fieldResolutionFilter||'unresolved',
    focusNodeId:'',theme:['light','dark'].includes(saved.theme)?saved.theme:'light',density:saved.density==='high'?'high':'standard',modal:'',
    selectedResourceKey:saved.selectedResourceKey||'',
    selectedFunctionName:saved.selectedFunctionName||'',
    selectedDriverKey:saved.selectedDriverKey||'',
    globalDetailKind:'',
    selectedTableName:saved.selectedTableName||'',
    selectedUdfName:saved.selectedUdfName||'',
    udfFilter:['all','with-callers','defined','unparsed','relationship-only'].includes(saved.udfFilter)?saved.udfFilter:'with-callers',
    recentScopes:Array.isArray(saved.recentScopes)?saved.recentScopes:[],searchActiveIndex:-1,inspectorOpen:false,disclosureLevel:Number(saved.disclosureLevel||1)||1
  };
}
const state=readState();document.documentElement.dataset.theme=state.theme;
let toastTimer=0;
let searchDebounceTimer=0;
let modalPreviouslyFocusedEl=null;
let scopeFieldResolutionCache=new Map();
const fwdApiHydrationState={mode:'none',failedEndpoints:[]};
const checklistDismissedKey='ac-rule-workbench-onboarding-dismissed';
const checklistCollapsedKey='ac-rule-workbench-onboarding-collapsed';
function applyDensityClass(density){const mode=density==='high'?'high':'standard';state.density=mode;document.body.classList.remove('density-high','density-standard');document.body.classList.add(`density-${mode}`);}
function isDesktopPrimaryDevice(){return window.matchMedia('(min-width: 1280px) and (pointer: fine)').matches;}
function viewportTier(){const w=Math.max(window.innerWidth||0,document.documentElement.clientWidth||0);if(w>=2200)return 'ultra';if(w>=1700)return 'wide';return 'regular';}
function desktopPreset(){const candidate=Math.max(window.screen?.width||0,window.innerWidth||0);if(candidate>=3600)return 'uhd';if(candidate>=2400)return 'qhd';return 'default';}
function applyViewportProfile(){const desktopPrimary=isDesktopPrimaryDevice();document.body.classList.toggle('desktop-primary',desktopPrimary);document.body.classList.remove('desktop-wide','desktop-ultra','desktop-qhd','desktop-uhd');if(desktopPrimary){const tier=viewportTier();if(tier==='wide')document.body.classList.add('desktop-wide');else if(tier==='ultra')document.body.classList.add('desktop-ultra');const preset=desktopPreset();if(preset==='qhd')document.body.classList.add('desktop-qhd');else if(preset==='uhd')document.body.classList.add('desktop-uhd');}applyDensityClass(state.density);}
applyViewportProfile();window.addEventListener('resize',applyViewportProfile);
function reportUiError(context,error){
  const message=error&&error.message?error.message:String(error||'Unknown error');
  console.error(`AC Rule Workbench ${context} failed:`, error);
  const banner=optionalElement('globalErrorBanner');
  if(banner){
    banner.textContent=`${context==='data load'?'FWD snapshot load error':'Workbench error'}: ${message}`;
    banner.hidden=false;
  }
  const toastNode=optionalElement('toast');
  if(toastNode){
    toast(`Workbench error: ${message}`,'error',4500);
  }
}
// Keep global actions aligned with actual selection state.
function hasConfigSelection(){
  return !!(selectedNode()||selectedBranch()||selectedInventory()||selectedRel()||selectedDiag());
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
  setButtonAvailability('copyConfigBtn',hasSelection,'Select a rule or branch before copying.');
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
function actionNamesOf(n){return list(first(n.ActionNames,n.actionNames,[])).map(text).filter(Boolean)}
function routeName(e){const name=first(e.ActionName,e.actionName,e.Label,e.label);if(name)return text(name);if(String(first(e.EdgeKind,e.relationship,''))==='RootListEntry'||Number(first(e.ActionListIndex,-1))<0)return 'Root rule list';const idx=first(e.ActionListIndex,e.actionListIndex);return idx===undefined?'Unnamed action list':`Action ${idx}`;}
function routeState(e){if(!e)return 'Root';const kind=text(first(e.EdgeKind,e.kind,e.relationship,''));const idx=Number(first(e.ActionListIndex,e.actionListIndex,-1));if(kind==='RootListEntry'||idx<0)return 'Root';if(first(e.ActionNameResolved,e.actionNameResolved,false)===true||!!first(e.ActionName,e.actionName,null))return 'NamedAction';return idx>=0?'IndexedAction':'UnnamedAction';}
function routeResolved(e){const st=routeState(e);return st==='Root'||st==='NamedAction';}
function ruleKeyParts(x){return [scopeIdOf(x),first(x.RuleGuid,x.ruleGuid,''),first(x.RuleId,x.ruleId,''),titleOf(x),fnOf(x),first(x.RuleIndexWithinScope,x.RuleIndex,'')].map(text).join('|').toLowerCase();}
function scopedGuidKey(x){const guid=first(x.RuleGuid,x.ruleGuid,'');return guid?`${scopeIdOf(x)}|${guid}`.toLowerCase():'';}
function scopedNameFunctionKey(x){const name=titleOf(x),fn=fnOf(x);return name&&fn?`${scopeIdOf(x)}|${name}|${fn}`.toLowerCase():'';}
function addUniqueIndex(map,key,id){if(!key)return;if(!map.has(key))map.set(key,[]);map.get(key).push(id);}
function uniqueLookup(map,key){const hits=key&&map.get(key);return hits&&hits.length===1?hits[0]:'';}
function correlationNodeId(x,exact,guid,nameFn){return exact.get(ruleKeyParts(x))||uniqueLookup(guid,scopedGuidKey(x))||uniqueLookup(nameFn,scopedNameFunctionKey(x))||'';}
/** Build the normalized client-side indexes used by the tree, inspector, and search. */
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

  const edges=list(treeData.Edges).map((e,i)=>({...e,id:`edge-${i}`,from:text(first(e.FromNodeId,e.fromNodeId,e.From,e.from,'')),to:text(first(e.ToNodeId,e.toNodeId,e.To,e.to,'')),scopeId:scopeIdOf(e),kind:text(first(e.EdgeKind,e.kind,e.relationship,'Edge')),label:routeName(e),routeState:routeState(e),resolved:routeResolved(e)}));
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
    const row={...r,id:`flat-${i}`,scopeId:scopeIdOf(r),title:titleOf(r),fn:fnOf(r),flatDisabled,disabled,disabledAuthority:structuralNode?'Structural':'FlatInventory',nodeId,classification:nodeId?'StructuralMatch':'FlatOnly',searchBlob:''};
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
  return {scopes:scopeList,nodes,nodesById,edges,childrenByParent,parentByChild,incomingByChild,incomingEdgesByChild,edgesByParent,rootsByScope,inventory,rels,diags,fwd:fwdData};
}
let model;
const bootState={phase:'loading',detail:'Loading FWD snapshot...'};

function fwdHydrationSummary(){
  if(fwdApiHydrationState.mode==='full')return {level:'ready',label:'FWD API loaded'};
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
  $('sourceSubtitle').textContent='Loading FWD snapshot...';
  $('statusPill').innerHTML='<span class="dot"></span><span>Loading FWD</span>';
  $('globalNav').innerHTML='';
  $('scopeList').innerHTML=emptyHtml('Loading scopes','Large snapshots can take a moment to parse.');
  $('content').innerHTML=emptyHtml('Preparing read-only FWD viewer','Loading FWD rules, global definitions, and action lists...');
}
function seedExpanded(scopeId=state.scopeId){
  state.expanded.clear();
  (model.rootsByScope.get(scopeId)||[]).forEach(id=>state.expanded.add(String(id)));
}
function currentScope(){return model.scopes.find(s=>s.scopeId===state.scopeId)||model.scopes[0];}
function scopedNodes(){return model.nodes.filter(n=>n.scopeId===state.scopeId);}
function scopedRuleNodes(){return scopedNodes().filter(n=>n.isRule);}
function scopedInventory(){return model.inventory.filter(r=>r.scopeId===state.scopeId);}
function scopedRels(){return model.rels.filter(r=>r.scopeId===state.scopeId);}
function scopedDiags(){return model.diags.filter(d=>d.scopeId===state.scopeId||!d.scopeId||d.scopeId==='Unscoped');}
function scopedEdges(){return model.edges.filter(e=>e.scopeId===state.scopeId);}
function scopedRouteStats(){const edges=scopedEdges();const root=edges.filter(e=>e.routeState==='Root').length;const named=edges.filter(e=>e.routeState==='NamedAction').length;const indexed=edges.filter(e=>e.routeState==='IndexedAction').length;const unnamed=edges.filter(e=>e.routeState==='UnnamedAction').length;return {edges:edges.length,root,resolved:named,indexOnly:indexed,unnamed:unnamed,named,indexed,unnamed,nonRoot:Math.max(0,edges.length-root)};}
function scopeStatusStripHtml(){const s=currentScope(),stats=scopedRouteStats();const totalNonRoot=Math.max(1,stats.nonRoot);const decodedPct=Math.round((stats.resolved/totalNonRoot)*100);return `<div class="trust-strip" aria-label="Scope model status"><div class="trust-item info"><b>Scope</b><span>${esc(s.kind||'Scope')}</span></div><div class="trust-item good"><b>Structure</b><span>${fmt(scopedRuleNodes().length)} rules</span></div><div class="trust-item ${stats.indexOnly||stats.unnamed?'warn':'good'}"><b>Action lists</b><span>${fmt(stats.resolved)} named / ${fmt(stats.indexOnly+stats.unnamed)} unnamed</span></div><div class="trust-item ${s.warnings?'warn':'good'}"><b>Messages</b><span>${s.warnings?fmt(s.warnings):'None'}</span></div></div><div class="caption caption-block">Action-list mapping: ${decodedPct}% of non-root structural edges have resolved parent status-result action names. This shows the FWD configuration model as extracted for this scope.</div>`;}

function scopeHealthClass(s){return s?.health==='coverage-failure'?'bad':s?.health==='coverage-warning'||s?.health==='warning'?'warn':'good';}
function scopeHealthLabel(s){return s?.health==='coverage-failure'?'Count mismatch':s?.health==='coverage-warning'?'Count warning':s?.health==='warning'?'Warnings':'Loaded';}
function scopeHealthNoticeHtml(s=currentScope()){
  if(!s)return '';
  const cls=scopeHealthClass(s);
  const stats=scopedRouteStats();
  const message=s.health==='coverage-failure'
    ? `Inventory row has ${fmt(s.inventory)} row(s), but structural tree has ${fmt(s.structural)} rule node(s). Open the unmatched rows before using this scope for order-sensitive review.`
    : s.health==='coverage-warning'
      ? `Inventory row exceeds structural coverage. Open the unmatched rows before using this scope for order-sensitive review.`
      : `Structure and inventory counts are within the expected review range for this scope.`;
  return `<div class="scope-health-banner ${cls}"><div><b>${esc(scopeHealthLabel(s))}</b><span>${esc(message)}</span></div><div class="health-metrics"><span>${fmt(s.structural)} structural</span><span>${fmt(s.flatOnly)} unlinked flat</span><span>${fmt(stats.indexOnly+stats.unnamed)} unnamed action lists</span></div></div>`;
}
function selectedNode(){return state.selectedType==='node'?model.nodesById.get(String(state.selectedId)):null;}
function selectedInventory(){return state.selectedType==='inventory'?model.inventory.find(x=>x.id===state.selectedId):null;}
function selectedRel(){return state.selectedType==='rel'?model.rels.find(x=>x.id===state.selectedId):null;}
function selectedDiag(){return state.selectedType==='diag'?model.diags.find(x=>x.id===state.selectedId):null;}
function isGlobalDefinitionView(view=state.workspaceView){
  return ['resources','functions','tables','drivers','udfs'].includes(view);
}
function globalViewHeading(view=state.workspaceView){
  const map={
    resources:{title:'Resources',caption:'FWD-level shared definitions. Page and document rules reference these definitions; they remain global.'},
    functions:{title:'Functions',caption:'AC function catalog, configured status results, behavior flags, parameter roles, and rule usage.'},
    tables:{title:'Tables',caption:'Shared SelectionList and lookup table definitions from the FWD.'},
    drivers:{title:'Drivers',caption:'Input, output, and process-private driver definitions from the FWD.'},
    udfs:{title:'UDFs',caption:'User Defined Function interfaces, internal rules, status results, and caller mappings.'}
  };
  return map[view]||null;
}
function renderMainHead(){
  const s=currentScope();
  const isDocOrPage=/^(document|page)$/i.test(text(s.kind));
  const hydration=fwdHydrationSummary();
  const globalHeading=globalViewHeading();
  if(globalHeading){
    $('scopeTitle').textContent=globalHeading.title;
    $('scopeCaption').innerHTML=`<span class="scope-caption-note">${esc(globalHeading.caption)}</span>`;
    $('crumbs').innerHTML=`<span class="head-chip kind">Global definitions</span><span class="head-chip">Read-only FWD snapshot</span>`;
  } else {
    $('scopeTitle').textContent=s.name;
    const captions={
      structure:isDocOrPage?'Rule hierarchy, rule lists, and action lists.':'Structural rule lists and action lists.',
      'field-resolution':'Field references resolved against the extracted FWD field catalog.',
    };
    $('scopeCaption').innerHTML=`<span class="scope-caption-note">${esc(captions[state.workspaceView]||captions.structure)}</span>`;
    $('crumbs').innerHTML=`<span class="head-chip kind">${esc(s.kind)}</span><span class="head-chip">Read-only FWD snapshot</span>${state.focusNodeId?'<span class="head-chip focus">Focused subtree</span>':''}`;
  }
  const tabsEl=$('tabs');
  tabsEl.innerHTML='';
  tabsEl.setAttribute('aria-hidden','true');
  renderViewbar();
}

function renderStructure(){
  const rows=visibleStructureRows();
  const treeHtml=rows.length
    ? `<div class="tree" role="tree" aria-label="Structural rule tree">${rows.map(r=>r.type==='branch'?branchRow(r):treeRow(r.n,r.level)).join('')}</div>`
    : emptyHtml('No structural nodes match the current filter','Clear the search/filter or choose a different scope.');
  $('content').innerHTML=treeHtml;
}

function renderContent(){
  if(state.workspaceView==='field-resolution')return renderFieldResolutionCatalog();
  if(state.workspaceView==='resources')return renderGlobalResourceDefinitions();
  if(state.workspaceView==='functions')return renderGlobalFunctionDefinitions();
  if(state.workspaceView==='tables')return renderGlobalTablesMasterDetail();
  if(state.workspaceView==='drivers')return renderGlobalDriverDefinitions();
  if(state.workspaceView==='udfs')return renderUdfMasterDetail();
  return renderStructure();
}
function bars(rows){if(!rows.length)return '<div class="muted">No values.</div>';const max=Math.max(...rows.map(r=>r.count),1);return `<div class="mini-list">${rows.slice(0,10).map(r=>`<div class="mini-row"><span class="mono">${esc(r.name)}</span><b>${fmt(r.count)}</b><div class="bar bar-span-all"><i style="--bar-w:${Math.max(3,r.count/max*100)}%"></i></div></div>`).join('')}</div>`;}
function topCounts(values){const m=new Map();values.map(text).filter(Boolean).forEach(v=>m.set(v,(m.get(v)||0)+1));return [...m].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));}
function childIds(id){return list(model.childrenByParent.get(String(id))).map(String);}
function edgeRouteKey(e){return [e?.routeState||'',e?.label||'',first(e?.ActionListIndex,e?.actionListIndex,'')].join('|');}
function branchKey(parentId,g){return `${String(parentId)}::${g?.key||edgeRouteKey(g?.edge)||g?.label||'route'}`;}
function branchKeyFromEdge(parentId,e){return `${String(parentId)}::${edgeRouteKey(e)}`;}
function childRouteGroups(id){const edges=list(model.edgesByParent.get(String(id))).filter(e=>e&&e.to&&e.routeState!=='Root');const groups=[];const byKey=new Map();edges.forEach(e=>{const key=edgeRouteKey(e);let g=byKey.get(key);if(!g){g={key,edge:e,label:e.label||'Unnamed action list',routeState:e.routeState||'UnnamedAction',resolved:!!e.resolved,actionListIndex:first(e.ActionListIndex,e.actionListIndex,null),childIds:[]};byKey.set(key,g);groups.push(g);}g.childIds.push(String(e.to));});return groups;}
function allBranchKeysForScope(scopeId=state.scopeId){const keys=[];model.nodes.forEach(n=>{if(n.scopeId===scopeId)childRouteGroups(n.id).forEach(g=>keys.push(branchKey(n.id,g)));});return keys;}
function collapseBranchesForNode(id){childRouteGroups(String(id)).forEach(g=>state.collapsedBranches.add(branchKey(String(id),g)));}
function collapsedBranchCountForScope(scopeId=state.scopeId){return allBranchKeysForScope(scopeId).filter(k=>state.collapsedBranches.has(k)).length;}
function hasGroupedChildRoutes(id){return childRouteGroups(id).some(g=>g.childIds.length>0);}
function hasDiag(n){return model.diags.some(d=>String(d.nodeId)===String(n.id));}
function hasActions(n){return hasGroupedChildRoutes(n.id);}
function passesTreeFilter(n){if(state.treeFilter==='disabled')return n.disabled!=='none';if(state.treeFilter==='inherited')return n.disabled==='inherited';if(state.treeFilter==='warnings')return hasDiag(n);if(state.treeFilter==='actions')return hasActions(n);if(state.treeFilter==='sections')return n.isSection;return true;}
function treeHasMatch(id,seen=new Set()){if(seen.has(id))return false;seen.add(id);const n=model.nodesById.get(String(id));if(!n)return false;if(passesTreeFilter(n)&&hasVisibleQuery(n))return true;return childIds(id).some(c=>treeHasMatch(c,seen));}
function isHotspotNode(n){const kids=childIds(n.id).length;return n.disabled!=='none'||hasDiag(n)||kids>=20||childRouteGroups(n.id).length>=2;}
function selectedPathIds(){const ids=new Set();const n=selectedNode();let cur=n||null;let guard=0;while(cur&&guard++<128){ids.add(String(cur.id));const incoming=model.incomingByChild.get(cur.id);const p=model.parentByChild.get(cur.id);if(p&&incoming)ids.add(`branch:${branchKeyFromEdge(p,incoming)}`);cur=p?model.nodesById.get(String(p)):null;}return ids;}
/**
 * Produce the visible tree row list from rule expansion and action-branch expansion state.
 * Rule expansion reveals action lists; action expansion reveals child rules.
 */
function visibleStructureRows(){const roots=state.focusNodeId?[String(state.focusNodeId)]:(model.rootsByScope.get(state.scopeId)||[]).map(String);const rows=[];const filtered=!!text(state.query).trim()||state.treeFilter!=='all';function walk(id,level){const n=model.nodesById.get(String(id));if(!n||n.scopeId!==state.scopeId)return;const include=filtered?treeHasMatch(id):true;const selfOk=passesTreeFilter(n)&&hasVisibleQuery(n);if(include)rows.push({type:'node',n,level,visible:selfOk||!filtered,context:filtered&&!selfOk});const expanded=filtered||state.expanded.has(id)||id===state.focusNodeId;if(!expanded)return;const groups=childRouteGroups(id).map(g=>({...g,childIds:g.childIds.filter(cid=>!filtered||treeHasMatch(cid))})).filter(g=>g.childIds.length>0);const groupedChildIds=new Set(groups.flatMap(g=>g.childIds));if(groups.length){groups.forEach(g=>{const key=branchKey(id,g);const open=filtered||!state.collapsedBranches.has(key);rows.push({type:'branch',parent:n,group:g,key,open,level:level+1});if(open)g.childIds.forEach(c=>walk(c,level+2));});childIds(id).filter(c=>!groupedChildIds.has(String(c))).forEach(c=>{if(!filtered||treeHasMatch(c))walk(c,level+1);});}else{childIds(id).forEach(c=>walk(c,level+1));}}
roots.forEach(r=>walk(r,0));return rows;}
function visibleTreeNodes(){return visibleStructureRows().filter(r=>r.type==='node');}
function routeChip(e){
  if(!e)return '<span class="route-chip root">root rule list</span>';
  if(e.kind==='RootListEntry'||e.label==='Root rule list'||e.routeState==='Root')return '<span class="route-chip root" title="Root rule-list entry">root rule list</span>';
  const cls=e.resolved?'resolved':'unresolved';
  const title=e.resolved?'Named status-result action list':'Indexed action list with no extracted action name';
  return `<span class="route-chip ${cls}" title="${esc(title)}"><span class="route-prefix">Action List</span> ${esc(e.label)}</span>`;
}
function filteredInventory(){return scopedInventory().filter(r=>{if(!hasVisibleQuery(r))return false;if(state.inventoryFilter==='StructuralMatch')return r.classification==='StructuralMatch';if(state.inventoryFilter==='FlatOnly')return r.classification==='FlatOnly';if(state.inventoryFilter==='direct')return r.disabled==='direct';if(state.inventoryFilter==='inherited')return r.disabled==='inherited';return true;});}
function renderInventory(){const rows=filteredInventory();$('content').innerHTML=`<div class="notice"><div class="notice-icon">!</div><div><b>Inventory is not execution order.</b> Use flat rows for search/completeness. Only rows classified as StructuralMatch link to the hierarchy.</div></div><div class="table-list">${rows.slice(0,5000).map(r=>`<div class="data-row ${state.selectedId===r.id?'selected':''}" data-inventory="${esc(r.id)}"><div><div class="data-title">${esc(r.title)}</div><div class="data-sub">${esc(r.scopeId)} · ${esc(r.RuleGuid||r.RuleId||'no id')}</div></div><div class="mono">${esc(r.fn||'no function')}</div><div>${r.classification==='FlatOnly'?'<span class="badge amber">Unlinked flat row</span>':'<span class="badge green">StructuralMatch</span>'}</div><div>${r.nodeId?'<span class="badge blue">Linked</span>':''}</div></div>`).join('')||emptyHtml('No inventory rows match','Adjust search or filter.')}</div>${rows.length>5000?'<div class="notice"><div class="notice-icon">i</div><div>Showing first 5,000 matching inventory rows for browser performance. Narrow the filter for full review.</div></div>':''}`;}
function filteredDiags(){return scopedDiags().filter(d=>{if(!hasVisibleQuery(d))return false;const sev=lower(d.severity);if(state.messageFilter==='warning')return /warn|error/.test(sev);if(state.messageFilter==='info')return sev==='info';if(state.messageFilter==='linked')return !!d.nodeId;return true;});}
function renderMessages(){const rows=filteredDiags();$('content').innerHTML=`<div class="table-list">${rows.map(d=>`<div class="data-row ${state.selectedId===d.id?'selected':''}" data-diag="${esc(d.id)}"><div><div class="data-title">${esc(d.title)}</div><div class="data-sub">${esc(d.detail||d.Message||'')}</div></div><div><span class="badge ${/warn|error/i.test(d.severity)?'amber':'blue'}">${esc(d.severity)}</span></div><div>${d.nodeId?`<span class="badge blue">Node ${esc(d.nodeId)}</span>`:''}</div><div></div></div>`).join('')||emptyHtml('No messages match','This scope has no messages matching the filter.')}</div>`;}
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
  const graph=model.fwd?.objectGraph||model.fwd?.editorModel?.objectGraph||{};
  const nodes=objectGraphNodesForResource(row);
  const privateNodes=nodes.filter(n=>text(n.kind)==='ResourcePrivateNode');
  if(!list(graph.nodes).length)return '';
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Object Graph</h4><p>Canonical FWD object graph nodes and private resource children linked to this definition.</p></div><span class="badge blue">${fmt(nodes.length)} nodes</span></div>${nodes.length?`<div class="mini-list">${nodes.slice(0,10).map(n=>`<div class="mini-row"><span><b>${esc(text(n.kind||'Object'))}</b> ${esc(text(n.name||n.id||''))}</span><span class="mono">${esc(text(first(n.metadata?.path,n.id,'')))}</span></div>`).join('')}</div>${privateNodes.length?`<div class="caption mt-8">${fmt(privateNodes.length)} private resource node(s) exposed for drill-through.</div>`:''}`:'<div class="global-empty-state compact">No object graph node is linked to this resource name.</div>'}</section>`;
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
  const metricLabel=kind==='udfs'?'caller rules':kind==='functions'?'observed rules':kind==='tables'?'rule refs':'rule refs';
  return `<div class="global-list-head"><span>${kind==='udfs'||kind==='functions'?'Functions':'Definitions'}</span><b>${fmt(rows.length)}</b></div><div class="table-index-list global-def-list">${rows.slice(0,800).map(row=>{
    const exceptionBadge=row.defined?'':`<span class="badge amber">Referenced</span>`;
    const metric=fmt(list(row.usage).length||row.metric);
    return `<button class="table-index-row ${row.key===selectedKey?'active':''}" type="button" data-global-kind="${esc(kind)}" data-global-key="${esc(row.key)}"><span class="table-index-main"><b>${esc(row.name)}</b><span>${esc(row.type)} · ${metric} ${metricLabel}</span></span><span class="table-index-side">${exceptionBadge}</span></button>`;
  }).join('')}</div>`;
}
function usagePreviewHtml(rows){
  const usage=list(rows);
  if(!usage.length)return '<div class="global-empty-state">No rule references are mapped for this definition in the current FWD snapshot.</div>';
  return `<div class="global-usage-preview">${usage.slice(0,8).map(row=>{
    const scopeId=text(row.scopeId||row.node?.scopeId||'');
    const nodeId=text(row.node?.id||'');
    const openButton=nodeId
      ? `<button class="btn ghost" type="button" data-node="${esc(nodeId)}" data-node-scope="${esc(scopeId)}" title="Open this rule and show its configuration">Open details</button>`
      : '<span class="badge amber">Unlinked</span>';
    return `<div class="global-usage-mini"><div><b>${esc(row.ruleName)}</b><span>${esc(scopeId)} · ${esc(row.functionName||row.relationshipKind||row.targetType||'Reference')}</span></div>${openButton}</div>`;
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
function udfFilterBarHtml(){
  return `<div class="udf-filter-strip" role="group" aria-label="UDF filters">${['with-callers','defined','unparsed','relationship-only','all'].map(f=>`<button class="${state.udfFilter===f?'active':''}" type="button" data-udf-filter="${f}">${esc(udfFilterLabel(f))}</button>`).join('')}</div>`;
}
function udfInterfaceHtml(u,callers){
  const params=effectiveUdfParameterNames(u);
  const status=list(first(u.statusResults,u.statuses,u.results,[])).map(text).filter(Boolean);
  const messages=list(u.messages).map(text).filter(Boolean);
  const paramsHtml=params.length
    ? `<div class="udf-token-strip">${params.slice(0,80).map(p=>`<span class="udf-token" title="${esc(p)}">${esc(p)}</span>`).join('')}</div>`
    : '<div class="global-empty-state compact">No named UDF parameters were extracted for this definition.</div>';
  const statusHtml=status.length
    ? `<div class="udf-token-strip">${status.slice(0,40).map(x=>`<span class="udf-token amber" title="${esc(x)}">${esc(x)}</span>`).join('')}</div>`
    : '<span class="muted">No explicit status list extracted.</span>';
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Interface</h4><p>Named field-list parameters and status values defined for this global UDF.</p></div><span class="badge blue">${fmt(params.length)} params</span></div><div class="udf-facts"><span><b>Definition</b>${u.defined?'FWD-defined':'Referenced'}</span><span><b>Caller rules</b>${fmt(callers.length)}</span><span><b>Type</b>${esc(u.type||'Function')}</span>${messages.length?`<span><b>Messages</b>${fmt(messages.length)}</span>`:''}</div><div class="table-columns-head">Parameters</div>${paramsHtml}${status.length?`<div class="table-columns-head">Status results</div>${statusHtml}`:''}</section>`;
}
function udfEvidenceHtml(u){
  const bindings=list(u.parameterBindings);
  const evidence=u.resourceEvidence||{};
  const attrHits=list(evidence.attributeHits);
  const treeHits=list(evidence.privateTreeHits);
  const diagnostics=list(u.messages).map(text).filter(Boolean);
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Definition Evidence</h4><p>Canonical UDF interface, caller-slot bindings, and private body parse state from the FWD resource packet.</p></div><span class="badge ${u.bodyParsed?'green':'blue'}">${u.bodyParsed?'body parsed':'body pending'}</span></div><div class="kv">${kv('Definition parsed',u.definitionParsed?'Yes':'No')}${kv('Resource config',evidence.hasConfig?'Available':'Unavailable')}${kv('Private tree',evidence.hasPrivateTree?'Available':'Unavailable')}${kv('Evidence hits',fmt(attrHits.length+treeHits.length))}</div>${bindings.length?`<div class="table-columns-head">Caller slot bindings</div><div class="global-param-matrix">${bindings.slice(0,24).map(b=>`<div class="global-param-card"><b>${esc(text(b.parameterName||''))}</b><small class="udf-param-raw">${esc(text(b.callerSlot||''))}</small><span>${esc(text(b.callerValue||''))}</span></div>`).join('')}</div>`:''}${treeHits.length?`<div class="table-columns-head">Private body hits</div><div class="mini-list">${treeHits.slice(0,8).map(h=>`<div class="mini-row"><span><b>${esc(text(h.role||''))}</b> ${esc(text(h.name||''))}</span><span class="mono">${esc(text(h.path||''))}</span></div>`).join('')}</div>`:''}${diagnostics.length?`<div class="table-columns-head">Diagnostics</div>${functionTokenStripHtml(diagnostics,'amber')}`:''}</section>`;
}
function udfCallerRulesHtml(callers,u){
  const rows=list(callers);
  if(!rows.length)return '<div class="global-empty-state">No caller rules are mapped for this UDF.</div>';
  return `<section class="udf-section-card udf-callers-card"><div class="udf-section-head"><div><h4>Caller rules</h4><p>Rules that call this UDF. Open a caller to switch to its page/document rule scope and show configuration.</p></div><span class="badge blue">${fmt(rows.length)} callers</span></div><div class="udf-caller-list">${rows.slice(0,160).map(c=>{
    const node=c.nodeId?model.nodesById.get(String(c.nodeId)):null;
    const scopeId=text(c.scopeId||node?.scopeId||'');
    const nodeId=text(c.nodeId||node?.id||'');
    const open=nodeId?`<button class="btn ghost" type="button" data-node="${esc(nodeId)}" data-node-scope="${esc(scopeId)}">Open config</button>`:'<span class="badge amber">Unlinked</span>';
    const interfaceNames=effectiveUdfParameterNames(u);
    const paramPreview=callerParameterEntries(c.parameters||{},interfaceNames).slice(0,3).map(entry=>`${entry.displayName}: ${entry.values.slice(0,2).join(', ')}`).filter(Boolean).join(' · ');
    return `<div class="udf-caller-row"><div class="udf-caller-main"><b>${esc(c.ruleName||'Unnamed rule')}</b><span>${esc(scopeId)} · ${esc(c.functionName||'UDF call')}</span>${paramPreview?`<small>${esc(paramPreview)}</small>`:''}</div>${open}</div>`;
  }).join('')}</div>${rows.length>160?`<div class="caption mt-8">Showing first 160 caller rules.</div>`:''}</section>`;
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
    const key=[nodeId,scopeId,ruleName,functionName,idx].join('|').toLowerCase();
    if(seen.has(key))return;seen.add(key);
    out.push({ruleName,functionName,scopeId,nodeId,parameters,raw});
  }
  const direct=first(u?.internalRules,u?.InternalRules,u?.ruleBody,u?.RuleBody,u?.bodyRules,u?.BodyRules,u?.definition?.ruleBody,u?.definition?.rules,[]);
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
  if(!rules.length)return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Internal Rules</h4><p>The internal UDF rule body is not present in the current snapshot payload.</p></div><span class="badge blue">0</span></div></section>`;
  return `<section class="udf-section-card udf-internal-rules-card"><div class="udf-section-head"><div><h4>Internal Rules</h4><p>Rules inside this UDF definition. Linked rules open with the same read-only configuration inspector.</p></div><span class="badge blue">${fmt(rules.length)} rules</span></div><div class="udf-caller-list">${rules.slice(0,160).map((r,i)=>{
    const node=r.nodeId?model.nodesById.get(String(r.nodeId)):null;
    const scopeId=text(r.scopeId||node?.scopeId||'');
    const nodeId=text(r.nodeId||node?.id||'');
    const interfaceNames=effectiveUdfParameterNames(u);
    const paramPreview=callerParameterEntries(r.parameters||{},interfaceNames).slice(0,3).map(entry=>`${entry.displayName}: ${entry.values.slice(0,2).join(', ')}`).filter(Boolean).join(' · ');
    const open=nodeId?`<button class="btn ghost" type="button" data-node="${esc(nodeId)}" data-node-scope="${esc(scopeId)}">Open config</button>`:'<span class="badge blue">definition row</span>';
    return `<div class="udf-caller-row"><div class="udf-caller-main"><b>${esc(r.ruleName||`Rule ${i+1}`)}</b><span>${esc(r.functionName||'no function')}${scopeId?` · ${esc(scopeId)}`:''}</span>${paramPreview?`<small>${esc(paramPreview)}</small>`:''}</div>${open}</div>`;
  }).join('')}</div>${rules.length>160?`<div class="caption mt-8">Showing first 160 internal rules.</div>`:''}</section>`;
}

function globalDetailRecord(){
  if(state.globalDetailKind==='resources')return {kind:'resources',label:'Resource details',row:buildGlobalResourceDefinitions().find(r=>r.key===state.selectedResourceKey)};
  if(state.globalDetailKind==='functions')return {kind:'functions',label:'Function details',row:buildGlobalFunctionDefinitions().find(r=>r.key===state.selectedFunctionName)};
  if(state.globalDetailKind==='drivers')return {kind:'drivers',label:'Driver details',row:buildGlobalDriverDefinitions().find(r=>r.key===state.selectedDriverKey)};
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
    return `<div class="global-modal-shell"><div class="global-modal-summary">${summaryTilesHtml([{label:'Parameters',value:fmt(list(row.parameterNames).length)},{label:'Caller rules',value:fmt(callers.length)},{label:'Type',value:esc(row.type)}])}</div><div class="table-columns-head">Parameters</div>${parameterMatrixHtml(callers,effectiveUdfParameterNames(row))}<div class="table-columns-head">Caller hierarchy</div>${usagePreviewHtml(callers.map(c=>({scopeId:c.scopeId,ruleName:c.ruleName,functionName:c.functionName,node:c.nodeId?model.nodesById.get(String(c.nodeId)):null,target:'',targetType:'UDF caller',relationshipKind:'Calls'})))}</div>`;
  }
  if(record.kind==='functions'){
    const f=row.fn||row;
    return `<div class="global-modal-shell"><div class="global-modal-summary">${summaryTilesHtml([{label:'Observed rules',value:fmt(first(f.observedRuleCount,row.metric,0))},{label:'Statuses',value:fmt(list(f.statusResults).length)},{label:'Category',value:esc(first(f.category,row.type,'Function'))}])}</div>${functionConfigurationHtml(f,row)}<div class="table-columns-head">Rule usage</div>${usagePreviewHtml(row.usage)}</div>`;
  }
  const usage=list(row.usage);
  const exceptionalOrigin=!row.defined;
  const tiles=[{label:'Usage rows',value:fmt(usage.length)},{label:'Type',value:esc(row.type||'Definition')}];
  if(exceptionalOrigin)tiles.splice(1,0,{label:'Origin',value:esc(row.source||'Inferred from usage')});
  return `<div class="global-modal-shell"><div class="global-modal-summary">${summaryTilesHtml(tiles)}</div><div class="table-columns-head">Rule usage</div>${usage.length?`<div class="global-usage-list">${usage.slice(0,160).map(u=>`<div class="global-usage-row"><div><b>${esc(u.ruleName)}</b><span>${esc(u.scopeId)} · ${esc(u.functionName||u.relationshipKind||u.targetType||'Reference')}</span></div>${u.node?`<button class="btn ghost" type="button" data-node="${esc(u.node.id)}" data-node-scope="${esc(u.scopeId||u.node.scopeId||'')}">Open details</button>`:`<span class="badge amber">Unlinked</span>`}<div class="definition-preview">${esc(u.target||'')}</div></div>`).join('')}</div>`:'<div class="global-empty-state">No rule usage is mapped for this definition.</div>'}</div>`;
}
function renderGlobalDefinitionExplorer(kind,rows,selectedKey,stateKey,copy,detailHtml){
  const q=lower(state.query).trim();
  if(q){
    rows=rows.filter(row=>lower([
      row.name,row.type,row.source,row.metric,
      JSON.stringify(row.fn||row.table||row.udf||row.details||{}),
      list(row.usage).map(u=>[u.scopeId,u.ruleName,u.functionName,u.target,u.targetType,u.relationshipKind].join(' ')).join(' ')
    ].join(' ')).includes(q));
  }
  if(!rows.length){$('content').innerHTML=`<section class="global-explorer">${emptyHtml(copy.emptyTitle,copy.emptyBody)}</section>`;return;}
  const selected=rows.find(r=>r.key===selectedKey)||rows[0];
  state[stateKey]=selected.key;
  const exceptionalOrigin=!selected.defined;
  const withUsage=rows.filter(r=>list(r.usage).length>0).length;
  const summaryLabel=kind==='udfs'||kind==='functions'?'functions':'definitions';
  const usageLabel=kind==='udfs'?'with callers':kind==='functions'?'observed':'used';
  const metricLabel=kind==='udfs'?'caller rules':kind==='functions'?'observed rules':'usage';
  const summary=`<div class="global-inline-summary"><span>${fmt(rows.length)} ${summaryLabel}</span><span>${fmt(withUsage)} ${usageLabel}</span></div>`;
  const originBadge=exceptionalOrigin?`<span class="badge amber">${esc(selected.source||'Inferred')}</span>`:'';
  const originFact=exceptionalOrigin?`<span><b>Origin</b>${esc(selected.source||'Inferred from usage')}</span>`:'';
  const detailSub=exceptionalOrigin?`${esc(selected.type)} · ${esc(selected.source||'Inferred')}`:esc(selected.type);
  $('content').innerHTML=`<section class="global-explorer global-explorer-${esc(kind)}">${summary}<div class="global-explorer-grid"><aside class="global-index-panel">${definitionListHtml(kind,rows,selected.key)}</aside><section class="global-detail-panel"><div class="global-detail-head"><div><h3>${esc(selected.name)}</h3><p>${detailSub}</p></div><div class="tree-detail-badges">${originBadge}<span class="badge blue">${fmt(list(selected.usage).length||selected.metric)} ${metricLabel}</span></div></div><div class="global-detail-facts"><span><b>Type</b>${esc(selected.type)}</span>${originFact}<span><b>${kind==='udfs'?'Callers':kind==='functions'?'Observed by':'Used by'}</b>${fmt(list(selected.usage).length||selected.metric)}</span></div>${detailHtml(selected)}<div class="global-detail-actions"><button class="btn" type="button" data-action="open-global-detail" data-global-kind="${esc(kind)}">Full details</button></div></section></div></section>`;
}
function renderGlobalResourceDefinitions(){
  renderGlobalDefinitionExplorer('resources',buildGlobalResourceDefinitions(),state.selectedResourceKey,'selectedResourceKey',{title:'Resources',body:'Global resources are shared definitions. The main panel stays focused on identity, graph membership, and usage status.',emptyTitle:'No resources found',emptyBody:'No FWD resources or usage-derived resources were discovered.'},row=>`${objectGraphPreviewHtml(row)}<div class="table-columns-head">Usage preview</div>${usagePreviewHtml(row.usage)}`);
}
function renderGlobalDriverDefinitions(){
  renderGlobalDefinitionExplorer('drivers',buildGlobalDriverDefinitions(),state.selectedDriverKey,'selectedDriverKey',{title:'Input / Output Drivers',body:'Driver definitions and process-private findings are global configuration definitions, not page or document children.',emptyTitle:'No drivers found',emptyBody:'No process driver definitions or driver-like definitions were discovered.'},row=>`<div class="table-columns-head">Finding preview</div>${usagePreviewHtml(row.usage)}`);
}

function functionUsageRowsForName(functionName){
  const target=lower(functionName);
  const rows=[];
  const seen=new Set();
  function add(scopeId,ruleName,fn,nodeId='',statusResults=[],parameters={},source='Rule usage'){
    const key=[scopeId,ruleName,fn,nodeId,source].join('|').toLowerCase();
    if(!fn||lower(fn)!==target||seen.has(key))return;
    seen.add(key);
    rows.push({scopeId:text(scopeId),ruleName:text(ruleName||'Unnamed rule'),functionName:text(fn),node:nodeId?model.nodesById.get(String(nodeId)):null,nodeId:text(nodeId),target:text(functionName),targetType:'Function',relationshipKind:source,statusResults:list(statusResults).map(text).filter(Boolean),parameters:parameters||{}});
  }
  model.nodes.forEach(n=>add(n.scopeId,n.title,n.fn,n.id,n.ActionNames,n.Parameters,'Structural rule'));
  model.inventory.forEach(r=>add(r.scopeId,r.title,r.fn,r.nodeId,r.ActionNames,r.Parameters,r.classification||'Flat inventory'));
  return rows.sort((a,b)=>a.scopeId.localeCompare(b.scopeId,undefined,{sensitivity:'base'})||a.ruleName.localeCompare(b.ruleName,undefined,{sensitivity:'base'}));
}
function runtimeImpactRowsForFunction(functionName){
  const target=lower(functionName);
  return list(model.fwd?.runtimeImpact?.items)
    .filter(i=>lower(i.functionName)===target)
    .sort((a,b)=>text(a.scopeId).localeCompare(text(b.scopeId),undefined,{sensitivity:'base'})||text(a.ruleName).localeCompare(text(b.ruleName),undefined,{sensitivity:'base'}));
}
function runtimeImpactEvidenceHtml(functionName){
  const rows=runtimeImpactRowsForFunction(functionName);
  if(!rows.length)return '';
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Runtime Impact Evidence</h4><p>Static function-specific impact records from the canonical runtime-impact packet. Native AC execution is not simulated.</p></div><span class="badge blue">${fmt(rows.length)} impacts</span></div><div class="mini-list">${rows.slice(0,12).map(row=>`<div class="mini-row"><span><b>${esc(text(row.impactType||'Impact'))}</b> ${esc(text(row.summary||''))}</span><span class="mono">${esc(text(row.ruleName||row.scopeId||''))}</span></div>`).join('')}</div>${rows.some(r=>list(r.behaviorFlags).length)?`<div class="table-columns-head">Behavior flags</div>${functionTokenStripHtml([...new Set(rows.flatMap(r=>list(r.behaviorFlags).map(text).filter(Boolean)))],'blue')}`:''}${rows.some(r=>list(r.relationshipTargets).length)?`<div class="caption mt-8">Relationship targets are available in the raw impact rows for deeper drill-through.</div>`:''}</section>`;
}
function inferClientFunctionCategory(functionName){
  const fn=lower(functionName);
  if(/udf|user.?defined/.test(fn))return 'User Defined';
  if(/table|selectionlist|lookup|fuzzy|\bsl\b/.test(fn))return 'Table';
  if(/format|copy|delete|plug|merge|limit/.test(fn))return 'Formatting';
  if(/check|test|compare|^is|^has/.test(fn))return 'Testing';
  if(/attr/.test(fn))return 'Intrinsic Attribute';
  if(/^_i/.test(fn))return 'Intrinsic';
  return 'Custom / Unknown';
}
function buildGlobalFunctionDefinitions(){
  const definedItems=list(model.fwd?.functions?.items);
  if(definedItems.length){
    return definedItems.map(f=>{
      const name=text(f.name);
      const usage=functionUsageRowsForName(name);
      const observed=Number(first(f.observedRuleCount,usage.length,0))||usage.length;
      return {
        key:name,
        name,
        type:text(first(f.category,'Function')),
        source:text(first(f.source,'Function catalog')),
        defined:first(f.defined,false)===true||first(f.functionResource,false)===true,
        metric:observed,
        usage,
        fn:f
      };
    }).filter(r=>r.name).sort((a,b)=>a.type.localeCompare(b.type,undefined,{sensitivity:'base'})||(b.metric-a.metric)||a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
  }
  return domainRowsByView('functions').map(r=>{
    const name=text(r.name);
    const usage=functionUsageRowsForName(name);
    return {
      key:name,
      name,
      type:inferClientFunctionCategory(name),
      source:'Structural and inventory usage',
      defined:false,
      metric:Number(first(r.count,usage.length,0))||usage.length,
      usage,
      fn:{name,category:inferClientFunctionCategory(name),description:'Function observed in static rule configuration. Catalog metadata was not available in this snapshot.',observedRuleCount:Number(first(r.count,usage.length,0))||usage.length,statusResults:[],configuredStatusResults:[...new Set(usage.flatMap(u=>u.statusResults))],observedParameterNames:[...new Set(usage.flatMap(u=>Object.keys(u.parameters||{})))],behaviorFlags:['UnknownStaticBehavior'],runtimeImpacts:['Inspect configured action lists and parameter bindings before inferring runtime behavior.'],diagnostics:['FunctionNotHydratedFromApi']}
    };
  }).filter(r=>r.name);
}
function functionTokenStripHtml(items,tone='blue',empty='None extracted.'){
  const values=list(items).map(text).filter(Boolean);
  return values.length?`<div class="udf-token-strip">${values.slice(0,80).map(x=>`<span class="udf-token ${esc(tone)}" title="${esc(x)}">${esc(x)}</span>`).join('')}</div>`:`<div class="global-empty-state compact">${esc(empty)}</div>`;
}
function functionConfigurationHtml(f,row){
  const statuses=list(f.statusResults).map(text).filter(Boolean);
  const configured=list(f.configuredStatusResults).map(text).filter(Boolean);
  const params=list(f.observedParameterNames).map(text).filter(Boolean);
  const roles=list(f.parameterRoles).map(text).filter(Boolean);
  const flags=list(f.behaviorFlags).map(text).filter(Boolean);
  const impacts=list(f.runtimeImpacts).map(text).filter(Boolean);
  const diagnostics=list(f.diagnostics).map(text).filter(Boolean);
  const facts=[
    ['Category',esc(first(f.category,row.type,'Function'))],
    ['Catalog',f.defined?'Curated definition':(f.functionResource?'Function resource':'Observed usage')],
    ['Observed rules',fmt(first(f.observedRuleCount,row.metric,0))],
    ['Relationships',fmt(first(f.relationshipCount,0))]
  ];
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Function Model</h4><p>${esc(first(f.description,'AC function observed in static FWD configuration.'))}</p></div><span class="badge ${f.deprecated?'amber':'blue'}">${f.deprecated?'deprecated':esc(first(f.source,row.source,'catalog'))}</span></div><div class="kv">${facts.map(([k,v])=>kv(k,v)).join('')}</div>${diagnostics.length?`<div class="table-columns-head">Diagnostics</div>${functionTokenStripHtml(diagnostics,'amber')}`:''}</section><section class="udf-section-card"><div class="udf-section-head"><div><h4>Interface</h4><p>Status results and parameters shown as configured/static evidence.</p></div><span class="badge blue">${fmt(statuses.length||configured.length)} statuses</span></div><div class="table-columns-head">Status results</div>${functionTokenStripHtml(statuses,'amber','No catalog or configured status results were extracted.')}${configured.length?`<div class="caption mt-8">Configured ActionNames from this snapshot: ${esc(configured.join(', '))}</div>`:''}<div class="table-columns-head">Parameter roles</div>${functionTokenStripHtml(roles,'blue','No curated parameter roles are available.')}${params.length?`<div class="table-columns-head">Observed parameter names</div>${functionTokenStripHtml(params,'blue')}`:''}</section><section class="udf-section-card"><div class="udf-section-head"><div><h4>Behavior / Runtime UX</h4><p>Static behavior flags and likely operator impact. Native AC execution is not simulated.</p></div><span class="badge blue">${fmt(flags.length)} flags</span></div>${functionTokenStripHtml(flags,'blue','No behavior flags are available.')}${impacts.length?`<div class="table-columns-head">Runtime impact</div><div class="mini-list">${impacts.map(x=>`<div class="mini-row"><span>${esc(x)}</span></div>`).join('')}</div>`:''}</section>${runtimeImpactEvidenceHtml(first(f.name,row.name,''))}`;
}
function renderGlobalFunctionDefinitions(){
  const rows=buildGlobalFunctionDefinitions();
  if(!rows.length){
    $('content').innerHTML=`<section class="global-explorer">${emptyHtml('No functions found','No function definitions or rule usage were discovered in this FWD snapshot.')}</section>`;
    return;
  }
  renderGlobalDefinitionExplorer('functions',rows,state.selectedFunctionName,'selectedFunctionName',{title:'Functions',body:'AC functions are first-class rule operations with parameters, status results, behavior flags, and runtime UX impact.',emptyTitle:'No functions found',emptyBody:'No function definitions or rule usage were discovered.'},row=>{
    return `${functionConfigurationHtml(row.fn,row)}<div class="table-columns-head">Used By</div>${usagePreviewHtml(row.usage)}<div class="table-columns-head">Raw</div><pre class="raw compact">${esc(JSON.stringify(row.fn,null,2))}</pre>`;
  });
}

// Build global table definitions and inferred column names from relationship co-occurrence.
function buildGlobalTableDefinitions(){
  const selectionItems=list(model.fwd?.selectionLists?.items);
  if(selectionItems.length){
    return selectionItems.map(t=>{
      const name=text(t.name);
      const usage=list(t.usageLinks).map(u=>({
        scopeId:text(u.scopeId),
        ruleName:text(u.ruleName||'SelectionList rule'),
        functionName:text(u.functionName||''),
        target:name,
        targetType:'SelectionList',
        relationshipKind:text(u.relationshipKind||'UsesTable'),
        matchLevel:text(first(u.confidence,t.confidence,'High')),
        node:u.ruleNodeId?model.nodesById.get(String(u.ruleNodeId)):null,
        nodeId:text(u.ruleNodeId||''),
        rel:u
      }));
      const matchFields=list(t.matchFields).map(f=>({name:text(f.name),hits:Number(first(f.hits,1))||1,matchLevel:text(first(f.confidence,'High')),role:'Match field'})).filter(f=>f.name);
      const plugFields=list(t.plugFields).map(f=>({name:text(f.name),hits:Number(first(f.hits,1))||1,matchLevel:text(first(f.confidence,'High')),role:'Plug field'})).filter(f=>f.name);
      const options=list(t.options);
      return {
        name,
        hits:usage.length,
        scopeCount:new Set(usage.map(u=>u.scopeId).filter(Boolean)).size,
        ruleCount:usage.length,
        defined:first(t.canonical,false)===true,
        inferred:first(t.canonical,false)!==true,
        parsedColumns:[...matchFields,...plugFields],
        usageDerivedFields:[],
        columns:[...matchFields,...plugFields],
        matchFields,
        plugFields,
        options,
        resourceEvidence:first(t.resourceEvidence,null),
        hasParsedSchema:first(t.schemaParsed,false)===true,
        optionsParsed:first(t.optionsParsed,false)===true,
        messages:list(first(t.diagnostics,[])).map(text).filter(Boolean),
        usage,
        raw:t
      };
    }).filter(t=>t.name).sort((a,b)=>(b.hits-a.hits)||a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
  }
  const definedTables=list(model.fwd?.tables?.items);
  const usageByTarget=tableUsageIndex(definedTables.map(t=>t.name));
  if(definedTables.length){
    return definedTables.map(t=>({
      name:text(t.name),
      hits:Number(first(t.referenceCount,0))||0,
      scopeCount:Number(first(t.scopeCount,0))||0,
      ruleCount:Number(first(t.ruleCount,0))||0,
      defined:!!t.defined,
      inferred:false,
      parsedColumns:list(first(t.parsedColumns,[])).map(c=>({name:text(c.name),hits:Number(first(c.hits,0))||0,matchLevel:text(first(first(c.matchLevel,c.confidence),'high'))})),
      usageDerivedFields:list(first(t.usageDerivedFields,t.columns,[])).map(c=>({name:text(c.name),hits:Number(first(c.hits,0))||0,matchLevel:text(first(first(c.matchLevel,c.confidence),'medium'))})),
      // Keep a compatibility merged view so existing list/detail UI remains stable.
      columns:[...new Map([...list(first(t.parsedColumns,[])),...list(first(t.usageDerivedFields,t.columns,[]))].map(c=>[text(c.name).toLowerCase(),{name:text(c.name),hits:Number(first(c.hits,0))||0,matchLevel:text(first(first(c.matchLevel,c.confidence),'medium'))}])).values()],
      hasParsedSchema:list(first(t.parsedColumns,[])).length>0,
      messages:list(first(t.messages,[])).map(text).filter(Boolean),
      usage:usageByTarget.get(text(t.name).toLowerCase())||[]
    }));
  }

  const rels=list(model.rels);
  const byRule=new Map();
  rels.forEach(r=>{
    const key=[text(first(r.ScopePath,r.scopeId)),text(first(r.RuleGuid,'')),text(first(r.RuleIndex,'')),text(first(r.RuleName,'')),text(first(r.FunctionName,''))].join('|');
    if(!byRule.has(key))byRule.set(key,[]);
    byRule.get(key).push(r);
  });

  const tables=new Map();
  function getTable(name){
    const tableName=text(name||'').trim();
    if(!tableName) return null;
    const key=tableName.toLowerCase();
    if(!tables.has(key))tables.set(key,{name:tableName,hits:0,scopes:new Set(),rules:new Set(),columns:new Map(),defined:false});
    return tables.get(key);
  }

  function addColumn(row,column,matchLevel){
    const col=text(column||'').trim();
    if(!col) return;
    const key=col.toLowerCase();
    if(!row.columns.has(key))row.columns.set(key,{name:col,hits:0,matchLevel});
    const current=row.columns.get(key);
    current.hits+=1;
    if(matchLevel==='high')current.matchLevel='high';
  }

  rels.forEach(r=>{
    if(!/table|indexed|lookup|db|database/i.test(`${r.targetType} ${r.kind} ${r.target}`)) return;
    const table=getTable(r.target||r.ParameterName||'');
    if(!table) return;
    const scopeId=text(first(r.ScopePath,r.scopeId,'Unscoped'));
    const ruleKey=[scopeId,text(first(r.RuleGuid,'')),text(first(r.RuleIndex,'')),text(first(r.RuleName,'')),text(first(r.FunctionName,''))].join('|');
    table.hits+=1;
    table.scopes.add(scopeId);
    table.rules.add(ruleKey);

    const peers=list(byRule.get(ruleKey));
    peers.forEach(peer=>{
      if(peer===r) return;
      const targetType=lower(peer.targetType);
      const parameterRole=lower(peer.ParameterRole);
      const candidate=text(peer.target||peer.ParameterName||'').trim();
      if(!candidate) return;
      if(candidate.toLowerCase()===table.name.toLowerCase()) return;
      if(/field|attribute/.test(targetType)||/field|column|attribute/.test(parameterRole)) addColumn(table,candidate,'high');
      else if(peer.ParameterName&&/field|column|attr/i.test(peer.ParameterName)) addColumn(table,candidate,'medium');
    });
  });

  const definedBuckets=list(model.fwd?.resources?.buckets).filter(b=>/table|db|database|lookup/i.test(text(b.type)));
  definedBuckets.forEach(bucket=>{
    list(bucket.names).forEach(name=>{
      const table=getTable(name);
      if(table)table.defined=true;
    });
  });

  return [...tables.values()]
    .map(t=>({
      name:t.name,
      hits:t.hits,
      scopeCount:t.scopes.size,
      ruleCount:t.rules.size,
      defined:t.defined,
      inferred:true,
      parsedColumns:[],
      usageDerivedFields:[...t.columns.values()].sort((a,b)=>(b.hits-a.hits)||a.name.localeCompare(b.name)).slice(0,24),
      columns:[...t.columns.values()].sort((a,b)=>(b.hits-a.hits)||a.name.localeCompare(b.name)).slice(0,24),
      hasParsedSchema:false,
      messages:['TableSchemaNotParsed'],
      usage:usageRowsForDefinition(r=>text(r.target).toLowerCase()===t.name.toLowerCase())
    }))
    .sort((a,b)=>(b.hits-a.hits)||a.name.localeCompare(b.name));
}


function tableConfigurationHtml(t,row){
  const parsedCols=list(t.parsedColumns);
  const usageCols=list(t.usageDerivedFields);
  const options=list(t.options);
  const evidence=t.resourceEvidence||{};
  const facts=[
    ['Resource type',esc(row.type||t.resourceType||'Table')],
    ['Schema',t.hasParsedSchema?'Parsed from SelectionList resource evidence':'Definition present; schema not parsed'],
    ['Options',t.optionsParsed?`${fmt(options.length)} parsed`:'Not parsed'],
    ['Configured match fields',fmt(list(t.matchFields).length||parsedCols.length)],
    ['Configured plug fields',fmt(list(t.plugFields).length)],
    ['Private tree',evidence.hasPrivateTree?'Available':'Unavailable'],
    ['Referenced fields',fmt(usageCols.length)],
    ['Rule references',fmt(list(row.usage).length||t.ruleCount||t.hits||0)],
    ['Scope count',fmt(t.scopeCount||0)]
  ];
  return `<section class="table-config-card"><div class="udf-section-head"><div><h4>Configuration</h4><p>SelectionList/table definition details first; rule usage is secondary.</p></div><span class="badge ${t.hasParsedSchema?'green':'blue'}">${t.hasParsedSchema?'schema parsed':'definition'}</span></div><div class="kv">${facts.map(([k,v])=>kv(k,v)).join('')}</div>${options.length?`<div class="table-columns-head">Options</div><div class="udf-token-strip">${options.slice(0,40).map(o=>`<span class="udf-token amber" title="${esc(text(o.value||''))}">${esc(text(o.role||o.name||'Option'))}</span>`).join('')}</div>`:''}</section>`;
}
function tableColumnsHtml(t){
  const matchFields=list(t.matchFields);
  const plugFields=list(t.plugFields);
  if(matchFields.length||plugFields.length){
    const group=(label,rows)=>rows.length?`<div class="table-columns-head">${esc(label)}</div><div class="table-columns-grid">${rows.map(c=>`<div class="table-column-row"><div class="table-col-name">${esc(c.name)}</div><div class="table-col-meta"><span class="badge blue">${esc(c.role||label)}</span><span class="mono">${esc(c.matchLevel||c.confidence||'parsed')}</span></div></div>`).join('')}</div>`:'';
    return `${group('Match fields',matchFields)}${group('Plug fields',plugFields)}`;
  }
  const parsedCols=list(t.parsedColumns);
  if(parsedCols.length){
    return `<div class="table-columns-grid">${parsedCols.map(c=>`<div class="table-column-row"><div class="table-col-name">${esc(first(c.name,c.Name,c.column,c.Column,''))}</div><div class="table-col-meta"><span class="mono">${esc(first(c.type,c.Type,c.kind,c.Kind,'column'))}</span></div></div>`).join('')}</div>`;
  }
  const usageCols=list(t.usageDerivedFields);
  return usageCols.length?`<div class="table-columns-grid">${usageCols.map(c=>`<div class="table-column-row"><div class="table-col-name">${esc(c.name)}</div><div class="table-col-meta"><span class="badge blue">${fmt(c.hits)} refs</span><span class="mono">referenced by rules</span></div></div>`).join('')}</div>`:'<div class="global-empty-state">No table columns or field references were extracted.</div>';
}
function renderGlobalTablesMasterDetail(){
  const tables=buildGlobalTableDefinitions();
  const isDefined=list(model.fwd?.selectionLists?.items).length>0||list(model.fwd?.tables?.items).length>0;
  const explorerRows=tables.map(t=>({key:t.name,name:t.name,type:t.hasParsedSchema?'SelectionList / Table':'Table',source:t.inferred?'Referenced by rule configuration':'FWD payload',defined:t.defined,metric:t.hits,usage:list(t.usage),table:t}));
  if(!tables.length){
    $('content').innerHTML=`<section class="global-explorer">${emptyHtml('No tables found','No table definitions were discovered in FWD resources or rule relationships.')}</section>`;
    return;
  }
  const explorerSelected=explorerRows.find(r=>r.key===state.selectedTableName)||explorerRows[0];
  state.selectedTableName=explorerSelected.key;
  renderGlobalDefinitionExplorer('tables',explorerRows,state.selectedTableName,'selectedTableName',{title:'Tables',body:isDefined?'FWD table definitions with parsed schema and rule references.':'Table names are shown when they appear in rule configuration.',emptyTitle:'No tables found',emptyBody:'No table definitions were discovered.'},row=>{
    const t=row.table;
    return `${tableConfigurationHtml(t,row)}<div class="table-columns-head">Fields / Columns</div>${tableColumnsHtml(t)}<div class="table-columns-head">Used By</div>${usagePreviewHtml(row.usage)}<div class="table-columns-head">Raw</div><pre class="raw compact">${esc(JSON.stringify(t,null,2))}</pre>`;
  });
}


// Build UDF rows with optional defined details for list/detail rendering.
function buildUdfDefinitions(){
  function fnEq(left,right){return text(left).trim().toLowerCase()===text(right).trim().toLowerCase();}
  function configuredRulesFor(fnName){
    const collected=[];
    const seen=new Set();
    function pushRule(scopeId,ruleName,fn,parameters,nodeId=''){
      const key=[text(scopeId),text(ruleName),text(fn)].join('|').toLowerCase();
      if(seen.has(key))return;
      seen.add(key);
      collected.push({scopeId:text(scopeId),ruleName:text(ruleName||'Unnamed rule'),functionName:text(fn),parameters:parameters||{},nodeId:text(nodeId)});
    }
    model.nodes.forEach(n=>{if(fnEq(n.fn,fnName))pushRule(n.scopeId,n.title,n.fn,n.Parameters,n.id);});
    model.inventory.forEach(r=>{if(fnEq(r.fn,fnName))pushRule(r.scopeId,r.title,r.fn,r.Parameters,r.nodeId);});
    return collected;
  }
  function parameterNamesFromRules(rules){
    const names=new Set();
    rules.forEach(r=>Object.keys(r.parameters||{}).forEach(k=>{if(text(k).trim())names.add(text(k).trim());}));
    return [...names].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
  }
  function mergeUdfParameterNames(definedNames,callerNames){
    const realDefined=realUdfParameterNames(definedNames);
    const nonGenericCallers=list(callerNames).map(text).filter(Boolean).filter(x=>!isGenericParamSlotName(x));
    const source=realDefined.length?[...realDefined,...nonGenericCallers]:[...list(definedNames).map(text).filter(Boolean),...nonGenericCallers];
    return [...new Set(source)].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
  }
  const definedItems=list(model.fwd?.canonicalUdfs?.items).length?list(model.fwd?.canonicalUdfs?.items):list(model.fwd?.udfs?.items);
  if(definedItems.length){
    return definedItems.map(u=>{
      const type=text(u.resourceType);
      const rawName=text(u.name);
      const displayName=/^function$/i.test(type)?rawName:`${type}: ${rawName}`;
      const matchedRules=configuredRulesFor(rawName||displayName);
      const canonicalCallers=list(first(u.callerBindings,[])).map(c=>({
        scopeId:text(c.scopeId),
        ruleName:text(c.ruleName||'UDF caller'),
        functionName:text(c.functionName||rawName),
        parameters:first(c.parameters,{}),
        nodeId:text(first(c.ruleNodeId,c.nodeId,''))
      }));
      const callerRules=canonicalCallers.length?canonicalCallers:matchedRules;
      const derivedParamNames=parameterNamesFromRules(matchedRules);
      const definedParamNames=list(first(u.fieldListParameters,u.parameterNames,u.parameters,[])).map(text).filter(Boolean);
      const parameterNames=mergeUdfParameterNames(definedParamNames,derivedParamNames);
      const definedRules=list(first(u.ruleNames,u.usedByRules,u.rules,[])).map(text).filter(Boolean);
      const configuredRules=callerRules.map(r=>`${r.ruleName} · ${r.scopeId}`);
      const rules=[...new Set([...definedRules,...configuredRules])].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
      return {
        key:rawName||displayName,
        displayName,
        rawName,
        type:type||'Function',
        count:Number(first(u.usedByRuleCount,u.count,callerRules.length,0))||0,
        scopeCount:Number(first(u.scopeCount,0))||0,
        defined:!!first(u.defined,true),
        inferred:!!u.inferred,
        definitionParsed:first(u.definitionParsed,u.parsed,u.hasParsedDefinition,false)===true,
        bodyParsed:first(u.bodyParsed,u.hasParsedBody,false)===true,
        messages:list(first(u.diagnostics,u.messages,u.warnings,[])),
        classification:text(first(u.classification,'')),
        matchLevel:text(first(u.matchLevel,'')),
        source:text(first(u.source,u.definitionSource,'')),
        scopes:list(first(u.scopeIds,u.scopes,u.usedByScopes,[])).map(text).filter(Boolean),
        rules,
        callerRules,
        parameterNames,
        parameterBindings:list(first(u.fieldListParameterBindings,[])),
        statusResults:list(first(u.statusResults,u.statuses,u.results,u.definition?.statusResults,[])).map(text).filter(Boolean),
        internalRules:normalizeUdfInternalRules(u,rawName,matchedRules),
        resourceEvidence:first(u.resourceEvidence,null),
        rawResourceDetails:first(u.rawResourceDetails,u.rawDetails,u.resourceEvidence,null)
      };
    });
  }
  return domainRowsByView('udfs').map(r=>{
    const fnName=text(r.name);
    const matchedRules=configuredRulesFor(fnName);
    return {
    key:fnName,
    displayName:fnName,
    rawName:fnName,
    type:'Function',
    count:Number(first(r.count,0))||0,
    scopeCount:0,
    defined:false,
    inferred:true,
    definitionParsed:false,
    bodyParsed:false,
    messages:[],
    classification:'RegexOnly',
    matchLevel:'',
    source:'Derived from structural/inventory functions',
    scopes:[],
    rules:matchedRules.map(x=>`${x.ruleName} · ${x.scopeId}`).sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'})),
    callerRules:matchedRules,
    parameterNames:mergeUdfParameterNames([],parameterNamesFromRules(matchedRules)),
    parameterBindings:[],
    statusResults:[],
    internalRules:normalizeUdfInternalRules(r,fnName,matchedRules),
    resourceEvidence:null,
    rawResourceDetails:null
  };});
}

// Render UDF list/detail with underscore-prefix grouping and clickable details.
function udfFilterLabel(filter){return ({'with-callers':'Has caller trees',defined:'Defined',unparsed:'Needs parsing','relationship-only':'Relationship-only',all:'All'})[filter]||'All';}
function passesUdfFilter(row){
  if(state.udfFilter==='with-callers')return list(row.callerRules).length>0||list(row.rules).length>0;
  if(state.udfFilter==='defined')return !!row.defined;
  if(state.udfFilter==='unparsed')return row.definitionParsed===false||list(row.messages).length>0;
  if(state.udfFilter==='relationship-only')return !row.defined&&list(row.rules).length>0;
  return true;
}
function renderUdfMasterDetail(){
  const allRows=buildUdfDefinitions().sort((a,b)=>a.displayName.localeCompare(b.displayName,undefined,{sensitivity:'base'}));
  const rows=allRows.filter(passesUdfFilter);
  if(!rows.length){
    $('content').innerHTML=`<section class="global-explorer global-explorer-udfs">${udfFilterBarHtml()}${emptyHtml('No user defined functions match','Choose a broader UDF filter or clear search.')}</section>`;
    return;
  }
  const selected=rows.find(r=>r.key===state.selectedUdfName)||rows[0];
  state.selectedUdfName=selected.key;
  const groups=new Map();
  rows.forEach(r=>{
    const rhs=r.displayName.includes(': ')?r.displayName.split(': ').slice(1).join(': '):r.displayName;
    const idx=rhs.indexOf('_');
    const groupKey=idx>0?`${rhs.slice(0,idx)}_`:'Other';
    if(!groups.has(groupKey))groups.set(groupKey,[]);
    groups.get(groupKey).push(r);
  });
  const ordered=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'}));
  const udfExplorerRows=rows.map(r=>({key:r.key,name:r.displayName,type:r.type,source:r.source||'Candidate definition',defined:r.defined,metric:list(r.callerRules).length,usage:list(r.callerRules).map(c=>({scopeId:c.scopeId,ruleName:c.ruleName,functionName:c.functionName,node:c.nodeId?model.nodesById.get(String(c.nodeId)):null,target:'',targetType:'UDF caller',relationshipKind:'Calls'})),udf:r}));
  renderGlobalDefinitionExplorer('udfs',udfExplorerRows,state.selectedUdfName,'selectedUdfName',{title:'User Defined Functions',body:'UDFs are global functions. Parameters and caller hierarchy are summarized here; caller details open in a focused view.',emptyTitle:'No UDFs found',emptyBody:'No UDF candidates match the current filter.'},row=>{
    const u=row.udf;
    const callers=list(u.callerRules);
    return `<div class="udf-detail-stack">${udfFilterBarHtml()}${udfInterfaceHtml(u,callers)}${udfEvidenceHtml(u)}${udfInternalRulesHtml(u)}${udfCallerRulesHtml(callers,u)}</div>`;
  });
  return;

}

function renderDomainCatalog(title,rows,caption){
  const isUdfView=state.workspaceView==='udfs';
  const sortedRows=list(rows).slice().sort((a,b)=>text(a.name).localeCompare(text(b.name),undefined,{sensitivity:'base'}));
  // Group UDF rows by the token before the first underscore for faster visual scanning.
  const udfGroupedHtml=isUdfView&&sortedRows.length?(()=>{
    const groups=new Map();
    sortedRows.forEach(r=>{
      const display=text(r.name);
      const rhs=display.includes(': ')?display.split(': ').slice(1).join(': '):display;
      const idx=rhs.indexOf('_');
      const groupKey=idx>0?`${rhs.slice(0,idx)}_`:'Other';
      if(!groups.has(groupKey))groups.set(groupKey,[]);
      groups.get(groupKey).push(r);
    });
    const ordered=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'}));
    return `<div class="table-list">${ordered.map(([groupKey,items])=>`<div class="scope-group"><span>${esc(groupKey)}</span><span class="section-count">${fmt(items.length)}</span></div>${items.map(r=>`<div class="data-row compact"><div><div class="data-title">${esc(r.name)}</div></div></div>`).join('')}`).join('')}</div>`;
  })():'';
  const defaultRowsHtml=`<div class="table-list">${sortedRows.slice(0,5000).map(r=>`<div class="data-row compact"><div><div class="data-title">${esc(r.name)}</div></div></div>`).join('')}</div>`;
  $('content').innerHTML=`<div class="notice"><div class="notice-icon">i</div><div><b>${esc(title)} view.</b> ${esc(caption)} Cross-check with structural nodes before treating entries as runtime behavior.</div></div><div class="panel"><h3>${esc(title)}</h3>${sortedRows.length?(isUdfView?udfGroupedHtml:defaultRowsHtml):emptyHtml(`No ${title.toLowerCase()} found`,`No matching ${title.toLowerCase()} entries in the current scope.`)}</div>`;
}
function emptyHtml(title,body){return `<div class="empty"><div class="empty-card"><h2>${esc(title)}</h2><p>${esc(body)}</p></div></div>`;}
function cssEscape(value){
  const s=text(value);
  if(window.CSS&&typeof window.CSS.escape==='function')return window.CSS.escape(s);
  return s.replace(/[^a-zA-Z0-9_-]/g,ch=>`\\${ch}`);
}
function kv(k,v){return `<div class="k">${esc(k)}</div><div class="v">${v}</div>`;}
function treeRow(n,level){
  const id=String(n.id);
  const selected=state.selectedType==='node'&&state.selectedId===id;
  const hasKids=childIds(id).length>0||childRouteGroups(id).length>0;
  const expanded=state.expanded.has(id)||id===state.focusNodeId;
  const pathIds=selectedPathIds();
  const inPath=pathIds.has(id);
  const hot=isHotspotNode(n);
  const levelNo=Math.max(1,Math.min(4,Number(state.disclosureLevel||2)));
  const incoming=model.incomingByChild.get(id);
  const messages=hasDiag(n);
  const disabledBadge=n.disabled!=='none'?`<span class="badge amber state-badge">${n.disabled==='direct'?'disabled':n.disabled==='inherited'?'parent-disabled':'sequence-only'}</span>`:'';
  const fnMeta=levelNo>=2?`<span class="tree-meta">${esc(n.fn||'No function mapped')}</span>`:'';
  const stateMeta=levelNo>=3?`${disabledBadge}${messages?'<span class="badge amber">message</span>':''}${hasKids?`<span class="badge blue">${fmt(childIds(id).length)} child</span>`:''}`:'';
  const routeMeta=levelNo>=4?`<span class="tree-route-mini">${incoming?routeChip(incoming):'<span class="route-chip root">root rule list</span>'}</span>`:'';
  return `<div class="tree-row ${selected?'selected':''} ${inPath?'active-path':''} ${hot?'hotspot':''}" role="treeitem" aria-level="${level+1}" aria-expanded="${hasKids?(expanded?'true':'false'):'false'}" aria-selected="${selected?'true':'false'}" tabindex="0" data-node="${esc(id)}" style="--depth:${level}"><span class="tree-left">${hasKids?`<span class="twisty" data-toggle-node="${esc(id)}" aria-hidden="true" title="${expanded?'Collapse':'Expand'}">${expanded?'−':'+'}</span>`:'<span class="twisty ghost" aria-hidden="true">·</span>'}<span class="tree-main"><b class="tree-name">${esc(n.title)}</b>${fnMeta}<span class="tree-row-badges">${stateMeta}${routeMeta}</span></span></span>${hasKids?`<span class="mini-row-btn" data-toggle-node="${esc(id)}" aria-hidden="true" title="${expanded?'Collapse':'Expand'}">${expanded?'−':'+'}</span>`:''}</div>`;
}
function renderNoData(){
  const detail=bootState.detail||'No FWD snapshot files could be loaded.';
  $('sourceSubtitle').textContent='No snapshot data available';
  $('statusPill').innerHTML='<span class="dot warn"></span><span>FWD load failed</span>';
  const banner=optionalElement('globalErrorBanner');
  if(banner){
    banner.textContent=`FWD load failed: ${detail}`;
    banner.hidden=false;
  }
  $('globalNav').innerHTML='';
  $('scopeList').innerHTML=emptyHtml('No scopes available','Generate a snapshot or verify the FWD path.');
  $('content').innerHTML=emptyHtml('No FWD structure found',detail);
}
// Curated in-product guide content for first-use navigation.
function renderHelp(){
  const quickStart=`<div class="panel"><h3>Quick Start</h3><ol class="config-list"><li>Choose a FormWorks scope or global definition from the left rail.</li><li>Open <b>Structure</b> to inspect rule lists, parent rules, status results, and action lists.</li><li>Select a rule to review function metadata, fields/parameters, attributes, status-result actions, references, messages, and raw FWD data.</li><li>Use <b>Functions</b>, <b>UDFs</b>, and <b>Tables</b> for AC function behavior, reusable rule-list functions, and SelectionList/table lookup configuration.</li></ol></div>`;
  const editorModel=`<div class="panel"><h3>FormWorks Editor Model</h3><div class="kv">${kv('FWD/STC','Documents, pages, variants, fields, batches, processes, resources, and private configuration nodes.')}${kv('Read-only boundary','FW Editor authors and saves the FWD. This workbench inspects static configuration only.')}${kv('Runtime boundary','The viewer does not execute AC, run AC Rules Tester, or prove actual claim outcomes.')}</div></div>`;
  const ruleModel=`<div class="panel"><h3>AC Rule Model</h3><div class="mini-list"><div class="mini-row"><span><b>Rule List</b></span><span class="caption">Ordered rules in a page, document, UDF, or process scope</span></div><div class="mini-row"><span><b>Rule</b></span><span class="caption">Function plus fields/parameters, attributes, sources, and actions</span></div><div class="mini-row"><span><b>Status Result</b></span><span class="caption">Function return token owned by the parent rule</span></div><div class="mini-row"><span><b>Action List</b></span><span class="caption">Sub-list selected by a status result; not a rule</span></div></div></div>`;
  const functionModel=`<div class="panel"><h3>Functions, UDFs, Tables</h3><div class="kv">${kv('Function categories','Intrinsic, Tcl/custom, User Defined, Testing, Formatting, Rectifying, Table, Store, Deprecated.')}${kv('UDFs','Reusable rule-list functions with named field-list parameters, status results, internal rules, and caller bindings.')}${kv('SelectionLists','Lookup configuration: table identity, match fields, plug fields, persistence, rerun triggers, and keyer impact.')}</div></div>`;
  const fwdModel=`<div class="panel"><h3>Evidence Classes</h3><div class="kv">${kv('Structure','Hierarchy, rule order, parent rules, action-list order, and disabled inheritance.')}${kv('Inventory','Broad search and completeness evidence; not hierarchy proof.')}${kv('References','Static relationships. Read confidence and parameter role explicitly.')}${kv('Messages','Snapshot diagnostics that may affect completeness.')}${kv('Raw','Final confirmation when formatted views are incomplete.')}</div></div>`;
  const docsModel=`<div class="panel"><h3>Project Docs</h3><div class="kv">${kv('Model guide','docs/formworks-editor-ac-reference-guide.md')}${kv('Code catalog','docs/project-code-catalog.md')}${kv('Gap plan','docs/editor-gap-closure-plan.md')}</div><div class="caption mt-8">Use these files for implementation decisions. The viewer remains a read-only inspection surface and does not replace FormWorks Editor authoring or AC Rules Tester execution.</div></div>`;
  const operators=`<div class="panel"><h3>Search Operators</h3><div class="mini-list"><div class="mini-row"><span><b>action:"Run Rules"</b></span><span class="caption">Match action-list labels</span></div><div class="mini-row"><span><b>function:_IGetDocAttr</b></span><span class="caption">Match mapped function</span></div><div class="mini-row"><span><b>has:disabled</b></span><span class="caption">Rules with disable usage</span></div><div class="mini-row"><span><b>children&gt;20</b></span><span class="caption">Large structural nodes</span></div><div class="mini-row"><span><b>scope:DentalADA</b></span><span class="caption">Scope-limited matches</span></div></div></div>`;
  const shortcuts=`<div class="panel"><h3>Keyboard Shortcuts</h3><div class="kv">${kv('/','Focus global search')}${kv('Alt + A','Expand all visible rules')}${kv('Alt + D','Expand selected rule one level')}${kv('Alt + P','Collapse selected rule peers')}${kv('Alt + F','Clear focus/subtree mode')}</div><div class="caption mt-8">Tip: Use arrow keys and Enter to review dense trees without leaving the keyboard.</div></div>`;
  $('helpBody').innerHTML=`${quickStart}${editorModel}${ruleModel}${functionModel}${fwdModel}${docsModel}${operators}${shortcuts}`;
}
function renderScopeInspector(s){const hotspots=scopedRuleNodes().filter(isHotspotNode).length;$('inspectorBody').innerHTML=`<details class="inspector-section" open><summary>Scope summary <span class="section-count">${fmt(s.structural)} rules</span></summary><div class="inspector-section-body"><div class="kv">${kv('Scope ID',esc(s.scopeId))}${kv('Kind',esc(s.kind))}${kv('Structural rules',fmt(s.structural))}${kv('Large/branched rules',fmt(hotspots))}${kv('Messages',s.diags?`<span class="badge amber">${fmt(s.diags)}</span>`:'<span class="badge green">None</span>')}</div><div class="caption mt-10">Select a rule in the structure view to inspect its read-only configuration.</div></div></details>`;}

function configStatusStripHtml(n){const incoming=model.incomingByChild.get(n.id);const refs=model.rels.filter(r=>String(r.nodeId)===String(n.id));const diags=model.diags.filter(d=>String(d.nodeId)===String(n.id));const inv=model.inventory.find(r=>String(r.nodeId)===String(n.id));const actionOk=!incoming||incoming.resolved;const disabledLabel=n.disabled==='none'?'Not disabled':n.disabled==='direct'?'Direct disabled':n.disabled==='possible'?'Sequence-only hint':'Inherited disabled';return `<div class="trust-strip" aria-label="Selected rule configuration summary"><div class="trust-item info"><b>Object</b><span>FWD tree node</span></div><div class="trust-item ${actionOk?'good':'warn'}"><b>Action list</b><span>${actionOk?'Named':'Index only'}</span></div><div class="trust-item good"><b>Disabled state</b><span>${esc(disabledLabel)}</span></div><div class="trust-item ${inv?'good':'warn'}"><b>Flat row</b><span>${inv?'Linked':'No row'}</span></div><div class="trust-item ${refs.length?'info':'warn'}"><b>References</b><span>${fmt(refs.length)}</span></div><div class="trust-item ${diags.length?'warn':'good'}"><b>Messages</b><span>${diags.length?fmt(diags.length):'None linked'}</span></div></div>`;}
function rulePlainLanguageNarrative(n){
  const incoming=model.incomingByChild.get(n.id);
  const branches=childRouteGroups(n.id);
  const fieldResolution=resolveNodeFieldReferences(n);
  const fields=fieldResolution.items.map(i=>i.referencedField).filter(Boolean).slice(0,12);
  const disabled=n.disabled==='none'?'enabled':n.disabled==='direct'?'directly disabled':n.disabled==='inherited'?'disabled by a parent branch':'marked with sequence-only disabled suspicion';
  return [`Rule: ${n.title}`,`Function: ${n.fn||'No mapped function'}`,`Scope: ${n.scopeId}`,`State: ${disabled}`,incoming?`Runs under parent status result/action list: ${incoming.label}${incoming.resolved?'':' (label unnamed/index-only)'}`:'Root rule-list entry',fields.length?`Field-like inputs: ${fields.join(', ')}`:'No field-like inputs detected',branches.length?`Status results / action lists: ${branches.map(b=>`${b.label} (${b.childIds.length} child rules)`).join('; ')}`:'No child action lists detected','Note: this is static FWD structure, not a runtime execution trace.'].join('\n');
}
function pathNarrativeHtml(n){
  const lines=rulePlainLanguageNarrative(n).split('\n');
  return `<div class="path-narrative"><h3>Parent Rule / Sub-list Path</h3><ul>${lines.map(line=>`<li>${esc(line)}</li>`).join('')}</ul><div class="branch-actions"><button class="btn" type="button" data-action="copy-rule-explanation">Copy summary</button><button class="btn" type="button" data-action="copy-route-path">Copy path</button></div></div>`;
}
function selectedPathPacket(n){const incoming=model.incomingByChild.get(n.id);return {schema:'AcWorkbench.SelectedRulePath',schemaVersion:'1.0.0',copiedAt:new Date().toISOString(),scopeId:n.scopeId,identity:{nodeId:n.id,ruleName:n.title,functionName:n.fn,ruleGuid:n.RuleGuid||null},incomingAction:incoming?{label:incoming.label,routeState:incoming.routeState||null,actionName:first(incoming.ActionName,incoming.actionName,null),actionListIndex:first(incoming.ActionListIndex,incoming.actionListIndex,null),resolved:!!incoming.resolved,}:null,path:pathObjects(n),outgoingActions:(model.edgesByParent.get(n.id)||[]).map(e=>({label:e.label,routeState:e.routeState||null,actionName:first(e.ActionName,e.actionName,null),actionListIndex:first(e.ActionListIndex,e.actionListIndex,null),resolved:!!e.resolved,toNodeId:e.to,childName:model.nodesById.get(String(e.to))?.title||null})),caveat:'Parent-rule path comes from the parsed FWD hierarchy. It is read-only configuration, not a runtime execution trace.'};}

function canonicalRuleConfigurationForNode(n){
  const ruleLists=list(model.fwd?.editorModel?.ruleLists);
  const ruleList=ruleLists.find(r=>sameName(r.ruleListId,n.scopeId)||sameName(r.scopeId,n.scopeId));
  if(!ruleList)return null;
  const configs=list(ruleList.ruleConfigurations);
  return configs.find(c=>sameName(c.nodeId,n.id))
    || configs.find(c=>text(c.ruleGuid)&&text(n.RuleGuid)&&sameName(c.ruleGuid,n.RuleGuid))
    || configs.find(c=>text(c.name)&&sameName(c.name,n.title))
    || null;
}
function canonicalRuleConfigurationHtml(n){
  const config=canonicalRuleConfigurationForNode(n);
  if(!config)return '';
  const schema=config.functionSchema||{};
  const rejects=list(config.rejects);
  const sources=list(config.sourceHandles);
  const diagnostics=list(config.diagnostics).map(text).filter(Boolean);
  const actions=list(config.actionLists);
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>RuleConfiguration Packet</h4><p>Snapshot-wide FormWorks editor model for this Rule: function schema, status results, rejects, source handles, and ambiguity diagnostics.</p></div><span class="badge ${diagnostics.length?'amber':'green'}">${diagnostics.length?'diagnostics':'canonical'}</span></div><div class="kv">${kv('Function schema',schema.defined?'Catalog-defined':'Observed')}${kv('Configured statuses',fmt(list(schema.configuredStatusResults).length))}${kv('Action Lists',fmt(actions.length))}${kv('Source handles',fmt(sources.length))}${kv('Reject mappings',fmt(rejects.length))}</div>${list(schema.behaviorFlags).length?`<div class="table-columns-head">Behavior flags</div>${functionTokenStripHtml(schema.behaviorFlags,'blue')}`:''}${rejects.length?`<div class="table-columns-head">Reject message/code</div><div class="mini-list">${rejects.map(r=>`<div class="mini-row"><span><b>${esc(text(r.parameterName||r.kind||'Reject'))}</b> ${esc(text(r.message||r.code||r.target||''))}</span><span class="badge blue">${esc(text(r.confidence||''))}</span></div>`).join('')}</div>`:''}${sources.length?`<div class="table-columns-head">Source handles</div><div class="mini-list">${sources.slice(0,8).map(s=>`<div class="mini-row"><span><b>${esc(text(s.source||''))}</b> ${esc(text(s.authority||''))}</span><span class="mono">${esc(text(s.path||''))}</span></div>`).join('')}</div>`:''}${diagnostics.length?`<div class="table-columns-head">Diagnostics</div>${functionTokenStripHtml(diagnostics,'amber')}`:''}</section>`;
}

function selectedRuleConfigPacket(n){
  const incoming=model.incomingByChild.get(n.id);
  const refs=model.rels.filter(r=>String(r.nodeId)===String(n.id));
  const diags=model.diags.filter(d=>String(d.nodeId)===String(n.id));
  const inv=model.inventory.find(r=>String(r.nodeId)===String(n.id));
  const fieldResolution=resolveNodeFieldReferences(n);
  const editorRuleConfiguration=canonicalRuleConfigurationForNode(n);
  return {
    schema:'AcWorkbench.SelectedRuleConfiguration',
    schemaVersion:'1.1.0',
    copiedAt:new Date().toISOString(),
    source:first(treeData.FwdPath,rulesData.FwdPath,'Embedded snapshot'),
    scopeId:n.scopeId,
    identity:{nodeId:n.id,ruleName:n.title,functionName:n.fn,ruleGuid:n.RuleGuid||null,ruleId:n.RuleId||null,functionVersion:first(n.FunctionVersion,n.functionVersion,null)},
    parentRuleAndActionList:{incomingAction:incoming?{label:incoming.label,actionName:first(incoming.ActionName,incoming.actionName,null),actionListIndex:first(incoming.ActionListIndex,incoming.actionListIndex,null),resolved:!!incoming.resolved}:null,path:pathObjects(n),children:childIds(n.id).length},
    disabled:{state:n.disabled,authority:'Structural',reason:n.DisabledReason||null},
    functionMetadata:{category:classifyFunction(n.fn),udfInterface:!!udfForFunctionName(n.fn)},
    fieldsAndParameters:displayParameterEntriesForCopy(n),
    attributes:Object.fromEntries(attributeEntriesForRule(n)),
    statusResultsAndActions:actionListRowsForRule(n).map(row=>({index:row.index,statusResult:row.status,actionList:row.actionLabel,mappedToSubList:row.mapped,childNodeIds:row.childIds,childRuleNames:row.childNames})),
    fieldCatalogMatch:fieldResolution,
    references:refs.map(r=>({kind:r.kind,targetType:r.targetType,target:r.target})),
    messages:diags.map(d=>({severity:d.severity,title:d.title,detail:d.detail})),
    reconciliation:{flatInventoryMatch:!!inv,flatInventoryId:inv?.id||null,classification:inv?.classification||null},
    editorRuleConfiguration,
    rawNode:n
  };
}
function displayParameterEntriesForCopy(n){
  return callerParameterEntries(n.Parameters||{},ruleParameterInterfaceNames(n)).map(entry=>({name:entry.displayName,rawName:entry.rawName,values:entry.values}));
}

function pathObjects(n){const path=[];let cur=n,guard=0;while(cur&&guard++<128){const incoming=model.incomingByChild.get(cur.id);path.push({nodeId:cur.id,name:cur.title,functionName:cur.fn||null,incomingAction:incoming?{label:incoming.label,actionListIndex:first(incoming.ActionListIndex,incoming.actionListIndex,null),resolved:!!incoming.resolved}:null});const parent=model.parentByChild.get(cur.id);cur=parent?model.nodesById.get(String(parent)):null;}return path.reverse();}
function renderGenericInspector(obj,label){if(state.inspectorView==='raw'){$('inspectorBody').innerHTML=`<pre class="raw">${esc(JSON.stringify(obj,null,2))}</pre>`;return;}const linked=obj.nodeId?model.nodesById.get(String(obj.nodeId)):null;$('inspectorBody').innerHTML=`<div class="panel"><h3>${esc(label)}</h3><div class="kv">${Object.keys(obj).slice(0,18).map(k=>kv(k,esc(typeof obj[k]==='object'?JSON.stringify(obj[k]):obj[k]))).join('')}</div></div>${linked?`<button class="btn primary" type="button" data-action="open-linked-node">Open linked structural node</button>`:''}`;}
function ancestors(n){const rows=[];let cur=n;const seen=new Set();while(cur&&!seen.has(cur.id)){seen.add(cur.id);rows.unshift(cur);const p=model.parentByChild.get(cur.id);cur=p?model.nodesById.get(p):null;}return rows;}
function pathHtml(n){return `<div class="route-path">${ancestors(n).map((a,i)=>{const e=model.incomingByChild.get(a.id);return `${i?'<span class="route-arrow">-&gt;</span>':''}<span class="route-step">${i?routeChip(e):'<span class="route-chip root">root rule list</span>'}<b title="${esc(a.title)}">${esc(a.title)}</b></span>`}).join('')}</div>`;}
function outgoingGroups(n){const edges=list(model.edgesByParent.get(n.id));const groups={};edges.forEach(e=>{const key=e.label||'Unnamed';(groups[key]||(groups[key]=[])).push(e);});return groups;}

function branchSummaryHtml(n){
  const groups=outgoingGroups(n);
  const names=Object.keys(groups);
  if(!names.length)return '<div class="muted">This rule has no routed child branches.</div>';
  return `<div class="branch-summary">${names.map(name=>`<span class="branch-summary-chip"><b>${esc(name)}</b><span>${fmt(groups[name].length)} ${groups[name].length===1?'child':'children'}</span></span>`).join('')}</div><div class="caption mt-8">These are outgoing structural branches owned by this rule. Each child rule below the branch has one incoming route from its parent action.</div>`;
}
function sectionHtml(title,count,body,open=true){return `<details class="inspector-section" ${open?'open':''}><summary>${esc(title)}${count!==undefined?` <span class="section-count">${esc(count)}</span>`:''}</summary><div class="inspector-section-body">${body}</div></details>`;}

function renderNodeInspector(n){
 const incoming=model.incomingByChild.get(n.id);
 const refs=model.rels.filter(r=>String(r.nodeId)===String(n.id));
 const diags=model.diags.filter(d=>String(d.nodeId)===String(n.id));
 const disabledHtml=n.disabled==='none'?'<span class="muted">Enabled</span>':n.disabled==='direct'?'<span class="badge red">Direct disabled</span>':n.disabled==='possible'?'<span class="badge amber">Possibly disabled by sequence</span>':'<span class="badge amber">Disabled by parent</span>';
 const displayPath=first(n.DisplayPath,n.displayPath,n.StructuralPath,n.structuralPath,n.RuleListPath,n.ruleListPath,'Root');
 const params=paramBlockForRule(n);
 const attributes=attributesBlockForRule(n);
 const statusActions=statusActionsBlockForRule(n);
 const fieldResolution=resolveNodeFieldReferences(n);
 const fieldBody=renderFieldResolutionBlock(fieldResolution);
 const parentActionPath=parentRuleActionListBlock(n);
 const relBody=refs.length?refs.slice(0,120).map(r=>`<div class="split-row my-7"><span>${esc(r.kind)} -&gt; <b>${esc(r.target)}</b><div class="caption">${esc(r.targetType||'Reference')}</div></span><span class="badge blue">configured</span></div>`).join(''):'<div class="muted">No references are linked to this rule in the current snapshot.</div>';
 const diagBody=diags.length?diags.map(d=>`<div class="notice compact"><div class="notice-icon">!</div><div><b>${esc(d.title)}</b><br>${esc(d.detail)}</div></div>`).join(''):'<div class="muted">No messages linked to this rule.</div>';
 const summary=`<div class="kv">${kv('Rule name',esc(n.title))}${kv('Function',`<span class="mono">${esc(n.fn||'')}</span>`)}${kv('Scope',esc(n.scopeId))}${kv('Display path',`<span class="mono path-line">${esc(displayPath)}</span>`)}${kv('Parent action',incoming?`<span class="route-chip ${incoming.resolved?'resolved':'unresolved'}">${esc(incoming.label)}</span>`:'Root rule list')}${kv('Disabled state',disabledHtml)}${kv('Sub-list children',fmt(childIds(n.id).length))}${kv('References',fmt(refs.length))}${kv('Node',esc(n.id))}</div><div class="inline-actions mt-12"><button class="btn" type="button" data-action="copy-route-path">Copy path</button><button class="btn primary" type="button" data-action="copy-rule-config">Copy config</button></div>`;
 const canonicalConfig=canonicalRuleConfigurationHtml(n);
 const raw=`<pre class="raw">${esc(JSON.stringify(n,null,2))}</pre>`;
 $('inspectorBody').innerHTML=`${sectionHtml('Summary','rule',summary,true)}${sectionHtml('Function Metadata','function',functionMetadataBlock(n),true)}${canonicalConfig}${sectionHtml('Fields / Parameters',Object.keys(n.Parameters||{}).length,`${params}<div class="table-columns-head mt-12">Field Catalog Match</div>${fieldBody}`,Object.keys(n.Parameters||{}).length>0)}${sectionHtml('Attributes',attributeEntriesForRule(n).length,attributes,attributeEntriesForRule(n).length>0)}${sectionHtml('Status Results / Actions',actionListRowsForRule(n).length,statusActions,actionListRowsForRule(n).length>0)}${sectionHtml('Parent Rule / Sub-list Path','path',parentActionPath,false)}${sectionHtml('References',refs.length,relBody,false)}${diags.length?sectionHtml('Messages',diags.length,diagBody,false):''}${sectionHtml('Raw','JSON',raw,false)}`;
}

function sameName(a,b){return text(a).trim().toLowerCase()===text(b).trim().toLowerCase();}
function udfForFunctionName(functionName){
  const fn=text(functionName).trim();
  if(!fn)return null;
  try{
    return buildUdfDefinitions().find(u=>sameName(u.key,fn)||sameName(u.rawName,fn)||sameName(u.displayName,fn)||(u.displayName||'').split(': ').some(part=>sameName(part,fn)))||null;
  }catch{return null;}
}
function valuePreview(values,limit=8){
  const vals=list(values).map(text).filter(v=>v.length>0);
  if(!vals.length)return '<span class="muted">empty</span>';
  return vals.slice(0,limit).map(v=>`<span class="param-value-chip" title="${esc(v)}">${esc(v)}</span>`).join('')+(vals.length>limit?`<span class="muted">+${fmt(vals.length-limit)}</span>`:'');
}
function paramBlock(p,interfaceNames=[]){
  const entries=callerParameterEntries(p||{},interfaceNames);
  if(!entries.length)return '<div class="muted">No parsed fields or parameters.</div>';
  return `<div class="fw-param-list">${entries.map(entry=>{
    const rawHint=entry.rawName&&entry.rawName!==entry.displayName?`<small>FWD slot: ${esc(entry.rawName)}</small>`:'';
    return `<div class="fw-param-row"><div class="fw-param-name"><b>${esc(entry.displayName)}</b>${rawHint}</div><div class="fw-param-values">${valuePreview(entry.values,12)}</div></div>`;
  }).join('')}</div>`;
}
function ruleParameterInterfaceNames(n){
  const udf=udfForFunctionName(n?.fn||n?.FunctionName||'');
  return udf?effectiveUdfParameterNames(udf):[];
}
function paramBlockForRule(n){return paramBlock(n?.Parameters||{},ruleParameterInterfaceNames(n));}
function attributeEntriesForRule(n){
  const merged={};
  function addObject(obj){
    if(!obj||typeof obj!=='object'||Array.isArray(obj))return;
    Object.entries(obj).forEach(([k,v])=>{const key=String(k||'').toLowerCase();if(k&&!(key.startsWith('disabled')&&key.endsWith('e'+'vidence')))merged[k]=v;});
  }
  addObject(n?.Attributes);addObject(n?.attributes);addObject(n?.ConfigAttributes);addObject(n?.configurationAttributes);addObject(n?.RuleAttributes);addObject(n?.ruleAttributes);
  return Object.entries(merged).filter(([k,v])=>k&&v!==undefined&&v!==null).sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'}));
}
function attributesBlockForRule(n){
  const entries=attributeEntriesForRule(n);
  if(!entries.length)return '<div class="muted">No rule configuration attributes were extracted for this rule.</div>';
  return `<div class="fw-attr-list">${entries.map(([k,v])=>`<div class="fw-attr-row"><b>${esc(k)}</b><span class="mono">${esc(typeof v==='object'?JSON.stringify(v):v)}</span></div>`).join('')}</div>`;
}
function classifyFunction(fn){
  const name=text(fn);
  if(!name)return '';
  if(/^_I/i.test(name))return 'Intrinsic';
  if(/table|select|lookup|sl|plug/i.test(name))return 'Table';
  if(/format|copy|delete|map|parse|merge|split|sort|upper|subst|clear/i.test(name))return 'Formatting';
  if(/check|compare|empty|regex|match|count|valid|test/i.test(name))return 'Testing';
  if(/rectif|confirm|repair/i.test(name))return 'Rectifying';
  if(udfForFunctionName(name))return 'User Defined';
  return 'Function';
}
function functionMetadataBlock(n){
  const fn=text(n?.fn||n?.FunctionName||'');
  if(!fn)return '<div class="muted">No function name was extracted for this rule.</div>';
  const udf=udfForFunctionName(fn);
  const version=first(n.FunctionVersion,n.functionVersion,'');
  const attrs=attributeEntriesForRule(n);
  const rows=[
    ['Function name',`<span class="mono">${esc(fn)}</span>`],
    ['Category',esc(udf?'User Defined':classifyFunction(fn))],
    version?['Function version',`<span class="mono">${esc(version)}</span>`]:null,
    udf?['UDF interface',`${fmt(effectiveUdfParameterNames(udf).length)} field-list parameter(s)`]:null,
    ['Configured attributes',fmt(attrs.length)],
    ['Sources',fmt(list(n.Sources).length)]
  ].filter(Boolean);
  return `<div class="kv">${rows.map(([k,v])=>kv(k,v)).join('')}</div>`;
}
function actionListRowsForRule(n){
  const groups=childRouteGroups(n.id);
  const statusNames=actionNamesOf(n);
  const byIndex=new Map();
  groups.forEach(g=>{
    const key=String(first(g.actionListIndex,''));
    if(!byIndex.has(key))byIndex.set(key,[]);
    byIndex.get(key).push(g);
  });
  const indices=new Set();
  statusNames.forEach((_,i)=>indices.add(String(i)));
  groups.forEach(g=>indices.add(String(first(g.actionListIndex,''))));
  if(!indices.size)return [];
  return [...indices].sort((a,b)=>(Number(a)-Number(b))||a.localeCompare(b)).map(idx=>{
    const i=Number(idx);
    const gs=byIndex.get(idx)||[];
    const firstGroup=gs[0];
    const status=text(statusNames[i]||firstGroup?.label||`Status ${idx}`);
    const childIds=gs.flatMap(g=>g.childIds||[]).map(String);
    const childNames=childIds.map(id=>model.nodesById.get(id)?.title||`Node ${id}`).filter(Boolean);
    return {index:idx,status,actionLabel:firstGroup?.label||status,groups:gs,childIds,childNames,mapped:gs.length>0};
  });
}
function statusActionsBlockForRule(n){
  const rows=actionListRowsForRule(n);
  if(!rows.length)return '<div class="muted">No status-result action list was extracted for this rule.</div>';
  return `<div class="fw-action-list-table">${rows.map(row=>{
    const children=row.childNames.length?row.childNames.slice(0,5).map(name=>`<span class="mini-token">${esc(name)}</span>`).join('')+(row.childNames.length>5?`<span class="muted">+${fmt(row.childNames.length-5)}</span>`:''):'<span class="muted">No sub-list children</span>';
    return `<div class="fw-action-list-row"><div><span class="fw-action-index">${esc(row.index)}</span><b>${esc(row.status)}</b><small>Status Result</small></div><div><b>${row.mapped?esc(row.actionLabel):'Do Nothing'}</b><small>${row.mapped?'Action List / Sub-list':'No mapped sub-list'}</small></div><div class="fw-action-children">${children}</div></div>`;
  }).join('')}</div>`;
}
function parentRuleActionListBlock(n){
  const incoming=model.incomingByChild.get(n.id);
  const parentId=model.parentByChild.get(n.id);
  const parent=parentId?model.nodesById.get(String(parentId)):null;
  const path=pathHtml(n);
  return `<div class="panel mb-10"><h3>Parent Rule / Sub-list Path</h3>${path}<div class="caption mt-8">Configured rule-list hierarchy from the FWD snapshot.</div></div><div class="kv">${kv('Parent Rule',parent?`<button class="btn ghost" type="button" data-node="${esc(parent.id)}">${esc(parent.title)}</button>`:'Root rule list')}${kv('Incoming Action List',incoming?`<span class="route-chip ${incoming.resolved?'resolved':'unresolved'}">${esc(incoming.label)}</span>`:'Root')}${kv('Action index',esc(first(incoming?.ActionListIndex,incoming?.actionListIndex,'')))}</div>`;
}

function fieldCatalogRowsForScope(scopeId){
  const items=list(first(model.fwd?.fields?.items,[]));
  if(!items.length)return [];
  const parts=text(scopeId).split('/').filter(Boolean);
  const scopeName=text(parts[parts.length-1]);
  const rawType=text(parts[parts.length-2]);
  const scopeType=rawType.endsWith('s')?rawType.slice(0,-1):rawType;
  const exact=items.filter(i=>lower(i.scopeName)===lower(scopeName)&&lower(i.scopeType)===lower(scopeType));
  if(exact.length)return exact;
  return items.filter(i=>lower(i.scopeName)===lower(scopeName));
}
function looksLikeFieldParameterName(name){const key=lower(name);return key.includes('field')||key.includes('column')||key.includes('attr')||key.includes('paramlist')||key.includes('source')||key.includes('dest');}
function tokenizeFieldCandidates(raw){const source=text(raw).trim();if(!source)return [];const tokens=source.split(/[^A-Za-z0-9_]+/).map(x=>x.trim()).filter(Boolean);const out=[];const seen=new Set();tokens.forEach(token=>{if(token.length<2)return;if(/^\d+$/.test(token))return;const t=token.toLowerCase();if(seen.has(t))return;seen.add(t);out.push(token);});return out;}
function resolveNodeFieldReferences(n){
  const params=n.Parameters||{};
  const rows=fieldCatalogRowsForScope(n.scopeId);
  const byName=new Map();
  rows.forEach(row=>{list(row.fields).forEach(field=>{const name=text(field.name).trim();if(!name)return;const key=name.toLowerCase();if(!byName.has(key))byName.set(key,[]);byName.get(key).push({name,scopeType:text(row.scopeType),scopeName:text(row.scopeName),fieldType:text(field.type),geometry:text(field.geometry),source:'FwdFieldCatalog'});});});
  const items=[];
  Object.keys(params).forEach(parameterName=>{
    if(!looksLikeFieldParameterName(parameterName))return;
    list(params[parameterName]).forEach(parameterValue=>{
      tokenizeFieldCandidates(parameterValue).forEach(candidate=>{
        const matches=list(byName.get(candidate.toLowerCase()));
        items.push({parameterName:text(parameterName),parameterValue:text(parameterValue),referencedField:candidate,fieldExists:matches.length>0,matchLevel:matches.length>0?'High':'Low',source:rows.length?'FwdFieldCatalog':'NoFieldCatalog',matches});
      });
    });
  });
  const resolved=items.filter(i=>i.fieldExists).length;
  const unresolved=Math.max(0,items.length-resolved);
  return {summary:{referenced:items.length,resolved,unresolved,caveat:'Field resolution compares rule parameter names to the extracted FWD field catalog.'},items};
}
function renderFieldResolutionBlock(fieldResolution){
  if(!fieldResolution.summary.referenced)return '<div class="muted">No field-like parameters were found on this rule.</div>';
  const summary=`<div class="metric-row"><span class="metric-chip"><span class="chip-label">Referenced</span><span class="chip-value">${fmt(fieldResolution.summary.referenced)}</span></span><span class="metric-chip"><span class="chip-label">Resolved</span><span class="chip-value ok">${fmt(fieldResolution.summary.resolved)}</span></span><span class="metric-chip"><span class="chip-label">Unresolved</span><span class="chip-value ${fieldResolution.summary.unresolved?'err':''}">${fmt(fieldResolution.summary.unresolved)}</span></span></div><div class="caption">${esc(fieldResolution.summary.caveat)}</div>`;
  const rows=fieldResolution.items.slice(0,120).map(item=>{const matches=item.matches.slice(0,3).map(m=>`<div class="mini-row"><span class="mono">${esc(m.name)}</span><span>${esc(m.scopeType)}:${esc(m.scopeName)}${m.geometry?` · ${esc(m.geometry)}`:''}</span></div>`).join('');return `<div class="panel my-8 p-10"><div class="split-row"><span><b>${esc(item.referencedField)}</b><div class="caption">${esc(item.parameterName)} = ${esc(item.parameterValue)}</div></span><span class="badge ${item.fieldExists?'green':'amber'}">${item.fieldExists?'resolved':'unresolved'}</span></div>${matches?`<div class="mini-list mt-8">${matches}</div>`:'<div class="caption mt-8">No matching field was found in the current FWD field catalog scope.</div>'}</div>`;}).join('');
  return `${summary}<div class="mt-8">${rows}</div>${fieldResolution.items.length>120?'<div class="caption mt-8">Showing first 120 resolved/unresolved references for readability.</div>':''}`;
}
function getScopeFieldResolutionIndex(scopeId){
  const key=text(scopeId);
  if(scopeFieldResolutionCache.has(key))return scopeFieldResolutionCache.get(key);
  const rules=model.nodes.filter(n=>n.scopeId===key&&n.isRule);
  const rows=[];
  let referenced=0,resolved=0,unresolved=0,rulesWithRefs=0,rulesWithUnresolved=0;
  rules.forEach(rule=>{
    const packet=resolveNodeFieldReferences(rule);
    if(packet.summary.referenced>0)rulesWithRefs++;
    if(packet.summary.unresolved>0)rulesWithUnresolved++;
    referenced+=packet.summary.referenced;
    resolved+=packet.summary.resolved;
    unresolved+=packet.summary.unresolved;
    packet.items.forEach(item=>rows.push({nodeId:rule.id,ruleName:rule.title,functionName:rule.fn||'',scopeId:rule.scopeId,parameterName:item.parameterName,parameterValue:item.parameterValue,referencedField:item.referencedField,fieldExists:item.fieldExists,matches:item.matches,matchCount:list(item.matches).length,matchLevel:first(item.matchLevel,item.confidence),source:item.source,searchBlob:[rule.title,rule.fn,rule.scopeId,item.parameterName,item.parameterValue,item.referencedField,item.fieldExists?'resolved':'unresolved',list(item.matches).map(m=>`${m.name} ${m.scopeType} ${m.scopeName} ${m.geometry}`).join(' ')].join(' ').toLowerCase()}));
  });
  const payload={scopeId:key,summary:{referenced,resolved,unresolved,rules:rules.length,rulesWithRefs,rulesWithUnresolved,caveat:'Field resolution compares rule parameter names to the extracted FWD field catalog.'},rows};
  scopeFieldResolutionCache.set(key,payload);
  return payload;
}
function filteredScopeFieldResolutionRows(index){
  const mode=text(state.fieldResolutionFilter||'unresolved').toLowerCase();
  const q=lower(state.query).trim();
  return index.rows.filter(r=>{
    if(mode==='resolved'&&!r.fieldExists)return false;
    if(mode==='unresolved'&&r.fieldExists)return false;
    if(!q)return true;
    return r.searchBlob.includes(q);
  });
}
function renderFieldResolutionCatalog(){
  const index=getScopeFieldResolutionIndex(state.scopeId);
  const rows=filteredScopeFieldResolutionRows(index);
  const summary=index.summary;
  const buttons=`<div class="scope-kind-filter" role="toolbar" aria-label="Field resolution filters"><button class="chip-btn ${state.fieldResolutionFilter==='unresolved'?'active':''}" type="button" data-field-filter="unresolved">Unresolved</button><button class="chip-btn ${state.fieldResolutionFilter==='resolved'?'active':''}" type="button" data-field-filter="resolved">Resolved</button><button class="chip-btn ${state.fieldResolutionFilter==='all'?'active':''}" type="button" data-field-filter="all">All</button></div>`;
  const listHtml=rows.slice(0,4000).map(r=>`<button class="data-row compact" type="button" data-node="${esc(r.nodeId)}"><div><div class="data-title">${esc(r.referencedField)} <span class="badge ${r.fieldExists?'green':'amber'}">${r.fieldExists?'resolved':'unresolved'}</span></div><div class="data-sub">${esc(r.ruleName)} · ${esc(r.functionName||'no function')} · ${esc(r.parameterName)} = ${esc(r.parameterValue)}</div></div><div>${r.matchCount?`<span class="badge blue">${fmt(r.matchCount)} matches</span>`:''}</div><div class="mono">${esc(r.nodeId)}</div></button>`).join('');
  $('content').innerHTML=`<div class="notice"><div class="notice-icon">i</div><div><b>Field catalog match.</b> This view shows field-like rule parameters across the current scope and whether each one matches the extracted FWD field catalog.</div></div><div class="metric-grid"><div class="metric"><b>${fmt(summary.rules)}</b><span>Structural rules</span></div><div class="metric"><b>${fmt(summary.rulesWithRefs)}</b><span>Rules with field refs</span></div><div class="metric good"><b>${fmt(summary.resolved)}</b><span>Resolved refs</span></div><div class="metric ${summary.unresolved?'warn':''}"><b>${fmt(summary.unresolved)}</b><span>Unresolved refs</span></div></div>${buttons}<div class="caption caption-block">${esc(summary.caveat)}</div><div class="table-list mt-8">${listHtml||emptyHtml('No field-resolution rows match','Adjust filter or search.')}</div>${rows.length>4000?'<div class="notice"><div class="notice-icon">i</div><div>Showing first 4,000 rows for browser performance. Use search to narrow down.</div></div>':''}`;
}
function routingGroupsHtml(n){const groups=outgoingGroups(n);const names=Object.keys(groups);if(!names.length)return '<div class="muted">No structural child action lists.</div>';return names.map(name=>`<div class="panel my-8 p-10"><div class="split-row"><b>${esc(name)}</b><span class="badge blue">${fmt(groups[name].length)} children</span></div><div class="mini-list mt-8">${groups[name].map(e=>{const child=model.nodesById.get(e.to);return `<button class="quick-card" type="button" data-node="${esc(e.to)}"><b>${esc(child?.title||e.to)}</b><span>${esc(child?.fn||'no function')}</span></button>`}).join('')}</div></div>`).join('');}
/** Central command dispatcher for toolbar, inspector, copy, and help actions. */
function download(name,body,type){const blob=new Blob([body],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),800);toast('Export created');}
function copyText(t){
  const textValue=String(t??'');
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(textValue).then(()=>toast('Copied')).catch(()=>copyTextFallback(textValue));
    return;
  }
  copyTextFallback(textValue);
}
function copyTextFallback(textValue){
  const ta=document.createElement('textarea');
  ta.value=textValue;
  ta.setAttribute('readonly','readonly');
  ta.style.position='fixed';
  ta.style.left='-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy') ? toast('Copied') : toast('Clipboard unavailable'); }
  catch(error){ reportUiError('clipboard copy',error); toast('Clipboard unavailable'); }
  finally { ta.remove(); }
}
function toast(m,type='info',durationMs=1500){
  const t=$('toast');
  if(toastTimer)window.clearTimeout(toastTimer);
  t.textContent=m;
  t.classList.remove('info','success','warn','error');
  t.classList.add(type);
  t.setAttribute('aria-live',type==='error'?'assertive':'polite');
  t.classList.add('show');
  toastTimer=window.setTimeout(()=>t.classList.remove('show'),Math.max(1000,durationMs));
}
function closeModalRender(){state.modal='';renderModal();renderAll();}


/* v26 Lean Inspection overrides: selectable action lists, search operators, contextual help, keyboard tree navigation, snapshot-aware persistence. */
function stableSnapshotFallbackId(){
  const material=[treeData?.FwdPath,rulesData?.FwdPath,treeData?.ProcessName,rulesData?.ProcessName,treeData?.NodeCount,rulesData?.RuleCount].map(text).join('|');
  let hash=2166136261;
  for(let i=0;i<material.length;i++){hash^=material.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return `static-${(hash>>>0).toString(36)}`;
}
function snapshotId(){return text(first(treeData.SnapshotId,treeData.snapshotId,rulesData.SnapshotId,rulesData.snapshotId,treeData.GeneratedAtUtc,rulesData.GeneratedAtUtc,stableSnapshotFallbackId())).replace(/[^a-z0-9_.:-]+/gi,'-');}
function snapshotStoreKey(){return `ac-rule-workbench-v62-1:${snapshotId()}`;}
function requestedWorkspaceView(){
  try{
    const href=text(window.location?.href||'');
    const match=href.match(/[?&]view=([^&#]+)/i);
    const view=match?decodeURIComponent(match[1].replace(/\+/g,' ')):'';
    return ['structure','field-resolution','resources','functions','tables','drivers','udfs'].includes(view)?view:'';
  }catch{return '';}
}
function noteRecentScope(scopeId){const id=text(scopeId);if(!id)return;state.recentScopes=[id,...state.recentScopes.filter(x=>x!==id)].slice(0,6);}
function saveState(){try{localStorage.setItem(snapshotStoreKey(),JSON.stringify({scopeId:state.scopeId,theme:state.theme,density:state.density,treeFilter:state.treeFilter,scopeKindFilter:state.scopeKindFilter,workspaceView:state.workspaceView,fieldResolutionFilter:state.fieldResolutionFilter,selectedResourceKey:state.selectedResourceKey,selectedFunctionName:state.selectedFunctionName,selectedDriverKey:state.selectedDriverKey,selectedTableName:state.selectedTableName,selectedUdfName:state.selectedUdfName,udfFilter:state.udfFilter,inspectorOpen:document.body.classList.contains('inspector-open'),recentScopes:state.recentScopes,disclosureLevel:state.disclosureLevel}));localStorage.setItem('ac-rule-workbench-v62-1-theme',state.theme);}catch{}}
function restoreSnapshotState(){const saved=safeJson(localStorage.getItem(snapshotStoreKey())||'{}',{});const theme=localStorage.getItem('ac-rule-workbench-v62-1-theme')||(['light','dark'].includes(saved.theme)?saved.theme:'light');state.theme=theme;document.documentElement.dataset.theme=theme;state.density=saved.density==='high'?'high':state.density;applyDensityClass(state.density);document.body.classList.toggle('inspector-open',saved.inspectorOpen===true);if(saved.scopeId&&model.scopes.some(s=>s.scopeId===saved.scopeId))state.scopeId=saved.scopeId;if(saved.treeFilter)state.treeFilter=saved.treeFilter;if(saved.scopeKindFilter)state.scopeKindFilter=saved.scopeKindFilter;state.workspaceView=['structure','field-resolution','resources','functions','tables','drivers','udfs'].includes(saved.workspaceView)?saved.workspaceView:'structure';state.workspaceView=requestedWorkspaceView()||state.workspaceView;state.fieldResolutionFilter=['all','resolved','unresolved'].includes(saved.fieldResolutionFilter)?saved.fieldResolutionFilter:'unresolved';state.selectedResourceKey=text(saved.selectedResourceKey||'');state.selectedFunctionName=text(saved.selectedFunctionName||'');state.selectedDriverKey=text(saved.selectedDriverKey||'');state.selectedTableName=text(saved.selectedTableName||'');state.selectedUdfName=text(saved.selectedUdfName||'');state.udfFilter=['all','with-callers','defined','unparsed','relationship-only'].includes(saved.udfFilter)?saved.udfFilter:state.udfFilter;state.recentScopes=Array.isArray(saved.recentScopes)?saved.recentScopes:[];state.disclosureLevel=Number(saved.disclosureLevel||state.disclosureLevel||2)||2;}
function branchIdFor(parentId,g){return `${state.scopeId}|${String(parentId)}|action:${text(first(g?.actionListIndex,g?.key,g?.label,'route')).replace(/\s+/g,'_')}`;}
function branchVmFromKey(key,scopeId=state.scopeId){for(const n of model.nodes){if(n.scopeId!==scopeId)continue;for(const g of childRouteGroups(n.id)){const k=branchKey(n.id,g);if(k===key){const childNodes=g.childIds.map(id=>model.nodesById.get(String(id))).filter(Boolean);return {kind:'ActionList',key:k,branchId:branchIdFor(n.id,g),scopeId,parent:n,group:g,childNodes,childIds:g.childIds,childCount:g.childIds.length,routeState:g.routeState||'UnnamedAction',resolved:!!g.resolved,label:g.label||'Unnamed action list',actionListIndex:g.actionListIndex};}}}return null;}
function selectedBranch(){return state.selectedType==='branch'?branchVmFromKey(state.selectedId):null;}
function selectedObject(){return selectedNode()||selectedBranch()||selectedInventory()||selectedRel()||selectedDiag()||currentScope();}
function selectBranch(key){const b=branchVmFromKey(key);if(!b)return;state.selectedType='branch';state.selectedId=key;state.expanded.add(b.parent.id);document.body.classList.add('inspector-open');renderAll();setTimeout(()=>document.querySelector(`[data-branch="${cssEscape(key)}"]`)?.scrollIntoView({block:'nearest'}),0);}
function selectScope(id){if(!id||id===state.scopeId)return;state.scopeId=id;if(isGlobalDefinitionView())state.workspaceView='structure';noteRecentScope(id);state.selectedType='scope';state.selectedId='';state.focusNodeId='';state.collapsedBranches.clear();seedExpanded(id);document.body.classList.remove('inspector-open');markOnboardingComplete();announceContentStatus(`Scope selected: ${currentScope()?.name||id}`);renderAll();}
function selectNodeInScope(id,scopeId=''){
  const nodeId=String(id);
  const node=model.nodesById.get(nodeId);
  const targetScope=text(scopeId||node?.scopeId||state.scopeId);
  if(targetScope&&targetScope!==state.scopeId){
    state.scopeId=targetScope;
    noteRecentScope(targetScope);
    state.collapsedBranches.clear();
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
    if(incoming)state.collapsedBranches.delete(branchKeyFromEdge(p,incoming));
    child=p;
    p=model.parentByChild.get(p);
  }
  document.body.classList.add('inspector-open');
  renderAll();
  setTimeout(()=>{const row=document.querySelector(`[data-node="${cssEscape(nodeId)}"]`);row?.scrollIntoView({block:'nearest'});row?.focus();},0);
}
function selectNode(id){selectNodeInScope(id);}
function branchRow(r){
  const g=r.group;const key=r.key;const cls=g.resolved?'resolved':'unresolved';const open=r.open!==false;const selected=state.selectedType==='branch'&&state.selectedId===key;const hot=g.childIds.length>=10||g.childIds.some(id=>{const n=model.nodesById.get(String(id));return n&&(n.disabled!=='none'||hasDiag(n));});
  const actionLabel=g.resolved?'Status result / action':'Action index';
  return `<div class="branch-row ${cls} ${open?'':'collapsed'} ${selected?'selected':''} ${hot?'hotspot':''}" role="treeitem" aria-level="${r.level+1}" aria-expanded="${open?'true':'false'}" aria-selected="${selected?'true':'false'}" tabindex="0" data-branch="${esc(key)}" style="--depth:${r.level}"><span class="twisty branch-twisty" data-toggle-branch="${esc(key)}" aria-hidden="true" title="${open?'Collapse':'Expand'}">${open?'−':'+'}</span><div class="branch-main"><span class="branch-label"><span class="route-prefix">${esc(actionLabel)}</span> ${esc(g.label)}</span><span class="branch-meta">${fmt(g.childIds.length)} child ${g.childIds.length===1?'rule':'rules'}</span></div><span class="mini-row-btn" data-toggle-branch="${esc(key)}" aria-hidden="true" title="${open?'Collapse':'Expand'}">${open?'−':'+'}</span></div>`;
}
function renderContextActionMenu(contextLabel){
  return '';
}
function renderInspector(){
  const b=selectedBranch();
  const n=selectedNode();
  const inventoryRow=selectedInventory();
  const relRow=selectedRel();
  const diagRow=selectedDiag();
  if(n){
    $('inspectorTitle').textContent=n.title;
    $('inspectorCaption').textContent=`${n.fn||'no function'} · ${n.scopeId}`;
    $('inspectorTabs').innerHTML=`<span class="app-mode-note">Configuration inspector</span>${renderContextActionMenu('Configuration')}`;
    syncActionAvailability();
    return renderNodeInspector(n);
  }
  if(b){
    $('inspectorTitle').textContent=b.label;
    $('inspectorCaption').textContent=`Action List · Parent: ${b.parent.title}`;
    $('inspectorTabs').innerHTML=`<span class="app-mode-note">Configuration inspector</span>${renderContextActionMenu('Configuration')}`;
    syncActionAvailability();
    return renderBranchInspector(b);
  }
  if(inventoryRow){
    $('inspectorTitle').textContent=inventoryRow.title||'Inventory row';
    $('inspectorCaption').textContent=inventoryRow.scopeId||'FWD object';
    $('inspectorTabs').innerHTML=`<span class="app-mode-note">Configuration inspector</span>${renderContextActionMenu('Configuration')}`;
    syncActionAvailability();
    return renderGenericInspector(inventoryRow,'Inventory row');
  }
  if(relRow){
    $('inspectorTitle').textContent=relRow.target||'Reference';
    $('inspectorCaption').textContent=relRow.scopeId||'FWD object';
    $('inspectorTabs').innerHTML=`<span class="app-mode-note">Configuration inspector</span>${renderContextActionMenu('Configuration')}`;
    syncActionAvailability();
    return renderGenericInspector(relRow,'Reference');
  }
  if(diagRow){
    $('inspectorTitle').textContent=diagRow.title||'Message';
    $('inspectorCaption').textContent=diagRow.scopeId||'FWD object';
    $('inspectorTabs').innerHTML=`<span class="app-mode-note">Configuration inspector</span>${renderContextActionMenu('Configuration')}`;
    syncActionAvailability();
    return renderGenericInspector(diagRow,'Message');
  }
  $('inspectorTitle').textContent='No rule selected';
  $('inspectorCaption').textContent='Select a rule, function, field, or action list to inspect configuration.';
  $('inspectorTabs').innerHTML=`<span class="app-mode-note">Configuration inspector</span>${renderContextActionMenu('Scope')}`;
  syncActionAvailability();
  return renderScopeInspector(currentScope());
}
function branchPathObjects(b){const base=pathObjects(b.parent);base.push({kind:'ActionList',branchId:b.branchId,parentNodeId:b.parent.id,label:b.label,actionListIndex:b.actionListIndex,routeState:b.routeState,resolved:b.resolved});return base;}
function branchPacket(b){const diags=branchMessages(b),refs=branchReferences(b);return {schema:'AcWorkbench.SelectedActionListConfiguration',schemaVersion:'1.0.0',copiedAt:new Date().toISOString(),scopeId:b.scopeId,branch:{branchId:b.branchId,parentNodeId:b.parent.id,parentRuleName:b.parent.title,parentFunctionName:b.parent.fn,label:b.label,actionListIndex:b.actionListIndex,routeState:b.routeState,resolved:b.resolved,childCount:b.childCount},path:branchPathObjects(b),children:b.childNodes.map(n=>({nodeId:n.id,ruleName:n.title,functionName:n.fn,disabled:n.disabled,hasMessages:hasDiag(n)})),relationships:refs.map(r=>({kind:r.kind,targetType:r.targetType,target:r.target,nodeId:r.nodeId})),messages:diags.map(d=>({severity:d.severity,title:d.title,detail:d.detail,nodeId:d.nodeId})),notProven:['Action-list grouping comes from the parsed FWD parent rule status-result action lists.','This is read-only FWD configuration, not a runtime execution trace.','Search output is a navigation aid for the FWD snapshot.']};}
function branchMessages(b){const ids=new Set(branchSubtreeNodeIds(b));return model.diags.filter(d=>ids.has(String(d.nodeId)));}
function branchReferences(b){const ids=new Set(branchSubtreeNodeIds(b));return model.rels.filter(r=>ids.has(String(r.nodeId)));}
function branchSubtreeNodeIds(b){const out=[];const walk=id=>{out.push(String(id));childIds(id).forEach(walk);};b.childIds.forEach(walk);return out;}
function branchMarkdownReport(b){const p=branchPacket(b);return `# Action List Configuration\n\nScope: ${p.scopeId}\nParent rule: ${p.branch.parentRuleName}\nParent function: ${p.branch.parentFunctionName||'none'}\nAction: ${p.branch.label}\nAction-list mapping: ${p.branch.routeState}\nChildren: ${p.branch.childCount}\n\n## Parent rule / sub-list path\n${p.path.map(seg=>seg.kind==='ActionList'?`- Action: ${seg.label}`:`- Rule: ${seg.name}`).join('\n')}\n\n## Child rules\n${p.children.map(c=>`- ${c.ruleName} (${c.functionName||'no function'})${c.disabled!=='none'?` - ${c.disabled}`:''}`).join('\n')||'- None'}\n\n## Notes\n${p.notProven.map(x=>`- ${x}`).join('\n')}\n`;}

function renderBranchInspector(b){
  const diags=branchMessages(b);
  const summary=`<div class="kv">${kv('Action List',`<span class="route-chip ${b.resolved?'resolved':'unresolved'}">${esc(b.label)}</span>`)}${kv('Parent Rule',`<button class="btn ghost" type="button" data-node="${esc(b.parent.id)}">${esc(b.parent.title)}</button>`)}${kv('Parent function',`<span class="mono">${esc(b.parent.fn||'')}</span>`)}${kv('Status/action index',esc(b.actionListIndex??''))}${kv('Sub-list children',fmt(b.childCount))}${diags.length?kv('Messages',`<span class="badge amber">${fmt(diags.length)}</span>`):''}</div><div class="branch-actions"><button class="btn" type="button" data-action="copy-branch-route">Copy action-list path</button></div>`;
  const path=`<div class="route-breadcrumb">${branchPathObjects(b).map((seg,i)=>`${i?'<span class="route-arrow">-&gt;</span>':''}${seg.kind==='ActionList'?`<span class="route-step"><span class="route-chip ${seg.resolved?'resolved':'unresolved'}">Action List: ${esc(seg.label)}</span></span>`:`<button class="route-step" type="button" data-node="${esc(seg.nodeId)}"><b>${esc(seg.name)}</b></button>`}`).join('')}</div><div class="caption mt-8">Configured parent rule and sub-list path from the FWD snapshot.</div>`;
  const children=b.childNodes.length?`<div class="mini-list">${b.childNodes.map(n=>`<button class="quick-card" type="button" data-node="${esc(n.id)}"><b>${esc(n.title)}</b><span>${esc(n.fn||'no function')} · ${n.disabled==='none'?'enabled':n.disabled}</span></button>`).join('')}</div>`:'<div class="muted">No child rules under this sub-list.</div>';
  $('inspectorBody').innerHTML=`${sectionHtml('Summary','action list',summary,true)}${sectionHtml('Parent Rule / Sub-list Path','path',path,true)}${sectionHtml('Child rules',b.childCount,children,true)}`;
}

function hasVisibleQuery(x){const q=lower(state.query).trim();if(!q)return true;return matchesSearchQuery(x,q);}
function matchesSearchQuery(x,q){const blob=lower([x.searchBlob,JSON.stringify(x),x.title,x.fn,x.scopeId].join(' '));const terms=q.match(/"[^"]+"|\S+/g)||[];return terms.every(term=>{term=term.replace(/^"|"$/g,'');const gt=term.match(/^children>(\d+)$/i);if(gt)return Number(first(x.childCount,childIds(x.id).length,0))>Number(gt[1]);const parts=term.split(':');if(parts.length>1){const op=lower(parts.shift()),val=lower(parts.join(':').replace(/^"|"$/g,''));if(op==='function'||op==='fn')return lower(x.fn||x.FunctionName).includes(val);if(op==='field'||op==='target')return lower(x.target||x.Target||paramText(x.Parameters)).includes(val);if(op==='action'||op==='route')return lower(actionNamesOf(x).join(' ')+' '+(x.label||'')+' '+(x.searchBlob||'')).includes(val);if(op==='disabled')return val==='true'?disabledOf(x)!=='none':lower(x.disabled||disabledOf(x)).includes(val);if(op==='has'){if(val==='disabled')return disabledOf(x)!=='none'||x.disabled!=='none';if(val==='message'||val==='warning'||val==='warnings')return !!x.nodeId?model.diags.some(d=>String(d.nodeId)===String(x.nodeId)):hasDiag(x);if(val==='branches'||val==='children')return childIds(x.id).length>0||childRouteGroups(x.id).length>0;}if(op==='scope')return lower(x.scopeId||scopeIdOf(x)).includes(val);if(op==='guid')return lower(x.RuleGuid||x.ruleGuid).includes(val);if(op==='flatonly')return String(x.classification==='FlatOnly').includes(val);if(op==='message')return lower(x.title||x.detail||x.searchBlob).includes(val);}return blob.includes(lower(term));});}
function searchResults(){const q=lower(state.query).trim();if(!q)return [];const rows=[];for(const s of model.scopes){if(matchesSearchQuery({searchBlob:`${s.name} ${s.scopeId} ${s.kind}`},q))rows.push({kind:'Scope',scopeId:s.scopeId,title:s.name,subtitle:`${s.kind} · ${fmt(s.structural)} rules`,badges:[s.kind]});}
for(const n of model.nodes){if(matchesSearchQuery(n,q))rows.push({kind:'StructuralRule',scopeId:n.scopeId,nodeId:n.id,title:n.title,subtitle:`${n.fn||'no function'} · ${n.scopeId}`,badges:[n.disabled!=='none'?n.disabled:'Structural'].filter(Boolean),routePreview:model.incomingByChild.get(n.id)?.label||'root'});}for(const bkey of allBranchKeysForScope(state.scopeId)){const b=branchVmFromKey(bkey);if(b&&matchesSearchQuery({searchBlob:`${b.label} ${b.parent.title} ${b.parent.fn} ${b.scopeId}`},q))rows.push({kind:'ActionList',scopeId:b.scopeId,branchKey:b.key,title:`Action List: ${b.label}`,subtitle:`Parent: ${b.parent.title} · ${fmt(b.childCount)} child rules`,badges:['Action List']});}
for(const r of model.rels){if(matchesSearchQuery(r,q))rows.push({kind:'Reference',scopeId:r.scopeId,nodeId:r.nodeId,title:`${r.kind}: ${r.target}`,subtitle:`${r.targetType}`,badges:['Reference']});}
for(const d of model.diags){if(matchesSearchQuery(d,q))rows.push({kind:'Message',scopeId:d.scopeId,nodeId:d.nodeId,title:d.title,subtitle:d.detail,badges:[d.severity]});}
return rows.slice(0,80);}
function renderSearchPopover(){const pop=$('searchPopover');if(!pop)return;const q=state.query.trim();if(!q){pop.classList.remove('open');pop.innerHTML='';state.searchActiveIndex=-1;$('globalSearch').setAttribute('aria-expanded','false');$('globalSearch').removeAttribute('aria-activedescendant');return;}const results=searchResults();if(!results.length)state.searchActiveIndex=-1;else state.searchActiveIndex=Math.max(0,Math.min(results.length-1,state.searchActiveIndex));pop.classList.add('open');$('globalSearch').setAttribute('aria-expanded','true');pop.innerHTML=`<div class="search-help">Operators: action:"Run Rules", function:_IGetDocAttr, has:disabled, children&gt;20, scope:DentalADA. Global search finds FWD objects; the local filter narrows the current view.</div>${results.length?results.map((r,i)=>`<button id="searchResult-${i}" class="search-result ${i===state.searchActiveIndex?'active':''}" type="button" data-search-index="${i}" role="option" aria-selected="${i===state.searchActiveIndex?'true':'false'}"><span><b>${esc(r.title)}</b><span>${esc(r.kind)} · ${esc(r.subtitle||'')}</span></span><span>${(r.badges||[]).slice(0,2).map(b=>`<span class="badge blue">${esc(b)}</span>`).join('')}</span></button>`).join(''):'<div class="empty"><div>No matching objects.</div></div>'}`;pop._results=results;announceContentStatus(results.length?`${results.length} search result${results.length===1?'':'s'} for ${q}`:`No search results for ${q}`);const activeId=state.searchActiveIndex>=0?`searchResult-${state.searchActiveIndex}`:'';if(activeId)$('globalSearch').setAttribute('aria-activedescendant',activeId);else $('globalSearch').removeAttribute('aria-activedescendant');}
function closeSearchPopover(){const pop=$('searchPopover');if(!pop)return;pop.classList.remove('open');pop.innerHTML='';pop._results=[];state.searchActiveIndex=-1;$('globalSearch').setAttribute('aria-expanded','false');$('globalSearch').removeAttribute('aria-activedescendant');}
function setSearchActiveIndex(index){const pop=optionalElement('searchPopover');const results=pop?._results||[];if(!results.length){state.searchActiveIndex=-1;renderSearchPopover();return;}const max=results.length-1;state.searchActiveIndex=Math.max(0,Math.min(max,index));renderSearchPopover();const row=document.getElementById(`searchResult-${state.searchActiveIndex}`);row?.scrollIntoView({block:'nearest'});}
function handleSearchPopoverKeydown(e){const pop=optionalElement('searchPopover');const open=!!pop?.classList.contains('open');if(!open)return false;const results=pop?._results||[];if(!results.length)return false;if(e.key==='ArrowDown'){e.preventDefault();setSearchActiveIndex((state.searchActiveIndex<0?0:state.searchActiveIndex)+1);return true;}if(e.key==='ArrowUp'){e.preventDefault();setSearchActiveIndex((state.searchActiveIndex<0?results.length-1:state.searchActiveIndex)-1);return true;}if(e.key==='Enter'){const idx=state.searchActiveIndex<0?0:state.searchActiveIndex;const hit=results[Math.max(0,Math.min(results.length-1,idx))];if(hit){e.preventDefault();jumpToSearchResult(hit);return true;}}return false;}
function isSearchUiTarget(target){return !!target?.closest?.('.global-search,#searchPopover,[data-search-index]');}
// Build a nested, operator-first left object tree with grouped sections and direct actions.

function globalNavigationCounts(){
  const definedCounts=model.fwd?.overview?.counts||{};
  const tableDefs=buildGlobalTableDefinitions();
  return {
    resources:first(definedCounts.resourceTypes,domainRowsByView('resources').length),
    functions:first(model.fwd?.functions?.count,domainRowsByView('functions').length),
    tables:first(model.fwd?.selectionLists?.count,model.fwd?.tables?.count,definedCounts.tables,tableDefs.length),
    drivers:domainRowsByView('drivers').length,
    udfs:buildUdfDefinitions().length
  };
}
function renderGlobalNavigation(){
  const el=$('globalNav');
  if(!el)return;
  if(!model){el.innerHTML='';return;}
  const counts=globalNavigationCounts();
  function row(action,label,count,title){
    const view=action.replace(/^view-/,'');
    const active=state.workspaceView===view;
    return `<button class="global-view-row ${active?'active':''}" type="button" data-action="${esc(action)}" aria-current="${active?'true':'false'}" title="${esc(title)}"><span class="global-view-name">${esc(label)}</span><span class="global-view-count">${fmt(count)}</span></button>`;
  }
  el.innerHTML=`<div class="scope-group global-nav-heading"><span>Global Definitions</span></div><div class="global-view-list" role="group" aria-label="Global resource definition views">${[
    row('view-resources','Resources',counts.resources,'FWD-level resource buckets and definitions'),
    row('view-functions','Functions',counts.functions,'AC function catalog and observed rule usage'),
    row('view-tables','Tables',counts.tables,'Global table definitions and rule usage'),
    row('view-udfs','UDFs',counts.udfs,'Global User Defined Functions and caller rules'),
    row('view-drivers','Drivers',counts.drivers,'Driver definitions and process-private driver findings')
  ].join('')}</div>`;
}

function renderObjectTreeBlock(){
  const toTotal=rows=>rows.reduce((sum,row)=>sum+Number(first(row.count,0)),0);
  const scopeCountBy=matcher=>model.scopes.filter(s=>matcher(`${s.kind} ${s.name} ${s.scopeId}`)).length;
  const definedCounts=model.fwd?.overview?.counts||null;
  const tableDefs=buildGlobalTableDefinitions();
  const resources=domainRowsByView('resources');
  const tables=domainRowsByView('tables');
  const drivers=domainRowsByView('drivers');
  const udfs=domainRowsByView('udfs');
  const counts={
    documents:first(definedCounts?.documents,scopeCountBy(v=>/document|doc/i.test(v))),
    pages:first(definedCounts?.pages,scopeCountBy(v=>/page/i.test(v))),
    batches:first(definedCounts?.batches,scopeCountBy(v=>/batch/i.test(v))),
    processes:first(definedCounts?.processes,scopeCountBy(v=>/process|\bac\b|\bdv\b|\bfip\b|\bocr\b|render|store|webkey|\bkfi\b|\bke\b/i.test(v))),
    structure:scopedRuleNodes().length,
    resources:first(definedCounts?.resourceTypes,toTotal(resources)),
    functions:first(model.fwd?.functions?.count,toTotal(domainRowsByView('functions'))),
    tables:first(model.fwd?.selectionLists?.count,model.fwd?.tables?.count,definedCounts?.tables,tableDefs.length),
    drivers:toTotal(drivers),
    udfs:toTotal(udfs),
    unresolvedFields:getScopeFieldResolutionIndex(state.scopeId).summary.unresolved
  };
  function row(action,label,count,title,active=false,child=false){
    return `<button class="global-view-row ${active?'active':''} ${child?'child':''}" type="button" data-action="${action}" aria-current="${active?'true':'false'}" title="${esc(title)}"><span class="global-view-name">${esc(label)}</span><span class="global-view-count">${fmt(count)}</span></button>`;
  }
  function section(title,rows,open=true){
    if(!rows.length)return '';
    return `<details class="scope-section" ${open?'open':''}><summary><span>${esc(title)}</span></summary><div class="scope-section-body">${rows.join('')}</div></details>`;
  }
  const nav={
    documents:state.workspaceView==='structure'&&state.scopeKindFilter==='document',
    pages:state.workspaceView==='structure'&&state.scopeKindFilter==='page',
    batches:state.workspaceView==='structure'&&state.scopeKindFilter==='all'&&/batch/i.test(state.scopeQuery),
    processes:state.workspaceView==='structure'&&state.scopeKindFilter==='all'&&/process|\bac\b|\bdv\b|\bfip\b|\bocr\b|render|store|webkey|\bkfi\b|\bke\b/i.test(state.scopeQuery)
  };
  const objectRows=[
    row('nav-documents','Documents',counts.documents,'Document type configuration scopes',nav.documents,true),
    row('nav-pages','Pages',counts.pages,'Page type configuration scopes',nav.pages,true),
    row('nav-batches','Batches',counts.batches,'Batch configuration scopes',nav.batches,true),
    row('nav-processes','Processes',counts.processes,'Process-node configuration scopes',nav.processes,true)
  ];
  return `<div class="scope-group"><span>Objects</span></div><div class="global-view-list" role="group" aria-label="Scope object presets">${section('Scope Presets',objectRows,true)}</div>`;
}
function applyEditorNavPreset(target){
  state.workspaceView='structure';
  state.treeFilter='all';
  if(target==='documents'){
    state.scopeKindFilter='document';
    state.scopeQuery='';
  }else if(target==='pages'){
    state.scopeKindFilter='page';
    state.scopeQuery='';
  }else if(target==='batches'){
    state.scopeKindFilter='all';
    state.scopeQuery='batch';
  }else if(target==='processes'){
    state.scopeKindFilter='all';
    state.scopeQuery='process ac dv fip ocr render store webkey kfi ke';
  }
  renderAll();
}
function renderScopes(){
  const q=lower(state.scopeQuery).trim();
  let kind=lower(state.scopeKindFilter||'all');
  if(kind==='warning')kind='all';
  const rows=model.scopes.filter(s=>{
    if(kind==='page'&&!/page/i.test(text(s.kind)))return false;
    if(kind==='document'&&!/document|doc/i.test(text(s.kind)))return false;
    if(q&&!`${lower(s.name)} ${lower(s.scopeId)} ${lower(s.kind)}`.includes(q))return false;
    return true;
  });
  const scopeSearchEl=optionalElement('scopeSearch');
  if(scopeSearchEl)scopeSearchEl.value=state.scopeQuery;
  document.querySelectorAll('[data-scope-filter]').forEach(btn=>{
    const active=btn.dataset.scopeFilter===state.scopeKindFilter;
    btn.classList.toggle('active',active);
    btn.setAttribute('aria-pressed',active?'true':'false');
  });
  const recentRows=state.recentScopes.map(id=>model.scopes.find(s=>s.scopeId===id)).filter(Boolean);
  const recentEl=optionalElement('recentScopes');
  if(recentEl)recentEl.innerHTML=recentRows.length?recentRows.map(s=>`<button class="recent-scope-btn ${s.scopeId===state.scopeId?'active':''}" type="button" data-scope="${esc(s.scopeId)}" title="${esc(s.scopeId)}">${esc(s.name)}</button>`).join(''):'';
  // Render a scope row button for a single scope entry.
  function scopeRowHtml(s){
    const active=s.scopeId===state.scopeId;
    const icon=/page/i.test(text(s.kind))?'▣':/document|doc/i.test(text(s.kind))?'▤':'▦';
    const cls=scopeHealthClass(s);
    const label=scopeHealthLabel(s);
    const flatText=s.flatOnly?`${fmt(s.flatOnly)} unlinked flat`:'all linked';
    return `<button class="scope-row ${active?'active':''} health-${cls}" type="button" data-scope="${esc(s.scopeId)}" aria-current="${active?'true':'false'}"><span class="scope-icon" aria-hidden="true">${icon}</span><span class="scope-row-main"><span class="scope-name">${esc(s.name)}</span><span class="scope-row-meta">${esc(s.scopeId)}</span><span class="scope-row-meta-strip"><span class="mini-health ${cls}">${esc(label)}</span><span>${fmt(s.structural)} structural</span><span>${flatText}</span></span></span></button>`;
  }
  function scopeSectionHtml(title,rows,open=true){
    if(!rows.length)return '';
    return `<details class="scope-section scope-section-scopes" ${open?'open':''}><summary><span>${esc(title)}</span><span class="section-count">${fmt(rows.length)}</span></summary><div class="scope-section-body">${rows.map(scopeRowHtml).join('')}</div></details>`;
  }
  if(!rows.length){
    $('scopeList').innerHTML=emptyHtml('No scopes match','Adjust the scope filter or search.');
  } else {
    // Separate rows into Documents first, then Pages, then everything else in nested sections.
    const docs=rows.filter(s=>/document|doc/i.test(text(s.kind)));
    const pages=rows.filter(s=>/page/i.test(text(s.kind)));
    const other=rows.filter(s=>!/document|doc|page/i.test(text(s.kind)));
    const parts=[];
    parts.push('<div class="scope-group"><span>Rule Scopes</span></div>');
    parts.push(scopeSectionHtml('Document Rule Scopes',docs,true));
    parts.push(scopeSectionHtml('Page Rule Scopes',pages,true));
    parts.push(scopeSectionHtml('Other Rule Scopes',other,false));
    $('scopeList').innerHTML=parts.join('');
  }
}
function jumpToSearchResult(r){if(!r)return;closeSearchPopover();if(r.kind==='Scope')return selectScope(r.scopeId);if(r.kind==='ActionList'){selectScope(r.scopeId);selectBranch(r.branchKey);state.collapsedBranches.delete(r.branchKey);renderAll();return;}if(r.nodeId){selectScope(r.scopeId);selectNode(r.nodeId);return;}if(r.scopeId)selectScope(r.scopeId);}
// Keep scope-local views intentionally narrow for Document/Page scopes.
// Resource-definition catalogs are global concerns and are not shown as direct Doc/Page tabs.
function normalizeWorkspaceViewForScope(){
  const scope=currentScope();
  if(!scope)return;
  if(!['structure','field-resolution','resources','functions','tables','drivers','udfs'].includes(state.workspaceView))state.workspaceView='structure';
}
function renderAll(){return withUiGuard('render',()=>{normalizeWorkspaceViewForScope();if(isGlobalDefinitionView())document.body.classList.remove('inspector-open');saveState();renderTop();renderGlobalNavigation();renderScopes();renderMainHead();renderContent();renderInspector();renderSearchPopover();syncOnboardingChecklist();syncActionAvailability();});}
function renderTop(){
  const banner=optionalElement('globalErrorBanner');
  if(banner&&bootState.phase!=='failed')banner.hidden=true;
  document.body.classList.toggle('is-loading',!model||bootState.phase==='loading');
  document.body.classList.toggle('is-loaded',!!model&&bootState.phase!=='loading');
  if(!model||bootState.phase==='loading'){
    $('sourceSubtitle').textContent='Loading FWD snapshot...';
    $('statusPill').innerHTML='<span class="dot warn"></span><span>Snapshot loading</span>';
    const summaryConfig=optionalElement('sourceSummaryConfig');
    const summaryRules=optionalElement('sourceSummaryRules');
    const summaryWarnings=optionalElement('sourceSummaryWarnings');
    if(summaryConfig)summaryConfig.textContent='Loading';
    if(summaryRules)summaryRules.textContent='Pending';
    if(summaryWarnings)summaryWarnings.textContent='Pending';
    $('globalSearch').value=state.query;
    syncActionAvailability();
    return;
  }
  const totalRules=model.nodes.filter(n=>n.isRule).length;
  const totalWarnings=model.scopes.reduce((sum,s)=>sum+Number(first(s.warnings,0)),0);
  const total=fmt(totalRules);
  const activeView=(state.workspaceView||'structure').toUpperCase();
  const hydration=fwdHydrationSummary();
  $('sourceSubtitle').textContent=`${esc(snapshotId())} · read-only · ${total} rules`;
  const warnDot=hydration.level==='warn'||totalWarnings>0;
  const statusText=hydration.level==='warn'
    ? `Snapshot partial · ${fmt(totalWarnings)} warnings`
    : `${total} rules${totalWarnings?` · ${fmt(totalWarnings)} warnings`:' · parse clean'}`;
  $('statusPill').innerHTML=`<span class="dot ${warnDot?'warn':''}"></span><span>${esc(statusText)}</span>`;
  const summaryConfig=optionalElement('sourceSummaryConfig');
  const summaryRules=optionalElement('sourceSummaryRules');
  const summaryWarnings=optionalElement('sourceSummaryWarnings');
  if(summaryConfig)summaryConfig.textContent=hydration.level==='warn'?'Partial':'Loaded';
  if(summaryRules)summaryRules.textContent=total;
  if(summaryWarnings)summaryWarnings.textContent=fmt(totalWarnings);
  $('globalSearch').value=state.query;
  syncActionAvailability();
}
function viewLabel(){
  const labels={all:'All rules',disabled:'Disabled only',inherited:'Inherited disabled',warnings:'Messages only',actions:'Parent rules with action lists',sections:'Sections and comments'};
  const base=labels[state.treeFilter]||'Filtered view';
  const q=text(state.query).trim();
  return q?`${base} | search: ${q}`:base;
}
function activeSliceHtml(){
  const view=state.workspaceView||'structure';
  const labels={
    structure:['Structure','Rule hierarchy'],
    'field-resolution':['Fields','Resolution matrix'],
    resources:['Resources','Global definitions'],
    functions:['Functions','AC catalog'],
    tables:['Tables','Global definitions'],
    drivers:['Drivers','Global definitions'],
    udfs:['UDFs','Global definitions'],
  };
  const row=labels[view]||['Workbench','FWD view'];
  return `<div class="active-slice" aria-label="Active workspace"><span>${esc(row[0])}</span><b>${esc(row[1])}</b></div>`;
}
function renderViewbar(){
  const struct=state.workspaceView==='structure';
  const globalView=isGlobalDefinitionView();
  const hasFilter=!!state.query;
  const viewDefs=globalView
    ? [['resources','Resources'],['functions','Functions'],['tables','Tables'],['udfs','UDFs'],['drivers','Drivers']]
    : [['structure','Structure'],['field-resolution','Fields']];
  const viewButtons=viewDefs.map(([id,label])=>`<button class="btn ${state.workspaceView===id?'primary':''}" type="button" data-action="view-${id}" aria-pressed="${state.workspaceView===id?'true':'false'}">${label}</button>`);
  const treeMenu=struct?`<details class="action-menu tree-options"><summary class="btn">Tree</summary><div class="action-menu-pop"><button class="btn" type="button" data-action="expand-selected-depth">Open selected branch</button><button class="btn" type="button" data-action="expand-selected-subtree">Open subtree</button><button class="btn" type="button" data-action="collapse-siblings">Collapse siblings</button><button class="btn" type="button" data-action="collapse-all">Collapse all</button></div></details>`:'';
  const treeSelectors=struct?`<select id="treeFilter" aria-label="Tree filter"><option value="all" ${state.treeFilter==='all'?'selected':''}>All nodes</option><option value="disabled" ${state.treeFilter==='disabled'?'selected':''}>Disabled</option><option value="inherited" ${state.treeFilter==='inherited'?'selected':''}>Inherited disabled</option><option value="warnings" ${state.treeFilter==='warnings'?'selected':''}>Messages</option><option value="actions" ${state.treeFilter==='actions'?'selected':''}>Action parents</option><option value="sections" ${state.treeFilter==='sections'?'selected':''}>Sections</option></select><select id="disclosureLevel" aria-label="Tree disclosure level"><option value="1" ${state.disclosureLevel===1?'selected':''}>Names</option><option value="2" ${state.disclosureLevel===2?'selected':''}>Function</option><option value="3" ${state.disclosureLevel===3?'selected':''}>State</option><option value="4" ${state.disclosureLevel===4?'selected':''}>Details</option></select>`:'';
  const search=viewSearchMeta();
  const countLabel=globalView?'' : `<span class="view-count">${esc(viewLabel())}</span>`;
  $('viewbar').innerHTML=`<div class="viewbar-shell"><div class="cmd-main" role="group" aria-label="Workbench views">${viewButtons.join('')}</div><div class="field tree-filter"><label class="sr-only" for="viewSearch">${esc(search.label)}</label><input id="viewSearch" type="search" value="${esc(state.query)}" placeholder="${esc(search.placeholder)}"><button class="filter-clear" type="button" data-action="clear-tree-search" title="Clear current filter" aria-label="Clear current filter" ${hasFilter?'':'disabled'}>Clear</button></div><div class="viewbar-right">${treeSelectors}${treeMenu}${countLabel}</div></div>`;
}

function modalFocusableElements(){
  const modal=optionalElement('helpModal');
  if(!modal||typeof modal.querySelectorAll!=='function')return [];
  const selector='a[href],button:not([disabled]),textarea,input,select,details summary,[tabindex]:not([tabindex="-1"])';
  return [...modal.querySelectorAll(selector)].filter(el=>{
    if(!el)return false;
    if(el.disabled)return false;
    if(el.hidden)return false;
    if(el.getAttribute&&el.getAttribute('aria-hidden')==='true')return false;
    return true;
  });
}
function handleModalFocusTrap(event){
  if(!event||event.key!=='Tab')return;
  const nodes=modalFocusableElements();
  if(!nodes.length){
    event.preventDefault?.();
    optionalElement('helpModal')?.focus?.();
    return;
  }
  const firstNode=nodes[0];
  const lastNode=nodes[nodes.length-1];
  const active=document.activeElement;
  if(event.shiftKey&&active===firstNode){
    event.preventDefault?.();
    lastNode.focus?.();
  } else if(!event.shiftKey&&active===lastNode){
    event.preventDefault?.();
    firstNode.focus?.();
  }
}
function renderContextHelp(topic){
  const help={
    'action-branch':{
      title:'Action Lists / Status Results',
      body:'An action list is the configured sub-list selected by a parent rule status result. The parent rule owns the status/action label; child rules do not.',
      checks:['Confirm the parent rule and status result.','Review child rules in configured order.','Treat the path as static FWD configuration, not runtime execution.']
    },
    model:{
      title:'FWD model',
      body:'FormWorks Editor authors the FWD/STC model: documents, pages, variants, fields, batches, processes, resources, and private configuration nodes. This viewer is read-only.',
      checks:['Use Structure for rule-list hierarchy.','Use global definitions for functions, UDFs, tables, resources, and drivers.','Use Raw only as final confirmation.']
    },
    disabled:{
      title:'Disabled state',
      body:'Disabled state is reported from extracted structural evidence when available. Inherited disabled means the rule sits under a disabled parent in the rule-list tree.',
      checks:['Distinguish direct disabled from inherited disabled.','Treat sequence-only hints as audit evidence only.','Check parent rule and action-list context before drawing conclusions.']
    }
  };
  const item=help[topic]||{title:'Context help',body:'This view is read-only and FWD-first.',checks:['Select a scope.','Inspect the rule or branch.','Copy config when documenting findings.']};
  return `<div class="help-grid"><section class="panel"><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p><ul>${item.checks.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section></div>`;
}
function subtreeNodes(nodeId){
  const result=[];
  const seen=new Set();
  const visit=id=>{
    const key=String(id||'');
    if(!key||seen.has(key))return;
    seen.add(key);
    const node=model.nodesById.get(key);
    if(node)result.push(node);
    childIds(key).forEach(visit);
  };
  visit(nodeId);
  return result;
}

function renderModal(){const open=!!state.modal;const app=optionalElement('mainContent')?.closest('.app');$('modalBackdrop').classList.toggle('open',open);$('helpModal').classList.toggle('open',open);$('helpModal').classList.toggle('wide',state.modal==='global-detail');if(app){if(open)app.setAttribute('aria-hidden','true');else app.removeAttribute('aria-hidden');}if(!open){if(modalPreviouslyFocusedEl&&typeof modalPreviouslyFocusedEl.focus==='function')modalPreviouslyFocusedEl.focus();modalPreviouslyFocusedEl=null;return;}if(!modalPreviouslyFocusedEl)modalPreviouslyFocusedEl=document.activeElement;const detail=state.modal==='global-detail'?globalDetailRecord():null;const title=state.modal==='global-detail'?(detail?.row?.name||detail?.row?.displayName||detail?.row?.key||'Definition details'):state.modal?.startsWith('help-')?'Contextual help':'Workbench help';$('helpTitle').textContent=title;$('helpCaption').textContent=state.modal==='global-detail'?(detail?.label||'Definition details'):'Read-only FormWorks Editor companion.';if(state.modal==='global-detail')$('helpBody').innerHTML=renderGlobalDefinitionModal();else if(state.modal?.startsWith('help-'))$('helpBody').innerHTML=renderContextHelp(state.modal.replace(/^help-/,''));else renderHelp();const firstNode=modalFocusableElements()[0];window.setTimeout(()=>{(firstNode||$('helpModal')).focus();},0);}
function handleAction(a){if(a==='open-global-detail'){state.globalDetailKind=state.workspaceView;state.modal='global-detail';renderModal();return;}if(a==='go-structure'){state.treeFilter='all';state.query='';state.treeQuery='';renderAll();toast('Structure workspace ready');return;}if(a==='clear-tree-search'){state.query='';state.treeQuery='';$('globalSearch').value='';renderContent();renderInspector();renderViewbar();renderSearchPopover();$('viewSearch')?.focus();return;}if(a==='show-messages'){const d=scopedDiags()[0];if(d){state.selectedType='diag';state.selectedId=d.id;document.body.classList.add('inspector-open');renderAll();}else toast('No messages in this scope');return;}if(a==='open-help'){state.modal='help';renderModal();return;}if(a==='help-action-branch'||a==='help-model'||a==='help-disabled'){state.modal=a.replace(/^help-/,'help-');renderModal();return;}if(a==='close-modal'){closeModalRender();return;}if(a==='toggle-theme'){state.theme=state.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=state.theme;saveState();toast(`${state.theme==='dark'?'Dark':'Light'} mode`);return;}if(a==='close-inspector'){document.body.classList.remove('inspector-open');saveState();return;}if(a==='show-inspector'){document.body.classList.add('inspector-open');saveState();return;}if(a==='expand-all'){const count=scopedRuleNodes().length;if(count>2500&&!confirm(`Expand ${fmt(count)} structural rules and all action lists? This can be slow.`))return;scopedNodes().forEach(n=>state.expanded.add(n.id));state.collapsedBranches.clear();renderAll();return;}if(a==='collapse-all'){state.expanded.clear();(model.rootsByScope.get(state.scopeId)||[]).forEach(id=>state.expanded.add(String(id)));state.collapsedBranches=new Set(allBranchKeysForScope(state.scopeId));renderAll();return;}if(a==='expand-selected-depth'){const n=selectedNode();if(!n){toast('Select a rule first');return;}state.expanded.add(n.id);collapseBranchesForNode(n.id);renderAll();return;}if(a==='expand-selected-subtree'){const n=selectedNode();if(!n){toast('Select a rule first');return;}subtreeNodes(n.id).forEach(x=>state.expanded.add(x.id));childRouteGroups(n.id).forEach(g=>state.collapsedBranches.delete(branchKey(n.id,g)));renderAll();return;}if(a==='collapse-siblings'){const n=selectedNode();if(!n){toast('Select a rule first');return;}const parent=model.parentByChild.get(n.id);if(parent){childIds(parent).filter(id=>id!==n.id).forEach(id=>state.expanded.delete(id));}renderAll();return;}if(a==='expand-action-groups'){allBranchKeysForScope(state.scopeId).forEach(k=>state.collapsedBranches.delete(k));renderAll();return;}if(a==='collapse-action-groups'){allBranchKeysForScope(state.scopeId).forEach(k=>state.collapsedBranches.add(k));renderAll();return;}if(a==='clear-focus'){state.focusNodeId='';renderAll();return;}if(a==='focus-selected'){const n=selectedNode();if(n){state.focusNodeId=n.id;state.expanded.add(n.id);collapseBranchesForNode(n.id);renderAll();}return;}if(a==='open-linked-node'){const obj=selectedInventory()||selectedRel();if(obj&&obj.nodeId){selectNode(obj.nodeId);}else toast('No linked structural node');return;}if(a==='copy-route-path'){const n=selectedNode();if(!n){toast('Select a structural rule first');return;}copyText(JSON.stringify(selectedPathPacket(n),null,2));return;}if(a==='copy-rule-config'){const b=selectedBranch();if(b){copyText(JSON.stringify(branchPacket(b),null,2));return;}const n=selectedNode();if(!n){toast('Select a rule or branch first');return;}copyText(JSON.stringify(selectedRuleConfigPacket(n),null,2));return;}if(a==='copy-rule-explanation'){const n=selectedNode();if(!n){toast('Select a structural rule first');return;}copyText(rulePlainLanguageNarrative(n));return;}if(a==='copy-branch-route'){const b=selectedBranch();if(!b){toast('Select an action list first');return;}copyText(JSON.stringify({schema:'AcWorkbench.ActionListPath',scopeId:b.scopeId,path:branchPathObjects(b)},null,2));return;}if(a==='first-warning-scope'){const s=model.scopes.find(x=>x.warnings>0);if(s)selectScope(s.scopeId);return;}if(a==='largest-scope'){const s=[...model.scopes].sort((a,b)=>b.structural-a.structural)[0];if(s)selectScope(s.scopeId);return;}}
function viewSearchMeta(){
  if(state.workspaceView==='structure')return {label:'Filter structure',placeholder:'Filter rules by name, function, status result, action list, field, or disabled state'};
  if(state.workspaceView==='field-resolution')return {label:'Filter field resolution',placeholder:'Filter field references by field name, rule, function, or parameter'};
  if(state.workspaceView==='resources')return {label:'Filter resources',placeholder:'Filter resource definitions and references'};
  if(state.workspaceView==='functions')return {label:'Filter functions',placeholder:'Filter functions by name, category, status result, parameter, behavior, or rule usage'};
  if(state.workspaceView==='tables')return {label:'Filter tables',placeholder:'Filter tables by name, column, scope, or rule reference'};
  if(state.workspaceView==='drivers')return {label:'Filter drivers',placeholder:'Filter drivers and process findings'};
  if(state.workspaceView==='udfs')return {label:'Filter UDFs',placeholder:'Filter UDF names, real parameter names, internal rules, caller rules, or status results'};
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
}
function syncQueryInputs(){const q=state.query;const g=optionalElement('globalSearch');if(g&&g.value!==q)g.value=q;const v=optionalElement('viewSearch');if(v&&v.value!==q)v.value=q;const clearBtn=document.querySelector('[data-action="clear-tree-search"]');if(clearBtn)clearBtn.disabled=!text(q).trim();syncViewSearchMeta();}
function applyQueryInput(value){state.query=value;state.treeQuery=value;syncQueryInputs();renderContent();renderInspector();renderSearchPopover();}
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
function wire(){document.addEventListener('click',e=>{if(!isSearchUiTarget(e.target))closeSearchPopover();const act=e.target.closest('[data-action]')?.dataset.action;if(act){if(act==='view-structure'||act==='view-field-resolution'||act==='view-resources'||act==='view-functions'||act==='view-tables'||act==='view-drivers'||act==='view-udfs'){e.preventDefault();state.workspaceView=act.replace(/^view-/,'');if(isGlobalDefinitionView())document.body.classList.remove('inspector-open');renderAll();return;}if(act==='nav-documents'||act==='nav-pages'||act==='nav-batches'||act==='nav-processes'){e.preventDefault();applyEditorNavPreset(act.replace(/^nav-/,''));saveState();return;}e.preventDefault();handleAction(act);return;}const sr=e.target.closest('[data-search-index]')?.dataset.searchIndex;if(sr!==undefined){const results=$('searchPopover')?._results||[];jumpToSearchResult(results[Number(sr)]);return;}const udfFilter=e.target.closest('[data-udf-filter]')?.dataset.udfFilter;if(udfFilter){state.udfFilter=udfFilter;state.selectedUdfName='';renderAll();return;}const fieldFilter=e.target.closest('[data-field-filter]')?.dataset.fieldFilter;if(fieldFilter){state.fieldResolutionFilter=fieldFilter;renderContent();saveState();return;}const sf=e.target.closest('[data-scope-filter]')?.dataset.scopeFilter;if(sf){state.scopeKindFilter=sf;saveState();renderScopes();return;}const sc=e.target.closest('[data-scope]')?.dataset.scope;if(sc){selectScope(sc);return;}const tog=e.target.closest('[data-toggle-node]')?.dataset.toggleNode;if(tog){const nodeId=String(tog);if(state.expanded.has(nodeId)){state.expanded.delete(nodeId);}else{state.expanded.add(nodeId);collapseBranchesForNode(nodeId);}renderContent();renderViewbar();renderInspector();return;}const br=e.target.closest('[data-toggle-branch]')?.dataset.toggleBranch;if(br){state.collapsedBranches.has(br)?state.collapsedBranches.delete(br):state.collapsedBranches.add(br);renderContent();renderViewbar();renderInspector();return;}const branch=e.target.closest('[data-branch]')?.dataset.branch;if(branch){selectBranch(branch);return;}const nodeEl=e.target.closest('[data-node]');const node=nodeEl?.dataset.node;if(node){selectNodeInScope(node,nodeEl?.dataset.nodeScope||'');return;}const inv=e.target.closest('[data-inventory]')?.dataset.inventory;if(inv){state.selectedType='inventory';state.selectedId=inv;document.body.classList.add('inspector-open');renderAll();return;}const rel=e.target.closest('[data-rel]')?.dataset.rel;if(rel){state.selectedType='rel';state.selectedId=rel;document.body.classList.add('inspector-open');renderAll();return;}const diag=e.target.closest('[data-diag]')?.dataset.diag;if(diag){state.selectedType='diag';state.selectedId=diag;document.body.classList.add('inspector-open');renderAll();return;}});
  document.addEventListener('input',e=>{if(e.target.id==='scopeSearch'){closeSearchPopover();state.scopeQuery=e.target.value;renderScopes();}else if(e.target.id==='globalSearch'||e.target.id==='viewSearch'){if(searchDebounceTimer)window.clearTimeout(searchDebounceTimer);searchDebounceTimer=window.setTimeout(()=>applyQueryInput(e.target.value),120);}});
  document.addEventListener('search',e=>{if(e.target.id==='globalSearch'||e.target.id==='viewSearch')applyQueryInput(e.target.value);});
  document.addEventListener('change',e=>{if(e.target.id==='treeFilter'){state.treeFilter=e.target.value;renderContent();renderInspector();renderViewbar();return;}if(e.target.id==='disclosureLevel'){state.disclosureLevel=Number(e.target.value)||2;saveState();renderContent();renderViewbar();return;}});
  document.addEventListener('keydown',e=>{if(state.modal)handleModalFocusTrap(e);const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'');if(typing&&handleSearchPopoverKeydown(e))return;if(e.key==='Escape'){if(state.modal){closeModalRender();return;}closeSearchPopover();document.body.classList.remove('inspector-open');return;}if(!typing&&e.key==='/'){e.preventDefault();$('globalSearch').focus();return;}if(!typing&&e.key==='?'){e.preventDefault();state.modal='help';renderModal();return;}if(!typing&&e.altKey&&lower(e.key)==='a'){e.preventDefault();handleAction('expand-all');return;}if(!typing&&e.altKey&&lower(e.key)==='d'){e.preventDefault();handleAction('expand-selected-depth');return;}if(!typing&&e.altKey&&lower(e.key)==='p'){e.preventDefault();handleAction('collapse-siblings');return;}if(!typing&&e.altKey&&lower(e.key)==='f'){e.preventDefault();handleAction('clear-focus');return;}if(!typing&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();moveSelection(e.key==='ArrowDown'?1:-1);return;}if(!typing&&(e.key==='ArrowRight'||e.key==='ArrowLeft'||e.key===' '||e.key==='Enter'||e.key==='Home'||e.key==='End')){handleTreeKey(e);}});
}
function wireTableSelection(){document.addEventListener('click',e=>{const tableName=e.target.closest('[data-table-name]')?.dataset.tableName;if(!tableName)return;state.selectedTableName=tableName;renderContent();saveState();});}
function wireUdfSelection(){document.addEventListener('click',e=>{const udfName=e.target.closest('[data-udf-name]')?.dataset.udfName;if(!udfName)return;state.selectedUdfName=udfName;renderContent();saveState();});}
function wireGlobalDefinitionSelection(){document.addEventListener('click',e=>{const row=e.target.closest('[data-global-kind][data-global-key]');if(!row)return;const kind=row.dataset.globalKind,key=row.dataset.globalKey;if(kind==='resources')state.selectedResourceKey=key;else if(kind==='functions')state.selectedFunctionName=key;else if(kind==='drivers')state.selectedDriverKey=key;else if(kind==='tables')state.selectedTableName=key;else if(kind==='udfs')state.selectedUdfName=key;else return;e.preventDefault();renderContent();saveState();});}
function focusableRows(){return [...document.querySelectorAll('.tree-row[data-node],.branch-row[data-branch]')];}
function moveSelection(delta){const rows=focusableRows();if(!rows.length)return;let idx=rows.findIndex(r=>(r.dataset.node&&state.selectedId===r.dataset.node)||(r.dataset.branch&&state.selectedId===r.dataset.branch));idx=idx<0?0:Math.max(0,Math.min(rows.length-1,idx+delta));const row=rows[idx];if(row.dataset.node)selectNode(row.dataset.node);else if(row.dataset.branch)selectBranch(row.dataset.branch);row.focus();}
function handleTreeKey(e){const active=document.activeElement;const node=active?.closest?.('[data-node]')?.dataset.node;const branch=active?.closest?.('[data-branch]')?.dataset.branch;if(e.key==='Home'){e.preventDefault();focusableRows()[0]?.focus();return;}if(e.key==='End'){e.preventDefault();const rows=focusableRows();rows[rows.length-1]?.focus();return;}if(e.key==='Enter'){e.preventDefault();if(branch)selectBranch(branch);else if(node)selectNode(node);return;}if(e.key===' '){e.preventDefault();if(branch){state.collapsedBranches.has(branch)?state.collapsedBranches.delete(branch):state.collapsedBranches.add(branch);}else if(node){state.expanded.has(node)?state.expanded.delete(node):(state.expanded.add(node),collapseBranchesForNode(node));}renderContent();renderInspector();return;}if(e.key==='ArrowRight'){e.preventDefault();if(branch)state.collapsedBranches.delete(branch);else if(node){state.expanded.add(node);collapseBranchesForNode(node);}renderContent();renderInspector();return;}if(e.key==='ArrowLeft'){e.preventDefault();if(branch)state.collapsedBranches.add(branch);else if(node)state.expanded.delete(node);renderContent();renderInspector();return;}}
async function init(){
  renderBootLoading();
  try {
    await loadViewerData();
    model=buildModel();
    setBootPhase('ready','FWD snapshot loaded');
  } catch (error) {
    setBootPhase('failed',error&&error.message?error.message:'Unable to load FWD snapshot files.');
    reportUiError('data load', error);
    renderNoData();
    return;
  }

  return withUiGuard('boot',()=>{if(!model.scopes.length){renderNoData();return;}restoreSnapshotState();if(!model.scopes.some(s=>s.scopeId===state.scopeId))state.scopeId=model.scopes[0].scopeId;state.workspaceView=requestedWorkspaceView()||state.workspaceView;seedExpanded(state.scopeId);wire();wireGuidanceHints();wireOnboardingChecklist();wireTableSelection();wireUdfSelection();wireGlobalDefinitionSelection();renderAll();});
}

init();
})();
