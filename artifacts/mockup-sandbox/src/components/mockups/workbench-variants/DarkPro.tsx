import React, { useState, useMemo } from 'react';
import {
  Search, FileText, GitBranch, Database, Code, Hash,
  AlertTriangle, CheckCircle, XCircle, Info, Copy, Download,
  Zap, Settings, Eye, Terminal, Package, X,
  ChevronRight, ChevronDown, Layers, BarChart2,
  ZoomIn, ZoomOut, Maximize2, HelpCircle, Moon,
  Plus, Filter, Clock, MoreHorizontal, ChevronUp,
  RefreshCw, Shield, FolderOpen, Folder, Image,
  ArrowRight, List, Grid3X3, AlignLeft, Binary,
} from 'lucide-react';

/* ─── Design tokens ──────────────────────────────────────────────────────── */
const T = {
  bgBase:     '#0d1117',
  bgPanel:    '#161b22',
  bgPanel2:   '#191f2e',
  bgSurface:  '#1c2333',
  bgSurface2: '#20293c',
  bgHover:    '#1e2638',
  accent:     '#2dd4bf',
  accentLo:   'rgba(45,212,191,0.11)',
  accentMid:  'rgba(45,212,191,0.22)',
  accentGlow: 'rgba(45,212,191,0.35)',
  tx1:        '#e2e8f0',
  tx2:        '#8b96aa',
  tx3:        '#4a5568',
  green:      '#34d399', greenLo:  'rgba(52,211,153,0.12)',
  amber:      '#fbbf24', amberLo:  'rgba(251,191,36,0.12)',
  red:        '#f87171', redLo:    'rgba(248,113,113,0.12)',
  blue:       '#60a5fa', blueLo:   'rgba(96,165,250,0.12)',
  violet:     '#a78bfa', violetLo: 'rgba(167,139,250,0.12)',
  border:     '#252e40',
  border2:    '#1a2130',
};
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const SANS = "Inter, ui-sans-serif, system-ui, sans-serif";

/* ─── Static data ────────────────────────────────────────────────────────── */
interface FwdNode {
  id: string;
  kind: 'root'|'group'|'page'|'pageVariant'|'field'|'document'|'batch'
       |'process'|'resourceType'|'resource'|'diagnosticGroup'|'diagnostic'|'rawNode';
  label: string;
  meta?: string;
  warn?: number; err?: number;
  children?: FwdNode[];
  tabKind?: TabKind;
}

const FWD_TREE: FwdNode[] = [{
  id:'root', kind:'root', label:'fwd.cfd', meta:'Read-only · 142ms',
  children:[
    { id:'pages', kind:'group', label:'Pages', meta:'3',
      children:[
        { id:'page-inv', kind:'page', label:'PAGE_INVOICE_HEADER', warn:1, tabKind:'page',
          children:[
            { id:'page-inv-vars', kind:'group', label:'Variants', meta:'2',
              children:[
                { id:'var-default', kind:'pageVariant', label:'Default', tabKind:'variant' },
                { id:'var-alt1',    kind:'pageVariant', label:'Alt1',    tabKind:'variant' },
              ]},
            { id:'page-inv-flds', kind:'group', label:'Fields', meta:'4',
              children:[
                { id:'fld-date',   kind:'field', label:'InvoiceDate' },
                { id:'fld-vendor', kind:'field', label:'VendorName' },
                { id:'fld-total',  kind:'field', label:'Total', warn:1 },
                { id:'fld-line',   kind:'field', label:'LineRef' },
              ]},
          ]},
        { id:'page-line',   kind:'page', label:'PAGE_LINE_ITEMS',  tabKind:'page' },
        { id:'page-footer', kind:'page', label:'PAGE_FOOTER',       tabKind:'page' },
      ]},
    { id:'documents', kind:'group', label:'Documents', meta:'1',
      children:[
        { id:'doc-main', kind:'document', label:'DOC_CAPTURE_MAIN', warn:2, tabKind:'document' },
      ]},
    { id:'batches', kind:'group', label:'Batches', meta:'1',
      children:[
        { id:'batch-std', kind:'batch', label:'BATCH_STANDARD', tabKind:'batch' },
      ]},
    { id:'processes', kind:'group', label:'Processes', meta:'3',
      children:[
        { id:'proc-ac',  kind:'process', label:'AC',  tabKind:'process' },
        { id:'proc-fip', kind:'process', label:'FIP', tabKind:'process' },
        { id:'proc-ocr', kind:'process', label:'OCR', tabKind:'process' },
      ]},
    { id:'resources', kind:'group', label:'Resources', meta:'3 types',
      children:[
        { id:'res-tables',   kind:'resourceType', label:'Tables',    meta:'0' },
        { id:'res-functions',kind:'resourceType', label:'Functions', meta:'2',
          children:[
            { id:'res-fn-vendor', kind:'resource', label:'VendorLookup', tabKind:'resource' },
            { id:'res-fn-tax',    kind:'resource', label:'TaxCalc',       tabKind:'resource' },
          ]},
        { id:'res-filerefs', kind:'resourceType', label:'Filerefs',  meta:'0' },
        { id:'res-rules',    kind:'resourceType', label:'Rule DLL',  meta:'1' },
        { id:'res-dateformat',kind:'resourceType',label:'DateFormat', meta:'0' },
      ]},
    { id:'diagnostics', kind:'diagnosticGroup', label:'Diagnostics', warn:2, tabKind:'diagnostics',
      children:[
        { id:'diag-1', kind:'diagnostic', label:'Regex pattern may be too broad',    warn:1 },
        { id:'diag-2', kind:'diagnostic', label:'Tolerance threshold uses default',  warn:1 },
        { id:'diag-3', kind:'diagnostic', label:'2 unresolved WFFileRef references', warn:1 },
      ]},
    { id:'raw', kind:'rawNode', label:'Raw Nodes', tabKind:'raw',
      children:[
        { id:'raw-root',      kind:'rawNode', label:'/Root' },
        { id:'raw-processes', kind:'rawNode', label:'/Root/Processes' },
        { id:'raw-resources', kind:'rawNode', label:'/Root/Resources' },
      ]},
  ],
}];

const FIELDS = [
  { id:'fld-date',   name:'InvoiceDate', type:'Date',    x:42,  y:88,  w:162, h:26, src:'OCR', rules:3, warn:0 },
  { id:'fld-vendor', name:'VendorName',  type:'String',  x:42,  y:128, w:210, h:26, src:'OCR', rules:2, warn:0 },
  { id:'fld-total',  name:'Total',       type:'Numeric', x:330, y:88,  w:120, h:26, src:'OCR', rules:4, warn:1 },
  { id:'fld-line',   name:'LineRef',     type:'String',  x:42,  y:178, w:138, h:26, src:'DB',  rules:2, warn:0 },
];

const RAW_CHILDREN = [
  { name:'AC',         size:'4.2 KB', type:'Collection' },
  { name:'FIP',        size:'1.8 KB', type:'Collection' },
  { name:'OCR',        size:'2.1 KB', type:'Collection' },
  { name:'Store',      size:'0.9 KB', type:'Collection' },
  { name:'Inventory',  size:'0.4 KB', type:'Blob' },
];

const HEX_ROWS = [
  { off:'0000', bytes:'3C 72 75 6C 65 20 69 64 3D 22 72 75 6C 65 5F 30', ascii:'<rule id="rule_0' },
  { off:'0010', bytes:'30 31 22 20 6E 61 6D 65 3D 22 45 78 74 72 61 63', ascii:'01" name="Extrac' },
  { off:'0020', bytes:'74 49 6E 76 6F 69 63 65 44 61 74 65 22 20 66 6E', ascii:'tInvoiceDate" fn' },
  { off:'0030', bytes:'3D 22 4D 61 74 63 68 46 69 65 6C 64 22 20 6F 72', ascii:'="MatchField" or' },
  { off:'0040', bytes:'64 69 6E 61 6C 3D 22 31 22 20 72 65 73 75 6C 74', ascii:'dinal="1" result' },
  { off:'0050', bytes:'3D 22 69 6E 76 6F 69 63 65 5F 64 61 74 65 22 3E', ascii:'="invoice_date">' },
];

const MESSAGES = [
  { id:'m1', sev:'info',  src:'parser',  msg:'Parse completed in 142ms · 29 rules · 12 functions · 6 UDFs', ts:'09:14:02' },
  { id:'m2', sev:'warn',  src:'rules',   msg:'PAGE_INVOICE_HEADER / ValidateDateFormat — Regex pattern may be too broad', ts:'09:14:02' },
  { id:'m3', sev:'warn',  src:'rules',   msg:'PAGE_INVOICE_HEADER / ValidateTotal — Tolerance threshold not set (default 0.01)', ts:'09:14:02' },
  { id:'m4', sev:'info',  src:'resource',msg:'2 unresolved WFFileRef references detected in DOC_CAPTURE_MAIN', ts:'09:14:02' },
];

const RECENT = [
  { label:'PAGE_INVOICE_HEADER', kind:'page',     path:'/pages/PAGE_INVOICE_HEADER', ts:'Just now' },
  { label:'DOC_CAPTURE_MAIN',    kind:'document',  path:'/documents/DOC_CAPTURE_MAIN', ts:'3 min ago' },
  { label:'VendorLookup',        kind:'resource',  path:'/resources/Functions/VendorLookup', ts:'1 hr ago' },
  { label:'BATCH_STANDARD',      kind:'batch',     path:'/batches/BATCH_STANDARD', ts:'Yesterday' },
];

/* Phase 2 static data */
const DOC_PAGES = [
  { name:'PAGE_INVOICE_HEADER', variants:2, fields:4, warn:1 },
  { name:'PAGE_LINE_ITEMS',     variants:1, fields:6, warn:0 },
  { name:'PAGE_FOOTER',         variants:1, fields:2, warn:0 },
];
const DOC_FIELDS = [
  { name:'doc_id',      type:'String',  src:'DB',  bound:'DOC_CAPTURE_MAIN' },
  { name:'capture_date',type:'Date',    src:'OCR', bound:'DOC_CAPTURE_MAIN' },
  { name:'vendor_id',   type:'String',  src:'DB',  bound:'DOC_CAPTURE_MAIN' },
  { name:'total_amount',type:'Numeric', src:'OCR', bound:'DOC_CAPTURE_MAIN' },
];
const DOC_DIAGS = [
  { sev:'warn', msg:'2 unresolved WFFileRef references', src:'resource' },
  { sev:'info', msg:'DOC_CAPTURE_MAIN references 3 pages across 1 batch', src:'parser' },
];
const BATCH_DOCS_TREE = [
  { name:'DOC_CAPTURE_MAIN', pages:['PAGE_INVOICE_HEADER','PAGE_LINE_ITEMS','PAGE_FOOTER'], warn:2 },
];
const BATCH_META = [
  ['name','BATCH_STANDARD'], ['documents','1'], ['pages','3 (via docs)'],
  ['processes','2'], ['AC process','configured'], ['Store process','configured'],
];
const WHERE_USED = [
  { consumer:'ValidateDateFormat', objType:'rule',    path:'/pages/PAGE_INVOICE_HEADER/AC', refMode:'direct',  warn:1 },
  { consumer:'ValidateTotal',      objType:'rule',    path:'/pages/PAGE_INVOICE_HEADER/AC', refMode:'direct',  warn:0 },
  { consumer:'DOC_CAPTURE_MAIN',   objType:'document',path:'/documents/DOC_CAPTURE_MAIN',  refMode:'indirect',warn:0 },
  { consumer:'CaptureLineRef',     objType:'rule',    path:'/pages/PAGE_LINE_ITEMS/AC',     refMode:'direct',  warn:0 },
];
const SEARCH_INDEX = [
  { label:'PAGE_INVOICE_HEADER', kind:'page',     sub:'3 variants · 4 fields' },
  { label:'PAGE_LINE_ITEMS',     kind:'page',     sub:'1 variant · 6 fields' },
  { label:'PAGE_FOOTER',         kind:'page',     sub:'1 variant · 2 fields' },
  { label:'DOC_CAPTURE_MAIN',    kind:'document', sub:'3 pages · 2 warnings' },
  { label:'BATCH_STANDARD',      kind:'batch',    sub:'1 document' },
  { label:'VendorLookup',        kind:'resource', sub:'Functions · 4 usages' },
  { label:'TaxCalc',             kind:'resource', sub:'Functions · 2 usages' },
  { label:'ValidateDateFormat',  kind:'page',     sub:'Rule · PAGE_INVOICE_HEADER/AC' },
  { label:'MatchField',          kind:'resource', sub:'Function · 14 usages' },
  { label:'RegexCapture',        kind:'resource', sub:'Function · 8 usages' },
];

/* ─── Tab types ──────────────────────────────────────────────────────────── */
type TabKind = 'overview'|'page'|'document'|'batch'|'resource'|'raw'
             | 'rule'|'process'|'variant'|'diagnostics';
interface WorkspaceTab { id:string; kind:TabKind; label:string; nodeId?:string }

/* ─── Phase 3 static data ───────────────────────────────────────────────── */
interface RuleNode {
  id:string; name:string; fn:string; ordinal:number; level:number;
  status:'ok'|'warn'|'error'; disabled:boolean;
  statuses:Array<{ord:number;tok:string;desc:string;action:string;target?:string}>;
  fields:string[]; attrs:Record<string,string>; children:RuleNode[];
}
const RULE_NODES: RuleNode[] = [
  { id:'rn1', name:'ExtractInvoiceDate', fn:'MatchField', ordinal:1, level:1,
    status:'ok', disabled:false,
    statuses:[
      {ord:1,tok:'MATCH',   desc:'Pattern matched',       action:'none'},
      {ord:2,tok:'NOMATCH', desc:'Pattern did not match', action:'reject'},
    ],
    fields:['InvoiceDate'], attrs:{regex:'\\d{2}/\\d{2}/\\d{4}',required:'true'},
    children:[
      { id:'rn1a', name:'ValidateDateFormat', fn:'RegexCheck', ordinal:1.1, level:2,
        status:'warn', disabled:false,
        statuses:[
          {ord:1,tok:'OK',   desc:'Format valid',   action:'none'},
          {ord:2,tok:'FAIL', desc:'Format invalid', action:'reject'},
        ],
        fields:['InvoiceDate'], attrs:{pattern:'^\\d{2}/\\d{2}/\\d{4}$'},
        children:[] },
    ]},
  { id:'rn2', name:'ExtractVendorName', fn:'RegexCapture', ordinal:2, level:1,
    status:'ok', disabled:false,
    statuses:[
      {ord:1,tok:'MATCH',   desc:'Vendor captured',       action:'none'},
      {ord:2,tok:'NOMATCH', desc:'Vendor not found',      action:'subrule', target:'FallbackVendor'},
    ],
    fields:['VendorName'], attrs:{pattern:'(?i)([A-Z][a-z]+ (?:Inc|LLC|Corp))'},
    children:[] },
  { id:'rn3', name:'ValidateTotal', fn:'NumericCheck', ordinal:3, level:1,
    status:'warn', disabled:false,
    statuses:[
      {ord:1,tok:'VALID',   desc:'Total is valid',    action:'none'},
      {ord:2,tok:'INVALID', desc:'Total is invalid',  action:'reject'},
      {ord:3,tok:'MISSING', desc:'Total field empty', action:'reject'},
    ],
    fields:['Total'], attrs:{tolerance:'0.01',allowNeg:'false'},
    children:[
      { id:'rn3a', name:'CheckCurrencyCode', fn:'LookupTable', ordinal:3.1, level:2,
        status:'ok', disabled:false,
        statuses:[
          {ord:1,tok:'FOUND',    desc:'Code in table',    action:'none'},
          {ord:2,tok:'NOTFOUND', desc:'Code not in table',action:'reject'},
        ],
        fields:[], attrs:{table:'CURRENCY_CODES',key:'currency'},
        children:[] },
    ]},
  { id:'rn4', name:'CaptureLineRef', fn:'MatchField', ordinal:4, level:1,
    status:'ok', disabled:true,
    statuses:[
      {ord:1,tok:'MATCH',   desc:'Ref found',  action:'none'},
      {ord:2,tok:'NOMATCH', desc:'Ref absent', action:'none'},
    ],
    fields:['LineRef'], attrs:{},
    children:[] },
];

