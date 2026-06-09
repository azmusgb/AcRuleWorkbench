
function pathObjects(n){const path=[];let cur=n,guard=0;while(cur&&guard++<128){const incoming=model.incomingByChild.get(cur.id);path.push({nodeId:cur.id,name:cur.title,functionName:cur.fn||null,incomingAction:incoming?{label:incoming.label,actionListIndex:first(incoming.ActionListIndex,incoming.actionListIndex,null),resolved:!!incoming.resolved}:null});const parent=model.parentByChild.get(cur.id);cur=parent?model.nodesById.get(String(parent)):null;}return path.reverse();}
function renderGenericInspector(obj,label){
  const linked=obj.nodeId?model.nodesById.get(String(obj.nodeId)):null;
  renderInspectorTabBar(['summary','raw']);
  if(state.inspectorView==='raw'){
    $('inspectorBody').innerHTML=`<pre class="raw">${esc(JSON.stringify(obj,null,2))}</pre>`;
    return;
  }
  $('inspectorBody').innerHTML=`<div class="panel inspector-summary-card"><h3>${esc(label)}</h3><div class="kv">${Object.keys(obj).slice(0,18).map(k=>kv(k,esc(typeof obj[k]==='object'?JSON.stringify(obj[k]):obj[k]))).join('')}</div></div>${linked?`<button class="btn primary" type="button" data-action="open-linked-node">Open linked structural node</button>`:''}`;
}
function ancestors(n){const rows=[];let cur=n;const seen=new Set();while(cur&&!seen.has(cur.id)){seen.add(cur.id);rows.unshift(cur);const p=model.parentByChild.get(cur.id);cur=p?model.nodesById.get(p):null;}return rows;}
function pathHtml(n){return `<div class="action-list-path">${ancestors(n).map((a,i)=>{const e=model.incomingByChild.get(a.id);return `${i?'<span class="action-list-arrow">-&gt;</span>':''}<span class="action-list-step">${i?actionListChip(e):'<span class="action-list-chip root">root rule list</span>'}<b title="${esc(a.title)}">${esc(a.title)}</b></span>`}).join('')}</div>`;}
function outgoingGroups(n){const edges=list(model.edgesByParent.get(n.id));const groups={};edges.forEach(e=>{const key=e.label||'Unnamed';(groups[key]||(groups[key]=[])).push(e);});return groups;}

function actionListSummaryHtml(n){
  const groups=outgoingGroups(n);
  const names=Object.keys(groups);
  if(!names.length)return '<div class="muted">This rule has no child Action Lists.</div>';
  return `<div class="action-list-summary">${names.map(name=>`<span class="action-list-summary-chip"><b>${esc(name)}</b><span>${fmt(groups[name].length)} ${groups[name].length===1?'child':'children'}</span></span>`).join('')}</div><div class="caption mt-8">These are outgoing Action Lists owned by this rule. Each child rule below the Action List has one incoming action from its parent rule status result.</div>`;
}
function sectionHtml(title,count,body,open=true){return `<details class="inspector-section" ${open?'open':''}><summary>${esc(title)}${count!==undefined?` <span class="section-count">${esc(count)}</span>`:''}</summary><div class="inspector-section-body">${body}</div></details>`;}

const inspectorTabLabels={
  summary:'General',
  general:'General',
  fields:'Fields / Parameters',
  attributes:'Attributes',
  'status-results':'Status Results',
  description:'Description',
  config:'Fields / Parameters',
  actions:'Status Results',
  references:'References',
  messages:'Load Status',
  raw:'Advanced / Raw'
};
function normalizeInspectorTab(available){
  const tabs=list(available).filter(Boolean);
  if(!tabs.length)return;
  if(!tabs.includes(state.inspectorView))state.inspectorView=tabs.includes('general')?'general':(tabs.includes('summary')?'summary':tabs[0]);
}
function renderInspectorTabBar(available,counts={}){
  const tabs=list(available).filter(Boolean);
  normalizeInspectorTab(tabs);
  const host=optionalElement('inspectorTabs');
  if(!host)return;
  host.innerHTML=`<div class="inspector-tablist" role="tablist" aria-label="Inspector sections">${tabs.map(tab=>{
    const count=counts[tab];
    const label=inspectorTabLabels[tab]||tab;
    const active=state.inspectorView===tab;
    const countHtml=count===undefined?'':`<span class="inspector-tab-count">${esc(count)}</span>`;
    return `<button class="inspector-tab ${active?'active':''}" type="button" role="tab" aria-selected="${active?'true':'false'}" data-inspector-tab="${esc(tab)}">${esc(label)}${countHtml}</button>`;
  }).join('')}</div>`;
}

function renderNodeInspector(n){
 const incoming=model.incomingByChild.get(n.id);
 const refs=model.rels.filter(r=>String(r.nodeId)===String(n.id));
 const diags=model.diags.filter(d=>String(d.nodeId)===String(n.id));
 const paramCount=Object.keys(n.Parameters||{}).length;
 const attrCount=attributeEntriesForRule(n).length;
 const actionRows=actionListRowsForRule(n);
 const disabledHtml=n.disabled==='none'?'<span class="muted">Enabled</span>':n.disabled==='direct'?'<span class="badge red">Direct disabled</span>':n.disabled==='possible'?'<span class="badge amber">Possibly disabled by sequence</span>':'<span class="badge amber">Disabled by parent</span>';
 const displayPath=first(n.DisplayPath,n.displayPath,n.StructuralPath,n.structuralPath,n.RuleListPath,n.ruleListPath,'Root');
 const params=paramBlockForRule(n);
 const attributes=attributesBlockForRule(n);
 const statusActions=statusActionsBlockForRule(n);
 const fieldResolution=resolveNodeFieldReferences(n);
 const fieldBody=renderFieldResolutionBlock(fieldResolution);
 const parentActionPath=parentRuleActionListBlock(n);
 const relBody=refs.length?refs.slice(0,120).map(r=>`<div class="split-row my-7"><span>${esc(r.kind)} -&gt; <b>${relationshipTargetHtml(r)}</b><div class="caption">${esc(r.targetType||'Reference')}</div></span><span class="badge blue">configured</span></div>`).join(''):'<div class="muted">No references are linked to this rule in the current snapshot.</div>';
 const diagBody=diags.length?diags.map(d=>`<div class="notice compact"><div class="notice-icon">!</div><div><b>${esc(d.title)}</b><br>${esc(d.detail)}</div></div>`).join(''):'<div class="muted">No diagnostics linked to this rule.</div>';
 const summary=`${configStatusStripHtml(n)}<div class="kv mt-12">${kv('Rule name',esc(n.title))}${kv('Function',`<span class="mono">${esc(n.fn||'')}</span>`)}${kv('Scope',esc(n.scopeId))}${kv('Display path',`<span class="mono path-line">${esc(displayPath)}</span>`)}${kv('Parent action',incoming?`<span class="action-list-chip ${incoming.resolved?'resolved':'unresolved'}">${esc(incoming.label)}</span>`:'Root rule list')}${kv('Disabled state',disabledHtml)}${kv('Sub-list children',fmt(childIds(n.id).length))}${kv('References',fmt(refs.length))}${kv('Node',esc(n.id))}</div><div class="inline-actions mt-12"><button class="btn" type="button" data-action="copy-action-list-path">Copy Action List path</button><button class="btn primary" type="button" data-action="copy-rule-config">Copy config</button></div>`;
 const canonicalConfig=canonicalRuleConfigurationHtml(n);
 const raw=`<pre class="raw">${esc(JSON.stringify(n,null,2))}</pre>`;
 renderInspectorTabBar(['summary','config','actions',...(isAdvancedMode()?['references','messages','raw']:[])],{
   summary:'rule',
   config:fmt(paramCount+attrCount),
   actions:fmt(actionRows.length),
   references:fmt(refs.length),
   messages:fmt(diags.length),
   raw:'JSON'
 });
 if(state.inspectorView==='summary'){
   $('inspectorBody').innerHTML=`${sectionHtml('Summary','rule',summary,true)}${sectionHtml('Function Metadata','function',functionMetadataBlock(n),true)}${pathNarrativeHtml(n)}`;
 }else if(state.inspectorView==='config'){
   $('inspectorBody').innerHTML=`${canonicalConfig}${sectionHtml('Fields / Parameters',paramCount,`${params}<div class="table-columns-head mt-12">Field Catalog Match</div>${fieldBody}`,true)}${sectionHtml('Attributes',attrCount,attributes,true)}`;
 }else if(state.inspectorView==='actions'){
   $('inspectorBody').innerHTML=`${sectionHtml('Status Results / Actions',actionRows.length,statusActions,true)}${sectionHtml('Parent Rule / Sub-list Path','path',parentActionPath,true)}`;
 }else if(state.inspectorView==='references'){
   $('inspectorBody').innerHTML=`${sectionHtml('References',refs.length,relBody,true)}`;
 }else if(state.inspectorView==='messages'){
   $('inspectorBody').innerHTML=`${sectionHtml('Load Status',diags.length,diagBody,true)}`;
 }else{
   $('inspectorBody').innerHTML=raw;
 }
}

