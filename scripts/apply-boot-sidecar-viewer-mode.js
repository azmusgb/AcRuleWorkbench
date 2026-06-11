const fs = require("fs");
const path = require("path");

const root = process.cwd();

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text.replace(/^\uFEFF/, ""), "utf8");
}

function patchFile(file, patcher) {
  const before = read(file);
  const after = patcher(before);
  if (after !== before) {
    write(file, after);
    console.log(`[OK] patched ${file}`);
  } else {
    console.log(`[OK] already current ${file}`);
  }
}

// 1) Ensure boot sidecar builder exists.
write(path.join(root, "scripts", "build-viewer-boot-sidecar.js"), `
const fs = require("fs");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\\uFEFF/, ""));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value), "utf8");
}

function mb(file) {
  return fs.existsSync(file) ? fs.statSync(file).size / 1024 / 1024 : 0;
}

const tree = readJson("ac-rule-viewer.tree.json");
const rules = fs.existsSync("ac-rule-viewer.rules.json") ? readJson("ac-rule-viewer.rules.json") : null;
const fwd = fs.existsSync("ac-rule-viewer.fwd.json") ? readJson("ac-rule-viewer.fwd.json") : null;

const slimNodes = (tree.Nodes || []).map(n => ({
  NodeId: n.NodeId,
  ParentNodeId: n.ParentNodeId,
  RuleGuid: n.RuleGuid,
  RuleId: n.RuleId,
  RuleName: n.RuleName,
  ScopePath: n.ScopePath,
  ScopeName: n.ScopeName,
  ScopeType: n.ScopeType,
  HierarchyLevel: n.HierarchyLevel,
  RuleIndexWithinScope: n.RuleIndexWithinScope,
  ActionListIndex: n.ActionListIndex,
  FunctionName: n.FunctionName,
  IsRuleNode: n.IsRuleNode,
  DisabledState: n.DisabledState,
  DisabledAncestorNodeId: n.DisabledAncestorNodeId,
  HasAttributes: Array.isArray(n.Attributes) && n.Attributes.length > 0,
  HasParameters: Array.isArray(n.Parameters) && n.Parameters.length > 0,
  HasRoute: !!n.Route,
  HasDisabledEvidence: !!n.DisabledEvidence,
  ActionNames: n.ActionNames || []
}));

const slimEdges = (tree.Edges || []).map(e => ({
  FromNodeId: e.FromNodeId,
  ToNodeId: e.ToNodeId,
  ActionName: e.ActionName,
  ActionNameResolved: e.ActionNameResolved,
  EdgeKind: e.EdgeKind,
  ActionListIndex: e.ActionListIndex,
  Confidence: e.Confidence
}));

const diagnosticCountsByNode = new Map();
for (const d of tree.Diagnostics || []) {
  if (!d.NodeId) continue;
  diagnosticCountsByNode.set(d.NodeId, (diagnosticCountsByNode.get(d.NodeId) || 0) + 1);
}

for (const n of slimNodes) {
  n.DiagnosticCount = diagnosticCountsByNode.get(n.NodeId) || 0;
}

const boot = {
  schema: "AcRuleViewer.Boot",
  schemaVersion: "0.1.0",
  generatedAtUtc: new Date().toISOString(),
  snapshot: {
    SnapshotId: tree.SnapshotId,
    GeneratedAtUtc: tree.GeneratedAtUtc,
    RequireNativeOk: tree.RequireNativeOk,
    ProcessName: tree.ProcessName
  },
  counts: {
    scopes: tree.ScopeCount,
    nodes: tree.NodeCount,
    ruleNodes: tree.RuleNodeCount,
    edges: tree.EdgeCount,
    diagnostics: tree.DiagnosticCount,
    rules: rules?.RuleCount ?? null,
    fwdResources: fwd?.overview?.resourceCount ?? fwd?.resources?.count ?? null,
    fwdUdfs: fwd?.udfs?.items?.length ?? null,
    fwdTables: fwd?.tables?.items?.length ?? null,
    fwdFunctions: fwd?.functions?.items?.length ?? null
  },
  scopes: tree.Scopes || [],
  nodes: slimNodes,
  edges: slimEdges,
  summaries: {
    rulesByFunction: rules?.RulesByFunction || [],
    rulesByActionName: rules?.RulesByActionName || [],
    rulesByDisabledState: rules?.RulesByDisabledState || []
  },
  lazyFiles: {
    tree: "ac-rule-viewer.tree.json",
    rules: "ac-rule-viewer.rules.json",
    relationships: "ac-rule-viewer.rel.json",
    fwd: "ac-rule-viewer.fwd.json"
  }
};

writeJson("ac-rule-viewer.boot.json", boot);

console.log("[OK] Wrote ac-rule-viewer.boot.json");
console.table([
  { file: "ac-rule-viewer-live.html", mb: mb("ac-rule-viewer-live.html").toFixed(2) },
  { file: "ac-rule-viewer.boot.json", mb: mb("ac-rule-viewer.boot.json").toFixed(2) },
  { file: "ac-rule-viewer.tree.json", mb: mb("ac-rule-viewer.tree.json").toFixed(2) }
]);
`);

