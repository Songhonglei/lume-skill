'use strict';

// Shared presentation state stays separate from immutable server records.
const view = {
  library: {q: '', mine: false, verdict: ''},
  positions: new Map(), versions: new Map(), readers: new Map(), selections: new Map(),
  findingFilters: new Map(), findingQueries: new Map(), findingPages: new Map(), route: '', render: 0, navigation: 0, pollBusy: false,
};

function clearSessionView() {
  view.modelDraft=null;view.settingsTab=null;view.selections.clear();view.positions.clear();view.versions.clear();view.findingFilters.clear();view.findingQueries.clear();view.findingPages.clear();++view.navigation;view.library={q:'',mine:false,verdict:''};++view.render;
}

function libraryStatus(audit) {
  if (!audit) return 'none';
  if (['queued','running','cancelling'].includes(audit.state)) return 'active';
  if (['failed','waiting_configuration','cancelled'].includes(audit.state)) return 'attention';
  if (audit.mode==='static' && audit.verdict!=='fail' && audit.verdict!=='error') return 'review_required';
  return audit.verdict||'review_required';
}
function matchesAuditStatus(audit, filter) {
  const value=libraryStatus(audit);
  return !filter || (filter==='attention'?['attention','fail','error','review_required'].includes(value):value===filter);
}
function filteredFindings(findings, filter='all', query='') {
  const q=query.trim().toLocaleLowerCase();
  return findings.filter(finding=>(filter==='all'||(filter==='review'?finding.reviewRequired:finding.severity===filter))&&(!q||[finding.ruleId,finding.file,finding.message,finding.suggestion,finding.verification].join(' ').toLocaleLowerCase().includes(q)));
}
function selectFindings(selected, findings) {
  findings.filter(finding=>!finding.reviewRequired).forEach(finding=>selected.add(finding.id));
}
async function copyText(text, title='内容', opener=document.activeElement) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(text);notice(title+'已复制');
  } catch {
    const panel=openPanel('复制'+title,'<p class="hint">请手动复制下方内容。</p><textarea class="copy-fallback" readonly aria-label="待复制内容" rows="10"></textarea><div class="dialog-foot"><button data-copy-select>全选</button><button data-copy-close>完成</button></div>',{opener});
    const field=$('textarea',panel);field.value=text;
    $('[data-copy-select]',panel).onclick=()=>{field.focus();field.select();};
    $('[data-copy-close]',panel).onclick=()=>panel.close();field.focus();field.select();
  }
}