function sameName(a,b){return text(a).trim().toLowerCase()===text(b).trim().toLowerCase();}
function udfForFunctionName(functionName){
  const fn=text(functionName).trim();
  if(!fn)return null;
  try{
    return buildUdfDefinitions().find(u=>sameName(u.key,fn)||sameName(u.rawName,fn)||sameName(u.displayName,fn)||(u.displayName||'').split(': ').some(part=>sameName(part,fn)))||null;
  }catch{return null;}
}
function valuePreview(values,limit=8,hint=''){
  const vals=list(values).map(text).filter(v=>v.length>0);
  if(!vals.length)return '<span class="muted">empty</span>';
  return vals.slice(0,limit).map(v=>{
    const match=resolveDefinitionNav(v,hint);
    if(match)return definitionButtonHtml(match,v,'param-value-chip linked');
    return `<span class="param-value-chip" title="${esc(v)}">${esc(v)}</span>`;
  }).join('')+(vals.length>limit?`<span class="muted">+${fmt(vals.length-limit)}</span>`:'');
}
function paramBlock(p,interfaceNames=[]){
  const entries=callerParameterEntries(p||{},interfaceNames);
  if(!entries.length)return '<div class="muted">No parsed fields or parameters.</div>';
  return `<div class="fw-param-list">${entries.map(entry=>{
    const rawHint=entry.rawName&&entry.rawName!==entry.displayName?`<small>FWD slot: ${esc(entry.rawName)}</small>`:'';
    const hint=[entry.displayName,entry.rawName].join(' ');
    return `<div class="fw-param-row"><div class="fw-param-name"><b>${esc(entry.displayName)}</b>${rawHint}</div><div class="fw-param-values">${valuePreview(entry.values,12,hint)}</div></div>`;
  }).join('')}</div>`;
}
function ruleParameterInterfaceNames(n){
  const udf=udfForFunctionName(n?.fn||n?.FunctionName||'');
  return udf?effectiveUdfParameterNames(udf):[];
}
function paramBlockForRule(n){return paramBlock(n?.Parameters||{},ruleParameterInterfaceNames(n));}
function attributeEntriesForRule(n){
  const merged={};
  function addObject(obj){
    if(!obj||typeof obj!=='object'||Array.isArray(obj))return;
    Object.entries(obj).forEach(([k,v])=>{const key=String(k||'').toLowerCase();if(k&&!(key.startsWith('disabled')&&key.endsWith('e'+'vidence')))merged[k]=v;});
  }
  addObject(n?.Attributes);addObject(n?.attributes);addObject(n?.ConfigAttributes);addObject(n?.configurationAttributes);addObject(n?.RuleAttributes);addObject(n?.ruleAttributes);
  return Object.entries(merged).filter(([k,v])=>k&&v!==undefined&&v!==null).sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'}));
}
function attributesBlockForRule(n){
  const entries=attributeEntriesForRule(n);
  if(!entries.length)return '<div class="muted">No rule configuration attributes were extracted for this rule.</div>';
  return `<div class="fw-attr-list">${entries.map(([k,v])=>`<div class="fw-attr-row"><b>${esc(k)}</b><span class="mono">${esc(typeof v==='object'?JSON.stringify(v):v)}</span></div>`).join('')}</div>`;
}
function classifyFunction(fn){
  const name=text(fn);
  if(!name)return '';
  if(/^_I/i.test(name))return 'Intrinsic';
  if(/table|select|lookup|sl|plug/i.test(name))return 'Table';
  if(/format|copy|delete|map|parse|merge|split|sort|upper|subst|clear/i.test(name))return 'Formatting';
  if(/check|compare|empty|regex|match|count|valid|test/i.test(name))return 'Testing';
  if(/rectif|confirm|repair/i.test(name))return 'Rectifying';
  if(udfForFunctionName(name))return 'User Defined';
  return 'Function';
}
function functionMetadataBlock(n){
  const fn=text(n?.fn||n?.FunctionName||'');
  if(!fn)return '<div class="muted">No function name was extracted for this rule.</div>';
  const udf=udfForFunctionName(fn);
  const version=first(n.FunctionVersion,n.functionVersion,'');
  const attrs=attributeEntriesForRule(n);
  const rows=[
    ['Function name',linkedDefinitionHtml(fn,udf?'UDF function':'Function','mono function-definition-link')||`<span class="mono">${esc(fn)}</span>`],
    ['Category',udf?linkedDefinitionHtml(udf.displayName||udf.rawName||fn,'UDF','')||'User Defined':esc(classifyFunction(fn))],
    version?['Function version',`<span class="mono">${esc(version)}</span>`]:null,
    udf?['UDF interface',`${fmt(effectiveUdfParameterNames(udf).length)} field-list parameter(s)`]:null,
    ['Configured attributes',fmt(attrs.length)],
    ['Sources',fmt(list(n.Sources).length)]
  ].filter(Boolean);
  return `<div class="kv">${rows.map(([k,v])=>kv(k,v)).join('')}</div>`;
}
function actionListRowsForRule(n){
  const groups=childActionListGroups(n.id);
  const statusNames=actionNamesOf(n);
  const byIndex=new Map();
  groups.forEach(g=>{
    const key=String(first(g.actionListIndex,''));
    if(!byIndex.has(key))byIndex.set(key,[]);
    byIndex.get(key).push(g);
  });
  const indices=new Set();
  statusNames.forEach((_,i)=>indices.add(String(i)));
  groups.forEach(g=>indices.add(String(first(g.actionListIndex,''))));
  if(!indices.size)return [];
  return [...indices].sort((a,b)=>(Number(a)-Number(b))||a.localeCompare(b)).map(idx=>{
    const i=Number(idx);
    const gs=byIndex.get(idx)||[];
    const firstGroup=gs[0];
    const status=text(statusNames[i]||firstGroup?.label||`Status ${idx}`);
    const childIds=gs.flatMap(g=>g.childIds||[]).map(String);
    const childNames=childIds.map(id=>model.nodesById.get(id)?.title||`Node ${id}`).filter(Boolean);
    return {index:idx,status,actionLabel:firstGroup?.label||status,groups:gs,childIds,childNames,mapped:gs.length>0};
  });
}
function statusActionsBlockForRule(n){
  const rows=actionListRowsForRule(n);
  if(!rows.length)return '<div class="muted">No status-result action list was extracted for this rule.</div>';
  return `<div class="fw-action-list-table">${rows.map(row=>{
    const children=row.childNames.length?row.childNames.slice(0,5).map(name=>`<span class="mini-token">${esc(name)}</span>`).join('')+(row.childNames.length>5?`<span class="muted">+${fmt(row.childNames.length-5)}</span>`:''):'<span class="muted">No sub-list children</span>';
    return `<div class="fw-action-list-row"><div><span class="fw-action-index">${esc(row.index)}</span><b>${esc(row.status)}</b><small>Status Result</small></div><div><b>${row.mapped?esc(row.actionLabel):'Do Nothing'}</b><small>${row.mapped?'Action List / Sub-list':'No mapped sub-list'}</small></div><div class="fw-action-children">${children}</div></div>`;
  }).join('')}</div>`;
}
function parentRuleActionListBlock(n){
  const incoming=model.incomingByChild.get(n.id);
  const parentId=model.parentByChild.get(n.id);
  const parent=parentId?model.nodesById.get(String(parentId)):null;
  const path=pathHtml(n);
  return `<div class="panel mb-10"><h3>Parent Rule / Sub-list Path</h3>${path}<div class="caption mt-8">Configured rule-list hierarchy from the FWD snapshot.</div></div><div class="kv">${kv('Parent Rule',parent?`<button class="btn ghost" type="button" data-node="${esc(parent.id)}">${esc(parent.title)}</button>`:'Root rule list')}${kv('Incoming Action List',incoming?`<span class="action-list-chip ${incoming.resolved?'resolved':'unresolved'}">${esc(incoming.label)}</span>`:'Root')}${kv('Action index',esc(first(incoming?.ActionListIndex,incoming?.actionListIndex,'')))}</div>`;
}

