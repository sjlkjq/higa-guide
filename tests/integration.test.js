const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHarness,validAttempt,ATTEMPT_HEADERS}=require('./helpers');

function rowsAsObjects(sheet){
  const [h,...rows]=sheet.data;
  return rows.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])));
}

function reviewedAttempt(id='a0',scores={content:4,logic:4,specificity:4,ownership:4}){
  return {
    ...validAttempt({attempt_id:id,completed_at:'2026-09-14T00:00:00Z'}),
    ...scores,review_type:'home',reviewed_by:'Hiro',reviewed_at:'2026-09-14T01:00:00Z',status_after:'Developing'
  };
}

test('bootstrap returns role-specific identity and never exposes tokens',()=>{
  const {api,cfg}=createHarness();
  const student=api.bootstrap(cfg.student_token,'student');
  const reviewer=api.bootstrap(cfg.reviewer_token,'reviewer');
  const admin=api.bootstrap(cfg.parent_token,'admin');
  assert.equal(student.ok,true);assert.equal(student.role,'student');assert.equal(student.actor_label,'Shimpei');
  assert.equal(reviewer.role,'reviewer');assert.equal(reviewer.actor_label,'Sakai-sensei');
  assert.equal(admin.role,'admin');assert.equal(admin.actor_label,'Hiro');
  assert.equal(Object.hasOwn(student.config,'student_token'),false);
});

test('bootstrap rejects invalid token',()=>{
  const {api}=createHarness();
  const r=api.bootstrap('not-a-valid-token','admin');
  assert.equal(r.ok,false);assert.match(r.error,/Invalid access token/);
});

test('valid home attempt writes Attempts and creates State',()=>{
  const {api,cfg,sheets}=createHarness();
  const r=api.completeAttempt(cfg.student_token,'student',validAttempt());
  assert.equal(r.ok,true);
  const attempts=rowsAsObjects(sheets.Attempts);
  assert.equal(attempts.length,1);assert.equal(attempts[0].question_id,'ESS-01');assert.equal(attempts[0].review_type,'home');
  const state=rowsAsObjects(sheets.State)[0];
  assert.equal(state.question_id,'ESS-01');assert.equal(state.status,'Awaiting review');assert.equal(Number(state.attempt_count),1);
});

test('reviewer cannot submit a student home attempt',()=>{
  const {api,cfg}=createHarness();
  const r=api.completeAttempt(cfg.reviewer_token,'reviewer',validAttempt());
  assert.equal(r.ok,false);assert.match(r.error,/Student access required/);
});

test('home attempt validation rejects missing main key points',()=>{
  const {api,cfg}=createHarness();
  const r=api.completeAttempt(cfg.student_token,'student',validAttempt({key_points:'Only one sufficiently detailed point'}));
  assert.equal(r.ok,false);assert.match(r.error,/main-answer key points/);
});

test('home attempt validation rejects short thinking time',()=>{
  const {api,cfg}=createHarness();
  const r=api.completeAttempt(cfg.student_token,'student',validAttempt({think_elapsed_sec:10}));
  assert.equal(r.ok,false);assert.match(r.error,/thinking time/);
});

test('home attempt validation rejects follow-up without recorded key point',()=>{
  const {api,cfg}=createHarness();
  const r=api.completeAttempt(cfg.student_token,'student',validAttempt({followup1_key_points:''}));
  assert.equal(r.ok,false);assert.match(r.error,/Follow-up 1/);
});

test('home attempt validation rejects missing guided reflection',()=>{
  const {api,cfg}=createHarness();
  const r=api.completeAttempt(cfg.student_token,'student',validAttempt({reflection_hardest:''}));
  assert.equal(r.ok,false);assert.match(r.error,/hardest/);
});

test('student cannot save reviewer scores',()=>{
  const {api,cfg}=createHarness({attempts:[validAttempt()]});
  const r=api.saveReview(cfg.student_token,'student',{attempt_id:'a1',question_id:'ESS-01',content:4,logic:4,specificity:4,ownership:4,improvement_target_1:'Use a concrete example.'});
  assert.equal(r.ok,false);assert.match(r.error,/Reviewer access required/);
});

test('review validates all four reasoning scores',()=>{
  const {api,cfg}=createHarness({attempts:[validAttempt()]});
  const r=api.saveReview(cfg.reviewer_token,'reviewer',{attempt_id:'a1',question_id:'ESS-01',content:4,logic:0,specificity:4,ownership:4,improvement_target_1:'Explain why.'});
  assert.equal(r.ok,false);assert.match(r.error,/Score all four/);
});

