import React, { useState, useMemo } from 'react';
import {
  Search, ChevronRight, ChevronDown, ChevronUp,
  HelpCircle, Moon, Sun, FileText, Layers, GitBranch,
  Database, Code, Hash, AlertTriangle, CheckCircle, XCircle,
  Info, Copy, Download, Shield, Zap, BarChart2, Settings,
  ArrowRight, Eye, Terminal, Package, X, Filter,
  ArrowUpDown, TrendingUp,
} from 'lucide-react';

/* ─── Design tokens ──────────────────────────────────────────────────────── */
const T = {
  /* surface */
  bgBase:      '#0d1117',
  bgPanel:     '#161b22',
  bgPanel2:    '#191f2e',
  bgSurface:   '#1c2333',
  bgSurface2:  '#20293c',
  bgHover:     '#1e2638',
  /* accent */
  accent:      '#2dd4bf',
  accentLo:    'rgba(45,212,191,0.11)',
  accentMid:   'rgba(45,212,191,0.22)',
  accentGlow:  'rgba(45,212,191,0.35)',
  /* text */
  tx1:         '#e2e8f0',
  tx2:         '#8b96aa',
  tx3:         '#4a5568',
  /* semantic */
  green:       '#34d399',  greenLo: 'rgba(52,211,153,0.12)',
  amber:       '#fbbf24',  amberLo: 'rgba(251,191,36,0.12)',
  red:         '#f87171',  redLo:   'rgba(248,113,113,0.12)',
  blue:        '#60a5fa',  blueLo:  'rgba(96,165,250,0.12)',
  violet:      '#a78bfa',  violetLo:'rgba(167,139,250,0.12)',
  /* structure */
  border:      '#252e40',
  border2:     '#1a2130',
  /* type tag */
  tagPage: { bg:'rgba(96,165,250,0.12)',  tx:'#60a5fa' },
  tagUdf:  { bg:'rgba(167,139,250,0.12)', tx:'#a78bfa' },
  tagDoc:  { bg:'rgba(52,211,153,0.12)',  tx:'#34d399' },
};
const MONO = "'JetBrains Mono', ui-monospace, 'Cascadia Code', Menlo, monospace";
const SANS = "Inter, ui-sans-serif, system-ui, sans-serif";

/* ─── Static data ────────────────────────────────────────────────────────── */
interface TreeNode {
  id:string; name:string; fn:string; result:string; ordinal:number;
  guid:string; level:number; status:'ok'|'warn'|'error'; params:number;
  children:TreeNode[];
}
const TREE: TreeNode[] = [
  { id:'r1', name:'ExtractInvoiceDate',  fn:'MatchField',   result:'invoice_date',   ordinal:1,   guid:'a1b2c3d4', level:1, status:'ok',   params:3, children:[
    { id:'r1a', name:'ValidateDateFormat', fn:'RegexCheck',   result:'format_ok',      ordinal:1.1, guid:'e5f6a7b8', level:2, status:'warn', params:1, children:[] },
  ]},
  { id:'r2', name:'ExtractVendorName',   fn:'RegexCapture', result:'vendor_name',    ordinal:2,   guid:'c9d0e1f2', level:1, status:'ok',   params:2, children:[] },
  { id:'r3', name:'ValidateTotal',       fn:'NumericCheck', result:'total_ok',       ordinal:3,   guid:'g3h4i5j6', level:1, status:'warn', params:4, children:[
    { id:'r3a', name:'CheckCurrencyCode', fn:'LookupTable',  result:'currency_ok',   ordinal:3.1, guid:'k7l8m9n0', level:2, status:'ok',   params:2, children:[] },
    { id:'r3b', name:'RoundingVerify',    fn:'NumericCheck', result:'round_ok',      ordinal:3.2, guid:'o1p2q3r4', level:2, status:'ok',   params:1, children:[] },
  ]},
  { id:'r4', name:'CaptureLineRef',      fn:'MatchField',   result:'line_reference', ordinal:4,   guid:'s5t6u7v8', level:1, status:'ok',   params:2, children:[] },
];

const FLAT_RULES: TreeNode[] = [];
function flatten(nodes: TreeNode[]) { nodes.forEach(n => { FLAT_RULES.push(n); flatten(n.children); }); }
flatten(TREE);

const FUNCTIONS = [
  { name:'MatchField',   cat:'Extraction', usages:14, params:'(field, pattern, opts?)', status:'ok'   },
  { name:'RegexCapture', cat:'Extraction', usages:8,  params:'(pattern, group?)',       status:'ok'   },
  { name:'NumericCheck', cat:'Validation', usages:6,  params:'(value, tolerance)',      status:'warn' },
  { name:'LookupTable',  cat:'Reference',  usages:4,  params:'(table, key)',            status:'ok'   },
  { name:'RegexCheck',   cat:'Validation', usages:11, params:'(pattern, flags?)',       status:'ok'   },
  { name:'DateParse',    cat:'Transform',  usages:3,  params:'(value, format)',         status:'ok'   },
];

const SCOPES = [
  { name:'PAGE_INVOICE_HEADER', type:'page', rules:4, warnings:1 },
  { name:'PAGE_LINE_ITEMS',     type:'page', rules:7, warnings:0 },
  { name:'PAGE_FOOTER',         type:'page', rules:2, warnings:0 },
  { name:'DOC_CAPTURE_MAIN',    type:'doc',  rules:11,warnings:2 },
  { name:'UDF_VENDOR_LOOKUP',   type:'udf',  rules:3, warnings:0 },
  { name:'UDF_TAX_CALC',        type:'udf',  rules:2, warnings:0 },
];

const DIAGS = [
  { id:'d1', sev:'warn',  scope:'PAGE_INVOICE_HEADER', rule:'ValidateDateFormat', msg:'Regex pattern may be too broad — consider adding anchors' },
  { id:'d2', sev:'warn',  scope:'PAGE_INVOICE_HEADER', rule:'ValidateTotal',      msg:'Tolerance threshold not set, using default (0.01)' },
  { id:'d3', sev:'info',  scope:'DOC_CAPTURE_MAIN',    rule:'',                  msg:'2 unresolved WFFileRef references detected' },
  { id:'d4', sev:'info',  scope:'',                    rule:'',                  msg:'Parse completed in 142ms · 29 rules · 12 functions · 6 UDFs' },
];

