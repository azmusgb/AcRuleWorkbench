
function renderContent(){
  if(state.workspaceView==='overview')state.workspaceView='structure';
  if(state.workspaceView==='editor-object')return renderEditorObject();
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

function fwdPacketItems(name){
  const packet=model?.fwd?.[name];
  if(Array.isArray(packet))return packet;
  return list(first(packet?.items,packet?.Items,[]));
}
function fwdStableKey(type,name){
  return `${type}:${text(name).trim()}`;
}
function fwdScopeFor(kind,name){
  return list(model?.scopes).find(scope=>sameName(scope.kind,kind)&&sameName(scope.name,name))
    || list(model?.scopes).find(scope=>new RegExp(kind,'i').test(text(scope.kind))&&sameName(scope.name,name))
    || null;
}
function buildFwdEditorIndex(){
  const byKey=new Map();
  const add=record=>{
    if(!record?.key)return null;
    const existing=byKey.get(record.key)||{};
    const merged={childKeys:[],parentKeys:[],metadata:{},...existing,...record};
    merged.childKeys=[...new Set([...list(existing.childKeys),...list(record.childKeys)])];
    merged.parentKeys=[...new Set([...list(existing.parentKeys),...list(record.parentKeys)])];
    merged.metadata={...(existing.metadata||{}),...(record.metadata||{})};
    byKey.set(merged.key,merged);
    return merged;
  };
  const batches=fwdPacketItems('batches').map(item=>add({
    key:text(first(item.key,item.Key,fwdStableKey('batch',item.name||item.Name))),
    type:'batchType',
    name:text(first(item.name,item.Name,'Unnamed batch')),
    childKeys:list(first(item.documentKeys,item.DocumentKeys,[])),
    source:'Fwd.GetDocsInBatch',
    raw:item
  }));
  const documents=fwdPacketItems('documents').map(item=>{
    const name=text(first(item.name,item.Name,'Unnamed document'));
    const scope=fwdScopeFor('Document',name);
    return add({
      key:text(first(item.key,item.Key,fwdStableKey('document',name))),
      type:'documentType',
      name,
      parentKeys:list(first(item.parentBatchKeys,item.ParentBatchKeys,[])),
      childKeys:list(first(item.pageKeys,item.PageKeys,[])),
      scopeId:scope?.scopeId||'',
      source:'Fwd.GetPagesInDoc',
      raw:item
    });
  });
  const pageVariantBuckets=new Map(fwdPacketItems('pageVariants').map(item=>[
    lower(first(item.page,item.Page,'')),
    list(first(item.variants,item.Variants,[]))
  ]));
  const fieldsByPage=new Map();
  fwdPacketItems('fields').forEach(item=>{
    if(!/page/i.test(text(first(item.scopeType,item.ScopeType,''))))return;
    const page=text(first(item.scopeName,item.ScopeName,''));
    if(!fieldsByPage.has(lower(page)))fieldsByPage.set(lower(page),[]);
    fieldsByPage.get(lower(page)).push(item);
  });
  const pages=fwdPacketItems('pages').map(item=>{
    const name=text(first(item.name,item.Name,'Unnamed page'));
    const scope=fwdScopeFor('Page',name);
    const variants=pageVariantBuckets.get(lower(name))||[];
    const fields=fieldsByPage.get(lower(name))||[];
    const page=add({
      key:text(first(item.key,item.Key,fwdStableKey('page',name))),
      type:'pageType',
      name,
      parentKeys:list(first(item.parentDocumentKeys,item.ParentDocumentKeys,[])),
      childKeys:[],
      scopeId:scope?.scopeId||'',
      source:'Fwd.PageNames',
      metadata:{variantCount:variants.length,fieldCount:fields.length},
      raw:item
    });
    variants.forEach(variant=>{
      const variantName=text(first(variant?.name,variant?.Name,variant));
      const key=fwdStableKey('pageVariant',`${name}:${variantName}`);
      add({key,type:'pageVariant',name:variantName,parentKeys:[page.key],source:'Fwd.VariantNames',metadata:{pageName:name},raw:variant});
      page.childKeys.push(key);
    });
    fields.forEach(field=>{
      const fieldName=text(first(field.name,field.Name,'Unnamed field'));
      const key=fwdStableKey('field',`${name}:${fieldName}`);
      add({
        key,
        type:'field',
        name:fieldName,
        parentKeys:[page.key],
        source:'Fwd.Page.Fields',
        metadata:{
          pageName:name,
          fieldType:text(first(field.type,field.Type,'')),
          geometry:text(first(field.geometry,field.Geometry,'')),
          subfieldCount:Number(first(field.subfieldCount,field.SubfieldCount,0))||0
        },
        raw:field
      });
      page.childKeys.push(key);
    });
    if(page.scopeId){
      const acKey=fwdStableKey('acProcess',`page:${name}:AC`);
      add({key:acKey,type:'acProcess',name:'AC',parentKeys:[page.key],scopeId:page.scopeId,source:'AC/Pages',metadata:{ownerType:'Page',ownerName:name}});
      page.childKeys.push(acKey);
    }
    return page;
  });
  documents.forEach(document=>{
    if(document.scopeId){
      const acKey=fwdStableKey('acProcess',`document:${document.name}:AC`);
      add({key:acKey,type:'acProcess',name:'AC',parentKeys:[document.key],scopeId:document.scopeId,source:'AC/Documents',metadata:{ownerType:'Document',ownerName:document.name}});
      document.childKeys.unshift(acKey);
    }
  });
  batches.forEach(batch=>batch.childKeys.forEach(key=>{
    const child=byKey.get(key);
    if(child&&!child.parentKeys.includes(batch.key))child.parentKeys.push(batch.key);
  }));
  documents.forEach(document=>document.childKeys.forEach(key=>{
    const child=byKey.get(key);
    if(child&&!child.parentKeys.includes(document.key))child.parentKeys.push(document.key);
  }));
  add({
    key:'fwd:root',
    type:'fwdRoot',
    name:text(first(model?.fwd?.overview?.path,treeData?.FwdPath,rulesData?.FwdPath,'FWD Configuration')),
    childKeys:['group:batches','group:documents','group:pages','group:resources','diagnostics:root','source:root'],
    source:'FwdInspectionReport',
    raw:model?.fwd?.overview||{}
  });
  add({key:'diagnostics:root',type:'diagnosticCollection',name:'Diagnostics',source:'Reader diagnostics',metadata:{count:model.diags.length}});
  add({key:'source:root',type:'sourceRoot',name:'Source / Raw',source:'FWD snapshot',raw:model?.fwd||{}});
  return {byKey,batches,documents,pages};
}
function fwdEditorObject(key=state.selectedEditorObjectKey){
  const index=buildFwdEditorIndex();
  return index.byKey.get(key)||index.byKey.get('fwd:root');
}
function selectEditorObject(key){
  const record=fwdEditorObject(key);
  if(!buildFwdEditorIndex().byKey.has(key)&&/^(group|folder):/.test(text(key))){
    toggleFwdTreeKey(key);
    return;
  }
  if(!record)return;
  state.selectedEditorObjectKey=record.key;
  if(record.type==='acProcess'&&record.scopeId){
    state.scopeId=record.scopeId;
    state.workspaceView='structure';
    state.selectedType='scope';
    state.selectedId='';
    noteRecentScope(record.scopeId);
    seedExpanded(record.scopeId);
  }else{
    state.workspaceView='editor-object';
    state.selectedType='editor-object';
    state.selectedId=record.key;
  }
  saveState();
  renderAll();
}
function toggleFwdTreeKey(key,force){
  const open=state.fwdExpanded.has(key);
  const next=force===undefined?!open:!!force;
  if(next)state.fwdExpanded.add(key);else state.fwdExpanded.delete(key);
  saveState();
  renderGlobalNavigation();
}
function fwdTreeRow(record,options={}){
  const depth=Number(options.depth||0);
  const depthClass=`fwd-depth-${Math.max(0,Math.min(8,depth))}`;
  const childrenHtml=text(options.childrenHtml||'');
  const expandable=!!childrenHtml;
  const open=expandable&&state.fwdExpanded.has(record.key);
  const active=record.key===state.selectedEditorObjectKey||(record.type==='acProcess'&&record.scopeId===state.scopeId&&state.workspaceView==='structure');
  const count=options.count;
  const marker=expandable?`<button class="fwd-tree-toggle" type="button" data-fwd-toggle="${esc(record.key)}" aria-label="${open?'Collapse':'Expand'} ${esc(record.name)}" aria-expanded="${open?'true':'false'}">${open?'&#9662;':'&#9656;'}</button>`:'<span class="fwd-tree-toggle placeholder" aria-hidden="true"></span>';
  return `<div class="fwd-tree-node" role="treeitem" aria-level="${depth+1}" ${expandable?`aria-expanded="${open?'true':'false'}"`:''}><div class="fwd-tree-row ${depthClass} ${active?'active':''}">${marker}<button class="fwd-tree-select" type="button" data-fwd-object="${esc(record.key)}" title="${esc(record.type)}: ${esc(record.name)}"><span class="fwd-tree-icon ${esc(record.type)}" aria-hidden="true"></span><span class="fwd-tree-label">${esc(record.name)}</span>${count===undefined?'':`<span class="fwd-tree-count">${fmt(count)}</span>`}</button></div>${open?`<div class="fwd-tree-children" role="group">${childrenHtml}</div>`:''}</div>`;
}
function fwdTreeGroup(key,label,records,renderRecord){
  const record={key,type:'folder',name:label};
  return fwdTreeRow(record,{depth:0,count:records.length,childrenHtml:records.map(renderRecord).join('')||'<div class="fwd-tree-empty">No configured items</div>'});
}
function fwdTreeReferenceRow(record,depth){
  return fwdTreeRow(record,{depth,count:undefined});
}
function renderGlobalNavigation(){
  const el=$('globalNav');
  if(!el)return;
  if(!model){el.innerHTML='';return;}
  const index=buildFwdEditorIndex();
  const counts=globalNavigationCounts();
  const filter=lower(state.scopeQuery).trim();
  const matchesFilter=record=>!filter||lower([record?.name,record?.type,record?.key].join(' ')).includes(filter);
  function resourceRow(action,label,count,title){
    const view=action.replace(/^view-/,'');
    const active=state.workspaceView===view;
    return `<button class="fwd-tree-resource-row ${active?'active':''}" type="button" data-action="${esc(action)}" aria-current="${active?'page':'false'}" title="${esc(title)}"><span class="fwd-tree-icon resource" aria-hidden="true"></span><span>${esc(label)}</span>${count===undefined?'':`<b>${fmt(count)}</b>`}</button>`;
  }
  const renderDocument=(document,depth=1,full=true)=>{
    const pages=list(document.childKeys).map(key=>index.byKey.get(key)).filter(item=>item?.type==='pageType');
    const processes=list(document.childKeys).map(key=>index.byKey.get(key)).filter(item=>item?.type==='acProcess');
    const children=full?[
      ...processes.map(process=>fwdTreeRow(process,{depth:depth+1})),
      ...(pages.length?[fwdTreeRow({key:`folder:document-pages:${document.key}`,type:'folder',name:'Pages in Document'},{depth:depth+1,count:pages.length,childrenHtml:pages.map(page=>fwdTreeReferenceRow(page,depth+2)).join('')})]:[])
    ].join(''):'';
    return fwdTreeRow(document,{depth,count:pages.length,childrenHtml:children});
  };
  const renderPage=(page,depth=1)=>{
    const children=list(page.childKeys).map(key=>index.byKey.get(key)).filter(Boolean);
    const variants=children.filter(item=>item.type==='pageVariant');
    const fields=children.filter(item=>item.type==='field');
    const processes=children.filter(item=>item.type==='acProcess');
    const fieldLimit=200;
    const childHtml=[
      ...processes.map(process=>fwdTreeRow(process,{depth:depth+1})),
      ...(variants.length?[fwdTreeRow({key:`folder:page-variants:${page.key}`,type:'folder',name:'Page Variants'},{depth:depth+1,count:variants.length,childrenHtml:variants.map(item=>fwdTreeReferenceRow(item,depth+2)).join('')})]:[]),
      ...(fields.length?[fwdTreeRow({key:`folder:page-fields:${page.key}`,type:'folder',name:'Fields'},{depth:depth+1,count:fields.length,childrenHtml:fields.slice(0,fieldLimit).map(item=>fwdTreeReferenceRow(item,depth+2)).join('')+(fields.length>fieldLimit?`<div class="fwd-tree-empty">Showing ${fmt(fieldLimit)} of ${fmt(fields.length)} fields</div>`:'')})]:[])
    ].join('');
    return fwdTreeRow(page,{depth,count:fields.length,childrenHtml:childHtml});
  };
  const visibleBatches=index.batches.filter(batch=>matchesFilter(batch)||list(batch.childKeys).some(key=>matchesFilter(index.byKey.get(key))));
  const visibleDocuments=index.documents.filter(document=>matchesFilter(document)||list(document.childKeys).some(key=>matchesFilter(index.byKey.get(key))));
  const visiblePages=index.pages.filter(page=>matchesFilter(page)||list(page.childKeys).some(key=>matchesFilter(index.byKey.get(key))));
  if(filter){
    ['fwd:root','group:batches','group:documents','group:pages'].forEach(key=>state.fwdExpanded.add(key));
  }
  const batches=fwdTreeGroup('group:batches','Batches',visibleBatches,batch=>{
    const documents=list(batch.childKeys).map(key=>index.byKey.get(key)).filter(Boolean);
    return fwdTreeRow(batch,{depth:1,count:documents.length,childrenHtml:documents.map(document=>renderDocument(document,2,false)).join('')});
  });
  const documents=fwdTreeGroup('group:documents','Documents',visibleDocuments,document=>renderDocument(document));
  const pages=fwdTreeGroup('group:pages','Pages',visiblePages,page=>renderPage(page));
  const resources=fwdTreeRow({key:'group:resources',type:'folder',name:'Resources'},{depth:0,count:counts.resources,childrenHtml:[
    resourceRow('view-functions','Functions',counts.functions,'AC function catalog'),
    resourceRow('view-udfs','User Defined Functions',counts.udfs,'User Defined Functions and internal Rule Lists'),
    resourceRow('view-tables','Tables',counts.tables,'Table resources'),
    resourceRow('view-selection-lists','Selection Lists',counts.selectionLists,'Selection List configuration'),
    resourceRow('view-resources','Other Resources',counts.resources,'FWD resource definitions'),
    resourceRow('view-drivers','Drivers',counts.drivers,'Driver definitions'),
    resourceRow('view-rule-lists','Rule Lists',counts.ruleLists,'Snapshot-wide Rule Lists')
  ].join('')});
  const diagnostics=fwdTreeRow(index.byKey.get('diagnostics:root'),{depth:0,count:model.diags.length});
  const source=fwdTreeRow(index.byKey.get('source:root'),{depth:0});
  const developer=isAdvancedMode()?`<div class="fwd-tree-developer">${resourceRow('view-load-status','Load Status',counts.messages||model.diags.length,'Load and parse status')}${resourceRow('view-object-graph','Object Graph',counts.objectGraph,'Canonical object graph')}${resourceRow('view-runtime-impact','Runtime Impact',counts.runtimeImpact,'Static impact records')}</div>`:'';
  const root=index.byKey.get('fwd:root');
  el.innerHTML=`<div class="fwd-editor-tree-shell fweditor-fwd-tree-window"><div class="fwd-tree-toolbar"><label for="fwdTreeFilter">FWD Tree</label><input id="fwdTreeFilter" type="search" value="${esc(state.scopeQuery)}" placeholder="Filter FWD objects"></div><div class="fwd-editor-tree" role="tree" aria-label="FWD configuration tree">${fwdTreeRow(root,{depth:0,count:index.batches.length+index.documents.length+index.pages.length,childrenHtml:`${batches}${documents}${pages}${resources}${diagnostics}${source}${developer}`})}</div></div>`;
}

function editorObjectButton(record,label=record?.name){
  if(!record)return '';
  return `<button class="editor-object-link" type="button" data-fwd-object="${esc(record.key)}"><span class="fwd-tree-icon ${esc(record.type)}" aria-hidden="true"></span><span>${esc(label)}</span></button>`;
}
function editorObjectList(title,records,emptyText){
  const rows=list(records);
  return `<section class="editor-object-section"><h4>${esc(title)} <span>${fmt(rows.length)}</span></h4>${rows.length?`<div class="editor-object-list">${rows.map(record=>editorObjectButton(record)).join('')}</div>`:`<div class="fweditor-empty compact">${esc(emptyText)}</div>`}</section>`;
}
function renderEditorObject(){
  const index=buildFwdEditorIndex();
  const record=index.byKey.get(state.selectedEditorObjectKey)||index.byKey.get('fwd:root');
  state.selectedEditorObjectKey=record.key;
  const parents=list(record.parentKeys).map(key=>index.byKey.get(key)).filter(Boolean);
  const children=list(record.childKeys).map(key=>index.byKey.get(key)).filter(Boolean);
  const processes=children.filter(item=>item.type==='acProcess');
  const variants=children.filter(item=>item.type==='pageVariant');
  const fields=children.filter(item=>item.type==='field');
  const ordinaryChildren=children.filter(item=>!['acProcess','pageVariant','field'].includes(item.type));
  let body='';
  if(record.type==='diagnosticCollection'){
    const rows=list(model.diags).slice(0,500);
    body=`<section class="editor-object-section"><h4>Diagnostics <span>${fmt(model.diags.length)}</span></h4><div class="editor-diagnostic-list">${rows.map(diag=>`<button type="button" data-diag="${esc(diag.id)}"><b>${esc(diag.severity||'Info')}</b><span>${esc(diag.title||diag.detail||'Diagnostic')}</span><small>${esc(diag.scopeId||'FWD')}</small></button>`).join('')||'<div class="fweditor-empty compact">No diagnostics were reported.</div>'}</div></section>`;
  }else if(record.type==='sourceRoot'){
    body=`<section class="editor-object-section"><h4>Source / Raw</h4><p>Bounded read-only snapshot data for the loaded FWD configuration.</p>${previewJsonHtml(record.raw,{open:true,maxDepth:4,maxArray:80,maxKeys:100,maxChars:24000})}</section>`;
  }else{
    body=`<div class="editor-object-grid">${editorObjectList('Parent Objects',parents,'This object has no configured parent in the current snapshot.')}${editorObjectList('Configured Children',ordinaryChildren,'No configured child objects were found.')}${processes.length?editorObjectList('Processing',processes,'No processing nodes were found.'):''}${variants.length?editorObjectList('Page Variants',variants,'No page variants were found.'):''}${fields.length?editorObjectList('Fields',fields.slice(0,500),'No fields were found.'):''}</div>`;
    if(record.type==='field'){
      body+=`<section class="editor-object-section"><h4>Field Configuration</h4><div class="kv">${kv('Page',esc(record.metadata.pageName||''))}${kv('Type',esc(record.metadata.fieldType||'Unknown'))}${kv('Geometry',esc(record.metadata.geometry||'Unavailable'))}${kv('Subfields',fmt(record.metadata.subfieldCount||0))}</div></section>`;
    }
    if(record.scopeId){
      body+=`<section class="editor-object-section"><h4>AC Processing</h4><button class="btn primary" type="button" data-scope="${esc(record.scopeId)}">Open AC Rule List</button><p class="caption">Opens the configured page- or document-level Rule List for this object.</p></section>`;
    }
    body+=`<section class="editor-object-section"><h4>Source / Raw</h4>${previewJsonHtml({key:record.key,type:record.type,name:record.name,path:[...parents.map(parent=>parent.name),record.name],source:record.source,metadata:record.metadata,raw:record.raw},{maxDepth:4,maxArray:60,maxKeys:80,maxChars:18000})}</section>`;
  }
  const path=[...parents.map(parent=>parent.name),record.name].filter(Boolean).join(' / ');
  $('content').innerHTML=`<section class="fweditor-object-view"><header class="editor-object-header"><div><span class="workspace-eyebrow">${esc(record.type)}</span><h3>${esc(record.name)}</h3><p class="mono">${esc(path||record.key)}</p></div><div class="tree-detail-badges"><span class="badge blue">Read-only</span><span class="badge">${esc(record.source||'FWD')}</span></div></header>${body}</section>`;
}

function modernRowMeta(row,kind){
  const metric=list(row.usage).length||row.metric||row.count||0;
  const stateText=kind==='selection-lists'?(row.selectionList?.schemaParsed?'Parsed schema':'Rule reference'):(row.defined===false?'Observed':'Loaded');
  return `${stateText}${metric?` &middot; ${fmt(metric)} refs`:''}`;
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
  const rowsHtml=page.rows.map(row=>`<button class="product-index-row ${row.key===selected.key?'active':''}" type="button" data-global-kind="${esc(kind)}" data-global-key="${esc(row.key)}"><span><b>${esc(row.name||row.key)}</b><small>${esc(row.type||'Item')} &middot; ${modernRowMeta(row,kind)}</small></span><em>${esc(row.source||'FWD')}</em></button>`).join('');
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
  const rowsHtml=rows.map(d=>`<button class="product-index-row" type="button" data-diag="${esc(d.id)}"><span><b>${esc(d.title||d.severity||'Status message')}</b><small>${esc(d.scopeId||'Snapshot')} &middot; ${esc(d.detail||d.Message||'')}</small></span><em>${esc(d.severity||'Info')}</em></button>`).join('');
  $('content').innerHTML=`<section class="product-workspace product-catalog"><div class="product-catalog-head"><div><h3>Load Status</h3><p>Configuration load status and warnings. This area is hidden unless advanced mode is enabled.</p></div><div class="product-status-inline"><span>Items <b>${fmt(stats.diags.length)}</b></span><span>Warnings <b>${fmt(stats.warningCount)}</b></span><span>Linked <b>${fmt(stats.linkedCount)}</b></span></div></div><div class="product-catalog-grid single"><aside class="product-index">${rowsHtml||'<div class="product-empty-state compact"><h3>No diagnostics</h3><p>No diagnostics match the current filter.</p></div>'}</aside></div></section>`;
}
function normalizeWorkspaceViewForScope(){
  state.workspaceView=normalizeWorkspaceViewName(state.workspaceView);
  if(!validWorkspaceViews().includes(state.workspaceView))state.workspaceView='structure';
  const scope=currentScope();
  if(scope&&state.selectedProcessName&&!processNamesForScope(scope).some(name=>lower(name)===lower(state.selectedProcessName)))state.selectedProcessName='';
}


/* v80 FW Editor parity: selected rule property sheet, keyboard tabs, locked default editor shell, load-status routing, and normal-mode terminology cleanup. */
function fweditorRuleDetailTabsHtml(active='summary'){
  const tabs=[
    ['summary','Summary'],
    ['function','Function'],
    ['fields','Fields / Parameters'],
    ['attributes','Attributes'],
    ['status-results','Status Results / Actions'],
    ['children','Children / Sub-lists'],
    ['references','References'],
    ['raw','Source / Raw'],
    ['diagnostics','Diagnostics']
  ];
  return `<div class="fweditor-property-tabs" role="tablist" aria-label="Rule property pages">${tabs.map(([id,label])=>`<button class="${id===active?'active':''}" type="button" data-rule-property-tab="${esc(id)}" role="tab" aria-selected="${id===active?'true':'false'}">${esc(label)}</button>`).join('')}</div>`;
}
function normalizedRulePropertyPage(){
  const page=text(state.rulePropertyPage||state.inspectorView||'summary');
  if(page==='general')return 'summary';
  if(page==='config')return 'fields';
  if(page==='actions')return 'status-results';
  return ['summary','function','fields','attributes','status-results','children','references','raw','diagnostics'].includes(page)?page:'summary';
}
function setRulePropertyPage(page){
  const next=['summary','function','fields','attributes','status-results','children','references','raw','diagnostics'].includes(page)?page:'summary';
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
function ruleFunctionPropertyHtml(n){
  const functionName=text(n.fn||n.FunctionName||'');
  const fnRow=buildGlobalFunctionDefinitions().find(row=>sameName(row.name,functionName)||sameName(row.key,functionName));
  const udf=udfForFunctionName(functionName);
  return `<div class="fweditor-function-page">${functionMetadataBlock(n)}${fnRow?functionConfigurationHtml(fnRow.fn||fnRow,fnRow):''}${udf?`<div class="table-columns-head mt-12">User Defined Function</div>${linkedDefinitionHtml(udf.displayName||udf.rawName||functionName,'UDF','')}`:''}</div>`;
}
function ruleChildrenPropertyHtml(n){
  const groups=childActionListGroups(n.id);
  if(!groups.length)return '<div class="fweditor-empty compact">This rule has no configured child Action Lists or sub-lists.</div>';
  return `<div class="mini-list">${groups.map(group=>{
    const key=actionListKey(n.id,group);
    const children=list(group.childIds).map(id=>model.nodesById.get(String(id))).filter(Boolean);
    return `<button class="mini-row" type="button" data-action-list="${esc(key)}"><span><b>${esc(group.label)}</b><small>${esc(group.routeState||'Action List')} - ${fmt(children.length)} child rules</small></span><span class="badge ${group.resolved?'green':'amber'}">${group.resolved?'Resolved':'Review'}</span></button>`;
  }).join('')}</div>`;
}
function ruleReferencesPropertyHtml(n){
  const refs=list(model.relsByNode?.get(String(n.id))).length
    ? list(model.relsByNode?.get(String(n.id)))
    : model.rels.filter(reference=>String(reference.nodeId)===String(n.id));
  if(!refs.length)return '<div class="fweditor-empty compact">No inbound or outbound references are linked to this rule in the current snapshot.</div>';
  return `<div class="mini-list">${refs.map(reference=>`<div class="mini-row"><span><b>${esc(reference.kind||'Reference')}</b><small>${esc(reference.targetType||'Object')}</small></span><span>${relationshipTargetHtml(reference)}</span></div>`).join('')}</div>`;
}
function ruleDiagnosticsPropertyHtml(n){
  const diagnostics=list(model.diagsByNode?.get(String(n.id)));
  if(!diagnostics.length)return '<div class="fweditor-empty compact">No diagnostics are linked to this rule.</div>';
  return `<div class="editor-diagnostic-list">${diagnostics.map(diagnostic=>`<button type="button" data-diag="${esc(diagnostic.id)}"><b>${esc(diagnostic.severity||'Info')}</b><span>${esc(diagnostic.title||diagnostic.detail||'Diagnostic')}</span><small>${esc(diagnostic.scopeId||n.scopeId||'Rule')}</small></button>`).join('')}</div>`;
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
  else if(active==='function')body=ruleFunctionPropertyHtml(n);
  else if(active==='children')body=ruleChildrenPropertyHtml(n);
  else if(active==='references')body=ruleReferencesPropertyHtml(n);
  else if(active==='raw')body=previewJsonHtml(selectedRuleConfigPacket(n),{open:true,maxDepth:5,maxArray:100,maxKeys:120,maxChars:28000});
  else if(active==='diagnostics')body=ruleDiagnosticsPropertyHtml(n);
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
      : noAcRuleListWorkspaceHtml(s);
    const processBox=isAdvancedMode()?`<fieldset class="fweditor-fieldset"><legend>Processes</legend>${processPanelHtml(s)}</fieldset>`:'';
    const ruleListToolbar=`<div class="fweditor-rulelist-toolbar" aria-label="Rule List commands"><span class="fweditor-toolbar-label">Rule List</span><button type="button" class="fweditor-command-button" data-action="expand-all">Expand All</button><button type="button" class="fweditor-command-button" data-action="clear-tree-search" ${text(state.query).trim()?'':'disabled'}>Clear Find</button><span class="fweditor-toolbar-spacer"></span><span class="fweditor-toolbar-note">Read-only configuration view</span></div>`;
    const body=`<div class="fweditor-rulelist-layout"><fieldset class="fweditor-fieldset fweditor-rulelist-fieldset"><legend>Rule List</legend>${ruleListToolbar}<div class="fweditor-scope-summary"><span>Visible Rules <b>${fmt(summary.visibleRules)}</b></span><span>Action Lists <b>${fmt(summary.actionLists)}</b></span><span>Scope Rules <b>${fmt(summary.scopedTotal)}</b></span></div>${treeHtml}</fieldset><fieldset class="fweditor-fieldset fweditor-rule-properties-fieldset"><legend>Rule Properties</legend>${fweditorRulePropertiesHtml()}</fieldset></div>${processBox}`;
    $('content').innerHTML=fweditorScopeRootHtml('structure',`AC Rule List - ${s.name||s.scopeId}`,body,{chips:['Read-only',`${fmt(summary.visibleRules)} visible rules`,`${fmt(summary.actionLists)} action lists`]});
    return;
  }
  const additional=model.nodes.filter(n=>n.scopeId===s.scopeId&&n.isAdditionalRule).length;
  const treeHtml=rows.length?`<div class="tree workspace-tree product-rule-tree" role="tree" aria-label="Rule List tree">${rows.map(r=>r.type==='action-list'?actionListRow(r):treeRow(r.n,r.level)).join('')}</div>`:noAcRuleListWorkspaceHtml(s);
  $('content').innerHTML=`<section class="product-workspace product-rules"><div class="product-catalog-head"><div><h3>${esc(s.name||s.scopeId)}</h3><p>Read-only Rule List for this scope. Select a rule to open details.</p></div><div class="product-status-inline"><span>Placed <b>${fmt(Math.max(0,Number(s.structural||0)-additional))}</b></span><span>Additional Rules <b>${fmt(additional)}</b></span></div></div><div class="product-rule-toggles"><button class="chip-btn ${state.inventoryFilter==='all'?'active':''}" type="button" data-action="view-structure">All</button><span class="caption">Additional Rules are readable/searchable rules without confirmed Rule List placement.</span></div>${treeHtml}</section>`;
}

function scopeRuleContentScore(scope){
  if(!scope)return 0;
  return Number(scope.structural||0)+Number(scope.inventory||0)+Number(scope.rules||0);
}

function scopeHasRuleContent(scope){
  return scopeRuleContentScore(scope)>0;
}

function selectBestAvailableScope(){
  if(!model||!list(model.scopes).length)return '';
  const current=model.scopes.find(s=>s.scopeId===state.scopeId);
  if(current&&scopeHasRuleContent(current))return current.scopeId;
  const richest=list(model.scopes)
    .slice()
    .sort((a,b)=>scopeRuleContentScore(b)-scopeRuleContentScore(a)||text(a.name||a.scopeId).localeCompare(text(b.name||b.scopeId),undefined,{sensitivity:'base'}))[0];
  return text(richest?.scopeId||model.scopes[0]?.scopeId||'');
}

function workspaceContentScore(view){
  if(!model)return 0;
  const normalized=normalizeWorkspaceViewName(view);
  if(normalized==='editor-object'){
    return buildFwdEditorIndex().byKey.has(state.selectedEditorObjectKey)?1:0;
  }
  if(normalized==='structure')return list(model.nodes).length+list(model.inventory).length+list(model.scopes).reduce((sum,scope)=>sum+scopeRuleContentScore(scope),0);
  if(normalized==='field-resolution'){
    // Field Resolution is a scope-local workspace. It must be considered valid
    // even when the current filter produces zero rows, otherwise
    // ensureUsefulWorkspaceSelection() immediately falls back to structure.
    const scopedRules = typeof scopedRuleNodes === 'function' ? scopedRuleNodes().length : 0;
    const scopedNodeCount = typeof scopedNodes === 'function' ? scopedNodes().length : 0;
    return Math.max(scopedRules, scopedNodeCount, 1);
  }
  if(normalized==='rule-lists')return buildRuleListPacketDefinitions().length;
  if(normalized==='udfs')return buildUdfDefinitions().length;
  if(normalized==='functions')return buildGlobalFunctionDefinitions().length;
  if(normalized==='tables')return buildGlobalTableDefinitions().length;
  if(normalized==='selection-lists')return buildSelectionListPacketDefinitions().length;
  if(normalized==='resources')return buildGlobalResourceDefinitions().length;
  if(normalized==='drivers')return buildGlobalDriverDefinitions().length;
  if(isAdvancedMode()&&normalized==='object-graph')return buildObjectGraphDefinitions().length;
  if(isAdvancedMode()&&normalized==='runtime-impact')return buildRuntimeImpactDefinitions().length;
  return 0;
}

function workspaceHasContent(view){
  return workspaceContentScore(view)>0;
}

function preferredInitialWorkspace(){
  const explicit=requestedWorkspaceView();
  if(explicit)return explicit;
  const current=normalizeWorkspaceViewName(state.workspaceView||'structure');
  if(current!=='structure'&&validWorkspaceViews().includes(current)&&workspaceHasContent(current))return current;
  const priority=['structure','drivers','udfs','functions','tables','selection-lists','resources','rule-lists',...(isAdvancedMode()?['object-graph','runtime-impact']:[])];
  const valid=validWorkspaceViews();
  return priority
    .filter(view=>valid.includes(view))
    .sort((a,b)=>workspaceContentScore(b)-workspaceContentScore(a))
    .find(workspaceHasContent)||'structure';
}

function ensureUsefulWorkspaceSelection(reason='boot'){
  if(!model)return;
  const explicit=requestedWorkspaceView();
  if(!explicit){
    state.scopeId=selectBestAvailableScope();
  }else if(!state.scopeId){
    state.scopeId=selectBestAvailableScope();
  }
  const current=normalizeWorkspaceViewName(state.workspaceView||'structure');
  if(explicit){
    state.workspaceView=explicit;
    return;
  }

  const selectedScope=current==='structure'?currentScope():null;
  const currentIsEmpty=!validWorkspaceViews().includes(current)
    || !workspaceHasContent(current)
    || (current==='structure' && selectedScope && !scopeHasRuleContent(selectedScope) && workspaceContentScore('structure')<=0);

  if(currentIsEmpty){
    state.workspaceView=preferredInitialWorkspace();
  }
}

function applyInitialWorkspaceSelection(){
  ensureUsefulWorkspaceSelection('boot');
}

function viewerWorkspaceFallbackHtml(reason=''){
  const c=productCounts();
  const nav=globalNavigationCounts();
  const hydrated=fwdHydrationSummary();
  const cards=[
    {action:'nav-documents',label:'Documents / Pages',count:c.scopes,detail:'Open document, page, batch, and process scopes.'},
    {action:'view-drivers',label:'Drivers',count:nav.drivers,detail:'Inspect input, output, and process-private drivers.'},
    {action:'view-udfs',label:'UDFs',count:nav.udfs,detail:'Review user-defined functions and caller bindings.'},
    {action:'view-functions',label:'Functions',count:nav.functions,detail:'Review function catalog entries and usage.'},
    {action:'view-tables',label:'Tables',count:nav.tables,detail:'Open table and lookup resources.'},
    {action:'view-selection-lists',label:'SelectionLists',count:nav.selectionLists,detail:'Inspect SelectionList configuration.'},
    {action:'view-resources',label:'Resources',count:nav.resources,detail:'Browse FWD-level shared resources.'},
    {action:'view-rule-lists',label:'Rule Lists',count:nav.ruleLists,detail:'Open status result and action list packets.'}
  ].filter(card=>Number(card.count||0)>0);
  const cardsHtml=cards.slice(0,6).map((card,index)=>`<button class="product-empty-choice ${index===0?'primary':''}" type="button" data-action="${esc(card.action)}"><span><b>${esc(card.label)}</b><small>${esc(card.detail)}</small></span><em>${fmt(card.count)}</em></button>`).join('');
  const metrics=[
    ['Documents/pages/processes',c.scopes],
    ['Rules',c.rules],
    ['Drivers',nav.drivers],
    ['Resources',nav.resources]
  ];
  return `<section class="product-workspace product-catalog product-fallback-workspace" aria-label="Viewer ready"><div class="product-empty-state product-empty-state-actionable"><div class="empty-status-row"><span class="badge green">${esc(hydrated.label||'FWD connected')}</span><span class="badge blue">Read-only</span></div><h3>FWD loaded. Choose an available workspace.</h3><p>The hosted API is ready, but the selected workspace has no renderable rows${reason?`: ${esc(reason)}`:''}. This FWD still exposes browsable configuration.</p><div class="product-empty-metrics">${metrics.map(([label,value])=>`<span><b>${fmt(value)}</b>${esc(label)}</span>`).join('')}</div><div class="product-empty-choices">${cardsHtml||'<button class="product-empty-choice primary" type="button" data-action="nav-documents"><span><b>Open FWD Tree</b><small>Browse the available scopes.</small></span><em>Open</em></button>'}</div></div></section>`;
}

function ensureRenderedContentFallback(reason='render'){
  const host=optionalElement('content');
  if(!host||!model)return;
  const hasHtml=host.innerHTML&&host.innerHTML.trim().length>0;
  const hasText=host.textContent&&host.textContent.trim().length>0;
  if(hasHtml||hasText)return;
  if(typeof recordViewerDiagnostic==='function')recordViewerDiagnostic('warn','empty-content-fallback',{reason,payloadCounts:typeof payloadCounts==='function'?payloadCounts():null,modelCounts:typeof modelCounts==='function'?modelCounts():null,workspaceView:state.workspaceView,scopeId:state.scopeId});
  host.innerHTML=viewerWorkspaceFallbackHtml(reason);
  const title=optionalElement('scopeTitle');
  if(title)title.textContent='FWD configuration ready';
  const caption=optionalElement('scopeCaption');
  if(caption)caption.innerHTML='<span class="scope-caption-note">The selected workspace had no rows, so the viewer is showing available configuration areas.</span>';
}

function noAcRuleListWorkspaceHtml(scope){
  const counts=globalNavigationCounts();
  const product=productCounts();
  const options=[
    {action:'view-drivers',label:'Open Drivers',count:counts.drivers,primary:true,detail:'Inspect process driver definitions and process-node configuration.'},
    {action:'nav-documents',label:'Open Documents',count:product.scopes,detail:'Browse document, page, batch, and process scopes exposed by the FWD.'},
    {action:'view-functions',label:'Open Functions',count:counts.functions,detail:'Review function catalog entries and observed configuration usage.'},
    {action:'view-udfs',label:'Open UDFs',count:counts.udfs,detail:'Review user-defined functions and caller bindings.'},
    {action:'view-tables',label:'Open Tables',count:counts.tables,detail:'Review table and lookup resources.'},
    {action:'view-resources',label:'Open Resources',count:counts.resources,detail:'Review resource definitions exported from the FWD.'}
  ].filter(item=>Number(item.count||0)>0);
  const usefulActions=options.slice(0,4).map((item,index)=>`<button class="btn ${item.primary||index===0?'primary':''}" type="button" data-action="${esc(item.action)}">${esc(item.label)} <span>${fmt(item.count)}</span></button>`).join('')||'<button class="btn primary" type="button" data-action="view-rule-lists">Open Rule Lists</button>';
  const loadedHint=fwdHydrationSummary().label||'Live FWD session loaded';
  const metrics=[
    ['Documents/pages/processes',product.scopes],
    ['Drivers',counts.drivers],
    ['Rules',product.rules],
    ['Resources',counts.resources]
  ];
  const nextStep=options[0]?.detail||'Use the FWD navigation areas to inspect the available configuration.';
  return `<div class="product-empty-state product-empty-state-actionable" role="region" aria-label="No AC rules found"><div class="empty-status-row"><span class="badge green">${esc(loadedHint)}</span><span class="badge blue">FWD connected</span></div><h3>No AC Rule List entries were found for this FWD scope</h3><p>The hosted API is connected and the FWD opened, but this configuration exposes <b>${fmt(product.rules)}</b> AC rules for the selected Rule List workspace. The viewer has other FWD-level configuration available.</p><div class="product-empty-metrics">${metrics.map(([label,value])=>`<span><b>${fmt(value)}</b>${esc(label)}</span>`).join('')}</div><div class="product-empty-actions">${usefulActions}</div><p class="caption">${esc(nextStep)} Selected scope: ${esc(scope?.name||scope?.scopeId||'none')}.</p></div>`;
}

async function init(){
  recordViewerDiagnostic('info','boot-start',{href:window.location.href,userAgent:navigator.userAgent});
  renderBootLoading();
  try {
    await loadViewerData();
    recordViewerDiagnostic('info','viewer-data-loaded-before-model',{payloadCounts:payloadCounts()});
    model=buildModel();
    recordViewerDiagnostic('info','model-built',{modelCounts:modelCounts(),payloadCounts:payloadCounts()});
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

  return withUiGuard('boot',()=>{if(!model.scopes.length){recordViewerDiagnostic('error','boot-no-scopes',{modelCounts:modelCounts(),payloadCounts:payloadCounts()});renderNoData();return;}restoreSnapshotState();applyInitialWorkspaceSelection();applyPaneLayout();ensurePaneResizers();ensureScrollablePaneFocus();wireDesktopScrollPanFallback();installDesktopPaneMovement();seedExpanded(state.scopeId);installPaneResizers();wire();wireEditorPaneResizers();wireGuidanceHints();wireOnboardingChecklist();wireTableSelection();wireUdfSelection();wireGlobalDefinitionSelection();wireEditorPropertyPages();renderAll();recordViewerDiagnostic('info','boot-complete',{modelCounts:modelCounts(),state:{workspaceView:state.workspaceView,scopeId:state.scopeId,selectedType:state.selectedType,selectedId:state.selectedId}});});
}

init();
})();
