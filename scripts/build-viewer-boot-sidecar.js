
const fs = require("fs");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
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