const VIEWS = [
  { id:'overview',    label:'Overview',     icon:BarChart2 },
  { id:'rule-tree',   label:'Rule Tree',    icon:GitBranch },
  { id:'rule-table',  label:'Rule Table',   icon:Layers },
  { id:'functions',   label:'AC Functions', icon:Zap },
  { id:'udfs',        label:'UDFs',         icon:Code },
  { id:'diagnostics', label:'Diagnostics',  icon:AlertTriangle },
  { id:'exports',     label:'Exports',      icon:Package },
];

/* ─── Primitives ─────────────────────────────────────────────────────────── */
function TypeChip({ type }: { type:string }) {
  const s = type==='page'?T.tagPage : type==='udf'?T.tagUdf : T.tagDoc;
  return <span style={{ fontFamily:MONO, fontSize:9, fontWeight:700,
    letterSpacing:'0.08em', textTransform:'uppercase', padding:'2px 5px',
    borderRadius:3, backgroundColor:s.bg, color:s.tx }}>{type}</span>;
}

function SevIcon({ sev }: { sev:string }) {
  if (sev==='error') return <XCircle size={12} color={T.red} />;
  if (sev==='warn')  return <AlertTriangle size={12} color={T.amber} />;
  return <Info size={12} color={T.blue} />;
}

function StatusBadge({ status }: { status:string }) {
  const cfg = status==='ok'
    ? { c:T.green, bg:T.greenLo, label:'OK' }
    : status==='warn'
    ? { c:T.amber, bg:T.amberLo, label:'Warn' }
    : { c:T.red,   bg:T.redLo,   label:'Error' };
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontFamily:MONO,
      fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4,
      backgroundColor:cfg.bg, color:cfg.c }}>
      <span style={{ width:5, height:5, borderRadius:'50%', backgroundColor:cfg.c,
        boxShadow:`0 0 5px ${cfg.c}` }} />
      {cfg.label}
    </span>
  );
}

function Pill({ color, n, label }: { color:string; n:number; label:string }) {
  return <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10,
    fontFamily:MONO, color, backgroundColor:`${color}18`, border:`1px solid ${color}28`,
    borderRadius:4, padding:'1px 6px' }}>{n} {label}</span>;
}

function KV({ k, v, mono, vc }: { k:string; v:string; mono?:boolean; vc?:string }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'96px 1fr',
      padding:'5px 10px', borderBottom:`1px solid ${T.border2}`, alignItems:'start' }}>
      <span style={{ fontFamily:MONO, fontSize:10, color:T.tx3, paddingTop:1 }}>{k}</span>
      <span style={{ fontFamily:mono?MONO:SANS, fontSize:11, color:vc??T.tx2,
        wordBreak:'break-all', lineHeight:1.5 }}>{v}</span>
    </div>
  );
}