function fieldCatalogRowsForScope(scopeId){
  const items=list(first(model.fwd?.fields?.items,[]));
  const parts=text(scopeId).split('/').filter(Boolean);
  const scopeName=text(parts[parts.length-1]);
  const rawType=text(parts[parts.length-2]);
  const scopeType=rawType.endsWith('s')?rawType.slice(0,-1):rawType;
  if(!items.length){
    const design=pageDesignForScope(scopeId);
    return design?[{scopeType:'Page',scopeName:design.page,fields:list(design.fields).map(f=>({name:f.name,type:f.fieldType,geometry:f.geometry,design:f}))}]:[];
  }
  const exact=items.filter(i=>lower(i.scopeName)===lower(scopeName)&&lower(i.scopeType)===lower(scopeType));
  if(exact.length)return exact;
  return items.filter(i=>lower(i.scopeName)===lower(scopeName));
}
function pageDesignRows(){
  return list(first(model.fwd?.pageDesigns?.items,model.fwd?.editorModel?.pageDesigns,[]));
}
function pageDesignForScope(scopeId){
  const parts=text(scopeId).split('/').filter(Boolean);
  const scopeName=text(parts[parts.length-1]);
  if(!scopeName)return null;
  return pageDesignRows().find(p=>lower(p.page)===lower(scopeName))||null;
}
function pageDesignContextHtml(design){
  if(!design)return `<div class="notice"><div class="notice-icon">i</div><div><b>Page design context.</b> No page design packet is available for this scope.</div></div>`;
  const variants=list(design.variants);
  const fields=list(design.fields);
  const links=list(design.processingLinks);
  const variantRows=variants.slice(0,8).map(v=>`<div class="mini-row"><span><b>${esc(text(v.name))}</b>${v.formId?`<small class="mono">${esc(text(v.formId))}</small>`:''}</span><span>${esc(text(v.source||'Fwd.PageVariants'))}</span></div>`).join('');
  const fieldRows=fields.slice(0,12).map(f=>`<div class="mini-row"><span><b>${esc(text(f.name))}</b><small>${esc(text(f.fieldType||'unknown'))}</small></span><span class="mono">${esc(text(f.geometry||''))}</span></div>`).join('');
  const flags=[...new Set(fields.flatMap(f=>list(f.roleFlags).map(text)).filter(Boolean))].slice(0,12);
  const linkRows=links.slice(0,4).map(l=>`<div class="mini-row"><span><b>${esc(text(l.kind))}</b></span><span class="mono">${esc(text(l.url||l.target))}</span></div>`).join('');
  return `<div class="kv">${kv('Page',design.page||'')}${kv('Variants',fmt(variants.length))}${kv('Fields',fmt(fields.length))}${kv('Confidence',design.confidence||'')}</div>${variantRows?`<div class="table-columns-head">Variants / Form IDs</div><div class="mini-list">${variantRows}</div>`:''}${fieldRows?`<div class="table-columns-head">Fields</div><div class="mini-list">${fieldRows}</div>`:''}${flags.length?`<div class="table-columns-head">Field roles</div>${functionTokenStripHtml(flags,'blue')}`:''}${linkRows?`<div class="table-columns-head">Processing links</div><div class="mini-list">${linkRows}</div>`:''}`;
}
function looksLikeFieldParameterName(name){const key=lower(name);return key.includes('field')||key.includes('column')||key.includes('attr')||key.includes('paramlist')||key.includes('source')||key.includes('dest');}
function tokenizeFieldCandidates(raw){const source=text(raw).trim();if(!source)return [];const tokens=source.split(/[^A-Za-z0-9_]+/).map(x=>x.trim()).filter(Boolean);const out=[];const seen=new Set();tokens.forEach(token=>{if(token.length<2)return;if(/^\d+$/.test(token))return;const t=token.toLowerCase();if(seen.has(t))return;seen.add(t);out.push(token);});return out;}
function resolveNodeFieldReferences(n){
  const params=n.Parameters||{};
  const rows=fieldCatalogRowsForScope(n.scopeId);
  const byName=new Map();
  rows.forEach(row=>{list(row.fields).forEach(field=>{const name=text(field.name).trim();if(!name)return;const key=name.toLowerCase();if(!byName.has(key))byName.set(key,[]);byName.get(key).push({name,scopeType:text(row.scopeType),scopeName:text(row.scopeName),fieldType:text(field.type),geometry:text(field.geometry),source:'FwdFieldCatalog'});});});
  const items=[];
  Object.keys(params).forEach(parameterName=>{
    if(!looksLikeFieldParameterName(parameterName))return;
    list(params[parameterName]).forEach(parameterValue=>{
      tokenizeFieldCandidates(parameterValue).forEach(candidate=>{
        const matches=list(byName.get(candidate.toLowerCase()));
        items.push({parameterName:text(parameterName),parameterValue:text(parameterValue),referencedField:candidate,fieldExists:matches.length>0,matchLevel:matches.length>0?'High':'Low',source:rows.length?'FwdFieldCatalog':'NoFieldCatalog',matches});
      });
    });
  });
  const resolved=items.filter(i=>i.fieldExists).length;
  const unresolved=Math.max(0,items.length-resolved);
  return {summary:{referenced:items.length,resolved,unresolved,caveat:'Field resolution compares rule parameter names to the extracted FWD field catalog.'},items};
}
function renderFieldResolutionBlock(fieldResolution){
  if(!fieldResolution.summary.referenced)return '<div class="muted">No field-like parameters were found on this rule.</div>';
  const summary=`<div class="metric-row"><span class="metric-chip"><span class="chip-label">Referenced</span><span class="chip-value">${fmt(fieldResolution.summary.referenced)}</span></span><span class="metric-chip"><span class="chip-label">Resolved</span><span class="chip-value ok">${fmt(fieldResolution.summary.resolved)}</span></span><span class="metric-chip"><span class="chip-label">Unresolved</span><span class="chip-value ${fieldResolution.summary.unresolved?'err':''}">${fmt(fieldResolution.summary.unresolved)}</span></span></div><div class="caption">${esc(fieldResolution.summary.caveat)}</div>`;
  const rows=fieldResolution.items.slice(0,120).map(item=>{const matches=item.matches.slice(0,3).map(m=>`<div class="mini-row"><span class="mono">${esc(m.name)}</span><span>${esc(m.scopeType)}:${esc(m.scopeName)}${m.geometry?` · ${esc(m.geometry)}`:''}</span></div>`).join('');return `<div class="panel my-8 p-10"><div class="split-row"><span><b>${esc(item.referencedField)}</b><div class="caption">${esc(item.parameterName)} = ${esc(item.parameterValue)}</div></span><span class="badge ${item.fieldExists?'green':'amber'}">${item.fieldExists?'resolved':'unresolved'}</span></div>${matches?`<div class="mini-list mt-8">${matches}</div>`:'<div class="caption mt-8">No matching field was found in the current FWD field catalog scope.</div>'}</div>`;}).join('');
  return `${summary}<div class="mt-8">${rows}</div>${fieldResolution.items.length>120?'<div class="caption mt-8">Showing first 120 resolved/unresolved references for readability.</div>':''}`;
}
function getScopeFieldResolutionIndex(scopeId){
  const key=text(scopeId);
  if(scopeFieldResolutionCache.has(key))return scopeFieldResolutionCache.get(key);
  const rules=model.nodes.filter(n=>n.scopeId===key&&n.isRule);
  const rows=[];
  let referenced=0,resolved=0,unresolved=0,rulesWithRefs=0,rulesWithUnresolved=0;
  rules.forEach(rule=>{
    const packet=resolveNodeFieldReferences(rule);
    if(packet.summary.referenced>0)rulesWithRefs++;
    if(packet.summary.unresolved>0)rulesWithUnresolved++;
    referenced+=packet.summary.referenced;
    resolved+=packet.summary.resolved;
    unresolved+=packet.summary.unresolved;
    packet.items.forEach(item=>rows.push({nodeId:rule.id,ruleName:rule.title,functionName:rule.fn||'',scopeId:rule.scopeId,parameterName:item.parameterName,parameterValue:item.parameterValue,referencedField:item.referencedField,fieldExists:item.fieldExists,matches:item.matches,matchCount:list(item.matches).length,matchLevel:first(item.matchLevel,item.confidence),source:item.source,searchBlob:[rule.title,rule.fn,rule.scopeId,item.parameterName,item.parameterValue,item.referencedField,item.fieldExists?'resolved':'unresolved',list(item.matches).map(m=>`${m.name} ${m.scopeType} ${m.scopeName} ${m.geometry}`).join(' ')].join(' ').toLowerCase()}));
  });
  const payload={scopeId:key,summary:{referenced,resolved,unresolved,rules:rules.length,rulesWithRefs,rulesWithUnresolved,caveat:'Field resolution compares rule parameter names to the extracted FWD field catalog.'},rows};
  scopeFieldResolutionCache.set(key,payload);
  return payload;
}
function filteredScopeFieldResolutionRows(index){
  const mode=text(state.fieldResolutionFilter||'unresolved').toLowerCase();
  const q=lower(state.query).trim();
  return index.rows.filter(r=>{
    if(mode==='resolved'&&!r.fieldExists)return false;
    if(mode==='unresolved'&&r.fieldExists)return false;
    if(!q)return true;
    return r.searchBlob.includes(q);
  });
}
function renderFieldResolutionCatalog(){
  const index=getScopeFieldResolutionIndex(state.scopeId);
  const rows=filteredScopeFieldResolutionRows(index);
  const summary=index.summary;
  const pageDesign=pageDesignForScope(state.scopeId);
  const buttons=`<div class="scope-kind-filter" role="toolbar" aria-label="Field resolution filters"><button class="chip-btn ${state.fieldResolutionFilter==='unresolved'?'active':''}" type="button" data-field-filter="unresolved">Unresolved</button><button class="chip-btn ${state.fieldResolutionFilter==='resolved'?'active':''}" type="button" data-field-filter="resolved">Resolved</button><button class="chip-btn ${state.fieldResolutionFilter==='all'?'active':''}" type="button" data-field-filter="all">All</button></div>`;
  const listHtml=rows.slice(0,4000).map(r=>`<button class="data-row compact" type="button" data-node="${esc(r.nodeId)}"><div><div class="data-title">${esc(r.referencedField)} <span class="badge ${r.fieldExists?'green':'amber'}">${r.fieldExists?'resolved':'unresolved'}</span></div><div class="data-sub">${esc(r.ruleName)} · ${esc(r.functionName||'no function')} · ${esc(r.parameterName)} = ${esc(r.parameterValue)}</div></div><div>${r.matchCount?`<span class="badge blue">${fmt(r.matchCount)} matches</span>`:''}</div><div class="mono">${esc(r.nodeId)}</div></button>`).join('');
  const notice=`<div class="notice compact"><div class="notice-icon">i</div><div><b>Field catalog match.</b> This view shows field-like rule parameters across the current scope and whether each one matches the extracted FWD field catalog.</div></div>`;
  const body=`<fieldset class="fweditor-fieldset"><legend>Field References</legend><div class="fweditor-scope-summary"><span>Structural rules <b>${fmt(summary.rules)}</b></span><span>Rules with refs <b>${fmt(summary.rulesWithRefs)}</b></span><span>Resolved <b>${fmt(summary.resolved)}</b></span><span>Unresolved <b>${fmt(summary.unresolved)}</b></span></div><div class="fweditor-toolbar-inline">${buttons}</div><div class="table-list mt-8">${listHtml||emptyHtml('No field-resolution rows match','Adjust filter or search.')}</div>${rows.length>4000?'<div class="notice compact"><div class="notice-icon">i</div><div>Showing first 4,000 rows for browser performance. Use search to narrow down.</div></div>':''}</fieldset><div class="fweditor-scope-detail-grid"><fieldset class="fweditor-fieldset"><legend>Page Design</legend>${pageDesignContextHtml(pageDesign)}</fieldset><fieldset class="fweditor-fieldset"><legend>How to Read This</legend>${notice}</fieldset></div>`;
  $('content').innerHTML=fweditorScopeRootHtml('field-resolution','Field Resolution',body,{chips:['Static catalog',`${fmt(summary.resolved)} resolved`,`${fmt(summary.unresolved)} unresolved`]});
}
function routingGroupsHtml(n){const groups=outgoingGroups(n);const names=Object.keys(groups);if(!names.length)return '<div class="muted">No structural child action lists.</div>';return names.map(name=>`<div class="panel my-8 p-10"><div class="split-row"><b>${esc(name)}</b><span class="badge blue">${fmt(groups[name].length)} children</span></div><div class="mini-list mt-8">${groups[name].map(e=>{const child=model.nodesById.get(e.to);return `<button class="quick-card" type="button" data-node="${esc(e.to)}"><b>${esc(child?.title||e.to)}</b><span>${esc(child?.fn||'no function')}</span></button>`}).join('')}</div></div>`).join('');}
/** Central command dispatcher for toolbar, inspector, copy, and help actions. */
function download(name,body,type){const blob=new Blob([body],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),800);toast('Export created');}
function copyText(t){
  const textValue=String(t??'');
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(textValue).then(()=>toast('Copied')).catch(()=>copyTextFallback(textValue));
    return;
  }
  copyTextFallback(textValue);
}
function copyTextFallback(textValue){
  const ta=document.createElement('textarea');
  ta.value=textValue;
  ta.setAttribute('readonly','readonly');
  ta.style.position='fixed';
  ta.style.left='-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy') ? toast('Copied') : toast('Clipboard unavailable'); }
  catch(error){ reportUiError('clipboard copy',error); toast('Clipboard unavailable'); }
  finally { ta.remove(); }
}
function toast(m,type='info',durationMs=1500){
  const t=$('toast');
  if(toastTimer)window.clearTimeout(toastTimer);
  t.textContent=m;
  t.classList.remove('info','success','warn','error');
  t.classList.add(type);
  t.setAttribute('aria-live',type==='error'?'assertive':'polite');
  t.classList.add('show');
  toastTimer=window.setTimeout(()=>t.classList.remove('show'),Math.max(1000,durationMs));
}
function closeModalRender(){state.modal='';renderModal();renderAll();}


