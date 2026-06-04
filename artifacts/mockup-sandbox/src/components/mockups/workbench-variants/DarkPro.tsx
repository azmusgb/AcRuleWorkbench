import React, { useState } from 'react';
import { Search, ChevronRight, HelpCircle, Moon, ArrowRight, Code, Database, FileText, Layers, GitBranch, Hash, AlertTriangle, CheckCircle, Copy, X } from 'lucide-react';

const C = {
  bg:        '#0d1117',
  panel:     '#161b22',
  surface:   '#1c2230',
  surface2:  '#21283a',
  accent:    '#2dd4bf',
  accentDim: 'rgba(45,212,191,0.10)',
  accentGlow:'rgba(45,212,191,0.25)',
  text:      '#e2e8f0',
  text2:     '#94a3b8',
  text3:     '#4b5563',
  border:    '#2a3348',
  border2:   '#1e2636',
  warn:      '#f59e0b',
  good:      '#34d399',
  bad:       '#f87171',
  info:      '#60a5fa',
  tagPage:   { bg: 'rgba(96,165,250,0.12)', text: '#60a5fa' },
  tagUdf:    { bg: 'rgba(167,139,250,0.12)', text: '#a78bfa' },
  tagDoc:    { bg: 'rgba(52,211,153,0.12)', text: '#34d399' },
};

const MONO = "'JetBrains Mono', ui-monospace, 'Cascadia Code', Menlo, monospace";
const SANS = "Inter, ui-sans-serif, system-ui, sans-serif";

const scopes = [
  { name: 'PAGE_INVOICE_HEADER', type: 'page', rules: 4 },
  { name: 'PAGE_LINE_ITEMS',     type: 'page', rules: 7 },
  { name: 'PAGE_FOOTER',         type: 'page', rules: 2 },
  { name: 'DOC_CAPTURE_MAIN',    type: 'doc',  rules: 11 },
  { name: 'UDF_VENDOR_LOOKUP',   type: 'udf',  rules: 3 },
  { name: 'UDF_TAX_CALC',        type: 'udf',  rules: 2 },
];

const rules = [
  { name: 'ExtractInvoiceDate', fn: 'MatchField',   field: 'invoice_date',   status: 'active', params: 3 },
  { name: 'ExtractVendorName',  fn: 'RegexCapture', field: 'vendor_name',    status: 'active', params: 2 },
  { name: 'ValidateTotal',      fn: 'NumericCheck', field: 'total_amount',   status: 'warn',   params: 4 },
  { name: 'CaptureLineRef',     fn: 'MatchField',   field: 'line_reference', status: 'active', params: 2 },
];

