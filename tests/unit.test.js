const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createHarness}=require('./helpers');

function loadRouter(){
  const src=fs.readFileSync('site/router.js','utf8');
  const context={module:{exports:{}},exports:{},URL,URLSearchParams,globalThis:{}};
  vm.createContext(context);
  vm.runInContext(src,context,{filename:'site/router.js'});
  return context.module.exports;
}

test('portal parses student hash access',()=>{
  const r=loadRouter().parseAccess('https://x.test/#role=student&token=abcdefghijkl');
  assert.equal(r.role,'student');assert.equal(r.token,'abcdefghijkl');assert.equal(r.valid,true);
});

test('portal parses reviewer and admin distinctly',()=>{
  const router=loadRouter();
  assert.equal(router.parseAccess('https://x/#role=reviewer&token=reviewer-token-123').role,'reviewer');
  assert.equal(router.parseAccess('https://x/#role=admin&token=admin-token-123456').role,'admin');
});

test('portal hash overrides stale query role',()=>{
  const r=loadRouter().parseAccess('https://x/?role=student&token=student-token-123#role=admin&token=admin-token-123456');
  assert.equal(r.role,'admin');assert.equal(r.token,'admin-token-123456');
});

test('portal rejects invalid role and short token',()=>{
  const router=loadRouter();
  assert.equal(router.parseAccess('https://x/#role=owner&token=abcdefghijkl').valid,false);
  assert.equal(router.parseAccess('https://x/#role=student&token=short').valid,false);
});

test('portal builds role-specific Apps Script URL',()=>{
  const router=loadRouter();
  const access=router.parseAccess('https://x/#role=reviewer&token=reviewer-token-123');
  assert.equal(router.buildAppUrl('https://script.test/exec',access),'https://script.test/exec?role=reviewer&token=reviewer-token-123');
});

test('portal canonical hash does not put token in query',()=>{
  const router=loadRouter();
  const access={role:'admin',token:'admin-token-123456',valid:true};
  assert.equal(router.canonicalHash(access),'#role=admin&token=admin-token-123456');
});

test('authorize maps each token to the correct role',()=>{
  const {api,cfg}=createHarness();
  const s=api.authorize_(cfg.student_token,'admin');
  const r=api.authorize_(cfg.reviewer_token,'student');
  const a=api.authorize_(cfg.parent_token,'student');
  assert.equal(s.ok,true);assert.equal(s.role,'student');assert.equal(s.label,'Shimpei');
  assert.equal(r.ok,true);assert.equal(r.role,'reviewer');assert.equal(r.label,'Sakai-sensei');
  assert.equal(a.ok,true);assert.equal(a.role,'admin');assert.equal(a.label,'Hiro');
});

test('authorize rejects unknown token',()=>{
  const {api}=createHarness();
  assert.equal(api.authorize_('wrong-token-value','student').ok,false);
});

test('truthy normalizes supported truth values',()=>{
  const {api}=createHarness();
  [true,'true','TRUE','1','yes','YES'].forEach(v=>assert.equal(api.truthy_(v),true));
  [false,'false','0','no',''].forEach(v=>assert.equal(api.truthy_(v),false));
});

test('lineCount counts meaningful separate points only',()=>{
  const {api}=createHarness();
  assert.equal(api.lineCount_('One valid point\nSecond valid point'),2);
  assert.equal(api.lineCount_('abc\nSecond valid point\n'),1);
  assert.equal(api.lineCount_(''),0);
});

test('public config excludes access tokens',()=>{
  const {api,cfg}=createHarness();
  const p=api.publicConfig_(cfg);
  assert.equal(p.student_label,'Shimpei');
  assert.equal(p.min_key_points,2);
  assert.equal(Object.hasOwn(p,'student_token'),false);
  assert.equal(Object.hasOwn(p,'parent_token'),false);
  assert.equal(Object.hasOwn(p,'reviewer_token'),false);
});

test('status is Weak below 2.75 average',()=>{
  const {api}=createHarness();
  assert.equal(api.statusFromScores_({content:2,logic:2,specificity:3,ownership:2},'ESS-01'),'Weak');
});

test('status is Developing when good but minimum reviewed attempts not met',()=>{
  const {api}=createHarness();
  assert.equal(api.statusFromScores_({content:4,logic:4,specificity:4,ownership:4},'ESS-01'),'Developing');
});

test('UI source has no browser alert flow',()=>{
  const src=fs.readFileSync('index.html','utf8');
  assert.equal(/\balert\s*\(/.test(src),false);
});

test('UI routine scoring excludes English and Delivery, live scoring adds Delivery',()=>{
  const src=fs.readFileSync('index.html','utf8');
  assert.match(src,/const CORE_FIELDS=\['content','logic','specificity','ownership'\]/);
  assert.match(src,/\[\.\.\.CORE_FIELDS,'delivery'\]/);
});

test('UI requires follow-up key points and guided reflection',()=>{
  const src=fs.readFileSync('index.html','utf8');
  assert.match(src,/followup1_key_points/);
  assert.match(src,/followup2_key_points/);
  assert.match(src,/HARD_CHOICES/);
  assert.match(src,/NEXT_CHOICES/);
});
