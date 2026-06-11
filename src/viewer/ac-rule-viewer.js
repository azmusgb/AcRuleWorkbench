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
﻿
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
  build: 'v104-fw-editor-viewer',
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
  root.classList.add('fw-boot-placeholder-done');

  try {
    root.remove();
  } catch (_) {
    if(root.parentNode) root.parentNode.removeChild(root);
  }
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
    console.warn('FormWorks Editor Viewer: background FWD API hydration failed.',error);
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
const viewerStateBuild='v104-fw-editor-viewer';
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
    return value.length>opts.maxString?`${value.slice(0,opts.maxString)}â€¦ (${fmt(value.length)} chars)`:value;
  }
  if(type==='number'||type==='boolean')return value;
  if(type==='function')return '[Function]';
  if(depth>=opts.maxDepth){refs.truncated=true;return Array.isArray(value)?`[Array(${value.length})]`:'[Object]';}
  if(type==='object'){
    if(refs.weak.has(value)){refs.truncated=true;return '[Circular]';}
    refs.weak.add(value);
    if(Array.isArray(value)){
      const out=value.slice(0,opts.maxArray).map(item=>boundedPreviewValue(item,opts,depth+1,refs));
      if(value.length>opts.maxArray){refs.truncated=true;out.push(`â€¦ ${fmt(value.length-opts.maxArray)} more item(s)`);}
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
    if(keys.length>opts.maxKeys){refs.truncated=true;out['â€¦']=`${fmt(keys.length-opts.maxKeys)} more key(s)`;}
    return out;
  }
  return text(value);
}
function summaryForLargeValue(value){
  if(value==null)return value;
  if(Array.isArray(value))return `[Array(${fmt(value.length)})]`;
  if(typeof value==='object')return `[Object(${fmt(Object.keys(value).length)} keys)]`;
  const s=text(value);
  return s.length>180?`${s.slice(0,180)}â€¦`:s;
}
function previewJson(value,options={}){
  const tracker={weak:new WeakSet(),nodes:0,truncated:false};
  const preview=boundedPreviewValue(value,options,0,tracker);
  let json='';
  try{json=JSON.stringify(preview,null,2);}
  catch(error){json=`"[Preview unavailable: ${text(error&&error.message||error)}]"`;}
  const maxChars=Number(options.maxChars||18000);
  if(json.length>maxChars){tracker.truncated=true;json=`${json.slice(0,maxChars)}\nâ€¦ (${fmt(json.length-maxChars)} more chars)`;}
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
    console.warn('FormWorks Editor Viewer: failed to parse JSON state; using fallback.', error);
    return fallback;
  }
}
function readStorage(key){
  try { return window.localStorage ? localStorage.getItem(key) : null; }
  catch (error) {
    console.warn('FormWorks Editor Viewer: localStorage read failed.', error);
    return null;
  }
}
function writeStorage(key,value){
  try { if (window.localStorage) localStorage.setItem(key,value); }
  catch (error) { console.warn('FormWorks Editor Viewer: localStorage write failed.', error); }
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
    selectedEditorObjectKey:text(saved.selectedEditorObjectKey||''),
    fwdExpanded:new Set(Array.isArray(saved.fwdExpanded)?saved.fwdExpanded:['fwd:root','group:batches','group:documents','group:pages','group:resources']),
    workspaceView:saved.workspaceView&&saved.workspaceView!=='overview'?saved.workspaceView:'structure',
    fieldResolutionFilter:saved.fieldResolutionFilter||'unresolved',
    inventoryFilter:['all','StructuralMatch','AdditionalRule','FlatOnly','direct','inherited'].includes(saved.inventoryFilter)?saved.inventoryFilter:'all',
    messageFilter:normalizeMessageFilter(saved.messageFilter),
    inspectorView:(()=>{const view=savedInspectorView==='config'?'fields':savedInspectorView==='actions'?'status-results':savedInspectorView;return ['general','fields','attributes','status-results','description','references','messages','raw','summary'].includes(view)?view:'general';})(),
    rulePropertyPage:(()=>{const page=text(saved.rulePropertyPage||savedInspectorView||'summary');const normalized=page==='general'?'summary':page==='config'?'fields':page==='actions'?'status-results':page;return ['summary','function','fields','attributes','status-results','children','references','raw','diagnostics'].includes(normalized)?normalized:'summary';})(),
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
  return w<1440||coarse;
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
    const computedStyle=window.getComputedStyle?window.getComputedStyle(el):null;
    const overflowY=computedStyle?.overflowY||'';
    const overflowX=computedStyle?.overflowX||'';
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





/*
  Phase 7: lazy FWD detail hydration.

  Purpose:
  - Keep boot-sidecar startup fast.
  - Do not hydrate the full FWD sidecar in the background during initial boot.
  - Load ac-rule-viewer.fwd.json only when the user opens a workspace that needs full resource/detail data.
*/

const lazyDetailHydrationState = {
  fwdStatus: 'none',
  fwdPromise: null,
  fwdLoadedAtUtc: '',
  fwdElapsedMs: 0,
  fwdError: null,
  hydratedWorkspaces: new Set(),
  pendingWorkspace: '',
  pendingReason: ''
};

function lazyDetailWorkspaceNames(){
  return ['rule-lists','udfs','tables','selection-lists','resources','drivers'];
}

function lazyDetailWorkspaceLabel(view){
  const normalized = normalizeWorkspaceViewName(view || '');
  return normalized === 'rule-lists' ? 'Rule Lists'
    : normalized === 'udfs' ? 'User Defined Functions'
    : normalized === 'tables' ? 'Tables'
    : normalized === 'selection-lists' ? 'SelectionLists'
    : normalized === 'resources' ? 'Resources'
    : normalized === 'drivers' ? 'Drivers'
    : 'FWD details';
}

function lazyDetailCurrentFwd(){
  return fwdData || fwdSidecarData || (typeof model !== 'undefined' && model ? model.fwd : null) || null;
}

function lazyDetailItems(container){
  if(Array.isArray(container)) return container;
  if(container && Array.isArray(container.items)) return container.items;
  if(container && Array.isArray(container.Items)) return container.Items;
  return [];
}

function lazyDetailHasWorkspaceRows(view){
  const fwd = lazyDetailCurrentFwd();
  if(!fwd || typeof fwd !== 'object') return false;
  const normalized = normalizeWorkspaceViewName(view || '');

  if(normalized === 'rule-lists') return lazyDetailItems(fwd.ruleLists).length > 0;
  if(normalized === 'udfs') return lazyDetailItems(fwd.udfs).length > 20 || lazyDetailItems(fwd.canonicalUdfs).length > 20;
  if(normalized === 'tables') return lazyDetailItems(fwd.tables).length > 0 || lazyDetailItems(fwd.selectionLists).length > 0;
  if(normalized === 'selection-lists') return lazyDetailItems(fwd.selectionLists).length > 0;
  if(normalized === 'resources') return lazyDetailItems(fwd.resources).length > 0 || lazyDetailItems(fwd.fields).length > 0;
  if(normalized === 'drivers') return lazyDetailItems(fwd.drivers).length > 0 || lazyDetailItems(fwd.processes).length > 0 || lazyDetailItems(fwd.inputDrivers).length > 0 || lazyDetailItems(fwd.outputDrivers).length > 0;
  return true;
}

function lazyDetailNeedsStaticFwd(view){
  const normalized = normalizeWorkspaceViewName(view || '');
  if(!lazyDetailWorkspaceNames().includes(normalized)) return false;
  if(lazyDetailHydrationState.fwdStatus === 'loaded') return false;
  if(lazyDetailHasWorkspaceRows(normalized)) return false;
  return true;
}

function lazyDetailFetchCandidates(fileName){
  const clean = text(fileName || '').replace(/^\/+/, '');
  const candidates = [clean, '/' + clean];

  try {
    const base = new URL(window.location.href);
    const path = base.pathname || '';
    const parts = path.split('/').filter(Boolean);
    if(parts.length){
      parts.pop();
      const relativeBase = '/' + parts.join('/');
      if(relativeBase && relativeBase !== '/') candidates.push(relativeBase + '/' + clean);
    }
  } catch {}

  return [...new Set(candidates.filter(Boolean))];
}

async function lazyDetailFetchJson(fileName){
  const candidates = lazyDetailFetchCandidates(fileName);
  const failures = [];

  for(const url of candidates){
    const started = Date.now();
    try {
      const response = await fetch(url, { cache: 'no-store' });
      const elapsedMs = Date.now() - started;
      if(typeof recordViewerFetch === 'function') recordViewerFetch(fileName, url, response.status, elapsedMs, { lazy: true });
      if(!response.ok){
        failures.push({ url, status: response.status });
        continue;
      }
      return await response.json();
    } catch(error) {
      const elapsedMs = Date.now() - started;
      if(typeof recordViewerFetch === 'function') recordViewerFetch(fileName, url, 0, elapsedMs, { lazy: true, error: error && error.message ? error.message : String(error || 'fetch failed') });
      failures.push({ url, error: error && error.message ? error.message : String(error || 'fetch failed') });
    }
  }

  const message = `Unable to load ${fileName} from ${candidates.join(', ')}`;
  const error = new Error(message);
  error.failures = failures;
  throw error;
}

function lazyDetailUnwrapPayload(payload){
  const unwrapped = first(
    payload && payload.data && payload.data.items ? payload.data : null,
    payload && payload.Data && payload.Data.Items ? payload.Data : null,
    payload && payload.data ? payload.data : null,
    payload && payload.Data ? payload.Data : null,
    payload
  );
  return unwrapped && typeof unwrapped === 'object' ? unwrapped : payload;
}

function lazyDetailResetCaches(){
  try { globalDefinitionLookupCache = null; } catch {}
  try { globalTableDefinitionsCache = null; } catch {}
  try { globalUdfDefinitionsCache = null; } catch {}
  try { globalFunctionDefinitionsCache = null; } catch {}
  try { globalNavigationCountsCache = null; } catch {}
  try { productCountsCache = null; } catch {}
  try { ruleListPacketDefinitionsCache = null; } catch {}
  try { scopeFieldResolutionCache = new Map(); } catch {}
  try {
    if(model){
      model.visibleRowsCache = null;
      model.treeMatchCache = null;
    }
  } catch {}
}

function lazyDetailApplyStaticFwdPayload(payload, reason){
  const fwd = lazyDetailUnwrapPayload(payload);
  if(!fwd || typeof fwd !== 'object'){
    throw new Error('Static FWD sidecar did not contain an object payload.');
  }

  fwdSidecarData = fwd;
  fwdData = fwd;

  try { applyAdvancedSidecarsToFwdData(); } catch {}

  if(typeof fwdApiHydrationState !== 'undefined'){
    fwdApiHydrationState.mode = 'boot-sidecar+lazy-fwd';
    fwdApiHydrationState.failedEndpoints = [];
  }

  if(typeof model !== 'undefined' && model){
    model = buildModel();
  }

  lazyDetailResetCaches();
  lazyDetailHydrationState.fwdStatus = 'loaded';
  lazyDetailHydrationState.fwdLoadedAtUtc = new Date().toISOString();
  lazyDetailHydrationState.hydratedWorkspaces.add(reason || 'fwd');

  if(typeof recordViewerDiagnostic === 'function'){
    recordViewerDiagnostic('info', 'lazy-static-fwd-applied', {
      reason,
      counts: typeof payloadCounts === 'function' ? payloadCounts() : null,
      modelCounts: typeof modelCounts === 'function' ? modelCounts() : null
    });
  }

  return fwd;
}

async function lazyDetailLoadStaticFwdSidecar(reason){
  if(lazyDetailHydrationState.fwdStatus === 'loaded') return lazyDetailCurrentFwd();
  if(lazyDetailHydrationState.fwdPromise) return lazyDetailHydrationState.fwdPromise;

  const started = Date.now();
  lazyDetailHydrationState.fwdStatus = 'loading';
  lazyDetailHydrationState.fwdError = null;
  lazyDetailHydrationState.pendingReason = reason || '';

  if(typeof recordViewerDiagnostic === 'function'){
    recordViewerDiagnostic('info', 'lazy-static-fwd-start', { reason });
  }

  lazyDetailHydrationState.fwdPromise = lazyDetailFetchJson('ac-rule-viewer.fwd.json')
    .then(payload => {
      lazyDetailHydrationState.fwdElapsedMs = Date.now() - started;
      return lazyDetailApplyStaticFwdPayload(payload, reason);
    })
    .catch(error => {
      lazyDetailHydrationState.fwdStatus = 'failed';
      lazyDetailHydrationState.fwdError = error && error.message ? error.message : String(error || 'Unknown lazy FWD load failure');
      if(typeof fwdApiHydrationState !== 'undefined'){
        fwdApiHydrationState.mode = 'boot-sidecar+lazy-fwd-failed';
        fwdApiHydrationState.failedEndpoints = ['ac-rule-viewer.fwd.json'];
      }
      if(typeof recordViewerDiagnostic === 'function'){
        recordViewerDiagnostic('error', 'lazy-static-fwd-failed', { reason, message: lazyDetailHydrationState.fwdError, failures: error && error.failures ? error.failures : [] });
      }
      throw error;
    })
    .finally(() => {
      lazyDetailHydrationState.fwdPromise = null;
      lazyDetailHydrationState.pendingWorkspace = '';
      lazyDetailHydrationState.pendingReason = '';
    });

  return lazyDetailHydrationState.fwdPromise;
}

function lazyDetailLoadingHtml(view, reason){
  const label = lazyDetailWorkspaceLabel(view);
  return `<section class="product-workspace product-catalog lazy-hydration-workspace" aria-label="Loading ${esc(label)}"><div class="product-empty-state product-empty-state-actionable lazy-hydration-card"><div class="empty-status-row"><span class="badge blue">Lazy hydration</span><span class="badge green">Boot-sidecar retained</span></div><h3>Loading ${esc(label)} details</h3><p>The viewer is fetching <code>ac-rule-viewer.fwd.json</code> on demand. The fast boot model stays intact; only the selected detail workspace is being hydrated.</p><div class="lazy-hydration-progress" aria-hidden="true"><span></span></div><p class="caption">Reason: ${esc(reason || 'workspace opened')}.</p></div></section>`;
}

function renderLazyDetailLoading(view, reason){
  const host = optionalElement('content');
  if(host) host.innerHTML = lazyDetailLoadingHtml(view, reason);
  const title = optionalElement('scopeTitle');
  if(title) title.textContent = `Loading ${lazyDetailWorkspaceLabel(view)}`;
  const caption = optionalElement('scopeCaption');
  if(caption) caption.innerHTML = '<span class="scope-caption-note">Loading the static FWD detail sidecar for this workspace.</span>';
}

function maybeHydrateWorkspaceOnDemand(view, action){
  const normalized = normalizeWorkspaceViewName(view || '');
  if(!lazyDetailNeedsStaticFwd(normalized)) return false;

  lazyDetailHydrationState.pendingWorkspace = normalized;
  lazyDetailHydrationState.pendingReason = action || 'workspace-open';
  renderLazyDetailLoading(normalized, action || 'workspace-open');

  lazyDetailLoadStaticFwdSidecar(normalized)
    .then(() => {
      lazyDetailHydrationState.hydratedWorkspaces.add(normalized);
      if(state.workspaceView !== normalized) return;
      lazyDetailResetCaches();
      if(typeof ensureUsefulWorkspaceSelection === 'function') ensureUsefulWorkspaceSelection('lazy-detail-hydration');
      renderAll();
      try { toast(`${lazyDetailWorkspaceLabel(normalized)} details loaded`); } catch {}
    })
    .catch(error => {
      if(state.workspaceView !== normalized) return;
      if(typeof reportUiError === 'function') reportUiError('lazy detail hydration', error);
      renderAll();
    });

  return true;
}

window.fwViewerLazyHydrationState = function(){
  return {
    fwdStatus: lazyDetailHydrationState.fwdStatus,
    fwdLoadedAtUtc: lazyDetailHydrationState.fwdLoadedAtUtc,
    fwdElapsedMs: lazyDetailHydrationState.fwdElapsedMs,
    fwdError: lazyDetailHydrationState.fwdError,
    pendingWorkspace: lazyDetailHydrationState.pendingWorkspace,
    pendingReason: lazyDetailHydrationState.pendingReason,
    hydratedWorkspaces: [...lazyDetailHydrationState.hydratedWorkspaces]
  };
};
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
  console.error(`FormWorks Editor Viewer ${context} failed:`, error);
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
  if(typeof recordViewerDiagnostic==='function')recordViewerDiagnostic(phase==='failed'?'error':'info','boot-phase',{phase,detail:bootState.detail});
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
  if(editorShell)document.body.classList.remove('layout-v61');
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
  const eyebrow=text(options.eyebrow||'FormWorks Editor Viewer');
  const title=text(options.title||'FormWorks Editor Viewer');
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
  return `<div class="editor-scope-banner"><div><span class="workspace-eyebrow">FormWorks Editor Viewer</span><b>Scope: ${esc(kind)} / ${esc(scope.name||scope.scopeId)}</b><small>${esc(scope.scopeId||'FWD scope')} - read-only FormWorks Editor-style AC configuration.</small></div><div class="editor-scope-badges"><span class="head-chip kind">${esc(kind)}</span>${process?`<span class="head-chip active">Process: ${esc(process)}</span>`:''}<span class="head-chip">${fmt(scopedRuleNodes().length)} rules</span><span class="head-chip">read-only</span></div></div>`;
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
  return `<div class="fweditor-menu-strip"><span>File</span><span>Edit</span><span>Resources</span><span>Rule</span><span>Window</span><span>Help</span><b>Read-only FormWorks Editor Viewer</b></div>`;
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
function editorPaneStep(value,min,max,fallback,step=20){return Math.round(clampNumber(Number(value)||fallback,min,max)/step)*step;}
function normalizedEditorTreeWidth(value=state.editorTreeWidth){return editorPaneStep(value,220,520,280);}
function normalizedEditorMessageHeight(value=state.editorMessageHeight){return editorPaneStep(value,80,420,100);}
function boundedLevel(value,max=20){return Math.max(0,Math.min(max,Math.round(Number(value)||0)));}
function treeDepthClass(value){return `depth-${boundedLevel(value)}`;}
function barWidthClass(value){
  const pct=Math.max(0,Math.min(100,Math.round(Number(value)||0)));
  const snapped=Math.max(0,Math.min(100,Math.round(pct/5)*5));
  return `bar-w-${snapped}`;
}
function editorPaneSizeClasses(){
  return `fw-tree-w-${normalizedEditorTreeWidth()} fw-message-h-${normalizedEditorMessageHeight()}`;
}
function fweditorRootClass(baseClass){
  return `${baseClass} ${editorPaneSizeClasses()}${state.editorMessageExpanded?' message-expanded':''}`;
}
function fweditorTreeSplitterHtml(){
  return `<div class="fweditor-splitter fweditor-tree-splitter" role="separator" aria-label="Resize FormWorks Editor Viewer navigation" aria-orientation="vertical" tabindex="0" data-editor-resize="tree"></div>`;
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
  return `<div class="fweditor-fwd-tree-body" role="tree" aria-label="FormWorks Editor Viewer navigation scopes"><details class="fweditor-tree-folder root" open><summary><span class="fweditor-folder-icon">+</span><b>FWD</b><small>${fmt(total)}</small></summary><div class="fweditor-tree-children">${body}</div></details></div>`;
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
  const path=options.path||`FormWorks Editor Viewer navigation \\ ${editorScopeKind(scope)} \\ ${scope.name||scope.scopeId} \\ ${title}`;
  const chips=list(options.chips).map((chip,index)=>`<span class="fweditor-state-chip ${index===0?'primary':''}">${esc(chip)}</span>`).join('');
  return `<section class="fweditor-config-window fweditor-scope-config-window" aria-label="FormWorks Editor Viewer configuration view"><div class="fweditor-window-titlebar"><span>${esc(title)}</span><span class="fweditor-window-buttons"><i></i><i></i><i></i></span></div><div class="fweditor-config-toolbar"><span class="fweditor-breadcrumb">${esc(path)}</span>${chips}</div><div class="fweditor-config-body">${fweditorScopePageTabsHtml(activePage)}<div class="fweditor-active-page" role="tabpanel">${bodyHtml}</div></div></section>`;
}
function fweditorScopeRootHtml(activePage,title,bodyHtml,options={}){
  const scope=currentScope();
  const advancedMessages=isAdvancedMode()?`${fweditorMessageSplitterHtml()}${fweditorScopeMessageWindowHtml(scope)}`:'';
  return `<section class="${fweditorRootClass('fweditor-root fweditor-scope-root')}" aria-label="FormWorks Editor Viewer scope view">${fweditorMenuStripHtml()}${fweditorViewStripHtml(activePage)}<div class="fweditor-workarea fweditor-scope-workarea">${fweditorScopeConfigurationWindowHtml(activePage,title,bodyHtml,options)}</div>${advancedMessages}</section>`;
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
function bars(rows){if(!rows.length)return '<div class="muted">No values.</div>';const max=Math.max(...rows.map(r=>r.count),1);return `<div class="mini-list">${rows.slice(0,10).map(r=>`<div class="mini-row"><span class="mono">${esc(r.name)}</span><b>${fmt(r.count)}</b><div class="bar bar-span-all"><i class="${barWidthClass(Math.max(3,r.count/max*100))}"></i></div></div>`).join('')}</div>`;}
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
    resources:'FormWorks Editor Viewer navigation \\ Resources',
    functions:'FormWorks Editor Viewer navigation \\ Resources \\ Functions',
    'selection-lists':'FormWorks Editor Viewer navigation \\ Resources \\ SelectionLists',
    tables:'FormWorks Editor Viewer navigation \\ Resources \\ Tables',
    udfs:'FormWorks Editor Viewer navigation \\ Resources \\ Functions',
    drivers:'FormWorks Editor Viewer navigation \\ Processes \\ Drivers',
    'rule-lists':'FormWorks Editor Viewer navigation \\ Rule Lists',
    'object-graph':'FormWorks Editor Viewer navigation \\ Object Graph',
    'runtime-impact':'FormWorks Editor Viewer navigation \\ Runtime Impact'
  };
  return map[kind]||'FormWorks Editor Viewer navigation \\ Resources';
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
  return `<section class="fweditor-config-window" aria-label="FormWorks Editor Viewer configuration view"><div class="fweditor-window-titlebar"><span>${esc(noun)} - ${esc(text(selected.name||selected.key||''))}</span><span class="fweditor-window-buttons"><i></i><i></i><i></i></span></div><div class="fweditor-config-toolbar"><span class="fweditor-breadcrumb">${esc(fweditorDefinitionPath(kind,selected))}</span><span class="fweditor-state-chip primary">${esc(originUi.badge||'Loaded')}</span><span class="fweditor-state-chip">${fmt(usageCount)} references</span></div><div class="fweditor-config-body"><div class="fweditor-resource-header"><div><div class="fweditor-resource-kicker">${esc(title)}</div><h2>${esc(text(selected.name||selected.key||''))}</h2><p>${esc(copy.body||originUi.caption||'Read-only FormWorks Editor configuration view.')}</p></div><button class="fweditor-command-button" type="button" data-action="open-global-detail" data-global-kind="${esc(kind)}">Details</button></div>${fweditorGlobalPropertyTabsHtml()}<div class="fweditor-active-page" role="tabpanel">${fweditorGlobalActivePageHtml(kind,selected,originUi,usageCount,detailHtml)}</div></div></section>`;
}

function renderGlobalDefinitionExplorer(kind,rows,selectedKey,stateKey,copy,detailHtml){
  const q=lower(state.query).trim();
  if(q){
    rows=rows.filter(row=>definitionSearchText(row).includes(q));
  }
  const host=$('content');
  if(!rows.length){
    host.innerHTML=`<section class="fweditor-resource-workspace empty" aria-label="${esc(fweditorKindTitle(kind))} resources"><div class="fweditor-workspace-titlebar"><div><span class="workspace-eyebrow">FormWorks Editor Viewer</span><h3>${esc(copy.emptyTitle||'No definitions found')}</h3><p>${esc(copy.emptyBody||'Clear search or choose another resource group.')}</p></div></div></section>`;
    return;
  }
  const selected=rows.find(r=>r.key===selectedKey)||rows[0];
  state[stateKey]=selected.key;
  const originUi=definitionOriginUi(kind,selected);
  const usageCount=list(selected.usage).length||selected.metric||0;
  const advancedMessages=isAdvancedMode()?`<section class="fweditor-resource-status">${fweditorGlobalMessageWindowHtml(kind,selected,rows,originUi)}</section>`:'';
  host.innerHTML=`<section class="fweditor-resource-workspace" aria-label="Read-only ${esc(fweditorKindTitle(kind))} resource configuration"><div class="fweditor-workspace-titlebar"><div><span class="workspace-eyebrow">FormWorks Editor Viewer</span><h3>${esc(copy.title||fweditorKindTitle(kind))}</h3><p>${esc(copy.body||'Read-only resource configuration.')}</p></div><div class="fweditor-workspace-metrics"><span><b>${fmt(rows.length)}</b> items</span><span><b>${fmt(usageCount)}</b> references</span></div></div><div class="fweditor-resource-two-pane"><aside class="fweditor-resource-index" aria-label="${esc(fweditorKindTitle(kind))} list"><div class="fweditor-pane-title visible">FWD Tree</div>${fweditorDefinitionTreeHtml(kind,rows,selected.key)}</aside><article class="fweditor-resource-detail" aria-label="${esc(copy.title||fweditorKindTitle(kind))} details">${fweditorGlobalConfigurationWindowHtml(kind,copy,selected,originUi,usageCount,detailHtml)}</article></div>${advancedMessages}</section>`;
}