// 2) Patch viewer runtime to boot from ac-rule-viewer.boot.json before full sidecars/API bootstrap.
const runtimePath = path.join(root, "src", "viewer", "js", "10-runtime-prologue.js");

patchFile(runtimePath, text => {
  if (!text.includes("tryLoadStaticBootSidecar")) {
    const insert = `

let staticFullSidecarHydrationPromise = null;

function staticViewerSidecarBaseCandidates(){
  return ['', './', '../', '../../', '../../../', '../../../../', '../../../../../', '/'];
}

async function fetchStaticViewerJsonWithFallback(file, options = {}){
  const timeoutMs = Number(options.timeoutMs || 12000);
  const optional = !!options.optional;

  for(const base of staticViewerSidecarBaseCandidates()){
    const url = \`\${base}\${file}\`;
    const started = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      window.clearTimeout(timeoutId);

      recordViewerFetch(file, url, response.status, Date.now() - started, { ok: response.ok, source: 'static-sidecar' });

      if(!response.ok) continue;

      const raw = await response.text();
      return JSON.parse(raw.replace(/^\\uFEFF/, ''));
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
  throw new Error(\`Failed to load \${file}: file was not reachable from known paths.\`);
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
  if(staticFullSidecarHydrationPromise) return staticFullSidecarHydrationPromise;

  const run = () => beginStaticFullSidecarHydration(reason);

  if(typeof window.requestIdleCallback === 'function'){
    window.requestIdleCallback(run, { timeout: 2000 });
  } else {
    window.setTimeout(run, 250);
  }

  return staticFullSidecarHydrationPromise;
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
`;

    const marker = "async function loadViewerData(){";
    if (!text.includes(marker)) {
      throw new Error("Could not find loadViewerData marker.");
    }

    text = text.replace(marker, insert + "\n" + marker);
  }

  if (!text.includes("const bootSidecarLoaded=await tryLoadStaticBootSidecar();")) {
    const marker = "  // Hosted API mode is the normal source-clean workflow.";
    if (!text.includes(marker)) {
      throw new Error("Could not find hosted bootstrap marker.");
    }

    const bootLoad = `  const bootSidecarLoaded=await tryLoadStaticBootSidecar();
  if(bootSidecarLoaded){
    scheduleStaticFullSidecarHydration('initial-boot-sidecar');
    recordViewerDiagnostic('info','load-viewer-data-complete',{source:'static-boot-sidecar',counts:payloadCounts()});
    return;
  }

`;

    text = text.replace(marker, bootLoad + marker);
  }

  return text;
});

// 3) Patch Workbench server to serve boot/fwd sidecars.
const serverPath = path.join(root, "AcRuleWorkbench", "WorkbenchApiServer.cs");

