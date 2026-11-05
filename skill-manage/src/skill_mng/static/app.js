'use strict';
const $ = (selector, parent = document) => parent.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = value => new Date(value).toLocaleString('zh-CN', {hour12:false});
const state = {user:null, skills:[], detail:null, version:null, mode:'upload', pending:null};
let messageId=0;
function confirmAction(title, message, accept='确认') {
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog'), id='message-'+(++messageId);
    dialog.className='message-dialog';dialog.setAttribute('aria-labelledby',id);dialog.setAttribute('aria-describedby',id+'-body');
    dialog.innerHTML=`<form method="dialog"><div class="dialog-head"><h2 id="${id}">${escapeHTML(title)}</h2><button type="button" class="icon-button" aria-label="关闭">×</button></div><p id="${id}-body" class="dialog-message">${escapeHTML(message)}</p><div class="dialog-foot"><button type="button" data-dismiss autofocus>取消</button><button type="submit" class="primary">${escapeHTML(accept)}</button></div></form>`;
    let confirmed=false;
    $('form',dialog).onsubmit=event=>{event.preventDefault();confirmed=true;dialog.close();};
    dialog.querySelectorAll('button[type=button]').forEach(button=>button.onclick=()=>dialog.close());
    dialog.onclose=()=>{dialog.remove();resolve(confirmed);};
    document.body.append(dialog);dialog.showModal();
  });
}
async function api(path, options = {}) {
  const headers = {...options.headers};
  if (state.user?.csrf) headers['X-CSRF-Token'] = state.user.csrf;
  if (options.body && !(options.body instanceof FormData)) { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(options.body); }
  let response, result;
  try { response=await fetch('/api'+path,{...options,headers,credentials:'same-origin'}); }
  catch { throw new Error('连接失败，请检查网络后重试'); }
  try { result=await response.json(); }
  catch { throw new Error('服务响应异常，请稍后重试'); }
  if (!response.ok) { if (response.status === 401 && state.user) { state.user = null; await init(); } const error=new Error(typeof result.detail === 'string' ? result.detail : '输入格式不正确，请检查后重试');if(response.status===422&&Array.isArray(result.detail))error.fields=result.detail;throw error; }
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
  clearSessionView();state.auditContext=null;state.detail=null;state.version=null;state.skills=[];state.taskHistory=null;state.taskEvents=null;state.enrollmentHistory=null;state.taskHistoryRequest=(state.taskHistoryRequest||0)+1;
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  $('#workspace').hidden = true; $('#gate').hidden = false;
  $('#gate').innerHTML = `<div class="brand"><img src="/static/icon.svg" width="30" height="30" alt=""><strong>Skill 工作台</strong></div><h1>${onboard ? '设置你的工作台' : '登录工作台'}</h1>${onboard ? '<p class="muted">创建管理员账号。</p>' : ''}<form id="gate-form">${onboard ? '<label>初始化码<input name="token" type="password" required autocomplete="off"></label><p class="hint">从服务器数据目录的 <code>run/setup-code</code> 读取。</p>' : ''}<label>账号<input name="username" required maxlength="64" autocomplete="username"></label><label>密码<input name="password" type="password" required ${onboard ? 'minlength="12"' : ''} maxlength="256" autocomplete="${onboard ? 'new-password' : 'current-password'}"></label><p class="error" id="gate-error" role="alert"></p><button class="primary" type="submit">${onboard ? '创建并进入' : '登录'}</button></form>`;
  $('#gate-form').onsubmit = async event => {
    event.preventDefault(); const button = $('button[type=submit]', event.target); button.disabled = true;
    try { const body = Object.fromEntries(new FormData(event.target)); if (onboard) await api('/onboard', {method:'POST',body}); state.user = await api('/login', {method:'POST',body:{username:body.username,password:body.password}}); await init(); }
    catch(error) { formError(event.target,error); } finally { button.disabled = false; }
  };
}
async function route() {
  if (!state.user) return;
  const hash = location.hash || '#skills';
  const [path, rawQuery] = hash.slice(1).split('?');
  const params = new URLSearchParams(rawQuery || '');
  ++view.render;
  const navigation=++view.navigation;
  view.route = hash;
  document.querySelectorAll('[data-nav]').forEach(link => {
    const active = link.dataset.nav === 'skills' ? path === 'skills' || path.startsWith('skill/') : link.dataset.nav === 'tasks' ? path === 'tasks' || path.startsWith('task/') || path.startsWith('audit/') : path === 'settings';
    link.classList.toggle('active',active);
    if (active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
  });
  $('#main').setAttribute('aria-busy','true');
  $('#main').innerHTML='<div class="route-loading" role="status"><span class="loading-dot" aria-hidden="true"></span>正在读取页面…</div>';
  try {
    if (path.startsWith('skill/')) await detail(decodeURIComponent(path.slice(6)), params.get('version'), {file:params.get('file'),line:Math.min(1000000,Math.max(0,Number(params.get('line'))||0))});
    else if (path.startsWith('task/')) await taskDetail(decodeURIComponent(path.slice(5)));
    else if (path.startsWith('audit/')) await auditReportDetail(decodeURIComponent(path.slice(6)));
    else if (path === 'tasks') await taskList();
    else if (path === 'settings') await settings();
    else await library();
    document.title = ($('#main h1')?.textContent || 'Skill') + ' · Skill 工作台';
  } catch (error) { if(navigation===view.navigation&&state.user) $('#main').innerHTML=emptyState('页面暂时无法打开',error.message,'<button class="primary" data-ui="retry-route">重试</button><a class="button" href="#skills">返回 Skill 库</a>'); }
  finally { if(navigation===view.navigation) $('#main').removeAttribute('aria-busy'); }
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

function importStatus(message, busy=false) {
  $('#import-status').textContent=message;
  $('#import-status').classList.toggle('is-busy',busy);
}
function updateImportButton() {
  const button=$('#import-form button[type=submit]');
  const error=!!state.importFailed;
  button.hidden=state.mode!=='url'&&!state.pending&&!error;
  button.disabled=!!state.importBusy;
  button.textContent=state.importBusy?'处理中…':state.pending?'完成导入':state.mode==='url'?'下载并导入':'重试导入';
  if (!state.importBusy&&!state.pending&&state.mode!=='url'&&!$('#import-input input')?.files.length) button.disabled=true;
}
function validateImportFiles(files, mode) {
  if(!files.length)return '请先选择'+(mode==='directory'?'目录':'ZIP 文件');
  const total=files.reduce((sum,file)=>sum+file.size,0);
  if(mode!=='directory')return total>16*1024*1024?'ZIP 不能超过 16 MiB':'';
  if(files.length>500)return '目录文件数不能超过 500';
  if(files.some(file=>file.size>4*1024*1024))return '单文件不能超过 4 MiB';
  if(total>32*1024*1024)return '目录内容不能超过 32 MiB';
  const hasRootSkill=files.some(file=>{const path=file.webkitRelativePath||file.name;return path==='SKILL.md'||path.split('/').length===2&&path.endsWith('/SKILL.md');});
  return hasRootSkill?'':'请选择根目录含 SKILL.md 的目录';
}
function setMode(mode) {
  if (state.importBusy) return;
  state.mode=mode;state.pending=null;state.importFailed=false;document.querySelectorAll('#import-form [data-field-error]').forEach(clearFieldError);
  $('#metadata-fields').hidden=true;$('#import-error').textContent='';
  $('#import-selection').hidden=true;$('#import-selection').replaceChildren();
  $('#import-dialog').classList.remove('has-selection');importStatus('');
  document.querySelectorAll('#metadata-fields input').forEach(input=>{input.required=false;input.value='';input.removeAttribute('aria-invalid');input.closest('label').hidden=false;});
  document.querySelectorAll('[data-mode]').forEach(button=>{const active=button.dataset.mode===mode;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});
  $('#import-input').setAttribute('aria-labelledby','import-tab-'+mode);
  $('#import-input').innerHTML=mode==='url'?'<label>ZIP 下载链接<input name="url" type="url" pattern="https?://.+" required placeholder="https://example.com/skill.zip" maxlength="2048"></label><p class="hint">仅支持公开 ZIP 直链，不支持网页或内网地址。</p>':`<div class="upload-zone"><h3>${mode==='directory'?'选择 Skill 目录':'拖入 ZIP 包'}</h3><p>${mode==='directory'?'根目录需包含 SKILL.md。':'包内根目录需包含 SKILL.md。'}选择后自动导入。</p><label class="file-picker"><span class="file-picker-button">${mode==='directory'?'选择本地目录':'选择 ZIP 文件'}</span><input type="file" name="${mode==='directory'?'files':'file'}" ${mode==='directory'?'webkitdirectory multiple':'accept=".zip,application/zip"'} required aria-label="${mode==='directory'?'选择目录':'选择 ZIP 文件'}"></label><p>${mode==='directory'?'总计不超过 32 MiB':'ZIP 不超过 16 MiB'} · 最多 500 个文件</p></div>`;
  if (mode!=='url') {
    const input=$('#import-input input');
    input.onchange=()=>acceptImportSelection([...input.files],mode);
    if (mode==='upload') {
      const zone=$('.upload-zone');
      zone.ondragover=event=>{event.preventDefault();if(!state.importBusy)zone.classList.add('dragover');};
      zone.ondragleave=()=>zone.classList.remove('dragover');
      zone.ondrop=event=>{event.preventDefault();zone.classList.remove('dragover');if(state.importBusy)return;const files=[...event.dataTransfer.files];if(files.length!==1){showFieldError(input,'每次请选择一个 ZIP 包');updateImportButton();return;}const transfer=new DataTransfer();transfer.items.add(files[0]);input.files=transfer.files;acceptImportSelection(files,mode);};
    }
  }
  updateImportButton();
}
function acceptImportSelection(files, mode) {
  $('#import-error').textContent='';
  $('#import-selection').hidden=!files.length;
  $('#import-dialog').classList.toggle('has-selection',!!files.length);
  const total=files.reduce((sum,file)=>sum+file.size,0);
  $('#import-selection').innerHTML=files.length?`<strong>${escapeHTML(mode==='directory'?(files[0].webkitRelativePath||files[0].name).split('/')[0]:files[0].name)}</strong><p class="muted">${files.length} 个文件 · ${(total/1024).toFixed(1)} KiB</p><div class="selection-file-actions"><details><summary>查看文件清单</summary><ul>${files.slice(0,20).map(file=>`<li>${escapeHTML(file.webkitRelativePath||file.name)}</li>`).join('')}${files.length>20?`<li>还有 ${files.length-20} 个文件</li>`:''}</ul></details><button type="button" data-import-change>更换文件</button></div>`:'';
  $('[data-import-change]')?.addEventListener('click',()=>setMode(mode));
  updateImportButton();
  if (!files.length) return;
  const failure=validateImportFiles(files,mode);
  if (failure) {showFieldError($('#import-input input'),failure);importStatus('');updateImportButton();$('#import-form button[type=submit]').disabled=true;return;}
  $('#import-form').requestSubmit();
}
function openImport(existing = false) {
  $('#import-form').reset(); setMode('upload'); state.importSkill = existing ? state.detail : null;
  $('#import-title').textContent = existing ? '导入新版本 · ' + state.detail.name : '导入 Skill';
  $('#import-dialog').showModal();
}
$('#import-dialog').addEventListener('cancel',event=>{if(state.importBusy)event.preventDefault();});
$('#import-form').onsubmit = async event => {
  event.preventDefault();
  if(state.importBusy)return;
  const form = new FormData(event.target); if (state.importSkill) form.set('name',state.importSkill.slug);
  if (!state.pending && state.mode === 'directory') { form.delete('files'); for (const file of $('#import-input input').files) form.append('files', file, file.webkitRelativePath || file.name); }
  state.importBusy=true;state.importFailed=false;$('#import-error').textContent = '';
  const controls=[...event.target.elements], disabled=controls.map(control=>control.disabled);
  controls.forEach(control=>control.disabled=true);
  $('#import-form').setAttribute('aria-busy','true');
  importStatus(state.pending?'正在登记版本…':state.mode==='url'?'正在下载并检查包…':'正在上传并检查…',true);updateImportButton();
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),120000);
  try {
    const result = state.pending ? await api('/import/complete', {method:'POST',signal:controller.signal,body:{import_token:state.pending, name:form.get('name') || '',version:form.get('version') || ''}}) : state.mode === 'url' ? await api('/import/url', {method:'POST',signal:controller.signal,body:Object.fromEntries(form)}) : await api('/import/' + state.mode, {method:'POST',signal:controller.signal,body:form});
    if (result.needs_metadata) {
      state.pending = result.import_token;
      $('#metadata-fields').hidden = false;
      for (const key of ['name','version']) { const input = $(`[name="${key}"]`, $('#metadata-fields')); input.required = result.needs_metadata.includes(key); input.closest('label').hidden = !input.required; }
      importStatus('检查完成，请补填'+result.needs_metadata.map(key=>key==='name'?'名称':'版本').join('和')+'。');
      return;
    }
    $('#import-dialog').close(); notice(result.reused ? '相同内容已登记，已打开原版本' : '导入成功');
    if (location.hash === '#skill/' + result.skill_id) await detail(result.skill_id,result.version_id); else location.hash = '#skill/' + result.skill_id;
  } catch(error) { state.importFailed=true;formError(event.target,controller.signal.aborted?new Error('导入超时，请先到 Skill 库确认是否已导入，再重试。'):error);importStatus(''); }
  finally {
    clearTimeout(timeout);
    state.importBusy=false;controls.forEach((control,index)=>control.disabled=disabled[index]);
    // Metadata inputs were enabled before the upload; lock the acquired file, not the draft fields.
    if(state.pending)$('#import-input input').disabled=true;
    $('#import-form').removeAttribute('aria-busy');$('#import-status').classList.remove('is-busy');updateImportButton();
    if(state.pending&&!$('#metadata-fields').hidden)$('input:required', $('#metadata-fields'))?.focus();
  }
};
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.mode) return setMode(button.dataset.mode);
  if (button.dataset.file) return showFile(button.dataset.file);
  if (button.dataset.user) return busy(button, async()=>{if(button.dataset.active==='0'&&!await confirmAction('停用账号','停用后无法登录，已有会话也会失效。','停用账号'))return;await api('/users/'+button.dataset.user,{method:'PATCH',body:{active:button.dataset.active==='1'}});await renderUsers();});
  const action = button.dataset.action;
  if (action === 'import' || action === 'import-version') openImport(action === 'import-version');
  if (action === 'audit') openAudit();
  if (action === 'repair') openRepair();
  if(button.dataset.publishRepair)busy(button,async()=>{await api('/repairs/'+button.dataset.publishRepair+'/publish',{method:'POST'});await route();notice('新版本已登记');});
  if (action === 'refresh') busy(button,route);
  if (button.dataset.cancelTask) busy(button,async()=>{if(!await confirmAction('停止任务','停止任务后不再接收结果，已发出的模型请求可能仍在处理。','停止任务'))return;await api('/tasks/'+button.dataset.cancelTask+'/cancel',{method:'POST'});await route();});
  if (button.dataset.revokeWorker) busy(button,async()=>{if(!await confirmAction('撤销机器接入','撤销后，这台机器将无法领取任务或提交结果。重新使用需要新的接入码。','撤销接入'))return;await api('/workers/'+button.dataset.revokeWorker,{method:'DELETE'});await renderWorkers();notice('接入已撤销');});
  if (button.dataset.revokeCode) busy(button,async()=>{if(!await confirmAction('撤销接入码','撤销后立即失效，接入机器需重新生成。','撤销接入码'))return;await api('/worker-enrollments/'+button.dataset.revokeCode,{method:'DELETE'});await renderWorkers();});
  if (action === 'probe-model') busy(button,async()=>{if(view.modelDraft){notice('请先保存配置，再检测能力');return;}const m=await api('/model/probe',{method:'POST'});await settings();notice(m.ready?'模型能力检测通过':'检测未通过：'+m.failure_code);});
  if (['history-refresh','history-clear'].includes(action)) busy(button,async()=>{if(action==='history-clear')state.taskHistory.filters={};resetList('tasks');await taskList();});
  if (action === 'events-refresh') busy(button,async()=>{const task=await api('/tasks/'+encodeURIComponent(state.eventsTask.id));resetList('events:'+task.id);await taskEvents(task);});
  if (action === 'enroll-worker') busy(button,async()=>{const code=await api('/worker-enrollments',{method:'POST'});$('#enrollment').hidden=false;$('#enrollment').innerHTML='<p>接入码仅显示这一次，10 分钟有效。</p><pre id="one-time-code" class="code"></pre><p class="hint">在目标机器运行下方命令，按提示输入接入码（输入时不可见）。</p><pre id="join-command" class="code"></pre>';$('#one-time-code').textContent=code.code;$('#join-command').textContent='skill-mng worker join --server '+location.origin+'\n'+'skill-mng worker start';await renderWorkers();});
  if (action === 'close-import') $('#import-dialog').close();
  if (action === 'set-current') busy(button, async()=>{await api('/skills/'+state.detail.id+'/current',{method:'PUT',body:{version_id:state.version}});await detail(state.detail.id,state.version);notice('当前版本已切换');});
  if (action === 'set-owner') busy(button, async()=>{await api('/skills/'+state.detail.id+'/owner',{method:'PUT',body:{owner_id:$('#owner-select').value}});await detail(state.detail.id,state.version);notice('维护者已更新');});
});
$('#logout').onclick = () => busy($('#logout'),async()=>{await api('/logout',{method:'POST'});state.user=null;clearSessionView();state.auditContext=null;state.taskHistory=null;state.taskEvents=null;state.enrollmentHistory=null;state.taskHistoryRequest=(state.taskHistoryRequest||0)+1;await init();});
document.addEventListener('click',event=>{
  const link=event.target.closest('a[href^="#"]');
  if (link) view.positions.set(view.route,window.scrollY);
});
window.addEventListener('hashchange',async()=>{
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  await route();
  if (!new URLSearchParams(location.hash.split('?')[1]||'').has('line')) window.scrollTo(0,view.positions.get(location.hash)||0);
});
init();

setInterval(pollWorkspace, 5000);
