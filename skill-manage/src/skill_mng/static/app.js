'use strict';
const $ = (selector, parent = document) => parent.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = value => new Date(value).toLocaleString('zh-CN', {hour12:false});
const state = {user:null, skills:[], detail:null, version:null, mode:'upload', pending:null};
let noticeTimer;
function notice(message) { $('#notice').textContent = message; $('#notice').hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('#notice').hidden = true, 4500); }
async function api(path, options = {}) {
  const headers = {...options.headers};
  if (state.user?.csrf) headers['X-CSRF-Token'] = state.user.csrf;
  if (options.body && !(options.body instanceof FormData)) { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(options.body); }
  const response = await fetch('/api' + path, {...options, headers, credentials:'same-origin'});
  const result = await response.json();
  if (!response.ok) { if (response.status === 401 && state.user) { state.user = null; await init(); } throw new Error(typeof result.detail === 'string' ? result.detail : '输入格式不正确，请检查后重试'); }
  return result;
}
async function busy(button, action) { button.disabled = true; try { await action(); } catch (error) { notice(error.message); } finally { button.disabled = false; } }
async function init() {
  try {
    const onboard = await api('/onboard');
    if (!onboard.initialized) return showGate(true);
    try { state.user = await api('/me'); } catch { return showGate(false); }
    $('#gate').hidden = true; $('#workspace').hidden = false;
    $('#account').textContent = state.user.username + (state.user.role === 'admin' ? ' · 管理员' : '');
    await route();
  } catch (error) { $('#gate').textContent = '连接失败：' + error.message; }
}
function showGate(onboard) {
  $('#workspace').hidden = true; $('#gate').hidden = false;
  $('#gate').innerHTML = `<div class="brand"><img src="/static/icon.svg" width="30" height="30" alt=""><strong>Skill 工作台</strong></div><h1>${onboard ? '设置你的工作台' : '登录工作台'}</h1><p class="muted">${onboard ? '创建管理员，开始管理团队的 Skill。' : '集中管理 Skill，保留每一个版本。'}</p><form id="gate-form">${onboard ? '<label>初始化凭据<input name="token" type="password" required autocomplete="off"></label><p class="hint">从服务器数据目录的 <code>run/setup-code</code> 读取。</p>' : ''}<label>账号<input name="username" required maxlength="64" autocomplete="username"></label><label>密码<input name="password" type="password" required ${onboard ? 'minlength="12"' : ''} maxlength="256" autocomplete="${onboard ? 'new-password' : 'current-password'}"></label><p class="error" id="gate-error" role="alert"></p><button class="primary" type="submit">${onboard ? '创建并进入' : '登录'}</button></form>`;
  $('#gate-form').onsubmit = async event => {
    event.preventDefault(); const button = $('button[type=submit]', event.target); button.disabled = true;
    try { const body = Object.fromEntries(new FormData(event.target)); if (onboard) await api('/onboard', {method:'POST',body}); state.user = await api('/login', {method:'POST',body:{username:body.username,password:body.password}}); await init(); }
    catch(error) { $('#gate-error').textContent = error.message; } finally { button.disabled = false; }
  };
}
async function route() {
  if (!state.user) return;
  const hash = location.hash || '#skills';
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', hash.startsWith('#'+a.dataset.nav) || (a.dataset.nav === 'skills' && hash.startsWith('#skill/'))));
  try {
    if (hash.startsWith('#skill/')) await detail(hash.slice(7));
    else if (hash.startsWith('#task/')) await taskDetail(hash.slice(6));
    else if (hash === '#tasks') await taskList();
    else if (hash === '#settings') await settings();
    else await library();
  } catch(error) { notice(error.message); }
}
async function library() {
  state.skills = await api('/skills');
  $('#main').innerHTML = `<div class="page-head"><div><h1>Skill 库<span class="count">${state.skills.length} 个 Skill</span></h1><p class="subtitle">团队共享，版本留存。</p></div><div class="actions"><button class="primary" data-action="import">＋ 导入 Skill</button></div></div><section class="panel"><div class="toolbar"><input id="search" type="search" placeholder="搜索名称、描述或维护者" aria-label="搜索 Skill"><label class="check"><input id="mine" type="checkbox">我维护的</label><div class="spacer"></div><span class="muted">所有成员可浏览</span></div><div id="skill-results"></div><div class="panel-foot">登记版本不会覆盖旧包；新版本可在详情中切换。</div></section>`;
  $('#search').oninput = renderRows; $('#mine').onchange = renderRows; renderRows();
}
function renderRows() {
  const query = $('#search').value.trim().toLowerCase(), mine = $('#mine').checked;
  const rows = state.skills.filter(s => (!mine || s.owner_id === state.user.id) && `${s.name} ${s.slug} ${s.description} ${s.owner}`.toLowerCase().includes(query));
  $('#skill-results').innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Skill</th><th>当前版本</th><th>版本数</th><th>维护者</th><th>创建时间</th><th>操作</th></tr></thead><tbody>${rows.map(s => `<tr><td><a class="skill-name" href="#skill/${s.id}">${escapeHTML(s.name)}</a><p class="description">${escapeHTML(s.description || s.slug)}</p></td><td><span class="badge neutral">${escapeHTML(s.current_version)}</span></td><td>${s.version_count}</td><td>${escapeHTML(s.owner)}</td><td class="muted">${escapeHTML(fmtDate(s.created_at))}</td><td><a href="#skill/${s.id}">查看详情</a></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty"><div class="empty-symbol">&lt;/&gt;</div><h2>${state.skills.length ? '没有找到匹配的 Skill' : '导入第一个 Skill'}</h2><p>${state.skills.length ? '试试其他关键词，或取消筛选。' : '选择 ZIP、一个目录，或粘贴公开下载链接。'}</p>${state.skills.length ? '' : '<button class="primary" data-action="import">＋ 导入 Skill</button>'}</div>`;
}
async function detail(id, selected) {
  const skill = await api('/skills/' + encodeURIComponent(id)); state.detail = skill;
  state.version = selected || skill.current_version_id;
  const current = skill.versions.find(v => v.id === state.version);
  $('#main').innerHTML = `<div class="crumb"><a href="#skills">Skill 库</a> ／ ${escapeHTML(skill.name)}</div><div class="page-head"><div><h1>${escapeHTML(skill.name)}</h1><p class="subtitle">${escapeHTML(skill.description || '暂未填写描述')}</p></div><div class="actions">${skill.can_write ? '<button data-action="import-version">导入新版本</button>' : ''}<a class="button primary" href="/api/versions/${state.version}/download">下载原包</a></div></div><div class="detail-grid"><aside class="panel card-body"><h3>版本信息</h3><div class="version-control"><select id="version-select" aria-label="选择版本">${skill.versions.map(v => `<option value="${v.id}" ${v.id === state.version ? 'selected' : ''}>${escapeHTML(v.version)}${v.id === skill.current_version_id ? ' · 当前' : ''}</option>`).join('')}</select></div>${skill.can_write && state.version !== skill.current_version_id ? '<button data-action="set-current">设为当前版本</button>' : '<span class="badge neutral">' + (state.version === skill.current_version_id ? '当前使用' : '历史版本') + '</span>'}<dl class="facts"><div class="fact"><dt>维护者</dt><dd>${escapeHTML(skill.owner)}</dd></div><div class="fact"><dt>登记时间</dt><dd>${escapeHTML(fmtDate(current.created_at))}</dd></div><div class="fact"><dt>原包大小</dt><dd>${(current.byte_size/1024).toFixed(1)} KiB</dd></div><div class="fact"><dt>内容 SHA-256</dt><dd class="mono">${current.content_digest}</dd></div><div class="fact"><dt>原包 SHA-256</dt><dd class="mono">${current.artifact_digest}</dd></div></dl>${state.user.role === 'admin' ? '<label>调整维护者<select id="owner-select" aria-label="调整维护者"></select></label><button data-action="set-owner">保存归属</button>' : ''}<p class="info-line">审计固定当前所选版本，结果不会改动原包。</p>${skill.can_write ? '<button class="primary" data-action="audit">创建审计</button>' : ''}</aside><section class="panel"><div class="section-title"><h3>包内文件</h3><span class="muted">只读预览</span></div><div class="file-layout"><div id="file-list" class="file-list" aria-label="文件列表"></div><div><div id="file-title" class="file-title">选择文件</div><pre id="file-content" class="code"></pre></div></div></section></div>`;
  $('#version-select').onchange = event => detail(skill.id, event.target.value).catch(e => notice(e.message));
  if (state.user.role === 'admin') { const users = await api('/users'); $('#owner-select').innerHTML = users.filter(u => u.active).map(u => `<option value="${u.id}" ${u.id===skill.owner_id?'selected':''}>${escapeHTML(u.username)}</option>`).join(''); }
  const files = await api('/versions/' + state.version + '/files');
  $('#file-list').innerHTML = files.map(f => `<button data-file="${escapeHTML(f.path)}" title="${escapeHTML(f.path)}">${escapeHTML(f.path)}</button>`).join('');
  await showFile(files.find(f => f.path === 'SKILL.md')?.path || files[0].path);
}
async function showFile(path) {
  document.querySelectorAll('[data-file]').forEach(b => b.classList.toggle('active', b.dataset.file === path));
  $('#file-title').textContent = path; $('#file-content').textContent = '读取中…';
  try { const file = await api('/versions/' + state.version + '/file?path=' + encodeURIComponent(path)); $('#file-content').textContent = file.content; }
  catch(error) { $('#file-content').textContent = error.message; }
}
const labels = {queued:'排队中',running:'执行中',waiting_configuration:'等待模型配置',cancelling:'正在停止',cancelled:'已停止',succeeded:'已完成',failed:'执行失败',pass:'通过',fail:'不通过',review_required:'待复核',error:'执行异常',saved:'已保存',pending:'待完成',online:'在线',offline:'离线',registered:'等待上线',revoked:'已撤销',editing:'修复中',reauditing:'独立复审中',ready:'候选已就绪',published:'已登记新版本',needs_attention:'待处理'};
const label = value => escapeHTML(labels[value] || value || '—');
const failureText=value=>({target_credentials_require_review:'目标包含疑似凭据，已阻断外部模型和自动修复。请按报告位置检查示例或占位用途，并在本地处理后导入新版本。',model_unavailable:'模型服务暂时不可用，请检查服务状态后重试。',model_timeout:'模型请求等待超时，请检查服务响应速度后重试。',model_network_error:'无法连接模型服务，请检查网络与服务地址后重试。',tool_budget_exceeded:'模型一次返回过多工具调用，已停止编辑。请检查模型兼容性后重试。',edit_context_budget_exhausted:'本轮上下文已达上限，候选未发布。请缩小修复范围后重试。',invalid_edit_completion:'模型未返回有效的编辑完成结果，候选未发布。请检查模型兼容性后重试。',invalid_tool_arguments:'模型返回的工具参数无效，已停止。请检查 worker 日志后重试。',edit_budget_exhausted:'模型未在本轮调用次数内完成编辑，未发布候选。请查看 worker 日志后调整范围重试。',repair_round_budget_exhausted:'已用完授权的修复轮数，仍有问题需要处理。',independent_review_requires_attention:'独立复审仍有待确认结论，候选未发布。',unselected_issue_blocks_review:'复审发现未获授权的阻断问题，请重新选择修复范围。',write_outside_authorization:'模型尝试修改未授权文件，已停止。',cannot_adjust_declared_version:'无法安全调整版本，请先检查 SKILL.md 的版本声明。',checker_error:'检查器未能完成，请查看 worker 日志定位。',timeout:'已达到任务时限，未发布新版本。'}[value] || (String(value||'').startsWith('publication_gate_blocked:')?'登记门禁未通过：'+String(value).slice(26):value));


function taskFailure(task, code=task.failure_code) {
  if (code === 'model_unavailable') {
    const event = (task.events || []).filter(e=>e.kind === 'model.failed').at(-1);
    try { const saved = JSON.parse(event?.detail_json || '{}').code; if (typeof saved === 'string') code = saved; } catch {}
  }
  if (/^model_http_\d{3}$/.test(code || '')) return '模型服务返回 HTTP ' + code.slice(11) + '，请检查服务状态与访问权限后重试。';
  return failureText(code);
}

async function taskList() {
  const tasks = await api('/tasks');
  $('#main').innerHTML = `<div class="page-head"><div><h1>任务中心<span class="count">${tasks.length} 个任务</span></h1><p class="subtitle">在 Skill 详情创建审计，关闭页面后仍会继续。</p></div><div class="actions"><button data-action="refresh">刷新</button></div></div><section class="panel">${tasks.length ? `<div class="table-wrap"><table><thead><tr><th>Skill / 版本</th><th>任务状态</th><th>审计结论</th><th>报告交付</th><th>创建时间</th><th>操作</th></tr></thead><tbody>${tasks.map(t=>`<tr><td><a class="skill-name" href="#task/${t.id}">${escapeHTML(t.skill_name)}</a><p class="muted">${escapeHTML(t.version)} · ${t.kind==='repair'?'修复':'审计'}</p></td><td><span class="badge neutral">${label(t.state)}</span></td><td>${label(t.kind==='repair'?t.repair_state:t.verdict)}</td><td>${t.kind==='repair'?(t.repair_state==='published'?'版本已登记':'查看轮次结果'):label(t.delivery_status)}</td><td class="muted">${escapeHTML(fmtDate(t.created_at))}</td><td><a href="#task/${t.id}">查看详情</a></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><h2>还没有任务</h2><p>打开一个 Skill，选择版本后创建审计。</p><a href="#skills">前往 Skill 库</a></div>'}</section>`;
}
async function taskDetail(id) {
  const task = await api('/tasks/'+encodeURIComponent(id));
  state.taskPending = !['succeeded','failed','cancelled'].includes(task.state);
  if(task.kind==='repair')return repairTaskDetail(task);
  const audit = await api('/audits/'+task.audit_run_id), result = audit.result;
  const skill = await api('/skills/'+task.manifest.skillId);
  const writable = skill.can_write;
  state.auditContext={audit,result,skill};
  $('#main').innerHTML = `<div class="crumb"><a href="#tasks">任务中心</a> ／ 审计详情</div><div class="page-head"><div><h1>${escapeHTML(skill.name)} <span class="badge neutral">${label(task.state)}</span></h1><p class="subtitle">${escapeHTML(task.manifest.registeredVersion)} · ${task.manifest.depth} · ${task.manifest.mode === 'full' ? '完整审计' : '静态预检'}</p></div><div class="actions"><button data-action="refresh">刷新</button>${writable && !['succeeded','failed','cancelled'].includes(task.state) ? `<button data-cancel-task="${id}">停止任务</button>`:''}${result ? `<a class="button primary" href="/api/audits/${audit.id}/report">下载报告</a>`:''}</div></div><div class="settings-grid"><section class="panel"><div class="section-title"><h3>审计结果</h3></div><div class="card-body"><div class="settings-row"><span>结论</span><strong>${label(audit.verdict)}</strong></div><div class="settings-row"><span>报告交付</span><span>${label(audit.delivery_status)}</span></div>${result ? `<div class="settings-row"><span>得分</span><strong>${result.score} / ${result.maxScore}</strong></div><div class="settings-row"><span>问题</span><span>${result.errorCount} ERR · ${result.warningCount} WARN</span></div>${result.reviewRequired ? '<p class="info-line">仍有必要检查未完成或证据待复核，不能按通过使用。</p>':''}<div class="actions report-actions"><button data-action="download-result">下载 JSON</button><button data-action="copy-repair">复制修复提示</button>${writable && result.findings.some(f=>!f.reviewRequired) ? '<button class="primary" data-action="repair">修复所选问题</button>' : ''}</div>` : `<p class="info-line">${task.state === 'waiting_configuration' ? '请管理员到设置中填写模型服务，并运行能力检测。':'报告将在 worker 完成执行并成功回传后显示。'}</p>`}${task.failure_code ? `<p class="error">${escapeHTML(taskFailure(task))}</p>`:''}</div></section><section class="panel"><div class="section-title"><h3>固定包与规则</h3></div><div class="card-body"><dl class="facts"><div class="fact"><dt>版本 ID</dt><dd class="mono">${task.version_id}</dd></div><div class="fact"><dt>内容 SHA-256</dt><dd class="mono">${task.manifest.contentDigest}</dd></div><div class="fact"><dt>规则版本</dt><dd>${escapeHTML(task.manifest.ruleVersion)}</dd></div>${result ? `<div class="fact"><dt>报告 SHA-256</dt><dd class="mono">${result.reportDigest}</dd></div>`:''}</dl></div></section><section class="panel wide"><div class="section-title"><h3>问题列表</h3></div>${result?.findings.length ? `<div class="table-wrap"><table><thead><tr><th>选择</th><th>规则 / 级别</th><th>位置</th><th>问题与建议</th></tr></thead><tbody>${result.findings.map(f=>`<tr><td>${writable ? `<input type="checkbox" data-finding="${escapeHTML(f.id)}" aria-label="选择 ${escapeHTML(f.ruleId)} ${escapeHTML(f.file)} 第 ${f.line} 行" ${f.reviewRequired?'disabled':f.severity==='ERR'?'checked':''}>`:'—'}</td><td>${escapeHTML(f.ruleId)}<br><span class="badge neutral">${escapeHTML(f.severity)}</span></td><td class="mono">${escapeHTML(f.file)}:${f.line}</td><td class="finding-text">${escapeHTML(f.message)}<p class="muted">建议：${escapeHTML(f.suggestion)}</p><p class="muted">验证：${escapeHTML(f.verification)}</p></td></tr>`).join('')}</tbody></table></div>` : `<div class="card-body muted">${result ? '没有已确认的问题。请同时查看结论与待复核状态。':'尚无结果。'}</div>`}</section><section class="panel wide"><div class="section-title"><h3>执行记录</h3></div><div class="card-body">${task.attempts.map(a=>`<div class="settings-row"><span>第 ${a.generation} 次 · ${label(a.state)}</span><span class="muted">${escapeHTML(a.error_code || a.worker_id)}</span></div>`).join('') || '<p class="muted">等待 worker 领取。</p>'}</div></section>${result ? '<section class="panel wide"><div class="section-title"><h3>报告原文</h3></div><pre id="report-source" class="code"></pre></section>':''}</div>`;
  if (result) {
    $('#report-source').textContent = result.reportMarkdown;
    $('[data-action="copy-repair"]').onclick = ()=>busy($('[data-action="copy-repair"]'),async()=>{await navigator.clipboard.writeText(result.repairPrompt);notice('修复提示已复制');});
    $('[data-action="download-result"]').onclick = ()=>{ const url = URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`audit-${audit.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); };
  }
}
async function openRepair() {
  const {audit,result,skill}=state.auditContext;
  const selected=[...document.querySelectorAll('[data-finding]:checked')].map(input=>input.dataset.finding);
  if(!selected.length)return notice('先选择需要修复的问题');
  const files=[...new Set(result.findings.filter(f=>selected.includes(f.id)).map(f=>f.file))];
  const original=skill.versions.find(v=>v.id===audit.version_id).version;
  const increment=value=>value.replace(/(\d+)$/,n=>(BigInt(n)+1n).toString());
  let next=increment(original);if(next===original)next=original+'.repair1';
  while(skill.versions.some(v=>v.version===next))next=increment(next);
  const dialog=document.createElement('dialog');
  dialog.innerHTML=`<form><div class="dialog-head"><h2>授权修复与复审</h2><button type="button" class="icon-button" aria-label="关闭">×</button></div><p>${selected.length} 个已选问题 · ${escapeHTML(skill.name)}</p><p class="info-line">只修改候选副本，原版本保留。允许修改：${files.map(escapeHTML).join('、')}；版本信息在复审前统一调整。</p><label>新版本<input name="target_version" value="${escapeHTML(next===original?original+'.repair1':next)}" required maxlength="80"></label><label class="check-row"><input type="checkbox" name="publish_after_review" checked>复审通过后登记新版本</label><label class="check-row"><input type="checkbox" name="make_current">登记后设为当前版本</label><details><summary>更多设置</summary><label>最多修复轮数<select name="max_rounds"><option value="3">3 轮</option><option value="2">2 轮</option><option value="1">1 轮</option></select></label><label>额外允许修改的文件<textarea name="allowed_paths" rows="3" placeholder="可留空；每行一个包内相对路径"></textarea></label></details><p class="hint">每轮使用新会话全量复审。遇到范围不清、额外缺陷或预算耗尽会转为待处理。未勾选的问题不加入修复授权。</p><p class="error" role="alert"></p><div class="dialog-foot"><button type="submit" class="primary">开始修复与复审</button></div></form>`;
  document.body.append(dialog);dialog.showModal();dialog.onclose=()=>dialog.remove();$('button[type=button]',dialog).onclick=()=>dialog.close();
  const key=crypto.randomUUID();
  $('form',dialog).onsubmit=event=>{event.preventDefault();busy($('button[type=submit]',dialog),async()=>{try{const form=new FormData(event.target);const body={audit_run_id:audit.id,selected_ids:selected,target_version:form.get('target_version').trim(),allowed_paths:form.get('allowed_paths').split('\n').map(p=>p.trim()).filter(Boolean),max_rounds:Number(form.get('max_rounds')),publish_after_review:form.has('publish_after_review'),make_current:form.has('make_current'),idempotency_key:key};const created=await api('/repairs',{method:'POST',body});dialog.close();location.hash='#task/'+created.task_id;}catch(e){$('.error',dialog).textContent=e.message;}});};
}
async function repairTaskDetail(task) {
  const repair=await api('/repairs/'+task.repair_run_id),skill=await api('/skills/'+task.manifest.skillId);
  const last=repair.rounds.at(-1),review=last?.review;
  $('#main').innerHTML=`<div class="crumb"><a href="#tasks">任务中心</a> ／ 修复详情</div><div class="page-head"><div><h1>${escapeHTML(skill.name)} <span class="badge neutral">${label(repair.state)}</span></h1><p class="subtitle">${escapeHTML(task.manifest.registeredVersion)} → ${escapeHTML(repair.target_version)} · 已保存 ${repair.round}/${repair.max_rounds} 轮</p></div><div class="actions"><button data-action="refresh">刷新</button>${skill.can_write&&!['succeeded','failed','cancelled'].includes(task.state)?`<button data-cancel-task="${task.id}">停止任务</button>`:''}${repair.published_version_id?`<a class="button primary" href="/api/versions/${repair.published_version_id}/download">下载新版本</a>`:last?`<a class="button" href="/api/repairs/${repair.id}/candidate">下载候选</a>`:''}${skill.can_write&&repair.state==='ready'?`<button class="primary" data-publish-repair="${repair.id}">登记新版本</button>`:''}</div></div><div class="settings-grid"><section class="panel"><div class="section-title"><h3>修复进展</h3></div><div class="card-body"><div class="settings-row"><span>执行状态</span><strong>${label(task.state)}</strong></div><div class="settings-row"><span>修复状态</span><strong>${label(repair.state)}</strong></div><div class="settings-row"><span>独立复审</span><strong>${label(review?.verdict)}</strong></div>${review?`<div class="settings-row"><span>得分 / ERR</span><span>${review.score}/${review.maxScore} · ${review.errorCount} ERR</span></div><div class="settings-row"><span>授权范围复核</span><span>${review.scopeSatisfied?'通过':'待处理'}</span></div><p class="hint">${escapeHTML(review.scopeReason)}</p><div class="report-actions"><a href="/api/repairs/${repair.id}/report">下载复审报告</a></div>`:''}${repair.failure_code||task.failure_code?`<p class="error">${escapeHTML(taskFailure(task, repair.failure_code||task.failure_code))}</p>`:''}${repair.state==='ready'?'<p class="info-line">候选已通过复审，尚未登记为版本。点击「登记新版本」前仍会校验版本冲突与授权。</p>':repair.state==='needs_attention'?'<p class="info-line">需要处理剩余问题；候选不会自动发布。</p>':''}</div></section><section class="panel"><div class="section-title"><h3>本次授权</h3></div><div class="card-body"><p>仅修复 ${repair.authorization.selectedIds.length} 个所选问题，最多 ${repair.max_rounds} 轮。</p><p class="info-line">${repair.authorization.publishAfterReview?'复审通过后登记新版本':'仅生成候选'}${repair.authorization.makeCurrent?'；登记后设为当前版本':'；保留当前版本指针'}</p><dl class="facts"><div class="fact"><dt>允许编辑</dt><dd>${repair.authorization.editPaths.map(escapeHTML).join('、')}</dd></div><div class="fact"><dt>原包内容 SHA-256</dt><dd class="mono">${task.manifest.contentDigest}</dd></div><div class="fact"><dt>当前候选 SHA-256</dt><dd class="mono">${repair.candidate_digest||'—'}</dd></div></dl></div></section><section class="panel wide"><div class="section-title"><h3>轮次与逐文件差异</h3></div><div class="card-body">${repair.rounds.map(round=>`<details ${round===last?'open':''}><summary>第 ${round.round_number} 轮 · ${label(round.review?.verdict)} · ${round.diff.length} 个文件</summary>${round.diff.map((change,i)=>`<details><summary class="mono">${escapeHTML(change.path)} · ${escapeHTML(change.kind)}</summary><pre class="code" data-diff-round="${round.round_number}" data-diff-index="${i}"></pre></details>`).join('')}</details>`).join('')||'<p class="muted">等待候选生成。</p>'}</div></section><section class="panel wide"><div class="section-title"><h3>剩余问题</h3></div><div class="card-body">${review?.findings.length?review.findings.map(f=>`<p class="finding-text"><span class="badge neutral">${escapeHTML(f.ruleId)} · ${escapeHTML(f.severity)}</span> ${escapeHTML(f.file)}:${f.line} · ${escapeHTML(f.message)}</p>`).join(''):'暂无已保存的剩余问题；以复审结论为准。'}</div></section><section class="panel wide"><div class="section-title"><h3>执行记录</h3></div><div class="card-body">${task.events.map(e=>`<div class="settings-row"><span>${escapeHTML(e.kind)}</span><span class="muted">${escapeHTML(fmtDate(e.created_at))}</span></div>`).join('')||'<p class="muted">等待执行。</p>'}</div></section></div>`;
  document.querySelectorAll('[data-diff-round]').forEach(el=>{const round=repair.rounds.find(r=>r.round_number===Number(el.dataset.diffRound));el.textContent=round.diff[Number(el.dataset.diffIndex)].diff;});
}
async function openAudit() {
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `<form><div class="dialog-head"><h2>创建审计</h2><button type="button" class="icon-button" aria-label="关闭">×</button></div><p class="muted">${escapeHTML(state.detail.name)} · ${escapeHTML(state.detail.versions.find(v=>v.id===state.version).version)}</p><label>审计深度<select name="depth"><option value="L1">L1 · 包内质量检查</option><option value="L2">L2 · 增加发布与外部依赖检查</option></select></label><label>审计方式<select name="mode"><option value="full">完整审计 · 需要已检测的模型</option><option value="static">静态预检 · 无需模型，不能替代完整审计</option></select></label><p class="hint">模型未就绪时，完整审计将等待配置。原包保持只读。</p><p class="error" role="alert"></p><div class="dialog-foot"><button class="primary" type="submit">创建任务</button></div></form>`;
  document.body.append(dialog);dialog.showModal();dialog.onclose=()=>dialog.remove();$('button[type=button]',dialog).onclick=()=>dialog.close();
  const key = crypto.randomUUID(), version = state.version;
  $('form',dialog).onsubmit = event=>{event.preventDefault();busy($('button[type=submit]',dialog),async()=>{try{const data=Object.fromEntries(new FormData(event.target));const result=await api('/audits',{method:'POST',body:{...data,version_id:version,idempotency_key:key}});dialog.close();location.hash='#task/'+result.task_id;}catch(e){$('.error',dialog).textContent=e.message;}});};
}
async function settings() {
  const system = await api('/system'), isAdmin = state.user.role === 'admin';
  const model = isAdmin ? await api('/model') : null;
  $('#main').innerHTML = `<div class="page-head"><div><h1>设置</h1><p class="subtitle">模型服务、执行机器与成员管理。</p></div></div><div class="settings-grid"><section class="panel"><div class="section-title"><h3>运行信息</h3></div><div class="card-body">${[['版本',system.version],['存储',system.storage],['Worker',system.worker],['审计',system.audit],['自动修复',system.repair]].map(([k,v])=>`<div class="settings-row"><span class="muted">${k}</span><span>${escapeHTML(v)}</span></div>`).join('')}</div></section>${isAdmin ? `<section class="panel"><div class="section-title"><h3>模型服务</h3><span class="badge neutral">${model.ready?'检测通过':'等待配置或检测'}</span></div><div class="card-body"><form id="model-form"><label>API Base URL<input name="base_url" type="url" value="${escapeHTML(model.base_url)}" required placeholder="https://your-service.example/v1"></label><label>模型名<input name="model" value="${escapeHTML(model.model)}" required maxlength="160"></label><label>思考程度<select name="reasoning_effort">${[['','服务默认'],['low','低'],['medium','中'],['high','高'],['max','最高']].map(([v,label])=>`<option value="${v}" ${model.reasoning_effort===v?'selected':''}>${label}</option>`).join('')}</select></label><label>API Key<input name="api_key" type="password" autocomplete="new-password" placeholder="${model.api_key_configured?'已保存，留空则保留':'无鉴权服务可留空'}"></label><p class="hint">密钥保存在平台本地。同一服务留空保留；切换地址需重新填写。</p><div class="actions report-actions"><button type="submit" class="primary">保存配置</button><button type="button" data-action="probe-model">检测能力</button></div><p id="model-feedback" class="hint">${model.failure_code ? escapeHTML(model.failure_code) : '检测将调用两次模型，验证工具调用与结构化输出。'}</p></form></div></section><section class="panel wide"><div class="section-title"><h3>执行机器</h3><div class="spacer"></div><button data-action="enroll-worker">生成接入码</button></div><div id="enrollment" class="card-body" hidden></div><div id="workers"></div></section><section class="panel wide"><div class="section-title"><h3>成员管理</h3><span class="muted">管理员创建账号</span></div><div class="card-body"><form id="user-form" class="inline-form"><label>账号<input name="username" required maxlength="64" autocomplete="off"></label><label>初始密码<input name="password" type="password" required minlength="12" maxlength="256" autocomplete="new-password"></label><label>角色<select name="role"><option value="maintainer">维护者</option><option value="admin">管理员</option></select></label><button class="primary" type="submit">添加成员</button></form></div><div id="users"></div></section>` : '<section class="panel card-body"><p class="muted">模型与执行机器由管理员设置。</p></section>'}</div>`;
  if (isAdmin) {
    await renderUsers();await renderWorkers();
    $('#user-form').onsubmit = event => { event.preventDefault(); busy($('button',event.target), async()=>{await api('/users',{method:'POST',body:Object.fromEntries(new FormData(event.target))}); event.target.reset(); await renderUsers(); notice('成员已添加');}); };
    $('#model-form').onsubmit = event=>{event.preventDefault();busy($('button[type=submit]',event.target),async()=>{const body=Object.fromEntries(new FormData(event.target));if(!body.api_key)delete body.api_key;if(!body.reasoning_effort)body.reasoning_effort=null;await api('/model',{method:'PUT',body});await settings();notice('已保存，请检测能力后创建完整审计');});};
  }
}
async function renderWorkers() {
  const [workers,codes] = await Promise.all([api('/workers'),api('/worker-enrollments')]);
  $('#workers').innerHTML = `<div class="table-wrap"><table><thead><tr><th>机器</th><th>状态</th><th>最后连接</th><th>操作</th></tr></thead><tbody>${workers.map(w=>`<tr><td>${escapeHTML(w.name)}</td><td>${label(w.state)}</td><td class="muted">${w.last_seen_at?escapeHTML(fmtDate(w.last_seen_at)):'尚未上线；回执丢失时撤销后重新接入'}</td><td>${w.revoked_at?'—':`<button class="text-button" data-revoke-worker="${w.id}">撤销接入</button>`}</td></tr>`).join('') || '<tr><td colspan="4">暂无机器；原生 start 或 Compose 会自动接入内置 worker。</td></tr>'}</tbody></table></div><div class="card-body"><details><summary class="muted">接入码记录 · ${codes.length} 条</summary>${codes.map(c=>`<div class="settings-row"><span class="mono">${c.id.slice(0,8)}</span><span>${c.revoked_at?'已撤销':c.consumed_at?'已消费':c.expires_at*1000<Date.now()?'已过期':'等待接入'}</span>${!c.revoked_at&&!c.consumed_at&&c.expires_at*1000>Date.now()?`<button data-revoke-code="${c.id}">撤销</button>`:''}</div>`).join('')}</details></div>`;
}
async function renderUsers() {
  const users = await api('/users');
  $('#users').innerHTML = `<div class="table-wrap"><table><thead><tr><th>账号</th><th>角色</th><th>状态</th><th>操作</th></tr></thead><tbody>${users.map(u => `<tr><td>${escapeHTML(u.username)}</td><td>${u.role === 'admin' ? '管理员' : '维护者'}</td><td><span class="badge ${u.active ? 'success' : 'neutral'}">${u.active ? '可用' : '已停用'}</span></td><td>${u.id===state.user.id ? '<span class="muted">当前账号</span>' : `<button class="text-button" data-user="${u.id}" data-active="${u.active ? '0' : '1'}">${u.active ? '停用' : '启用'}</button>`}</td></tr>`).join('')}</tbody></table></div>`;
}
function setMode(mode) {
  state.mode = mode; state.pending = null; $('#metadata-fields').hidden = true; $('#import-error').textContent = '';
  document.querySelectorAll('#metadata-fields input').forEach(input => { input.required = false; input.value = ''; input.closest('label').hidden = false; });
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  $('#import-input').innerHTML = mode === 'url' ? '<label>公开 ZIP 下载链接<input name="url" type="url" required placeholder="https://example.com/skill.zip" maxlength="2048"></label><p class="hint">仅支持公开下载包，普通网页和内网链接无法导入。</p>' : `<div class="upload-zone"><h3>${mode === 'directory' ? '选择含 SKILL.md 的目录' : '选择 Skill ZIP 包'}</h3><input type="file" name="${mode === 'directory' ? 'files' : 'file'}" ${mode === 'directory' ? 'webkitdirectory multiple' : 'accept=".zip,application/zip"'} required aria-label="${mode === 'directory' ? '选择目录' : '选择 ZIP 文件'}"><p>ZIP 最多 16 MiB · 单文件最多 4 MiB · 最多 500 个文件</p></div>`;
}
function openImport(existing = false) {
  $('#import-form').reset(); setMode('upload'); state.importSkill = existing ? state.detail : null;
  $('#import-title').textContent = existing ? '导入新版本 · ' + state.detail.name : '导入 Skill';
  $('#import-dialog').showModal();
}
$('#import-form').onsubmit = async event => {
  event.preventDefault(); const button = $('button[type=submit]',event.target); button.disabled = true; $('#import-error').textContent = '';
  try {
    const form = new FormData(event.target); if (state.importSkill) form.set('name',state.importSkill.slug);
    if (!state.pending && state.mode === 'directory') { form.delete('files'); for (const file of $('#import-input input').files) form.append('files', file, file.webkitRelativePath || file.name); }
    const result = state.pending ? await api('/import/complete', {method:'POST',body:{import_token:state.pending, name:form.get('name') || '',version:form.get('version') || ''}}) : state.mode === 'url' ? await api('/import/url', {method:'POST',body:Object.fromEntries(form)}) : await api('/import/' + state.mode, {method:'POST',body:form});
    if (result.needs_metadata) {
      state.pending = result.import_token;
      $('#import-input input').disabled = true;
      $('#metadata-fields').hidden = false;
      for (const key of ['name','version']) { const input = $(`[name="${key}"]`, $('#metadata-fields')); input.required = result.needs_metadata.includes(key); input.closest('label').hidden = !input.required; }
      $(`[name="${result.needs_metadata[0]}"]`, $('#metadata-fields')).focus(); return;
    }
    $('#import-dialog').close(); notice(result.reused ? '相同内容已登记，已打开原版本' : '导入成功');
    if (location.hash === '#skill/' + result.skill_id) await detail(result.skill_id,result.version_id); else location.hash = '#skill/' + result.skill_id;
  } catch(error) { $('#import-error').textContent = error.message; } finally { button.disabled = false; }
};
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.mode) return setMode(button.dataset.mode);
  if (button.dataset.file) return showFile(button.dataset.file);
  if (button.dataset.user) return busy(button, async()=>{await api('/users/'+button.dataset.user,{method:'PATCH',body:{active:button.dataset.active==='1'}});await renderUsers();});
  const action = button.dataset.action;
  if (action === 'import' || action === 'import-version') openImport(action === 'import-version');
  if (action === 'audit') openAudit();
  if (action === 'repair') openRepair();
  if(button.dataset.publishRepair)busy(button,async()=>{await api('/repairs/'+button.dataset.publishRepair+'/publish',{method:'POST'});await route();notice('新版本已登记');});
  if (action === 'refresh') busy(button,route);
  if (button.dataset.cancelTask) busy(button,async()=>{await api('/tasks/'+button.dataset.cancelTask+'/cancel',{method:'POST'});await route();});
  if (button.dataset.revokeWorker) busy(button,async()=>{await api('/workers/'+button.dataset.revokeWorker,{method:'DELETE'});await renderWorkers();notice('接入已撤销');});
  if (button.dataset.revokeCode) busy(button,async()=>{await api('/worker-enrollments/'+button.dataset.revokeCode,{method:'DELETE'});await renderWorkers();});
  if (action === 'probe-model') busy(button,async()=>{const m=await api('/model/probe',{method:'POST'});await settings();notice(m.ready?'模型能力检测通过':'检测未通过：'+m.failure_code);});
  if (action === 'enroll-worker') busy(button,async()=>{const code=await api('/worker-enrollments',{method:'POST'});$('#enrollment').hidden=false;$('#enrollment').innerHTML='<p>接入码仅显示这一次，10 分钟有效。</p><pre id="one-time-code" class="code"></pre><p class="hint">在另一台机器运行下方命令，再隐藏输入接入码。</p><pre id="join-command" class="code"></pre>';$('#one-time-code').textContent=code.code;$('#join-command').textContent='skill-mng worker join --server '+location.origin+'\n'+'skill-mng worker start';await renderWorkers();});
  if (action === 'close-import') $('#import-dialog').close();
  if (action === 'set-current') busy(button, async()=>{await api('/skills/'+state.detail.id+'/current',{method:'PUT',body:{version_id:state.version}});await detail(state.detail.id,state.version);notice('当前版本已切换');});
  if (action === 'set-owner') busy(button, async()=>{await api('/skills/'+state.detail.id+'/owner',{method:'PUT',body:{owner_id:$('#owner-select').value}});await detail(state.detail.id,state.version);notice('维护者已更新');});
});
$('#logout').onclick = () => busy($('#logout'),async()=>{await api('/logout',{method:'POST'});state.user=null;await init();});
window.addEventListener('hashchange',()=>{window.scrollTo(0,0);route();});
init();

setInterval(()=>{if(state.user && document.visibilityState==='visible'){if(location.hash==='#tasks')taskList().catch(()=>{});else if(location.hash.startsWith('#task/') && state.taskPending)taskDetail(location.hash.slice(6)).catch(()=>{});}},5000);
