
function renderGlobalDefinitionExplorer(kind,rows,selectedKey,stateKey,copy,detailHtml){
  const q=lower(state.query).trim();
  if(q){
    rows=rows.filter(row=>definitionSearchText(row).includes(q));
  }
  const host=$('content');
  if(!rows.length){
    host.innerHTML=`<section class="fweditor-resource-workspace empty" aria-label="${esc(fweditorKindTitle(kind))} resources"><div class="fweditor-workspace-titlebar"><div><span class="workspace-eyebrow">FormWorks Editor Viewer</span><h3>${esc(copy.emptyTitle||'No definitions found')}</h3><p>${esc(copy.emptyBody||'Clear search or choose another resource group.')}</p></div></div></section>`;
    return;
  }
  const selected=rows.find(r=>r.key===selectedKey)||rows[0];
  state[stateKey]=selected.key;
  const originUi=definitionOriginUi(kind,selected);
  const usageCount=list(selected.usage).length||selected.metric||0;
  const advancedMessages=isAdvancedMode()?`<section class="fweditor-resource-status">${fweditorGlobalMessageWindowHtml(kind,selected,rows,originUi)}</section>`:'';
  host.innerHTML=`<section class="fweditor-resource-workspace" aria-label="Read-only ${esc(fweditorKindTitle(kind))} resource configuration"><div class="fweditor-workspace-titlebar"><div><span class="workspace-eyebrow">FormWorks Editor Viewer</span><h3>${esc(copy.title||fweditorKindTitle(kind))}</h3><p>${esc(copy.body||'Read-only resource configuration.')}</p></div><div class="fweditor-workspace-metrics"><span><b>${fmt(rows.length)}</b> items</span><span><b>${fmt(usageCount)}</b> references</span></div></div><div class="fweditor-resource-two-pane"><aside class="fweditor-resource-index" aria-label="${esc(fweditorKindTitle(kind))} list"><div class="fweditor-pane-title visible">FWD Tree</div>${fweditorDefinitionTreeHtml(kind,rows,selected.key)}</aside><article class="fweditor-resource-detail" aria-label="${esc(copy.title||fweditorKindTitle(kind))} details">${fweditorGlobalConfigurationWindowHtml(kind,copy,selected,originUi,usageCount,detailHtml)}</article></div>${advancedMessages}</section>`;
}

