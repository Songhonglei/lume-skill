'use strict';

function versionURL(skillId, versionId, extra = {}) {
  const query = new URLSearchParams({version:versionId, ...extra});
  return '#skill/' + encodeURIComponent(skillId) + '?' + query;
}
function reportURL(taskId) { return '#task/'+encodeURIComponent(taskId)+'?view=report'; }
function auditURL(audit) {
  if (!audit.task_id) return '#audit/'+encodeURIComponent(audit.id)+'?view=report';
  return audit.delivery_status==='saved'?reportURL(audit.task_id):'#task/'+encodeURIComponent(audit.task_id);
}
function auditKind(audit) { return audit?.mode === 'static' ? '静态预检' : '完整审计'; }
function issueCount(audit, severity, skillId='', taskId='') {
  const number=severity==='ERR'?audit?.error_count:audit?.warning_count;
  if (number==null) return '<span class="muted" aria-label="尚无检查结果">—</span>';
  const text=severity==='ERR'?'必修':'建议';
  if (!skillId||!number) return `<span class="number ${number&&severity==='ERR'?'text-danger':number?'':'muted'}">${number}</span>`;
  return `<button class="issue-link number ${severity==='ERR'?'text-danger':''}" data-preview-audit="${escapeHTML(audit.audit_run_id||audit.id)}" data-preview-skill="${escapeHTML(skillId)}" data-preview-task="${escapeHTML(taskId||audit.task_id||'')}" data-preview-filter="${severity}" aria-label="查看 ${number} 个${text}">${number}</button>`;
}
function skillRow(skill) {
  const audit=skill.latest_audit, detail='#skill/'+encodeURIComponent(skill.id);
  const actions=actionSlots([
    ['审计',skill.can_write?`<button class="text-button row-primary" data-audit-skill="${skill.id}" data-version-id="${skill.current_version_id}">审计</button>`:null],
    ['报告',audit?.delivery_status==='saved'?windowLink(auditURL(audit),'报告'):null],
    ['详情',detailButton('skill',skill.id,skill.current_version_id)],
    ['下载',`<a class="row-primary" href="/api/versions/${skill.current_version_id}/download">下载</a>`],
  ]);
  return `<tr><td class="record-title"><a class="skill-name cell-text" target="_blank" rel="noopener noreferrer" href="${detail}" title="${escapeHTML(skill.name+(skill.description?' — '+skill.description:''))}">${escapeHTML(skill.name)}</a></td>
    <td data-label="当前版本"><span class="cell-text mono" title="${escapeHTML(skill.current_version)}">${escapeHTML(skill.current_version)}</span></td>
    <td data-label="审计状态">${auditBadge(audit)}</td>
    <td class="numeric-cell" data-label="必修">${issueCount(audit,'ERR',skill.id)}</td>
    <td class="numeric-cell" data-label="建议">${issueCount(audit,'WARN',skill.id)}</td>
    <td data-label="维护者"><span class="cell-text" title="${escapeHTML(skill.owner)}">${escapeHTML(skill.owner)}</span></td>
    <td data-label="最近活动"><time title="${escapeHTML(fmtDate(skill.updated_at))}" datetime="${escapeHTML(skill.updated_at)}">${escapeHTML(fmtShortDate(skill.updated_at))}</time></td>
    <td class="record-actions">${actions}</td></tr>`;
}
async function library() {
  const key = location.hash, request=++view.render;
  const skills = await api('/skills');
  if (location.hash !== key||request!==view.render||!state.user) return;
  state.skills = skills;
  $('#main').innerHTML = pageHeading('Skill 库', '', '<button class="primary" data-action="import">导入 Skill</button>') + `<section class="panel"><div id="library-overview" class="library-overview" aria-label="质量快捷筛选"></div><div class="toolbar library-toolbar"><label class="search-field"><span class="sr-only">搜索 Skill</span><input id="search" type="search" placeholder="搜索名称、描述或维护者" aria-label="搜索 Skill" value="${escapeHTML(view.library.q)}"></label><label class="scope-toggle"><input id="library-mine" type="checkbox" ${view.library.mine?'checked':''}>我维护的</label><label class="compact-label"><span class="sr-only">审计状态</span><select id="library-verdict" aria-label="审计状态">${[['','全部审计状态'],['attention','待处理'],['active','执行中'],['none','未审计'],['pass','审计通过'],['fail','不通过'],['review_required','待复核']].map(([value,text])=>`<option value="${value}" ${view.library.verdict===value?'selected':''}>${text}</option>`).join('')}</select></label><button class="text-button" data-ui="library-refresh">刷新</button></div><div id="skill-results"></div><div class="panel-foot"><span id="library-count"></span><div id="library-pagination"></div></div></section>`;
  $('#search').oninput = event => { view.library.q = event.target.value; resetList('library');renderRows(); };
  $('#library-mine').onchange=event=>{view.library.mine=event.target.checked;resetList('library');renderRows();};
  $('#library-verdict').onchange = event => { view.library.verdict = event.target.value;resetList('library');renderRows(); };
  renderRows();
}
function renderRows() {
  const filter = view.library, q = filter.q.trim().toLowerCase();
  const scope=state.skills.filter(skill=>(!filter.mine||skill.owner_id===state.user.id)&&`${skill.name} ${skill.slug} ${skill.description} ${skill.owner}`.toLowerCase().includes(q));
  const rows=scope.filter(skill=>matchesAuditStatus(skill.latest_audit,filter.verdict));
  $('#library-overview').innerHTML=[['','全部 Skill'],['attention','待处理'],['active','执行中'],['none','未审计']].map(([value,text])=>`<button data-library-status="${value}" aria-pressed="${filter.verdict===value}"><span>${text}</span><strong>${scope.filter(skill=>matchesAuditStatus(skill.latest_audit,value)).length}</strong></button>`).join('');
  const page=localPage('library',rows);
  mountPagination($('#library-pagination'),'library',page,renderRows);
  $('#library-count').textContent = `${rows.length} / ${state.skills.length} 个 Skill`;
  $('#skill-results').innerHTML = rows.length ? `<div class="table-wrap"><table class="records-table result-table skill-table"><caption class="sr-only">Skill 当前版本的审计结果</caption><colgroup><col class="skill-col-name"><col class="skill-col-version"><col class="skill-col-verdict"><col class="count-col"><col class="count-col"><col class="skill-col-owner"><col class="skill-col-time"><col class="skill-col-actions"></colgroup><thead><tr><th scope="col">Skill</th><th scope="col">当前版本</th><th scope="col">审计状态</th><th scope="col" class="numeric-cell">必修</th><th scope="col" class="numeric-cell">建议</th><th scope="col">维护者</th><th scope="col">最近活动</th><th scope="col">操作</th></tr></thead><tbody>${page.items.map(skillRow).join('')}</tbody></table></div>` : emptyState(state.skills.length?'没有匹配的 Skill':'导入第一个 Skill', state.skills.length?'试试其他关键词或清除筛选。':'支持 ZIP、目录或公开下载链接。', `<button ${state.skills.length?'data-ui="library-clear"':'class="primary" data-action="import"'}>${state.skills.length?'清除筛选':'导入 Skill'}</button>`);
}
async function detail(id, selected, options = {}) {
  const token = ++view.render;
  const skill = await api('/skills/' + encodeURIComponent(id));
  if (token !== view.render) return;
  if (selected&&!skill.versions.some(item=>item.id===selected)) throw new Error('所选版本不存在，请从 Skill 库重新选择');
  const version = selected || view.versions.get(id) || skill.current_version_id;
  const current = skill.versions.find(item => item.id === version) || skill.versions.find(item => item.id === skill.current_version_id);
  state.detail = skill; state.version = current.id; view.versions.set(id, current.id);
  state.detailTab = ['activity','versions'].includes(options.tab) ? options.tab : 'files';
  const audit = current.latest_audit;
  const managementActions=(skill.can_write?'<button data-action="import-version">导入新版本</button>':'')+(state.user.role==='admin'?'<button data-ui="edit-owner">调整维护者</button>':'');
  $('#main').innerHTML = `<div class="crumb"><a href="#skills">Skill 库</a><span>/</span><span>${escapeHTML(skill.name)}</span></div>` + pageHeading(skill.name, skill.description || '', `${skill.can_write?'<button class="primary" data-action="audit">创建审计</button>':''}<a class="button" href="/api/versions/${current.id}/download">下载原包</a>${managementActions?`<details class="more-menu"><summary>更多</summary><div>${managementActions}</div></details>`:''}`) + `<section class="version-strip"><label>所选版本<select id="version-select" aria-label="选择版本">${skill.versions.map(item=>`<option value="${item.id}" ${item.id===current.id?'selected':''}>${escapeHTML(item.version)}${item.id===skill.current_version_id?' · 当前':''}</option>`).join('')}</select></label><div>${badge('neutral',current.id===skill.current_version_id?'当前使用':'历史版本')}</div><div class="version-audit">${auditBadge(audit)}<span class="muted">${audit?auditKind(audit):'未审计'}</span>${audit?`<a target="_blank" rel="noopener noreferrer" href="${auditURL(audit)}">查看${audit.delivery_status==='saved'?'报告':'进展'}</a>`:''}</div>${skill.can_write&&current.id!==skill.current_version_id?'<button data-action="set-current">设为当前版本</button>':''}</section><section class="panel detail-panel"><div class="tabs content-tabs" role="tablist" aria-label="Skill 详情"><button id="detail-tab-files" data-detail-tab="files" aria-controls="detail-content" role="tab" tabindex="0" aria-selected="true">文件</button><button id="detail-tab-activity" data-detail-tab="activity" aria-controls="detail-content" role="tab" tabindex="-1" aria-selected="false">审计与修复</button><button id="detail-tab-versions" data-detail-tab="versions" aria-controls="detail-content" role="tab" tabindex="-1" aria-selected="false">版本历史 <span>${skill.versions.length}</span></button></div><div id="detail-content" role="tabpanel" aria-labelledby="detail-tab-files"></div></section><details class="panel evidence-panel"><summary>版本证据<span class="muted">原包摘要与登记信息</span></summary><div class="card-body"><dl class="facts facts-grid"><div><dt>维护者</dt><dd>${escapeHTML(skill.owner)}</dd></div><div><dt>登记时间</dt><dd>${escapeHTML(fmtDate(current.created_at))}</dd></div><div><dt>原包大小</dt><dd>${(current.byte_size/1024).toFixed(1)} KiB</dd></div><div><dt>内容 SHA-256</dt><dd class="mono">${current.content_digest}</dd></div><div><dt>原包 SHA-256</dt><dd class="mono">${current.artifact_digest}</dd></div></dl></div></details>`;
  $('#version-select').onchange = event => { view.versions.set(id, event.target.value); location.hash=versionURL(id,event.target.value,{tab:state.detailTab}); };
  await detailTab(state.detailTab, options);
}
async function detailTab(tab, options = {}) {
  const routeKey=location.hash;
  state.detailTab = tab;
  document.querySelectorAll('[data-detail-tab]').forEach(button=>{button.setAttribute('aria-selected',String(button.dataset.detailTab===tab));button.tabIndex=button.dataset.detailTab===tab?0:-1;});
  const host = $('#detail-content'), skill = state.detail, version = state.version;
  host.setAttribute('aria-labelledby','detail-tab-'+tab);
  if (tab === 'versions') {
    const key='versions:'+skill.id, page=localPage(key,skill.versions);
    host.innerHTML=`<div class="table-wrap"><table class="records-table result-table version-table"><thead><tr><th scope="col">版本</th><th scope="col">使用状态</th><th scope="col">审计状态</th><th scope="col">登记时间</th><th scope="col">大小</th><th scope="col">操作</th></tr></thead><tbody>${page.items.map(item=>`<tr><td class="record-title"><a class="cell-text mono" title="${escapeHTML(item.version)}" target="_blank" rel="noopener noreferrer" href="${versionURL(skill.id,item.id)}">${escapeHTML(item.version)}</a></td><td data-label="使用状态">${item.id===skill.current_version_id?badge('active','当前'):badge('neutral','历史')}</td><td data-label="审计状态">${item.latest_audit?`<a target="_blank" rel="noopener noreferrer" href="${auditURL(item.latest_audit)}">${auditBadge(item.latest_audit)}</a>`:auditBadge(null)}</td><td data-label="登记时间"><time title="${escapeHTML(fmtDate(item.created_at))}">${escapeHTML(fmtShortDate(item.created_at))}</time></td><td data-label="大小" class="number">${(item.byte_size/1024).toFixed(1)} KiB</td><td class="record-actions">${actionSlots([['详情',detailButton('skill',skill.id,item.id)],['下载',`<a class="row-primary" href="/api/versions/${item.id}/download">下载</a>`]])}</td></tr>`).join('')}</tbody></table></div><div id="versions-pagination"></div>`;
    host.dataset.loadedTab=tab;
    mountPagination($('#versions-pagination'),key,page,()=>detailTab('versions'));
    return;
  }
  if (tab === 'activity') {
    const keep=host.dataset.loadedTab===tab;
    if(!keep)host.innerHTML='<div class="loading-state" role="status">正在加载记录…</div>';
    const key='activity:'+version;let page;
    try{page=await cursorPage(key,'/task-history',{version_id:version});}catch(error){if(!keep&&state.detailTab===tab&&location.hash===routeKey){host.innerHTML=emptyState('记录暂时无法读取',error.message,'<button data-retry-activity>重试</button>');$('[data-retry-activity]',host).onclick=()=>detailTab(tab).catch(error=>notice(error.message));}throw error;}
    if (!page||location.hash!==routeKey || state.version!==version || state.detailTab!==tab) return;
    host.innerHTML=`<div class="section-title"><p>版本 ${escapeHTML(skill.versions.find(item=>item.id===version).version)} · 共 ${page.summary.total} 条记录</p></div>${taskRows(page.items)}<div id="activity-pagination"></div>`;
    host.dataset.loadedTab=tab;
    mountPagination($('#activity-pagination'),key,page,()=>detailTab('activity'));
    return;
  }
  host.innerHTML='<div class="loading-state" role="status">正在读取文件…</div>';
  let files;try{files=await api('/versions/'+version+'/files');}catch(error){if(state.detailTab===tab&&location.hash===routeKey){host.innerHTML=emptyState('文件列表暂时无法读取',error.message,'<button data-retry-files>重试</button>');$('[data-retry-files]',host).onclick=()=>detailTab(tab,options).catch(error=>notice(error.message));}throw error;}
  if (location.hash!==routeKey || state.version!==version || state.detailTab!==tab) return;
  state.files=files;host.dataset.loadedTab=tab;
  host.innerHTML=`<div class="file-layout"><nav class="file-list" aria-label="文件列表"><p class="file-list-heading">包内文件</p><label class="file-search"><span class="sr-only">查找包内文件</span><input id="file-search" type="search" placeholder="查找文件" aria-label="查找包内文件"></label><div id="file-results"></div><div id="files-pagination"></div></nav><div class="file-preview"><div id="file-title" class="file-title"></div><div id="file-content"></div></div></div>`;
  const initial=options.file||files.find(file=>file.path==='SKILL.md')?.path||files[0]?.path;
  const paging=listState('files:'+version), position=files.findIndex(file=>file.path===initial);
  if(position>=0)paging.page=Math.floor(position/paging.size);
  const renderFiles=()=>{
    const q=$('#file-search').value.trim().toLocaleLowerCase(),page=localPage('files:'+version,files.filter(file=>file.path.toLocaleLowerCase().includes(q)));
    $('#file-results').innerHTML=page.items.map(file=>`<button data-file="${escapeHTML(file.path)}" title="${escapeHTML(file.path)}">${escapeHTML(file.path)}</button>`).join('')||'<p class="hint">没有匹配文件</p>';
    mountPagination($('#files-pagination'),'files:'+version,page,renderFiles,{compact:true});
  };
  $('#file-search').oninput=()=>{resetList('files:'+version);renderFiles();};renderFiles();
  if (options.file&&!files.some(file=>file.path===options.file)) {$('#file-title').textContent=options.file;$('#file-content').innerHTML='<div class="alert warning" role="alert">所选版本不包含此文件，请从文件列表选择。</div>';return;}
  await showFile(options.file||files.find(file=>file.path==='SKILL.md')?.path||files[0]?.path, options.line);
}
async function showFile(path, line = 0) {
  if (!path) return;
  const version=state.version, request=view.fileRequest=(view.fileRequest||0)+1;
  document.querySelectorAll('[data-file]').forEach(button=>{button.classList.toggle('active',button.dataset.file===path);button.setAttribute('aria-current',String(button.dataset.file===path));});
  $('#file-title').innerHTML=`<span>${escapeHTML(path)}</span><button class="text-button" data-copy-path aria-label="复制文件路径">复制路径</button>`;
  const copyPath=$('[data-copy-path]');copyPath.onclick=()=>busy(copyPath,()=>copyText(path,'文件路径',copyPath));
  $('#file-content').innerHTML='<div class="loading-state" role="status">正在读取文件…</div>';
  try {
    const file=await api('/versions/'+version+'/file?path='+encodeURIComponent(path));
    if (state.version!==version||view.fileRequest!==request||!$('#file-content')) return;
    mountReader($('#file-content'),file.content,{markdown:/\.md$/i.test(path),line,title:'只读预览'});
  } catch(error) { if (state.version===version&&view.fileRequest===request&&$('#file-content')) {$('#file-content').innerHTML=emptyState('文件暂时无法读取',error.message,'<button data-retry-file>重试</button>');$('[data-retry-file]').onclick=()=>showFile(path,line);} }
}
function taskConclusion(task) {
  const empty='<span class="muted" aria-label="尚无检查结论">—</span>';
  if (task.kind==='repair') return ['ready','published','needs_attention','failed'].includes(task.repair_state)?badge(task.repair_state):empty;
  if (task.delivery_status!=='saved') return empty;
  const conclusion=auditBadge({...task,mode:task.audit_mode,state:null});
  return conclusion+(task.published_version_id?windowLink(versionURL(task.skill_id,task.published_version_id),'已有修复版本','task-resolution'):'');
}
function taskRows(tasks) {
  if (!tasks.length) return emptyState('暂无匹配记录','调整筛选，或到 Skill 库创建审计。','<a class="button" href="#skills">前往 Skill 库</a>');
  return `<div class="table-wrap"><table class="records-table result-table task-table"><caption class="sr-only">任务执行与检查结论</caption><colgroup><col class="task-col-name"><col class="task-col-version"><col class="task-col-kind"><col class="task-col-state"><col class="task-col-verdict"><col class="count-col"><col class="count-col"><col class="task-col-time"><col class="task-col-actions"></colgroup><thead><tr><th scope="col">Skill</th><th scope="col">版本</th><th scope="col">任务</th><th scope="col">执行状态</th><th scope="col">检查结论</th><th scope="col" class="numeric-cell">必修</th><th scope="col" class="numeric-cell">建议</th><th scope="col">创建时间</th><th scope="col">操作</th></tr></thead><tbody>${tasks.map(task=>{
    const taskURL='#task/'+encodeURIComponent(task.id);
    const source=escapeHTML(task.version);
    const published=task.kind==='repair'&&task.published_version_id;
    const versions=published?`<a href="${versionURL(task.skill_id,task.version_id)}" target="_blank" rel="noopener noreferrer" aria-label="源版本 ${source}">${source}</a><span aria-hidden="true"> → </span><a href="${versionURL(task.skill_id,published)}" target="_blank" rel="noopener noreferrer" aria-label="新版本 ${escapeHTML(task.published_version)}">${escapeHTML(task.published_version)}</a>`:source;
    return `<tr>
    <td class="record-title"><a class="skill-name cell-text" target="_blank" rel="noopener noreferrer" href="${taskURL}" title="${escapeHTML(task.skill_name)}">${escapeHTML(task.skill_name)}</a></td>
    <td data-label="版本"><span class="task-version mono" title="${source}${published?' → '+escapeHTML(task.published_version):''}">${versions}</span></td>
    <td data-label="任务">${task.kind==='repair'?'修复':task.audit_mode==='static'?'静态预检':'完整审计'}</td>
    <td data-label="执行状态">${badge(task.state)}</td>
    <td data-label="检查结论">${taskConclusion(task)}</td>
    <td class="numeric-cell${task.kind==='repair'||!task.error_count?' task-card-empty':''}" data-label="必修">${task.kind==='repair'?'<span class="muted">—</span>':issueCount(task,'ERR',task.skill_id,task.id)}</td>
    <td class="numeric-cell${task.kind==='repair'||!task.warning_count?' task-card-empty':''}" data-label="建议">${task.kind==='repair'?'<span class="muted">—</span>':issueCount(task,'WARN',task.skill_id,task.id)}</td>
    <td class="task-card-time" data-label="创建时间"><time title="${escapeHTML(fmtDate(task.created_at))}" datetime="${escapeHTML(task.created_at)}">${escapeHTML(fmtShortDate(task.created_at))}</time></td>
    <td class="record-actions">${actionSlots([
      ['报告',(task.report_available??task.delivery_status==='saved')?windowLink(reportURL(task.id),'报告'):null],
      ['详情',detailButton('task',task.id)],
      ['版本',task.skill_id&&task.version_id?windowLink(versionURL(task.skill_id,published||task.version_id),published?'新版本':'版本'):null],
    ])}</td></tr>`;}).join('')}</tbody></table></div>`;
}
async function taskList() {
  const history=state.taskHistory ||= {filters:{},expanded:false};
  const render=++view.render;
  const request=state.taskHistoryRequest=(state.taskHistoryRequest||0)+1;
  const [page,skills]=await Promise.all([cursorPage('tasks','/task-history',history.filters),api('/skills')]);
  if (!page||request!==state.taskHistoryRequest||render!==view.render||!state.user||location.hash!=='#tasks') return;
  history.fingerprint=JSON.stringify({items:page.items,hasMore:page.hasMore,nextCursor:page.nextCursor,summary:page.summary});
  const filters=history.draft||history.filters, summary=page.summary;
  const options=(items,selected)=>items.map(([value,text])=>`<option value="${escapeHTML(value)}" ${value===(selected||'')?'selected':''}>${escapeHTML(text)}</option>`).join('');
  $('#main').innerHTML=pageHeading('任务中心','','<button data-action="history-refresh">刷新</button>')+`<div class="overview-strip" aria-label="当前筛选范围统计"><div><span>匹配记录</span><strong>${summary.total}</strong></div><div><span>排队 / 执行中</span><strong class="text-primary">${summary.active}</strong></div><div><span>待处理</span><strong class="${summary.attention?'text-warning':''}">${summary.attention}</strong></div><p class="muted">筛选结果统计</p></div><section class="panel"><form id="task-filters" class="history-filters ${history.expanded?'expanded':''}"><label class="history-search"><span class="sr-only">关键词</span><input name="q" type="search" maxlength="120" value="${escapeHTML(filters.q)}" placeholder="搜索 Skill、版本或任务 ID"></label><button type="button" class="mobile-filter-toggle" data-ui="toggle-filters" aria-expanded="${history.expanded}">筛选${['skill_id','state','kind'].some(key=>filters[key])?' · 已设置':''}</button><div class="filter-fields"><label>Skill<select name="skill_id">${options([['','全部 Skill'],...skills.map(skill=>[skill.id,skill.name])],filters.skill_id)}</select></label><label>执行状态<select name="state">${options([['','全部状态'],...['queued','waiting_configuration','running','cancelling','succeeded','failed','cancelled'].map(value=>[value,labels[value]])],filters.state)}</select></label><label>任务类型<select name="kind">${options([['','全部类型'],['audit','审计'],['repair','修复']],filters.kind)}</select></label></div><div class="task-filter-actions"><button type="submit" class="task-query primary">查询</button><button type="button" data-action="history-clear">重置</button></div></form>${taskRows(page.items)}<div id="tasks-pagination"></div></section>`;
  const form=$('#task-filters');
  form.oninput=()=>{history.draft=Object.fromEntries(new FormData(form));};
  form.onsubmit=event=>{
    event.preventDefault();
    busy($('.task-query',form),()=>applyTaskFilters(Object.fromEntries([...new FormData(form)].filter(([,value])=>value))));
  };
  mountPagination($('#tasks-pagination'),'tasks',page,taskList);
}
async function applyTaskFilters(filters, clear=false) {
  const history=state.taskHistory, paging=listState('tasks');
  const previous={page:paging.page,cursor:paging.cursor,previous:paging.previous,nextCursor:paging.nextCursor};
  const applied=history.filters, draft=history.draft;
  history.filters=filters;
  if (clear) history.draft=null;
  resetList('tasks');
  const pending=taskList(), request=paging.request;
  try { await pending; }
  catch (error) {
    if (state.taskHistory===history&&paging.request===request) {
      history.filters=applied;
      if (clear&&!history.draft) history.draft=draft;
      Object.assign(paging,previous);
    }
    throw error;
  }
}
function eventDetails(value) { try {return JSON.stringify(JSON.parse(value),null,2);} catch {return String(value||'');} }
const eventNames={'task.created':'任务已创建','task.claimed':'执行机器已领取','audit.saved':'审计报告已保存','model.failed':'模型请求异常','task.cancelled':'任务已停止','repair.created':'修复已授权','repair.round.saved':'本轮结果已保存','repair.published':'新版本已登记'};
async function taskEvents(task) {
  const key='events:'+task.id, hash=location.hash;
  const page=await cursorPage(key,'/tasks/'+encodeURIComponent(task.id)+'/events');
  if (!page||location.hash!==hash||!$('#task-events')) return;
  state.eventsTask=task;view.records.set('event',page.items);
  let code='model_unavailable';try{code=JSON.parse(task.latest_model_error?.detail_json||'{}').code||code;}catch{}
  const warning=task.latest_model_error?`<div class="alert warning"><strong>最近模型异常</strong><p>${escapeHTML(taskFailure(task,code))}</p></div>`:'';
  $('#task-events').innerHTML=`${warning}<div class="record-tools"><span>从早到晚</span><button data-action="events-refresh">刷新</button></div><div class="table-wrap"><table class="records-table result-table event-table"><thead><tr><th>事件</th><th>时间</th><th>操作</th></tr></thead><tbody>${page.items.map(event=>`<tr><td class="record-title"><span class="cell-text">${escapeHTML(eventNames[event.kind]||event.kind)}</span></td><td data-label="时间">${escapeHTML(fmtShortDate(event.created_at))}</td><td class="record-actions">${actionSlots([['详情',detailButton('event',event.id)]])}</td></tr>`).join('')||'<tr><td colspan="3">暂无执行记录</td></tr>'}</tbody></table></div><div id="events-pagination"></div>`;
  mountPagination($('#events-pagination'),key,page,()=>taskEvents(task));
}

