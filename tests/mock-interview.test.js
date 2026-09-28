const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers');

test('mock bootstrap returns only configured approved rows and keeps profiles distinct',()=>{
  const {api}=createHarness();
  const r=api.mockBootstrap('student-token-123456','student');
  assert.equal(r.ok,true);
  assert.equal(r.questions.length,2);
  assert.deepEqual(r.questions.map(q=>q.profile).sort(),['shimpei','shiori']);
  assert.equal(r.questions.find(q=>q.profile==='shimpei').question_text,'Why HiGA?');
});

test('invalid token cannot access mock interview',()=>{
  const {api}=createHarness();
  const r=api.mockBootstrap('wrong','student');
  assert.equal(r.ok,false);
});

test('mock session can start and persists profile',()=>{
  const {api,sheets}=createHarness();
  const r=api.mockStartSession('student-token-123456','student',{
    session_id:'s-mock-1',profile:'shimpei',started_at:'2026-09-27T00:00:00Z',
    recognition_supported:true,device_id:'d1',user_agent:'test'
  });
  assert.equal(r.ok,true);
  const rows=sheets.MockSessions.data;
  assert.equal(rows.length,2);
  assert.equal(rows[1][0],'s-mock-1');
  assert.equal(rows[1][1],'shimpei');
});

test('mock answer rejects cross-profile question leakage',()=>{
  const {api}=createHarness({mockSessions:[{session_id:'s1',profile:'shimpei',started_at:'x'}]});
  const r=api.mockSaveAnswer('student-token-123456','student',{
    session_id:'s1',profile:'shimpei',question_id:'KAI-1',started_at:'x',completed_at:'y'
  });
  assert.equal(r.ok,false);
  assert.match(r.error,/mismatch/i);
});

test('mock answer persists telemetry and increments main counters',()=>{
  const {api,sheets}=createHarness({mockSessions:[{session_id:'s1',profile:'shimpei',started_at:'x',questions_asked:0,followups_asked:0,answers_saved:0}]});
  const r=api.mockSaveAnswer('student-token-123456','student',{
    session_id:'s1',profile:'shimpei',question_id:'HIGA-1',started_at:'x',completed_at:'y',
    transcript:'I want to study at HiGA.',response_latency_ms:4200,answer_duration_ms:22000,
    longest_internal_silence_ms:1800,speech_detected:true,recognition_supported:true,
    recognition_error:'',repeat_count:0,device_id:'d1',user_agent:'test'
  });
  assert.equal(r.ok,true);
  assert.equal(sheets.MockAnswers.data.length,2);
  const h=sheets.MockAnswers.data[0],row=sheets.MockAnswers.data[1];
  assert.equal(row[h.indexOf('transcript')],'I want to study at HiGA.');
  const hs=sheets.MockSessions.data[0],sr=sheets.MockSessions.data[1];
  assert.equal(sr[hs.indexOf('questions_asked')],1);
  assert.equal(sr[hs.indexOf('answers_saved')],1);
  assert.equal(sr[hs.indexOf('followups_asked')],0);
});

test('mock follow-up increments follow-up counter rather than main counter',()=>{
  const q=[
    {id:'HIGA-1',profile:'shimpei',phase:'general',language:'en-US',kind:'main',parent_id:'',order:1,active:true,source_type:'application_based',source_ref:'Form 1',question_text:'Why HiGA?',concept:'why_higa',ask_rule:'always',notes:''},
    {id:'HIGA-1-F1',profile:'shimpei',phase:'general',language:'en-US',kind:'followup',parent_id:'HIGA-1',order:2,active:true,source_type:'application_based',source_ref:'Form 1',question_text:'Why?',concept:'why_higa',ask_rule:'always',notes:''}
  ];
  const {api,sheets}=createHarness({mockQuestions:q,mockSessions:[{session_id:'s1',profile:'shimpei',started_at:'x',questions_asked:0,followups_asked:0,answers_saved:0}]});
  const r=api.mockSaveAnswer('student-token-123456','student',{session_id:'s1',profile:'shimpei',question_id:'HIGA-1-F1',started_at:'x',completed_at:'y'});
  assert.equal(r.ok,true);
  const h=sheets.MockSessions.data[0],row=sheets.MockSessions.data[1];
  assert.equal(row[h.indexOf('questions_asked')],0);
  assert.equal(row[h.indexOf('followups_asked')],1);
  assert.equal(row[h.indexOf('answers_saved')],1);
});

