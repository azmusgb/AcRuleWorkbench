// Runtime feature-detection: bail early with a clear banner if required modern APIs are missing.
(function(){
  const required = [
    typeof window.fetch === 'function',
    typeof window.AbortController === 'function',
    typeof window.Promise === 'function',
    typeof window.URLSearchParams === 'function'
  ];
  const ok = required.every(Boolean);
  if (!ok) {
    try {
      const banner = document.createElement('div');
      banner.id = 'compatibilityBanner';
      banner.setAttribute('role', 'alert');
      banner.style.position = 'fixed';
      banner.style.left = '16px';
      banner.style.right = '16px';
      banner.style.top = '16px';
      banner.style.zIndex = '9999';
      banner.style.padding = '12px 14px';
      banner.style.background = '#fff5f6';
      banner.style.border = '1px solid #f0a0a8';
      banner.style.color = '#8b1e2d';
      banner.style.borderRadius = '8px';
      banner.style.boxShadow = '0 8px 24px rgba(0,0,0,.12)';
      banner.style.fontFamily = 'Inter, system-ui, sans-serif';
      banner.style.fontWeight = '700';
      banner.textContent = 'AC Rule Workbench viewer: this environment is incompatible. Open the viewer in a modern browser or use the Workbench server / WebView2.';
      document.addEventListener('DOMContentLoaded', function(){ document.body.appendChild(banner); });
    } catch (e) {
      // ignore banner creation failures
    }
    throw new Error('AC Rule Workbench viewer: incompatible browser environment - required modern APIs missing.');
  }
})();
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
  // Respect explicit canonical opt-out in query string to avoid unnecessary API probing and console 404 noise.
  const canonicalParam = new URLSearchParams(window.location.search).get('canonical');
  if(canonicalParam && /^(off|false|0|no)$/i.test(canonicalParam)){
    fwdData = null;
    canonicalHydrationState.mode = 'none';
    canonicalHydrationState.failedEndpoints = [];
    return;
  }

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
  async function detectApiBase(){
    for(const base of baseCandidates){
      try{
        const slash=base.endsWith('/')?'':'/';
        const controller=new AbortController();
        const timeoutId=window.setTimeout(()=>controller.abort(),3000);
        const response=await fetch(`${base}${slash}status`,{cache:'no-store',signal:controller.signal});
        window.clearTimeout(timeoutId);
        if(response.ok)return base;
      }catch{
        // Keep probing candidate bases.
      }
    }
    return null;
  }
  const apiBase=await detectApiBase();
  if(!apiBase){
    fwdData=null;
    canonicalHydrationState.mode='none';
    canonicalHydrationState.failedEndpoints=[];
    return;
  }
  async function fetchApi(path){
    try{
      const slash=apiBase.endsWith('/')?'':'/';
      const withMode=`${apiBase}${slash}${path}?snapshotMode=${snapshotMode}`;
      const controller=new AbortController();
      const timeoutId=window.setTimeout(()=>controller.abort(),timeoutMs);
      const response=await fetch(withMode,{cache:'no-store',signal:controller.signal});
      window.clearTimeout(timeoutId);
      if(!response.ok) return {ok:false,data:null};
      const payload=await response.json();
      if(payload&&payload.ok===true&&payload.data!==undefined) return {ok:true,data:payload.data};
    }catch{
      // No-op; caller handles as unavailable.
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
const uiBuild=document.documentElement.dataset.uiBuild||'default';
const themeStorageKey=`ac-rule-workbench-theme:${uiBuild}`;
const inspectorSections=['summary','route','branches','parameters','references','diagnostics','evidence','raw'];
const list=x=>Array.isArray(x)?x:(x==null?[]:[x]);
const first=(...xs)=>xs.find(x=>x!==undefined&&x!==null&&String(x).length>0);
function cleanText(value){
  return String(value??'')
    .replace(/Â·/g,'-')
    .replace(/\u00c2/g,'')
    .replace(/\s+-\s+/g,' - ');
}
const text=x=>cleanText(x);
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
    focusNodeId:'',theme:readStorage(themeStorageKey)||'dark',density:saved.density==='high'?'high':'standard',modal:'',
    selectedResourceKey:saved.selectedResourceKey||'',
    selectedDriverKey:saved.selectedDriverKey||'',
    selectedTableName:saved.selectedTableName||'',
    selectedUdfName:saved.selectedUdfName||'',
    udfFilter:['all','with-callers','canonical','unparsed','relationship-only'].includes(saved.udfFilter)?saved.udfFilter:'with-callers',
    recentScopes:Array.isArray(saved.recentScopes)?saved.recentScopes:[],searchActiveIndex:-1,inspectorOpen:saved.inspectorOpen===true,consoleView:['activity','warnings','errors','exports','raw'].includes(saved.consoleView)?saved.consoleView:'activity'
  };
}
const state=readState();document.documentElement.dataset.theme=state.theme;
if(state.inspectorOpen)document.body.classList.add('inspector-open');
let toastTimer=0;
let searchDebounceTimer=0;
let modalPreviouslyFocusedEl=null;
let scopeFieldResolutionCache=new Map();
const canonicalHydrationState={mode:'none',failedEndpoints:[]};
const checklistDismissedKey='ac-rule-workbench-onboarding-dismissed';
const checklistCollapsedKey='ac-rule-workbench-onboarding-collapsed';
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
// Keep global actions and onboarding controls aligned with actual evidence-selection state.
function hasEvidenceSelection(){
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
  const hasSelection=loaded&&hasEvidenceSelection();
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
      button.title=hasSelection?button.dataset.enabledTitle:(button.dataset.disabledTitle||'Select evidence first.');
      button.setAttribute('aria-disabled',hasSelection?'false':'true');
    }
  });
  setButtonAvailability('copyEvidenceBtn',hasSelection,'Select evidence before copying.');
}
function announceContentStatus(message){
  const node=optionalElement('contentStatus');
  if(node)node.textContent=text(message);
}
function syncOnboardingChecklist(){
  const checklist=optionalElement('onboardingChecklist');
  const toggleBtn=optionalElement('toggleChecklistBtn');
  if(!checklist||!toggleBtn)return;
  const loadedWithScope=bootState.phase==='ready'&&!!currentScope();
  const dismissed=readStorage(checklistDismissedKey)==='true'||loadedWithScope;
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
function disabledOf(x,source='unknown'){const raw=lower(first(x.DisabledState,x.disabledState,''));if(!raw||raw==='enabled'||raw==='false'||raw==='0')return 'none';if(raw.includes('possibledisabledsequenceonly')||raw.includes('sequenceonly')||raw.includes('possiblydisabledinherited'))return source==='structural'?'none':'possible';if(raw.includes('inherited'))return 'inherited';if(raw.includes('direct')||raw==='disabled'||raw==='true'||raw==='1')return 'direct';return 'none';}
function paramText(p){if(!p)return'';if(typeof p==='string')return p;if(typeof p!=='object')return text(p);return Object.keys(p).map(k=>`${k}:${list(p[k]).map(text).join('|')}`).join(' ')}
function actionNamesOf(n){return list(first(n.ActionNames,n.actionNames,[])).map(text).filter(Boolean)}
function routeName(e){const name=first(e.ActionName,e.actionName,e.Label,e.label);if(name)return text(name);if(String(first(e.EdgeKind,e.relationship,''))==='RootListEntry'||Number(first(e.ActionListIndex,-1))<0)return 'Root';const idx=first(e.ActionListIndex,e.actionListIndex);return idx===undefined?'Unresolved route':`action ${idx}`;}
function routeState(e){if(!e)return 'Root';const kind=text(first(e.EdgeKind,e.kind,e.relationship,''));const idx=Number(first(e.ActionListIndex,e.actionListIndex,-1));if(kind==='RootListEntry'||idx<0)return 'Root';if(first(e.ActionNameResolved,e.actionNameResolved,false)===true||!!first(e.ActionName,e.actionName,null))return 'Resolved';return idx>=0?'IndexOnly':'Unresolved';}
function routeResolved(e){const st=routeState(e);return st==='Root'||st==='Resolved';}
function ruleKeyParts(x){return [scopeIdOf(x),first(x.RuleGuid,x.ruleGuid,''),first(x.RuleId,x.ruleId,''),titleOf(x),fnOf(x),first(x.RuleIndexWithinScope,x.RuleIndex,'')].map(text).join('|').toLowerCase();}
function scopedGuidKey(x){const guid=first(x.RuleGuid,x.ruleGuid,'');return guid?`${scopeIdOf(x)}|${guid}`.toLowerCase():'';}
function scopedNameFunctionKey(x){const name=titleOf(x),fn=fnOf(x);return name&&fn?`${scopeIdOf(x)}|${name}|${fn}`.toLowerCase():'';}
function addIndex(map,key,id){if(!key)return;if(!map.has(key))map.set(key,[]);map.get(key).push(id);}
function correlationMatch(x,exact,guid,nameFn){const exactHits=exact.get(ruleKeyParts(x))||[];if(exactHits.length===1)return {nodeId:exactHits[0],status:'Exact',confidence:'Authoritative',accepted:true,candidateCount:1};if(exactHits.length>1)return {nodeId:'',status:'AmbiguousExact',confidence:'Unsafe',accepted:false,candidateCount:exactHits.length};const guidHits=guid.get(scopedGuidKey(x))||[];if(guidHits.length===1)return {nodeId:guidHits[0],status:'UniqueGuid',confidence:'Strong',accepted:true,candidateCount:1};if(guidHits.length>1)return {nodeId:'',status:'AmbiguousGuid',confidence:'Unsafe',accepted:false,candidateCount:guidHits.length};const nameFnHits=nameFn.get(scopedNameFunctionKey(x))||[];if(nameFnHits.length===1)return {nodeId:'',status:'UniqueNameFunction',confidence:'Weak',accepted:false,candidateCount:1};if(nameFnHits.length>1)return {nodeId:'',status:'AmbiguousNameFunction',confidence:'Unsafe',accepted:false,candidateCount:nameFnHits.length};return {nodeId:'',status:'None',confidence:'None',accepted:false,candidateCount:0};}
function correlationNodeId(x,exact,guid,nameFn){return correlationMatch(x,exact,guid,nameFn).nodeId||'';}
/** Build the normalized client-side indexes used by the tree, inspector, search, and exports. */
function buildModel(){
  const scopes=new Map();
  const upsertScope=x=>{const id=scopeIdOf(x);const current=scopes.get(id)||{scopeId:id,name:scopeNameOf(x),kind:scopeKindOf(x),structural:0,inventory:0,flatOnly:0,refs:0,diags:0,directDisabled:0,inheritedDisabled:0,warnings:0};current.name=current.name||scopeNameOf(x);current.kind=current.kind||scopeKindOf(x);scopes.set(id,current);return current;};
  list(treeData.Scopes).forEach(s=>{ upsertScope(s); });
  const nodes=list(treeData.Nodes).map((n,i)=>{const id=text(first(n.NodeId,n.nodeId,`synthetic-${i}`));const scope=upsertScope(n);const disabled=disabledOf(n,'structural');if(n.IsRuleNode)scope.structural++;if(disabled==='direct')scope.directDisabled++;if(disabled==='inherited')scope.inheritedDisabled++;return {...n,id,scopeId:scopeIdOf(n),title:titleOf(n),fn:fnOf(n),depth:Number(first(n.HierarchyLevel,n.depth,0))||0,disabled,isRule:!!n.IsRuleNode,isSection:!n.IsRuleNode||!fnOf(n)||/^\*{4,}$/.test(titleOf(n))||/read this comment/i.test(titleOf(n)),searchBlob:''};});
  const nodesById=new Map(nodes.map(n=>[n.id,n]));
  nodes.forEach(n=>{n.searchBlob=[n.title,n.fn,n.RuleGuid,n.RuleId,n.ScopePath,n.Description,paramText(n.Parameters),actionNamesOf(n).join(' ')].join(' ').toLowerCase();});
  const edges=list(treeData.Edges).map((e,i)=>({...e,id:`edge-${i}`,from:text(first(e.FromNodeId,e.fromNodeId,e.From,e.from,'')),to:text(first(e.ToNodeId,e.toNodeId,e.To,e.to,'')),scopeId:scopeIdOf(e),kind:text(first(e.EdgeKind,e.kind,e.relationship,'Edge')),label:routeName(e),routeState:routeState(e),resolved:routeResolved(e)}));
  const childrenByParent=new Map(),parentByChild=new Map(),incomingByChild=new Map(),edgesByParent=new Map();
  edges.forEach(e=>{if(!e.from||!e.to)return;if(!childrenByParent.has(e.from))childrenByParent.set(e.from,[]);childrenByParent.get(e.from).push(e.to);parentByChild.set(e.to,e.from);incomingByChild.set(e.to,e);if(!edgesByParent.has(e.from))edgesByParent.set(e.from,[]);edgesByParent.get(e.from).push(e);});
  const rootsByScope=new Map();
  nodes.forEach(n=>{const parent=text(first(n.ParentNodeId,''));const isRoot=!parentByChild.has(n.id)||parent==='-1'||parent===''||!nodesById.has(parentByChild.get(n.id));if(isRoot){if(!rootsByScope.has(n.scopeId))rootsByScope.set(n.scopeId,[]);rootsByScope.get(n.scopeId).push(n.id);}});
  const structuralByKey=new Map(),structuralByGuid=new Map(),structuralByNameFn=new Map();
  nodes.forEach(n=>{addIndex(structuralByKey,ruleKeyParts(n),n.id);addIndex(structuralByGuid,scopedGuidKey(n),n.id);addIndex(structuralByNameFn,scopedNameFunctionKey(n),n.id);});
  const inventory=list(rulesData.Rules).map((r,i)=>{const scope=upsertScope(r);const match=correlationMatch(r,structuralByKey,structuralByGuid,structuralByNameFn);const nodeId=match.nodeId;const structuralNode=nodeId?nodesById.get(String(nodeId)):null;const flatDisabled=disabledOf(r,'flat');const disabled=structuralNode?structuralNode.disabled:flatDisabled;const row={...r,id:`flat-${i}`,scopeId:scopeIdOf(r),title:titleOf(r),fn:fnOf(r),flatDisabled,disabled,disabledAuthority:structuralNode?'Structural':'FlatInventoryAudit',correlationStatus:match.status,correlationConfidence:match.confidence,correlationCandidateCount:match.candidateCount,nodeId,classification:nodeId?'StructuralMatch':(match.status==='None'?'FlatOnly':'UnacceptedCorrelation'),searchBlob:''};row.searchBlob=[row.title,row.fn,row.RuleGuid,row.RuleId,row.ScopePath,row.classification,row.correlationStatus,row.correlationConfidence,paramText(row.Parameters),flatDisabled,disabled].join(' ').toLowerCase();scope.inventory++;if(!nodeId)scope.flatOnly++;if(/^Ambiguous/i.test(match.status))scope.warnings++;return row;});
  const rels=list(first(relData.Relationships,relData.Edges,[])).map((r,i)=>{const match=correlationMatch(r,structuralByKey,structuralByGuid,structuralByNameFn);const nodeId=match.accepted?match.nodeId:'';const row={...r,id:`rel-${i}`,scopeId:scopeIdOf(r),nodeId,correlationStatus:match.status,correlationConfidence:match.confidence,kind:text(first(r.Kind,r.EdgeKind,'Reference')),targetType:text(first(r.TargetType,'Unknown')),target:text(first(r.Target,'')),confidence:text(first(r.Confidence,'Medium')),searchBlob:''};row.searchBlob=[row.kind,row.targetType,row.target,row.confidence,row.ScopePath,row.RuleName,row.FunctionName,row.correlationStatus,row.correlationConfidence].join(' ').toLowerCase();const scope=upsertScope(row);scope.refs++;if(/^Ambiguous/i.test(match.status))scope.warnings++;return row;});
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
function scopeEvidenceStripHtml(){const s=currentScope(),stats=scopedRouteStats();const totalNonRoot=Math.max(1,stats.nonRoot);const decodedPct=Math.round((stats.resolved/totalNonRoot)*100);return `<div class="trust-strip" aria-label="Scope evidence health"><div class="trust-item info"><b>Scope evidence</b><span>${esc(s.kind||'Scope')}</span></div><div class="trust-item good"><b>Structure</b><span>${fmt(scopedRuleNodes().length)} rules</span></div><div class="trust-item ${stats.indexOnly||stats.unresolved?'warn':'good'}"><b>Route labels</b><span>${fmt(stats.resolved)} resolved / ${fmt(stats.indexOnly+stats.unresolved)} unresolved</span></div><div class="trust-item ${s.warnings?'warn':'good'}"><b>Diagnostics</b><span>${s.warnings?fmt(s.warnings):'None'}</span></div><div class="trust-item warn"><b>Flow</b><span>Experimental</span></div></div><div class="caption caption-block">Route-label coverage: ${decodedPct}% of non-root structural edges have resolved parent action names. ac-flow.json remains low-confidence triage, not runtime proof.</div>`;}
function selectedNode(){return state.selectedType==='node'?model.nodesById.get(String(state.selectedId)):null;}
function selectedInventory(){return state.selectedType==='inventory'?model.inventory.find(x=>x.id===state.selectedId):null;}
function selectedRel(){return state.selectedType==='rel'?model.rels.find(x=>x.id===state.selectedId):null;}
function selectedDiag(){return state.selectedType==='diag'?model.diags.find(x=>x.id===state.selectedId):null;}
function renderMainHead(){
  const s=currentScope();
  const isDocOrPage=/^(document|page)$/i.test(text(s.kind));
  const globalViews=new Set(['resources','tables','drivers','udfs']);
  const isGlobalView=globalViews.has(state.workspaceView);
  const globalTitles={resources:'Global Resources',tables:'Global Tables',drivers:'Global Input Drivers',udfs:'Global UDFs'};
  const kicker=document.querySelector('.scope-kicker');
  if(kicker)kicker.textContent=isGlobalView?'Global catalog':'Current scope';
  $('scopeTitle').textContent=isGlobalView?globalTitles[state.workspaceView]:s.name;
  const hydration=canonicalHydrationSummary();
  const captions={
    structure:isDocOrPage?'Structure map':'Structural hierarchy and route map',
    inspect:'Selected object evidence, route, diagnostics, and raw extraction details',
    'field-resolution':'Scope-level unresolved/resolved field matching against canonical field metadata',
    resources:'Global resource definitions catalog',
    tables:'Global table definitions catalog',
    drivers:'Global input/output driver definitions catalog',
    udfs:'Global UDF/function definitions catalog',
    audit:'Diagnostics, provenance, unresolved routes, ambiguous correlation, and extraction audit'
  };
  $('scopeCaption').innerHTML=`<span class="scope-caption-note">${esc(captions[state.workspaceView]||captions.structure)}</span>`;
  $('crumbs').innerHTML=isGlobalView
    ? `<span class="head-chip kind">Global definitions</span>`
    : (state.workspaceView==='structure'&&isDocOrPage)
    ? `<span class="head-chip kind">${esc(s.kind)}</span><span class="head-chip ${hydration.level==='warn'?'warn':''}">${esc(hydration.label)}</span>${state.focusNodeId?'<span class="head-chip focus">Focused subtree</span>':''}`
    : `<span class="head-chip kind">${esc(s.kind)}</span><span class="head-chip">Structure-first view</span><span class="head-chip ${hydration.level==='warn'?'warn':''}">${esc(hydration.label)}</span>${state.focusNodeId?'<span class="head-chip focus">Focused subtree</span>':''}`;
  $('tabs').innerHTML='';
  renderViewbar();
}
function renderContent(){
  if(state.workspaceView==='inspect')return renderInspectionWorkspace();
  if(state.workspaceView==='field-resolution')return renderFieldResolutionTriage();
  if(state.workspaceView==='resources')return renderGlobalResourceDefinitions();
  if(state.workspaceView==='tables')return renderGlobalTablesMasterDetail();
  if(state.workspaceView==='drivers')return renderGlobalDriverDefinitions();
  if(state.workspaceView==='udfs')return renderUdfMasterDetail();
  if(state.workspaceView==='audit')return renderAuditWorkspace();
  return renderStructure();
}
function renderOverview(){const rules=scopedRuleNodes(),refs=scopedRels(),diags=scopedDiags();const f=topCounts(rules.map(n=>n.fn).filter(Boolean));const actions=topCounts(rules.flatMap(n=>actionNamesOf(n)));const rs=scopedRouteStats();$('content').innerHTML=`${scopeEvidenceStripHtml()}<div class="notice"><div class="notice-icon">i</div><div><b>Evidence discipline:</b> Structure proves hierarchy, parent action labels, branch order, and disabled inheritance. Inventory proves broad extraction coverage. References are static confidence-coded relationships. Flow projections are experimental / low-confidence and are not runtime traces.</div></div><div class="metric-grid"><div class="metric good"><b>${fmt(rules.length)}</b><span>Structural rules</span></div><div class="metric"><b>${fmt(refs.length)}</b><span>References</span></div><div class="metric ${diags.length?'warn':''}"><b>${fmt(diags.length)}</b><span>Diagnostics</span></div></div><div class="grid-2"><div class="panel"><h3>Top functions</h3>${bars(f)}</div><div class="panel"><h3>Top action labels</h3>${bars(actions)}</div></div><div class="panel"><h3>Route-label resolution</h3><div class="metric-grid"><div class="metric good"><b>${fmt(rs.resolved)}</b><span>Resolved non-root routes</span></div><div class="metric ${rs.indexOnly?'warn':''}"><b>${fmt(rs.indexOnly)}</b><span>Index-only routes</span></div><div class="metric"><b>${fmt(rs.root)}</b><span>Root entries</span></div><div class="metric warn"><b>Low</b><span>Flow confidence</span></div></div></div><div class="grid-3"><button class="quick-card" data-action="go-structure"><b>Inspect hierarchy</b><span>Open structural tree with action-route chips.</span></button><button class="quick-card" data-action="show-diagnostics"><b>Review diagnostics</b><span>Check parser/extractor risk before analysis.</span></button></div>`;}
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
function visibleStructureRows(){const roots=state.focusNodeId?[String(state.focusNodeId)]:(model.rootsByScope.get(state.scopeId)||[]).map(String);const rows=[];const filtered=!!text(state.query).trim()||state.treeFilter!=='all';function walk(id,level){const n=model.nodesById.get(String(id));if(!n||n.scopeId!==state.scopeId)return;const include=filtered?treeHasMatch(id):true;const selfOk=passesTreeFilter(n)&&hasVisibleQuery(n);if(include)rows.push({type:'node',n,level,visible:selfOk||!filtered,context:filtered&&!selfOk});const expanded=filtered||state.expanded.has(id)||id===state.focusNodeId;if(!expanded)return;const groups=childRouteGroups(id).map(g=>({...g,childIds:g.childIds.filter(cid=>!filtered||treeHasMatch(cid))})).filter(g=>g.childIds.length>0);const groupedChildIds=new Set(groups.flatMap(g=>g.childIds));if(groups.length){groups.forEach(g=>{const key=branchKey(id,g);const open=filtered||!state.collapsedBranches.has(key);rows.push({type:'branch',parent:n,group:g,key,open,level:level+1});if(open)g.childIds.forEach(c=>walk(c,level+2));});childIds(id).filter(c=>!groupedChildIds.has(String(c))).forEach(c=>{if(!filtered||treeHasMatch(c))walk(c,level+1);});}else{childIds(id).forEach(c=>walk(c,level+1));}}
roots.forEach(r=>walk(r,0));return rows;}
function visibleTreeNodes(){return visibleStructureRows().filter(r=>r.type==='node');}
function routeChip(e){if(!e)return '<span class="route-chip root">root</span>';if(e.kind==='RootListEntry'||e.label==='Root'||e.routeState==='Root')return '<span class="route-chip root" title="Root list entry">root list</span>';const cls=e.resolved?'resolved':'unresolved';const title=e.resolved?'Incoming parent action label resolved':'Incoming action index is present, but the action label was not resolved';return `<span class="route-chip ${cls}" title="${esc(title)}"><span class="route-prefix">via</span> ${esc(e.label)}</span>`;}
function filteredInventory(){return scopedInventory().filter(r=>{if(!hasVisibleQuery(r))return false;if(state.inventoryFilter==='StructuralMatch')return r.classification==='StructuralMatch';if(state.inventoryFilter==='FlatOnly')return r.classification==='FlatOnly';if(state.inventoryFilter==='direct')return r.disabled==='direct';if(state.inventoryFilter==='inherited')return r.disabled==='inherited';return true;});}
function inventoryClassBadge(r){if(r.classification==='StructuralMatch')return '<span class="badge green">StructuralMatch</span>';if(r.classification==='UnacceptedCorrelation')return `<span class="badge amber" title="${esc(r.correlationStatus||'Weak/ambiguous')} correlation was not accepted">Unaccepted</span>`;return '<span class="badge amber">Flat-only</span>'; }
function renderInventory(){const rows=filteredInventory();$('content').innerHTML=`<div class="notice"><div class="notice-icon">!</div><div><b>Inventory is not execution order.</b> Flat rows are search/completeness evidence. Only accepted exact or unique-GUID correlations link to the structural hierarchy; name/function and ambiguous matches stay unaccepted.</div></div><div class="table-list">${rows.slice(0,5000).map(r=>`<div class="data-row ${state.selectedId===r.id?'selected':''}" data-inventory="${esc(r.id)}"><div><div class="data-title">${esc(r.title)}</div><div class="data-sub">${esc(r.scopeId)}  -  ${esc(r.RuleGuid||r.RuleId||'no id')}  -  ${esc(r.correlationStatus||'None')}</div></div><div class="mono">${esc(r.fn||'no function')}</div><div>${inventoryClassBadge(r)}</div><div>${r.nodeId?'<span class="badge blue">Linked</span>':`<span class="badge ${/^Ambiguous/i.test(r.correlationStatus||'')?'amber':'blue'}">${esc(r.correlationConfidence||'None')}</span>`}</div></div>`).join('')||emptyHtml('No inventory rows match','Adjust search or filter.')}</div>${rows.length>5000?'<div class="notice"><div class="notice-icon">i</div><div>Showing first 5,000 matching inventory rows for browser performance. Export for the full scope.</div></div>':''}`;}
function filteredRefs(){return scopedRels().filter(r=>{if(!hasVisibleQuery(r))return false;const k=lower(r.kind),t=lower(r.targetType),c=lower(r.confidence),runtime=/true|yes|runtime/.test(lower(first(r.RuntimeDependency,r.IsRuntimeDependency,'')));if(state.referenceFilter==='high')return c==='high';if(state.referenceFilter==='runtime')return runtime;if(state.referenceFilter==='field')return t.includes('field')||k.includes('field');if(state.referenceFilter==='table')return t.includes('table')||t.includes('resource')||k.includes('table')||k.includes('source');if(state.referenceFilter==='write')return k.includes('write')||k.includes('mutate')||k.includes('reject');return true;});}
function renderReferences(){const rows=filteredRefs();$('content').innerHTML=`<div class="table-list">${rows.slice(0,5000).map(r=>`<div class="data-row compact ${state.selectedId===r.id?'selected':''}" data-rel="${esc(r.id)}"><div><div class="data-title">${esc(r.kind)} -> ${esc(r.target||'(empty)')}</div><div class="data-sub">${esc(r.RuleName||r.SourceRuleName||r.scopeId)}  -  ${esc(r.fn||r.FunctionName||'')}</div></div><div>${badgeConfidence(r.confidence)}</div><div><span class="badge ${r.nodeId?'blue':'amber'}">${r.nodeId?'Structural link':'Flat/heuristic'}</span></div><div class="mono">${esc(r.targetType)}</div></div>`).join('')||emptyHtml('No references match','Adjust search or filter.')}</div>${rows.length>5000?'<div class="notice"><div class="notice-icon">i</div><div>Showing first 5,000 references. Export for the full scope.</div></div>':''}`;}
function badgeConfidence(c){const l=lower(c);const cls=l==='high'?'green':l==='low'?'amber':'blue';return `<span class="badge ${cls}">${esc(c||'Medium')}</span>`;}
function filteredDiags(){return scopedDiags().filter(d=>{if(!hasVisibleQuery(d))return false;const sev=lower(d.severity);if(state.diagnosticFilter==='warning')return /warn|error/.test(sev);if(state.diagnosticFilter==='info')return sev==='info';if(state.diagnosticFilter==='linked')return !!d.nodeId;return true;});}
function renderDiagnostics(){const rows=filteredDiags();$('content').innerHTML=`<div class="table-list">${rows.map(d=>`<div class="data-row ${state.selectedId===d.id?'selected':''}" data-diag="${esc(d.id)}"><div><div class="data-title">${esc(d.title)}</div><div class="data-sub">${esc(d.detail||d.Message||'')}</div></div><div><span class="badge ${/warn|error/i.test(d.severity)?'amber':'blue'}">${esc(d.severity)}</span></div><div>${d.nodeId?`<span class="badge blue">Node ${esc(d.nodeId)}</span>`:''}</div><div></div></div>`).join('')||emptyHtml('No diagnostics match','This scope has no diagnostics matching the filter.')}</div>`;}
function renderAuditWorkspace(){
  const s=currentScope(),stats=scopedRouteStats(),diags=scopedDiags(),refs=scopedRels(),inv=scopedInventory();
  const unresolvedRoutes=stats.indexOnly+stats.unresolved;
  const diagRows=diags.length?diags.slice(0,200).map(d=>`<div class="data-row compact ${state.selectedId===d.id?'selected':''}" data-diag="${esc(d.id)}"><div><div class="data-title">${esc(d.title)}</div><div class="data-sub">${esc(d.detail||d.Message||'')}</div></div><span class="badge ${/warn|error/i.test(d.severity)?'amber':'blue'}">${esc(d.severity)}</span><span class="mono">${esc(d.scopeId||'Unscoped')}</span></div>`).join(''):'<div class="muted">No diagnostics for this scope.</div>';
  const refRows=refs.length?refs.slice(0,200).map(r=>`<div class="data-row compact" data-rel="${esc(r.id)}"><div><div class="data-title">${esc(r.kind)} -> ${esc(r.target||'(empty)')}</div><div class="data-sub">${esc(r.targetType)}  -  ${esc(r.fn||r.FunctionName||'')}</div></div>${badgeConfidence(r.confidence)}<span class="badge ${r.nodeId?'blue':'amber'}">${r.nodeId?'linked':'unlinked'}</span></div>`).join(''):'<div class="muted">No references for this scope.</div>';
  $('content').innerHTML=`<section class="tables-workbench"><div class="notice"><div class="notice-icon">i</div><div><b>Audit workspace.</b> Provenance, diagnostics, references, and route-label coverage live here so the main rule workbench stays focused.</div></div><div class="metric-grid"><div class="metric good"><b>${fmt(scopedRuleNodes().length)}</b><span>Structural rules</span></div><div class="metric ${unresolvedRoutes?'warn':'good'}"><b>${fmt(unresolvedRoutes)}</b><span>Unresolved routes</span></div><div class="metric ${diags.length?'warn':'good'}"><b>${fmt(diags.length)}</b><span>Diagnostics</span></div></div><div class="grid-2"><div class="panel"><h3>Route Coverage</h3>${scopeEvidenceStripHtml()}</div><div class="panel"><h3>Scope Audit Summary</h3><div class="kv">${kv('Scope ID',esc(s.scopeId))}${kv('Kind',esc(s.kind))}${kv('Inventory rows',fmt(inv.length))}${kv('References',fmt(refs.length))}${kv('Flow edges',fmt(model.flowEdges.filter(e=>e.scopeId===s.scopeId).length))}${kv('Snapshot',esc(snapshotId()))}</div></div></div><div class="panel"><h3>Diagnostics</h3>${diagRows}</div><div class="panel"><h3>References</h3>${refRows}</div></section>`;
}
function renderMap(){const fields=topCounts(scopedRels().filter(r=>/field/i.test(r.targetType)||/field/i.test(r.kind)).map(r=>r.target));const funcs=topCounts(scopedRuleNodes().map(n=>n.fn).filter(Boolean));const routes=topCounts(scopedRuleNodes().flatMap(n=>actionNamesOf(n)));$('content').innerHTML=`<div class="notice"><div class="notice-icon">i</div><div><b>Scope map:</b> A compact semantic index across functions, fields, and action labels. It helps triage where to drill into the structural tree. Flow data, when present, remains experimental / low-confidence.</div></div><div class="grid-3"><div class="panel"><h3>Functions</h3>${bars(funcs)}</div><div class="panel"><h3>Fields / targets</h3>${bars(fields)}</div><div class="panel"><h3>Action labels</h3>${bars(routes)}</div></div>`;}
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
    rows.push({kind:'Reference',rel:r,node,scopeId:text(r.scopeId||node?.scopeId||'Unscoped'),ruleName:text(r.RuleName||r.SourceRuleName||node?.title||r.target||'Reference'),functionName:text(r.fn||r.FunctionName||node?.fn||''),target:text(r.target||''),targetType:text(r.targetType||''),relationshipKind:text(r.kind||''),confidence:text(r.confidence||'')});
  });
  return rows.sort((a,b)=>a.scopeId.localeCompare(b.scopeId,undefined,{sensitivity:'base'})||a.ruleName.localeCompare(b.ruleName,undefined,{sensitivity:'base'}));
}

