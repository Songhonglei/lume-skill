'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const context = vm.createContext({
  URL, URLSearchParams, console,
  document:{addEventListener(){}}, window:{addEventListener(){}},
  escapeHTML:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  labels:{pass:'通过',fail:'不通过',review_required:'待复核',succeeded:'已完成',failed:'执行失败'},
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/skill_mng/static/ui.js'),'utf8'),context);
const render=source=>context.renderMarkdown(source,'test');

test('uploaded HTML, executable links and remote image URLs stay inert',()=>{
  const source='<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert)\n\n[data](data:text/html,payload)\n\n![tracker](https://example.com/collect.gif)\n\n[good](https://example.com/docs?q=a&b=c)';
  const html=render(source).html;
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('href="data:'));
  assert.match(html,/href="https:\/\/example.com\/docs\?q=a&amp;b=c"/);
  assert.match(html,/rel="noopener noreferrer"/);
});
test('heading IDs are generated, code is escaped and frozen text is untouched',()=>{
  const source='# <img onerror=x>\n\n## Evidence\n\n```html\n<script>unsafe()</script>\n```\n\n| Rule | Status |\n| --- | --- |\n| D1 | pass |';
  const result=render(source);
  assert.equal(result.toc.length,2);
  assert.equal(result.toc[0].id,'test-h-0');
  assert.ok(result.html.includes('&lt;script&gt;unsafe()&lt;/script&gt;'));
  assert.ok(result.html.includes('<table>'));
  assert.ok(!result.html.includes('<img'));
  assert.ok(source.startsWith('# <img'));
});
test('static scores never look like completed semantic PASS',()=>{
  assert.match(context.auditBadge({mode:'static',state:'succeeded',verdict:'pass'}),/预检待复核/);
  assert.ok(!context.auditBadge({mode:'static',state:'succeeded',verdict:'pass'}).includes('success'));
  assert.match(context.auditBadge({mode:'full',state:'succeeded',verdict:'pass'}),/审计通过/);
  assert.match(context.auditBadge({mode:'full',state:'running',verdict:'pass'}),/active/);
  assert.equal(context.auditConclusion({mode:'static',verdict:'pass'}).tone,'review_required');
  assert.equal(context.auditConclusion({mode:'static',verdict:'pass'}).text,'预检待复核');
  assert.equal(context.auditConclusion({mode:'static',verdict:'fail'}).tone,'fail');
  assert.equal(context.auditConclusion({mode:'static',verdict:'error'}).tone,'error');
  assert.equal(context.auditConclusion({mode:'full',verdict:'pass'}).tone,'pass');
});
test('large reading views are bounded and code line anchors escape target content',()=>{
  const result=render('content '.repeat(40000));
  assert.match(result.html,/250,000/);
  const lines=context.sourceLines('first\n<img src=x onerror=y>\nlast',7,6);
  assert.ok(lines.includes('class="highlight-line"'));
  assert.ok(lines.includes('&lt;img'));
  assert.ok(!lines.includes('<img'));
  assert.ok(lines.includes('value="7"'));
});

test('leaving a session clears model credentials, selections and navigation memory',()=>{
  vm.runInContext("view.modelDraft={api_key:'synthetic-session-secret'};view.settingsTab='model';view.selections.set('audit',new Set(['finding']));view.positions.set('#skills',120);view.versions.set('skill','version');view.findingFilters.set('audit','ERR');view.findingQueries.set('audit','private-query');view.findingPages.set('audit',3);view.library.q='private-search';",context);
  const previous=vm.runInContext('view.render',context);
  context.clearSessionView();
  assert.equal(vm.runInContext('view.modelDraft',context),null);
  assert.equal(vm.runInContext('view.settingsTab',context),null);
  assert.equal(vm.runInContext('view.library.q',context),'');
  assert.equal(vm.runInContext('view.selections.size+view.positions.size+view.versions.size+view.findingFilters.size+view.findingQueries.size+view.findingPages.size',context),0);
  assert.ok(vm.runInContext('view.render',context)>previous);
});

