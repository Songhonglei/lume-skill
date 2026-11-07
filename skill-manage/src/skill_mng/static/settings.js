'use strict';

async function settings() {
  const token=++view.render, admin=state.user.role==='admin';
  const [system,model]=await Promise.all([api('/system'),admin?api('/model'):Promise.resolve(null)]);
  if (token!==view.render||location.hash.split('?')[0]!=='#settings') return;
  const tabs=admin?[['model','模型服务'],['workers','执行机器'],['members','成员管理'],['runtime','运行信息']]:[['runtime','运行信息']];
  const selected=tabs.some(([value])=>value===view.settingsTab)?view.settingsTab:tabs[0][0];
  view.settingsTab=selected;
  $('#main').innerHTML=pageHeading('设置')+`<div class="settings-layout"><nav class="settings-nav" role="tablist" aria-label="设置分类">${tabs.map(([value,text])=>`<button id="setting-tab-${value}" data-setting-tab="${value}" role="tab" aria-controls="settings-content" aria-selected="${selected===value}" tabindex="${selected===value?'0':'-1'}">${text}</button>`).join('')}</nav><section id="settings-content" class="panel" role="tabpanel" aria-labelledby="setting-tab-${selected}"></section></div>`;
  const host=$('#settings-content');
  if (selected==='runtime') {
    host.innerHTML=`<div class="section-title"><div><h2>运行信息</h2></div>${badge('online','服务在线')}</div><div class="card-body">${[['程序版本',system.version],['存储方式',system.storage],['执行机器',system.worker],['审计能力',system.audit],['自动修复',system.repair]].map(([name,value])=>`<div class="settings-row"><span>${name}</span><strong>${escapeHTML(value)}</strong></div>`).join('')}<div class="info-line">升级或迁移前，请按部署文档备份数据。</div></div>`;
  }
  if (selected==='model') {
    const draft=view.modelDraft||model;
    const canProbe=model.configured&&!view.modelDraft;
    const probeHelp=model.configured?'请先保存更改。':'请先填写并保存服务地址和模型名称。';
    host.innerHTML=`<div class="section-title"><div><h2>模型服务</h2><p class="muted">用于完整审计与自动修复。</p></div>${badge(model.ready?'pass':'waiting_configuration',model.ready?'检测通过':model.base_url&&model.model?'待检测':'待配置')}</div><div class="card-body settings-form"><form id="model-form"><fieldset><legend>连接配置</legend><label>服务地址<input name="base_url" type="url" pattern="https?://.+" value="${escapeHTML(draft.base_url)}" required placeholder="https://your-service.example/v1"></label><div class="form-grid"><label>模型名称<input name="model" value="${escapeHTML(draft.model)}" required maxlength="160" placeholder="填写服务提供的模型 ID"></label><label>思考程度<select name="reasoning_effort">${[['','服务默认'],['low','低'],['medium','中'],['high','高'],['max','最高']].map(([value,text])=>`<option value="${value}" ${draft.reasoning_effort===value?'selected':''}>${text}</option>`).join('')}</select></label></div><label>API Key<input name="api_key" type="password" value="${escapeHTML(view.modelDraft?.api_key||'')}" autocomplete="new-password" placeholder="${model.api_key_configured?'已保存，留空则保留':'无需密钥时可留空'}"></label><p class="hint">留空保留原密钥；更换地址需重填。密钥不下发到执行机器。</p></fieldset><p class="error" role="alert"></p><div class="form-action-row"><button type="submit" class="primary">保存配置</button><button type="button" data-action="probe-model" aria-describedby="model-feedback" ${canProbe?'':'disabled'}>检测能力</button><span id="model-draft-status" class="muted">${view.modelDraft?'未保存':''}</span></div><p id="model-feedback" class="info-line">${!canProbe?probeHelp:model.failure_code?'检测失败，请检查地址、权限与兼容性。错误代码：'+escapeHTML(model.failure_code):'保存后再检测，将调用模型 2 次，检查工具调用与结构化输出。'}</p></form></div>`;
    $('#model-form').oninput=event=>{
      view.modelDraft=Object.fromEntries(new FormData(event.currentTarget));
      $('#model-draft-status').textContent='未保存';
      $('[data-action=probe-model]').disabled=true;
      $('#model-feedback').textContent=probeHelp;
    };
    $('#model-form').onsubmit=event=>{event.preventDefault();busy($('button[type=submit]',event.target),async()=>{try{const body=Object.fromEntries(new FormData(event.target));if(!body.api_key)delete body.api_key;if(!body.reasoning_effort)body.reasoning_effort=null;await api('/model',{method:'PUT',body});view.modelDraft=null;await settings();notice('已保存，请检测模型能力');}catch(error){formError(event.target,error);}});};
  }
  if (selected==='workers') {
    const local=loopbackHost(location.hostname)?location.origin:'';
    const remote=remoteWorkerOrigin(system.public_url);
    const enrollmentButton=(label,url)=>`<button data-action="enroll-worker" data-worker-url="${escapeHTML(url)}">${label}</button>`;
    host.innerHTML=`<div class="section-title"><div><h2>执行机器</h2><p class="muted">使用一次性接入码，仅接入可信机器。</p></div><div class="actions">${local?enrollmentButton('同机接入',local):''}${remote?enrollmentButton('远程接入',remote):''}</div></div>${remote?'':'<details class="card-body"><summary>配置远程接入地址</summary><p class="hint">在服务端设置 <code>SKILL_MNG_PUBLIC_URL</code> 为执行机器可访问的 HTTPS 站点地址，然后重启 Web 服务。完成后这里会显示远程接入。</p></details>'}<div id="enrollment" class="card-body" hidden></div><div id="workers"></div>`;
    await renderWorkers();
  }
  if (selected==='members') {
    host.innerHTML=`<div class="section-title"><div><h2>成员管理</h2><p class="muted">所有成员可查看，维护者可更新自己的 Skill。</p></div></div><details class="add-member"><summary>添加成员</summary><form id="user-form" class="inline-form"><label>账号<input name="username" required maxlength="64" autocomplete="off"></label><label>初始密码<input name="password" type="password" required minlength="12" maxlength="256" autocomplete="new-password"></label><label>角色<select name="role"><option value="maintainer">维护者</option><option value="admin">管理员</option></select></label><button class="primary" type="submit">添加成员</button><p class="error" role="alert"></p></form></details><div id="users"></div>`;
    await renderUsers();
    if (!$('#user-form')) return;
    $('#user-form').onsubmit=event=>{event.preventDefault();busy($('button',event.target),async()=>{try{await api('/users',{method:'POST',body:Object.fromEntries(new FormData(event.target))});event.target.reset();await renderUsers();notice('成员已添加');}catch(error){formError(event.target,error);}});};
  }
}
function loopbackHost(host) {
  return host==='localhost'||host==='[::1]'||/^127(?:\.\d{1,3}){3}$/.test(host);
}

