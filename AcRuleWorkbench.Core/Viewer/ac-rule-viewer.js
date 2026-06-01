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
/*
  AC Rule Workbench generated viewer.

  Engineering notes:
  - This file is intentionally dependency-free so evidence packages remain offline-reviewable.
  - Structural tree data is the authority for hierarchy, action routing, and disabled inheritance.
  - Flat inventory and flow data are supporting evidence only; flow is experimental.
  - Keep all user-facing claims evidence-classed. Do not imply runtime execution.
*/
let rulesData = null;
let relData = null;
let treeData = null;
let flowData = null;
let fwdData = null;

const embeddedPayload = {
  rulesData: "__RULES_JSON__",
  relData: "__RELATIONSHIPS_JSON__",
  treeData: "__TREE_JSON__",
  flowData: "__FLOW_JSON__"
};

function tryParseEmbeddedPayload(raw){
  if(!raw || raw.startsWith('__')) return null;
  try { return JSON.parse(raw); }
  catch { return null; }
}

function applyEmbeddedPayloadIfPresent(){
  const parsed = {
    rulesData: tryParseEmbeddedPayload(embeddedPayload.rulesData),
    relData: tryParseEmbeddedPayload(embeddedPayload.relData),
    treeData: tryParseEmbeddedPayload(embeddedPayload.treeData),
    flowData: tryParseEmbeddedPayload(embeddedPayload.flowData)
  };

  if(parsed.rulesData && parsed.relData && parsed.treeData && parsed.flowData){
    rulesData = parsed.rulesData;
    relData = parsed.relData;
    treeData = parsed.treeData;
    flowData = parsed.flowData;
    return true;
  }

  return false;
}

// Load large evidence payloads from sidecar JSON files so the viewer shell can bootstrap faster.
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
    flowData: 'ac-rule-viewer.flow.json'
  };
  const entries = Object.entries(files);
  const results = await Promise.all(entries.map(async ([key, file]) => {
    return [key, await fetchJsonWithFallback(file)];
  }));

  for (const [key, value] of results) {
    if (key === 'rulesData') rulesData = value;
    else if (key === 'relData') relData = value;
    else if (key === 'treeData') treeData = value;
    else if (key === 'flowData') flowData = value;
  }

  await loadCanonicalFwdData();
}

// Attempt to hydrate canonical FWD object surfaces from API v1 when viewer is hosted with the workbench server.
async function loadCanonicalFwdData(){
  const baseCandidates=['/api/v1','./api/v1','../api/v1','../../api/v1'];
  const snapshotMode=(()=>{const mode=new URLSearchParams(window.location.search).get('snapshotMode');return mode==='live'?'live':'snapshot';})();
  const timeoutMs=8000;
  const endpoints=[
    ['overview','fwd/overview'],
    ['documents','fwd/documents'],
    ['pages','fwd/pages'],
    ['batches','fwd/batches'],
    ['processes','fwd/processes'],
    ['processDrivers','fwd/processes/drivers'],
    ['resources','fwd/resources'],
    ['tables','fwd/tables'],
    ['udfs','fwd/udfs'],
    ['pageVariants','fwd/page-variants'],
    ['fields','fwd/fields']
  ];
  async function fetchApi(path){
    for(const base of baseCandidates){
      try{
        const slash=base.endsWith('/')?'':'/';
        const withMode=`${base}${slash}${path}?snapshotMode=${snapshotMode}`;
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
    canonicalHydrationState.mode='none';
    canonicalHydrationState.failedEndpoints=failed;
    return;
  }

  fwdData={
    overview:hydrated.overview,
    documents:hydrated.documents,
    pages:hydrated.pages,
    batches:hydrated.batches,
    processes:hydrated.processes,
    processDrivers:hydrated.processDrivers,
    resources:hydrated.resources,
    tables:hydrated.tables,
    udfs:hydrated.udfs,
    pageVariants:hydrated.pageVariants,
    fields:hydrated.fields
  };

  canonicalHydrationState.mode=failed.length?'partial':'full';
  canonicalHydrationState.failedEndpoints=failed;
}
function $(id){
  const el=document.getElementById(id);
  if(!el) throw new Error(`Required UI element was not found: #${id}`);
  return el;
}
function optionalElement(id){ return document.getElementById(id); }
const storeKey='ac-rule-workbench-v30-engineering-hardened';
const inspectorSections=['summary','route','branches','parameters','references','diagnostics','evidence','raw'];
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
    focusNodeId:'',rcaFocus:!!saved.rcaFocus,theme:saved.theme||'light',density:saved.density==='high'?'high':'standard',modal:'',
    selectedTableName:saved.selectedTableName||'',
    selectedUdfName:saved.selectedUdfName||'',
    recentScopes:Array.isArray(saved.recentScopes)?saved.recentScopes:[],searchActiveIndex:-1
  };
}
const state=readState();document.documentElement.dataset.theme=state.theme;
let toastTimer=0;
let searchDebounceTimer=0;
let modalPreviouslyFocusedEl=null;
let scopeFieldResolutionCache=new Map();
const canonicalHydrationState={mode:'none',failedEndpoints:[]};
function applyDensityClass(density){const mode=density==='high'?'high':'standard';state.density=mode;document.body.classList.remove('density-high','density-standard');document.body.classList.add(`density-${mode}`);}
function isDesktopPrimaryDevice(){return window.matchMedia('(min-width: 1280px) and (pointer: fine)').matches;}
function viewportTier(){const w=Math.max(window.innerWidth||0,document.documentElement.clientWidth||0);if(w>=2200)return 'ultra';if(w>=1700)return 'wide';return 'regular';}
function desktopPreset(){const candidate=Math.max(window.screen?.width||0,window.innerWidth||0);if(candidate>=3600)return 'uhd';if(candidate>=2400)return 'qhd';return 'default';}
function applyViewportProfile(){const desktopPrimary=isDesktopPrimaryDevice();const firstSessionVisit=readStorage(storeKey)===null;document.body.classList.toggle('desktop-primary',desktopPrimary);document.body.classList.remove('desktop-wide','desktop-ultra','desktop-qhd','desktop-uhd');if(desktopPrimary){const tier=viewportTier();if(tier==='wide')document.body.classList.add('desktop-wide');else if(tier==='ultra')document.body.classList.add('desktop-ultra');const preset=desktopPreset();if(preset==='qhd')document.body.classList.add('desktop-qhd');else if(preset==='uhd')document.body.classList.add('desktop-uhd');if(firstSessionVisit&&state.density!=='high')state.density='high';}applyDensityClass(state.density);}
applyViewportProfile();window.addEventListener('resize',applyViewportProfile);
function reportUiError(context,error){
  const message=error&&error.message?error.message:String(error||'Unknown error');
  console.error(`AC Rule Workbench ${context} failed:`, error);
  const banner=optionalElement('globalErrorBanner');
  if(banner){
    banner.textContent=`${context==='data load'?'Evidence load error':'Workbench error'}: ${message}`;
    banner.hidden=false;
  }
  const toastNode=optionalElement('toast');
  if(toastNode){
    toast(`Workbench error: ${message}`,'error',4500);
  }
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
function disabledOf(x){const raw=lower(first(x.DisabledState,x.disabledState,''));if(raw.includes('inherited')||raw.includes('possiblydisabledinherited'))return 'inherited';if(raw.includes('direct')||raw==='disabled'||raw==='true'||raw==='1')return 'direct';return 'none';}
function paramText(p){if(!p)return'';if(typeof p==='string')return p;if(typeof p!=='object')return text(p);return Object.keys(p).map(k=>`${k}:${list(p[k]).map(text).join('|')}`).join(' ')}
function actionNamesOf(n){return list(first(n.ActionNames,n.actionNames,[])).map(text).filter(Boolean)}
function routeName(e){const name=first(e.ActionName,e.actionName,e.Label,e.label);if(name)return text(name);if(String(first(e.EdgeKind,e.relationship,''))==='RootListEntry'||Number(first(e.ActionListIndex,-1))<0)return 'Root';const idx=first(e.ActionListIndex,e.actionListIndex);return idx===undefined?'Unresolved route':`action ${idx}`;}
function routeState(e){if(!e)return 'Root';const kind=text(first(e.EdgeKind,e.kind,e.relationship,''));const idx=Number(first(e.ActionListIndex,e.actionListIndex,-1));if(kind==='RootListEntry'||idx<0)return 'Root';if(first(e.ActionNameResolved,e.actionNameResolved,false)===true||!!first(e.ActionName,e.actionName,null))return 'Resolved';return idx>=0?'IndexOnly':'Unresolved';}
function routeResolved(e){const st=routeState(e);return st==='Root'||st==='Resolved';}
function ruleKeyParts(x){return [scopeIdOf(x),first(x.RuleGuid,x.ruleGuid,''),first(x.RuleId,x.ruleId,''),titleOf(x),fnOf(x),first(x.RuleIndexWithinScope,x.RuleIndex,'')].map(text).join('|').toLowerCase();}
function scopedGuidKey(x){const guid=first(x.RuleGuid,x.ruleGuid,'');return guid?`${scopeIdOf(x)}|${guid}`.toLowerCase():'';}
function scopedNameFunctionKey(x){const name=titleOf(x),fn=fnOf(x);return name&&fn?`${scopeIdOf(x)}|${name}|${fn}`.toLowerCase():'';}
function addUniqueIndex(map,key,id){if(!key)return;if(!map.has(key))map.set(key,[]);map.get(key).push(id);}
function uniqueLookup(map,key){const hits=key&&map.get(key);return hits&&hits.length===1?hits[0]:'';}
function correlationNodeId(x,exact,guid,nameFn){return exact.get(ruleKeyParts(x))||uniqueLookup(guid,scopedGuidKey(x))||uniqueLookup(nameFn,scopedNameFunctionKey(x))||'';}
/** Build the normalized client-side indexes used by the tree, inspector, search, and exports. */
function buildModel(){
  const scopes=new Map();
  const upsertScope=x=>{const id=scopeIdOf(x);const current=scopes.get(id)||{scopeId:id,name:scopeNameOf(x),kind:scopeKindOf(x),structural:0,inventory:0,flatOnly:0,refs:0,diags:0,directDisabled:0,inheritedDisabled:0,warnings:0};current.name=current.name||scopeNameOf(x);current.kind=current.kind||scopeKindOf(x);scopes.set(id,current);return current;};
  list(treeData.Scopes).forEach(s=>{ upsertScope(s); });
  const nodes=list(treeData.Nodes).map((n,i)=>{const id=text(first(n.NodeId,n.nodeId,`synthetic-${i}`));const scope=upsertScope(n);const disabled=disabledOf(n);if(n.IsRuleNode)scope.structural++;if(disabled==='direct')scope.directDisabled++;if(disabled==='inherited')scope.inheritedDisabled++;return {...n,id,scopeId:scopeIdOf(n),title:titleOf(n),fn:fnOf(n),depth:Number(first(n.HierarchyLevel,n.depth,0))||0,disabled,isRule:!!n.IsRuleNode,isSection:!n.IsRuleNode||!fnOf(n)||/^\*{4,}$/.test(titleOf(n))||/read this comment/i.test(titleOf(n)),searchBlob:''};});
  const nodesById=new Map(nodes.map(n=>[n.id,n]));
  nodes.forEach(n=>{n.searchBlob=[n.title,n.fn,n.RuleGuid,n.RuleId,n.ScopePath,n.Description,paramText(n.Parameters),actionNamesOf(n).join(' ')].join(' ').toLowerCase();});
  const edges=list(treeData.Edges).map((e,i)=>({...e,id:`edge-${i}`,from:text(first(e.FromNodeId,e.fromNodeId,e.From,e.from,'')),to:text(first(e.ToNodeId,e.toNodeId,e.To,e.to,'')),scopeId:scopeIdOf(e),kind:text(first(e.EdgeKind,e.kind,e.relationship,'Edge')),label:routeName(e),routeState:routeState(e),resolved:routeResolved(e)}));
  const childrenByParent=new Map(),parentByChild=new Map(),incomingByChild=new Map(),edgesByParent=new Map();
  edges.forEach(e=>{if(!e.from||!e.to)return;if(!childrenByParent.has(e.from))childrenByParent.set(e.from,[]);childrenByParent.get(e.from).push(e.to);parentByChild.set(e.to,e.from);incomingByChild.set(e.to,e);if(!edgesByParent.has(e.from))edgesByParent.set(e.from,[]);edgesByParent.get(e.from).push(e);});
  const rootsByScope=new Map();
  nodes.forEach(n=>{const parent=text(first(n.ParentNodeId,''));const isRoot=!parentByChild.has(n.id)||parent==='-1'||parent===''||!nodesById.has(parentByChild.get(n.id));if(isRoot){if(!rootsByScope.has(n.scopeId))rootsByScope.set(n.scopeId,[]);rootsByScope.get(n.scopeId).push(n.id);}});
  const structuralByKey=new Map(),structuralByGuid=new Map(),structuralByNameFn=new Map();
  nodes.forEach(n=>{structuralByKey.set(ruleKeyParts(n),n.id);addUniqueIndex(structuralByGuid,scopedGuidKey(n),n.id);addUniqueIndex(structuralByNameFn,scopedNameFunctionKey(n),n.id);});
  const inventory=list(rulesData.Rules).map((r,i)=>{const scope=upsertScope(r);const nodeId=correlationNodeId(r,structuralByKey,structuralByGuid,structuralByNameFn);const structuralNode=nodeId?nodesById.get(String(nodeId)):null;const flatDisabled=disabledOf(r);const disabled=structuralNode?structuralNode.disabled:flatDisabled;const row={...r,id:`flat-${i}`,scopeId:scopeIdOf(r),title:titleOf(r),fn:fnOf(r),flatDisabled,disabled,disabledAuthority:structuralNode?'Structural':'FlatInventory',nodeId,classification:nodeId?'StructuralMatch':'FlatOnly',searchBlob:''};row.searchBlob=[row.title,row.fn,row.RuleGuid,row.RuleId,row.ScopePath,row.classification,paramText(row.Parameters),flatDisabled,disabled].join(' ').toLowerCase();scope.inventory++;if(!nodeId)scope.flatOnly++;return row;});
  const rels=list(first(relData.Relationships,relData.Edges,[])).map((r,i)=>{const nodeId=correlationNodeId(r,structuralByKey,structuralByGuid,structuralByNameFn);const row={...r,id:`rel-${i}`,scopeId:scopeIdOf(r),nodeId,kind:text(first(r.Kind,r.EdgeKind,'Reference')),targetType:text(first(r.TargetType,'Unknown')),target:text(first(r.Target,'')),confidence:text(first(r.Confidence,'Medium')),searchBlob:''};row.searchBlob=[row.kind,row.targetType,row.target,row.confidence,row.ScopePath,row.RuleName,row.FunctionName].join(' ').toLowerCase();const scope=upsertScope(row);scope.refs++;return row;});
  const diags=list(first(treeData.Diagnostics,rulesData.Diagnostics,relData.Diagnostics,[])).map((d,i)=>{const severity=text(first(d.Severity,d.severity,'Info'));const row={...d,id:`diag-${i}`,scopeId:scopeIdOf(d),severity,title:text(first(d.Title,d.Code,d.Message,'Diagnostic')),detail:text(first(d.Detail,d.Message,d.Recommendation,'')),nodeId:text(first(d.NodeId,d.nodeId,'')),searchBlob:''};row.searchBlob=[row.severity,row.title,row.detail,row.scopeId,row.nodeId].join(' ').toLowerCase();const scope=upsertScope(row);scope.diags++;if(/warn|error/i.test(row.severity))scope.warnings++;return row;});
  const flowEdges=list(flowData.Edges).map((e,i)=>({...e,id:`flow-${i}`,scopeId:scopeIdOf(e)}));
  return {scopes:[...scopes.values()].sort((a,b)=>(b.structural-a.structural)||a.name.localeCompare(b.name)),nodes,nodesById,edges,childrenByParent,parentByChild,incomingByChild,edgesByParent,rootsByScope,inventory,rels,diags,flowEdges,fwd:fwdData};
}
let model;
const bootState={phase:'loading',detail:'Loading evidence payloads...'};

function canonicalHydrationSummary(){
  if(canonicalHydrationState.mode==='full')return {level:'ready',label:'Canonical FWD loaded'};
  if(canonicalHydrationState.mode==='partial')return {level:'warn',label:`Canonical partial (${canonicalHydrationState.failedEndpoints.length} endpoint${canonicalHydrationState.failedEndpoints.length===1?'':'s'} unavailable)`};
  return {level:'warn',label:'Canonical FWD unavailable'};
}

function setBootPhase(phase,detail=''){
  bootState.phase=phase;
  bootState.detail=detail||'';
  document.body.setAttribute('aria-busy',phase==='loading'?'true':'false');
  optionalElement('content')?.setAttribute('aria-busy',phase==='loading'?'true':'false');
}

function renderBootLoading(){
  setBootPhase('loading','Loading evidence payloads...');
  $('sourceSubtitle').textContent='Loading evidence snapshot...';
  $('qualityPill').innerHTML='<span class="dot"></span><span>Loading evidence</span>';
  $('scopeList').innerHTML=emptyHtml('Loading scopes','Large snapshots can take a moment to parse.');
  $('content').innerHTML=emptyHtml('Preparing structural workspace','Loading evidence indexes and route maps...');
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
function scopedRouteStats(){const edges=scopedEdges();const root=edges.filter(e=>e.routeState==='Root').length;const resolved=edges.filter(e=>e.routeState==='Resolved').length;const indexOnly=edges.filter(e=>e.routeState==='IndexOnly').length;const unresolved=edges.filter(e=>e.routeState==='Unresolved').length;return {edges:edges.length,root,resolved,indexOnly,unresolved,nonRoot:Math.max(0,edges.length-root)};}
function scopeEvidenceStripHtml(){const s=currentScope(),stats=scopedRouteStats();const totalNonRoot=Math.max(1,stats.nonRoot);const decodedPct=Math.round((stats.resolved/totalNonRoot)*100);return `<div class="trust-strip" aria-label="Scope evidence health"><div class="trust-item info"><b>Scope evidence</b><span>${esc(s.kind||'Scope')}</span></div><div class="trust-item good"><b>Structure</b><span>${fmt(scopedRuleNodes().length)} rules</span></div><div class="trust-item ${stats.indexOnly||stats.unresolved?'warn':'good'}"><b>Route labels</b><span>${fmt(stats.resolved)} resolved / ${fmt(stats.indexOnly+stats.unresolved)} unresolved</span></div><div class="trust-item ${s.flatOnly?'warn':'good'}"><b>Flat-only</b><span>${fmt(s.flatOnly)}</span></div><div class="trust-item ${s.warnings?'warn':'good'}"><b>Diagnostics</b><span>${s.warnings?fmt(s.warnings):'None'}</span></div><div class="trust-item warn"><b>Flow</b><span>Experimental</span></div></div><div class="caption caption-block">Route-label coverage: ${decodedPct}% of non-root structural edges have resolved parent action names. ac-flow.json remains low-confidence triage, not runtime proof.</div>`;}
function selectedNode(){return state.selectedType==='node'?model.nodesById.get(String(state.selectedId)):null;}
function selectedInventory(){return state.selectedType==='inventory'?model.inventory.find(x=>x.id===state.selectedId):null;}
function selectedRel(){return state.selectedType==='rel'?model.rels.find(x=>x.id===state.selectedId):null;}
function selectedDiag(){return state.selectedType==='diag'?model.diags.find(x=>x.id===state.selectedId):null;}
function renderMainHead(){
  const s=currentScope();
  $('scopeTitle').textContent=s.name;
  const hydration=canonicalHydrationSummary();
  const captions={
    structure:'Structural hierarchy and route map',
    'field-resolution':'Scope-level unresolved/resolved field matching against canonical field metadata',
    resources:'Canonical resource inventory with evidence usage overlays',
    tables:'Canonical tables first; inferred candidates are separate evidence',
    drivers:'Process-private config findings separated from process identities',
    udfs:'Function/UDF candidates with explicit usage and inference evidence labels'
  };
  $('scopeCaption').innerHTML=`<span class="scope-caption-note">${esc(captions[state.workspaceView]||captions.structure)}</span>`;
  $('crumbs').innerHTML=`<span class="head-chip kind">${esc(s.kind)}</span><span class="head-chip">Structure-first view</span><span class="head-chip ${hydration.level==='warn'?'warn':''}">${esc(hydration.label)}</span>${state.focusNodeId?'<span class="head-chip focus">Focused subtree</span>':''}`;
  $('tabs').innerHTML='';
  renderViewbar();
}
function renderContent(){
  if(state.workspaceView==='field-resolution')return renderFieldResolutionTriage();
  if(state.workspaceView==='resources')return renderDomainCatalog('Resources',domainRowsByView('resources'),'Resource usage inferred from reference/source evidence.');
  if(state.workspaceView==='tables')return renderGlobalTablesMasterDetail();
  if(state.workspaceView==='drivers')return renderDomainCatalog('Input/Output Drivers',domainRowsByView('drivers'),'Driver/process references inferred from source/target metadata.');
  if(state.workspaceView==='udfs')return renderUdfMasterDetail();
  return renderStructure();
}
function renderOverview(){const s=currentScope(),rules=scopedRuleNodes(),inv=scopedInventory(),refs=scopedRels(),diags=scopedDiags();const f=topCounts(rules.map(n=>n.fn).filter(Boolean));const actions=topCounts(rules.flatMap(n=>actionNamesOf(n)));const rs=scopedRouteStats();$('content').innerHTML=`${scopeEvidenceStripHtml()}<div class="notice"><div class="notice-icon">i</div><div><b>Evidence discipline:</b> Structure proves hierarchy, parent action labels, branch order, and disabled inheritance. Inventory proves broad extraction coverage. References are static confidence-coded relationships. Flow projections are experimental / low-confidence and are not runtime traces.</div></div><div class="metric-grid"><div class="metric good"><b>${fmt(rules.length)}</b><span>Structural rules</span></div><div class="metric ${s.flatOnly?'warn':''}"><b>${fmt(s.flatOnly)}</b><span>Flat-only rows</span></div><div class="metric"><b>${fmt(refs.length)}</b><span>References</span></div><div class="metric ${diags.length?'warn':''}"><b>${fmt(diags.length)}</b><span>Diagnostics</span></div></div><div class="grid-2"><div class="panel"><h3>Top functions</h3>${bars(f)}</div><div class="panel"><h3>Top action labels</h3>${bars(actions)}</div></div><div class="panel"><h3>Route-label resolution</h3><div class="metric-grid"><div class="metric good"><b>${fmt(rs.resolved)}</b><span>Resolved non-root routes</span></div><div class="metric ${rs.indexOnly?'warn':''}"><b>${fmt(rs.indexOnly)}</b><span>Index-only routes</span></div><div class="metric"><b>${fmt(rs.root)}</b><span>Root entries</span></div><div class="metric warn"><b>Low</b><span>Flow confidence</span></div></div></div><div class="grid-3"><button class="quick-card" data-action="go-structure"><b>Inspect hierarchy</b><span>Open structural tree with action-route chips.</span></button><button class="quick-card" data-action="show-flat-only"><b>Review flat-only rows</b><span>Separate completeness evidence from runtime-order proof.</span></button><button class="quick-card" data-action="show-diagnostics"><b>Review diagnostics</b><span>Check parser/extractor risk before analysis.</span></button></div>`;}
function bars(rows){if(!rows.length)return '<div class="muted">No values.</div>';const max=Math.max(...rows.map(r=>r.count),1);return `<div class="mini-list">${rows.slice(0,10).map(r=>`<div class="mini-row"><span class="mono">${esc(r.name)}</span><b>${fmt(r.count)}</b><div class="bar bar-span-all"><i style="--bar-w:${Math.max(3,r.count/max*100)}%"></i></div></div>`).join('')}</div>`;}
function topCounts(values){const m=new Map();values.map(text).filter(Boolean).forEach(v=>m.set(v,(m.get(v)||0)+1));return [...m].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));}
function childIds(id){return list(model.childrenByParent.get(String(id))).map(String);}
function edgeRouteKey(e){return [e?.routeState||'',e?.label||'',first(e?.ActionListIndex,e?.actionListIndex,'')].join('|');}
function branchKey(parentId,g){return `${String(parentId)}::${g?.key||edgeRouteKey(g?.edge)||g?.label||'route'}`;}
function branchKeyFromEdge(parentId,e){return `${String(parentId)}::${edgeRouteKey(e)}`;}
function childRouteGroups(id){const edges=list(model.edgesByParent.get(String(id))).filter(e=>e&&e.to&&e.routeState!=='Root');const groups=[];const byKey=new Map();edges.forEach(e=>{const key=edgeRouteKey(e);let g=byKey.get(key);if(!g){g={key,edge:e,label:e.label||'Unresolved route',routeState:e.routeState||'Unresolved',resolved:!!e.resolved,actionListIndex:first(e.ActionListIndex,e.actionListIndex,null),childIds:[]};byKey.set(key,g);groups.push(g);}g.childIds.push(String(e.to));});return groups;}
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
 * Rule expansion reveals action branches; action expansion reveals child rules.
 */