function findingsSection(result, writable) {
  return `<section class="panel" id="findings-panel"><div class="section-title"><div><h2>问题与建议</h2></div><div class="segmented finding-filters" role="group" aria-label="问题类型">${[['all','全部'],['ERR','必修'],['WARN','建议'],['review','待复核']].map(([value,text])=>`<button data-finding-filter="${value}" aria-pressed="${value==='all'}">${text} ${value==='ERR'?result.errorCount:value==='WARN'?result.warningCount:value==='review'?result.findings.filter(item=>item.reviewRequired).length:result.findings.length}</button>`).join('')}</div></div><div class="finding-toolbar"><label><span class="sr-only">搜索问题</span><input id="finding-search" type="search" placeholder="搜索问题、规则或文件" aria-label="搜索问题"></label><span id="finding-match-count" class="muted" aria-live="polite"></span>${writable?'<div class="actions"><button class="text-button" data-finding-select-page>选择本页</button><button class="text-button" data-finding-clear>清空已选</button></div>':''}</div><div id="findings-list"></div><div id="findings-pager" class="finding-pager"></div>${writable?'<div class="selection-bar"><span id="selection-count" aria-live="polite"></span><button class="primary" data-action="repair">修复所选问题</button></div>':''}</section>`;
}
function findingRows() {
  const {audit,result}=state.auditContext;
  return filteredFindings(result.findings,view.findingFilters.get(audit.id)||'all',view.findingQueries.get(audit.id)||'');
}
function findingPage() {
  return localPage('findings:'+state.auditContext.audit.id,findingRows());
}