const PROCESS_SCOPES = [
  { scope:'System',       obj:'(global)',              configured:false, refs:0,  rules:0,  warn:0 },
  { scope:'Batch',        obj:'BATCH_STANDARD',        configured:true,  refs:2,  rules:0,  warn:0 },
  { scope:'Document',     obj:'DOC_CAPTURE_MAIN',      configured:true,  refs:8,  rules:5,  warn:1 },
  { scope:'Page',         obj:'PAGE_INVOICE_HEADER',   configured:true,  refs:12, rules:29, warn:2 },
  { scope:'Page',         obj:'PAGE_LINE_ITEMS',       configured:true,  refs:7,  rules:11, warn:0 },
  { scope:'Page',         obj:'PAGE_FOOTER',           configured:false, refs:0,  rules:0,  warn:0 },
  { scope:'Page Variant', obj:'Default',               configured:true,  refs:3,  rules:4,  warn:0 },
  { scope:'Resource',     obj:'VendorLookup',          configured:true,  refs:4,  rules:0,  warn:0 },
];
const PROC_LINKED_RES = [
  { name:'VendorLookup', type:'Function', refs:4 },
  { name:'TaxCalc',      type:'Function', refs:2 },
  { name:'CURRENCY_CODES',type:'Table',  refs:1 },
];
const PROC_REVERSE_REFS = [
  { label:'4 rules reference AC directly',       kind:'rule' },
  { label:'3 pages bind AC as primary process',  kind:'page' },
  { label:'1 document declares AC scope',        kind:'document' },
];

const DROPOUT_REGIONS = [
  { id:'d1', name:'HeaderBackground', x:0,  y:0,  w:100, h:14, color:'#3b82f6', process:'FIP' },
  { id:'d2', name:'FooterLine',       x:0,  y:86, w:100, h:8,  color:'#6366f1', process:'FIP' },
  { id:'d3', name:'SideMargin',       x:0,  y:14, w:4,   h:72, color:'#3b82f6', process:'FIP' },
];
const OMR_FIELDS = [
  { name:'SignatureBox',  x:13, y:62, w:10, h:6, type:'checkbox', threshold:0.7 },
  { name:'ApprovalMark', x:13, y:70, w:10, h:6, type:'checkbox', threshold:0.6 },
];

const DIAG_FULL = [
  { id:'df1', sev:'warn', source:'rules',
    title:'Regex too broad',
    msg:'ValidateDateFormat: Regex pattern may be too broad — consider adding anchors (^ and $)',
    path:'/pages/PAGE_INVOICE_HEADER/AC/ValidateDateFormat', ts:'09:14:02' },
  { id:'df2', sev:'warn', source:'rules',
    title:'Tolerance default in use',
    msg:'ValidateTotal: Tolerance threshold not explicitly set, using default (0.01)',
    path:'/pages/PAGE_INVOICE_HEADER/AC/ValidateTotal', ts:'09:14:02' },
  { id:'df3', sev:'info', source:'resource',
    title:'Unresolved refs',
    msg:'2 unresolved WFFileRef references detected in DOC_CAPTURE_MAIN',
    path:'/documents/DOC_CAPTURE_MAIN', ts:'09:14:02' },
  { id:'df4', sev:'info', source:'parser',
    title:'Parse complete',
    msg:'Parse completed in 142ms · 29 rules · 12 functions · 6 UDFs resolved',
    path:'', ts:'09:14:02' },
];

/* ─── Primitives ─────────────────────────────────────────────────────────── */
function SevIcon({ sev, size=12 }:{ sev:string; size?:number }) {
  if (sev==='error') return <XCircle size={size} color={T.red} />;
  if (sev==='warn')  return <AlertTriangle size={size} color={T.amber} />;
  return <Info size={size} color={T.blue} />;
}

function Tag({ label, color, bg }:{ label:string; color:string; bg:string }) {
  return <span style={{ fontFamily:MONO, fontSize:9, fontWeight:700, letterSpacing:'0.07em',
    textTransform:'uppercase', padding:'2px 5px', borderRadius:3, color, backgroundColor:bg }}>
    {label}</span>;
}

function KindTag({ kind }:{ kind:string }) {
  const cfg: Record<string,{c:string;bg:string}> = {
    page:     { c:T.blue,   bg:T.blueLo },
    document: { c:T.violet, bg:T.violetLo },
    batch:    { c:T.amber,  bg:T.amberLo },
    process:  { c:T.accent, bg:T.accentLo },
    resource: { c:T.green,  bg:T.greenLo },
    field:    { c:T.tx2,    bg:T.bgSurface2 },
    raw:      { c:T.tx3,    bg:T.bgSurface },
  };
  const s = cfg[kind] ?? { c:T.tx3, bg:T.bgSurface };
  return <Tag label={kind} color={s.c} bg={s.bg} />;
}

function WarnBadge({ n, err }:{ n?:number; err?:number }) {
  if (err) return <span style={{ fontFamily:MONO, fontSize:9, backgroundColor:T.redLo,
    color:T.red, borderRadius:3, padding:'1px 5px' }}>{err}e</span>;
  if (n)   return <span style={{ fontFamily:MONO, fontSize:9, backgroundColor:T.amberLo,
    color:T.amber, borderRadius:3, padding:'1px 5px' }}>{n}w</span>;
  return null;
}

function SectionLabel({ children }:{ children:React.ReactNode }) {
  return <div style={{ fontFamily:MONO, fontSize:9, fontWeight:700, letterSpacing:'0.1em',
    textTransform:'uppercase', color:T.tx3, padding:'8px 10px 4px' }}>{children}</div>;
}

/* ─── Node icon ──────────────────────────────────────────────────────────── */
function NodeIcon({ kind, size=12, active=false }:{ kind:string; size?:number; active?:boolean }) {
  const c = active ? T.accent : T.tx3;
  switch(kind) {
    case 'root':          return <Database size={size} color={c} />;
    case 'group':         return <Folder size={size} color={c} />;
    case 'page':          return <FileText size={size} color={active?T.blue:T.tx3} />;
    case 'pageVariant':   return <Image size={size} color={active?T.accent:T.tx3} />;
    case 'field':         return <AlignLeft size={size} color={active?T.violet:T.tx3} />;
    case 'document':      return <Layers size={size} color={active?T.violet:T.tx3} />;
    case 'batch':         return <Package size={size} color={active?T.amber:T.tx3} />;
    case 'process':       return <Zap size={size} color={active?T.accent:T.tx3} />;
    case 'resourceType':  return <FolderOpen size={size} color={c} />;
    case 'resource':      return <Grid3X3 size={size} color={active?T.green:T.tx3} />;
    case 'diagnosticGroup':return <Terminal size={size} color={active?T.amber:T.tx3} />;
    case 'diagnostic':    return <AlertTriangle size={size} color={T.amber} />;
    case 'rawNode':       return <Binary size={size} color={active?T.violet:T.tx3} />;
    case 'rule':          return <Braces size={size} color={active?T.amber:T.tx3} />;
    case 'variant':       return <Image size={size} color={active?T.accent:T.tx3} />;
    case 'diagnostics':   return <Terminal size={size} color={active?T.red:T.tx3} />;
    default:              return <FileText size={size} color={c} />;
  }
}

/* ─── FWD Tree ───────────────────────────────────────────────────────────── */
function TreeNode({ node, depth, selected, onSelect, expanded, onToggle, onOpen }:{
  node:FwdNode; depth:number; selected:string|null;
  onSelect:(id:string)=>void; expanded:Set<string>;
  onToggle:(id:string)=>void; onOpen:(node:FwdNode)=>void;
}) {
  const isSelected = node.id === selected;
  const isExpanded = expanded.has(node.id);
  const hasKids    = (node.children?.length ?? 0) > 0;

  return (
    <>
      <button
        onClick={() => { onSelect(node.id); if (hasKids) onToggle(node.id); }}
        onDoubleClick={() => node.tabKind && onOpen(node)}
        title={node.tabKind ? `Double-click to open in tab` : undefined}
        style={{
          width:'100%', display:'flex', alignItems:'center',
          padding:`4px 8px 4px ${depth*14+8}px`,
          backgroundColor: isSelected ? T.accentLo : 'transparent',
          borderLeft:`2px solid ${isSelected?T.accent:'transparent'}`,
          textAlign:'left', cursor:'pointer', gap:0, minHeight:26,
        }}>
        <span style={{ width:14, flexShrink:0, display:'flex', alignItems:'center',
          justifyContent:'center', color:T.tx3 }}>
          {hasKids
            ? (isExpanded ? <ChevronDown size={10}/> : <ChevronRight size={10}/>)
            : <span style={{ width:3, height:3, borderRadius:'50%', backgroundColor:T.border2,
                display:'inline-block' }} />}
        </span>
        <span style={{ marginLeft:4, flexShrink:0 }}>
          <NodeIcon kind={node.kind} size={11} active={isSelected} />
        </span>
        <span style={{ flex:1, minWidth:0, marginLeft:5, display:'flex',
          alignItems:'center', gap:5 }}>
          <span style={{ fontFamily: node.kind==='group'||node.kind==='root'?SANS:MONO,
            fontSize: node.kind==='root'?11:10,
            fontWeight: isSelected?600:node.kind==='root'?600:400,
            color: isSelected?T.tx1:node.kind==='root'?T.tx1:T.tx2,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {node.label}
          </span>
          {node.meta && <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>
            {node.meta}
          </span>}
        </span>
        <span style={{ display:'flex', alignItems:'center', gap:3, flexShrink:0 }}>
          <WarnBadge n={node.warn} err={node.err} />
          {node.tabKind && isSelected &&
            <span onClick={e=>{e.stopPropagation();onOpen(node);}} title="Open in tab"
              style={{ padding:'1px 3px', borderRadius:3, color:T.tx3, display:'flex',
              alignItems:'center', opacity:0.8 }}>
              <ArrowRight size={9}/>
            </span>}
        </span>
      </button>
      {isExpanded && node.children?.map(c =>
        <TreeNode key={c.id} node={c} depth={depth+1}
          selected={selected} onSelect={onSelect}
          expanded={expanded} onToggle={onToggle} onOpen={onOpen} />
      )}
    </>
  );
}

/* ─── Top Command Bar ────────────────────────────────────────────────────── */
function TopCommandBar({ warnCount, errCount, onSearch }:{ warnCount:number; errCount:number; onSearch:()=>void }) {
  return (
    <header style={{ height:48, flexShrink:0, display:'flex', alignItems:'center',
      padding:'0 14px', borderBottom:`1px solid ${T.border}`,
      backgroundColor:T.bgPanel, gap:10, zIndex:20 }}>
      {/* Brand */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0, marginRight:4 }}>
        <div style={{ width:26, height:26, borderRadius:5, display:'flex', alignItems:'center',
          justifyContent:'center', backgroundColor:T.accentLo, border:`1px solid ${T.accentGlow}` }}>
          <span style={{ fontFamily:MONO, fontSize:9, fontWeight:700, color:T.accent }}>FW</span>
        </div>
        <div>
          <div style={{ fontSize:12, fontWeight:600, letterSpacing:'-0.01em', color:T.tx1 }}>
            FormWorks Editor
          </div>
          <div style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>fwd.cfd</div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ width:1, height:20, backgroundColor:T.border }} />

      {/* DB commands */}
      <div style={{ display:'flex', alignItems:'center', gap:2, flexShrink:0 }}>
        <button style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 8px',
          borderRadius:4, fontSize:11, color:T.tx2, border:`1px solid ${T.border}`,
          backgroundColor:T.bgSurface }}>
          <FolderOpen size={11} color={T.tx3}/> Open DB
        </button>
        <button style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 8px',
          borderRadius:4, fontSize:11, color:T.tx3 }}>
          <Clock size={11}/> Recent
        </button>
        <button style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 8px',
          borderRadius:4, fontSize:11, color:T.tx3 }}>
          <RefreshCw size={11}/> Reload
        </button>
      </div>

      <div style={{ width:1, height:20, backgroundColor:T.border }} />

      {/* Global search */}
      <div style={{ flex:1, maxWidth:440 }}>
        <div onClick={onSearch} style={{ display:'flex', alignItems:'center', gap:6,
          backgroundColor:T.bgBase, border:`1px solid ${T.border}`, borderRadius:5,
          padding:'0 10px', height:28, cursor:'text' }}>
          <Search size={11} color={T.tx3} />
          <span style={{ flex:1, fontSize:11, color:T.tx3 }}>
            Search objects, GUIDs, rules, attributes…
          </span>
          <span style={{ fontFamily:MONO, fontSize:10, color:T.tx3, border:`1px solid ${T.border}`,
            borderRadius:3, padding:'0px 4px', flexShrink:0 }}>⌘K</span>
        </div>
      </div>

      {/* Session status */}
      <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, marginLeft:'auto' }}>
        <span style={{ display:'inline-flex', alignItems:'center', gap:3,
          backgroundColor:T.greenLo, border:`1px solid ${T.green}28`,
          borderRadius:4, padding:'2px 6px' }}>
          <CheckCircle size={8} color={T.green} />
          <span style={{ fontFamily:MONO, fontSize:9, color:T.green }}>Loaded</span>
        </span>
        {warnCount>0 && <span style={{ display:'inline-flex', alignItems:'center', gap:3,
          backgroundColor:T.amberLo, border:`1px solid ${T.amber}28`,
          borderRadius:4, padding:'2px 6px' }}>
          <AlertTriangle size={8} color={T.amber} />
          <span style={{ fontFamily:MONO, fontSize:9, color:T.amber }}>{warnCount}w</span>
        </span>}
        <div style={{ width:1, height:18, backgroundColor:T.border }} />
        <button style={{ padding:5, borderRadius:4, color:T.tx3 }}><Settings size={13}/></button>
        <button style={{ padding:5, borderRadius:4, color:T.tx3 }}><HelpCircle size={13}/></button>
        <button style={{ padding:5, borderRadius:4, color:T.tx3 }}><Moon size={13}/></button>
      </div>
    </header>
  );
}

/* ─── Left Explorer Pane ─────────────────────────────────────────────────── */
function LeftExplorerPane({ selected, expanded, onSelect, onToggle, onOpen }:{
  selected:string|null; expanded:Set<string>;
  onSelect:(id:string)=>void; onToggle:(id:string)=>void; onOpen:(n:FwdNode)=>void;
}) {
  const [q, setQ] = useState('');
  return (
    <nav style={{ width:262, flexShrink:0, backgroundColor:T.bgPanel,
      borderRight:`1px solid ${T.border}`, display:'flex',
      flexDirection:'column', overflow:'hidden' }}>
      {/* Filter */}
      <div style={{ padding:'7px 8px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:5, backgroundColor:T.bgSurface,
          border:`1px solid ${T.border}`, borderRadius:4, padding:'3px 8px' }}>
          <Search size={10} color={T.tx3} />
          <input value={q} onChange={e=>setQ(e.target.value)}
            placeholder="Filter tree…"
            style={{ fontSize:10, color:T.tx2, flex:1 }} />
        </div>
      </div>
      {/* Tree */}
      <div style={{ flex:1, overflow:'auto' }}>
        {FWD_TREE.map(n =>
          <TreeNode key={n.id} node={n} depth={0}
            selected={selected} onSelect={onSelect}
            expanded={expanded} onToggle={onToggle} onOpen={onOpen} />
        )}
      </div>
    </nav>
  );
}

/* ─── Workspace Tab Strip ────────────────────────────────────────────────── */
function TabStrip({ tabs, activeId, onActivate, onClose, onNew }:{
  tabs:WorkspaceTab[]; activeId:string|null;
  onActivate:(id:string)=>void; onClose:(id:string)=>void; onNew:()=>void;
}) {
  const icons: Record<TabKind,React.ReactNode> = {
    overview: <BarChart2 size={10}/>,
    page:     <FileText size={10}/>,
    document: <Layers size={10}/>,
    batch:    <Package size={10}/>,
    resource: <Grid3X3 size={10}/>,
    raw:      <Binary size={10}/>,
  };
  return (
    <div style={{ height:34, flexShrink:0, display:'flex', alignItems:'stretch',
      borderBottom:`1px solid ${T.border}`, backgroundColor:T.bgBase, paddingLeft:4 }}>
      {tabs.map(tab => {
        const active = tab.id===activeId;
        return (
          <div key={tab.id}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'0 10px',
              borderRight:`1px solid ${T.border}`,
              backgroundColor:active?T.bgPanel:T.bgBase,
              borderBottom:`2px solid ${active?T.accent:'transparent'}`,
              cursor:'pointer', flexShrink:0, maxWidth:170 }}
            onClick={()=>onActivate(tab.id)}>
            <span style={{ color:active?T.accent:T.tx3, flexShrink:0 }}>{icons[tab.kind]}</span>
            <span style={{ fontFamily:MONO, fontSize:10, color:active?T.tx1:T.tx2,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
              {tab.label}
            </span>
            {tab.kind!=='overview' &&
              <span onClick={e=>{e.stopPropagation();onClose(tab.id);}}
                style={{ color:T.tx3, display:'flex', alignItems:'center',
                  padding:2, borderRadius:3, flexShrink:0 }}>
                <X size={9}/>
              </span>}
          </div>
        );
      })}
      <button onClick={onNew}
        style={{ padding:'0 10px', color:T.tx3, display:'flex', alignItems:'center' }}>
        <Plus size={11}/>
      </button>
    </div>
  );
}