function resourceNameFromItem(item){
  if(typeof item==='string')return item;
  return text(first(item?.name,item?.Name,item?.value,item?.Value,''));
}

function buildGlobalResourceDefinitions(){
  const canonicalBuckets=list(model.fwd?.resources?.buckets);
  if(canonicalBuckets.length){
    const resourceNameSet=new Set();
    canonicalBuckets.forEach(bucket=>list(bucket.names).forEach(item=>{
      const name=resourceNameFromItem(item).toLowerCase();
      if(name)resourceNameSet.add(name);
    }));
    const usageByTarget=new Map();
    usageRowsForDefinition(r=>resourceNameSet.has(text(r.target).toLowerCase())).forEach(row=>{
      const key=text(row.target).toLowerCase();
      if(!key)return;
      if(!usageByTarget.has(key))usageByTarget.set(key,[]);
      usageByTarget.get(key).push(row);
    });
    return canonicalBuckets.flatMap(bucket=>{
      const type=text(bucket.type||'Resource');
      return list(bucket.names).map(item=>{
        const name=resourceNameFromItem(item);
        const usage=usageByTarget.get(name.toLowerCase())||[];
        const usedBy=list(first(item?.usedBy,item?.usedByRules,[])).map(text).filter(Boolean);
        return {key:`${type}|${name}`,name,type,source:'Canonical FWD resource',canonical:true,count:Number(first(item?.usedByRuleCount,item?.count,usage.length,0))||0,details:first(item?.details,item?.Details,null),usedBy,usage};
      }).filter(r=>r.name);
    }).sort((a,b)=>a.type.localeCompare(b.type,undefined,{sensitivity:'base'})||a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
  }
  const grouped=new Map();
  usageRowsForDefinition(r=>{
    const t=lower(r.targetType),k=lower(r.kind),target=lower(r.target);
    if(t==='field'||t==='rule')return false;
    return /source|option|parameter|attribute|reject/.test(t)||/source|option|parameter|attribute|reject/.test(k)||/resource|fileref|inventory/.test(target);
  }).forEach(row=>{
    const type=row.targetType||row.relationshipKind||'Resource';
    const name=row.target||'(empty)';
    const key=`${type}|${name}`;
    if(!grouped.has(key))grouped.set(key,{key,name,type,source:'Relationship evidence',canonical:false,count:0,details:null,usedBy:[],usage:[]});
    const current=grouped.get(key);
    current.count+=1;
    current.usage.push(row);
  });
  return [...grouped.values()].sort((a,b)=>(b.count-a.count)||a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
}

function buildGlobalDriverDefinitions(){
  const canonicalItems=list(model.fwd?.processDrivers?.items);
  if(canonicalItems.length){
    return canonicalItems.map(item=>{
      const name=text(item.processName||item.name||'Process driver');
      const findings=list(item.findings).map((f,i)=>({kind:'Finding',scopeId:text(f.path||f.Path||name),ruleName:text(f.name||f.Name||`Finding ${i+1}`),functionName:'',target:text(first(f.valuePreview,f.dataPreview,'')),targetType:text(item.classification||'DriverLikePrivateNode'),relationshipKind:text(f.source||item.source||''),confidence:text(f.confidence||'Medium'),node:null}));
      const usage=usageRowsForDefinition(r=>/driver|twain|scan|ocr|fip|store|output|input/i.test(`${r.targetType} ${r.kind} ${r.target}`)&&lower(`${r.target} ${r.kind} ${r.targetType}`).includes(name.toLowerCase()));
      return {key:name,name,type:text(item.classification||'Process driver'),source:text(item.source||'Canonical process config'),canonical:true,parsed:!!item.parsedDriverConfig,count:Number(first(item.findingCount,findings.length,usage.length,0))||0,details:item,usage:[...findings,...usage]};
    }).sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
  }
  const grouped=new Map();
  usageRowsForDefinition(r=>/driver|twain|scan|ocr|fip|store|output|input/i.test(`${r.targetType} ${r.kind} ${r.target}`)).forEach(row=>{
    const name=row.target||`${row.relationshipKind} -> ${row.targetType}`||'Driver evidence';
    const key=name;
    if(!grouped.has(key))grouped.set(key,{key,name,type:'Driver evidence',source:'Relationship evidence',canonical:false,parsed:false,count:0,details:null,usage:[]});
    const current=grouped.get(key);
    current.count+=1;
    current.usage.push(row);
  });
  return [...grouped.values()].sort((a,b)=>(b.count-a.count)||a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
}

function parameterSnapshotHtml(node){
  const entries=Object.entries(node?.Parameters||{}).slice(0,10);
  if(!entries.length)return '<div class="muted">No parameters extracted for this rule.</div>';
  return `<div class="kv global-param-snapshot">${entries.map(([k,v])=>kv(k,esc(list(v).join(', ')))).join('')}</div>`;
}

function usageHierarchyHtml(usages,emptyLabel='No usage evidence was mapped for this definition.'){
  const rows=list(usages);
  if(!rows.length)return `<div class="muted">${esc(emptyLabel)}</div>`;
  const byScope=new Map();
  rows.forEach(row=>{
    const key=text(row.scopeId||'Unscoped');
    if(!byScope.has(key))byScope.set(key,[]);
    byScope.get(key).push(row);
  });
  return [...byScope.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'})).map(([scopeId,items])=>`
    <details class="global-usage-scope" open>
      <summary><span>${esc(scopeId)}</span><span class="section-count">${fmt(items.length)} references</span></summary>
      <div class="global-usage-body">
        ${items.slice(0,60).map(row=>{
          const node=row.node;
          const preview=row.target?`<div class="definition-preview">${esc(row.target).slice(0,420)}</div>`:'';
          return `<div class="global-usage-card">
            <div class="global-usage-head">
              <div><b>${esc(node?.title||row.ruleName)}</b><span>${esc(row.functionName||row.relationshipKind||row.targetType||'Evidence')}</span></div>
              ${node?`<button class="btn ghost" type="button" data-node="${esc(node.id)}">Open in tree</button>`:`<span class="badge amber">Evidence only</span>`}
            </div>
            <div class="table-def-grid compact">
              <div class="table-def-item"><span class="k">Kind</span><span class="v">${esc(row.relationshipKind||row.kind)}</span></div>
              <div class="table-def-item"><span class="k">Target type</span><span class="v">${esc(row.targetType)}</span></div>
              <div class="table-def-item"><span class="k">Confidence</span><span class="v">${esc(row.confidence||'Not provided')}</span></div>
            </div>
            ${node?`<div class="table-columns-head">Hierarchy route</div>${routePathHtml(node)}<div class="table-columns-head">Rule parameters</div>${parameterSnapshotHtml(node)}`:preview}
          </div>`;
        }).join('')}
        ${items.length>60?`<div class="caption">Showing first 60 references in this scope out of ${fmt(items.length)}.</div>`:''}
      </div>
    </details>`).join('');
}

function renderGlobalDefinitionWorkbench(kind,rows,selectedKey,stateKey,copy){
  if(!rows.length){
    $('content').innerHTML=`<section class="tables-workbench global-def-workbench"><div class="notice"><div class="notice-icon">i</div><div><b>${esc(copy.title)}.</b> ${esc(copy.emptyNotice)}</div></div>${emptyHtml(copy.emptyTitle,copy.emptyBody)}</section>`;
    return;
  }
  const selected=rows.find(r=>r.key===selectedKey)||rows[0];
  state[stateKey]=selected.key;
  const groups=new Map();
  rows.forEach(row=>{
    const groupKey=row.type||'Other';
    if(!groups.has(groupKey))groups.set(groupKey,[]);
    groups.get(groupKey).push(row);
  });
  const ordered=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'}));
  const canonicalCount=rows.filter(r=>r.canonical).length;
  const withUsage=rows.filter(r=>list(r.usage).length>0).length;
  const usage=usageHierarchyHtml(selected.usage);
  const detailRows=selected.details&&typeof selected.details==='object'?Object.entries(selected.details).filter(([k,v])=>!['findings','names','usedBy','details'].includes(k)&&v!==null&&v!==undefined&&typeof v!=='object').slice(0,12):[];
  const detailHtml=detailRows.length?`<div class="table-columns-head">Definition properties</div><div class="kv global-param-snapshot">${detailRows.map(([k,v])=>kv(k,esc(v))).join('')}</div>`:'';
  $('content').innerHTML=`<section class="tables-workbench global-def-workbench"><div class="notice"><div class="notice-icon">i</div><div><b>${esc(copy.title)}.</b> ${esc(copy.notice)}</div></div><div class="metric-grid table-metric-grid"><div class="metric good"><b>${fmt(rows.length)}</b><span>Total definitions</span></div><div class="metric ${canonicalCount?'good':''}"><b>${fmt(canonicalCount)}</b><span>Canonical</span></div><div class="metric ${withUsage===rows.length?'good':'warn'}"><b>${fmt(withUsage)}</b><span>With usage evidence</span></div></div><div class="table-browser global-def-browser"><div class="panel"><h3>${esc(copy.listTitle)}</h3><div class="table-index-list">${ordered.map(([groupKey,items])=>`<div class="scope-group"><span>${esc(groupKey)}</span><span class="section-count">${fmt(items.length)}</span></div>${items.slice(0,600).map(row=>`<button class="table-index-row ${row.key===selected.key?'active':''}" type="button" data-${kind}-key="${esc(row.key)}"><span class="table-index-main"><b>${esc(row.name)}</b><span>${esc(row.source)}  -  ${fmt(list(row.usage).length||row.count)} refs</span></span><span class="table-index-side"><span class="badge ${row.canonical?'green':'amber'}">${row.canonical?'Canonical':'Inferred'}</span></span></button>`).join('')}`).join('')}</div></div><div class="panel udf-detail"><div class="udf-detail-head"><div><h3>${esc(selected.name)}</h3><div class="caption">${esc(copy.detailCaption)}</div></div><div class="tree-detail-badges"><span class="badge ${selected.canonical?'green':'amber'}">${selected.canonical?'Canonical':'Inferred'}</span><span class="badge blue">${fmt(list(selected.usage).length)} usage rows</span></div></div><div class="table-def-grid"><div class="table-def-item"><span class="k">Type</span><span class="v">${esc(selected.type)}</span></div><div class="table-def-item"><span class="k">Source</span><span class="v">${esc(selected.source)}</span></div><div class="table-def-item"><span class="k">Usage footprint</span><span class="v">${fmt(list(selected.usage).length)} references</span></div><div class="table-def-item"><span class="k">Definition key</span><span class="v">${esc(selected.key)}</span></div></div>${detailHtml}<div class="table-columns-head">Usage hierarchy / evidence</div>${usage}</div></div></section>`;
}

function renderGlobalResourceDefinitions(){
  renderGlobalDefinitionWorkbench('resource',buildGlobalResourceDefinitions(),state.selectedResourceKey,'selectedResourceKey',{title:'Global resources catalog',notice:'Resources are global definitions. Usage hierarchy below shows where the selected definition appears in rule evidence when the snapshot can map it.',emptyNotice:'No resource definitions were discovered in this snapshot.',emptyTitle:'No resources found',emptyBody:'No canonical resources or relationship-derived resources were discovered.',listTitle:'Resources',detailCaption:'Global resource definition with structural usage context.'});
}

function renderGlobalDriverDefinitions(){
  renderGlobalDefinitionWorkbench('driver',buildGlobalDriverDefinitions(),state.selectedDriverKey,'selectedDriverKey',{title:'Global input drivers catalog',notice:'Drivers are global process/resource definitions. Findings and structural references are shown as usage evidence, separate from page and document objects.',emptyNotice:'No driver definitions were discovered in this snapshot.',emptyTitle:'No drivers found',emptyBody:'No process driver definitions or driver-like evidence were discovered.',listTitle:'Drivers',detailCaption:'Global driver definition with findings and structural usage context.'});
}

// Build global table definitions and inferred column names from relationship co-occurrence evidence.
function buildGlobalTableDefinitions(){
  const canonicalTables=list(model.fwd?.tables?.items);
  const knownTableNames=new Set(canonicalTables.map(t=>text(t.name).toLowerCase()).filter(Boolean));
  const usageByTarget=new Map();
  usageRowsForDefinition(r=>knownTableNames.has(text(r.target).toLowerCase())||/table|indexed|lookup|db|database/i.test(`${r.targetType} ${r.kind} ${r.target}`)).forEach(row=>{
    const key=text(row.target).toLowerCase();
    if(!key)return;
    if(!usageByTarget.has(key))usageByTarget.set(key,[]);
    usageByTarget.get(key).push(row);
  });
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
      diagnostics:list(first(t.diagnostics,[])).map(text).filter(Boolean),
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
      diagnostics:['TableSchemaNotParsed'],
      usage:usageByTarget.get(t.name.toLowerCase())||[]
    }))
    .sort((a,b)=>(b.hits-a.hits)||a.name.localeCompare(b.name));
}

function renderGlobalTablesCatalog(){
  const tables=buildGlobalTableDefinitions();
  const isCanonical=list(model.fwd?.tables?.items).length>0;
  const canonicalCount=tables.filter(t=>t.canonical).length;
  const inferredCount=Math.max(0,tables.length-canonicalCount);
  const withColumns=tables.filter(t=>list(t.usageDerivedFields).length>0).length;
  $('content').innerHTML=`<section class="tables-workbench"><div class="notice"><div class="notice-icon">i</div><div><b>Global tables catalog.</b> Tables are first-class shared resources referenced by rule logic. ${isCanonical?'Canonical table names come from FWD resources; parsed schema columns and usage-derived fields are separate evidence tiers.':'Field references are currently usage-derived evidence because canonical payload is unavailable.'}</div></div><div class="metric-grid table-metric-grid"><div class="metric good"><b>${fmt(tables.length)}</b><span>Total tables</span></div><div class="metric ${canonicalCount?'good':''}"><b>${fmt(canonicalCount)}</b><span>Canonical definitions</span></div><div class="metric ${inferredCount?'warn':''}"><b>${fmt(inferredCount)}</b><span>Inferred definitions</span></div><div class="metric ${withColumns===tables.length?'good':'warn'}"><b>${fmt(withColumns)}</b><span>With usage fields</span></div></div><div class="panel"><h3>Table Definitions</h3>${tables.length?`<div class="table-catalog">${tables.slice(0,300).map((t,i)=>`<details class="table-card" ${i<4?'open':''}><summary><span class="table-card-main"><b>${esc(t.name)}</b><span class="table-card-meta">${fmt(t.ruleCount)} rules  -  ${fmt(t.scopeCount)} scopes  -  ${fmt(t.hits)} refs</span></span><span class="table-card-badges">${t.canonical?'<span class="badge green">Canonical</span>':'<span class="badge amber">Inferred</span>'}${t.usageDerivedFields.length?`<span class="badge blue">${fmt(t.usageDerivedFields.length)} usage fields</span>`:'<span class="badge amber">No parsed schema</span>'}</span></summary><div class="table-card-body"><div class="table-def-grid"><div class="table-def-item"><span class="k">Definition Source</span><span class="v">${t.inferred?'Evidence-derived':'Canonical payload'}</span></div><div class="table-def-item"><span class="k">Usage Footprint</span><span class="v">${fmt(t.ruleCount)} rules / ${fmt(t.scopeCount)} scopes</span></div><div class="table-def-item"><span class="k">Reference Hits</span><span class="v">${fmt(t.hits)}</span></div></div><div class="table-columns-head">Usage-derived fields ${t.inferred?'(inferred)':'(canonical)'}</div>${t.usageDerivedFields.length?`<div class="table-columns-grid">${t.usageDerivedFields.map(c=>`<div class="table-column-row"><div class="table-col-name">${esc(c.name)}</div><div class="table-col-meta"><span class="badge blue">${fmt(c.hits)} uses</span><span class="mono">${esc(c.confidence)} confidence</span></div></div>`).join('')}</div>`:'<div class="muted">No parsed table schema extracted for this table in current snapshot.</div>'}</div></details>`).join('')}</div>`:emptyHtml('No tables found','No table definitions were discovered in canonical resources or relationship evidence.')}</div></section>`;
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
  const usageHierarchy=usageHierarchyHtml(selected.usage,'No rule usage was mapped for this table.');
  $('content').innerHTML=`<section class="tables-workbench"><div class="notice"><div class="notice-icon">i</div><div><b>Global tables catalog.</b> Tables are first-class shared resources referenced by rule logic. ${isCanonical?'Canonical table names come from FWD resources; parsed schema columns, usage-derived fields, and caller hierarchy are separate evidence tiers.':'Field references are currently usage-derived evidence because canonical payload is unavailable.'}</div></div><div class="metric-grid table-metric-grid"><div class="metric good"><b>${fmt(tables.length)}</b><span>Total tables</span></div><div class="metric ${canonicalCount?'good':''}"><b>${fmt(canonicalCount)}</b><span>Canonical definitions</span></div><div class="metric ${inferredCount?'warn':''}"><b>${fmt(inferredCount)}</b><span>Inferred definitions</span></div><div class="metric ${withColumns===tables.length?'good':'warn'}"><b>${fmt(withColumns)}</b><span>With usage fields</span></div></div><div class="table-browser"><div class="panel"><h3>Tables</h3><div class="table-index-list">${tables.slice(0,500).map(t=>`<button class="table-index-row ${t.name===selected.name?'active':''}" type="button" data-table-name="${esc(t.name)}"><span class="table-index-main"><b>${esc(t.name)}</b><span>${fmt(t.ruleCount)} rules  -  ${fmt(t.scopeCount)} scopes</span></span><span class="table-index-side"><span class="badge ${t.canonical?'green':'amber'}">${t.canonical?'Canonical':'Inferred'}</span><span class="badge blue">${fmt(list(t.usage).length)} refs</span></span></button>`).join('')}</div></div><div class="panel udf-detail"><div class="udf-detail-head"><div><h3>${esc(selected.name)}</h3><div class="caption">Global table definition with field evidence and structural usage context.</div></div><div class="tree-detail-badges"><span class="badge ${selected.canonical?'green':'amber'}">${selected.canonical?'Canonical':'Inferred'}</span><span class="badge blue">${fmt(list(selected.usage).length)} usage rows</span></div></div><div class="table-def-grid"><div class="table-def-item"><span class="k">Definition Source</span><span class="v">${selected.inferred?'Evidence-derived':'Canonical payload'}</span></div><div class="table-def-item"><span class="k">Usage Footprint</span><span class="v">${fmt(selected.ruleCount)} rules / ${fmt(selected.scopeCount)} scopes</span></div><div class="table-def-item"><span class="k">Reference Hits</span><span class="v">${fmt(selected.hits)}</span></div></div><div class="table-columns-head">Usage-derived field evidence ${selected.inferred?'(inferred)':'(canonical)'}</div>${selected.usageDerivedFields.length?`<div class="table-columns-grid">${selected.usageDerivedFields.map(c=>`<div class="table-column-row"><div class="table-col-name">${esc(c.name)}</div><div class="table-col-meta"><span class="badge blue">${fmt(c.hits)} uses</span><span class="mono">${esc(c.confidence)} confidence</span></div></div>`).join('')}</div>`:'<div class="muted">No parsed table schema extracted for this table in current snapshot.</div>'}<div class="table-columns-head">Usage hierarchy / evidence</div>${usageHierarchy}</div></div></section>`;
}

// Build UDF rows with optional canonical details for list/detail rendering.
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
      const configuredRules=matchedRules.map(r=>`${r.ruleName}  -  ${r.scopeId}`);
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
        definitionParsed:first(u.definitionParsed,u.parsed,u.hasParsedDefinition,false)===true,
        diagnostics:list(first(u.diagnostics,u.warnings,[])),
        classification:text(first(u.classification,'')),
        confidence:text(first(u.confidence,'')),
        source:text(first(u.source,u.definitionSource,'')),
        scopes:list(first(u.scopeIds,u.scopes,u.usedByScopes,[])).map(text).filter(Boolean),
        rules,
        callerRules:matchedRules,
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
    definitionParsed:false,
    diagnostics:[],
    classification:'RegexOnly',
    confidence:'',
    source:'Derived from structural/inventory function evidence',
    scopes:[],
    rules:matchedRules.map(x=>`${x.ruleName}  -  ${x.scopeId}`).sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'})),
    callerRules:matchedRules,
    parameterNames:parameterNamesFromRules(matchedRules)
  };});
}

// Render UDF list/detail with underscore-prefix grouping and clickable details.
function udfFilterLabel(filter){return ({'with-callers':'Has caller trees',canonical:'Canonical',unparsed:'Needs parsing','relationship-only':'Relationship-only',all:'All'})[filter]||'All';}
function passesUdfFilter(row){
  if(state.udfFilter==='with-callers')return list(row.callerRules).length>0||list(row.rules).length>0;
  if(state.udfFilter==='canonical')return !!row.canonical;
  if(state.udfFilter==='unparsed')return row.definitionParsed===false||list(row.diagnostics).length>0;
  if(state.udfFilter==='relationship-only')return !row.canonical&&list(row.rules).length>0;
  return true;
}
function udfCallerNode(caller){
  return caller?.nodeId?model.nodesById.get(String(caller.nodeId)):null;
}
function udfParameterMatrixHtml(callers){
  const byName=new Map();
  list(callers).forEach(caller=>{
    Object.entries(caller.parameters||{}).forEach(([name,rawValue])=>{
      const key=text(name).trim();
      if(!key)return;
      if(!byName.has(key))byName.set(key,{name:key,values:new Map(),callers:new Set()});
      const row=byName.get(key);
      row.callers.add(text(caller.nodeId||caller.ruleName));
      list(rawValue).forEach(v=>{
        const value=text(v);
        if(!row.values.has(value))row.values.set(value,0);
        row.values.set(value,row.values.get(value)+1);
      });
    });
  });
  const rows=[...byName.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
  if(!rows.length)return '<div class="muted">No caller parameters were extracted for this function.</div>';
  return `<div class="udf-param-grid">${rows.map(row=>{
    const values=[...row.values.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],undefined,{sensitivity:'base'}));
    const examples=values.slice(0,5).map(([value,count])=>`<span class="udf-value-chip" title="${esc(value)}">${esc(value||'(blank)')} <b>${fmt(count)}</b></span>`).join('');
    return `<div class="udf-param-row"><div><b>${esc(row.name)}</b><span>${fmt(row.callers.size)} caller ${row.callers.size===1?'rule':'rules'}</span></div><div class="udf-param-values">${examples||'<span class="muted">No values</span>'}</div></div>`;
  }).join('')}</div>`;
}
function callerTreePreviewHtml(node){
  const groups=childRouteGroups(node.id);
  if(!groups.length)return '<div class="muted">No child branches under this caller.</div>';
  return `<div class="udf-branch-grid">${groups.slice(0,10).map(group=>{
    const childButtons=group.childIds.slice(0,8).map(id=>{
      const child=model.nodesById.get(String(id));
      return child?`<button class="udf-child-node" type="button" data-node="${esc(child.id)}"><b>${esc(child.title)}</b><span>${esc(child.fn||'No function mapped')}</span></button>`:'';
    }).join('');
    return `<div class="udf-branch-card"><div class="split-row"><b>${esc(group.label||'Unresolved route')}</b><span class="badge ${group.resolved?'green':'amber'}">${fmt(group.childIds.length)} children</span></div>${childButtons?`<div class="mini-list mt-8">${childButtons}</div>`:''}</div>`;
  }).join('')}</div>${groups.length>10?`<div class="caption mt-8">Showing first 10 branch groups out of ${fmt(groups.length)}.</div>`:''}`;
}
function udfCallerHierarchyHtml(callers){
  const structural=list(callers).map(caller=>({caller,node:udfCallerNode(caller)})).filter(x=>x.node);
  if(!structural.length)return '<div class="muted">No structural caller nodes were mapped for this function.</div>';
  const byScope=new Map();
  structural.forEach(item=>{
    const key=item.node.scopeId;
    if(!byScope.has(key))byScope.set(key,[]);
    byScope.get(key).push(item);
  });
  return [...byScope.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'})).map(([scopeId,items])=>`
    <details class="udf-scope-tree" open>
      <summary><span>${esc(scopeId)}</span><span class="section-count">${fmt(items.length)} callers</span></summary>
      <div class="udf-scope-tree-body">
        ${items.slice(0,40).map(({caller,node})=>{
          const parameterKeys=Object.keys(caller.parameters||{});
          const parameterHtml=parameterKeys.length?`<div class="kv udf-caller-params">${parameterKeys.slice(0,12).map(k=>kv(k,esc(list(caller.parameters[k]).join(', ')))).join('')}</div>`:'<div class="muted">No caller parameters extracted.</div>';
          return `<details class="udf-caller-card" open>
            <summary><span><b>${esc(node.title)}</b><span>${esc(node.fn||'No function mapped')}</span></span><button class="btn ghost" type="button" data-node="${esc(node.id)}">Open in tree</button></summary>
            <div class="udf-caller-body">
              <div class="table-columns-head">Hierarchy route</div>
              ${routePathHtml(node)}
              <div class="table-columns-head">Caller parameters</div>
              ${parameterHtml}
              <div class="table-columns-head">Child rule hierarchy</div>
              ${callerTreePreviewHtml(node)}
            </div>
          </details>`;
        }).join('')}
        ${items.length>40?`<div class="caption">Showing first 40 callers in this scope out of ${fmt(items.length)}.</div>`:''}
      </div>
    </details>`).join('');
}
function renderUdfMasterDetail(){
  const allRows=buildUdfDefinitions().sort((a,b)=>a.displayName.localeCompare(b.displayName,undefined,{sensitivity:'base'}));
  const rows=allRows.filter(passesUdfFilter);
  if(!rows.length){
    $('content').innerHTML=`<div class="notice"><div class="notice-icon">i</div><div><b>User Defined Functions (UDF) view.</b> UDFs are global resources; scope rows indicate where they are used, not where they are defined.</div></div><div class="segmented mb-10">${['with-callers','canonical','unparsed','relationship-only','all'].map(f=>`<button class="${state.udfFilter===f?'active':''}" type="button" data-udf-filter="${f}">${esc(udfFilterLabel(f))}</button>`).join('')}</div>${emptyHtml('No user defined functions match','Choose a broader UDF filter or clear search.')}`;
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
  const callerRows=list(selected.callerRules);
  const parameterMatrix=udfParameterMatrixHtml(callerRows);
  const callerHierarchy=udfCallerHierarchyHtml(callerRows);
  const scopeList=selected.scopes.length?`<div class="mini-list">${selected.scopes.slice(0,80).map(s=>`<div class="mini-row"><span class="mono">${esc(s)}</span></div>`).join('')}</div>`:'<div class="muted">No explicit scope list in canonical payload.</div>';
  $('content').innerHTML=`<section class="tables-workbench udf-workbench"><div class="notice"><div class="notice-icon">i</div><div><b>User Defined Functions (UDF) catalog.</b> UDFs are global definitions. Caller hierarchy below shows where the selected function is used in the rule tree.</div></div><div class="segmented mb-10">${['with-callers','canonical','unparsed','relationship-only','all'].map(f=>`<button class="${state.udfFilter===f?'active':''}" type="button" data-udf-filter="${f}">${esc(udfFilterLabel(f))}</button>`).join('')}</div><div class="table-browser udf-browser"><div class="panel udf-function-list"><h3>Functions</h3><div class="table-index-list">${ordered.map(([groupKey,items])=>`<div class="scope-group"><span>${esc(groupKey)}</span><span class="section-count">${fmt(items.length)}</span></div>${items.map(r=>`<button class="table-index-row ${r.key===selected.key?'active':''}" type="button" data-udf-name="${esc(r.key)}"><span class="table-index-main"><b>${esc(r.displayName)}</b><span>${esc(r.type)}  -  ${fmt(list(r.callerRules).length)} callers</span></span></button>`).join('')}`).join('')}</div></div><div class="panel udf-detail"><div class="udf-detail-head"><div><h3>${esc(selected.displayName)}</h3><div class="caption">Global function definition with structural caller context.</div></div><div class="tree-detail-badges"><span class="badge ${selected.canonical?'green':'amber'}">${selected.canonical?'Canonical':'Inferred'}</span><span class="badge blue">${fmt(callerRows.length)} callers</span></div></div><div class="table-def-grid"><div class="table-def-item"><span class="k">Type</span><span class="v">${esc(selected.type)}</span></div><div class="table-def-item"><span class="k">Source</span><span class="v">${esc(selected.source||'Candidate evidence')}</span></div><div class="table-def-item"><span class="k">Classification</span><span class="v">${esc(selected.classification|| (selected.canonical?'CandidateUdf':(selected.inferred?'RegexOnly':'Unspecified')))}</span></div><div class="table-def-item"><span class="k">Confidence</span><span class="v">${esc(selected.confidence||'Not provided')}</span></div><div class="table-def-item"><span class="k">Parameter keys</span><span class="v">${fmt(list(selected.parameterNames).length)}</span></div><div class="table-def-item"><span class="k">Caller rules</span><span class="v">${fmt(callerRows.length)}</span></div></div><div class="table-columns-head">Parameters used by callers</div>${parameterMatrix}<div class="table-columns-head">Caller rule tree / hierarchy</div>${callerHierarchy}<div class="table-columns-head">Canonical scopes</div>${scopeList}</div></div></section>`;
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
  const disabledBadge=n.disabled!=='none'?`<span class="badge amber">${esc(n.disabled)}</span>`:'';
  return `<div class="tree-row ${selected?'selected':''} ${inPath?'active-path':''} ${hot?'hotspot':''}" role="treeitem" aria-level="${level+1}" aria-expanded="${hasKids?(expanded?'true':'false'):'false'}" aria-selected="${selected?'true':'false'}" tabindex="0" data-node="${esc(id)}" style="--depth:${level}"><span class="tree-left">${hasKids?`<button class="twisty" type="button" data-toggle-node="${esc(id)}" aria-label="${expanded?'Collapse':'Expand'} ${esc(n.title)}">${expanded?'-':'+'}</button>`:'<span class="twisty ghost" aria-hidden="true"> - </span>'}<span class="tree-main"><b class="tree-name">${esc(n.title)}</b><span class="tree-meta">${esc(n.fn||'No function mapped')}</span>${disabledBadge}</span></span>${hasKids?`<button class="mini-row-btn" type="button" data-toggle-node="${esc(id)}" aria-label="${expanded?'Collapse':'Expand'} rule">${expanded?'-':'+'}</button>`:''}</div>`;
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
// Curated in-product guide content to make first-use navigation and evidence interpretation explicit.
function renderHelp(){
  const quickStart=`<div class="panel"><h3>Quick Start</h3><ol class="evidence-list"><li>Choose a business scope from the left rail (Pages or Docs first).</li><li>Open <b>Structure</b> to see hierarchy and incoming route labels.</li><li>Select a rule to review summary, route, and branch evidence.</li><li>Use <b>Audit</b> to check diagnostics before making conclusions.</li></ol></div>`;
  const evidenceModel=`<div class="panel"><h3>How to Read Evidence</h3><div class="kv">${kv('Structural tree','Primary source of truth for hierarchy, branch order, and disabled inheritance.')}${kv('Inventory','Coverage/search support only; not runtime execution order.')}${kv('References','Static relationship evidence with explicit confidence.')}${kv('Diagnostics','Reviewer warnings that should be resolved before sign-off.')}${kv('Flow','Experimental low-confidence triage aid only.')}</div></div>`;
  const operators=`<div class="panel"><h3>Search Operators</h3><div class="mini-list"><div class="mini-row"><span><b>action:"Run Rules"</b></span><span class="caption">Match branch labels</span></div><div class="mini-row"><span><b>function:_IGetDocAttr</b></span><span class="caption">Match mapped function</span></div><div class="mini-row"><span><b>has:disabled</b></span><span class="caption">Rules with disable evidence</span></div><div class="mini-row"><span><b>children&gt;20</b></span><span class="caption">Large structural nodes</span></div><div class="mini-row"><span><b>scope:DentalADA</b></span><span class="caption">Scope-limited matches</span></div></div></div>`;
  const shortcuts=`<div class="panel"><h3>Keyboard Shortcuts</h3><div class="kv">${kv('/','Focus global search')}${kv('Alt + A','Expand all visible rules')}${kv('Alt + D','Expand selected rule one level')}${kv('Alt + P','Collapse selected rule peers')}${kv('Alt + F','Clear focus/subtree mode')}${kv('E','Open export builder')}${kv('R','Open reviewer report')}</div><div class="caption mt-8">Tip: Use arrow keys and Enter to review dense trees without leaving the keyboard.</div></div>`;
  $('helpBody').innerHTML=`${quickStart}${evidenceModel}${operators}${shortcuts}`;
}
function setInspectionHtml(html){
  $('inspectorBody').innerHTML=html;
  const pageBody=optionalElement('inspectionPageBody');
  if(pageBody)pageBody.innerHTML=html;
}
function renderScopeInspector(s){const hotspots=scopedRuleNodes().filter(isHotspotNode).length;setInspectionHtml(`<details class="inspector-section" open><summary>Scope summary <span class="section-count">${fmt(s.structural)} rules</span></summary><div class="inspector-section-body"><div class="kv">${kv('Scope ID',esc(s.scopeId))}${kv('Kind',esc(s.kind))}${kv('Structural rules',fmt(s.structural))}${kv('Complex rules',fmt(hotspots))}${kv('Diagnostics',s.diags?`<span class="badge amber">${fmt(s.diags)}</span>`:'<span class="badge green">None</span>')}</div><div class="branch-actions mt-10"><button class="btn" type="button" data-action="largest-scope">Largest scope</button></div></div></details><details class="inspector-section" open><summary>How to work this scope</summary><div class="inspector-section-body"><ul class="evidence-list"><li>Select a rule row, then open Inspect for route, diagnostics, and evidence.</li><li>Expand a rule to see outgoing action branches.</li><li>Use Audit when you need diagnostics, provenance, or extraction details.</li></ul></div></details>`);}

function trustStripHtml(n){const incoming=model.incomingByChild.get(n.id);const refs=model.rels.filter(r=>String(r.nodeId)===String(n.id));const diags=model.diags.filter(d=>String(d.nodeId)===String(n.id));const inv=model.inventory.find(r=>String(r.nodeId)===String(n.id));const routeOk=!incoming||incoming.resolved;const disabledLabel=n.disabled==='none'?'No disable evidence':n.disabled==='direct'?'Direct disabled':n.disabled==='possible'?'Sequence-only possible':'Inherited disabled';return `<div class="trust-strip" aria-label="Selected rule trust summary"><div class="trust-item info"><b>Structural</b><span>Tree node</span></div><div class="trust-item ${routeOk?'good':'warn'}"><b>Route label</b><span>${routeOk?'Resolved':'Index only'}</span></div><div class="trust-item good"><b>Disabled authority</b><span>${esc(disabledLabel)}</span></div><div class="trust-item ${inv?'good':'warn'}"><b>Flat inventory</b><span>${inv?'Correlated':'No correlated row'}</span></div><div class="trust-item ${refs.length?'info':'warn'}"><b>References</b><span>${fmt(refs.length)}</span></div><div class="trust-item ${diags.length?'warn':'good'}"><b>Diagnostics</b><span>${diags.length?fmt(diags.length):'None linked'}</span></div></div>`;}
function selectedRoutePathPacket(n){const incoming=model.incomingByChild.get(n.id);return {schema:'AcWorkbench.SelectedRuleRoutePath',schemaVersion:'1.0.0',copiedAt:new Date().toISOString(),scopeId:n.scopeId,identity:{nodeId:n.id,ruleName:n.title,functionName:n.fn,ruleGuid:n.RuleGuid||null},incomingAction:incoming?{label:incoming.label,routeState:incoming.routeState||null,actionName:first(incoming.ActionName,incoming.actionName,null),actionListIndex:first(incoming.ActionListIndex,incoming.actionListIndex,null),resolved:!!incoming.resolved,evidence:incoming.Evidence||incoming.evidence||null}:null,routePath:routePathObjects(n),outgoingActions:(model.edgesByParent.get(n.id)||[]).map(e=>({label:e.label,routeState:e.routeState||null,actionName:first(e.ActionName,e.actionName,null),actionListIndex:first(e.ActionListIndex,e.actionListIndex,null),resolved:!!e.resolved,toNodeId:e.to,childName:model.nodesById.get(String(e.to))?.title||null})),caveat:'Route path is structural evidence from parsed hierarchy. It is not native runtime execution proof.'};}
function selectedRuleEvidencePacket(n){const incoming=model.incomingByChild.get(n.id);const refs=model.rels.filter(r=>String(r.nodeId)===String(n.id));const diags=model.diags.filter(d=>String(d.nodeId)===String(n.id));const inv=model.inventory.find(r=>String(r.nodeId)===String(n.id));const fieldResolution=resolveNodeFieldReferences(n);return {schema:'AcWorkbench.SelectedRuleEvidence',schemaVersion:'1.0.0',copiedAt:new Date().toISOString(),source:first(treeData.FwdPath,rulesData.FwdPath,'Embedded snapshot'),scopeId:n.scopeId,identity:{nodeId:n.id,ruleName:n.title,functionName:n.fn,ruleGuid:n.RuleGuid||null,ruleId:n.RuleId||null},position:{incomingAction:incoming?{label:incoming.label,actionName:first(incoming.ActionName,incoming.actionName,null),actionListIndex:first(incoming.ActionListIndex,incoming.actionListIndex,null),resolved:!!incoming.resolved,evidence:incoming.Evidence||incoming.evidence||null}:null,routePath:routePathObjects(n),children:childIds(n.id).length},disabled:{state:n.disabled,authority:'Structural',confidence:n.DisabledConfidence||null,reason:n.DisabledReason||null,evidence:n.DisabledEvidence||null},parameters:n.Parameters||{},fieldResolution,outgoingActions:(model.edgesByParent.get(n.id)||[]).map(e=>({label:e.label,actionName:first(e.ActionName,e.actionName,null),actionListIndex:first(e.ActionListIndex,e.actionListIndex,null),resolved:!!e.resolved,toNodeId:e.to,childName:model.nodesById.get(String(e.to))?.title||null})),relationships:refs.map(r=>({kind:r.kind,targetType:r.targetType,target:r.target,confidence:r.confidence,evidence:r.Evidence||r.evidence||r.RelationshipReason||null})),diagnostics:diags.map(d=>({severity:d.severity,title:d.title,detail:d.detail})),reconciliation:{flatInventoryMatch:!!inv,flatInventoryId:inv?.id||null,classification:inv?.classification||null},notProven:['Native runtime execution was not simulated.','Search matches are not dependencies.','ac-flow.json is experimental / low-confidence and is not runtime proof.']};}
function routePathObjects(n){const path=[];let cur=n,guard=0;while(cur&&guard++<128){const incoming=model.incomingByChild.get(cur.id);path.push({nodeId:cur.id,name:cur.title,functionName:cur.fn||null,incomingAction:incoming?{label:incoming.label,actionListIndex:first(incoming.ActionListIndex,incoming.actionListIndex,null),resolved:!!incoming.resolved}:null});const parent=model.parentByChild.get(cur.id);cur=parent?model.nodesById.get(String(parent)):null;}return path.reverse();}
function renderGenericInspector(obj,label){if(state.inspectorView==='raw'){setInspectionHtml(`<pre class="raw">${esc(JSON.stringify(obj,null,2))}</pre>`);return;}const linked=obj.nodeId?model.nodesById.get(String(obj.nodeId)):null;setInspectionHtml(`<div class="panel"><h3>${esc(label)}</h3><div class="kv">${Object.keys(obj).slice(0,18).map(k=>kv(k,esc(typeof obj[k]==='object'?JSON.stringify(obj[k]):obj[k]))).join('')}</div></div>${linked?`<button class="btn primary" type="button" data-action="open-linked-node">Open linked structural node</button>`:''}`);}
function ancestors(n){const rows=[];let cur=n;const seen=new Set();while(cur&&!seen.has(cur.id)){seen.add(cur.id);rows.unshift(cur);const p=model.parentByChild.get(cur.id);cur=p?model.nodesById.get(p):null;}return rows;}
function routePathHtml(n){return `<div class="route-path">${ancestors(n).map((a,i)=>{const e=model.incomingByChild.get(a.id);return `${i?'<span class="route-arrow">-></span>':''}<span class="route-step">${i?routeChip(e):'<span class="route-chip root">root</span>'}<b title="${esc(a.title)}">${esc(a.title)}</b></span>`}).join('')}</div>`;}
function outgoingGroups(n){const edges=list(model.edgesByParent.get(n.id));const groups={};edges.forEach(e=>{const key=e.label||'Unresolved';(groups[key]||(groups[key]=[])).push(e);});return groups;}

function branchSummaryHtml(n){
  const groups=outgoingGroups(n);
  const names=Object.keys(groups);
  if(!names.length)return '<div class="muted">This rule has no routed child branches.</div>';
  return `<div class="branch-summary">${names.map(name=>`<span class="branch-summary-chip"><b>${esc(name)}</b><span>${fmt(groups[name].length)} ${groups[name].length===1?'child':'children'}</span></span>`).join('')}</div><div class="caption mt-8">These are outgoing structural branches owned by this rule. Each child rule below the branch has one incoming route from its parent action.</div>`;
}
function sectionHtml(title,count,body,open=true){return `<details class="inspector-section" ${open?'open':''}><summary>${esc(title)}${count!==undefined?` <span class="section-count">${esc(count)}</span>`:''}</summary><div class="inspector-section-body">${body}</div></details>`;}
function udfDefinitionForFunction(fn){
  const name=text(fn);
  if(!name)return null;
  return buildUdfDefinitions().find(u=>lower(u.key)===lower(name)||lower(u.displayName)===lower(name))||null;
}
function functionValueHtml(fn){
  const name=text(fn);
  if(!name)return '<span class="muted">No function mapped</span>';
  const udf=udfDefinitionForFunction(name);
  if(!udf)return `<span class="mono">${esc(name)}</span>`;
  return `<button class="inline-link mono" type="button" data-udf-name="${esc(udf.key)}" title="Open UDF definition and caller rules">${esc(name)}</button>`;
}
function renderNodeInspector(n){
 const incoming=model.incomingByChild.get(n.id);
 const refs=model.rels.filter(r=>String(r.nodeId)===String(n.id));
 const diags=model.diags.filter(d=>String(d.nodeId)===String(n.id));
 const inv=model.inventory.find(r=>String(r.nodeId)===String(n.id));
 const trust=trustStripHtml(n);
 const disabledHtml=n.disabled==='none'?'<span class="muted">No disable evidence</span>':n.disabled==='direct'?'<span class="badge red">Direct disabled</span>':n.disabled==='possible'?'<span class="badge amber">Possible sequence-only</span>':'<span class="badge amber">Disabled by parent</span>';
 const displayPath=first(n.DisplayPath,n.displayPath,n.StructuralPath,n.structuralPath,n.RuleListPath,n.ruleListPath,'Root');
 const authority=inv?first(inv.disabledAuthority,'Structural correlation'):'Structural only';
 const summary=`<div class="kv">${kv('Rule name',esc(n.title))}${kv('Function',functionValueHtml(n.fn))}${kv('Scope',esc(n.scopeId))}${kv('Display path',`<span class="mono path-line">${esc(displayPath)}</span>`)}${kv('Incoming action',routeChip(incoming))}${kv('Disabled state',disabledHtml)}${kv('Disabled authority',esc(authority))}${kv('Children',fmt(childIds(n.id).length))}${kv('References',fmt(refs.length))}${kv('Diagnostics',diags.length?`<span class="badge amber">${fmt(diags.length)}</span>`:'<span class="badge green">None</span>')}${kv('Node',esc(n.id))}</div><div class="inline-actions mt-12"><button class="btn" type="button" data-action="copy-route-path">Copy route path</button><button class="btn primary" type="button" data-action="copy-rule-evidence">Copy evidence</button></div>`;
 const route=`<div class="panel mb-10"><h3>Structural route</h3>${routePathHtml(n)}<div class="caption mt-8">This is structural hierarchy evidence. It is not a runtime execution trace.</div></div><div class="panel mb-0"><h3>Incoming parent action</h3>${routeChip(incoming)}<div class="caption mt-8">${esc(incoming?.Evidence||'Root list entry or unresolved parent edge.')}</div></div>`;
 const branches=branchSummaryHtml(n)+`<div class="caption mt-8">Open the corresponding action branch in the tree to inspect only that route.</div>`;
 const params=paramBlock(n.Parameters);
 const fieldResolution=resolveNodeFieldReferences(n);
 const fieldBody=renderFieldResolutionBlock(fieldResolution);
 const relBody=refs.length?refs.slice(0,120).map(r=>`<div class="split-row my-7"><span>${esc(r.kind)} -> <b>${esc(r.target)}</b><div class="caption">${esc(r.targetType)}  -  ${esc(r.Evidence||r.evidence||r.RelationshipReason||'relationship evidence')}</div></span>${badgeConfidence(r.confidence)}</div>`).join(''):'<div class="muted">No references linked by structural correlation.</div>';
 const diagBody=diags.length?diags.map(d=>`<div class="notice"><div class="notice-icon">!</div><div><b>${esc(d.title)}</b><br>${esc(d.detail)}<div class="caption">Reviewer action: verify this warning before drawing conclusions from the selected rule.</div></div></div>`).join(''):'<div class="muted">No diagnostics linked to this node.</div>';
 const evidence=`<ul class="evidence-list"><li><b>Structural evidence:</b> Node is from parsed AC rule tree data.</li><li><b>Route authority:</b> Parent/child action routing is structural when an incoming edge exists.</li><li><b>Action label:</b> ${incoming?.resolved?'Resolved from the parent action list.':'Action index is available, but the route label was not resolved.'}</li><li><b>Disabled state:</b> Structural disabled state is authoritative when this rule has a tree node. Flat sequence-only values are audit-only inventory evidence.</li><li><b>Inventory reconciliation:</b> ${inv?'Matched to a flat extraction row.':'No correlated flat inventory row found for this structural node.'}</li><li><b>Not proven:</b> Native runtime execution was not simulated. Search hits are not dependencies. ac-flow.json is experimental / low-confidence.</li></ul>`;
 const raw=`<pre class="raw">${esc(JSON.stringify(n,null,2))}</pre>`;
 setInspectionHtml(`${trust}${sectionHtml('Summary','rule',summary,true)}${sectionHtml('Route','path',route,true)}${sectionHtml('Branches',`${Object.keys(outgoingGroups(n)).length} actions`,branches,true)}${sectionHtml('Parameters',Object.keys(n.Parameters||{}).length,params,false)}${sectionHtml('Field Resolution',`${fmt(fieldResolution.summary.resolved)}/${fmt(fieldResolution.summary.referenced)} resolved`,fieldBody,fieldResolution.summary.referenced>0)}${sectionHtml('References',refs.length,relBody,refs.length>0)}${sectionHtml('Diagnostics',diags.length,diagBody,diags.length>0)}${sectionHtml('Evidence','trust',evidence,true)}${sectionHtml('Raw','JSON',raw,false)}`);
}
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
function referenceKindForParameter(name){const key=lower(name);if(key.includes('field')||key.includes('column'))return 'FieldReference';if(key.includes('attr'))return 'AttributeReference';if(key.includes('source')||key.includes('fileref'))return 'SourceReference';if(key.includes('table')||key.includes('selection'))return 'TableReference';if(key.includes('function')||key.includes('udf'))return 'FunctionReference';return 'UnknownToken';}
function looksLikeFieldParameterName(name){return referenceKindForParameter(name)==='FieldReference';}
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
        items.push({parameterName:text(parameterName),parameterValue:text(parameterValue),referencedField:candidate,referenceKind:'FieldReference',fieldExists:matches.length>0,confidence:matches.length>0?'High':'Low',source:rows.length?'CanonicalFieldCatalog':'NoFieldCatalog',matches});
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
  const rows=fieldResolution.items.slice(0,120).map(item=>{const matches=item.matches.slice(0,3).map(m=>`<div class="mini-row"><span class="mono">${esc(m.name)}</span><span>${esc(m.scopeType)}:${esc(m.scopeName)}${m.geometry?`  -  ${esc(m.geometry)}`:''}</span></div>`).join('');return `<div class="panel my-8 p-10"><div class="split-row"><span><b>${esc(item.referencedField)}</b><div class="caption">${esc(item.parameterName)} = ${esc(item.parameterValue)}</div></span><span class="badge ${item.fieldExists?'green':'amber'}">${item.fieldExists?'resolved':'unresolved'}</span></div>${matches?`<div class="mini-list mt-8">${matches}</div>`:'<div class="caption mt-8">No canonical field match was found in current field catalog scope.</div>'}</div>`;}).join('');
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
  const listHtml=rows.slice(0,4000).map(r=>`<button class="data-row compact" type="button" data-node="${esc(r.nodeId)}"><div><div class="data-title">${esc(r.referencedField)} <span class="badge ${r.fieldExists?'green':'amber'}">${r.fieldExists?'resolved':'unresolved'}</span></div><div class="data-sub">${esc(r.ruleName)}  -  ${esc(r.functionName||'no function')}  -  ${esc(r.parameterName)} = ${esc(r.parameterValue)}</div></div><div>${r.matchCount?`<span class="badge blue">${fmt(r.matchCount)} matches</span>`:''}</div><div class="mono">${esc(r.nodeId)}</div></button>`).join('');
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
function saveState(){try{localStorage.setItem(snapshotStoreKey(),JSON.stringify({scopeId:state.scopeId,theme:state.theme,density:state.density,treeFilter:state.treeFilter,scopeKindFilter:state.scopeKindFilter,workspaceView:state.workspaceView,fieldResolutionFilter:state.fieldResolutionFilter,selectedResourceKey:state.selectedResourceKey,selectedDriverKey:state.selectedDriverKey,selectedTableName:state.selectedTableName,selectedUdfName:state.selectedUdfName,udfFilter:state.udfFilter,consoleView:state.consoleView,inspectorOpen:document.body.classList.contains('inspector-open'),recentScopes:state.recentScopes}));localStorage.setItem(themeStorageKey,state.theme);}catch{}}
function restoreSnapshotState(){const saved=safeJson(localStorage.getItem(snapshotStoreKey())||'{}',{});const theme=localStorage.getItem(themeStorageKey)||state.theme||'dark';state.theme=theme;document.documentElement.dataset.theme=theme;state.density=saved.density==='high'?'high':state.density;applyDensityClass(state.density);if(saved.scopeId&&model.scopes.some(s=>s.scopeId===saved.scopeId))state.scopeId=saved.scopeId;if(saved.treeFilter)state.treeFilter=saved.treeFilter;if(saved.scopeKindFilter)state.scopeKindFilter=saved.scopeKindFilter;state.workspaceView=['structure','inspect','field-resolution','resources','tables','drivers','udfs','audit'].includes(saved.workspaceView)?saved.workspaceView:'structure';state.fieldResolutionFilter=['all','resolved','unresolved'].includes(saved.fieldResolutionFilter)?saved.fieldResolutionFilter:'unresolved';state.selectedResourceKey=text(saved.selectedResourceKey||'');state.selectedDriverKey=text(saved.selectedDriverKey||'');state.selectedTableName=text(saved.selectedTableName||'');state.selectedUdfName=text(saved.selectedUdfName||'');state.udfFilter=['all','with-callers','canonical','unparsed','relationship-only'].includes(saved.udfFilter)?saved.udfFilter:state.udfFilter;state.consoleView=['activity','warnings','errors','exports','raw'].includes(saved.consoleView)?saved.consoleView:state.consoleView;state.recentScopes=Array.isArray(saved.recentScopes)?saved.recentScopes:[];if(saved.inspectorOpen)document.body.classList.add('inspector-open');}
function branchIdFor(parentId,g){return `${state.scopeId}|${String(parentId)}|action:${text(first(g?.actionListIndex,g?.key,g?.label,'route')).replace(/\s+/g,'_')}`;}
function branchVmFromKey(key,scopeId=state.scopeId){for(const n of model.nodes){if(n.scopeId!==scopeId)continue;for(const g of childRouteGroups(n.id)){const k=branchKey(n.id,g);if(k===key){const childNodes=g.childIds.map(id=>model.nodesById.get(String(id))).filter(Boolean);return {kind:'ActionBranch',key:k,branchId:branchIdFor(n.id,g),scopeId,parent:n,group:g,childNodes,childIds:g.childIds,childCount:g.childIds.length,routeState:g.routeState||'Unresolved',resolved:!!g.resolved,label:g.label||'Unresolved route',actionListIndex:g.actionListIndex};}}}return null;}
function selectedBranch(){return state.selectedType==='branch'?branchVmFromKey(state.selectedId):null;}
function selectedObject(){return selectedNode()||selectedBranch()||selectedInventory()||selectedRel()||selectedDiag()||currentScope();}
function selectBranch(key){const b=branchVmFromKey(key);if(!b)return;state.selectedType='branch';state.selectedId=key;state.expanded.add(b.parent.id);renderAll();setTimeout(()=>document.querySelector(`[data-branch="${cssEscape(key)}"]`)?.scrollIntoView({block:'nearest'}),0);}
function selectScope(id){if(!id||id===state.scopeId)return;state.scopeId=id;noteRecentScope(id);state.selectedType='scope';state.selectedId='';state.focusNodeId='';state.collapsedBranches.clear();seedExpanded(id);document.body.classList.remove('inspector-open');markOnboardingComplete();announceContentStatus(`Scope selected: ${currentScope()?.name||id}`);renderAll();}
function selectNode(id){state.workspaceView='structure';state.selectedType='node';state.selectedId=String(id);state.expanded.add(String(id));let child=String(id);let p=model.parentByChild.get(child);while(p){state.expanded.add(p);const incoming=model.incomingByChild.get(child);if(incoming)state.collapsedBranches.delete(branchKeyFromEdge(p,incoming));child=p;p=model.parentByChild.get(p);}renderAll();setTimeout(()=>{const row=document.querySelector(`[data-node="${cssEscape(String(id))}"]`);row?.scrollIntoView({block:'nearest'});row?.focus();},0);}
function branchRow(r){const g=r.group;const key=r.key;const cls=g.resolved?'resolved':'unresolved';const open=r.open!==false;const selected=state.selectedType==='branch'&&state.selectedId===key;const hot=g.childIds.length>=10||g.childIds.some(id=>{const n=model.nodesById.get(String(id));return n&&(n.disabled!=='none'||hasDiag(n));});return `<div class="branch-row ${cls} ${open?'':'collapsed'} ${selected?'selected':''} ${hot?'hotspot':''}" role="treeitem" aria-level="${r.level+1}" aria-expanded="${open?'true':'false'}" aria-selected="${selected?'true':'false'}" tabindex="0" data-branch="${esc(key)}" style="--depth:${r.level}"><button class="twisty branch-twisty" type="button" data-toggle-branch="${esc(key)}" aria-label="${open?'Collapse':'Expand'} action ${esc(g.label)}">${open?'-':'+'}</button><div class="branch-main"><span class="branch-label">${esc(g.label)}</span><span class="branch-meta">${fmt(g.childIds.length)} child ${g.childIds.length===1?'rule':'rules'}</span></div><button class="mini-row-btn" type="button" data-toggle-branch="${esc(key)}" aria-label="${open?'Collapse':'Expand'} branch">${open?'-':'+'}</button></div>`;}
function renderContextActionMenu(contextLabel){
  return `<details class="action-menu"><summary class="btn secondary-btn" title="Open contextual actions menu">${esc(contextLabel)} actions</summary><div class="action-menu-pop" role="group" aria-label="${esc(contextLabel)} actions"><button class="btn secondary-btn" type="button" data-action="view-audit" data-requires="scope" data-disabled-title="Choose a scope before opening audit." title="Open audit workspace for the current scope">Audit Snapshot</button><button class="btn secondary-btn" type="button" data-action="export-view" data-requires="selection" data-disabled-title="Select evidence before exporting." title="Export selected evidence">Export Evidence</button><button class="btn secondary-btn" type="button" data-action="open-report-builder" data-requires="selection" data-disabled-title="Select evidence before generating reviewer report." title="Build reviewer report from selected evidence">Reviewer Report</button></div></details>`;
}
function renderInspector(){
  const b=selectedBranch();
  const n=selectedNode();
  const inventoryRow=selectedInventory();
  const relRow=selectedRel();
  const diagRow=selectedDiag();
  if(n){
    $('inspectorTitle').textContent=n.title;
    $('inspectorCaption').textContent=`${n.fn||'no function'}  -  ${n.scopeId}`;
    $('inspectorTabs').innerHTML=`<span class="app-mode-note">Evidence inspector</span>${renderContextActionMenu('Evidence')}`;
    syncActionAvailability();
    return renderNodeInspector(n);
  }
  if(b){
    $('inspectorTitle').textContent=b.label;
    $('inspectorCaption').textContent=`Action branch  -  Parent: ${b.parent.title}`;
    $('inspectorTabs').innerHTML=`<span class="app-mode-note">Evidence inspector</span>${renderContextActionMenu('Evidence')}`;
    syncActionAvailability();
    return renderBranchInspector(b);
  }
  if(inventoryRow){
    $('inspectorTitle').textContent=inventoryRow.title||'Inventory row';
    $('inspectorCaption').textContent=inventoryRow.scopeId||'Evidence object';
    $('inspectorTabs').innerHTML=`<span class="app-mode-note">Evidence inspector</span>${renderContextActionMenu('Evidence')}`;
    syncActionAvailability();
    return renderGenericInspector(inventoryRow,'Inventory row');
  }
  if(relRow){
    $('inspectorTitle').textContent=relRow.target||'Reference';
    $('inspectorCaption').textContent=relRow.scopeId||'Evidence object';
    $('inspectorTabs').innerHTML=`<span class="app-mode-note">Evidence inspector</span>${renderContextActionMenu('Evidence')}`;
    syncActionAvailability();
    return renderGenericInspector(relRow,'Reference');
  }
  if(diagRow){
    $('inspectorTitle').textContent=diagRow.title||'Diagnostic';
    $('inspectorCaption').textContent=diagRow.scopeId||'Evidence object';
    $('inspectorTabs').innerHTML=`<span class="app-mode-note">Evidence inspector</span>${renderContextActionMenu('Evidence')}`;
    syncActionAvailability();
    return renderGenericInspector(diagRow,'Diagnostic');
  }
  $('inspectorTitle').textContent='No rule selected';
  $('inspectorCaption').textContent='Select a rule, function, field, or route item to inspect evidence.';
  $('inspectorTabs').innerHTML=`<span class="app-mode-note">Evidence inspector</span>${renderContextActionMenu('Scope')}`;
  syncActionAvailability();
  return renderScopeInspector(currentScope());
}
function branchRoutePathObjects(b){const base=routePathObjects(b.parent);base.push({kind:'ActionBranch',branchId:b.branchId,parentNodeId:b.parent.id,label:b.label,actionListIndex:b.actionListIndex,routeState:b.routeState,resolved:b.resolved});return base;}
function branchPacket(b){const diags=branchDiagnostics(b),refs=branchReferences(b);return {schema:'AcWorkbench.SelectedActionBranchEvidence',schemaVersion:'1.0.0',copiedAt:new Date().toISOString(),scopeId:b.scopeId,branch:{branchId:b.branchId,parentNodeId:b.parent.id,parentRuleName:b.parent.title,parentFunctionName:b.parent.fn,label:b.label,actionListIndex:b.actionListIndex,routeState:b.routeState,resolved:b.resolved,childCount:b.childCount},routePath:branchRoutePathObjects(b),children:b.childNodes.map(n=>({nodeId:n.id,ruleName:n.title,functionName:n.fn,disabled:n.disabled,hasDiagnostics:hasDiag(n)})),relationships:refs.map(r=>({kind:r.kind,targetType:r.targetType,target:r.target,confidence:r.confidence,nodeId:r.nodeId})),diagnostics:diags.map(d=>({severity:d.severity,title:d.title,detail:d.detail,nodeId:d.nodeId})),notProven:['Action branch grouping is structural evidence from parsed parent action lists.','This is not native runtime execution proof.','Search and flow/projection output are not dependencies or runtime traces.']};}
function branchDiagnostics(b){const ids=new Set(branchSubtreeNodeIds(b));return model.diags.filter(d=>ids.has(String(d.nodeId)));}
function branchReferences(b){const ids=new Set(branchSubtreeNodeIds(b));return model.rels.filter(r=>ids.has(String(r.nodeId)));}
function branchSubtreeNodeIds(b){const out=[];const walk=id=>{out.push(String(id));childIds(id).forEach(walk);};b.childIds.forEach(walk);return out;}
function branchMarkdownReport(b){const p=branchPacket(b);return `# Action Branch Evidence\n\nScope: ${p.scopeId}\nParent rule: ${p.branch.parentRuleName}\nParent function: ${p.branch.parentFunctionName||'none'}\nAction: ${p.branch.label}\nRoute state: ${p.branch.routeState}\nChildren: ${p.branch.childCount}\n\n## Structural route\n${p.routePath.map(seg=>seg.kind==='ActionBranch'?`- Action: ${seg.label}`:`- Rule: ${seg.name}`).join('\n')}\n\n## Child rules\n${p.children.map(c=>`- ${c.ruleName} (${c.functionName||'no function'})${c.disabled!=='none'?` - ${c.disabled}`:''}`).join('\n')||'- None'}\n\n## Caveats\n${p.notProven.map(x=>`- ${x}`).join('\n')}\n`;}
function renderBranchInspector(b){const diags=branchDiagnostics(b);const summary=`<div class="kv">${kv('Branch label',`<span class="route-chip ${b.resolved?'resolved':'unresolved'}">${esc(b.label)}</span>`)}${kv('Parent rule',`<button class="btn ghost" type="button" data-node="${esc(b.parent.id)}">${esc(b.parent.title)}</button>`)}${kv('Parent function',`<span class="mono">${esc(b.parent.fn||'')}</span>`)}${kv('Action index',esc(b.actionListIndex??''))}${kv('Route state',esc(b.routeState))}${kv('Child rules',fmt(b.childCount))}${diags.length?kv('Diagnostics',`<span class="badge amber">${fmt(diags.length)}</span>`):''}</div><div class="branch-actions"><button class="btn" type="button" data-action="copy-branch-route">Copy branch path</button><button class="btn primary" type="button" data-action="export-branch-subtree">Export branch subtree</button></div>`;const route=`<div class="route-breadcrumb">${branchRoutePathObjects(b).map((seg,i)=>`${i?'<span class="route-arrow">-></span>':''}${seg.kind==='ActionBranch'?`<span class="route-step"><span class="route-chip ${seg.resolved?'resolved':'unresolved'}">Action: ${esc(seg.label)}</span></span>`:`<button class="route-step" type="button" data-node="${esc(seg.nodeId)}"><b>${esc(seg.name)}</b></button>`}`).join('')}</div><div class="caption mt-8">Structural route only. This is not a runtime execution trace.</div>`;const children=b.childNodes.length?`<div class="mini-list">${b.childNodes.map(n=>`<button class="quick-card" type="button" data-node="${esc(n.id)}"><b>${esc(n.title)}</b><span>${esc(n.fn||'no function')}  -  ${n.disabled==='none'?'not disabled':n.disabled}</span></button>`).join('')}</div>`:'<div class="muted">No child rules under this branch.</div>';setInspectionHtml(`${sectionHtml('Summary','branch',summary,true)}${sectionHtml('Route','path',route,true)}${sectionHtml('Child rules',b.childCount,children,true)}`);}

function selectedInspectionTitle(){
  const n=selectedNode(),b=selectedBranch(),inv=selectedInventory(),rel=selectedRel(),diag=selectedDiag(),scope=currentScope();
  if(n)return {title:n.title,meta:`${n.fn||'No function mapped'} - ${n.scopeId}`,kind:'Rule'};
  if(b)return {title:b.label,meta:`Action branch - Parent: ${b.parent.title}`,kind:'Branch'};
  if(inv)return {title:inv.title||'Inventory row',meta:inv.scopeId||'Evidence object',kind:'Inventory'};
  if(rel)return {title:rel.target||'Reference',meta:rel.scopeId||'Evidence object',kind:'Reference'};
  if(diag)return {title:diag.title||'Diagnostic',meta:diag.scopeId||'Evidence object',kind:'Diagnostic'};
  return {title:scope?.name||'Current scope',meta:scope?.scopeId||'No scope selected',kind:'Scope'};
}
function renderInspectionWorkspace(){
  const info=selectedInspectionTitle();
  $('content').innerHTML=`<div class="inspection-page"><div class="inspection-page-head"><div><div class="tree-detail-kicker">${esc(info.kind)} inspection</div><h3>${esc(info.title)}</h3><div class="tree-detail-sub">${esc(info.meta)}</div></div><div class="branch-actions"><button class="btn" type="button" data-action="view-structure">Back to structure</button><button class="btn" type="button" data-action="show-inspector">Open drawer</button><button class="btn primary" type="button" data-action="copy-rule-evidence" ${hasEvidenceSelection()?'':'disabled'}>Copy evidence</button></div></div><div id="inspectionPageBody" class="inspection-page-body"></div></div>`;
}
function hasVisibleQuery(x){const q=lower(state.query).trim();if(!q)return true;return matchesSearchQuery(x,q);}
function matchesSearchQuery(x,q){const blob=lower([x.searchBlob,JSON.stringify(x),x.title,x.fn,x.scopeId].join(' '));const terms=q.match(/"[^"]+"|\S+/g)||[];return terms.every(term=>{term=term.replace(/^"|"$/g,'');const gt=term.match(/^children>(\d+)$/i);if(gt)return Number(first(x.childCount,childIds(x.id).length,0))>Number(gt[1]);const parts=term.split(':');if(parts.length>1){const op=lower(parts.shift()),val=lower(parts.join(':').replace(/^"|"$/g,''));if(op==='function'||op==='fn')return lower(x.fn||x.FunctionName).includes(val);if(op==='field'||op==='target')return lower(x.target||x.Target||paramText(x.Parameters)).includes(val);if(op==='action'||op==='route')return lower(actionNamesOf(x).join(' ')+' '+(x.label||'')+' '+(x.searchBlob||'')).includes(val);if(op==='disabled')return val==='true'?disabledOf(x)!=='none':lower(x.disabled||disabledOf(x)).includes(val);if(op==='has'){if(val==='disabled')return disabledOf(x)!=='none'||x.disabled!=='none';if(val==='diagnostic'||val==='warning'||val==='warnings')return !!x.nodeId?model.diags.some(d=>String(d.nodeId)===String(x.nodeId)):hasDiag(x);if(val==='branches'||val==='children')return childIds(x.id).length>0||childRouteGroups(x.id).length>0;}if(op==='scope')return lower(x.scopeId||scopeIdOf(x)).includes(val);if(op==='guid')return lower(x.RuleGuid||x.ruleGuid).includes(val);if(op==='flatonly')return String(x.classification==='FlatOnly').includes(val);if(op==='diagnostic')return lower(x.title||x.detail||x.searchBlob).includes(val);}return blob.includes(lower(term));});}
function searchResults(){const q=lower(state.query).trim();if(!q)return [];const rows=[];for(const s of model.scopes){if(matchesSearchQuery({searchBlob:`${s.name} ${s.scopeId} ${s.kind}`},q))rows.push({kind:'Scope',scopeId:s.scopeId,title:s.name,subtitle:`${s.kind}  -  ${fmt(s.structural)} rules`,badges:[s.kind]});}
for(const n of model.nodes){if(matchesSearchQuery(n,q))rows.push({kind:'StructuralRule',scopeId:n.scopeId,nodeId:n.id,title:n.title,subtitle:`${n.fn||'no function'}  -  ${n.scopeId}`,badges:[n.disabled!=='none'?n.disabled:'Structural'].filter(Boolean),routePreview:model.incomingByChild.get(n.id)?.label||'root'});}for(const bkey of allBranchKeysForScope(state.scopeId)){const b=branchVmFromKey(bkey);if(b&&matchesSearchQuery({searchBlob:`${b.label} ${b.parent.title} ${b.parent.fn} ${b.scopeId}`},q))rows.push({kind:'ActionBranch',scopeId:b.scopeId,branchKey:b.key,title:`Action: ${b.label}`,subtitle:`Parent: ${b.parent.title}  -  ${fmt(b.childCount)} child rules`,badges:[b.routeState]});}
for(const r of model.rels){if(matchesSearchQuery(r,q))rows.push({kind:'Reference',scopeId:r.scopeId,nodeId:r.nodeId,title:`${r.kind}: ${r.target}`,subtitle:`${r.targetType}  -  ${r.confidence}`,badges:[r.confidence||'Reference']});}
for(const d of model.diags){if(matchesSearchQuery(d,q))rows.push({kind:'Diagnostic',scopeId:d.scopeId,nodeId:d.nodeId,title:d.title,subtitle:d.detail,badges:[d.severity]});}
return rows.slice(0,80);}
function renderSearchPopover(){const pop=$('searchPopover');if(!pop)return;const q=state.query.trim();if(!q){pop.classList.remove('open');pop.innerHTML='';state.searchActiveIndex=-1;$('globalSearch').setAttribute('aria-expanded','false');$('globalSearch').removeAttribute('aria-activedescendant');return;}const results=searchResults();if(!results.length)state.searchActiveIndex=-1;else state.searchActiveIndex=Math.max(0,Math.min(results.length-1,state.searchActiveIndex));pop.classList.add('open');$('globalSearch').setAttribute('aria-expanded','true');pop.innerHTML=`<div class="search-help">Operators: action:"Run Rules", function:_IGetDocAttr, has:disabled, children&gt;20, scope:DentalADA. Global search finds objects; the local filter narrows the current view.</div>${results.length?results.map((r,i)=>`<button id="searchResult-${i}" class="search-result ${i===state.searchActiveIndex?'active':''}" type="button" data-search-index="${i}" role="option" aria-selected="${i===state.searchActiveIndex?'true':'false'}"><span><b>${esc(r.title)}</b><span>${esc(r.kind)}  -  ${esc(r.subtitle||'')}</span></span><span>${(r.badges||[]).slice(0,2).map(b=>`<span class="badge blue">${esc(b)}</span>`).join('')}</span></button>`).join(''):'<div class="empty"><div>No matching objects.</div></div>'}`;pop._results=results;const activeId=state.searchActiveIndex>=0?`searchResult-${state.searchActiveIndex}`:'';if(activeId)$('globalSearch').setAttribute('aria-activedescendant',activeId);else $('globalSearch').removeAttribute('aria-activedescendant');}

  // Announce result counts for screen readers via the contentStatus live region.
  try{
    const statusNode = optionalElement('contentStatus');
    if(statusNode){
      const announced = results.length ? `${results.length} result${results.length===1?'':'s'} for "${q}"` : `No results for "${q}"`;
      statusNode.textContent = announced;
    }
  }catch(e){/* non-fatal */}
function closeSearchPopover(){const pop=$('searchPopover');if(!pop)return;pop.classList.remove('open');pop.innerHTML='';pop._results=[];state.searchActiveIndex=-1;$('globalSearch').setAttribute('aria-expanded','false');$('globalSearch').removeAttribute('aria-activedescendant');}
function setSearchActiveIndex(index){const pop=optionalElement('searchPopover');const results=pop?._results||[];if(!results.length){state.searchActiveIndex=-1;renderSearchPopover();return;}const max=results.length-1;state.searchActiveIndex=Math.max(0,Math.min(max,index));renderSearchPopover();const row=document.getElementById(`searchResult-${state.searchActiveIndex}`);row?.scrollIntoView({block:'nearest'});}
function handleSearchPopoverKeydown(e){const pop=optionalElement('searchPopover');const open=!!pop?.classList.contains('open');if(!open)return false;const results=pop?._results||[];if(!results.length)return false;if(e.key==='ArrowDown'){e.preventDefault();setSearchActiveIndex((state.searchActiveIndex<0?0:state.searchActiveIndex)+1);return true;}if(e.key==='ArrowUp'){e.preventDefault();setSearchActiveIndex((state.searchActiveIndex<0?results.length-1:state.searchActiveIndex)-1);return true;}if(e.key==='Enter'){const idx=state.searchActiveIndex<0?0:state.searchActiveIndex;const hit=results[Math.max(0,Math.min(results.length-1,idx))];if(hit){e.preventDefault();jumpToSearchResult(hit);return true;}}return false;}
function isSearchUiTarget(target){return !!target?.closest?.('.global-search,#searchPopover,[data-search-index]');}
// Build a nested, operator-first left object tree with grouped sections and direct actions.
function renderObjectTreeBlock(){
  const toTotal=rows=>rows.reduce((sum,row)=>sum+Number(first(row.count,0)),0);
  const scopeCountBy=matcher=>model.scopes.filter(s=>matcher(`${s.kind} ${s.name} ${s.scopeId}`)).length;
  const canonicalCounts=model.fwd?.overview?.counts||null;
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
    tables:first(model.fwd?.tables?.count,canonicalCounts?.tables,toTotal(tables)),
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
  const definitionRows=[
    row('view-resources','Resources',counts.resources,'Global resource definitions',state.workspaceView==='resources'),
    row('view-tables','Tables',counts.tables,'Global table definitions',state.workspaceView==='tables'),
    row('view-drivers','Input drivers',counts.drivers,'Global input/output driver definitions',state.workspaceView==='drivers'),
    row('view-udfs','UDFs',counts.udfs,'Global UDF/function definitions',state.workspaceView==='udfs')
  ];
  return `<div class="scope-group"><span>Global</span></div><div class="global-view-list" role="group" aria-label="Global definition catalogs">${section('Definitions',definitionRows,true)}</div><div class="scope-group"><span>Objects</span></div><div class="global-view-list" role="group" aria-label="Scope object presets">${section('Scope Presets',objectRows,false)}</div>`;
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
  document.querySelectorAll('[data-scope-filter]').forEach(btn=>{
    const active=btn.dataset.scopeFilter===state.scopeKindFilter;
    btn.classList.toggle('active',active);
    btn.setAttribute('aria-pressed',active?'true':'false');
  });
  const recentRows=state.recentScopes.map(id=>model.scopes.find(s=>s.scopeId===id)).filter(Boolean);
  $('recentScopes').innerHTML=recentRows.length?recentRows.map(s=>`<button class="recent-scope-btn ${s.scopeId===state.scopeId?'active':''}" type="button" data-scope="${esc(s.scopeId)}" title="${esc(s.scopeId)}">${esc(s.name)}</button>`).join(''):'';
  // Render a scope row button for a single scope entry.
  function scopeRowHtml(s){
    const active=s.scopeId===state.scopeId;
    const icon=/page/i.test(text(s.kind))?'P':/document|doc/i.test(text(s.kind))?'D':'S';
    return `<button class="scope-row ${active?'active':''}" type="button" data-scope="${esc(s.scopeId)}" aria-current="${active?'true':'false'}"><span class="scope-icon" aria-hidden="true">${icon}</span><span class="scope-row-main"><span class="scope-name">${esc(s.name)}</span><span class="scope-row-meta">${esc(s.scopeId)}</span></span></button>`;
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
    parts.push(renderObjectTreeBlock());
    parts.push('<div class="scope-group"><span>Scopes</span></div>');
    parts.push(scopeSectionHtml('Documents',docs,true));
    parts.push(scopeSectionHtml('Pages',pages,true));
    parts.push(scopeSectionHtml('Other',other,false));
    $('scopeList').innerHTML=parts.join('');
  }
}
function jumpToSearchResult(r){if(!r)return;closeSearchPopover();if(r.kind==='Scope')return selectScope(r.scopeId);if(r.kind==='ActionBranch'){selectScope(r.scopeId);selectBranch(r.branchKey);state.collapsedBranches.delete(r.branchKey);renderAll();return;}if(r.nodeId){selectScope(r.scopeId);selectNode(r.nodeId);return;}if(r.scopeId)selectScope(r.scopeId);}
// Global definition catalogs remain available from every selected scope.
function normalizeWorkspaceViewForScope(){
  if(!currentScope())return;
}
function renderAll(){return withUiGuard('render',()=>{saveState();normalizeWorkspaceViewForScope();renderTop();renderScopes();renderMainHead();renderContent();renderInspector();renderSearchPopover();syncOnboardingChecklist();syncActionAvailability();});}
function renderShellStatePanels(){
  const configEl=optionalElement('sourceSummaryConfig');
  const rulesEl=optionalElement('sourceSummaryRules');
  const warningsEl=optionalElement('sourceSummaryWarnings');
  const consoleBody=optionalElement('consoleBody');

  if(!model||bootState.phase==='loading'){
    if(configEl)configEl.textContent='Loading snapshot';
    if(rulesEl)rulesEl.textContent='Pending';
    if(warningsEl)warningsEl.textContent='Pending';
    if(consoleBody)consoleBody.innerHTML='<div class="console-row info"><span>activity</span><b>Loading evidence snapshot and sidecar data.</b></div>';
    return;
  }

  const scope=currentScope();
  const source=text(first(treeData.FwdPath,rulesData.FwdPath,treeData.SourcePath,rulesData.SourcePath,'Embedded snapshot'));
  const sourceName=source.split(/[\\/]/).filter(Boolean).pop()||source||'Embedded snapshot';
  const scopedRules=scopedRuleNodes().length;
  const diagnostics=scopedDiags();
  const totalWarnings=model.scopes.reduce((sum,s)=>sum+Number(first(s.warnings,0)),0);
  const hydration=canonicalHydrationSummary();

  if(configEl)configEl.textContent=sourceName;
  if(rulesEl)rulesEl.textContent=`${fmt(scopedRules)} in ${scope?.name||'current scope'}`;
  if(warningsEl)warningsEl.textContent=totalWarnings?`${fmt(totalWarnings)} warnings`:'Parse clean';

  document.querySelectorAll('[data-console-tab]').forEach(tab=>{
    const active=tab.dataset.consoleTab===state.consoleView;
    tab.classList.toggle('active',active);
    tab.setAttribute('aria-selected',active?'true':'false');
  });

  if(consoleBody){
    const diagnosticRows=diagnostics.slice(0,8).map(d=>{
      const sev=lower(d.severity||'warning');
      const cls=/error|fatal/.test(sev)?'warn':'warn';
      return `<button class="console-row ${cls}" type="button" data-diag="${esc(d.id)}"><span>${esc(d.severity||'warning')}</span><b>${esc(d.title||d.message||'Diagnostic')}</b><em>${esc(d.scopeId||'Unscoped')}</em></button>`;
    });
    const warningRows=diagnosticRows.length?diagnosticRows:['<div class="console-row ok"><span>warnings</span><b>No warnings in current scope</b><em>ready</em></div>'];
    const errorRows=diagnostics.filter(d=>/error|fatal/i.test(text(d.severity))).slice(0,8).map(d=>`<button class="console-row warn" type="button" data-diag="${esc(d.id)}"><span>${esc(d.severity||'error')}</span><b>${esc(d.title||d.message||'Diagnostic')}</b><em>${esc(d.scopeId||'Unscoped')}</em></button>`);
    const rowsByView={
      activity:[
        `<div class="console-row ${hydration.level==='warn'?'warn':'ok'}"><span>parse</span><b>${esc(hydration.level==='warn'?'Snapshot partially hydrated':'Snapshot loaded')}</b><em>${esc(snapshotId())}</em></div>`,
        `<div class="console-row info"><span>scope</span><b>${esc(scope?.name||scope?.scopeId||'Current scope')}</b><em>${fmt(scopedRules)} rules</em></div>`,
        ...(diagnosticRows.length?diagnosticRows.slice(0,4):['<div class="console-row ok"><span>diagnostics</span><b>No diagnostics in current scope</b><em>ready</em></div>'])
      ],
      warnings:warningRows,
      errors:errorRows.length?errorRows:['<div class="console-row ok"><span>errors</span><b>No parse errors in current scope</b><em>ready</em></div>'],
      exports:['<div class="console-row info"><span>exports</span><b>Use Export to build a selected evidence package</b><em>JSON</em></div>'],
      raw:[
        `<div class="console-row info"><span>snapshot</span><b>${esc(snapshotId())}</b><em>${fmt(model.nodes.filter(n=>n.isRule).length)} rules</em></div>`,
        `<div class="console-row ${hydration.level==='warn'?'warn':'ok'}"><span>api</span><b>${esc(canonicalHydrationSummary().label)}</b><em>${esc(canonicalHydrationState.mode)}</em></div>`
      ]
    };
    consoleBody.innerHTML=(rowsByView[state.consoleView]||rowsByView.activity).join('');
  }
}
function renderTop(){
  const banner=optionalElement('globalErrorBanner');
  if(banner&&bootState.phase!=='failed')banner.hidden=true;
  document.body.classList.toggle('is-loading',!model||bootState.phase==='loading');
  document.body.classList.toggle('is-loaded',!!model&&bootState.phase!=='loading');
  renderShellStatePanels();
  if(!model||bootState.phase==='loading'){
    $('sourceSubtitle').textContent='Loading evidence snapshot...';
    $('qualityPill').innerHTML='<span class="dot warn"></span><span>Snapshot loading</span>';
    $('globalSearch').value=state.query;
    syncActionAvailability();
    return;
  }
  const totalRules=model.nodes.filter(n=>n.isRule).length;
  const totalWarnings=model.scopes.reduce((sum,s)=>sum+Number(first(s.warnings,0)),0);
  const total=fmt(totalRules);
  const activeView=(state.workspaceView||'structure').toUpperCase();
  const hydration=canonicalHydrationSummary();
  $('sourceSubtitle').textContent=`${esc(activeView)} view`;
  const warnDot=hydration.level==='warn';
  const statusText=hydration.level==='warn'
    ? `Snapshot partial - ${fmt(totalWarnings)} warnings`
    : `${total} rules${totalWarnings?` - ${fmt(totalWarnings)} warnings`:' - parse clean'}`;
  $('qualityPill').innerHTML=`<span class="dot ${warnDot?'warn':''}"></span><span>${esc(statusText)}</span>`;
  $('globalSearch').value=state.query;
  syncActionAvailability();
}
function viewLabel(){
  const labels={all:'All structural nodes',disabled:'Disabled only',inherited:'Inherited disabled',warnings:'Diagnostics only',actions:'Action-branch parents',sections:'Sections and comments'};
  const base=labels[state.treeFilter]||'Filtered view';
  const q=text(state.query).trim();
  return q?`${base} | search: ${q}`:base;
}
function renderViewbar(){
  const scope=currentScope();
  const isDocOrPage=scope&&/^(document|page)$/i.test(text(scope.kind));
  const hasRule=!!selectedNode();
  const hasFilter=!!text(state.query).trim();
  const struct=state.workspaceView==='structure';
  const isGlobalView=['resources','tables','drivers','udfs'].includes(state.workspaceView);
  const viewButtons=[
    `<button class="btn ${struct?'primary':''}" type="button" data-action="view-structure" title="Inspect rule hierarchy, branch routes, and disabled inheritance">Structure</button>`,
    `<button class="btn ${state.workspaceView==='inspect'?'primary':''}" type="button" data-action="view-inspect" title="Open the selected object evidence and inspection page" ${hasEvidenceSelection()?'':'disabled'}>Inspect</button>`,
    `<button class="btn ${state.workspaceView==='field-resolution'?'primary':''}" type="button" data-action="view-field-resolution" title="Review unresolved field references and canonical matches">Fields</button>`
  ];
  const treeCommands=isDocOrPage
    ? `<div class="cmd-main" role="group" aria-label="Tree commands"><button class="btn primary" type="button" data-action="expand-selected-subtree" title="Expand the selected rule and all of its descendants" ${hasRule?'':'disabled'}>Expand selected</button><button class="btn" type="button" data-action="expand-all" title="Expand all visible structural rules and branches">Expand all</button><button class="btn" type="button" data-action="collapse-all" title="Collapse to top-level roots and branch headers">Collapse all</button>${state.focusNodeId?'<button class="btn" type="button" data-action="clear-focus" title="Return from focused subtree to full scope">Clear focus</button>':''}</div><div class="cmd-hint">Select a rule to expand or inspect details.</div>`
    : `<div class="cmd-main" role="group" aria-label="Tree commands"><button class="btn primary" type="button" data-action="expand-selected-subtree" title="Expand the selected rule and all descendants" ${hasRule?'':'disabled'}>Expand selected</button><button class="btn" type="button" data-action="expand-selected-depth" title="Expand one level below the selected rule" ${hasRule?'':'disabled'}>Expand +1</button><button class="btn" type="button" data-action="collapse-siblings" title="Collapse sibling branches near the selected rule" ${hasRule?'':'disabled'}>Collapse peers</button><button class="btn" type="button" data-action="expand-all" title="Expand all visible structural rules and branches">Expand all</button><button class="btn" type="button" data-action="collapse-all" title="Collapse to top-level roots and branch headers">Collapse all</button>${state.focusNodeId?'<button class="btn" type="button" data-action="clear-focus" title="Return from focused subtree to full scope">Clear focus</button>':''}</div><div class="cmd-hint">Select a rule row, then use Expand selected. Shortcuts: Alt+A Alt+D Alt+P.</div>`;
  const secondaryHint=isGlobalView
    ? '<div class="cmd-hint">Global definitions are independent of the selected document or page.</div>'
    : '<div class="cmd-hint">Use this view to narrow the current scope; select a row to inspect details.</div>';
  const html=`<div class="viewbar-shell quiet-viewbar"><div class="viewbar-left"><div class="cmd-main" role="group" aria-label="Workbench views">${viewButtons.join('')}</div>${isGlobalView?'':renderContextActionMenu('Scope')}<div class="field tree-filter"><label class="sr-only" for="viewSearch">Filter structure</label><input id="viewSearch" type="search" value="${esc(state.query)}" placeholder="Filter by rule, action, function, target, or disabled state"><button class="filter-clear" type="button" data-action="clear-tree-search" title="Clear current local filter" aria-label="Clear tree filter" ${hasFilter?'':'disabled'}>Clear</button></div>${struct?treeCommands:secondaryHint}</div></div>`;
  $('viewbar').innerHTML=html;
  syncViewSearchMeta();
}
function activeSliceHtml(){
  const scope=currentScope();
  const isDocOrPage=scope&&/^(document|page)$/i.test(text(scope.kind));
  const view=({structure:'Structure',inspect:'Inspect','field-resolution':'Field Resolution',resources:'Resources',tables:'Tables',drivers:'Drivers',udfs:'UDFs',audit:'Audit'})[state.workspaceView]||state.workspaceView.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const parts=(isDocOrPage&&state.workspaceView==='structure')?[]:[`View: ${view}`];
  if(scope)parts.push(`Scope: ${scope.scopeId}`);
  if(state.workspaceView==='structure'&&state.scopeKindFilter!=='all')parts.push(`Scope filter: ${state.scopeKindFilter}`);
  if(state.workspaceView==='udfs')parts.push(`UDF filter: ${udfFilterLabel(state.udfFilter)}`);
  if(text(state.query).trim())parts.push(`Search: ${text(state.query).trim()}`);
  if(selectedNode())parts.push(`Selected: ${selectedNode().title}`);
  else if(selectedBranch())parts.push(`Selected branch: ${selectedBranch().label}`);
  return `<div class="scope-summary" aria-label="Current viewer scope">${parts.map(p=>`<span>${esc(p)}</span>`).join('')}</div>`;
}
function treeSelectionPanelHtml(){
  const n=selectedNode();
  const b=selectedBranch();
  if(n){
    const children=childIds(n.id).length;
    return `<div class="tree-detail-card compact-selection"><div class="tree-detail-head"><div><div class="tree-detail-kicker">Selected rule</div><h3>${esc(n.title)}</h3><div class="tree-detail-sub">${esc(n.fn||'No function mapped')} - ${esc(n.scopeId)}</div></div><div class="tree-detail-badges">${n.disabled!=='none'?`<span class="badge amber">${esc(n.disabled)}</span>`:'<span class="badge green">enabled</span>'}<span class="badge blue">${fmt(children)} children</span></div></div><div class="tree-detail-actions"><button class="btn primary" type="button" data-action="view-inspect" title="Open full evidence and inspection view for this rule">Inspect evidence</button><button class="btn" type="button" data-action="expand-selected-subtree" title="Expand the full subtree rooted at this rule">Expand subtree</button><button class="btn" type="button" data-action="collapse-siblings" title="Collapse siblings around the selected rule">Collapse peers</button><button class="btn" type="button" data-action="copy-rule-evidence" title="Copy structured evidence payload for this rule">Copy evidence</button></div></div>`;
  }
  if(b){
    return `<div class="tree-detail-card compact-selection"><div class="tree-detail-head"><div><div class="tree-detail-kicker">Selected action branch</div><h3>${esc(b.label)}</h3><div class="tree-detail-sub">Parent: ${esc(b.parent.title)} - ${fmt(b.childCount)} child ${b.childCount===1?'rule':'rules'}</div></div><div class="tree-detail-badges"><span class="badge ${b.resolved?'green':'amber'}">${b.resolved?'resolved':'index-only'}</span></div></div><div class="tree-detail-actions"><button class="btn primary" type="button" data-action="view-inspect" title="Open full evidence and inspection view for this branch">Inspect evidence</button><button class="btn" type="button" data-action="copy-branch-route" title="Copy hierarchical route path including this branch">Copy branch path</button><button class="btn" type="button" data-action="copy-branch-evidence" title="Copy branch-focused evidence payload">Copy branch evidence</button></div></div>`;
  }
  return `<div class="tree-detail-card"><div><div class="tree-detail-kicker">Tree workspace</div><h3>No item selected</h3><div class="tree-detail-sub">Pick a rule or branch row to see details and contextual actions here.</div></div></div>`;
}
function renderStructure(){
  const rows=visibleStructureRows();
  const renderRows=rows;
  const treeHtml=renderRows.length
    ?`${treeSelectionPanelHtml()}<div class="tree" role="tree" aria-label="Structural rule tree">${renderRows.map(r=>r.type==='branch'?branchRow(r):treeRow(r.n,r.level)).join('')}</div>`
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
function scopeMarkdownReport(s){const stats=scopedRouteStats();const fr=getScopeFieldResolutionIndex(s.scopeId);const unresolvedTop=fr.rows.filter(r=>!r.fieldExists).slice(0,10);return `# Scope Evidence Report\n\nScope: ${s.name}\nScope ID: ${s.scopeId}\nKind: ${s.kind}\n\n## Counts\n- Structural rules: ${scopedRuleNodes().length}\n- Inventory rows: ${scopedInventory().length}\n- References: ${scopedRels().length}\n- Diagnostics: ${scopedDiags().length}\n\n## Route labels\n- Resolved: ${stats.resolved}\n- Index-only / unresolved: ${stats.indexOnly+stats.unresolved}\n\n## Field resolution\n- Referenced fields: ${fr.summary.referenced}\n- Resolved references: ${fr.summary.resolved}\n- Unresolved references: ${fr.summary.unresolved}\n- Rules with unresolved references: ${fr.summary.rulesWithUnresolved}\n\n## Top unresolved field references\n${unresolvedTop.map(r=>`- ${r.referencedField} (${r.parameterName}) in ${r.ruleName} [${r.nodeId}]`).join('\n')||'- None'}\n\n## Caveats\n- Structure is hierarchy/order/routing authority.\n- Inventory is search/completeness evidence only.\n- Field resolution is static catalog matching, not runtime proof.\n- Flow is experimental / low-confidence.\n`;}
function openReportBuilder(){state.modal='report';renderModal();}
function renderExportBuilder(){const n=selectedNode(),b=selectedBranch();return `<form id="exportForm" class="builder-grid"><div class="panel"><h3>Advanced export builder</h3><div class="kv">${kv('Selected object',esc(n?'Rule':b?'Action branch':'Scope'))}${kv('Scope',esc(currentScope().scopeId))}${kv('Snapshot',esc(snapshotId()))}</div><h4>Export view</h4><select class="full-width" name="view"><option value="auto">Auto - selected object</option><option value="rule">Selected rule evidence</option><option value="route">Selected rule route</option><option value="branch">Selected action branch</option><option value="subtree">Selected rule subtree</option><option value="diagnostics">Current scope diagnostics</option><option value="scopePacket">Full scope packet</option></select><h4>Format</h4><select class="full-width" name="format"><option value="json">JSON</option></select></div><div class="panel"><h3>Include</h3><div class="check-list"><label><input name="includeEvidence" type="checkbox" checked> Evidence and caveats</label><label><input name="includeReferences" type="checkbox" checked> References</label><label><input name="includeDiagnostics" type="checkbox" checked> Diagnostics</label><label><input name="includeRawAttributes" type="checkbox"> Raw attributes when available</label><label><input name="includeMarkdown" type="checkbox"> Also generate Markdown report</label></div><div class="branch-actions"><button class="btn primary" type="button" data-action="run-export-builder">Export JSON</button><button class="btn" type="button" data-action="run-reviewer-report">Generate reviewer report</button></div></div></form>`;}
function renderReviewerReport(){const md=generateReviewerReport();return `<div class="builder-grid"><div class="panel"><h3>Reviewer report generator</h3><p class="caption">Markdown report for tickets, review notes, vendor escalation, or release evidence. It keeps runtime caveats explicit.</p><div class="branch-actions"><button class="btn primary" type="button" data-action="download-reviewer-report">Download Markdown</button><button class="btn" type="button" data-action="copy-reviewer-report">Copy Markdown</button><button class="btn" type="button" data-action="export-view">Open export builder</button></div></div><div class="panel"><h3>Preview</h3><pre id="reportPreview" class="report-preview">${esc(md)}</pre></div></div>`;}
function renderContextHelp(topic){const content={
'action-branch':['Action branches are structural group rows owned by a parent rule.','A rule expands to branches; a branch expands to child rules.','Use branch selection when triaging route-specific outcomes.','A branch row is not runtime proof; it is parsed structural evidence.'],
'evidence':['Structural evidence proves hierarchy, action routing, branch order, and disabled inheritance.','References are confidence-coded static relationship evidence.','Diagnostics are reviewer cautions and should be resolved before high-confidence conclusions.','Flow remains experimental and should be treated as low-confidence guidance only.'],
'disabled':['Structural disabled state is authoritative when a tree node exists.','Flat PossiblyDisabledInherited is audit-only evidence and does not override structural authority.','Enabled rows are intentionally quiet to reduce visual noise.','When states disagree, prefer structural lineage and inspect parent nodes.']
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
function handleAction(a){if(a==='go-structure'){state.treeFilter='all';state.query='';state.treeQuery='';renderAll();toast('Structure workspace ready');return;}if(a==='clear-tree-search'){state.query='';state.treeQuery='';$('globalSearch').value='';renderContent();renderInspector();renderViewbar();renderSearchPopover();$('viewSearch')?.focus();return;}if(a==='show-diagnostics'){const d=scopedDiags()[0];if(d){state.selectedType='diag';state.selectedId=d.id;state.workspaceView='inspect';renderAll();}else toast('No diagnostics in this scope');return;}if(a==='open-help'){state.modal='help';renderModal();return;}if(a==='help-action-branch'||a==='help-evidence'||a==='help-disabled'){state.modal=a.replace(/^help-/,'help-');renderModal();return;}if(a==='close-modal'){closeModalRender();return;}if(a==='toggle-theme'){state.theme=state.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=state.theme;saveState();return;}if(a==='close-inspector'){document.body.classList.remove('inspector-open');saveState();return;}if(a==='show-inspector'){document.body.classList.add('inspector-open');saveState();return;}if(a==='expand-all'){const count=scopedRuleNodes().length;if(count>2500&&!confirm(`Expand ${fmt(count)} structural rules and all action branches? This can be slow.`))return;scopedNodes().forEach(n=>state.expanded.add(n.id));state.collapsedBranches.clear();renderAll();return;}if(a==='collapse-all'){state.expanded.clear();(model.rootsByScope.get(state.scopeId)||[]).forEach(id=>state.expanded.add(String(id)));state.collapsedBranches=new Set(allBranchKeysForScope(state.scopeId));renderAll();return;}if(a==='expand-selected-depth'){const n=selectedNode();if(!n){toast('Select a rule first');return;}state.expanded.add(n.id);collapseBranchesForNode(n.id);renderAll();return;}if(a==='expand-selected-subtree'){const n=selectedNode();if(!n){toast('Select a rule first');return;}subtreeNodes(n.id).forEach(x=>state.expanded.add(x.id));childRouteGroups(n.id).forEach(g=>state.collapsedBranches.delete(branchKey(n.id,g)));renderAll();return;}if(a==='collapse-siblings'){const n=selectedNode();if(!n){toast('Select a rule first');return;}const parent=model.parentByChild.get(n.id);if(parent){childIds(parent).filter(id=>id!==n.id).forEach(id=>state.expanded.delete(id));}renderAll();return;}if(a==='expand-action-groups'){allBranchKeysForScope(state.scopeId).forEach(k=>state.collapsedBranches.delete(k));renderAll();return;}if(a==='collapse-action-groups'){allBranchKeysForScope(state.scopeId).forEach(k=>state.collapsedBranches.add(k));renderAll();return;}if(a==='clear-focus'){state.focusNodeId='';renderAll();return;}if(a==='focus-selected'){const n=selectedNode();if(n){state.focusNodeId=n.id;state.expanded.add(n.id);collapseBranchesForNode(n.id);renderAll();}return;}if(a==='view-inspect'){if(!hasEvidenceSelection())state.selectedType='scope';state.workspaceView='inspect';renderAll();return;}if(a==='open-linked-node'){const obj=selectedInventory()||selectedRel();if(obj&&obj.nodeId){selectNode(obj.nodeId);}else toast('No linked structural node');return;}if(a==='export-view'){openExportBuilder();return;}if(a==='open-report-builder'){openReportBuilder();return;}if(a==='run-export-builder'){executeExport();return;}if(a==='run-reviewer-report'){state.modal='report';renderModal();return;}if(a==='download-reviewer-report'){download(`ac-reviewer-report-${slug(selectedNode()?.title||selectedBranch()?.label||currentScope().name)}.md`,generateReviewerReport(),'text/markdown');return;}if(a==='copy-reviewer-report'){copyText(generateReviewerReport());return;}if(a==='copy-route-path'){const n=selectedNode();if(!n){toast('Select a structural rule first');return;}copyText(JSON.stringify(selectedRoutePathPacket(n),null,2));return;}if(a==='copy-rule-evidence'){const b=selectedBranch();if(b){copyText(JSON.stringify(branchPacket(b),null,2));return;}const n=selectedNode();if(!n){toast('Select a rule or branch first');return;}copyText(JSON.stringify(selectedRuleEvidencePacket(n),null,2));return;}if(a==='copy-branch-route'){const b=selectedBranch();if(!b){toast('Select an action branch first');return;}copyText(JSON.stringify({schema:'AcWorkbench.ActionBranchRoutePath',scopeId:b.scopeId,routePath:branchRoutePathObjects(b)},null,2));return;}if(a==='copy-branch-evidence'){const b=selectedBranch();if(!b){toast('Select an action branch first');return;}copyText(JSON.stringify(branchPacket(b),null,2));return;}if(a==='export-branch-subtree'){const b=selectedBranch();if(!b){toast('Select an action branch first');return;}download(`ac-branch-subtree-${slug(b.label)}.json`,JSON.stringify({...buildExportPayload({view:'branch',includeEvidence:true})},null,2),'application/json');return;}if(a==='first-warning-scope'){const s=model.scopes.find(x=>x.warnings>0);if(s)selectScope(s.scopeId);return;}if(a==='largest-scope'){const s=[...model.scopes].sort((a,b)=>b.structural-a.structural)[0];if(s)selectScope(s.scopeId);return;}}
function viewSearchMeta(){
  if(state.workspaceView==='structure')return {label:'Filter structure',placeholder:'Filter structure by rule, action, function, target, or disabled state'};
  if(state.workspaceView==='inspect')return {label:'Filter inspection context',placeholder:'Search within current evidence context via global search'};
  if(state.workspaceView==='field-resolution')return {label:'Filter field resolution',placeholder:'Filter field references by field name, rule, function, or parameter'};
  if(state.workspaceView==='resources')return {label:'Filter resources',placeholder:'Filter global resource definitions'};
  if(state.workspaceView==='tables')return {label:'Filter tables',placeholder:'Filter global table definitions by name or column'};
  if(state.workspaceView==='drivers')return {label:'Filter drivers',placeholder:'Filter global input/output driver definitions'};
  if(state.workspaceView==='udfs')return {label:'Filter UDFs',placeholder:'Filter global UDF/function definitions'};
  if(state.workspaceView==='audit')return {label:'Filter audit',placeholder:'Filter diagnostics, references, unresolved routes, or ambiguous correlation'};
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
function wire(){document.addEventListener('click',e=>{if(!isSearchUiTarget(e.target))closeSearchPopover();const act=e.target.closest('[data-action]')?.dataset.action;if(act){if(act==='view-structure'||act==='view-field-resolution'||act==='view-resources'||act==='view-tables'||act==='view-drivers'||act==='view-udfs'||act==='view-audit'){e.preventDefault();state.workspaceView=act.replace(/^view-/,'');renderAll();return;}if(act==='nav-documents'||act==='nav-pages'||act==='nav-batches'||act==='nav-processes'){e.preventDefault();applyEditorNavPreset(act.replace(/^nav-/,''));saveState();return;}e.preventDefault();handleAction(act);return;}const sr=e.target.closest('[data-search-index]')?.dataset.searchIndex;if(sr!==undefined){const results=$('searchPopover')?._results||[];jumpToSearchResult(results[Number(sr)]);return;}const consoleTab=e.target.closest('[data-console-tab]')?.dataset.consoleTab;if(consoleTab){state.consoleView=consoleTab;renderShellStatePanels();saveState();return;}const udfFilter=e.target.closest('[data-udf-filter]')?.dataset.udfFilter;if(udfFilter){state.udfFilter=udfFilter;state.selectedUdfName='';renderAll();return;}const fieldFilter=e.target.closest('[data-field-filter]')?.dataset.fieldFilter;if(fieldFilter){state.fieldResolutionFilter=fieldFilter;renderContent();saveState();return;}const sf=e.target.closest('[data-scope-filter]')?.dataset.scopeFilter;if(sf){state.scopeKindFilter=sf;saveState();renderScopes();return;}const sc=e.target.closest('[data-scope]')?.dataset.scope;if(sc){selectScope(sc);return;}const tog=e.target.closest('[data-toggle-node]')?.dataset.toggleNode;if(tog){const nodeId=String(tog);if(state.expanded.has(nodeId)){state.expanded.delete(nodeId);}else{state.expanded.add(nodeId);collapseBranchesForNode(nodeId);}renderContent();renderViewbar();renderInspector();return;}const br=e.target.closest('[data-toggle-branch]')?.dataset.toggleBranch;if(br){state.collapsedBranches.has(br)?state.collapsedBranches.delete(br):state.collapsedBranches.add(br);renderContent();renderViewbar();renderInspector();return;}const branch=e.target.closest('[data-branch]')?.dataset.branch;if(branch){selectBranch(branch);return;}const node=e.target.closest('[data-node]')?.dataset.node;if(node){selectNode(node);return;}const inv=e.target.closest('[data-inventory]')?.dataset.inventory;if(inv){state.selectedType='inventory';state.selectedId=inv;state.workspaceView='inspect';renderAll();return;}const rel=e.target.closest('[data-rel]')?.dataset.rel;if(rel){state.selectedType='rel';state.selectedId=rel;state.workspaceView='inspect';renderAll();return;}const diag=e.target.closest('[data-diag]')?.dataset.diag;if(diag){state.selectedType='diag';state.selectedId=diag;state.workspaceView='inspect';renderAll();return;}});
  document.addEventListener('input',e=>{if(e.target.id==='scopeSearch'){closeSearchPopover();state.scopeQuery=e.target.value;renderScopes();}else if(e.target.id==='globalSearch'||e.target.id==='viewSearch'){if(searchDebounceTimer)window.clearTimeout(searchDebounceTimer);searchDebounceTimer=window.setTimeout(()=>applyQueryInput(e.target.value),120);}});
  document.addEventListener('search',e=>{if(e.target.id==='globalSearch'||e.target.id==='viewSearch')applyQueryInput(e.target.value);});
  document.addEventListener('change',e=>{if(e.target.id==='treeFilter')state.treeFilter=e.target.value;renderContent();renderInspector();renderViewbar();});
  document.addEventListener('keydown',e=>{if(state.modal)handleModalFocusTrap(e);const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'');
    // Keyboard navigation for console tabs when a tab has focus
    try{
      const activeEl = document.activeElement;
      if(!typing && activeEl && activeEl.getAttribute && activeEl.getAttribute('role')==='tab'){
        const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
        const idx = tabs.indexOf(activeEl);
        if(idx>=0){
          if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();tabs[(idx+1)%tabs.length].focus();return;}
          if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();tabs[(idx-1+tabs.length)%tabs.length].focus();return;}
          if(e.key==='Home'){e.preventDefault();tabs[0].focus();return;}
          if(e.key==='End'){e.preventDefault();tabs[tabs.length-1].focus();return;}
          if(e.key==='Enter'||e.key===' '){e.preventDefault();activeEl.click();return;}
        }
      }
    }catch(e){/* non-fatal */}

    if((e.ctrlKey||e.metaKey)&&lower(e.key)==='k'){e.preventDefault();$('globalSearch').focus();$('globalSearch').select();return;}if(typing&&handleSearchPopoverKeydown(e))return;if(e.key==='Escape'){if(state.modal){closeModalRender();return;}closeSearchPopover();document.body.classList.remove('inspector-open');return;}if(!typing&&e.key==='/'){e.preventDefault();$('globalSearch').focus();return;}if(!typing&&e.altKey&&lower(e.key)==='a'){e.preventDefault();handleAction('expand-all');return;}if(!typing&&e.altKey&&lower(e.key)==='d'){e.preventDefault();handleAction('expand-selected-depth');return;}if(!typing&&e.altKey&&lower(e.key)==='p'){e.preventDefault();handleAction('collapse-siblings');return;}if(!typing&&e.altKey&&lower(e.key)==='f'){e.preventDefault();handleAction('clear-focus');return;}if(!typing&&lower(e.key)==='e'){e.preventDefault();openExportBuilder();return;}if(!typing&&lower(e.key)==='r'){e.preventDefault();openReportBuilder();return;}if(!typing&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();moveSelection(e.key==='ArrowDown'?1:-1);return;}if(!typing&&(e.key==='ArrowRight'||e.key==='ArrowLeft'||e.key===' '||e.key==='Enter'||e.key==='Home'||e.key==='End')){handleTreeKey(e);}});
}
function wireTableSelection(){document.addEventListener('click',e=>{const tableName=e.target.closest('[data-table-name]')?.dataset.tableName;if(!tableName)return;state.selectedTableName=tableName;renderContent();saveState();});}
function wireUdfSelection(){document.addEventListener('click',e=>{const udfName=e.target.closest('[data-udf-name]')?.dataset.udfName;if(!udfName)return;e.preventDefault();state.selectedUdfName=udfName;state.workspaceView='udfs';renderAll();saveState();});}
function wireGlobalDefinitionSelection(){document.addEventListener('click',e=>{const resourceKey=e.target.closest('[data-resource-key]')?.dataset.resourceKey;if(resourceKey){e.preventDefault();state.selectedResourceKey=resourceKey;state.workspaceView='resources';renderAll();saveState();return;}const driverKey=e.target.closest('[data-driver-key]')?.dataset.driverKey;if(driverKey){e.preventDefault();state.selectedDriverKey=driverKey;state.workspaceView='drivers';renderAll();saveState();}});}
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

  return withUiGuard('boot',()=>{if(!model.scopes.length){renderNoData();return;}restoreSnapshotState();if(!model.scopes.some(s=>s.scopeId===state.scopeId))state.scopeId=model.scopes[0].scopeId;seedExpanded(state.scopeId);wire();wireGuidanceHints();wireOnboardingChecklist();wireTableSelection();wireUdfSelection();wireGlobalDefinitionSelection();renderAll();});
}

init();
})();

