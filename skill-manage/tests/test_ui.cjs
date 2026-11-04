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
  vm.runInContext("view.modelDraft={api_key:'synthetic-session-secret'};view.settingsTab='model';view.selections.set('audit',new Set(['finding']));view.positions.set('#skills',120);view.versions.set('skill','version');view.findingFilters.set('audit','ERR');view.library.q='private-search';",context);
  const previous=vm.runInContext('view.render',context);
  context.clearSessionView();
  assert.equal(vm.runInContext('view.modelDraft',context),null);
  assert.equal(vm.runInContext('view.settingsTab',context),null);
  assert.equal(vm.runInContext('view.library.q',context),'');
  assert.equal(vm.runInContext('view.selections.size+view.positions.size+view.versions.size+view.findingFilters.size',context),0);
  assert.ok(vm.runInContext('view.render',context)>previous);
});
