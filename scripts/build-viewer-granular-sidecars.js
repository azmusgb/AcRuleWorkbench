#!/usr/bin/env node
/*
  Phase 8 granular sidecar builder.

  Generates smaller viewer sidecars from the already-generated static viewer payloads.
  This script is intentionally source-data-only: it never calls native FormWorks DLLs.

  Inputs, in priority order:
    - ac-rule-viewer.boot.json        compact boot payload, if present
    - ac-rule-viewer.tree.json        full structural tree payload, if present
    - ac-rule-viewer.rules.json       full rules payload, if present
    - ac-rule-viewer.rel.json         relationship payload, if present
    - ac-rule-viewer.fwd.json         optional FWD global resource payload

  Outputs:
    - ac-rule-viewer.manifest.json
    - ac-rule-viewer.index.json
    - rules.pages.index.json
    - rules.documents.index.json
    - rules.udfs.index.json
    - rules.scope.<safeKey>.tree.json
    - fwd.<workspace>.index.json files when FWD payload exists

  Design constraints:
    - Keep startup payload small and useful.
    - Split rule data by viewer navigation scope: Page, Document, UDF, Other.
    - Split FWD catalog data by workspace.
    - Preserve fallback compatibility: if granular sidecars are missing, existing boot/fwd sidecars still work.
*/

const fs = require('fs');
const path = require('path');

const repoRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const outDir = process.argv[3] ? path.resolve(process.argv[3]) : repoRoot;
const previewLimit = Number(process.env.FW_VIEWER_PREVIEW_NODE_LIMIT || 160);

function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/, '');
}

function exists(file) {
  return fs.existsSync(path.join(repoRoot, file));
}

function readText(file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8');
}

function readJson(file, fallback = null) {
  const full = path.join(repoRoot, file);
  if (!fs.existsSync(full)) return fallback;
  const raw = stripBom(fs.readFileSync(full, 'utf8'));
  if (!raw.trim()) return fallback;
  return JSON.parse(raw);
}

function writeJson(file, value) {
  const full = path.join(outDir, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(value, null, 2), 'utf8');
  return full;
}

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function list(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.Items)) return value.Items;
  return [];
}

function first(...values) {
  return values.find(v => v !== undefined && v !== null);
}

function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

function lower(value) {
  return text(value).toLowerCase();
}

function safeKey(value) {
  const raw = text(value || 'unknown').trim() || 'unknown';
  return raw
    .replace(/^[.\\/]+/, '')
    .replace(/[\\/]+/g, '_')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180) || 'unknown';
}

function itemId(item) {
  return text(first(
    item && item.NodeId,
    item && item.nodeId,
    item && item.Id,
    item && item.id,
    item && item.RuleGuid,
    item && item.ruleGuid,
    item && item.Guid,
    item && item.guid,
    item && item.Key,
    item && item.key,
    item && item.Name,
    item && item.name
  ));
}

function parentId(item) {
  return text(first(item && item.ParentNodeId, item && item.parentNodeId, item && item.ParentId, item && item.parentId));
}

function nodeScopeId(node) {
  return text(first(
    node && node.ScopePath,
    node && node.scopePath,
    node && node.ScopeId,
    node && node.scopeId,
    node && node.ScopeKey,
    node && node.scopeKey,
    node && node.RuleListScope,
    node && node.ruleListScope
  ));
}

function ruleScopeId(rule) {
  return text(first(
    rule && rule.ScopePath,
    rule && rule.scopePath,
    rule && rule.ScopeId,
    rule && rule.scopeId,
    rule && rule.RuleListScope,
    rule && rule.ruleListScope
  ));
}

function ruleGuid(rule) {
  return text(first(rule && rule.RuleGuid, rule && rule.ruleGuid, rule && rule.Guid, rule && rule.guid));
}

function nodeRuleGuid(node) {
  return text(first(node && node.RuleGuid, node && node.ruleGuid, node && node.Guid, node && node.guid));
}

function edgeScopeId(edge, nodeById) {
  const direct = text(first(edge && edge.ScopePath, edge && edge.scopePath, edge && edge.ScopeId, edge && edge.scopeId));
  if (direct) return direct;
  const parent = text(first(edge && edge.ParentNodeId, edge && edge.parentNodeId, edge && edge.FromNodeId, edge && edge.fromNodeId, edge && edge.SourceId, edge && edge.sourceId));
  const child = text(first(edge && edge.ChildNodeId, edge && edge.childNodeId, edge && edge.ToNodeId, edge && edge.toNodeId, edge && edge.TargetId, edge && edge.targetId));
  return nodeScopeId(nodeById.get(parent)) || nodeScopeId(nodeById.get(child));
}