function findingTable(items, writable, selected) {
  return `<div class="table-wrap"><table class="records-table result-table finding-table ${writable?'has-selection':''}"><caption class="sr-only">问题摘要，完整建议在详情中查看</caption><colgroup>${writable?'<col class="finding-col-check">':''}<col><col class="finding-col-severity"><col class="finding-col-rule"><col class="finding-col-location"><col class="finding-col-action"></colgroup><thead><tr>${writable?'<th scope="col"><span class="sr-only">选择</span></th>':''}<th scope="col">问题</th><th scope="col">级别</th><th scope="col">规则</th><th scope="col">位置</th><th scope="col">操作</th></tr></thead><tbody>${items.map(finding=>`<tr class="finding-row">${writable?`<td class="selection-cell"><label class="selection-target"><input type="checkbox" data-finding="${escapeHTML(finding.id)}" aria-label="选择 ${escapeHTML(finding.ruleId)} ${escapeHTML(finding.file)} 第 ${finding.line} 行" ${finding.reviewRequired?'disabled':selected.has(finding.id)?'checked':''}></label></td>`:''}
    <td class="record-title"><button class="finding-title cell-text" data-finding-detail="${escapeHTML(finding.id)}" title="${escapeHTML(finding.message)}">${escapeHTML(finding.message)}</button></td>
    <td data-label="级别">${badge(finding.reviewRequired?'review_required':finding.severity==='ERR'?'fail':'warning',finding.reviewRequired?'待复核':finding.severity==='ERR'?'必修':'建议')}</td>
    <td data-label="规则"><span class="cell-text mono" title="${escapeHTML(finding.ruleId)}">${escapeHTML(finding.ruleId)}</span></td>
    <td data-label="位置" class="finding-location"><button class="file-location cell-text" data-finding-detail="${escapeHTML(finding.id)}" title="${escapeHTML(finding.file)}:${finding.line}">${escapeHTML(finding.file)}:${finding.line}</button></td>
    <td class="record-actions"><button class="text-button row-primary" data-finding-detail="${escapeHTML(finding.id)}">详情</button></td></tr>`).join('')}</tbody></table></div>`;
}
function renderFindings() {
  const {audit,result,skill}=state.auditContext, selected=view.selections.get(audit.id), filter=view.findingFilters.get(audit.id)||'all', page=findingPage();
  document.querySelectorAll('[data-finding-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.findingFilter===filter)));
  const search=$('#finding-search');search.value=view.findingQueries.get(audit.id)||'';
  search.oninput=event=>{view.findingQueries.set(audit.id,event.target.value);resetList('findings:'+audit.id);renderFindings();};
  $('#finding-match-count').textContent=`匹配 ${page.total} / ${result.findings.length} 项`;
  $('#findings-list').innerHTML=page.items.length?findingTable(page.items,skill.can_write,selected):emptyState('没有匹配的问题','试试其他分类或关键词，已选问题会保留。','<button data-finding-reset>清除筛选</button>');
  mountPagination($('#findings-pager'),'findings:'+audit.id,page,renderFindings);
  updateSelection();
}
function updateSelection() {
  const context=state.auditContext;
  if (!context||!$('#selection-count')) return;
  const count=view.selections.get(context.audit.id)?.size||0;
  $('#selection-count').textContent=count?`已选 ${count} 项`:'选择问题后可修复';
  $('.selection-bar button').disabled=!count;
  const eligible=findingPage().items.filter(item=>!item.reviewRequired);
  $('[data-finding-select-page]').disabled=!eligible.some(item=>!view.selections.get(context.audit.id).has(item.id));
  $('[data-finding-clear]').disabled=!count;
}
async function findingsPreview(button) {
  const hash=location.hash, request=view.render;
  const [audit,skill]=await Promise.all([api('/audits/'+encodeURIComponent(button.dataset.previewAudit)),api('/skills/'+encodeURIComponent(button.dataset.previewSkill))]);
  if (location.hash!==hash||request!==view.render||!state.user) return;
  if (audit.skill_id!==skill.id||!audit.result) throw new Error('此版本的报告尚未保存，请查看任务进展');
  const previous=state.auditContext, context={audit,result:audit.result,skill,task:null};
  state.auditContext=context;
  if (!view.selections.has(audit.id)) view.selections.set(audit.id,new Set(audit.result.findings.filter(item=>item.severity==='ERR'&&!item.reviewRequired).map(item=>item.id)));
  view.findingFilters.set(audit.id,button.dataset.previewFilter||'all');resetList('findings:'+audit.id);
  const panel=openPanel('版本问题',`<div class="preview-summary">${auditBadge({...audit,state:null})}${windowLink(auditURL({id:audit.id,task_id:button.dataset.previewTask,delivery_status:'saved'}),'查看报告','')}</div>${findingsSection(audit.result,skill.can_write)}`,{drawer:true,subtitle:`${skill.name} · ${audit.registered_version} · ${audit.mode==='static'?'静态预检':'完整审计'}`,className:'findings-preview',opener:button});
  panel.addEventListener('close',()=>{if(state.auditContext===context)state.auditContext=previous;},{once:true});
  renderFindings();
}
async function findingDetail(id) {
  const context=state.auditContext, {audit,result,skill}=context, rows=findingRows();
  let index=rows.findIndex(item=>item.id===id);if(index<0)return;
  const version=skill.versions.find(item=>item.id===audit.version_id);
  const panel=openPanel('问题详情','',{drawer:true,subtitle:`${skill.name} · ${version?.version||'固定版本'}`});
  let generation=0;
  async function paint(step) {
    const finding=rows[index], current=++generation;
    $('.dialog-body',panel).innerHTML=`<div class="finding-navigation"><button data-finding-step="-1" ${index?'':'disabled'}>上一条</button><span role="status">${index+1} / ${rows.length}</span><button data-finding-step="1" ${index+1<rows.length?'':'disabled'}>下一条</button></div><div class="finding-heading">${badge(finding.reviewRequired?'review_required':finding.severity==='ERR'?'fail':'warning',finding.reviewRequired?'待复核':finding.severity==='ERR'?'必修':'建议')}<span class="mono">${escapeHTML(finding.ruleId)}</span></div><h3 class="drawer-finding-title">${escapeHTML(finding.message)}</h3><div class="suggestion-block"><h3>修改建议</h3><p>${escapeHTML(finding.suggestion)}</p></div><div class="drawer-section"><h3>如何验证</h3><p>${escapeHTML(finding.verification)}</p></div><div class="drawer-section"><h3>文件证据</h3><p class="mono">${escapeHTML(finding.file)}:${finding.line}</p><div id="finding-evidence" class="evidence-code" role="status">正在加载证据…</div><a class="button" target="_blank" rel="noopener noreferrer" href="${versionURL(skill.id,audit.version_id,{file:finding.file,line:String(finding.line)})}">查看文件</a></div><div class="drawer-footer">${skill.can_write?(finding.reviewRequired?'<p class="hint">此项需先复核，暂不支持自动修复。</p>':`<button class="primary" data-toggle-finding aria-pressed="${view.selections.get(audit.id).has(finding.id)}">${view.selections.get(audit.id).has(finding.id)?'取消选择':'选择此问题'}</button>`):''}<button data-close-panel>返回问题列表</button></div>`;
    panel.querySelectorAll('[data-close-panel],[data-close-drawer]').forEach(button=>button.onclick=()=>panel.close());
    panel.querySelectorAll('[data-finding-step]').forEach(button=>button.onclick=()=>{index+=Number(button.dataset.findingStep);paint(button.dataset.findingStep);});
    if (step) {const target=$(`[data-finding-step="${step}"]`,panel);(target.disabled?$(`[data-finding-step="${-Number(step)}"]`,panel):target).focus({preventScroll:true});panel.scrollTop=0;}
    const choose=$('[data-toggle-finding]',panel);
    if (choose) choose.onclick=()=>{const selected=view.selections.get(audit.id);selected.has(finding.id)?selected.delete(finding.id):selected.add(finding.id);document.querySelectorAll('[data-finding]').forEach(input=>input.checked=selected.has(input.dataset.finding));updateSelection();choose.textContent=selected.has(finding.id)?'取消选择':'选择此问题';choose.setAttribute('aria-pressed',String(selected.has(finding.id)));};
    try {
      const file=await api('/versions/'+audit.version_id+'/file?path='+encodeURIComponent(finding.file));
      if (!panel.isConnected||!panel.open||generation!==current) return;
      const lines=file.content.split('\n'),number=Math.max(1,Number(finding.line)||1),start=Math.max(1,number-4),end=Math.min(lines.length,number+5);
      $('#finding-evidence',panel).innerHTML=sourceLines(lines.slice(start-1,end).join('\n'),number,start);
    } catch(error) {if (panel.isConnected&&generation===current)$('#finding-evidence',panel).textContent='证据暂不可读：'+error.message;}
  }
  await paint();
}
async function taskDetail(id) {
  const hash=location.hash, request=++view.render;
  const task=await api('/tasks/'+encodeURIComponent(id));
  if (request!==view.render||location.hash!==hash) return;
  state.taskPending=!['succeeded','failed','cancelled'].includes(task.state);
  state.taskFingerprint=JSON.stringify(task);
  if (task.kind==='repair') return repairTaskDetail(task,hash);
  const [audit,skill]=await Promise.all([api('/audits/'+task.audit_run_id),api('/skills/'+task.manifest.skillId)]);
  if (request!==view.render||location.hash!==hash) return;
  const result=audit.result, writable=skill.can_write;
  state.auditContext={audit,result,skill,task};
  if (result&&!view.selections.has(audit.id)) view.selections.set(audit.id,new Set(result.findings.filter(finding=>finding.severity==='ERR'&&!finding.reviewRequired).map(finding=>finding.id)));
  const conclusion=result?auditConclusion(audit):{tone:task.state,text:labels[task.state]||'等待执行'};
  const modelAction=state.user.role==='admin'?'<a class="button primary" href="#settings?tab=model">前往配置模型</a>':'';
  const waitingModel=modelAction?'配置并检测模型后，任务会自动继续。':'请联系管理员配置并检测模型。完成后任务会自动继续。';
  const delivery={saved:'已保存',pending:'待生成',failed:'未生成'}[audit.delivery_status]||labels[audit.delivery_status]||audit.delivery_status;
  $('#main').innerHTML=`<div class="crumb"><a href="#tasks">任务中心</a><span>/</span><a href="${versionURL(skill.id,audit.version_id)}">${escapeHTML(skill.name)}</a><span>/</span>审计详情</div>`+pageHeading(skill.name,`${task.manifest.registeredVersion} · ${task.manifest.depth} · ${task.manifest.mode==='static'?'静态预检':'完整审计'}`,`<button data-action="refresh">刷新</button>${writable&&state.taskPending?`<button class="danger-button" data-cancel-task="${id}">停止任务</button>`:''}${result?`<a class="button" href="/api/audits/${audit.id}/report">下载报告</a>`:''}`)+`<section class="result-banner ${statusTone(conclusion.tone)}"><div><p class="eyebrow">${task.manifest.mode==='static'?'静态预检':'本次审计'}</p><h2>${escapeHTML(conclusion.text)}</h2><p>${result?`${result.errorCount} 个必修项 · ${result.warningCount} 个建议项${result.reviewRequired?' · 检查或证据待补齐':''}`:task.state==='waiting_configuration'?waitingModel:task.state==='cancelled'?'任务已停止，尚未生成报告。':task.state==='failed'?'任务执行失败，请查看下方提示。':'任务完成后显示结果。'}</p>${task.state==='waiting_configuration'?modelAction:''}<div class="result-meta">${badge(task.state,'执行：'+(labels[task.state]||task.state))}${badge(audit.delivery_status,'报告：'+delivery)}${task.manifest.mode==='static'?'<span class="badge neutral">静态预检不能替代完整审计</span>':''}</div></div>${result?`<div class="score"><strong>${result.score}</strong><span>/ ${result.maxScore}</span><small>规则得分</small></div>`:''}</section>${task.failure_code?`<div class="alert danger" role="alert">${escapeHTML(taskFailure(task))}</div>`:''}${result?findingsSection(result,writable):''}${result?'<section class="panel report-panel" tabindex="-1"><div class="section-title"><div><h2>审计报告</h2></div><div class="actions"><button data-ui="download-result">下载 JSON</button><button data-ui="copy-repair">复制修复提示</button></div></div><div id="audit-report-reader"></div></section>':''}<details class="panel evidence-panel"><summary>证据与诊断<span class="muted">版本摘要、规则、执行记录</span></summary><div class="card-body"><dl class="facts facts-grid"><div><dt>版本 ID</dt><dd class="mono">${audit.version_id}</dd></div><div><dt>规则版本</dt><dd>${escapeHTML(task.manifest.ruleVersion)}</dd></div><div><dt>内容 SHA-256</dt><dd class="mono">${task.manifest.contentDigest}</dd></div>${result?`<div><dt>报告 SHA-256</dt><dd class="mono">${result.reportDigest}</dd></div>`:''}</dl><h3 class="subheading">执行尝试</h3><div id="task-attempts"></div><h3 class="subheading">执行记录</h3><div id="task-events"></div></div></details>`;
  if (result) {renderFindings();mountReader($('#audit-report-reader'),result.reportMarkdown,{title:'报告原文',rawId:'report-source'});}
  objectTable($('#task-attempts'),'attempts:'+task.id,task.attempts.map(item=>({...item,id:String(item.generation)})),[{name:'次数',value:item=>'第 '+item.generation+' 次'},{name:'状态',html:item=>badge(item.state)}],'attempt');
  await taskEvents(task);
}
async function openAudit(opener=document.activeElement) {
  const skill=state.detail, version=state.version, current=skill.versions.find(item=>item.id===version);
  const dialog=openPanel('创建审计',`<form id="audit-create"><div class="context-chip">${escapeHTML(skill.name)}<span class="version-tag">${escapeHTML(current.version)}</span></div><label>审计深度<select name="depth"><option value="L1">L1 · 包内质量检查</option><option value="L2">L2 · 含发布与外部依赖检查</option></select></label><label>审计方式<select name="mode"><option value="full">完整审计 · 使用模型</option><option value="static">静态预检 · 无需模型</option></select></label><div id="audit-mode-hint" class="info-line" role="status">需先配置并检测模型，未配置时任务会等待。原版本不变。</div><p class="error" role="alert"></p><div class="dialog-foot"><button type="button" data-dismiss>取消</button><button type="submit" class="primary">创建任务</button></div></form>`,{opener});
  $('[data-dismiss]',dialog).onclick=()=>dialog.close();
  $('[name=mode]',dialog).onchange=event=>$('#audit-mode-hint',dialog).textContent=event.target.value==='static'?'仅做静态检查，完整结论需后续审计。原版本不变。':'需先配置并检测模型，未配置时任务会等待。原版本不变。';
  const key=crypto.randomUUID();
  $('form',dialog).onsubmit=event=>{event.preventDefault();busy($('button[type=submit]',dialog),async()=>{try {const data=Object.fromEntries(new FormData(event.target));const created=await api('/audits',{method:'POST',body:{...data,version_id:version,idempotency_key:key}});dialog.close();location.hash='#task/'+created.task_id;}catch(error){formError($('form',dialog),error);}});};
}
async function openRepair() {
  const {audit,result,skill}=state.auditContext;
  const selected=[...(view.selections.get(audit.id)||[])];
  if (!selected.length) return notice('先选择需要修复的问题');
  const files=[...new Set(result.findings.filter(finding=>selected.includes(finding.id)).map(finding=>finding.file))];
  const original=skill.versions.find(item=>item.id===audit.version_id).version;
  const increment=value=>value.replace(/(\d+)$/,number=>(BigInt(number)+1n).toString());
  let next=increment(original); if (next===original) next=original+'.repair1';
  while (skill.versions.some(item=>item.version===next)) next=increment(next);
  const dialog=openPanel('授权修复',`<form><div class="context-chip">${escapeHTML(skill.name)}<span class="version-tag">${escapeHTML(original)}</span></div><fieldset><legend>修复范围</legend><p><strong>${selected.length}</strong> 个已选问题 · 只修改候选副本</p><details class="repair-files" ${files.length<=5?'open':''}><summary>涉及 ${files.length} 个文件</summary><p class="path-list">${files.map(escapeHTML).join('、')}</p></details></fieldset><fieldset><legend>输出版本</legend><label>新版本<input name="target_version" pattern="[A-Za-z0-9](?:[A-Za-z0-9._+]|-){0,79}" value="${escapeHTML(next)}" required maxlength="80"></label></fieldset><fieldset><legend>复审通过后</legend><label class="check-row"><input type="checkbox" name="publish_after_review" checked>登记新版本</label><label class="check-row"><input type="checkbox" name="make_current">同时设为当前版本</label><p class="hint">保留原版本，默认不切换当前版本。</p></fieldset><details class="advanced-settings"><summary>更多设置</summary><label>最多修复轮数<select name="max_rounds"><option value="3">3 轮</option><option value="2">2 轮</option><option value="1">1 轮</option></select></label><label>额外允许修改的文件<textarea name="allowed_paths" rows="3" placeholder="可留空；每行一个包内相对路径"></textarea></label></details><p class="info-line">每轮独立复审。发现范围不清、额外问题或达到上限时暂停，未选问题不自动修复。</p><p class="error" role="alert"></p><div class="dialog-foot"><button type="button" data-dismiss>取消</button><button type="submit" class="primary">授权修复</button></div></form>`,{});
  $('[data-dismiss]',dialog).onclick=()=>dialog.close();
  $('[name=publish_after_review]',dialog).onchange=event=>{const field=$('[name=make_current]',dialog);field.disabled=!event.target.checked;if(field.disabled)field.checked=false;};
  const key=crypto.randomUUID();
  $('form',dialog).onsubmit=event=>{event.preventDefault();busy($('button[type=submit]',dialog),async()=>{try {const form=new FormData(event.target);const created=await api('/repairs',{method:'POST',body:{audit_run_id:audit.id,selected_ids:selected,target_version:form.get('target_version').trim(),allowed_paths:form.get('allowed_paths').split('\n').map(path=>path.trim()).filter(Boolean),max_rounds:Number(form.get('max_rounds')),publish_after_review:form.has('publish_after_review'),make_current:form.has('make_current'),idempotency_key:key}});dialog.close();location.hash='#task/'+created.task_id;}catch(error){formError($('form',dialog),error);}});};
}

async function repairTaskDetail(task,hash) {
  const request=view.render;
  const [repair,skill]=await Promise.all([api('/repairs/'+task.repair_run_id),api('/skills/'+task.manifest.skillId)]);
  if (request!==view.render||location.hash!==hash) return;
  const last=repair.rounds.at(-1), review=last?.review;
  const reportRound=repair.rounds.findLast(round=>round.review?.reportMarkdown);
  state.repairContext={repair,skill,task};
  $('#main').innerHTML=`<div class="crumb"><a href="#tasks">任务中心</a><span>/</span><a href="${versionURL(skill.id,task.version_id)}">${escapeHTML(skill.name)}</a><span>/</span>修复详情</div>`+pageHeading(skill.name,`${task.manifest.registeredVersion} → ${repair.target_version} · ${repair.round}/${repair.max_rounds} 轮`,`<button data-action="refresh">刷新</button>${skill.can_write&&state.taskPending?`<button class="danger-button" data-cancel-task="${task.id}">停止任务</button>`:''}${repair.published_version_id?`<a class="button primary" href="/api/versions/${repair.published_version_id}/download">下载新版本</a>`:last?`<a class="button" href="/api/repairs/${repair.id}/candidate">下载候选</a>`:''}${skill.can_write&&repair.state==='ready'?`<button class="primary" data-publish-repair="${repair.id}">登记新版本</button>`:''}`)+`<section class="result-banner ${statusTone(repair.state)}"><div><p class="eyebrow">修复与复审</p><h2>${label(repair.state)}</h2><p>${repair.state==='published'?'新版本与报告已保存，原版本保留。':repair.state==='ready'?'候选已通过复审，可登记为新版本。':repair.state==='needs_attention'?'请处理下方问题，候选尚未登记。':task.state==='cancelled'?'任务已停止，原版本不变。':repair.state==='failed'||task.state==='failed'?'修复未完成，请查看下方提示。':'正在按授权范围修复并复审。'}</p><div class="result-meta">${badge(task.state,'执行：'+(labels[task.state]||task.state))}${badge(review?.verdict||'neutral','独立复审：'+(labels[review?.verdict]||'尚未完成'))}${review?badge(review.scopeSatisfied?'pass':'review_required','范围复核：'+(review.scopeSatisfied?'通过':'待处理')):''}</div></div>${review?`<div class="score"><strong>${review.score}</strong><span>/ ${review.maxScore}</span><small>${review.errorCount} 个必修项</small></div>`:''}</section>${repair.failure_code||task.failure_code?`<div class="alert danger" role="alert">${escapeHTML(taskFailure(task,repair.failure_code||task.failure_code))}</div>`:''}<div class="process-strip" aria-label="修复阶段">${[['生成候选','editing'],['独立复审','reauditing'],['范围核对','ready'],['登记版本','published']].map(([text,value])=>`<span ${repair.state===value?'aria-current="step"':''}>${text}</span>`).join('<span class="process-divider" aria-hidden="true">→</span>')}</div><section class="panel"><div class="section-title"><div><h2>修复记录</h2><p class="muted">展开文件查看修改。</p></div>${reportRound?`<a href="/api/repairs/${repair.id}/report">下载复审报告</a>`:''}</div><div class="card-body"><div id="repair-rounds"></div></div></section><section class="panel"><div class="section-title"><h2>剩余问题与复审意见</h2></div><div class="card-body">${review?.scopeReason?`<p class="info-line">${escapeHTML(review.scopeReason)}</p>`:''}<div id="remaining-findings"></div></div></section>${reportRound?`<section class="panel report-panel" tabindex="-1"><div class="section-title"><h2>第 ${reportRound.round_number} 轮独立复审报告</h2></div><div id="repair-report-reader"></div></section>`:''}<details class="panel evidence-panel"><summary>授权范围与执行记录<span class="muted">所选问题、文件范围及固定摘要</span></summary><div class="card-body"><p>仅修复 ${repair.authorization.selectedIds.length} 个所选问题，最多 ${repair.max_rounds} 轮。</p><p class="info-line">${repair.authorization.publishAfterReview?'复审通过后登记新版本':'仅生成候选'}；${repair.authorization.makeCurrent?'登记后设为当前版本':'不切换当前版本'}</p><dl class="facts facts-grid"><div><dt>允许编辑</dt><dd>${repair.authorization.editPaths.map(escapeHTML).join('、')}</dd></div><div><dt>原包内容 SHA-256</dt><dd class="mono">${task.manifest.contentDigest}</dd></div><div><dt>当前候选 SHA-256</dt><dd class="mono">${repair.candidate_digest||'—'}</dd></div></dl><h3 class="subheading">执行记录</h3><div id="task-events"></div></div></details>`;
  if (reportRound) mountReader($('#repair-report-reader'),reportRound.review.reportMarkdown,{title:'复审报告原文'});
  const rounds=repair.rounds.map(round=>({...round,id:repair.id+':'+round.round_number,diff:round.diff.map((change,index)=>({...change,id:repair.id+':'+round.round_number+':'+index}))}));
  view.records.set('diff',rounds.flatMap(round=>round.diff));
  objectTable($('#repair-rounds'),'rounds:'+repair.id,rounds,[{name:'轮次',value:item=>'第 '+item.round_number+' 轮'},{name:'复审结论',html:item=>badge(item.review?.verdict||'review_required')},{name:'文件数',value:item=>item.diff.length}],'round');
  objectTable($('#remaining-findings'),'review:'+repair.id,(review?.findings||[]).map((item,index)=>({...item,id:repair.id+':finding:'+index})),[{name:'问题',value:item=>item.message},{name:'级别',html:item=>badge(item.reviewRequired?'review_required':item.severity==='ERR'?'fail':'warning',item.reviewRequired?'待复核':item.severity==='ERR'?'必修':'建议')},{name:'位置',value:item=>item.file+':'+item.line}],'review');
  await taskEvents(task);
}
async function pollWorkspace() {
  if (!state.user||document.visibilityState!=='visible'||view.pollBusy) return;
  const hash=location.hash;
  if (hash!=='#tasks'&&!hash.startsWith('#task/')) return;
  view.pollBusy=true;
  try {
    let changed=false;
    if (hash==='#tasks'&&state.taskHistory) {
      const paging=listState('tasks'), params=new URLSearchParams({...state.taskHistory.filters,limit:String(paging.size)});
      if (paging.cursor) params.set('cursor',paging.cursor);
      const page=await api('/task-history?'+params);
      changed=JSON.stringify(page)!==state.taskHistory.fingerprint;
    } else if (state.taskPending) {
      const task=await api('/tasks/'+encodeURIComponent(decodeURIComponent(hash.slice(6).split('?')[0])));
      changed=JSON.stringify(task)!==state.taskFingerprint;
    }
    // Polling never replaces DOM, focus, selection, scroll or an open dialog.
    if (location.hash===hash&&$('#live-update')) {const banner=$('#live-update');if(changed){$('span',banner).textContent='有新进展';$('button',banner).textContent='刷新';banner.hidden=false;}else if(banner.dataset.connectionError){banner.hidden=true;}delete banner.dataset.connectionError;}
  } catch { if(location.hash===hash&&$('#live-update')) {const banner=$('#live-update');banner.dataset.connectionError='true';$('span',banner).textContent='连接中断，当前记录已保留。';$('button',banner).textContent='重试连接';banner.hidden=false;} }
  finally {view.pollBusy=false;}
}

document.addEventListener('change',event=>{
  const input=event.target;
  if (input.matches('[data-finding]')&&state.auditContext) {
    const selected=view.selections.get(state.auditContext.audit.id);
    input.checked?selected.add(input.dataset.finding):selected.delete(input.dataset.finding);
    updateSelection();
  }
});
document.addEventListener('click',event=>{
  const target=event.target.closest('button');
  if (!target) return;
  if (target.dataset.libraryStatus!==undefined) {view.library.verdict=target.dataset.libraryStatus;resetList('library');$('#library-verdict').value=view.library.verdict;renderRows();}
  if (target.dataset.previewAudit) busy(target,()=>findingsPreview(target));
  if (target.hasAttribute('data-finding-select-page')) {selectFindings(view.selections.get(state.auditContext.audit.id),findingPage().items);renderFindings();}
  if (target.hasAttribute('data-finding-clear')) {view.selections.get(state.auditContext.audit.id).clear();renderFindings();}
  if (target.hasAttribute('data-finding-reset')) {const id=state.auditContext.audit.id;view.findingFilters.set(id,'all');view.findingQueries.set(id,'');view.findingPages.set(id,0);renderFindings();}
  if (target.dataset.detailTab) detailTab(target.dataset.detailTab).catch(error=>notice(error.message));
  if (target.dataset.findingFilter) {view.findingFilters.set(state.auditContext.audit.id,target.dataset.findingFilter);resetList('findings:'+state.auditContext.audit.id);renderFindings();}
  if (target.dataset.findingDetail) findingDetail(target.dataset.findingDetail).catch(error=>notice(error.message));
  if (target.dataset.auditSkill) busy(target,async()=>{if(view.openingAudit)return;view.openingAudit=true;const hash=location.hash;try{const skill=await api('/skills/'+target.dataset.auditSkill);if(location.hash!==hash||!state.user)return;state.detail=skill;state.version=target.dataset.versionId;await openAudit(target);}finally{view.openingAudit=false;}});
  const action=target.dataset.ui;
  if (action==='retry-route') busy(target,route);
  if (action==='library-clear') {view.library={q:'',mine:false,verdict:''};resetList('library');library().catch(error=>notice(error.message));}
  if (action==='library-refresh') busy(target,library);
  if (action==='apply-update') busy(target,async()=>{if($('#live-update')?.dataset.connectionError){await pollWorkspace();return;}const scroll=window.scrollY;await route();window.scrollTo(0,scroll);});
  if (action==='toggle-filters') {const history=state.taskHistory;history.expanded=!history.expanded;$('#task-filters').classList.toggle('expanded',history.expanded);target.setAttribute('aria-expanded',String(history.expanded));}
  if (action==='edit-owner') busy(target,async()=>{
    const users=await api('/users'), skill=state.detail;
    const panel=openPanel('调整维护者',`<form><p class="hint">维护者与管理员可更新此 Skill。</p><label>维护者<select id="owner-select" aria-label="调整维护者">${users.filter(user=>user.active).map(user=>`<option value="${user.id}" ${user.id===skill.owner_id?'selected':''}>${escapeHTML(user.username)}</option>`).join('')}</select></label><p class="error" role="alert"></p><div class="dialog-foot"><button type="button" data-dismiss>取消</button><button type="submit" class="primary">保存</button></div></form>`,{opener:target});
    $('[data-dismiss]',panel).onclick=()=>panel.close();
    $('form',panel).onsubmit=event=>{event.preventDefault();busy($('button[type=submit]',panel),async()=>{try {await api('/skills/'+skill.id+'/owner',{method:'PUT',body:{owner_id:$('#owner-select',panel).value}});panel.close();await detail(skill.id,state.version);notice('维护者已更新');}catch(error){formError($('form',panel),error);}});};
  });
  if (action==='copy-repair') busy(target,async()=>{await copyText(state.auditContext.result.repairPrompt,'修复提示',target);});
  if (action==='download-result') {
    const {audit,result}=state.auditContext;
    const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='audit-'+audit.id+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
});

async function auditReportDetail(id) {
  const hash=location.hash, request=++view.render;
  const audit=await api('/audits/'+encodeURIComponent(id));
  const skill=await api('/skills/'+audit.skill_id);
  if (request!==view.render||location.hash!==hash) return;
  const result=audit.result, conclusion=auditConclusion(audit);
  state.taskPending=false;state.auditContext={audit,result,skill,task:null};
  if (result&&!view.selections.has(id)) view.selections.set(id,new Set(result.findings.filter(item=>item.severity==='ERR'&&!item.reviewRequired).map(item=>item.id)));
  $('#main').innerHTML=`<div class="crumb"><a href="${versionURL(skill.id,audit.version_id)}">${escapeHTML(skill.name)}</a><span>/</span>版本审计报告</div>`+pageHeading(skill.name,`${audit.registered_version} · ${audit.depth} · ${auditKind(audit)}`,`<a class="button" href="/api/audits/${audit.id}/report">下载报告</a>`)+`<section class="result-banner ${statusTone(conclusion.tone)}"><div><h2>${escapeHTML(conclusion.text)}</h2><p>${result?`${result.errorCount} 个必修项 · ${result.warningCount} 个建议项${result.reviewRequired?' · 必要检查尚未完成':''}`:'报告尚未保存。'}</p>${audit.mode==='static'?'<p class="info-line">静态预检不能替代完整审计。</p>':''}</div>${result?`<div class="score"><strong>${result.score}</strong><span>/ ${result.maxScore}</span><small>以最终结论为准</small></div>`:''}</section>${result?findingsSection(result,skill.can_write)+'<section class="panel report-panel" tabindex="-1"><div class="section-title"><h2>审计报告</h2></div><div id="version-report-reader"></div></section>':''}`;
  if (result) {renderFindings();mountReader($('#version-report-reader'),result.reportMarkdown,{title:'报告原文'});}
}
