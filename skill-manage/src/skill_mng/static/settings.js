'use strict';

async function settings() {
  const token=++view.render, admin=state.user.role==='admin';
  const [system,model]=await Promise.all([api('/system'),admin?api('/model'):Promise.resolve(null)]);
  if (token!==view.render||location.hash!=='#settings') return;
  const tabs=admin?[['model','模型服务'],['workers','执行机器'],['members','成员管理'],['runtime','运行信息']]:[['runtime','运行信息']];
  const selected=tabs.some(([value])=>value===view.settingsTab)?view.settingsTab:tabs[0][0];
  view.settingsTab=selected;
  $('#main').innerHTML=pageHeading('设置','按需要配置，每项独立保存。')+`<div class="settings-layout"><nav class="settings-nav" role="tablist" aria-label="设置分类">${tabs.map(([value,text])=>`<button id="setting-tab-${value}" data-setting-tab="${value}" role="tab" aria-controls="settings-content" aria-selected="${selected===value}" tabindex="${selected===value?'0':'-1'}">${text}</button>`).join('')}</nav><section id="settings-content" class="panel" role="tabpanel" aria-labelledby="setting-tab-${selected}"></section></div>`;
  const host=$('#settings-content');
  if (selected==='runtime') {
    host.innerHTML=`<div class="section-title"><div><h2>运行信息</h2><p class="muted">当前工作台的服务与存储状态。</p></div>${badge('online','服务在线')}</div><div class="card-body">${[['程序版本',system.version],['存储方式',system.storage],['执行机器',system.worker],['审计能力',system.audit],['自动修复',system.repair]].map(([name,value])=>`<div class="settings-row"><span>${name}</span><strong>${escapeHTML(value)}</strong></div>`).join('')}<div class="info-line">数据与模型配置保存在本机。升级或迁移前，请先按部署文档完成备份。</div></div>`;
  }
  if (selected==='model') {
    const draft=view.modelDraft||model;
    host.innerHTML=`<div class="section-title"><div><h2>模型服务</h2><p class="muted">完整审计与授权修复共用此服务。</p></div>${badge(model.ready?'pass':'waiting_configuration',model.ready?'能力检测通过':'等待配置或检测')}</div><div class="card-body settings-form"><form id="model-form"><fieldset><legend>连接配置</legend><label>API Base URL<input name="base_url" type="url" value="${escapeHTML(draft.base_url)}" required placeholder="https://your-service.example/v1"></label><div class="form-grid"><label>模型名称<input name="model" value="${escapeHTML(draft.model)}" required maxlength="160" placeholder="填写服务提供的模型 ID"></label><label>思考程度<select name="reasoning_effort">${[['','服务默认'],['low','低'],['medium','中'],['high','高'],['max','最高']].map(([value,text])=>`<option value="${value}" ${draft.reasoning_effort===value?'selected':''}>${text}</option>`).join('')}</select></label></div><label>API Key<input name="api_key" type="password" value="${escapeHTML(view.modelDraft?.api_key||'')}" autocomplete="new-password" placeholder="${model.api_key_configured?'已保存，留空则保留':'无鉴权服务可留空'}"></label><p class="hint">同一服务留空保留密钥；切换地址时需重新填写。密钥不发送给执行机器。</p></fieldset><p class="error" role="alert"></p><div class="form-action-row"><button type="submit" class="primary">保存配置</button><button type="button" data-action="probe-model">检测能力</button><span id="model-draft-status" class="muted">${view.modelDraft?'有未保存的修改':''}</span></div><p id="model-feedback" class="info-line">${model.failure_code?'检测未通过，请检查服务地址、模型权限与兼容性。诊断代码：'+escapeHTML(model.failure_code):'保存后检测能力；检测会调用两次模型，验证工具调用与结构化输出。'}</p></form></div>`;
    $('#model-form').oninput=event=>{view.modelDraft=Object.fromEntries(new FormData(event.currentTarget));$('#model-draft-status').textContent='有未保存的修改';};
    $('#model-form').onsubmit=event=>{event.preventDefault();busy($('button[type=submit]',event.target),async()=>{try{const body=Object.fromEntries(new FormData(event.target));if(!body.api_key)delete body.api_key;if(!body.reasoning_effort)body.reasoning_effort=null;await api('/model',{method:'PUT',body});view.modelDraft=null;await settings();notice('已保存，检测能力后即可使用完整审计');}catch(error){$('.error',event.target).textContent=error.message;}});};
  }
  if (selected==='workers') {
    host.innerHTML=`<div class="section-title"><div><h2>执行机器</h2><p class="muted">可信机器通过一次码接入，凭据可随时撤销。</p></div><button class="primary" data-action="enroll-worker">接入新机器</button></div><div id="enrollment" class="card-body" hidden></div><div id="workers"></div>`;
    await renderWorkers();
  }
  if (selected==='members') {
    host.innerHTML=`<div class="section-title"><div><h2>成员管理</h2><p class="muted">成员共享浏览，维护者管理自己的 Skill。</p></div></div><details class="add-member"><summary>添加成员</summary><form id="user-form" class="inline-form"><label>账号<input name="username" required maxlength="64" autocomplete="off"></label><label>初始密码<input name="password" type="password" required minlength="12" maxlength="256" autocomplete="new-password"></label><label>角色<select name="role"><option value="maintainer">维护者</option><option value="admin">管理员</option></select></label><button class="primary" type="submit">添加成员</button><p class="error" role="alert"></p></form></details><div id="users"></div>`;
    await renderUsers();
    if (!$('#user-form')) return;
    $('#user-form').onsubmit=event=>{event.preventDefault();busy($('button',event.target),async()=>{try{await api('/users',{method:'POST',body:Object.fromEntries(new FormData(event.target))});event.target.reset();await renderUsers();notice('成员已添加');}catch(error){$('.error',event.target).textContent=error.message;}});};
  }
}
async function renderWorkers(more=false) {
  const previous=more?state.enrollmentHistory?.items||[]:[];
  const params=new URLSearchParams({limit:'25'});
  if(more && state.enrollmentHistory?.nextCursor)params.set('cursor',state.enrollmentHistory.nextCursor);
  const [workers,page] = await Promise.all([api('/workers'),api('/worker-enrollment-history?'+params)]);
  const codes=[...previous,...page.items];state.enrollmentHistory={items:codes,nextCursor:page.nextCursor};
  if(!$('#workers'))return;
  $('#workers').innerHTML = `<div class="table-wrap"><table class="records-table"><thead><tr><th>机器</th><th>状态</th><th>最后连接</th><th>操作</th></tr></thead><tbody>${workers.map(w=>`<tr><td class="record-title">${escapeHTML(w.name)}</td><td data-label="状态">${badge(w.state)}</td><td data-label="最后连接" class="muted">${w.last_seen_at?escapeHTML(fmtDate(w.last_seen_at)):'尚未上线；回执丢失时撤销后重新接入'}</td><td class="record-actions">${w.revoked_at?'—':`<button class="text-button" data-revoke-worker="${w.id}">撤销接入</button>`}</td></tr>`).join('') || '<tr><td colspan="4">暂无机器；原生 start 或 Compose 会自动接入内置 worker。</td></tr>'}</tbody></table></div><div class="card-body"><details ${more?'open':''}><summary class="muted">接入码记录 · ${codes.length} 条</summary>${codes.map(c=>`<div class="settings-row"><span class="mono">${c.id.slice(0,8)}</span><span>${c.revoked_at?'已撤销':c.consumed_at?'已消费':c.expires_at*1000<Date.now()?'已过期':'等待接入'}</span>${!c.revoked_at&&!c.consumed_at&&c.expires_at*1000>Date.now()?`<button data-revoke-code="${c.id}">撤销</button>`:''}</div>`).join('')}${page.hasMore?'<button data-action="enrollments-more">加载更早记录</button>':''}</details></div>`;
}
async function renderUsers() {
  const users = await api('/users');
  if (!$('#users')) return;
  $('#users').innerHTML = `<div class="table-wrap"><table class="records-table"><thead><tr><th>账号</th><th>角色</th><th>状态</th><th>操作</th></tr></thead><tbody>${users.map(u => `<tr><td class="record-title">${escapeHTML(u.username)}</td><td data-label="角色">${u.role === 'admin' ? '管理员' : '维护者'}</td><td data-label="状态"><span class="badge ${u.active ? 'success' : 'neutral'}">${u.active ? '可用' : '已停用'}</span></td><td class="record-actions">${u.id===state.user.id ? '<span class="muted">当前账号</span>' : `<button class="text-button" data-user="${u.id}" data-active="${u.active ? '0' : '1'}">${u.active ? '停用' : '启用'}</button>`}</td></tr>`).join('')}</tbody></table></div>`;
}

document.addEventListener('click',event=>{const button=event.target.closest('[data-setting-tab]');if(!button)return;view.settingsTab=button.dataset.settingTab;settings().then(()=>document.getElementById('setting-tab-'+view.settingsTab)?.focus({preventScroll:true})).catch(error=>notice(error.message));});
