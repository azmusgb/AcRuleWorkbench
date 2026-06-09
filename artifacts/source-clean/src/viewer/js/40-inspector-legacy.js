
function renderScopeInspector(s){
  const hotspots=scopedRuleNodes().filter(isHotspotNode).length;
  renderInspectorTabBar(['summary','raw'],{summary:fmt(s?.structural||0),raw:'JSON'});
  if(state.inspectorView==='raw'){
    $('inspectorBody').innerHTML=`<pre class="raw">${esc(JSON.stringify(s||{},null,2))}</pre>`;
    return;
  }
  $('inspectorBody').innerHTML=`<details class="inspector-section" open><summary>Scope summary <span class="section-count">${fmt(s.structural)} rules</span></summary><div class="inspector-section-body"><div class="kv">${kv('Scope ID',esc(s.scopeId))}${kv('Kind',esc(s.kind))}${kv('Structural rules',fmt(s.structural))}${kv('Large Action List rules',fmt(hotspots))}${kv('Load Status',s.diags?`<span class="badge amber">${fmt(s.diags)}</span>`:'<span class="badge green">None</span>')}</div><div class="caption mt-10">Select a rule in the structure view to inspect its read-only configuration.</div></div></details>`;
}

function configStatusStripHtml(n){const incoming=model.incomingByChild.get(n.id);const refs=model.rels.filter(r=>String(r.nodeId)===String(n.id));const diags=model.diags.filter(d=>String(d.nodeId)===String(n.id));const inv=model.inventory.find(r=>String(r.nodeId)===String(n.id));const actionOk=!incoming||incoming.resolved;const disabledLabel=n.disabled==='none'?'Not disabled':n.disabled==='direct'?'Direct disabled':n.disabled==='possible'?'Sequence-only hint':'Inherited disabled';return `<div class="trust-strip" aria-label="Selected rule configuration summary"><div class="trust-item info"><b>Object</b><span>FW resource node</span></div><div class="trust-item ${actionOk?'good':'warn'}"><b>Action list</b><span>${actionOk?'Named':'Index only'}</span></div><div class="trust-item good"><b>Disabled state</b><span>${esc(disabledLabel)}</span></div><div class="trust-item ${inv?'good':'warn'}"><b>Rule inventory</b><span>${inv?'Linked':'Not linked'}</span></div><div class="trust-item ${refs.length?'info':'warn'}"><b>References</b><span>${fmt(refs.length)}</span></div><div class="trust-item ${diags.length?'warn':'good'}"><b>Load Status</b><span>${diags.length?fmt(diags.length):'None linked'}</span></div></div>`;}
function rulePlainLanguageNarrative(n){
  const incoming=model.incomingByChild.get(n.id);
  const actionLists=childActionListGroups(n.id);
  const fieldResolution=resolveNodeFieldReferences(n);
  const fields=fieldResolution.items.map(i=>i.referencedField).filter(Boolean).slice(0,12);
  const disabled=n.disabled==='none'?'enabled':n.disabled==='direct'?'directly disabled':n.disabled==='inherited'?'disabled by a parent Action List':'marked with sequence-only disabled suspicion';
  return [`Rule: ${n.title}`,`Function: ${n.fn||'No mapped function'}`,`Scope: ${n.scopeId}`,`State: ${disabled}`,incoming?`Runs under parent status result/action list: ${incoming.label}${incoming.resolved?'':' (label unnamed/index-only)'}`:'Root rule-list entry',fields.length?`Field-like inputs: ${fields.join(', ')}`:'No field-like inputs detected',actionLists.length?`Status results / action lists: ${actionLists.map(b=>`${b.label} (${b.childIds.length} child rules)`).join('; ')}`:'No child action lists detected','Note: this is static FWD structure, not a runtime execution trace.'].join('\n');
}
function pathNarrativeHtml(n){
  const lines=rulePlainLanguageNarrative(n).split('\n');
  return `<div class="path-narrative"><h3>Parent Rule / Sub-list Path</h3><ul>${lines.map(line=>`<li>${esc(line)}</li>`).join('')}</ul><div class="action-list-actions"><button class="btn" type="button" data-action="copy-rule-explanation">Copy summary</button><button class="btn" type="button" data-action="copy-action-list-path">Copy Action List path</button></div></div>`;
}
function selectedPathPacket(n){const incoming=model.incomingByChild.get(n.id);return {schema:'FwEditorViewer.SelectedRulePath',schemaVersion:'1.0.0',copiedAt:new Date().toISOString(),scopeId:n.scopeId,identity:{nodeId:n.id,ruleName:n.title,functionName:n.fn,ruleGuid:n.RuleGuid||null},incomingAction:incoming?{label:incoming.label,actionListState:incoming.routeState||null,actionName:first(incoming.ActionName,incoming.actionName,null),actionListIndex:first(incoming.ActionListIndex,incoming.actionListIndex,null),resolved:!!incoming.resolved,}:null,path:pathObjects(n),outgoingActions:(model.edgesByParent.get(n.id)||[]).map(e=>({label:e.label,actionListState:e.routeState||null,actionName:first(e.ActionName,e.actionName,null),actionListIndex:first(e.ActionListIndex,e.actionListIndex,null),resolved:!!e.resolved,toNodeId:e.to,childName:model.nodesById.get(String(e.to))?.title||null})),caveat:'Parent-rule path comes from the parsed FWD hierarchy. It is read-only configuration, not a runtime execution trace.'};}