function visibleStructureRows(){const roots=state.focusNodeId?[String(state.focusNodeId)]:(model.rootsByScope.get(state.scopeId)||[]).map(String);const rows=[];const filtered=!!state.treeQuery||state.treeFilter!=='all';function walk(id,level){const n=model.nodesById.get(String(id));if(!n||n.scopeId!==state.scopeId)return;const include=filtered?treeHasMatch(id):true;const selfOk=passesTreeFilter(n)&&hasVisibleQuery(n);if(include)rows.push({type:'node',n,level,visible:selfOk||!filtered,context:filtered&&!selfOk});const expanded=filtered||state.expanded.has(id)||id===state.focusNodeId;if(!expanded)return;const groups=childRouteGroups(id).map(g=>({...g,childIds:g.childIds.filter(cid=>!filtered||treeHasMatch(cid))})).filter(g=>g.childIds.length>0);const groupedChildIds=new Set(groups.flatMap(g=>g.childIds));if(groups.length){groups.forEach(g=>{const key=branchKey(id,g);const open=filtered||!state.collapsedBranches.has(key);rows.push({type:'branch',parent:n,group:g,key,open,level:level+1});if(open)g.childIds.forEach(c=>walk(c,level+2));});childIds(id).filter(c=>!groupedChildIds.has(String(c))).forEach(c=>{if(!filtered||treeHasMatch(c))walk(c,level+1);});}else{childIds(id).forEach(c=>walk(c,level+1));}}
roots.forEach(r=>walk(r,0));return rows;}
function visibleTreeNodes(){return visibleStructureRows().filter(r=>r.type==='node');}
function routeChip(e){if(!e)return '<span class="route-chip root">root</span>';if(e.kind==='RootListEntry'||e.label==='Root'||e.routeState==='Root')return '<span class="route-chip root" title="Root list entry">root list</span>';const cls=e.resolved?'resolved':'unresolved';const title=e.resolved?'Incoming parent action label resolved':'Incoming action index is present, but the action label was not resolved';return `<span class="route-chip ${cls}" title="${esc(title)}"><span class="route-prefix">via</span> ${esc(e.label)}</span>`;}
function filteredInventory(){return scopedInventory().filter(r=>{if(!hasVisibleQuery(r))return false;if(state.inventoryFilter==='StructuralMatch')return r.classification==='StructuralMatch';if(state.inventoryFilter==='FlatOnly')return r.classification==='FlatOnly';if(state.inventoryFilter==='direct')return r.disabled==='direct';if(state.inventoryFilter==='inherited')return r.disabled==='inherited';return true;});}
function renderInventory(){const rows=filteredInventory();$('content').innerHTML=`<div class="notice"><div class="notice-icon">!</div><div><b>Inventory is not execution order.</b> Use flat rows for search/completeness. Only rows classified as StructuralMatch link to the hierarchy.</div></div><div class="table-list">${rows.slice(0,5000).map(r=>`<div class="data-row ${state.selectedId===r.id?'selected':''}" data-inventory="${esc(r.id)}"><div><div class="data-title">${esc(r.title)}</div><div class="data-sub">${esc(r.scopeId)} · ${esc(r.RuleGuid||r.RuleId||'no id')}</div></div><div class="mono">${esc(r.fn||'no function')}</div><div>${r.classification==='FlatOnly'?'<span class="badge amber">Flat-only</span>':'<span class="badge green">StructuralMatch</span>'}</div><div>${r.nodeId?'<span class="badge blue">Linked</span>':''}</div></div>`).join('')||emptyHtml('No inventory rows match','Adjust search or filter.')}</div>${rows.length>5000?'<div class="notice"><div class="notice-icon">i</div><div>Showing first 5,000 matching inventory rows for browser performance. Export for the full slice.</div></div>':''}`;}
function filteredRefs(){return scopedRels().filter(r=>{if(!hasVisibleQuery(r))return false;const k=lower(r.kind),t=lower(r.targetType),c=lower(r.confidence),runtime=/true|yes|runtime/.test(lower(first(r.RuntimeDependency,r.IsRuntimeDependency,'')));if(state.referenceFilter==='high')return c==='high';if(state.referenceFilter==='runtime')return runtime;if(state.referenceFilter==='field')return t.includes('field')||k.includes('field');if(state.referenceFilter==='table')return t.includes('table')||t.includes('resource')||k.includes('table')||k.includes('source');if(state.referenceFilter==='write')return k.includes('write')||k.includes('mutate')||k.includes('reject');return true;});}
function renderReferences(){const rows=filteredRefs();$('content').innerHTML=`<div class="table-list">${rows.slice(0,5000).map(r=>`<div class="data-row compact ${state.selectedId===r.id?'selected':''}" data-rel="${esc(r.id)}"><div><div class="data-title">${esc(r.kind)} → ${esc(r.target||'(empty)')}</div><div class="data-sub">${esc(r.RuleName||r.SourceRuleName||r.scopeId)} · ${esc(r.fn||r.FunctionName||'')}</div></div><div>${badgeConfidence(r.confidence)}</div><div><span class="badge ${r.nodeId?'blue':'amber'}">${r.nodeId?'Structural link':'Flat/heuristic'}</span></div><div class="mono">${esc(r.targetType)}</div></div>`).join('')||emptyHtml('No references match','Adjust search or filter.')}</div>${rows.length>5000?'<div class="notice"><div class="notice-icon">i</div><div>Showing first 5,000 references. Export for the full slice.</div></div>':''}`;}
function badgeConfidence(c){const l=lower(c);const cls=l==='high'?'green':l==='low'?'amber':'blue';return `<span class="badge ${cls}">${esc(c||'Medium')}</span>`;}
function filteredDiags(){return scopedDiags().filter(d=>{if(!hasVisibleQuery(d))return false;const sev=lower(d.severity);if(state.diagnosticFilter==='warning')return /warn|error/.test(sev);if(state.diagnosticFilter==='info')return sev==='info';if(state.diagnosticFilter==='linked')return !!d.nodeId;return true;});}
function renderDiagnostics(){const rows=filteredDiags();$('content').innerHTML=`<div class="table-list">${rows.map(d=>`<div class="data-row ${state.selectedId===d.id?'selected':''}" data-diag="${esc(d.id)}"><div><div class="data-title">${esc(d.title)}</div><div class="data-sub">${esc(d.detail||d.Message||'')}</div></div><div><span class="badge ${/warn|error/i.test(d.severity)?'amber':'blue'}">${esc(d.severity)}</span></div><div>${d.nodeId?`<span class="badge blue">Node ${esc(d.nodeId)}</span>`:''}</div><div></div></div>`).join('')||emptyHtml('No diagnostics match','This scope has no diagnostics matching the filter.')}</div>`;}
function renderMap(){const fields=topCounts(scopedRels().filter(r=>/field/i.test(r.targetType)||/field/i.test(r.kind)).map(r=>r.target));const funcs=topCounts(scopedRuleNodes().map(n=>n.fn).filter(Boolean));const routes=topCounts(scopedRuleNodes().flatMap(n=>actionNamesOf(n)));$('content').innerHTML=`<div class="notice"><div class="notice-icon">≋</div><div><b>Scope map:</b> A compact semantic index across functions, fields, and action labels. It helps triage where to drill into the structural tree. Flow data, when present, remains experimental / low-confidence.</div></div><div class="grid-3"><div class="panel"><h3>Functions</h3>${bars(funcs)}</div><div class="panel"><h3>Fields / targets</h3>${bars(fields)}</div><div class="panel"><h3>Action labels</h3>${bars(routes)}</div></div>`;}
// Build domain-oriented catalogs (resources/tables/drivers/UDF) from extracted relationship and function evidence.
function domainRowsByView(view){
  const fwd=model.fwd;
  if(fwd&&view==='resources'){
    const buckets=list(fwd.resources?.buckets);
    return buckets.map(b=>({name:`${text(b.type)}: ${fmt(list(b.names).length)} items`,count:list(b.names).length}));
  }
  if(fwd&&view==='drivers'){
    const items=list(fwd.processDrivers?.items);
    if(items.length)return items.map(p=>({name:`${text(p.processName)} (${fmt(first(p.findingCount,0))} findings)`,count:Number(first(p.findingCount,0))||0}));
    const processItems=list(fwd.processes?.items);
    if(processItems.length)return processItems.map(p=>({name:`${text(p.name)} (process node)`,count:1}));
  }
  if(fwd&&view==='udfs'){
    const items=list(fwd.udfs?.items);
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
  if(view==='tables'){
    const rows=rels.filter(r=>/table|indexed|lookup|db|database/i.test(`${r.targetType} ${r.kind} ${r.target}`));
    return topCounts(rows.map(r=>r.target||'(empty table target)')).map(x=>({name:x.name,count:x.count}));
  }
  if(view==='drivers'){
    const rows=rels.filter(r=>/driver|twain|scan|ocr|fip|store|output|input/i.test(`${r.targetType} ${r.kind} ${r.target}`));
    return topCounts(rows.map(r=>`${r.kind||'Uses'} -> ${r.target||'(empty driver target)'}`)).map(x=>({name:x.name,count:x.count}));
  }
  const allFns=[...scopedRuleNodes().map(n=>n.fn),...scopedInventory().map(r=>r.fn)].map(text).filter(Boolean);
  const udfFns=allFns.filter(f=>/udf|user.?defined|custom/i.test(f));
  return topCounts(udfFns).map(x=>({name:x.name,count:x.count}));
}

// Build global table definitions and inferred column names from relationship co-occurrence evidence.
function buildGlobalTableDefinitions(){
  const canonicalTables=list(model.fwd?.tables?.items);
  if(canonicalTables.length){
    return canonicalTables.map(t=>({
      name:text(t.name),
      hits:Number(first(t.referenceCount,0))||0,
      scopeCount:Number(first(t.scopeCount,0))||0,
      ruleCount:Number(first(t.ruleCount,0))||0,
      canonical:!!t.canonical,
      inferred:false,
      parsedColumns:list(first(t.parsedColumns,[])).map(c=>({name:text(c.name),hits:Number(first(c.hits,0))||0,confidence:text(first(c.confidence,'high'))})),
      usageDerivedFields:list(first(t.usageDerivedFields,t.columns,[])).map(c=>({name:text(c.name),hits:Number(first(c.hits,0))||0,confidence:text(first(c.confidence,'medium'))})),
      // Keep a compatibility merged view so existing list/detail UI remains stable.
      columns:[...new Map([...list(first(t.parsedColumns,[])),...list(first(t.usageDerivedFields,t.columns,[]))].map(c=>[text(c.name).toLowerCase(),{name:text(c.name),hits:Number(first(c.hits,0))||0,confidence:text(first(c.confidence,'medium'))}])).values()],
      hasParsedSchema:list(first(t.parsedColumns,[])).length>0,
      diagnostics:list(first(t.diagnostics,[])).map(text).filter(Boolean)
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
    if(!tables.has(key))tables.set(key,{name:tableName,hits:0,scopes:new Set(),rules:new Set(),columns:new Map(),canonical:false});
    return tables.get(key);
  }

  function addColumn(row,column,confidence){
    const col=text(column||'').trim();
    if(!col) return;
    const key=col.toLowerCase();
    if(!row.columns.has(key))row.columns.set(key,{name:col,hits:0,confidence});
    const current=row.columns.get(key);
    current.hits+=1;
    if(confidence==='high')current.confidence='high';
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

  const canonicalBuckets=list(model.fwd?.resources?.buckets).filter(b=>/table|db|database|lookup/i.test(text(b.type)));
  canonicalBuckets.forEach(bucket=>{
    list(bucket.names).forEach(name=>{
      const table=getTable(name);
      if(table)table.canonical=true;
    });
  });

  return [...tables.values()]
    .map(t=>({
      name:t.name,
      hits:t.hits,
      scopeCount:t.scopes.size,
      ruleCount:t.rules.size,
      canonical:t.canonical,
      inferred:true,
      parsedColumns:[],
      usageDerivedFields:[...t.columns.values()].sort((a,b)=>(b.hits-a.hits)||a.name.localeCompare(b.name)).slice(0,24),
      columns:[...t.columns.values()].sort((a,b)=>(b.hits-a.hits)||a.name.localeCompare(b.name)).slice(0,24),
      hasParsedSchema:false,
      diagnostics:['TableSchemaNotParsed']
    }))
    .sort((a,b)=>(b.hits-a.hits)||a.name.localeCompare(b.name));
}

function renderGlobalTablesCatalog(){
  const tables=buildGlobalTableDefinitions();
  const isCanonical=list(model.fwd?.tables?.items).length>0;
  const canonicalCount=tables.filter(t=>t.canonical).length;
  const inferredCount=Math.max(0,tables.length-canonicalCount);
  const withColumns=tables.filter(t=>list(t.usageDerivedFields).length>0).length;
  $('content').innerHTML=`<section class="tables-workbench"><div class="notice"><div class="notice-icon">i</div><div><b>Global tables catalog.</b> Tables are first-class shared resources referenced by rule logic. ${isCanonical?'Canonical table names come from FWD resources; parsed schema columns and usage-derived fields are separate evidence tiers.':'Field references are currently usage-derived evidence because canonical payload is unavailable.'}</div></div><div class="metric-grid table-metric-grid"><div class="metric good"><b>${fmt(tables.length)}</b><span>Total tables</span></div><div class="metric ${canonicalCount?'good':''}"><b>${fmt(canonicalCount)}</b><span>Canonical definitions</span></div><div class="metric ${inferredCount?'warn':''}"><b>${fmt(inferredCount)}</b><span>Inferred definitions</span></div><div class="metric ${withColumns===tables.length?'good':'warn'}"><b>${fmt(withColumns)}</b><span>With usage fields</span></div></div><div class="panel"><h3>Table Definitions</h3>${tables.length?`<div class="table-catalog">${tables.slice(0,300).map((t,i)=>`<details class="table-card" ${i<4?'open':''}><summary><span class="table-card-main"><b>${esc(t.name)}</b><span class="table-card-meta">${fmt(t.ruleCount)} rules · ${fmt(t.scopeCount)} scopes · ${fmt(t.hits)} refs</span></span><span class="table-card-badges">${t.canonical?'<span class="badge green">Canonical</span>':'<span class="badge amber">Inferred</span>'}${t.usageDerivedFields.length?`<span class="badge blue">${fmt(t.usageDerivedFields.length)} usage fields</span>`:'<span class="badge amber">No parsed schema</span>'}</span></summary><div class="table-card-body"><div class="table-def-grid"><div class="table-def-item"><span class="k">Definition Source</span><span class="v">${t.inferred?'Evidence-derived':'Canonical payload'}</span></div><div class="table-def-item"><span class="k">Usage Footprint</span><span class="v">${fmt(t.ruleCount)} rules / ${fmt(t.scopeCount)} scopes</span></div><div class="table-def-item"><span class="k">Reference Hits</span><span class="v">${fmt(t.hits)}</span></div></div><div class="table-columns-head">Usage-derived fields ${t.inferred?'(inferred)':'(canonical)'}</div>${t.usageDerivedFields.length?`<div class="table-columns-grid">${t.usageDerivedFields.map(c=>`<div class="table-column-row"><div class="table-col-name">${esc(c.name)}</div><div class="table-col-meta"><span class="badge blue">${fmt(c.hits)} uses</span><span class="mono">${esc(c.confidence)} confidence</span></div></div>`).join('')}</div>`:'<div class="muted">No parsed table schema extracted for this table in current snapshot.</div>'}</div></details>`).join('')}</div>`:emptyHtml('No tables found','No table definitions were discovered in canonical resources or relationship evidence.')}</div></section>`;
}

function renderGlobalTablesMasterDetail(){
  const tables=buildGlobalTableDefinitions();
  const isCanonical=list(model.fwd?.tables?.items).length>0;
  const canonicalCount=tables.filter(t=>t.canonical).length;
  const inferredCount=Math.max(0,tables.length-canonicalCount);
  const withColumns=tables.filter(t=>list(t.usageDerivedFields).length>0).length;
  if(!tables.length){
    $('content').innerHTML=`<section class="tables-workbench"><div class="notice"><div class="notice-icon">i</div><div><b>Global tables catalog.</b> No table definitions were discovered in this snapshot.</div></div>${emptyHtml('No tables found','No table definitions were discovered in canonical resources or relationship evidence.')}</section>`;
    return;
  }
  const selected=tables.find(t=>t.name===state.selectedTableName)||tables[0];
  state.selectedTableName=selected.name;
  $('content').innerHTML=`<section class="tables-workbench"><div class="notice"><div class="notice-icon">i</div><div><b>Global tables catalog.</b> Tables are first-class shared resources referenced by rule logic. ${isCanonical?'Canonical table names come from FWD resources; parsed schema columns and usage-derived fields are separate evidence tiers.':'Field references are currently usage-derived evidence because canonical payload is unavailable.'}</div></div><div class="metric-grid table-metric-grid"><div class="metric good"><b>${fmt(tables.length)}</b><span>Total tables</span></div><div class="metric ${canonicalCount?'good':''}"><b>${fmt(canonicalCount)}</b><span>Canonical definitions</span></div><div class="metric ${inferredCount?'warn':''}"><b>${fmt(inferredCount)}</b><span>Inferred definitions</span></div><div class="metric ${withColumns===tables.length?'good':'warn'}"><b>${fmt(withColumns)}</b><span>With usage fields</span></div></div><div class="table-browser"><div class="panel"><h3>Tables</h3><div class="table-index-list">${tables.slice(0,500).map(t=>`<button class="table-index-row ${t.name===selected.name?'active':''}" type="button" data-table-name="${esc(t.name)}"><span class="table-index-main"><b>${esc(t.name)}</b><span>${fmt(t.ruleCount)} rules · ${fmt(t.scopeCount)} scopes</span></span><span class="table-index-side"><span class="badge ${t.canonical?'green':'amber'}">${t.canonical?'Canonical':'Inferred'}</span><span class="badge blue">${fmt(t.usageDerivedFields.length)} refs</span></span></button>`).join('')}</div></div><div class="panel"><h3>${esc(selected.name)}</h3><div class="table-def-grid"><div class="table-def-item"><span class="k">Definition Source</span><span class="v">${selected.inferred?'Evidence-derived':'Canonical payload'}</span></div><div class="table-def-item"><span class="k">Usage Footprint</span><span class="v">${fmt(selected.ruleCount)} rules / ${fmt(selected.scopeCount)} scopes</span></div><div class="table-def-item"><span class="k">Reference Hits</span><span class="v">${fmt(selected.hits)}</span></div></div><div class="table-columns-head">Usage-derived field evidence ${selected.inferred?'(inferred)':'(canonical)'}</div>${selected.usageDerivedFields.length?`<div class="table-columns-grid">${selected.usageDerivedFields.map(c=>`<div class="table-column-row"><div class="table-col-name">${esc(c.name)}</div><div class="table-col-meta"><span class="badge blue">${fmt(c.hits)} uses</span><span class="mono">${esc(c.confidence)} confidence</span></div></div>`).join('')}</div>`:'<div class="muted">No parsed table schema extracted for this table in current snapshot.</div>'}</div></div></section>`;
}

// Build UDF rows with optional canonical details for list/detail rendering.
function buildUdfDefinitions(){
  function fnEq(left,right){return text(left).trim().toLowerCase()===text(right).trim().toLowerCase();}
  function configuredRulesFor(fnName){
    const collected=[];
    const seen=new Set();
    function pushRule(scopeId,ruleName,fn,parameters){
      const key=[text(scopeId),text(ruleName),text(fn)].join('|').toLowerCase();
      if(seen.has(key))return;
      seen.add(key);
      collected.push({scopeId:text(scopeId),ruleName:text(ruleName||'Unnamed rule'),functionName:text(fn),parameters:parameters||{}});
    }
    model.nodes.forEach(n=>{if(fnEq(n.fn,fnName))pushRule(n.scopeId,n.title,n.fn,n.Parameters);});
    model.inventory.forEach(r=>{if(fnEq(r.fn,fnName))pushRule(r.scopeId,r.title,r.fn,r.Parameters);});
    return collected;
  }
  function parameterNamesFromRules(rules){
    const names=new Set();
    rules.forEach(r=>Object.keys(r.parameters||{}).forEach(k=>{if(text(k).trim())names.add(text(k).trim());}));
    return [...names].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
  }
  const canonicalItems=list(model.fwd?.udfs?.items);
  if(canonicalItems.length){
    return canonicalItems.map(u=>{
      const type=text(u.resourceType);
      const rawName=text(u.name);
      const displayName=/^function$/i.test(type)?rawName:`${type}: ${rawName}`;
      const matchedRules=configuredRulesFor(rawName||displayName);
      const derivedParamNames=parameterNamesFromRules(matchedRules);
      const canonicalParamNames=list(first(u.parameterNames,u.parameters,[])).map(text).filter(Boolean);
      const parameterNames=[...new Set([...canonicalParamNames,...derivedParamNames])].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
      const canonicalRules=list(first(u.ruleNames,u.usedByRules,u.rules,[])).map(text).filter(Boolean);
      const configuredRules=matchedRules.map(r=>`${r.ruleName} · ${r.scopeId}`);
      const rules=[...new Set([...canonicalRules,...configuredRules])].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
      return {
        key:rawName||displayName,
        displayName,
        rawName,
        type:type||'Function',
        count:Number(first(u.usedByRuleCount,u.count,0))||0,
        scopeCount:Number(first(u.scopeCount,0))||0,
        canonical:!!first(u.canonical,true),
        inferred:!!u.inferred,
        classification:text(first(u.classification,'')),
        confidence:text(first(u.confidence,'')),
        source:text(first(u.source,u.definitionSource,'')),
        scopes:list(first(u.scopeIds,u.scopes,u.usedByScopes,[])).map(text).filter(Boolean),
        rules,
        parameterNames
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
    canonical:false,
    inferred:true,
    classification:'RegexOnly',
    confidence:'',
    source:'Derived from structural/inventory function evidence',
    scopes:[],
    rules:matchedRules.map(x=>`${x.ruleName} · ${x.scopeId}`).sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'})),
    parameterNames:parameterNamesFromRules(matchedRules)
  };});
}

// Render UDF list/detail with underscore-prefix grouping and clickable details.
function renderUdfMasterDetail(){
  const rows=buildUdfDefinitions().sort((a,b)=>a.displayName.localeCompare(b.displayName,undefined,{sensitivity:'base'}));
  if(!rows.length){
    $('content').innerHTML=`<div class="notice"><div class="notice-icon">i</div><div><b>User Defined Functions (UDF) view.</b> This view currently shows function-resource candidates and usage correlation evidence. It is not a parsed private-STC UDF body view.</div></div>${emptyHtml('No user defined functions found','No matching user defined function evidence in current scope.')}`;
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
  const paramList=list(selected.parameterNames).length?`<div class="mini-list">${list(selected.parameterNames).slice(0,120).map(s=>`<div class="mini-row"><span class="mono">${esc(s)}</span></div>`).join('')}</div>`:'<div class="muted">No parameters extracted for this function in current evidence.</div>';
  const ruleList=selected.rules.length?`<div class="mini-list">${selected.rules.slice(0,120).map(s=>`<div class="mini-row"><span class="mono">${esc(s)}</span></div>`).join('')}</div>`:'<div class="muted">No configured rules mapped for this function in current evidence.</div>';
  const scopeList=selected.scopes.length?`<div class="mini-list">${selected.scopes.slice(0,80).map(s=>`<div class="mini-row"><span class="mono">${esc(s)}</span></div>`).join('')}</div>`:'<div class="muted">No explicit scope list in canonical payload.</div>';
  $('content').innerHTML=`<section class="tables-workbench"><div class="notice"><div class="notice-icon">i</div><div><b>User Defined Functions (UDF) view.</b> Function-resource candidates and caller-side usage evidence. Field lists, return statuses, and rule bodies are not authoritative unless marked parsed.</div></div><div class="table-browser"><div class="panel"><h3>Functions</h3><div class="table-index-list">${ordered.map(([groupKey,items])=>`<div class="scope-group"><span>${esc(groupKey)}</span><span class="section-count">${fmt(items.length)}</span></div>${items.map(r=>`<button class="table-index-row ${r.key===selected.key?'active':''}" type="button" data-udf-name="${esc(r.key)}"><span class="table-index-main"><b>${esc(r.displayName)}</b><span>${esc(r.type)}</span></span></button>`).join('')}`).join('')}</div></div><div class="panel"><h3>${esc(selected.displayName)}</h3><div class="table-def-grid"><div class="table-def-item"><span class="k">Type</span><span class="v">${esc(selected.type)}</span></div><div class="table-def-item"><span class="k">Source</span><span class="v">${esc(selected.source||'Candidate evidence')}</span></div><div class="table-def-item"><span class="k">Classification</span><span class="v">${esc(selected.classification|| (selected.canonical?'CandidateUdf':(selected.inferred?'RegexOnly':'Unspecified')))}</span></div><div class="table-def-item"><span class="k">Confidence</span><span class="v">${esc(selected.confidence||'Not provided')}</span></div><div class="table-def-item"><span class="k">Caller parameter keys</span><span class="v">${fmt(list(selected.parameterNames).length)}</span></div><div class="table-def-item"><span class="k">Caller rules</span><span class="v">${fmt(selected.rules.length)}</span></div></div><div class="table-columns-head">Caller parameter keys</div>${paramList}<div class="table-columns-head">Direct caller rules</div>${ruleList}<div class="table-columns-head">Scopes</div>${scopeList}</div></div></section>`;
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
  $('content').innerHTML=`<div class="notice"><div class="notice-icon">i</div><div><b>${esc(title)} view.</b> ${esc(caption)} Cross-check with structural nodes before treating entries as runtime dependencies.</div></div><div class="panel"><h3>${esc(title)}</h3>${sortedRows.length?(isUdfView?udfGroupedHtml:defaultRowsHtml):emptyHtml(`No ${title.toLowerCase()} found`,`No matching ${title.toLowerCase()} evidence in current scope.`)}</div>`;
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
  const dim=state.rcaFocus&&!selected&&!inPath&&!hot;
  const disabledBadge=n.disabled!=='none'?`<span class="badge amber">${esc(n.disabled)}</span>`:'';
  return `<div class="tree-row ${selected?'selected':''} ${inPath?'active-path':''} ${hot?'hotspot':''} ${dim?'dimmed':''}" role="treeitem" aria-level="${level+1}" aria-expanded="${hasKids?(expanded?'true':'false'):'false'}" aria-selected="${selected?'true':'false'}" tabindex="0" data-node="${esc(id)}" style="--depth:${level}"><span class="tree-left">${hasKids?`<button class="twisty" type="button" data-toggle-node="${esc(id)}" aria-label="${expanded?'Collapse':'Expand'} ${esc(n.title)}">${expanded?'−':'+'}</button>`:'<span class="twisty ghost" aria-hidden="true">·</span>'}<span class="tree-main"><b class="tree-name">${esc(n.title)}</b><span class="tree-meta">${esc(n.fn||'No function mapped')}</span>${disabledBadge}</span></span>${hasKids?`<button class="mini-row-btn" type="button" data-toggle-node="${esc(id)}" aria-label="${expanded?'Collapse':'Expand'} rule">${expanded?'−':'+'}</button>`:''}</div>`;
}
function renderNoData(){
  const detail=bootState.detail||'No evidence payloads could be loaded.';
  $('sourceSubtitle').textContent='No snapshot data available';
  $('qualityPill').innerHTML='<span class="dot warn"></span><span>Evidence load failed</span>';
  const banner=optionalElement('globalErrorBanner');
  if(banner){
    banner.textContent=`Evidence load failed: ${detail}`;
    banner.hidden=false;
  }
  $('scopeList').innerHTML=emptyHtml('No scopes available','Generate a snapshot or verify the FWD path.');
  $('content').innerHTML=emptyHtml('No structural evidence found',detail);
}
function renderHelp(){
  $('helpBody').innerHTML='<div class="panel"><h3>How to use this viewer</h3><p class="caption">Start in the scope rail, then inspect structural rules and action branches. All evidence here is static extraction data; runtime execution is not simulated.</p><div class="kv">'+kv('Scope rail','Pick a scope, then use quick filters (All, Page, Document, Warnings).')+kv('Tree','Expand rules to inspect child branches and route labels.')+kv('Inspector','Use Copy evidence for ticket-ready payloads with caveats.')+kv('Search','Use operators like action:, function:, has:disabled, has:diagnostic.')+'</div></div>';
}
function renderScopeInspector(s){const stats=scopedRouteStats();const flatHot=s.flatOnly>100;const hotspots=scopedRuleNodes().filter(isHotspotNode).length;$('inspectorBody').innerHTML=`${scopeEvidenceStripHtml()}<details class="inspector-section" open><summary>Scope summary <span class="section-count">${fmt(s.structural)} rules</span></summary><div class="inspector-section-body"><div class="kv">${kv('Scope ID',esc(s.scopeId))}${kv('Kind',esc(s.kind))}${kv('Structural rules',fmt(s.structural))}${kv('Inventory rows',fmt(s.inventory))}${kv('Flat-only rows',fmt(s.flatOnly))}${kv('References',fmt(s.refs))}${kv('Diagnostics',fmt(s.diags))}</div></div></details><details class="inspector-section" open><summary>Decision support <span class="section-count">${fmt(hotspots)} hot spots</span></summary><div class="inspector-section-body"><div class="callout-list">${flatHot?'<div class="callout warn"><b>Flat-only threshold exceeded.</b><span>Review flat inventory before treating unmatched rows as structural evidence.</span></div>':''}${hotspots?'<div class="callout info"><b>Hotspots detected.</b><span>Large child counts, disabled branches, diagnostics, or complex branching exist in this scope.</span></div>':''}${stats.unresolved?'<div class="callout warn"><b>Unresolved route labels present.</b><span>Use index-based branch identity where action names are unresolved.</span></div>':''}<div class="callout neutral"><b>Runtime not simulated.</b><span>RCA Focus and flow indicators are visual triage aids, not execution proof.</span></div></div><div class="branch-actions mt-10"><button class="btn" type="button" data-action="toggle-rca-focus">Toggle RCA Focus</button><button class="btn" type="button" data-action="largest-scope">Largest scope</button><button class="btn" type="button" data-action="export-view">Preview export</button></div></div></details><details class="inspector-section" open><summary>Reviewer guidance</summary><div class="inspector-section-body"><ul class="evidence-list"><li>The center workspace is always the authoritative structural tree.</li><li>Inventory, references, and diagnostics are available through selected-rule evidence, search, and export.</li><li>Expand a rule to see action branches; expand a branch to inspect only that route.</li><li>Flow/RCA Focus remains visual triage and is not native runtime execution proof.</li></ul></div></details>`;}

function trustStripHtml(n){const incoming=model.incomingByChild.get(n.id);const refs=model.rels.filter(r=>String(r.nodeId)===String(n.id));const diags=model.diags.filter(d=>String(d.nodeId)===String(n.id));const inv=model.inventory.find(r=>String(r.nodeId)===String(n.id));const routeOk=!incoming||incoming.resolved;const disabledLabel=n.disabled==='none'?'No disable evidence':n.disabled==='direct'?'Direct disabled':'Inherited disabled';return `<div class="trust-strip" aria-label="Selected rule trust summary"><div class="trust-item info"><b>Structural</b><span>Tree node</span></div><div class="trust-item ${routeOk?'good':'warn'}"><b>Route label</b><span>${routeOk?'Resolved':'Index only'}</span></div><div class="trust-item good"><b>Disabled authority</b><span>${esc(disabledLabel)}</span></div><div class="trust-item ${inv?'good':'warn'}"><b>Flat inventory</b><span>${inv?'Correlated':'No correlated row'}</span></div><div class="trust-item ${refs.length?'info':'warn'}"><b>References</b><span>${fmt(refs.length)}</span></div><div class="trust-item ${diags.length?'warn':'good'}"><b>Diagnostics</b><span>${diags.length?fmt(diags.length):'None linked'}</span></div></div>`;}
function selectedRoutePathPacket(n){const incoming=model.incomingByChild.get(n.id);return {schema:'AcWorkbench.SelectedRuleRoutePath',schemaVersion:'1.0.0',copiedAt:new Date().toISOString(),scopeId:n.scopeId,identity:{nodeId:n.id,ruleName:n.title,functionName:n.fn,ruleGuid:n.RuleGuid||null},incomingAction:incoming?{label:incoming.label,routeState:incoming.routeState||null,actionName:first(incoming.ActionName,incoming.actionName,null),actionListIndex:first(incoming.ActionListIndex,incoming.actionListIndex,null),resolved:!!incoming.resolved,evidence:incoming.Evidence||incoming.evidence||null}:null,routePath:routePathObjects(n),outgoingActions:(model.edgesByParent.get(n.id)||[]).map(e=>({label:e.label,routeState:e.routeState||null,actionName:first(e.ActionName,e.actionName,null),actionListIndex:first(e.ActionListIndex,e.actionListIndex,null),resolved:!!e.resolved,toNodeId:e.to,childName:model.nodesById.get(String(e.to))?.title||null})),caveat:'Route path is structural evidence from parsed hierarchy. It is not native runtime execution proof.'};}
function selectedRuleEvidencePacket(n){const incoming=model.incomingByChild.get(n.id);const refs=model.rels.filter(r=>String(r.nodeId)===String(n.id));const diags=model.diags.filter(d=>String(d.nodeId)===String(n.id));const inv=model.inventory.find(r=>String(r.nodeId)===String(n.id));const fieldResolution=resolveNodeFieldReferences(n);return {schema:'AcWorkbench.SelectedRuleEvidence',schemaVersion:'1.0.0',copiedAt:new Date().toISOString(),source:first(treeData.FwdPath,rulesData.FwdPath,'Embedded snapshot'),scopeId:n.scopeId,identity:{nodeId:n.id,ruleName:n.title,functionName:n.fn,ruleGuid:n.RuleGuid||null,ruleId:n.RuleId||null},position:{incomingAction:incoming?{label:incoming.label,actionName:first(incoming.ActionName,incoming.actionName,null),actionListIndex:first(incoming.ActionListIndex,incoming.actionListIndex,null),resolved:!!incoming.resolved,evidence:incoming.Evidence||incoming.evidence||null}:null,routePath:routePathObjects(n),children:childIds(n.id).length},disabled:{state:n.disabled,authority:'Structural',confidence:n.DisabledConfidence||null,reason:n.DisabledReason||null,evidence:n.DisabledEvidence||null},parameters:n.Parameters||{},fieldResolution,outgoingActions:(model.edgesByParent.get(n.id)||[]).map(e=>({label:e.label,actionName:first(e.ActionName,e.actionName,null),actionListIndex:first(e.ActionListIndex,e.actionListIndex,null),resolved:!!e.resolved,toNodeId:e.to,childName:model.nodesById.get(String(e.to))?.title||null})),relationships:refs.map(r=>({kind:r.kind,targetType:r.targetType,target:r.target,confidence:r.confidence,evidence:r.Evidence||r.evidence||r.RelationshipReason||null})),diagnostics:diags.map(d=>({severity:d.severity,title:d.title,detail:d.detail})),reconciliation:{flatInventoryMatch:!!inv,flatInventoryId:inv?.id||null,classification:inv?.classification||null},notProven:['Native runtime execution was not simulated.','Search matches are not dependencies.','ac-flow.json is experimental / low-confidence and is not runtime proof.']};}
function routePathObjects(n){const path=[];let cur=n,guard=0;while(cur&&guard++<128){const incoming=model.incomingByChild.get(cur.id);path.push({nodeId:cur.id,name:cur.title,functionName:cur.fn||null,incomingAction:incoming?{label:incoming.label,actionListIndex:first(incoming.ActionListIndex,incoming.actionListIndex,null),resolved:!!incoming.resolved}:null});const parent=model.parentByChild.get(cur.id);cur=parent?model.nodesById.get(String(parent)):null;}return path.reverse();}
function renderGenericInspector(obj,label){if(state.inspectorView==='raw'){$('inspectorBody').innerHTML=`<pre class="raw">${esc(JSON.stringify(obj,null,2))}</pre>`;return;}const linked=obj.nodeId?model.nodesById.get(String(obj.nodeId)):null;$('inspectorBody').innerHTML=`<div class="panel"><h3>${esc(label)}</h3><div class="kv">${Object.keys(obj).slice(0,18).map(k=>kv(k,esc(typeof obj[k]==='object'?JSON.stringify(obj[k]):obj[k]))).join('')}</div></div>${linked?`<button class="btn primary" type="button" data-action="open-linked-node">Open linked structural node</button>`:''}`;}
function ancestors(n){const rows=[];let cur=n;const seen=new Set();while(cur&&!seen.has(cur.id)){seen.add(cur.id);rows.unshift(cur);const p=model.parentByChild.get(cur.id);cur=p?model.nodesById.get(p):null;}return rows;}
function routePathHtml(n){return `<div class="route-path">${ancestors(n).map((a,i)=>{const e=model.incomingByChild.get(a.id);return `${i?'<span class="route-arrow">→</span>':''}<span class="route-step">${i?routeChip(e):'<span class="route-chip root">root</span>'}<b title="${esc(a.title)}">${esc(a.title)}</b></span>`}).join('')}</div>`;}
function outgoingGroups(n){const edges=list(model.edgesByParent.get(n.id));const groups={};edges.forEach(e=>{const key=e.label||'Unresolved';(groups[key]||(groups[key]=[])).push(e);});return groups;}

function branchSummaryHtml(n){
  const groups=outgoingGroups(n);
  const names=Object.keys(groups);
  if(!names.length)return '<div class="muted">This rule has no routed child branches.</div>';
  return `<div class="branch-summary">${names.map(name=>`<span class="branch-summary-chip"><b>${esc(name)}</b><span>${fmt(groups[name].length)} ${groups[name].length===1?'child':'children'}</span></span>`).join('')}</div><div class="caption mt-8">These are outgoing structural branches owned by this rule. Each child rule below the branch has one incoming route from its parent action.</div>`;
}
function sectionHtml(title,count,body,open=true){return `<details class="inspector-section" ${open?'open':''}><summary>${esc(title)}${count!==undefined?` <span class="section-count">${esc(count)}</span>`:''}</summary><div class="inspector-section-body">${body}</div></details>`;}
function renderNodeInspector(n){const incoming=model.incomingByChild.get(n.id);const refs=model.rels.filter(r=>String(r.nodeId)===String(n.id));const diags=model.diags.filter(d=>String(d.nodeId)===String(n.id));const inv=model.inventory.find(r=>String(r.nodeId)===String(n.id));const trust=trustStripHtml(n);const summary=`<div class="kv">${kv('Rule name',esc(n.title))}${kv('Function',`<span class="mono">${esc(n.fn||'')}</span>`)}${kv('Scope',esc(n.scopeId))}${kv('Incoming action',routeChip(incoming))}${kv('Disabled state',n.disabled==='none'?'<span class="badge green">No disable evidence</span>':n.disabled==='direct'?'<span class="badge red">Direct disabled</span>':'<span class="badge amber">Disabled by parent</span>')}${kv('Disabled authority','<span class="badge blue">Structural</span>')}${kv('Children',fmt(childIds(n.id).length))}${kv('Structural node',esc(n.id))}${kv('Rule GUID',esc(n.RuleGuid||''))}${kv('Flat inventory',inv?'<span class="badge green">Correlated</span>':'<span class="badge amber">No correlated flat row</span>')}</div><div class="inline-actions mt-12"><button class="btn" type="button" data-action="copy-route-path">Copy route path</button><button class="btn primary" type="button" data-action="copy-rule-evidence">Copy evidence</button></div>`;
 const route=`<div class="panel mb-10"><h3>Structural route</h3>${routePathHtml(n)}<div class="caption mt-8">This is structural hierarchy evidence. It is not a runtime execution trace.</div></div><div class="panel mb-0"><h3>Incoming parent action</h3>${routeChip(incoming)}<div class="caption mt-8">${esc(incoming?.Evidence||'Root list entry or unresolved parent edge.')}</div></div>`;
 const branches=branchSummaryHtml(n)+`<div class="caption mt-8">Open the corresponding action branch in the tree to inspect only that route.</div>`;
 const params=paramBlock(n.Parameters);
 const fieldResolution=resolveNodeFieldReferences(n);
 const fieldBody=renderFieldResolutionBlock(fieldResolution);
 const relBody=refs.length?refs.slice(0,120).map(r=>`<div class="split-row my-7"><span>${esc(r.kind)} → <b>${esc(r.target)}</b><div class="caption">${esc(r.targetType)} · ${esc(r.Evidence||r.evidence||r.RelationshipReason||'relationship evidence')}</div></span>${badgeConfidence(r.confidence)}</div>`).join(''):'<div class="muted">No references linked by structural correlation.</div>';
 const diagBody=diags.length?diags.map(d=>`<div class="notice"><div class="notice-icon">!</div><div><b>${esc(d.title)}</b><br>${esc(d.detail)}<div class="caption">Reviewer action: verify this warning before drawing conclusions from the selected rule.</div></div></div>`).join(''):'<div class="muted">No diagnostics linked to this node.</div>';
 const evidence=`<ul class="evidence-list"><li><b>Structural evidence:</b> Node is from parsed AC rule tree data.</li><li><b>Route authority:</b> Parent/child action routing is structural when an incoming edge exists.</li><li><b>Action label:</b> ${incoming?.resolved?'Resolved from the parent action list.':'Action index is available, but the route label was not resolved.'}</li><li><b>Disabled state:</b> Structural disabled state is authoritative. Flat disabled values are audit-only inventory evidence.</li><li><b>Inventory reconciliation:</b> ${inv?'Matched to a flat extraction row.':'No correlated flat inventory row found for this structural node.'}</li><li><b>Not proven:</b> Native runtime execution was not simulated. Search hits are not dependencies. ac-flow.json is experimental / low-confidence.</li></ul>`;
 const raw=`<pre class="raw">${esc(JSON.stringify(n,null,2))}</pre>`;
 $('inspectorBody').innerHTML=`${trust}${sectionHtml('Summary','structural',summary,true)}${sectionHtml('Route','path',route,true)}${sectionHtml('Branches',`${Object.keys(outgoingGroups(n)).length} actions`,branches,true)}${sectionHtml('Parameters',Object.keys(n.Parameters||{}).length,params,false)}${sectionHtml('Field Resolution',`${fmt(fieldResolution.summary.resolved)}/${fmt(fieldResolution.summary.referenced)} resolved`,fieldBody,fieldResolution.summary.referenced>0)}${sectionHtml('References',refs.length,relBody,refs.length>0)}${sectionHtml('Diagnostics',diags.length,diagBody,diags.length>0)}${sectionHtml('Evidence','trust',evidence,true)}${sectionHtml('Raw','JSON',raw,false)}`;}
function paramBlock(p){const keys=Object.keys(p||{});if(!keys.length)return '<div class="muted">No parsed parameters.</div>';return `<div class="kv">${keys.map(k=>kv(k,esc(list(p[k]).join(', ')))).join('')}</div>`;}
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
  rows.forEach(row=>{list(row.fields).forEach(field=>{const name=text(field.name).trim();if(!name)return;const key=name.toLowerCase();if(!byName.has(key))byName.set(key,[]);byName.get(key).push({name,scopeType:text(row.scopeType),scopeName:text(row.scopeName),fieldType:text(field.type),geometry:text(field.geometry),source:'CanonicalFieldCatalog'});});});
  const items=[];
  Object.keys(params).forEach(parameterName=>{
    if(!looksLikeFieldParameterName(parameterName))return;
    list(params[parameterName]).forEach(parameterValue=>{
      tokenizeFieldCandidates(parameterValue).forEach(candidate=>{
        const matches=list(byName.get(candidate.toLowerCase()));
        items.push({parameterName:text(parameterName),parameterValue:text(parameterValue),referencedField:candidate,fieldExists:matches.length>0,confidence:matches.length>0?'High':'Low',source:rows.length?'CanonicalFieldCatalog':'NoFieldCatalog',matches});
      });
    });
  });
  const resolved=items.filter(i=>i.fieldExists).length;
  const unresolved=Math.max(0,items.length-resolved);
  return {summary:{referenced:items.length,resolved,unresolved,caveat:'Field resolution is static catalog matching against extracted field metadata and is not runtime proof.'},items};
}
function renderFieldResolutionBlock(fieldResolution){
  if(!fieldResolution.summary.referenced)return '<div class="muted">No field-like parameters were detected on this rule.</div>';
  const summary=`<div class="metric-row"><span class="metric-chip"><span class="chip-label">Referenced</span><span class="chip-value">${fmt(fieldResolution.summary.referenced)}</span></span><span class="metric-chip"><span class="chip-label">Resolved</span><span class="chip-value ok">${fmt(fieldResolution.summary.resolved)}</span></span><span class="metric-chip"><span class="chip-label">Unresolved</span><span class="chip-value ${fieldResolution.summary.unresolved?'err':''}">${fmt(fieldResolution.summary.unresolved)}</span></span></div><div class="caption">${esc(fieldResolution.summary.caveat)}</div>`;
  const rows=fieldResolution.items.slice(0,120).map(item=>{const matches=item.matches.slice(0,3).map(m=>`<div class="mini-row"><span class="mono">${esc(m.name)}</span><span>${esc(m.scopeType)}:${esc(m.scopeName)}${m.geometry?` · ${esc(m.geometry)}`:''}</span></div>`).join('');return `<div class="panel my-8 p-10"><div class="split-row"><span><b>${esc(item.referencedField)}</b><div class="caption">${esc(item.parameterName)} = ${esc(item.parameterValue)}</div></span><span class="badge ${item.fieldExists?'green':'amber'}">${item.fieldExists?'resolved':'unresolved'}</span></div>${matches?`<div class="mini-list mt-8">${matches}</div>`:'<div class="caption mt-8">No canonical field match was found in current field catalog scope.</div>'}</div>`;}).join('');
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
    packet.items.forEach(item=>rows.push({nodeId:rule.id,ruleName:rule.title,functionName:rule.fn||'',scopeId:rule.scopeId,parameterName:item.parameterName,parameterValue:item.parameterValue,referencedField:item.referencedField,fieldExists:item.fieldExists,matches:item.matches,matchCount:list(item.matches).length,confidence:item.confidence,source:item.source,searchBlob:[rule.title,rule.fn,rule.scopeId,item.parameterName,item.parameterValue,item.referencedField,item.fieldExists?'resolved':'unresolved',list(item.matches).map(m=>`${m.name} ${m.scopeType} ${m.scopeName} ${m.geometry}`).join(' ')].join(' ').toLowerCase()}));
  });
  const payload={scopeId:key,summary:{referenced,resolved,unresolved,rules:rules.length,rulesWithRefs,rulesWithUnresolved,caveat:'Field resolution is static catalog matching against extracted field metadata and is not runtime proof.'},rows};
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
function renderFieldResolutionTriage(){
  const index=getScopeFieldResolutionIndex(state.scopeId);
  const rows=filteredScopeFieldResolutionRows(index);
  const summary=index.summary;
  const buttons=`<div class="scope-kind-filter" role="toolbar" aria-label="Field resolution filters"><button class="chip-btn ${state.fieldResolutionFilter==='unresolved'?'active':''}" type="button" data-field-filter="unresolved">Unresolved</button><button class="chip-btn ${state.fieldResolutionFilter==='resolved'?'active':''}" type="button" data-field-filter="resolved">Resolved</button><button class="chip-btn ${state.fieldResolutionFilter==='all'?'active':''}" type="button" data-field-filter="all">All</button></div>`;
  const listHtml=rows.slice(0,4000).map(r=>`<button class="data-row compact" type="button" data-node="${esc(r.nodeId)}"><div><div class="data-title">${esc(r.referencedField)} <span class="badge ${r.fieldExists?'green':'amber'}">${r.fieldExists?'resolved':'unresolved'}</span></div><div class="data-sub">${esc(r.ruleName)} · ${esc(r.functionName||'no function')} · ${esc(r.parameterName)} = ${esc(r.parameterValue)}</div></div><div>${r.matchCount?`<span class="badge blue">${fmt(r.matchCount)} matches</span>`:''}</div><div class="mono">${esc(r.nodeId)}</div></button>`).join('');
  $('content').innerHTML=`<div class="notice"><div class="notice-icon">i</div><div><b>Field resolution triage.</b> This view surfaces parameter-level field references across the current scope and whether each one resolves against canonical FWD field metadata.</div></div><div class="metric-grid"><div class="metric"><b>${fmt(summary.rules)}</b><span>Structural rules</span></div><div class="metric"><b>${fmt(summary.rulesWithRefs)}</b><span>Rules with field refs</span></div><div class="metric good"><b>${fmt(summary.resolved)}</b><span>Resolved refs</span></div><div class="metric ${summary.unresolved?'warn':''}"><b>${fmt(summary.unresolved)}</b><span>Unresolved refs</span></div></div>${buttons}<div class="caption caption-block">${esc(summary.caveat)}</div><div class="table-list mt-8">${listHtml||emptyHtml('No field-resolution rows match','Adjust filter or search.')}</div>${rows.length>4000?'<div class="notice"><div class="notice-icon">i</div><div>Showing first 4,000 rows for browser performance. Use search to narrow down.</div></div>':''}`;
}
function routingGroupsHtml(n){const groups=outgoingGroups(n);const names=Object.keys(groups);if(!names.length)return '<div class="muted">No structural child actions.</div>';return names.map(name=>`<div class="panel my-8 p-10"><div class="split-row"><b>${esc(name)}</b><span class="badge blue">${fmt(groups[name].length)} children</span></div><div class="mini-list mt-8">${groups[name].map(e=>{const child=model.nodesById.get(e.to);return `<button class="quick-card" type="button" data-node="${esc(e.to)}"><b>${esc(child?.title||e.to)}</b><span>${esc(child?.fn||'no function')}</span></button>`}).join('')}</div></div>`).join('');}
/** Central command dispatcher for toolbar, inspector, copy, export, and help actions. */
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


/* v25 Evidence Workbench Pro overrides: selectable action branches, search operators, export builder, reviewer report, contextual help, keyboard tree navigation, snapshot-aware persistence. */
function snapshotId(){return text(first(treeData.SnapshotId,treeData.snapshotId,rulesData.SnapshotId,rulesData.snapshotId,treeData.GeneratedAtUtc,rulesData.GeneratedAtUtc,'embedded-snapshot')).replace(/[^a-z0-9_.:-]+/gi,'-');}
function snapshotStoreKey(){return `ac-rule-workbench-v25:${snapshotId()}`;}
function noteRecentScope(scopeId){const id=text(scopeId);if(!id)return;state.recentScopes=[id,...state.recentScopes.filter(x=>x!==id)].slice(0,6);}
function saveState(){try{localStorage.setItem(snapshotStoreKey(),JSON.stringify({scopeId:state.scopeId,theme:state.theme,density:state.density,treeFilter:state.treeFilter,scopeKindFilter:state.scopeKindFilter,workspaceView:state.workspaceView,fieldResolutionFilter:state.fieldResolutionFilter,rcaFocus:state.rcaFocus,selectedTableName:state.selectedTableName,selectedUdfName:state.selectedUdfName,inspectorOpen:document.body.classList.contains('inspector-open'),recentScopes:state.recentScopes}));localStorage.setItem('ac-rule-workbench-theme',state.theme);}catch{}}
function restoreSnapshotState(){const saved=safeJson(localStorage.getItem(snapshotStoreKey())||'{}',{});const theme=localStorage.getItem('ac-rule-workbench-theme')||saved.theme||state.theme||'light';state.theme=theme;document.documentElement.dataset.theme=theme;state.density=saved.density==='high'?'high':state.density;applyDensityClass(state.density);if(saved.scopeId&&model.scopes.some(s=>s.scopeId===saved.scopeId))state.scopeId=saved.scopeId;if(saved.treeFilter)state.treeFilter=saved.treeFilter;if(saved.scopeKindFilter)state.scopeKindFilter=saved.scopeKindFilter;state.workspaceView=['structure','field-resolution','resources','tables','drivers','udfs'].includes(saved.workspaceView)?saved.workspaceView:'structure';state.fieldResolutionFilter=['all','resolved','unresolved'].includes(saved.fieldResolutionFilter)?saved.fieldResolutionFilter:'unresolved';state.rcaFocus=!!saved.rcaFocus;state.selectedTableName=text(saved.selectedTableName||'');state.selectedUdfName=text(saved.selectedUdfName||'');state.recentScopes=Array.isArray(saved.recentScopes)?saved.recentScopes:[];if(saved.inspectorOpen)document.body.classList.add('inspector-open');}
function branchIdFor(parentId,g){return `${state.scopeId}|${String(parentId)}|action:${text(first(g?.actionListIndex,g?.key,g?.label,'route')).replace(/\s+/g,'_')}`;}
function branchVmFromKey(key,scopeId=state.scopeId){for(const n of model.nodes){if(n.scopeId!==scopeId)continue;for(const g of childRouteGroups(n.id)){const k=branchKey(n.id,g);if(k===key){const childNodes=g.childIds.map(id=>model.nodesById.get(String(id))).filter(Boolean);return {kind:'ActionBranch',key:k,branchId:branchIdFor(n.id,g),scopeId,parent:n,group:g,childNodes,childIds:g.childIds,childCount:g.childIds.length,routeState:g.routeState||'Unresolved',resolved:!!g.resolved,label:g.label||'Unresolved route',actionListIndex:g.actionListIndex};}}}return null;}
function selectedBranch(){return state.selectedType==='branch'?branchVmFromKey(state.selectedId):null;}
function selectedObject(){return selectedNode()||selectedBranch()||selectedInventory()||selectedRel()||selectedDiag()||currentScope();}
function selectBranch(key){const b=branchVmFromKey(key);if(!b)return;state.selectedType='branch';state.selectedId=key;state.expanded.add(b.parent.id);document.body.classList.add('inspector-open');renderAll();setTimeout(()=>document.querySelector(`[data-branch="${cssEscape(key)}"]`)?.scrollIntoView({block:'nearest'}),0);}
function selectScope(id){if(!id||id===state.scopeId)return;state.scopeId=id;noteRecentScope(id);state.selectedType='scope';state.selectedId='';state.focusNodeId='';state.treeQuery='';state.collapsedBranches.clear();seedExpanded(id);document.body.classList.remove('inspector-open');renderAll();}
function selectNode(id){state.selectedType='node';state.selectedId=String(id);state.expanded.add(String(id));let child=String(id);let p=model.parentByChild.get(child);while(p){state.expanded.add(p);const incoming=model.incomingByChild.get(child);if(incoming)state.collapsedBranches.delete(branchKeyFromEdge(p,incoming));child=p;p=model.parentByChild.get(p);}document.body.classList.add('inspector-open');renderAll();setTimeout(()=>{const row=document.querySelector(`[data-node="${cssEscape(String(id))}"]`);row?.scrollIntoView({block:'nearest'});row?.focus();},0);}
function branchRow(r){const g=r.group;const key=r.key;const cls=g.resolved?'resolved':'unresolved';const open=r.open!==false;const selected=state.selectedType==='branch'&&state.selectedId===key;const pathIds=selectedPathIds();const hot=g.childIds.length>=10||g.childIds.some(id=>{const n=model.nodesById.get(String(id));return n&&(n.disabled!=='none'||hasDiag(n));});const inPath=pathIds.has(`branch:${key}`);const dim=state.rcaFocus&&!selected&&!inPath&&!hot;return `<div class="branch-row ${cls} ${open?'':'collapsed'} ${selected?'selected':''} ${hot?'hotspot':''} ${inPath?'active-path':''} ${dim?'dimmed':''}" role="treeitem" aria-level="${r.level+1}" aria-expanded="${open?'true':'false'}" aria-selected="${selected?'true':'false'}" tabindex="0" data-branch="${esc(key)}" style="--depth:${r.level}"><button class="twisty branch-twisty" type="button" data-toggle-branch="${esc(key)}" aria-label="${open?'Collapse':'Expand'} action ${esc(g.label)}">${open?'−':'+'}</button><div class="branch-main"><span class="branch-label">${esc(g.label)}</span><span class="branch-meta">${fmt(g.childIds.length)} child ${g.childIds.length===1?'rule':'rules'}</span></div><button class="mini-row-btn" type="button" data-toggle-branch="${esc(key)}" aria-label="${open?'Collapse':'Expand'} branch">${open?'−':'+'}</button></div>`;}
function renderInspector(){const b=selectedBranch();const n=selectedNode();const obj=selectedObject();$('inspectorTitle').textContent=n?n.title:(b?b.label:(obj?.title||obj?.name||obj?.kind||'Scope'));$('inspectorCaption').textContent=n?`${n.fn||'no function'} · ${n.scopeId}`:(b?`Action branch · Parent: ${b.parent.title}`:(obj?.scopeId||'Evidence object'));$('inspectorTabs').innerHTML='<span class="app-mode-note">Evidence inspector</span>';if(n)return renderNodeInspector(n);if(b)return renderBranchInspector(b);if(selectedInventory())return renderGenericInspector(selectedInventory(),'Inventory row');if(selectedRel())return renderGenericInspector(selectedRel(),'Reference');if(selectedDiag())return renderGenericInspector(selectedDiag(),'Diagnostic');return renderScopeInspector(currentScope());}
function branchRoutePathObjects(b){const base=routePathObjects(b.parent);base.push({kind:'ActionBranch',branchId:b.branchId,parentNodeId:b.parent.id,label:b.label,actionListIndex:b.actionListIndex,routeState:b.routeState,resolved:b.resolved});return base;}
function branchPacket(b){const diags=branchDiagnostics(b),refs=branchReferences(b);return {schema:'AcWorkbench.SelectedActionBranchEvidence',schemaVersion:'1.0.0',copiedAt:new Date().toISOString(),scopeId:b.scopeId,branch:{branchId:b.branchId,parentNodeId:b.parent.id,parentRuleName:b.parent.title,parentFunctionName:b.parent.fn,label:b.label,actionListIndex:b.actionListIndex,routeState:b.routeState,resolved:b.resolved,childCount:b.childCount},routePath:branchRoutePathObjects(b),children:b.childNodes.map(n=>({nodeId:n.id,ruleName:n.title,functionName:n.fn,disabled:n.disabled,hasDiagnostics:hasDiag(n)})),relationships:refs.map(r=>({kind:r.kind,targetType:r.targetType,target:r.target,confidence:r.confidence,nodeId:r.nodeId})),diagnostics:diags.map(d=>({severity:d.severity,title:d.title,detail:d.detail,nodeId:d.nodeId})),notProven:['Action branch grouping is structural evidence from parsed parent action lists.','This is not native runtime execution proof.','Search and flow/projection output are not dependencies or runtime traces.']};}
function branchDiagnostics(b){const ids=new Set(branchSubtreeNodeIds(b));return model.diags.filter(d=>ids.has(String(d.nodeId)));}
function branchReferences(b){const ids=new Set(branchSubtreeNodeIds(b));return model.rels.filter(r=>ids.has(String(r.nodeId)));}
function branchSubtreeNodeIds(b){const out=[];const walk=id=>{out.push(String(id));childIds(id).forEach(walk);};b.childIds.forEach(walk);return out;}
function branchMarkdownReport(b){const p=branchPacket(b);return `# Action Branch Evidence\n\nScope: ${p.scopeId}\nParent rule: ${p.branch.parentRuleName}\nParent function: ${p.branch.parentFunctionName||'none'}\nAction: ${p.branch.label}\nRoute state: ${p.branch.routeState}\nChildren: ${p.branch.childCount}\n\n## Structural route\n${p.routePath.map(seg=>seg.kind==='ActionBranch'?`- Action: ${seg.label}`:`- Rule: ${seg.name}`).join('\n')}\n\n## Child rules\n${p.children.map(c=>`- ${c.ruleName} (${c.functionName||'no function'})${c.disabled!=='none'?` - ${c.disabled}`:''}`).join('\n')||'- None'}\n\n## Caveats\n${p.notProven.map(x=>`- ${x}`).join('\n')}\n`;}
function renderBranchInspector(b){const diags=branchDiagnostics(b),refs=branchReferences(b);const trust=`<div class="trust-strip"><div class="trust-item info"><b>Object</b><span>Action branch</span></div><div class="trust-item ${b.resolved?'good':'warn'}"><b>Route label</b><span>${b.resolved?'Resolved':'Index only'}</span></div><div class="trust-item info"><b>Children</b><span>${fmt(b.childCount)}</span></div><div class="trust-item ${diags.length?'warn':'good'}"><b>Diagnostics</b><span>${diags.length?fmt(diags.length):'None'}</span></div><div class="trust-item info"><b>References</b><span>${fmt(refs.length)}</span></div><div class="trust-item warn"><b>Runtime</b><span>Not simulated</span></div></div>`;const summary=`<div class="kv">${kv('Branch label',`<span class="route-chip ${b.resolved?'resolved':'unresolved'}">${esc(b.label)}</span>`)}${kv('Parent rule',`<button class="btn ghost" type="button" data-node="${esc(b.parent.id)}">${esc(b.parent.title)}</button>`)}${kv('Parent function',`<span class="mono">${esc(b.parent.fn||'')}</span>`)}${kv('Action index',esc(b.actionListIndex??''))}${kv('Route state',esc(b.routeState))}${kv('Child rules',fmt(b.childCount))}</div><div class="branch-actions"><button class="btn" type="button" data-action="copy-branch-route">Copy branch path</button><button class="btn" type="button" data-action="copy-branch-evidence">Copy branch evidence</button><button class="btn primary" type="button" data-action="export-branch-subtree">Export branch subtree</button></div>`;const route=`<div class="route-breadcrumb">${branchRoutePathObjects(b).map((seg,i)=>`${i?'<span class="route-arrow">→</span>':''}${seg.kind==='ActionBranch'?`<span class="route-step"><span class="route-chip ${seg.resolved?'resolved':'unresolved'}">Action: ${esc(seg.label)}</span></span>`:`<button class="route-step" type="button" data-node="${esc(seg.nodeId)}"><b>${esc(seg.name)}</b></button>`}`).join('')}</div><div class="caption mt-8">Structural route only. This is not a runtime execution trace.</div>`;const children=b.childNodes.length?`<div class="mini-list">${b.childNodes.map(n=>`<button class="quick-card" type="button" data-node="${esc(n.id)}"><b>${esc(n.title)}</b><span>${esc(n.fn||'no function')} · ${n.disabled==='none'?'not disabled':n.disabled}</span></button>`).join('')}</div>`:'<div class="muted">No child rules under this branch.</div>';const relBody=refs.length?refs.slice(0,120).map(r=>`<div class="split-row my-7"><span>${esc(r.kind)} → <b>${esc(r.target)}</b><div class="caption">${esc(r.targetType)} · child node ${esc(r.nodeId||'unlinked')}</div></span>${badgeConfidence(r.confidence)}</div>`).join(''):'<div class="muted">No references linked under this branch.</div>';const diagBody=diags.length?diags.map(d=>`<div class="notice"><div class="notice-icon">!</div><div><b>${esc(d.title)}</b><br>${esc(d.detail)}<div class="caption">Reviewer action: inspect affected child rule before drawing route conclusions.</div></div></div>`).join(''):'<div class="muted">No diagnostics linked under this branch.</div>';$('inspectorBody').innerHTML=`${trust}${sectionHtml('Summary','branch',summary,true)}${sectionHtml('Route','path',route,true)}${sectionHtml('Child rules',b.childCount,children,true)}${sectionHtml('References',refs.length,relBody,refs.length>0)}${sectionHtml('Diagnostics',diags.length,diagBody,diags.length>0)}${sectionHtml('Evidence','trust','<ul class="evidence-list"><li><b>Branch evidence:</b> Parent rule owns this action list entry in the parsed structural tree.</li><li><b>Branch identity:</b> Uses parent node plus action index, not display label.</li><li><b>Not proven:</b> Runtime execution and branch-taking are not simulated.</li></ul>',true)}${sectionHtml('Raw','JSON',`<pre class="raw">${esc(JSON.stringify(branchPacket(b),null,2))}</pre>`,false)}`;}
function hasVisibleQuery(x){const q=lower(state.treeQuery).trim();if(!q)return true;return matchesSearchQuery(x,q);}
function matchesSearchQuery(x,q){const blob=lower([x.searchBlob,JSON.stringify(x),x.title,x.fn,x.scopeId].join(' '));const terms=q.match(/"[^"]+"|\S+/g)||[];return terms.every(term=>{term=term.replace(/^"|"$/g,'');const gt=term.match(/^children>(\d+)$/i);if(gt)return Number(first(x.childCount,childIds(x.id).length,0))>Number(gt[1]);const parts=term.split(':');if(parts.length>1){const op=lower(parts.shift()),val=lower(parts.join(':').replace(/^"|"$/g,''));if(op==='function'||op==='fn')return lower(x.fn||x.FunctionName).includes(val);if(op==='field'||op==='target')return lower(x.target||x.Target||paramText(x.Parameters)).includes(val);if(op==='action'||op==='route')return lower(actionNamesOf(x).join(' ')+' '+(x.label||'')+' '+(x.searchBlob||'')).includes(val);if(op==='disabled')return val==='true'?disabledOf(x)!=='none':lower(x.disabled||disabledOf(x)).includes(val);if(op==='has'){if(val==='disabled')return disabledOf(x)!=='none'||x.disabled!=='none';if(val==='diagnostic'||val==='warning'||val==='warnings')return !!x.nodeId?model.diags.some(d=>String(d.nodeId)===String(x.nodeId)):hasDiag(x);if(val==='branches'||val==='children')return childIds(x.id).length>0||childRouteGroups(x.id).length>0;}if(op==='scope')return lower(x.scopeId||scopeIdOf(x)).includes(val);if(op==='guid')return lower(x.RuleGuid||x.ruleGuid).includes(val);if(op==='flatonly')return String(x.classification==='FlatOnly').includes(val);if(op==='diagnostic')return lower(x.title||x.detail||x.searchBlob).includes(val);}return blob.includes(lower(term));});}
function searchResults(){const q=lower(state.query).trim();if(!q)return [];const rows=[];for(const s of model.scopes){if(matchesSearchQuery({searchBlob:`${s.name} ${s.scopeId} ${s.kind}`},q))rows.push({kind:'Scope',scopeId:s.scopeId,title:s.name,subtitle:`${s.kind} · ${fmt(s.structural)} rules`,badges:[s.kind]});}
for(const n of model.nodes){if(matchesSearchQuery(n,q))rows.push({kind:'StructuralRule',scopeId:n.scopeId,nodeId:n.id,title:n.title,subtitle:`${n.fn||'no function'} · ${n.scopeId}`,badges:[n.disabled!=='none'?n.disabled:'Structural'].filter(Boolean),routePreview:model.incomingByChild.get(n.id)?.label||'root'});}for(const bkey of allBranchKeysForScope(state.scopeId)){const b=branchVmFromKey(bkey);if(b&&matchesSearchQuery({searchBlob:`${b.label} ${b.parent.title} ${b.parent.fn} ${b.scopeId}`},q))rows.push({kind:'ActionBranch',scopeId:b.scopeId,branchKey:b.key,title:`Action: ${b.label}`,subtitle:`Parent: ${b.parent.title} · ${fmt(b.childCount)} child rules`,badges:[b.routeState]});}
for(const r of model.rels){if(matchesSearchQuery(r,q))rows.push({kind:'Reference',scopeId:r.scopeId,nodeId:r.nodeId,title:`${r.kind}: ${r.target}`,subtitle:`${r.targetType} · ${r.confidence}`,badges:[r.confidence||'Reference']});}
for(const d of model.diags){if(matchesSearchQuery(d,q))rows.push({kind:'Diagnostic',scopeId:d.scopeId,nodeId:d.nodeId,title:d.title,subtitle:d.detail,badges:[d.severity]});}
return rows.slice(0,80);}
function renderSearchPopover(){const pop=$('searchPopover');if(!pop)return;const q=state.query.trim();if(!q){pop.classList.remove('open');pop.innerHTML='';state.searchActiveIndex=-1;$('globalSearch').setAttribute('aria-expanded','false');$('globalSearch').removeAttribute('aria-activedescendant');return;}const results=searchResults();if(!results.length)state.searchActiveIndex=-1;else state.searchActiveIndex=Math.max(0,Math.min(results.length-1,state.searchActiveIndex));pop.classList.add('open');$('globalSearch').setAttribute('aria-expanded','true');pop.innerHTML=`<div class="search-help">Operators: action:"Run Rules", function:_IGetDocAttr, has:disabled, has:diagnostic, children>20, scope:DentalADA. Search hits are evidence pointers, not runtime proof.</div>${results.length?results.map((r,i)=>`<button id="searchResult-${i}" class="search-result ${i===state.searchActiveIndex?'active':''}" type="button" data-search-index="${i}" role="option" aria-selected="${i===state.searchActiveIndex?'true':'false'}"><span><b>${esc(r.title)}</b><span>${esc(r.kind)} · ${esc(r.subtitle||'')}</span></span><span>${(r.badges||[]).slice(0,2).map(b=>`<span class="badge blue">${esc(b)}</span>`).join('')}</span></button>`).join(''):'<div class="empty"><div>No matching evidence.</div></div>'}`;pop._results=results;const activeId=state.searchActiveIndex>=0?`searchResult-${state.searchActiveIndex}`:'';if(activeId)$('globalSearch').setAttribute('aria-activedescendant',activeId);else $('globalSearch').removeAttribute('aria-activedescendant');}
function closeSearchPopover(){const pop=$('searchPopover');if(!pop)return;pop.classList.remove('open');pop.innerHTML='';pop._results=[];state.searchActiveIndex=-1;$('globalSearch').setAttribute('aria-expanded','false');$('globalSearch').removeAttribute('aria-activedescendant');}
function setSearchActiveIndex(index){const pop=optionalElement('searchPopover');const results=pop?._results||[];if(!results.length){state.searchActiveIndex=-1;renderSearchPopover();return;}const max=results.length-1;state.searchActiveIndex=Math.max(0,Math.min(max,index));renderSearchPopover();const row=document.getElementById(`searchResult-${state.searchActiveIndex}`);row?.scrollIntoView({block:'nearest'});}
function handleSearchPopoverKeydown(e){const pop=optionalElement('searchPopover');const open=!!pop?.classList.contains('open');if(!open)return false;const results=pop?._results||[];if(!results.length)return false;if(e.key==='ArrowDown'){e.preventDefault();setSearchActiveIndex((state.searchActiveIndex<0?0:state.searchActiveIndex)+1);return true;}if(e.key==='ArrowUp'){e.preventDefault();setSearchActiveIndex((state.searchActiveIndex<0?results.length-1:state.searchActiveIndex)-1);return true;}if(e.key==='Enter'){const idx=state.searchActiveIndex<0?0:state.searchActiveIndex;const hit=results[Math.max(0,Math.min(results.length-1,idx))];if(hit){e.preventDefault();jumpToSearchResult(hit);return true;}}return false;}
function isSearchUiTarget(target){return !!target?.closest?.('.global-search,#searchPopover,[data-search-index]');}
// Build a nested, operator-first left object tree with grouped sections and direct actions.
function renderObjectTreeBlock(){
  const toTotal=rows=>rows.reduce((sum,row)=>sum+Number(first(row.count,0)),0);
  const scopeCountBy=matcher=>model.scopes.filter(s=>matcher(`${s.kind} ${s.name} ${s.scopeId}`)).length;
  const canonicalCounts=model.fwd?.overview?.counts||null;
  const tableDefs=buildGlobalTableDefinitions();
  const resources=domainRowsByView('resources');
  const tables=domainRowsByView('tables');
  const drivers=domainRowsByView('drivers');
  const udfs=domainRowsByView('udfs');
  const counts={
    documents:first(canonicalCounts?.documents,scopeCountBy(v=>/document|doc/i.test(v))),
    pages:first(canonicalCounts?.pages,scopeCountBy(v=>/page/i.test(v))),
    batches:first(canonicalCounts?.batches,scopeCountBy(v=>/batch/i.test(v))),
    processes:first(canonicalCounts?.processes,scopeCountBy(v=>/process|\bac\b|\bdv\b|\bfip\b|\bocr\b|render|store|webkey|\bkfi\b|\bke\b/i.test(v))),
    structure:scopedRuleNodes().length,
    resources:first(canonicalCounts?.resourceTypes,toTotal(resources)),
    tables:first(model.fwd?.tables?.count,canonicalCounts?.tables,tableDefs.length),
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
    processes:state.workspaceView==='structure'&&state.scopeKindFilter==='all'&&/process|\bac\b|\bdv\b|\bfip\b|\bocr\b|render|store|webkey|\bkfi\b|\bke\b/i.test(state.scopeQuery),
    resources:state.workspaceView==='resources',
    tables:state.workspaceView==='tables',
    drivers:state.workspaceView==='drivers',
    udfs:state.workspaceView==='udfs',
    fieldResolution:state.workspaceView==='field-resolution',
    structure:state.workspaceView==='structure'&&state.scopeKindFilter==='all'&&!state.scopeQuery
  };
  const structureRows=[
    row('view-structure','Rule Structure',counts.structure,'Structural tree and action routes',nav.structure),
    row('nav-documents','Documents',counts.documents,'Document type configuration scopes',nav.documents,true),
    row('nav-pages','Pages',counts.pages,'Page type configuration scopes',nav.pages,true),
    row('nav-batches','Batches',counts.batches,'Batch configuration scopes',nav.batches,true),
    row('nav-processes','Processes',counts.processes,'Process-node configuration scopes',nav.processes,true)
  ];
  const evidenceRows=[
    row('view-field-resolution','Field Resolution',counts.unresolvedFields,'Scope-level resolved and unresolved field references',nav.fieldResolution),
    row('view-resources','Resources / Config',counts.resources,'Global resource and configuration evidence',nav.resources),
    row('view-tables','Tables',counts.tables,'Table-like evidence targets',nav.tables,true),
    row('view-drivers','Input/Output Drivers',counts.drivers,'Input/output driver evidence',nav.drivers,true),
    row('view-udfs','UDFs',counts.udfs,'User-defined function evidence',nav.udfs,true)
  ];
  return `<div class="scope-group"><span>Workbench Navigation</span></div><div class="global-view-list" role="group" aria-label="Editor object tree">${section('Structure Model',structureRows,true)}${section('Global Evidence',evidenceRows,true)}</div>`;
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
  $('scopeSearch').value=state.scopeQuery;
  document.querySelectorAll('[data-scope-filter]').forEach(btn=>btn.classList.toggle('active',btn.dataset.scopeFilter===state.scopeKindFilter));
  const recentRows=state.recentScopes.map(id=>model.scopes.find(s=>s.scopeId===id)).filter(Boolean);
  $('recentScopes').innerHTML=recentRows.length?recentRows.map(s=>`<button class="recent-scope-btn ${s.scopeId===state.scopeId?'active':''}" type="button" data-scope="${esc(s.scopeId)}" title="${esc(s.scopeId)}">${esc(s.name)}</button>`).join(''):'';
  // Render a scope row button for a single scope entry.
  function scopeRowHtml(s){
    const active=s.scopeId===state.scopeId;
    const icon=/page/i.test(text(s.kind))?'▣':/document|doc/i.test(text(s.kind))?'▤':'▦';
    return `<button class="scope-row ${active?'active':''}" type="button" data-scope="${esc(s.scopeId)}" aria-current="${active?'true':'false'}"><span class="scope-icon" aria-hidden="true">${icon}</span><span class="scope-row-main"><span class="scope-name">${esc(s.name)}</span><span class="scope-row-meta">${esc(s.scopeId)}</span></span></button>`;
  }
  function scopeSectionHtml(title,rows,open=true){
    if(!rows.length)return '';
    return `<details class="scope-section scope-section-scopes" ${open?'open':''}><summary><span>${esc(title)}</span><span class="section-count">${fmt(rows.length)}</span></summary><div class="scope-section-body">${rows.map(scopeRowHtml).join('')}</div></details>`;
  }
  const globalBlock=renderObjectTreeBlock();
  if(!rows.length){
    $('scopeList').innerHTML=`${globalBlock}${emptyHtml('No scopes match','Adjust the scope filter or search.')}`;
  } else {
    // Separate rows into Documents first, then Pages, then everything else in nested sections.
    const docs=rows.filter(s=>/document|doc/i.test(text(s.kind)));
    const pages=rows.filter(s=>/page/i.test(text(s.kind)));
    const other=rows.filter(s=>!/document|doc|page/i.test(text(s.kind)));
    const parts=[globalBlock];
    parts.push('<div class="scope-group"><span>Scopes</span></div>');
    parts.push(scopeSectionHtml('Documents',docs,true));
    parts.push(scopeSectionHtml('Pages',pages,true));
    parts.push(scopeSectionHtml('Other',other,false));
    $('scopeList').innerHTML=parts.join('');
  }
}
function jumpToSearchResult(r){if(!r)return;closeSearchPopover();if(r.kind==='Scope')return selectScope(r.scopeId);if(r.kind==='ActionBranch'){selectScope(r.scopeId);selectBranch(r.branchKey);state.collapsedBranches.delete(r.branchKey);renderAll();return;}if(r.nodeId){selectScope(r.scopeId);selectNode(r.nodeId);return;}if(r.scopeId)selectScope(r.scopeId);}
function renderAll(){return withUiGuard('render',()=>{saveState();renderTop();renderScopes();renderMainHead();renderContent();renderInspector();renderSearchPopover();});}
function renderTop(){
  const banner=optionalElement('globalErrorBanner');
  if(banner&&bootState.phase!=='failed')banner.hidden=true;
  document.body.classList.toggle('is-loading',!model||bootState.phase==='loading');
  document.body.classList.toggle('is-loaded',!!model&&bootState.phase!=='loading');
  if(!model||bootState.phase==='loading'){
    $('sourceSubtitle').textContent='Loading evidence snapshot...';
    $('qualityPill').innerHTML='<span class="dot"></span><span>Loading evidence</span>';
    $('globalSearch').value=state.query;
    return;
  }
  const total=fmt(model.nodes.filter(n=>n.isRule).length);
  const activeView=(state.workspaceView||'structure').toUpperCase();
  const hydration=canonicalHydrationSummary();
  $('sourceSubtitle').textContent=`Snapshot ${esc(snapshotId())} · ${total} structural rules · ${esc(activeView)} view`;
  const warnings=model.diags.filter(d=>/warn|error/i.test(d.severity)).length;
  const warnDot=warnings||hydration.level==='warn';
  const statusText=warnings?fmt(warnings)+' diagnostics':(hydration.level==='warn'?hydration.label:'Evidence ready');
  $('qualityPill').innerHTML=`<span class="dot ${warnDot?'warn':''}"></span><span>${esc(statusText)}</span>`;
  $('globalSearch').value=state.query;
  document.body.classList.toggle('rca-focus-mode',!!state.rcaFocus);
  const b=document.querySelector('[data-action="toggle-rca-focus"]');
  if(b){b.classList.toggle('primary',!!state.rcaFocus);b.setAttribute('aria-pressed',state.rcaFocus?'true':'false');b.textContent=state.rcaFocus?'RCA Focus On':'RCA Focus';}
}
function viewLabel(){
  const labels={all:'All structural nodes',disabled:'Disabled only',inherited:'Inherited disabled',warnings:'Diagnostics only',actions:'Action-branch parents',sections:'Sections and comments'};
  const base=labels[state.treeFilter]||'Filtered view';
  const q=text(state.treeQuery).trim();
  return q?`${base} | search: ${q}`:base;
}
function renderViewbar(){
  const hasRule=!!selectedNode();
  const hasFilter=!!text(state.query).trim();
  const struct=state.workspaceView==='structure';
  const html=`<div class="viewbar-shell"><div class="viewbar-left"><div class="cmd-main" role="group" aria-label="Workbench views"><button class="btn ${struct?'primary':''}" type="button" data-action="view-structure">Structure</button><button class="btn ${state.workspaceView==='field-resolution'?'primary':''}" type="button" data-action="view-field-resolution">Field Resolution</button><button class="btn ${state.workspaceView==='resources'?'primary':''}" type="button" data-action="view-resources">Resources</button><button class="btn ${state.workspaceView==='tables'?'primary':''}" type="button" data-action="view-tables">Tables</button><button class="btn ${state.workspaceView==='drivers'?'primary':''}" type="button" data-action="view-drivers">Drivers</button><button class="btn ${state.workspaceView==='udfs'?'primary':''}" type="button" data-action="view-udfs">UDFs</button></div><div class="field tree-filter"><label class="sr-only" for="viewSearch">Filter structure</label><input id="viewSearch" type="search" value="${esc(state.query)}" placeholder="Filter evidence by rule, action, function, target, or disabled state"><button class="filter-clear" type="button" data-action="clear-tree-search" aria-label="Clear tree filter" ${hasFilter?'':'disabled'}>Clear</button></div>${struct?`<div class="cmd-main" role="group" aria-label="Tree commands"><button class="btn primary" type="button" data-action="expand-selected-subtree" ${hasRule?'':'disabled'}>Expand selected</button><button class="btn" type="button" data-action="expand-selected-depth" ${hasRule?'':'disabled'}>Expand +1</button><button class="btn" type="button" data-action="collapse-siblings" ${hasRule?'':'disabled'}>Collapse peers</button><button class="btn" type="button" data-action="expand-all">Expand all</button><button class="btn" type="button" data-action="collapse-all">Collapse all</button>${state.focusNodeId?'<button class="btn" type="button" data-action="clear-focus">Clear focus</button>':''}</div><div class="cmd-hint">Select a rule row, then use Expand selected. Shortcuts: Alt+A Alt+D Alt+P.</div>`:'<div class="cmd-hint">Canonical entities are primary. Inferred evidence is always secondary and explicitly labeled.</div>'}</div></div>`;
  $('viewbar').innerHTML=html;
  syncViewSearchMeta();
}
function treeSelectionPanelHtml(){
  const n=selectedNode();
  const b=selectedBranch();
  if(n){
    const children=childIds(n.id).length;
    return `<div class="tree-detail-card"><div class="tree-detail-head"><div><div class="tree-detail-kicker">Selected rule</div><h3>${esc(n.title)}</h3><div class="tree-detail-sub">${esc(n.fn||'No function mapped')} · ${esc(n.scopeId)}</div></div><div class="tree-detail-badges">${n.disabled!=='none'?`<span class="badge amber">${esc(n.disabled)}</span>`:'<span class="badge green">enabled</span>'}<span class="badge blue">${fmt(children)} children</span></div></div><div class="tree-detail-actions"><button class="btn" type="button" data-action="expand-selected-depth">Expand +1</button><button class="btn" type="button" data-action="expand-selected-subtree">Expand subtree</button><button class="btn" type="button" data-action="collapse-siblings">Collapse peers</button><button class="btn" type="button" data-action="copy-rule-evidence">Copy evidence</button></div></div>`;
  }
  if(b){
    return `<div class="tree-detail-card"><div class="tree-detail-head"><div><div class="tree-detail-kicker">Selected action branch</div><h3>${esc(b.label)}</h3><div class="tree-detail-sub">Parent: ${esc(b.parent.title)} · ${fmt(b.childCount)} child ${b.childCount===1?'rule':'rules'}</div></div><div class="tree-detail-badges"><span class="badge ${b.resolved?'green':'amber'}">${b.resolved?'resolved':'index-only'}</span></div></div><div class="tree-detail-actions"><button class="btn" type="button" data-action="copy-branch-route">Copy branch path</button><button class="btn" type="button" data-action="copy-branch-evidence">Copy branch evidence</button></div></div>`;
  }
  return `<div class="tree-detail-card"><div><div class="tree-detail-kicker">Tree workspace</div><h3>No item selected</h3><div class="tree-detail-sub">Pick a rule or branch row to see details and contextual actions here.</div></div></div>`;
}
function renderStructure(){
  const rows=visibleStructureRows();
  const maxRows=1400;
  const clipped=rows.length>maxRows;
  const renderRows=clipped?rows.slice(0,maxRows):rows;
  const treeHtml=renderRows.length
    ?`${treeSelectionPanelHtml()}<div class="tree" role="tree" aria-label="Structural rule tree">${renderRows.map(r=>r.type==='branch'?branchRow(r):treeRow(r.n,r.level)).join('')}</div>${clipped?`<div class="notice mt-10"><div class="notice-icon">i</div><div>Rendering first ${fmt(maxRows)} rows. Narrow filter or collapse branches to focus the view.</div></div>`:''}`
    :emptyHtml('No structural nodes match the current filter','Clear search/filter or choose a different scope.');
  $('content').innerHTML=treeHtml;
}
function openExportBuilder(){state.modal='export';renderModal();}
function exportConfigFromModal(){const form=document.querySelector('#exportForm');const fd=form?new FormData(form):new FormData();return {view:text(fd.get('view')||'auto'),format:text(fd.get('format')||'json'),includeEvidence:fd.get('includeEvidence')==='on',includeRawAttributes:fd.get('includeRawAttributes')==='on',includeDiagnostics:fd.get('includeDiagnostics')==='on',includeReferences:fd.get('includeReferences')==='on',includeMarkdown:fd.get('includeMarkdown')==='on'};}
function buildExportPayload(cfg){const n=selectedNode(),b=selectedBranch(),s=currentScope();const base={schema:'AcWorkbench.AdvancedExport',schemaVersion:'1.0.0',exportedAt:new Date().toISOString(),exportOptions:cfg,provenance:{snapshotId:snapshotId(),source:first(treeData.FwdPath,rulesData.FwdPath,'Embedded snapshot'),apiVersion:'v1',structuralAuthority:true,flowConfidence:'Experimental / low-confidence'},notProven:['This export is static structural/extraction evidence.','Runtime execution and branch-taking are not simulated.','Flat inventory does not override structural disabled authority.']};if(cfg.view==='branch'||(cfg.view==='auto'&&b))return {...base,view:'branch',payload:branchPacket(b||branchVmFromKey(state.selectedId))};if(cfg.view==='rule'||(cfg.view==='auto'&&n))return {...base,view:'rule',payload:selectedRuleEvidencePacket(n)};if(cfg.view==='route'&&n)return {...base,view:'route',payload:selectedRoutePathPacket(n)};if(cfg.view==='subtree'&&n)return {...base,view:'subtree',payload:{root:selectedRuleEvidencePacket(n),nodes:subtreeNodes(n.id).map(x=>({nodeId:x.id,name:x.title,functionName:x.fn,disabled:x.disabled})),branches:subtreeBranches(n.id)}};if(cfg.view==='diagnostics')return {...base,view:'diagnostics',scopeId:s.scopeId,payload:scopedDiags()};const fieldResolutionIndex=getScopeFieldResolutionIndex(s.scopeId);return {...base,view:'scopePacket',scopeId:s.scopeId,payload:{scope:s,structureSummary:{rules:scopedRuleNodes().length,edges:scopedEdges().length,routeStats:scopedRouteStats()},fieldResolutionSummary:fieldResolutionIndex.summary,fieldResolutionTopUnresolved:fieldResolutionIndex.rows.filter(r=>!r.fieldExists).slice(0,80).map(r=>({nodeId:r.nodeId,ruleName:r.ruleName,functionName:r.functionName,referencedField:r.referencedField,parameterName:r.parameterName,parameterValue:r.parameterValue,matchCount:r.matchCount})),visibleRows:visibleStructureRows().map(r=>r.type==='branch'?{kind:'ActionBranch',key:r.key,parentNodeId:r.parent.id,label:r.group.label,childCount:r.group.childIds.length}:{kind:'Rule',nodeId:r.n.id,name:r.n.title,functionName:r.n.fn,disabled:r.n.disabled}),diagnostics:cfg.includeDiagnostics?scopedDiags():undefined,references:cfg.includeReferences?scopedRels():undefined}};}
function subtreeNodes(rootId){const out=[];const walk=id=>{const n=model.nodesById.get(String(id));if(n)out.push(n);childIds(id).forEach(walk)};walk(rootId);return out;}
function subtreeBranches(rootId){const out=[];const walk=id=>{childRouteGroups(id).forEach(g=>out.push({parentNodeId:id,label:g.label,routeState:g.routeState,childCount:g.childIds.length}));childIds(id).forEach(walk)};walk(rootId);return out;}
/** Execute the advanced export builder and download a product-safe JSON payload. */
function executeExport(){const cfg=exportConfigFromModal();const payload=buildExportPayload(cfg);const name=`ac-${slug(payload.view)}-${slug(selectedNode()?.title||selectedBranch()?.label||currentScope().name)}.json`;download(name,JSON.stringify(payload,null,2),'application/json');}
function generateReviewerReport(){const n=selectedNode(),b=selectedBranch(),s=currentScope();let md='';if(b)md=branchMarkdownReport(b);else if(n)md=ruleMarkdownReport(n);else md=scopeMarkdownReport(s);return md;}
function ruleMarkdownReport(n){const p=selectedRuleEvidencePacket(n);return `# Rule Evidence Report\n\nScope: ${p.scopeId}\nRule: ${p.identity.ruleName}\nFunction: ${p.identity.functionName||'none'}\nNode: ${p.identity.nodeId}\n\n## Structural route\n${routePathObjects(n).map(seg=>`- ${seg.incomingAction?`via ${seg.incomingAction.label} -> `:''}${seg.name}`).join('\n')}\n\n## Outgoing branches\n${(model.edgesByParent.get(n.id)||[]).map(e=>`- ${e.label}: ${model.nodesById.get(String(e.to))?.title||e.to}`).join('\n')||'- None'}\n\n## Trust\n- Disabled authority: Structural\n- Flat inventory: ${p.reconciliation.flatInventoryMatch?'Correlated':'No correlated row'}\n- Runtime execution: Not proven\n- Flow: Experimental / low-confidence\n`;}
function scopeMarkdownReport(s){const stats=scopedRouteStats();const fr=getScopeFieldResolutionIndex(s.scopeId);const unresolvedTop=fr.rows.filter(r=>!r.fieldExists).slice(0,10);return `# Scope Evidence Report\n\nScope: ${s.name}\nScope ID: ${s.scopeId}\nKind: ${s.kind}\n\n## Counts\n- Structural rules: ${scopedRuleNodes().length}\n- Inventory rows: ${scopedInventory().length}\n- Flat-only rows: ${s.flatOnly}\n- References: ${scopedRels().length}\n- Diagnostics: ${scopedDiags().length}\n\n## Route labels\n- Resolved: ${stats.resolved}\n- Index-only / unresolved: ${stats.indexOnly+stats.unresolved}\n\n## Field resolution\n- Referenced fields: ${fr.summary.referenced}\n- Resolved references: ${fr.summary.resolved}\n- Unresolved references: ${fr.summary.unresolved}\n- Rules with unresolved references: ${fr.summary.rulesWithUnresolved}\n\n## Top unresolved field references\n${unresolvedTop.map(r=>`- ${r.referencedField} (${r.parameterName}) in ${r.ruleName} [${r.nodeId}]`).join('\n')||'- None'}\n\n## Caveats\n- Structure is hierarchy/order/routing authority.\n- Flat inventory is search/completeness evidence only.\n- Field resolution is static catalog matching, not runtime proof.\n- Flow is experimental / low-confidence.\n`;}
function openReportBuilder(){state.modal='report';renderModal();}
function renderExportBuilder(){const n=selectedNode(),b=selectedBranch();return `<form id="exportForm" class="builder-grid"><div class="panel"><h3>Advanced export builder</h3><div class="kv">${kv('Selected object',esc(n?'Rule':b?'Action branch':'Scope'))}${kv('Scope',esc(currentScope().scopeId))}${kv('Snapshot',esc(snapshotId()))}</div><h4>Export view</h4><select class="full-width" name="view"><option value="auto">Auto - selected object</option><option value="rule">Selected rule evidence</option><option value="route">Selected rule route</option><option value="branch">Selected action branch</option><option value="subtree">Selected rule subtree</option><option value="diagnostics">Current scope diagnostics</option><option value="scopePacket">Full scope packet</option></select><h4>Format</h4><select class="full-width" name="format"><option value="json">JSON</option></select></div><div class="panel"><h3>Include</h3><div class="check-list"><label><input name="includeEvidence" type="checkbox" checked> Evidence and caveats</label><label><input name="includeReferences" type="checkbox" checked> References</label><label><input name="includeDiagnostics" type="checkbox" checked> Diagnostics</label><label><input name="includeRawAttributes" type="checkbox"> Raw attributes when available</label><label><input name="includeMarkdown" type="checkbox"> Also generate Markdown report</label></div><div class="branch-actions"><button class="btn primary" type="button" data-action="run-export-builder">Export JSON</button><button class="btn" type="button" data-action="run-reviewer-report">Generate reviewer report</button></div></div></form>`;}
function renderReviewerReport(){const md=generateReviewerReport();return `<div class="builder-grid"><div class="panel"><h3>Reviewer report generator</h3><p class="caption">Markdown report for tickets, review notes, vendor escalation, or release evidence. It keeps runtime caveats explicit.</p><div class="branch-actions"><button class="btn primary" type="button" data-action="download-reviewer-report">Download Markdown</button><button class="btn" type="button" data-action="copy-reviewer-report">Copy Markdown</button><button class="btn" type="button" data-action="export-view">Open export builder</button></div></div><div class="panel"><h3>Preview</h3><pre id="reportPreview" class="report-preview">${esc(md)}</pre></div></div>`;}
function renderContextHelp(topic){const content={
'action-branch':['Action branches are structural group rows owned by a parent rule.','A rule expands to branches; a branch expands to child rules.','A branch row is not a rule and is not runtime proof.'],
'flat-only':['Flat-only rows come from broad inventory extraction.','They are useful for completeness/search, but not hierarchy or route proof.','Open structural match only when a correlated node exists.'],
'evidence':['Structural evidence proves hierarchy, action routing, branch order, and disabled inheritance.','References are confidence-coded static relationship evidence.','Diagnostics are reviewer cautions. Flow remains experimental.'],
'disabled':['Structural disabled state is authoritative when a tree node exists.','Flat PossiblyDisabledInherited is audit-only evidence.','Enabled is not badged in tree rows.']
}[topic]||['No contextual help is available for this item.'];return `<div class="context-card"><h3>${esc(topic.replace(/-/g,' '))}</h3><ul>${content.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;}
function modalFocusableElements(){
  return [...document.querySelectorAll('#helpModal button,#helpModal [href],#helpModal input,#helpModal select,#helpModal textarea,#helpModal [tabindex]:not([tabindex="-1"])')].filter(el=>!el.hasAttribute('disabled'));
}
function handleModalFocusTrap(event){
  if(!state.modal||event.key!=='Tab')return;
  const nodes=modalFocusableElements();
  if(!nodes.length)return;
  const firstNode=nodes[0];
  const lastNode=nodes[nodes.length-1];
  if(event.shiftKey&&document.activeElement===firstNode){event.preventDefault();lastNode.focus();return;}
  if(!event.shiftKey&&document.activeElement===lastNode){event.preventDefault();firstNode.focus();}
}
function renderModal(){const open=!!state.modal;const app=optionalElement('mainContent')?.closest('.app');$('modalBackdrop').classList.toggle('open',open);$('helpModal').classList.toggle('open',open);$('helpModal').classList.toggle('wide',state.modal==='export'||state.modal==='report');if(app){if(open)app.setAttribute('aria-hidden','true');else app.removeAttribute('aria-hidden');}if(!open){if(modalPreviouslyFocusedEl&&typeof modalPreviouslyFocusedEl.focus==='function')modalPreviouslyFocusedEl.focus();modalPreviouslyFocusedEl=null;return;}if(!modalPreviouslyFocusedEl)modalPreviouslyFocusedEl=document.activeElement;const title=state.modal==='export'?'Advanced export builder':state.modal==='report'?'Reviewer report generator':state.modal?.startsWith('help-')?'Contextual help':'Workbench help';$('helpTitle').textContent=title;$('helpCaption').textContent=state.modal==='export'?'Build product-safe JSON exports with provenance.':state.modal==='report'?'Generate Markdown reviewer reports.':'Evidence-first rule inspection. No runtime execution is simulated.';if(state.modal==='export')$('helpBody').innerHTML=renderExportBuilder();else if(state.modal==='report')$('helpBody').innerHTML=renderReviewerReport();else if(state.modal?.startsWith('help-'))$('helpBody').innerHTML=renderContextHelp(state.modal.replace(/^help-/,''));else renderHelp();const firstNode=modalFocusableElements()[0];window.setTimeout(()=>{(firstNode||$('helpModal')).focus();},0);}
function handleAction(a){if(a==='toggle-rca-focus'){state.rcaFocus=!state.rcaFocus;saveState();renderAll();toast(state.rcaFocus?'RCA Focus enabled':'RCA Focus disabled');return;}if(a==='go-structure'){state.treeFilter='all';state.query='';renderAll();toast('Structure workspace ready');return;}if(a==='clear-tree-search'){state.query='';$('globalSearch').value='';renderContent();renderInspector();renderViewbar();renderSearchPopover();$('viewSearch')?.focus();return;}if(a==='show-flat-only'){const row=scopedInventory().find(x=>x.classification==='FlatOnly');if(row){state.selectedType='inventory';state.selectedId=row.id;document.body.classList.add('inspector-open');renderAll();}else toast('No flat-only rows in this scope');return;}if(a==='show-diagnostics'){const d=scopedDiags()[0];if(d){state.selectedType='diag';state.selectedId=d.id;document.body.classList.add('inspector-open');renderAll();}else toast('No diagnostics in this scope');return;}if(a==='open-help'){state.modal='help';renderModal();return;}if(a==='help-action-branch'||a==='help-flat-only'||a==='help-evidence'||a==='help-disabled'){state.modal=a.replace(/^help-/,'help-');renderModal();return;}if(a==='close-modal'){closeModalRender();return;}if(a==='toggle-theme'){state.theme=state.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=state.theme;saveState();return;}if(a==='close-inspector'){document.body.classList.remove('inspector-open');return;}if(a==='show-inspector'){document.body.classList.add('inspector-open');return;}if(a==='expand-all'){const count=scopedRuleNodes().length;if(count>2500&&!confirm(`Expand ${fmt(count)} structural rules and all action branches? This can be slow.`))return;scopedNodes().forEach(n=>state.expanded.add(n.id));state.collapsedBranches.clear();renderAll();return;}if(a==='collapse-all'){state.expanded.clear();(model.rootsByScope.get(state.scopeId)||[]).forEach(id=>state.expanded.add(String(id)));state.collapsedBranches=new Set(allBranchKeysForScope(state.scopeId));renderAll();return;}if(a==='expand-selected-depth'){const n=selectedNode();if(!n){toast('Select a rule first');return;}state.expanded.add(n.id);collapseBranchesForNode(n.id);renderAll();return;}if(a==='expand-selected-subtree'){const n=selectedNode();if(!n){toast('Select a rule first');return;}subtreeNodes(n.id).forEach(x=>state.expanded.add(x.id));childRouteGroups(n.id).forEach(g=>state.collapsedBranches.delete(branchKey(n.id,g)));renderAll();return;}if(a==='collapse-siblings'){const n=selectedNode();if(!n){toast('Select a rule first');return;}const parent=model.parentByChild.get(n.id);if(parent){childIds(parent).filter(id=>id!==n.id).forEach(id=>state.expanded.delete(id));}renderAll();return;}if(a==='expand-action-groups'){allBranchKeysForScope(state.scopeId).forEach(k=>state.collapsedBranches.delete(k));renderAll();return;}if(a==='collapse-action-groups'){allBranchKeysForScope(state.scopeId).forEach(k=>state.collapsedBranches.add(k));renderAll();return;}if(a==='clear-focus'){state.focusNodeId='';renderAll();return;}if(a==='focus-selected'){const n=selectedNode();if(n){state.focusNodeId=n.id;state.expanded.add(n.id);collapseBranchesForNode(n.id);renderAll();}return;}if(a==='open-linked-node'){const obj=selectedInventory()||selectedRel();if(obj&&obj.nodeId){selectNode(obj.nodeId);}else toast('No linked structural node');return;}if(a==='export-view'){openExportBuilder();return;}if(a==='open-report-builder'){openReportBuilder();return;}if(a==='run-export-builder'){executeExport();return;}if(a==='run-reviewer-report'){state.modal='report';renderModal();return;}if(a==='download-reviewer-report'){download(`ac-reviewer-report-${slug(selectedNode()?.title||selectedBranch()?.label||currentScope().name)}.md`,generateReviewerReport(),'text/markdown');return;}if(a==='copy-reviewer-report'){copyText(generateReviewerReport());return;}if(a==='copy-route-path'){const n=selectedNode();if(!n){toast('Select a structural rule first');return;}copyText(JSON.stringify(selectedRoutePathPacket(n),null,2));return;}if(a==='copy-rule-evidence'){const b=selectedBranch();if(b){copyText(JSON.stringify(branchPacket(b),null,2));return;}const n=selectedNode();if(!n){toast('Select a rule or branch first');return;}copyText(JSON.stringify(selectedRuleEvidencePacket(n),null,2));return;}if(a==='copy-branch-route'){const b=selectedBranch();if(!b){toast('Select an action branch first');return;}copyText(JSON.stringify({schema:'AcWorkbench.ActionBranchRoutePath',scopeId:b.scopeId,routePath:branchRoutePathObjects(b)},null,2));return;}if(a==='copy-branch-evidence'){const b=selectedBranch();if(!b){toast('Select an action branch first');return;}copyText(JSON.stringify(branchPacket(b),null,2));return;}if(a==='export-branch-subtree'){const b=selectedBranch();if(!b){toast('Select an action branch first');return;}download(`ac-branch-subtree-${slug(b.label)}.json`,JSON.stringify({...buildExportPayload({view:'branch',includeEvidence:true})},null,2),'application/json');return;}if(a==='first-warning-scope'){const s=model.scopes.find(x=>x.warnings>0);if(s)selectScope(s.scopeId);return;}if(a==='largest-scope'){const s=[...model.scopes].sort((a,b)=>b.structural-a.structural)[0];if(s)selectScope(s.scopeId);return;}}
function viewSearchMeta(){
  if(state.workspaceView==='structure')return {label:'Filter structure',placeholder:'Filter structure by rule, action, function, target, or disabled state'};
  if(state.workspaceView==='field-resolution')return {label:'Filter field resolution',placeholder:'Filter field references by field name, rule, function, or parameter'};
  if(state.workspaceView==='resources')return {label:'Filter resources',placeholder:'Filter resource inventory evidence'};
  if(state.workspaceView==='tables')return {label:'Filter tables',placeholder:'Filter tables by name, column, scope, or usage'};
  if(state.workspaceView==='drivers')return {label:'Filter drivers',placeholder:'Filter drivers and process findings'};
  if(state.workspaceView==='udfs')return {label:'Filter UDFs',placeholder:'Filter UDF/function candidates and usage evidence'};
  return {label:'Filter evidence',placeholder:'Filter evidence'};
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
function applyQueryInput(value){state.query=value;syncQueryInputs();renderContent();renderInspector();renderSearchPopover();}
function wire(){document.addEventListener('click',e=>{if(!isSearchUiTarget(e.target))closeSearchPopover();const act=e.target.closest('[data-action]')?.dataset.action;if(act){if(act==='view-structure'||act==='view-field-resolution'||act==='view-resources'||act==='view-tables'||act==='view-drivers'||act==='view-udfs'){e.preventDefault();state.workspaceView=act.replace(/^view-/,'');renderContent();renderViewbar();renderInspector();saveState();return;}if(act==='nav-documents'||act==='nav-pages'||act==='nav-batches'||act==='nav-processes'){e.preventDefault();applyEditorNavPreset(act.replace(/^nav-/,''));saveState();return;}e.preventDefault();handleAction(act);return;}const sr=e.target.closest('[data-search-index]')?.dataset.searchIndex;if(sr!==undefined){const results=$('searchPopover')?._results||[];jumpToSearchResult(results[Number(sr)]);return;}const fieldFilter=e.target.closest('[data-field-filter]')?.dataset.fieldFilter;if(fieldFilter){state.fieldResolutionFilter=fieldFilter;renderContent();saveState();return;}const sf=e.target.closest('[data-scope-filter]')?.dataset.scopeFilter;if(sf){state.scopeKindFilter=sf;saveState();renderScopes();return;}const sc=e.target.closest('[data-scope]')?.dataset.scope;if(sc){selectScope(sc);return;}const tog=e.target.closest('[data-toggle-node]')?.dataset.toggleNode;if(tog){const nodeId=String(tog);if(state.expanded.has(nodeId)){state.expanded.delete(nodeId);}else{state.expanded.add(nodeId);collapseBranchesForNode(nodeId);}renderContent();renderViewbar();renderInspector();return;}const br=e.target.closest('[data-toggle-branch]')?.dataset.toggleBranch;if(br){state.collapsedBranches.has(br)?state.collapsedBranches.delete(br):state.collapsedBranches.add(br);renderContent();renderViewbar();renderInspector();return;}const branch=e.target.closest('[data-branch]')?.dataset.branch;if(branch){selectBranch(branch);return;}const node=e.target.closest('[data-node]')?.dataset.node;if(node){selectNode(node);return;}const inv=e.target.closest('[data-inventory]')?.dataset.inventory;if(inv){state.selectedType='inventory';state.selectedId=inv;document.body.classList.add('inspector-open');renderAll();return;}const rel=e.target.closest('[data-rel]')?.dataset.rel;if(rel){state.selectedType='rel';state.selectedId=rel;document.body.classList.add('inspector-open');renderAll();return;}const diag=e.target.closest('[data-diag]')?.dataset.diag;if(diag){state.selectedType='diag';state.selectedId=diag;document.body.classList.add('inspector-open');renderAll();return;}});
  document.addEventListener('input',e=>{if(e.target.id==='scopeSearch'){closeSearchPopover();state.scopeQuery=e.target.value;renderScopes();}else if(e.target.id==='globalSearch'||e.target.id==='viewSearch'){if(searchDebounceTimer)window.clearTimeout(searchDebounceTimer);searchDebounceTimer=window.setTimeout(()=>applyQueryInput(e.target.value),120);}});
  document.addEventListener('search',e=>{if(e.target.id==='globalSearch'||e.target.id==='viewSearch')applyQueryInput(e.target.value);});
  document.addEventListener('change',e=>{if(e.target.id==='treeFilter')state.treeFilter=e.target.value;renderContent();renderInspector();renderViewbar();});
  document.addEventListener('keydown',e=>{if(state.modal)handleModalFocusTrap(e);const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'');if(typing&&handleSearchPopoverKeydown(e))return;if(e.key==='Escape'){if(state.modal){closeModalRender();return;}closeSearchPopover();document.body.classList.remove('inspector-open');return;}if(!typing&&e.key==='/'){e.preventDefault();$('globalSearch').focus();return;}if(!typing&&e.altKey&&lower(e.key)==='a'){e.preventDefault();handleAction('expand-all');return;}if(!typing&&e.altKey&&lower(e.key)==='d'){e.preventDefault();handleAction('expand-selected-depth');return;}if(!typing&&e.altKey&&lower(e.key)==='p'){e.preventDefault();handleAction('collapse-siblings');return;}if(!typing&&e.altKey&&lower(e.key)==='f'){e.preventDefault();handleAction('clear-focus');return;}if(!typing&&lower(e.key)==='f'){e.preventDefault();handleAction('toggle-rca-focus');return;}if(!typing&&lower(e.key)==='e'){e.preventDefault();openExportBuilder();return;}if(!typing&&lower(e.key)==='r'){e.preventDefault();openReportBuilder();return;}if(!typing&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();moveSelection(e.key==='ArrowDown'?1:-1);return;}if(!typing&&(e.key==='ArrowRight'||e.key==='ArrowLeft'||e.key===' '||e.key==='Enter'||e.key==='Home'||e.key==='End')){handleTreeKey(e);}});
}
function wireTableSelection(){document.addEventListener('click',e=>{const tableName=e.target.closest('[data-table-name]')?.dataset.tableName;if(!tableName)return;state.selectedTableName=tableName;renderContent();saveState();});}
function wireUdfSelection(){document.addEventListener('click',e=>{const udfName=e.target.closest('[data-udf-name]')?.dataset.udfName;if(!udfName)return;state.selectedUdfName=udfName;renderContent();saveState();});}
function focusableRows(){return [...document.querySelectorAll('.tree-row[data-node],.branch-row[data-branch]')];}
function moveSelection(delta){const rows=focusableRows();if(!rows.length)return;let idx=rows.findIndex(r=>(r.dataset.node&&state.selectedId===r.dataset.node)||(r.dataset.branch&&state.selectedId===r.dataset.branch));idx=idx<0?0:Math.max(0,Math.min(rows.length-1,idx+delta));const row=rows[idx];if(row.dataset.node)selectNode(row.dataset.node);else if(row.dataset.branch)selectBranch(row.dataset.branch);row.focus();}
function handleTreeKey(e){const active=document.activeElement;const node=active?.closest?.('[data-node]')?.dataset.node;const branch=active?.closest?.('[data-branch]')?.dataset.branch;if(e.key==='Home'){e.preventDefault();focusableRows()[0]?.focus();return;}if(e.key==='End'){e.preventDefault();const rows=focusableRows();rows[rows.length-1]?.focus();return;}if(e.key==='Enter'){e.preventDefault();if(branch)selectBranch(branch);else if(node)selectNode(node);return;}if(e.key===' '){e.preventDefault();if(branch){state.collapsedBranches.has(branch)?state.collapsedBranches.delete(branch):state.collapsedBranches.add(branch);}else if(node){state.expanded.has(node)?state.expanded.delete(node):(state.expanded.add(node),collapseBranchesForNode(node));}renderContent();renderInspector();return;}if(e.key==='ArrowRight'){e.preventDefault();if(branch)state.collapsedBranches.delete(branch);else if(node){state.expanded.add(node);collapseBranchesForNode(node);}renderContent();renderInspector();return;}if(e.key==='ArrowLeft'){e.preventDefault();if(branch)state.collapsedBranches.add(branch);else if(node)state.expanded.delete(node);renderContent();renderInspector();return;}}
async function init(){
  renderBootLoading();
  try {
    await loadViewerData();
    model=buildModel();
    setBootPhase('ready','Evidence loaded');
  } catch (error) {
    setBootPhase('failed',error&&error.message?error.message:'Unable to load evidence payloads.');
    reportUiError('data load', error);
    renderNoData();
    return;
  }

  return withUiGuard('boot',()=>{if(!model.scopes.length){renderNoData();return;}restoreSnapshotState();if(!model.scopes.some(s=>s.scopeId===state.scopeId))state.scopeId=model.scopes[0].scopeId;seedExpanded(state.scopeId);wire();wireTableSelection();wireUdfSelection();renderAll();});
}

init();
})();

