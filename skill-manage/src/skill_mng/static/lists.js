'use strict';

const PAGE_SIZES = [20,30,50,100];
function listState(key) {
  if (!view.lists.has(key)) view.lists.set(key,{page:0,size:20,cursor:null,previous:[],nextCursor:null,request:0});
  return view.lists.get(key);
}
function resetList(key) {
  const value=listState(key);
  Object.assign(value,{page:0,cursor:null,previous:[],nextCursor:null,request:value.request+1});
  return value;
}
function localPage(key, rows) {
  const value=listState(key);
  if (!PAGE_SIZES.includes(value.size)) value.size=20;
  const pages=Math.max(1,Math.ceil(rows.length/value.size));
  value.page=Math.max(0,Math.min(value.page,pages-1));
  return {items:rows.slice(value.page*value.size,(value.page+1)*value.size),page:value.page,size:value.size,total:rows.length,pages,hasMore:value.page+1<pages};
}
async function cursorPage(key, path, filters={}) {
  const value=listState(key), request=++value.request;
  const query=new URLSearchParams({...filters,limit:String(value.size)});
  if (value.cursor) query.set('cursor',value.cursor);
  const result=await api(path+'?'+query);
  if (view.lists.get(key)!==value||request!==value.request) return null;
  value.nextCursor=result.nextCursor;
  return {...result,page:value.page,size:value.size,total:result.summary?.total,cursorMode:true};
}
function paginationHTML(key, page, compact=false) {
  const id=escapeHTML(key);
  const total=page.total==null?`本页 ${page.items.length} 条`:`共 ${page.total} 条`;
  if (compact&&page.pages===1) return `<p class="compact-page-count" role="status">${total}</p>`;
  return `<nav class="pagination${compact?' compact-pagination':''}" aria-label="分页" data-pagination="${id}"><span class="page-total">${total}</span>${compact?'':`<label>每页<select data-page-size aria-label="每页条数">${PAGE_SIZES.map(size=>`<option value="${size}" ${size===page.size?'selected':''}>${size}</option>`).join('')}</select></label>`}<button type="button" data-page-step="-1" aria-label="上一页" ${page.page?'':'disabled'}>${compact?'‹':'上一页'}</button><span class="page-number" aria-live="polite" tabindex="-1">${page.page+1}${page.pages?` / ${page.pages}`:''}</span><button type="button" data-page-step="1" aria-label="下一页" ${page.hasMore?'':'disabled'}>${compact?'›':'下一页'}</button></nav>`;
}
function mountPagination(host, key, page, render, {compact=false}={}) {
  if (!host) return;
  host.innerHTML=paginationHTML(key,page,compact);
  const value=listState(key);
  async function change(size, step, control) {
    if (value.busy) return;
    const restoreFocus=document.activeElement===control;
    const previous={page:value.page,size:value.size,cursor:value.cursor,previous:[...value.previous],nextCursor:value.nextCursor};
    value.busy=true;
    host.querySelectorAll('button,select').forEach(control=>control.disabled=true);
    if (size) {value.size=size;resetList(key);}
    else if (page.cursorMode) {
      if (step>0) {value.previous.push(value.cursor);value.cursor=value.nextCursor;value.page++;}
      else {value.cursor=value.previous.pop()??null;value.page=Math.max(0,value.page-1);}
    } else value.page+=step;
    let operationRequest=value.request;
    try {const pending=render();operationRequest=value.request;await pending;}
    catch (error) {
      if (view.lists.get(key)===value&&value.request===operationRequest) {
        Object.assign(value,previous);
        if(host.isConnected){mountPagination(host,key,page,render,{compact});notice(error.message);}
      }
    } finally {
      value.busy=false;
      if (restoreFocus&&document.activeElement===document.body&&view.lists.get(key)===value) {
        const pager=document.querySelector(`[data-pagination="${CSS.escape(key)}"]`);
        const target=pager?.querySelector(size?'[data-page-size]':`[data-page-step="${step}"]:enabled`)||pager?.querySelector('.page-number');
        target?.focus({preventScroll:true});
      }
    }
  }
  const sizeSelect=$('[data-page-size]',host);
  if (sizeSelect) sizeSelect.onchange=event=>change(Number(event.target.value),0,sizeSelect);
  host.querySelectorAll('[data-page-step]').forEach(button=>button.onclick=()=>change(0,Number(button.dataset.pageStep),button));
}
function actionSlots(slots) {
  return `<div class="row-actions" data-action-count="${slots.length}">${slots.map(([name,html])=>`<span class="action-slot" data-action-slot="${escapeHTML(name)}">${html||`<span class="row-primary action-unavailable" aria-disabled="true" aria-label="${escapeHTML(name)}不可用">-</span>`}</span>`).join('')}</div>`;
}
function windowLink(url, text, className='row-primary') {
  return `<a class="${className}" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(text)}</a>`;
}
function detailButton(kind, id, version='') {
  return `<button type="button" class="text-button row-primary" data-record-detail="${kind}" data-record-id="${escapeHTML(id)}" ${version?`data-record-version="${escapeHTML(version)}"`:''}>详情</button>`;
}
function factsHTML(rows) {
  return `<dl class="facts drawer-facts">${rows.map(([title,value])=>`<div><dt>${escapeHTML(title)}</dt><dd>${escapeHTML(value??'—')}</dd></div>`).join('')}</dl>`;
}
function objectTable(host,key,records,columns,kind,{store=true}={}) {
  if (store) view.records.set(kind,records);
  const page=localPage(key,records);
  host.innerHTML=`<div class="table-wrap"><table class="records-table result-table object-table"><thead><tr>${columns.map(column=>`<th>${escapeHTML(column.name)}</th>`).join('')}<th>操作</th></tr></thead><tbody>${page.items.map(record=>`<tr>${columns.map((column,index)=>`<td ${index?'data-label="'+escapeHTML(column.name)+'"':'class="record-title"'}>${column.html?column.html(record):`<span class="cell-text" title="${escapeHTML(column.value(record))}">${escapeHTML(column.value(record))}</span>`}</td>`).join('')}<td class="record-actions">${actionSlots([['详情',detailButton(kind,record.id)]])}</td></tr>`).join('')||`<tr><td colspan="${columns.length+1}">暂无记录</td></tr>`}</tbody></table></div><div data-object-pagination></div>`;
  mountPagination($('[data-object-pagination]',host),key,page,()=>objectTable(host,key,records,columns,kind,{store}));
}
function renderDiffFiles(host,round) {
  objectTable(host,'diffs:'+round.id,round.diff,[{name:'文件',value:record=>record.path},{name:'变更',value:record=>({added:'新增',modified:'修改',deleted:'删除'}[record.kind]||record.kind)}],'diff',{store:false});
}
async function recordDetail(button) {
  const kind=button.dataset.recordDetail, id=button.dataset.recordId, user=state.user;
  const panel=openPanel('详情','<div class="loading-state" role="status">正在加载…</div>',{drawer:true,className:'record-drawer',opener:button});
  const body=$('.dialog-body',panel);
  async function load() {
    try {
      let title,content;
      if (kind==='skill') {
        const skill=await api('/skills/'+encodeURIComponent(id));
        const version=skill.versions.find(item=>item.id===(button.dataset.recordVersion||skill.current_version_id));
        if (!version) throw new Error('所选版本不存在，请刷新列表');
        title=skill.name;
        content=`${skill.description?`<p class="record-description">${escapeHTML(skill.description)}</p>`:''}<div class="record-summary">${auditBadge(version.latest_audit)}</div>${factsHTML([['版本',version.version],['使用状态',version.id===skill.current_version_id?'当前版本':'历史版本'],['维护者',skill.owner],['登记时间',fmtDate(version.created_at)],['原包大小',(version.byte_size/1024).toFixed(1)+' KiB']])}<div class="drawer-footer">${windowLink(versionURL(skill.id,version.id),'打开完整页面','button')}<a class="button" href="/api/versions/${version.id}/download">下载原包</a></div>`;
      } else if (kind==='task') {
        const task=await api('/tasks/'+encodeURIComponent(id));
        title=task.kind==='repair'?'修复详情':'审计详情';
        content=factsHTML([['任务 ID',task.id],['版本',task.manifest.registeredVersion],['任务类型',task.kind==='repair'?'修复':auditKind(task.manifest)],['执行状态',labels[task.state]||task.state],['创建时间',fmtDate(task.created_at)],['完成时间',task.finished_at?fmtDate(task.finished_at):'—']])+`${task.failure_code?`<div class="alert danger">${escapeHTML(taskFailure(task))}</div>`:''}<div class="drawer-footer">${windowLink('#task/'+task.id,'打开完整页面','button')}</div>`;
      } else {
        const record=(view.records.get(kind)||[]).find(item=>String(item.id)===id);
        if (!record) throw new Error('记录已更新，请刷新列表');
        if (kind==='event') {title='执行记录';content=factsHTML([['事件',eventNames[record.kind]||record.kind],['时间',fmtDate(record.created_at)]])+`<pre class="code">${escapeHTML(eventDetails(record.detail_json))}</pre>`;}
        if (kind==='user') {title='成员详情';content=factsHTML([['账号',record.username],['角色',record.role==='admin'?'管理员':'维护者'],['状态',record.active?'可用':'已停用'],['创建时间',fmtDate(record.created_at)]]);}
        if (kind==='worker') {title='机器详情';content=factsHTML([['机器',record.name],['状态',labels[record.state]||record.state],['最后连接',record.last_seen_at?fmtDate(record.last_seen_at):'—'],['接入时间',fmtDate(record.created_at)]]);}
        if (kind==='enrollment') {title='接入码记录';content=factsHTML([['记录 ID',record.id],['状态',enrollmentStatus(record)],['创建时间',fmtDate(record.created_at)],['到期时间',fmtDate(new Date(record.expires_at*1000))],['使用时间',record.consumed_at?fmtDate(record.consumed_at):'—']]);}
        if (kind==='attempt') {title='执行尝试';content=factsHTML([['轮次',record.generation],['状态',labels[record.state]||record.state],['执行机器',record.worker_id],['错误代码',record.error_code||'—']]);}
        if (kind==='review') {title='复审问题';content=factsHTML([['规则',record.ruleId],['文件',record.file+':'+record.line],['问题',record.message],['建议',record.suggestion],['验证方法',record.verification]]);}
        if (kind==='round') {title='第 '+record.round_number+' 轮';content=`${factsHTML([['复审结论',labels[record.review?.verdict]||'待复核'],['文件数',record.diff.length]])}<div data-round-files></div>`;}
        if (kind==='diff') {title=record.path;content=`<pre class="diff-code">${String(record.diff||record.patch||'').split('\n').map(line=>`<span class="${line.startsWith('+')&&!line.startsWith('+++')?'diff-add':line.startsWith('-')&&!line.startsWith('---')?'diff-remove':''}">${escapeHTML(line)||' '}</span>`).join('\n')}</pre>`;}
      }
      if (!panel.open||!panel.isConnected||state.user!==user) return;
      $('h2',panel).textContent=title;
      body.innerHTML=content;
      if (kind==='round') renderDiffFiles($('[data-round-files]',body),(view.records.get('round')||[]).find(record=>record.id===id));
    } catch(error) {
      if (!panel.open||!panel.isConnected||state.user!==user) return;
      body.innerHTML=emptyState('暂时无法读取',error.message,'<button data-retry-detail>重试</button>');
      $('[data-retry-detail]',panel).onclick=load;
    }
  }
  await load();
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-record-detail]');
  if (button) recordDetail(button).catch(error=>notice(error.message));
});
