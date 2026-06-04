import React, { useState } from 'react';
import { 
  Search, 
  Settings, 
  ChevronRight, 
  Terminal, 
  Database, 
  FileJson, 
  Code2, 
  Play, 
  AlertCircle,
  Activity,
  Layers,
  Box,
  Braces
} from 'lucide-react';

export function SlateIndustrial() {
  const [selectedScope, setSelectedScope] = useState('PAGE_INVOICE_HEADER');
  const [selectedRule, setSelectedRule] = useState('ExtractInvoiceDate');

  const scopes = [
    "PAGE_INVOICE_HEADER",
    "PAGE_LINE_ITEMS",
    "PAGE_FOOTER",
    "DOC_CAPTURE_MAIN",
    "UDF_VENDOR_LOOKUP",
    "UDF_TAX_CALC"
  ];

  const rules = [
    { name: "ExtractInvoiceDate", type: "Extraction", status: "Active", time: "12ms" },
    { name: "ExtractVendorName", type: "Extraction", status: "Active", time: "45ms" },
    { name: "ValidateTotal", type: "Validation", status: "Warning", time: "8ms" },
    { name: "CaptureLineRef", type: "Capture", status: "Active", time: "22ms" }
  ];

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden selection:bg-amber-500/30 selection:text-amber-200" style={{ backgroundColor: '#1e293b', color: '#f1f5f9', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Top Bar */}
      <header className="h-[72px] flex items-center justify-between px-6 border-b-2" style={{ backgroundColor: '#0f172a', borderColor: '#334155' }}>
        <div className="flex items-center gap-4 w-1/3">
          <div className="flex items-center justify-center w-10 h-10 border-2" style={{ borderColor: '#f59e0b', backgroundColor: '#f59e0b20' }}>
            <Activity size={20} color="#f59e0b" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-widest uppercase" style={{ color: '#f1f5f9' }}>AC Rule Workbench</h1>
            <div className="text-xs font-mono uppercase tracking-widest mt-0.5" style={{ color: '#94a3b8' }}>Diagnostic Mode // V3.7</div>
          </div>
        </div>

        <div className="flex-1 max-w-2xl px-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={18} color="#94a3b8" />
            <input 
              type="text" 
              placeholder="SEARCH CONFIGURATION..." 
              className="w-full h-10 bg-transparent border-2 pl-10 pr-4 font-mono text-sm outline-none transition-colors placeholder:text-slate-600 focus:border-amber-500 uppercase"
              style={{ borderColor: '#334155', color: '#f1f5f9' }}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
              <kbd className="px-1.5 py-0.5 border font-mono text-[10px] uppercase rounded-sm" style={{ borderColor: '#334155', color: '#94a3b8' }}>CTRL</kbd>
              <kbd className="px-1.5 py-0.5 border font-mono text-[10px] uppercase rounded-sm" style={{ borderColor: '#334155', color: '#94a3b8' }}>K</kbd>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-6 w-1/3">
          <div className="flex items-center gap-2 border-2 px-3 py-1.5" style={{ borderColor: '#334155', backgroundColor: '#1e293b' }}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#10b981' }}></div>
            <span className="font-mono text-xs uppercase" style={{ color: '#94a3b8' }}>Engine Idle</span>
          </div>
          <div className="flex items-center gap-3 border-l-2 pl-6" style={{ borderColor: '#334155' }}>
            <button className="p-2 hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-600">
              <Terminal size={18} color="#94a3b8" />
            </button>
            <button className="p-2 hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-600">
              <Settings size={18} color="#94a3b8" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar */}
        <aside className="w-[312px] flex flex-col border-r-2" style={{ backgroundColor: '#0f172a', borderColor: '#334155' }}>
          <div className="p-4 border-b-2" style={{ borderColor: '#334155' }}>
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>Global Scopes</h2>
          </div>
          
          <div className="flex-1 overflow-y-auto py-2 scrollbar-thin scrollbar-thumb-slate-700">
            {scopes.map(scope => (
              <button 
                key={scope}
                onClick={() => setSelectedScope(scope)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left font-mono text-sm transition-colors border-l-4 ${
                  selectedScope === scope 
                    ? 'bg-slate-800 border-amber-500 text-amber-500' 
                    : 'border-transparent text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                {selectedScope === scope ? <ChevronRight size={16} /> : <Box size={16} className="opacity-50" />}
                <span className="truncate">{scope}</span>
              </button>
            ))}
          </div>

          <div className="p-4 border-t-2 font-mono text-xs flex justify-between" style={{ borderColor: '#334155', color: '#94a3b8' }}>
            <span>SCOPES: 24</span>
            <span>UDFS: 12</span>
          </div>
        </aside>

        {/* Center Content */}
        <main className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: '#1e293b' }}>
          
          <div className="h-12 border-b-2 flex items-center px-6 gap-2 font-mono text-sm" style={{ borderColor: '#334155', backgroundColor: '#0f172a' }}>
            <Database size={14} color="#94a3b8" />
            <span style={{ color: '#94a3b8' }}>root</span>
            <span style={{ color: '#334155' }}>/</span>
            <span style={{ color: '#f1f5f9' }}>{selectedScope}</span>
          </div>

          <div className="p-6 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold font-mono tracking-tight">{selectedScope}</h2>
                <p className="text-sm mt-1 font-mono" style={{ color: '#94a3b8' }}>4 rules configured in this scope context.</p>
              </div>
              <button className="flex items-center gap-2 px-4 py-2 font-mono text-sm font-bold border-2 hover:bg-amber-500/10 transition-colors" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>
                <Play size={14} />
                RUN SCOPE
              </button>
            </div>

            <div className="border-2" style={{ borderColor: '#334155', backgroundColor: '#0f172a' }}>
              <div className="grid grid-cols-12 gap-4 p-3 border-b-2 font-mono text-xs font-bold uppercase tracking-wider" style={{ borderColor: '#334155', color: '#94a3b8' }}>
                <div className="col-span-5">Rule Identifier</div>
                <div className="col-span-3">Type</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2 text-right">Exec Time</div>
              </div>

              {rules.map(rule => (
                <button 
                  key={rule.name}
                  onClick={() => setSelectedRule(rule.name)}
                  className={`w-full grid grid-cols-12 gap-4 p-3 text-left font-mono text-sm border-b last:border-b-0 hover:bg-slate-800 transition-colors ${
                    selectedRule === rule.name ? 'bg-slate-800 ring-1 ring-inset ring-amber-500/50' : ''
                  }`}
                  style={{ borderColor: '#334155' }}
                >
                  <div className="col-span-5 flex items-center gap-3 text-slate-100">
                    <Braces size={16} className={selectedRule === rule.name ? 'text-amber-500' : 'text-slate-500'} />
                    {rule.name}
                  </div>
                  <div className="col-span-3 flex items-center text-slate-400">
                    {rule.type}
                  </div>
                  <div className="col-span-2 flex items-center">
                    <span className={`px-2 py-0.5 text-[10px] uppercase font-bold border ${
                      rule.status === 'Active' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-amber-500/30 text-amber-400 bg-amber-500/10'
                    }`}>
                      {rule.status}
                    </span>
                  </div>
                  <div className="col-span-2 flex items-center justify-end text-slate-500">
                    {rule.time}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* Right Inspector */}
        <aside className="w-[372px] flex flex-col border-l-2" style={{ backgroundColor: '#0f172a', borderColor: '#334155' }}>
          <div className="h-12 border-b-2 flex items-center px-4" style={{ borderColor: '#334155' }}>
            <h3 className="font-mono text-sm font-bold uppercase tracking-widest text-slate-100 flex items-center gap-2">
              <Layers size={16} className="text-amber-500" />
              Inspector
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="p-4 border-b-2" style={{ borderColor: '#334155' }}>
              <div className="text-xs font-mono uppercase text-slate-500 mb-1">Selected Rule</div>
              <div className="font-mono font-bold text-lg text-slate-100 break-all">{selectedRule}</div>
            </div>

            <div className="p-4 flex flex-col gap-6">
              
              <div className="space-y-3">
                <div className="text-xs font-mono uppercase font-bold tracking-widest text-slate-500 flex items-center gap-2">
                  <Code2 size={14} /> Properties
                </div>
                <div className="border-2 grid grid-cols-3 font-mono text-sm" style={{ borderColor: '#334155' }}>
                  <div className="col-span-1 p-2 border-r border-b text-slate-400 bg-slate-900" style={{ borderColor: '#334155' }}>Function</div>
                  <div className="col-span-2 p-2 border-b text-amber-400 bg-slate-800" style={{ borderColor: '#334155' }}>MatchField</div>
                  
                  <div className="col-span-1 p-2 border-r border-b text-slate-400 bg-slate-900" style={{ borderColor: '#334155' }}>Target</div>
                  <div className="col-span-2 p-2 border-b text-slate-200 bg-slate-800" style={{ borderColor: '#334155' }}>invoice_date</div>
                  
                  <div className="col-span-1 p-2 border-r text-slate-400 bg-slate-900" style={{ borderColor: '#334155' }}>Condition</div>
                  <div className="col-span-2 p-2 text-slate-200 bg-slate-800" style={{ borderColor: '#334155' }}>Required</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-xs font-mono uppercase font-bold tracking-widest text-slate-500 flex items-center gap-2">
                  <FileJson size={14} /> Attributes
                </div>
                <div className="border-2 p-3 bg-slate-900 font-mono text-sm text-slate-300 relative group" style={{ borderColor: '#334155' }}>
                  <div className="text-slate-500 mb-2"># Pattern matching configuration</div>
                  <div><span className="text-sky-400">regex</span>: <span className="text-emerald-400">{"\\d{2}/\\d{2}/\\d{4}"}</span></div>
                  <div><span className="text-sky-400">ignore_case</span>: <span className="text-amber-400">true</span></div>
                  <div><span className="text-sky-400">fallback</span>: <span className="text-emerald-400">null</span></div>
                </div>
              </div>

              <div className="p-3 border-2 border-amber-500/30 bg-amber-500/5 flex items-start gap-3">
                <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="font-mono text-xs text-amber-200/80 leading-relaxed">
                  Execution time has increased by 15% in the last 24h. Consider optimizing the regular expression.
                </div>
              </div>

            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}
