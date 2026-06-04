import React, { useState } from 'react';
import {
  Search, ChevronRight, ChevronDown, HelpCircle, Moon, Sun,
  FileText, Layers, GitBranch, Database, Code, Hash,
  AlertTriangle, CheckCircle, XCircle, Info,
  Copy, Download, Shield, Zap, BarChart2, Settings,
  ArrowRight, Eye, Terminal, Package, ChevronUp,
} from 'lucide-react';

// ── Palette ─────────────────────────────────────────────────────────────────
const C = {
  bg:         '#0d1117',
  panel:      '#161b22',
  panel2:     '#1a2030',
  surface:    '#1c2333',
  surface2:   '#212840',
  accent:     '#2dd4bf',
  accentLo:   'rgba(45,212,191,0.12)',
  accentGlow: 'rgba(45,212,191,0.30)',
  text:       '#e2e8f0',
  text2:      '#8b95a8',
  text3:      '#4a5568',
  border:     '#252e40',
  border2:    '#1e2636',
  teal:       '#2dd4bf',
  blue:       '#60a5fa',
  violet:     '#a78bfa',
  green:      '#34d399',
  amber:      '#fbbf24',
  red:        '#f87171',
  tagPage:   { bg: 'rgba(96,165,250,0.12)',  text: '#60a5fa'  },
  tagUdf:    { bg: 'rgba(167,139,250,0.12)', text: '#a78bfa'  },
  tagDoc:    { bg: 'rgba(52,211,153,0.12)',  text: '#34d399'  },
};
const MONO = "'JetBrains Mono', ui-monospace, 'Cascadia Code', Menlo, monospace";
const SANS = "Inter, ui-sans-serif, system-ui, sans-serif";

// ── Mock data ────────────────────────────────────────────────────────────────
const SCOPES = [
  { name: 'PAGE_INVOICE_HEADER', type: 'page', rules: 4, warnings: 1 },
  { name: 'PAGE_LINE_ITEMS',     type: 'page', rules: 7, warnings: 0 },
  { name: 'PAGE_FOOTER',         type: 'page', rules: 2, warnings: 0 },
  { name: 'DOC_CAPTURE_MAIN',    type: 'doc',  rules: 11,warnings: 2 },
  { name: 'UDF_VENDOR_LOOKUP',   type: 'udf',  rules: 3, warnings: 0 },
  { name: 'UDF_TAX_CALC',        type: 'udf',  rules: 2, warnings: 0 },
];

const TREE: TreeNode[] = [
  {
    id: 'r1', name: 'ExtractInvoiceDate', fn: 'MatchField', result: 'invoice_date',
    ordinal: 1, guid: 'a1b2c3d4', status: 'ok', params: 3, children: [
      { id: 'r1a', name: 'ValidateDateFormat', fn: 'RegexCheck', result: 'format_ok',
        ordinal: 1.1, guid: 'e5f6a7b8', status: 'warn', params: 1, children: [] },
    ],
  },
  {
    id: 'r2', name: 'ExtractVendorName', fn: 'RegexCapture', result: 'vendor_name',
    ordinal: 2, guid: 'c9d0e1f2', status: 'ok', params: 2, children: [],
  },
  {
    id: 'r3', name: 'ValidateTotal', fn: 'NumericCheck', result: 'total_ok',
    ordinal: 3, guid: 'g3h4i5j6', status: 'warn', params: 4, children: [
      { id: 'r3a', name: 'CheckCurrencyCode', fn: 'LookupTable', result: 'currency_ok',
        ordinal: 3.1, guid: 'k7l8m9n0', status: 'ok', params: 2, children: [] },
      { id: 'r3b', name: 'RoundingVerify', fn: 'NumericCheck', result: 'round_ok',
        ordinal: 3.2, guid: 'o1p2q3r4', status: 'ok', params: 1, children: [] },
    ],
  },
  {
    id: 'r4', name: 'CaptureLineRef', fn: 'MatchField', result: 'line_reference',
    ordinal: 4, guid: 's5t6u7v8', status: 'ok', params: 2, children: [],
  },
];