function statusTone(value) {
  if (['pass', 'published', 'online', 'saved'].includes(value)) return 'success';
  if (['fail', 'failed', 'error', 'revoked'].includes(value)) return 'danger';
  if (['review_required', 'needs_attention', 'waiting_configuration', 'ready'].includes(value)) return 'warning';
  if (['running', 'editing', 'reauditing', 'cancelling', 'queued'].includes(value)) return 'active';
  return 'neutral';
}
function badge(value, text) {
  return `<span class="badge ${statusTone(value)}"><span class="status-dot" aria-hidden="true"></span>${escapeHTML(text ?? labels[value] ?? value ?? '未审计')}</span>`;
}
function auditConclusion(audit) {
  if (audit.verdict === 'error') return {tone:'error',text:labels.error};
  if (audit.mode === 'static') return audit.verdict === 'fail' ? {tone:'fail',text:'预检不通过'} : {tone:'review_required',text:'预检待复核'};
  return {tone:audit.verdict,text:audit.verdict === 'pass' ? '审计通过' : labels[audit.verdict] || '待复核'};
}
function auditBadge(audit) {
  if (!audit) return badge('neutral', '未审计');
  if (!['succeeded', 'failed', 'cancelled'].includes(audit.state) && audit.state) return badge(audit.state);
  if (audit.state === 'failed' || audit.state === 'cancelled') return badge(audit.state);
  // A static score must never acquire the visual meaning of a complete PASS.
  const conclusion=auditConclusion(audit);
  return badge(conclusion.tone,conclusion.text);
}
function fmtShortDate(value) {
  return value ? new Date(value).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false}) : '—';
}
function liveUpdate() {
  return '<div id="live-update" class="live-update" role="status" hidden><span>有新进展</span><button data-ui="apply-update">刷新</button></div>';
}
function emptyState(title, message, action = '') {
  return `<div class="empty"><img src="/static/icon.svg" width="38" height="38" alt=""><h2>${escapeHTML(title)}</h2><p>${escapeHTML(message)}</p>${action}</div>`;
}
function pageHeading(title, subtitle = '', actions = '') {
  return `<div class="page-head"><div><h1>${escapeHTML(title)}</h1>${subtitle ? `<p class="subtitle">${escapeHTML(subtitle)}</p>` : ''}</div><div class="actions">${actions}</div></div>${liveUpdate()}`;
}
function openPanel(title, content, {drawer = false, subtitle = '', className = '', opener = document.activeElement} = {}) {
  const dialog = document.createElement('dialog');
  const id = 'panel-' + crypto.randomUUID();
  dialog.className = `${drawer ? 'drawer' : 'workspace-dialog'} ${className}`;
  dialog.setAttribute('aria-labelledby', id);
  dialog.innerHTML = `<div class="dialog-head"><div><h2 id="${id}">${escapeHTML(title)}</h2>${subtitle ? `<p class="subtitle">${escapeHTML(subtitle)}</p>` : ''}</div><button type="button" class="icon-button" aria-label="关闭">×</button></div><div class="dialog-body">${content}</div>`;
  $('.icon-button', dialog).onclick = () => dialog.close();
  dialog.addEventListener('click', event => { if (event.target === dialog && event.clientX < dialog.getBoundingClientRect().left) dialog.close(); });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (opener?.isConnected) opener.focus({preventScroll:true});
  }, {once:true});
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
function safeMarkdownURL(raw) {
  if (/[\u0000-\u0020\u007f]/.test(raw)) return null;
  if (raw.startsWith('#')) return raw;
  if (!/^https?:\/\//i.test(raw)) return null;
  try { const url = new URL(raw); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
function inlineMarkdown(text) {
  const tokens = /`([^`\n]+)`|!\[([^\]]*)\]\(([^)]*)\)|\[([^\]]+)\]\(([^)]*)\)|\*\*([^*\n]+)\*\*/g;
  let html = '', cursor = 0;
  for (const match of text.matchAll(tokens)) {
    html += escapeHTML(text.slice(cursor, match.index));
    if (match[1] !== undefined) html += `<code>${escapeHTML(match[1])}</code>`;
    else if (match[2] !== undefined) html += `<span class="muted">[图片：${escapeHTML(match[2] || '未显示')}，地址见原文]</span>`;
    else if (match[4] !== undefined) {
      const url = safeMarkdownURL(match[5]);
      html += url ? url.startsWith('#') ? `<button type="button" class="inline-anchor" data-md-anchor="${escapeHTML(url.slice(1))}">${escapeHTML(match[4])}</button>` : `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(match[4])}</a>` : escapeHTML(match[4]);
    } else html += `<strong>${escapeHTML(match[6])}</strong>`;
    cursor = match.index + match[0].length;
  }
  return html + escapeHTML(text.slice(cursor));
}
function renderMarkdown(source, prefix = 'document') {
  // Render a bounded reading view. Raw HTML, remote images and executable URLs stay inert.
  const limited = source.length > 250000;
  const lines = source.slice(0, 250000).replace(/\r\n/g, '\n').split('\n');
  const toc = [], out = [];
  let i = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0 && end < 80) {
      out.push(`<details class="frontmatter"><summary>文件信息</summary><pre>${escapeHTML(lines.slice(1, end).join('\n'))}</pre></details>`);
      i = end + 1;
    }
  }
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*(```|~~~)/.test(line)) {
      const marker = line.trim().slice(0, 3), code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) code.push(lines[i++]);
      out.push(`<pre><code>${escapeHTML(code.join('\n'))}</code></pre>`); i++; continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const id = `${prefix}-h-${toc.length}`, depth = heading[1].length;
      toc.push({id, depth, title:heading[2]});
      out.push(`<h${depth} id="${id}">${inlineMarkdown(heading[2])}</h${depth}>`); i++; continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (i + 1 < lines.length && line.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1])) {
      const cells = row => row.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      out.push('<div class="table-wrap"><table><thead><tr>' + cells(line).map(cell => `<th>${inlineMarkdown(cell)}</th>`).join('') + '</tr></thead><tbody>');
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) out.push('<tr>' + cells(lines[i++]).map(cell => `<td>${inlineMarkdown(cell)}</td>`).join('') + '</tr>');
      out.push('</tbody></table></div>'); continue;
    }
    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line), pattern = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
      const tag = ordered ? 'ol' : 'ul'; out.push(`<${tag}>`);
      while (i < lines.length && pattern.test(lines[i])) out.push(`<li>${inlineMarkdown(lines[i++].replace(pattern, ''))}</li>`);
      out.push(`</${tag}>`); continue;
    }
    if (/^>\s?/.test(line)) { out.push(`<blockquote>${inlineMarkdown(line.replace(/^>\s?/, ''))}</blockquote>`); i++; continue; }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|~~~|>\s|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i])) paragraph.push(lines[i++]);
    out.push(`<p>${inlineMarkdown(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`);
  }
  if (limited) out.push('<p class="info-line">仅显示前 250,000 个字符，完整内容见原文或下载文件。</p>');
  return {html:out.join(''), toc};
}
function sourceLines(source, selected = 0, start = 1) {
  return `<ol class="source-lines" start="${start}">${source.split('\n').map((line, index) => `<li value="${start+index}" ${start+index === selected ? 'class="highlight-line" tabindex="-1"' : ''}><code>${escapeHTML(line) || ' '}</code></li>`).join('')}</ol>`;
}
function mountReader(host, source, {markdown = true, line = 0, title = '文档', rawId = ''} = {}) {
  host.classList.add('document-reader');
  const prefix = 'reader-' + crypto.randomUUID();
  const result = markdown ? renderMarkdown(source, prefix) : {toc:[], html:''};
  host.innerHTML = `<div class="reader-toolbar"><span>${escapeHTML(title)}</span><div class="actions"><button type="button" data-reader-copy>复制原文</button>${result.toc.length?'<button type="button" class="reader-toc-toggle" data-reader-toc aria-expanded="false">目录</button>':''}<div class="segmented" role="group" aria-label="文档显示方式">${markdown ? '<button type="button" data-reader="read" aria-pressed="true">阅读</button>' : ''}<button type="button" data-reader="source" aria-pressed="${!markdown}">原文</button></div></div></div><div class="reader-layout ${!result.toc.length ? 'no-toc' : ''}"><nav class="document-toc" aria-label="文档目录" ${!result.toc.length ? 'hidden' : ''}>${result.toc.map(item => `<button type="button" data-toc="${item.id}" class="depth-${Math.min(item.depth,3)}">${escapeHTML(item.title)}</button>`).join('')}</nav><article class="markdown" ${!markdown ? 'hidden' : ''}>${result.html}</article></div><div class="raw-document" ${rawId ? `id="${rawId}"` : ''} ${markdown ? 'hidden' : ''}>${sourceLines(source, Number(line))}</div>`;
  const copyButton=$('[data-reader-copy]',host);copyButton.onclick=()=>busy(copyButton,()=>copyText(source,'原文',copyButton));
  const tocToggle=$('[data-reader-toc]',host);
  if (tocToggle) tocToggle.onclick=()=>{const open=host.classList.toggle('toc-open');tocToggle.setAttribute('aria-expanded',String(open));};
  const toggle = mode => {
    $('.reader-layout', host).hidden = mode === 'source';
    $('.raw-document', host).hidden = mode !== 'source';
    host.querySelectorAll('[data-reader]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.reader === mode)));
  };
  host.querySelectorAll('[data-reader]').forEach(button => button.onclick = () => toggle(button.dataset.reader));
  host.querySelectorAll('[data-toc]').forEach(button => button.onclick = () => {document.getElementById(button.dataset.toc)?.scrollIntoView({behavior:'auto',block:'start'});host.classList.remove('toc-open');tocToggle?.setAttribute('aria-expanded','false');});
  host.querySelectorAll('[data-md-anchor]').forEach(button=>button.onclick=()=>{
    const slug=text=>text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu,'').trim().replace(/\s+/g,'-');
    let target=button.dataset.mdAnchor;
    try {target=decodeURIComponent(target);} catch {return;}
    const heading=result.toc.find(item=>slug(item.title)===slug(target));
    if (heading) document.getElementById(heading.id)?.scrollIntoView({block:'start'});
  });
  if (line) { toggle('source'); requestAnimationFrame(() => $('.highlight-line',host)?.scrollIntoView({block:'center'})); }
}