test('mock finish closes only the selected session',()=>{
  const {api,sheets}=createHarness({mockSessions:[
    {session_id:'s1',profile:'shimpei',started_at:'x'},
    {session_id:'s2',profile:'shiori',started_at:'x'}
  ]});
  const r=api.mockFinishSession('student-token-123456','student',{session_id:'s1',completed_at:'done',elapsed_ms:1234,notes:''});
  assert.equal(r.ok,true);
  const h=sheets.MockSessions.data[0];
  assert.equal(sheets.MockSessions.data[1][h.indexOf('completed_at')],'done');
  assert.equal(sheets.MockSessions.data[2][h.indexOf('completed_at')],'');
});

test('doGet uses dedicated mock UI only when mode=mock',()=>{
  const {api}=createHarness();
  const normal=api.doGet({parameter:{role:'student',token:'student-token-123456'}});
  const mock=api.doGet({parameter:{role:'student',token:'student-token-123456',mode:'mock'}});
  assert.match(normal.html,/__HIGA_ACCESS__/);
  assert.match(mock.html,/__HIGA_ACCESS__/);
});


test('mock runtime does not contain LLM endpoints and live transcript is hidden',()=>{
  const html=fs.readFileSync('MockInterview.html','utf8');
  assert.doesNotMatch(html,/api\.openai\.com|anthropic|gemini|chat\/completions|responses\/v1/i);
  assert.match(html,/\.transcript\{display:none\}/);
  assert.match(html,/speak\(current\.question_text,current\.language\)/);
});


test('admin mock bootstrap is explicitly test mode',()=>{
  const {api}=createHarness();
  const r=api.mockBootstrap('admin-token-123456','admin');
  assert.equal(r.ok,true);
  assert.equal(r.test_mode,true);
});

test('admin mock start does not create an applicant session row',()=>{
  const {api,sheets}=createHarness();
  const before=sheets.MockSessions.data.length;
  const r=api.mockStartSession('admin-token-123456','admin',{
    session_id:'admin-test-1',profile:'shimpei',started_at:'2026-09-28T00:00:00Z',
    recognition_supported:true,device_id:'parent-device',user_agent:'test'
  });
  assert.equal(r.ok,true);
  assert.equal(r.test_mode,true);
  assert.equal(r.persisted,false);
  assert.equal(sheets.MockSessions.data.length,before);
});

test('admin mock answers and finish never persist into applicant history',()=>{
  const {api,sheets}=createHarness();
  const beforeAnswers=sheets.MockAnswers.data.length;
  const beforeSessions=sheets.MockSessions.data.length;
  const save=api.mockSaveAnswer('admin-token-123456','admin',{
    session_id:'admin-test-1',profile:'shimpei',question_id:'HIGA-1',
    started_at:'x',completed_at:'y',transcript:'Parent test'
  });
  assert.equal(save.ok,true);
  assert.equal(save.test_mode,true);
  assert.equal(save.persisted,false);
  assert.equal(sheets.MockAnswers.data.length,beforeAnswers);
  const finish=api.mockFinishSession('admin-token-123456','admin',{
    session_id:'admin-test-1',completed_at:'done',elapsed_ms:1234,notes:''
  });
  assert.equal(finish.ok,true);
  assert.equal(finish.test_mode,true);
  assert.equal(finish.persisted,false);
  assert.equal(sheets.MockSessions.data.length,beforeSessions);
});