patchFile(serverPath, text => {
  if (text.includes('routeKey == "ac-rule-viewer.boot.json"')) {
    return text;
  }

  const marker = `        if (routeKey == "ac-rule-viewer.tree.json" || routeKey == "viewer/ac-rule-viewer.tree.json")
        {
            WriteViewerTextAsset(context, "ac-rule-viewer.tree.json", "application/json; charset=utf-8", "{}");
            return;
        }
`;

  if (!text.includes(marker)) {
    throw new Error("Could not find tree sidecar route block.");
  }

  const replacement = marker + `
        if (routeKey == "ac-rule-viewer.boot.json" || routeKey == "viewer/ac-rule-viewer.boot.json")
        {
            WriteViewerTextAsset(context, "ac-rule-viewer.boot.json", "application/json; charset=utf-8", "{}");
            return;
        }

        if (routeKey == "ac-rule-viewer.fwd.json" || routeKey == "viewer/ac-rule-viewer.fwd.json")
        {
            WriteViewerTextAsset(context, "ac-rule-viewer.fwd.json", "application/json; charset=utf-8", "{}");
            return;
        }

`;

  return text.replace(marker, replacement);
});

// 4) Patch launcher: LocalFast still generates sidecars, but serves shell HTML instead of 60MB live HTML.
const launcherPath = path.join(root, "scripts", "start-fw-editor-viewer.ps1");

patchFile(launcherPath, text => {
  text = text.replace(
    '$viewerOutputPath = if ($useStaticExportViewer) { $generatedViewerOutputPath } else { $viewerShellPath }',
    '$viewerOutputPath = $viewerShellPath'
  );

  if (!text.includes("build-viewer-boot-sidecar.js")) {
    const marker = "Sync-WbViewerSourceAssets -RepoRoot $repoRoot -ViewerOutputPath $viewerOutputPath";
    if (!text.includes(marker)) {
      throw new Error("Could not find Sync-WbViewerSourceAssets marker.");
    }

    const insert = `
if ($useStaticExportViewer) {
    $bootSidecarBuilder = Join-Path $scriptDir "build-viewer-boot-sidecar.js"
    if (Test-Path -LiteralPath $bootSidecarBuilder -PathType Leaf) {
        Push-Location $repoRoot
        try {
            & node $bootSidecarBuilder
            if ($LASTEXITCODE -ne 0) {
                Write-WbWarn "Boot sidecar builder returned exit code $LASTEXITCODE. Viewer will fall back to full sidecars."
            }
            else {
                Write-WbOk "Boot sidecar generated for fast shell startup."
            }
        }
        catch {
            Write-WbWarn "Boot sidecar builder failed. Viewer will fall back to full sidecars. $($_.Exception.Message)"
        }
        finally {
            Pop-Location
        }
    }
    else {
        Write-WbWarn "Boot sidecar builder not found: $bootSidecarBuilder"
    }
}

`;

    text = text.replace(marker, insert + marker);
  }

  return text;
});

// 5) Rebuild generated viewer JS and sync to Core.
const jsDir = path.join(root, "src", "viewer", "js");
const jsOut = path.join(root, "src", "viewer", "ac-rule-viewer.js");
const js = fs.readdirSync(jsDir)
  .filter(f => f.endsWith(".js"))
  .sort()
  .map(f => read(path.join(jsDir, f)))
  .join("\n\n");

write(jsOut, js);
write(path.join(root, "AcRuleWorkbench.Core", "Viewer", "ac-rule-viewer.js"), js);

const html = read(path.join(root, "src", "viewer", "ac-rule-viewer.html"));
write(path.join(root, "AcRuleWorkbench.Core", "Viewer", "ac-rule-viewer.html"), html);
write(path.join(root, "AcRuleWorkbench.Core", "Viewer", "ac-viewer-template.html"), html);

console.log("[COMPLETE] Boot-sidecar viewer mode patch applied.");
