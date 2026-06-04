import React, { useState } from 'react';
import { Search, ChevronRight, Settings, HelpCircle, Bell, Box, Terminal, Activity, Menu, Maximize2, Moon, ArrowRight, Code, Database, FileText } from 'lucide-react';

export function DarkPro() {
  const [activeScope] = useState("PAGE_INVOICE_HEADER");
  const [activeRule] = useState("ExtractInvoiceDate");
  const [activeTab] = useState("Details");

  const scopes = [
    { name: "PAGE_INVOICE_HEADER", type: "page" },
    { name: "PAGE_LINE_ITEMS", type: "page" },
    { name: "PAGE_FOOTER", type: "page" },
    { name: "DOC_CAPTURE_MAIN", type: "doc" },
    { name: "UDF_VENDOR_LOOKUP", type: "udf" },
    { name: "UDF_TAX_CALC", type: "udf" },
  ];

  const rules = [
    { name: "ExtractInvoiceDate", type: "rule", status: "active" },
    { name: "ExtractVendorName", type: "rule", status: "active" },
    { name: "ValidateTotal", type: "rule", status: "warning" },
    { name: "CaptureLineRef", type: "rule", status: "active" },
  ];

  const colors = {
    bg: '#0f1117',
    panel: '#161b22',
    surface: '#1f2937',
    accent: '#14b8a6',
    accentDim: 'rgba(20, 184, 166, 0.1)',
    text: '#e2e8f0',
    textMuted: '#94a3b8',
    border: '#2d3748',
    warning: '#eab308'
  };

  return (
    <div 
      className="w-screen h-screen flex flex-col overflow-hidden selection:bg-teal-500/30"
      style={{ 
        backgroundColor: colors.bg, 
        color: colors.text,
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" 
      }}
    >
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');
        
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: ${colors.bg};
        }
        ::-webkit-scrollbar-thumb {
          background: ${colors.border};
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: ${colors.textMuted};
        }
      `}} />

      {/* Topbar */}
      <header 
        className="h-[72px] shrink-0 flex items-center justify-between px-6 border-b z-10"
        style={{ 
          backgroundColor: colors.panel, 
          borderColor: colors.border,
          boxShadow: `0 1px 15px rgba(20, 184, 166, 0.05)`
        }}
      >
        <div className="flex items-center gap-4 w-[280px]">
          <div 
            className="w-8 h-8 rounded-md flex items-center justify-center border"
            style={{ backgroundColor: colors.accentDim, borderColor: `${colors.accent}40`, color: colors.accent }}
          >
            <Terminal size={18} />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight">AC Rule Workbench</h1>
            <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: colors.textMuted }}>
              v3.7.0-beta
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-2xl px-8">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={16} style={{ color: colors.textMuted }} />
            </div>
            <input 
              type="text" 
              placeholder="Search rules, scopes, or UDFs... (Ctrl+K)" 
              className="w-full h-10 pl-10 pr-4 rounded-md outline-none transition-all text-sm"
              style={{ 
                backgroundColor: colors.bg, 
                border: `1px solid ${colors.border}`,
                color: colors.text
              }}
              onFocus={(e) => {
                e.target.style.borderColor = colors.accent;
                e.target.style.boxShadow = `0 0 0 1px ${colors.accent}`;
              }}
              onBlur={(e) => {
                e.target.style.borderColor = colors.border;
                e.target.style.boxShadow = 'none';
              }}
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: colors.border, color: colors.textMuted }}>⌘K</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 w-[280px] justify-end">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.accent, boxShadow: `0 0 8px ${colors.accent}` }}></div>
            <span style={{ color: colors.textMuted }}>Engine Ready</span>
          </div>
          
          <div className="h-6 w-px" style={{ backgroundColor: colors.border }}></div>
          
          <button className="p-2 rounded hover:bg-opacity-80 transition-colors" style={{ color: colors.textMuted }}>
            <Bell size={18} />
          </button>
          <button className="p-2 rounded hover:bg-opacity-80 transition-colors" style={{ color: colors.textMuted }}>
            <HelpCircle size={18} />
          </button>
          <button className="p-2 rounded hover:bg-opacity-80 transition-colors" style={{ color: colors.textMuted }}>
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Nav */}
        <aside 
          className="w-[312px] shrink-0 border-r flex flex-col"
          style={{ backgroundColor: colors.panel, borderColor: colors.border }}
        >
          <div className="p-4 border-b" style={{ borderColor: colors.border }}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: colors.textMuted }}>
              Global
            </div>
            <div className="space-y-1">
              <button className="w-full flex items-center gap-3 px-2 py-2 rounded text-sm hover:bg-opacity-50 transition-colors" style={{ backgroundColor: colors.surface }}>
                <Database size={16} style={{ color: colors.textMuted }} />
                <span>All Rule Scopes</span>
              </button>
              <button className="w-full flex items-center gap-3 px-2 py-2 rounded text-sm hover:bg-opacity-50 transition-colors">
                <Box size={16} style={{ color: colors.textMuted }} />
                <span>Global UDFs</span>
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center justify-between" style={{ color: colors.textMuted }}>
              <span>Scopes (6)</span>
              <Menu size={12} />
            </div>
            
            <div className="space-y-1 border-l ml-2" style={{ borderColor: colors.border }}>
              {scopes.map(scope => (
                <button 
                  key={scope.name}
                  className="w-full flex items-center gap-2 pl-3 pr-2 py-1.5 text-xs text-left relative group transition-colors"
                  style={{ 
                    color: scope.name === activeScope ? colors.accent : colors.textMuted,
                  }}
                >
                  <div 
                    className="absolute left-[-1px] top-0 bottom-0 w-[2px] transition-all"
                    style={{ 
                      backgroundColor: scope.name === activeScope ? colors.accent : 'transparent',
                      opacity: scope.name === activeScope ? 1 : 0 
                    }}
                  />
                  {scope.type === 'page' ? <FileText size={14} /> : scope.type === 'udf' ? <Code size={14} /> : <Box size={14} />}
                  <span className="truncate">{scope.name}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: colors.bg }}>
          {/* Breadcrumbs */}
          <div className="h-12 border-b flex items-center px-6 text-sm" style={{ borderColor: colors.border }}>
            <span style={{ color: colors.textMuted }}>Scopes</span>
            <ChevronRight size={14} className="mx-2" style={{ color: colors.textMuted }} />
            <span style={{ color: colors.accent }}>{activeScope}</span>
          </div>
          
          {/* Content area */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold mb-1">{activeScope}</h2>
                <p className="text-sm" style={{ color: colors.textMuted }}>4 active rules configured for this scope</p>
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 rounded text-xs border hover:bg-opacity-80 transition-colors" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
                  Export JSON
                </button>
              </div>
            </div>

            <div className="border rounded-md overflow-hidden" style={{ borderColor: colors.border, backgroundColor: colors.panel }}>
              <div className="grid grid-cols-12 gap-4 p-3 border-b text-xs font-bold uppercase tracking-wider" style={{ borderColor: colors.border, color: colors.textMuted, backgroundColor: colors.surface }}>
                <div className="col-span-5">Rule Name</div>
                <div className="col-span-3">Type</div>
                <div className="col-span-3">Status</div>
                <div className="col-span-1"></div>
              </div>
              
              <div className="divide-y" style={{ borderColor: colors.border }}>
                {rules.map(rule => (
                  <div 
                    key={rule.name}
                    className="grid grid-cols-12 gap-4 p-3 items-center text-sm cursor-pointer hover:bg-opacity-50 transition-colors"
                    style={{ 
                      backgroundColor: rule.name === activeRule ? colors.surface : 'transparent',
                      borderLeft: rule.name === activeRule ? \`2px solid \${colors.accent}\` : '2px solid transparent'
                    }}
                  >
                    <div className="col-span-5 font-medium flex items-center gap-2" style={{ color: rule.name === activeRule ? colors.text : colors.textMuted }}>
                      <Activity size={14} />
                      {rule.name}
                    </div>
                    <div className="col-span-3">
                      <span className="px-2 py-1 rounded text-[10px] uppercase border" style={{ borderColor: colors.border, color: colors.textMuted }}>
                        Extraction
                      </span>
                    </div>
                    <div className="col-span-3 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: rule.status === 'active' ? colors.accent : colors.warning }}></div>
                      <span className="capitalize text-xs" style={{ color: colors.textMuted }}>{rule.status}</span>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <ChevronRight size={16} style={{ color: colors.textMuted }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Raw JSON View snippet */}
            <div className="mt-8 border rounded-md" style={{ borderColor: colors.border }}>
              <div className="p-3 border-b flex items-center gap-2 text-xs" style={{ borderColor: colors.border, backgroundColor: colors.surface, color: colors.textMuted }}>
                <Code size={14} />
                <span>Raw Configuration</span>
              </div>
              <div className="p-4 text-xs whitespace-pre font-mono overflow-x-auto" style={{ color: colors.textMuted, backgroundColor: '#0a0c10' }}>
{`{
  "scope": "PAGE_INVOICE_HEADER",
  "rules": [
    {
      "id": "rule_1",
      "name": "ExtractInvoiceDate",
      "type": "extraction",
      "target": "invoice_date"
    }
  ]
}`}
              </div>
            </div>
          </div>
        </main>

        {/* Right Inspector */}
        <aside 
          className="w-[372px] shrink-0 border-l flex flex-col"
          style={{ backgroundColor: colors.panel, borderColor: colors.border }}
        >
          <div className="h-12 border-b flex items-center justify-between px-4" style={{ borderColor: colors.border }}>
            <span className="font-bold text-sm">Inspector</span>
            <Maximize2 size={14} style={{ color: colors.textMuted }} className="cursor-pointer hover:text-white" />
          </div>
          
          <div className="p-4 border-b" style={{ borderColor: colors.border }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded flex items-center justify-center border" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
                <Activity size={16} style={{ color: colors.accent }} />
              </div>
              <div>
                <h3 className="font-bold text-sm">{activeRule}</h3>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: colors.textMuted }}>Extraction Rule</div>
              </div>
            </div>
          </div>

          <div className="flex px-4 border-b text-xs" style={{ borderColor: colors.border }}>
            {['Details', 'Parameters', 'History'].map(tab => (
              <button 
                key={tab}
                className="py-3 px-4 relative transition-colors"
                style={{ 
                  color: activeTab === tab ? colors.accent : colors.textMuted,
                  fontWeight: activeTab === tab ? 700 : 400
                }}
              >
                {tab}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: colors.accent }} />
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: colors.textMuted }}>Function</div>
              <div className="p-3 rounded border text-sm font-medium flex items-center justify-between" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
                <span style={{ color: colors.accent }}>MatchField</span>
                <ArrowRight size={14} style={{ color: colors.textMuted }} />
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: colors.textMuted }}>Target Field</div>
              <div className="p-3 rounded border text-sm" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
                <div className="flex items-center gap-2 mb-1">
                  <Database size={14} style={{ color: colors.textMuted }} />
                  <span>invoice_date</span>
                </div>
                <div className="text-[10px]" style={{ color: colors.textMuted }}>Type: String / Format: Date</div>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: colors.textMuted }}>Attributes</div>
              <div className="rounded border overflow-hidden" style={{ borderColor: colors.border }}>
                <div className="grid grid-cols-3 p-2 border-b text-xs font-bold" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
                  <div className="col-span-1" style={{ color: colors.textMuted }}>Key</div>
                  <div className="col-span-2" style={{ color: colors.textMuted }}>Value</div>
                </div>
                <div className="grid grid-cols-3 p-2 border-b text-xs items-center" style={{ borderColor: colors.border }}>
                  <div className="col-span-1 font-mono" style={{ color: colors.accent }}>regex</div>
                  <div className="col-span-2 font-mono break-all p-1 rounded" style={{ backgroundColor: '#0a0c10', color: colors.textMuted }}>
                    \d{'{2}'}/\d{'{2}'}/\d{'{4}'}
                  </div>
                </div>
                <div className="grid grid-cols-3 p-2 text-xs items-center" style={{ borderColor: colors.border }}>
                  <div className="col-span-1 font-mono" style={{ color: colors.accent }}>ignoreCase</div>
                  <div className="col-span-2 font-mono">
                    <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.surface }}>true</span>
                  </div>
                </div>
              </div>
            </div>
            
          </div>
        </aside>
      </div>
    </div>
  );
}