function functionUsageRowsForName(functionName){
  return list(model.ruleUsageByFunctionName?.get(lower(functionName))).slice();
}
function runtimeImpactRowsForFunction(functionName){
  if(!isAdvancedMode())return [];
  const target=lower(functionName);
  return list(model.fwd?.runtimeImpact?.items)
    .filter(i=>lower(i.functionName)===target)
    .sort((a,b)=>text(a.scopeId).localeCompare(text(b.scopeId),undefined,{sensitivity:'base'})||text(a.ruleName).localeCompare(text(b.ruleName),undefined,{sensitivity:'base'}));
}
function runtimeImpactEvidenceHtml(functionName){
  const rows=runtimeImpactRowsForFunction(functionName);
  if(!rows.length)return '';
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Rule Impact Summary</h4><p>Static function-specific configuration impact records. Native AC execution is not simulated.</p></div><span class="badge blue">${fmt(rows.length)} impacts</span></div><div class="mini-list">${rows.slice(0,12).map(row=>`<div class="mini-row"><span><b>${esc(text(row.impactType||'Impact'))}</b> ${esc(text(row.summary||''))}</span><span class="mono">${esc(text(row.ruleName||row.scopeId||''))}</span></div>`).join('')}</div>${rows.some(r=>list(r.behaviorFlags).length)?`<div class="table-columns-head">Behavior flags</div>${functionTokenStripHtml([...new Set(rows.flatMap(r=>list(r.behaviorFlags).map(text).filter(Boolean)))],'blue')}`:''}${rows.some(r=>list(r.relationshipTargets).length)?`<div class="caption mt-8">Relationship targets are available in the raw impact rows for deeper drill-through.</div>`:''}</section>`;
}
function inferClientFunctionCategory(functionName){
  const fn=lower(functionName);
  if(/udf|user.?defined/.test(fn))return 'User Defined';
  if(/table|selectionlist|lookup|fuzzy|\bsl\b/.test(fn))return 'Table';
  if(/format|copy|delete|plug|merge|limit/.test(fn))return 'Formatting';
  if(/check|test|compare|^is|^has/.test(fn))return 'Testing';
  if(/attr/.test(fn))return 'Intrinsic Attribute';
  if(/^_i/.test(fn))return 'Intrinsic';
  return 'Custom / Unknown';
}
function buildGlobalFunctionDefinitions(){
  if(globalFunctionDefinitionsCache)return globalFunctionDefinitionsCache;
  const definedItems=list(model.fwd?.functions?.items);
  if(definedItems.length){
    const result=definedItems.map(f=>{
      const name=text(f.name);
      const usage=functionUsageRowsForName(name);
      const observed=Number(first(f.observedRuleCount,usage.length,0))||usage.length;
      return {
        key:name,
        name,
        type:text(first(f.category,'Function')),
        source:text(first(f.source,'Function catalog')),
        defined:first(f.defined,false)===true||first(f.functionResource,false)===true,
        metric:observed,
        usage,
        fn:f
      };
    }).filter(r=>r.name).sort((a,b)=>a.type.localeCompare(b.type,undefined,{sensitivity:'base'})||(b.metric-a.metric)||a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
    globalFunctionDefinitionsCache=result;
    return result;
  }
  const result=domainRowsByView('functions').map(r=>{
    const name=text(r.name);
    const usage=functionUsageRowsForName(name);
    return {
      key:name,
      name,
      type:inferClientFunctionCategory(name),
      source:'Structural and inventory usage',
      defined:false,
      metric:Number(first(r.count,usage.length,0))||usage.length,
      usage,
      fn:{name,category:inferClientFunctionCategory(name),description:'Function observed in static rule configuration. Catalog metadata was not available in this snapshot.',observedRuleCount:Number(first(r.count,usage.length,0))||usage.length,statusResults:[],configuredStatusResults:[...new Set(usage.flatMap(u=>u.statusResults))],observedParameterNames:[...new Set(usage.flatMap(u=>Object.keys(u.parameters||{})))],behaviorFlags:['UnknownStaticBehavior'],behaviorNotes:['Inspect configured action lists and parameter bindings before inferring behavior.'],diagnostics:['FunctionNotHydratedFromApi']}
    };
  }).filter(r=>r.name);
  globalFunctionDefinitionsCache=result;
  return result;
}
function functionTokenStripHtml(items,tone='blue',empty='None extracted.'){
  const values=list(items).map(text).filter(Boolean);
  return values.length?`<div class="udf-token-strip">${values.slice(0,80).map(x=>`<span class="udf-token ${esc(tone)}" title="${esc(x)}">${esc(x)}</span>`).join('')}</div>`:`<div class="global-empty-state compact">${esc(empty)}</div>`;
}
function functionConfigurationHtml(f,row){
  const statuses=list(f.statusResults).map(text).filter(Boolean);
  const configured=list(f.configuredStatusResults).map(text).filter(Boolean);
  const params=list(f.observedParameterNames).map(text).filter(Boolean);
  const roles=list(f.parameterRoles).map(text).filter(Boolean);
  const flags=list(f.behaviorFlags).map(text).filter(Boolean);
  const impacts=isAdvancedMode()?list(first(f.runtimeImpacts,f.behaviorNotes,[])).map(text).filter(Boolean):[];
  const diagnostics=list(f.diagnostics).map(text).filter(Boolean);
  const facts=[
    ['Category',esc(first(f.category,row.type,'Function'))],
    ['Catalog',f.defined?'Curated definition':(f.functionResource?'Function resource':'Observed usage')],
    ['Observed rules',fmt(first(f.observedRuleCount,row.metric,0))],
    ['Relationships',fmt(first(f.relationshipCount,0))]
  ];
  const advancedImpactHtml=isAdvancedMode()?`${impacts.length?`<div class="table-columns-head">Advanced impact notes</div><div class="mini-list">${impacts.map(x=>`<div class="mini-row"><span>${esc(x)}</span></div>`).join('')}</div>`:''}${runtimeImpactEvidenceHtml(first(f.name,row.name,''))}`:'';
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Function Model</h4><p>${esc(first(f.description,'AC function observed in static FWD configuration.'))}</p></div><span class="badge ${f.deprecated?'amber':'blue'}">${f.deprecated?'deprecated':esc(first(f.source,row.source,'catalog'))}</span></div><div class="kv">${facts.map(([k,v])=>kv(k,v)).join('')}</div>${diagnostics.length?`<div class="table-columns-head">Status Items</div>${functionTokenStripHtml(diagnostics,'amber')}`:''}</section><section class="udf-section-card"><div class="udf-section-head"><div><h4>Interface</h4><p>Status results and parameters shown from static FWD configuration.</p></div><span class="badge blue">${fmt(statuses.length||configured.length)} statuses</span></div><div class="table-columns-head">Status results</div>${functionTokenStripHtml(statuses,'amber','No catalog or configured status results were extracted.')}${configured.length?`<div class="caption mt-8">Configured ActionNames from this snapshot: ${esc(configured.join(', '))}</div>`:''}<div class="table-columns-head">Parameter roles</div>${functionTokenStripHtml(roles,'blue','No curated parameter roles are available.')}${params.length?`<div class="table-columns-head">Observed parameter names</div>${functionTokenStripHtml(params,'blue')}`:''}</section><section class="udf-section-card"><div class="udf-section-head"><div><h4>Function Behavior</h4><p>Static function flags from the catalog and configured usage. Advanced execution-impact details are only shown with ?advanced=1.</p></div><span class="badge blue">${fmt(flags.length)} flags</span></div>${functionTokenStripHtml(flags,'blue','No behavior flags are available.')}</section>${advancedImpactHtml}`;
}
function buildSelectionListPacketDefinitions(){
  return list(model.fwd?.selectionLists?.items).map(item=>{
    const name=text(item.name);
    const usage=list(item.usageLinks).map(u=>({
      scopeId:text(u.scopeId),
      ruleName:text(u.ruleName||'SelectionList usage'),
      functionName:text(u.functionName||''),
      node:u.ruleNodeId?model.nodesById.get(String(u.ruleNodeId)):null,
      nodeId:text(u.ruleNodeId||''),
      target:name,
      targetType:'SelectionList',
      relationshipKind:text(u.relationshipKind||'UsesTable'),
      matchLevel:text(first(u.confidence,item.confidence,'High')),
      rel:u
    }));
    const fieldCount=list(item.matchFields).length+list(item.plugFields).length+list(item.columns).length;
    return {
      key:name,
      name,
      type:text(first(item.tableDriver,item.resourceType,'SelectionList')),
      source:text(first(item.source,'SelectionList packet')),
      defined:first(item.canonical,true)===true,
      metric:fieldCount,
      usage,
      selectionList:item,
      searchBlob:[name,item.resourceType,item.tableDriver,item.source,list(item.matchFields).map(f=>f.name).join(' '),list(item.plugFields).map(f=>f.name).join(' '),list(item.options).map(o=>`${o.role} ${o.name} ${o.value}`).join(' ')].join(' ')
    };
  }).filter(row=>row.name).sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
}
function selectionListFieldRowsHtml(title,rows,tone='blue'){
  const fields=list(rows);
  if(!fields.length)return '';
  return `<div class="table-columns-head">${esc(title)}</div><div class="table-columns-grid">${fields.slice(0,140).map(field=>`<div class="table-column-row"><div class="table-col-name">${esc(text(field.name||field.Name||''))}</div><div class="table-col-meta"><span class="badge ${esc(tone)}">${esc(text(first(field.role,title)))}</span><span class="mono">${esc(text(first(field.confidence,field.matchLevel,'parsed')))}</span></div></div>`).join('')}</div>${fields.length>140?`<div class="caption mt-8">Showing first 140 ${esc(title.toLowerCase())}.</div>`:''}`;
}
function selectionListOptionsHtml(options){
  const rows=list(options);
  if(!rows.length)return '<div class="global-empty-state compact">No SelectionList options were extracted.</div>';
  return `<div class="mini-list">${rows.slice(0,80).map(option=>`<div class="mini-row"><span><b>${esc(text(first(option.role,option.name,'Option')))}</b> ${esc(text(first(option.name,'')))}</span><span class="mono">${esc(text(first(option.value,option.source,'')))}</span></div>`).join('')}</div>`;
}
function selectionListPacketDetailHtml(row){
  const item=row.selectionList||{};
  const facts=[
    ['Resource type',esc(text(first(item.resourceType,row.type,'SelectionList')))],
    ['Authority',esc(text(first(item.authority,'ParsedSelectionList')))],
    ['Source',esc(text(first(item.source,row.source,'SelectionList packet')))],
    ['Table driver',esc(text(first(item.tableDriver,'SelectionList')))],
    ['Schema',first(item.schemaParsed,false)?'Parsed':'Not parsed'],
    ['Options',first(item.optionsParsed,false)?`${fmt(list(item.options).length)} parsed`:'Not parsed'],
    ['Match fields',fmt(list(item.matchFields).length)],
    ['Plug fields',fmt(list(item.plugFields).length)],
    ['Columns',fmt(list(item.columns).length)],
    ['Usage links',fmt(list(row.usage).length)]
  ];
  const diagnostics=list(item.diagnostics).map(text).filter(Boolean);
  const advancedDetails=isAdvancedMode()?`<div class="table-columns-head">Advanced source details</div>${previewJsonHtml({resourceDetails:item['resource'+'Evidence'],rawResourceDetails:item.rawResourceDetails},{maxDepth:4,maxArray:50,maxKeys:80,maxChars:16000})}<div class="table-columns-head">Advanced / Raw packet</div>${previewJsonHtml(item,{maxDepth:4,maxArray:70,maxKeys:90,maxChars:18000})}`:'';
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>SelectionList Packet</h4><p>${first(item.schemaParsed,false)?'Parsed table-backed SelectionList configuration.':'SelectionList/table lookup rule reference. This is not a parsed schema unless the Schema field says Parsed.'}</p></div><span class="badge ${first(item.schemaParsed,false)?'green':'amber'}">${first(item.schemaParsed,false)?'schema parsed':'rule reference'}</span></div><div class="kv">${facts.map(([k,v])=>kv(k,v)).join('')}</div>${isAdvancedMode()&&diagnostics.length?`<div class="table-columns-head">Status Items</div>${functionTokenStripHtml(diagnostics,'amber')}`:''}</section><section class="udf-section-card"><div class="udf-section-head"><div><h4>Fields</h4><p>Match fields, plug fields, and parsed columns from SelectionList configuration details.</p></div><span class="badge blue">${fmt(row.metric)} fields</span></div>${selectionListFieldRowsHtml('Match fields',item.matchFields,'blue')}${selectionListFieldRowsHtml('Plug fields',item.plugFields,'green')}${selectionListFieldRowsHtml('Columns',item.columns,'amber')}</section><section class="udf-section-card"><div class="udf-section-head"><div><h4>Options / Behaviors</h4><p>Persistence, rerun, prompt/keyer, no-good-match, enter, plug, and reject signals when present.</p></div><span class="badge blue">${fmt(list(item.options).length)} options</span></div>${selectionListOptionsHtml(item.options)}</section><div class="table-columns-head">Used By</div>${usagePreviewHtml(row.usage)}${advancedDetails}`;
}
function nodeForRuntimeImpact(row){
  const guid=text(first(row.ruleGuid,row.RuleGuid,'')).trim().toLowerCase();
  const scopeId=text(first(row.scopeId,row.ScopePath,'')).trim();
  const ruleName=text(first(row.ruleName,row.RuleName,'')).trim().toLowerCase();
  const functionName=text(first(row.functionName,row.FunctionName,'')).trim().toLowerCase();
  if(guid){
    const byGuid=model.nodes.find(n=>text(n.RuleGuid).trim().toLowerCase()===guid&&(!scopeId||n.scopeId===scopeId));
    if(byGuid)return byGuid;
  }
  return model.nodes.find(n=>n.scopeId===scopeId&&lower(n.title)===ruleName&&(!functionName||lower(n.fn)===functionName))||null;
}
function runtimeImpactKey(row,index){
  return [text(first(row.scopeId,row.ScopePath,'')),text(first(row.ruleGuid,row.RuleGuid,'')),text(first(row.ruleName,row.RuleName,'')),text(first(row.functionName,row.FunctionName,'')),index].join('|');
}
function buildRuntimeImpactDefinitions(){
  if(!isAdvancedMode())return [];
  return list(model.fwd?.runtimeImpact?.items).map((item,index)=>{
    const node=nodeForRuntimeImpact(item);
    const key=runtimeImpactKey(item,index);
    const usage=node?[{scopeId:node.scopeId,ruleName:node.title,functionName:node.fn,node,target:text(first(item.impactType,'')),targetType:'RuntimeImpact',relationshipKind:text(first(item.summary,'Static impact'))}]:[];
    const flags=list(item.behaviorFlags).map(text).filter(Boolean);
    const targets=list(item.relationshipTargets);
    return {
      key,
      name:`${text(first(item.ruleName,'Unnamed rule'))} - ${text(first(item.functionName,'No function'))}`,
      type:text(first(item.impactType,item.schemaProfile?.mutationKind,'RuntimeImpact')),
      source:text(first(item.schemaProfile?.source,'Advanced impact packet')),
      defined:true,
      metric:flags.length+targets.length,
      usage,
      impact:item,
      node,
      searchBlob:[key,item.scopeId,item.ruleName,item.ruleGuid,item.functionName,item.impactType,item.summary,flags.join(' '),JSON.stringify(targets)].join(' ')
    };
  }).sort((a,b)=>a.type.localeCompare(b.type,undefined,{sensitivity:'base'})||a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
}
function runtimeSchemaProfileHtml(profile){
  if(!profile||typeof profile!=='object')return '<div class="global-empty-state compact">No schema profile was exported for this impact row.</div>';
  const rows=[
    ['Mutation kind',esc(text(profile.mutationKind||''))],
    ['Reads fields',profile.readsFields?'Yes':'No'],
    ['Writes fields',profile.writesFields?'Yes':'No'],
    ['Uses table',profile.usesTable?'Yes':'No'],
    ['Calls UDF',profile.callsUdf?'Yes':'No'],
    ['Operator work',profile.createsOperatorWork?'Yes':'No'],
    ['Action Lists rule flow',profile.branchesRuleFlow?'Yes':'No'],
    ['Runtime only',profile.runtimeOnly?'Yes':'No'],
    ['Source',esc(text(profile.source||''))]
  ];
  return `<div class="kv">${rows.map(([k,v])=>kv(k,v)).join('')}</div>`;
}
function relationshipTargetsHtml(targets){
  const rows=list(targets);
  if(!rows.length)return '<div class="global-empty-state compact">No relationship targets were attached to this impact row.</div>';
  return `<div class="mini-list">${rows.slice(0,80).map(target=>`<div class="mini-row"><span><b>${esc(text(first(target.Kind,target.kind,'Uses')))}</b> ${relationshipTargetHtml({target:first(target.Target,target.target,''),targetType:first(target.TargetType,target.targetType,''),kind:first(target.Kind,target.kind,''),ParameterRole:first(target.ParameterRole,target.parameterRole,''),FunctionName:''})}</span><span class="mono">${esc(text(first(target.ParameterName,target.parameterName,target.Confidence,target.confidence,'')))}</span></div>`).join('')}</div>`;
}
function runtimeImpactDetailHtml(row){
  const impact=row.impact||{};
  const node=row.node;
  const flags=list(impact.behaviorFlags).map(text).filter(Boolean);
  const facts=[
    ['Scope',esc(text(first(impact.scopeId,node?.scopeId,'')))],
    ['Rule',esc(text(first(impact.ruleName,node?.title,'')))],
    ['Function',esc(text(first(impact.functionName,node?.fn,'')))],
    ['Impact type',esc(row.type||'RuntimeImpact')],
    ['Targets',fmt(list(impact.relationshipTargets).length)],
    ['Native execution',esc(text(first(impact.notProven,'Not simulated')))]
  ];
  const open=node?`<button class="btn" type="button" data-node="${esc(node.id)}" data-node-scope="${esc(node.scopeId)}">Open Rule</button>`:'<span class="badge amber">Unlinked</span>';
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>Rule Impact Packet</h4><p>Static function-specific configuration model for a configured rule. This does not claim native AC execution.</p></div>${open}</div><div class="kv">${facts.map(([k,v])=>kv(k,v)).join('')}</div>${impact.summary?`<div class="notice compact"><div class="notice-icon">i</div><div><b>Summary</b><br>${esc(text(impact.summary))}</div></div>`:''}</section><section class="udf-section-card"><div class="udf-section-head"><div><h4>Behavior Flags</h4><p>Function catalog flags and static relationship details.</p></div><span class="badge blue">${fmt(flags.length)} flags</span></div>${functionTokenStripHtml(flags,'blue','No behavior flags were exported.')}</section><section class="udf-section-card"><div class="udf-section-head"><div><h4>Schema Profile</h4><p>Function-specific static model used to describe likely operator/runtime impact.</p></div><span class="badge blue">${esc(text(first(impact.schemaProfile?.mutationKind,row.type,'Impact')))}</span></div>${runtimeSchemaProfileHtml(impact.schemaProfile)}</section><section class="udf-section-card"><div class="udf-section-head"><div><h4>Relationship Targets</h4><p>Fields, attributes, tables, UDFs, reject messages, and options touched by this rule.</p></div><span class="badge blue">${fmt(list(impact.relationshipTargets).length)} targets</span></div>${relationshipTargetsHtml(impact.relationshipTargets)}</section><div class="table-columns-head">Raw impact row</div>${previewJsonHtml(impact,{maxDepth:4,maxArray:80,maxKeys:100,maxChars:20000})}`;
}
function renderRuntimeImpactDefinitions(){
  if(!isAdvancedMode())return;
  renderGlobalDefinitionExplorer('runtime-impact',buildRuntimeImpactDefinitions(),state.selectedRuntimeImpactKey,'selectedRuntimeImpactKey',{title:'Runtime Impact',body:'Static function-specific impact rows with behavior flags, relationship targets, and rule links. Native AC execution is not simulated.',emptyTitle:'No runtime impact rows found',emptyBody:'No runtime-impact packet was loaded.'},runtimeImpactDetailHtml);
}

