
function renderContent(){
  if(state.workspaceView==='overview')state.workspaceView='structure';
  if(state.workspaceView==='field-resolution')return renderFieldResolutionCatalog();
  if(isLoadStatusView())return isAdvancedMode()?renderMessages():renderStructure();
  if(state.workspaceView==='resources')return renderGlobalResourceDefinitions();
  if(state.workspaceView==='functions')return renderGlobalFunctionDefinitions();
  if(state.workspaceView==='selection-lists')return renderSelectionListPacketDefinitions();
  if(state.workspaceView==='tables')return renderGlobalTablesMasterDetail();
  if(state.workspaceView==='drivers')return renderGlobalDriverDefinitions();
  if(state.workspaceView==='udfs')return renderUdfMasterDetail();
  if(state.workspaceView==='rule-lists')return renderRuleListPacketDefinitions();
  if(isAdvancedMode()&&state.workspaceView==='object-graph')return renderObjectGraphDefinitions();
  if(isAdvancedMode()&&state.workspaceView==='runtime-impact')return renderRuntimeImpactDefinitions();
  return renderStructure();
}
function renderGlobalNavigation(){
  const el=$('globalNav');
  if(!el)return;
  if(!model){el.innerHTML='';return;}
  const counts=globalNavigationCounts();
  function row(action,label,count,title){
    const view=action.replace(/^view-/,'');
    const active=state.workspaceView===view;
    return `<button class="global-view-row ${active?'active':''}" type="button" data-action="${esc(action)}" aria-current="${active?'page':'false'}" title="${esc(title)}"><span class="global-view-name">${esc(label)}</span>${count===undefined?'':`<span class="global-view-count">${fmt(count)}</span>`}</button>`;
  }
  function scopeSection(title,scopes,limit=10){
    const visible=list(scopes).slice(0,limit);
    if(!visible.length)return '';
    const rows=visible.map(scope=>{
      const active=scope.scopeId===state.scopeId&&state.workspaceView==='structure';
      return `<button class="global-view-row scope-shortcut ${active?'active':''}" type="button" data-scope="${esc(scope.scopeId)}" aria-current="${active?'page':'false'}" title="Open ${esc(scope.scopeId)}"><span class="global-view-name">${esc(scope.name||scope.scopeId)}</span><span class="global-view-count">${fmt(scope.structural||scope.rules||0)}</span></button>`;
    }).join('');
    const remaining=scopes.length-visible.length;
    return `<details class="product-nav-folder" ${state.workspaceView==='structure'?'open':''}><summary><span>${esc(title)}</span><b>${fmt(scopes.length)}</b></summary>${rows}${remaining>0?`<button class="global-view-row muted-row" type="button" data-action="nav-${esc(title.toLowerCase())}"><span class="global-view-name">Show ${fmt(remaining)} more</span><span class="global-view-count">Filter</span></button>`:''}</details>`;
  }
  const docs=model.scopes.filter(s=>/document/i.test(s.kind)).sort((a,b)=>text(a.name).localeCompare(text(b.name),undefined,{sensitivity:'base'}));
  const pages=model.scopes.filter(s=>/page/i.test(s.kind)).sort((a,b)=>text(a.name).localeCompare(text(b.name),undefined,{sensitivity:'base'}));
  const processes=model.scopes.filter(s=>/process|\bac\b|\bdv\b|store|ocr|fip/i.test(`${s.kind} ${s.scopeId}`)).sort((a,b)=>text(a.name).localeCompare(text(b.name),undefined,{sensitivity:'base'}));
  const diagnosticsRows=isAdvancedMode()?`<div class="scope-group global-nav-heading advanced-only"><span>Developer</span></div><div class="global-view-list advanced-only">${row('view-load-status','Load Status',counts.messages||model.diags.length,'Advanced load status and configuration warnings')}${row('view-object-graph','Object Graph',counts.objectGraph,'Developer object graph')}${row('view-runtime-impact','Runtime Impact',counts.runtimeImpact,'Developer static impact records')}</div>`:'';
  el.innerHTML=`<div class="left-nav-shell product-left-nav"><div class="fwd-tree-root"><b>FWD</b><span>Read-only FW Editor-style configuration</span></div><div class="scope-group global-nav-heading"><span>Processing</span></div><div class="global-view-list" role="group" aria-label="Processing configuration">${row('view-structure','AC Rule List',undefined,'Selected scope AC Rule List')}${row('view-rule-lists','Rule Lists',counts.ruleLists,'Rule Lists, Status Results, and Action Lists')}</div><div class="scope-group global-nav-heading"><span>Resources</span></div><div class="global-view-list" role="group" aria-label="Resources">${row('view-udfs','User Defined Functions',counts.udfs,'User Defined Functions and caller bindings')}${row('view-functions','Functions',counts.functions,'AC function catalog')}${row('view-tables','Tables',counts.tables,'Table resources')}${row('view-selection-lists','SelectionLists',counts.selectionLists,'SelectionList configuration')}${row('view-resources','Resources',counts.resources,'FWD resource definitions')}${row('view-drivers','Drivers',counts.drivers,'Driver definitions')}</div><div class="scope-group global-nav-heading"><span>FWD Tree</span></div>${scopeSection('Documents',docs,8)}${scopeSection('Pages',pages,12)}${scopeSection('Processes',processes,8)}${diagnosticsRows}</div>`;
}