const DIAGNOSTICS = [
  { id: 'd1', sev: 'warn',  message: 'ValidateDateFormat: regex pattern may be too broad',       scope: 'PAGE_INVOICE_HEADER', rule: 'ValidateDateFormat' },
  { id: 'd2', sev: 'warn',  message: 'ValidateTotal: tolerance threshold not set, using default', scope: 'PAGE_INVOICE_HEADER', rule: 'ValidateTotal' },
  { id: 'd3', sev: 'info',  message: 'DOC_CAPTURE_MAIN: 2 unresolved WFFileRef references',      scope: 'DOC_CAPTURE_MAIN',    rule: '' },
  { id: 'd4', sev: 'info',  message: 'Parse completed in 142ms · 29 rules · 12 functions',       scope: '',                    rule: '' },
];

const VIEWS = [
  { id: 'overview',    label: 'Overview',         icon: BarChart2  },
  { id: 'rule-tree',   label: 'Rule Tree',        icon: GitBranch  },
  { id: 'rule-table',  label: 'Rule Table',       icon: Layers     },
  { id: 'functions',   label: 'AC Functions',     icon: Zap        },
  { id: 'udfs',        label: 'UDFs',             icon: Code       },
  { id: 'diagnostics', label: 'Diagnostics',      icon: AlertTriangle },
  { id: 'exports',     label: 'Exports',          icon: Package    },
];

// ── Types ────────────────────────────────────────────────────────────────────
interface TreeNode {
  id: string; name: string; fn: string; result: string;
  ordinal: number; guid: string; status: 'ok' | 'warn' | 'error';
  params: number; children: TreeNode[];
}

// ── Small components ─────────────────────────────────────────────────────────
function TypeChip({ type }: { type: string }) {
  const s = type === 'page' ? C.tagPage : type === 'udf' ? C.tagUdf : C.tagDoc;
  return <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', padding: '2px 5px', borderRadius: 3,
    backgroundColor: s.bg, color: s.text }}>{type}</span>;
}

function SevIcon({ sev }: { sev: string }) {
  if (sev === 'error') return <XCircle size={12} color={C.red} />;
  if (sev === 'warn')  return <AlertTriangle size={12} color={C.amber} />;
  return <Info size={12} color={C.blue} />;
}

function KV({ k, v, mono, vc }: { k: string; v: string; mono?: boolean; vc?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 4,
      padding: '5px 10px', borderBottom: `1px solid ${C.border2}`, alignItems: 'start' }}>
      <span style={{ fontFamily: MONO, fontSize: 10, color: C.text3, paddingTop: 1 }}>{k}</span>
      <span style={{ fontFamily: mono ? MONO : SANS, fontSize: 11, color: vc ?? C.text2,
        wordBreak: 'break-all' }}>{v}</span>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return <div style={{ padding: '10px 10px 4px', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: C.text3 }}>{label}</div>;
}