function InspSection({ label, children }: { label:string; children:React.ReactNode }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em',
        textTransform:'uppercase', color:T.tx3, padding:'10px 10px 5px' }}>{label}</div>
      <div style={{ borderRadius:6, margin:'0 8px', border:`1px solid ${T.border2}`,
        overflow:'hidden', backgroundColor:T.bgSurface }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Tree row ───────────────────────────────────────────────────────────── */
function TreeRow({ node, depth=0, selectedId, onSelect, expanded, onToggle, searchQ }:{
  node:TreeNode; depth?:number; selectedId:string|null;
  onSelect:(id:string)=>void; expanded:Set<string>;
  onToggle:(id:string)=>void; searchQ:string;
}) {
  const isSelected = node.id === selectedId;
  const isExpanded = expanded.has(node.id);
  const hasKids    = node.children.length > 0;
  const matchSearch = searchQ && node.name.toLowerCase().includes(searchQ.toLowerCase());

  return (
    <>
      <button
        aria-selected={isSelected}
        onClick={() => { onSelect(node.id); if (hasKids) onToggle(node.id); }}
        style={{
          width:'100%', display:'flex', alignItems:'center',
          padding:`7px 10px 7px ${depth*18+10}px`,
          backgroundColor: isSelected ? T.accentLo : matchSearch ? 'rgba(45,212,191,0.05)' : 'transparent',
          borderLeft:`2px solid ${isSelected ? T.accent : 'transparent'}`,
          borderBottom:`1px solid ${T.border2}`,
          textAlign:'left', gap:0, cursor:'pointer',
        }}
      >
        {/* depth guide lines */}
        {depth > 0 && <span style={{ position:'absolute', left:depth*18+8,
          width:1, height:'100%', backgroundColor:T.border2 }} />}

        {/* chevron */}
        <span style={{ width:16, height:16, display:'flex', alignItems:'center',
          justifyContent:'center', flexShrink:0, color:T.tx3 }}>
          {hasKids
            ? (isExpanded ? <ChevronDown size={12}/> : <ChevronRight size={12}/>)
            : <span style={{ width:4, height:4, borderRadius:'50%',
                backgroundColor:T.border, display:'inline-block' }} />}
        </span>

        {/* name */}
        <span style={{ flex:1, minWidth:0, marginLeft:6 }}>
          <span style={{ display:'block', fontFamily:MONO, fontSize:11, fontWeight:isSelected?700:400,
            color: matchSearch ? T.accent : isSelected ? T.tx1 : T.tx2,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {node.name}
          </span>
          <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>
            ord {node.ordinal} · {node.params}p · lvl {node.level}
          </span>
        </span>

        {/* result */}
        <span style={{ fontFamily:MONO, fontSize:10, color:T.accent, width:130,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
          flexShrink:0, paddingRight:8 }}>
          {node.result}
        </span>

        {/* status */}
        <span style={{ flexShrink:0 }}>
          <StatusBadge status={node.status} />
        </span>

        {/* child count */}
        <span style={{ width:28, flexShrink:0, textAlign:'center' }}>
          {hasKids && <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3,
            backgroundColor:T.bgSurface2, borderRadius:3, padding:'1px 5px' }}>
            {node.children.length}
          </span>}
        </span>
      </button>

      {isExpanded && node.children.map(c => (
        <TreeRow key={c.id} node={c} depth={depth+1}
          selectedId={selectedId} onSelect={onSelect}
          expanded={expanded} onToggle={onToggle} searchQ={searchQ} />
      ))}
    </>
  );
}

/* ─── View: Overview ─────────────────────────────────────────────────────── */
function OverviewView({ warnCount, onNav }: { warnCount:number; onNav:(v:string)=>void }) {
  const stats = [
    { label:'Parse Health', value:'Valid', sub:'142ms · fwd.cfd', color:T.green, bg:T.greenLo, icon:<CheckCircle size={18} color={T.green}/> },
    { label:'Rules',        value:'29',    sub:'across 6 scopes',   color:T.blue,  bg:T.blueLo,  icon:<GitBranch size={18} color={T.blue}/> },
    { label:'Functions',    value:'12',    sub:'6 categories',      color:T.accent,bg:T.accentLo,icon:<Zap size={18} color={T.accent}/> },
    { label:'UDFs',         value:'6',     sub:'2 referenced',      color:T.violet,bg:T.violetLo,icon:<Code size={18} color={T.violet}/> },
    { label:'Warnings',     value:String(warnCount), sub:'0 errors', color:warnCount?T.amber:T.green, bg:warnCount?T.amberLo:T.greenLo, icon:<AlertTriangle size={18} color={warnCount?T.amber:T.green}/> },
    { label:'Export Ready', value:'Yes',   sub:'All refs resolved',  color:T.green, bg:T.greenLo, icon:<Package size={18} color={T.green}/> },
  ];
  return (
    <div style={{ padding:20, overflow:'auto', flex:1 }}>
      <div style={{ marginBottom:16 }}>
        <h2 style={{ fontFamily:MONO, fontSize:14, fontWeight:700, color:T.tx1, marginBottom:4 }}>
          Loaded Overview
        </h2>
        <p style={{ fontSize:12, color:T.tx2 }}>fwd.cfd · PAGE_INVOICE_HEADER and 5 more scopes</p>
      </div>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
        {stats.map(s => (
          <div key={s.label} style={{ borderRadius:8, border:`1px solid ${T.border}`,
            backgroundColor:T.bgPanel, padding:'14px 16px', display:'flex',
            flexDirection:'column', gap:10 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:11, color:T.tx2 }}>{s.label}</span>
              <div style={{ padding:6, borderRadius:6, backgroundColor:s.bg }}>{s.icon}</div>
            </div>
            <div>
              <div style={{ fontFamily:MONO, fontSize:22, fontWeight:700, color:s.color,
                lineHeight:1 }}>{s.value}</div>
              <div style={{ fontSize:10, color:T.tx3, marginTop:4 }}>{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Problem areas */}
      <div style={{ borderRadius:8, border:`1px solid ${T.border}`,
        backgroundColor:T.bgPanel, marginBottom:16, overflow:'hidden' }}>
        <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`,
          display:'flex', alignItems:'center', gap:6 }}>
          <AlertTriangle size={13} color={T.amber} />
          <span style={{ fontSize:12, fontWeight:600, color:T.tx1 }}>Problem Areas</span>
          <span style={{ marginLeft:'auto', fontSize:11, color:T.tx2, cursor:'pointer' }}
            onClick={() => onNav('diagnostics')}>
            View all →
          </span>
        </div>
        {DIAGS.filter(d=>d.sev==='warn').map(d => (
          <div key={d.id} style={{ display:'flex', alignItems:'flex-start', gap:10,
            padding:'8px 16px', borderBottom:`1px solid ${T.border2}` }}>
            <SevIcon sev={d.sev} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:11, color:T.tx2 }}>{d.msg}</div>
              {d.scope && <div style={{ fontFamily:MONO, fontSize:9, color:T.tx3,
                marginTop:2 }}>{d.scope} · {d.rule}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Quick navigation */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
        {[
          { label:'Open Rule Tree', icon:<GitBranch size={13}/>, view:'rule-tree' },
          { label:'Browse Functions', icon:<Zap size={13}/>, view:'functions' },
          { label:'Rule Table', icon:<Layers size={13}/>, view:'rule-table' },
          { label:'Full Diagnostics', icon:<Terminal size={13}/>, view:'diagnostics' },
        ].map(item => (
          <button key={item.label} onClick={() => onNav(item.view)}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px',
              borderRadius:6, border:`1px solid ${T.border}`, backgroundColor:T.bgSurface,
              fontSize:12, color:T.tx2, textAlign:'left', cursor:'pointer' }}>
            <span style={{ color:T.tx3 }}>{item.icon}</span>
            {item.label}
            <ArrowRight size={11} style={{ marginLeft:'auto' }} color={T.tx3} />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── View: Rule Table ───────────────────────────────────────────────────── */
function RuleTableView({ selectedId, onSelect }: { selectedId:string|null; onSelect:(id:string)=>void }) {
  const [sortCol, setSortCol] = useState<string>('ordinal');
  const cols = ['Name','Ordinal','Level','Function','Result','Status'];
  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <div style={{ padding:'10px 18px', borderBottom:`1px solid ${T.border}`,
        display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, backgroundColor:T.bgSurface,
          border:`1px solid ${T.border}`, borderRadius:5, padding:'4px 10px', flex:1, maxWidth:320 }}>
          <Search size={11} color={T.tx3} />
          <input placeholder="Filter rules…" style={{ fontSize:11, color:T.tx2,
            background:'none', border:'none', outline:'none', width:'100%' }} />
        </div>
        <span style={{ fontSize:11, color:T.tx3, fontFamily:MONO }}>
          {FLAT_RULES.length} rules
        </span>
      </div>
      <div style={{ flex:1, overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
          <thead>
            <tr style={{ backgroundColor:T.bgPanel, position:'sticky', top:0, zIndex:2 }}>
              {cols.map(c => (
                <th key={c} onClick={() => setSortCol(c.toLowerCase())}
                  style={{ padding:'7px 12px', textAlign:'left', fontFamily:MONO, fontSize:9,
                    fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase',
                    color: sortCol===c.toLowerCase() ? T.accent : T.tx3,
                    borderBottom:`1px solid ${T.border}`, cursor:'pointer', whiteSpace:'nowrap' }}>
                  <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                    {c}
                    <ArrowUpDown size={9} color={sortCol===c.toLowerCase()?T.accent:T.tx3} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FLAT_RULES.map((r, i) => {
              const sel = r.id === selectedId;
              return (
                <tr key={r.id} onClick={() => onSelect(r.id)}
                  style={{ backgroundColor: sel ? T.accentLo : i%2===0 ? 'transparent' : T.bgPanel2+'60',
                    borderLeft:`2px solid ${sel ? T.accent : 'transparent'}`,
                    cursor:'pointer' }}>
                  <td style={{ padding:'7px 12px', borderBottom:`1px solid ${T.border2}`,
                    fontFamily:MONO, fontSize:11, color: sel ? T.tx1 : T.tx2, fontWeight:sel?600:400 }}>
                    {r.name}
                  </td>
                  <td style={{ padding:'7px 12px', borderBottom:`1px solid ${T.border2}`,
                    fontFamily:MONO, fontSize:11, color:T.tx3 }}>{r.ordinal}</td>
                  <td style={{ padding:'7px 12px', borderBottom:`1px solid ${T.border2}`,
                    fontFamily:MONO, fontSize:11, color:T.tx3 }}>{r.level}</td>
                  <td style={{ padding:'7px 12px', borderBottom:`1px solid ${T.border2}`,
                    fontFamily:MONO, fontSize:11, color:T.accent }}>{r.fn}</td>
                  <td style={{ padding:'7px 12px', borderBottom:`1px solid ${T.border2}`,
                    fontFamily:MONO, fontSize:11, color:T.tx2 }}>{r.result}</td>
                  <td style={{ padding:'7px 12px', borderBottom:`1px solid ${T.border2}` }}>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── View: Functions ────────────────────────────────────────────────────── */
function FunctionsView() {
  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <div style={{ padding:'10px 18px', borderBottom:`1px solid ${T.border}`,
        display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, backgroundColor:T.bgSurface,
          border:`1px solid ${T.border}`, borderRadius:5, padding:'4px 10px', flex:1, maxWidth:320 }}>
          <Search size={11} color={T.tx3} />
          <input placeholder="Search functions…" style={{ fontSize:11, color:T.tx2,
            background:'none', border:'none', outline:'none', width:'100%' }} />
        </div>
        {['All','Extraction','Validation','Reference','Transform'].map(f => (
          <button key={f} style={{ fontSize:10, padding:'3px 8px', borderRadius:4,
            border:`1px solid ${f==='All'?T.accent:T.border}`,
            backgroundColor:f==='All'?T.accentLo:'transparent',
            color:f==='All'?T.accent:T.tx3, cursor:'pointer' }}>{f}</button>
        ))}
      </div>
      <div style={{ flex:1, overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
          <thead>
            <tr style={{ backgroundColor:T.bgPanel, position:'sticky', top:0 }}>
              {['Name','Category','Usages','Signature','Status'].map(c => (
                <th key={c} style={{ padding:'7px 12px', textAlign:'left', fontFamily:MONO,
                  fontSize:9, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase',
                  color:T.tx3, borderBottom:`1px solid ${T.border}` }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FUNCTIONS.map((f, i) => (
              <tr key={f.name}
                style={{ backgroundColor:i%2===0?'transparent':T.bgPanel2+'60', cursor:'pointer' }}>
                <td style={{ padding:'7px 12px', borderBottom:`1px solid ${T.border2}`,
                  fontFamily:MONO, fontSize:11, color:T.accent }}>{f.name}</td>
                <td style={{ padding:'7px 12px', borderBottom:`1px solid ${T.border2}`,
                  fontSize:11, color:T.tx2 }}>{f.cat}</td>
                <td style={{ padding:'7px 12px', borderBottom:`1px solid ${T.border2}`,
                  fontFamily:MONO, fontSize:11, color:T.tx3 }}>{f.usages}</td>
                <td style={{ padding:'7px 12px', borderBottom:`1px solid ${T.border2}`,
                  fontFamily:MONO, fontSize:10, color:T.tx3 }}>{f.params}</td>
                <td style={{ padding:'7px 12px', borderBottom:`1px solid ${T.border2}` }}>
                  <StatusBadge status={f.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── View: Diagnostics ──────────────────────────────────────────────────── */
function DiagnosticsView() {
  const [filter, setFilter] = useState('all');
  const shown = filter==='all' ? DIAGS : DIAGS.filter(d=>d.sev===filter);
  return (
    <div style={{ flex:1, overflow:'auto', padding:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
        {['all','error','warn','info'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontSize:10, padding:'3px 9px', borderRadius:4,
              border:`1px solid ${filter===f?T.accent:T.border}`,
              backgroundColor:filter===f?T.accentLo:'transparent',
              color:filter===f?T.accent:T.tx3, cursor:'pointer',
              fontFamily:MONO, textTransform:'uppercase', letterSpacing:'0.06em' }}>{f}</button>
        ))}
        <span style={{ fontSize:11, color:T.tx3, fontFamily:MONO, marginLeft:4 }}>
          {shown.length} items
        </span>
      </div>
      <div style={{ borderRadius:8, border:`1px solid ${T.border}`, overflow:'hidden' }}>
        {shown.map((d, i) => (
          <div key={d.id} style={{ display:'flex', alignItems:'flex-start', gap:10,
            padding:'10px 14px', borderBottom:i<shown.length-1?`1px solid ${T.border2}`:'none',
            backgroundColor: d.sev==='warn'?T.amberLo : d.sev==='error'?T.redLo : 'transparent' }}>
            <span style={{ marginTop:1, flexShrink:0 }}><SevIcon sev={d.sev} /></span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, color:T.tx1, marginBottom:3 }}>{d.msg}</div>
              {d.scope && <div style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>
                {d.scope}{d.rule ? ` · ${d.rule}` : ''}
              </div>}
            </div>
            <button style={{ padding:4, borderRadius:4, color:T.tx3 }}
              title="Copy"><Copy size={11} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Inspector ──────────────────────────────────────────────────────────── */
function Inspector({ selectedId, inspTab, setInspTab }: {
  selectedId:string|null; inspTab:string; setInspTab:(t:string)=>void;
}) {
  const node = selectedId ? findNode(TREE, selectedId) : null;
  const TABS = ['Summary','Evidence','Attributes','Functions','Children','Source','Diagnostics'];

  return (
    <aside aria-label="Evidence Inspector"
      style={{ width:348, flexShrink:0, backgroundColor:T.bgPanel,
        borderLeft:`1px solid ${T.border}`, display:'flex',
        flexDirection:'column', overflow:'hidden' }}>

      {/* header */}
      <div style={{ padding:'12px 14px 0', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        {node ? (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <div style={{ width:26, height:26, borderRadius:5, display:'flex',
                alignItems:'center', justifyContent:'center',
                backgroundColor:T.accentLo, border:`1px solid ${T.accentGlow}` }}>
                <Eye size={12} color={T.accent} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:MONO, fontSize:12, fontWeight:700, color:T.tx1,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {node.name}
                </div>
                <div style={{ fontSize:9, fontFamily:MONO, textTransform:'uppercase',
                  letterSpacing:'0.07em', color:T.tx3, marginTop:1 }}>
                  Extraction Rule · ord {node.ordinal} · lvl {node.level}
                </div>
              </div>
              <StatusBadge status={node.status} />
            </div>
            <div style={{ display:'flex', overflowX:'auto', gap:0 }}>
              {TABS.map(tab => (
                <button key={tab} onClick={() => setInspTab(tab)}
                  aria-selected={inspTab===tab}
                  style={{ padding:'5px 8px', fontSize:10, whiteSpace:'nowrap',
                    fontWeight:inspTab===tab?600:400,
                    color:inspTab===tab?T.accent:T.tx3,
                    borderBottom:`2px solid ${inspTab===tab?T.accent:'transparent'}`,
                    marginBottom:-1, cursor:'pointer' }}>{tab}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ padding:'8px 0 14px', fontSize:12, color:T.tx3 }}>
            Evidence Inspector
          </div>
        )}
      </div>

      {/* body */}
      <div style={{ flex:1, overflow:'auto' }}>
        {!node ? (
          /* ── Empty state ── */
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', height:'100%', padding:24, gap:12, textAlign:'center' }}>
            <div style={{ width:48, height:48, borderRadius:12, display:'flex',
              alignItems:'center', justifyContent:'center',
              backgroundColor:T.bgSurface, border:`1px solid ${T.border}` }}>
              <Eye size={20} color={T.tx3} />
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:T.tx2, marginBottom:6 }}>
                Nothing selected
              </div>
              <div style={{ fontSize:11, color:T.tx3, lineHeight:1.6 }}>
                Select a rule, function, UDF, or diagnostic to inspect its evidence.
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4, width:'100%', marginTop:4 }}>
              {[
                { label:'Open Rule Tree', icon:<GitBranch size={11}/> },
                { label:'View Diagnostics', icon:<AlertTriangle size={11}/> },
                { label:'Browse Functions', icon:<Zap size={11}/> },
              ].map(a => (
                <button key={a.label} style={{ display:'flex', alignItems:'center', gap:8,
                  padding:'7px 10px', borderRadius:5, border:`1px solid ${T.border}`,
                  backgroundColor:T.bgSurface, fontSize:11, color:T.tx3, cursor:'pointer',
                  textAlign:'left' }}>
                  <span style={{ color:T.tx3 }}>{a.icon}</span>{a.label}
                </button>
              ))}
            </div>
          </div>
        ) : inspTab==='Summary' ? (
          <>
            <InspSection label="Identity">
              <KV k="name"    v={node.name}            mono vc={T.tx1} />
              <KV k="guid"    v={node.guid}            mono vc={T.blue} />
              <KV k="ordinal" v={String(node.ordinal)} mono />
              <KV k="level"   v={String(node.level)}   mono />
              <KV k="fn"      v={node.fn}              mono vc={T.accent} />
              <KV k="result"  v={node.result}          mono />
              <KV k="params"  v={`${node.params} parameters`} />
            </InspSection>
            {node.children.length > 0 && (
              <InspSection label={`Children (${node.children.length})`}>
                {node.children.map(c => (
                  <div key={c.id} style={{ display:'flex', alignItems:'center',
                    justifyContent:'space-between', padding:'6px 10px',
                    borderBottom:`1px solid ${T.border2}` }}>
                    <span style={{ fontFamily:MONO, fontSize:10, color:T.tx2 }}>{c.name}</span>
                    <StatusBadge status={c.status} />
                  </div>
                ))}
              </InspSection>
            )}
            <InspSection label="Quick Actions">
              {[
                { icon:<Copy size={11}/>,       label:'Copy GUID' },
                { icon:<ArrowRight size={11}/>, label:'Go to function definition' },
                { icon:<Eye size={11}/>,        label:'View in Rule Table' },
                { icon:<Download size={11}/>,   label:'Export rule as JSON' },
              ].map(a => (
                <button key={a.label} style={{ width:'100%', display:'flex', alignItems:'center',
                  gap:8, padding:'7px 10px', borderBottom:`1px solid ${T.border2}`,
                  fontSize:11, color:T.tx2, cursor:'pointer', textAlign:'left' }}>
                  <span style={{ color:T.tx3 }}>{a.icon}</span>{a.label}
                </button>
              ))}
            </InspSection>
          </>
        ) : inspTab==='Attributes' ? (
          <InspSection label="Attributes">
            {[
              ['regex',      String.raw`\d{2}/\d{2}/\d{4}`],
              ['ignoreCase', 'true'],
              ['required',   'true'],
              ['confidence', '0.85'],
              ['multiLine',  'false'],
            ].map(([k, v]) => (
              <div key={k} style={{ display:'grid', gridTemplateColumns:'96px 1fr',
                padding:'5px 10px', borderBottom:`1px solid ${T.border2}`, alignItems:'start' }}>
                <span style={{ fontFamily:MONO, fontSize:10, color:T.accent }}>{k}</span>
                <span style={{ fontFamily:MONO, fontSize:11, color:T.tx2,
                  wordBreak:'break-all' }}>{v}</span>
              </div>
            ))}
          </InspSection>
        ) : inspTab==='Evidence' ? (
          <InspSection label="Source Evidence">
            <div style={{ padding:'5px 10px', borderBottom:`1px solid ${T.border2}`,
              fontFamily:MONO, fontSize:9, color:T.tx3 }}>
              fwd.cfd · PAGE_INVOICE_HEADER · line 142
            </div>
            <pre style={{ padding:'10px 12px', fontFamily:MONO, fontSize:10,
              lineHeight:1.8, color:T.tx2, backgroundColor:'#080c12',
              overflowX:'auto', margin:0 }}>{`<rule id="rule_001"
  name="ExtractInvoiceDate"
  function="MatchField"
  ordinal="1"
  result="invoice_date">
  <attribute key="regex"
    value="\\d{2}/\\d{2}/\\d{4}"/>
  <attribute key="required"
    value="true"/>
</rule>`}</pre>
          </InspSection>
        ) : inspTab==='Functions' ? (
          <>
            <InspSection label="Function Reference">
              <KV k="name"     v={node.fn}   mono vc={T.accent} />
              <KV k="category" v="Extraction" />
              <KV k="usages"   v="14 rules" />
              <KV k="returns"  v="String | null" mono />
            </InspSection>
            <InspSection label="Referenced By">
              {['ExtractInvoiceDate','CaptureLineRef','ExtractVendorCode'].map(n => (
                <div key={n} style={{ display:'flex', alignItems:'center',
                  justifyContent:'space-between', padding:'5px 10px',
                  borderBottom:`1px solid ${T.border2}` }}>
                  <span style={{ fontFamily:MONO, fontSize:10, color:T.tx2 }}>{n}</span>
                  <ChevronRight size={10} color={T.tx3} />
                </div>
              ))}
            </InspSection>
          </>
        ) : inspTab==='Children' ? (
          node.children.length === 0 ? (
            <div style={{ padding:20, textAlign:'center', color:T.tx3, fontSize:11 }}>
              No child rules.
            </div>
          ) : (
            <InspSection label={`${node.children.length} children`}>
              {node.children.map(c => (
                <div key={c.id} style={{ padding:'8px 10px', borderBottom:`1px solid ${T.border2}` }}>
                  <div style={{ fontFamily:MONO, fontSize:11, color:T.tx2, marginBottom:3 }}>{c.name}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>
                      ord {c.ordinal} · {c.fn}
                    </span>
                    <StatusBadge status={c.status} />
                  </div>
                </div>
              ))}
            </InspSection>
          )
        ) : inspTab==='Diagnostics' ? (
          node.status==='ok' ? (
            <div style={{ padding:24, textAlign:'center', display:'flex', flexDirection:'column',
              alignItems:'center', gap:8 }}>
              <CheckCircle size={20} color={T.green} />
              <span style={{ fontSize:11, color:T.tx2 }}>No diagnostics for this rule.</span>
            </div>
          ) : (
            <InspSection label="Warnings">
              <div style={{ padding:'10px', display:'flex', alignItems:'flex-start', gap:8 }}>
                <AlertTriangle size={12} color={T.amber} style={{ flexShrink:0, marginTop:1 }} />
                <div>
                  <div style={{ fontSize:11, color:T.amber, fontWeight:600, marginBottom:3 }}>Warning</div>
                  <div style={{ fontSize:10, color:T.tx2, lineHeight:1.6 }}>
                    Regex pattern may be too broad. Consider adding anchors (^ and $).
                  </div>
                </div>
              </div>
            </InspSection>
          )
        ) : (
          /* Source tab */
          <InspSection label="Source Location">
            <KV k="file"   v="fwd.cfd" mono />
            <KV k="scope"  v="PAGE_INVOICE_HEADER" mono />
            <KV k="line"   v="142" mono />
            <KV k="offset" v="5840" mono />
          </InspSection>
        )}
      </div>
    </aside>
  );
}

/* ─── Root ───────────────────────────────────────────────────────────────── */
export function DarkPro() {
  const [activeView,  setActiveView]  = useState('overview');
  const [activeScope, setActiveScope] = useState('PAGE_INVOICE_HEADER');
  const [selectedId,  setSelectedId]  = useState<string|null>(null);
  const [inspTab,     setInspTab]     = useState('Summary');
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set(['r1','r3']));
  const [bottomOpen,  setBottomOpen]  = useState(true);
  const [treeSearch,  setTreeSearch]  = useState('');

  function toggleExpanded(id:string) {
    setExpanded(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  }
  function expandAll() {
    setExpanded(new Set(FLAT_RULES.map(r=>r.id)));
  }

  const warnCount  = DIAGS.filter(d=>d.sev==='warn').length;
  const errCount   = DIAGS.filter(d=>d.sev==='error').length;
  const activeViewLabel = VIEWS.find(v=>v.id===activeView)?.label ?? '';

  return (
    <div role="application" aria-label="AC Rule Workbench"
      style={{ width:'100vw', height:'100vh', display:'flex', flexDirection:'column',
        overflow:'hidden', backgroundColor:T.bgBase, color:T.tx1, fontFamily:SANS, fontSize:13 }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}
        ::-webkit-scrollbar-thumb:hover{background:#3a4560}
        button{background:none;border:none;cursor:pointer;color:inherit;font-family:inherit}
        input{background:none;border:none;outline:none;color:inherit;font-family:inherit}
        button:focus-visible,a:focus-visible{outline:2px solid ${T.accent};outline-offset:2px;border-radius:4px}
        @media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
        tr:hover td{background-color:${T.bgHover}!important}
      `}</style>

      {/* ══ TOP COMMAND BAR ═══════════════════════════════════════════════ */}
      <header role="banner"
        style={{ height:56, flexShrink:0, display:'flex', alignItems:'center',
          padding:'0 16px', borderBottom:`1px solid ${T.border}`,
          backgroundColor:T.bgPanel, gap:12, zIndex:20 }}>

        {/* Brand */}
        <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <div style={{ width:28, height:28, borderRadius:6, display:'flex', alignItems:'center',
            justifyContent:'center', backgroundColor:T.accentLo, border:`1px solid ${T.accentGlow}` }}>
            <span style={{ fontFamily:MONO, fontSize:10, fontWeight:700, color:T.accent }}>AC</span>
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:600, letterSpacing:'-0.01em' }}>AC Rule Workbench</div>
            <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:1 }}>
              <FileText size={9} color={T.tx3} />
              <span style={{ fontFamily:MONO, fontSize:9, color:T.tx2 }}>fwd.cfd</span>
              <span style={{ fontSize:9, color:T.tx3 }}>·</span>
              <span style={{ display:'inline-flex', alignItems:'center', gap:3,
                backgroundColor:T.greenLo, border:`1px solid ${T.green}28`,
                borderRadius:4, padding:'1px 5px' }}>
                <CheckCircle size={7} color={T.green} />
                <span style={{ fontFamily:MONO, fontSize:8, color:T.green }}>Parse OK</span>
              </span>
              {warnCount>0 && <span style={{ display:'inline-flex', alignItems:'center', gap:3,
                backgroundColor:T.amberLo, border:`1px solid ${T.amber}28`,
                borderRadius:4, padding:'1px 5px' }}>
                <AlertTriangle size={7} color={T.amber} />
                <span style={{ fontFamily:MONO, fontSize:8, color:T.amber }}>{warnCount}w</span>
              </span>}
            </div>
          </div>
        </div>

        {/* Global search */}
        <div style={{ flex:1, maxWidth:520 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, backgroundColor:T.bgBase,
            border:`1px solid ${T.border}`, borderRadius:6, padding:'0 10px', height:32 }}>
            <Search size={12} color={T.tx3} />
            <input type="search" aria-label="Global search"
              placeholder="Search rules, functions, UDFs, GUIDs, attributes…"
              style={{ flex:1, fontSize:12, color:T.tx1 }} />
            <span style={{ fontFamily:MONO, fontSize:10, color:T.tx3, border:`1px solid ${T.border}`,
              borderRadius:3, padding:'1px 5px', flexShrink:0 }}>⌘K</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
          <button aria-label="Validate" style={{ display:'flex', alignItems:'center', gap:5,
            padding:'5px 10px', borderRadius:5, fontSize:11, fontWeight:500,
            backgroundColor:T.accentLo, border:`1px solid ${T.accentGlow}`, color:T.accent }}>
            <Shield size={12}/> Validate
          </button>
          <button aria-label="Export" style={{ display:'flex', alignItems:'center', gap:5,
            padding:'5px 10px', borderRadius:5, fontSize:11, fontWeight:500,
            backgroundColor:T.bgSurface, border:`1px solid ${T.border}`, color:T.tx2 }}>
            <Download size={12}/> Export
          </button>
          <div style={{ width:1, height:20, backgroundColor:T.border, margin:'0 2px' }} />
          <button aria-label="Settings" style={{ padding:6, borderRadius:5, color:T.tx3 }}><Settings size={14}/></button>
          <button aria-label="Help"     style={{ padding:6, borderRadius:5, color:T.tx3 }}><HelpCircle size={14}/></button>
          <button aria-label="Toggle theme" style={{ padding:6, borderRadius:5, color:T.tx3 }}><Moon size={14}/></button>
        </div>
      </header>

      {/* ══ BODY ══════════════════════════════════════════════════════════ */}
      <div style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>

        {/* ── LEFT NAVIGATION ───────────────────────────────────────────── */}
        <nav aria-label="Primary navigation"
          style={{ width:268, flexShrink:0, backgroundColor:T.bgPanel,
            borderRight:`1px solid ${T.border}`, display:'flex',
            flexDirection:'column', overflow:'hidden' }}>

          {/* A. Loaded source */}
          <div style={{ padding:'10px 12px', borderBottom:`1px solid ${T.border}`,
            backgroundColor:T.bgPanel2 }}>
            <div style={{ fontFamily:MONO, fontSize:9, fontWeight:700, letterSpacing:'0.1em',
              textTransform:'uppercase', color:T.tx3, marginBottom:7 }}>Loaded Source</div>
            <div style={{ fontFamily:MONO, fontSize:11, color:T.tx2, marginBottom:7,
              display:'flex', alignItems:'center', gap:5 }}>
              <FileText size={11} color={T.tx3} /> fwd.cfd
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'3px 10px', marginBottom:5 }}>
              {[['Rules','29'],['Functions','12'],['UDFs','6'],['Warnings',String(warnCount)]].map(([k,v]) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:10 }}>
                  <span style={{ color:T.tx3 }}>{k}</span>
                  <span style={{ fontFamily:MONO, fontWeight:600,
                    color:k==='Warnings'&&parseInt(v)?T.amber:T.tx2 }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize:9, fontFamily:MONO, color:T.tx3 }}>142ms · 3 days ago</div>
          </div>

          {/* B. Primary views */}
          <div style={{ padding:'7px 8px', borderBottom:`1px solid ${T.border}` }}>
            {VIEWS.map(v => {
              const active = v.id===activeView;
              const Icon = v.icon;
              return (
                <button key={v.id} onClick={() => setActiveView(v.id)}
                  aria-current={active?'page':undefined}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:8,
                    padding:'6px 8px', borderRadius:5, marginBottom:1, textAlign:'left',
                    backgroundColor:active?T.accentLo:'transparent',
                    borderLeft:`2px solid ${active?T.accent:'transparent'}`,
                    color:active?T.tx1:T.tx2, fontSize:12, transition:'background 0.1s' }}>
                  <Icon size={13} color={active?T.accent:T.tx3} />
                  <span style={{ flex:1 }}>{v.label}</span>
                  {v.id==='diagnostics'&&warnCount>0 &&
                    <span style={{ fontFamily:MONO, fontSize:9, backgroundColor:T.amberLo,
                      color:T.amber, borderRadius:3, padding:'1px 4px' }}>{warnCount}</span>}
                </button>
              );
            })}
          </div>

          {/* C. Object index */}
          <div style={{ flex:1, overflow:'auto', padding:'7px 8px' }}>
            <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase',
              color:T.tx3, marginBottom:6, paddingLeft:4 }}>Object Index</div>
            {SCOPES.map(scope => {
              const active = scope.name===activeScope;
              return (
                <button key={scope.name} onClick={() => setActiveScope(scope.name)}
                  aria-pressed={active}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:7,
                    padding:'6px 8px', borderRadius:5, marginBottom:2, textAlign:'left',
                    backgroundColor:active?T.accentLo:'transparent',
                    borderLeft:`2px solid ${active?T.accent:'transparent'}` }}>
                  <span style={{ color:active?T.accent:T.tx3, flexShrink:0 }}>
                    {scope.type==='udf'?<Code size={12}/>:scope.type==='doc'?<Hash size={12}/>:<FileText size={12}/>}
                  </span>
                  <span style={{ fontFamily:MONO, fontSize:10, color:active?T.tx1:T.tx2, flex:1,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {scope.name}
                  </span>
                  <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                    {scope.warnings>0 && <AlertTriangle size={9} color={T.amber}/>}
                    <TypeChip type={scope.type} />
                    <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>{scope.rules}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </nav>

        {/* ── CENTER + RIGHT COLUMN ─────────────────────────────────────── */}
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>

            {/* ── MAIN WORK SURFACE ──────────────────────────────────────── */}
            <main role="main" aria-label={activeViewLabel}
              style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', backgroundColor:T.bgBase }}>

              {/* View header */}
              <div style={{ padding:'11px 18px 0', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:7 }}>
                  <span style={{ fontSize:10, color:T.tx3 }}>{activeViewLabel}</span>
                  {activeView!=='overview' && <>
                    <ChevronRight size={11} color={T.tx3}/>
                    <span style={{ fontFamily:MONO, fontSize:10, color:T.accent }}>{activeScope}</span>
                    <TypeChip type={SCOPES.find(s=>s.name===activeScope)?.type??'page'} />
                  </>}
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <h2 style={{ fontFamily:MONO, fontSize:14, fontWeight:700, color:T.tx1 }}>
                    {activeViewLabel}
                  </h2>
                  {activeView==='rule-tree' && (
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6,
                        backgroundColor:T.bgSurface, border:`1px solid ${T.border}`,
                        borderRadius:5, padding:'3px 8px' }}>
                        <Search size={10} color={T.tx3} />
                        <input aria-label="Search tree" placeholder="Search tree…"
                          value={treeSearch} onChange={e => setTreeSearch(e.target.value)}
                          style={{ fontSize:11, width:130, color:T.tx1 }} />
                        {treeSearch && <button onClick={() => setTreeSearch('')}
                          aria-label="Clear search">
                          <X size={10} color={T.tx3} />
                        </button>}
                      </div>
                      <button onClick={expandAll}
                        style={{ fontSize:11, color:T.tx2, padding:'3px 8px', borderRadius:4,
                          border:`1px solid ${T.border}`, backgroundColor:T.bgSurface }}>
                        Expand all
                      </button>
                      <button onClick={() => setExpanded(new Set())}
                        style={{ fontSize:11, color:T.tx2, padding:'3px 8px', borderRadius:4,
                          border:`1px solid ${T.border}`, backgroundColor:T.bgSurface }}>
                        Collapse
                      </button>
                    </div>
                  )}
                </div>
                {/* Tree column headers */}
                {activeView==='rule-tree' && (
                  <div style={{ display:'grid',
                    gridTemplateColumns:'16px 1fr 130px 72px 28px',
                    padding:'0 10px 6px', fontFamily:MONO, fontSize:9, fontWeight:700,
                    letterSpacing:'0.08em', textTransform:'uppercase', color:T.tx3, gap:6 }}>
                    <span/>
                    <span>Rule Name</span>
                    <span>Result</span>
                    <span>Status</span>
                    <span>Ch</span>
                  </div>
                )}
              </div>

              {/* View body */}
              {activeView==='overview' && (
                <OverviewView warnCount={warnCount} onNav={setActiveView} />
              )}
              {activeView==='rule-tree' && (
                <div style={{ flex:1, overflow:'auto' }}>
                  {TREE.map(node => (
                    <TreeRow key={node.id} node={node} depth={0}
                      selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setInspTab('Summary'); }}
                      expanded={expanded} onToggle={toggleExpanded} searchQ={treeSearch} />
                  ))}
                </div>
              )}
              {activeView==='rule-table' && (
                <RuleTableView selectedId={selectedId}
                  onSelect={(id) => { setSelectedId(id); setInspTab('Summary'); }} />
              )}
              {activeView==='functions' && <FunctionsView />}
              {activeView==='diagnostics' && <DiagnosticsView />}
              {(activeView==='udfs'||activeView==='exports') && (
                <div style={{ flex:1, display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center', gap:10, color:T.tx3 }}>
                  <Package size={28} color={T.tx3} />
                  <span style={{ fontSize:12 }}>
                    {activeView==='udfs' ? 'UDF inventory' : 'Export review'} view — coming soon
                  </span>
                </div>
              )}
            </main>

            {/* ── RIGHT INSPECTOR ────────────────────────────────────────── */}
            <Inspector selectedId={selectedId} inspTab={inspTab} setInspTab={setInspTab} />
          </div>

          {/* ══ BOTTOM DIAGNOSTICS CONSOLE ═══════════════════════════════ */}
          <div role="complementary" aria-label="Diagnostics console"
            style={{ flexShrink:0, borderTop:`1px solid ${T.border}`,
              backgroundColor:T.bgPanel2, overflow:'hidden',
              height:bottomOpen?164:32, transition:'height 0.15s ease' }}>

            <div style={{ height:32, display:'flex', alignItems:'center', padding:'0 14px',
              gap:10, borderBottom:bottomOpen?`1px solid ${T.border}`:'none', cursor:'pointer' }}
              onClick={() => setBottomOpen(o=>!o)}
              role="button" aria-expanded={bottomOpen} aria-controls="diag-body"
              tabIndex={0} onKeyDown={e=>e.key==='Enter'&&setBottomOpen(o=>!o)}>
              <Terminal size={12} color={T.tx3} />
              <span style={{ fontSize:11, fontWeight:600, color:T.tx2 }}>Diagnostics</span>
              <div style={{ display:'flex', gap:5, marginLeft:4 }}>
                {errCount>0  && <Pill color={T.red}   n={errCount}  label="error" />}
                {warnCount>0 && <Pill color={T.amber} n={warnCount} label="warn"  />}
                <Pill color={T.green} n={2} label="info" />
              </div>
              <span style={{ marginLeft:'auto', color:T.tx3 }}>
                {bottomOpen ? <ChevronDown size={13}/> : <ChevronUp size={13}/>}
              </span>
            </div>

            {bottomOpen && (
              <div id="diag-body" style={{ overflow:'auto', height:132 }}>
                {DIAGS.map(d => (
                  <div key={d.id} style={{ display:'flex', alignItems:'flex-start', gap:8,
                    padding:'5px 14px', borderBottom:`1px solid ${T.border2}` }}>
                    <span style={{ marginTop:1, flexShrink:0 }}><SevIcon sev={d.sev}/></span>
                    <span style={{ fontFamily:MONO, fontSize:10, color:T.tx2, flex:1,
                      lineHeight:1.6 }}>{d.msg}</span>
                    {d.scope && <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3,
                      flexShrink:0, paddingTop:1 }}>{d.scope}</span>}
                    <button aria-label="Copy diagnostic" style={{ padding:'2px 4px',
                      borderRadius:3, color:T.tx3 }}><Copy size={10}/></button>
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

function findNode(nodes:TreeNode[], id:string): TreeNode|null {
  for (const n of nodes) {
    if (n.id===id) return n;
    const f = findNode(n.children, id);
    if (f) return f;
  }
  return null;
}
