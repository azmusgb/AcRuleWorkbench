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