test('quick filters keep static review, execution failures and current activity distinct',()=>{
  assert.equal(context.libraryStatus(null),'none');
  assert.equal(context.libraryStatus({mode:'static',verdict:'pass',state:'succeeded'}),'review_required');
  assert.ok(context.matchesAuditStatus({mode:'static',verdict:'pass',state:'succeeded'},'attention'));
  assert.ok(context.matchesAuditStatus({verdict:'pass',state:'failed'},'attention'));
  assert.ok(!context.matchesAuditStatus({verdict:'pass',state:'running'},'pass'));
  assert.ok(context.matchesAuditStatus({verdict:'pass',state:'running'},'active'));
  assert.ok(!context.matchesAuditStatus({mode:'full',verdict:'pass',state:'succeeded'},'attention'));
});
test('issue search treats input literally and selection excludes review-only findings',()=>{
  const rows=[{id:'first',severity:'ERR',ruleId:'D1-E1',file:'scripts/a.py',message:'syntax',reviewRequired:false},{id:'review',severity:'ERR',ruleId:'D2-E1',file:'scripts/b.py',message:'syntax',reviewRequired:true},{id:'warning',severity:'WARN',ruleId:'D3-W1',file:'readme.md',message:'note',reviewRequired:false}];
  assert.equal(context.filteredFindings(rows,'ERR','SCRIPTS/').length,2);
  assert.equal(context.filteredFindings(rows,'review','syntax')[0].id,'review');
  assert.equal(context.filteredFindings(rows,'all','.*').length,0);
  const selected=new Set(['existing']);context.selectFindings(selected,rows.slice(0,2));
  assert.deepEqual([...selected],['existing','first']);
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/skill_mng/static/lists.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/skill_mng/static/workspace.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/skill_mng/static/settings.js'),'utf8'),context);

test('published repairs expose both versions and link directly to the report',()=>{
  const html=context.taskRows([{id:'repair',kind:'repair',skill_id:'skill',skill_name:'Sample',version_id:'source',version:'1.0.0',published_version_id:'published',published_version:'1.0.1',report_available:true,state:'succeeded',repair_state:'published'}]);
  assert.match(html,/version=source"[^>]+aria-label="源版本 1\.0\.0"/);
  assert.match(html,/version=published"[^>]+aria-label="新版本 1\.0\.1"/);
  assert.match(html,/#task\/repair\?view=report/);
});

test('compact file paging only offers navigation for multiple pages',()=>{
  const single=context.paginationHTML('files',{total:2,items:[],pages:1},true);
  assert.match(single,/共 2 条/);
  assert.doesNotMatch(single,/<button|<select/);
  const multiple=context.paginationHTML('files',{total:35,items:[],page:0,pages:2,hasMore:true},true);
  assert.match(multiple,/aria-label="下一页"/);
  assert.doesNotMatch(multiple,/<select/);
});

test('remote worker instructions require an HTTPS address outside loopback',()=>{
  for (const origin of ['', 'http://workbench.example', 'https://127.0.0.2', 'https://[::1]', 'https://localhost']) {
    assert.equal(context.remoteWorkerOrigin(origin),'');
  }
  assert.equal(context.remoteWorkerOrigin('https://workbench.example:8443'),'https://workbench.example:8443');
});

test('finding pagination clamps on filter changes without selecting hidden rows',()=>{
  context.state={auditContext:{audit:{id:'paged'},result:{findings:Array.from({length:61},(_,i)=>({id:'item-'+i,severity:'ERR',file:'scripts/'+i+'.py',message:'syntax',reviewRequired:i===0}))}}};
  vm.runInContext("view.findingFilters.set('paged','all');view.findingQueries.set('paged','');listState('findings:paged').page=1",context);
  const page=context.findingPage();assert.equal(page.items.length,20);assert.equal(page.items[0].id,'item-20');assert.equal(page.total,61);
  const selected=new Set();context.selectFindings(selected,page.items);assert.equal(selected.size,20);assert.ok(!selected.has('item-0'));
  vm.runInContext("view.findingQueries.set('paged','scripts/60.py')",context);
  const filtered=context.findingPage();assert.equal(filtered.page,0);assert.equal(filtered.items.length,1);assert.equal(filtered.items[0].id,'item-60');
});

context.fmtDate=value=>String(value);
test('Skill results show one field per information cell and visible frequent actions',()=>{
  const skill={id:'skill',name:'Long <Skill>',description:'Details belong in the detail page',current_version:'1.0.0',current_version_id:'version',version_count:12,owner:'Owner',updated_at:'2026-11-04T08:00:00Z',can_write:true,latest_audit:{id:'audit',task_id:'task',mode:'static',state:'succeeded',verdict:'fail',delivery_status:'saved',error_count:2,warning_count:3}};
  const html=context.skillRow(skill), visible=html.replace(/<[^>]*>/g,'');
  assert.equal((html.match(/<td[ >]/g)||[]).length,8);
  assert.ok(!html.includes('<p')&&!html.includes('<br'));
  assert.ok(!visible.includes(skill.description)&&!visible.includes('12 个版本'));
  assert.ok(html.includes('Long &lt;Skill&gt;'));
  assert.equal((html.match(/row-primary/g)||[]).length,4);
  assert.ok(!html.includes('more-menu'));
  for(const action of ['审计','报告','详情','下载']) assert.ok(visible.includes(action));
  assert.match(html,/data-preview-filter="ERR"[^>]*>2<\/button>/);
  assert.match(html,/data-label="维护者"/);assert.match(html,/data-label="最近活动"/);
});
test('task identity, version, type and conclusions remain separate single-line fields',()=>{
  const html=context.taskRows([{id:'task',skill_id:'skill',skill_name:'Sample',version:'2.0.0',kind:'audit',audit_mode:'static',state:'succeeded',verdict:'pass',delivery_status:'saved',audit_run_id:'audit',error_count:0,warning_count:1,created_at:'2026-11-04T08:00:00Z'}]);
  assert.equal((html.match(/<th scope="col"/g)||[]).length,9);
  assert.equal((html.match(/<td[ >]/g)||[]).length,9);
  assert.ok(!html.includes('<p')&&!html.includes('<br'));
  assert.match(html,/data-label="版本"/);assert.match(html,/data-label="任务">静态预检/);
  assert.match(html,/预检待复核/);assert.ok(!html.includes('审计通过'));
  assert.ok(!html.includes('已保存'));
});
test('issue rows leave suggestions in the drawer and preserve safe readonly selection',()=>{
  const finding={id:'finding',message:'Problem <script>unsafe</script>',severity:'ERR',ruleId:'D1-E1',file:'scripts/long-file.py',line:1,suggestion:'Suggestion only in detail',verification:'Verification only in detail',reviewRequired:true};
  const html=context.findingTable([finding],true,new Set(['finding']));
  assert.equal((html.match(/<td[ >]/g)||[]).length,6);
  assert.ok(!html.includes(finding.suggestion)&&!html.includes(finding.verification));
  assert.ok(!html.includes('<script>')&&!html.includes('<p'));
  assert.match(html,/&lt;script&gt;/);assert.match(html,/<input[^>]*disabled/);
  assert.ok(!/<input[^>]*checked/.test(html));
  assert.ok(!context.findingTable([finding],false,new Set()).includes('<input'));
});

test('task conclusions never repeat pending execution or imply an unfinished result',()=>{
  const html=context.taskRows([{id:'waiting',skill_name:'Sample',version:'1.0.0',kind:'audit',audit_mode:'full',state:'waiting_configuration',verdict:'pass',delivery_status:'pending',created_at:'2026-11-04T08:00:00Z'}]);
  const verdict=html.match(/<td data-label="检查结论">([\s\S]*?)<\/td>/)[1];
  assert.match(verdict,/尚无检查结论/);assert.ok(!verdict.includes('pass')&&!verdict.includes('waiting_configuration'));
  assert.match(context.taskConclusion({kind:'repair',repair_state:'editing'}),/尚无检查结论/);
  assert.ok(context.taskConclusion({kind:'repair',repair_state:'published'}).includes('success'));
});


test('frequent actions respect permissions and link to the task exact version',()=>{
  const base={id:'skill',name:'Sample',current_version:'1.0.0',current_version_id:'version',owner:'Owner',updated_at:'2026-11-04T08:00:00Z',can_write:false,latest_audit:{id:'audit',task_id:'task',mode:'static',state:'succeeded',verdict:'fail',delivery_status:'saved',error_count:1,warning_count:0}};
  const reader=context.skillRow(base);assert.ok(!reader.includes('data-audit-skill'));for(const action of ['报告','详情','下载'])assert.ok(reader.includes('>'+action+'</'));assert.match(reader,/aria-label="审计不可用"/);
  const unaudited=context.skillRow({...base,can_write:true,latest_audit:null});assert.ok(unaudited.includes('>审计</button>')&&unaudited.includes('>详情</button>')&&unaudited.includes('>下载</a>'));
  const task=context.taskRows([{id:'task',skill_id:'skill',version_id:'fixed-version',skill_name:'Sample',version:'old',kind:'audit',audit_mode:'static',state:'succeeded',verdict:'fail',delivery_status:'saved',created_at:'2026-11-04T08:00:00Z'}]);
  assert.match(task,/href="#skill\/skill\?version=fixed-version" target="_blank" rel="noopener noreferrer">版本<\/a>/);
});


test('all local page sizes cover records without skips and clamp after filtering',()=>{
  const rows=Array.from({length:235},(_,id)=>({id}));
  for(const size of [20,30,50,100]) {
    const state=context.listState('test-page-'+size);state.size=size;
    const found=[];
    do {const page=context.localPage('test-page-'+size,rows);found.push(...page.items.map(x=>x.id));if(!page.hasMore)break;state.page++;}while(true);
    assert.deepEqual(found,rows.map(x=>x.id));
    const filtered=context.localPage('test-page-'+size,rows.slice(0,2));assert.equal(filtered.page,0);assert.equal(filtered.items.length,2);
    const html=context.paginationHTML('test-page-'+size,filtered);for(const option of [20,30,50,100])assert.ok(html.includes('value="'+option+'"'));assert.ok(!html.includes('value="25"'));
  }
  assert.equal(context.localPage('default',rows).size,20);
  assert.equal(context.localPage('empty',[]).page,0);
});
test('action slots retain order and unavailable actions cannot be clicked',()=>{
  const base={id:'skill',name:'Sample',current_version:'1',current_version_id:'version',owner:'Owner',updated_at:'2026-11-05T08:00:00Z',can_write:false};
  const html=context.skillRow(base),slots=[...html.matchAll(/data-action-slot="([^"]+)"/g)].map(x=>x[1]);
  assert.deepEqual(slots,['审计','报告','详情','下载']);assert.match(html,/aria-label="审计不可用">-<\/span>/);assert.match(html,/aria-label="报告不可用">-<\/span>/);
  assert.ok(!html.includes('data-audit-skill'));assert.match(html,/data-record-detail="skill"/);assert.match(html,/target="_blank" rel="noopener noreferrer"/);
});
test('cursor pages send the chosen size and ignore responses invalidated by a reset',async()=>{
  const previous=context.api;let resolve;
  context.api=async url=>{assert.match(url,/limit=30/);return new Promise(done=>{resolve=done;});};
  context.listState('remote').size=30;const pending=context.cursorPage('remote','/task-history');context.resetList('remote');resolve({items:[{id:'stale'}],nextCursor:'stale',hasMore:true});assert.equal(await pending,null);assert.equal(context.listState('remote').nextCursor,null);
  context.api=previous;
});

function feedbackHarness() {
  const timers=new Map(),events={},message={textContent:''};let serial=0;
  const body={append(element){element.parentElement=this;}};
  const toast={hidden:true,parentElement:body,open:false,matches(){return this.open;},showPopover(){this.open=true;},hidePopover(){this.open=false;}};
  const dialogs=[];
  const isolated=vm.createContext({document:{getElementById(){return toast;},querySelectorAll(){return dialogs;},body,addEventListener(name,fn){events[name]=fn;}},$(){return message;},setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/skill_mng/static/feedback.js'),'utf8'),isolated);
  return {isolated,timers,events,message,toast,dialogs,body};
}
test('notices expire after three seconds, replace old timers and allow manual close',()=>{
  const h=feedbackHarness();h.isolated.notice('first');assert.equal(h.toast.hidden,false);assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].delay,3000);
  h.isolated.notice('second');assert.equal(h.message.textContent,'second');assert.equal(h.timers.size,1);
  [...h.timers.values()][0].fn();assert.equal(h.toast.hidden,true);assert.equal(h.toast.open,false);
  h.isolated.notice('close');h.events.click({target:{closest(){return true;}}});assert.equal(h.toast.hidden,true);assert.equal(h.timers.size,0);
});
test('notices remain closable in modal dialogs and survive their removal',()=>{
  const h=feedbackHarness(),dialog={append(element){element.parentElement=this;},contains(element){return element.parentElement===this;}};
  h.dialogs.push(dialog);h.isolated.notice('in modal');assert.equal(h.toast.parentElement,dialog);assert.equal(h.toast.open,true);
  h.events.close({target:dialog});assert.equal(h.toast.parentElement,h.body);assert.equal(h.toast.hidden,true);h.dialogs.pop();h.isolated.notice('after modal');assert.equal(h.toast.open,true);assert.equal(h.toast.parentElement,h.body);
});
test('known field validation stays inline while other failures use the global notice',()=>{
  const h=feedbackHarness(),shown=[];let focused=false;
  const input={name:'base_url',focus(){focused=true;}};
  h.isolated.showFieldError=(field,message)=>shown.push({field,message});h.isolated.fieldLabel=field=>field.name;
  h.isolated.formError({elements:[input]},new Error('模型服务地址需为不含凭据和查询参数的 HTTP(S) API Base URL'));
  assert.equal(shown[0].field,input);assert.equal(focused,true);assert.equal(h.toast.hidden,true);
  h.isolated.formError({elements:[input]},new Error('服务暂时不可用，请重试'));
  assert.equal(h.toast.hidden,false);assert.equal(h.message.textContent,'服务暂时不可用，请重试');
});
test('late pagination failures preserve newer filter state without stale notices',async()=>{
  const previousAPI=context.api,previousQuery=context.$,previousNotice=context.notice;
  const size={value:'20'},prev={dataset:{pageStep:'-1'}},next={dataset:{pageStep:'1'}},notices=[];
  const host={isConnected:true,innerHTML:'',querySelectorAll(selector){return selector==='button,select'?[prev,next,size]:[prev,next];}};
  context.$=()=>size;context.notice=message=>notices.push(message);
  try {
    let reject;context.api=()=>new Promise((_,fail)=>{reject=fail;});
    const value=context.listState('failure-race');value.nextCursor='old-next';
    const page={page:0,size:20,total:100,items:[],hasMore:true,cursorMode:true};
    context.mountPagination(host,'failure-race',page,()=>context.cursorPage('failure-race','/task-history'));
    const pending=next.onclick();context.resetList('failure-race');value.size=50;value.nextCursor='new-next';reject(new Error('old failure'));await pending;
    assert.equal(value.page,0);assert.equal(value.size,50);assert.equal(value.nextCursor,'new-next');assert.equal(notices.length,0);
    context.api=async()=>{throw new Error('current failure');};
    context.mountPagination(host,'failure-race',{...page,size:50},()=>context.cursorPage('failure-race','/task-history'));
    await next.onclick();assert.equal(value.page,0);assert.equal(value.nextCursor,'new-next');assert.deepEqual(notices,['current failure']);
  }finally{context.api=previousAPI;context.$=previousQuery;context.notice=previousNotice;}
});