function remoteWorkerOrigin(value) {
  try {
    const url=new URL(value);
    return url.protocol==='https:'&&!loopbackHost(url.hostname)?url.origin:'';
  } catch { return ''; }
}

async function enrollWorker(button) {
  const url=button.dataset.workerUrl, local=loopbackHost(new URL(url).hostname);
  const {code}=await api('/worker-enrollments',{method:'POST'});
  if (!button.isConnected) return;
  const enrollment=$('#enrollment');
  enrollment.innerHTML=`<p>接入码仅显示这一次，10 分钟有效。</p><pre id="one-time-code" class="code"></pre><p class="hint">${local?'在运行 Web 服务的同一台机器上':'在远程执行机器上'}运行以下命令，按提示输入接入码。</p><pre id="join-command" class="code"></pre>`;
  $('#one-time-code',enrollment).textContent=code;
  const quoted="'"+url.replaceAll("'","'\"'\"'")+"'";
  $('#join-command',enrollment).textContent='skill-mng worker join --server '+quoted+'\n'+'skill-mng worker start';
  enrollment.hidden=false;
  await renderWorkers();
}

function enrollmentStatus(code) {
  return code.revoked_at?'已撤销':code.consumed_at?'已使用':code.expires_at*1000<Date.now()?'已过期':'等待接入';
}
async function renderWorkers() {
  const request=view.workerRequest=(view.workerRequest||0)+1, open=$('#enrollment-records')?.open;
  const [workers,codes]=await Promise.all([api('/workers'),cursorPage('enrollments','/worker-enrollment-history')]);
  if (!codes||request!==view.workerRequest||location.hash.split('?')[0]!=='#settings'||view.settingsTab!=='workers'||!$('#workers')) return;
  view.records.set('worker',workers);view.records.set('enrollment',codes.items);
  const page=localPage('workers',workers);
  $('#workers').innerHTML=`<div class="table-wrap"><table class="records-table result-table settings-table"><thead><tr><th>机器</th><th>状态</th><th>最后连接</th><th>操作</th></tr></thead><tbody>${page.items.map(worker=>`<tr><td class="record-title"><span class="cell-text" title="${escapeHTML(worker.name)}">${escapeHTML(worker.name)}</span></td><td data-label="状态">${badge(worker.state)}</td><td data-label="最后连接">${worker.last_seen_at?escapeHTML(fmtShortDate(worker.last_seen_at)):'—'}</td><td class="record-actions">${actionSlots([['详情',detailButton('worker',worker.id)],['撤销',worker.revoked_at?null:`<button class="text-button row-primary" data-revoke-worker="${worker.id}">撤销</button>`]])}</td></tr>`).join('')||'<tr><td colspan="4">暂无执行机器</td></tr>'}</tbody></table></div><div id="workers-pagination"></div><div class="card-body"><details id="enrollment-records" ${open?'open':''}><summary>接入码记录</summary><div class="table-wrap"><table class="records-table result-table settings-table"><thead><tr><th>记录</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>${codes.items.map(code=>`<tr><td class="record-title"><span class="cell-text mono" title="${escapeHTML(code.id)}">${escapeHTML(code.id.slice(0,8))}</span></td><td data-label="状态">${enrollmentStatus(code)}</td><td data-label="创建时间">${escapeHTML(fmtShortDate(code.created_at))}</td><td class="record-actions">${actionSlots([['详情',detailButton('enrollment',code.id)],['撤销',enrollmentStatus(code)==='等待接入'?`<button class="text-button row-primary" data-revoke-code="${code.id}">撤销</button>`:null]])}</td></tr>`).join('')||'<tr><td colspan="4">暂无接入码记录</td></tr>'}</tbody></table></div><div id="enrollments-pagination"></div></details></div>`;
  mountPagination($('#workers-pagination'),'workers',page,renderWorkers);
  mountPagination($('#enrollments-pagination'),'enrollments',codes,renderWorkers);
}
async function renderUsers() {
  const request=view.usersRequest=(view.usersRequest||0)+1, users=await api('/users');
  if(request!==view.usersRequest||location.hash.split('?')[0]!=='#settings'||view.settingsTab!=='members'||!$('#users'))return;
  view.records.set('user',users);
  const page=localPage('users',users);
  $('#users').innerHTML=`<div class="table-wrap"><table class="records-table result-table settings-table"><thead><tr><th>账号</th><th>角色</th><th>状态</th><th>操作</th></tr></thead><tbody>${page.items.map(user=>`<tr><td class="record-title"><span class="cell-text" title="${escapeHTML(user.username)}">${escapeHTML(user.username)}</span></td><td data-label="角色">${user.role==='admin'?'管理员':'维护者'}</td><td data-label="状态">${badge(user.active?'pass':'neutral',user.active?'可用':'已停用')}</td><td class="record-actions">${actionSlots([['详情',detailButton('user',user.id)],['启停',user.id===state.user.id?null:`<button class="text-button row-primary" data-user="${user.id}" data-active="${user.active?'0':'1'}">${user.active?'停用':'启用'}</button>`]])}</td></tr>`).join('')}</tbody></table></div><div id="users-pagination"></div>`;
  mountPagination($('#users-pagination'),'users',page,renderUsers);
}

document.addEventListener('click',event=>{const button=event.target.closest('[data-setting-tab]');if(!button)return;view.settingsTab=button.dataset.settingTab;settings().then(()=>document.getElementById('setting-tab-'+view.settingsTab)?.focus({preventScroll:true})).catch(error=>notice(error.message));});