function relScopeId(rel) {
  return text(first(rel && rel.ScopePath, rel && rel.scopePath, rel && rel.ScopeId, rel && rel.scopeId));
}

function scopeId(scope) {
  return text(first(scope && scope.ScopePath, scope && scope.scopePath, scope && scope.ScopeId, scope && scope.scopeId, scope && scope.Key, scope && scope.key, scope && scope.Name, scope && scope.name));
}

function scopeName(scope) {
  return text(first(scope && scope.Name, scope && scope.name, scope && scope.ScopeName, scope && scope.scopeName, scopeId(scope)));
}

function inferScopeKind(id, scope) {
  const raw = `${id} ${JSON.stringify(scope || {})}`.toLowerCase();
  if (/\bac\/pages\b|\bpages\b|\bpage\b/.test(raw)) return 'page';
  if (/\bac\/documents\b|\bdocuments\b|\bdocument\b|\bdoc\b/.test(raw)) return 'document';
  if (/\budf\b|user defined function|function rule/.test(raw)) return 'udf';
  if (/\bbatch\b/.test(raw)) return 'batch';
  if (/\bprocess\b/.test(raw)) return 'process';
  return 'other';
}

function normalizePayload(raw) {
  const boot = raw && raw.schema && /boot/i.test(raw.schema) ? raw : null;
  const treeCandidate = first(raw && raw.treeData, raw && raw.tree, raw && raw.Tree, raw && raw.data && raw.data.treeData, raw);
  const rulesCandidate = first(raw && raw.rulesData, raw && raw.rules, raw && raw.Rules, raw && raw.data && raw.data.rulesData, raw);
  const relCandidate = first(raw && raw.relData, raw && raw.relationshipsData, raw && raw.relationships, raw && raw.Relationships, raw && raw.data && raw.data.relData, raw);

  const treeData = {
    ...((treeCandidate && typeof treeCandidate === 'object' && !Array.isArray(treeCandidate)) ? treeCandidate : {}),
    Scopes: list(first(treeCandidate && treeCandidate.Scopes, treeCandidate && treeCandidate.scopes, raw && raw.Scopes, raw && raw.scopes)),
    Nodes: list(first(treeCandidate && treeCandidate.Nodes, treeCandidate && treeCandidate.nodes, raw && raw.Nodes, raw && raw.nodes)),
    Edges: list(first(treeCandidate && treeCandidate.Edges, treeCandidate && treeCandidate.edges, raw && raw.Edges, raw && raw.edges)),
    Diagnostics: list(first(treeCandidate && treeCandidate.Diagnostics, treeCandidate && treeCandidate.diagnostics, raw && raw.Diagnostics, raw && raw.diagnostics))
  };

  const rulesData = {
    ...((rulesCandidate && typeof rulesCandidate === 'object' && !Array.isArray(rulesCandidate)) ? rulesCandidate : {}),
    Rules: list(first(rulesCandidate && rulesCandidate.Rules, rulesCandidate && rulesCandidate.rules, raw && raw.Rules, raw && raw.rules, boot && boot.ruleSummaries))
  };

  const relData = {
    ...((relCandidate && typeof relCandidate === 'object' && !Array.isArray(relCandidate)) ? relCandidate : {}),
    Relationships: list(first(relCandidate && relCandidate.Relationships, relCandidate && relCandidate.relationships, relCandidate && relCandidate.Edges, relCandidate && relCandidate.edges, raw && raw.Relationships, raw && raw.relationships))
  };

  return { rulesData, treeData, relData };
}