/* v26 Lean Inspection overrides: selectable action lists, search operators, contextual help, keyboard tree navigation, snapshot-aware persistence. */
function stableSnapshotFallbackId(){
  const material=[treeData?.FwdPath,rulesData?.FwdPath,treeData?.ProcessName,rulesData?.ProcessName,treeData?.NodeCount,rulesData?.RuleCount].map(text).join('|');
  let hash=2166136261;
  for(let i=0;i<material.length;i++){hash^=material.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return `static-${(hash>>>0).toString(36)}`;
}
function snapshotId(){return text(first(treeData.SnapshotId,treeData.snapshotId,rulesData.SnapshotId,rulesData.snapshotId,treeData.GeneratedAtUtc,rulesData.GeneratedAtUtc,stableSnapshotFallbackId())).replace(/[^a-z0-9_.:-]+/gi,'-');}
function snapshotStoreKey(){return `${storeKey}:${snapshotId()}`;}
function requestedWorkspaceView(){
  try{
    const href=text(window.location?.href||'');
    const match=href.match(/[?&]view=([^&#]+)/i);
    const view=normalizeWorkspaceViewName(match?decodeURIComponent(match[1].replace(/\+/g,' ')):'');
    return validWorkspaceViews().includes(view)?view:'';
  }catch{return '';}
}
function noteRecentScope(scopeId){const id=text(scopeId);if(!id)return;state.recentScopes=[id,...state.recentScopes.filter(x=>x!==id)].slice(0,6);}
function saveState(){
  writeStorage(snapshotStoreKey(),JSON.stringify({
    scopeId:state.scopeId,
    theme:state.theme,
    density:state.density,
    treeFilter:state.treeFilter,
    scopeKindFilter:state.scopeKindFilter,
    workspaceView:state.workspaceView,
    fieldResolutionFilter:state.fieldResolutionFilter,
    inventoryFilter:state.inventoryFilter,
    messageFilter:state.messageFilter,
    inspectorView:state.inspectorView,
    rulePropertyPage:state.rulePropertyPage,
    selectedResourceKey:state.selectedResourceKey,
    selectedFunctionName:state.selectedFunctionName,
    selectedDriverKey:state.selectedDriverKey,
    selectedObjectGraphKey:state.selectedObjectGraphKey,
    selectedRuleListKey:state.selectedRuleListKey,
    selectedSelectionListName:state.selectedSelectionListName,
    selectedRuntimeImpactKey:state.selectedRuntimeImpactKey,
    selectedProcessName:state.selectedProcessName,
    selectedTableName:state.selectedTableName,
    selectedUdfName:state.selectedUdfName,
    editorPropertyPage:state.editorPropertyPage,
    udfEditorTab:state.udfEditorTab,
    editorMessageExpanded:state.editorMessageExpanded,
    udfFilter:state.udfFilter,
    paneLeftWidth:state.paneLeftWidth,
    paneRightWidth:state.paneRightWidth,
    editorTreeWidth:normalizedEditorTreeWidth(),
    editorMessageHeight:normalizedEditorMessageHeight(),
    inspectorOpen:document.body.classList.contains('inspector-open'),
    recentScopes:state.recentScopes,
    disclosureLevel:state.disclosureLevel
  }));
  writeStorage(themeStoreKey,state.theme);
}
function restoreSnapshotState(){
  const saved=safeJson(readStorage(snapshotStoreKey())||'{}',{});
  const theme=readStorage(themeStoreKey)||'light';
  state.theme=theme;
  document.documentElement.dataset.theme=theme;
  state.density=saved.density==='high'?'high':state.density;
  applyDensityClass(state.density);
  document.body.classList.toggle('inspector-open',saved.inspectorOpen===true);
  if(saved.scopeId&&model.scopes.some(s=>s.scopeId===saved.scopeId))state.scopeId=saved.scopeId;
  if(saved.treeFilter)state.treeFilter=saved.treeFilter;
  if(saved.scopeKindFilter)state.scopeKindFilter=saved.scopeKindFilter;
  state.workspaceView=validWorkspaceViews().includes(saved.workspaceView)?saved.workspaceView:'structure';
  state.workspaceView=requestedWorkspaceView()||state.workspaceView;
  state.fieldResolutionFilter=['all','resolved','unresolved'].includes(saved.fieldResolutionFilter)?saved.fieldResolutionFilter:'unresolved';
  state.inventoryFilter=['all','StructuralMatch','AdditionalRule','FlatOnly','direct','inherited'].includes(saved.inventoryFilter)?saved.inventoryFilter:state.inventoryFilter;
  state.messageFilter=normalizeMessageFilter(saved.messageFilter||state.messageFilter);
  state.inspectorView=(()=>{const view=saved.inspectorView==='config'?'fields':saved.inspectorView==='actions'?'status-results':saved.inspectorView;return ['general','fields','attributes','status-results','description','summary','references','messages','raw'].includes(view)?view:'general';})();
  state.rulePropertyPage=(()=>{const page=text(saved.rulePropertyPage||state.rulePropertyPage||'general');const normalized=page==='summary'?'general':page==='config'?'fields':page==='actions'?'status-results':page;return ['general','fields','attributes','status-results','description'].includes(normalized)?normalized:'general';})();
  state.selectedResourceKey=text(saved.selectedResourceKey||'');
  state.selectedFunctionName=text(saved.selectedFunctionName||'');
  state.selectedDriverKey=text(saved.selectedDriverKey||'');
  state.selectedObjectGraphKey=text(saved.selectedObjectGraphKey||'');
  state.selectedRuleListKey=text(saved.selectedRuleListKey||'');
  state.selectedSelectionListName=text(saved.selectedSelectionListName||'');
  state.selectedRuntimeImpactKey=text(saved.selectedRuntimeImpactKey||'');
  state.selectedProcessName=text(saved.selectedProcessName||'');
  state.selectedTableName=text(saved.selectedTableName||'');
  state.selectedUdfName=text(saved.selectedUdfName||'');
  state.editorPropertyPage=normalizeEditorPropertyPage(saved.editorPropertyPage||state.editorPropertyPage);
  state.udfEditorTab=['general','parameters','callers','rule-list'].includes(saved.udfEditorTab)?saved.udfEditorTab:'general';
  state.editorMessageExpanded=saved.editorMessageExpanded===true;
  state.udfFilter=['all','with-callers','defined','unparsed','usage-only'].includes(saved.udfFilter)?saved.udfFilter:state.udfFilter;
  state.paneLeftWidth=Number.isFinite(Number(saved.paneLeftWidth))?Number(saved.paneLeftWidth):state.paneLeftWidth;
  state.paneRightWidth=Number.isFinite(Number(saved.paneRightWidth))?Number(saved.paneRightWidth):state.paneRightWidth;
  state.editorTreeWidth=normalizedEditorTreeWidth(saved.editorTreeWidth||state.editorTreeWidth);
  state.editorMessageHeight=normalizedEditorMessageHeight(saved.editorMessageHeight||state.editorMessageHeight);
  state.recentScopes=Array.isArray(saved.recentScopes)?saved.recentScopes:[];
  state.disclosureLevel=Number(saved.disclosureLevel||state.disclosureLevel||2)||2;
}
function selectNode(id){selectNodeInScope(id);}
function actionListRow(r){
  const g=r.group;const key=r.key;const cls=g.resolved?'resolved':'unresolved';const open=r.open!==false;const selected=state.selectedType==='action-list'&&state.selectedId===key;const hot=g.childIds.length>=10||g.childIds.some(id=>{const n=model.nodesById.get(String(id));return n&&(n.disabled!=='none'||hasDiag(n));});
  const actionLabel=g.resolved?'Status result / action':'Action index';
  return `<div class="action-list-row ${cls} ${open?'':'collapsed'} ${selected?'selected':''} ${hot?'hotspot':''}" role="treeitem" aria-level="${r.level+1}" aria-expanded="${open?'true':'false'}" aria-selected="${selected?'true':'false'}" tabindex="0" data-action-list="${esc(key)}" style="--depth:${r.level}"><span class="twisty action-list-twisty" data-toggle-action-list="${esc(key)}" aria-hidden="true" title="${open?'Collapse':'Expand'}">${open?'−':'+'}</span><div class="action-list-main"><span class="action-list-label"><span class="action-list-prefix">${esc(actionLabel)}</span> ${esc(g.label)}</span><span class="action-list-meta">${fmt(g.childIds.length)} child ${g.childIds.length===1?'rule':'rules'}</span></div><span class="mini-row-btn" data-toggle-action-list="${esc(key)}" aria-hidden="true" title="${open?'Collapse':'Expand'}">${open?'−':'+'}</span></div>`;
}
function renderContextActionMenu(contextLabel){
  return '';
}
function renderInspector(){
  if(isEditorMode()){
    const title=optionalElement('inspectorTitle');
    const caption=optionalElement('inspectorCaption');
    const tabs=optionalElement('inspectorTabs');
    const body=optionalElement('inspectorBody');
    if(title)title.textContent='';
    if(caption)caption.textContent='';
    if(tabs)tabs.innerHTML='';
    if(body)body.innerHTML='';
    document.body.classList.remove('inspector-open');
    syncActionAvailability();
    return;
  }
  const b=selectedActionList();
  const n=selectedNode();
  const inventoryRow=selectedInventory();
  const relRow=selectedRel();
  const diagRow=selectedDiag();
  if(n){
    $('inspectorTitle').textContent=n.title;
    $('inspectorCaption').textContent=`${n.fn||'no function'} · ${n.scopeId}`;
    $('inspectorTabs').innerHTML=`<span class="app-mode-note">Configuration inspector</span>${renderContextActionMenu('Configuration')}`;
    syncActionAvailability();
    return renderNodeInspector(n);
  }
  if(b){
    $('inspectorTitle').textContent=b.label;
    $('inspectorCaption').textContent=`Action List · Parent: ${b.parent.title}`;
    $('inspectorTabs').innerHTML=`<span class="app-mode-note">Configuration inspector</span>${renderContextActionMenu('Configuration')}`;
    syncActionAvailability();
    return renderActionListInspector(b);
  }
  if(inventoryRow){
    $('inspectorTitle').textContent=inventoryRow.title||'Inventory row';
    $('inspectorCaption').textContent=inventoryRow.scopeId||'FWD object';
    $('inspectorTabs').innerHTML=`<span class="app-mode-note">Configuration inspector</span>${renderContextActionMenu('Configuration')}`;
    syncActionAvailability();
    return renderGenericInspector(inventoryRow,'Inventory row');
  }
  if(relRow){
    $('inspectorTitle').textContent=relRow.target||'Reference';
    $('inspectorCaption').textContent=relRow.scopeId||'FWD object';
    $('inspectorTabs').innerHTML=`<span class="app-mode-note">Configuration inspector</span>${renderContextActionMenu('Configuration')}`;
    syncActionAvailability();
    return renderGenericInspector(relRow,'Reference');
  }
  if(diagRow){
    $('inspectorTitle').textContent=diagRow.title||'Message';
    $('inspectorCaption').textContent=diagRow.scopeId||'FWD object';
    $('inspectorTabs').innerHTML=`<span class="app-mode-note">Configuration inspector</span>${renderContextActionMenu('Configuration')}`;
    syncActionAvailability();
    return renderGenericInspector(diagRow,'Message');
  }
  $('inspectorTitle').textContent='No rule selected';
  $('inspectorCaption').textContent='Select a rule, function, field, or action list to inspect configuration.';
  $('inspectorTabs').innerHTML=`<span class="app-mode-note">Configuration inspector</span>${renderContextActionMenu('Scope')}`;
  syncActionAvailability();
  return renderScopeInspector(currentScope());
}
function actionListPathObjects(b){const base=pathObjects(b.parent);base.push({kind:'ActionList',actionListId:b.actionListId,parentNodeId:b.parent.id,label:b.label,actionListIndex:b.actionListIndex,actionListState:b.actionListState,resolved:b.resolved});return base;}
function actionListPacket(b){const diags=actionListMessages(b),refs=actionListReferences(b);return {schema:'FwEditorViewer.SelectedActionListConfiguration',schemaVersion:'1.0.0',copiedAt:new Date().toISOString(),scopeId:b.scopeId,actionList:{actionListId:b.actionListId,parentNodeId:b.parent.id,parentRuleName:b.parent.title,parentFunctionName:b.parent.fn,label:b.label,actionListIndex:b.actionListIndex,actionListState:b.actionListState,resolved:b.resolved,childCount:b.childCount},path:actionListPathObjects(b),children:b.childNodes.map(n=>({nodeId:n.id,ruleName:n.title,functionName:n.fn,disabled:n.disabled,hasMessages:hasDiag(n)})),relationships:refs.map(r=>({kind:r.kind,targetType:r.targetType,target:r.target,nodeId:r.nodeId})),messages:diags.map(d=>({severity:d.severity,title:d.title,detail:d.detail,nodeId:d.nodeId})),notProven:['Action-list grouping comes from the parsed FWD parent rule status-result action lists.','This is read-only FWD configuration, not a runtime execution trace.','Search output is a navigation aid for the FWD snapshot.']};}
function actionListMessages(b){const ids=new Set(actionListSubtreeNodeIds(b));return model.diags.filter(d=>ids.has(String(d.nodeId)));}
function actionListReferences(b){const ids=new Set(actionListSubtreeNodeIds(b));return model.rels.filter(r=>ids.has(String(r.nodeId)));}
function actionListSubtreeNodeIds(b){const out=[];const walk=id=>{out.push(String(id));childIds(id).forEach(walk);};b.childIds.forEach(walk);return out;}
function actionListMarkdownReport(b){const p=actionListPacket(b);return `# Action List Configuration\n\nScope: ${p.scopeId}\nParent rule: ${p.actionList.parentRuleName}\nParent function: ${p.actionList.parentFunctionName||'none'}\nAction: ${p.actionList.label}\nAction-list mapping: ${p.actionList.actionListState}\nChildren: ${p.actionList.childCount}\n\n## Parent rule / sub-list path\n${p.path.map(seg=>seg.kind==='ActionList'?`- Action: ${seg.label}`:`- Rule: ${seg.name}`).join('\n')}\n\n## Child rules\n${p.children.map(c=>`- ${c.ruleName} (${c.functionName||'no function'})${c.disabled!=='none'?` - ${c.disabled}`:''}`).join('\n')||'- None'}\n\n## Notes\n${p.notProven.map(x=>`- ${x}`).join('\n')}\n`;}

function renderActionListInspector(b){
  const diags=actionListMessages(b);
  const summary=`<div class="kv">${kv('Action List',`<span class="action-list-chip ${b.resolved?'resolved':'unresolved'}">${esc(b.label)}</span>`)}${kv('Parent Rule',`<button class="btn ghost" type="button" data-node="${esc(b.parent.id)}">${esc(b.parent.title)}</button>`)}${kv('Parent function',`<span class="mono">${esc(b.parent.fn||'')}</span>`)}${kv('Status/action index',esc(b.actionListIndex??''))}${kv('Sub-list children',fmt(b.childCount))}</div><div class="action-list-actions"><button class="btn" type="button" data-action="copy-action-list-path">Copy Action List path</button></div>`;
  const path=`<div class="action-list-breadcrumb">${actionListPathObjects(b).map((seg,i)=>`${i?'<span class="action-list-arrow">-&gt;</span>':''}${seg.kind==='ActionList'?`<span class="action-list-step"><span class="action-list-chip ${seg.resolved?'resolved':'unresolved'}">Action List: ${esc(seg.label)}</span></span>`:`<button class="action-list-step" type="button" data-node="${esc(seg.nodeId)}"><b>${esc(seg.name)}</b></button>`}`).join('')}</div><div class="caption mt-8">Configured parent rule and sub-list path from the FWD configuration.</div>`;
  const children=b.childNodes.length?`<div class="mini-list">${b.childNodes.map(n=>`<button class="quick-card" type="button" data-node="${esc(n.id)}"><b>${esc(n.title)}</b><span>${esc(n.fn||'no function')} · ${n.disabled==='none'?'enabled':n.disabled}</span></button>`).join('')}</div>`:'<div class="muted">No child rules under this sub-list.</div>';
  const tabs=['summary','actions',...(isAdvancedMode()?['messages','raw']:[])];
  renderInspectorTabBar(tabs,{
    summary:'action list',
    actions:fmt(b.childCount),
    ...(isAdvancedMode()?{messages:fmt(diags.length),raw:'JSON'}:{})
  });
  if(state.inspectorView==='actions'){
    $('inspectorBody').innerHTML=`${sectionHtml('Parent Rule / Sub-list Path','path',path,true)}${sectionHtml('Child rules',b.childCount,children,true)}`;
  }else if(isAdvancedMode()&&state.inspectorView==='messages'){
    const diagBody=diags.length?diags.map(d=>`<div class="notice compact"><div class="notice-icon">!</div><div><b>${esc(d.title)}</b><br>${esc(d.detail)}</div></div>`).join(''):'<div class="muted">No diagnostics under this action list.</div>';
    $('inspectorBody').innerHTML=sectionHtml('Load Status',diags.length,diagBody,true);
  }else if(isAdvancedMode()&&state.inspectorView==='raw'){
    $('inspectorBody').innerHTML=`<pre class="raw">${esc(JSON.stringify(actionListPacket(b),null,2))}</pre>`;
  }else{
    $('inspectorBody').innerHTML=`${sectionHtml('Summary','action list',summary,true)}${sectionHtml('Parent Rule / Sub-list Path','path',path,true)}`;
  }
}


function hasVisibleQuery(x){const q=lower(state.query).trim();if(!q)return true;return matchesSearchQuery(x,q);}
function matchesSearchQuery(x,q){const blob=lower([x.searchBlob,x.title,x.name,x.fn,x.FunctionName,x.scopeId,x.kind,x.label,x.target,x.Target].join(' '));const terms=q.match(/"[^"]+"|\S+/g)||[];return terms.every(term=>{term=term.replace(/^"|"$/g,'');const gt=term.match(/^children>(\d+)$/i);if(gt)return Number(first(x.childCount,childIds(x.id).length,0))>Number(gt[1]);const parts=term.split(':');if(parts.length>1){const op=lower(parts.shift()),val=lower(parts.join(':').replace(/^"|"$/g,''));if(op==='function'||op==='fn')return lower(x.fn||x.FunctionName).includes(val);if(op==='field'||op==='target')return lower(x.target||x.Target||paramText(x.Parameters)).includes(val);if(op==='action'||op==='actionlist'||op==='status')return lower(actionNamesOf(x).join(' ')+' '+(x.label||'')+' '+(x.searchBlob||'')).includes(val);if(op==='disabled')return val==='true'?disabledOf(x)!=='none':lower(x.disabled||disabledOf(x)).includes(val);if(op==='has'){if(val==='disabled')return disabledOf(x)!=='none'||x.disabled!=='none';if(val==='message'||val==='status'||val==='warning'||val==='warnings')return !!x.nodeId?list(model.diagsByNode?.get(String(x.nodeId))).length>0:hasDiag(x);if(val==='actionlists'||val==='children')return childIds(x.id).length>0||childActionListGroups(x.id).length>0;}if(op==='scope')return lower(x.scopeId||scopeIdOf(x)).includes(val);if(op==='guid')return lower(x.RuleGuid||x.ruleGuid).includes(val);if(op==='flatonly'||op==='additional')return String(x.classification==='FlatOnly'||x.classification==='AdditionalRule').includes(val);if(op==='message'||op==='status')return lower(x.title||x.detail||x.searchBlob).includes(val);}return blob.includes(lower(term));});}
function searchKindLabel(kind){
  return ({
    Scope:'Scopes',
    StructuralRule:'Rules',
    ActionList:'Action lists',
    Reference:'References',
    Message:'Load Status',
    Function:'Functions',
    Table:'Tables',
    SelectionList:'SelectionLists',
    UDF:'UDFs',
    RuleList:'Rule Lists',
    ObjectGraph:'Object Graph',
    RuntimeImpact:'Runtime Impact',
    Resource:'Resources',
    Driver:'Drivers'
  })[kind]||'Other';
}
function searchKindRank(kind){
  return ({StructuralRule:1,Scope:2,ActionList:3,Function:4,UDF:5,SelectionList:6,Table:7,RuleList:8,ObjectGraph:9,RuntimeImpact:10,Reference:11,Message:12,Resource:13,Driver:14})[kind]||99;
}
function addGlobalDefinitionSearchRows(rows,q,kind,view,defs){
  list(defs).forEach(row=>{
    const blob=definitionSearchText(row);
    if(matchesSearchQuery({searchBlob:blob,title:row.name,scopeId:view},q)){
      rows.push({kind,view,key:row.key,title:row.name,subtitle:`${row.type||view} · ${fmt(list(row.usage).length||row.metric||0)} usage`,badges:[kind]});
    }
  });
}
function searchResults(){
  const q=lower(state.query).trim();
  if(!q)return [];
  const rows=[];
  for(const s of model.scopes){
    if(matchesSearchQuery({searchBlob:`${s.name} ${s.scopeId} ${s.kind}`},q))rows.push({kind:'Scope',scopeId:s.scopeId,title:s.name,subtitle:`${s.kind} · ${fmt(s.structural)} rules`,badges:[s.kind]});
  }
  for(const n of model.nodes){
    if(matchesSearchQuery(n,q))rows.push({kind:'StructuralRule',scopeId:n.scopeId,nodeId:n.id,title:n.title,subtitle:`${n.fn||'no function'} · ${n.scopeId}`,badges:[n.disabled!=='none'?n.disabled:'Rule'].filter(Boolean),actionPreview:model.incomingByChild.get(n.id)?.label||'root'});
  }
  for(const n of model.nodes){
    for(const g of childActionListGroups(n.id)){
      const key=actionListKey(n.id,g);
      const childCount=list(g.childIds).length;
      if(matchesSearchQuery({searchBlob:`${g.label} ${n.title} ${n.fn} ${n.scopeId}`},q))rows.push({kind:'ActionList',scopeId:n.scopeId,actionListKey:key,title:`Action List: ${g.label||'Unnamed action list'}`,subtitle:`Parent: ${n.title} · ${fmt(childCount)} child rules`,badges:['Action List']});
    }
  }
  try{
    addGlobalDefinitionSearchRows(rows,q,'Function','functions',buildGlobalFunctionDefinitions());
    addGlobalDefinitionSearchRows(rows,q,'SelectionList','selection-lists',buildSelectionListPacketDefinitions());
    addGlobalDefinitionSearchRows(rows,q,'Table','tables',buildGlobalTableDefinitions().map(t=>({...t,key:t.name,type:t.hasParsedSchema?'Parsed table':'Table',metric:list(t.usage).length})));
    addGlobalDefinitionSearchRows(rows,q,'UDF','udfs',buildUdfDefinitions().map(u=>({...u,name:u.displayName||u.key,type:u.type||'UDF',metric:list(u.callerRules).length,usage:u.callerRules})));
    addGlobalDefinitionSearchRows(rows,q,'RuleList','rule-lists',buildRuleListPacketDefinitions());
    if(isAdvancedMode()){
      addGlobalDefinitionSearchRows(rows,q,'ObjectGraph','object-graph',buildObjectGraphDefinitions());
      addGlobalDefinitionSearchRows(rows,q,'RuntimeImpact','runtime-impact',buildRuntimeImpactDefinitions());
    }
    addGlobalDefinitionSearchRows(rows,q,'Resource','resources',buildGlobalResourceDefinitions());
    addGlobalDefinitionSearchRows(rows,q,'Driver','drivers',buildGlobalDriverDefinitions());
  }catch(error){
    console.warn('FW Editor Viewer: global search definition indexing failed.',error);
  }
  for(const r of model.rels){
    if(matchesSearchQuery(r,q))rows.push({kind:'Reference',scopeId:r.scopeId,nodeId:r.nodeId,title:`${r.kind}: ${r.target}`,subtitle:`${r.targetType}`,badges:['Reference']});
  }
  for(const d of model.diags){
    if(matchesSearchQuery(d,q))rows.push({kind:'Message',scopeId:d.scopeId,nodeId:d.nodeId,title:d.title,subtitle:d.detail,badges:[d.severity]});
  }
  return rows.sort((a,b)=>searchKindRank(a.kind)-searchKindRank(b.kind)||text(a.title).localeCompare(text(b.title),undefined,{sensitivity:'base'})).slice(0,120);
}

function renderSearchPopover(){
  const pop=$('searchPopover');
  if(!pop)return;
  const q=state.query.trim();
  if(!q){
    pop.classList.remove('open');
    pop.innerHTML='';
    state.searchActiveIndex=-1;
    $('globalSearch').setAttribute('aria-expanded','false');
    $('globalSearch').removeAttribute('aria-activedescendant');
    return;
  }
  const results=searchResults();
  if(!results.length)state.searchActiveIndex=-1;
  else state.searchActiveIndex=Math.max(0,Math.min(results.length-1,state.searchActiveIndex));
  pop.classList.add('open','command-palette');
  $('globalSearch').setAttribute('aria-expanded','true');
  const groups=[];
  results.forEach((row,index)=>{
    const label=searchKindLabel(row.kind);
    let group=groups.find(g=>g.label===label);
    if(!group){group={label,items:[]};groups.push(group);}
    group.items.push({row,index});
  });
  const groupHtml=groups.map(group=>`<section class="search-group" aria-label="${esc(group.label)}"><div class="search-group-title"><span>${esc(group.label)}</span><b>${fmt(group.items.length)}</b></div>${group.items.map(({row:r,index:i})=>`<button id="searchResult-${i}" class="search-result ${i===state.searchActiveIndex?'active':''}" type="button" data-search-index="${i}" role="option" aria-selected="${i===state.searchActiveIndex?'true':'false'}"><span class="search-result-main"><span class="search-result-title">${esc(r.title)}</span><span class="search-result-sub">${esc(r.subtitle||'')}</span>${r.actionPreview?`<span class="search-result-action-list">${esc(r.actionPreview)}</span>`:''}</span><span class="search-result-badges">${(r.badges||[]).slice(0,2).map(b=>`<span class="badge blue">${esc(b)}</span>`).join('')}</span></button>`).join('')}</section>`).join('');
  pop.innerHTML=`<div class="command-palette-head"><div><b>Command search</b><span>${fmt(results.length)} result${results.length===1?'':'s'} for “${esc(q)}”</span></div><div class="command-palette-keys"><kbd>↑↓</kbd><kbd>Enter</kbd><kbd>Esc</kbd></div></div><div class="search-help">Operators: action:"Run Rules", function:_IGetDocAttr, has:disabled, children&gt;20, scope:DentalADA. Use <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> from anywhere.</div>${results.length?groupHtml:'<div class="empty"><div>No matching objects.</div></div>'}`;
  pop._results=results;
  announceContentStatus(results.length?`${results.length} search result${results.length===1?'':'s'} for ${q}`:`No search results for ${q}`);
  const activeId=state.searchActiveIndex>=0?`searchResult-${state.searchActiveIndex}`:'';
  if(activeId)$('globalSearch').setAttribute('aria-activedescendant',activeId);
  else $('globalSearch').removeAttribute('aria-activedescendant');
}
function closeSearchPopover(){const pop=$('searchPopover');if(!pop)return;pop.classList.remove('open','command-palette');pop.innerHTML='';pop._results=[];state.searchActiveIndex=-1;$('globalSearch').setAttribute('aria-expanded','false');$('globalSearch').removeAttribute('aria-activedescendant');}
function setSearchActiveIndex(index){const pop=optionalElement('searchPopover');const results=pop?._results||[];if(!results.length){state.searchActiveIndex=-1;renderSearchPopover();return;}const max=results.length-1;state.searchActiveIndex=Math.max(0,Math.min(max,index));renderSearchPopover();const row=document.getElementById(`searchResult-${state.searchActiveIndex}`);row?.scrollIntoView({block:'nearest'});}
function handleSearchPopoverKeydown(e){const pop=optionalElement('searchPopover');const open=!!pop?.classList.contains('open');if(!open)return false;const results=pop?._results||[];if(!results.length)return false;if(e.key==='ArrowDown'){e.preventDefault();setSearchActiveIndex((state.searchActiveIndex<0?0:state.searchActiveIndex)+1);return true;}if(e.key==='ArrowUp'){e.preventDefault();setSearchActiveIndex((state.searchActiveIndex<0?results.length-1:state.searchActiveIndex)-1);return true;}if(e.key==='Enter'){const idx=state.searchActiveIndex<0?0:state.searchActiveIndex;const hit=results[Math.max(0,Math.min(results.length-1,idx))];if(hit){e.preventDefault();jumpToSearchResult(hit);return true;}}return false;}
function isSearchUiTarget(target){return !!target?.closest?.('.global-search,.fweditor-command-search,#searchPopover,[data-search-index]');}
// Build a nested, operator-first left object tree with grouped sections and direct actions.

function globalNavigationCounts(){
  if(globalNavigationCountsCache)return globalNavigationCountsCache;
  const definedCounts=model.fwd?.overview?.counts||{};
  const tableDefs=buildGlobalTableDefinitions();
  globalNavigationCountsCache={
    resources:first(definedCounts.resourceTypes,domainRowsByView('resources').length),
    functions:first(model.fwd?.functions?.count,domainRowsByView('functions').length),
    selectionLists:first(model.fwd?.selectionLists?.count,buildSelectionListPacketDefinitions().length),
    tables:first(model.fwd?.tables?.count,definedCounts.tables,tableDefs.length),
    drivers:domainRowsByView('drivers').length,
    udfs:buildUdfDefinitions().length,
    ruleLists:first(model.fwd?.ruleLists?.count,buildRuleListPacketDefinitions().length),
    objectGraph:first(list(model.fwd?.objectGraph?.nodes).length,list(model.fwd?.editorModel?.objectGraph?.nodes).length,0),
    runtimeImpact:first(model.fwd?.runtimeImpact?.count,buildRuntimeImpactDefinitions().length)
  };
  return globalNavigationCountsCache;
}
function activeGlobalDefinitionKey(kind){
  if(kind==='resources')return state.selectedResourceKey;
  if(kind==='functions')return state.selectedFunctionName;
  if(kind==='selection-lists')return state.selectedSelectionListName;
  if(kind==='drivers')return state.selectedDriverKey;
  if(kind==='tables')return state.selectedTableName;
  if(kind==='udfs')return state.selectedUdfName;
  if(kind==='rule-lists')return state.selectedRuleListKey;
  if(kind==='object-graph')return state.selectedObjectGraphKey;
  if(kind==='runtime-impact')return state.selectedRuntimeImpactKey;
  return '';
}
function compactGlobalDefinitionRowHtml(kind,row,options={}){
  const key=text(first(row?.key,row?.name,''));
  const name=text(first(row?.name,row?.displayName,key));
  if(!kind||!key||!name)return '';
  const active=state.workspaceView===kind&&activeGlobalDefinitionKey(kind)===key;
  const meta=text(first(row?.type,row?.source,options.meta,''));
  const count=Number(first(row?.metric,row?.count,row?.ruleCount,row?.scopeCount,''));
  const countHtml=Number.isFinite(count)&&count>0?`<span class="global-view-count">${fmt(count)}</span>`:'';
  const title=`Open ${kind.replace('-', ' ')} definition: ${name}${meta?` (${meta})`:''}`;
  return `<button class="global-view-row child definition-tree-row ${active?'active':''}" type="button" data-editor-kind="${esc(kind)}" data-editor-key="${esc(key)}" data-def-kind="${esc(kind)}" data-def-key="${esc(key)}" aria-current="${active?'true':'false'}" title="${esc(title)}"><span class="global-view-name"><b>${esc(name)}</b>${meta?`<small>${esc(meta)}</small>`:''}</span>${countHtml}</button>`;
}
function compactGlobalDefinitionSectionHtml(kind,title,rows,options={}){
  const all=list(rows).filter(r=>text(first(r?.key,r?.name,'')).trim());
  if(!all.length)return '';
  const limit=Number(first(options.limit,12))||12;
  const active=state.workspaceView===kind;
  const visible=all.slice(0,limit);
  const more=all.length-visible.length;
  const rowHtml=visible.map(row=>compactGlobalDefinitionRowHtml(kind,row,options)).join('');
  const moreHtml=more>0?`<button class="global-view-row child muted-row" type="button" data-action="view-${esc(kind)}" title="Open full ${esc(title)} catalog"><span class="global-view-name">Show ${fmt(more)} more...</span><span class="global-view-count">↗</span></button>`:'';
  return `<details class="scope-section global-inventory-section" ${active?'open':''}><summary><span>${esc(title)}</span><span class="section-count">${fmt(all.length)}</span></summary><div class="scope-section-body">${rowHtml}${moreHtml}</div></details>`;
}
function compactResourceBucketTreeHtml(){
  const resources=buildGlobalResourceDefinitions();
  if(!resources.length)return '';
  const byType=new Map();
  resources.forEach(row=>{
    const type=text(row.type||'Resource');
    if(!byType.has(type))byType.set(type,[]);
    byType.get(type).push(row);
  });
  const sections=[...byType.entries()]
    .sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'}))
    .slice(0,8)
    .map(([type,rows],index)=>{
      const sorted=rows.slice().sort((a,b)=>(Number(first(b.metric,0))-Number(first(a.metric,0)))||text(a.name).localeCompare(text(b.name),undefined,{sensitivity:'base'}));
      const visible=sorted.slice(0,10);
      const more=sorted.length-visible.length;
      const active=state.workspaceView==='resources'&&sorted.some(r=>r.key===state.selectedResourceKey);
      const rowHtml=visible.map(row=>compactGlobalDefinitionRowHtml('resources',row,{meta:type})).join('');
      const moreHtml=more>0?`<button class="global-view-row child muted-row" type="button" data-action="view-resources" title="Open full resource catalog"><span class="global-view-name">Show ${fmt(more)} more ${esc(type)}...</span><span class="global-view-count">↗</span></button>`:'';
      return `<details class="scope-section global-inventory-section" ${(active||index<2)?'open':''}><summary><span>${esc(type)}</span><span class="section-count">${fmt(sorted.length)}</span></summary><div class="scope-section-body">${rowHtml}${moreHtml}</div></details>`;
    });
  const remaining=Math.max(0,byType.size-8);
  const remainingHtml=remaining?`<button class="global-view-row child muted-row" type="button" data-action="view-resources" title="Open full resource catalog"><span class="global-view-name">Show ${fmt(remaining)} more resource type buckets...</span><span class="global-view-count">↗</span></button>`:'';
  return `<details class="scope-section global-inventory-root" ${state.workspaceView==='resources'?'open':''}><summary><span>Resource Types</span><span class="section-count">${fmt(resources.length)}</span></summary><div class="scope-section-body">${sections.join('')}${remainingHtml}</div></details>`;
}
function renderGlobalInventoryTreeBlock(){
  if(!model?.fwd)return '';
  // Do not pre-slice global inventory packets here. compactGlobalDefinitionSectionHtml() handles
  // the visible row limit while preserving the true total count in the left rail.
  const functionRows=buildGlobalFunctionDefinitions();
  const selectionRows=buildSelectionListPacketDefinitions();
  const tableRows=buildGlobalTableDefinitions();
  const udfRows=buildUdfDefinitions().map(row=>({key:row.key,name:row.displayName||row.name||row.key,type:row.type||'UDF',metric:list(row.callerRules).length}));
  const driverRows=buildGlobalDriverDefinitions();
  const packetRows=buildRuleListPacketDefinitions();
  const body=[
    compactResourceBucketTreeHtml(),
    compactGlobalDefinitionSectionHtml('udfs','UDFs',udfRows,{limit:32}),
    compactGlobalDefinitionSectionHtml('tables','Tables',tableRows,{limit:24}),
    compactGlobalDefinitionSectionHtml('selection-lists','SelectionLists',selectionRows,{limit:10}),
    compactGlobalDefinitionSectionHtml('functions','Functions',functionRows,{limit:24}),
    compactGlobalDefinitionSectionHtml('drivers','Drivers',driverRows,{limit:8}),
    compactGlobalDefinitionSectionHtml('rule-lists','Rule Lists',packetRows,{limit:8})
  ].filter(Boolean).join('');
  return body||'<div class="muted compact-left-note">No global FWD index packets are loaded yet.</div>';
}
/* v80: stale pre-editor renderers are removed; the FWD tree renderer is the active implementation. */
function renderObjectTreeBlock(){
  const toTotal=rows=>rows.reduce((sum,row)=>sum+Number(first(row.count,0)),0);
  const scopeCountBy=matcher=>model.scopes.filter(s=>matcher(`${s.kind} ${s.name} ${s.scopeId}`)).length;
  const definedCounts=model.fwd?.overview?.counts||null;
  const tableDefs=buildGlobalTableDefinitions();
  const resources=domainRowsByView('resources');
  const tables=domainRowsByView('tables');
  const drivers=domainRowsByView('drivers');
  const udfs=domainRowsByView('udfs');
  const counts={
    documents:first(definedCounts?.documents,scopeCountBy(v=>/document|doc/i.test(v))),
    pages:first(definedCounts?.pages,scopeCountBy(v=>/page/i.test(v))),
    batches:first(definedCounts?.batches,scopeCountBy(v=>/batch/i.test(v))),
    processes:first(definedCounts?.processes,scopeCountBy(v=>/process|\bac\b|\bdv\b|\bfip\b|\bocr\b|render|store|webkey|\bkfi\b|\bke\b/i.test(v))),
    structure:scopedRuleNodes().length,
    resources:first(definedCounts?.resourceTypes,toTotal(resources)),
    functions:first(model.fwd?.functions?.count,toTotal(domainRowsByView('functions'))),
    tables:first(model.fwd?.tables?.count,definedCounts?.tables,tableDefs.length),
    drivers:toTotal(drivers),
    udfs:toTotal(udfs),
    unresolvedFields:getScopeFieldResolutionIndex(state.scopeId).summary.unresolved
  };
  function objectTreeRow(action,label,count,title,active=false,child=false){
    return `<button class="global-view-row ${active?'active':''} ${child?'child':''}" type="button" data-action="${action}" aria-current="${active?'true':'false'}" title="${esc(title)}"><span class="global-view-name">${esc(label)}</span><span class="global-view-count">${fmt(count)}</span></button>`;
  }
  function section(title,rows,open=true){
    if(!rows.length)return '';
    return `<details class="scope-section" ${open?'open':''}><summary><span>${esc(title)}</span></summary><div class="scope-section-body">${rows.join('')}</div></details>`;
  }
  const nav={
    documents:state.workspaceView==='structure'&&state.scopeKindFilter==='document',
    pages:state.workspaceView==='structure'&&state.scopeKindFilter==='page',
    batches:state.workspaceView==='structure'&&state.scopeKindFilter==='all'&&/batch/i.test(state.scopeQuery),
    processes:state.workspaceView==='structure'&&state.scopeKindFilter==='all'&&/process|\bac\b|\bdv\b|\bfip\b|\bocr\b|render|store|webkey|\bkfi\b|\bke\b/i.test(state.scopeQuery)
  };
  const objectRows=[
    objectTreeRow('nav-documents','Documents',counts.documents,'Document type configuration scopes',nav.documents,true),
    objectTreeRow('nav-pages','Pages',counts.pages,'Page type configuration scopes',nav.pages,true),
    objectTreeRow('nav-batches','Batches',counts.batches,'Batch configuration scopes',nav.batches,true),
    objectTreeRow('nav-processes','Processes',counts.processes,'Process-node configuration scopes',nav.processes,true)
  ];
  return `<div class="scope-group"><span>Objects</span></div><div class="global-view-list" role="group" aria-label="Scope object presets">${section('Scope Presets',objectRows,true)}</div>`;
}
function applyEditorNavPreset(target){
  state.workspaceView='structure';
  state.treeFilter='all';
  if(target==='documents'){
    state.scopeKindFilter='document';
    state.scopeQuery='';
  }else if(target==='pages'){
    state.scopeKindFilter='page';
    state.scopeQuery='';
  }else if(target==='batches'){
    state.scopeKindFilter='all';
    state.scopeQuery='batch';
  }else if(target==='processes'){
    state.scopeKindFilter='all';
    state.scopeQuery='process ac dv fip ocr render store webkey kfi ke';
  }
  renderAll();
}
function renderScopes(){
  const scopeHost=optionalElement('scopeList');
  if(!scopeHost)return;
  // The left rail is intentionally no longer a second scope selector.
  // Scope access is available in the FWD Tree rendered by renderGlobalNavigation().
  document.body.classList.toggle('no-scope-selector',!state.scopeId||!currentScope());
  scopeHost.hidden=true;
  scopeHost.setAttribute('aria-hidden','true');
  scopeHost.innerHTML='';
}

function jumpToSearchResult(r){
  if(!r)return;
  closeSearchPopover();
  if(r.kind==='Scope')return selectScope(r.scopeId);
  if(r.kind==='ActionList'){
    selectScope(r.scopeId);
    selectActionList(r.actionListKey);
    state.collapsedActionLists.delete(r.actionListKey);
    renderAll();
    return;
  }
  if(r.view&&r.key){
    state.workspaceView=r.view;
    if(r.view==='resources')state.selectedResourceKey=r.key;
    else if(r.view==='functions')state.selectedFunctionName=r.key;
    else if(r.view==='selection-lists')state.selectedSelectionListName=r.key;
    else if(r.view==='drivers')state.selectedDriverKey=r.key;
    else if(r.view==='tables')state.selectedTableName=r.key;
    else if(r.view==='udfs')state.selectedUdfName=r.key;
    else if(r.view==='rule-lists')state.selectedRuleListKey=r.key;
    else if(r.view==='object-graph')state.selectedObjectGraphKey=r.key;
    else if(r.view==='runtime-impact')state.selectedRuntimeImpactKey=r.key;
    document.body.classList.remove('inspector-open');
    renderAll();
    return;
  }
  if(r.nodeId){selectScope(r.scopeId);selectNode(r.nodeId);return;}
  if(r.scopeId)selectScope(r.scopeId);
}
// Keep scope-local views intentionally narrow for Document/Page scopes.
// Resource-definition catalogs are global concerns and are not shown as direct Doc/Page tabs.
/* FW Editor Viewer 2026 UI refresh render overrides. Keep data/model behavior unchanged. */
function syncThemeControl(){
  const btn=optionalElement('themeToggleBtn');
  if(!btn)return;
  const dark=state.theme==='dark';
  btn.setAttribute('aria-pressed',dark?'true':'false');
  btn.setAttribute('title',dark?'Switch to light theme':'Switch to dark theme');
  btn.setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme');
}
function productHealthLabel(hydration,warnings){
  if(hydration.level==='warn')return ['warn','Partial snapshot','Status loaded with fallback or missing endpoints.'];
  if(Number(warnings||0)>0)return ['warn','Configuration warnings',`${fmt(warnings)} warnings are available in Load Status.`];
  return ['ok','Ready for review','Snapshot loaded cleanly with no reader warnings.'];
}
function renderAll(){return withUiGuard('render',()=>{normalizeWorkspaceViewForScope();setEditorModeClasses();if(isEditorMode()){document.body.classList.remove('inspector-open');}else{applyPaneLayout();}syncInspectorVisibility();saveState();renderTop();renderGlobalNavigation();renderScopes();renderMainHead();renderContent();renderDiagnosticsDock();renderInspector();renderSearchPopover();syncOnboardingChecklist();syncActionAvailability();});}
function renderTop(){
  document.body.classList.toggle('no-scope-selector',!state.scopeId||!currentScope());
  const banner=optionalElement('globalErrorBanner');
  if(banner&&bootState.phase!=='failed')banner.hidden=true;
  document.body.classList.toggle('is-loading',!model||bootState.phase==='loading');
  document.body.classList.toggle('is-loaded',!!model&&bootState.phase!=='loading');
  setEditorModeClasses();
  if(!model||bootState.phase==='loading'){
    $('sourceSubtitle').textContent='Loading FWD snapshot...';
    $('statusPill').innerHTML='<span class="dot warn"></span><span>Snapshot loading</span>';
    const summaryConfig=optionalElement('sourceSummaryConfig');
    const summaryRules=optionalElement('sourceSummaryRules');
    const summaryWarnings=optionalElement('sourceSummaryWarnings');
    if(summaryConfig)summaryConfig.textContent='Loading';
    if(summaryRules)summaryRules.textContent='Pending';
    if(summaryWarnings)summaryWarnings.textContent='Pending';
    $('globalSearch').value=state.query;
    syncActionAvailability();
    return;
  }
  const totalRules=model.nodes.filter(n=>n.isRule).length;
  const totalWarnings=model.scopes.reduce((sum,s)=>sum+Number(first(s.warnings,0)),0);
  const total=fmt(totalRules);
  const activeView=(state.workspaceView||'structure').toUpperCase();
  const hydration=fwdHydrationSummary();
  $('sourceSubtitle').textContent=`${snapshotId()} · read-only · ${total} rules`;
  const warnDot=hydration.level==='warn'||totalWarnings>0;
  const statusText=hydration.level==='warn'
    ? `Snapshot partial · ${fmt(totalWarnings)} warnings`
    : `${total} rules${totalWarnings?` · ${fmt(totalWarnings)} warnings`:' · parse clean'}`;
  $('statusPill').innerHTML=`<span class="dot ${warnDot?'warn':''}"></span><span>${esc(statusText)}</span>`;
  const summaryConfig=optionalElement('sourceSummaryConfig');
  const summaryRules=optionalElement('sourceSummaryRules');
  const summaryWarnings=optionalElement('sourceSummaryWarnings');
  if(summaryConfig)summaryConfig.textContent=hydration.level==='warn'?'Partial':'Loaded';
  if(summaryRules)summaryRules.textContent=total;
  if(summaryWarnings)summaryWarnings.textContent=fmt(totalWarnings);
  $('globalSearch').value=state.query;
  syncActionAvailability();
  syncThemeControl();
}
function viewLabel(){
  const labels={all:'All rules',disabled:'Disabled only',inherited:'Inherited disabled',warnings:'Load status only',actions:'Parent rules with action lists',sections:'Sections and comments'};
  const base=labels[state.treeFilter]||'Filtered view';
  const q=text(state.query).trim();
  return q?`${base} | search: ${q}`:base;
}
function activeSliceHtml(){
  const view=state.workspaceView||'structure';
  const labels={
    structure:['Structure','Rule hierarchy'],
    'field-resolution':['Fields','Resolution matrix'],
    'load-status':['Load Status','Developer'],
    resources:['Resources','Global definitions'],
    functions:['Functions','AC catalog'],
    tables:['Tables','Global definitions'],
    drivers:['Drivers','Global definitions'],
    udfs:['UDFs','Global definitions'],
  };
  const row=labels[view]||['Editor','FWD view'];
  return `<div class="active-slice" aria-label="Active configuration view"><span>${esc(row[0])}</span><b>${esc(row[1])}</b></div>`;
}
function modalFocusableElements(){
  const modal=optionalElement('helpModal');
  if(!modal||typeof modal.querySelectorAll!=='function')return [];
  const selector='a[href],button:not([disabled]),textarea,input,select,details summary,[tabindex]:not([tabindex="-1"])';
  return [...modal.querySelectorAll(selector)].filter(el=>{
    if(!el)return false;
    if(el.disabled)return false;
    if(el.hidden)return false;
    if(el.getAttribute&&el.getAttribute('aria-hidden')==='true')return false;
    return true;
  });
}
function handleModalFocusTrap(event){
  if(!event||event.key!=='Tab')return;
  const nodes=modalFocusableElements();
  if(!nodes.length){
    event.preventDefault?.();
    optionalElement('helpModal')?.focus?.();
    return;
  }
  const firstNode=nodes[0];
  const lastNode=nodes[nodes.length-1];
  const active=document.activeElement;
  if(event.shiftKey&&active===firstNode){
    event.preventDefault?.();
    lastNode.focus?.();
  } else if(!event.shiftKey&&active===lastNode){
    event.preventDefault?.();
    firstNode.focus?.();
  }
}
function renderContextHelp(topic){
  const help={
    'action-list':{
      title:'Action Lists / Status Results',
      body:'An action list is the configured sub-list selected by a parent rule status result. The parent rule owns the status/action label; child rules do not.',
      checks:['Confirm the parent rule and status result.','Review child rules in configured order.','Treat the path as static FWD configuration, not runtime execution.']
    },
    model:{
      title:'FWD model',
      body:'FormWorks Editor authors the FWD/STC model: documents, pages, variants, fields, batches, processes, resources, and private configuration nodes. This viewer is read-only.',
      checks:['Use Structure for rule-list hierarchy.','Use global definitions for functions, UDFs, tables, resources, and drivers.','Use Advanced / Raw only as final confirmation.']
    },
    disabled:{
      title:'Disabled state',
      body:'Disabled state is reported from extracted structural configuration when available. Inherited disabled means the rule sits under a disabled parent in the rule-list tree.',
      checks:['Distinguish direct disabled from inherited disabled.','Treat sequence-only hints as reader-status hints only.','Check parent rule and action-list context before drawing conclusions.']
    }
  };
  const item=help[topic]||{title:'Context help',body:'This view is read-only and FWD-first.',checks:['Select a scope.','Inspect the rule or Action List.','Copy config when documenting findings.']};
  return `<div class="help-grid"><section class="panel"><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p><ul>${item.checks.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section></div>`;
}
function subtreeNodes(nodeId){
  const result=[];
  const seen=new Set();
  const visit=id=>{
    const key=String(id||'');
    if(!key||seen.has(key))return;
    seen.add(key);
    const node=model.nodesById.get(key);
    if(node)result.push(node);
    childIds(key).forEach(visit);
  };
  visit(nodeId);
  return result;
}

function matchingProcessDiagnostic(processName){
  if(!text(processName).trim())return null;
  return scopedDiags().find(d=>hasProcessToken(processName,`${d.title} ${d.detail} ${d.Message} ${d.scopeId}`))||null;
}
function matchingProcessRule(processName){
  if(!text(processName).trim())return null;
  return scopedRuleNodes().find(n=>hasProcessToken(processName,`${n.fn} ${n.title} ${n.scopeId}`))||null;
}
function selectProcessContext(processName){
  const name=text(processName).trim();
  if(!name)return;
  state.selectedProcessName=name;
  state.workspaceView='structure';
  const diag=matchingProcessDiagnostic(name);
  const node=diag?null:matchingProcessRule(name);
  if(diag){
    state.messageFilter=severityIsError(diag.severity)?'error':(severityIsProblem(diag.severity)?'warning':'info');
    state.selectedType='diag';
    state.selectedId=diag.id;
    document.body.classList.add('inspector-open');
  }else if(node){
    state.selectedType='node';
    state.selectedId=node.id;
    state.focusNodeId=node.id;
    state.expanded.add(node.id);
    document.body.classList.add('inspector-open');
  }else{
    state.selectedType='scope';
    state.selectedId='';
    state.focusNodeId='';
    document.body.classList.remove('inspector-open');
  }
  renderAll();
  toast(`${name} process context selected`);
}
function selectMessageFilter(mode){
  state.messageFilter=normalizeMessageFilter(mode);
  if(state.messageFilter==='rule-validation'){
    state.workspaceView='structure';
    state.treeFilter='warnings';
  }else if(state.messageFilter==='missing-refs'){
    state.workspaceView='field-resolution';
    state.fieldResolutionFilter='unresolved';
  }else{
    state.workspaceView=isAdvancedMode()?'load-status':'structure';
  }
  const d=firstDiagnosticForFilter(state.messageFilter);
  if(d){
    state.selectedType='diag';
    state.selectedId=d.id;
    document.body.classList.add('inspector-open');
  }else if(state.selectedType==='diag'){
    state.selectedType='scope';
    state.selectedId='';
  }
  renderAll();
}

function renderModal(){const open=!!state.modal;const app=optionalElement('mainContent')?.closest('.app');$('modalBackdrop').classList.toggle('open',open);$('helpModal').classList.toggle('open',open);$('helpModal').classList.toggle('wide',state.modal==='global-detail');if(app){if(open)app.setAttribute('aria-hidden','true');else app.removeAttribute('aria-hidden');}if(!open){if(modalPreviouslyFocusedEl&&typeof modalPreviouslyFocusedEl.focus==='function')modalPreviouslyFocusedEl.focus();modalPreviouslyFocusedEl=null;return;}if(!modalPreviouslyFocusedEl)modalPreviouslyFocusedEl=document.activeElement;const detail=state.modal==='global-detail'?globalDetailRecord():null;const title=state.modal==='global-detail'?(detail?.row?.name||detail?.row?.displayName||detail?.row?.key||'Definition details'):state.modal?.startsWith('help-')?'Contextual help':'FW Editor Viewer help';$('helpTitle').textContent=title;$('helpCaption').textContent=state.modal==='global-detail'?(detail?.label||'Definition details'):'Read-only FW Editor Viewer.';if(state.modal==='global-detail')$('helpBody').innerHTML=renderGlobalDefinitionModal();else if(state.modal?.startsWith('help-'))$('helpBody').innerHTML=renderContextHelp(state.modal.replace(/^help-/,''));else renderHelp();const firstNode=modalFocusableElements()[0];window.setTimeout(()=>{(firstNode||$('helpModal')).focus();},0);}