function canonicalRuleConfigurationForNode(n){
  const ruleLists=list(model.fwd?.editorModel?.ruleLists);
  const ruleList=ruleLists.find(r=>sameName(r.ruleListId,n.scopeId)||sameName(r.scopeId,n.scopeId));
  if(!ruleList)return null;
  const configs=list(ruleList.ruleConfigurations);
  return configs.find(c=>sameName(c.nodeId,n.id))
    || configs.find(c=>text(c.ruleGuid)&&text(n.RuleGuid)&&sameName(c.ruleGuid,n.RuleGuid))
    || configs.find(c=>text(c.name)&&sameName(c.name,n.title))
    || null;
}
function canonicalRuleConfigurationHtml(n){
  const config=canonicalRuleConfigurationForNode(n);
  if(!config)return '';
  const schema=config.functionSchema||{};
  const rejects=list(config.rejects);
  const sources=list(config.sourceHandles);
  const diagnostics=list(config.diagnostics).map(text).filter(Boolean);
  const actions=list(config.actionLists);
  return `<section class="udf-section-card"><div class="udf-section-head"><div><h4>RuleConfiguration Packet</h4><p>Snapshot-wide FormWorks editor model for this Rule: function schema, status results, rejects, source handles, and ambiguity diagnostics.</p></div><span class="badge ${diagnostics.length?'amber':'green'}">${diagnostics.length?'diagnostics':'canonical'}</span></div><div class="kv">${kv('Function schema',schema.defined?'Catalog-defined':'Observed')}${kv('Configured statuses',fmt(list(schema.configuredStatusResults).length))}${kv('Action Lists',fmt(actions.length))}${kv('Source handles',fmt(sources.length))}${kv('Reject mappings',fmt(rejects.length))}</div>${list(schema.behaviorFlags).length?`<div class="table-columns-head">Behavior flags</div>${functionTokenStripHtml(schema.behaviorFlags,'blue')}`:''}${rejects.length?`<div class="table-columns-head">Reject message/code</div><div class="mini-list">${rejects.map(r=>`<div class="mini-row"><span><b>${esc(text(r.parameterName||r.kind||'Reject'))}</b> ${esc(text(r.message||r.code||r.target||''))}</span><span class="badge blue">${esc(text(r.confidence||''))}</span></div>`).join('')}</div>`:''}${sources.length?`<div class="table-columns-head">Source handles</div><div class="mini-list">${sources.slice(0,8).map(s=>`<div class="mini-row"><span><b>${esc(text(s.source||''))}</b> ${esc(text(s.authority||''))}</span><span class="mono">${esc(text(s.path||''))}</span></div>`).join('')}</div>`:''}${diagnostics.length?`<div class="table-columns-head">Status Items</div>${functionTokenStripHtml(diagnostics,'amber')}`:''}</section>`;
}

function selectedRuleConfigPacket(n){
  const incoming=model.incomingByChild.get(n.id);
  const refs=model.rels.filter(r=>String(r.nodeId)===String(n.id));
  const diags=model.diags.filter(d=>String(d.nodeId)===String(n.id));
  const inv=model.inventory.find(r=>String(r.nodeId)===String(n.id));
  const fieldResolution=resolveNodeFieldReferences(n);
  const editorRuleConfiguration=canonicalRuleConfigurationForNode(n);
  return {
    schema:'AcEditor Viewer.SelectedRuleConfiguration',
    schemaVersion:'1.1.0',
    copiedAt:new Date().toISOString(),
    source:first(treeData.FwdPath,rulesData.FwdPath,'Embedded snapshot'),
    scopeId:n.scopeId,
    identity:{nodeId:n.id,ruleName:n.title,functionName:n.fn,ruleGuid:n.RuleGuid||null,ruleId:n.RuleId||null,functionVersion:first(n.FunctionVersion,n.functionVersion,null)},
    parentRuleAndActionList:{incomingAction:incoming?{label:incoming.label,actionName:first(incoming.ActionName,incoming.actionName,null),actionListIndex:first(incoming.ActionListIndex,incoming.actionListIndex,null),resolved:!!incoming.resolved}:null,path:pathObjects(n),children:childIds(n.id).length},
    disabled:{state:n.disabled,authority:'Structural',reason:n.DisabledReason||null},
    functionMetadata:{category:classifyFunction(n.fn),udfInterface:!!udfForFunctionName(n.fn)},
    fieldsAndParameters:displayParameterEntriesForCopy(n),
    attributes:Object.fromEntries(attributeEntriesForRule(n)),
    statusResultsAndActions:actionListRowsForRule(n).map(row=>({index:row.index,statusResult:row.status,actionList:row.actionLabel,mappedToSubList:row.mapped,childNodeIds:row.childIds,childRuleNames:row.childNames})),
    fieldCatalogMatch:fieldResolution,
    references:refs.map(r=>({kind:r.kind,targetType:r.targetType,target:r.target})),
    messages:diags.map(d=>({severity:d.severity,title:d.title,detail:d.detail})),
    reconciliation:{flatInventoryMatch:!!inv,flatInventoryId:inv?.id||null,classification:inv?.classification||null},
    editorRuleConfiguration,
    rawNode:n
  };
}
function displayParameterEntriesForCopy(n){
  return callerParameterEntries(n.Parameters||{},ruleParameterInterfaceNames(n)).map(entry=>({name:entry.displayName,rawName:entry.rawName,values:entry.values}));
}
