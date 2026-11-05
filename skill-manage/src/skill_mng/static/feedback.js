'use strict';

const feedbackNotice=document.getElementById('notice');
let noticeTimer, fieldErrorId=0;
function hideNotice() {
  clearTimeout(noticeTimer);
  if (feedbackNotice.matches(':popover-open')) feedbackNotice.hidePopover();
  feedbackNotice.hidden=true;
}
function notice(message) {
  hideNotice();
  // A modal dialog makes the rest of the page inert; keep close usable there too.
  const parent=[...document.querySelectorAll('dialog[open]')].at(-1)||document.body;
  if (feedbackNotice.parentElement!==parent) parent.append(feedbackNotice);
  $('#notice-message',feedbackNotice).textContent=message;
  feedbackNotice.hidden=false;
  if (feedbackNotice.showPopover) feedbackNotice.showPopover();
  noticeTimer=setTimeout(hideNotice,3000);
}
function clearFieldError(input) {
  const id=input.dataset.fieldError;
  if (!id) return;
  document.getElementById(id)?.remove();
  const descriptions=(input.getAttribute('aria-describedby')||'').split(/\s+/).filter(value=>value&&value!==id);
  if (descriptions.length) input.setAttribute('aria-describedby',descriptions.join(' '));else input.removeAttribute('aria-describedby');
  input.removeAttribute('aria-invalid');delete input.dataset.fieldError;
}
function showFieldError(input, message) {
  clearFieldError(input);
  const error=document.createElement('span'), id='field-error-'+(++fieldErrorId);
  error.id=id;error.className='field-error';error.setAttribute('role','alert');error.textContent=message;
  const anchor=input.type==='file'&&$('#import-selection')&&!$('#import-selection').hidden?$('#import-selection'):input.closest('label')||input;
  if(input.type!=='file'&&input.closest('label'))input.closest('label').append(error);else anchor.after(error);
  input.dataset.fieldError=id;input.setAttribute('aria-invalid','true');
  input.setAttribute('aria-describedby',[(input.getAttribute('aria-describedby')||''),id].filter(Boolean).join(' '));
}
function fieldLabel(input) {
  return input.getAttribute('aria-label')||input.closest('label')?.firstChild.textContent.trim()||'此项';
}
function formError(form, error) {
  let first;
  for (const field of error.fields||[]) {
    const input=[...form.elements].find(item=>item.name===field.loc?.at(-1));
    if (!input) continue;
    showFieldError(input,'请检查'+fieldLabel(input)+'的格式');first ||= input;
  }
  // Domain validators return plain messages; map only known format checks.
  if (!first) {
    const formats=[
      [/^账号需为/,['username']], [/^密码请使用/,['password']],
      [/^名称请用/,['name']], [/^版本请用/,['version']],
      [/^目标版本格式无效/,['target_version']],
      [/^模型服务地址需为/,['base_url']], [/^模型密钥格式不正确/,['api_key']],
      [/^模型思考程度无效/,['reasoning_effort']],
      [/^文件路径包含|^包中含有越界/,['allowed_paths','file','files','url']],
      [/^ZIP 不能超过|^请提供有效的 ZIP|^目录文件数不能超过|^单文件不能超过|^目录内容不能超过/,['file','files','url']],
    ];
    for (const [pattern,names] of formats) {
      if (!pattern.test(error.message)) continue;
      const input=[...form.elements].find(item=>names.includes(item.name));
      if (input) {showFieldError(input,error.message);first=input;break;}
    }
  }
  if (first) first.focus();else notice(error.message);
}
document.addEventListener('invalid',event=>{
  event.preventDefault();
  const input=event.target, form=input.form;
  if (!form) return;
  const text=fieldLabel(input), validity=input.validity;
  showFieldError(input,validity.valueMissing?'请填写或选择'+text:validity.typeMismatch?'请填写有效的'+text:validity.tooShort?text+'至少需要 '+input.minLength+' 个字符':validity.patternMismatch?text+'格式不正确':'请检查'+text+'的内容');
  if ([...form.elements].find(field=>field.willValidate&&!field.validity.valid)===input) queueMicrotask(()=>input.focus());
},true);
document.addEventListener('input',event=>clearFieldError(event.target));
document.addEventListener('change',event=>clearFieldError(event.target));
document.addEventListener('click',event=>{if(event.target.closest('[data-notice-close]'))hideNotice();});
document.addEventListener('close',event=>{
  if (event.target.contains(feedbackNotice)) {hideNotice();document.body.append(feedbackNotice);}
},true);