// ── Tree node renderer ───────────────────────────────────────────────────────
function TreeRow({ node, depth = 0, selectedId, onSelect, expanded, onToggle }: {
  node: TreeNode; depth?: number; selectedId: string;
  onSelect: (id: string) => void; expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const isSelected = node.id === selectedId;
  const isExpanded = expanded.has(node.id);
  const hasChildren = node.children.length > 0;

  return (
    <>
      <button
        onClick={() => { onSelect(node.id); if (hasChildren) onToggle(node.id); }}
        style={{
          width: '100%', display: 'grid',
          gridTemplateColumns: `${depth * 20 + 8}px 18px 1fr 90px 56px 28px`,
          alignItems: 'center', padding: '7px 8px 7px 0',
          backgroundColor: isSelected ? C.accentLo : 'transparent',
          borderLeft: `2px solid ${isSelected ? C.accent : 'transparent'}`,
          textAlign: 'left', gap: 0,
          borderBottom: `1px solid ${C.border2}`,
        }}
      >
        {/* indent spacer */}
        <span />
        {/* expand chevron */}
        <span style={{ color: C.text3, display: 'flex', alignItems: 'center' }}>
          {hasChildren
            ? (isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
            : <span style={{ width: 12 }} />}
        </span>
        {/* name + ordinal */}
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: isSelected ? 700 : 500,
            color: isSelected ? C.text : C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.name}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.text3 }}>
            ord {node.ordinal} · {node.params}p
          </span>
        </span>
        {/* result */}
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.teal, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 6 }}>
          {node.result}
        </span>
        {/* status */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {node.status === 'ok'
            ? <CheckCircle size={11} color={C.green} />
            : <AlertTriangle size={11} color={C.amber} />}
          <span style={{ fontSize: 9, fontFamily: MONO, color: node.status === 'ok' ? C.green : C.amber }}>
            {node.status}
          </span>
        </span>
        {/* children count */}
        {hasChildren && <span style={{ fontFamily: MONO, fontSize: 9, color: C.text3,
          backgroundColor: C.surface, borderRadius: 3, padding: '1px 5px', textAlign: 'center' }}>
          {node.children.length}
        </span>}
      </button>
      {isExpanded && node.children.map(child => (
        <TreeRow key={child.id} node={child} depth={depth + 1}
          selectedId={selectedId} onSelect={onSelect} expanded={expanded} onToggle={onToggle} />
      ))}
    </>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export function DarkPro() {
  const [activeView,   setActiveView]   = useState('rule-tree');
  const [activeScope,  setActiveScope]  = useState('PAGE_INVOICE_HEADER');
  const [selectedId,   setSelectedId]   = useState('r1');
  const [inspTab,      setInspTab]      = useState('Summary');
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set(['r1', 'r3']));
  const [bottomOpen,   setBottomOpen]   = useState(true);
  const [theme,        setTheme]        = useState<'dark'|'light'>('dark');

  const selectedNode = findNode(TREE, selectedId) ?? TREE[0];

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const warnCount = DIAGNOSTICS.filter(d => d.sev === 'warn').length;
  const errCount  = DIAGNOSTICS.filter(d => d.sev === 'error').length;

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', backgroundColor: C.bg, color: C.text, fontFamily: SANS, fontSize: 13 }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}
        button{background:none;border:none;cursor:pointer;color:inherit;font-family:inherit}
        input{background:none;border:none;outline:none;color:inherit;font-family:inherit}
      `}</style>

      {/* ══ TOP COMMAND BAR ═══════════════════════════════════════════════ */}
      <header style={{ height: 56, flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: '0 16px', borderBottom: `1px solid ${C.border}`,
        backgroundColor: C.panel, gap: 12, zIndex: 20 }}>

        {/* Brand + file */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, minWidth: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center',
            justifyContent: 'center', backgroundColor: C.accentLo, border: `1px solid ${C.accentGlow}`,
            flexShrink: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.accent }}>AC</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
              AC Rule Workbench
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
              <FileText size={10} color={C.text3} />
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.text2 }}>fwd.cfd</span>
              <span style={{ fontSize: 9, color: C.text3 }}>·</span>
              {/* Parse badge */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, backgroundColor: 'rgba(52,211,153,0.10)',
                border: '1px solid rgba(52,211,153,0.25)', borderRadius: 4, padding: '1px 6px' }}>
                <CheckCircle size={8} color={C.green} />
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.green }}>Parse OK</span>
              </span>
              {warnCount > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3,
                backgroundColor: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.25)',
                borderRadius: 4, padding: '1px 6px' }}>
                <AlertTriangle size={8} color={C.amber} />
                <span style={{ fontFamily: MONO, fontSize: 9, color: C.amber }}>{warnCount}w</span>
              </span>}
            </div>
          </div>
        </div>

        {/* Search */}
        <div style={{ flex: 1, maxWidth: 520 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: C.bg,
            border: `1px solid ${C.border}`, borderRadius: 6, padding: '0 10px', height: 32 }}>
            <Search size={12} color={C.text3} />
            <input type="text" placeholder="Search rules, functions, UDFs, GUIDs, attributes…"
              style={{ flex: 1, fontSize: 12, color: C.text }} />
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.text3, border: `1px solid ${C.border}`,
              borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>⌘K</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {[
            { label: 'Validate', icon: <Shield size={12} />, accent: true },
            { label: 'Export',   icon: <Download size={12} /> },
          ].map(btn => (
            <button key={btn.label} style={{ display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 5, fontSize: 11, fontWeight: 500,
              backgroundColor: btn.accent ? C.accentLo : C.surface,
              border: `1px solid ${btn.accent ? C.accentGlow : C.border}`,
              color: btn.accent ? C.accent : C.text2 }}>
              {btn.icon}{btn.label}
            </button>
          ))}
          <div style={{ width: 1, height: 20, backgroundColor: C.border, margin: '0 4px' }} />
          <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            style={{ padding: 6, borderRadius: 5, color: C.text2 }}>
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button style={{ padding: 6, borderRadius: 5, color: C.text2 }}><HelpCircle size={14} /></button>
          <button style={{ padding: 6, borderRadius: 5, color: C.text2 }}><Settings size={14} /></button>
        </div>
      </header>

      {/* ══ BODY ══════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* ── LEFT PANE ───────────────────────────────────────────────── */}
        <aside style={{ width: 268, flexShrink: 0, backgroundColor: C.panel,
          borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column',
          overflow: 'hidden' }}>

          {/* A. Loaded source */}
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}`,
            backgroundColor: C.panel2 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.text3, letterSpacing: '0.08em',
              textTransform: 'uppercase', marginBottom: 8 }}>Loaded Source</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.text2, marginBottom: 6 }}>fwd.cfd</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
              {[
                ['Rules',     '29'], ['Functions', '12'],
                ['UDFs',      '6'],  ['Warnings',  '2'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', fontSize: 10 }}>
                  <span style={{ color: C.text3 }}>{k}</span>
                  <span style={{ fontFamily: MONO, fontWeight: 600,
                    color: k === 'Warnings' ? C.amber : C.text2 }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 9, fontFamily: MONO, color: C.text3 }}>
              Parsed · 3 days ago · 142ms
            </div>
          </div>

          {/* B. Primary views nav */}
          <div style={{ padding: '8px 8px 4px', borderBottom: `1px solid ${C.border}` }}>
            {VIEWS.map(v => {
              const active = v.id === activeView;
              const Icon = v.icon;
              return (
                <button key={v.id} onClick={() => setActiveView(v.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderRadius: 5, marginBottom: 1, textAlign: 'left',
                    backgroundColor: active ? C.accentLo : 'transparent',
                    borderLeft: `2px solid ${active ? C.accent : 'transparent'}`,
                    color: active ? C.text : C.text2, fontSize: 12 }}>
                  <Icon size={13} color={active ? C.accent : C.text3} />
                  {v.label}
                  {v.id === 'diagnostics' && warnCount > 0 &&
                    <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 9,
                      backgroundColor: 'rgba(251,191,36,0.15)', color: C.amber,
                      borderRadius: 3, padding: '1px 4px' }}>{warnCount}</span>}
                </button>
              );
            })}
          </div>

          {/* C. Object index */}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 8px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: C.text3, marginBottom: 6, paddingLeft: 4 }}>
              Object Index
            </div>
            {SCOPES.map(scope => {
              const active = scope.name === activeScope;
              return (
                <button key={scope.name} onClick={() => setActiveScope(scope.name)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7,
                    padding: '6px 8px', borderRadius: 5, marginBottom: 2, textAlign: 'left',
                    backgroundColor: active ? C.accentLo : 'transparent',
                    borderLeft: `2px solid ${active ? C.accent : 'transparent'}` }}>
                  <span style={{ color: active ? C.accent : C.text3, flexShrink: 0 }}>
                    {scope.type === 'udf' ? <Code size={12} />
                      : scope.type === 'doc' ? <Hash size={12} />
                      : <FileText size={12} />}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: active ? C.text : C.text2,
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {scope.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {scope.warnings > 0 &&
                      <AlertTriangle size={9} color={C.amber} />}
                    <TypeChip type={scope.type} />
                    <span style={{ fontFamily: MONO, fontSize: 9, color: C.text3 }}>{scope.rules}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── MAIN + INSPECTOR ────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

            {/* ── MAIN WORK SURFACE ──────────────────────────────────── */}
            <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
              backgroundColor: C.bg }}>

              {/* View header */}
              <div style={{ padding: '12px 18px 0', borderBottom: `1px solid ${C.border}`,
                flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, color: C.text3 }}>
                    {VIEWS.find(v => v.id === activeView)?.label}
                  </span>
                  <ChevronRight size={11} color={C.text3} />
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.accent }}>{activeScope}</span>
                  <TypeChip type={SCOPES.find(s => s.name === activeScope)?.type ?? 'page'} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <h2 style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: C.text }}>
                    Rule Tree
                  </h2>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setExpanded(new Set(TREE.map(n => n.id).concat(TREE.flatMap(n => n.children.map(c => c.id)))))}
                      style={{ fontSize: 11, color: C.text2, padding: '3px 8px', borderRadius: 4,
                        border: `1px solid ${C.border}`, backgroundColor: C.surface }}>
                      Expand all
                    </button>
                    <button onClick={() => setExpanded(new Set())}
                      style={{ fontSize: 11, color: C.text2, padding: '3px 8px', borderRadius: 4,
                        border: `1px solid ${C.border}`, backgroundColor: C.surface }}>
                      Collapse
                    </button>
                  </div>
                </div>

                {/* Tree column headers */}
                <div style={{ display: 'grid',
                  gridTemplateColumns: '8px 18px 1fr 90px 56px 28px',
                  padding: '0 8px 6px', fontSize: 9, fontWeight: 700, fontFamily: MONO,
                  letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3 }}>
                  <span /><span />
                  <span>Rule Name</span>
                  <span>Result</span>
                  <span>Status</span>
                  <span>Ch</span>
                </div>
              </div>

              {/* Tree body */}
              <div style={{ flex: 1, overflow: 'auto' }}>
                {TREE.map(node => (
                  <TreeRow key={node.id} node={node} depth={0}
                    selectedId={selectedId} onSelect={setSelectedId}
                    expanded={expanded} onToggle={toggleExpanded} />
                ))}
              </div>
            </main>

            {/* ── RIGHT EVIDENCE INSPECTOR ─────────────────────────── */}
            <aside style={{ width: 348, flexShrink: 0, backgroundColor: C.panel,
              borderLeft: `1px solid ${C.border}`, display: 'flex',
              flexDirection: 'column', overflow: 'hidden' }}>

              {/* Inspector header */}
              <div style={{ padding: '12px 14px 0', borderBottom: `1px solid ${C.border}`,
                flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 5, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: C.accentLo, border: `1px solid ${C.accentGlow}` }}>
                      <Eye size={12} color={C.accent} />
                    </div>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                        color: C.text, maxWidth: 200, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedNode.name}
                      </div>
                      <div style={{ fontSize: 9, fontFamily: MONO, letterSpacing: '0.07em',
                        textTransform: 'uppercase', color: C.text3, marginTop: 1 }}>
                        Extraction Rule · ord {selectedNode.ordinal}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    {selectedNode.status === 'ok'
                      ? <CheckCircle size={13} color={C.green} />
                      : <AlertTriangle size={13} color={C.amber} />}
                  </div>
                </div>

                {/* Inspector tabs */}
                <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
                  {['Summary', 'Evidence', 'Attributes', 'Functions', 'Source', 'Diagnostics'].map(tab => (
                    <button key={tab} onClick={() => setInspTab(tab)}
                      style={{ padding: '5px 9px', fontSize: 10, whiteSpace: 'nowrap',
                        fontWeight: inspTab === tab ? 600 : 400,
                        color: inspTab === tab ? C.accent : C.text3,
                        borderBottom: `2px solid ${inspTab === tab ? C.accent : 'transparent'}`,
                        marginBottom: -1 }}>
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Inspector body */}
              <div style={{ flex: 1, overflow: 'auto' }}>
                {inspTab === 'Summary' && (
                  <>
                    <div style={{ borderRadius: 6, margin: '10px 10px 0',
                      border: `1px solid ${C.border2}`, overflow: 'hidden' }}>
                      <KV k="name"   v={selectedNode.name}   mono vc={C.text} />
                      <KV k="guid"   v={selectedNode.guid}   mono vc={C.blue} />
                      <KV k="fn"     v={selectedNode.fn}     mono vc={C.teal} />
                      <KV k="result" v={selectedNode.result} mono />
                      <KV k="ordinal" v={String(selectedNode.ordinal)} mono />
                      <KV k="params"  v={`${selectedNode.params} parameters`} />
                      <KV k="status"  v={selectedNode.status === 'ok' ? 'Active · no issues' : 'Warning · review needed'}
                        vc={selectedNode.status === 'ok' ? C.green : C.amber} />
                    </div>

                    {selectedNode.children.length > 0 && (
                      <>
                        <Divider label="Child Rules" />
                        <div style={{ borderRadius: 6, margin: '0 10px', border: `1px solid ${C.border2}`,
                          overflow: 'hidden' }}>
                          {selectedNode.children.map(c => (
                            <button key={c.id} onClick={() => setSelectedId(c.id)}
                              style={{ width: '100%', display: 'flex', alignItems: 'center',
                                justifyContent: 'space-between', padding: '6px 10px',
                                borderBottom: `1px solid ${C.border2}`, textAlign: 'left',
                                backgroundColor: C.surface }}>
                              <span style={{ fontFamily: MONO, fontSize: 10, color: C.text2 }}>{c.name}</span>
                              <ChevronRight size={11} color={C.text3} />
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    <Divider label="Quick Actions" />
                    <div style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {[
                        { icon: <Copy size={11} />, label: 'Copy GUID' },
                        { icon: <ArrowRight size={11} />, label: 'Go to function def' },
                        { icon: <Eye size={11} />, label: 'View in Rule Table' },
                      ].map(a => (
                        <button key={a.label} style={{ display: 'flex', alignItems: 'center', gap: 7,
                          padding: '6px 8px', borderRadius: 5, fontSize: 11, color: C.text2,
                          border: `1px solid ${C.border}`, backgroundColor: C.surface,
                          textAlign: 'left' }}>
                          <span style={{ color: C.text3 }}>{a.icon}</span>{a.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {inspTab === 'Attributes' && (
                  <>
                    <Divider label="Attributes" />
                    <div style={{ borderRadius: 6, margin: '0 10px', border: `1px solid ${C.border2}`,
                      overflow: 'hidden' }}>
                      {[
                        ['regex',       String.raw`\d{2}/\d{2}/\d{4}`],
                        ['ignoreCase',  'true'],
                        ['required',    'true'],
                        ['confidence',  '0.85'],
                        ['multiLine',   'false'],
                      ].map(([k, v]) => (
                        <div key={k} style={{ display: 'grid', gridTemplateColumns: '90px 1fr',
                          padding: '6px 10px', borderBottom: `1px solid ${C.border2}`,
                          backgroundColor: C.surface, alignItems: 'start' }}>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.accent }}>{k}</span>
                          <span style={{ fontFamily: MONO, fontSize: 11, color: C.text2, wordBreak: 'break-all' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {inspTab === 'Evidence' && (
                  <>
                    <Divider label="Source Evidence" />
                    <div style={{ margin: '0 10px', borderRadius: 6, overflow: 'hidden',
                      border: `1px solid ${C.border}` }}>
                      <div style={{ padding: '6px 10px', fontSize: 10, fontFamily: MONO,
                        color: C.text3, backgroundColor: C.surface,
                        borderBottom: `1px solid ${C.border}` }}>
                        fwd.cfd · PAGE_INVOICE_HEADER · line 142
                      </div>
                      <pre style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 10,
                        lineHeight: 1.8, color: C.text2, backgroundColor: '#080c12',
                        overflowX: 'auto', margin: 0 }}>{`<rule id="rule_001"
  name="ExtractInvoiceDate"
  function="MatchField"
  ordinal="1"
  result="invoice_date">
  <attribute key="regex"
    value="\\d{2}/\\d{2}/\\d{4}"/>
  <attribute key="required"
    value="true"/>
</rule>`}</pre>
                    </div>
                  </>
                )}

                {inspTab === 'Functions' && (
                  <>
                    <Divider label="Function Reference" />
                    <div style={{ borderRadius: 6, margin: '0 10px', border: `1px solid ${C.border2}`,
                      overflow: 'hidden' }}>
                      <KV k="name"     v={selectedNode.fn} mono vc={C.teal} />
                      <KV k="category" v="Extraction" />
                      <KV k="usages"   v="14 rules reference this function" />
                      <KV k="returns"  v="String | null" mono />
                    </div>
                    <Divider label="Referenced By" />
                    <div style={{ borderRadius: 6, margin: '0 10px', border: `1px solid ${C.border2}`,
                      overflow: 'hidden' }}>
                      {['ExtractInvoiceDate', 'CaptureLineRef', 'ExtractVendorCode'].map(n => (
                        <div key={n} style={{ display: 'flex', alignItems: 'center',
                          justifyContent: 'space-between', padding: '5px 10px',
                          borderBottom: `1px solid ${C.border2}`, backgroundColor: C.surface }}>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.text2 }}>{n}</span>
                          <ChevronRight size={10} color={C.text3} />
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {(inspTab === 'Source' || inspTab === 'Diagnostics') && (
                  <div style={{ padding: 16, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', minHeight: 120, gap: 6 }}>
                    <Terminal size={22} color={C.text3} />
                    <span style={{ fontSize: 11, color: C.text3 }}>
                      {inspTab === 'Diagnostics' && selectedNode.status === 'ok'
                        ? 'No diagnostics for this rule.'
                        : 'Select a tab above to inspect.'}
                    </span>
                    {inspTab === 'Diagnostics' && selectedNode.status === 'warn' && (
                      <div style={{ width: '100%', marginTop: 8, borderRadius: 6,
                        border: `1px solid rgba(251,191,36,0.3)`, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                          padding: '8px 10px', backgroundColor: 'rgba(251,191,36,0.08)' }}>
                          <AlertTriangle size={12} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                          <div>
                            <div style={{ fontSize: 11, color: C.amber, fontWeight: 600,
                              marginBottom: 2 }}>Warning</div>
                            <div style={{ fontSize: 10, color: C.text2, lineHeight: 1.6 }}>
                              Regex pattern may be too broad. Consider adding anchors.
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </aside>
          </div>

          {/* ══ BOTTOM DIAGNOSTICS CONSOLE ══════════════════════════════ */}
          <div style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`,
            backgroundColor: C.panel2, overflow: 'hidden',
            height: bottomOpen ? 160 : 32, transition: 'height 0.15s ease' }}>

            {/* Console header */}
            <div style={{ height: 32, display: 'flex', alignItems: 'center',
              padding: '0 14px', gap: 10, borderBottom: bottomOpen ? `1px solid ${C.border}` : 'none',
              cursor: 'pointer' }} onClick={() => setBottomOpen(o => !o)}>
              <Terminal size={12} color={C.text3} />
              <span style={{ fontSize: 11, fontWeight: 600, color: C.text2 }}>Diagnostics</span>
              <div style={{ display: 'flex', gap: 6, marginLeft: 4 }}>
                {errCount > 0 && <Pill color={C.red} n={errCount} label="error" />}
                {warnCount > 0 && <Pill color={C.amber} n={warnCount} label="warn" />}
                <Pill color={C.green} n={1} label="ok" />
              </div>
              <span style={{ marginLeft: 'auto', color: C.text3 }}>
                {bottomOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
              </span>
            </div>

            {/* Console rows */}
            {bottomOpen && (
              <div style={{ overflow: 'auto', height: 128 }}>
                {DIAGNOSTICS.map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '5px 14px', borderBottom: `1px solid ${C.border2}`,
                    fontSize: 11 }}>
                    <span style={{ marginTop: 1, flexShrink: 0 }}><SevIcon sev={d.sev} /></span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.text2, flex: 1 }}>
                      {d.message}
                    </span>
                    {d.scope && <span style={{ fontFamily: MONO, fontSize: 9, color: C.text3,
                      flexShrink: 0, paddingTop: 1 }}>{d.scope}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Pill({ color, n, label }: { color: string; n: number; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10,
      fontFamily: MONO, color, backgroundColor: `${color}18`,
      border: `1px solid ${color}30`, borderRadius: 4, padding: '1px 6px' }}>
      {n} {label}
    </span>
  );
}

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}