/* ─── View: Overview ─────────────────────────────────────────────────────── */
function OverviewView({ onOpen }:{ onOpen:(kind:TabKind,label:string)=>void }) {
  const counts = [
    { label:'Pages',      value:'3',  icon:<FileText size={15} color={T.blue}/>,   color:T.blue },
    { label:'Documents',  value:'1',  icon:<Layers size={15} color={T.violet}/>,   color:T.violet },
    { label:'Batches',    value:'1',  icon:<Package size={15} color={T.amber}/>,   color:T.amber },
    { label:'Processes',  value:'3',  icon:<Zap size={15} color={T.accent}/>,      color:T.accent },
    { label:'Resources',  value:'7',  icon:<Grid3X3 size={15} color={T.green}/>,   color:T.green },
    { label:'Warnings',   value:'2',  icon:<AlertTriangle size={15} color={T.amber}/>, color:T.amber },
  ];
  return (
    <div style={{ flex:1, overflow:'auto', padding:18 }}>
      {/* FWD Metadata */}
      <div style={{ borderRadius:7, border:`1px solid ${T.border}`, backgroundColor:T.bgPanel,
        padding:'12px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Database size={16} color={T.accent} />
          <div>
            <div style={{ fontFamily:MONO, fontSize:12, fontWeight:700, color:T.tx1 }}>fwd.cfd</div>
            <div style={{ fontFamily:MONO, fontSize:9, color:T.tx3, marginTop:2 }}>
              FormWorks Database · Release 4.2.1 · 2024-01-15
            </div>
          </div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:3,
            backgroundColor:T.greenLo, borderRadius:4, padding:'3px 8px' }}>
            <CheckCircle size={9} color={T.green} />
            <span style={{ fontFamily:MONO, fontSize:9, color:T.green }}>Parse OK · 142ms</span>
          </span>
          <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3,
            backgroundColor:T.bgSurface, border:`1px solid ${T.border}`,
            borderRadius:4, padding:'3px 8px' }}>Read-only</span>
        </div>
      </div>

      {/* Counts strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8, marginBottom:14 }}>
        {counts.map(c => (
          <div key={c.label} style={{ borderRadius:6, border:`1px solid ${T.border}`,
            backgroundColor:T.bgPanel, padding:'10px 12px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
              marginBottom:6 }}>
              {c.icon}
              <span style={{ fontFamily:MONO, fontSize:17, fontWeight:700, color:c.color }}>
                {c.value}
              </span>
            </div>
            <div style={{ fontSize:10, color:T.tx3 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Recent objects + Diagnostics */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        {/* Recent */}
        <div style={{ borderRadius:7, border:`1px solid ${T.border}`,
          backgroundColor:T.bgPanel, overflow:'hidden' }}>
          <div style={{ padding:'9px 14px', borderBottom:`1px solid ${T.border}`,
            display:'flex', alignItems:'center', gap:6 }}>
            <Clock size={12} color={T.tx3}/>
            <span style={{ fontSize:11, fontWeight:600, color:T.tx1 }}>Recent Objects</span>
          </div>
          {RECENT.map(r => (
            <div key={r.label} style={{ display:'flex', alignItems:'center', gap:8,
              padding:'7px 14px', borderBottom:`1px solid ${T.border2}`, cursor:'pointer' }}
              onClick={()=>onOpen(r.kind as TabKind, r.label)}>
              <NodeIcon kind={r.kind} size={11}/>
              <span style={{ fontFamily:MONO, fontSize:10, color:T.tx2, flex:1,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.label}</span>
              <KindTag kind={r.kind} />
              <span style={{ fontSize:9, color:T.tx3, flexShrink:0 }}>{r.ts}</span>
            </div>
          ))}
        </div>

        {/* Diagnostics summary */}
        <div style={{ borderRadius:7, border:`1px solid ${T.border}`,
          backgroundColor:T.bgPanel, overflow:'hidden' }}>
          <div style={{ padding:'9px 14px', borderBottom:`1px solid ${T.border}`,
            display:'flex', alignItems:'center', gap:6 }}>
            <Terminal size={12} color={T.amber}/>
            <span style={{ fontSize:11, fontWeight:600, color:T.tx1 }}>Diagnostics</span>
            <span style={{ marginLeft:'auto', fontFamily:MONO, fontSize:9,
              backgroundColor:T.amberLo, color:T.amber, borderRadius:3,
              padding:'1px 5px' }}>2 warnings</span>
          </div>
          {MESSAGES.filter(m=>m.sev==='warn').map(m => (
            <div key={m.id} style={{ display:'flex', alignItems:'flex-start', gap:8,
              padding:'7px 14px', borderBottom:`1px solid ${T.border2}` }}>
              <SevIcon sev={m.sev} size={11}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:10, color:T.tx2, lineHeight:1.5 }}>{m.msg}</div>
                <div style={{ fontFamily:MONO, fontSize:9, color:T.tx3, marginTop:2 }}>
                  {m.src}
                </div>
              </div>
            </div>
          ))}
          <div style={{ padding:'7px 14px' }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
              <SevIcon sev="info" size={11}/>
              <div style={{ fontSize:10, color:T.tx2 }}>2 unresolved WFFileRef references</div>
            </div>
          </div>
        </div>
      </div>

      {/* Relationship summary */}
      <div style={{ borderRadius:7, border:`1px solid ${T.border}`, backgroundColor:T.bgPanel,
        padding:'10px 14px', marginTop:12 }}>
        <div style={{ fontSize:11, fontWeight:600, color:T.tx1, marginBottom:8,
          display:'flex', alignItems:'center', gap:6 }}>
          <GitBranch size={12} color={T.tx3}/> Relationship Summary
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
          {[
            ['DOC_CAPTURE_MAIN', '→ 3 pages', 'document'],
            ['BATCH_STANDARD',   '→ 1 doc',   'batch'],
            ['AC process',       '→ 3 scopes', 'process'],
            ['VendorLookup',     '→ 4 rules',  'resource'],
          ].map(([obj, rel, kind]) => (
            <div key={obj} style={{ borderRadius:5, border:`1px solid ${T.border2}`,
              backgroundColor:T.bgSurface, padding:'7px 10px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:3 }}>
                <NodeIcon kind={kind} size={10}/>
                <span style={{ fontFamily:MONO, fontSize:9, color:T.tx1,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {obj}
                </span>
              </div>
              <div style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>{rel}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── View: Page Inspector ───────────────────────────────────────────────── */
function PageInspectorView({ pageName, selectedFieldId, onSelectField, onOpenRules, onOpenVariant }:{
  pageName:string; selectedFieldId:string|null; onSelectField:(id:string|null)=>void;
  onOpenRules?:(label:string)=>void; onOpenVariant?:(label:string)=>void;
}) {
  const [variant, setVariant] = useState('Default');
  const [zoom, setZoom] = useState(100);
  const [showFields, setShowFields] = useState(true);
  const [showDropout, setShowDropout] = useState(false);

  const scale = zoom / 100;
  const PAGE_W = 480;
  const PAGE_H = 310;

  const FIELD_COLORS: Record<string,string> = {
    Date:T.blue, String:T.accent, Numeric:T.amber,
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {/* Page header */}
      <div style={{ padding:'8px 16px', borderBottom:`1px solid ${T.border}`,
        flexShrink:0, display:'flex', alignItems:'center', gap:10 }}>
        {/* Breadcrumb */}
        <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>Pages</span>
        <ChevronRight size={10} color={T.tx3}/>
        <span style={{ fontFamily:MONO, fontSize:11, fontWeight:600, color:T.tx1 }}>{pageName}</span>
        {/* Variant selector */}
        <div style={{ display:'flex', alignItems:'center', gap:3, marginLeft:12 }}>
          <span style={{ fontSize:10, color:T.tx3 }}>Variant:</span>
          {['Default','Alt1'].map(v => (
            <button key={v} onClick={()=>setVariant(v)}
              style={{ fontSize:10, padding:'2px 8px', borderRadius:4,
                border:`1px solid ${variant===v?T.accent:T.border}`,
                backgroundColor:variant===v?T.accentLo:'transparent',
                color:variant===v?T.accent:T.tx3 }}>{v}</button>
          ))}
        </div>
        {/* Process shortcuts + Phase 3 entry points */}
        <div style={{ display:'flex', alignItems:'center', gap:3, marginLeft:'auto' }}>
          {(['AC','FIP','OCR'] as const).map(p => (
            <button key={p}
              onClick={()=>onOpenRules?.(`${pageName} / ${p}`)}
              style={{ fontSize:10, padding:'2px 7px', borderRadius:4,
                border:`1px solid ${T.border}`, backgroundColor:T.bgSurface, color:T.tx3,
                cursor:onOpenRules?'pointer':'default' }}>
              {p}
            </button>
          ))}
          <div style={{ width:1, height:16, backgroundColor:T.border, margin:'0 4px' }}/>
          <button onClick={()=>onOpenVariant?.(variant)}
            style={{ fontSize:10, padding:'2px 7px', borderRadius:4,
              border:`1px solid ${T.border}`, backgroundColor:T.bgSurface,
              color:T.accent, cursor:'pointer', fontFamily:MONO }}>
            ⊞ Variant
          </button>
          <div style={{ width:1, height:16, backgroundColor:T.border, margin:'0 4px' }}/>
          <WarnBadge n={1} />
        </div>
      </div>

      {/* Body: canvas + field grid */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Canvas area */}
        <div style={{ flex:'0 0 66%', display:'flex', flexDirection:'column',
          borderRight:`1px solid ${T.border}`, overflow:'hidden' }}>
          {/* Canvas toolbar */}
          <div style={{ padding:'5px 10px', borderBottom:`1px solid ${T.border}`,
            display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            <button style={{ display:'flex', alignItems:'center', gap:3, fontSize:10,
              padding:'2px 6px', color:T.tx3, border:`1px solid ${T.border}`,
              borderRadius:3, backgroundColor:T.bgSurface }}
              onClick={()=>setZoom(z=>Math.min(z+25,200))}>
              <ZoomIn size={10}/> {zoom}%
            </button>
            <button onClick={()=>setZoom(z=>Math.max(z-25,50))}
              style={{ fontSize:10, padding:'2px 6px', color:T.tx3, border:`1px solid ${T.border}`,
                borderRadius:3, backgroundColor:T.bgSurface }}>
              <ZoomOut size={10}/>
            </button>
            <button onClick={()=>setZoom(100)}
              style={{ fontSize:10, padding:'2px 6px', color:T.tx3, border:`1px solid ${T.border}`,
                borderRadius:3, backgroundColor:T.bgSurface }}>
              <Maximize2 size={10}/>
            </button>
            <div style={{ width:1, height:16, backgroundColor:T.border }}/>
            <button onClick={()=>setShowFields(f=>!f)}
              style={{ fontSize:10, padding:'2px 6px', borderRadius:3,
                border:`1px solid ${showFields?T.accent:T.border}`,
                backgroundColor:showFields?T.accentLo:'transparent',
                color:showFields?T.accent:T.tx3 }}>
              Fields
            </button>
            <button onClick={()=>setShowDropout(d=>!d)}
              style={{ fontSize:10, padding:'2px 6px', borderRadius:3,
                border:`1px solid ${showDropout?T.violet:T.border}`,
                backgroundColor:showDropout?T.violetLo:'transparent',
                color:showDropout?T.violet:T.tx3 }}>
              Dropout
            </button>
            <span style={{ marginLeft:'auto', fontFamily:MONO, fontSize:9, color:T.tx3 }}>
              {pageName} · {variant}
            </span>
          </div>

          {/* Canvas viewport */}
          <div style={{ flex:1, overflow:'auto', display:'flex',
            alignItems:'center', justifyContent:'center',
            backgroundColor:'#080c12', padding:20 }}>
            <div style={{ position:'relative', transform:`scale(${scale})`,
              transformOrigin:'top center', transition:'transform 0.15s' }}>
              {/* Page background */}
              <div style={{ width:PAGE_W, height:PAGE_H, backgroundColor:'#f8f7f4',
                borderRadius:2, boxShadow:'0 4px 24px rgba(0,0,0,0.6)',
                position:'relative', overflow:'hidden' }}>
                {/* Fake page content lines */}
                {[20,40,52,64,76,100,112,148,160,172,196,208,220,232,260,272].map(y => (
                  <div key={y} style={{ position:'absolute', left:36, right:36, top:y,
                    height:1, backgroundColor:'rgba(0,0,0,0.08)' }}/>
                ))}
                {/* Header block */}
                <div style={{ position:'absolute', top:12, left:36, right:36, height:24,
                  backgroundColor:'rgba(0,0,0,0.06)', borderRadius:2 }}/>
                <div style={{ position:'absolute', top:14, left:44, fontSize:8,
                  fontFamily:'serif', color:'rgba(0,0,0,0.45)', letterSpacing:'0.05em',
                  textTransform:'uppercase' }}>INVOICE</div>
                <div style={{ position:'absolute', top:14, right:44, fontSize:7,
                  fontFamily:'serif', color:'rgba(0,0,0,0.3)' }}>Page 1 of 1</div>

                {/* Field overlays */}
                {showFields && FIELDS.map(f => {
                  const selected = f.id === selectedFieldId;
                  const fc = FIELD_COLORS[f.type] ?? T.accent;
                  return (
                    <div key={f.id} onClick={()=>onSelectField(selected?null:f.id)}
                      title={f.name}
                      style={{
                        position:'absolute', left:f.x, top:f.y, width:f.w, height:f.h,
                        border:`${selected?2:1}px solid ${fc}${selected?'':'88'}`,
                        backgroundColor:`${fc}${selected?'22':'0a'}`,
                        borderRadius:2, cursor:'pointer', transition:'all 0.1s',
                        boxShadow: selected?`0 0 0 2px ${fc}44`:undefined,
                      }}>
                      <span style={{ position:'absolute', top:-13, left:0,
                        fontFamily:MONO, fontSize:8, color:fc,
                        backgroundColor:'#f8f7f4', padding:'0 3px',
                        borderRadius:2, whiteSpace:'nowrap' }}>
                        {f.name}
                      </span>
                    </div>
                  );
                })}

                {/* Dropout regions */}
                {showDropout && <>
                  <div style={{ position:'absolute', left:36, top:280, width:100, height:20,
                    border:`1px dashed ${T.violet}88`, backgroundColor:T.violetLo,
                    borderRadius:2 }}>
                    <span style={{ fontFamily:MONO, fontSize:8, color:T.violet, padding:'2px 4px',
                      display:'block' }}>Dropout 1</span>
                  </div>
                </>}
              </div>
            </div>
          </div>
        </div>

        {/* Field grid */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'6px 10px', borderBottom:`1px solid ${T.border}`,
            display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            <span style={{ fontSize:10, color:T.tx2 }}>4 fields</span>
            <button style={{ marginLeft:'auto', fontSize:10, padding:'2px 6px', color:T.tx3,
              border:`1px solid ${T.border}`, borderRadius:3, backgroundColor:T.bgSurface,
              display:'flex', alignItems:'center', gap:3 }}>
              <Filter size={9}/> Filter
            </button>
          </div>
          <div style={{ flex:1, overflow:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
              <thead>
                <tr style={{ backgroundColor:T.bgPanel, position:'sticky', top:0, zIndex:1 }}>
                  {['Name','Type','X','Y','W','H','Src','Rules','Warn'].map(h => (
                    <th key={h} style={{ padding:'5px 8px', fontFamily:MONO, fontSize:8,
                      textAlign:'left', color:T.tx3, fontWeight:700,
                      letterSpacing:'0.07em', textTransform:'uppercase',
                      borderBottom:`1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FIELDS.map(f => {
                  const sel = f.id===selectedFieldId;
                  return (
                    <tr key={f.id} onClick={()=>onSelectField(sel?null:f.id)}
                      style={{ backgroundColor:sel?T.accentLo:'transparent',
                        borderLeft:`2px solid ${sel?T.accent:'transparent'}`,
                        cursor:'pointer' }}>
                      {[f.name,f.type,f.x,f.y,f.w,f.h,f.src,f.rules].map((v,i) => (
                        <td key={i} style={{ padding:'5px 8px', fontFamily:MONO, fontSize:10,
                          color:i===0?(sel?T.tx1:T.accent):i===1?T.blue:T.tx3,
                          borderBottom:`1px solid ${T.border2}` }}>{v}</td>
                      ))}
                      <td style={{ padding:'5px 8px', borderBottom:`1px solid ${T.border2}` }}>
                        {f.warn>0 && <WarnBadge n={f.warn}/>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── View: Raw Node Inspector ───────────────────────────────────────────── */
function RawNodeInspectorView() {
  const [mode, setMode] = useState<'Hex'|'Text'|'Attrs'|'Parsed'>('Hex');
  const [rawSelected, setRawSelected] = useState<string|null>('AC');

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'8px 14px', borderBottom:`1px solid ${T.border}`,
        flexShrink:0, display:'flex', alignItems:'center', gap:10 }}>
        <Binary size={13} color={T.violet}/>
        <span style={{ fontFamily:MONO, fontSize:11, color:T.tx1 }}>
          /Root/Processes
        </span>
        <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3,
          backgroundColor:T.bgSurface, border:`1px solid ${T.border}`,
          borderRadius:3, padding:'1px 5px', marginLeft:4 }}>
          Collection · 5 children
        </span>
        <div style={{ display:'flex', alignItems:'center', gap:2, marginLeft:'auto' }}>
          {(['Hex','Text','Attrs','Parsed'] as const).map(m => (
            <button key={m} onClick={()=>setMode(m)}
              style={{ fontSize:10, padding:'3px 8px', borderRadius:4,
                border:`1px solid ${mode===m?T.violet:T.border}`,
                backgroundColor:mode===m?T.violetLo:'transparent',
                color:mode===m?T.violet:T.tx3, fontFamily:MONO }}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Body: child tree + viewer + metadata */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Child node tree */}
        <div style={{ width:180, flexShrink:0, borderRight:`1px solid ${T.border}`,
          overflow:'auto', backgroundColor:T.bgPanel }}>
          <SectionLabel>Children</SectionLabel>
          {RAW_CHILDREN.map(c => (
            <div key={c.name} onClick={()=>setRawSelected(c.name)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px',
                cursor:'pointer', borderLeft:`2px solid ${rawSelected===c.name?T.violet:'transparent'}`,
                backgroundColor:rawSelected===c.name?T.violetLo:'transparent' }}>
              <Binary size={10} color={rawSelected===c.name?T.violet:T.tx3}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:MONO, fontSize:10,
                  color:rawSelected===c.name?T.tx1:T.tx2 }}>{c.name}</div>
                <div style={{ fontFamily:MONO, fontSize:8, color:T.tx3 }}>{c.type}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Viewer */}
        <div style={{ flex:1, overflow:'auto', backgroundColor:'#080c12' }}>
          {mode==='Hex' && (
            <div style={{ fontFamily:MONO, fontSize:10, padding:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'60px 1fr 1fr',
                gap:'0 16px', borderBottom:`1px solid ${T.border2}`, paddingBottom:6,
                marginBottom:6 }}>
                {['OFFSET','BYTES (16)','ASCII'].map(h => (
                  <span key={h} style={{ fontSize:8, color:T.tx3, fontWeight:700,
                    letterSpacing:'0.08em', textTransform:'uppercase' }}>{h}</span>
                ))}
              </div>
              {HEX_ROWS.map(row => (
                <div key={row.off} style={{ display:'grid',
                  gridTemplateColumns:'60px 1fr 1fr', gap:'0 16px',
                  padding:'2px 0', borderBottom:`1px solid ${T.border2}20` }}>
                  <span style={{ color:T.tx3 }}>{row.off}</span>
                  <span style={{ color:T.blue, letterSpacing:'0.04em' }}>{row.bytes}</span>
                  <span style={{ color:T.green }}>{row.ascii}</span>
                </div>
              ))}
            </div>
          )}
          {mode==='Text' && (
            <pre style={{ fontFamily:MONO, fontSize:10, color:T.tx2, padding:14,
              lineHeight:1.7, margin:0 }}>
{`<rule id="rule_001"
  name="ExtractInvoiceDate"
  function="MatchField"
  ordinal="1"
  result="invoice_date">
  <attribute key="regex" value="\\d{2}/\\d{2}/\\d{4}"/>
  <attribute key="required" value="true"/>
  <attribute key="confidence" value="0.85"/>
</rule>`}
            </pre>
          )}
          {mode==='Attrs' && (
            <div style={{ padding:14 }}>
              {[['id','rule_001'],['name','ExtractInvoiceDate'],['function','MatchField'],
                ['ordinal','1'],['result','invoice_date'],['type','Collection']].map(([k,v])=>(
                <div key={k} style={{ display:'grid', gridTemplateColumns:'130px 1fr',
                  padding:'4px 8px', borderBottom:`1px solid ${T.border2}` }}>
                  <span style={{ fontFamily:MONO, fontSize:10, color:T.accent }}>{k}</span>
                  <span style={{ fontFamily:MONO, fontSize:10, color:T.tx2 }}>{v}</span>
                </div>
              ))}
            </div>
          )}
          {mode==='Parsed' && (
            <div style={{ padding:14 }}>
              <div style={{ display:'inline-flex', alignItems:'center', gap:6,
                backgroundColor:T.greenLo, border:`1px solid ${T.green}28`,
                borderRadius:4, padding:'4px 10px', marginBottom:12 }}>
                <CheckCircle size={10} color={T.green}/>
                <span style={{ fontFamily:MONO, fontSize:10, color:T.green }}>
                  Known structure · Full decode
                </span>
              </div>
              <div style={{ fontFamily:MONO, fontSize:10, color:T.tx2, lineHeight:2 }}>
                <div><span style={{ color:T.accent }}>type</span>: RuleNode</div>
                <div><span style={{ color:T.accent }}>name</span>: ExtractInvoiceDate</div>
                <div><span style={{ color:T.accent }}>fn</span>: MatchField</div>
                <div><span style={{ color:T.accent }}>ordinal</span>: 1</div>
                <div><span style={{ color:T.accent }}>children</span>: 0</div>
                <div><span style={{ color:T.accent }}>attrs</span>: 3</div>
              </div>
            </div>
          )}
        </div>

        {/* Right metadata */}
        <div style={{ width:190, flexShrink:0, borderLeft:`1px solid ${T.border}`,
          backgroundColor:T.bgPanel, overflow:'auto' }}>
          <SectionLabel>Node Metadata</SectionLabel>
          {[['Path','/Root/Processes/'+rawSelected],['Type','Collection'],
            ['Size','4.2 KB'],['Children','5'],['Parse','Known']].map(([k,v])=>(
            <div key={k} style={{ display:'grid', gridTemplateColumns:'60px 1fr',
              padding:'4px 10px', borderBottom:`1px solid ${T.border2}` }}>
              <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>{k}</span>
              <span style={{ fontFamily:MONO, fontSize:9, color:T.tx2,
                wordBreak:'break-all' }}>{v}</span>
            </div>
          ))}
          <SectionLabel>Export</SectionLabel>
          <div style={{ padding:'4px 10px', display:'flex', flexDirection:'column', gap:4 }}>
            {[['Save as file',<Download size={10}/>],['Copy hex',<Copy size={10}/>]].map(([l,ic])=>(
              <button key={l as string} style={{ display:'flex', alignItems:'center', gap:6,
                padding:'5px 8px', borderRadius:4, border:`1px solid ${T.border}`,
                backgroundColor:T.bgSurface, fontSize:10, color:T.tx2 }}>
                <span style={{ color:T.tx3 }}>{ic as React.ReactNode}</span>{l as string}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── View: Document Inspector ───────────────────────────────────────────── */
function DocumentInspectorView({ docName, onOpenPage }:{
  docName:string; onOpenPage:(name:string)=>void;
}) {
  const [selPage, setSelPage] = useState<string|null>(null);
  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'8px 16px', borderBottom:`1px solid ${T.border}`,
        flexShrink:0, display:'flex', alignItems:'center', gap:10 }}>
        <Layers size={13} color={T.violet}/>
        <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>Documents</span>
        <ChevronRight size={10} color={T.tx3}/>
        <span style={{ fontFamily:MONO, fontSize:11, fontWeight:600, color:T.tx1 }}>{docName}</span>
        <WarnBadge n={2}/>
        <div style={{ display:'flex', alignItems:'center', gap:3, marginLeft:'auto' }}>
          {['AC','Store'].map(p => (
            <button key={p} style={{ fontSize:10, padding:'2px 8px', borderRadius:4,
              border:`1px solid ${T.border}`, backgroundColor:T.bgSurface, color:T.tx3 }}>{p}</button>
          ))}
          <button style={{ display:'flex', alignItems:'center', gap:4, fontSize:10,
            padding:'2px 8px', borderRadius:4, border:`1px solid ${T.border}`,
            backgroundColor:T.bgSurface, color:T.tx3 }}>
            <Binary size={9}/> Raw
          </button>
        </div>
      </div>

      {/* 3-column body */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* Left: pages in document */}
        <div style={{ width:220, flexShrink:0, borderRight:`1px solid ${T.border}`,
          backgroundColor:T.bgPanel, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <SectionLabel>Pages in Document ({DOC_PAGES.length})</SectionLabel>
          <div style={{ flex:1, overflow:'auto' }}>
            {DOC_PAGES.map(p => (
              <div key={p.name} onClick={()=>setSelPage(p.name)}
                style={{ padding:'7px 10px', cursor:'pointer',
                  borderLeft:`2px solid ${selPage===p.name?T.violet:'transparent'}`,
                  backgroundColor:selPage===p.name?T.violetLo:'transparent',
                  borderBottom:`1px solid ${T.border2}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                  <FileText size={10} color={selPage===p.name?T.blue:T.tx3}/>
                  <span style={{ fontFamily:MONO, fontSize:10, color:selPage===p.name?T.tx1:T.tx2,
                    flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {p.name}
                  </span>
                  {p.warn>0 && <WarnBadge n={p.warn}/>}
                </div>
                <div style={{ fontFamily:MONO, fontSize:9, color:T.tx3, paddingLeft:16 }}>
                  {p.variants}v · {p.fields} fields
                </div>
              </div>
            ))}
          </div>
          {selPage && (
            <div style={{ padding:'8px 10px', borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
              <button onClick={()=>onOpenPage(selPage)}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:6,
                  padding:'5px 8px', borderRadius:4, border:`1px solid ${T.blue}44`,
                  backgroundColor:T.blueLo, fontSize:10, color:T.blue, justifyContent:'center' }}>
                <ArrowRight size={10}/> Open {selPage}
              </button>
            </div>
          )}
        </div>

        {/* Center: document fields + metadata */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <SectionLabel>Document Fields</SectionLabel>
          <div style={{ overflow:'auto', flex:1 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
              <thead>
                <tr style={{ backgroundColor:T.bgPanel, position:'sticky', top:0 }}>
                  {['Name','Type','Source','Bound To'].map(h=>(
                    <th key={h} style={{ padding:'5px 12px', fontFamily:MONO, fontSize:8,
                      textAlign:'left', color:T.tx3, fontWeight:700, letterSpacing:'0.07em',
                      textTransform:'uppercase', borderBottom:`1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DOC_FIELDS.map((f,i)=>(
                  <tr key={f.name} style={{ backgroundColor:i%2===0?'transparent':T.bgPanel2+'60',
                    cursor:'pointer' }}>
                    <td style={{ padding:'6px 12px', borderBottom:`1px solid ${T.border2}`,
                      fontFamily:MONO, fontSize:10, color:T.accent }}>{f.name}</td>
                    <td style={{ padding:'6px 12px', borderBottom:`1px solid ${T.border2}`,
                      fontFamily:MONO, fontSize:10, color:T.blue }}>{f.type}</td>
                    <td style={{ padding:'6px 12px', borderBottom:`1px solid ${T.border2}`,
                      fontFamily:MONO, fontSize:10, color:T.tx3 }}>{f.src}</td>
                    <td style={{ padding:'6px 12px', borderBottom:`1px solid ${T.border2}`,
                      fontFamily:MONO, fontSize:10, color:T.tx2 }}>{f.bound}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Metadata */}
            <SectionLabel>Metadata</SectionLabel>
            <div style={{ margin:'0 10px', borderRadius:5, border:`1px solid ${T.border2}`,
              overflow:'hidden', backgroundColor:T.bgSurface, marginBottom:14 }}>
              {[['name',docName],['pages','3'],['fields','4'],['batches','1 (BATCH_STANDARD)'],
                ['raw path','/Root/Documents/DOC_CAPTURE_MAIN'],
                ['processes','AC, Store']].map(([k,v])=>(
                <div key={k} style={{ display:'grid', gridTemplateColumns:'100px 1fr',
                  padding:'4px 10px', borderBottom:`1px solid ${T.border2}` }}>
                  <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>{k}</span>
                  <span style={{ fontFamily:MONO, fontSize:10, color:T.tx2 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: relationships + diagnostics */}
        <div style={{ width:230, flexShrink:0, borderLeft:`1px solid ${T.border}`,
          backgroundColor:T.bgPanel, overflow:'auto' }}>
          <SectionLabel>Batch Membership</SectionLabel>
          <div style={{ margin:'0 8px', borderRadius:5, border:`1px solid ${T.border2}`,
            overflow:'hidden', backgroundColor:T.bgSurface, marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px',
              borderBottom:`1px solid ${T.border2}` }}>
              <Package size={10} color={T.amber}/>
              <span style={{ fontFamily:MONO, fontSize:10, color:T.tx2 }}>BATCH_STANDARD</span>
              <KindTag kind="batch"/>
            </div>
          </div>
          <SectionLabel>Diagnostics</SectionLabel>
          <div style={{ margin:'0 8px', borderRadius:5, border:`1px solid ${T.border2}`,
            overflow:'hidden', backgroundColor:T.bgSurface, marginBottom:10 }}>
            {DOC_DIAGS.map((d,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:6,
                padding:'6px 10px', borderBottom:`1px solid ${T.border2}` }}>
                <SevIcon sev={d.sev} size={10}/>
                <div>
                  <div style={{ fontSize:10, color:T.tx2, lineHeight:1.5 }}>{d.msg}</div>
                  <div style={{ fontFamily:MONO, fontSize:8, color:T.tx3, marginTop:2 }}>{d.src}</div>
                </div>
              </div>
            ))}
          </div>
          <SectionLabel>Actions</SectionLabel>
          <div style={{ margin:'0 8px', borderRadius:5, border:`1px solid ${T.border2}`,
            overflow:'hidden', backgroundColor:T.bgSurface, marginBottom:10 }}>
            {['Open AC processing','Show page membership','Open raw node','Export as JSON'].map(a=>(
              <button key={a} style={{ width:'100%', display:'flex', alignItems:'center',
                gap:7, padding:'6px 10px', borderBottom:`1px solid ${T.border2}`,
                fontSize:10, color:T.tx2, textAlign:'left' }}>
                <ArrowRight size={9} color={T.tx3}/>{a}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── View: Batch Inspector ──────────────────────────────────────────────── */
function BatchInspectorView({ batchName }:{ batchName:string }) {
  const [selDoc, setSelDoc] = useState<string|null>('DOC_CAPTURE_MAIN');
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set(['DOC_CAPTURE_MAIN']));

  function toggleDoc(name:string) {
    setExpandedDocs(prev=>{ const n=new Set(prev); n.has(name)?n.delete(name):n.add(name); return n; });
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'8px 16px', borderBottom:`1px solid ${T.border}`,
        flexShrink:0, display:'flex', alignItems:'center', gap:10 }}>
        <Package size={13} color={T.amber}/>
        <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>Batches</span>
        <ChevronRight size={10} color={T.tx3}/>
        <span style={{ fontFamily:MONO, fontSize:11, fontWeight:600, color:T.tx1 }}>{batchName}</span>
        <div style={{ display:'flex', alignItems:'center', gap:3, marginLeft:'auto' }}>
          {['AC','Store'].map(p=>(
            <button key={p} style={{ fontSize:10, padding:'2px 8px', borderRadius:4,
              border:`1px solid ${T.border}`, backgroundColor:T.bgSurface, color:T.tx3 }}>{p}</button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Left: document membership tree */}
        <div style={{ width:240, flexShrink:0, borderRight:`1px solid ${T.border}`,
          backgroundColor:T.bgPanel, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <SectionLabel>Document Membership</SectionLabel>
          <div style={{ flex:1, overflow:'auto' }}>
            {BATCH_DOCS_TREE.map(doc=>(
              <div key={doc.name}>
                <button onClick={()=>{ setSelDoc(doc.name); toggleDoc(doc.name); }}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:6,
                    padding:'6px 10px', cursor:'pointer', textAlign:'left',
                    borderLeft:`2px solid ${selDoc===doc.name?T.amber:'transparent'}`,
                    backgroundColor:selDoc===doc.name?T.amberLo:'transparent',
                    borderBottom:`1px solid ${T.border2}` }}>
                  {expandedDocs.has(doc.name)
                    ? <ChevronDown size={10} color={T.tx3}/>
                    : <ChevronRight size={10} color={T.tx3}/>}
                  <Layers size={10} color={selDoc===doc.name?T.violet:T.tx3}/>
                  <span style={{ fontFamily:MONO, fontSize:10, color:selDoc===doc.name?T.tx1:T.tx2,
                    flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {doc.name}
                  </span>
                  {doc.warn>0 && <WarnBadge n={doc.warn}/>}
                </button>
                {expandedDocs.has(doc.name) && doc.pages.map(pg=>(
                  <div key={pg} style={{ display:'flex', alignItems:'center', gap:5,
                    padding:'4px 10px 4px 28px', borderBottom:`1px solid ${T.border2}`,
                    cursor:'pointer' }}>
                    <ChevronRight size={8} color={T.tx3}/>
                    <FileText size={9} color={T.blue}/>
                    <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pg}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Center: batch metadata + page rollup */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', padding:16 }}>
          <SectionLabel>Batch Metadata</SectionLabel>
          <div style={{ borderRadius:6, border:`1px solid ${T.border2}`, overflow:'hidden',
            backgroundColor:T.bgSurface, marginBottom:14 }}>
            {BATCH_META.map(([k,v])=>(
              <div key={k} style={{ display:'grid', gridTemplateColumns:'130px 1fr',
                padding:'5px 12px', borderBottom:`1px solid ${T.border2}` }}>
                <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>{k}</span>
                <span style={{ fontFamily:MONO, fontSize:10, color:T.tx2 }}>{v}</span>
              </div>
            ))}
          </div>

          <SectionLabel>Page Rollup (via Documents)</SectionLabel>
          <div style={{ borderRadius:6, border:`1px solid ${T.border}`, overflow:'hidden',
            backgroundColor:T.bgPanel }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 60px 60px',
              padding:'5px 12px', borderBottom:`1px solid ${T.border}`,
              backgroundColor:T.bgSurface2 }}>
              {['Page','Variants','Fields','Warnings'].map(h=>(
                <span key={h} style={{ fontFamily:MONO, fontSize:8, color:T.tx3, fontWeight:700,
                  textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</span>
              ))}
            </div>
            {DOC_PAGES.map((p,i)=>(
              <div key={p.name} style={{ display:'grid', gridTemplateColumns:'1fr 80px 60px 60px',
                padding:'6px 12px', borderBottom:`1px solid ${T.border2}`,
                backgroundColor:i%2===0?'transparent':T.bgPanel2+'60' }}>
                <span style={{ fontFamily:MONO, fontSize:10, color:T.blue,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
                <span style={{ fontFamily:MONO, fontSize:10, color:T.tx3 }}>{p.variants}</span>
                <span style={{ fontFamily:MONO, fontSize:10, color:T.tx3 }}>{p.fields}</span>
                <span>{p.warn>0?<WarnBadge n={p.warn}/>:<span style={{ fontFamily:MONO,fontSize:10,color:T.green }}>—</span>}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: impacts + diagnostics */}
        <div style={{ width:210, flexShrink:0, borderLeft:`1px solid ${T.border}`,
          backgroundColor:T.bgPanel, overflow:'auto' }}>
          <SectionLabel>Impacts</SectionLabel>
          <div style={{ margin:'0 8px', borderRadius:5, border:`1px solid ${T.border2}`,
            overflow:'hidden', backgroundColor:T.bgSurface, marginBottom:10 }}>
            {[['Documents','1'],['Pages (rollup)','3'],['Total rules','29'],
              ['Warnings','2'],['Errors','0']].map(([k,v])=>(
              <div key={k} style={{ display:'grid', gridTemplateColumns:'110px 1fr',
                padding:'4px 10px', borderBottom:`1px solid ${T.border2}` }}>
                <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>{k}</span>
                <span style={{ fontFamily:MONO, fontSize:10, fontWeight:600,
                  color:k==='Warnings'&&v!=='0'?T.amber:k==='Errors'&&v!=='0'?T.red:T.tx2 }}>{v}</span>
              </div>
            ))}
          </div>
          <SectionLabel>Diagnostics</SectionLabel>
          <div style={{ margin:'0 8px', borderRadius:5, border:`1px solid ${T.border2}`,
            overflow:'hidden', backgroundColor:T.bgSurface, marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:6,
              padding:'6px 10px', borderBottom:`1px solid ${T.border2}` }}>
              <SevIcon sev="warn" size={10}/>
              <div style={{ fontSize:10, color:T.tx2, lineHeight:1.5 }}>
                2 warnings propagated from DOC_CAPTURE_MAIN
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'flex-start', gap:6, padding:'6px 10px' }}>
              <SevIcon sev="info" size={10}/>
              <div style={{ fontSize:10, color:T.tx2, lineHeight:1.5 }}>
                Batch structure valid — 1 doc · 3 pages
              </div>
            </div>
          </div>
          <SectionLabel>Actions</SectionLabel>
          <div style={{ margin:'0 8px', borderRadius:5, border:`1px solid ${T.border2}`,
            overflow:'hidden', backgroundColor:T.bgSurface, marginBottom:10 }}>
            {['Open AC processing','Open Store config','Open raw node','Export batch'].map(a=>(
              <button key={a} style={{ width:'100%', display:'flex', alignItems:'center',
                gap:7, padding:'6px 10px', borderBottom:`1px solid ${T.border2}`,
                fontSize:10, color:T.tx2, textAlign:'left' }}>
                <ArrowRight size={9} color={T.tx3}/>{a}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── View: Resource Inspector ───────────────────────────────────────────── */
function ResourceInspectorView({ resName }:{ resName:string }) {
  const [selRow, setSelRow] = useState<string|null>(null);
  const config = [
    ['name', resName], ['type','Function'], ['category','Lookup'],
    ['returns','String | null'], ['params','(key: String, table: String)'],
    ['table','VENDOR_MASTER'], ['nullable','false'], ['cache','session'],
  ];
  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'8px 16px', borderBottom:`1px solid ${T.border}`,
        flexShrink:0, display:'flex', alignItems:'center', gap:10 }}>
        <Grid3X3 size={13} color={T.green}/>
        <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>Resources / Functions</span>
        <ChevronRight size={10} color={T.tx3}/>
        <span style={{ fontFamily:MONO, fontSize:11, fontWeight:600, color:T.tx1 }}>{resName}</span>
        <KindTag kind="resource"/>
        <div style={{ display:'flex', alignItems:'center', gap:3, marginLeft:'auto' }}>
          <button style={{ display:'flex', alignItems:'center', gap:4, fontSize:10,
            padding:'2px 8px', borderRadius:4, border:`1px solid ${T.border}`,
            backgroundColor:T.bgSurface, color:T.tx3 }}>
            <Binary size={9}/> Raw Node
          </button>
          <button style={{ display:'flex', alignItems:'center', gap:4, fontSize:10,
            padding:'2px 8px', borderRadius:4, border:`1px solid ${T.border}`,
            backgroundColor:T.bgSurface, color:T.tx3 }}>
            <Download size={9}/> Export
          </button>
        </div>
      </div>

      {/* 3-column body */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Left: public config */}
        <div style={{ width:230, flexShrink:0, borderRight:`1px solid ${T.border}`,
          backgroundColor:T.bgPanel, overflow:'auto' }}>
          <SectionLabel>Public Config</SectionLabel>
          <div style={{ margin:'0 8px', borderRadius:5, border:`1px solid ${T.border2}`,
            overflow:'hidden', backgroundColor:T.bgSurface, marginBottom:10 }}>
            {config.map(([k,v])=>(
              <div key={k} style={{ display:'grid', gridTemplateColumns:'80px 1fr',
                padding:'5px 10px', borderBottom:`1px solid ${T.border2}`, alignItems:'start' }}>
                <span style={{ fontFamily:MONO, fontSize:9, color:T.accent }}>{k}</span>
                <span style={{ fontFamily:MONO, fontSize:10, color:T.tx2,
                  wordBreak:'break-all', lineHeight:1.5 }}>{v}</span>
              </div>
            ))}
          </div>
          <SectionLabel>Raw Node</SectionLabel>
          <div style={{ margin:'0 8px', borderRadius:5, border:`1px solid ${T.border2}`,
            overflow:'hidden', backgroundColor:T.bgSurface, marginBottom:10 }}>
            {[['path',`/Root/Resources/Functions/${resName}`],['type','Collection'],
              ['size','1.4 KB'],['parse','Known']].map(([k,v])=>(
              <div key={k} style={{ display:'grid', gridTemplateColumns:'50px 1fr',
                padding:'4px 10px', borderBottom:`1px solid ${T.border2}` }}>
                <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>{k}</span>
                <span style={{ fontFamily:MONO, fontSize:9, color:T.tx2,
                  wordBreak:'break-all' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Center: where-used table */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'6px 14px', borderBottom:`1px solid ${T.border}`,
            display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
            <span style={{ fontSize:10, color:T.tx2 }}>
              {WHERE_USED.length} references
            </span>
            <span style={{ fontFamily:MONO, fontSize:9, backgroundColor:T.greenLo,
              color:T.green, borderRadius:3, padding:'1px 5px', marginLeft:'auto' }}>
              {WHERE_USED.length} consumers
            </span>
          </div>
          <div style={{ flex:1, overflow:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
              <thead>
                <tr style={{ backgroundColor:T.bgPanel, position:'sticky', top:0 }}>
                  {['Consumer','Type','Path','Ref Mode','Warn'].map(h=>(
                    <th key={h} style={{ padding:'5px 12px', fontFamily:MONO, fontSize:8,
                      textAlign:'left', color:T.tx3, fontWeight:700, letterSpacing:'0.07em',
                      textTransform:'uppercase', borderBottom:`1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WHERE_USED.map((w,i)=>(
                  <tr key={w.consumer} onClick={()=>setSelRow(w.consumer)}
                    style={{ backgroundColor:selRow===w.consumer?T.accentLo
                      :i%2===0?'transparent':T.bgPanel2+'60',
                      borderLeft:`2px solid ${selRow===w.consumer?T.accent:'transparent'}`,
                      cursor:'pointer' }}>
                    <td style={{ padding:'6px 12px', borderBottom:`1px solid ${T.border2}`,
                      fontFamily:MONO, fontSize:10, color:T.accent }}>{w.consumer}</td>
                    <td style={{ padding:'6px 12px', borderBottom:`1px solid ${T.border2}` }}>
                      <KindTag kind={w.objType}/>
                    </td>
                    <td style={{ padding:'6px 12px', borderBottom:`1px solid ${T.border2}`,
                      fontFamily:MONO, fontSize:9, color:T.tx3, maxWidth:180,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{w.path}</td>
                    <td style={{ padding:'6px 12px', borderBottom:`1px solid ${T.border2}`,
                      fontFamily:MONO, fontSize:9,
                      color:w.refMode==='direct'?T.blue:T.tx3 }}>{w.refMode}</td>
                    <td style={{ padding:'6px 12px', borderBottom:`1px solid ${T.border2}` }}>
                      {w.warn>0 ? <WarnBadge n={w.warn}/> : <span style={{ color:T.tx3,fontFamily:MONO,fontSize:9 }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: diagnostics */}
        <div style={{ width:200, flexShrink:0, borderLeft:`1px solid ${T.border}`,
          backgroundColor:T.bgPanel, overflow:'auto' }}>
          <SectionLabel>Diagnostics</SectionLabel>
          <div style={{ margin:'0 8px', borderRadius:5, border:`1px solid ${T.border2}`,
            overflow:'hidden', backgroundColor:T.bgSurface, marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 10px',
              borderBottom:`1px solid ${T.border2}` }}>
              <CheckCircle size={12} color={T.green}/>
              <span style={{ fontSize:10, color:T.green }}>No resource errors</span>
            </div>
            <div style={{ display:'flex', alignItems:'flex-start', gap:6, padding:'8px 10px' }}>
              <SevIcon sev="info" size={10}/>
              <div style={{ fontSize:10, color:T.tx2, lineHeight:1.5 }}>
                1 consumer has an active warning (ValidateDateFormat)
              </div>
            </div>
          </div>
          <SectionLabel>Actions</SectionLabel>
          <div style={{ margin:'0 8px', borderRadius:5, border:`1px solid ${T.border2}`,
            overflow:'hidden', backgroundColor:T.bgSurface, marginBottom:10 }}>
            {['Copy resource name','Open raw node','Show all references','Export config'].map(a=>(
              <button key={a} style={{ width:'100%', display:'flex', alignItems:'center',
                gap:7, padding:'6px 10px', borderBottom:`1px solid ${T.border2}`,
                fontSize:10, color:T.tx2, textAlign:'left' }}>
                <ArrowRight size={9} color={T.tx3}/>{a}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Global Search Dialog ───────────────────────────────────────────────── */
function GlobalSearchDialog({ onClose, onOpen }:{
  onClose:()=>void; onOpen:(kind:TabKind,label:string)=>void;
}) {
  const [q, setQ] = useState('');
  const results = q.length>=1
    ? SEARCH_INDEX.filter(r=>r.label.toLowerCase().includes(q.toLowerCase()))
    : SEARCH_INDEX.slice(0,6);

  const groups = Array.from(new Set(results.map(r=>r.kind)));

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex',
      alignItems:'flex-start', justifyContent:'center', paddingTop:80,
      backgroundColor:'rgba(0,0,0,0.65)' }} onClick={onClose}>
      <div style={{ width:560, backgroundColor:T.bgPanel, borderRadius:10,
        border:`1px solid ${T.border}`, boxShadow:'0 24px 80px rgba(0,0,0,0.6)',
        overflow:'hidden' }} onClick={e=>e.stopPropagation()}>
        {/* Search input */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px',
          borderBottom:`1px solid ${T.border}` }}>
          <Search size={14} color={T.accent}/>
          <input autoFocus value={q} onChange={e=>setQ(e.target.value)}
            placeholder="Search objects, rules, GUIDs, attributes…"
            style={{ flex:1, fontSize:13, color:T.tx1 }}/>
          <button onClick={onClose} style={{ color:T.tx3, display:'flex' }}>
            <X size={14}/>
          </button>
        </div>

        {/* Results */}
        <div style={{ maxHeight:380, overflow:'auto', padding:'8px 0' }}>
          {results.length===0 ? (
            <div style={{ padding:'24px 16px', textAlign:'center', color:T.tx3, fontSize:11 }}>
              No results for "{q}"
            </div>
          ) : (
            groups.map(group=>(
              <div key={group}>
                <div style={{ fontFamily:MONO, fontSize:9, fontWeight:700, letterSpacing:'0.1em',
                  textTransform:'uppercase', color:T.tx3, padding:'6px 16px 3px' }}>
                  {group}
                </div>
                {results.filter(r=>r.kind===group).map(r=>(
                  <div key={r.label}
                    onClick={()=>{ onOpen(r.kind as TabKind, r.label); onClose(); }}
                    style={{ display:'flex', alignItems:'center', gap:10,
                      padding:'8px 16px', cursor:'pointer',
                      borderRadius:0 }}
                    onMouseOver={e=>(e.currentTarget.style.backgroundColor=T.bgHover)}
                    onMouseOut={e=>(e.currentTarget.style.backgroundColor='transparent')}>
                    <NodeIcon kind={r.kind} size={12}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:MONO, fontSize:11, color:T.tx1 }}>
                        {r.label}
                      </div>
                      <div style={{ fontFamily:MONO, fontSize:9, color:T.tx3, marginTop:1 }}>
                        {r.sub}
                      </div>
                    </div>
                    <KindTag kind={r.kind}/>
                    <ArrowRight size={10} color={T.tx3}/>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ display:'flex', alignItems:'center', gap:14, padding:'8px 16px',
          borderTop:`1px solid ${T.border}`, backgroundColor:T.bgBase }}>
          {[['↵','open'],['↑↓','navigate'],['esc','close']].map(([k,l])=>(
            <span key={l} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ fontFamily:MONO, fontSize:9, backgroundColor:T.bgSurface,
                border:`1px solid ${T.border}`, borderRadius:3,
                padding:'1px 5px', color:T.tx2 }}>{k}</span>
              <span style={{ fontSize:9, color:T.tx3 }}>{l}</span>
            </span>
          ))}
          <span style={{ marginLeft:'auto', fontFamily:MONO, fontSize:9, color:T.tx3 }}>
            {results.length} results
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Phase 3: Rule Editor ───────────────────────────────────────────────── */
function flattenRules(nodes:RuleNode[], depth=0):Array<{node:RuleNode;depth:number}> {
  return nodes.flatMap(n => [{node:n,depth},...flattenRules(n.children,depth+1)]);
}

function RuleEditorView({ processName='AC' }:{ processName?:string }) {
  const [selId, setSelId]   = useState<string>('rn1');
  const [fnTab, setFnTab]   = useState<'attrs'|'fields'>('attrs');
  const flat = flattenRules(RULE_NODES);
  const sel  = flat.find(f=>f.node.id===selId)?.node ?? flat[0].node;

  const statusColor = (s:string) =>
    s==='warn' ? T.amber : s==='error' ? T.red : T.green;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ flexShrink:0, padding:'8px 14px', borderBottom:`1px solid ${T.border}`,
        backgroundColor:T.bgPanel, display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontFamily:MONO, fontSize:10, color:T.tx3,
          background:T.bgBase, border:`1px solid ${T.border}`, borderRadius:3,
          padding:'2px 6px' }}>{processName}</span>
        <span style={{ fontSize:11, color:T.tx1, fontWeight:600 }}>Rule Editor</span>
        <span style={{ fontFamily:MONO, fontSize:10, color:T.tx3 }}>·</span>
        <span style={{ fontFamily:MONO, fontSize:10, color:T.accent }}>PAGE_INVOICE_HEADER / {processName}</span>
        <span style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          {['Add Rule','Reorder','Export DLL'].map(a=>(
            <button key={a} style={{ fontFamily:MONO, fontSize:10, padding:'2px 8px',
              background:T.bgBase, border:`1px solid ${T.border}`, borderRadius:3,
              color:T.tx2, cursor:'pointer' }}>{a}</button>
          ))}
        </span>
      </div>

      {/* 3-column body */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* Left — Rule tree */}
        <div style={{ width:220, flexShrink:0, borderRight:`1px solid ${T.border}`,
          display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'6px 10px', borderBottom:`1px solid ${T.border}`,
            fontSize:10, color:T.tx3, fontFamily:MONO }}>
            {RULE_NODES.length} rules · {flat.length - RULE_NODES.length} sub-rules
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {flat.map(({node:n,depth})=>(
              <div key={n.id} onClick={()=>setSelId(n.id)}
                style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer',
                  padding:`4px 10px 4px ${10+depth*14}px`,
                  backgroundColor:selId===n.id ? T.bgHover : 'transparent',
                  borderLeft:selId===n.id ? `2px solid ${T.accent}` : '2px solid transparent' }}>
                <span style={{ fontSize:9, color:statusColor(n.status), flexShrink:0 }}>
                  {n.status==='warn' ? '⚠' : n.status==='error' ? '✕' : '●'}
                </span>
                <span style={{ fontFamily:MONO, fontSize:10, color:T.tx3, flexShrink:0, width:18 }}>
                  {n.ordinal}
                </span>
                <span style={{ fontSize:11, color:n.disabled ? T.tx3 : T.tx1,
                  textDecoration:n.disabled ? 'line-through' : 'none',
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {n.name}
                </span>
                {n.disabled && (
                  <span style={{ fontFamily:MONO, fontSize:8, color:T.tx3,
                    background:T.bgBase, border:`1px solid ${T.border}`, borderRadius:2,
                    padding:'0 3px', flexShrink:0 }}>off</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Center — Rule detail */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {/* Summary card */}
          <div style={{ flexShrink:0, padding:'10px 14px', borderBottom:`1px solid ${T.border}`,
            backgroundColor:T.bgPanel, display:'flex', gap:16 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:T.tx1, marginBottom:2 }}>{sel.name}</div>
              <div style={{ fontFamily:MONO, fontSize:10, color:T.tx3 }}>
                fn: <span style={{ color:T.accent }}>{sel.fn}</span>
                &nbsp;· ordinal: {sel.ordinal}
                &nbsp;· {sel.statuses.length} statuses
              </div>
            </div>
            <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'flex-start' }}>
              <span style={{ fontFamily:MONO, fontSize:10, padding:'2px 8px',
                background:`${statusColor(sel.status)}18`,
                border:`1px solid ${statusColor(sel.status)}`,
                borderRadius:3, color:statusColor(sel.status) }}>
                {sel.status}
              </span>
              {sel.disabled && (
                <span style={{ fontFamily:MONO, fontSize:10, padding:'2px 8px',
                  background:T.bgBase, border:`1px solid ${T.border}`,
                  borderRadius:3, color:T.tx3 }}>disabled</span>
              )}
            </div>
          </div>

          {/* Status / Action matrix */}
          <div style={{ flexShrink:0, borderBottom:`1px solid ${T.border}` }}>
            <div style={{ padding:'4px 14px', fontSize:9, fontFamily:MONO, color:T.tx3,
              backgroundColor:T.bgBase, borderBottom:`1px solid ${T.border}` }}>
              STATUS / ACTION MATRIX
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ backgroundColor:T.bgBase }}>
                  {['#','Token','Description','Action','Target'].map(h=>(
                    <th key={h} style={{ padding:'4px 10px', textAlign:'left',
                      fontFamily:MONO, fontSize:9, color:T.tx3,
                      borderBottom:`1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sel.statuses.map(s=>(
                  <tr key={s.ord} style={{ borderBottom:`1px solid ${T.border}` }}>
                    <td style={{ padding:'5px 10px', fontFamily:MONO, fontSize:10, color:T.tx3 }}>{s.ord}</td>
                    <td style={{ padding:'5px 10px' }}>
                      <span style={{ fontFamily:MONO, fontSize:10, fontWeight:700,
                        color:T.tx1 }}>{s.tok}</span>
                    </td>
                    <td style={{ padding:'5px 10px', fontSize:11, color:T.tx2 }}>{s.desc}</td>
                    <td style={{ padding:'5px 10px' }}>
                      <span style={{ fontFamily:MONO, fontSize:10,
                        color:s.action==='none' ? T.tx3 : s.action==='reject' ? T.red : T.amber }}>
                        {s.action}
                      </span>
                    </td>
                    <td style={{ padding:'5px 10px', fontFamily:MONO, fontSize:10, color:T.accent }}>
                      {s.target ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Function Editor host */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ display:'flex', gap:0, borderBottom:`1px solid ${T.border}`,
              backgroundColor:T.bgBase, padding:'0 14px', flexShrink:0 }}>
              <span style={{ fontSize:9, fontFamily:MONO, color:T.tx3, alignSelf:'center',
                marginRight:10 }}>FUNCTION EDITOR</span>
              {(['attrs','fields'] as const).map(t=>(
                <button key={t} onClick={()=>setFnTab(t)}
                  style={{ fontSize:10, padding:'5px 12px', border:'none',
                    borderBottom:fnTab===t ? `2px solid ${T.accent}` : '2px solid transparent',
                    background:'transparent', color:fnTab===t ? T.tx1 : T.tx3,
                    cursor:'pointer', fontFamily:MONO }}>
                  {t==='attrs' ? 'Attributes' : 'Field Bindings'}
                </button>
              ))}
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'10px 14px' }}>
              {fnTab==='attrs' ? (
                Object.keys(sel.attrs).length === 0
                  ? <div style={{ fontSize:11, color:T.tx3 }}>No attributes defined for this rule.</div>
                  : <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <tbody>
                        {Object.entries(sel.attrs).map(([k,v])=>(
                          <tr key={k} style={{ borderBottom:`1px solid ${T.border}` }}>
                            <td style={{ padding:'5px 8px', fontFamily:MONO, fontSize:10,
                              color:T.tx3, width:'30%' }}>{k}</td>
                            <td style={{ padding:'5px 8px', fontFamily:MONO, fontSize:10,
                              color:T.accent }}>{v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
              ) : (
                sel.fields.length === 0
                  ? <div style={{ fontSize:11, color:T.tx3 }}>No field bindings for this rule.</div>
                  : <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      {sel.fields.map(f=>(
                        <div key={f} style={{ display:'flex', alignItems:'center', gap:8,
                          padding:'5px 8px', backgroundColor:T.bgPanel,
                          border:`1px solid ${T.border}`, borderRadius:4 }}>
                          <Layers size={11} color={T.accent} />
                          <span style={{ fontFamily:MONO, fontSize:10, color:T.tx1 }}>{f}</span>
                        </div>
                      ))}
                    </div>
              )}
            </div>
          </div>
        </div>

        {/* Right — Description, refs, diagnostics */}
        <div style={{ width:200, flexShrink:0, borderLeft:`1px solid ${T.border}`,
          display:'flex', flexDirection:'column', overflowY:'auto' }}>
          <div style={{ padding:'8px 10px', borderBottom:`1px solid ${T.border}`,
            fontSize:9, fontFamily:MONO, color:T.tx3, backgroundColor:T.bgBase }}>
            DESCRIPTION
          </div>
          <div style={{ padding:'8px 10px', fontSize:11, color:T.tx2, lineHeight:1.6,
            borderBottom:`1px solid ${T.border}` }}>
            Invokes <span style={{ fontFamily:MONO, color:T.accent }}>{sel.fn}</span> to
            evaluate the <em>{sel.name}</em> rule. On match the extraction proceeds;
            on mismatch the configured action fires.
          </div>
          <div style={{ padding:'6px 10px 2px', fontSize:9, fontFamily:MONO, color:T.tx3,
            backgroundColor:T.bgBase, borderBottom:`1px solid ${T.border}` }}>
            FIELD REFERENCES
          </div>
          {sel.fields.length===0
            ? <div style={{ padding:'8px 10px', fontSize:11, color:T.tx3 }}>None</div>
            : sel.fields.map(f=>(
                <div key={f} style={{ padding:'5px 10px', display:'flex',
                  alignItems:'center', gap:6, borderBottom:`1px solid ${T.border}` }}>
                  <Layers size={10} color={T.accent} />
                  <span style={{ fontFamily:MONO, fontSize:10, color:T.tx1 }}>{f}</span>
                </div>
              ))
          }
          <div style={{ padding:'6px 10px 2px', fontSize:9, fontFamily:MONO, color:T.tx3,
            backgroundColor:T.bgBase, borderBottom:`1px solid ${T.border}` }}>
            DIAGNOSTICS
          </div>
          {sel.status==='warn'
            ? <div style={{ padding:'8px 10px', display:'flex', gap:6, alignItems:'flex-start' }}>
                <AlertTriangle size={11} color={T.amber} style={{ flexShrink:0, marginTop:1 }} />
                <span style={{ fontSize:11, color:T.tx2 }}>
                  {sel.id==='rn3'
                    ? 'Tolerance threshold not set; using default (0.01)'
                    : 'Regex pattern may be too broad — add anchors'}
                </span>
              </div>
            : <div style={{ padding:'8px 10px', fontSize:11, color:T.tx3 }}>No issues.</div>
          }
        </div>
      </div>
    </div>
  );
}

/* ─── Phase 3: Process Scope Matrix ──────────────────────────────────────── */
function ProcessScopeView({ processName }:{ processName:string }) {
  const procDesc: Record<string,{scope:string;target:string;description:string}> = {
    AC:  { scope:'Page',     target:'PAGE_INVOICE_HEADER', description:'Automated Capture — extracts structured fields from page regions using rule-based pattern matching.' },
    FIP: { scope:'Page Variant', target:'Default / Alt1',  description:'Form Image Processing — pre-processes raw scan images, applies dropout and normalisation before field extraction.' },
    OCR: { scope:'Page',     target:'PAGE_INVOICE_HEADER', description:'Optical Character Recognition — converts image regions to text; result fed downstream to AC.' },
  };
  const info = procDesc[processName] ?? procDesc['AC'];

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ flexShrink:0, padding:'8px 14px', borderBottom:`1px solid ${T.border}`,
        backgroundColor:T.bgPanel, display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontFamily:MONO, fontSize:10, color:T.tx3,
          background:T.bgBase, border:`1px solid ${T.border}`, borderRadius:3,
          padding:'2px 6px' }}>process</span>
        <span style={{ fontSize:11, color:T.tx1, fontWeight:600 }}>{processName}</span>
        <span style={{ fontFamily:MONO, fontSize:10, color:T.tx3 }}>
          scope: <span style={{ color:T.accent }}>{info.scope}</span>
        </span>
        <span style={{ fontFamily:MONO, fontSize:10, color:T.tx3 }}>
          target: <span style={{ color:T.tx1 }}>{info.target}</span>
        </span>
        <span style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          {['Edit Scope','Open Rules'].map(a=>(
            <button key={a} style={{ fontFamily:MONO, fontSize:10, padding:'2px 8px',
              background:T.bgBase, border:`1px solid ${T.border}`, borderRadius:3,
              color:T.tx2, cursor:'pointer' }}>{a}</button>
          ))}
        </span>
      </div>

      {/* Two-column body */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* Main area */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflowY:'auto' }}>
          {/* Scope matrix */}
          <div style={{ flexShrink:0 }}>
            <div style={{ padding:'4px 14px', fontSize:9, fontFamily:MONO, color:T.tx3,
              backgroundColor:T.bgBase, borderBottom:`1px solid ${T.border}` }}>
              SCOPE MATRIX
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ backgroundColor:T.bgBase }}>
                  {['Scope','Object','Configured','Refs','Rules','Warn',''].map(h=>(
                    <th key={h} style={{ padding:'4px 10px', textAlign:'left',
                      fontFamily:MONO, fontSize:9, color:T.tx3,
                      borderBottom:`1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PROCESS_SCOPES.map((row,i)=>(
                  <tr key={i} style={{ borderBottom:`1px solid ${T.border}` }}>
                    <td style={{ padding:'5px 10px', fontFamily:MONO, fontSize:10, color:T.tx3 }}>{row.scope}</td>
                    <td style={{ padding:'5px 10px', fontFamily:MONO, fontSize:10, color:T.accent }}>{row.obj}</td>
                    <td style={{ padding:'5px 10px' }}>
                      <span style={{ fontFamily:MONO, fontSize:10,
                        color:row.configured ? T.green : T.tx3 }}>
                        {row.configured ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td style={{ padding:'5px 10px', fontFamily:MONO, fontSize:10, color:T.tx2 }}>{row.refs || '—'}</td>
                    <td style={{ padding:'5px 10px', fontFamily:MONO, fontSize:10, color:T.tx2 }}>{row.rules || '—'}</td>
                    <td style={{ padding:'5px 10px' }}>
                      {row.warn>0
                        ? <span style={{ display:'flex', alignItems:'center', gap:4, fontFamily:MONO, fontSize:10, color:T.amber }}>
                            <AlertTriangle size={10} color={T.amber}/>{row.warn}
                          </span>
                        : <span style={{ fontFamily:MONO, fontSize:10, color:T.tx3 }}>—</span>}
                    </td>
                    <td style={{ padding:'5px 10px' }}>
                      {row.configured && (
                        <button style={{ fontFamily:MONO, fontSize:9, padding:'1px 6px',
                          background:T.bgBase, border:`1px solid ${T.border}`, borderRadius:3,
                          color:T.accent, cursor:'pointer' }}>Open ›</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Linked resources + reverse refs row */}
          <div style={{ display:'flex', borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
            <div style={{ flex:1, borderRight:`1px solid ${T.border}` }}>
              <div style={{ padding:'4px 14px', fontSize:9, fontFamily:MONO, color:T.tx3,
                backgroundColor:T.bgBase, borderBottom:`1px solid ${T.border}` }}>
                LINKED RESOURCES ({PROC_LINKED_RES.length})
              </div>
              {PROC_LINKED_RES.map(r=>(
                <div key={r.name} style={{ padding:'6px 14px', display:'flex',
                  alignItems:'center', gap:8, borderBottom:`1px solid ${T.border}` }}>
                  <Database size={11} color={T.accent} />
                  <span style={{ fontFamily:MONO, fontSize:10, color:T.tx1 }}>{r.name}</span>
                  <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3, marginLeft:4 }}>{r.type}</span>
                  <span style={{ marginLeft:'auto', fontFamily:MONO, fontSize:9, color:T.tx3 }}>{r.refs} refs</span>
                </div>
              ))}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ padding:'4px 14px', fontSize:9, fontFamily:MONO, color:T.tx3,
                backgroundColor:T.bgBase, borderBottom:`1px solid ${T.border}` }}>
                REVERSE REFERENCES ({PROC_REVERSE_REFS.length})
              </div>
              {PROC_REVERSE_REFS.map((r,i)=>(
                <div key={i} style={{ padding:'6px 14px', display:'flex',
                  alignItems:'center', gap:8, borderBottom:`1px solid ${T.border}` }}>
                  <NodeIcon kind={r.kind} size={11} />
                  <span style={{ fontSize:11, color:T.tx2 }}>{r.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes / diagnostics */}
          <div style={{ flexShrink:0 }}>
            <div style={{ padding:'4px 14px', fontSize:9, fontFamily:MONO, color:T.tx3,
              backgroundColor:T.bgBase, borderBottom:`1px solid ${T.border}` }}>
              NOTES &amp; DIAGNOSTICS
            </div>
            <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ display:'flex', gap:6, alignItems:'flex-start' }}>
                <Info size={11} color={T.blue} style={{ flexShrink:0, marginTop:1 }} />
                <span style={{ fontSize:11, color:T.tx2 }}>
                  {processName} is configured for <strong style={{ color:T.tx1 }}>3 of 3</strong> pages.
                </span>
              </div>
              <div style={{ display:'flex', gap:6, alignItems:'flex-start' }}>
                <AlertTriangle size={11} color={T.amber} style={{ flexShrink:0, marginTop:1 }} />
                <span style={{ fontSize:11, color:T.tx2 }}>
                  PAGE_INVOICE_HEADER has 2 rule-level warnings that may affect extraction accuracy.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right metadata rail */}
        <div style={{ width:200, flexShrink:0, borderLeft:`1px solid ${T.border}`,
          display:'flex', flexDirection:'column', overflowY:'auto' }}>
          <div style={{ padding:'6px 10px', fontSize:9, fontFamily:MONO, color:T.tx3,
            backgroundColor:T.bgBase, borderBottom:`1px solid ${T.border}` }}>
            PROCESS METADATA
          </div>
          {[
            { k:'Name',      v:processName },
            { k:'Version',   v:'3.1.4' },
            { k:'Scope',     v:info.scope },
            { k:'Target',    v:info.target },
            { k:'Rules',     v:'29 active · 1 disabled' },
            { k:'Functions', v:'12' },
          ].map(({k,v})=>(
            <div key={k} style={{ padding:'5px 10px', borderBottom:`1px solid ${T.border}` }}>
              <div style={{ fontSize:9, fontFamily:MONO, color:T.tx3 }}>{k}</div>
              <div style={{ fontSize:11, color:T.tx1, marginTop:1 }}>{v}</div>
            </div>
          ))}
          <div style={{ padding:'6px 10px', fontSize:9, fontFamily:MONO, color:T.tx3,
            backgroundColor:T.bgBase, borderBottom:`1px solid ${T.border}`,
            borderTop:`1px solid ${T.border}` }}>
            PRIVATE NODE PATH
          </div>
          <div style={{ padding:'8px 10px', fontFamily:MONO, fontSize:9, color:T.accent,
            wordBreak:'break-all', borderBottom:`1px solid ${T.border}` }}>
            /Root/WFProcess[@name="{processName}"]/WFScope/
          </div>
          <div style={{ padding:'8px 10px', display:'flex', flexDirection:'column', gap:6 }}>
            {['Export XML','Copy Path','Copy JSON'].map(a=>(
              <button key={a} style={{ fontFamily:MONO, fontSize:10, padding:'4px 8px',
                background:T.bgBase, border:`1px solid ${T.border}`, borderRadius:3,
                color:T.tx2, cursor:'pointer', textAlign:'left' }}>{a}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Phase 3: Variant Inspector ─────────────────────────────────────────── */
function VariantInspectorView({ variantName }:{ variantName:string }) {
  const [overlays, setOverlays] = useState({ fields:true, dropout:true, omr:true, diags:false });
  const [proc, setProc]         = useState<'FIP'|'OCR'>('FIP');

  function toggle(k: keyof typeof overlays) {
    setOverlays(o=>({...o,[k]:!o[k]}));
  }

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ flexShrink:0, padding:'8px 14px', borderBottom:`1px solid ${T.border}`,
        backgroundColor:T.bgPanel, display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontFamily:MONO, fontSize:10, color:T.tx3,
          background:T.bgBase, border:`1px solid ${T.border}`, borderRadius:3,
          padding:'2px 6px' }}>variant</span>
        <span style={{ fontSize:11, color:T.tx1, fontWeight:600 }}>
          PAGE_INVOICE_HEADER.<span style={{ color:T.accent }}>{variantName}</span>
        </span>
        <span style={{ fontFamily:MONO, fontSize:10, color:T.tx3 }}>
          FormID: <span style={{ color:T.tx1 }}>1042</span>
        </span>
        <div style={{ display:'flex', gap:4, marginLeft:'auto' }}>
          {(['FIP','OCR'] as const).map(p=>(
            <button key={p} onClick={()=>setProc(p)}
              style={{ fontFamily:MONO, fontSize:10, padding:'2px 10px',
                background:proc===p ? T.accent : T.bgBase,
                border:`1px solid ${proc===p ? T.accent : T.border}`,
                borderRadius:3, color:proc===p ? '#000' : T.tx2, cursor:'pointer' }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* Canvas area */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden',
          borderRight:`1px solid ${T.border}` }}>
          {/* Overlay toggles */}
          <div style={{ flexShrink:0, padding:'6px 12px', borderBottom:`1px solid ${T.border}`,
            backgroundColor:T.bgBase, display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3, marginRight:4 }}>OVERLAYS</span>
            {([['fields','Fields',T.accent],['dropout','Dropout','#6366f1'],['omr','OMR','#f59e0b'],['diags','Diags',T.red]] as const).map(
              ([k,label,col])=>(
                <button key={k} onClick={()=>toggle(k as keyof typeof overlays)}
                  style={{ fontFamily:MONO, fontSize:10, padding:'2px 8px',
                    background: overlays[k as keyof typeof overlays] ? `${col}22` : T.bgPanel,
                    border:`1px solid ${overlays[k as keyof typeof overlays] ? col : T.border}`,
                    borderRadius:3,
                    color: overlays[k as keyof typeof overlays] ? col : T.tx3,
                    cursor:'pointer' }}>
                  {label}
                </button>
              )
            )}
            <span style={{ marginLeft:'auto', fontFamily:MONO, fontSize:9, color:T.tx3 }}>
              2550×3300 px · 300dpi
            </span>
          </div>

          {/* Canvas */}
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
            overflow:'hidden', padding:'16px', backgroundColor:T.bgBase }}>
            <div style={{ position:'relative', width:280, height:360,
              backgroundColor:'#f8f8f8', border:`1px solid ${T.border}`,
              boxShadow:'0 4px 20px rgba(0,0,0,0.4)' }}>

              {/* Simulated page content lines */}
              {[14,20,26,32,38,44,52,58,64,70,76,82,88,94].map(y=>(
                <div key={y} style={{ position:'absolute', left:'8%', right:'8%',
                  top:`${y}%`, height:1, backgroundColor:'#ddd' }} />
              ))}

              {/* Dropout region overlays */}
              {overlays.dropout && DROPOUT_REGIONS.map(d=>(
                <div key={d.id} style={{ position:'absolute',
                  left:`${d.x}%`, top:`${d.y}%`, width:`${d.w}%`, height:`${d.h}%`,
                  backgroundColor:`${d.color}33`, border:`1px dashed ${d.color}`,
                  boxSizing:'border-box' }}>
                  <span style={{ position:'absolute', top:1, left:2, fontFamily:MONO,
                    fontSize:7, color:d.color, background:'rgba(0,0,0,0.3)',
                    padding:'0 2px', borderRadius:1 }}>{d.name}</span>
                </div>
              ))}

              {/* OMR field overlays */}
              {overlays.omr && OMR_FIELDS.map((o,i)=>(
                <div key={i} style={{ position:'absolute',
                  left:`${o.x}%`, top:`${o.y}%`, width:`${o.w}%`, height:`${o.h}%`,
                  backgroundColor:'#f59e0b22', border:'1px solid #f59e0b',
                  boxSizing:'border-box' }}>
                  <span style={{ position:'absolute', top:1, left:2, fontFamily:MONO,
                    fontSize:7, color:'#f59e0b', background:'rgba(0,0,0,0.3)',
                    padding:'0 2px', borderRadius:1 }}>{o.name}</span>
                </div>
              ))}

              {/* Field overlays */}
              {overlays.fields && [
                {n:'InvoiceDate',x:55,y:16,w:35,h:6},
                {n:'VendorName', x:8, y:22,w:45,h:6},
                {n:'Total',      x:55,y:28,w:35,h:6},
                {n:'LineRef',    x:8, y:34,w:25,h:6},
              ].map(f=>(
                <div key={f.n} style={{ position:'absolute',
                  left:`${f.x}%`, top:`${f.y}%`, width:`${f.w}%`, height:`${f.h}%`,
                  backgroundColor:'#2dd4bf22', border:`1px solid ${T.accent}`,
                  boxSizing:'border-box' }}>
                  <span style={{ position:'absolute', top:1, left:2, fontFamily:MONO,
                    fontSize:7, color:T.accent, background:'rgba(0,0,0,0.3)',
                    padding:'0 2px', borderRadius:1 }}>{f.n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width:220, flexShrink:0, display:'flex', flexDirection:'column',
          overflowY:'auto' }}>
          <div style={{ padding:'6px 10px', fontSize:9, fontFamily:MONO, color:T.tx3,
            backgroundColor:T.bgBase, borderBottom:`1px solid ${T.border}` }}>
            VARIANT METADATA
          </div>
          {[
            { k:'Page',      v:'PAGE_INVOICE_HEADER' },
            { k:'Variant',   v:variantName },
            { k:'FormID',    v:'1042' },
            { k:'Source',    v:'bytes' },
            { k:'Dimensions',v:'2550 × 3300 px' },
            { k:'Resolution',v:'300 dpi' },
            { k:'Process',   v:proc },
          ].map(({k,v})=>(
            <div key={k} style={{ padding:'5px 10px', borderBottom:`1px solid ${T.border}` }}>
              <div style={{ fontSize:9, fontFamily:MONO, color:T.tx3 }}>{k}</div>
              <div style={{ fontSize:11, color:T.tx1, marginTop:1 }}>{v}</div>
            </div>
          ))}

          <div style={{ padding:'6px 10px', fontSize:9, fontFamily:MONO, color:T.tx3,
            backgroundColor:T.bgBase, borderBottom:`1px solid ${T.border}`,
            borderTop:`1px solid ${T.border}` }}>
            DROPOUT REGIONS ({DROPOUT_REGIONS.length})
          </div>
          {DROPOUT_REGIONS.map(d=>(
            <div key={d.id} style={{ padding:'6px 10px',
              borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:10, height:10, borderRadius:2, flexShrink:0,
                backgroundColor:d.color, opacity:0.7 }} />
              <div>
                <div style={{ fontFamily:MONO, fontSize:10, color:T.tx1 }}>{d.name}</div>
                <div style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>{d.process}</div>
              </div>
            </div>
          ))}

          <div style={{ padding:'6px 10px', fontSize:9, fontFamily:MONO, color:T.tx3,
            backgroundColor:T.bgBase, borderBottom:`1px solid ${T.border}`,
            borderTop:`1px solid ${T.border}` }}>
            OMR FIELDS ({OMR_FIELDS.length})
          </div>
          {OMR_FIELDS.map(o=>(
            <div key={o.name} style={{ padding:'6px 10px',
              borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:10, height:10, border:'2px solid #f59e0b',
                borderRadius:1, flexShrink:0 }} />
              <div>
                <div style={{ fontFamily:MONO, fontSize:10, color:T.tx1 }}>{o.name}</div>
                <div style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>
                  {o.type} · threshold {o.threshold}
                </div>
              </div>
            </div>
          ))}

          <div style={{ padding:'6px 10px', fontSize:9, fontFamily:MONO, color:T.tx3,
            backgroundColor:T.bgBase, borderBottom:`1px solid ${T.border}`,
            borderTop:`1px solid ${T.border}` }}>
            DIAGNOSTICS
          </div>
          <div style={{ padding:'8px 10px', fontSize:11, color:T.tx3 }}>No issues.</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Phase 3: Diagnostics View ──────────────────────────────────────────── */
function DiagnosticsView() {
  const [sevFilter,  setSevFilter]  = useState<string>('all');
  const [srcFilter,  setSrcFilter]  = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string|null>(null);

  const filtered = DIAG_FULL.filter(d=>
    (sevFilter==='all' || d.sev===sevFilter) &&
    (srcFilter==='all' || d.source===srcFilter)
  );
  const sources = ['all',...Array.from(new Set(DIAG_FULL.map(d=>d.source)))];

  const sevColor = (s:string) =>
    s==='error' ? T.red : s==='warn' ? T.amber : T.blue;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ flexShrink:0, padding:'8px 14px', borderBottom:`1px solid ${T.border}`,
        backgroundColor:T.bgPanel, display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:11, color:T.tx1, fontWeight:600 }}>Diagnostics</span>
        <span style={{ fontFamily:MONO, fontSize:10, color:T.amber }}>
          {DIAG_FULL.filter(d=>d.sev==='warn').length} warnings
        </span>
        <span style={{ fontFamily:MONO, fontSize:10, color:T.blue }}>
          {DIAG_FULL.filter(d=>d.sev==='info').length} info
        </span>
        <span style={{ fontFamily:MONO, fontSize:10, color:T.red }}>
          {DIAG_FULL.filter(d=>d.sev==='error').length} errors
        </span>
        <button style={{ marginLeft:'auto', fontFamily:MONO, fontSize:10, padding:'2px 8px',
          background:T.bgBase, border:`1px solid ${T.border}`, borderRadius:3,
          color:T.tx2, cursor:'pointer' }}>Export</button>
      </div>

      {/* Filter bar */}
      <div style={{ flexShrink:0, padding:'6px 14px', borderBottom:`1px solid ${T.border}`,
        backgroundColor:T.bgBase, display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>SEV</span>
        {['all','error','warn','info'].map(s=>(
          <button key={s} onClick={()=>setSevFilter(s)}
            style={{ fontFamily:MONO, fontSize:10, padding:'2px 8px',
              background:sevFilter===s ? (s==='all' ? T.bgPanel : `${sevColor(s)}22`) : 'transparent',
              border:`1px solid ${sevFilter===s ? (s==='all' ? T.border : sevColor(s)) : T.border}`,
              borderRadius:3,
              color:sevFilter===s ? (s==='all' ? T.tx1 : sevColor(s)) : T.tx3,
              cursor:'pointer' }}>
            {s}
          </button>
        ))}
        <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3, marginLeft:8 }}>SOURCE</span>
        {sources.map(s=>(
          <button key={s} onClick={()=>setSrcFilter(s)}
            style={{ fontFamily:MONO, fontSize:10, padding:'2px 8px',
              background:srcFilter===s ? T.bgPanel : 'transparent',
              border:`1px solid ${srcFilter===s ? T.accent : T.border}`,
              borderRadius:3, color:srcFilter===s ? T.accent : T.tx3, cursor:'pointer' }}>
            {s}
          </button>
        ))}
        <span style={{ marginLeft:'auto', fontFamily:MONO, fontSize:9, color:T.tx3 }}>
          {filtered.length} / {DIAG_FULL.length} items
        </span>
      </div>

      {/* Diagnostics table */}
      <div style={{ flex:1, overflowY:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
          <thead>
            <tr style={{ backgroundColor:T.bgBase, position:'sticky', top:0, zIndex:1 }}>
              {['Sev','Source','Title','Message','Object Path','Time'].map(h=>(
                <th key={h} style={{ padding:'5px 10px', textAlign:'left',
                  fontFamily:MONO, fontSize:9, color:T.tx3,
                  borderBottom:`1px solid ${T.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(d=>(
              <>
                <tr key={d.id} onClick={()=>setExpandedId(expandedId===d.id ? null : d.id)}
                  style={{ borderBottom:`1px solid ${T.border}`, cursor:'pointer',
                    backgroundColor:expandedId===d.id ? T.bgHover : 'transparent' }}>
                  <td style={{ padding:'6px 10px' }}>
                    <SevIcon sev={d.sev} size={12}/>
                  </td>
                  <td style={{ padding:'6px 10px' }}>
                    <span style={{ fontFamily:MONO, fontSize:9, padding:'1px 5px',
                      background:`${sevColor(d.sev)}15`,
                      border:`1px solid ${sevColor(d.sev)}`,
                      borderRadius:3, color:sevColor(d.sev) }}>{d.source}</span>
                  </td>
                  <td style={{ padding:'6px 10px', color:T.tx1, fontWeight:500 }}>{d.title}</td>
                  <td style={{ padding:'6px 10px', color:T.tx2, maxWidth:280,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.msg}</td>
                  <td style={{ padding:'6px 10px', fontFamily:MONO, fontSize:9, color:T.accent }}>
                    {d.path || '—'}
                  </td>
                  <td style={{ padding:'6px 10px', fontFamily:MONO, fontSize:9, color:T.tx3 }}>
                    {d.ts}
                  </td>
                </tr>
                {expandedId===d.id && (
                  <tr key={`${d.id}-exp`} style={{ backgroundColor:T.bgHover }}>
                    <td colSpan={6} style={{ padding:'8px 16px 10px 36px' }}>
                      <div style={{ fontSize:11, color:T.tx2, lineHeight:1.7 }}>{d.msg}</div>
                      {d.path && (
                        <div style={{ marginTop:4, fontFamily:MONO, fontSize:9, color:T.accent }}>
                          path: {d.path}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        {filtered.length===0 && (
          <div style={{ padding:'40px', textAlign:'center', color:T.tx3, fontSize:12 }}>
            No diagnostics match the current filter.
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Right Inspector Rail ───────────────────────────────────────────────── */
function RightInspectorRail({ selectedFieldId, activeTab }:{
  selectedFieldId:string|null; activeTab:WorkspaceTab|null;
}) {
  const [mode, setMode] = useState<'metadata'|'type'|'route'>('metadata');
  const field = FIELDS.find(f=>f.id===selectedFieldId);

  return (
    <aside style={{ width:258, flexShrink:0, backgroundColor:T.bgPanel,
      borderLeft:`1px solid ${T.border}`, display:'flex',
      flexDirection:'column', overflow:'hidden' }}>
      {/* Mode tabs */}
      <div style={{ display:'flex', borderBottom:`1px solid ${T.border}`,
        padding:'0 6px', flexShrink:0 }}>
        {(['metadata','type','route'] as const).map(m => (
          <button key={m} onClick={()=>setMode(m)}
            style={{ padding:'8px 8px', fontSize:10, fontFamily:MONO,
              textTransform:'uppercase', letterSpacing:'0.06em',
              color:mode===m?T.accent:T.tx3,
              borderBottom:`2px solid ${mode===m?T.accent:'transparent'}`,
              marginBottom:-1 }}>{m}</button>
        ))}
      </div>

      <div style={{ flex:1, overflow:'auto' }}>
        {field ? (
          <>
            <SectionLabel>Field</SectionLabel>
            <div style={{ margin:'0 8px', borderRadius:5, border:`1px solid ${T.border2}`,
              overflow:'hidden', backgroundColor:T.bgSurface, marginBottom:10 }}>
              {[['name',field.name],['type',field.type],['x',field.x],['y',field.y],
                ['width',field.w],['height',field.h],['source',field.src],
                ['rules',field.rules],['warnings',field.warn]].map(([k,v])=>(
                <div key={k} style={{ display:'grid', gridTemplateColumns:'72px 1fr',
                  padding:'4px 10px', borderBottom:`1px solid ${T.border2}` }}>
                  <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>{k}</span>
                  <span style={{ fontFamily:MONO, fontSize:10,
                    color:k==='name'?T.tx1:k==='type'?T.blue:T.tx2 }}>{v}</span>
                </div>
              ))}
            </div>
            <SectionLabel>Actions</SectionLabel>
            <div style={{ margin:'0 8px', borderRadius:5, border:`1px solid ${T.border2}`,
              overflow:'hidden', backgroundColor:T.bgSurface, marginBottom:10 }}>
              {['Open field rules','Show references','Open raw metadata','Copy field ID'].map(a=>(
                <button key={a} style={{ width:'100%', display:'flex', alignItems:'center',
                  gap:7, padding:'6px 10px', borderBottom:`1px solid ${T.border2}`,
                  fontSize:10, color:T.tx2, textAlign:'left' }}>
                  <ArrowRight size={9} color={T.tx3}/>{a}
                </button>
              ))}
            </div>
          </>
        ) : activeTab?.kind==='page' ? (
          <>
            <SectionLabel>Page</SectionLabel>
            <div style={{ margin:'0 8px', borderRadius:5, border:`1px solid ${T.border2}`,
              overflow:'hidden', backgroundColor:T.bgSurface, marginBottom:10 }}>
              {[['name',activeTab.label],['variants','2'],['fields','4'],
                ['processes','3'],['warnings','1']].map(([k,v])=>(
                <div key={k} style={{ display:'grid', gridTemplateColumns:'72px 1fr',
                  padding:'4px 10px', borderBottom:`1px solid ${T.border2}` }}>
                  <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>{k}</span>
                  <span style={{ fontFamily:MONO, fontSize:10, color:T.tx2 }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ padding:12, textAlign:'center', color:T.tx3, fontSize:10 }}>
              Click a field on the canvas or in the grid to inspect it
            </div>
          </>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', height:'100%', padding:20, gap:10, textAlign:'center' }}>
            <div style={{ width:40, height:40, borderRadius:10, display:'flex',
              alignItems:'center', justifyContent:'center',
              backgroundColor:T.bgSurface, border:`1px solid ${T.border}` }}>
              <Eye size={16} color={T.tx3}/>
            </div>
            <div style={{ fontSize:11, color:T.tx2, fontWeight:600 }}>No selection</div>
            <div style={{ fontSize:10, color:T.tx3, lineHeight:1.6 }}>
              Select a page, field, or object in the tree to inspect it here.
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ─── Bottom Message Window ──────────────────────────────────────────────── */
function BottomMessagePane({ collapsed, onToggle }:{ collapsed:boolean; onToggle:()=>void }) {
  const [filter, setFilter] = useState('all');
  const shown = filter==='all' ? MESSAGES : MESSAGES.filter(m=>m.sev===filter);

  return (
    <div style={{ flexShrink:0, borderTop:`1px solid ${T.border}`,
      backgroundColor:T.bgPanel, display:'flex', flexDirection:'column',
      height:collapsed?32:180 }}>
      {/* Pane header */}
      <div style={{ height:32, display:'flex', alignItems:'center', gap:6,
        padding:'0 12px', flexShrink:0, borderBottom:collapsed?'none':`1px solid ${T.border}` }}>
        <Terminal size={11} color={T.tx3}/>
        <span style={{ fontSize:11, fontWeight:600, color:T.tx1 }}>Messages</span>
        <span style={{ fontFamily:MONO, fontSize:9, backgroundColor:T.amberLo,
          color:T.amber, borderRadius:3, padding:'1px 5px' }}>2w</span>
        {!collapsed && <>
          <div style={{ display:'flex', alignItems:'center', gap:2, marginLeft:10 }}>
            {['all','error','warn','info'].map(f=>(
              <button key={f} onClick={()=>setFilter(f)}
                style={{ fontSize:9, padding:'1px 6px', borderRadius:3, fontFamily:MONO,
                  textTransform:'uppercase', letterSpacing:'0.05em',
                  border:`1px solid ${filter===f?T.accent:T.border}`,
                  backgroundColor:filter===f?T.accentLo:'transparent',
                  color:filter===f?T.accent:T.tx3 }}>{f}</button>
            ))}
          </div>
          <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3, marginLeft:4 }}>
            {shown.length} items
          </span>
        </>}
        <button onClick={onToggle} style={{ marginLeft:'auto', color:T.tx3,
          display:'flex', alignItems:'center', padding:4 }}>
          {collapsed ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
        </button>
      </div>
      {/* Messages */}
      {!collapsed && (
        <div style={{ flex:1, overflow:'auto' }}>
          {shown.map(m => (
            <div key={m.id} style={{ display:'flex', alignItems:'flex-start', gap:8,
              padding:'5px 12px', borderBottom:`1px solid ${T.border2}` }}>
              <SevIcon sev={m.sev} size={11}/>
              <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3, flexShrink:0 }}>{m.ts}</span>
              <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3,
                backgroundColor:T.bgSurface, borderRadius:3, padding:'0 4px',
                flexShrink:0 }}>{m.src}</span>
              <span style={{ fontSize:10, color:T.tx2, flex:1, lineHeight:1.5 }}>{m.msg}</span>
              <button style={{ color:T.tx3, flexShrink:0, display:'flex' }}>
                <Copy size={9}/>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Status Bar ─────────────────────────────────────────────────────────── */
function StatusBar({ warnCount }:{ warnCount:number }) {
  return (
    <div style={{ height:22, flexShrink:0, display:'flex', alignItems:'center',
      padding:'0 12px', backgroundColor:T.bgBase, borderTop:`1px solid ${T.border2}`,
      gap:14 }}>
      {[
        ['fwd.cfd',    <Database size={9} color={T.tx3}/>],
        ['29 rules',   <GitBranch size={9} color={T.tx3}/>],
        ['12 functions',<Zap size={9} color={T.tx3}/>],
        ['6 UDFs',     <Code size={9} color={T.tx3}/>],
      ].map(([label, icon]) => (
        <div key={label as string} style={{ display:'flex', alignItems:'center', gap:4 }}>
          {icon as React.ReactNode}
          <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>{label as string}</span>
        </div>
      ))}
      {warnCount>0 && <div style={{ display:'flex', alignItems:'center', gap:4 }}>
        <AlertTriangle size={9} color={T.amber}/>
        <span style={{ fontFamily:MONO, fontSize:9, color:T.amber }}>{warnCount} warnings</span>
      </div>}
      <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3 }}>142ms</span>
        <span style={{ fontFamily:MONO, fontSize:9, color:T.tx3,
          backgroundColor:T.bgSurface, border:`1px solid ${T.border}`,
          borderRadius:3, padding:'0 5px' }}>Read-only</span>
      </div>
    </div>
  );
}

/* ─── Root ───────────────────────────────────────────────────────────────── */
let tabCounter = 10;
function makeTab(kind: TabKind, label: string): WorkspaceTab {
  return { id: `tab-${++tabCounter}`, kind, label };
}

export function DarkPro() {
  const [tabs, setTabs] = useState<WorkspaceTab[]>([
    { id:'tab-overview', kind:'overview', label:'Overview' },
  ]);
  const [activeTabId, setActiveTabId]     = useState('tab-overview');
  const [explorerSel, setExplorerSel]     = useState<string|null>('root');
  const [expanded, setExpanded]           = useState<Set<string>>(
    new Set(['root','pages','page-inv','documents','processes','resources'])
  );
  const [selectedFieldId, setSelectedFieldId] = useState<string|null>(null);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [searchOpen, setSearchOpen]           = useState(false);

  const warnCount = MESSAGES.filter(m=>m.sev==='warn').length;

  function toggleExpanded(id: string) {
    setExpanded(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  }

  function openTab(kind: TabKind, label: string, nodeId?: string) {
    const existing = tabs.find(t=>t.kind===kind && t.label===label);
    if (existing) { setActiveTabId(existing.id); return; }
    const tab = { ...makeTab(kind, label), nodeId };
    setTabs(prev=>[...prev, tab]);
    setActiveTabId(tab.id);
  }

  function openNodeTab(node: FwdNode) {
    if (!node.tabKind) return;
    openTab(node.tabKind, node.label, node.id);
  }

  function closeTab(id: string) {
    setTabs(prev => prev.filter(t=>t.id!==id));
    if (activeTabId===id) setActiveTabId(tabs.find(t=>t.id!==id)?.id ?? 'tab-overview');
  }

  const activeTab = tabs.find(t=>t.id===activeTabId) ?? null;

  return (
    <div role="application" aria-label="FormWorks Editor"
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
        button:focus-visible{outline:2px solid ${T.accent};outline-offset:2px;border-radius:3px}
        tr:hover td{background-color:${T.bgHover}!important}
        @media(prefers-reduced-motion:reduce){*{transition:none!important}}
      `}</style>

      {/* Search dialog */}
      {searchOpen && (
        <GlobalSearchDialog
          onClose={()=>setSearchOpen(false)}
          onOpen={(kind,label)=>{ openTab(kind,label); setSearchOpen(false); }} />
      )}

      {/* Top command bar */}
      <TopCommandBar warnCount={warnCount} errCount={0} onSearch={()=>setSearchOpen(true)} />

      {/* Tab strip — full width above body */}
      <TabStrip tabs={tabs} activeId={activeTabId}
        onActivate={setActiveTabId} onClose={closeTab}
        onNew={()=>openTab('overview','Overview')} />

      {/* Main body */}
      <div style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>
        {/* Left explorer */}
        <LeftExplorerPane
          selected={explorerSel} expanded={expanded}
          onSelect={id=>{ setExplorerSel(id); setSelectedFieldId(null); }}
          onToggle={toggleExpanded}
          onOpen={openNodeTab} />

        {/* Center workspace */}
        <main style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {activeTab?.kind==='overview' && (
            <OverviewView onOpen={(kind,label)=>openTab(kind,label)} />
          )}
          {activeTab?.kind==='page' && (
            <PageInspectorView pageName={activeTab.label}
              selectedFieldId={selectedFieldId}
              onSelectField={setSelectedFieldId}
              onOpenRules={label=>openTab('rule',label)}
              onOpenVariant={label=>openTab('variant',label)} />
          )}
          {activeTab?.kind==='document' && (
            <DocumentInspectorView docName={activeTab.label}
              onOpenPage={name=>openTab('page',name)} />
          )}
          {activeTab?.kind==='batch' && (
            <BatchInspectorView batchName={activeTab.label} />
          )}
          {activeTab?.kind==='resource' && (
            <ResourceInspectorView resName={activeTab.label} />
          )}
          {activeTab?.kind==='raw' && <RawNodeInspectorView />}
          {activeTab?.kind==='rule' && (
            <RuleEditorView processName={activeTab.label.includes('/') ? activeTab.label.split('/')[1]?.trim() : activeTab.label} />
          )}
          {activeTab?.kind==='process' && (
            <ProcessScopeView processName={activeTab.label} />
          )}
          {activeTab?.kind==='variant' && (
            <VariantInspectorView variantName={activeTab.label} />
          )}
          {activeTab?.kind==='diagnostics' && <DiagnosticsView />}
        </main>

        {/* Right inspector rail */}
        <RightInspectorRail selectedFieldId={selectedFieldId} activeTab={activeTab} />
      </div>

      {/* Bottom message pane */}
      <BottomMessagePane collapsed={bottomCollapsed}
        onToggle={()=>setBottomCollapsed(c=>!c)} />

      {/* Status bar */}
      <StatusBar warnCount={warnCount} />
    </div>
  );
}