document.addEventListener('keydown',event=>{
  const tab=event.target.closest('[role=tab]');
  if (!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  const tabs=[...tab.closest('[role=tablist]').querySelectorAll('[role=tab]')];
  const current=tabs.indexOf(tab), index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(current+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  event.preventDefault();tabs[index].focus();tabs[index].click();
});
document.addEventListener('click',event=>{
  if (event.target.closest('.skip-link')) {event.preventDefault();$('#main').focus();}
  if (!event.target.closest('.more-menu')) document.querySelectorAll('.more-menu[open]').forEach(menu=>menu.open=false);
});
document.addEventListener('toggle',event=>{
  const menu=event.target;
  if (!menu.matches('.more-menu[open]')) return;
  document.querySelectorAll('.more-menu[open]').forEach(other=>{if(other!==menu)other.open=false;});
  const popup=$('div',menu), rect=$('summary',menu).getBoundingClientRect();
  popup.style.left=Math.max(12,Math.min(window.innerWidth-popup.offsetWidth-12,rect.right-popup.offsetWidth))+'px';
  popup.style.top=Math.min(window.innerHeight-popup.offsetHeight-12,rect.bottom+6)+'px';
},true);

function closeFloatingMenus() { document.querySelectorAll('.more-menu[open]').forEach(menu=>menu.open=false); }
window.addEventListener('scroll',closeFloatingMenus,{passive:true,capture:true});
window.addEventListener('resize',closeFloatingMenus,{passive:true});