function loadSourcePayloads() {
  const boot = readJson('ac-rule-viewer.boot.json', null);
  const fullTree = readJson('ac-rule-viewer.tree.json', null);
  const fullRules = readJson('ac-rule-viewer.rules.json', null);
  const fullRel = readJson('ac-rule-viewer.rel.json', null);

  if (fullTree || fullRules || fullRel) {
    return {
      source: 'full-sidecars',
      rulesData: fullRules || { Rules: [] },
      treeData: fullTree || { Scopes: [], Nodes: [], Edges: [], Diagnostics: [] },
      relData: fullRel || { Relationships: [] }
    };
  }

  if (boot) {
    return { source: 'boot-sidecar', ...normalizePayload(boot) };
  }

  throw new Error('No source sidecars found. Expected ac-rule-viewer.boot.json or ac-rule-viewer.{rules,tree,rel}.json.');
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function withArrayField(base, fieldName, items) {
  const next = cloneJson(base && typeof base === 'object' ? base : {});
  next[fieldName] = items;
  return next;
}

function buildScopeSidecars(source) {
  const scopes = list(first(source.treeData.Scopes, source.treeData.scopes));
  const nodes = list(first(source.treeData.Nodes, source.treeData.nodes));
  const edges = list(first(source.treeData.Edges, source.treeData.edges));
  const diagnostics = list(first(source.treeData.Diagnostics, source.treeData.diagnostics));
  const rules = list(first(source.rulesData.Rules, source.rulesData.rules));
  const relationships = list(first(source.relData.Relationships, source.relData.relationships, source.relData.Edges, source.relData.edges));

  const nodeById = new Map(nodes.map(node => [itemId(node), node]).filter(([id]) => id));
  const scopeById = new Map(scopes.map(scope => [scopeId(scope), scope]).filter(([id]) => id));
  const scopesFromNodes = new Set(nodes.map(nodeScopeId).filter(Boolean));
  const allScopeIds = new Set([...scopeById.keys(), ...scopesFromNodes]);

  const nodesByScope = new Map();
  const nodeIdsByScope = new Map();
  const ruleGuidsByScope = new Map();
  for (const node of nodes) {
    const id = nodeScopeId(node) || 'Unknown';
    if (!nodesByScope.has(id)) nodesByScope.set(id, []);
    if (!nodeIdsByScope.has(id)) nodeIdsByScope.set(id, new Set());
    if (!ruleGuidsByScope.has(id)) ruleGuidsByScope.set(id, new Set());
    nodesByScope.get(id).push(node);
    const nodeId = itemId(node);
    if (nodeId) nodeIdsByScope.get(id).add(nodeId);
    const guid = nodeRuleGuid(node);
    if (guid) ruleGuidsByScope.get(id).add(guid);
    allScopeIds.add(id);
  }

  const rulesByScope = new Map();
  for (const rule of rules) {
    const explicitScope = ruleScopeId(rule);
    const guid = ruleGuid(rule);
    let targetScope = explicitScope;
    if (!targetScope && guid) {
      targetScope = [...ruleGuidsByScope.entries()].find(([, set]) => set.has(guid))?.[0] || '';
    }
    if (!targetScope) targetScope = 'Unknown';
    if (!rulesByScope.has(targetScope)) rulesByScope.set(targetScope, []);
    rulesByScope.get(targetScope).push(rule);
  }

  const edgesByScope = new Map();
  for (const edge of edges) {
    const id = edgeScopeId(edge, nodeById) || 'Unknown';
    if (!edgesByScope.has(id)) edgesByScope.set(id, []);
    edgesByScope.get(id).push(edge);
  }

  const diagnosticsByScope = new Map();
  for (const diag of diagnostics) {
    const direct = text(first(diag && diag.ScopePath, diag && diag.scopePath, diag && diag.ScopeId, diag && diag.scopeId));
    const nodeId = text(first(diag && diag.NodeId, diag && diag.nodeId, diag && diag.RuleNodeId, diag && diag.ruleNodeId));
    const id = direct || nodeScopeId(nodeById.get(nodeId)) || 'Unknown';
    if (!diagnosticsByScope.has(id)) diagnosticsByScope.set(id, []);
    diagnosticsByScope.get(id).push(diag);
  }

  const relationshipsByScope = new Map();
  for (const rel of relationships) {
    const id = relScopeId(rel) || 'Unknown';
    if (!relationshipsByScope.has(id)) relationshipsByScope.set(id, []);
    relationshipsByScope.get(id).push(rel);
  }

  const sidecars = [];
  const scopeSummaries = [];
  for (const id of [...allScopeIds].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))) {
    const scope = scopeById.get(id) || { ScopePath: id, Name: id };
    const key = safeKey(id);
    const scopeNodes = nodesByScope.get(id) || [];
    const scopeRules = rulesByScope.get(id) || [];
    const scopeEdges = edgesByScope.get(id) || [];
    const scopeDiagnostics = diagnosticsByScope.get(id) || [];
    const scopeRelationships = relationshipsByScope.get(id) || [];
    const file = `rules.scope.${key}.tree.json`;
    const kind = inferScopeKind(id, scope);

    const sidecar = {
      schema: 'AcRuleViewer.ScopeTreeSidecar',
      schemaVersion: '1.0.0',
      scopeId: id,
      scopeKey: key,
      kind,
      generatedAtUtc: new Date().toISOString(),
      counts: {
        rules: scopeRules.length,
        nodes: scopeNodes.length,
        edges: scopeEdges.length,
        diagnostics: scopeDiagnostics.length,
        relationships: scopeRelationships.length
      },
      rulesData: withArrayField(source.rulesData, 'Rules', scopeRules),
      treeData: {
        ...cloneJson(source.treeData),
        Scopes: [scope],
        Nodes: scopeNodes,
        Edges: scopeEdges,
        Diagnostics: scopeDiagnostics
      },
      relData: withArrayField(source.relData, 'Relationships', scopeRelationships)
    };

    writeJson(file, sidecar);
    sidecars.push({ file, key, scopeId: id, kind, bytes: byteLength(sidecar) });
    scopeSummaries.push({
      scopeId: id,
      scopeKey: key,
      name: scopeName(scope),
      kind,
      file,
      counts: sidecar.counts,
      estimatedBytes: byteLength(sidecar)
    });
  }

  const byKind = kind => scopeSummaries.filter(s => s.kind === kind)
    .sort((a, b) => (b.counts.nodes - a.counts.nodes) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  writeJson('rules.pages.index.json', { schema: 'AcRuleViewer.RuleScopeIndex', schemaVersion: '1.0.0', kind: 'page', scopes: byKind('page') });
  writeJson('rules.documents.index.json', { schema: 'AcRuleViewer.RuleScopeIndex', schemaVersion: '1.0.0', kind: 'document', scopes: byKind('document') });
  writeJson('rules.udfs.index.json', { schema: 'AcRuleViewer.RuleScopeIndex', schemaVersion: '1.0.0', kind: 'udf', scopes: byKind('udf') });
  writeJson('rules.other.index.json', { schema: 'AcRuleViewer.RuleScopeIndex', schemaVersion: '1.0.0', kind: 'other', scopes: scopeSummaries.filter(s => !['page', 'document', 'udf'].includes(s.kind)) });

  const defaultScope = scopeSummaries
    .slice()
    .sort((a, b) => (b.counts.nodes - a.counts.nodes) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))[0] || null;

  const previewScopeId = defaultScope && defaultScope.scopeId;
  const previewNodes = previewScopeId ? (nodesByScope.get(previewScopeId) || []).slice(0, previewLimit) : [];
  const previewNodeIds = new Set(previewNodes.map(itemId).filter(Boolean));
  const previewRuleGuids = new Set(previewNodes.map(nodeRuleGuid).filter(Boolean));
  const previewScope = previewScopeId ? (scopeById.get(previewScopeId) || { ScopePath: previewScopeId, Name: previewScopeId }) : null;
  const previewRules = (previewScopeId ? (rulesByScope.get(previewScopeId) || []) : [])
    .filter(rule => previewRuleGuids.has(ruleGuid(rule)))
    .slice(0, previewLimit);
  const previewEdges = (previewScopeId ? (edgesByScope.get(previewScopeId) || []) : [])
    .filter(edge => {
      const p = text(first(edge && edge.ParentNodeId, edge && edge.parentNodeId, edge && edge.FromNodeId, edge && edge.fromNodeId));
      const c = text(first(edge && edge.ChildNodeId, edge && edge.childNodeId, edge && edge.ToNodeId, edge && edge.toNodeId));
      return previewNodeIds.has(p) && previewNodeIds.has(c);
    });

  const index = {
    schema: 'AcRuleViewer.GranularIndex',
    schemaVersion: '1.0.0',
    generatedAtUtc: new Date().toISOString(),
    source: source.source,
    previewLimit,
    defaultScopeId: previewScopeId || '',
    counts: {
      scopes: scopeSummaries.length,
      rules: rules.length,
      nodes: nodes.length,
      edges: edges.length,
      diagnostics: diagnostics.length,
      relationships: relationships.length
    },
    scopes: scopeSummaries,
    bootPreview: {
      partial: true,
      scopeId: previewScopeId || '',
      rulesData: withArrayField(source.rulesData, 'Rules', previewRules),
      treeData: {
        ...cloneJson(source.treeData),
        Scopes: scopes,
        Nodes: previewNodes,
        Edges: previewEdges,
        Diagnostics: []
      },
      relData: withArrayField(source.relData, 'Relationships', [])
    },
    indexes: {
      pages: 'rules.pages.index.json',
      documents: 'rules.documents.index.json',
      udfs: 'rules.udfs.index.json',
      other: 'rules.other.index.json'
    }
  };

  writeJson('ac-rule-viewer.index.json', index);

  return { index, scopeSummaries, sidecars };
}