test('first strong review is Developing because two reviewed attempts are required',()=>{
  const {api,cfg,sheets}=createHarness({attempts:[validAttempt()]});
  const r=api.saveReview(cfg.parent_token,'admin',{attempt_id:'a1',question_id:'ESS-01',content:4,logic:4,specificity:4,ownership:4,improvement_target_1:'Give one specific observation.',reviewer_note:'Good start.'});
  assert.equal(r.ok,true);assert.equal(r.status,'Developing');
  const a=rowsAsObjects(sheets.Attempts)[0];
  assert.equal(a.reviewed_by,'Hiro');assert.equal(a.improvement_target_1,'Give one specific observation.');assert.equal(a.status_after,'Developing');
});

test('second strong reviewed attempt makes question Ready',()=>{
  const first=reviewedAttempt('a0');
  const second=validAttempt({attempt_id:'a1',completed_at:'2026-09-15T00:01:00Z'});
  const {api,cfg,sheets}=createHarness({attempts:[first,second],states:[{question_id:'ESS-01',status:'Developing',attempt_count:2,last_attempt_id:'a1'}]});
  const r=api.saveReview(cfg.reviewer_token,'reviewer',{attempt_id:'a1',question_id:'ESS-01',content:4,logic:4,specificity:4,ownership:4,improvement_target_1:'Keep answers specific.'});
  assert.equal(r.ok,true);assert.equal(r.status,'Ready');
  const state=rowsAsObjects(sheets.State)[0];
  assert.equal(state.status,'Ready');assert.equal(state.updated_by,'Sakai-sensei');
});

test('strong average with one sub-threshold dimension is not Ready',()=>{
  const first=reviewedAttempt('a0');
  const second=validAttempt({attempt_id:'a1'});
  const {api,cfg}=createHarness({attempts:[first,second],states:[{question_id:'ESS-01',status:'Developing',attempt_count:2}]});
  const r=api.saveReview(cfg.reviewer_token,'reviewer',{attempt_id:'a1',question_id:'ESS-01',content:5,logic:5,specificity:3,ownership:5,improvement_target_1:'Be more specific.'});
  assert.equal(r.ok,true);assert.equal(r.status,'Developing');
});

test('live review requires reviewer/admin role and all five scores',()=>{
  const {api,cfg}=createHarness();
  const denied=api.saveLiveReview(cfg.student_token,'student',{question_id:'ESS-01',content:4,logic:4,specificity:4,ownership:4,delivery:4,improvement_target_1:'Keep going.'});
  assert.equal(denied.ok,false);
  const incomplete=api.saveLiveReview(cfg.reviewer_token,'reviewer',{question_id:'ESS-01',content:4,logic:4,specificity:4,ownership:4,delivery:0,improvement_target_1:'Keep going.'});
  assert.equal(incomplete.ok,false);assert.match(incomplete.error,/live-interview areas/);
});

test('valid live review stores Delivery separately and reviewer identity',()=>{
  const {api,cfg,sheets}=createHarness();
  const r=api.saveLiveReview(cfg.reviewer_token,'reviewer',{question_id:'ESS-01',content:4,logic:4,specificity:4,ownership:4,delivery:3,live_note:'Answered with a concrete example.',delivery_note:'Long pause on follow-up.',improvement_target_1:'Reduce long pauses.',reviewer_note:'Live lesson.'});
  assert.equal(r.ok,true);
  const a=rowsAsObjects(sheets.Attempts)[0];
  assert.equal(a.review_type,'live');assert.equal(Number(a.delivery),3);assert.equal(a.reviewed_by,'Sakai-sensei');assert.equal(a.delivery_note,'Long pause on follow-up.');
});

test('acknowledgement history remains append-only',()=>{
  const {api,cfg,sheets}=createHarness();
  const p1={timestamp:'2026-09-15T00:00:00Z',student_summary:'I need to think before using examples or AI.',accepted:true};
  const p2={timestamp:'2026-09-15T00:05:00Z',student_summary:'I need to think first and explain my own reasons.',accepted:true};
  assert.equal(api.saveAcknowledgement(cfg.student_token,'student',p1).ok,true);
  assert.equal(api.saveAcknowledgement(cfg.student_token,'student',p2).ok,true);
  assert.equal(rowsAsObjects(sheets.Acknowledgements).length,2);
});

test('Apps Script doGet injects the requested role and token before client startup',()=>{
  const {api}=createHarness();
  const out=api.doGet({parameter:{role:'admin',token:'admin-token-123456'}});
  assert.match(out.html,/window\.__HIGA_ACCESS__=\{"role":"admin","token":"admin-token-123456"\}/);
});

test('portal source listens for hash changes so switching links in same tab changes role',()=>{
  const src=fs.readFileSync('site/index.html','utf8');
  assert.match(src,/addEventListener\('hashchange',applyRoute\)/);
  assert.match(src,/target!==currentTarget/);
});