function functionUsageRowsForName(functionName){
  return list(model.ruleUsageByFunctionName?.get(lower(functionName))).slice();
}
function runtimeImpactRowsForFunction(functionName){
  if(!isAdvancedMode())return [];
  const target=lower(functionName);
  return list(model.fwd?.runtimeImpact?.items)
    .filter(i=>lower(i.functionName)===target)
    .sort((a,b)=>text(a.scopeId).localeCompare(text(b.scopeId),undefined,{sensitivity:'base'})||text(a.ruleName).localeCompare(text(b.ruleName),undefined,{sensitivity:'base'}));
}
function runtimeImpactEvidenceHtml(functionName){
  const rows=runtimeImpactRowsForFunction(functionName);
  if(!rows.length)return '';
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Rule Impact Summary</h4><p>Static function-specific configuration impact records. Native AC execution is not simulated.</p></div><span class="badge blue">${fmt(rows.length)} impacts</span></div><div class="mini-list">${rows.slice(0,12).map(row=>`<div class="mini-row"><span><b>${esc(text(row.impactType||'Impact'))}</b> ${esc(text(row.summary||''))}</span><span class="mono">${esc(text(row.ruleName||row.scopeId||''))}</span></div>`).join('')}</div>${rows.some(r=>list(r.behaviorFlags).length)?`<div class="table-columns-head">Behavior flags</div>${functionTokenStripHtml([...new Set(rows.flatMap(r=>list(r.behaviorFlags).map(text).filter(Boolean)))],'blue')}`:''}${rows.some(r=>list(r.relationshipTargets).length)?`<div class="caption mt-8">Relationship targets are available in the raw impact rows for deeper drill-through.</div>`:''}</section>`;
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
  if(globalFunctionDefinitionsCache)return globalFunctionDefinitionsCache;
  const definedItems=list(model.fwd?.functions?.items);
  if(definedItems.length){
    const result=definedItems.map(f=>{
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
    globalFunctionDefinitionsCache=result;
    return result;
  }
  const result=domainRowsByView('functions').map(r=>{
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
      fn:{name,category:inferClientFunctionCategory(name),description:'Function observed in static rule configuration. Catalog metadata was not available in this snapshot.',observedRuleCount:Number(first(r.count,usage.length,0))||usage.length,statusResults:[],configuredStatusResults:[...new Set(usage.flatMap(u=>u.statusResults))],observedParameterNames:[...new Set(usage.flatMap(u=>Object.keys(u.parameters||{})))],behaviorFlags:['UnknownStaticBehavior'],behaviorNotes:['Inspect configured action lists and parameter bindings before inferring behavior.'],diagnostics:['FunctionNotHydratedFromApi']}
    };
  }).filter(r=>r.name);
  globalFunctionDefinitionsCache=result;
  return result;
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
  const impacts=isAdvancedMode()?list(first(f.runtimeImpacts,f.behaviorNotes,[])).map(text).filter(Boolean):[];
  const diagnostics=list(f.diagnostics).map(text).filter(Boolean);
  const facts=[
    ['Category',esc(first(f.category,row.type,'Function'))],
    ['Catalog',f.defined?'Curated definition':(f.functionResource?'Function resource':'Observed usage')],
    ['Observed rules',fmt(first(f.observedRuleCount,row.metric,0))],
    ['Relationships',fmt(first(f.relationshipCount,0))]
  ];
  const advancedImpactHtml=isAdvancedMode()?`${impacts.length?`<div class="table-columns-head">Advanced impact notes</div><div class="mini-list">${impacts.map(x=>`<div class="mini-row"><span>${esc(x)}</span></div>`).join('')}</div>`:''}${runtimeImpactEvidenceHtml(first(f.name,row.name,''))}`:'';
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Function Model</h4><p>${esc(first(f.description,'AC function observed in static FWD configuration.'))}</p></div><span class="badge ${f.deprecated?'amber':'blue'}">${f.deprecated?'deprecated':esc(first(f.source,row.source,'catalog'))}</span></div><div class="kv">${facts.map(([k,v])=>kv(k,v)).join('')}</div>${diagnostics.length?`<div class="table-columns-head">Status Items</div>${functionTokenStripHtml(diagnostics,'amber')}`:''}</section><section class="udf-section-card"><div class="udf-section-head"><div><h4>Interface</h4><p>Status results and parameters shown from static FWD configuration.</p></div><span class="badge blue">${fmt(statuses.length||configured.length)} statuses</span></div><div class="table-columns-head">Status results</div>${functionTokenStripHtml(statuses,'amber','No catalog or configured status results were extracted.')}${configured.length?`<div class="caption mt-8">Configured ActionNames from this snapshot: ${esc(configured.join(', '))}</div>`:''}<div class="table-columns-head">Parameter roles</div>${functionTokenStripHtml(roles,'blue','No curated parameter roles are available.')}${params.length?`<div class="table-columns-head">Observed parameter names</div>${functionTokenStripHtml(params,'blue')}`:''}</section><section class="udf-section-card"><div class="udf-section-head"><div><h4>Function Behavior</h4><p>Static function flags from the catalog and configured usage. Advanced execution-impact details are only shown with ?advanced=1.</p></div><span class="badge blue">${fmt(flags.length)} flags</span></div>${functionTokenStripHtml(flags,'blue','No behavior flags are available.')}</section>${advancedImpactHtml}`;
}
function buildSelectionListPacketDefinitions(){
  return list(model.fwd?.selectionLists?.items).map(item=>{
    const name=text(item.name);
    const usage=list(item.usageLinks).map(u=>({
      scopeId:text(u.scopeId),
      ruleName:text(u.ruleName||'SelectionList usage'),
      functionName:text(u.functionName||''),
      node:u.ruleNodeId?model.nodesById.get(String(u.ruleNodeId)):null,
      nodeId:text(u.ruleNodeId||''),
      target:name,
      targetType:'SelectionList',
      relationshipKind:text(u.relationshipKind||'UsesTable'),
      matchLevel:text(first(u.confidence,item.confidence,'High')),
      rel:u
    }));
    const fieldCount=list(item.matchFields).length+list(item.plugFields).length+list(item.columns).length;
    return {
      key:name,
      name,
      type:text(first(item.tableDriver,item.resourceType,'SelectionList')),
      source:text(first(item.source,'SelectionList packet')),
      defined:first(item.canonical,true)===true,
      metric:fieldCount,
      usage,
      selectionList:item,
      searchBlob:[name,item.resourceType,item.tableDriver,item.source,list(item.matchFields).map(f=>f.name).join(' '),list(item.plugFields).map(f=>f.name).join(' '),list(item.options).map(o=>`${o.role} ${o.name} ${o.value}`).join(' ')].join(' ')
    };
  }).filter(row=>row.name).sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
}
function selectionListFieldRowsHtml(title,rows,tone='blue'){
  const fields=list(rows);
  if(!fields.length)return '';
  return `<div class="table-columns-head">${esc(title)}</div><div class="table-columns-grid">${fields.slice(0,140).map(field=>`<div class="table-column-row"><div class="table-col-name">${esc(text(field.name||field.Name||''))}</div><div class="table-col-meta"><span class="badge ${esc(tone)}">${esc(text(first(field.role,title)))}</span><span class="mono">${esc(text(first(field.confidence,field.matchLevel,'parsed')))}</span></div></div>`).join('')}</div>${fields.length>140?`<div class="caption mt-8">Showing first 140 ${esc(title.toLowerCase())}.</div>`:''}`;
}
function selectionListOptionsHtml(options){
  const rows=list(options);
  if(!rows.length)return '<div class="global-empty-state compact">No SelectionList options were extracted.</div>';
  return `<div class="mini-list">${rows.slice(0,80).map(option=>`<div class="mini-row"><span><b>${esc(text(first(option.role,option.name,'Option')))}</b> ${esc(text(first(option.name,'')))}</span><span class="mono">${esc(text(first(option.value,option.source,'')))}</span></div>`).join('')}</div>`;
}
function selectionListPacketDetailHtml(row){
  const item=row.selectionList||{};
  const facts=[
    ['Resource type',esc(text(first(item.resourceType,row.type,'SelectionList')))],
    ['Authority',esc(text(first(item.authority,'ParsedSelectionList')))],
    ['Source',esc(text(first(item.source,row.source,'SelectionList packet')))],
    ['Table driver',esc(text(first(item.tableDriver,'SelectionList')))],
    ['Schema',first(item.schemaParsed,false)?'Parsed':'Not parsed'],
    ['Options',first(item.optionsParsed,false)?`${fmt(list(item.options).length)} parsed`:'Not parsed'],
    ['Match fields',fmt(list(item.matchFields).length)],
    ['Plug fields',fmt(list(item.plugFields).length)],
    ['Columns',fmt(list(item.columns).length)],
    ['Usage links',fmt(list(row.usage).length)]
  ];
  const diagnostics=list(item.diagnostics).map(text).filter(Boolean);
  const advancedDetails=isAdvancedMode()?`<div class="table-columns-head">Advanced source details</div>${previewJsonHtml({resourceDetails:item['resource'+'Evidence'],rawResourceDetails:item.rawResourceDetails},{maxDepth:4,maxArray:50,maxKeys:80,maxChars:16000})}<div class="table-columns-head">Advanced / Raw packet</div>${previewJsonHtml(item,{maxDepth:4,maxArray:70,maxKeys:90,maxChars:18000})}`:'';
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>SelectionList Packet</h4><p>${first(item.schemaParsed,false)?'Parsed table-backed SelectionList configuration.':'SelectionList/table lookup rule reference. This is not a parsed schema unless the Schema field says Parsed.'}</p></div><span class="badge ${first(item.schemaParsed,false)?'green':'amber'}">${first(item.schemaParsed,false)?'schema parsed':'rule reference'}</span></div><div class="kv">${facts.map(([k,v])=>kv(k,v)).join('')}</div>${isAdvancedMode()&&diagnostics.length?`<div class="table-columns-head">Status Items</div>${functionTokenStripHtml(diagnostics,'amber')}`:''}</section><section class="udf-section-card"><div class="udf-section-head"><div><h4>Fields</h4><p>Match fields, plug fields, and parsed columns from SelectionList configuration details.</p></div><span class="badge blue">${fmt(row.metric)} fields</span></div>${selectionListFieldRowsHtml('Match fields',item.matchFields,'blue')}${selectionListFieldRowsHtml('Plug fields',item.plugFields,'green')}${selectionListFieldRowsHtml('Columns',item.columns,'amber')}</section><section class="udf-section-card"><div class="udf-section-head"><div><h4>Options / Behaviors</h4><p>Persistence, rerun, prompt/keyer, no-good-match, enter, plug, and reject signals when present.</p></div><span class="badge blue">${fmt(list(item.options).length)} options</span></div>${selectionListOptionsHtml(item.options)}</section><div class="table-columns-head">Used By</div>${usagePreviewHtml(row.usage)}${advancedDetails}`;
}
function nodeForRuntimeImpact(row){
  const guid=text(first(row.ruleGuid,row.RuleGuid,'')).trim().toLowerCase();
  const scopeId=text(first(row.scopeId,row.ScopePath,'')).trim();
  const ruleName=text(first(row.ruleName,row.RuleName,'')).trim().toLowerCase();
  const functionName=text(first(row.functionName,row.FunctionName,'')).trim().toLowerCase();
  if(guid){
    const byGuid=model.nodes.find(n=>text(n.RuleGuid).trim().toLowerCase()===guid&&(!scopeId||n.scopeId===scopeId));
    if(byGuid)return byGuid;
  }
  return model.nodes.find(n=>n.scopeId===scopeId&&lower(n.title)===ruleName&&(!functionName||lower(n.fn)===functionName))||null;
}
function runtimeImpactKey(row,index){
  return [text(first(row.scopeId,row.ScopePath,'')),text(first(row.ruleGuid,row.RuleGuid,'')),text(first(row.ruleName,row.RuleName,'')),text(first(row.functionName,row.FunctionName,'')),index].join('|');
}
function buildRuntimeImpactDefinitions(){
  if(!isAdvancedMode())return [];
  return list(model.fwd?.runtimeImpact?.items).map((item,index)=>{
    const node=nodeForRuntimeImpact(item);
    const key=runtimeImpactKey(item,index);
    const usage=node?[{scopeId:node.scopeId,ruleName:node.title,functionName:node.fn,node,target:text(first(item.impactType,'')),targetType:'RuntimeImpact',relationshipKind:text(first(item.summary,'Static impact'))}]:[];
    const flags=list(item.behaviorFlags).map(text).filter(Boolean);
    const targets=list(item.relationshipTargets);
    return {
      key,
      name:`${text(first(item.ruleName,'Unnamed rule'))} - ${text(first(item.functionName,'No function'))}`,
      type:text(first(item.impactType,item.schemaProfile?.mutationKind,'RuntimeImpact')),
      source:text(first(item.schemaProfile?.source,'Advanced impact packet')),
      defined:true,
      metric:flags.length+targets.length,
      usage,
      impact:item,
      node,
      searchBlob:[key,item.scopeId,item.ruleName,item.ruleGuid,item.functionName,item.impactType,item.summary,flags.join(' '),JSON.stringify(targets)].join(' ')
    };
  }).sort((a,b)=>a.type.localeCompare(b.type,undefined,{sensitivity:'base'})||a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
}
function runtimeSchemaProfileHtml(profile){
  if(!profile||typeof profile!=='object')return '<div class="global-empty-state compact">No schema profile was exported for this impact row.</div>';
  const rows=[
    ['Mutation kind',esc(text(profile.mutationKind||''))],
    ['Reads fields',profile.readsFields?'Yes':'No'],
    ['Writes fields',profile.writesFields?'Yes':'No'],
    ['Uses table',profile.usesTable?'Yes':'No'],
    ['Calls UDF',profile.callsUdf?'Yes':'No'],
    ['Operator work',profile.createsOperatorWork?'Yes':'No'],
    ['Action Lists rule flow',profile.branchesRuleFlow?'Yes':'No'],
    ['Runtime only',profile.runtimeOnly?'Yes':'No'],
    ['Source',esc(text(profile.source||''))]
  ];
  return `<div class="kv">${rows.map(([k,v])=>kv(k,v)).join('')}</div>`;
}
function relationshipTargetsHtml(targets){
  const rows=list(targets);
  if(!rows.length)return '<div class="global-empty-state compact">No relationship targets were attached to this impact row.</div>';
  return `<div class="mini-list">${rows.slice(0,80).map(target=>`<div class="mini-row"><span><b>${esc(text(first(target.Kind,target.kind,'Uses')))}</b> ${relationshipTargetHtml({target:first(target.Target,target.target,''),targetType:first(target.TargetType,target.targetType,''),kind:first(target.Kind,target.kind,''),ParameterRole:first(target.ParameterRole,target.parameterRole,''),FunctionName:''})}</span><span class="mono">${esc(text(first(target.ParameterName,target.parameterName,target.Confidence,target.confidence,'')))}</span></div>`).join('')}</div>`;
}
function runtimeImpactDetailHtml(row){
  const impact=row.impact||{};
  const node=row.node;
  const flags=list(impact.behaviorFlags).map(text).filter(Boolean);
  const facts=[
    ['Scope',esc(text(first(impact.scopeId,node?.scopeId,'')))],
    ['Rule',esc(text(first(impact.ruleName,node?.title,'')))],
    ['Function',esc(text(first(impact.functionName,node?.fn,'')))],
    ['Impact type',esc(row.type||'RuntimeImpact')],
    ['Targets',fmt(list(impact.relationshipTargets).length)],
    ['Native execution',esc(text(first(impact.notProven,'Not simulated')))]
  ];
  const open=node?`<button class="btn" type="button" data-node="${esc(node.id)}" data-node-scope="${esc(node.scopeId)}">Open Rule</button>`:'<span class="badge amber">Unlinked</span>';
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Rule Impact Packet</h4><p>Static function-specific configuration model for a configured rule. This does not claim native AC execution.</p></div>${open}</div><div class="kv">${facts.map(([k,v])=>kv(k,v)).join('')}</div>${impact.summary?`<div class="notice compact"><div class="notice-icon">i</div><div><b>Summary</b><br>${esc(text(impact.summary))}</div></div>`:''}</section><section class="udf-section-card"><div class="udf-section-head"><div><h4>Behavior Flags</h4><p>Function catalog flags and static relationship details.</p></div><span class="badge blue">${fmt(flags.length)} flags</span></div>${functionTokenStripHtml(flags,'blue','No behavior flags were exported.')}</section><section class="udf-section-card"><div class="udf-section-head"><div><h4>Schema Profile</h4><p>Function-specific static model used to describe likely operator/runtime impact.</p></div><span class="badge blue">${esc(text(first(impact.schemaProfile?.mutationKind,row.type,'Impact')))}</span></div>${runtimeSchemaProfileHtml(impact.schemaProfile)}</section><section class="udf-section-card"><div class="udf-section-head"><div><h4>Relationship Targets</h4><p>Fields, attributes, tables, UDFs, reject messages, and options touched by this rule.</p></div><span class="badge blue">${fmt(list(impact.relationshipTargets).length)} targets</span></div>${relationshipTargetsHtml(impact.relationshipTargets)}</section><div class="table-columns-head">Raw impact row</div>${previewJsonHtml(impact,{maxDepth:4,maxArray:80,maxKeys:100,maxChars:20000})}`;
}
function renderRuntimeImpactDefinitions(){
  if(!isAdvancedMode())return;
  renderGlobalDefinitionExplorer('runtime-impact',buildRuntimeImpactDefinitions(),state.selectedRuntimeImpactKey,'selectedRuntimeImpactKey',{title:'Runtime Impact',body:'Static function-specific impact rows with behavior flags, relationship targets, and rule links. Native AC execution is not simulated.',emptyTitle:'No runtime impact rows found',emptyBody:'No runtime-impact packet was loaded.'},runtimeImpactDetailHtml);
}