function loadFwdPayload() {
  const fwd = readJson('ac-rule-viewer.fwd.json', null);
  if (!fwd || typeof fwd !== 'object') return null;
  return fwd.data && typeof fwd.data === 'object' ? fwd.data : fwd;
}

function pickObjectFields(source, fieldNames) {
  const result = {};
  for (const name of fieldNames) {
    if (source && source[name] !== undefined) result[name] = source[name];
  }
  return result;
}

function buildFwdSidecars(fwd) {
  if (!fwd) return { sidecars: [], counts: {} };

  const workspaceSpecs = [
    { workspace: 'rule-lists', file: 'fwd.rule-lists.index.json', fields: ['ruleLists', 'actionLists', 'statusResults'] },
    { workspace: 'udfs', file: 'fwd.udfs.index.json', fields: ['udfs', 'canonicalUdfs', 'functions'] },
    { workspace: 'functions', file: 'fwd.functions.index.json', fields: ['functions', 'udfs', 'canonicalUdfs'] },
    { workspace: 'tables', file: 'fwd.tables.index.json', fields: ['tables', 'fields'] },
    { workspace: 'selection-lists', file: 'fwd.selection-lists.index.json', fields: ['selectionLists', 'fields'] },
    { workspace: 'resources', file: 'fwd.resources.index.json', fields: ['resources', 'fields', 'drivers', 'processes'] },
    { workspace: 'drivers', file: 'fwd.drivers.index.json', fields: ['drivers', 'inputDrivers', 'outputDrivers', 'processes'] }
  ];

  const sidecars = [];
  for (const spec of workspaceSpecs) {
    const payload = {
      schema: 'AcRuleViewer.FwdWorkspaceIndex',
      schemaVersion: '1.0.0',
      workspace: spec.workspace,
      generatedAtUtc: new Date().toISOString(),
      ...pickObjectFields(fwd, spec.fields)
    };
    payload.counts = Object.fromEntries(spec.fields.map(name => [name, list(payload[name]).length]));
    writeJson(spec.file, payload);
    sidecars.push({ workspace: spec.workspace, file: spec.file, fields: spec.fields, counts: payload.counts, bytes: byteLength(payload) });
  }

  return {
    sidecars,
    counts: {
      resources: list(fwd.resources).length,
      ruleLists: list(fwd.ruleLists).length,
      udfs: list(fwd.udfs).length,
      canonicalUdfs: list(fwd.canonicalUdfs).length,
      tables: list(fwd.tables).length,
      functions: list(fwd.functions).length,
      selectionLists: list(fwd.selectionLists).length,
      drivers: list(fwd.drivers).length
    }
  };
}

