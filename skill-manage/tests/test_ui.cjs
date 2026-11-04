'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const context = vm.createContext({
  URL, console,
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
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/skill_mng/static/workspace.js'),'utf8'),context);
test('finding pagination clamps on filter changes without selecting hidden rows',()=>{
  context.state={auditContext:{audit:{id:'paged'},result:{findings:Array.from({length:61},(_,i)=>({id:'item-'+i,severity:'ERR',file:'scripts/'+i+'.py',message:'syntax',reviewRequired:i===0}))}}};
  vm.runInContext("view.findingFilters.set('paged','all');view.findingQueries.set('paged','');view.findingPages.set('paged',1)",context);
  const page=context.findingPage();assert.equal(page.items.length,25);assert.equal(page.items[0].id,'item-25');assert.equal(page.total,61);
  const selected=new Set();context.selectFindings(selected,page.items);assert.equal(selected.size,25);assert.ok(!selected.has('item-0'));
  vm.runInContext("view.findingQueries.set('paged','scripts/60.py')",context);
  const filtered=context.findingPage();assert.equal(filtered.page,0);assert.equal(filtered.items.length,1);assert.equal(filtered.items[0].id,'item-60');
});

context.fmtDate=value=>String(value);
test('Skill results show one field per cell and one primary row action',()=>{
  const skill={id:'skill',name:'Long <Skill>',description:'Details belong in the detail page',current_version:'1.0.0',current_version_id:'version',version_count:12,owner:'Owner',updated_at:'2026-11-04T08:00:00Z',can_write:true,latest_audit:{id:'audit',task_id:'task',mode:'static',state:'succeeded',verdict:'fail',delivery_status:'saved',error_count:2,warning_count:3}};
  const html=context.skillRow(skill), visible=html.replace(/<[^>]*>/g,'');
  assert.equal((html.match(/<td[ >]/g)||[]).length,8);
  assert.ok(!html.includes('<p')&&!html.includes('<br'));
  assert.ok(!visible.includes(skill.description)&&!visible.includes('12 个版本'));
  assert.ok(html.includes('Long &lt;Skill&gt;'));
  assert.equal((html.match(/class="row-primary"/g)||[]).length,1);
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
