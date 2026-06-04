import React, { useState } from "react";
import { 
  Search, 
  Settings, 
  HelpCircle, 
  Bell, 
  ChevronRight, 
  Folder, 
  FileCode2, 
  LayoutTemplate,
  ChevronDown,
  Code,
  Box,
  Hash,
  PanelRightClose,
  PanelRightOpen,
  Filter
} from "lucide-react";

export function CleanLight() {
  const [inspectorOpen, setInspectorOpen] = useState(true);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden text-slate-900 font-sans" style={{ backgroundColor: "#f8fafc" }}>
      {/* Top Bar */}
      <header className="h-[72px] shrink-0 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-10 shadow-sm relative">
        <div className="flex items-center gap-3 w-64">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <LayoutTemplate size={18} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-semibold text-slate-900 text-[15px] leading-tight tracking-tight">AC Rule Workbench</h1>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">FormWorks Editor</p>
          </div>
        </div>

        <div className="flex-1 max-w-2xl px-8">
          <div className="relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Search rules, fields, or functions (⌘K)" 
              className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="flex items-center gap-4 w-64 justify-end">
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full border border-emerald-100 shadow-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold">Active Session</span>
          </div>
          <div className="h-6 w-px bg-slate-200 mx-1"></div>
          <button className="text-slate-400 hover:text-slate-600 transition-colors">
            <HelpCircle size={20} />
          </button>
          <button className="text-slate-400 hover:text-slate-600 transition-colors relative">
            <Bell size={20} />
            <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-blue-600 border-2 border-white"></div>
          </button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-200 to-slate-300 ml-2 shadow-inner border border-slate-300"></div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Sidebar */}
        <aside className="w-[312px] shrink-0 bg-[#f1f5f9] border-r border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-200/60">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Global</h2>
            </div>
            <nav className="space-y-1">
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-600 hover:bg-slate-200/50 rounded-md transition-colors">
                <Settings size={16} className="text-slate-400" />
                Workspace Settings
              </button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-600 hover:bg-slate-200/50 rounded-md transition-colors">
                <Folder size={16} className="text-slate-400" />
                All Resources
              </button>
            </nav>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Rule Scopes</h2>
              <button className="text-slate-400 hover:text-slate-600">
                <Filter size={14} />
              </button>
            </div>
            
            <nav className="space-y-1">
              {["PAGE_INVOICE_HEADER", "PAGE_LINE_ITEMS", "PAGE_FOOTER", "DOC_CAPTURE_MAIN", "UDF_VENDOR_LOOKUP", "UDF_TAX_CALC"].map((scope) => {
                const isActive = scope === "PAGE_INVOICE_HEADER";
                return (
                  <button 
                    key={scope}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left transition-all ${
                      isActive 
                        ? "bg-white text-blue-700 shadow-sm border border-slate-200/60 font-medium" 
                        : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
                    }`}
                  >
                    <ChevronDown size={14} className={isActive ? "text-blue-500" : "text-slate-400 -rotate-90"} />
                    <FileCode2 size={16} className={isActive ? "text-blue-600" : "text-slate-400"} />
                    <span className="truncate">{scope}</span>
                  </button>
                )
              })}
            </nav>
          </div>
        </aside>

        {/* Center Main Pane */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#f8fafc]">
          {/* Breadcrumbs */}
          <div className="h-12 border-b border-slate-200 px-6 flex items-center gap-2 text-sm bg-white shrink-0">
            <span className="text-slate-400 hover:text-slate-600 cursor-pointer">Workspace</span>
            <ChevronRight size={14} className="text-slate-300" />
            <span className="text-slate-400 hover:text-slate-600 cursor-pointer">Scopes</span>
            <ChevronRight size={14} className="text-slate-300" />
            <span className="text-slate-900 font-medium flex items-center gap-2">
              <FileCode2 size={14} className="text-blue-600" />
              PAGE_INVOICE_HEADER
            </span>
          </div>

          <div className="p-6 flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-1">PAGE_INVOICE_HEADER</h2>
                  <p className="text-slate-500 text-sm">Contains layout rules for parsing the top section of vendor invoices.</p>
                </div>
                
                <button 
                  onClick={() => setInspectorOpen(!inspectorOpen)}
                  className={`p-2 rounded-md border transition-colors ${
                    inspectorOpen 
                      ? 'bg-blue-50 border-blue-200 text-blue-600' 
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                  title="Toggle Inspector"
                >
                  {inspectorOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
                </button>
              </div>

              {/* Tab Bar within Main area */}
              <div className="flex items-center gap-6 border-b border-slate-200 mb-6">
                <button className="px-1 py-3 border-b-2 border-blue-600 text-blue-700 text-sm font-semibold">Rules (12)</button>
                <button className="px-1 py-3 border-b-2 border-transparent text-slate-500 hover:text-slate-700 text-sm font-medium">Fields (8)</button>
                <button className="px-1 py-3 border-b-2 border-transparent text-slate-500 hover:text-slate-700 text-sm font-medium">UDFs (3)</button>
                <button className="px-1 py-3 border-b-2 border-transparent text-slate-500 hover:text-slate-700 text-sm font-medium">Dependencies</button>
              </div>

              {/* Rule Cards */}
              <div className="space-y-3">
                {[
                  { name: "ExtractInvoiceDate", type: "Extraction", active: false },
                  { name: "ExtractVendorName", type: "Extraction", active: false },
                  { name: "ValidateTotal", type: "Validation", active: true },
                  { name: "CaptureLineRef", type: "Parsing", active: false },
                ].map((rule, idx) => (
                  <div 
                    key={idx}
                    className={`bg-white rounded-xl p-4 border transition-all cursor-pointer flex items-center gap-4 ${
                      rule.active 
                        ? "border-blue-300 shadow-md shadow-blue-900/5 ring-1 ring-blue-600/10" 
                        : "border-slate-200 shadow-sm hover:border-slate-300 hover:shadow"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      rule.type === 'Validation' ? 'bg-orange-50 text-orange-600' : 
                      rule.type === 'Extraction' ? 'bg-purple-50 text-purple-600' : 
                      'bg-slate-100 text-slate-600'
                    }`}>
                      <Code size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={`font-semibold text-base ${rule.active ? 'text-blue-900' : 'text-slate-900'}`}>{rule.name}</h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500">
                          {rule.type}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 truncate">
                        Locates and processes relevant token sequences.
                      </p>
                    </div>
                    <ChevronRight size={18} className={rule.active ? "text-blue-600" : "text-slate-300"} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>

        {/* Right Inspector */}
        {inspectorOpen && (
          <aside className="w-[372px] shrink-0 bg-white border-l border-slate-200 flex flex-col shadow-[-4px_0_24px_-12px_rgba(0,0,0,0.05)] z-20">
            <div className="h-12 border-b border-slate-200 flex items-center px-4 shrink-0 bg-slate-50/50">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Settings size={14} className="text-slate-400" />
                Inspector
              </h2>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <div className="p-5 border-b border-slate-100">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-50 text-orange-700 text-xs font-semibold mb-3 border border-orange-100">
                  <Code size={12} />
                  Validation Rule
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">ValidateTotal</h3>
                <p className="text-sm text-slate-500">Asserts that extracted subtotal + tax equals total amount.</p>
              </div>

              {/* Inspector Tabs */}
              <div className="flex border-b border-slate-200 px-2 mt-2">
                <button className="px-3 py-2 border-b-2 border-blue-600 text-blue-700 text-sm font-medium">Properties</button>
                <button className="px-3 py-2 border-b-2 border-transparent text-slate-500 hover:text-slate-700 text-sm font-medium">Source</button>
                <button className="px-3 py-2 border-b-2 border-transparent text-slate-500 hover:text-slate-700 text-sm font-medium">Audit History</button>
              </div>

              <div className="p-5 space-y-6">
                
                {/* Section */}
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Box size={14} /> Details
                  </h4>
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-sm items-center">
                      <span className="text-slate-500">Function</span>
                      <span className="col-span-2 font-mono text-[13px] bg-slate-50 border border-slate-200 px-2 py-1 rounded text-slate-800 font-medium">MatchField</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm items-center">
                      <span className="text-slate-500">Field</span>
                      <span className="col-span-2 font-medium text-slate-900">invoice_date</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm items-center">
                      <span className="text-slate-500">Confidence</span>
                      <div className="col-span-2 flex items-center gap-2">
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 w-[85%]"></div>
                        </div>
                        <span className="text-xs text-slate-600 font-medium">85%</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-slate-100"></div>

                {/* Section */}
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Hash size={14} /> Attributes
                  </h4>
                  <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                    <div className="grid grid-cols-3 text-xs font-medium text-slate-500 border-b border-slate-200 bg-slate-100/50">
                      <div className="p-2 border-r border-slate-200">Key</div>
                      <div className="col-span-2 p-2">Value</div>
                    </div>
                    <div className="grid grid-cols-3 text-sm text-slate-700 border-b border-slate-100 last:border-0">
                      <div className="p-2 border-r border-slate-200 font-medium">regex</div>
                      <div className="col-span-2 p-2 font-mono text-[13px] text-blue-700">\d{'{'}2{'}'}/\d{'{'}2{'}'}/\d{'{'}4{'}'}</div>
                    </div>
                    <div className="grid grid-cols-3 text-sm text-slate-700 border-b border-slate-100 last:border-0">
                      <div className="p-2 border-r border-slate-200 font-medium">format</div>
                      <div className="col-span-2 p-2 font-mono text-[13px]">MM/DD/YYYY</div>
                    </div>
                    <div className="grid grid-cols-3 text-sm text-slate-700 border-b border-slate-100 last:border-0">
                      <div className="p-2 border-r border-slate-200 font-medium">required</div>
                      <div className="col-span-2 p-2">
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">TRUE</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0">
              <button className="w-full bg-white border border-slate-300 hover:border-slate-400 text-slate-700 font-medium py-2 rounded-lg text-sm transition-colors shadow-sm">
                Edit Configuration
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