// Build global table definitions and inferred column names from relationship co-occurrence.
function buildGlobalTableDefinitions(){
  if(globalTableDefinitionsCache)return globalTableDefinitionsCache;
  globalTableDefinitionsCache=computeGlobalTableDefinitions();
  return globalTableDefinitionsCache;
}
function computeGlobalTableDefinitions(){
  const selectionItems=list(model.fwd?.selectionLists?.items);
  const definedTables=list(model.fwd?.tables?.items);
  const usageByTarget=tableUsageIndex(definedTables.map(t=>t.name));
  if(selectionItems.length||definedTables.length){
    const merged=new Map();
    function tableKey(name){return text(name).trim().toLowerCase();}
    function ensure(name){
      const clean=text(name).trim();
      if(!clean)return null;
      const key=tableKey(clean);
      if(!merged.has(key))merged.set(key,{name:clean,hits:0,scopeCount:0,ruleCount:0,defined:false,inferred:false,parsedColumns:[],usageDerivedFields:[],columns:[],matchFields:[],plugFields:[],options:[],resourceEvidence:null,hasParsedSchema:false,optionsParsed:false,messages:[],usage:[],raw:{}});
      return merged.get(key);
    }
    function mergeColumns(target,prop,columns){
      const map=new Map(list(target[prop]).map(c=>[tableKey(c.name),c]));
      list(columns).forEach(c=>{const name=text(first(c.name,c.Name,c.column,c.Column,'')).trim();if(!name)return;const key=tableKey(name);const existing=map.get(key)||{name,hits:0,matchLevel:text(first(c.matchLevel,c.confidence,'Medium')),role:c.role};existing.hits=Math.max(Number(existing.hits)||0,Number(first(c.hits,0))||0);existing.matchLevel=text(first(existing.matchLevel,c.matchLevel,c.confidence,'Medium'));existing.role=text(first(existing.role,c.role,''));map.set(key,existing);});
      target[prop]=[...map.values()].sort((a,b)=>(Number(b.hits||0)-Number(a.hits||0))||text(a.name).localeCompare(text(b.name),undefined,{sensitivity:'base'}));
    }
    definedTables.forEach(t=>{
      const row=ensure(t.name);
      if(!row)return;
      const parsed=list(first(t.parsedColumns,[])).map(c=>({name:text(first(c.name,c.Name,c.column,c.Column,'')),hits:Number(first(c.hits,0))||0,matchLevel:text(first(c.matchLevel,c.confidence,'High')),role:'Parsed column'})).filter(c=>c.name);
      const derived=list(first(t.usageDerivedFields,t.columns,[])).map(c=>({name:text(first(c.name,c.Name,c.column,c.Column,'')),hits:Number(first(c.hits,0))||0,matchLevel:text(first(c.matchLevel,c.confidence,'Medium')),role:'Referenced field'})).filter(c=>c.name);
      row.defined=first(t.defined,t.canonical,false)===true;
      row.inferred=false;
      row.hits=Math.max(row.hits,Number(first(t.referenceCount,t.ruleCount,0))||0);
      row.scopeCount=Math.max(row.scopeCount,Number(first(t.scopeCount,0))||0);
      row.ruleCount=Math.max(row.ruleCount,Number(first(t.ruleCount,t.referenceCount,0))||0);
      row.resourceType=text(first(t.resourceType,'Table'));
      row.source=text(first(t.source,'CanonicalFwdResource'));
      row.confidence=text(first(t.confidence,'High'));
      row.hasParsedSchema=row.hasParsedSchema||parsed.length>0;
      row.messages=[...new Set([...row.messages,...list(first(t.messages,t.diagnostics,[])).map(text).filter(Boolean)])];
      row.usage=list(row.usage).length?row.usage:(usageByTarget.get(tableKey(t.name))||[]);
      row.raw.table=t;
      mergeColumns(row,'parsedColumns',parsed);
      mergeColumns(row,'usageDerivedFields',derived);
      mergeColumns(row,'columns',[...parsed,...derived]);
    });
    selectionItems.forEach(t=>{
      const row=ensure(t.name);
      if(!row)return;
      const usage=list(t.usageLinks).map(u=>({
        scopeId:text(u.scopeId),
        ruleName:text(u.ruleName||'SelectionList rule'),
        functionName:text(u.functionName||''),
        target:row.name,
        targetType:'SelectionList',
        relationshipKind:text(u.relationshipKind||'UsesTable'),
        matchLevel:text(first(u.confidence,t.confidence,'High')),
        node:u.ruleNodeId?model.nodesById.get(String(u.ruleNodeId)):null,
        nodeId:text(u.ruleNodeId||''),
        rel:u
      }));
      const matchFields=list(t.matchFields).map(f=>({name:text(f.name),hits:Number(first(f.hits,1))||1,matchLevel:text(first(f.confidence,'High')),role:'Match field'})).filter(f=>f.name);
      const plugFields=list(t.plugFields).map(f=>({name:text(f.name),hits:Number(first(f.hits,1))||1,matchLevel:text(first(f.confidence,'High')),role:'Plug field'})).filter(f=>f.name);
      const options=list(t.options);
      row.defined=row.defined||first(t.canonical,false)===true;
      row.inferred=row.inferred||first(t.canonical,false)!==true;
      row.hits=Math.max(row.hits,usage.length,Number(first(t.referenceCount,t.ruleCount,0))||0);
      row.scopeCount=Math.max(row.scopeCount,new Set(usage.map(u=>u.scopeId).filter(Boolean)).size,Number(first(t.scopeCount,0))||0);
      row.ruleCount=Math.max(row.ruleCount,usage.length,Number(first(t.ruleCount,0))||0);
      row.resourceType=text(first(t.resourceType,row.resourceType,'SelectionList'));
      row.source=text(first(t.source,row.source,'FwdResource'));
      row.confidence=text(first(t.confidence,row.confidence,'High'));
      row.options=[...row.options,...options];
      row.resourceEvidence=first(row.resourceEvidence,t.resourceEvidence,null);
      row.hasParsedSchema=row.hasParsedSchema||first(t.schemaParsed,false)===true;
      row.optionsParsed=row.optionsParsed||first(t.optionsParsed,false)===true;
      row.messages=[...new Set([...row.messages,...list(first(t.diagnostics,[])).map(text).filter(Boolean)])];
      row.usage=usage.length?usage:row.usage;
      row.raw.selectionList=t;
      mergeColumns(row,'matchFields',matchFields);
      mergeColumns(row,'plugFields',plugFields);
      mergeColumns(row,'parsedColumns',[...matchFields,...plugFields]);
      mergeColumns(row,'columns',[...matchFields,...plugFields,...row.usageDerivedFields]);
    });
    return [...merged.values()].filter(t=>t.name).sort((a,b)=>(Number(b.defined)-Number(a.defined))||(b.hits-a.hits)||a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
  }

  const rels=list(model.rels);
  const byRule=new Map();
  rels.forEach(r=>{
    const key=[text(first(r.ScopePath,r.scopeId)),text(first(r.RuleGuid,'')),text(first(r.RuleIndex,'')),text(first(r.RuleName,'')),text(first(r.FunctionName,''))].join('|');
    if(!byRule.has(key))byRule.set(key,[]);
    byRule.get(key).push(r);
  });

  const tables=new Map();
  function getTable(name){
    const tableName=text(name||'').trim();
    if(!tableName) return null;
    const key=tableName.toLowerCase();
    if(!tables.has(key))tables.set(key,{name:tableName,hits:0,scopes:new Set(),rules:new Set(),columns:new Map(),defined:false});
    return tables.get(key);
  }

  function addColumn(row,column,matchLevel){
    const col=text(column||'').trim();
    if(!col) return;
    const key=col.toLowerCase();
    if(!row.columns.has(key))row.columns.set(key,{name:col,hits:0,matchLevel});
    const current=row.columns.get(key);
    current.hits+=1;
    if(matchLevel==='high')current.matchLevel='high';
  }

  rels.forEach(r=>{
    if(!/table|indexed|lookup|db|database/i.test(`${r.targetType} ${r.kind} ${r.target}`)) return;
    const table=getTable(r.target||r.ParameterName||'');
    if(!table) return;
    const scopeId=text(first(r.ScopePath,r.scopeId,'Unscoped'));
    const ruleKey=[scopeId,text(first(r.RuleGuid,'')),text(first(r.RuleIndex,'')),text(first(r.RuleName,'')),text(first(r.FunctionName,''))].join('|');
    table.hits+=1;
    table.scopes.add(scopeId);
    table.rules.add(ruleKey);

    const peers=list(byRule.get(ruleKey));
    peers.forEach(peer=>{
      if(peer===r) return;
      const targetType=lower(peer.targetType);
      const parameterRole=lower(peer.ParameterRole);
      const candidate=text(peer.target||peer.ParameterName||'').trim();
      if(!candidate) return;
      if(candidate.toLowerCase()===table.name.toLowerCase()) return;
      if(/field|attribute/.test(targetType)||/field|column|attribute/.test(parameterRole)) addColumn(table,candidate,'high');
      else if(peer.ParameterName&&/field|column|attr/i.test(peer.ParameterName)) addColumn(table,candidate,'medium');
    });
  });

  const definedBuckets=list(model.fwd?.resources?.buckets).filter(b=>/table|db|database|lookup/i.test(text(b.type)));
  definedBuckets.forEach(bucket=>{
    list(bucket.names).forEach(name=>{
      const table=getTable(name);
      if(table)table.defined=true;
    });
  });

  return [...tables.values()]
    .map(t=>({
      name:t.name,
      hits:t.hits,
      scopeCount:t.scopes.size,
      ruleCount:t.rules.size,
      defined:t.defined,
      inferred:true,
      parsedColumns:[],
      usageDerivedFields:[...t.columns.values()].sort((a,b)=>(b.hits-a.hits)||a.name.localeCompare(b.name)).slice(0,24),
      columns:[...t.columns.values()].sort((a,b)=>(b.hits-a.hits)||a.name.localeCompare(b.name)).slice(0,24),
      hasParsedSchema:false,
      messages:['TableSchemaNotParsed'],
      usage:usageRowsForDefinition(r=>text(r.target).toLowerCase()===t.name.toLowerCase())
    }))
    .sort((a,b)=>(b.hits-a.hits)||a.name.localeCompare(b.name));
}


function tableConfigurationHtml(t,row){
  const parsedCols=list(t.parsedColumns);
  const usageCols=list(t.usageDerivedFields);
  const options=list(t.options);
  const loadInfo=t['resource'+'Evidence']||{};
  const facts=[
    ['Resource type',esc(row.type||t.resourceType||'Table')],
    ['Schema',t.hasParsedSchema?'Parsed from SelectionList configuration details':(t.defined?'Definition present; schema not parsed':'Reference only; schema not exported')],
    ['Options',t.optionsParsed?`${fmt(options.length)} parsed`:'Not parsed'],
    ['Configured match fields',fmt(list(t.matchFields).length||parsedCols.length)],
    ['Configured plug fields',fmt(list(t.plugFields).length)],
    ...(isAdvancedMode()?[[ 'Advanced resource details',loadInfo.hasPrivateTree?'Available':'Unavailable' ]]:[]),
    ['Referenced fields',fmt(usageCols.length)],
    ['Rule references',fmt(list(row.usage).length||t.ruleCount||t.hits||0)],
    ['Scope count',fmt(t.scopeCount||0)]
  ];
  return `<section class="table-config-card"><div class="udf-section-head"><div><h4>Configuration</h4><p>${t.defined?'SelectionList/table definition details first; rule usage is secondary.':'Reference-only table: rule usage and field names were observed, but a full schema was not exported.'}</p></div><span class="badge ${t.hasParsedSchema?'green':t.defined?'blue':'amber'}">${t.hasParsedSchema?'schema parsed':t.defined?'definition':'reference-only'}</span></div><div class="kv">${facts.map(([k,v])=>kv(k,v)).join('')}</div>${options.length?`<div class="table-columns-head">Options</div><div class="udf-token-strip">${options.slice(0,40).map(o=>`<span class="udf-token amber" title="${esc(text(o.value||''))}">${esc(text(o.role||o.name||'Option'))}</span>`).join('')}</div>`:''}</section>`;
}
function tableColumnsHtml(t){
  const matchFields=list(t.matchFields);
  const plugFields=list(t.plugFields);
  if(matchFields.length||plugFields.length){
    const group=(label,rows)=>rows.length?`<div class="table-columns-head">${esc(label)}</div><div class="table-columns-grid">${rows.map(c=>`<div class="table-column-row"><div class="table-col-name">${esc(c.name)}</div><div class="table-col-meta"><span class="badge blue">${esc(c.role||label)}</span><span class="mono">${esc(c.matchLevel||c.confidence||'parsed')}</span></div></div>`).join('')}</div>`:'';
    return `${group('Match fields',matchFields)}${group('Plug fields',plugFields)}`;
  }
  const parsedCols=list(t.parsedColumns);
  if(parsedCols.length){
    return `<div class="table-columns-grid">${parsedCols.map(c=>`<div class="table-column-row"><div class="table-col-name">${esc(first(c.name,c.Name,c.column,c.Column,''))}</div><div class="table-col-meta"><span class="mono">${esc(first(c.type,c.Type,c.kind,c.Kind,'column'))}</span></div></div>`).join('')}</div>`;
  }
  const usageCols=list(t.usageDerivedFields);
  return usageCols.length?`<div class="table-columns-grid">${usageCols.map(c=>`<div class="table-column-row"><div class="table-col-name">${esc(c.name)}</div><div class="table-col-meta"><span class="badge blue">${fmt(c.hits)} refs</span><span class="mono">referenced by rules</span></div></div>`).join('')}</div>`:'<div class="global-empty-state">No table columns or field references were extracted.</div>';
}
function buildUdfDefinitions(){
  if(globalUdfDefinitionsCache)return globalUdfDefinitionsCache;
  function fnEq(left,right){return text(left).trim().toLowerCase()===text(right).trim().toLowerCase();}
  function configuredRulesFor(fnName){
    const sourceRows=list(model.ruleUsageByFunctionName?.get(lower(fnName)));
    const collected=[];
    const seen=new Set();
    sourceRows.forEach(row=>{
      const key=[text(row.scopeId),text(row.ruleName),text(row.functionName),text(row.nodeId)].join('|').toLowerCase();
      if(seen.has(key))return;
      seen.add(key);
      collected.push({scopeId:text(row.scopeId),ruleName:text(row.ruleName||'Unnamed rule'),functionName:text(row.functionName||fnName),parameters:row.parameters||{},nodeId:text(row.nodeId)});
    });
    return collected;
  }
  function parameterNamesFromRules(rules){
    const names=new Set();
    rules.forEach(r=>Object.keys(r.parameters||{}).forEach(k=>{if(text(k).trim())names.add(text(k).trim());}));
    return [...names].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
  }
  function mergeUdfParameterNames(definedNames,callerNames){
    const realDefined=realUdfParameterNames(definedNames);
    const nonGenericCallers=list(callerNames).map(text).filter(Boolean).filter(x=>!isGenericParamSlotName(x));
    const source=realDefined.length?[...realDefined,...nonGenericCallers]:[...list(definedNames).map(text).filter(Boolean),...nonGenericCallers];
    return [...new Set(source)].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
  }
  const fwdUdfs=list(model.fwd?.udfs?.items);
  const canonicalUdfs=list(model.fwd?.canonicalUdfs?.items).filter(u=>/CandidateUdf/i.test(text(u.classification))||/CanonicalFwdResource/i.test(text(u.source)));
  const editorUdfs=list(model.fwd?.editorModel?.udfDefinitions).filter(u=>/CandidateUdf/i.test(text(u.classification))||/CanonicalFwdResource/i.test(text(u.source)));
  // Prefer the focused /fwd/udfs endpoint. It contains confirmed canonical CandidateUdf rows and avoids
  // promoting iterator parameters / rule-usage-only records into the main UDF browser.
  const definedItems=fwdUdfs.length?fwdUdfs:(canonicalUdfs.length?canonicalUdfs:editorUdfs);
  if(definedItems.length){
    const result=definedItems.map(u=>{
      const type=text(u.resourceType);
      const rawName=text(u.name);
      const displayName=/^function$/i.test(type)?rawName:`${type}: ${rawName}`;
      const matchedRules=configuredRulesFor(rawName||displayName);
      const canonicalCallers=list(first(u.callerBindings,[])).map(c=>({
        scopeId:text(c.scopeId),
        ruleName:text(c.ruleName||'UDF caller'),
        functionName:text(c.functionName||rawName),
        parameters:first(c.parameters,{}),
        nodeId:text(first(c.ruleNodeId,c.nodeId,''))
      }));
      const callerRules=canonicalCallers.length?canonicalCallers:matchedRules;
      const derivedParamNames=parameterNamesFromRules(matchedRules);
      const definedParamNames=list(first(u.fieldListParameters,u.parameterNames,u.parameters,[])).map(text).filter(Boolean);
      const parameterNames=mergeUdfParameterNames(definedParamNames,derivedParamNames);
      const definedRules=list(first(u.ruleNames,u.usedByRules,u.rules,[])).map(text).filter(Boolean);
      const configuredRules=callerRules.map(r=>`${r.ruleName} · ${r.scopeId}`);
      const rules=[...new Set([...definedRules,...configuredRules])].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
      return {
        key:rawName||displayName,
        displayName,
        rawName,
        type:type||'Function',
        count:Number(first(u.usedByRuleCount,u.count,callerRules.length,0))||0,
        scopeCount:Number(first(u.scopeCount,0))||0,
        defined:!!first(u.defined,true),
        inferred:!!u.inferred,
        definitionParsed:first(u.definitionParsed,u.parsed,u.hasParsedDefinition,false)===true,
        bodyParsed:first(u.bodyParsed,u.hasParsedBody,false)===true,
        availabilityState:text(first(u.availabilityState,u.internalRuleTree?.parseState,''))||((first(u.bodyParsed,u.hasParsedBody,false)===true)?'RuleListAvailable':'RuleListUnavailable'),
        availabilityMessage:text(first(u.availabilityMessage,u.internalRuleTree?.availabilityMessage,'')),
        messages:list(first(u.diagnostics,u.messages,u.warnings,[])),
        classification:text(first(u.classification,'')),
        matchLevel:text(first(u.matchLevel,'')),
        source:text(first(u.source,u.definitionSource,'')),
        scopes:list(first(u.scopeIds,u.scopes,u.usedByScopes,[])).map(text).filter(Boolean),
        rules,
        callerRules,
        parameterNames,
        parameterBindings:list(first(u.fieldListParameterBindings,[])),
        statusResults:list(first(u.statusResults,u.statuses,u.results,u.definition?.statusResults,[])).map(text).filter(Boolean),
        internalRules:normalizeUdfInternalRules(u,rawName,matchedRules),
        resourceEvidence:first(u.resourceEvidence,null),
        rawResourceDetails:first(u.rawResourceDetails,u.rawDetails,u.resourceEvidence,null),
        searchBlob:lower([displayName,rawName,type,u.classification,u.source,parameterNames.join(' '),list(first(u.statusResults,u.statuses,u.results,u.definition?.statusResults,[])).map(text).join(' '),rules.join(' '),callerRules.map(r=>`${r.ruleName} ${r.scopeId} ${r.functionName} ${Object.keys(r.parameters||{}).join(' ')}`).join(' ')].join(' '))
      };
    });
    globalUdfDefinitionsCache=result;
    return result;
  }
  const result=domainRowsByView('udfs').map(r=>{
    const fnName=text(r.name);
    const matchedRules=configuredRulesFor(fnName);
    return {
    key:fnName,
    displayName:fnName,
    rawName:fnName,
    type:'UDF reference',
    count:Number(first(r.count,0))||0,
    scopeCount:0,
    defined:false,
    inferred:true,
    definitionParsed:false,
    bodyParsed:false,
    availabilityState:'RuleListUnavailable',
    availabilityMessage:'This UDF name was observed in caller rules only; no canonical UDF definition or internal Rule List was available in this snapshot.',
    messages:[],
    classification:'RegexOnly',
    matchLevel:'',
    source:'Observed rule calls',
    scopes:[],
    rules:matchedRules.map(x=>`${x.ruleName} · ${x.scopeId}`).sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'})),
    callerRules:matchedRules,
    parameterNames:mergeUdfParameterNames([],parameterNamesFromRules(matchedRules)),
    parameterBindings:[],
    statusResults:[],
    internalRules:normalizeUdfInternalRules(r,fnName,matchedRules),
    resourceEvidence:null,
    rawResourceDetails:null,
    searchBlob:lower([fnName,'UDF reference','Observed rule calls',matchedRules.map(r=>`${r.ruleName} ${r.scopeId} ${r.functionName} ${Object.keys(r.parameters||{}).join(' ')}`).join(' ')].join(' '))
  };});
  globalUdfDefinitionsCache=result;
  return result;
}

// Render UDF list/detail with underscore-prefix grouping and clickable details.
function udfFilterLabel(filter){return ({'with-callers':'Has callers',defined:'Defined',unparsed:'Needs parsing','usage-only':'Reference-only',all:'All'})[filter]||'All';}
function passesUdfFilter(row){
  if(state.udfFilter==='with-callers')return list(row.callerRules).length>0||list(row.rules).length>0;
  if(state.udfFilter==='defined')return !!row.defined;
  if(state.udfFilter==='unparsed')return row.definitionParsed===false||list(row.messages).length>0;
  if(state.udfFilter==='usage-only')return !row.defined&&list(row.rules).length>0;
  return true;
}

// Render UDFs in a guide-aligned FWEditor layout rather than the generic editor viewer shell.
function udfEditorPathText(u){
  return `FWD / Resources / Function / ${udfShortName(u)}`;
}
function udfEditorTreeNodeHtml(u,selectedKey){
  const active=u.key===selectedKey;
  const callers=udfCallerCount(u);
  const warningCount=list(u.messages).length+(u.definitionParsed?0:1);
  return `<button class="fweditor-tree-item ${active?'selected':''}" type="button" data-global-kind="udfs" data-global-key="${esc(u.key)}" aria-current="${active?'true':'false'}"><span class="fweditor-tree-glyph">ƒ</span><span class="fweditor-tree-label"><b>${esc(udfShortName(u))}</b><small>${esc(u.type||'Function')}${callers?` · ${fmt(callers)} caller${callers===1?'':'s'}`:''}</small></span>${warningCount?`<span class="fweditor-tree-warn" title="Definition or parse messages">!</span>`:''}</button>`;
}
function udfEditorTreeHtml(rows,selectedKey){
  const groups=new Map();
  list(rows).forEach(u=>{
    const key=udfPrefix(u);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(u);
  });
  const ordered=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'}));
  return `<div class="fweditor-fwd-tree-body" role="tree" aria-label="FormWorks Editor Viewer navigation UDF resources"><details open class="fweditor-tree-folder root"><summary><span class="fweditor-folder-icon">▾</span>FWD</summary><details open class="fweditor-tree-folder"><summary><span class="fweditor-folder-icon">▾</span>Resources</summary><details open class="fweditor-tree-folder"><summary><span class="fweditor-folder-icon">▾</span>Function <b>${fmt(rows.length)}</b></summary>${ordered.map(([group,items],idx)=>`<details class="fweditor-tree-folder nested" ${items.some(x=>x.key===selectedKey)||idx<6?'open':''}><summary><span class="fweditor-folder-icon">▾</span>${esc(group)} <b>${fmt(items.length)}</b></summary><div class="fweditor-tree-children">${items.map(u=>udfEditorTreeNodeHtml(u,selectedKey)).join('')}</div></details>`).join('')}</details></details></details></div>`;
}
function udfEditorDefinitionStateHtml(u){
  const pieces=[
    u.defined?'FWD-defined':'Reference-only',
    udfStatusLabel(u),
    u.source||'FWD resource',
    u.classification||''
  ].map(text).filter(Boolean);
  return pieces.map((p,i)=>`<span class="fweditor-state-chip ${i===0?'primary':''}">${esc(p)}</span>`).join('');
}
function udfEditorGeneralHtml(u,callers){
  const rows=[
    ['Name',`<span class="mono">${esc(udfShortName(u))}</span>`],
    ['Raw resource name',u.rawName?`<span class="mono">${esc(u.rawName)}</span>`:'<span class="muted">not exported</span>'],
    ['Resource type',esc(u.type||'Function')],
    ['Definition source',esc(u.source||'FWD resource')],
    ['Definition parsed',u.definitionParsed?'Yes':'No'],
    ['Body parsed',u.bodyParsed?'Yes':'No'],
    ['Rule List state',esc(udfStatusLabel(u))],
    ['Caller rules',fmt(callers.length)],
    ['Field-list parameters',fmt(udfParamCount(u))],
    ['Status results',fmt(list(u.statusResults).length)],
    ['Internal rules',fmt(list(u.internalRules).length)]
  ];
  return `<fieldset class="fweditor-fieldset"><legend>General</legend><div class="fweditor-property-grid">${rows.map(([k,v])=>`<label>${esc(k)}</label><div>${v}</div>`).join('')}</div></fieldset>`;
}
function udfEditorParameterTableHtml(u,callers){
  const interfaceNames=effectiveUdfParameterNames(u);
  const byName=new Map();
  interfaceNames.forEach((name,index)=>{
    const key=text(name)||`Field List ${index+1}`;
    if(!byName.has(key))byName.set(key,{name:key,slot:`ParamList${index}`,callers:new Set(),values:new Map(),sources:new Set()});
  });
  list(callers).forEach(c=>callerParameterEntries(c.parameters||{},interfaceNames).forEach(entry=>{
    const key=entry.displayName||entry.rawName;
    if(!byName.has(key))byName.set(key,{name:key,slot:entry.rawName,callers:new Set(),values:new Map(),sources:new Set()});
    const row=byName.get(key);
    row.callers.add(text(c.ruleName||c.nodeId||'caller'));
    row.sources.add(entry.rawName);
    entry.values.forEach(v=>{const value=text(v);row.values.set(value,(row.values.get(value)||0)+1);});
  }));
  const rows=[...byName.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
  if(!rows.length)return `<fieldset class="fweditor-fieldset"><legend>Field List Parameters</legend><div class="fweditor-empty">No named UDF parameters or caller-observed field-list bindings were extracted.</div></fieldset>`;
  return `<fieldset class="fweditor-fieldset"><legend>Field List Parameters</legend><table class="fweditor-grid"><thead><tr><th>Parameter</th><th>FWD slot</th><th>Caller use</th><th>Observed field-list values</th></tr></thead><tbody>${rows.map(row=>{
    const values=[...row.values.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([v,c])=>`${v||'(blank)'} (${fmt(c)})`).join(', ');
    return `<tr><td><b>${esc(row.name)}</b></td><td class="mono">${esc([...row.sources].join(', ')||row.slot||'')}</td><td>${fmt(row.callers.size)}</td><td>${esc(values||'not observed')}</td></tr>`;
  }).join('')}</tbody></table></fieldset>`;
}
function udfEditorStatusResultsHtml(u){
  const rows=list(u.statusResults).map((x,i)=>({ordinal:i,token:text(x),description:''}));
  if(!rows.length)return `<fieldset class="fweditor-fieldset"><legend>Status Results</legend><div class="fweditor-empty">No advertised UDF status results were extracted.</div></fieldset>`;
  return `<fieldset class="fweditor-fieldset"><legend>Status Results</legend><table class="fweditor-grid compact"><thead><tr><th>Ordinal</th><th>Token</th><th>Action List use</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${fmt(r.ordinal)}</td><td><span class="mono">${esc(r.token)}</span></td><td>Mapped when used by caller rules</td></tr>`).join('')}</tbody></table></fieldset>`;
}
function udfEditorCallerRulesHtml(callers,u){
  const rows=list(callers);
  if(!rows.length)return `<fieldset class="fweditor-fieldset"><legend>Caller Rules</legend><div class="fweditor-empty">No caller rules are mapped for this UDF.</div></fieldset>`;
  const interfaceNames=effectiveUdfParameterNames(u);
  return `<fieldset class="fweditor-fieldset"><legend>Caller Rules</legend><table class="fweditor-grid caller-grid"><thead><tr><th>Rule</th><th>Scope</th><th>Field-list bindings</th><th></th></tr></thead><tbody>${rows.slice(0,350).map(c=>{
    const node=c.nodeId?model.nodesById.get(String(c.nodeId)):null;
    const scopeId=text(c.scopeId||node?.scopeId||'');
    const nodeId=text(c.nodeId||node?.id||'');
    const bindings=callerParameterEntries(c.parameters||{},interfaceNames).slice(0,5).map(entry=>`${entry.displayName}: ${entry.values.slice(0,2).join(', ')||'(blank)'}`).join('; ');
    const open=nodeId?`<button class="fweditor-command-button small" type="button" data-node="${esc(nodeId)}" data-node-scope="${esc(scopeId)}">Open Rule</button>`:'<span class="fweditor-state-chip">Unlinked</span>';
    return `<tr><td><b>${esc(c.ruleName||'Unnamed rule')}</b><small>${esc(c.functionName||u.rawName||'UDF call')}</small></td><td class="mono">${esc(scopeId||'unscoped')}</td><td>${esc(bindings||'No parsed parameters')}</td><td>${open}</td></tr>`;
  }).join('')}</tbody></table>${rows.length>350?`<div class="fweditor-note">Showing first 350 of ${fmt(rows.length)} caller rules.</div>`:''}</fieldset>`;
}
function udfEditorInternalRuleTreeHtml(u){
  const rules=list(u.internalRules);
  if(!rules.length)return `<fieldset class="fweditor-fieldset"><legend>Rule List</legend><div class="fweditor-empty"><b>Internal Rule List unavailable</b><br>${esc(udfAvailabilityMessage(u))}</div></fieldset>`;
  const interfaceNames=effectiveUdfParameterNames(u);
  return `<fieldset class="fweditor-fieldset"><legend>Rule List</legend><div class="fweditor-rule-list" role="tree" aria-label="UDF internal rule list">${rules.slice(0,260).map((r,i)=>{
    const node=r.nodeId?model.nodesById.get(String(r.nodeId)):null;
    const scopeId=text(r.scopeId||node?.scopeId||'');
    const nodeId=text(r.nodeId||node?.id||'');
    const paramPreview=callerParameterEntries(r.parameters||{},interfaceNames).slice(0,3).map(entry=>`${entry.displayName}: ${entry.values.slice(0,2).join(', ')||'(blank)'}`).join('; ');
    const open=nodeId?`<button class="fweditor-command-button small" type="button" data-node="${esc(nodeId)}" data-node-scope="${esc(scopeId)}">Open</button>`:'<span class="fweditor-state-chip">definition</span>';
    return `<div class="fweditor-rule-row" role="treeitem"><span class="fweditor-rule-index">${fmt(i+1)}</span><span class="fweditor-rule-main"><b>${esc(r.ruleName||`Rule ${i+1}`)}</b><small>${esc(r.functionName||'no function')}${scopeId?` · ${esc(scopeId)}`:''}${paramPreview?` · ${esc(paramPreview)}`:''}</small></span><span class="fweditor-rule-actions">${list(r.statusResults).length?`<span class="fweditor-state-chip">${fmt(list(r.statusResults).length)} status</span>`:''}${open}</span></div>`;
  }).join('')}</div>${rules.length>260?`<div class="fweditor-note">Showing first 260 internal rules.</div>`:''}</fieldset>`;
}
function udfEditorLoadStatusHtml(u){
  const loadInfo=u['resource'+'Evidence']||{};
  const diagnostics=list(u.messages).map(text).filter(Boolean);
  const rows=[
    ['Definition parsed',u.definitionParsed?'Yes':'No'],
    ['Body parsed',u.bodyParsed?'Yes':'No'],
    ['Resource config',loadInfo.hasConfig?'Available':'Unavailable'],
    ['Private tree',loadInfo.hasPrivateTree?'Available':'Unavailable'],
    ['Rule List state',udfStatusLabel(u)],
    ['Availability note',udfAvailabilityMessage(u)],
    ['Raw details',u.rawResourceDetails?'Available':'Not loaded'],
    ['Load Status Items',fmt(diagnostics.length)]
  ];
  return `<fieldset class="fweditor-fieldset"><legend>Load Status</legend><div class="fweditor-property-grid reader-status">${rows.map(([k,v])=>`<label>${esc(k)}</label><div>${esc(v)}</div>`).join('')}</div>${diagnostics.length?`<div class="fweditor-diagnostic-list">${diagnostics.slice(0,20).map(m=>`<div class="fweditor-message-row warn"><span>Warning</span><b>${esc(m)}</b></div>`).join('')}</div>`:''}</fieldset>`;
}

function udfEditorActiveTab(){
  const tab=text(state.udfEditorTab||'general');
  const allowed=['general','parameters','callers','rule-list',...(isAdvancedMode()?['load-status']:[])];
  return allowed.includes(tab)?tab:'general';
}
function udfEditorTabsHtml(){
  const active=udfEditorActiveTab();
  const tabs=[
    ['general','General'],
    ['parameters','Parameters'],
    ['callers','Callers'],
    ['rule-list','Rule List'],
    ...(isAdvancedMode()?[[ 'load-status','Load Status' ]]:[])
  ];
  return `<div class="fweditor-form-pages" role="tablist" aria-label="UDF configuration pages">${tabs.map(([key,label])=>`<button class="${key===active?'active':''}" type="button" role="tab" data-udf-tab="${esc(key)}" aria-selected="${key===active?'true':'false'}">${esc(label)}</button>`).join('')}</div>`;
}
function udfEditorActivePanelHtml(u,callers){
  const active=udfEditorActiveTab();
  if(active==='parameters')return udfEditorParameterTableHtml(u,callers);
  if(active==='callers')return udfEditorCallerRulesHtml(callers,u);
  if(active==='rule-list')return `${udfEditorStatusResultsHtml(u)}${udfEditorInternalRuleTreeHtml(u)}`;
  if(isAdvancedMode()&&active==='load-status')return udfEditorLoadStatusHtml(u);
  return `${udfEditorGeneralHtml(u,callers)}${udfEditorParameterTableHtml(u,callers)}`;
}
function udfEditorMessageWindowHtml(selected,allRows,filteredRows){
  const selectedMessages=list(selected?.messages).map(text).filter(Boolean);
  const inventoryWarnings=list(allRows).filter(r=>list(r.messages).length||!r.definitionParsed).length;
  const rows=[];
  if(selectedMessages.length){selectedMessages.slice(0,12).forEach(m=>rows.push({sev:'Warning',item:udfShortName(selected),message:m}));}
  if(!selectedMessages.length)rows.push({sev:'Info',item:udfShortName(selected),message:udfAvailabilityMessage(selected)});
  const parsedDefinitions=list(allRows).filter(r=>r.definitionParsed).length;
  const parsedBodies=list(allRows).filter(r=>r.bodyParsed||udfRuleListAvailable(r)).length;
  rows.push({sev:'Info',item:'Inventory',message:`${fmt(filteredRows.length)} UDFs shown from ${fmt(allRows.length)} UDF definitions. ${fmt(parsedDefinitions)} interfaces parsed; ${fmt(parsedBodies)} internal Rule Lists available; ${fmt(inventoryWarnings)} have pending body/interface details.`});
  return `<section class="fweditor-load-status-window ${state.editorMessageExpanded?'expanded':''}" aria-label="Advanced diagnostics"><div class="fweditor-load-status-title"><span>Load Status</span><button class="fweditor-title-button" type="button" data-action="toggle-editor-message">${state.editorMessageExpanded?'Collapse':'Expand'}</button></div><table class="fweditor-load-status-table"><thead><tr><th>Sev</th><th>Object</th><th>Message</th></tr></thead><tbody>${rows.map(r=>`<tr><td><span class="sev ${lower(r.sev)}">${esc(r.sev)}</span></td><td>${esc(r.item)}</td><td>${esc(r.message)}</td></tr>`).join('')}</tbody></table></section>`;
}
function udfEditorConfigurationWindowHtml(u,callers){
  return `<section class="fweditor-config-window" aria-label="FormWorks Editor Viewer configuration view"><div class="fweditor-window-titlebar"><span>User Defined Function - ${esc(udfShortName(u))}</span><span class="fweditor-window-buttons"><i></i><i></i><i></i></span></div><div class="fweditor-config-toolbar"><span class="fweditor-breadcrumb">${esc(udfEditorPathText(u))}</span>${udfEditorDefinitionStateHtml(u)}</div><div class="fweditor-config-body"><div class="fweditor-resource-header"><div><div class="fweditor-resource-kicker">Function Resource</div><h2>${esc(udfShortName(u))}</h2><p>User Defined Function interface, field-list parameters, status results, caller rules, internal Rule List details, and configuration messages.</p></div><button class="fweditor-command-button" type="button" data-action="open-global-detail" data-global-kind="udfs">Details</button></div>${udfEditorTabsHtml()}<div class="fweditor-active-page" role="tabpanel">${udfEditorActivePanelHtml(u,callers)}</div></div></section>`;
}

function renderDomainCatalog(title,rows,caption){
  const isUdfView=state.workspaceView==='udfs';
  const sortedRows=list(rows).slice().sort((a,b)=>text(a.name).localeCompare(text(b.name),undefined,{sensitivity:'base'}));
  // Group UDF rows by the token before the first underscore for faster visual scanning.
  const udfGroupedHtml=isUdfView&&sortedRows.length?(()=>{
    const groups=new Map();
    sortedRows.forEach(r=>{
      const display=text(r.name);
      const rhs=display.includes(': ')?display.split(': ').slice(1).join(': '):display;
      const idx=rhs.indexOf('_');
      const groupKey=idx>0?`${rhs.slice(0,idx)}_`:'Other';
      if(!groups.has(groupKey))groups.set(groupKey,[]);
      groups.get(groupKey).push(r);
    });
    const ordered=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'}));
    return `<div class="table-list">${ordered.map(([groupKey,items])=>`<div class="scope-group"><span>${esc(groupKey)}</span><span class="section-count">${fmt(items.length)}</span></div>${items.map(r=>`<div class="data-row compact"><div><div class="data-title">${esc(r.name)}</div></div></div>`).join('')}`).join('')}</div>`;
  })():'';
  const defaultRowsHtml=`<div class="table-list">${sortedRows.slice(0,5000).map(r=>`<div class="data-row compact"><div><div class="data-title">${esc(r.name)}</div></div></div>`).join('')}</div>`;
  $('content').innerHTML=`<div class="notice"><div class="notice-icon">i</div><div><b>${esc(title)} view.</b> ${esc(caption)} Cross-check with structural nodes before treating entries as runtime behavior.</div></div><div class="panel"><h3>${esc(title)}</h3>${sortedRows.length?(isUdfView?udfGroupedHtml:defaultRowsHtml):emptyHtml(`No ${title.toLowerCase()} found`,`No matching ${title.toLowerCase()} entries in the current scope.`)}</div>`;
}
function emptyHtml(title,body){return `<div class="empty"><div class="empty-card"><h2>${esc(title)}</h2><p>${esc(body)}</p></div></div>`;}
function cssEscape(value){
  const s=text(value);
  if(window.CSS&&typeof window.CSS.escape==='function')return window.CSS.escape(s);
  return s.replace(/[^a-zA-Z0-9_-]/g,ch=>`\\${ch}`);
}
function kv(k,v){return `<div class="k">${esc(k)}</div><div class="v">${v}</div>`;}

function selectedPathIds(){
  const ids=new Set();
  try{
    const selectedRule=typeof selectedNode==='function'?selectedNode():null;
    const selectedList=typeof selectedActionList==='function'?selectedActionList():null;
    const anchor=selectedRule||(selectedList&&selectedList.parent?selectedList.parent:null);
    if(anchor&&typeof pathObjects==='function'){
      pathObjects(anchor).forEach(p=>{
        if(p&&p.nodeId!==undefined&&p.nodeId!==null)ids.add(String(p.nodeId));
      });
    }
    if(selectedList&&Array.isArray(selectedList.childNodes)){
      selectedList.childNodes.forEach(n=>{
        if(n&&n.id!==undefined&&n.id!==null)ids.add(String(n.id));
      });
    }
  }catch(_err){
    // Defensive: path highlighting must never block tree rendering.
  }
  return ids;
}
function isHotspotNode(n){
  try{
    if(!n)return false;
    const id=String(n.id||'');
    const directChildren=typeof childIds==='function'?childIds(id).length:0;
    const actionGroups=typeof childActionListGroups==='function'?childActionListGroups(id):[];
    const actionChildren=actionGroups.reduce((sum,g)=>sum+(Array.isArray(g.childIds)?g.childIds.length:0),0);
    const disabled=text(n.disabled||'none')!=='none';
    const hasMessages=typeof hasDiag==='function'?hasDiag(n):false;
    return disabled||hasMessages||directChildren>=10||actionGroups.length>=5||actionChildren>=10;
  }catch(_err){
    // Defensive: hotspot styling is cosmetic and must not block rendering.
    return false;
  }
}

function treeRow(n,level){
  const id=String(n.id);
  const selected=state.selectedType==='node'&&state.selectedId===id;
  const hasKids=childIds(id).length>0||childActionListGroups(id).length>0;
  const expanded=state.expanded.has(id)||id===state.focusNodeId;
  const pathIds=selectedPathIds();
  const inPath=pathIds.has(id);
  const hot=isHotspotNode(n);
  const levelNo=Math.max(1,Math.min(4,Number(state.disclosureLevel||2)));
  const incoming=model.incomingByChild.get(id);
  const messages=hasDiag(n);
  const disabledBadge=n.disabled!=='none'?`<span class="badge amber state-badge">${n.disabled==='direct'?'disabled':n.disabled==='inherited'?'parent-disabled':'sequence-only'}</span>`:'';
  const fnMeta=levelNo>=2?`<span class="tree-meta">${esc(n.fn||'No function mapped')}</span>`:'';
  const stateMeta=levelNo>=3?`${disabledBadge}${messages?'<span class="badge amber">message</span>':''}${hasKids?`<span class="badge blue">${fmt(childIds(id).length)} child</span>`:''}`:'';
  const actionListMeta=levelNo>=4?`<span class="tree-action-list-mini">${incoming?actionListChip(incoming):'<span class="action-list-chip root">root rule list</span>'}</span>`:'';
  return `<div class="tree-row ${treeDepthClass(level)} ${selected?'selected':''} ${inPath?'active-path':''} ${hot?'hotspot':''}" role="treeitem" aria-level="${level+1}" aria-expanded="${hasKids?(expanded?'true':'false'):'false'}" aria-selected="${selected?'true':'false'}" tabindex="0" data-node="${esc(id)}"><span class="tree-left">${hasKids?`<span class="twisty" data-toggle-node="${esc(id)}" aria-hidden="true" title="${expanded?'Collapse':'Expand'}">${expanded?'−':'+'}</span>`:'<span class="twisty ghost" aria-hidden="true">·</span>'}<span class="tree-main"><b class="tree-name">${esc(n.title)}</b>${fnMeta}<span class="tree-row-badges">${stateMeta}${actionListMeta}</span></span></span>${hasKids?`<span class="mini-row-btn" data-toggle-node="${esc(id)}" aria-hidden="true" title="${expanded?'Collapse':'Expand'}">${expanded?'−':'+'}</span>`:''}</div>`;
}
function renderNoData(){
  const detail=bootState.detail||'No FWD snapshot files could be loaded.';
  if(typeof recordViewerDiagnostic==='function')recordViewerDiagnostic('error','render-no-data',{detail,payloadCounts:typeof payloadCounts==='function'?payloadCounts():null,modelCounts:typeof modelCounts==='function'?modelCounts():null});
  document.body.classList.add('no-scope-selector');
  $('sourceSubtitle').textContent='No snapshot data available';
  $('statusPill').innerHTML='<span class="dot warn"></span><span>FWD load failed</span>';
  const banner=optionalElement('globalErrorBanner');
  if(banner){
    banner.textContent=`FWD load failed: ${detail}`;
    banner.hidden=false;
  }
  $('globalNav').innerHTML='';
  const scopeHost=optionalElement('scopeList');
  if(scopeHost){
    scopeHost.hidden=true;
    scopeHost.setAttribute('aria-hidden','true');
    scopeHost.innerHTML='';
  }
  $('content').innerHTML=emptyHtml('No FWD structure found',detail);
  optionalElement('diagnosticsDock')?.replaceChildren();
}
// Curated in-product guide content for first-use navigation.
function renderHelp(){
  const quickStart=`<div class="panel"><h3>Quick Start</h3><ol class="config-list"><li>Choose a document, page, processing scope, UDF, table, SelectionList, function, or resource from the left rail.</li><li>Open <b>Structure</b> to inspect Rule Lists, Parent Rules, Status Results, and Action Lists.</li><li>Select a rule and read the inspector from Summary through Raw.</li><li>Use <b>Functions</b>, <b>UDFs</b>, and <b>Tables</b> for function behavior, reusable rule-list functions, and lookup configuration.</li></ol></div>`;
  const productModel=`<div class="panel"><h3>Product Boundary</h3><div class="kv">${kv('Read-only','FormWorks Editor Viewer inspects FWD configuration. It does not edit, save, or write back to the FWD.')}${kv('FormWorks Editor','FormWorks Editor remains the authoring and save surface for the FWD.')}${kv('Runtime boundary','The viewer does not execute AC, run AC Rules Tester, or prove actual claim outcomes.')}</div></div>`;
  const ruleModel=`<div class="panel"><h3>FW Editor Rule Model</h3><div class="mini-list"><div class="mini-row"><span><b>Rule List</b></span><span class="caption">Ordered rules in a page, document, UDF, Store, or process scope</span></div><div class="mini-row"><span><b>Rule</b></span><span class="caption">Function plus fields/parameters, attributes, sources, messages, and actions</span></div><div class="mini-row"><span><b>Status Result</b></span><span class="caption">Function return token owned by the parent rule</span></div><div class="mini-row"><span><b>Action List / Sub-list</b></span><span class="caption">Nested Rule List selected by a parent status result</span></div></div></div>`;
  const inspectorModel=`<div class="panel"><h3>Inspector Reading Order</h3><ol class="config-list"><li>Rule name and scope</li><li>Function and function type</li><li>Fields / Parameters</li><li>Attributes</li><li>Status Results / Actions</li><li>Parent Rule / Sub-list path</li><li>References</li><li>Load Status</li><li>Raw, only when formatted views need confirmation</li></ol></div>`;
  const fwdModel=`<div class="panel"><h3>Load Status</h3><div class="kv">${kv('Loaded','Configuration section loaded normally.')}${kv('Partial','Useful configuration loaded, but some placement or detail could not be fully confirmed.')}${kv('Additional Rules','Searchable/readable rules whose exact Rule List placement is not confirmed.')}${kv('Raw','Final confirmation when formatted views are incomplete or inconsistent.')}</div></div>`;
  const docsModel=`<div class="panel"><h3>Project Docs</h3><div class="kv">${kv('Docs index','docs/README.md')}${kv('Operator guide','docs/operator-guide.md')}${kv('Admin guide','docs/admin-guide.md')}${kv('Developer guide','docs/developer-guide.md')}${kv('FormWorks model','docs/formworks-editor-ac-reference-guide.md')}${kv('FAQ','docs/fw-editor-viewer-faq.md')}</div></div>`;
  const operators=`<div class="panel"><h3>Search Operators</h3><div class="mini-list"><div class="mini-row"><span><b>action:"Run Rules"</b></span><span class="caption">Match action-list labels</span></div><div class="mini-row"><span><b>function:_IGetDocAttr</b></span><span class="caption">Match mapped function</span></div><div class="mini-row"><span><b>has:disabled</b></span><span class="caption">Rules with disable usage</span></div><div class="mini-row"><span><b>children&gt;20</b></span><span class="caption">Large structural nodes</span></div><div class="mini-row"><span><b>scope:DentalADA</b></span><span class="caption">Scope-limited matches</span></div></div></div>`;
  const shortcuts=`<div class="panel"><h3>Keyboard Shortcuts</h3><div class="kv">${kv('/ or Ctrl/⌘ + K','Focus command search')}${kv('Alt + I','Toggle inspector')}${kv('Alt + C','Copy selected config')}${kv('Alt + S','Focus selected subtree')}${kv('Alt + R','Reset pane widths')}${kv('Alt + A','Expand all visible rules')}${kv('Alt + D','Expand selected rule one level')}${kv('Alt + P','Collapse selected rule peers')}${kv('Alt + F','Clear focus/subtree mode')}</div><div class="caption mt-8">Tip: Use arrow keys and Enter to review dense trees without leaving the keyboard.</div></div>`;
  $('helpBody').innerHTML=`${quickStart}${productModel}${ruleModel}${inspectorModel}${fwdModel}${docsModel}${operators}${shortcuts}`;
}
