
(function(){
'use strict';
// v62.12 resource-hydration fix: unwraps API data, loads canonical UDF/table endpoints, and displays tables/UDFs without hiding confirmed FWD resources.
/*
  FormWorks Editor generated viewer.

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
let fwdSidecarData = null;
const advancedSidecarState = { loaded:false, objectGraph:null, runtimeImpact:null };
const viewerDiagnostics = {
  build: 'v103-fw-editor-viewer',
  bootStartedAtUtc: new Date().toISOString(),
  events: [],
  fetches: [],
  errors: [],
  latestCounts: {}
};

function diagnosticCount(value){
  if(Array.isArray(value))return value.length;
  if(value&&Array.isArray(value.items))return value.items.length;
  if(value&&Array.isArray(value.Items))return value.Items.length;
  if(value&&typeof value.count==='number')return value.count;
  if(value&&typeof value.Count==='number')return value.Count;
  return 0;
}
function payloadCounts(){
  const counts={
    rules: diagnosticCount(rulesData?.Rules||rulesData?.rules),
    scopes: diagnosticCount(treeData?.Scopes||treeData?.scopes),
    nodes: diagnosticCount(treeData?.Nodes||treeData?.nodes),
    edges: diagnosticCount(treeData?.Edges||treeData?.edges),
    relationships: diagnosticCount(relData?.Relationships||relData?.relationships||relData?.Edges||relData?.edges),
    fwdResources: diagnosticCount(fwdData?.resources||fwdSidecarData?.resources),
    fwdRuleLists: diagnosticCount(fwdData?.ruleLists||fwdSidecarData?.ruleLists),
    fwdUdfs: diagnosticCount(fwdData?.udfs||fwdSidecarData?.udfs),
    fwdTables: diagnosticCount(fwdData?.tables||fwdSidecarData?.tables),
    fwdFunctions: diagnosticCount(fwdData?.functions||fwdSidecarData?.functions)
  };
  viewerDiagnostics.latestCounts=counts;
  return counts;
}

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

function recordViewerDiagnostic(level,event,details={}){
  try { fwBootPlaceholderDiagnosticBridge(event, details); } catch (_) { }
  const entry={utc:new Date().toISOString(),level,event,details};
  viewerDiagnostics.events.push(entry);
  if(viewerDiagnostics.events.length>250)viewerDiagnostics.events.shift();
  if(level==='error')viewerDiagnostics.errors.push(entry);
  const method=level==='error'?'error':level==='warn'?'warn':'info';
  try{ console[method](`[FW Viewer] ${event}`,details); }catch{}
}
function recordViewerFetch(key,url,status,elapsedMs,extra={}){
  const entry={utc:new Date().toISOString(),key,url,status,elapsedMs,...extra};
  viewerDiagnostics.fetches.push(entry);
  if(viewerDiagnostics.fetches.length>300)viewerDiagnostics.fetches.shift();
  try{ console.info('[FW Viewer] fetch',entry); }catch{}
}
function modelCounts(){
  if(!model)return {model:false};
  return {
    model:true,
    scopes:diagnosticCount(model.scopes),
    nodes:diagnosticCount(model.nodes),
    rules:diagnosticCount(model.nodes?.filter?.(n=>n&&n.isRule)),
    inventory:diagnosticCount(model.inventory),
    relationships:diagnosticCount(model.rels),
    diagnostics:diagnosticCount(model.diags)
  };
}
window.fwViewerDiagnostics=function(){
  return {
    href: window.location.href,
    bootState: typeof bootState==='undefined'?null:{phase:bootState.phase,detail:bootState.detail},
    payloadCounts: payloadCounts(),
    modelCounts: modelCounts(),
    fwdApiHydrationState: typeof fwdApiHydrationState==='undefined'?null:{mode:fwdApiHydrationState.mode,failedEndpoints:[...list(fwdApiHydrationState.failedEndpoints||[])]},
    granularSidecarState: typeof window.fwViewerGranularState==='function'?window.fwViewerGranularState():null,
    diagnostics: viewerDiagnostics
  };
};

const embeddedPayload = (typeof window !== 'undefined' && window.AC_RULE_VIEWER_PAYLOADS) ? window.AC_RULE_VIEWER_PAYLOADS : {
  rulesData: "__RULES_JSON__",
  relData: "__RELATIONSHIPS_JSON__",
  treeData: "__TREE_JSON__",
  fwdData: "__FWD_JSON__",
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
    recordViewerDiagnostic('info','embedded-payload-loaded',{counts:payloadCounts()});
    return true;
  }

  recordViewerDiagnostic('info','embedded-payload-not-present',{});
  return false;
}

function embeddedFwdDataOrNull(){
  if(fwdSidecarData)return fwdSidecarData;
  const parsed=tryParseEmbeddedPayload(first(embeddedPayload.fwdData,embeddedPayload.fwdDataJson,embeddedPayload.fwd));
  return parsed&&typeof parsed==='object'?parsed:null;
}

function applyEmbeddedFwdDataIfPresent(failedEndpoints=[]){
  const embedded=embeddedFwdDataOrNull();
  if(!embedded)return false;
  fwdData=embedded;
  applyAdvancedSidecarsToFwdData();
  fwdApiHydrationState.mode='embedded';
  fwdApiHydrationState.failedEndpoints=list(failedEndpoints);
  recordViewerDiagnostic('info','embedded-fwd-data-applied',{failedEndpoints:list(failedEndpoints),counts:payloadCounts()});
  return true;
}

let fwdApiHydrationPromise = null;
function queryFlag(name){
  try{return new URLSearchParams(window.location.search).get(name);}catch{return null;}
}
function truthyQueryFlag(name){return /^(1|true|yes|on)$/i.test(text(queryFlag(name)||''));}
function falseyQueryFlag(name){return /^(0|false|no|off)$/i.test(text(queryFlag(name)||''));}
function isFwdApiDisabledByQuery(){return falseyQueryFlag('fwdApi')||falseyQueryFlag('api');}
function shouldHydrateFwdApiOnBoot(missingStaticFwd=false){
  if(isFwdApiDisabledByQuery()||falseyQueryFlag('apiHydrate'))return false;
  if(truthyQueryFlag('apiHydrate')||truthyQueryFlag('hydrate'))return true;
  // Default fast path: use the generated static sidecar/model and avoid endpoint fan-out on every launch.
  // If no static FWD sidecar exists, hydrate after boot so resource views still become available when hosted.
  return !!missingStaticFwd;
}
function scheduleFwdApiHydration(reason='idle'){
  if(fwdApiHydrationPromise){
    recordViewerDiagnostic('info','fwd-api-hydration-already-scheduled',{reason});
    return fwdApiHydrationPromise;
  }
  recordViewerDiagnostic('info','fwd-api-hydration-scheduled',{reason});
  const run=()=>beginFwdApiHydration(reason);
  if(typeof window.requestIdleCallback==='function'){
    window.requestIdleCallback(run,{timeout:2500});
  }else{
    window.setTimeout(run,250);
  }
  return fwdApiHydrationPromise;
}
function beginFwdApiHydration(reason='manual'){
  if(fwdApiHydrationPromise)return fwdApiHydrationPromise;
  const started=Date.now();
  recordViewerDiagnostic('info','fwd-api-hydration-start',{reason});
  fwdApiHydrationPromise=loadFwdApiData().then(()=>{
    recordViewerDiagnostic('info','fwd-api-hydration-data-loaded',{reason,elapsedMs:Date.now()-started,mode:fwdApiHydrationState.mode,failedEndpoints:list(fwdApiHydrationState.failedEndpoints||[]),counts:payloadCounts()});
    if(typeof model!=='undefined'&&model){
      model=buildModel();
      recordViewerDiagnostic('info','model-rebuilt-after-api-hydration',{counts:modelCounts()});
      globalDefinitionLookupCache=null;
      globalTableDefinitionsCache=null;
      globalUdfDefinitionsCache=null;
      globalFunctionDefinitionsCache=null;
      globalNavigationCountsCache=null;
      productCountsCache=null;
      ruleListPacketDefinitionsCache=null;
      if(typeof ensureUsefulWorkspaceSelection==='function'){
        ensureUsefulWorkspaceSelection('api-hydration');
      }
      renderAll();
    }
  }).catch(error=>{
    recordViewerDiagnostic('error','fwd-api-hydration-failed',{reason,message:error&&error.message?error.message:String(error||'Unknown error')});
    console.warn('FW Editor Viewer: background FWD API hydration failed.',error);
  });
  return fwdApiHydrationPromise;
}

// Load large FWD snapshot payloads from sidecar JSON files so the viewer shell can bootstrap faster.
function applyAdvancedSidecarsToFwdData(){
  if(!isAdvancedMode()||!fwdData)return;
  if(advancedSidecarState.objectGraph)fwdData.objectGraph=advancedSidecarState.objectGraph;
  if(advancedSidecarState.runtimeImpact)fwdData.runtimeImpact=advancedSidecarState.runtimeImpact;
}

async function loadAdvancedStaticFwdSidecars(fetchJsonWithFallback){
  if(!isAdvancedMode()||advancedSidecarState.loaded)return;
  advancedSidecarState.loaded=true;
  try{ advancedSidecarState.objectGraph=await fetchJsonWithFallback('ac-rule-viewer.advanced.object-graph.json'); }catch{}
  try{ advancedSidecarState.runtimeImpact=await fetchJsonWithFallback('ac-rule-viewer.advanced.runtime-impact.json'); }catch{}
  if(fwdSidecarData&&typeof fwdSidecarData==='object'){
    if(advancedSidecarState.objectGraph)fwdSidecarData.objectGraph=advancedSidecarState.objectGraph;
    if(advancedSidecarState.runtimeImpact)fwdSidecarData.runtimeImpact=advancedSidecarState.runtimeImpact;
  }
  applyAdvancedSidecarsToFwdData();
}


function snapshotSidecarsHaveContent(rulesPayload,treePayload,relationshipPayload){
  const ruleCount=list(first(rulesPayload?.Rules,rulesPayload?.rules,[])).length;
  const scopeCount=list(first(treePayload?.Scopes,treePayload?.scopes,[])).length;
  const nodeCount=list(first(treePayload?.Nodes,treePayload?.nodes,[])).length;
  const edgeCount=list(first(treePayload?.Edges,treePayload?.edges,[])).length;
  const relCount=list(first(relationshipPayload?.Relationships,relationshipPayload?.relationships,relationshipPayload?.Edges,relationshipPayload?.edges,[])).length;
  return ruleCount>0||scopeCount>0||nodeCount>0||edgeCount>0||relCount>0;
}

async function loadHostedApiViewerBootstrap(){
  const protocol=(window.location&&window.location.protocol)||'';
  if(isFwdApiDisabledByQuery()){
    recordViewerDiagnostic('info','hosted-bootstrap-skipped',{reason:'api-disabled-by-query'});
    return false;
  }
  if(!/^https?:$/i.test(protocol)){
    recordViewerDiagnostic('info','hosted-bootstrap-skipped',{reason:'non-http-protocol',protocol});
    return false;
  }
  const bases=['/api/v1','./api/v1','../api/v1','../../api/v1'];
  recordViewerDiagnostic('info','hosted-bootstrap-start',{bases,href:window.location.href});
  for(const base of bases){
    const slash=base.endsWith('/')?'':'/';
    const url=`${base}${slash}viewer/bootstrap?snapshotMode=live`;
    const started=Date.now();
    try{
      const controller=new AbortController();
      const timeoutId=window.setTimeout(()=>controller.abort(),15000);
      const response=await fetch(url,{cache:'no-store',signal:controller.signal});
      window.clearTimeout(timeoutId);
      recordViewerFetch('viewer/bootstrap',url,response.status,Date.now()-started,{ok:response.ok});
      if(!response.ok)continue;
      const payload=await response.json();
      const data=payload&&payload.ok===true?payload.data:payload;
      if(!data||!data.rulesData||!data.treeData){
        recordViewerDiagnostic('warn','hosted-bootstrap-invalid-payload',{base,hasData:!!data,keys:data?Object.keys(data):[]});
        continue;
      }
      rulesData=data.rulesData||{Rules:[]};
      relData=data.relData||{Relationships:[]};
      treeData=data.treeData||{Scopes:[],Nodes:[],Edges:[]};
      fwdSidecarData=data.fwdData||data.fwd||null;
      if(fwdSidecarData){
        fwdData=fwdSidecarData;
        fwdApiHydrationState.mode='live-bootstrap';
        fwdApiHydrationState.failedEndpoints=[];
      }
      const hasContent=snapshotSidecarsHaveContent(rulesData,treeData,relData);
      recordViewerDiagnostic(hasContent?'info':'warn','hosted-bootstrap-loaded',{base,hasContent,mode:data.mode||'unknown',counts:payloadCounts(),bootstrap:data.counts||null});
      scheduleFwdApiHydration('live-bootstrap');
      return hasContent;
    }catch(error){
      recordViewerFetch('viewer/bootstrap',url,'error',Date.now()-started,{message:error&&error.message?error.message:String(error||'Unknown error')});
    }
  }
  recordViewerDiagnostic('warn','hosted-bootstrap-unavailable',{});
  return false;
}



let staticFullSidecarHydrationPromise = null;

function staticViewerSidecarBaseCandidates(){
  return ['', './', '../', '../../', '../../../', '../../../../', '../../../../../', '/'];
}

async function fetchStaticViewerJsonWithFallback(file, options = {}){
  const timeoutMs = Number(options.timeoutMs || 12000);
  const optional = !!options.optional;

  for(const base of staticViewerSidecarBaseCandidates()){
    const url = `${base}${file}`;
    const started = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      window.clearTimeout(timeoutId);

      recordViewerFetch(file, url, response.status, Date.now() - started, { ok: response.ok, source: 'static-sidecar' });

      if(!response.ok) continue;

      const raw = await response.text();
      return JSON.parse(raw.replace(/^\uFEFF/, ''));
    }
    catch(error) {
      recordViewerFetch(file, url, 'error', Date.now() - started, {
        source: 'static-sidecar',
        optional,
        message: error && error.message ? error.message : String(error || 'Unknown error')
      });
    }
  }

  if(optional) return null;
  throw new Error(`Failed to load ${file}: file was not reachable from known paths.`);
}

function rulesDataFromBootSidecar(boot){
  const nodes = list(first(boot?.nodes, boot?.Nodes, []));
  const rules = nodes
    .filter(n => !!first(n.IsRuleNode, n.isRuleNode, n.isRule))
    .map((n, i) => ({
      RuleGuid: n.RuleGuid,
      RuleId: n.RuleId,
      RuleName: n.RuleName,
      FunctionName: n.FunctionName,
      ScopePath: n.ScopePath,
      ScopeName: n.ScopeName,
      ScopeType: n.ScopeType,
      RuleIndex: first(n.RuleIndexWithinScope, n.RuleIndex, i),
      RuleIndexWithinScope: first(n.RuleIndexWithinScope, n.RuleIndex, i),
      ActionListIndex: n.ActionListIndex,
      ActionNames: n.ActionNames || [],
      DisabledState: n.DisabledState,
      DisabledAncestorNodeId: n.DisabledAncestorNodeId,
      Parameters: {},
      Sources: ['BootSidecar'],
      BootOnly: true
    }));

  return {
    ProcessName: first(boot?.snapshot?.ProcessName, boot?.ProcessName, ''),
    RuleCount: first(boot?.counts?.rules, rules.length),
    Rules: rules,
    RulesByFunction: boot?.summaries?.rulesByFunction || [],
    RulesByActionName: boot?.summaries?.rulesByActionName || [],
    RulesByDisabledState: boot?.summaries?.rulesByDisabledState || [],
    Bootstrap: { mode: 'static-boot-sidecar', fullDetailsHydrateAfterPaint: true }
  };
}

function fwdSummaryFromBootSidecar(boot){
  const counts = boot?.counts || {};
  return {
    overview: {
      source: {
        process: first(boot?.snapshot?.ProcessName, ''),
        readMode: 'read-only',
        snapshotStrategy: 'static-boot-sidecar'
      },
      counts: {
        scopes: counts.scopes || 0,
        structuralRules: counts.ruleNodes || counts.rules || 0,
        flatInventoryRows: counts.rules || 0,
        relationships: 0,
        diagnostics: counts.diagnostics || 0,
        resources: counts.fwdResources || 0,
        udfs: counts.fwdUdfs || 0,
        tables: counts.fwdTables || 0,
        functions: counts.fwdFunctions || 0
      }
    },
    ruleLists: { count: 0, items: [], lazy: true },
    functions: { count: counts.fwdFunctions || 0, items: [], lazy: true },
    tables: { count: counts.fwdTables || 0, items: [], lazy: true },
    selectionLists: { count: 0, items: [], lazy: true },
    udfs: { count: counts.fwdUdfs || 0, items: [], lazy: true },
    resources: { count: counts.fwdResources || 0, items: [], lazy: true }
  };
}

async function tryLoadStaticBootSidecar(){
  if(falseyQueryFlag('bootSidecar')) return false;

  const boot = await fetchStaticViewerJsonWithFallback('ac-rule-viewer.boot.json', { timeoutMs: 5000, optional: true });
  if(!boot || typeof boot !== 'object') return false;

  const nodes = list(first(boot.nodes, boot.Nodes, []));
  const scopes = list(first(boot.scopes, boot.Scopes, []));
  const edges = list(first(boot.edges, boot.Edges, []));

  if(!nodes.length && !scopes.length) return false;

  treeData = {
    SnapshotId: boot.snapshot?.SnapshotId,
    GeneratedAtUtc: boot.snapshot?.GeneratedAtUtc,
    RequireNativeOk: boot.snapshot?.RequireNativeOk,
    ProcessName: boot.snapshot?.ProcessName,
    ScopeCount: boot.counts?.scopes || scopes.length,
    NodeCount: boot.counts?.nodes || nodes.length,
    RuleNodeCount: boot.counts?.ruleNodes || nodes.filter(n => n.IsRuleNode).length,
    EdgeCount: boot.counts?.edges || edges.length,
    DiagnosticCount: boot.counts?.diagnostics || 0,
    Scopes: scopes,
    Nodes: nodes,
    Edges: edges,
    Diagnostics: [],
    Bootstrap: { mode: 'static-boot-sidecar', fullDetailsHydrateAfterPaint: true }
  };

  rulesData = rulesDataFromBootSidecar(boot);
  relData = { Relationships: [], Diagnostics: [], Bootstrap: { mode: 'static-boot-sidecar', fullDetailsHydrateAfterPaint: true } };
  fwdSidecarData = fwdSummaryFromBootSidecar(boot);
  fwdData = fwdSidecarData;

  fwdApiHydrationState.mode = 'boot-sidecar';
  fwdApiHydrationState.failedEndpoints = [];

  recordViewerDiagnostic('info', 'static-boot-sidecar-loaded', { counts: payloadCounts(), bootCounts: boot.counts || null });
  return true;
}

function scheduleStaticFullSidecarHydration(reason = 'boot-sidecar'){
  recordViewerDiagnostic('info', 'static-full-sidecar-hydration-skipped', {
    reason,
    detail: 'Disabled because background full hydration causes full-body rerender flicker.'
  });
  return null;
}

function beginStaticFullSidecarHydration(reason = 'boot-sidecar'){
  if(staticFullSidecarHydrationPromise) return staticFullSidecarHydrationPromise;

  const started = Date.now();
  recordViewerDiagnostic('info', 'static-full-sidecar-hydration-start', { reason });

  staticFullSidecarHydrationPromise = (async () => {
    const loadedRules = await fetchStaticViewerJsonWithFallback('ac-rule-viewer.rules.json', { timeoutMs: 30000 });
    const loadedRel = await fetchStaticViewerJsonWithFallback('ac-rule-viewer.rel.json', { timeoutMs: 30000 });
    const loadedTree = await fetchStaticViewerJsonWithFallback('ac-rule-viewer.tree.json', { timeoutMs: 30000 });
    const loadedFwd = await fetchStaticViewerJsonWithFallback('ac-rule-viewer.fwd.json', { timeoutMs: 30000, optional: true });

    rulesData = loadedRules || rulesData;
    relData = loadedRel || relData;
    treeData = loadedTree || treeData;

    if(loadedFwd && typeof loadedFwd === 'object'){
      fwdSidecarData = loadedFwd;
      fwdData = loadedFwd;
      applyAdvancedSidecarsToFwdData();
    }

    fwdApiHydrationState.mode = loadedFwd ? 'static-full-sidecars' : 'static-full-sidecars-no-fwd';
    fwdApiHydrationState.failedEndpoints = [];

    recordViewerDiagnostic('info', 'static-full-sidecars-loaded', {
      reason,
      elapsedMs: Date.now() - started,
      counts: payloadCounts()
    });

    if(typeof model !== 'undefined' && model){
      model = buildModel();
      recordViewerDiagnostic('info', 'model-rebuilt-after-static-full-sidecars', { counts: modelCounts() });

      globalDefinitionLookupCache = null;
      globalTableDefinitionsCache = null;
      globalUdfDefinitionsCache = null;
      globalFunctionDefinitionsCache = null;
      globalNavigationCountsCache = null;
      productCountsCache = null;
      ruleListPacketDefinitionsCache = null;

      if(typeof ensureUsefulWorkspaceSelection === 'function'){
        ensureUsefulWorkspaceSelection('static-full-sidecars');
      }

      renderAll();
    }
  })().catch(error => {
    recordViewerDiagnostic('error', 'static-full-sidecar-hydration-failed', {
      reason,
      message: error && error.message ? error.message : String(error || 'Unknown error')
    });
  });

  return staticFullSidecarHydrationPromise;
}

async function loadViewerData(){
  recordViewerDiagnostic('info','load-viewer-data-start',{href:window.location.href});
  if(typeof tryLoadGranularIndexMode==='function'){
    const granularLoaded = await tryLoadGranularIndexMode();
    if(granularLoaded){
      recordViewerDiagnostic('info','load-viewer-data-complete',{source:'granular-index',counts:payloadCounts()});
      return;
    }
  }
  if(applyEmbeddedPayloadIfPresent()){
    const hasStaticFwd=applyEmbeddedFwdDataIfPresent();
    if(shouldHydrateFwdApiOnBoot(!hasStaticFwd))scheduleFwdApiHydration('embedded-boot');
    return;
  }

  const bootSidecarLoaded=await tryLoadStaticBootSidecar();
  if(bootSidecarLoaded){
    recordViewerDiagnostic('info','static-full-sidecar-hydration-skipped',{reason:'disabled-to-prevent-full-body-rerender'});
    recordViewerDiagnostic('info','load-viewer-data-complete',{source:'static-boot-sidecar',counts:payloadCounts()});
    return;
  }

  // Hosted API mode is the normal source-clean workflow. Try it before static
  // sidecar probing so /viewer does not spam optional ac-rule-viewer.*.json 404s.
  // Standalone static exports still work because we fall back to sidecars below.
  const hostedBootstrap=await loadHostedApiViewerBootstrap();
  if(hostedBootstrap){
    recordViewerDiagnostic('info','load-viewer-data-complete',{source:'hosted-bootstrap',counts:payloadCounts()});
    return;
  }
  recordViewerDiagnostic('warn','load-viewer-data-falling-back-to-sidecars',{});

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
        const started=Date.now();
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        window.clearTimeout(timeoutId);
        recordViewerFetch(file,url,response.status,Date.now()-started,{ok:response.ok,source:'static-sidecar'});
        if(response.ok) return await response.json();
      } catch(error) {
        recordViewerFetch(file,`${base}${file}`,'error',0,{source:'static-sidecar',message:error&&error.message?error.message:String(error||'Unknown error')});
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
  let staticSidecarsLoaded=false;
  try {
    const entries = Object.entries(files);
    const results = await Promise.all(entries.map(async ([key, file]) => {
      return [key, await fetchJsonWithFallback(file)];
    }));

    for (const [key, value] of results) {
      if (key === 'rulesData') rulesData = value;
      else if (key === 'relData') relData = value;
      else if (key === 'treeData') treeData = value;
    }

    staticSidecarsLoaded=snapshotSidecarsHaveContent(rulesData,treeData,relData);
    recordViewerDiagnostic(staticSidecarsLoaded?'info':'warn','static-sidecars-loaded',{loaded:staticSidecarsLoaded,counts:payloadCounts()});

    if(staticSidecarsLoaded){
      try {
        const optionalFwd = await fetchJsonWithFallback('ac-rule-viewer.fwd.json');
        if (optionalFwd && typeof optionalFwd === 'object') fwdSidecarData = optionalFwd;
      } catch {
        // Older exports may not include the optional static FWD global-resource sidecar.
      }
    }
  } catch {
    staticSidecarsLoaded=false;
  }

  if(!staticSidecarsLoaded){
    recordViewerDiagnostic('error','viewer-data-unavailable',{reason:'No hosted bootstrap and no static sidecars responded.'});
    throw new Error('No usable viewer sidecar JSON was found, and the hosted live-lazy bootstrap endpoint was unavailable.');
  }

  await loadAdvancedStaticFwdSidecars(fetchJsonWithFallback);
  const hasStaticFwd=applyEmbeddedFwdDataIfPresent();
  if(shouldHydrateFwdApiOnBoot(!hasStaticFwd))scheduleFwdApiHydration('static-boot');
  recordViewerDiagnostic('info','load-viewer-data-complete',{source:'static-sidecars',counts:payloadCounts(),hasStaticFwd});
}

// Attempt to hydrate defined FWD object surfaces from API v1 when viewer is hosted with the editor viewer server.
async function loadFwdApiData(){
  recordViewerDiagnostic('info','fwd-api-load-start',{href:window.location.href});
  if(isFwdApiDisabledByQuery()){
    recordViewerDiagnostic('warn','fwd-api-load-disabled-by-query',{reason:'api-disabled-by-query'});
    if(!applyEmbeddedFwdDataIfPresent()){
      fwdData = null;
      fwdApiHydrationState.mode = 'none';
      fwdApiHydrationState.failedEndpoints = [];
    }
    return;
  }
    // Respect explicit defined opt-out in query string to avoid unnecessary API probing and console 404 noise.
  const fwdApiParam = new URLSearchParams(window.location.search).get('fwdApi');
  if(fwdApiParam && /^(off|false|0|no)$/i.test(fwdApiParam)){
    recordViewerDiagnostic('warn','fwd-api-load-disabled-by-query',{fwdApiParam});
    if(!applyEmbeddedFwdDataIfPresent()){
      fwdData = null;
      fwdApiHydrationState.mode = 'none';
      fwdApiHydrationState.failedEndpoints = [];
    }
    return;
  }

  const protocol=(window.location&&window.location.protocol)||'';
  if(!/^https?:$/i.test(protocol)){
    recordViewerDiagnostic('warn','fwd-api-load-skipped',{reason:'non-http-protocol',protocol});
    if(!applyEmbeddedFwdDataIfPresent()){
      fwdData = null;
      fwdApiHydrationState.mode = 'none';
      fwdApiHydrationState.failedEndpoints = [];
    }
    return;
  }

  const baseCandidates=['/api/v1','./api/v1','../api/v1','../../api/v1'];
  const snapshotMode=(()=>{const mode=new URLSearchParams(window.location.search).get('snapshotMode');return mode==='live'?'live':'snapshot';})();
  const liveMinRefreshSeconds=(()=>{
    const raw=new URLSearchParams(window.location.search).get('liveMinRefreshSeconds');
    const parsed=Number(raw);
    return Number.isFinite(parsed)&&parsed>0?Math.min(3600,Math.max(1,Math.round(parsed))):30;
  })();
  const timeoutMs=22000;
  const endpointStages=[
    [
      ['overview','fwd/overview'],
      ['resources','fwd/resources?includeDetails=true&includePrivate=true'],
      ['functions','fwd/functions'],
      ['tables','fwd/tables'],
      ['udfs','fwd/udfs']
    ],
    [
      ['selectionLists','fwd/selection-lists?includeInferred=true'],
      ['ruleLists','rule-lists'],
      ['canonicalUdfs','fwd/udfs/canonical'],
      ...(isAdvancedMode()?[
        ['objectGraph','fwd/object-graph'],
        ['runtimeImpact','fwd/runtime-impact']
      ]:[])
    ],
    [
      ['editorModel',isAdvancedMode()?'editor-model?include=ruleLists,objectGraph,udfs,selectionLists,pageDesigns,runtimeImpacts':'editor-model?include=ruleLists,udfs,selectionLists,pageDesigns'],
      ['documents','fwd/documents'],
      ['pages','fwd/pages'],
      ['batches','fwd/batches'],
      ['processes','fwd/processes'],
      ['processDrivers','fwd/processes/drivers'],
      ['pageDesigns','fwd/page-designs'],
      ['pageVariants','fwd/page-variants'],
      ['fields','fwd/fields']
    ]
  ];
  async function fetchApi(path){
    for(const base of baseCandidates){
      const slash=base.endsWith('/')?'':'/';
      const separator=path.includes('?')?'&':'?';
      const liveRefreshParam=snapshotMode==='live'?`&liveMinRefreshSeconds=${liveMinRefreshSeconds}`:'';
      const withMode=`${base}${slash}${path}${separator}snapshotMode=${snapshotMode}${liveRefreshParam}`;
      const started=Date.now();
      try{
        const controller=new AbortController();
        const timeoutId=window.setTimeout(()=>controller.abort(),timeoutMs);
        const response=await fetch(withMode,{cache:'no-store',signal:controller.signal});
        window.clearTimeout(timeoutId);
        recordViewerFetch(path,withMode,response.status,Date.now()-started,{ok:response.ok,source:'fwd-api'});
        if(!response.ok) continue;
        const payload=await response.json();
        if(payload&&payload.ok===true&&payload.data!==undefined) return {ok:true,data:payload.data,status:response.status};
        recordViewerDiagnostic('warn','fwd-api-invalid-envelope',{path,base,keys:payload?Object.keys(payload):[]});
      }catch(error){
        recordViewerFetch(path,withMode,'error',Date.now()-started,{source:'fwd-api',message:error&&error.message?error.message:String(error||'Unknown error')});
        // Keep probing candidate bases.
      }
    }
    return {ok:false,data:null};
  }

  const hydrated={};
  const failed=[];
  const embeddedFwd=embeddedFwdDataOrNull();
  const packet=key=>hydrated[key]!==undefined&&hydrated[key]!==null?hydrated[key]:embeddedFwd?.[key];
  const applyHydrated=()=>{
    if(!packet('overview'))return false;
    fwdData={
      editorModel:packet('editorModel'),
      overview:packet('overview'),
      documents:packet('documents'),
      pages:packet('pages'),
      batches:packet('batches'),
      processes:packet('processes'),
      processDrivers:packet('processDrivers'),
      resources:packet('resources'),
      objectGraph:isAdvancedMode()?packet('objectGraph'):undefined,
      functions:packet('functions'),
      ruleLists:packet('ruleLists'),
      tables:packet('tables'),
      selectionLists:packet('selectionLists'),
      udfs:packet('udfs'),
      canonicalUdfs:packet('canonicalUdfs'),
      runtimeImpact:isAdvancedMode()?packet('runtimeImpact'):undefined,
      pageDesigns:packet('pageDesigns'),
      pageVariants:packet('pageVariants'),
      fields:packet('fields')
    };
    fwdApiHydrationState.mode='hydrating';
    fwdApiHydrationState.failedEndpoints=list(failed);
    recordViewerDiagnostic('info','fwd-api-hydrated-partial',{failedEndpoints:list(failed),counts:payloadCounts()});
    return true;
  };

  for(let stageIndex=0;stageIndex<endpointStages.length;stageIndex++){
    const stage=endpointStages[stageIndex];
    recordViewerDiagnostic('info','fwd-api-stage-start',{stage:stageIndex+1,endpoints:stage.map(x=>x[0])});
    const stageStarted=Date.now();
    const settled=await Promise.all(stage.map(async ([key,path])=>({key,path,result:await fetchApi(path)})));
    settled.forEach(entry=>{
      hydrated[entry.key]=entry.result.data;
      if(!entry.result.ok)failed.push(entry.key);
    });
    recordViewerDiagnostic('info','fwd-api-stage-complete',{stage:stageIndex+1,elapsedMs:Date.now()-stageStarted,ok:settled.filter(x=>x.result.ok).map(x=>x.key),failed:list(failed)});
    applyHydrated();
  }

  if(!packet('overview')){
    if(!applyEmbeddedFwdDataIfPresent(failed)){
      fwdData=null;
      fwdApiHydrationState.mode='none';
      fwdApiHydrationState.failedEndpoints=failed;
      recordViewerDiagnostic('error','fwd-api-load-no-overview',{failedEndpoints:list(failed)});
    }
    return;
  }

  applyHydrated();
  fwdApiHydrationState.mode=failed.length?(embeddedFwd?'partial+embedded':'partial'):'full';
  fwdApiHydrationState.failedEndpoints=failed;
  recordViewerDiagnostic(failed.length?'warn':'info','fwd-api-load-complete',{mode:fwdApiHydrationState.mode,failedEndpoints:list(failed),counts:payloadCounts()});
}
function $(id){
  const el=document.getElementById(id);
  if(!el) throw new Error(`Required UI element was not found: #${id}`);
  return el;
}
function optionalElement(id){ return document.getElementById(id); }
const viewerStateBuild='v103-fw-editor-viewer';
const storeKey=`fw-editor-viewer-${viewerStateBuild}`;
const themeStoreKey=`${storeKey}-theme`;
const inspectorSections=['summary','parameters','attributes','actions','references','messages','raw'];
const list=x=>Array.isArray(x)?x:(x==null?[]:[x]);
const first=(...xs)=>xs.find(x=>x!==undefined&&x!==null&&String(x).length>0);
const text=x=>String(x??'');
const lower=x=>text(x).toLowerCase();
const fmt=n=>Number(n||0).toLocaleString();
const messageFilterModes=['all','error','warning','info','rule-validation','missing-refs','linked'];
function normalizeMessageFilter(value){
  const v=lower(value).replace(/_/g,'-');
  return messageFilterModes.includes(v)?v:'all';
}
const esc=s=>text(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const slug=s=>text(s).replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'')||'scope';
const rxEsc=s=>text(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function hasProcessToken(processName,value){
  const key=text(processName).trim();
  if(!key)return false;
  return new RegExp(`(^|[^a-z0-9])${rxEsc(key)}([^a-z0-9]|$)`,'i').test(text(value));
}

function boundedPreviewValue(value,options={},depth=0,seen){
  const opts={
    maxDepth:Number(options.maxDepth||4),
    maxArray:Number(options.maxArray||60),
    maxKeys:Number(options.maxKeys||80),
    maxString:Number(options.maxString||500),
    maxNodes:Number(options.maxNodes||1800)
  };
  const refs=seen||{weak:new WeakSet(),nodes:0,truncated:false};
  refs.nodes+=1;
  if(refs.nodes>opts.maxNodes){refs.truncated=true;return '[Preview truncated: too many values]';}
  if(value===null||value===undefined)return value;
  const type=typeof value;
  if(type==='string'){
    return value.length>opts.maxString?`${value.slice(0,opts.maxString)}… (${fmt(value.length)} chars)`:value;
  }
  if(type==='number'||type==='boolean')return value;
  if(type==='function')return '[Function]';
  if(depth>=opts.maxDepth){refs.truncated=true;return Array.isArray(value)?`[Array(${value.length})]`:'[Object]';}
  if(type==='object'){
    if(refs.weak.has(value)){refs.truncated=true;return '[Circular]';}
    refs.weak.add(value);
    if(Array.isArray(value)){
      const out=value.slice(0,opts.maxArray).map(item=>boundedPreviewValue(item,opts,depth+1,refs));
      if(value.length>opts.maxArray){refs.truncated=true;out.push(`… ${fmt(value.length-opts.maxArray)} more item(s)`);}
      return out;
    }
    const out={};
    const keys=Object.keys(value);
    keys.slice(0,opts.maxKeys).forEach(key=>{
      if(/^(raw|rel|node|resourceEvidence|privateTree|children|nodes|edges)$/i.test(key)){
        out[key]=summaryForLargeValue(value[key]);
      }else{
        out[key]=boundedPreviewValue(value[key],opts,depth+1,refs);
      }
    });
    if(keys.length>opts.maxKeys){refs.truncated=true;out['…']=`${fmt(keys.length-opts.maxKeys)} more key(s)`;}
    return out;
  }
  return text(value);
}
function summaryForLargeValue(value){
  if(value==null)return value;
  if(Array.isArray(value))return `[Array(${fmt(value.length)})]`;
  if(typeof value==='object')return `[Object(${fmt(Object.keys(value).length)} keys)]`;
  const s=text(value);
  return s.length>180?`${s.slice(0,180)}…`:s;
}
function previewJson(value,options={}){
  const tracker={weak:new WeakSet(),nodes:0,truncated:false};
  const preview=boundedPreviewValue(value,options,0,tracker);
  let json='';
  try{json=JSON.stringify(preview,null,2);}
  catch(error){json=`"[Preview unavailable: ${text(error&&error.message||error)}]"`;}
  const maxChars=Number(options.maxChars||18000);
  if(json.length>maxChars){tracker.truncated=true;json=`${json.slice(0,maxChars)}\n… (${fmt(json.length-maxChars)} more chars)`;}
  return {json,truncated:tracker.truncated};
}
function previewJsonHtml(value,options={}){
  const result=previewJson(value,options);
  const note=result.truncated?'Large object preview is capped to keep the viewer responsive. Use the exported snapshot for full raw data.':'Preview is bounded to avoid slow browser renders.';
  return `<details class="raw-preview" ${options.open?'open':''}><summary><span>Raw preview</span><b>${result.truncated?'capped':'bounded'}</b></summary><div class="raw-preview-note">${esc(note)}</div><pre class="raw compact">${esc(result.json)}</pre></details>`;
}
function definitionSearchText(row){
  return lower([
    row?.name,row?.key,row?.type,row?.source,row?.metric,
    row?.searchBlob,
    row?.fn?.name,row?.fn?.category,row?.udf?.displayName,row?.udf?.rawName,
    row?.table?.name,row?.table?.resourceType,
    row?.selectionList?.name,row?.selectionList?.tableDriver,
    row?.ruleList?.scopeId,row?.ruleList?.name,row?.ruleList?.kind,
    row?.node?.id,row?.node?.kind,row?.node?.name,
    row?.impact?.scopeId,row?.impact?.ruleName,row?.impact?.functionName,row?.impact?.impactType,row?.impact?.summary,
    list(row?.table?.columns).slice(0,20).map(c=>c.name||c.Name||c.column||c.Column).join(' '),
    list(row?.table?.matchFields).slice(0,20).map(c=>c.name||c.Name).join(' '),
    list(row?.table?.plugFields).slice(0,20).map(c=>c.name||c.Name).join(' '),
    list(row?.selectionList?.matchFields).slice(0,30).map(c=>c.name||c.Name).join(' '),
    list(row?.selectionList?.plugFields).slice(0,30).map(c=>c.name||c.Name).join(' '),
    list(row?.impact?.behaviorFlags).join(' '),
    list(row?.details?.names).slice(0,30).join(' '),
    list(row?.usage).slice(0,80).map(u=>[u.scopeId,u.ruleName,u.functionName,u.target,u.targetType,u.relationshipKind].join(' ')).join(' ')
  ].join(' '));
}

function safeJson(s,fallback){
  try { return JSON.parse(s); }
  catch (error) {
    console.warn('FW Editor Viewer: failed to parse JSON state; using fallback.', error);
    return fallback;
  }
}
function readStorage(key){
  try { return window.localStorage ? localStorage.getItem(key) : null; }
  catch (error) {
    console.warn('FW Editor Viewer: localStorage read failed.', error);
    return null;
  }
}
function writeStorage(key,value){
  try { if (window.localStorage) localStorage.setItem(key,value); }
  catch (error) { console.warn('FW Editor Viewer: localStorage write failed.', error); }
}
function readState(){
  const saved=safeJson(readStorage(storeKey)||'{}',{});
  const savedLeft=Number(saved.paneLeftWidth);
  const savedRight=Number(saved.paneRightWidth);
  const savedEditorTreeWidth=Number(saved.editorTreeWidth);
  const savedEditorMessageHeight=Number(saved.editorMessageHeight);
  const savedInspectorView=text(saved.inspectorView||'summary');
  return {
    scopeId:saved.scopeId||'',query:'',treeQuery:'',scopeQuery:'',scopeKindFilter:saved.scopeKindFilter||'all',treeFilter:'all',
    selectedType:'scope',selectedId:'',expanded:new Set(),collapsedActionLists:new Set(),
    workspaceView:saved.workspaceView&&saved.workspaceView!=='overview'?saved.workspaceView:'structure',
    fieldResolutionFilter:saved.fieldResolutionFilter||'unresolved',
    inventoryFilter:['all','StructuralMatch','AdditionalRule','FlatOnly','direct','inherited'].includes(saved.inventoryFilter)?saved.inventoryFilter:'all',
    messageFilter:normalizeMessageFilter(saved.messageFilter),
    inspectorView:(()=>{const view=savedInspectorView==='config'?'fields':savedInspectorView==='actions'?'status-results':savedInspectorView;return ['general','fields','attributes','status-results','description','references','messages','raw','summary'].includes(view)?view:'general';})(),
    rulePropertyPage:(()=>{const page=text(saved.rulePropertyPage||savedInspectorView||'general');const normalized=page==='summary'?'general':page==='config'?'fields':page==='actions'?'status-results':page;return ['general','fields','attributes','status-results','description'].includes(normalized)?normalized:'general';})(),
    focusNodeId:'',theme:['light','dark'].includes(saved.theme)?saved.theme:'light',density:saved.density==='high'?'high':'standard',modal:'',
    selectedResourceKey:saved.selectedResourceKey||'',
    selectedFunctionName:saved.selectedFunctionName||'',
    selectedDriverKey:saved.selectedDriverKey||'',
    selectedObjectGraphKey:saved.selectedObjectGraphKey||'',
    selectedRuleListKey:saved.selectedRuleListKey||'',
    selectedSelectionListName:saved.selectedSelectionListName||'',
    selectedRuntimeImpactKey:saved.selectedRuntimeImpactKey||'',
    selectedProcessName:text(saved.selectedProcessName||''),
    globalDetailKind:'',
    selectedTableName:saved.selectedTableName||'',
    selectedUdfName:saved.selectedUdfName||'',
    editorPropertyPage:(()=>{const page=saved.editorPropertyPage;return ['general','usage','reader-status','raw'].includes(page)?page:'general';})(),
    udfEditorTab:['general','parameters','callers','rule-list'].includes(saved.udfEditorTab)?saved.udfEditorTab:'general',
    editorMessageExpanded:saved.editorMessageExpanded===true,
    udfFilter:['all','with-callers','defined','unparsed'].includes(saved.udfFilter)?saved.udfFilter:'all',
    paneLeftWidth:Number.isFinite(savedLeft)?savedLeft:320,
    paneRightWidth:Number.isFinite(savedRight)?savedRight:380,
    editorTreeWidth:Number.isFinite(savedEditorTreeWidth)?savedEditorTreeWidth:276,
    editorMessageHeight:Number.isFinite(savedEditorMessageHeight)?savedEditorMessageHeight:104,
    recentScopes:Array.isArray(saved.recentScopes)?saved.recentScopes:[],searchActiveIndex:-1,inspectorOpen:false,disclosureLevel:Number(saved.disclosureLevel||1)||1
  };
}
const state=readState();document.documentElement.dataset.theme=state.theme;
let toastTimer=0;
let searchDebounceTimer=0;
let activeEditorResize=null;
let modalPreviouslyFocusedEl=null;
let scopeFieldResolutionCache=new Map();
const fwdApiHydrationState={mode:'none',failedEndpoints:[]};
const checklistDismissedKey='fw-editor-viewer-onboarding-dismissed';
const checklistCollapsedKey='fw-editor-viewer-onboarding-collapsed';
function applyDensityClass(density){const mode=density==='high'?'high':'standard';state.density=mode;document.body.classList.remove('density-high','density-standard');document.body.classList.add(`density-${mode}`);}
function isDesktopPrimaryDevice(){return window.matchMedia('(min-width: 1280px) and (pointer: fine)').matches;}
function isCompactShellLayout(){
  const w=Math.max(window.innerWidth||0,document.documentElement.clientWidth||0);
  const coarse=window.matchMedia('(pointer: coarse)').matches;
  return w<1180||coarse;
}
function isAdvancedMode(){
  try{
    const value=new URLSearchParams(window.location.search).get('advanced');
    return /^(1|true|yes|on|dev)$/i.test(text(value));
  }catch{return false;}
}
function advancedWorkspaceViews(){
  return isAdvancedMode()?['object-graph','runtime-impact']:[];
}
function visibleDefinitionPriority(kinds){
  return isAdvancedMode()?kinds:list(kinds).filter(k=>k!=='object-graph'&&k!=='runtime-impact');
}
function viewportTier(){const w=Math.max(window.innerWidth||0,document.documentElement.clientWidth||0);if(w>=2200)return 'ultra';if(w>=1700)return 'wide';return 'regular';}
function desktopPreset(){const candidate=Math.max(window.screen?.width||0,window.innerWidth||0);if(candidate>=3600)return 'uhd';if(candidate>=2400)return 'qhd';return 'default';}
function applyViewportProfile(){
  const compact=isCompactShellLayout()&&!isEditorMode();
  const desktopPrimary=isDesktopPrimaryDevice()&&!compact;
  document.body.classList.toggle('compact-shell',compact);
  document.body.classList.toggle('desktop-primary',desktopPrimary);
  document.body.classList.remove('desktop-wide','desktop-ultra','desktop-qhd','desktop-uhd');
  if(desktopPrimary){
    const tier=viewportTier();
    if(tier==='wide')document.body.classList.add('desktop-wide');
    else if(tier==='ultra')document.body.classList.add('desktop-ultra');
    const preset=desktopPreset();
    if(preset==='qhd')document.body.classList.add('desktop-qhd');
    else if(preset==='uhd')document.body.classList.add('desktop-uhd');
  }
  applyDensityClass(state.density);
}
applyViewportProfile();window.addEventListener('resize',()=>{applyViewportProfile();applyPaneLayout();});
function clampNumber(value,min,max){return Math.max(min,Math.min(max,Number(value)||0));}
function paneWidthStep(value,min,max,fallback,step=20){return Math.round(clampNumber(Number(value)||fallback,min,max)/step)*step;}
function syncPaneLayoutClasses(root,leftWidth,rightWidth,compact=false){
  if(!root)return;
  root.className=String(root.className)
    .replace(/\bshell-left-w-\d+\b/g,'')
    .replace(/\bshell-right-w-\d+\b/g,'')
    .replace(/\bshell-compact-widths\b/g,'')
    .replace(/\s{2,}/g,' ')
    .trim();
  if(compact){
    root.classList.add('shell-compact-widths');
    return;
  }
  root.classList.add(`shell-left-w-${leftWidth}`,`shell-right-w-${rightWidth}`);
}
function applyPaneLayout(){
  const root=document.documentElement;
  const shell=optionalElement('mainContent')?.closest?.('.shell');
  if(!shell)return;
  const compact=document.body.classList.contains('compact-shell')&&!isEditorMode();
  if(compact){
    syncPaneLayoutClasses(root,0,0,true);
    return;
  }
  const shellWidth=Math.max(1024,shell.getBoundingClientRect?.().width||window.innerWidth||1024);
  const rightVisible=document.body.classList.contains('inspector-open');
  const splitterSpace=rightVisible?18:10;
  const mainMin=shellWidth>=1700?760:shellWidth>=1280?620:520;
  const leftMin=shellWidth>=1280?240:220;
  const rightMin=shellWidth>=1280?280:260;
  const preferredRight=rightVisible?state.paneRightWidth:rightMin;
  const maxLeft=Math.max(leftMin,Math.min(560,shellWidth-mainMin-preferredRight-splitterSpace));
  const maxRight=Math.max(rightMin,Math.min(680,shellWidth-mainMin-state.paneLeftWidth-splitterSpace));
  state.paneLeftWidth=paneWidthStep(state.paneLeftWidth,leftMin,maxLeft,300);
  state.paneRightWidth=paneWidthStep(state.paneRightWidth,rightMin,maxRight,360);
  syncPaneLayoutClasses(root,state.paneLeftWidth,state.paneRightWidth,false);
  syncInspectorVisibility();
}
function ensurePaneResizers(){
  const shell=optionalElement('mainContent')?.closest?.('.shell');
  if(!shell||shell.querySelector('.pane-resizer'))return;
  const left=document.createElement('div');
  left.className='pane-resizer left-resizer';
  left.dataset.resizePane='left';
  left.setAttribute('role','separator');
  left.setAttribute('aria-label','Resize navigator pane');
  left.setAttribute('aria-orientation','vertical');
  left.tabIndex=0;
  const right=document.createElement('div');
  right.className='pane-resizer right-resizer';
  right.dataset.resizePane='right';
  right.setAttribute('role','separator');
  right.setAttribute('aria-label','Resize inspector pane');
  right.setAttribute('aria-orientation','vertical');
  right.tabIndex=0;
  const leftPane=shell.querySelector('.pane.left');
  const mainPane=shell.querySelector('.pane.main');
  if(leftPane)leftPane.after(left);
  if(mainPane)mainPane.after(right);
}
function resetPaneLayout(){
  state.paneLeftWidth=320;
  state.paneRightWidth=380;
  applyPaneLayout();
  saveState();
  toast('Pane widths reset');
}

function ensureScrollablePaneFocus(){
  ['scopeList','content','inspectorBody'].forEach(id=>{
    const el=optionalElement(id);
    if(!el)return;
    if(!el.hasAttribute('tabindex'))el.tabIndex=0;
  });
}
function scrollableElementFromTarget(target){
  let el=target&&target.nodeType===1?target:target?.parentElement;
  while(el&&el!==document.body&&el!==document.documentElement){
    const style=window.getComputedStyle?window.getComputedStyle(el):null;
    const overflowY=style?.overflowY||'';
    const overflowX=style?.overflowX||'';
    const scrollY=/(auto|scroll|overlay)/.test(overflowY)&&el.scrollHeight>el.clientHeight+1;
    const scrollX=/(auto|scroll|overlay)/.test(overflowX)&&el.scrollWidth>el.clientWidth+1;
    if(scrollY||scrollX)return el;
    el=el.parentElement;
  }
  return null;
}
function canScrollOnAxis(el,axis,delta){
  if(!el||!Number.isFinite(delta)||Math.abs(delta)<0.01)return false;
  if(axis==='x'){
    if(el.scrollWidth<=el.clientWidth+1)return false;
    if(delta<0)return el.scrollLeft>0;
    return el.scrollLeft+el.clientWidth<el.scrollWidth-1;
  }
  if(el.scrollHeight<=el.clientHeight+1)return false;
  if(delta<0)return el.scrollTop>0;
  return el.scrollTop+el.clientHeight<el.scrollHeight-1;
}
function wheelFallbackTarget(target){
  const el=target&&target.nodeType===1?target:target?.parentElement;
  if(el?.closest?.('.pane.left'))return optionalElement('scopeList');
  if(el?.closest?.('.pane.right'))return optionalElement('inspectorBody');
  return optionalElement('content')||optionalElement('scopeList')||optionalElement('inspectorBody');
}