// Build global table definitions and inferred column names from relationship co-occurrence.
function buildGlobalTableDefinitions(){
  if(globalTableDefinitionsCache)return globalTableDefinitionsCache;
  globalTableDefinitionsCache=computeGlobalTableDefinitions();
  return globalTableDefinitionsCache;
}
function computeGlobalTableDefinitions(){
  const selectionItems=list(model.fwd?.selectionLists?.items);
  const definedTables=list(model.fwd?.tables?.items);
  const usageByTarget=tableUsageIndex(definedTables.map(t=>t.name));
  if(selectionItems.length||definedTables.length){
    const merged=new Map();
    function tableKey(name){return text(name).trim().toLowerCase();}
    function ensure(name){
      const clean=text(name).trim();
      if(!clean)return null;
      const key=tableKey(clean);
      if(!merged.has(key))merged.set(key,{name:clean,hits:0,scopeCount:0,ruleCount:0,defined:false,inferred:false,parsedColumns:[],usageDerivedFields:[],columns:[],matchFields:[],plugFields:[],options:[],resourceEvidence:null,hasParsedSchema:false,optionsParsed:false,messages:[],usage:[],raw:{}});
      return merged.get(key);
    }
    function mergeColumns(target,prop,columns){
      const map=new Map(list(target[prop]).map(c=>[tableKey(c.name),c]));
      list(columns).forEach(c=>{const name=text(first(c.name,c.Name,c.column,c.Column,'')).trim();if(!name)return;const key=tableKey(name);const existing=map.get(key)||{name,hits:0,matchLevel:text(first(c.matchLevel,c.confidence,'Medium')),role:c.role};existing.hits=Math.max(Number(existing.hits)||0,Number(first(c.hits,0))||0);existing.matchLevel=text(first(existing.matchLevel,c.matchLevel,c.confidence,'Medium'));existing.role=text(first(existing.role,c.role,''));map.set(key,existing);});
      target[prop]=[...map.values()].sort((a,b)=>(Number(b.hits||0)-Number(a.hits||0))||text(a.name).localeCompare(text(b.name),undefined,{sensitivity:'base'}));
    }
    definedTables.forEach(t=>{
      const row=ensure(t.name);
      if(!row)return;
      const parsed=list(first(t.parsedColumns,[])).map(c=>({name:text(first(c.name,c.Name,c.column,c.Column,'')),hits:Number(first(c.hits,0))||0,matchLevel:text(first(c.matchLevel,c.confidence,'High')),role:'Parsed column'})).filter(c=>c.name);
      const derived=list(first(t.usageDerivedFields,t.columns,[])).map(c=>({name:text(first(c.name,c.Name,c.column,c.Column,'')),hits:Number(first(c.hits,0))||0,matchLevel:text(first(c.matchLevel,c.confidence,'Medium')),role:'Referenced field'})).filter(c=>c.name);
      row.defined=first(t.defined,t.canonical,false)===true;
      row.inferred=false;
      row.hits=Math.max(row.hits,Number(first(t.referenceCount,t.ruleCount,0))||0);
      row.scopeCount=Math.max(row.scopeCount,Number(first(t.scopeCount,0))||0);
      row.ruleCount=Math.max(row.ruleCount,Number(first(t.ruleCount,t.referenceCount,0))||0);
      row.resourceType=text(first(t.resourceType,'Table'));
      row.source=text(first(t.source,'CanonicalFwdResource'));
      row.confidence=text(first(t.confidence,'High'));
      row.hasParsedSchema=row.hasParsedSchema||parsed.length>0;
      row.messages=[...new Set([...row.messages,...list(first(t.messages,t.diagnostics,[])).map(text).filter(Boolean)])];
      row.usage=list(row.usage).length?row.usage:(usageByTarget.get(tableKey(t.name))||[]);
      row.raw.table=t;
      mergeColumns(row,'parsedColumns',parsed);
      mergeColumns(row,'usageDerivedFields',derived);
      mergeColumns(row,'columns',[...parsed,...derived]);
    });
    selectionItems.forEach(t=>{
      const row=ensure(t.name);
      if(!row)return;
      const usage=list(t.usageLinks).map(u=>({
        scopeId:text(u.scopeId),
        ruleName:text(u.ruleName||'SelectionList rule'),
        functionName:text(u.functionName||''),
        target:row.name,
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
      row.defined=row.defined||first(t.canonical,false)===true;
      row.inferred=row.inferred||first(t.canonical,false)!==true;
      row.hits=Math.max(row.hits,usage.length,Number(first(t.referenceCount,t.ruleCount,0))||0);
      row.scopeCount=Math.max(row.scopeCount,new Set(usage.map(u=>u.scopeId).filter(Boolean)).size,Number(first(t.scopeCount,0))||0);
      row.ruleCount=Math.max(row.ruleCount,usage.length,Number(first(t.ruleCount,0))||0);
      row.resourceType=text(first(t.resourceType,row.resourceType,'SelectionList'));
      row.source=text(first(t.source,row.source,'FwdResource'));
      row.confidence=text(first(t.confidence,row.confidence,'High'));
      row.options=[...row.options,...options];
      row.resourceEvidence=first(row.resourceEvidence,t.resourceEvidence,null);
      row.hasParsedSchema=row.hasParsedSchema||first(t.schemaParsed,false)===true;
      row.optionsParsed=row.optionsParsed||first(t.optionsParsed,false)===true;
      row.messages=[...new Set([...row.messages,...list(first(t.diagnostics,[])).map(text).filter(Boolean)])];
      row.usage=usage.length?usage:row.usage;
      row.raw.selectionList=t;
      mergeColumns(row,'matchFields',matchFields);
      mergeColumns(row,'plugFields',plugFields);
      mergeColumns(row,'parsedColumns',[...matchFields,...plugFields]);
      mergeColumns(row,'columns',[...matchFields,...plugFields,...row.usageDerivedFields]);
    });
    return [...merged.values()].filter(t=>t.name).sort((a,b)=>(Number(b.defined)-Number(a.defined))||(b.hits-a.hits)||a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
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
  const loadInfo=t['resource'+'Evidence']||{};
  const facts=[
    ['Resource type',esc(row.type||t.resourceType||'Table')],
    ['Schema',t.hasParsedSchema?'Parsed from SelectionList configuration details':(t.defined?'Definition present; schema not parsed':'Reference only; schema not exported')],
    ['Options',t.optionsParsed?`${fmt(options.length)} parsed`:'Not parsed'],
    ['Configured match fields',fmt(list(t.matchFields).length||parsedCols.length)],
    ['Configured plug fields',fmt(list(t.plugFields).length)],
    ...(isAdvancedMode()?[[ 'Advanced resource details',loadInfo.hasPrivateTree?'Available':'Unavailable' ]]:[]),
    ['Referenced fields',fmt(usageCols.length)],
    ['Rule references',fmt(list(row.usage).length||t.ruleCount||t.hits||0)],
    ['Scope count',fmt(t.scopeCount||0)]
  ];
  return `<section class="table-config-card"><div class="udf-section-head"><div><h4>Configuration</h4><p>${t.defined?'SelectionList/table definition details first; rule usage is secondary.':'Reference-only table: rule usage and field names were observed, but a full schema was not exported.'}</p></div><span class="badge ${t.hasParsedSchema?'green':t.defined?'blue':'amber'}">${t.hasParsedSchema?'schema parsed':t.defined?'definition':'reference-only'}</span></div><div class="kv">${facts.map(([k,v])=>kv(k,v)).join('')}</div>${options.length?`<div class="table-columns-head">Options</div><div class="udf-token-strip">${options.slice(0,40).map(o=>`<span class="udf-token amber" title="${esc(text(o.value||''))}">${esc(text(o.role||o.name||'Option'))}</span>`).join('')}</div>`:''}</section>`;
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
function buildUdfDefinitions(){
  if(globalUdfDefinitionsCache)return globalUdfDefinitionsCache;
  function fnEq(left,right){return text(left).trim().toLowerCase()===text(right).trim().toLowerCase();}
  function configuredRulesFor(fnName){
    const sourceRows=list(model.ruleUsageByFunctionName?.get(lower(fnName)));
    const collected=[];
    const seen=new Set();
    sourceRows.forEach(row=>{
      const key=[text(row.scopeId),text(row.ruleName),text(row.functionName),text(row.nodeId)].join('|').toLowerCase();
      if(seen.has(key))return;
      seen.add(key);
      collected.push({scopeId:text(row.scopeId),ruleName:text(row.ruleName||'Unnamed rule'),functionName:text(row.functionName||fnName),parameters:row.parameters||{},nodeId:text(row.nodeId)});
    });
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
  const fwdUdfs=list(model.fwd?.udfs?.items);
  const canonicalUdfs=list(model.fwd?.canonicalUdfs?.items).filter(u=>/CandidateUdf/i.test(text(u.classification))||/CanonicalFwdResource/i.test(text(u.source)));
  const editorUdfs=list(model.fwd?.editorModel?.udfDefinitions).filter(u=>/CandidateUdf/i.test(text(u.classification))||/CanonicalFwdResource/i.test(text(u.source)));
  // Prefer the focused /fwd/udfs endpoint. It contains confirmed canonical CandidateUdf rows and avoids
  // promoting iterator parameters / rule-usage-only records into the main UDF browser.
  const definedItems=fwdUdfs.length?fwdUdfs:(canonicalUdfs.length?canonicalUdfs:editorUdfs);
  if(definedItems.length){
    const result=definedItems.map(u=>{
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
        availabilityState:text(first(u.availabilityState,u.internalRuleTree?.parseState,''))||((first(u.bodyParsed,u.hasParsedBody,false)===true)?'RuleListAvailable':'RuleListUnavailable'),
        availabilityMessage:text(first(u.availabilityMessage,u.internalRuleTree?.availabilityMessage,'')),
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
        rawResourceDetails:first(u.rawResourceDetails,u.rawDetails,u.resourceEvidence,null),
        searchBlob:lower([displayName,rawName,type,u.classification,u.source,parameterNames.join(' '),list(first(u.statusResults,u.statuses,u.results,u.definition?.statusResults,[])).map(text).join(' '),rules.join(' '),callerRules.map(r=>`${r.ruleName} ${r.scopeId} ${r.functionName} ${Object.keys(r.parameters||{}).join(' ')}`).join(' ')].join(' '))
      };
    });
    globalUdfDefinitionsCache=result;
    return result;
  }
  const result=domainRowsByView('udfs').map(r=>{
    const fnName=text(r.name);
    const matchedRules=configuredRulesFor(fnName);
    return {
    key:fnName,
    displayName:fnName,
    rawName:fnName,
    type:'UDF reference',
    count:Number(first(r.count,0))||0,
    scopeCount:0,
    defined:false,
    inferred:true,
    definitionParsed:false,
    bodyParsed:false,
    availabilityState:'RuleListUnavailable',
    availabilityMessage:'This UDF name was observed in caller rules only; no canonical UDF definition or internal Rule List was available in this snapshot.',
    messages:[],
    classification:'RegexOnly',
    matchLevel:'',
    source:'Observed rule calls',
    scopes:[],
    rules:matchedRules.map(x=>`${x.ruleName} · ${x.scopeId}`).sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'})),
    callerRules:matchedRules,
    parameterNames:mergeUdfParameterNames([],parameterNamesFromRules(matchedRules)),
    parameterBindings:[],
    statusResults:[],
    internalRules:normalizeUdfInternalRules(r,fnName,matchedRules),
    resourceEvidence:null,
    rawResourceDetails:null,
    searchBlob:lower([fnName,'UDF reference','Observed rule calls',matchedRules.map(r=>`${r.ruleName} ${r.scopeId} ${r.functionName} ${Object.keys(r.parameters||{}).join(' ')}`).join(' ')].join(' '))
  };});
  globalUdfDefinitionsCache=result;
  return result;
}

// Render UDF list/detail with underscore-prefix grouping and clickable details.
function udfFilterLabel(filter){return ({'with-callers':'Has callers',defined:'Defined',unparsed:'Needs parsing','usage-only':'Reference-only',all:'All'})[filter]||'All';}
function passesUdfFilter(row){
  if(state.udfFilter==='with-callers')return list(row.callerRules).length>0||list(row.rules).length>0;
  if(state.udfFilter==='defined')return !!row.defined;
  if(state.udfFilter==='unparsed')return row.definitionParsed===false||list(row.messages).length>0;
  if(state.udfFilter==='usage-only')return !row.defined&&list(row.rules).length>0;
  return true;
}

// Render UDFs in a guide-aligned FWEditor layout rather than the generic editor viewer shell.
function udfEditorPathText(u){
  return `FWD / Resources / Function / ${udfShortName(u)}`;
}
function udfEditorTreeNodeHtml(u,selectedKey){
  const active=u.key===selectedKey;
  const callers=udfCallerCount(u);
  const warningCount=list(u.messages).length+(u.definitionParsed?0:1);
  return `<button class="fweditor-tree-item ${active?'selected':''}" type="button" data-global-kind="udfs" data-global-key="${esc(u.key)}" aria-current="${active?'true':'false'}"><span class="fweditor-tree-glyph">ƒ</span><span class="fweditor-tree-label"><b>${esc(udfShortName(u))}</b><small>${esc(u.type||'Function')}${callers?` · ${fmt(callers)} caller${callers===1?'':'s'}`:''}</small></span>${warningCount?`<span class="fweditor-tree-warn" title="Definition or parse messages">!</span>`:''}</button>`;
}
function udfEditorTreeHtml(rows,selectedKey){
  const groups=new Map();
  list(rows).forEach(u=>{
    const key=udfPrefix(u);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(u);
  });
  const ordered=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'}));
  return `<div class="fweditor-fwd-tree-body" role="tree" aria-label="FormWorks Editor Viewer navigation UDF resources"><details open class="fweditor-tree-folder root"><summary><span class="fweditor-folder-icon">▾</span>FWD</summary><details open class="fweditor-tree-folder"><summary><span class="fweditor-folder-icon">▾</span>Resources</summary><details open class="fweditor-tree-folder"><summary><span class="fweditor-folder-icon">▾</span>Function <b>${fmt(rows.length)}</b></summary>${ordered.map(([group,items],idx)=>`<details class="fweditor-tree-folder nested" ${items.some(x=>x.key===selectedKey)||idx<6?'open':''}><summary><span class="fweditor-folder-icon">▾</span>${esc(group)} <b>${fmt(items.length)}</b></summary><div class="fweditor-tree-children">${items.map(u=>udfEditorTreeNodeHtml(u,selectedKey)).join('')}</div></details>`).join('')}</details></details></details></div>`;
}
function udfEditorDefinitionStateHtml(u){
  const pieces=[
    u.defined?'FWD-defined':'Reference-only',
    udfStatusLabel(u),
    u.source||'FWD resource',
    u.classification||''
  ].map(text).filter(Boolean);
  return pieces.map((p,i)=>`<span class="fweditor-state-chip ${i===0?'primary':''}">${esc(p)}</span>`).join('');
}
function udfEditorGeneralHtml(u,callers){
  const rows=[
    ['Name',`<span class="mono">${esc(udfShortName(u))}</span>`],
    ['Raw resource name',u.rawName?`<span class="mono">${esc(u.rawName)}</span>`:'<span class="muted">not exported</span>'],
    ['Resource type',esc(u.type||'Function')],
    ['Definition source',esc(u.source||'FWD resource')],
    ['Definition parsed',u.definitionParsed?'Yes':'No'],
    ['Body parsed',u.bodyParsed?'Yes':'No'],
    ['Rule List state',esc(udfStatusLabel(u))],
    ['Caller rules',fmt(callers.length)],
    ['Field-list parameters',fmt(udfParamCount(u))],
    ['Status results',fmt(list(u.statusResults).length)],
    ['Internal rules',fmt(list(u.internalRules).length)]
  ];
  return `<fieldset class="fweditor-fieldset"><legend>General</legend><div class="fweditor-property-grid">${rows.map(([k,v])=>`<label>${esc(k)}</label><div>${v}</div>`).join('')}</div></fieldset>`;
}
function udfEditorParameterTableHtml(u,callers){
  const interfaceNames=effectiveUdfParameterNames(u);
  const byName=new Map();
  interfaceNames.forEach((name,index)=>{
    const key=text(name)||`Field List ${index+1}`;
    if(!byName.has(key))byName.set(key,{name:key,slot:`ParamList${index}`,callers:new Set(),values:new Map(),sources:new Set()});
  });
  list(callers).forEach(c=>callerParameterEntries(c.parameters||{},interfaceNames).forEach(entry=>{
    const key=entry.displayName||entry.rawName;
    if(!byName.has(key))byName.set(key,{name:key,slot:entry.rawName,callers:new Set(),values:new Map(),sources:new Set()});
    const row=byName.get(key);
    row.callers.add(text(c.ruleName||c.nodeId||'caller'));
    row.sources.add(entry.rawName);
    entry.values.forEach(v=>{const value=text(v);row.values.set(value,(row.values.get(value)||0)+1);});
  }));
  const rows=[...byName.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
  if(!rows.length)return `<fieldset class="fweditor-fieldset"><legend>Field List Parameters</legend><div class="fweditor-empty">No named UDF parameters or caller-observed field-list bindings were extracted.</div></fieldset>`;
  return `<fieldset class="fweditor-fieldset"><legend>Field List Parameters</legend><table class="fweditor-grid"><thead><tr><th>Parameter</th><th>FWD slot</th><th>Caller use</th><th>Observed field-list values</th></tr></thead><tbody>${rows.map(row=>{
    const values=[...row.values.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([v,c])=>`${v||'(blank)'} (${fmt(c)})`).join(', ');
    return `<tr><td><b>${esc(row.name)}</b></td><td class="mono">${esc([...row.sources].join(', ')||row.slot||'')}</td><td>${fmt(row.callers.size)}</td><td>${esc(values||'not observed')}</td></tr>`;
  }).join('')}</tbody></table></fieldset>`;
}
function udfEditorStatusResultsHtml(u){
  const rows=list(u.statusResults).map((x,i)=>({ordinal:i,token:text(x),description:''}));
  if(!rows.length)return `<fieldset class="fweditor-fieldset"><legend>Status Results</legend><div class="fweditor-empty">No advertised UDF status results were extracted.</div></fieldset>`;
  return `<fieldset class="fweditor-fieldset"><legend>Status Results</legend><table class="fweditor-grid compact"><thead><tr><th>Ordinal</th><th>Token</th><th>Action List use</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${fmt(r.ordinal)}</td><td><span class="mono">${esc(r.token)}</span></td><td>Mapped when used by caller rules</td></tr>`).join('')}</tbody></table></fieldset>`;
}
function udfEditorCallerRulesHtml(callers,u){
  const rows=list(callers);
  if(!rows.length)return `<fieldset class="fweditor-fieldset"><legend>Caller Rules</legend><div class="fweditor-empty">No caller rules are mapped for this UDF.</div></fieldset>`;
  const interfaceNames=effectiveUdfParameterNames(u);
  return `<fieldset class="fweditor-fieldset"><legend>Caller Rules</legend><table class="fweditor-grid caller-grid"><thead><tr><th>Rule</th><th>Scope</th><th>Field-list bindings</th><th></th></tr></thead><tbody>${rows.slice(0,350).map(c=>{
    const node=c.nodeId?model.nodesById.get(String(c.nodeId)):null;
    const scopeId=text(c.scopeId||node?.scopeId||'');
    const nodeId=text(c.nodeId||node?.id||'');
    const bindings=callerParameterEntries(c.parameters||{},interfaceNames).slice(0,5).map(entry=>`${entry.displayName}: ${entry.values.slice(0,2).join(', ')||'(blank)'}`).join('; ');
    const open=nodeId?`<button class="fweditor-command-button small" type="button" data-node="${esc(nodeId)}" data-node-scope="${esc(scopeId)}">Open Rule</button>`:'<span class="fweditor-state-chip">Unlinked</span>';
    return `<tr><td><b>${esc(c.ruleName||'Unnamed rule')}</b><small>${esc(c.functionName||u.rawName||'UDF call')}</small></td><td class="mono">${esc(scopeId||'unscoped')}</td><td>${esc(bindings||'No parsed parameters')}</td><td>${open}</td></tr>`;
  }).join('')}</tbody></table>${rows.length>350?`<div class="fweditor-note">Showing first 350 of ${fmt(rows.length)} caller rules.</div>`:''}</fieldset>`;
}
function udfEditorInternalRuleTreeHtml(u){
  const rules=list(u.internalRules);
  if(!rules.length)return `<fieldset class="fweditor-fieldset"><legend>Rule List</legend><div class="fweditor-empty"><b>Internal Rule List unavailable</b><br>${esc(udfAvailabilityMessage(u))}</div></fieldset>`;
  const interfaceNames=effectiveUdfParameterNames(u);
  return `<fieldset class="fweditor-fieldset"><legend>Rule List</legend><div class="fweditor-rule-list" role="tree" aria-label="UDF internal rule list">${rules.slice(0,260).map((r,i)=>{
    const node=r.nodeId?model.nodesById.get(String(r.nodeId)):null;
    const scopeId=text(r.scopeId||node?.scopeId||'');
    const nodeId=text(r.nodeId||node?.id||'');
    const paramPreview=callerParameterEntries(r.parameters||{},interfaceNames).slice(0,3).map(entry=>`${entry.displayName}: ${entry.values.slice(0,2).join(', ')||'(blank)'}`).join('; ');
    const open=nodeId?`<button class="fweditor-command-button small" type="button" data-node="${esc(nodeId)}" data-node-scope="${esc(scopeId)}">Open</button>`:'<span class="fweditor-state-chip">definition</span>';
    return `<div class="fweditor-rule-row" role="treeitem"><span class="fweditor-rule-index">${fmt(i+1)}</span><span class="fweditor-rule-main"><b>${esc(r.ruleName||`Rule ${i+1}`)}</b><small>${esc(r.functionName||'no function')}${scopeId?` · ${esc(scopeId)}`:''}${paramPreview?` · ${esc(paramPreview)}`:''}</small></span><span class="fweditor-rule-actions">${list(r.statusResults).length?`<span class="fweditor-state-chip">${fmt(list(r.statusResults).length)} status</span>`:''}${open}</span></div>`;
  }).join('')}</div>${rules.length>260?`<div class="fweditor-note">Showing first 260 internal rules.</div>`:''}</fieldset>`;
}
function udfEditorLoadStatusHtml(u){
  const loadInfo=u['resource'+'Evidence']||{};
  const diagnostics=list(u.messages).map(text).filter(Boolean);
  const rows=[
    ['Definition parsed',u.definitionParsed?'Yes':'No'],
    ['Body parsed',u.bodyParsed?'Yes':'No'],
    ['Resource config',loadInfo.hasConfig?'Available':'Unavailable'],
    ['Private tree',loadInfo.hasPrivateTree?'Available':'Unavailable'],
    ['Rule List state',udfStatusLabel(u)],
    ['Availability note',udfAvailabilityMessage(u)],
    ['Raw details',u.rawResourceDetails?'Available':'Not loaded'],
    ['Load Status Items',fmt(diagnostics.length)]
  ];
  return `<fieldset class="fweditor-fieldset"><legend>Load Status</legend><div class="fweditor-property-grid reader-status">${rows.map(([k,v])=>`<label>${esc(k)}</label><div>${esc(v)}</div>`).join('')}</div>${diagnostics.length?`<div class="fweditor-diagnostic-list">${diagnostics.slice(0,20).map(m=>`<div class="fweditor-message-row warn"><span>Warning</span><b>${esc(m)}</b></div>`).join('')}</div>`:''}</fieldset>`;
}

function udfEditorActiveTab(){
  const tab=text(state.udfEditorTab||'general');
  const allowed=['general','parameters','callers','rule-list',...(isAdvancedMode()?['load-status']:[])];
  return allowed.includes(tab)?tab:'general';
}
function udfEditorTabsHtml(){
  const active=udfEditorActiveTab();
  const tabs=[
    ['general','General'],
    ['parameters','Parameters'],
    ['callers','Callers'],
    ['rule-list','Rule List'],
    ...(isAdvancedMode()?[[ 'load-status','Load Status' ]]:[])
  ];
  return `<div class="fweditor-form-pages" role="tablist" aria-label="UDF configuration pages">${tabs.map(([key,label])=>`<button class="${key===active?'active':''}" type="button" role="tab" data-udf-tab="${esc(key)}" aria-selected="${key===active?'true':'false'}">${esc(label)}</button>`).join('')}</div>`;
}
function udfEditorActivePanelHtml(u,callers){
  const active=udfEditorActiveTab();
  if(active==='parameters')return udfEditorParameterTableHtml(u,callers);
  if(active==='callers')return udfEditorCallerRulesHtml(callers,u);
  if(active==='rule-list')return `${udfEditorStatusResultsHtml(u)}${udfEditorInternalRuleTreeHtml(u)}`;
  if(isAdvancedMode()&&active==='load-status')return udfEditorLoadStatusHtml(u);
  return `${udfEditorGeneralHtml(u,callers)}${udfEditorParameterTableHtml(u,callers)}`;
}
function udfEditorMessageWindowHtml(selected,allRows,filteredRows){
  const selectedMessages=list(selected?.messages).map(text).filter(Boolean);
  const inventoryWarnings=list(allRows).filter(r=>list(r.messages).length||!r.definitionParsed).length;
  const rows=[];
  if(selectedMessages.length){selectedMessages.slice(0,12).forEach(m=>rows.push({sev:'Warning',item:udfShortName(selected),message:m}));}
  if(!selectedMessages.length)rows.push({sev:'Info',item:udfShortName(selected),message:udfAvailabilityMessage(selected)});
  const parsedDefinitions=list(allRows).filter(r=>r.definitionParsed).length;
  const parsedBodies=list(allRows).filter(r=>r.bodyParsed||udfRuleListAvailable(r)).length;
  rows.push({sev:'Info',item:'Inventory',message:`${fmt(filteredRows.length)} UDFs shown from ${fmt(allRows.length)} UDF definitions. ${fmt(parsedDefinitions)} interfaces parsed; ${fmt(parsedBodies)} internal Rule Lists available; ${fmt(inventoryWarnings)} have pending body/interface details.`});
  return `<section class="fweditor-load-status-window ${state.editorMessageExpanded?'expanded':''}" aria-label="Advanced diagnostics"><div class="fweditor-load-status-title"><span>Load Status</span><button class="fweditor-title-button" type="button" data-action="toggle-editor-message">${state.editorMessageExpanded?'Collapse':'Expand'}</button></div><table class="fweditor-load-status-table"><thead><tr><th>Sev</th><th>Object</th><th>Message</th></tr></thead><tbody>${rows.map(r=>`<tr><td><span class="sev ${lower(r.sev)}">${esc(r.sev)}</span></td><td>${esc(r.item)}</td><td>${esc(r.message)}</td></tr>`).join('')}</tbody></table></section>`;
}
function udfEditorConfigurationWindowHtml(u,callers){
  return `<section class="fweditor-config-window" aria-label="FormWorks Editor Viewer configuration view"><div class="fweditor-window-titlebar"><span>User Defined Function - ${esc(udfShortName(u))}</span><span class="fweditor-window-buttons"><i></i><i></i><i></i></span></div><div class="fweditor-config-toolbar"><span class="fweditor-breadcrumb">${esc(udfEditorPathText(u))}</span>${udfEditorDefinitionStateHtml(u)}</div><div class="fweditor-config-body"><div class="fweditor-resource-header"><div><div class="fweditor-resource-kicker">Function Resource</div><h2>${esc(udfShortName(u))}</h2><p>User Defined Function interface, field-list parameters, status results, caller rules, internal Rule List details, and configuration messages.</p></div><button class="fweditor-command-button" type="button" data-action="open-global-detail" data-global-kind="udfs">Details</button></div>${udfEditorTabsHtml()}<div class="fweditor-active-page" role="tabpanel">${udfEditorActivePanelHtml(u,callers)}</div></div></section>`;
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

function selectedPathIds(){
  const ids=new Set();
  try{
    const selectedRule=typeof selectedNode==='function'?selectedNode():null;
    const selectedList=typeof selectedActionList==='function'?selectedActionList():null;
    const anchor=selectedRule||(selectedList&&selectedList.parent?selectedList.parent:null);
    if(anchor&&typeof pathObjects==='function'){
      pathObjects(anchor).forEach(p=>{
        if(p&&p.nodeId!==undefined&&p.nodeId!==null)ids.add(String(p.nodeId));
      });
    }
    if(selectedList&&Array.isArray(selectedList.childNodes)){
      selectedList.childNodes.forEach(n=>{
        if(n&&n.id!==undefined&&n.id!==null)ids.add(String(n.id));
      });
    }
  }catch(_err){
    // Defensive: path highlighting must never block tree rendering.
  }
  return ids;
}
function isHotspotNode(n){
  try{
    if(!n)return false;
    const id=String(n.id||'');
    const directChildren=typeof childIds==='function'?childIds(id).length:0;
    const actionGroups=typeof childActionListGroups==='function'?childActionListGroups(id):[];
    const actionChildren=actionGroups.reduce((sum,g)=>sum+(Array.isArray(g.childIds)?g.childIds.length:0),0);
    const disabled=text(n.disabled||'none')!=='none';
    const hasMessages=typeof hasDiag==='function'?hasDiag(n):false;
    return disabled||hasMessages||directChildren>=10||actionGroups.length>=5||actionChildren>=10;
  }catch(_err){
    // Defensive: hotspot styling is cosmetic and must not block rendering.
    return false;
  }
}

function treeRow(n,level){
  const id=String(n.id);
  const selected=state.selectedType==='node'&&state.selectedId===id;
  const hasKids=childIds(id).length>0||childActionListGroups(id).length>0;
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
  const actionListMeta=levelNo>=4?`<span class="tree-action-list-mini">${incoming?actionListChip(incoming):'<span class="action-list-chip root">root rule list</span>'}</span>`:'';
  return `<div class="tree-row ${treeDepthClass(level)} ${selected?'selected':''} ${inPath?'active-path':''} ${hot?'hotspot':''}" role="treeitem" aria-level="${level+1}" aria-expanded="${hasKids?(expanded?'true':'false'):'false'}" aria-selected="${selected?'true':'false'}" tabindex="0" data-node="${esc(id)}"><span class="tree-left">${hasKids?`<span class="twisty" data-toggle-node="${esc(id)}" aria-hidden="true" title="${expanded?'Collapse':'Expand'}">${expanded?'−':'+'}</span>`:'<span class="twisty ghost" aria-hidden="true">·</span>'}<span class="tree-main"><b class="tree-name">${esc(n.title)}</b>${fnMeta}<span class="tree-row-badges">${stateMeta}${actionListMeta}</span></span></span>${hasKids?`<span class="mini-row-btn" data-toggle-node="${esc(id)}" aria-hidden="true" title="${expanded?'Collapse':'Expand'}">${expanded?'−':'+'}</span>`:''}</div>`;
}
function renderNoData(){
  const detail=bootState.detail||'No FWD snapshot files could be loaded.';
  if(typeof recordViewerDiagnostic==='function')recordViewerDiagnostic('error','render-no-data',{detail,payloadCounts:typeof payloadCounts==='function'?payloadCounts():null,modelCounts:typeof modelCounts==='function'?modelCounts():null});
  document.body.classList.add('no-scope-selector');
  $('sourceSubtitle').textContent='No snapshot data available';
  $('statusPill').innerHTML='<span class="dot warn"></span><span>FWD load failed</span>';
  const banner=optionalElement('globalErrorBanner');
  if(banner){
    banner.textContent=`FWD load failed: ${detail}`;
    banner.hidden=false;
  }
  $('globalNav').innerHTML='';
  const scopeHost=optionalElement('scopeList');
  if(scopeHost){
    scopeHost.hidden=true;
    scopeHost.setAttribute('aria-hidden','true');
    scopeHost.innerHTML='';
  }
  $('content').innerHTML=emptyHtml('No FWD structure found',detail);
  optionalElement('diagnosticsDock')?.replaceChildren();
}
// Curated in-product guide content for first-use navigation.
function renderHelp(){
  const quickStart=`<div class="panel"><h3>Quick Start</h3><ol class="config-list"><li>Choose a document, page, processing scope, UDF, table, SelectionList, function, or resource from the left rail.</li><li>Open <b>Structure</b> to inspect Rule Lists, Parent Rules, Status Results, and Action Lists.</li><li>Select a rule and read the inspector from Summary through Raw.</li><li>Use <b>Functions</b>, <b>UDFs</b>, and <b>Tables</b> for function behavior, reusable rule-list functions, and lookup configuration.</li></ol></div>`;
  const productModel=`<div class="panel"><h3>Product Boundary</h3><div class="kv">${kv('Read-only','FormWorks Editor Viewer inspects FWD configuration. It does not edit, save, or write back to the FWD.')}${kv('FormWorks Editor','FormWorks Editor remains the authoring and save surface for the FWD.')}${kv('Runtime boundary','The viewer does not execute AC, run AC Rules Tester, or prove actual claim outcomes.')}</div></div>`;
  const ruleModel=`<div class="panel"><h3>FW Editor Rule Model</h3><div class="mini-list"><div class="mini-row"><span><b>Rule List</b></span><span class="caption">Ordered rules in a page, document, UDF, Store, or process scope</span></div><div class="mini-row"><span><b>Rule</b></span><span class="caption">Function plus fields/parameters, attributes, sources, messages, and actions</span></div><div class="mini-row"><span><b>Status Result</b></span><span class="caption">Function return token owned by the parent rule</span></div><div class="mini-row"><span><b>Action List / Sub-list</b></span><span class="caption">Nested Rule List selected by a parent status result</span></div></div></div>`;
  const inspectorModel=`<div class="panel"><h3>Inspector Reading Order</h3><ol class="config-list"><li>Rule name and scope</li><li>Function and function type</li><li>Fields / Parameters</li><li>Attributes</li><li>Status Results / Actions</li><li>Parent Rule / Sub-list path</li><li>References</li><li>Load Status</li><li>Raw, only when formatted views need confirmation</li></ol></div>`;
  const fwdModel=`<div class="panel"><h3>Load Status</h3><div class="kv">${kv('Loaded','Configuration section loaded normally.')}${kv('Partial','Useful configuration loaded, but some placement or detail could not be fully confirmed.')}${kv('Additional Rules','Searchable/readable rules whose exact Rule List placement is not confirmed.')}${kv('Raw','Final confirmation when formatted views are incomplete or inconsistent.')}</div></div>`;
  const docsModel=`<div class="panel"><h3>Project Docs</h3><div class="kv">${kv('Docs index','docs/README.md')}${kv('Operator guide','docs/operator-guide.md')}${kv('Admin guide','docs/admin-guide.md')}${kv('Developer guide','docs/developer-guide.md')}${kv('FormWorks model','docs/formworks-editor-ac-reference-guide.md')}${kv('FAQ','docs/fw-editor-viewer-faq.md')}</div></div>`;
  const operators=`<div class="panel"><h3>Search Operators</h3><div class="mini-list"><div class="mini-row"><span><b>action:"Run Rules"</b></span><span class="caption">Match action-list labels</span></div><div class="mini-row"><span><b>function:_IGetDocAttr</b></span><span class="caption">Match mapped function</span></div><div class="mini-row"><span><b>has:disabled</b></span><span class="caption">Rules with disable usage</span></div><div class="mini-row"><span><b>children&gt;20</b></span><span class="caption">Large structural nodes</span></div><div class="mini-row"><span><b>scope:DentalADA</b></span><span class="caption">Scope-limited matches</span></div></div></div>`;
  const shortcuts=`<div class="panel"><h3>Keyboard Shortcuts</h3><div class="kv">${kv('/ or Ctrl/⌘ + K','Focus command search')}${kv('Alt + I','Toggle inspector')}${kv('Alt + C','Copy selected config')}${kv('Alt + S','Focus selected subtree')}${kv('Alt + R','Reset pane widths')}${kv('Alt + A','Expand all visible rules')}${kv('Alt + D','Expand selected rule one level')}${kv('Alt + P','Collapse selected rule peers')}${kv('Alt + F','Clear focus/subtree mode')}</div><div class="caption mt-8">Tip: Use arrow keys and Enter to review dense trees without leaving the keyboard.</div></div>`;
  $('helpBody').innerHTML=`${quickStart}${productModel}${ruleModel}${inspectorModel}${fwdModel}${docsModel}${operators}${shortcuts}`;
}

function renderScopeInspector(s){
  const hotspots=scopedRuleNodes().filter(isHotspotNode).length;
  renderInspectorTabBar(['summary','raw'],{summary:fmt(s?.structural||0),raw:'JSON'});
  if(state.inspectorView==='raw'){
    $('inspectorBody').innerHTML=`<pre class="raw">${esc(JSON.stringify(s||{},null,2))}</pre>`;
    return;
  }
  $('inspectorBody').innerHTML=`<details class="inspector-section" open><summary>Scope summary <span class="section-count">${fmt(s.structural)} rules</span></summary><div class="inspector-section-body"><div class="kv">${kv('Scope ID',esc(s.scopeId))}${kv('Kind',esc(s.kind))}${kv('Structural rules',fmt(s.structural))}${kv('Large Action List rules',fmt(hotspots))}${kv('Load Status',s.diags?`<span class="badge amber">${fmt(s.diags)}</span>`:'<span class="badge green">None</span>')}</div><div class="caption mt-10">Select a rule in the structure view to inspect its read-only configuration.</div></div></details>`;
}

function configStatusStripHtml(n){const incoming=model.incomingByChild.get(n.id);const refs=model.rels.filter(r=>String(r.nodeId)===String(n.id));const diags=model.diags.filter(d=>String(d.nodeId)===String(n.id));const inv=model.inventory.find(r=>String(r.nodeId)===String(n.id));const actionOk=!incoming||incoming.resolved;const disabledLabel=n.disabled==='none'?'Not disabled':n.disabled==='direct'?'Direct disabled':n.disabled==='possible'?'Sequence-only hint':'Inherited disabled';return `<div class="trust-strip" aria-label="Selected rule configuration summary"><div class="trust-item info"><b>Object</b><span>FW resource node</span></div><div class="trust-item ${actionOk?'good':'warn'}"><b>Action list</b><span>${actionOk?'Named':'Index only'}</span></div><div class="trust-item good"><b>Disabled state</b><span>${esc(disabledLabel)}</span></div><div class="trust-item ${inv?'good':'warn'}"><b>Rule inventory</b><span>${inv?'Linked':'Not linked'}</span></div><div class="trust-item ${refs.length?'info':'warn'}"><b>References</b><span>${fmt(refs.length)}</span></div><div class="trust-item ${diags.length?'warn':'good'}"><b>Load Status</b><span>${diags.length?fmt(diags.length):'None linked'}</span></div></div>`;}
function rulePlainLanguageNarrative(n){
  const incoming=model.incomingByChild.get(n.id);
  const actionLists=childActionListGroups(n.id);
  const fieldResolution=resolveNodeFieldReferences(n);
  const fields=fieldResolution.items.map(i=>i.referencedField).filter(Boolean).slice(0,12);
  const disabled=n.disabled==='none'?'enabled':n.disabled==='direct'?'directly disabled':n.disabled==='inherited'?'disabled by a parent Action List':'marked with sequence-only disabled suspicion';
  return [`Rule: ${n.title}`,`Function: ${n.fn||'No mapped function'}`,`Scope: ${n.scopeId}`,`State: ${disabled}`,incoming?`Runs under parent status result/action list: ${incoming.label}${incoming.resolved?'':' (label unnamed/index-only)'}`:'Root rule-list entry',fields.length?`Field-like inputs: ${fields.join(', ')}`:'No field-like inputs detected',actionLists.length?`Status results / action lists: ${actionLists.map(b=>`${b.label} (${b.childIds.length} child rules)`).join('; ')}`:'No child action lists detected','Note: this is static FWD structure, not a runtime execution trace.'].join('\n');
}
function pathNarrativeHtml(n){
  const lines=rulePlainLanguageNarrative(n).split('\n');
  return `<div class="path-narrative"><h3>Parent Rule / Sub-list Path</h3><ul>${lines.map(line=>`<li>${esc(line)}</li>`).join('')}</ul><div class="action-list-actions"><button class="btn" type="button" data-action="copy-rule-explanation">Copy summary</button><button class="btn" type="button" data-action="copy-action-list-path">Copy Action List path</button></div></div>`;
}
function selectedPathPacket(n){const incoming=model.incomingByChild.get(n.id);return {schema:'FwEditorViewer.SelectedRulePath',schemaVersion:'1.0.0',copiedAt:new Date().toISOString(),scopeId:n.scopeId,identity:{nodeId:n.id,ruleName:n.title,functionName:n.fn,ruleGuid:n.RuleGuid||null},incomingAction:incoming?{label:incoming.label,actionListState:incoming.routeState||null,actionName:first(incoming.ActionName,incoming.actionName,null),actionListIndex:first(incoming.ActionListIndex,incoming.actionListIndex,null),resolved:!!incoming.resolved,}:null,path:pathObjects(n),outgoingActions:(model.edgesByParent.get(n.id)||[]).map(e=>({label:e.label,actionListState:e.routeState||null,actionName:first(e.ActionName,e.actionName,null),actionListIndex:first(e.ActionListIndex,e.actionListIndex,null),resolved:!!e.resolved,toNodeId:e.to,childName:model.nodesById.get(String(e.to))?.title||null})),caveat:'Parent-rule path comes from the parsed FWD hierarchy. It is read-only configuration, not a runtime execution trace.'};}

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
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>RuleConfiguration Packet</h4><p>Snapshot-wide FormWorks editor model for this Rule: function schema, status results, rejects, source handles, and ambiguity diagnostics.</p></div><span class="badge ${diagnostics.length?'amber':'green'}">${diagnostics.length?'diagnostics':'canonical'}</span></div><div class="kv">${kv('Function schema',schema.defined?'Catalog-defined':'Observed')}${kv('Configured statuses',fmt(list(schema.configuredStatusResults).length))}${kv('Action Lists',fmt(actions.length))}${kv('Source handles',fmt(sources.length))}${kv('Reject mappings',fmt(rejects.length))}</div>${list(schema.behaviorFlags).length?`<div class="table-columns-head">Behavior flags</div>${functionTokenStripHtml(schema.behaviorFlags,'blue')}`:''}${rejects.length?`<div class="table-columns-head">Reject message/code</div><div class="mini-list">${rejects.map(r=>`<div class="mini-row"><span><b>${esc(text(r.parameterName||r.kind||'Reject'))}</b> ${esc(text(r.message||r.code||r.target||''))}</span><span class="badge blue">${esc(text(r.confidence||''))}</span></div>`).join('')}</div>`:''}${sources.length?`<div class="table-columns-head">Source handles</div><div class="mini-list">${sources.slice(0,8).map(s=>`<div class="mini-row"><span><b>${esc(text(s.source||''))}</b> ${esc(text(s.authority||''))}</span><span class="mono">${esc(text(s.path||''))}</span></div>`).join('')}</div>`:''}${diagnostics.length?`<div class="table-columns-head">Status Items</div>${functionTokenStripHtml(diagnostics,'amber')}`:''}</section>`;
}

function selectedRuleConfigPacket(n){
  const incoming=model.incomingByChild.get(n.id);
  const refs=model.rels.filter(r=>String(r.nodeId)===String(n.id));
  const diags=model.diags.filter(d=>String(d.nodeId)===String(n.id));
  const inv=model.inventory.find(r=>String(r.nodeId)===String(n.id));
  const fieldResolution=resolveNodeFieldReferences(n);
  const editorRuleConfiguration=canonicalRuleConfigurationForNode(n);
  return {
    schema:'AcEditor Viewer.SelectedRuleConfiguration',
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
function renderGenericInspector(obj,label){
  const linked=obj.nodeId?model.nodesById.get(String(obj.nodeId)):null;
  renderInspectorTabBar(['summary','raw']);
  if(state.inspectorView==='raw'){
    $('inspectorBody').innerHTML=`<pre class="raw">${esc(JSON.stringify(obj,null,2))}</pre>`;
    return;
  }
  $('inspectorBody').innerHTML=`<div class="panel inspector-summary-card"><h3>${esc(label)}</h3><div class="kv">${Object.keys(obj).slice(0,18).map(k=>kv(k,esc(typeof obj[k]==='object'?JSON.stringify(obj[k]):obj[k]))).join('')}</div></div>${linked?`<button class="btn primary" type="button" data-action="open-linked-node">Open linked structural node</button>`:''}`;
}
function ancestors(n){const rows=[];let cur=n;const seen=new Set();while(cur&&!seen.has(cur.id)){seen.add(cur.id);rows.unshift(cur);const p=model.parentByChild.get(cur.id);cur=p?model.nodesById.get(p):null;}return rows;}
function pathHtml(n){return `<div class="action-list-path">${ancestors(n).map((a,i)=>{const e=model.incomingByChild.get(a.id);return `${i?'<span class="action-list-arrow">-&gt;</span>':''}<span class="action-list-step">${i?actionListChip(e):'<span class="action-list-chip root">root rule list</span>'}<b title="${esc(a.title)}">${esc(a.title)}</b></span>`}).join('')}</div>`;}
function outgoingGroups(n){const edges=list(model.edgesByParent.get(n.id));const groups={};edges.forEach(e=>{const key=e.label||'Unnamed';(groups[key]||(groups[key]=[])).push(e);});return groups;}

function actionListSummaryHtml(n){
  const groups=outgoingGroups(n);
  const names=Object.keys(groups);
  if(!names.length)return '<div class="muted">This rule has no child Action Lists.</div>';
  return `<div class="action-list-summary">${names.map(name=>`<span class="action-list-summary-chip"><b>${esc(name)}</b><span>${fmt(groups[name].length)} ${groups[name].length===1?'child':'children'}</span></span>`).join('')}</div><div class="caption mt-8">These are outgoing Action Lists owned by this rule. Each child rule below the Action List has one incoming action from its parent rule status result.</div>`;
}
function sectionHtml(title,count,body,open=true){return `<details class="inspector-section" ${open?'open':''}><summary>${esc(title)}${count!==undefined?` <span class="section-count">${esc(count)}</span>`:''}</summary><div class="inspector-section-body">${body}</div></details>`;}

const inspectorTabLabels={
  summary:'General',
  general:'General',
  fields:'Fields / Parameters',
  attributes:'Attributes',
  'status-results':'Status Results',
  description:'Description',
  config:'Fields / Parameters',
  actions:'Status Results',
  references:'References',
  messages:'Load Status',
  raw:'Advanced / Raw'
};
function normalizeInspectorTab(available){
  const tabs=list(available).filter(Boolean);
  if(!tabs.length)return;
  if(!tabs.includes(state.inspectorView))state.inspectorView=tabs.includes('general')?'general':(tabs.includes('summary')?'summary':tabs[0]);
}
function renderInspectorTabBar(available,counts={}){
  const tabs=list(available).filter(Boolean);
  normalizeInspectorTab(tabs);
  const host=optionalElement('inspectorTabs');
  if(!host)return;
  host.innerHTML=`<div class="inspector-tablist" role="tablist" aria-label="Inspector sections">${tabs.map(tab=>{
    const count=counts[tab];
    const label=inspectorTabLabels[tab]||tab;
    const active=state.inspectorView===tab;
    const countHtml=count===undefined?'':`<span class="inspector-tab-count">${esc(count)}</span>`;
    return `<button class="inspector-tab ${active?'active':''}" type="button" role="tab" aria-selected="${active?'true':'false'}" data-inspector-tab="${esc(tab)}">${esc(label)}${countHtml}</button>`;
  }).join('')}</div>`;
}

function renderNodeInspector(n){
 const incoming=model.incomingByChild.get(n.id);
 const refs=model.rels.filter(r=>String(r.nodeId)===String(n.id));
 const diags=model.diags.filter(d=>String(d.nodeId)===String(n.id));
 const paramCount=Object.keys(n.Parameters||{}).length;
 const attrCount=attributeEntriesForRule(n).length;
 const actionRows=actionListRowsForRule(n);
 const disabledHtml=n.disabled==='none'?'<span class="muted">Enabled</span>':n.disabled==='direct'?'<span class="badge red">Direct disabled</span>':n.disabled==='possible'?'<span class="badge amber">Possibly disabled by sequence</span>':'<span class="badge amber">Disabled by parent</span>';
 const displayPath=first(n.DisplayPath,n.displayPath,n.StructuralPath,n.structuralPath,n.RuleListPath,n.ruleListPath,'Root');
 const params=paramBlockForRule(n);
 const attributes=attributesBlockForRule(n);
 const statusActions=statusActionsBlockForRule(n);
 const fieldResolution=resolveNodeFieldReferences(n);
 const fieldBody=renderFieldResolutionBlock(fieldResolution);
 const parentActionPath=parentRuleActionListBlock(n);
 const relBody=refs.length?refs.slice(0,120).map(r=>`<div class="split-row my-7"><span>${esc(r.kind)} -&gt; <b>${relationshipTargetHtml(r)}</b><div class="caption">${esc(r.targetType||'Reference')}</div></span><span class="badge blue">configured</span></div>`).join(''):'<div class="muted">No references are linked to this rule in the current snapshot.</div>';
 const diagBody=diags.length?diags.map(d=>`<div class="notice compact"><div class="notice-icon">!</div><div><b>${esc(d.title)}</b><br>${esc(d.detail)}</div></div>`).join(''):'<div class="muted">No diagnostics linked to this rule.</div>';
 const summary=`${configStatusStripHtml(n)}<div class="kv mt-12">${kv('Rule name',esc(n.title))}${kv('Function',`<span class="mono">${esc(n.fn||'')}</span>`)}${kv('Scope',esc(n.scopeId))}${kv('Display path',`<span class="mono path-line">${esc(displayPath)}</span>`)}${kv('Parent action',incoming?`<span class="action-list-chip ${incoming.resolved?'resolved':'unresolved'}">${esc(incoming.label)}</span>`:'Root rule list')}${kv('Disabled state',disabledHtml)}${kv('Sub-list children',fmt(childIds(n.id).length))}${kv('References',fmt(refs.length))}${kv('Node',esc(n.id))}</div><div class="inline-actions mt-12"><button class="btn" type="button" data-action="copy-action-list-path">Copy Action List path</button><button class="btn primary" type="button" data-action="copy-rule-config">Copy config</button></div>`;
 const canonicalConfig=canonicalRuleConfigurationHtml(n);
 const raw=`<pre class="raw">${esc(JSON.stringify(n,null,2))}</pre>`;
 renderInspectorTabBar(['summary','config','actions',...(isAdvancedMode()?['references','messages','raw']:[])],{
   summary:'rule',
   config:fmt(paramCount+attrCount),
   actions:fmt(actionRows.length),
   references:fmt(refs.length),
   messages:fmt(diags.length),
   raw:'JSON'
 });
 if(state.inspectorView==='summary'){
   $('inspectorBody').innerHTML=`${sectionHtml('Summary','rule',summary,true)}${sectionHtml('Function Metadata','function',functionMetadataBlock(n),true)}${pathNarrativeHtml(n)}`;
 }else if(state.inspectorView==='config'){
   $('inspectorBody').innerHTML=`${canonicalConfig}${sectionHtml('Fields / Parameters',paramCount,`${params}<div class="table-columns-head mt-12">Field Catalog Match</div>${fieldBody}`,true)}${sectionHtml('Attributes',attrCount,attributes,true)}`;
 }else if(state.inspectorView==='actions'){
   $('inspectorBody').innerHTML=`${sectionHtml('Status Results / Actions',actionRows.length,statusActions,true)}${sectionHtml('Parent Rule / Sub-list Path','path',parentActionPath,true)}`;
 }else if(state.inspectorView==='references'){
   $('inspectorBody').innerHTML=`${sectionHtml('References',refs.length,relBody,true)}`;
 }else if(state.inspectorView==='messages'){
   $('inspectorBody').innerHTML=`${sectionHtml('Load Status',diags.length,diagBody,true)}`;
 }else{
   $('inspectorBody').innerHTML=raw;
 }
}

function sameName(a,b){return text(a).trim().toLowerCase()===text(b).trim().toLowerCase();}
function udfForFunctionName(functionName){
  const fn=text(functionName).trim();
  if(!fn)return null;
  try{
    return buildUdfDefinitions().find(u=>sameName(u.key,fn)||sameName(u.rawName,fn)||sameName(u.displayName,fn)||(u.displayName||'').split(': ').some(part=>sameName(part,fn)))||null;
  }catch{return null;}
}
function valuePreview(values,limit=8,hint=''){
  const vals=list(values).map(text).filter(v=>v.length>0);
  if(!vals.length)return '<span class="muted">empty</span>';
  return vals.slice(0,limit).map(v=>{
    const match=resolveDefinitionNav(v,hint);
    if(match)return definitionButtonHtml(match,v,'param-value-chip linked');
    return `<span class="param-value-chip" title="${esc(v)}">${esc(v)}</span>`;
  }).join('')+(vals.length>limit?`<span class="muted">+${fmt(vals.length-limit)}</span>`:'');
}
function paramBlock(p,interfaceNames=[]){
  const entries=callerParameterEntries(p||{},interfaceNames);
  if(!entries.length)return '<div class="muted">No parsed fields or parameters.</div>';
  return `<div class="fw-param-list">${entries.map(entry=>{
    const rawHint=entry.rawName&&entry.rawName!==entry.displayName?`<small>FWD slot: ${esc(entry.rawName)}</small>`:'';
    const hint=[entry.displayName,entry.rawName].join(' ');
    return `<div class="fw-param-row"><div class="fw-param-name"><b>${esc(entry.displayName)}</b>${rawHint}</div><div class="fw-param-values">${valuePreview(entry.values,12,hint)}</div></div>`;
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
    ['Function name',linkedDefinitionHtml(fn,udf?'UDF function':'Function','mono function-definition-link')||`<span class="mono">${esc(fn)}</span>`],
    ['Category',udf?linkedDefinitionHtml(udf.displayName||udf.rawName||fn,'UDF','')||'User Defined':esc(classifyFunction(fn))],
    version?['Function version',`<span class="mono">${esc(version)}</span>`]:null,
    udf?['UDF interface',`${fmt(effectiveUdfParameterNames(udf).length)} field-list parameter(s)`]:null,
    ['Configured attributes',fmt(attrs.length)],
    ['Sources',fmt(list(n.Sources).length)]
  ].filter(Boolean);
  return `<div class="kv">${rows.map(([k,v])=>kv(k,v)).join('')}</div>`;
}
function actionListRowsForRule(n){
  const groups=childActionListGroups(n.id);
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
  return `<div class="panel mb-10"><h3>Parent Rule / Sub-list Path</h3>${path}<div class="caption mt-8">Configured rule-list hierarchy from the FWD snapshot.</div></div><div class="kv">${kv('Parent Rule',parent?`<button class="btn ghost" type="button" data-node="${esc(parent.id)}">${esc(parent.title)}</button>`:'Root rule list')}${kv('Incoming Action List',incoming?`<span class="action-list-chip ${incoming.resolved?'resolved':'unresolved'}">${esc(incoming.label)}</span>`:'Root')}${kv('Action index',esc(first(incoming?.ActionListIndex,incoming?.actionListIndex,'')))}</div>`;
}

function fieldCatalogRowsForScope(scopeId){
  const items=list(first(model.fwd?.fields?.items,[]));
  const parts=text(scopeId).split('/').filter(Boolean);
  const scopeName=text(parts[parts.length-1]);
  const rawType=text(parts[parts.length-2]);
  const scopeType=rawType.endsWith('s')?rawType.slice(0,-1):rawType;
  if(!items.length){
    const design=pageDesignForScope(scopeId);
    return design?[{scopeType:'Page',scopeName:design.page,fields:list(design.fields).map(f=>({name:f.name,type:f.fieldType,geometry:f.geometry,design:f}))}]:[];
  }
  const exact=items.filter(i=>lower(i.scopeName)===lower(scopeName)&&lower(i.scopeType)===lower(scopeType));
  if(exact.length)return exact;
  return items.filter(i=>lower(i.scopeName)===lower(scopeName));
}
function pageDesignRows(){
  return list(first(model.fwd?.pageDesigns?.items,model.fwd?.editorModel?.pageDesigns,[]));
}
function pageDesignForScope(scopeId){
  const parts=text(scopeId).split('/').filter(Boolean);
  const scopeName=text(parts[parts.length-1]);
  if(!scopeName)return null;
  return pageDesignRows().find(p=>lower(p.page)===lower(scopeName))||null;
}
function pageDesignContextHtml(design){
  if(!design)return `<div class="notice"><div class="notice-icon">i</div><div><b>Page design context.</b> No page design packet is available for this scope.</div></div>`;
  const variants=list(design.variants);
  const fields=list(design.fields);
  const links=list(design.processingLinks);
  const variantRows=variants.slice(0,8).map(v=>`<div class="mini-row"><span><b>${esc(text(v.name))}</b>${v.formId?`<small class="mono">${esc(text(v.formId))}</small>`:''}</span><span>${esc(text(v.source||'Fwd.PageVariants'))}</span></div>`).join('');
  const fieldRows=fields.slice(0,12).map(f=>`<div class="mini-row"><span><b>${esc(text(f.name))}</b><small>${esc(text(f.fieldType||'unknown'))}</small></span><span class="mono">${esc(text(f.geometry||''))}</span></div>`).join('');
  const flags=[...new Set(fields.flatMap(f=>list(f.roleFlags).map(text)).filter(Boolean))].slice(0,12);
  const linkRows=links.slice(0,4).map(l=>`<div class="mini-row"><span><b>${esc(text(l.kind))}</b></span><span class="mono">${esc(text(l.url||l.target))}</span></div>`).join('');
  return `<div class="kv">${kv('Page',design.page||'')}${kv('Variants',fmt(variants.length))}${kv('Fields',fmt(fields.length))}${kv('Confidence',design.confidence||'')}</div>${variantRows?`<div class="table-columns-head">Variants / Form IDs</div><div class="mini-list">${variantRows}</div>`:''}${fieldRows?`<div class="table-columns-head">Fields</div><div class="mini-list">${fieldRows}</div>`:''}${flags.length?`<div class="table-columns-head">Field roles</div>${functionTokenStripHtml(flags,'blue')}`:''}${linkRows?`<div class="table-columns-head">Processing links</div><div class="mini-list">${linkRows}</div>`:''}`;
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
  const pageDesign=pageDesignForScope(state.scopeId);
  const buttons=`<div class="scope-kind-filter" role="toolbar" aria-label="Field resolution filters"><button class="chip-btn ${state.fieldResolutionFilter==='unresolved'?'active':''}" type="button" data-field-filter="unresolved">Unresolved</button><button class="chip-btn ${state.fieldResolutionFilter==='resolved'?'active':''}" type="button" data-field-filter="resolved">Resolved</button><button class="chip-btn ${state.fieldResolutionFilter==='all'?'active':''}" type="button" data-field-filter="all">All</button></div>`;
  const listHtml=rows.slice(0,4000).map(r=>`<button class="data-row compact" type="button" data-node="${esc(r.nodeId)}"><div><div class="data-title">${esc(r.referencedField)} <span class="badge ${r.fieldExists?'green':'amber'}">${r.fieldExists?'resolved':'unresolved'}</span></div><div class="data-sub">${esc(r.ruleName)} · ${esc(r.functionName||'no function')} · ${esc(r.parameterName)} = ${esc(r.parameterValue)}</div></div><div>${r.matchCount?`<span class="badge blue">${fmt(r.matchCount)} matches</span>`:''}</div><div class="mono">${esc(r.nodeId)}</div></button>`).join('');
  const notice=`<div class="notice compact"><div class="notice-icon">i</div><div><b>Field catalog match.</b> This view shows field-like rule parameters across the current scope and whether each one matches the extracted FWD field catalog.</div></div>`;
  const body=`<fieldset class="fweditor-fieldset"><legend>Field References</legend><div class="fweditor-scope-summary"><span>Structural rules <b>${fmt(summary.rules)}</b></span><span>Rules with refs <b>${fmt(summary.rulesWithRefs)}</b></span><span>Resolved <b>${fmt(summary.resolved)}</b></span><span>Unresolved <b>${fmt(summary.unresolved)}</b></span></div><div class="fweditor-toolbar-inline">${buttons}</div><div class="table-list mt-8">${listHtml||emptyHtml('No field-resolution rows match','Adjust filter or search.')}</div>${rows.length>4000?'<div class="notice compact"><div class="notice-icon">i</div><div>Showing first 4,000 rows for browser performance. Use search to narrow down.</div></div>':''}</fieldset><div class="fweditor-scope-detail-grid"><fieldset class="fweditor-fieldset"><legend>Page Design</legend>${pageDesignContextHtml(pageDesign)}</fieldset><fieldset class="fweditor-fieldset"><legend>How to Read This</legend>${notice}</fieldset></div>`;
  $('content').innerHTML=fweditorScopeRootHtml('field-resolution','Field Resolution',body,{chips:['Static catalog',`${fmt(summary.resolved)} resolved`,`${fmt(summary.unresolved)} unresolved`]});
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
  ta.className='copy-sink';
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
function snapshotStoreKey(){return `${storeKey}:${snapshotId()}`;}
function requestedWorkspaceView(){
  try{
    const href=text(window.location?.href||'');
    const match=href.match(/[?&]view=([^&#]+)/i);
    const view=normalizeWorkspaceViewName(match?decodeURIComponent(match[1].replace(/\+/g,' ')):'');
    return validWorkspaceViews().includes(view)?view:'';
  }catch{return '';}
}
function noteRecentScope(scopeId){const id=text(scopeId);if(!id)return;state.recentScopes=[id,...state.recentScopes.filter(x=>x!==id)].slice(0,6);}
function saveState(){
  writeStorage(snapshotStoreKey(),JSON.stringify({
    scopeId:state.scopeId,
    theme:state.theme,
    density:state.density,
    treeFilter:state.treeFilter,
    scopeKindFilter:state.scopeKindFilter,
    workspaceView:state.workspaceView,
    selectedEditorObjectKey:state.selectedEditorObjectKey,
    fwdExpanded:[...state.fwdExpanded],
    fieldResolutionFilter:state.fieldResolutionFilter,
    inventoryFilter:state.inventoryFilter,
    messageFilter:state.messageFilter,
    inspectorView:state.inspectorView,
    rulePropertyPage:state.rulePropertyPage,
    selectedResourceKey:state.selectedResourceKey,
    selectedFunctionName:state.selectedFunctionName,
    selectedDriverKey:state.selectedDriverKey,
    selectedObjectGraphKey:state.selectedObjectGraphKey,
    selectedRuleListKey:state.selectedRuleListKey,
    selectedSelectionListName:state.selectedSelectionListName,
    selectedRuntimeImpactKey:state.selectedRuntimeImpactKey,
    selectedProcessName:state.selectedProcessName,
    selectedTableName:state.selectedTableName,
    selectedUdfName:state.selectedUdfName,
    editorPropertyPage:state.editorPropertyPage,
    udfEditorTab:state.udfEditorTab,
    editorMessageExpanded:state.editorMessageExpanded,
    udfFilter:state.udfFilter,
    paneLeftWidth:state.paneLeftWidth,
    paneRightWidth:state.paneRightWidth,
    editorTreeWidth:normalizedEditorTreeWidth(),
    editorMessageHeight:normalizedEditorMessageHeight(),
    inspectorOpen:document.body.classList.contains('inspector-open'),
    recentScopes:state.recentScopes,
    disclosureLevel:state.disclosureLevel
  }));
  writeStorage(themeStoreKey,state.theme);
}
function restoreSnapshotState(){
  const saved=safeJson(readStorage(snapshotStoreKey())||'{}',{});
  const theme=readStorage(themeStoreKey)||'light';
  state.theme=theme;
  document.documentElement.dataset.theme=theme;
  state.density=saved.density==='high'?'high':state.density;
  applyDensityClass(state.density);
  document.body.classList.toggle('inspector-open',saved.inspectorOpen===true);
  if(saved.scopeId&&model.scopes.some(s=>s.scopeId===saved.scopeId))state.scopeId=saved.scopeId;
  if(saved.treeFilter)state.treeFilter=saved.treeFilter;
  if(saved.scopeKindFilter)state.scopeKindFilter=saved.scopeKindFilter;
  state.workspaceView=validWorkspaceViews().includes(saved.workspaceView)?saved.workspaceView:'structure';
  state.workspaceView=requestedWorkspaceView()||state.workspaceView;
  state.selectedEditorObjectKey=text(saved.selectedEditorObjectKey||state.selectedEditorObjectKey||'');
  state.fwdExpanded=new Set(Array.isArray(saved.fwdExpanded)?saved.fwdExpanded:[...state.fwdExpanded]);
  state.fieldResolutionFilter=['all','resolved','unresolved'].includes(saved.fieldResolutionFilter)?saved.fieldResolutionFilter:'unresolved';
  state.inventoryFilter=['all','StructuralMatch','AdditionalRule','FlatOnly','direct','inherited'].includes(saved.inventoryFilter)?saved.inventoryFilter:state.inventoryFilter;
  state.messageFilter=normalizeMessageFilter(saved.messageFilter||state.messageFilter);
  state.inspectorView=(()=>{const view=saved.inspectorView==='config'?'fields':saved.inspectorView==='actions'?'status-results':saved.inspectorView;return ['general','fields','attributes','status-results','description','summary','references','messages','raw'].includes(view)?view:'general';})();
  state.rulePropertyPage=(()=>{const page=text(saved.rulePropertyPage||state.rulePropertyPage||'summary');const normalized=page==='general'?'summary':page==='config'?'fields':page==='actions'?'status-results':page;return ['summary','function','fields','attributes','status-results','children','references','raw','diagnostics'].includes(normalized)?normalized:'summary';})();
  state.selectedResourceKey=text(saved.selectedResourceKey||'');
  state.selectedFunctionName=text(saved.selectedFunctionName||'');
  state.selectedDriverKey=text(saved.selectedDriverKey||'');
  state.selectedObjectGraphKey=text(saved.selectedObjectGraphKey||'');
  state.selectedRuleListKey=text(saved.selectedRuleListKey||'');
  state.selectedSelectionListName=text(saved.selectedSelectionListName||'');
  state.selectedRuntimeImpactKey=text(saved.selectedRuntimeImpactKey||'');
  state.selectedProcessName=text(saved.selectedProcessName||'');
  state.selectedTableName=text(saved.selectedTableName||'');
  state.selectedUdfName=text(saved.selectedUdfName||'');
  state.editorPropertyPage=normalizeEditorPropertyPage(saved.editorPropertyPage||state.editorPropertyPage);
  state.udfEditorTab=['general','parameters','callers','rule-list'].includes(saved.udfEditorTab)?saved.udfEditorTab:'general';
  state.editorMessageExpanded=saved.editorMessageExpanded===true;
  state.udfFilter=['all','with-callers','defined','unparsed','usage-only'].includes(saved.udfFilter)?saved.udfFilter:state.udfFilter;
  state.paneLeftWidth=Number.isFinite(Number(saved.paneLeftWidth))?Number(saved.paneLeftWidth):state.paneLeftWidth;
  state.paneRightWidth=Number.isFinite(Number(saved.paneRightWidth))?Number(saved.paneRightWidth):state.paneRightWidth;
  state.editorTreeWidth=normalizedEditorTreeWidth(saved.editorTreeWidth||state.editorTreeWidth);
  state.editorMessageHeight=normalizedEditorMessageHeight(saved.editorMessageHeight||state.editorMessageHeight);
  state.recentScopes=Array.isArray(saved.recentScopes)?saved.recentScopes:[];
  state.disclosureLevel=Number(saved.disclosureLevel||state.disclosureLevel||2)||2;
}
function selectNode(id){selectNodeInScope(id);}
function actionListRow(r){
  const g=r.group;const key=r.key;const cls=g.resolved?'resolved':'unresolved';const open=r.open!==false;const selected=state.selectedType==='action-list'&&state.selectedId===key;const hot=g.childIds.length>=10||g.childIds.some(id=>{const n=model.nodesById.get(String(id));return n&&(n.disabled!=='none'||hasDiag(n));});
  const actionLabel=g.resolved?'Status result / action':'Action index';
  return `<div class="action-list-row ${treeDepthClass(r.level)} ${cls} ${open?'':'collapsed'} ${selected?'selected':''} ${hot?'hotspot':''}" role="treeitem" aria-level="${r.level+1}" aria-expanded="${open?'true':'false'}" aria-selected="${selected?'true':'false'}" tabindex="0" data-action-list="${esc(key)}"><span class="twisty action-list-twisty" data-toggle-action-list="${esc(key)}" aria-hidden="true" title="${open?'Collapse':'Expand'}">${open?'−':'+'}</span><div class="action-list-main"><span class="action-list-label"><span class="action-list-prefix">${esc(actionLabel)}</span> ${esc(g.label)}</span><span class="action-list-meta">${fmt(g.childIds.length)} child ${g.childIds.length===1?'rule':'rules'}</span></div><span class="mini-row-btn" data-toggle-action-list="${esc(key)}" aria-hidden="true" title="${open?'Collapse':'Expand'}">${open?'−':'+'}</span></div>`;
}
function renderContextActionMenu(contextLabel){
  return '';
}
function renderInspector(){
  if(isEditorMode()){
    const title=optionalElement('inspectorTitle');
    const caption=optionalElement('inspectorCaption');
    const tabs=optionalElement('inspectorTabs');
    const body=optionalElement('inspectorBody');
    if(title)title.textContent='';
    if(caption)caption.textContent='';
    if(tabs)tabs.innerHTML='';
    if(body)body.innerHTML='';
    document.body.classList.remove('inspector-open');
    syncActionAvailability();
    return;
  }
  const b=selectedActionList();
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
    return renderActionListInspector(b);
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
function actionListPathObjects(b){const base=pathObjects(b.parent);base.push({kind:'ActionList',actionListId:b.actionListId,parentNodeId:b.parent.id,label:b.label,actionListIndex:b.actionListIndex,actionListState:b.actionListState,resolved:b.resolved});return base;}
function actionListPacket(b){const diags=actionListMessages(b),refs=actionListReferences(b);return {schema:'FwEditorViewer.SelectedActionListConfiguration',schemaVersion:'1.0.0',copiedAt:new Date().toISOString(),scopeId:b.scopeId,actionList:{actionListId:b.actionListId,parentNodeId:b.parent.id,parentRuleName:b.parent.title,parentFunctionName:b.parent.fn,label:b.label,actionListIndex:b.actionListIndex,actionListState:b.actionListState,resolved:b.resolved,childCount:b.childCount},path:actionListPathObjects(b),children:b.childNodes.map(n=>({nodeId:n.id,ruleName:n.title,functionName:n.fn,disabled:n.disabled,hasMessages:hasDiag(n)})),relationships:refs.map(r=>({kind:r.kind,targetType:r.targetType,target:r.target,nodeId:r.nodeId})),messages:diags.map(d=>({severity:d.severity,title:d.title,detail:d.detail,nodeId:d.nodeId})),notProven:['Action-list grouping comes from the parsed FWD parent rule status-result action lists.','This is read-only FWD configuration, not a runtime execution trace.','Search output is a navigation aid for the FWD snapshot.']};}
function actionListMessages(b){const ids=new Set(actionListSubtreeNodeIds(b));return model.diags.filter(d=>ids.has(String(d.nodeId)));}
function actionListReferences(b){const ids=new Set(actionListSubtreeNodeIds(b));return model.rels.filter(r=>ids.has(String(r.nodeId)));}
function actionListSubtreeNodeIds(b){const out=[];const walk=id=>{out.push(String(id));childIds(id).forEach(walk);};b.childIds.forEach(walk);return out;}
function actionListMarkdownReport(b){const p=actionListPacket(b);return `# Action List Configuration\n\nScope: ${p.scopeId}\nParent rule: ${p.actionList.parentRuleName}\nParent function: ${p.actionList.parentFunctionName||'none'}\nAction: ${p.actionList.label}\nAction-list mapping: ${p.actionList.actionListState}\nChildren: ${p.actionList.childCount}\n\n## Parent rule / sub-list path\n${p.path.map(seg=>seg.kind==='ActionList'?`- Action: ${seg.label}`:`- Rule: ${seg.name}`).join('\n')}\n\n## Child rules\n${p.children.map(c=>`- ${c.ruleName} (${c.functionName||'no function'})${c.disabled!=='none'?` - ${c.disabled}`:''}`).join('\n')||'- None'}\n\n## Notes\n${p.notProven.map(x=>`- ${x}`).join('\n')}\n`;}

function renderActionListInspector(b){
  const diags=actionListMessages(b);
  const summary=`<div class="kv">${kv('Action List',`<span class="action-list-chip ${b.resolved?'resolved':'unresolved'}">${esc(b.label)}</span>`)}${kv('Parent Rule',`<button class="btn ghost" type="button" data-node="${esc(b.parent.id)}">${esc(b.parent.title)}</button>`)}${kv('Parent function',`<span class="mono">${esc(b.parent.fn||'')}</span>`)}${kv('Status/action index',esc(b.actionListIndex??''))}${kv('Sub-list children',fmt(b.childCount))}</div><div class="action-list-actions"><button class="btn" type="button" data-action="copy-action-list-path">Copy Action List path</button></div>`;
  const path=`<div class="action-list-breadcrumb">${actionListPathObjects(b).map((seg,i)=>`${i?'<span class="action-list-arrow">-&gt;</span>':''}${seg.kind==='ActionList'?`<span class="action-list-step"><span class="action-list-chip ${seg.resolved?'resolved':'unresolved'}">Action List: ${esc(seg.label)}</span></span>`:`<button class="action-list-step" type="button" data-node="${esc(seg.nodeId)}"><b>${esc(seg.name)}</b></button>`}`).join('')}</div><div class="caption mt-8">Configured parent rule and sub-list path from the FWD configuration.</div>`;
  const children=b.childNodes.length?`<div class="mini-list">${b.childNodes.map(n=>`<button class="quick-card" type="button" data-node="${esc(n.id)}"><b>${esc(n.title)}</b><span>${esc(n.fn||'no function')} · ${n.disabled==='none'?'enabled':n.disabled}</span></button>`).join('')}</div>`:'<div class="muted">No child rules under this sub-list.</div>';
  const tabs=['summary','actions',...(isAdvancedMode()?['messages','raw']:[])];
  renderInspectorTabBar(tabs,{
    summary:'action list',
    actions:fmt(b.childCount),
    ...(isAdvancedMode()?{messages:fmt(diags.length),raw:'JSON'}:{})
  });
  if(state.inspectorView==='actions'){
    $('inspectorBody').innerHTML=`${sectionHtml('Parent Rule / Sub-list Path','path',path,true)}${sectionHtml('Child rules',b.childCount,children,true)}`;
  }else if(isAdvancedMode()&&state.inspectorView==='messages'){
    const diagBody=diags.length?diags.map(d=>`<div class="notice compact"><div class="notice-icon">!</div><div><b>${esc(d.title)}</b><br>${esc(d.detail)}</div></div>`).join(''):'<div class="muted">No diagnostics under this action list.</div>';
    $('inspectorBody').innerHTML=sectionHtml('Load Status',diags.length,diagBody,true);
  }else if(isAdvancedMode()&&state.inspectorView==='raw'){
    $('inspectorBody').innerHTML=`<pre class="raw">${esc(JSON.stringify(actionListPacket(b),null,2))}</pre>`;
  }else{
    $('inspectorBody').innerHTML=`${sectionHtml('Summary','action list',summary,true)}${sectionHtml('Parent Rule / Sub-list Path','path',path,true)}`;
  }
}


function hasVisibleQuery(x){const q=lower(state.query).trim();if(!q)return true;return matchesSearchQuery(x,q);}
function matchesSearchQuery(x,q){const blob=lower([x.searchBlob,x.title,x.name,x.fn,x.FunctionName,x.scopeId,x.kind,x.label,x.target,x.Target].join(' '));const terms=q.match(/"[^"]+"|\S+/g)||[];return terms.every(term=>{term=term.replace(/^"|"$/g,'');const gt=term.match(/^children>(\d+)$/i);if(gt)return Number(first(x.childCount,childIds(x.id).length,0))>Number(gt[1]);const parts=term.split(':');if(parts.length>1){const op=lower(parts.shift()),val=lower(parts.join(':').replace(/^"|"$/g,''));if(op==='function'||op==='fn')return lower(x.fn||x.FunctionName).includes(val);if(op==='field'||op==='target')return lower(x.target||x.Target||paramText(x.Parameters)).includes(val);if(op==='action'||op==='actionlist'||op==='status')return lower(actionNamesOf(x).join(' ')+' '+(x.label||'')+' '+(x.searchBlob||'')).includes(val);if(op==='disabled')return val==='true'?disabledOf(x)!=='none':lower(x.disabled||disabledOf(x)).includes(val);if(op==='has'){if(val==='disabled')return disabledOf(x)!=='none'||x.disabled!=='none';if(val==='message'||val==='status'||val==='warning'||val==='warnings')return !!x.nodeId?list(model.diagsByNode?.get(String(x.nodeId))).length>0:hasDiag(x);if(val==='actionlists'||val==='children')return childIds(x.id).length>0||childActionListGroups(x.id).length>0;}if(op==='scope')return lower(x.scopeId||scopeIdOf(x)).includes(val);if(op==='guid')return lower(x.RuleGuid||x.ruleGuid).includes(val);if(op==='flatonly'||op==='additional')return String(x.classification==='FlatOnly'||x.classification==='AdditionalRule').includes(val);if(op==='message'||op==='status')return lower(x.title||x.detail||x.searchBlob).includes(val);}return blob.includes(lower(term));});}
function searchKindLabel(kind){
  return ({
    Scope:'Scopes',
    StructuralRule:'Rules',
    ActionList:'Action lists',
    Reference:'References',
    Message:'Load Status',
    Function:'Functions',
    Table:'Tables',
    SelectionList:'SelectionLists',
    UDF:'UDFs',
    RuleList:'Rule Lists',
    ObjectGraph:'Object Graph',
    RuntimeImpact:'Runtime Impact',
    Resource:'Resources',
    Driver:'Drivers'
  })[kind]||'Other';
}
function searchKindRank(kind){
  return ({StructuralRule:1,Scope:2,ActionList:3,Function:4,UDF:5,SelectionList:6,Table:7,RuleList:8,ObjectGraph:9,RuntimeImpact:10,Reference:11,Message:12,Resource:13,Driver:14})[kind]||99;
}
function addGlobalDefinitionSearchRows(rows,q,kind,view,defs){
  list(defs).forEach(row=>{
    const blob=definitionSearchText(row);
    if(matchesSearchQuery({searchBlob:blob,title:row.name,scopeId:view},q)){
      rows.push({kind,view,key:row.key,title:row.name,subtitle:`${row.type||view} · ${fmt(list(row.usage).length||row.metric||0)} usage`,badges:[kind]});
    }
  });
}
function searchResults(){
  const q=lower(state.query).trim();
  if(!q)return [];
  const rows=[];
  for(const s of model.scopes){
    if(matchesSearchQuery({searchBlob:`${s.name} ${s.scopeId} ${s.kind}`},q))rows.push({kind:'Scope',scopeId:s.scopeId,title:s.name,subtitle:`${s.kind} · ${fmt(s.structural)} rules`,badges:[s.kind]});
  }
  for(const n of model.nodes){
    if(matchesSearchQuery(n,q))rows.push({kind:'StructuralRule',scopeId:n.scopeId,nodeId:n.id,title:n.title,subtitle:`${n.fn||'no function'} · ${n.scopeId}`,badges:[n.disabled!=='none'?n.disabled:'Rule'].filter(Boolean),actionPreview:model.incomingByChild.get(n.id)?.label||'root'});
  }
  for(const n of model.nodes){
    for(const g of childActionListGroups(n.id)){
      const key=actionListKey(n.id,g);
      const childCount=list(g.childIds).length;
      if(matchesSearchQuery({searchBlob:`${g.label} ${n.title} ${n.fn} ${n.scopeId}`},q))rows.push({kind:'ActionList',scopeId:n.scopeId,actionListKey:key,title:`Action List: ${g.label||'Unnamed action list'}`,subtitle:`Parent: ${n.title} · ${fmt(childCount)} child rules`,badges:['Action List']});
    }
  }
  try{
    addGlobalDefinitionSearchRows(rows,q,'Function','functions',buildGlobalFunctionDefinitions());
    addGlobalDefinitionSearchRows(rows,q,'SelectionList','selection-lists',buildSelectionListPacketDefinitions());
    addGlobalDefinitionSearchRows(rows,q,'Table','tables',buildGlobalTableDefinitions().map(t=>({...t,key:t.name,type:t.hasParsedSchema?'Parsed table':'Table',metric:list(t.usage).length})));
    addGlobalDefinitionSearchRows(rows,q,'UDF','udfs',buildUdfDefinitions().map(u=>({...u,name:u.displayName||u.key,type:u.type||'UDF',metric:list(u.callerRules).length,usage:u.callerRules})));
    addGlobalDefinitionSearchRows(rows,q,'RuleList','rule-lists',buildRuleListPacketDefinitions());
    if(isAdvancedMode()){
      addGlobalDefinitionSearchRows(rows,q,'ObjectGraph','object-graph',buildObjectGraphDefinitions());
      addGlobalDefinitionSearchRows(rows,q,'RuntimeImpact','runtime-impact',buildRuntimeImpactDefinitions());
    }
    addGlobalDefinitionSearchRows(rows,q,'Resource','resources',buildGlobalResourceDefinitions());
    addGlobalDefinitionSearchRows(rows,q,'Driver','drivers',buildGlobalDriverDefinitions());
  }catch(error){
    console.warn('FormWorks Editor Viewer: global search definition indexing failed.',error);
  }
  for(const r of model.rels){
    if(matchesSearchQuery(r,q))rows.push({kind:'Reference',scopeId:r.scopeId,nodeId:r.nodeId,title:`${r.kind}: ${r.target}`,subtitle:`${r.targetType}`,badges:['Reference']});
  }
  for(const d of model.diags){
    if(matchesSearchQuery(d,q))rows.push({kind:'Message',scopeId:d.scopeId,nodeId:d.nodeId,title:d.title,subtitle:d.detail,badges:[d.severity]});
  }
  return rows.sort((a,b)=>searchKindRank(a.kind)-searchKindRank(b.kind)||text(a.title).localeCompare(text(b.title),undefined,{sensitivity:'base'})).slice(0,120);
}

function renderSearchPopover(){
  const pop=$('searchPopover');
  if(!pop)return;
  const q=state.query.trim();
  if(!q){
    pop.classList.remove('open');
    pop.innerHTML='';
    state.searchActiveIndex=-1;
    $('globalSearch').setAttribute('aria-expanded','false');
    $('globalSearch').removeAttribute('aria-activedescendant');
    return;
  }
  const results=searchResults();
  if(!results.length)state.searchActiveIndex=-1;
  else state.searchActiveIndex=Math.max(0,Math.min(results.length-1,state.searchActiveIndex));
  pop.classList.add('open','command-palette');
  $('globalSearch').setAttribute('aria-expanded','true');
  const groups=[];
  results.forEach((row,index)=>{
    const label=searchKindLabel(row.kind);
    let group=groups.find(g=>g.label===label);
    if(!group){group={label,items:[]};groups.push(group);}
    group.items.push({row,index});
  });
  const groupHtml=groups.map(group=>`<section class="search-group" aria-label="${esc(group.label)}"><div class="search-group-title"><span>${esc(group.label)}</span><b>${fmt(group.items.length)}</b></div>${group.items.map(({row:r,index:i})=>`<button id="searchResult-${i}" class="search-result ${i===state.searchActiveIndex?'active':''}" type="button" data-search-index="${i}" role="option" aria-selected="${i===state.searchActiveIndex?'true':'false'}"><span class="search-result-main"><span class="search-result-title">${esc(r.title)}</span><span class="search-result-sub">${esc(r.subtitle||'')}</span>${r.actionPreview?`<span class="search-result-action-list">${esc(r.actionPreview)}</span>`:''}</span><span class="search-result-badges">${(r.badges||[]).slice(0,2).map(b=>`<span class="badge blue">${esc(b)}</span>`).join('')}</span></button>`).join('')}</section>`).join('');
  pop.innerHTML=`<div class="command-palette-head"><div><b>Command search</b><span>${fmt(results.length)} result${results.length===1?'':'s'} for “${esc(q)}”</span></div><div class="command-palette-keys"><kbd>↑↓</kbd><kbd>Enter</kbd><kbd>Esc</kbd></div></div><div class="search-help">Operators: action:"Run Rules", function:_IGetDocAttr, has:disabled, children&gt;20, scope:DentalADA. Use <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> from anywhere.</div>${results.length?groupHtml:'<div class="empty"><div>No matching objects.</div></div>'}`;
  pop._results=results;
  announceContentStatus(results.length?`${results.length} search result${results.length===1?'':'s'} for ${q}`:`No search results for ${q}`);
  const activeId=state.searchActiveIndex>=0?`searchResult-${state.searchActiveIndex}`:'';
  if(activeId)$('globalSearch').setAttribute('aria-activedescendant',activeId);
  else $('globalSearch').removeAttribute('aria-activedescendant');
}
function closeSearchPopover(){const pop=$('searchPopover');if(!pop)return;pop.classList.remove('open','command-palette');pop.innerHTML='';pop._results=[];state.searchActiveIndex=-1;$('globalSearch').setAttribute('aria-expanded','false');$('globalSearch').removeAttribute('aria-activedescendant');}
function setSearchActiveIndex(index){const pop=optionalElement('searchPopover');const results=pop?._results||[];if(!results.length){state.searchActiveIndex=-1;renderSearchPopover();return;}const max=results.length-1;state.searchActiveIndex=Math.max(0,Math.min(max,index));renderSearchPopover();const row=document.getElementById(`searchResult-${state.searchActiveIndex}`);row?.scrollIntoView({block:'nearest'});}
function handleSearchPopoverKeydown(e){const pop=optionalElement('searchPopover');const open=!!pop?.classList.contains('open');if(!open)return false;const results=pop?._results||[];if(!results.length)return false;if(e.key==='ArrowDown'){e.preventDefault();setSearchActiveIndex((state.searchActiveIndex<0?0:state.searchActiveIndex)+1);return true;}if(e.key==='ArrowUp'){e.preventDefault();setSearchActiveIndex((state.searchActiveIndex<0?results.length-1:state.searchActiveIndex)-1);return true;}if(e.key==='Enter'){const idx=state.searchActiveIndex<0?0:state.searchActiveIndex;const hit=results[Math.max(0,Math.min(results.length-1,idx))];if(hit){e.preventDefault();jumpToSearchResult(hit);return true;}}return false;}
function isSearchUiTarget(target){return !!target?.closest?.('.global-search,.fweditor-command-search,#searchPopover,[data-search-index]');}
// Build a nested, operator-first left object tree with grouped sections and direct actions.

function globalNavigationCounts(){
  if(globalNavigationCountsCache)return globalNavigationCountsCache;
  const definedCounts=model.fwd?.overview?.counts||{};
  const tableDefs=buildGlobalTableDefinitions();
  globalNavigationCountsCache={
    resources:first(definedCounts.resourceTypes,domainRowsByView('resources').length),
    functions:first(model.fwd?.functions?.count,domainRowsByView('functions').length),
    selectionLists:first(model.fwd?.selectionLists?.count,buildSelectionListPacketDefinitions().length),
    tables:first(model.fwd?.tables?.count,definedCounts.tables,tableDefs.length),
    drivers:domainRowsByView('drivers').length,
    udfs:buildUdfDefinitions().length,
    ruleLists:first(model.fwd?.ruleLists?.count,buildRuleListPacketDefinitions().length),
    objectGraph:first(list(model.fwd?.objectGraph?.nodes).length,list(model.fwd?.editorModel?.objectGraph?.nodes).length,0),
    runtimeImpact:first(model.fwd?.runtimeImpact?.count,buildRuntimeImpactDefinitions().length)
  };
  return globalNavigationCountsCache;
}
function activeGlobalDefinitionKey(kind){
  if(kind==='resources')return state.selectedResourceKey;
  if(kind==='functions')return state.selectedFunctionName;
  if(kind==='selection-lists')return state.selectedSelectionListName;
  if(kind==='drivers')return state.selectedDriverKey;
  if(kind==='tables')return state.selectedTableName;
  if(kind==='udfs')return state.selectedUdfName;
  if(kind==='rule-lists')return state.selectedRuleListKey;
  if(kind==='object-graph')return state.selectedObjectGraphKey;
  if(kind==='runtime-impact')return state.selectedRuntimeImpactKey;
  return '';
}
function compactGlobalDefinitionRowHtml(kind,row,options={}){
  const key=text(first(row?.key,row?.name,''));
  const name=text(first(row?.name,row?.displayName,key));
  if(!kind||!key||!name)return '';
  const active=state.workspaceView===kind&&activeGlobalDefinitionKey(kind)===key;
  const meta=text(first(row?.type,row?.source,options.meta,''));
  const count=Number(first(row?.metric,row?.count,row?.ruleCount,row?.scopeCount,''));
  const countHtml=Number.isFinite(count)&&count>0?`<span class="global-view-count">${fmt(count)}</span>`:'';
  const title=`Open ${kind.replace('-', ' ')} definition: ${name}${meta?` (${meta})`:''}`;
  return `<button class="global-view-row child definition-tree-row ${active?'active':''}" type="button" data-editor-kind="${esc(kind)}" data-editor-key="${esc(key)}" data-def-kind="${esc(kind)}" data-def-key="${esc(key)}" aria-current="${active?'true':'false'}" title="${esc(title)}"><span class="global-view-name"><b>${esc(name)}</b>${meta?`<small>${esc(meta)}</small>`:''}</span>${countHtml}</button>`;
}
function compactGlobalDefinitionSectionHtml(kind,title,rows,options={}){
  const all=list(rows).filter(r=>text(first(r?.key,r?.name,'')).trim());
  if(!all.length)return '';
  const limit=Number(first(options.limit,12))||12;
  const active=state.workspaceView===kind;
  const visible=all.slice(0,limit);
  const more=all.length-visible.length;
  const rowHtml=visible.map(row=>compactGlobalDefinitionRowHtml(kind,row,options)).join('');
  const moreHtml=more>0?`<button class="global-view-row child muted-row" type="button" data-action="view-${esc(kind)}" title="Open full ${esc(title)} catalog"><span class="global-view-name">Show ${fmt(more)} more...</span><span class="global-view-count">↗</span></button>`:'';
  return `<details class="scope-section global-inventory-section" ${active?'open':''}><summary><span>${esc(title)}</span><span class="section-count">${fmt(all.length)}</span></summary><div class="scope-section-body">${rowHtml}${moreHtml}</div></details>`;
}
function compactResourceBucketTreeHtml(){
  const resources=buildGlobalResourceDefinitions();
  if(!resources.length)return '';
  const byType=new Map();
  resources.forEach(row=>{
    const type=text(row.type||'Resource');
    if(!byType.has(type))byType.set(type,[]);
    byType.get(type).push(row);
  });
  const sections=[...byType.entries()]
    .sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'}))
    .slice(0,8)
    .map(([type,rows],index)=>{
      const sorted=rows.slice().sort((a,b)=>(Number(first(b.metric,0))-Number(first(a.metric,0)))||text(a.name).localeCompare(text(b.name),undefined,{sensitivity:'base'}));
      const visible=sorted.slice(0,10);
      const more=sorted.length-visible.length;
      const active=state.workspaceView==='resources'&&sorted.some(r=>r.key===state.selectedResourceKey);
      const rowHtml=visible.map(row=>compactGlobalDefinitionRowHtml('resources',row,{meta:type})).join('');
      const moreHtml=more>0?`<button class="global-view-row child muted-row" type="button" data-action="view-resources" title="Open full resource catalog"><span class="global-view-name">Show ${fmt(more)} more ${esc(type)}...</span><span class="global-view-count">↗</span></button>`:'';
      return `<details class="scope-section global-inventory-section" ${(active||index<2)?'open':''}><summary><span>${esc(type)}</span><span class="section-count">${fmt(sorted.length)}</span></summary><div class="scope-section-body">${rowHtml}${moreHtml}</div></details>`;
    });
  const remaining=Math.max(0,byType.size-8);
  const remainingHtml=remaining?`<button class="global-view-row child muted-row" type="button" data-action="view-resources" title="Open full resource catalog"><span class="global-view-name">Show ${fmt(remaining)} more resource type buckets...</span><span class="global-view-count">↗</span></button>`:'';
  return `<details class="scope-section global-inventory-root" ${state.workspaceView==='resources'?'open':''}><summary><span>Resource Types</span><span class="section-count">${fmt(resources.length)}</span></summary><div class="scope-section-body">${sections.join('')}${remainingHtml}</div></details>`;
}
function renderGlobalInventoryTreeBlock(){
  if(!model?.fwd)return '';
  // Do not pre-slice global inventory packets here. compactGlobalDefinitionSectionHtml() handles
  // the visible row limit while preserving the true total count in the left rail.
  const functionRows=buildGlobalFunctionDefinitions();
  const selectionRows=buildSelectionListPacketDefinitions();
  const tableRows=buildGlobalTableDefinitions();
  const udfRows=buildUdfDefinitions().map(row=>({key:row.key,name:row.displayName||row.name||row.key,type:row.type||'UDF',metric:list(row.callerRules).length}));
  const driverRows=buildGlobalDriverDefinitions();
  const packetRows=buildRuleListPacketDefinitions();
  const body=[
    compactResourceBucketTreeHtml(),
    compactGlobalDefinitionSectionHtml('udfs','UDFs',udfRows,{limit:32}),
    compactGlobalDefinitionSectionHtml('tables','Tables',tableRows,{limit:24}),
    compactGlobalDefinitionSectionHtml('selection-lists','SelectionLists',selectionRows,{limit:10}),
    compactGlobalDefinitionSectionHtml('functions','Functions',functionRows,{limit:24}),
    compactGlobalDefinitionSectionHtml('drivers','Drivers',driverRows,{limit:8}),
    compactGlobalDefinitionSectionHtml('rule-lists','Rule Lists',packetRows,{limit:8})
  ].filter(Boolean).join('');
  return body||'<div class="muted compact-left-note">No global FWD index packets are loaded yet.</div>';
}
/* v80: stale pre-editor renderers are removed; the FWD tree renderer is the active implementation. */
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
    tables:first(model.fwd?.tables?.count,definedCounts?.tables,tableDefs.length),
    drivers:toTotal(drivers),
    udfs:toTotal(udfs),
    unresolvedFields:getScopeFieldResolutionIndex(state.scopeId).summary.unresolved
  };
  function objectTreeRow(action,label,count,title,active=false,child=false){
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
    objectTreeRow('nav-documents','Documents',counts.documents,'Document type configuration scopes',nav.documents,true),
    objectTreeRow('nav-pages','Pages',counts.pages,'Page type configuration scopes',nav.pages,true),
    objectTreeRow('nav-batches','Batches',counts.batches,'Batch configuration scopes',nav.batches,true),
    objectTreeRow('nav-processes','Processes',counts.processes,'Process-node configuration scopes',nav.processes,true)
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
  const scopeHost=optionalElement('scopeList');
  if(!scopeHost)return;
  // The left rail is intentionally no longer a second scope selector.
  // Scope access is available in the FWD Tree rendered by renderGlobalNavigation().
  document.body.classList.toggle('no-scope-selector',!state.scopeId||!currentScope());
  scopeHost.hidden=true;
  scopeHost.setAttribute('aria-hidden','true');
  scopeHost.innerHTML='';
}

function jumpToSearchResult(r){
  if(!r)return;
  closeSearchPopover();
  if(r.kind==='Scope')return selectScope(r.scopeId);
  if(r.kind==='ActionList'){
    selectScope(r.scopeId);
    selectActionList(r.actionListKey);
    state.collapsedActionLists.delete(r.actionListKey);
    renderAll();
    return;
  }
  if(r.view&&r.key){
    state.workspaceView=r.view;
    if(r.view==='resources')state.selectedResourceKey=r.key;
    else if(r.view==='functions')state.selectedFunctionName=r.key;
    else if(r.view==='selection-lists')state.selectedSelectionListName=r.key;
    else if(r.view==='drivers')state.selectedDriverKey=r.key;
    else if(r.view==='tables')state.selectedTableName=r.key;
    else if(r.view==='udfs')state.selectedUdfName=r.key;
    else if(r.view==='rule-lists')state.selectedRuleListKey=r.key;
    else if(r.view==='object-graph')state.selectedObjectGraphKey=r.key;
    else if(r.view==='runtime-impact')state.selectedRuntimeImpactKey=r.key;
    document.body.classList.remove('inspector-open');
    renderAll();
    return;
  }
  if(r.nodeId){selectScope(r.scopeId);selectNode(r.nodeId);return;}
  if(r.scopeId)selectScope(r.scopeId);
}
// Keep scope-local views intentionally narrow for Document/Page scopes.
// Resource-definition catalogs are global concerns and are not shown as direct Doc/Page tabs.
/* FW Editor Viewer 2026 UI refresh render overrides. Keep data/model behavior unchanged. */
function syncThemeControl(){
  const btn=optionalElement('themeToggleBtn');
  if(!btn)return;
  const dark=state.theme==='dark';
  btn.setAttribute('aria-pressed',dark?'true':'false');
  btn.setAttribute('title',dark?'Switch to light theme':'Switch to dark theme');
  btn.setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme');
}
function productHealthLabel(hydration,warnings){
  if(hydration.level==='warn')return ['warn','Partial snapshot','Status loaded with fallback or missing endpoints.'];
  if(Number(warnings||0)>0)return ['warn','Configuration warnings',`${fmt(warnings)} warnings are available in Load Status.`];
  return ['ok','Ready for review','Snapshot loaded cleanly with no reader warnings.'];
}
function renderAll(){return withUiGuard('render',()=>{if(typeof recordViewerDiagnostic==='function')recordViewerDiagnostic('info','render-all-start',{workspaceView:state.workspaceView,scopeId:state.scopeId,modelCounts:typeof modelCounts==='function'?modelCounts():null});normalizeWorkspaceViewForScope();ensureUsefulWorkspaceSelection('render');setEditorModeClasses();if(isEditorMode()){document.body.classList.remove('inspector-open');}else{applyPaneLayout();}syncInspectorVisibility();saveState();renderTop();renderGlobalNavigation();renderScopes();renderMainHead();renderContent();ensureRenderedContentFallback('empty workspace render');renderDiagnosticsDock();renderInspector();renderSearchPopover();syncOnboardingChecklist();syncActionAvailability();if(typeof recordViewerDiagnostic==='function')recordViewerDiagnostic('info','render-all-complete',{workspaceView:state.workspaceView,scopeId:state.scopeId,contentChars:(optionalElement('content')?.textContent||'').length});});}
function renderTop(){
  document.body.classList.toggle('no-scope-selector',!state.scopeId||!currentScope());
  const banner=optionalElement('globalErrorBanner');
  if(banner&&bootState.phase!=='failed')banner.hidden=true;
  document.body.classList.toggle('is-loading',!model||bootState.phase==='loading');
  document.body.classList.toggle('is-loaded',!!model&&bootState.phase!=='loading');
  setEditorModeClasses();
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
  $('sourceSubtitle').textContent=`${snapshotId()} · read-only · ${total} rules`;
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
  syncThemeControl();
}
function viewLabel(){
  const labels={all:'All rules',disabled:'Disabled only',inherited:'Inherited disabled',warnings:'Load status only',actions:'Parent rules with action lists',sections:'Sections and comments'};
  const base=labels[state.treeFilter]||'Filtered view';
  const q=text(state.query).trim();
  return q?`${base} | search: ${q}`:base;
}
function activeSliceHtml(){
  const view=state.workspaceView||'structure';
  const labels={
    structure:['Structure','Rule hierarchy'],
    'field-resolution':['Fields','Resolution matrix'],
    'load-status':['Load Status','Developer'],
    resources:['Resources','Global definitions'],
    functions:['Functions','AC catalog'],
    tables:['Tables','Global definitions'],
    drivers:['Drivers','Global definitions'],
    udfs:['UDFs','Global definitions'],
  };
  const row=labels[view]||['Editor','FWD view'];
  return `<div class="active-slice" aria-label="Active configuration view"><span>${esc(row[0])}</span><b>${esc(row[1])}</b></div>`;
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
    'action-list':{
      title:'Action Lists / Status Results',
      body:'An action list is the configured sub-list selected by a parent rule status result. The parent rule owns the status/action label; child rules do not.',
      checks:['Confirm the parent rule and status result.','Review child rules in configured order.','Treat the path as static FWD configuration, not runtime execution.']
    },
    model:{
      title:'FWD model',
      body:'FormWorks Editor authors the FWD/STC model: documents, pages, variants, fields, batches, processes, resources, and private configuration nodes. This viewer is read-only.',
      checks:['Use Structure for rule-list hierarchy.','Use global definitions for functions, UDFs, tables, resources, and drivers.','Use Advanced / Raw only as final confirmation.']
    },
    disabled:{
      title:'Disabled state',
      body:'Disabled state is reported from extracted structural configuration when available. Inherited disabled means the rule sits under a disabled parent in the rule-list tree.',
      checks:['Distinguish direct disabled from inherited disabled.','Treat sequence-only hints as reader-status hints only.','Check parent rule and action-list context before drawing conclusions.']
    }
  };
  const item=help[topic]||{title:'Context help',body:'This view is read-only and FWD-first.',checks:['Select a scope.','Inspect the rule or Action List.','Copy config when documenting findings.']};
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

function matchingProcessDiagnostic(processName){
  if(!text(processName).trim())return null;
  return scopedDiags().find(d=>hasProcessToken(processName,`${d.title} ${d.detail} ${d.Message} ${d.scopeId}`))||null;
}
function matchingProcessRule(processName){
  if(!text(processName).trim())return null;
  return scopedRuleNodes().find(n=>hasProcessToken(processName,`${n.fn} ${n.title} ${n.scopeId}`))||null;
}
function selectProcessContext(processName){
  const name=text(processName).trim();
  if(!name)return;
  state.selectedProcessName=name;
  state.workspaceView='structure';
  const diag=matchingProcessDiagnostic(name);
  const node=diag?null:matchingProcessRule(name);
  if(diag){
    state.messageFilter=severityIsError(diag.severity)?'error':(severityIsProblem(diag.severity)?'warning':'info');
    state.selectedType='diag';
    state.selectedId=diag.id;
    document.body.classList.add('inspector-open');
  }else if(node){
    state.selectedType='node';
    state.selectedId=node.id;
    state.focusNodeId=node.id;
    state.expanded.add(node.id);
    document.body.classList.add('inspector-open');
  }else{
    state.selectedType='scope';
    state.selectedId='';
    state.focusNodeId='';
    document.body.classList.remove('inspector-open');
  }
  renderAll();
  toast(`${name} process context selected`);
}
function selectMessageFilter(mode){
  state.messageFilter=normalizeMessageFilter(mode);
  if(state.messageFilter==='rule-validation'){
    state.workspaceView='structure';
    state.treeFilter='warnings';
  }else if(state.messageFilter==='missing-refs'){
    state.workspaceView='field-resolution';
    state.fieldResolutionFilter='unresolved';
  }else{
    state.workspaceView=isAdvancedMode()?'load-status':'structure';
  }
  const d=firstDiagnosticForFilter(state.messageFilter);
  if(d){
    state.selectedType='diag';
    state.selectedId=d.id;
    document.body.classList.add('inspector-open');
  }else if(state.selectedType==='diag'){
    state.selectedType='scope';
    state.selectedId='';
  }
  renderAll();
}

function renderModal(){const open=!!state.modal;const app=optionalElement('mainContent')?.closest('.app');$('modalBackdrop').classList.toggle('open',open);$('helpModal').classList.toggle('open',open);$('helpModal').classList.toggle('wide',state.modal==='global-detail');if(app){if(open)app.setAttribute('aria-hidden','true');else app.removeAttribute('aria-hidden');}if(!open){if(modalPreviouslyFocusedEl&&typeof modalPreviouslyFocusedEl.focus==='function')modalPreviouslyFocusedEl.focus();modalPreviouslyFocusedEl=null;return;}if(!modalPreviouslyFocusedEl)modalPreviouslyFocusedEl=document.activeElement;const detail=state.modal==='global-detail'?globalDetailRecord():null;const title=state.modal==='global-detail'?(detail?.row?.name||detail?.row?.displayName||detail?.row?.key||'Definition details'):state.modal?.startsWith('help-')?'Contextual help':'FormWorks Editor Viewer help';$('helpTitle').textContent=title;$('helpCaption').textContent=state.modal==='global-detail'?(detail?.label||'Definition details'):'Read-only FormWorks Editor Viewer.';if(state.modal==='global-detail')$('helpBody').innerHTML=renderGlobalDefinitionModal();else if(state.modal?.startsWith('help-'))$('helpBody').innerHTML=renderContextHelp(state.modal.replace(/^help-/,''));else renderHelp();const firstNode=modalFocusableElements()[0];window.setTimeout(()=>{(firstNode||$('helpModal')).focus();},0);}

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
const fwdToggle=e.target.closest('[data-fwd-toggle]')?.dataset.fwdToggle;if(fwdToggle){e.preventDefault();toggleFwdTreeKey(fwdToggle);return;}const fwdObject=e.target.closest('[data-fwd-object]')?.dataset.fwdObject;if(fwdObject){e.preventDefault();selectEditorObject(fwdObject);return;}const inspectorTab=e.target.closest('[data-inspector-tab]')?.dataset.inspectorTab;if(inspectorTab){state.inspectorView=inspectorTab;renderInspector();saveState();return;}const editorEl=e.target.closest('[data-editor-kind][data-editor-key]');if(editorEl){e.preventDefault();if(openGlobalDefinition(editorEl.dataset.editorKind,editorEl.dataset.editorKey))return;}const defEl=e.target.closest('[data-def-kind][data-def-key]');if(defEl){e.preventDefault();if(openGlobalDefinition(defEl.dataset.defKind,defEl.dataset.defKey))return;}const udfTab=e.target.closest('[data-udf-tab]')?.dataset.udfTab;if(udfTab){e.preventDefault();state.udfEditorTab=udfTab;renderContent();saveState();return;}const udfFilter=e.target.closest('[data-udf-filter]')?.dataset.udfFilter;if(udfFilter){state.udfFilter=udfFilter;state.selectedUdfName='';renderAll();return;}const fieldFilter=e.target.closest('[data-field-filter]')?.dataset.fieldFilter;if(fieldFilter){state.fieldResolutionFilter=fieldFilter;renderContent();renderDiagnosticsDock();saveState();return;}const sf=e.target.closest('[data-scope-filter]')?.dataset.scopeFilter;if(sf){state.scopeKindFilter=sf;saveState();renderScopes();return;}const sc=e.target.closest('[data-scope]')?.dataset.scope;if(sc){selectScope(sc);return;}const tog=e.target.closest('[data-toggle-node]')?.dataset.toggleNode;if(tog){const nodeId=String(tog);if(state.expanded.has(nodeId)){state.expanded.delete(nodeId);}else{state.expanded.add(nodeId);collapseActionListsForNode(nodeId);}renderContent();renderViewbar();renderDiagnosticsDock();renderInspector();return;}const br=e.target.closest('[data-toggle-action-list]')?.dataset.toggleActionList;if(br){state.collapsedActionLists.has(br)?state.collapsedActionLists.delete(br):state.collapsedActionLists.add(br);renderContent();renderViewbar();renderDiagnosticsDock();renderInspector();return;}const actionList=e.target.closest('[data-action-list]')?.dataset.actionList;if(actionList){selectActionList(actionList);return;}const nodeEl=e.target.closest('[data-node]');const node=nodeEl?.dataset.node;if(node){selectNodeInScope(node,nodeEl?.dataset.nodeScope||'');return;}const inv=e.target.closest('[data-inventory]')?.dataset.inventory;if(inv){state.selectedType='inventory';state.selectedId=inv;document.body.classList.add('inspector-open');renderAll();return;}const rel=e.target.closest('[data-rel]')?.dataset.rel;if(rel){state.selectedType='rel';state.selectedId=rel;document.body.classList.add('inspector-open');renderAll();return;}const diag=e.target.closest('[data-diag]')?.dataset.diag;if(diag){state.selectedType='diag';state.selectedId=diag;document.body.classList.add('inspector-open');renderAll();return;}});
  document.addEventListener('input',e=>{if(e.target.id==='scopeSearch'||e.target.id==='fwdTreeFilter'){closeSearchPopover();state.scopeQuery=e.target.value;renderGlobalNavigation();}else if(e.target.id==='globalSearch'||e.target.id==='viewSearch'||e.target.id==='editorSearch'){if(searchDebounceTimer)window.clearTimeout(searchDebounceTimer);const sourceId=e.target.id;searchDebounceTimer=window.setTimeout(()=>applyQueryInput(e.target.value,sourceId),120);}});
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
    if(!typing&&handleFwdTreeNavigation(e))return;
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
function handleFwdTreeNavigation(e){
  const active=document.activeElement?.closest?.('.fwd-tree-row');
  if(!active)return false;
  const rows=[...document.querySelectorAll('.fwd-editor-tree .fwd-tree-select')].filter(row=>row.offsetParent!==null);
  const selected=active.querySelector('.fwd-tree-select');
  const index=rows.indexOf(selected);
  if(e.key==='ArrowDown'||e.key==='ArrowUp'||e.key==='Home'||e.key==='End'){
    e.preventDefault();
    let nextIndex=index;
    if(e.key==='Home')nextIndex=0;
    else if(e.key==='End')nextIndex=rows.length-1;
    else nextIndex=Math.max(0,Math.min(rows.length-1,index+(e.key==='ArrowDown'?1:-1)));
    rows[nextIndex]?.focus();
    return true;
  }
  const toggle=active.querySelector('[data-fwd-toggle]');
  if(e.key==='ArrowRight'&&toggle){
    e.preventDefault();
    toggleFwdTreeKey(toggle.dataset.fwdToggle,true);
    return true;
  }
  if(e.key==='ArrowLeft'&&toggle){
    e.preventDefault();
    toggleFwdTreeKey(toggle.dataset.fwdToggle,false);
    return true;
  }
  if(e.key==='Enter'||e.key===' '){
    e.preventDefault();
    const key=selected?.dataset.fwdObject;
    if(key)selectEditorObject(key);
    return true;
  }
  return false;
}


function udfHasInternalRules(u){return list(u?.internalRules).length>0||/RuleListAvailable/i.test(text(u?.availabilityState));}

/* FW Editor Viewer shell v80 -------------------------------------------------
   Default mode is a read-only FW Editor-style configuration browser.
   Advanced diagnostics remain available only behind ?advanced=1. */
function localWorkspaceViews(){
  return ['editor-object','structure','field-resolution',...(isAdvancedMode()?['load-status']:[])];
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
    'editor-object':['FWD Object','Read-only FormWorks Editor object configuration.'],
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
  let [title,caption]=productViewTitle();
  const selectedScope=currentScope();
  const editorObject=state.workspaceView==='editor-object'?fwdEditorObject():null;
  if(editorObject){
    title=editorObject.name;
    caption=`${editorObject.type} configuration and relationships.`;
  }
  $('scopeTitle').textContent=title;
  $('scopeCaption').innerHTML=`<span class="scope-caption-note">${esc(caption)}</span>`;
  const crumbParts=['FormWorks Editor Viewer'];
  if(editorObject)crumbParts.push(editorObject.type,editorObject.name);
  if(state.workspaceView==='structure'&&selectedScope)crumbParts.push(selectedScope.name||selectedScope.scopeId);
  $('crumbs').innerHTML=`${crumbParts.map(x=>`<span class="head-chip">${esc(x)}</span>`).join('')}<span class="head-chip">Read-only</span>${fwdHydrationSummary().level==='warn'?'<span class="head-chip warning">Status partial</span>':'<span class="head-chip success">Loaded</span>'}`;
  renderWorkspaceTabs();
  renderViewbar();
}
function renderWorkspaceTabs(){
  const host=$('tabs');
  if(state.workspaceView==='overview'||state.workspaceView==='editor-object'||isGlobalDefinitionView()){
    host.innerHTML='';
    host.hidden=true;
    host.setAttribute('aria-hidden','true');
    return;
  }
  host.hidden=false;
  host.removeAttribute('aria-hidden');
  const tabs=[['structure','Rule List'],['field-resolution','Fields / Parameters'],...(isAdvancedMode()?[[ 'load-status','Load Status' ]]:[])];
  host.innerHTML=tabs.map(([id,label])=>`<button class="workspace-tab ${state.workspaceView===id?'active':''}" type="button" role="tab" data-action="view-${esc(id)}" aria-selected="${state.workspaceView===id?'true':'false'}"><span>${esc(label)}</span></button>`).join('');
}
function renderViewbar(){
  const view=state.workspaceView||'overview';
  const host=$('viewbar');
  if(view==='overview'||view==='editor-object'){
    host.innerHTML='';
    host.hidden=true;
    return;
  }
  host.hidden=false;
  const [title]=productViewTitle(view);
  const search=viewSearchMeta();
  const showSearch=view!=='overview';
  host.innerHTML=`<div class="product-viewbar"><div class="product-view-pill"><span>${esc(title)}</span><b>${isGlobalDefinitionView(view)?'Global resource':'Workspace'}</b></div>${showSearch?`<div class="field tree-filter"><label class="sr-only" for="viewSearch">${esc(search.label)}</label><input id="viewSearch" type="search" value="${esc(state.query)}" placeholder="${esc(search.placeholder)}"><button class="filter-clear" type="button" data-action="clear-tree-search" ${text(state.query).trim()?'':'disabled'}>Clear</button></div>`:''}${state.workspaceView==='structure'?`<div class="viewbar-right"><select id="treeFilter" aria-label="Rule List filter"><option value="all" ${state.treeFilter==='all'?'selected':''}>All rules</option><option value="disabled" ${state.treeFilter==='disabled'?'selected':''}>Disabled</option><option value="warnings" ${state.treeFilter==='warnings'?'selected':''}>Warnings</option><option value="actions" ${state.treeFilter==='actions'?'selected':''}>Action parents</option></select><button class="btn" type="button" data-action="collapse-all">Collapse</button><button class="btn" type="button" data-action="expand-selected-depth">Open selected</button></div>`:''}</div>`;
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

function renderContent(){
  if(state.workspaceView==='overview')state.workspaceView='structure';
  if(state.workspaceView==='editor-object')return renderEditorObject();
  if(state.workspaceView==='field-resolution')return renderFieldResolutionCatalog();
  if(isLoadStatusView())return isAdvancedMode()?renderMessages():renderStructure();
  if(state.workspaceView==='resources')return renderGlobalResourceDefinitions();
  if(state.workspaceView==='functions')return renderGlobalFunctionDefinitions();
  if(state.workspaceView==='selection-lists')return renderSelectionListPacketDefinitions();
  if(state.workspaceView==='tables')return renderGlobalTablesMasterDetail();
  if(state.workspaceView==='drivers')return renderGlobalDriverDefinitions();
  if(state.workspaceView==='udfs')return renderUdfMasterDetail();
  if(state.workspaceView==='rule-lists')return renderRuleListPacketDefinitions();
  if(isAdvancedMode()&&state.workspaceView==='object-graph')return renderObjectGraphDefinitions();
  if(isAdvancedMode()&&state.workspaceView==='runtime-impact')return renderRuntimeImpactDefinitions();
  return renderStructure();
}

function fwdPacketItems(name){
  const packet=model?.fwd?.[name];
  if(Array.isArray(packet))return packet;
  return list(first(packet?.items,packet?.Items,[]));
}
function fwdStableKey(type,name){
  return `${type}:${text(name).trim()}`;
}
function fwdScopeFor(kind,name){
  return list(model?.scopes).find(scope=>sameName(scope.kind,kind)&&sameName(scope.name,name))
    || list(model?.scopes).find(scope=>new RegExp(kind,'i').test(text(scope.kind))&&sameName(scope.name,name))
    || null;
}
function buildFwdEditorIndex(){
  const byKey=new Map();
  const add=record=>{
    if(!record?.key)return null;
    const existing=byKey.get(record.key)||{};
    const merged={childKeys:[],parentKeys:[],metadata:{},...existing,...record};
    merged.childKeys=[...new Set([...list(existing.childKeys),...list(record.childKeys)])];
    merged.parentKeys=[...new Set([...list(existing.parentKeys),...list(record.parentKeys)])];
    merged.metadata={...(existing.metadata||{}),...(record.metadata||{})};
    byKey.set(merged.key,merged);
    return merged;
  };
  const batches=fwdPacketItems('batches').map(item=>add({
    key:text(first(item.key,item.Key,fwdStableKey('batch',item.name||item.Name))),
    type:'batchType',
    name:text(first(item.name,item.Name,'Unnamed batch')),
    childKeys:list(first(item.documentKeys,item.DocumentKeys,[])),
    source:'Fwd.GetDocsInBatch',
    raw:item
  }));
  const documents=fwdPacketItems('documents').map(item=>{
    const name=text(first(item.name,item.Name,'Unnamed document'));
    const scope=fwdScopeFor('Document',name);
    return add({
      key:text(first(item.key,item.Key,fwdStableKey('document',name))),
      type:'documentType',
      name,
      parentKeys:list(first(item.parentBatchKeys,item.ParentBatchKeys,[])),
      childKeys:list(first(item.pageKeys,item.PageKeys,[])),
      scopeId:scope?.scopeId||'',
      source:'Fwd.GetPagesInDoc',
      raw:item
    });
  });
  const pageVariantBuckets=new Map(fwdPacketItems('pageVariants').map(item=>[
    lower(first(item.page,item.Page,'')),
    list(first(item.variants,item.Variants,[]))
  ]));
  const fieldsByPage=new Map();
  fwdPacketItems('fields').forEach(item=>{
    if(!/page/i.test(text(first(item.scopeType,item.ScopeType,''))))return;
    const page=text(first(item.scopeName,item.ScopeName,''));
    if(!fieldsByPage.has(lower(page)))fieldsByPage.set(lower(page),[]);
    fieldsByPage.get(lower(page)).push(item);
  });
  const pages=fwdPacketItems('pages').map(item=>{
    const name=text(first(item.name,item.Name,'Unnamed page'));
    const scope=fwdScopeFor('Page',name);
    const variants=pageVariantBuckets.get(lower(name))||[];
    const fields=fieldsByPage.get(lower(name))||[];
    const page=add({
      key:text(first(item.key,item.Key,fwdStableKey('page',name))),
      type:'pageType',
      name,
      parentKeys:list(first(item.parentDocumentKeys,item.ParentDocumentKeys,[])),
      childKeys:[],
      scopeId:scope?.scopeId||'',
      source:'Fwd.PageNames',
      metadata:{variantCount:variants.length,fieldCount:fields.length},
      raw:item
    });
    variants.forEach(variant=>{
      const variantName=text(first(variant?.name,variant?.Name,variant));
      const key=fwdStableKey('pageVariant',`${name}:${variantName}`);
      add({key,type:'pageVariant',name:variantName,parentKeys:[page.key],source:'Fwd.VariantNames',metadata:{pageName:name},raw:variant});
      page.childKeys.push(key);
    });
    fields.forEach(field=>{
      const fieldName=text(first(field.name,field.Name,'Unnamed field'));
      const key=fwdStableKey('field',`${name}:${fieldName}`);
      add({
        key,
        type:'field',
        name:fieldName,
        parentKeys:[page.key],
        source:'Fwd.Page.Fields',
        metadata:{
          pageName:name,
          fieldType:text(first(field.type,field.Type,'')),
          geometry:text(first(field.geometry,field.Geometry,'')),
          subfieldCount:Number(first(field.subfieldCount,field.SubfieldCount,0))||0
        },
        raw:field
      });
      page.childKeys.push(key);
    });
    if(page.scopeId){
      const acKey=fwdStableKey('acProcess',`page:${name}:AC`);
      add({key:acKey,type:'acProcess',name:'AC',parentKeys:[page.key],scopeId:page.scopeId,source:'AC/Pages',metadata:{ownerType:'Page',ownerName:name}});
      page.childKeys.push(acKey);
    }
    return page;
  });
  documents.forEach(document=>{
    if(document.scopeId){
      const acKey=fwdStableKey('acProcess',`document:${document.name}:AC`);
      add({key:acKey,type:'acProcess',name:'AC',parentKeys:[document.key],scopeId:document.scopeId,source:'AC/Documents',metadata:{ownerType:'Document',ownerName:document.name}});
      document.childKeys.unshift(acKey);
    }
  });
  batches.forEach(batch=>batch.childKeys.forEach(key=>{
    const child=byKey.get(key);
    if(child&&!child.parentKeys.includes(batch.key))child.parentKeys.push(batch.key);
  }));
  documents.forEach(document=>document.childKeys.forEach(key=>{
    const child=byKey.get(key);
    if(child&&!child.parentKeys.includes(document.key))child.parentKeys.push(document.key);
  }));
  add({
    key:'fwd:root',
    type:'fwdRoot',
    name:text(first(model?.fwd?.overview?.path,treeData?.FwdPath,rulesData?.FwdPath,'FWD Configuration')),
    childKeys:['group:batches','group:documents','group:pages','group:resources','diagnostics:root','source:root'],
    source:'FwdInspectionReport',
    raw:model?.fwd?.overview||{}
  });
  add({key:'diagnostics:root',type:'diagnosticCollection',name:'Diagnostics',source:'Reader diagnostics',metadata:{count:model.diags.length}});
  add({key:'source:root',type:'sourceRoot',name:'Source / Raw',source:'FWD snapshot',raw:model?.fwd||{}});
  return {byKey,batches,documents,pages};
}
function fwdEditorObject(key=state.selectedEditorObjectKey){
  const index=buildFwdEditorIndex();
  return index.byKey.get(key)||index.byKey.get('fwd:root');
}
function selectEditorObject(key){
  const record=fwdEditorObject(key);
  if(!buildFwdEditorIndex().byKey.has(key)&&/^(group|folder):/.test(text(key))){
    toggleFwdTreeKey(key);
    return;
  }
  if(!record)return;
  state.selectedEditorObjectKey=record.key;
  if(record.type==='acProcess'&&record.scopeId){
    state.scopeId=record.scopeId;
    state.workspaceView='structure';
    state.selectedType='scope';
    state.selectedId='';
    noteRecentScope(record.scopeId);
    seedExpanded(record.scopeId);
  }else{
    state.workspaceView='editor-object';
    state.selectedType='editor-object';
    state.selectedId=record.key;
  }
  saveState();
  renderAll();
}
function toggleFwdTreeKey(key,force){
  const open=state.fwdExpanded.has(key);
  const next=force===undefined?!open:!!force;
  if(next)state.fwdExpanded.add(key);else state.fwdExpanded.delete(key);
  saveState();
  renderGlobalNavigation();
}
function fwdTreeRow(record,options={}){
  const depth=Number(options.depth||0);
  const depthClass=`fwd-depth-${Math.max(0,Math.min(8,depth))}`;
  const childrenHtml=text(options.childrenHtml||'');
  const expandable=!!childrenHtml;
  const open=expandable&&state.fwdExpanded.has(record.key);
  const active=record.key===state.selectedEditorObjectKey||(record.type==='acProcess'&&record.scopeId===state.scopeId&&state.workspaceView==='structure');
  const count=options.count;
  const marker=expandable?`<button class="fwd-tree-toggle" type="button" data-fwd-toggle="${esc(record.key)}" aria-label="${open?'Collapse':'Expand'} ${esc(record.name)}" aria-expanded="${open?'true':'false'}">${open?'&#9662;':'&#9656;'}</button>`:'<span class="fwd-tree-toggle placeholder" aria-hidden="true"></span>';
  return `<div class="fwd-tree-node" role="treeitem" aria-level="${depth+1}" ${expandable?`aria-expanded="${open?'true':'false'}"`:''}><div class="fwd-tree-row ${depthClass} ${active?'active':''}">${marker}<button class="fwd-tree-select" type="button" data-fwd-object="${esc(record.key)}" title="${esc(record.type)}: ${esc(record.name)}"><span class="fwd-tree-icon ${esc(record.type)}" aria-hidden="true"></span><span class="fwd-tree-label">${esc(record.name)}</span>${count===undefined?'':`<span class="fwd-tree-count">${fmt(count)}</span>`}</button></div>${open?`<div class="fwd-tree-children" role="group">${childrenHtml}</div>`:''}</div>`;
}
function fwdTreeGroup(key,label,records,renderRecord){
  const record={key,type:'folder',name:label};
  return fwdTreeRow(record,{depth:0,count:records.length,childrenHtml:records.map(renderRecord).join('')||'<div class="fwd-tree-empty">No configured items</div>'});
}
function fwdTreeReferenceRow(record,depth){
  return fwdTreeRow(record,{depth,count:undefined});
}
function renderGlobalNavigation(){
  const el=$('globalNav');
  if(!el)return;
  if(!model){el.innerHTML='';return;}
  const index=buildFwdEditorIndex();
  const counts=globalNavigationCounts();
  const filter=lower(state.scopeQuery).trim();
  const matchesFilter=record=>!filter||lower([record?.name,record?.type,record?.key].join(' ')).includes(filter);
  function resourceRow(action,label,count,title){
    const view=action.replace(/^view-/,'');
    const active=state.workspaceView===view;
    return `<button class="fwd-tree-resource-row ${active?'active':''}" type="button" data-action="${esc(action)}" aria-current="${active?'page':'false'}" title="${esc(title)}"><span class="fwd-tree-icon resource" aria-hidden="true"></span><span>${esc(label)}</span>${count===undefined?'':`<b>${fmt(count)}</b>`}</button>`;
  }
  const renderDocument=(document,depth=1,full=true)=>{
    const pages=list(document.childKeys).map(key=>index.byKey.get(key)).filter(item=>item?.type==='pageType');
    const processes=list(document.childKeys).map(key=>index.byKey.get(key)).filter(item=>item?.type==='acProcess');
    const children=full?[
      ...processes.map(process=>fwdTreeRow(process,{depth:depth+1})),
      ...(pages.length?[fwdTreeRow({key:`folder:document-pages:${document.key}`,type:'folder',name:'Pages in Document'},{depth:depth+1,count:pages.length,childrenHtml:pages.map(page=>fwdTreeReferenceRow(page,depth+2)).join('')})]:[])
    ].join(''):'';
    return fwdTreeRow(document,{depth,count:pages.length,childrenHtml:children});
  };
  const renderPage=(page,depth=1)=>{
    const children=list(page.childKeys).map(key=>index.byKey.get(key)).filter(Boolean);
    const variants=children.filter(item=>item.type==='pageVariant');
    const fields=children.filter(item=>item.type==='field');
    const processes=children.filter(item=>item.type==='acProcess');
    const fieldLimit=200;
    const childHtml=[
      ...processes.map(process=>fwdTreeRow(process,{depth:depth+1})),
      ...(variants.length?[fwdTreeRow({key:`folder:page-variants:${page.key}`,type:'folder',name:'Page Variants'},{depth:depth+1,count:variants.length,childrenHtml:variants.map(item=>fwdTreeReferenceRow(item,depth+2)).join('')})]:[]),
      ...(fields.length?[fwdTreeRow({key:`folder:page-fields:${page.key}`,type:'folder',name:'Fields'},{depth:depth+1,count:fields.length,childrenHtml:fields.slice(0,fieldLimit).map(item=>fwdTreeReferenceRow(item,depth+2)).join('')+(fields.length>fieldLimit?`<div class="fwd-tree-empty">Showing ${fmt(fieldLimit)} of ${fmt(fields.length)} fields</div>`:'')})]:[])
    ].join('');
    return fwdTreeRow(page,{depth,count:fields.length,childrenHtml:childHtml});
  };
  const visibleBatches=index.batches.filter(batch=>matchesFilter(batch)||list(batch.childKeys).some(key=>matchesFilter(index.byKey.get(key))));
  const visibleDocuments=index.documents.filter(document=>matchesFilter(document)||list(document.childKeys).some(key=>matchesFilter(index.byKey.get(key))));
  const visiblePages=index.pages.filter(page=>matchesFilter(page)||list(page.childKeys).some(key=>matchesFilter(index.byKey.get(key))));
  if(filter){
    ['fwd:root','group:batches','group:documents','group:pages'].forEach(key=>state.fwdExpanded.add(key));
  }
  const batches=fwdTreeGroup('group:batches','Batches',visibleBatches,batch=>{
    const documents=list(batch.childKeys).map(key=>index.byKey.get(key)).filter(Boolean);
    return fwdTreeRow(batch,{depth:1,count:documents.length,childrenHtml:documents.map(document=>renderDocument(document,2,false)).join('')});
  });
  const documents=fwdTreeGroup('group:documents','Documents',visibleDocuments,document=>renderDocument(document));
  const pages=fwdTreeGroup('group:pages','Pages',visiblePages,page=>renderPage(page));
  const resources=fwdTreeRow({key:'group:resources',type:'folder',name:'Resources'},{depth:0,count:counts.resources,childrenHtml:[
    resourceRow('view-functions','Functions',counts.functions,'AC function catalog'),
    resourceRow('view-udfs','User Defined Functions',counts.udfs,'User Defined Functions and internal Rule Lists'),
    resourceRow('view-tables','Tables',counts.tables,'Table resources'),
    resourceRow('view-selection-lists','Selection Lists',counts.selectionLists,'Selection List configuration'),
    resourceRow('view-resources','Other Resources',counts.resources,'FWD resource definitions'),
    resourceRow('view-drivers','Drivers',counts.drivers,'Driver definitions'),
    resourceRow('view-rule-lists','Rule Lists',counts.ruleLists,'Snapshot-wide Rule Lists')
  ].join('')});
  const diagnostics=fwdTreeRow(index.byKey.get('diagnostics:root'),{depth:0,count:model.diags.length});
  const source=fwdTreeRow(index.byKey.get('source:root'),{depth:0});
  const developer=isAdvancedMode()?`<div class="fwd-tree-developer">${resourceRow('view-load-status','Load Status',counts.messages||model.diags.length,'Load and parse status')}${resourceRow('view-object-graph','Object Graph',counts.objectGraph,'Canonical object graph')}${resourceRow('view-runtime-impact','Runtime Impact',counts.runtimeImpact,'Static impact records')}</div>`:'';
  const root=index.byKey.get('fwd:root');
  el.innerHTML=`<div class="fwd-editor-tree-shell fweditor-fwd-tree-window"><div class="fwd-tree-toolbar"><label for="fwdTreeFilter">FWD Tree</label><input id="fwdTreeFilter" type="search" value="${esc(state.scopeQuery)}" placeholder="Filter FWD objects"></div><div class="fwd-editor-tree" role="tree" aria-label="FWD configuration tree">${fwdTreeRow(root,{depth:0,count:index.batches.length+index.documents.length+index.pages.length,childrenHtml:`${batches}${documents}${pages}${resources}${diagnostics}${source}${developer}`})}</div></div>`;
}

function editorObjectButton(record,label=record?.name){
  if(!record)return '';
  return `<button class="editor-object-link" type="button" data-fwd-object="${esc(record.key)}"><span class="fwd-tree-icon ${esc(record.type)}" aria-hidden="true"></span><span>${esc(label)}</span></button>`;
}
function editorObjectList(title,records,emptyText){
  const rows=list(records);
  return `<section class="editor-object-section"><h4>${esc(title)} <span>${fmt(rows.length)}</span></h4>${rows.length?`<div class="editor-object-list">${rows.map(record=>editorObjectButton(record)).join('')}</div>`:`<div class="fweditor-empty compact">${esc(emptyText)}</div>`}</section>`;
}
function renderEditorObject(){
  const index=buildFwdEditorIndex();
  const record=index.byKey.get(state.selectedEditorObjectKey)||index.byKey.get('fwd:root');
  state.selectedEditorObjectKey=record.key;
  const parents=list(record.parentKeys).map(key=>index.byKey.get(key)).filter(Boolean);
  const children=list(record.childKeys).map(key=>index.byKey.get(key)).filter(Boolean);
  const processes=children.filter(item=>item.type==='acProcess');
  const variants=children.filter(item=>item.type==='pageVariant');
  const fields=children.filter(item=>item.type==='field');
  const ordinaryChildren=children.filter(item=>!['acProcess','pageVariant','field'].includes(item.type));
  let body='';
  if(record.type==='diagnosticCollection'){
    const rows=list(model.diags).slice(0,500);
    body=`<section class="editor-object-section"><h4>Diagnostics <span>${fmt(model.diags.length)}</span></h4><div class="editor-diagnostic-list">${rows.map(diag=>`<button type="button" data-diag="${esc(diag.id)}"><b>${esc(diag.severity||'Info')}</b><span>${esc(diag.title||diag.detail||'Diagnostic')}</span><small>${esc(diag.scopeId||'FWD')}</small></button>`).join('')||'<div class="fweditor-empty compact">No diagnostics were reported.</div>'}</div></section>`;
  }else if(record.type==='sourceRoot'){
    body=`<section class="editor-object-section"><h4>Source / Raw</h4><p>Bounded read-only snapshot data for the loaded FWD configuration.</p>${previewJsonHtml(record.raw,{open:true,maxDepth:4,maxArray:80,maxKeys:100,maxChars:24000})}</section>`;
  }else{
    body=`<div class="editor-object-grid">${editorObjectList('Parent Objects',parents,'This object has no configured parent in the current snapshot.')}${editorObjectList('Configured Children',ordinaryChildren,'No configured child objects were found.')}${processes.length?editorObjectList('Processing',processes,'No processing nodes were found.'):''}${variants.length?editorObjectList('Page Variants',variants,'No page variants were found.'):''}${fields.length?editorObjectList('Fields',fields.slice(0,500),'No fields were found.'):''}</div>`;
    if(record.type==='field'){
      body+=`<section class="editor-object-section"><h4>Field Configuration</h4><div class="kv">${kv('Page',esc(record.metadata.pageName||''))}${kv('Type',esc(record.metadata.fieldType||'Unknown'))}${kv('Geometry',esc(record.metadata.geometry||'Unavailable'))}${kv('Subfields',fmt(record.metadata.subfieldCount||0))}</div></section>`;
    }
    if(record.scopeId){
      body+=`<section class="editor-object-section"><h4>AC Processing</h4><button class="btn primary" type="button" data-scope="${esc(record.scopeId)}">Open AC Rule List</button><p class="caption">Opens the configured page- or document-level Rule List for this object.</p></section>`;
    }
    body+=`<section class="editor-object-section"><h4>Source / Raw</h4>${previewJsonHtml({key:record.key,type:record.type,name:record.name,path:[...parents.map(parent=>parent.name),record.name],source:record.source,metadata:record.metadata,raw:record.raw},{maxDepth:4,maxArray:60,maxKeys:80,maxChars:18000})}</section>`;
  }
  const path=[...parents.map(parent=>parent.name),record.name].filter(Boolean).join(' / ');
  $('content').innerHTML=`<section class="fweditor-object-view"><header class="editor-object-header"><div><span class="workspace-eyebrow">${esc(record.type)}</span><h3>${esc(record.name)}</h3><p class="mono">${esc(path||record.key)}</p></div><div class="tree-detail-badges"><span class="badge blue">Read-only</span><span class="badge">${esc(record.source||'FWD')}</span></div></header>${body}</section>`;
}

function modernRowMeta(row,kind){
  const metric=list(row.usage).length||row.metric||row.count||0;
  const stateText=kind==='selection-lists'?(row.selectionList?.schemaParsed?'Parsed schema':'Rule reference'):(row.defined===false?'Observed':'Loaded');
  return `${stateText}${metric?` &middot; ${fmt(metric)} refs`:''}`;
}

function pagedRows(rows,pageSize=300){
  const listRows=list(rows);
  const size=Math.max(50,Math.min(1000,Number(pageSize)||300));
  return { rows:listRows.slice(0,size), total:listRows.length, limit:size, truncated:listRows.length>size };
}

function modernCatalogDetail(kind,row){
  if(!row)return '<div class="product-empty-state"><h3>No item selected</h3><p>Select an item from the list.</p></div>';
  if(kind==='functions')return `${functionConfigurationHtml(row.fn,row)}<div class="table-columns-head">Used By</div>${usagePreviewHtml(row.usage)}${isAdvancedMode()?`<div class="table-columns-head">Raw</div>${previewJsonHtml(row.fn||row,{maxDepth:3,maxArray:60,maxKeys:80,maxChars:16000})}`:''}`;
  if(kind==='selection-lists')return selectionListPacketDetailHtml(row);
  if(kind==='tables'){
    const t=row.table||row;
    return `${tableConfigurationHtml(t,row)}<div class="table-columns-head">Fields / Columns</div>${tableColumnsHtml(t)}<div class="table-columns-head">Used By</div>${usagePreviewHtml(row.usage)}${isAdvancedMode()?`<div class="table-columns-head">Raw</div>${previewJsonHtml(t,{maxDepth:3,maxArray:50,maxKeys:80,maxChars:16000})}`:''}`;
  }
  if(kind==='udfs'){
    const callers=list(row.callerRules);
    return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>UDF Interface</h4><p>${esc(udfAvailabilityMessage(row))}</p></div><span class="badge ${udfHasInternalRules(row)?'green':'amber'}">${udfHasInternalRules(row)?'Rule List available':'Rule List unavailable'}</span></div><div class="kv">${kv('Name',esc(udfShortName(row)))}${kv('Source',esc(row.source||'FWD'))}${kv('Callers',fmt(callers.length))}${kv('Parameters',fmt(list(row.parameterNames).length))}${kv('Status Results',fmt(list(row.statusResults).length))}</div></section>${udfEditorParameterTableHtml(row,callers)}${udfEditorStatusResultsHtml(row)}${udfEditorInternalRuleTreeHtml(row)}${udfEditorCallerRulesHtml(callers,row)}${isAdvancedMode()?udfEditorLoadStatusHtml(row):''}`;
  }
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>${esc(row.name||row.key)}</h4><p>${esc(row.source||'FWD resource')}</p></div><span class="badge blue">${esc(row.type||kind)}</span></div><div class="kv">${kv('Name',esc(row.name||row.key))}${kv('Type',esc(row.type||kind))}${kv('Source',esc(row.source||''))}${kv('References',fmt(list(row.usage).length||row.metric||0))}</div></section><div class="table-columns-head">Used By</div>${usagePreviewHtml(row.usage)}${isAdvancedMode()?`<div class="table-columns-head">Raw</div>${previewJsonHtml(row,{maxDepth:3,maxArray:60,maxKeys:80,maxChars:16000})}`:''}`;
}
function renderModernCatalog(kind,rows,selectedKey,stateKey,copy){
  const q=lower(state.query).trim();
  const filtered=q?rows.filter(row=>definitionSearchText(row).includes(q)):rows;
  if(!filtered.length){$('content').innerHTML=`<section class="product-workspace"><div class="product-empty-state"><h3>${esc(copy.emptyTitle||'No items found')}</h3><p>${esc(copy.emptyBody||'Clear search or choose another area.')}</p></div></section>`;return;}
  const selected=filtered.find(r=>r.key===selectedKey)||filtered[0];
  state[stateKey]=selected.key;
  const page=pagedRows(filtered,300);
  const rowsHtml=page.rows.map(row=>`<button class="product-index-row ${row.key===selected.key?'active':''}" type="button" data-global-kind="${esc(kind)}" data-global-key="${esc(row.key)}"><span><b>${esc(row.name||row.key)}</b><small>${esc(row.type||'Item')} &middot; ${modernRowMeta(row,kind)}</small></span><em>${esc(row.source||'FWD')}</em></button>`).join('');
  $('content').innerHTML=`<section class="product-workspace product-catalog product-catalog-${esc(kind)}"><div class="product-catalog-head"><div><h3>${esc(copy.title)}</h3><p>${esc(copy.body)}</p></div><span class="badge blue">${fmt(filtered.length)} shown</span></div><div class="product-catalog-grid"><aside class="product-index" aria-label="${esc(copy.title)} list">${rowsHtml}${page.truncated?`<div class="caption mt-8">Showing first ${fmt(page.limit)} of ${fmt(page.total)}. Narrow search for more.</div>`:''}</aside><article class="product-detail" aria-label="${esc(copy.title)} detail"><div class="product-detail-head"><div><div class="eyebrow">${esc(copy.title)}</div><h3>${esc(selected.name||selected.key)}</h3><p>${esc(selected.type||selected.source||'Read-only configuration')}</p></div><button class="btn" type="button" data-action="open-global-detail" data-global-kind="${esc(kind)}">Open FW Editor details</button></div>${modernCatalogDetail(kind,selected)}</article></div></section>`;
}
function renderGlobalResourceDefinitions(){
  const rows=buildGlobalResourceDefinitions();
  if(isEditorMode())return renderGlobalDefinitionExplorer('resources',rows,state.selectedResourceKey,'selectedResourceKey',{title:'Resources',body:'Shared FWD resource definitions. Rule usage is shown as references.',emptyTitle:'No resources found',emptyBody:'No FWD resources were loaded.'},row=>`<div class="table-columns-head">Used By</div>${usagePreviewHtml(row.usage)}`);
  return renderModernCatalog('resources',rows,state.selectedResourceKey,'selectedResourceKey',{title:'Resources',body:'Shared FWD resource definitions. Rule usage is shown as references.',emptyTitle:'No resources found',emptyBody:'No FWD resources were loaded.'});
}
function renderGlobalDriverDefinitions(){
  const rows=buildGlobalDriverDefinitions();
  if(isEditorMode())return renderGlobalDefinitionExplorer('drivers',rows,state.selectedDriverKey,'selectedDriverKey',{title:'Drivers',body:'Input, output, and process-private driver definitions.',emptyTitle:'No drivers found',emptyBody:'No driver definitions were loaded.'},row=>`<div class="table-columns-head">Used By</div>${usagePreviewHtml(row.usage)}`);
  return renderModernCatalog('drivers',rows,state.selectedDriverKey,'selectedDriverKey',{title:'Drivers',body:'Input, output, and process-private driver definitions.',emptyTitle:'No drivers found',emptyBody:'No driver definitions were loaded.'});
}
function renderGlobalFunctionDefinitions(){
  const rows=buildGlobalFunctionDefinitions();
  if(isEditorMode())return renderGlobalDefinitionExplorer('functions',rows,state.selectedFunctionName,'selectedFunctionName',{title:'Functions',body:'AC functions with parameter roles, status results, behavior flags, and configured rule usage.',emptyTitle:'No functions found',emptyBody:'No function catalog or rule usage was loaded.'},row=>`${functionConfigurationHtml(row.fn,row)}<div class="table-columns-head">Used By</div>${usagePreviewHtml(row.usage)}`);
  return renderModernCatalog('functions',rows,state.selectedFunctionName,'selectedFunctionName',{title:'Functions',body:'AC functions with parameter roles, status results, behavior flags, and configured rule usage.',emptyTitle:'No functions found',emptyBody:'No function catalog or rule usage was loaded.'});
}
function renderSelectionListPacketDefinitions(){
  const rows=buildSelectionListPacketDefinitions();
  if(isEditorMode())return renderGlobalDefinitionExplorer('selection-lists',rows,state.selectedSelectionListName,'selectedSelectionListName',{title:'SelectionLists',body:'SelectionList configuration and rule usage references.',emptyTitle:'No SelectionLists found',emptyBody:'No SelectionList configuration was loaded.'},selectionListPacketDetailHtml);
  return renderModernCatalog('selection-lists',rows,state.selectedSelectionListName,'selectedSelectionListName',{title:'SelectionLists',body:'SelectionList configuration and rule usage references.',emptyTitle:'No SelectionLists found',emptyBody:'No SelectionList configuration was loaded.'});
}
function renderGlobalTablesMasterDetail(){
  const rows=buildGlobalTableDefinitions().map(t=>({key:t.name,name:t.name,type:t.hasParsedSchema?'Parsed table':'Table',source:t.inferred?'Observed table references':'FWD payload',defined:t.defined,metric:t.hits,usage:list(t.usage),table:t}));
  if(isEditorMode())return renderGlobalDefinitionExplorer('tables',rows,state.selectedTableName,'selectedTableName',{title:'Tables',body:'Table resources and rule usage references. SelectionList behavior is shown separately.',emptyTitle:'No tables found',emptyBody:'No table definitions or references were loaded.'},row=>`${tableConfigurationHtml(row.table||row,row)}<div class="table-columns-head">Fields / Columns</div>${tableColumnsHtml(row.table||row)}<div class="table-columns-head">Used By</div>${usagePreviewHtml(row.usage)}`);
  return renderModernCatalog('tables',rows,state.selectedTableName,'selectedTableName',{title:'Tables',body:'Table resources and rule usage references. SelectionList behavior is shown separately.',emptyTitle:'No tables found',emptyBody:'No table definitions or references were loaded.'});
}
function renderUdfMasterDetail(){
  const allRows=buildUdfDefinitions();
  const filter=state.udfFilter||'all';
  let rows=allRows;
  if(filter==='with-callers')rows=rows.filter(u=>list(u.callerRules).length>0);
  if(filter==='defined')rows=rows.filter(u=>u.definitionParsed||u.defined);
  if(filter==='unparsed')rows=rows.filter(u=>!u.definitionParsed||!udfHasInternalRules(u));
  const q=lower(state.query).trim();
  if(q)rows=rows.filter(u=>lower(u.searchBlob||definitionSearchText({name:u.displayName,key:u.key,type:u.type,source:u.source,udf:u,usage:u.callerRules})).includes(q));
  if(isEditorMode())return renderGlobalDefinitionExplorer('udfs',rows,state.selectedUdfName,'selectedUdfName',{title:'User Defined Functions',body:'User Defined Functions with field-list parameters, status results, caller bindings, and internal Rule Lists.',emptyTitle:'No UDFs found',emptyBody:'No UDF definitions matched the current filter.'},row=>{const callers=list(row.callerRules);return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>UDF Interface</h4><p>${esc(udfAvailabilityMessage(row))}</p></div><span class="badge ${udfHasInternalRules(row)?'green':'amber'}">${udfHasInternalRules(row)?'Rule List available':'Rule List unavailable'}</span></div><div class="kv">${kv('Name',esc(udfShortName(row)))}${kv('Callers',fmt(callers.length))}${kv('Parameters',fmt(list(row.parameterNames).length))}${kv('Status Results',fmt(list(row.statusResults).length))}</div></section>${udfEditorParameterTableHtml(row,callers)}${udfEditorStatusResultsHtml(row)}${udfEditorInternalRuleTreeHtml(row)}${udfEditorCallerRulesHtml(callers,row)}`;});
  return renderModernCatalog('udfs',rows,state.selectedUdfName,'selectedUdfName',{title:'UDFs',body:'User Defined Functions, caller bindings, field-list parameters, status results, and internal Rule List availability.',emptyTitle:'No UDFs found',emptyBody:'No UDF definitions matched the current filter.'});
}
function renderRuleListPacketDefinitions(){
  const rows=buildRuleListPacketDefinitions();
  if(isEditorMode())return renderGlobalDefinitionExplorer('rule-lists',rows,state.selectedRuleListKey,'selectedRuleListKey',{title:'Rule Lists',body:'Rule List inventory with Status Results and Action List references.',emptyTitle:'No Rule Lists found',emptyBody:'No Rule List packet rows were loaded.'},ruleListPacketDetailHtml);
  return renderModernCatalog('rule-lists',rows,state.selectedRuleListKey,'selectedRuleListKey',{title:'Rule Lists',body:'Rule List inventory with Status Results and Action List references.',emptyTitle:'No Rule Lists found',emptyBody:'No Rule List packet rows were loaded.'});
}
function renderMessages(){
  const stats=messageWindowStats();
  const rows=filteredDiags().slice(0,500);
  const rowsHtml=rows.map(d=>`<button class="product-index-row" type="button" data-diag="${esc(d.id)}"><span><b>${esc(d.title||d.severity||'Status message')}</b><small>${esc(d.scopeId||'Snapshot')} &middot; ${esc(d.detail||d.Message||'')}</small></span><em>${esc(d.severity||'Info')}</em></button>`).join('');
  $('content').innerHTML=`<section class="product-workspace product-catalog"><div class="product-catalog-head"><div><h3>Load Status</h3><p>Configuration load status and warnings. This area is hidden unless advanced mode is enabled.</p></div><div class="product-status-inline"><span>Items <b>${fmt(stats.diags.length)}</b></span><span>Warnings <b>${fmt(stats.warningCount)}</b></span><span>Linked <b>${fmt(stats.linkedCount)}</b></span></div></div><div class="product-catalog-grid single"><aside class="product-index">${rowsHtml||'<div class="product-empty-state compact"><h3>No diagnostics</h3><p>No diagnostics match the current filter.</p></div>'}</aside></div></section>`;
}
function normalizeWorkspaceViewForScope(){
  state.workspaceView=normalizeWorkspaceViewName(state.workspaceView);
  if(!validWorkspaceViews().includes(state.workspaceView))state.workspaceView='structure';
  const scope=currentScope();
  if(scope&&state.selectedProcessName&&!processNamesForScope(scope).some(name=>lower(name)===lower(state.selectedProcessName)))state.selectedProcessName='';
}


/* v80 FW Editor parity: selected rule property sheet, keyboard tabs, locked default editor shell, load-status routing, and normal-mode terminology cleanup. */
function fweditorRuleDetailTabsHtml(active='summary'){
  const tabs=[
    ['summary','Summary'],
    ['function','Function'],
    ['fields','Fields / Parameters'],
    ['attributes','Attributes'],
    ['status-results','Status Results / Actions'],
    ['children','Children / Sub-lists'],
    ['references','References'],
    ['raw','Source / Raw'],
    ['diagnostics','Diagnostics']
  ];
  return `<div class="fweditor-property-tabs" role="tablist" aria-label="Rule property pages">${tabs.map(([id,label])=>`<button class="${id===active?'active':''}" type="button" data-rule-property-tab="${esc(id)}" role="tab" aria-selected="${id===active?'true':'false'}">${esc(label)}</button>`).join('')}</div>`;
}
function normalizedRulePropertyPage(){
  const page=text(state.rulePropertyPage||state.inspectorView||'summary');
  if(page==='general')return 'summary';
  if(page==='config')return 'fields';
  if(page==='actions')return 'status-results';
  return ['summary','function','fields','attributes','status-results','children','references','raw','diagnostics'].includes(page)?page:'summary';
}
function setRulePropertyPage(page){
  const next=['summary','function','fields','attributes','status-results','children','references','raw','diagnostics'].includes(page)?page:'summary';
  state.rulePropertyPage=next;
  renderContent();
  saveState();
}
function ruleGeneralPropertyHtml(n){
  const incoming=model.incomingByChild.get(n.id);
  const parentId=model.parentByChild.get(n.id);
  const parent=parentId?model.nodesById.get(String(parentId)):null;
  const displayPath=first(n.DisplayPath,n.displayPath,n.StructuralPath,n.structuralPath,n.RuleListPath,n.ruleListPath,'Root rule list');
  const disabled=n.disabled==='none'?'Enabled':n.disabled==='direct'?'Disabled':n.disabled==='inherited'?'Disabled by parent':n.disabled==='possible'?'Possibly disabled':'Enabled';
  const functionName=text(n.fn||n.FunctionName||'');
  const udf=udfForFunctionName(functionName);
  return `<div class="fweditor-rule-general"><div class="kv">${kv('Rule Name',esc(n.title||n.RuleName||'Unnamed rule'))}${kv('Function',functionName?linkedDefinitionHtml(functionName,udf?'UDF function':'Function','mono')||`<span class="mono">${esc(functionName)}</span>`:'')}${kv('Function Type',esc(udf?'User Defined':classifyFunction(functionName)))}${kv('Scope',esc(n.scopeId||''))}${kv('Parent Rule',parent?`<button class="btn ghost" type="button" data-node="${esc(parent.id)}">${esc(parent.title)}</button>`:'Root rule list')}${kv('Action List / Sub-list',incoming?`<span class="action-list-chip ${incoming.resolved?'resolved':'unresolved'}">${esc(incoming.label)}</span>`:'Root rule list')}${kv('Rule List Path',`<span class="mono path-line">${esc(displayPath)}</span>`)}${kv('State',esc(disabled))}</div></div>`;
}
function ruleDescriptionPropertyHtml(n){
  const functionName=text(n.fn||n.FunctionName||'');
  const fnMeta=(()=>{try{return buildGlobalFunctionDefinitions().find(row=>sameName(row.name,functionName)||sameName(row.key,functionName));}catch{return null;}})();
  const fn=fnMeta?.fn||{};
  const desc=text(first(fn.description,fn.Description,n.Description,n.description,''));
  const configured=`This read-only property page shows the rule as configured in the FWD: function, field-list parameters, attributes, and Status Result to Action List mapping.`;
  return `<div class="fweditor-description-page"><div class="notice compact"><div class="notice-icon">i</div><div><b>${esc(functionName||'Rule')}</b><br>${esc(desc||configured)}</div></div>${functionMetadataBlock(n)}<div class="table-columns-head mt-12">Rule List Path</div>${pathHtml(n)}</div>`;
}
function ruleFunctionPropertyHtml(n){
  const functionName=text(n.fn||n.FunctionName||'');
  const fnRow=buildGlobalFunctionDefinitions().find(row=>sameName(row.name,functionName)||sameName(row.key,functionName));
  const udf=udfForFunctionName(functionName);
  return `<div class="fweditor-function-page">${functionMetadataBlock(n)}${fnRow?functionConfigurationHtml(fnRow.fn||fnRow,fnRow):''}${udf?`<div class="table-columns-head mt-12">User Defined Function</div>${linkedDefinitionHtml(udf.displayName||udf.rawName||functionName,'UDF','')}`:''}</div>`;
}
function ruleChildrenPropertyHtml(n){
  const groups=childActionListGroups(n.id);
  if(!groups.length)return '<div class="fweditor-empty compact">This rule has no configured child Action Lists or sub-lists.</div>';
  return `<div class="mini-list">${groups.map(group=>{
    const key=actionListKey(n.id,group);
    const children=list(group.childIds).map(id=>model.nodesById.get(String(id))).filter(Boolean);
    return `<button class="mini-row" type="button" data-action-list="${esc(key)}"><span><b>${esc(group.label)}</b><small>${esc(group.routeState||'Action List')} - ${fmt(children.length)} child rules</small></span><span class="badge ${group.resolved?'green':'amber'}">${group.resolved?'Resolved':'Review'}</span></button>`;
  }).join('')}</div>`;
}
function ruleReferencesPropertyHtml(n){
  const refs=list(model.relsByNode?.get(String(n.id))).length
    ? list(model.relsByNode?.get(String(n.id)))
    : model.rels.filter(reference=>String(reference.nodeId)===String(n.id));
  if(!refs.length)return '<div class="fweditor-empty compact">No inbound or outbound references are linked to this rule in the current snapshot.</div>';
  return `<div class="mini-list">${refs.map(reference=>`<div class="mini-row"><span><b>${esc(reference.kind||'Reference')}</b><small>${esc(reference.targetType||'Object')}</small></span><span>${relationshipTargetHtml(reference)}</span></div>`).join('')}</div>`;
}
function ruleDiagnosticsPropertyHtml(n){
  const diagnostics=list(model.diagsByNode?.get(String(n.id)));
  if(!diagnostics.length)return '<div class="fweditor-empty compact">No diagnostics are linked to this rule.</div>';
  return `<div class="editor-diagnostic-list">${diagnostics.map(diagnostic=>`<button type="button" data-diag="${esc(diagnostic.id)}"><b>${esc(diagnostic.severity||'Info')}</b><span>${esc(diagnostic.title||diagnostic.detail||'Diagnostic')}</span><small>${esc(diagnostic.scopeId||n.scopeId||'Rule')}</small></button>`).join('')}</div>`;
}
function fweditorActionListPropertiesHtml(actionList){
  if(!actionList)return '<div class="fweditor-empty">Select a rule or Action List.</div>';
  const rows=actionList.childNodes.length?actionList.childNodes.map(n=>`<button class="mini-row" type="button" data-node="${esc(n.id)}"><span><b>${esc(n.title)}</b><small>${esc(n.fn||'No function')}</small></span><span class="badge blue">Rule</span></button>`).join(''):'<div class="muted">No rules are assigned to this Action List.</div>';
  return `<div class="fweditor-rule-properties action-list-properties"><div class="fweditor-property-title"><div><span class="workspace-eyebrow">Action List / Sub-list</span><h4>${esc(actionList.label)}</h4><p>Parent Rule: ${esc(actionList.parent.title)}</p></div><span class="badge blue">${fmt(actionList.childCount)} child rules</span></div><div class="kv">${kv('Parent Rule',`<button class="btn ghost" type="button" data-node="${esc(actionList.parent.id)}">${esc(actionList.parent.title)}</button>`)}${kv('Status Result / Action',esc(actionList.label))}${kv('Action Index',esc(actionList.actionListIndex??''))}${kv('State',esc(actionList.resolved?'Named Action List':'Indexed Action List'))}</div><div class="table-columns-head mt-12">Rules in this Action List</div><div class="mini-list">${rows}</div></div>`;
}
function fweditorRulePropertiesHtml(){
  const actionList=selectedActionList();
  if(actionList)return fweditorActionListPropertiesHtml(actionList);
  const n=selectedNode();
  if(!n)return '<div class="fweditor-empty">Select a rule from the Rule List to view its read-only FW Editor properties.</div>';
  const active=normalizedRulePropertyPage();
  const paramCount=Object.keys(n.Parameters||{}).length;
  const attrCount=attributeEntriesForRule(n).length;
  const actionRows=actionListRowsForRule(n);
  let body='';
  if(active==='fields')body=`${paramBlockForRule(n)}<div class="table-columns-head mt-12">Field Catalog Match</div>${renderFieldResolutionBlock(resolveNodeFieldReferences(n))}`;
  else if(active==='attributes')body=attributesBlockForRule(n);
  else if(active==='status-results')body=`${statusActionsBlockForRule(n)}<div class="table-columns-head mt-12">Parent Rule / Sub-list Path</div>${parentRuleActionListBlock(n)}`;
  else if(active==='function')body=ruleFunctionPropertyHtml(n);
  else if(active==='children')body=ruleChildrenPropertyHtml(n);
  else if(active==='references')body=ruleReferencesPropertyHtml(n);
  else if(active==='raw')body=previewJsonHtml(selectedRuleConfigPacket(n),{open:true,maxDepth:5,maxArray:100,maxKeys:120,maxChars:28000});
  else if(active==='diagnostics')body=ruleDiagnosticsPropertyHtml(n);
  else body=ruleGeneralPropertyHtml(n);
  return `<div class="fweditor-rule-properties"><div class="fweditor-property-title"><div><span class="workspace-eyebrow">Selected Rule</span><h4>${esc(n.title||'Unnamed rule')}</h4><p>${esc(n.fn||'No function')}</p></div><div class="tree-detail-badges"><span class="badge blue">${fmt(paramCount)} fields</span><span class="badge blue">${fmt(attrCount)} attrs</span><span class="badge amber">${fmt(actionRows.length)} statuses</span></div></div>${fweditorRuleDetailTabsHtml(active)}<div class="fweditor-property-body" role="tabpanel">${body}</div></div>`;
}
function renderStructure(){
  const s=currentScope();
  if(!s){return renderOverview();}
  const rows=visibleStructureRows();
  const summary=structureWorkspaceSummary(rows);
  if(isEditorMode()){
    const treeHtml=rows.length
      ? `<div class="tree workspace-tree" role="tree" aria-label="Rule List tree">${rows.map(r=>r.type==='action-list'?actionListRow(r):treeRow(r.n,r.level)).join('')}</div>`
      : noAcRuleListWorkspaceHtml(s);
    const processBox=isAdvancedMode()?`<fieldset class="fweditor-fieldset"><legend>Processes</legend>${processPanelHtml(s)}</fieldset>`:'';
    const ruleListToolbar=`<div class="fweditor-rulelist-toolbar" aria-label="Rule List commands"><span class="fweditor-toolbar-label">Rule List</span><button type="button" class="fweditor-command-button" data-action="expand-all">Expand All</button><button type="button" class="fweditor-command-button" data-action="clear-tree-search" ${text(state.query).trim()?'':'disabled'}>Clear Find</button><span class="fweditor-toolbar-spacer"></span><span class="fweditor-toolbar-note">Read-only configuration view</span></div>`;
    const body=`<div class="fweditor-rulelist-layout"><fieldset class="fweditor-fieldset fweditor-rulelist-fieldset"><legend>Rule List</legend>${ruleListToolbar}<div class="fweditor-scope-summary"><span>Visible Rules <b>${fmt(summary.visibleRules)}</b></span><span>Action Lists <b>${fmt(summary.actionLists)}</b></span><span>Scope Rules <b>${fmt(summary.scopedTotal)}</b></span></div>${treeHtml}</fieldset><fieldset class="fweditor-fieldset fweditor-rule-properties-fieldset"><legend>Rule Properties</legend>${fweditorRulePropertiesHtml()}</fieldset></div>${processBox}`;
    $('content').innerHTML=fweditorScopeRootHtml('structure',`AC Rule List - ${s.name||s.scopeId}`,body,{chips:['Read-only',`${fmt(summary.visibleRules)} visible rules`,`${fmt(summary.actionLists)} action lists`]});
    return;
  }
  const additional=model.nodes.filter(n=>n.scopeId===s.scopeId&&n.isAdditionalRule).length;
  const treeHtml=rows.length?`<div class="tree workspace-tree product-rule-tree" role="tree" aria-label="Rule List tree">${rows.map(r=>r.type==='action-list'?actionListRow(r):treeRow(r.n,r.level)).join('')}</div>`:noAcRuleListWorkspaceHtml(s);
  $('content').innerHTML=`<section class="product-workspace product-rules"><div class="product-catalog-head"><div><h3>${esc(s.name||s.scopeId)}</h3><p>Read-only Rule List for this scope. Select a rule to open details.</p></div><div class="product-status-inline"><span>Placed <b>${fmt(Math.max(0,Number(s.structural||0)-additional))}</b></span><span>Additional Rules <b>${fmt(additional)}</b></span></div></div><div class="product-rule-toggles"><button class="chip-btn ${state.inventoryFilter==='all'?'active':''}" type="button" data-action="view-structure">All</button><span class="caption">Additional Rules are readable/searchable rules without confirmed Rule List placement.</span></div>${treeHtml}</section>`;
}

function scopeRuleContentScore(scope){
  if(!scope)return 0;
  return Number(scope.structural||0)+Number(scope.inventory||0)+Number(scope.rules||0);
}

function scopeHasRuleContent(scope){
  return scopeRuleContentScore(scope)>0;
}

function selectBestAvailableScope(){
  if(!model||!list(model.scopes).length)return '';
  const current=model.scopes.find(s=>s.scopeId===state.scopeId);
  if(current&&scopeHasRuleContent(current))return current.scopeId;
  const richest=list(model.scopes)
    .slice()
    .sort((a,b)=>scopeRuleContentScore(b)-scopeRuleContentScore(a)||text(a.name||a.scopeId).localeCompare(text(b.name||b.scopeId),undefined,{sensitivity:'base'}))[0];
  return text(richest?.scopeId||model.scopes[0]?.scopeId||'');
}

function workspaceContentScore(view){
  if(!model)return 0;
  const normalized=normalizeWorkspaceViewName(view);
  if(normalized==='editor-object'){
    return buildFwdEditorIndex().byKey.has(state.selectedEditorObjectKey)?1:0;
  }
  if(normalized==='structure')return list(model.nodes).length+list(model.inventory).length+list(model.scopes).reduce((sum,scope)=>sum+scopeRuleContentScore(scope),0);
  if(normalized==='field-resolution'){
    // Field Resolution is a scope-local workspace. It must be considered valid
    // even when the current filter produces zero rows, otherwise
    // ensureUsefulWorkspaceSelection() immediately falls back to structure.
    const scopedRules = typeof scopedRuleNodes === 'function' ? scopedRuleNodes().length : 0;
    const scopedNodeCount = typeof scopedNodes === 'function' ? scopedNodes().length : 0;
    return Math.max(scopedRules, scopedNodeCount, 1);
  }
  if(normalized==='rule-lists')return buildRuleListPacketDefinitions().length;
  if(normalized==='udfs')return buildUdfDefinitions().length;
  if(normalized==='functions')return buildGlobalFunctionDefinitions().length;
  if(normalized==='tables')return buildGlobalTableDefinitions().length;
  if(normalized==='selection-lists')return buildSelectionListPacketDefinitions().length;
  if(normalized==='resources')return buildGlobalResourceDefinitions().length;
  if(normalized==='drivers')return buildGlobalDriverDefinitions().length;
  if(isAdvancedMode()&&normalized==='object-graph')return buildObjectGraphDefinitions().length;
  if(isAdvancedMode()&&normalized==='runtime-impact')return buildRuntimeImpactDefinitions().length;
  return 0;
}

function workspaceHasContent(view){
  return workspaceContentScore(view)>0;
}

function preferredInitialWorkspace(){
  const explicit=requestedWorkspaceView();
  if(explicit)return explicit;
  const current=normalizeWorkspaceViewName(state.workspaceView||'structure');
  if(current!=='structure'&&validWorkspaceViews().includes(current)&&workspaceHasContent(current))return current;
  const priority=['structure','drivers','udfs','functions','tables','selection-lists','resources','rule-lists',...(isAdvancedMode()?['object-graph','runtime-impact']:[])];
  const valid=validWorkspaceViews();
  return priority
    .filter(view=>valid.includes(view))
    .sort((a,b)=>workspaceContentScore(b)-workspaceContentScore(a))
    .find(workspaceHasContent)||'structure';
}

function ensureUsefulWorkspaceSelection(reason='boot'){
  if(!model)return;
  const explicit=requestedWorkspaceView();
  if(!explicit){
    state.scopeId=selectBestAvailableScope();
  }else if(!state.scopeId){
    state.scopeId=selectBestAvailableScope();
  }
  const current=normalizeWorkspaceViewName(state.workspaceView||'structure');
  if(explicit){
    state.workspaceView=explicit;
    return;
  }

  const selectedScope=current==='structure'?currentScope():null;
  const currentIsEmpty=!validWorkspaceViews().includes(current)
    || !workspaceHasContent(current)
    || (current==='structure' && selectedScope && !scopeHasRuleContent(selectedScope) && workspaceContentScore('structure')<=0);

  if(currentIsEmpty){
    state.workspaceView=preferredInitialWorkspace();
  }
}

function applyInitialWorkspaceSelection(){
  ensureUsefulWorkspaceSelection('boot');
}

function viewerWorkspaceFallbackHtml(reason=''){
  const c=productCounts();
  const nav=globalNavigationCounts();
  const hydrated=fwdHydrationSummary();
  const cards=[
    {action:'nav-documents',label:'Documents / Pages',count:c.scopes,detail:'Open document, page, batch, and process scopes.'},
    {action:'view-drivers',label:'Drivers',count:nav.drivers,detail:'Inspect input, output, and process-private drivers.'},
    {action:'view-udfs',label:'UDFs',count:nav.udfs,detail:'Review user-defined functions and caller bindings.'},
    {action:'view-functions',label:'Functions',count:nav.functions,detail:'Review function catalog entries and usage.'},
    {action:'view-tables',label:'Tables',count:nav.tables,detail:'Open table and lookup resources.'},
    {action:'view-selection-lists',label:'SelectionLists',count:nav.selectionLists,detail:'Inspect SelectionList configuration.'},
    {action:'view-resources',label:'Resources',count:nav.resources,detail:'Browse FWD-level shared resources.'},
    {action:'view-rule-lists',label:'Rule Lists',count:nav.ruleLists,detail:'Open status result and action list packets.'}
  ].filter(card=>Number(card.count||0)>0);
  const cardsHtml=cards.slice(0,6).map((card,index)=>`<button class="product-empty-choice ${index===0?'primary':''}" type="button" data-action="${esc(card.action)}"><span><b>${esc(card.label)}</b><small>${esc(card.detail)}</small></span><em>${fmt(card.count)}</em></button>`).join('');
  const metrics=[
    ['Documents/pages/processes',c.scopes],
    ['Rules',c.rules],
    ['Drivers',nav.drivers],
    ['Resources',nav.resources]
  ];
  return `<section class="product-workspace product-catalog product-fallback-workspace" aria-label="Viewer ready"><div class="product-empty-state product-empty-state-actionable"><div class="empty-status-row"><span class="badge green">${esc(hydrated.label||'FWD connected')}</span><span class="badge blue">Read-only</span></div><h3>FWD loaded. Choose an available workspace.</h3><p>The hosted API is ready, but the selected workspace has no renderable rows${reason?`: ${esc(reason)}`:''}. This FWD still exposes browsable configuration.</p><div class="product-empty-metrics">${metrics.map(([label,value])=>`<span><b>${fmt(value)}</b>${esc(label)}</span>`).join('')}</div><div class="product-empty-choices">${cardsHtml||'<button class="product-empty-choice primary" type="button" data-action="nav-documents"><span><b>Open FWD Tree</b><small>Browse the available scopes.</small></span><em>Open</em></button>'}</div></div></section>`;
}

function ensureRenderedContentFallback(reason='render'){
  const host=optionalElement('content');
  if(!host||!model)return;
  const hasHtml=host.innerHTML&&host.innerHTML.trim().length>0;
  const hasText=host.textContent&&host.textContent.trim().length>0;
  if(hasHtml||hasText)return;
  if(typeof recordViewerDiagnostic==='function')recordViewerDiagnostic('warn','empty-content-fallback',{reason,payloadCounts:typeof payloadCounts==='function'?payloadCounts():null,modelCounts:typeof modelCounts==='function'?modelCounts():null,workspaceView:state.workspaceView,scopeId:state.scopeId});
  host.innerHTML=viewerWorkspaceFallbackHtml(reason);
  const title=optionalElement('scopeTitle');
  if(title)title.textContent='FWD configuration ready';
  const caption=optionalElement('scopeCaption');
  if(caption)caption.innerHTML='<span class="scope-caption-note">The selected workspace had no rows, so the viewer is showing available configuration areas.</span>';
}

function noAcRuleListWorkspaceHtml(scope){
  const counts=globalNavigationCounts();
  const product=productCounts();
  const options=[
    {action:'view-drivers',label:'Open Drivers',count:counts.drivers,primary:true,detail:'Inspect process driver definitions and process-node configuration.'},
    {action:'nav-documents',label:'Open Documents',count:product.scopes,detail:'Browse document, page, batch, and process scopes exposed by the FWD.'},
    {action:'view-functions',label:'Open Functions',count:counts.functions,detail:'Review function catalog entries and observed configuration usage.'},
    {action:'view-udfs',label:'Open UDFs',count:counts.udfs,detail:'Review user-defined functions and caller bindings.'},
    {action:'view-tables',label:'Open Tables',count:counts.tables,detail:'Review table and lookup resources.'},
    {action:'view-resources',label:'Open Resources',count:counts.resources,detail:'Review resource definitions exported from the FWD.'}
  ].filter(item=>Number(item.count||0)>0);
  const usefulActions=options.slice(0,4).map((item,index)=>`<button class="btn ${item.primary||index===0?'primary':''}" type="button" data-action="${esc(item.action)}">${esc(item.label)} <span>${fmt(item.count)}</span></button>`).join('')||'<button class="btn primary" type="button" data-action="view-rule-lists">Open Rule Lists</button>';
  const loadedHint=fwdHydrationSummary().label||'Live FWD session loaded';
  const metrics=[
    ['Documents/pages/processes',product.scopes],
    ['Drivers',counts.drivers],
    ['Rules',product.rules],
    ['Resources',counts.resources]
  ];
  const nextStep=options[0]?.detail||'Use the FWD navigation areas to inspect the available configuration.';
  return `<div class="product-empty-state product-empty-state-actionable" role="region" aria-label="No AC rules found"><div class="empty-status-row"><span class="badge green">${esc(loadedHint)}</span><span class="badge blue">FWD connected</span></div><h3>No AC Rule List entries were found for this FWD scope</h3><p>The hosted API is connected and the FWD opened, but this configuration exposes <b>${fmt(product.rules)}</b> AC rules for the selected Rule List workspace. The viewer has other FWD-level configuration available.</p><div class="product-empty-metrics">${metrics.map(([label,value])=>`<span><b>${fmt(value)}</b>${esc(label)}</span>`).join('')}</div><div class="product-empty-actions">${usefulActions}</div><p class="caption">${esc(nextStep)} Selected scope: ${esc(scope?.name||scope?.scopeId||'none')}.</p></div>`;
}

async function init(){
  recordViewerDiagnostic('info','boot-start',{href:window.location.href,userAgent:navigator.userAgent});
  renderBootLoading();
  try {
    await loadViewerData();
    recordViewerDiagnostic('info','viewer-data-loaded-before-model',{payloadCounts:payloadCounts()});
    model=buildModel();
    recordViewerDiagnostic('info','model-built',{modelCounts:modelCounts(),payloadCounts:payloadCounts()});
    globalDefinitionLookupCache=null;
    globalTableDefinitionsCache=null;
    globalUdfDefinitionsCache=null;
    globalFunctionDefinitionsCache=null;
    setBootPhase('ready','FWD snapshot loaded');
  } catch (error) {
    setBootPhase('failed',error&&error.message?error.message:'Unable to load FWD snapshot files.');
    reportUiError('data load', error);
    renderNoData();
    return;
  }

  return withUiGuard('boot',()=>{if(!model.scopes.length){recordViewerDiagnostic('error','boot-no-scopes',{modelCounts:modelCounts(),payloadCounts:payloadCounts()});renderNoData();return;}restoreSnapshotState();applyInitialWorkspaceSelection();applyPaneLayout();ensurePaneResizers();ensureScrollablePaneFocus();wireDesktopScrollPanFallback();installDesktopPaneMovement();seedExpanded(state.scopeId);installPaneResizers();wire();wireEditorPaneResizers();wireGuidanceHints();wireOnboardingChecklist();wireTableSelection();wireUdfSelection();wireGlobalDefinitionSelection();wireEditorPropertyPages();renderAll();recordViewerDiagnostic('info','boot-complete',{modelCounts:modelCounts(),state:{workspaceView:state.workspaceView,scopeId:state.scopeId,selectedType:state.selectedType,selectedId:state.selectedId}});});
}

init();
})();