function modernRowMeta(row,kind){
  const metric=list(row.usage).length||row.metric||row.count||0;
  const stateText=kind==='selection-lists'?(row.selectionList?.schemaParsed?'Parsed schema':'Rule reference'):(row.defined===false?'Observed':'Loaded');
  return `${stateText}${metric?` · ${fmt(metric)} refs`:''}`;
}

function pagedRows(rows,pageSize=300){
  const listRows=list(rows);
  const size=Math.max(50,Math.min(1000,Number(pageSize)||300));
  return { rows:listRows.slice(0,size), total:listRows.length, limit:size, truncated:listRows.length>size };
}

function modernCatalogDetail(kind,row){
  if(!row)return '<div class="product-empty-state"><h3>No item selected</h3><p>Select an item from the list.</p></div>';
  if(kind==='functions')return `${functionConfigurationHtml(row.fn,row)}<div class="table-columns-head">Used By</div>${usagePreviewHtml(row.usage)}${isAdvancedMode()?`<div class="table-columns-head">Raw</div>${previewJsonHtml(row.fn||row,{maxDepth:3,maxArray:60,maxKeys:80,maxChars:16000})}`:''}`;
  if(kind==='selection-lists')return selectionListPacketDetailHtml(row);
  if(kind==='tables'){
    const t=row.table||row;
    return `${tableConfigurationHtml(t,row)}<div class="table-columns-head">Fields / Columns</div>${tableColumnsHtml(t)}<div class="table-columns-head">Used By</div>${usagePreviewHtml(row.usage)}${isAdvancedMode()?`<div class="table-columns-head">Raw</div>${previewJsonHtml(t,{maxDepth:3,maxArray:50,maxKeys:80,maxChars:16000})}`:''}`;
  }
  if(kind==='udfs'){
    const callers=list(row.callerRules);
    return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>UDF Interface</h4><p>${esc(udfAvailabilityMessage(row))}</p></div><span class="badge ${udfHasInternalRules(row)?'green':'amber'}">${udfHasInternalRules(row)?'Rule List available':'Rule List unavailable'}</span></div><div class="kv">${kv('Name',esc(udfShortName(row)))}${kv('Source',esc(row.source||'FWD'))}${kv('Callers',fmt(callers.length))}${kv('Parameters',fmt(list(row.parameterNames).length))}${kv('Status Results',fmt(list(row.statusResults).length))}</div></section>${udfEditorParameterTableHtml(row,callers)}${udfEditorStatusResultsHtml(row)}${udfEditorInternalRuleTreeHtml(row)}${udfEditorCallerRulesHtml(callers,row)}${isAdvancedMode()?udfEditorLoadStatusHtml(row):''}`;
  }
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>${esc(row.name||row.key)}</h4><p>${esc(row.source||'FWD resource')}</p></div><span class="badge blue">${esc(row.type||kind)}</span></div><div class="kv">${kv('Name',esc(row.name||row.key))}${kv('Type',esc(row.type||kind))}${kv('Source',esc(row.source||''))}${kv('References',fmt(list(row.usage).length||row.metric||0))}</div></section><div class="table-columns-head">Used By</div>${usagePreviewHtml(row.usage)}${isAdvancedMode()?`<div class="table-columns-head">Raw</div>${previewJsonHtml(row,{maxDepth:3,maxArray:60,maxKeys:80,maxChars:16000})}`:''}`;
}
function renderModernCatalog(kind,rows,selectedKey,stateKey,copy){
  const q=lower(state.query).trim();
  const filtered=q?rows.filter(row=>definitionSearchText(row).includes(q)):rows;
  if(!filtered.length){$('content').innerHTML=`<section class="product-workspace"><div class="product-empty-state"><h3>${esc(copy.emptyTitle||'No items found')}</h3><p>${esc(copy.emptyBody||'Clear search or choose another area.')}</p></div></section>`;return;}
  const selected=filtered.find(r=>r.key===selectedKey)||filtered[0];
  state[stateKey]=selected.key;
  const page=pagedRows(filtered,300);
  const rowsHtml=page.rows.map(row=>`<button class="product-index-row ${row.key===selected.key?'active':''}" type="button" data-global-kind="${esc(kind)}" data-global-key="${esc(row.key)}"><span><b>${esc(row.name||row.key)}</b><small>${esc(row.type||'Item')} · ${esc(modernRowMeta(row,kind))}</small></span><em>${esc(row.source||'FWD')}</em></button>`).join('');
  $('content').innerHTML=`<section class="product-workspace product-catalog product-catalog-${esc(kind)}"><div class="product-catalog-head"><div><h3>${esc(copy.title)}</h3><p>${esc(copy.body)}</p></div><span class="badge blue">${fmt(filtered.length)} shown</span></div><div class="product-catalog-grid"><aside class="product-index" aria-label="${esc(copy.title)} list">${rowsHtml}${page.truncated?`<div class="caption mt-8">Showing first ${fmt(page.limit)} of ${fmt(page.total)}. Narrow search for more.</div>`:''}</aside><article class="product-detail" aria-label="${esc(copy.title)} detail"><div class="product-detail-head"><div><div class="eyebrow">${esc(copy.title)}</div><h3>${esc(selected.name||selected.key)}</h3><p>${esc(selected.type||selected.source||'Read-only configuration')}</p></div><button class="btn" type="button" data-action="open-global-detail" data-global-kind="${esc(kind)}">Open FW Editor details</button></div>${modernCatalogDetail(kind,selected)}</article></div></section>`;
}
function renderGlobalResourceDefinitions(){
  const rows=buildGlobalResourceDefinitions();
  if(isEditorMode())return renderGlobalDefinitionExplorer('resources',rows,state.selectedResourceKey,'selectedResourceKey',{title:'Resources',body:'Shared FWD resource definitions. Rule usage is shown as references.',emptyTitle:'No resources found',emptyBody:'No FWD resources were loaded.'},row=>`<div class="table-columns-head">Used By</div>${usagePreviewHtml(row.usage)}`);
  return renderModernCatalog('resources',rows,state.selectedResourceKey,'selectedResourceKey',{title:'Resources',body:'Shared FWD resource definitions. Rule usage is shown as references.',emptyTitle:'No resources found',emptyBody:'No FWD resources were loaded.'});
}
function renderGlobalDriverDefinitions(){
  const rows=buildGlobalDriverDefinitions();
  if(isEditorMode())return renderGlobalDefinitionExplorer('drivers',rows,state.selectedDriverKey,'selectedDriverKey',{title:'Drivers',body:'Input, output, and process-private driver definitions.',emptyTitle:'No drivers found',emptyBody:'No driver definitions were loaded.'},row=>`<div class="table-columns-head">Used By</div>${usagePreviewHtml(row.usage)}`);
  return renderModernCatalog('drivers',rows,state.selectedDriverKey,'selectedDriverKey',{title:'Drivers',body:'Input, output, and process-private driver definitions.',emptyTitle:'No drivers found',emptyBody:'No driver definitions were loaded.'});
}
function renderGlobalFunctionDefinitions(){
  const rows=buildGlobalFunctionDefinitions();
  if(isEditorMode())return renderGlobalDefinitionExplorer('functions',rows,state.selectedFunctionName,'selectedFunctionName',{title:'Functions',body:'AC functions with parameter roles, status results, behavior flags, and configured rule usage.',emptyTitle:'No functions found',emptyBody:'No function catalog or rule usage was loaded.'},row=>`${functionConfigurationHtml(row.fn,row)}<div class="table-columns-head">Used By</div>${usagePreviewHtml(row.usage)}`);
  return renderModernCatalog('functions',rows,state.selectedFunctionName,'selectedFunctionName',{title:'Functions',body:'AC functions with parameter roles, status results, behavior flags, and configured rule usage.',emptyTitle:'No functions found',emptyBody:'No function catalog or rule usage was loaded.'});
}
function renderSelectionListPacketDefinitions(){
  const rows=buildSelectionListPacketDefinitions();
  if(isEditorMode())return renderGlobalDefinitionExplorer('selection-lists',rows,state.selectedSelectionListName,'selectedSelectionListName',{title:'SelectionLists',body:'SelectionList configuration and rule usage references.',emptyTitle:'No SelectionLists found',emptyBody:'No SelectionList configuration was loaded.'},selectionListPacketDetailHtml);
  return renderModernCatalog('selection-lists',rows,state.selectedSelectionListName,'selectedSelectionListName',{title:'SelectionLists',body:'SelectionList configuration and rule usage references.',emptyTitle:'No SelectionLists found',emptyBody:'No SelectionList configuration was loaded.'});
}
function renderGlobalTablesMasterDetail(){
  const rows=buildGlobalTableDefinitions().map(t=>({key:t.name,name:t.name,type:t.hasParsedSchema?'Parsed table':'Table',source:t.inferred?'Observed table references':'FWD payload',defined:t.defined,metric:t.hits,usage:list(t.usage),table:t}));
  if(isEditorMode())return renderGlobalDefinitionExplorer('tables',rows,state.selectedTableName,'selectedTableName',{title:'Tables',body:'Table resources and rule usage references. SelectionList behavior is shown separately.',emptyTitle:'No tables found',emptyBody:'No table definitions or references were loaded.'},row=>`${tableConfigurationHtml(row.table||row,row)}<div class="table-columns-head">Fields / Columns</div>${tableColumnsHtml(row.table||row)}<div class="table-columns-head">Used By</div>${usagePreviewHtml(row.usage)}`);
  return renderModernCatalog('tables',rows,state.selectedTableName,'selectedTableName',{title:'Tables',body:'Table resources and rule usage references. SelectionList behavior is shown separately.',emptyTitle:'No tables found',emptyBody:'No table definitions or references were loaded.'});
}
function renderUdfMasterDetail(){
  const allRows=buildUdfDefinitions();
  const filter=state.udfFilter||'all';
  let rows=allRows;
  if(filter==='with-callers')rows=rows.filter(u=>list(u.callerRules).length>0);
  if(filter==='defined')rows=rows.filter(u=>u.definitionParsed||u.defined);
  if(filter==='unparsed')rows=rows.filter(u=>!u.definitionParsed||!udfHasInternalRules(u));
  const q=lower(state.query).trim();
  if(q)rows=rows.filter(u=>lower(u.searchBlob||definitionSearchText({name:u.displayName,key:u.key,type:u.type,source:u.source,udf:u,usage:u.callerRules})).includes(q));
  if(isEditorMode())return renderGlobalDefinitionExplorer('udfs',rows,state.selectedUdfName,'selectedUdfName',{title:'User Defined Functions',body:'User Defined Functions with field-list parameters, status results, caller bindings, and internal Rule Lists.',emptyTitle:'No UDFs found',emptyBody:'No UDF definitions matched the current filter.'},row=>{const callers=list(row.callerRules);return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>UDF Interface</h4><p>${esc(udfAvailabilityMessage(row))}</p></div><span class="badge ${udfHasInternalRules(row)?'green':'amber'}">${udfHasInternalRules(row)?'Rule List available':'Rule List unavailable'}</span></div><div class="kv">${kv('Name',esc(udfShortName(row)))}${kv('Callers',fmt(callers.length))}${kv('Parameters',fmt(list(row.parameterNames).length))}${kv('Status Results',fmt(list(row.statusResults).length))}</div></section>${udfEditorParameterTableHtml(row,callers)}${udfEditorStatusResultsHtml(row)}${udfEditorInternalRuleTreeHtml(row)}${udfEditorCallerRulesHtml(callers,row)}`;});
  return renderModernCatalog('udfs',rows,state.selectedUdfName,'selectedUdfName',{title:'UDFs',body:'User Defined Functions, caller bindings, field-list parameters, status results, and internal Rule List availability.',emptyTitle:'No UDFs found',emptyBody:'No UDF definitions matched the current filter.'});
}
function renderRuleListPacketDefinitions(){
  const rows=buildRuleListPacketDefinitions();
  if(isEditorMode())return renderGlobalDefinitionExplorer('rule-lists',rows,state.selectedRuleListKey,'selectedRuleListKey',{title:'Rule Lists',body:'Rule List inventory with Status Results and Action List references.',emptyTitle:'No Rule Lists found',emptyBody:'No Rule List packet rows were loaded.'},ruleListPacketDetailHtml);
  return renderModernCatalog('rule-lists',rows,state.selectedRuleListKey,'selectedRuleListKey',{title:'Rule Lists',body:'Rule List inventory with Status Results and Action List references.',emptyTitle:'No Rule Lists found',emptyBody:'No Rule List packet rows were loaded.'});
}
function renderMessages(){
  const stats=messageWindowStats();
  const rows=filteredDiags().slice(0,500);
  const rowsHtml=rows.map(d=>`<button class="product-index-row" type="button" data-diag="${esc(d.id)}"><span><b>${esc(d.title||d.severity||'Status message')}</b><small>${esc(d.scopeId||'Snapshot')} · ${esc(d.detail||d.Message||'')}</small></span><em>${esc(d.severity||'Info')}</em></button>`).join('');
  $('content').innerHTML=`<section class="product-workspace product-catalog"><div class="product-catalog-head"><div><h3>Load Status</h3><p>Configuration load status and warnings. This area is hidden unless advanced mode is enabled.</p></div><div class="product-status-inline"><span>Items <b>${fmt(stats.diags.length)}</b></span><span>Warnings <b>${fmt(stats.warningCount)}</b></span><span>Linked <b>${fmt(stats.linkedCount)}</b></span></div></div><div class="product-catalog-grid single"><aside class="product-index">${rowsHtml||'<div class="product-empty-state compact"><h3>No diagnostics</h3><p>No diagnostics match the current filter.</p></div>'}</aside></div></section>`;
}
function normalizeWorkspaceViewForScope(){
  state.workspaceView=normalizeWorkspaceViewName(state.workspaceView);
  if(!validWorkspaceViews().includes(state.workspaceView))state.workspaceView='structure';
  const scope=currentScope();
  if(scope&&state.selectedProcessName&&!processNamesForScope(scope).some(name=>lower(name)===lower(state.selectedProcessName)))state.selectedProcessName='';
}


/* v80 FW Editor parity: selected rule property sheet, keyboard tabs, locked default editor shell, load-status routing, and normal-mode terminology cleanup. */
function fweditorRuleDetailTabsHtml(active='general'){
  const tabs=[
    ['general','General'],
    ['fields','Fields / Parameters'],
    ['attributes','Attributes'],
    ['status-results','Status Results'],
    ['description','Description']
  ];
  return `<div class="fweditor-property-tabs" role="tablist" aria-label="Rule property pages">${tabs.map(([id,label])=>`<button class="${id===active?'active':''}" type="button" data-rule-property-tab="${esc(id)}" role="tab" aria-selected="${id===active?'true':'false'}">${esc(label)}</button>`).join('')}</div>`;
}
function normalizedRulePropertyPage(){
  const page=text(state.rulePropertyPage||state.inspectorView||'general');
  if(page==='summary')return 'general';
  if(page==='config')return 'fields';
  if(page==='actions')return 'status-results';
  return ['general','fields','attributes','status-results','description'].includes(page)?page:'general';
}
function setRulePropertyPage(page){
  const next=['general','fields','attributes','status-results','description'].includes(page)?page:'general';
  state.rulePropertyPage=next;
  renderContent();
  saveState();
}
function ruleGeneralPropertyHtml(n){
  const incoming=model.incomingByChild.get(n.id);
  const parentId=model.parentByChild.get(n.id);
  const parent=parentId?model.nodesById.get(String(parentId)):null;
  const displayPath=first(n.DisplayPath,n.displayPath,n.StructuralPath,n.structuralPath,n.RuleListPath,n.ruleListPath,'Root rule list');
  const disabled=n.disabled==='none'?'Enabled':n.disabled==='direct'?'Disabled':n.disabled==='inherited'?'Disabled by parent':n.disabled==='possible'?'Possibly disabled':'Enabled';
  const functionName=text(n.fn||n.FunctionName||'');
  const udf=udfForFunctionName(functionName);
  return `<div class="fweditor-rule-general"><div class="kv">${kv('Rule Name',esc(n.title||n.RuleName||'Unnamed rule'))}${kv('Function',functionName?linkedDefinitionHtml(functionName,udf?'UDF function':'Function','mono')||`<span class="mono">${esc(functionName)}</span>`:'')}${kv('Function Type',esc(udf?'User Defined':classifyFunction(functionName)))}${kv('Scope',esc(n.scopeId||''))}${kv('Parent Rule',parent?`<button class="btn ghost" type="button" data-node="${esc(parent.id)}">${esc(parent.title)}</button>`:'Root rule list')}${kv('Action List / Sub-list',incoming?`<span class="action-list-chip ${incoming.resolved?'resolved':'unresolved'}">${esc(incoming.label)}</span>`:'Root rule list')}${kv('Rule List Path',`<span class="mono path-line">${esc(displayPath)}</span>`)}${kv('State',esc(disabled))}</div></div>`;
}
function ruleDescriptionPropertyHtml(n){
  const functionName=text(n.fn||n.FunctionName||'');
  const fnMeta=(()=>{try{return buildGlobalFunctionDefinitions().find(row=>sameName(row.name,functionName)||sameName(row.key,functionName));}catch{return null;}})();
  const fn=fnMeta?.fn||{};
  const desc=text(first(fn.description,fn.Description,n.Description,n.description,''));
  const configured=`This read-only property page shows the rule as configured in the FWD: function, field-list parameters, attributes, and Status Result to Action List mapping.`;
  return `<div class="fweditor-description-page"><div class="notice compact"><div class="notice-icon">i</div><div><b>${esc(functionName||'Rule')}</b><br>${esc(desc||configured)}</div></div>${functionMetadataBlock(n)}<div class="table-columns-head mt-12">Rule List Path</div>${pathHtml(n)}</div>`;
}
function fweditorActionListPropertiesHtml(actionList){
  if(!actionList)return '<div class="fweditor-empty">Select a rule or Action List.</div>';
  const rows=actionList.childNodes.length?actionList.childNodes.map(n=>`<button class="mini-row" type="button" data-node="${esc(n.id)}"><span><b>${esc(n.title)}</b><small>${esc(n.fn||'No function')}</small></span><span class="badge blue">Rule</span></button>`).join(''):'<div class="muted">No rules are assigned to this Action List.</div>';
  return `<div class="fweditor-rule-properties action-list-properties"><div class="fweditor-property-title"><div><span class="workspace-eyebrow">Action List / Sub-list</span><h4>${esc(actionList.label)}</h4><p>Parent Rule: ${esc(actionList.parent.title)}</p></div><span class="badge blue">${fmt(actionList.childCount)} child rules</span></div><div class="kv">${kv('Parent Rule',`<button class="btn ghost" type="button" data-node="${esc(actionList.parent.id)}">${esc(actionList.parent.title)}</button>`)}${kv('Status Result / Action',esc(actionList.label))}${kv('Action Index',esc(actionList.actionListIndex??''))}${kv('State',esc(actionList.resolved?'Named Action List':'Indexed Action List'))}</div><div class="table-columns-head mt-12">Rules in this Action List</div><div class="mini-list">${rows}</div></div>`;
}
function fweditorRulePropertiesHtml(){
  const actionList=selectedActionList();
  if(actionList)return fweditorActionListPropertiesHtml(actionList);
  const n=selectedNode();
  if(!n)return '<div class="fweditor-empty">Select a rule from the Rule List to view its read-only FW Editor properties.</div>';
  const active=normalizedRulePropertyPage();
  const paramCount=Object.keys(n.Parameters||{}).length;
  const attrCount=attributeEntriesForRule(n).length;
  const actionRows=actionListRowsForRule(n);
  let body='';
  if(active==='fields')body=`${paramBlockForRule(n)}<div class="table-columns-head mt-12">Field Catalog Match</div>${renderFieldResolutionBlock(resolveNodeFieldReferences(n))}`;
  else if(active==='attributes')body=attributesBlockForRule(n);
  else if(active==='status-results')body=`${statusActionsBlockForRule(n)}<div class="table-columns-head mt-12">Parent Rule / Sub-list Path</div>${parentRuleActionListBlock(n)}`;
  else if(active==='description')body=ruleDescriptionPropertyHtml(n);
  else body=ruleGeneralPropertyHtml(n);
  return `<div class="fweditor-rule-properties"><div class="fweditor-property-title"><div><span class="workspace-eyebrow">Selected Rule</span><h4>${esc(n.title||'Unnamed rule')}</h4><p>${esc(n.fn||'No function')}</p></div><div class="tree-detail-badges"><span class="badge blue">${fmt(paramCount)} fields</span><span class="badge blue">${fmt(attrCount)} attrs</span><span class="badge amber">${fmt(actionRows.length)} statuses</span></div></div>${fweditorRuleDetailTabsHtml(active)}<div class="fweditor-property-body" role="tabpanel">${body}</div></div>`;
}
function renderStructure(){
  const s=currentScope();
  if(!s){return renderOverview();}
  const rows=visibleStructureRows();
  const summary=structureWorkspaceSummary(rows);
  if(isEditorMode()){
    const treeHtml=rows.length
      ? `<div class="tree workspace-tree" role="tree" aria-label="Rule List tree">${rows.map(r=>r.type==='action-list'?actionListRow(r):treeRow(r.n,r.level)).join('')}</div>`
      : emptyHtml('No Rule List entries match','Clear search or choose another scope.');
    const processBox=isAdvancedMode()?`<fieldset class="fweditor-fieldset"><legend>Processes</legend>${processPanelHtml(s)}</fieldset>`:'';
    const ruleListToolbar=`<div class="fweditor-rulelist-toolbar" aria-label="Rule List commands"><span class="fweditor-toolbar-label">Rule List</span><button type="button" class="fweditor-command-button" data-action="expand-all">Expand All</button><button type="button" class="fweditor-command-button" data-action="clear-tree-search" ${text(state.query).trim()?'':'disabled'}>Clear Find</button><span class="fweditor-toolbar-spacer"></span><span class="fweditor-toolbar-note">Read-only configuration view</span></div>`;
    const body=`<div class="fweditor-rulelist-layout"><fieldset class="fweditor-fieldset fweditor-rulelist-fieldset"><legend>Rule List</legend>${ruleListToolbar}<div class="fweditor-scope-summary"><span>Visible Rules <b>${fmt(summary.visibleRules)}</b></span><span>Action Lists <b>${fmt(summary.actionLists)}</b></span><span>Scope Rules <b>${fmt(summary.scopedTotal)}</b></span></div>${treeHtml}</fieldset><fieldset class="fweditor-fieldset fweditor-rule-properties-fieldset"><legend>Rule Properties</legend>${fweditorRulePropertiesHtml()}</fieldset></div>${processBox}`;
    $('content').innerHTML=fweditorScopeRootHtml('structure',`AC Rule List - ${s.name||s.scopeId}`,body,{chips:['Read-only',`${fmt(summary.visibleRules)} visible rules`,`${fmt(summary.actionLists)} action lists`]});
    return;
  }
  const additional=model.nodes.filter(n=>n.scopeId===s.scopeId&&n.isAdditionalRule).length;
  const treeHtml=rows.length?`<div class="tree workspace-tree product-rule-tree" role="tree" aria-label="Rule List tree">${rows.map(r=>r.type==='action-list'?actionListRow(r):treeRow(r.n,r.level)).join('')}</div>`:emptyHtml('No rules match','Clear search or choose another scope.');
  $('content').innerHTML=`<section class="product-workspace product-rules"><div class="product-catalog-head"><div><h3>${esc(s.name||s.scopeId)}</h3><p>Read-only Rule List for this scope. Select a rule to open details.</p></div><div class="product-status-inline"><span>Placed <b>${fmt(Math.max(0,Number(s.structural||0)-additional))}</b></span><span>Additional Rules <b>${fmt(additional)}</b></span></div></div><div class="product-rule-toggles"><button class="chip-btn ${state.inventoryFilter==='all'?'active':''}" type="button" data-action="view-structure">All</button><span class="caption">Additional Rules are readable/searchable rules without confirmed Rule List placement.</span></div>${treeHtml}</section>`;
}

async function init(){
  renderBootLoading();
  try {
    await loadViewerData();
    model=buildModel();
    globalDefinitionLookupCache=null;
    globalTableDefinitionsCache=null;
    globalUdfDefinitionsCache=null;
    globalFunctionDefinitionsCache=null;
    setBootPhase('ready','FWD snapshot loaded');
  } catch (error) {
    setBootPhase('failed',error&&error.message?error.message:'Unable to load FWD snapshot files.');
    reportUiError('data load', error);
    renderNoData();
    return;
  }

  return withUiGuard('boot',()=>{if(!model.scopes.length){renderNoData();return;}restoreSnapshotState();applyPaneLayout();ensurePaneResizers();ensureScrollablePaneFocus();wireDesktopScrollPanFallback();installDesktopPaneMovement();if(!model.scopes.some(s=>s.scopeId===state.scopeId))state.scopeId=model.scopes[0]?.scopeId||'';state.workspaceView=requestedWorkspaceView()||state.workspaceView;seedExpanded(state.scopeId);installPaneResizers();wire();wireEditorPaneResizers();wireGuidanceHints();wireOnboardingChecklist();wireTableSelection();wireUdfSelection();wireGlobalDefinitionSelection();wireEditorPropertyPages();renderAll();});
}

init();
})();