function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const source = loadSourcePayloads();
  const ruleSplit = buildScopeSidecars(source);
  const fwd = loadFwdPayload();
  const fwdSplit = buildFwdSidecars(fwd);

  const manifest = {
    schema: 'AcRuleViewer.SidecarManifest',
    schemaVersion: '1.0.0',
    generatedAtUtc: new Date().toISOString(),
    source: source.source,
    mode: 'granular-sidecars',
    files: {
      index: 'ac-rule-viewer.index.json',
      pagesIndex: 'rules.pages.index.json',
      documentsIndex: 'rules.documents.index.json',
      udfRulesIndex: 'rules.udfs.index.json',
      otherRulesIndex: 'rules.other.index.json'
    },
    fwdWorkspaceIndexes: Object.fromEntries(fwdSplit.sidecars.map(s => [s.workspace, s.file])),
    scopes: ruleSplit.scopeSummaries.map(s => ({ scopeId: s.scopeId, scopeKey: s.scopeKey, kind: s.kind, file: s.file, counts: s.counts })),
    counts: {
      ...ruleSplit.index.counts,
      fwd: fwdSplit.counts
    }
  };

  writeJson('ac-rule-viewer.manifest.json', manifest);

  const report = {
    ok: true,
    outDir,
    source: source.source,
    previewLimit,
    generated: {
      manifest: 'ac-rule-viewer.manifest.json',
      index: 'ac-rule-viewer.index.json',
      scopeSidecars: ruleSplit.sidecars.length,
      fwdWorkspaceSidecars: fwdSplit.sidecars.length
    },
    counts: manifest.counts,
    largestScopeSidecars: ruleSplit.sidecars.slice().sort((a, b) => b.bytes - a.bytes).slice(0, 8),
    fwdSidecars: fwdSplit.sidecars
  };

  writeJson('artifacts/viewer-stability/phase8-granular-sidecars-report.json', report);
  console.log(JSON.stringify(report, null, 2));
}

main();