function TypeChip({ type }: { type: string }) {
  const style = type === 'page' ? C.tagPage : type === 'udf' ? C.tagUdf : C.tagDoc;
  return (
    <span style={{
      fontFamily: MONO, fontSize: 9, fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      padding: '1px 5px', borderRadius: 3,
      backgroundColor: style.bg, color: style.text,
    }}>
      {type}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'active' ? C.good : status === 'warn' ? C.warn : C.bad;
  return (
    <span style={{
      display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
      backgroundColor: color, boxShadow: `0 0 6px ${color}`, flexShrink: 0,
    }} />
  );
}

export function DarkPro() {
  const [activeScope, setActiveScope] = useState('PAGE_INVOICE_HEADER');
  const [activeRule,  setActiveRule]  = useState('ExtractInvoiceDate');
  const [activeTab,   setActiveTab]   = useState('Rules');
  const [inspTab,     setInspTab]     = useState('Details');

  const selectedRule = rules.find(r => r.name === activeRule) ?? rules[0];

  return (
    <div style={{
      width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', backgroundColor: C.bg, color: C.text,
      fontFamily: SANS, fontSize: 13,
    }}>
      {/* font + scrollbar */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}
        ::-webkit-scrollbar-thumb:hover{background:${C.text3}}
        button{background:none;border:none;cursor:pointer;color:inherit}
        input{background:none;border:none;outline:none;color:inherit;width:100%}
      `}</style>

      {/* ── TOP BAR ─────────────────────────────── */}
      <header style={{
        height: 56, flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: '0 20px', borderBottom: `1px solid ${C.border}`,
        backgroundColor: C.panel, gap: 16, zIndex: 10,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 260, flexShrink: 0 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: C.accentDim, border: `1px solid ${C.accentGlow}`,
          }}>
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.accent }}>AC</span>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, letterSpacing: '-0.01em' }}>AC Rule Workbench</div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.text2, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 1 }}>
              fwd.cfd · read-only
            </div>
          </div>
        </div>

        {/* Search */}
        <div style={{ flex: 1, maxWidth: 560 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            backgroundColor: C.bg, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: '0 12px', height: 34,
          }}>
            <Search size={13} color={C.text3} />
            <input
              type="text"
              placeholder="Search rules, scopes, UDFs, fields…"
              style={{ flex: 1, fontFamily: SANS, fontSize: 13, color: C.text }}
            />
            <span style={{
              fontFamily: MONO, fontSize: 10, color: C.text3,
              border: `1px solid ${C.border}`, borderRadius: 3, padding: '1px 5px',
            }}>/</span>
          </div>
        </div>

        {/* Right actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            border: `1px solid ${C.border}`, borderRadius: 20,
            padding: '4px 10px', fontSize: 11,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: C.accent, boxShadow: `0 0 8px ${C.accent}`, display: 'inline-block' }} />
            <span style={{ color: C.text2, fontFamily: MONO }}>Ready</span>
          </div>
          <button style={{ padding: 7, borderRadius: 6, color: C.text2 }}><Moon size={15} /></button>
          <button style={{ padding: 7, borderRadius: 6, color: C.text2 }}><HelpCircle size={15} /></button>
        </div>
      </header>

      {/* ── BODY ────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT NAV ─── */}
        <aside style={{
          width: 272, flexShrink: 0,
          backgroundColor: C.panel, borderRight: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Global nav */}
          <div style={{ padding: '12px 12px 10px', borderBottom: `1px solid ${C.border2}` }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 6, paddingLeft: 4 }}>
              Global
            </div>
            {[
              { icon: <Layers size={13} />, label: 'All Scopes', count: 6 },
              { icon: <GitBranch size={13} />, label: 'Global UDFs', count: 5 },
              { icon: <Database size={13} />, label: 'Tables', count: 3 },
            ].map(item => (
              <button key={item.label} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 5, fontSize: 12,
                color: C.text2, textAlign: 'left', marginBottom: 1,
              }}>
                <span style={{ color: C.text3 }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.text3 }}>{item.count}</span>
              </button>
            ))}
          </div>

          {/* Scope list */}
          <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 8, paddingLeft: 4 }}>
              Scopes
            </div>
            {scopes.map(scope => {
              const active = scope.name === activeScope;
              return (
                <button
                  key={scope.name}
                  onClick={() => setActiveScope(scope.name)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 8px', borderRadius: 5, marginBottom: 1,
                    backgroundColor: active ? C.accentDim : 'transparent',
                    borderLeft: active ? `2px solid ${C.accent}` : '2px solid transparent',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ color: active ? C.accent : C.text3 }}>
                    {scope.type === 'udf' ? <Code size={13} /> : scope.type === 'doc' ? <Hash size={13} /> : <FileText size={13} />}
                  </span>
                  <span style={{ flex: 1, fontFamily: MONO, fontSize: 11, color: active ? C.text : C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {scope.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <TypeChip type={scope.type} />
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.text3 }}>{scope.rules}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── MAIN ─── */}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', backgroundColor: C.bg }}>
          {/* Scope heading */}
          <div style={{ padding: '14px 20px 0', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: C.text3 }}>Scopes</span>
                  <ChevronRight size={12} color={C.text3} />
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.accent }}>{activeScope}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: C.text }}>{activeScope}</h2>
                  <TypeChip type={scopes.find(s=>s.name===activeScope)?.type ?? 'page'} />
                </div>
                <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>4 rules · 2 UDF refs · last modified 3 days ago</div>
              </div>
              <button style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
                borderRadius: 5, border: `1px solid ${C.border}`, fontSize: 11, color: C.text2,
              }}>
                <Copy size={12} /> Copy JSON
              </button>
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0 }}>
              {['Rules', 'UDF Refs', 'Tables', 'Raw'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '8px 14px', fontSize: 12, fontWeight: activeTab === tab ? 600 : 400,
                    color: activeTab === tab ? C.accent : C.text2,
                    borderBottom: `2px solid ${activeTab === tab ? C.accent : 'transparent'}`,
                    marginBottom: -1,
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Rule list */}
          <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
            {/* Table header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 140px 100px 80px',
              padding: '6px 12px', marginBottom: 4,
              fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
              textTransform: 'uppercase', color: C.text3,
            }}>
              <div>Rule</div>
              <div>Function</div>
              <div>Field</div>
              <div>Status</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {rules.map(rule => {
                const active = rule.name === activeRule;
                return (
                  <button
                    key={rule.name}
                    onClick={() => setActiveRule(rule.name)}
                    style={{
                      display: 'grid', gridTemplateColumns: '1fr 140px 100px 80px',
                      alignItems: 'center', padding: '10px 12px',
                      borderRadius: 7, textAlign: 'left',
                      backgroundColor: active ? C.surface : C.surface2 + '60',
                      border: `1px solid ${active ? C.accentGlow : C.border2}`,
                      borderLeft: `3px solid ${active ? C.accent : 'transparent'}`,
                      boxShadow: active ? `0 0 0 1px ${C.accentGlow}` : 'none',
                      transition: 'all 0.1s',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: active ? C.text : C.text2 }}>
                        {rule.name}
                      </span>
                      <span style={{ fontSize: 10, color: C.text3 }}>{rule.params} params</span>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: active ? C.accent : C.text2 }}>
                      {rule.fn}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.text2 }}>
                      {rule.field}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <StatusDot status={rule.status} />
                      <span style={{ fontSize: 11, color: C.text2, textTransform: 'capitalize' }}>
                        {rule.status === 'active' ? 'Active' : 'Warning'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Raw config preview */}
            <div style={{ marginTop: 20, borderRadius: 7, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                backgroundColor: C.surface, borderBottom: `1px solid ${C.border}`,
                fontSize: 11, color: C.text2,
              }}>
                <Code size={12} color={C.text3} />
                <span>Raw FWD configuration snippet</span>
                <button style={{ marginLeft: 'auto', color: C.text3 }}><Copy size={11} /></button>
              </div>
              <pre style={{
                padding: '12px 14px', fontFamily: MONO, fontSize: 11,
                lineHeight: 1.7, color: C.text2, backgroundColor: '#080c12',
                overflowX: 'auto', margin: 0,
              }}>{`{
  "scope": "PAGE_INVOICE_HEADER",
  "rules": [
    {
      "id": "rule_001",
      "name": "ExtractInvoiceDate",
      "function": "MatchField",
      "target": "invoice_date",
      "attributes": {
        "regex": "\\d{2}/\\d{2}/\\d{4}",
        "ignoreCase": true
      }
    }
  ]
}`}</pre>
            </div>
          </div>
        </main>

        {/* ── INSPECTOR ─── */}
        <aside style={{
          width: 340, flexShrink: 0,
          backgroundColor: C.panel, borderLeft: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Inspector header */}
          <div style={{ padding: '14px 16px 0', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: C.accentDim, border: `1px solid ${C.accentGlow}`,
                }}>
                  <ArrowRight size={13} color={C.accent} />
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{selectedRule.name}</div>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.text3, marginTop: 1 }}>Extraction Rule</div>
                </div>
              </div>
              <button style={{ color: C.text3 }}><X size={13} /></button>
            </div>
            <div style={{ display: 'flex', gap: 0 }}>
              {['Details', 'Params', 'Status Results'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setInspTab(tab)}
                  style={{
                    padding: '6px 10px', fontSize: 11, fontWeight: inspTab === tab ? 600 : 400,
                    color: inspTab === tab ? C.accent : C.text2,
                    borderBottom: `2px solid ${inspTab === tab ? C.accent : 'transparent'}`,
                    marginBottom: -1, whiteSpace: 'nowrap',
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>

            {/* Function */}
            <Section label="Function">
              <Row mono label="name" value={selectedRule.fn} valueColor={C.accent} />
              <Row mono label="type" value="extraction" />
            </Section>

            {/* Target field */}
            <Section label="Target Field">
              <Row mono label="field" value={selectedRule.field} valueColor={C.info} />
              <Row mono label="type" value="String" />
              <Row mono label="format" value="Date (MM/DD/YYYY)" />
            </Section>

            {/* Attributes */}
            <Section label="Attributes">
              <AttrRow attrKey="regex" value={String.raw`\d{2}/\d{2}/\d{4}`} />
              <AttrRow attrKey="ignoreCase" value="true" />
              <AttrRow attrKey="required" value="true" />
            </Section>

            {/* Status indicator */}
            <Section label="Status">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                {selectedRule.status === 'active'
                  ? <CheckCircle size={13} color={C.good} />
                  : <AlertTriangle size={13} color={C.warn} />}
                <span style={{ fontSize: 11, color: selectedRule.status === 'active' ? C.good : C.warn }}>
                  {selectedRule.status === 'active' ? 'Active · No issues detected' : 'Warning · Check configuration'}
                </span>
              </div>
            </Section>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ borderRadius: 6, border: `1px solid ${C.border2}`, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, mono, valueColor }: { label: string; value: string; mono?: boolean; valueColor?: string }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '90px 1fr',
      padding: '6px 10px', borderBottom: `1px solid ${C.border2}`,
      alignItems: 'center', backgroundColor: C.surface,
    }}>
      <span style={{ fontFamily: MONO, fontSize: 10, color: C.text3 }}>{label}</span>
      <span style={{ fontFamily: mono ? MONO : SANS, fontSize: 11, color: valueColor ?? C.text2 }}>{value}</span>
    </div>
  );
}

function AttrRow({ attrKey, value }: { attrKey: string; value: string }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '90px 1fr',
      padding: '6px 10px', borderBottom: `1px solid ${C.border2}`,
      alignItems: 'center', backgroundColor: C.surface,
    }}>
      <span style={{ fontFamily: MONO, fontSize: 10, color: C.accent }}>{attrKey}</span>
      <span style={{ fontFamily: MONO, fontSize: 11, color: C.text2, wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}
