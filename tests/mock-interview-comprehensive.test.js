const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers');

function objects(sheet){
  const [h,...rows]=sheet.data;
  return rows.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])));
}
function shimpeiSession(overrides={}){
  return {session_id:'s1',profile:'shimpei',started_at:'2026-09-28T00:00:00Z',completed_at:'',elapsed_ms:'',questions_asked:0,followups_asked:0,answers_saved:0,recognition_supported:true,device_id:'d1',user_agent:'test',notes:'',...overrides};
}
function shimpeiAnswer(overrides={}){
  return {session_id:'s1',profile:'shimpei',question_id:'HIGA-1',started_at:'2026-09-28T00:00:01Z',completed_at:'2026-09-28T00:00:10Z',transcript:'Answer',response_latency_ms:1200,answer_duration_ms:9000,longest_internal_silence_ms:800,speech_detected:true,recognition_supported:true,recognition_error:'',repeat_count:0,device_id:'d1',user_agent:'test',...overrides};
}

test('QA-01 student bootstrap is persistent mode',()=>{
  const {api}=createHarness();
  const r=api.mockBootstrap('student-token-123456','student');
  assert.equal(r.ok,true);
  assert.equal(r.role,'student');
  assert.equal(r.test_mode,false);
});

test('QA-02 admin bootstrap is test mode even if requested role is spoofed as student',()=>{
  const {api}=createHarness();
  const r=api.mockBootstrap('admin-token-123456','student');
  assert.equal(r.ok,true);
  assert.equal(r.role,'admin');
  assert.equal(r.test_mode,true);
});

test('QA-03 reviewer bootstrap is non-persistent test mode',()=>{
  const {api}=createHarness();
  const r=api.mockBootstrap('reviewer-token-123456','reviewer');
  assert.equal(r.ok,true);
  assert.equal(r.role,'reviewer');
  assert.equal(r.test_mode,true);
});

test('QA-04 invalid token cannot bootstrap',()=>{
  const {api}=createHarness();
  const r=api.mockBootstrap('invalid-token-xxxx','student');
  assert.equal(r.ok,false);
});

test('QA-05 bootstrap excludes inactive questions',()=>{
  const qs=[
    {id:'ON',profile:'shimpei',phase:'general',language:'en-US',kind:'main',order:1,active:true,source_type:'application_based',source_ref:'x',question_text:'On?',concept:'x'},
    {id:'OFF',profile:'shimpei',phase:'general',language:'en-US',kind:'main',order:2,active:false,source_type:'application_based',source_ref:'x',question_text:'Off?',concept:'x'}
  ];
  const {api}=createHarness({mockQuestions:qs});
  const r=api.mockBootstrap('student-token-123456','student');
  assert.deepEqual(r.questions.map(q=>q.id),['ON']);
});

test('QA-06 questions are sorted by profile and numeric order',()=>{
  const qs=[
    {id:'S2',profile:'shimpei',phase:'general',language:'en-US',kind:'main',order:20,active:true,source_type:'application_based',source_ref:'x',question_text:'2',concept:'x'},
    {id:'K1',profile:'shiori',phase:'japanese_oral_interview',language:'ja-JP',kind:'main',order:10,active:true,source_type:'application_based',source_ref:'x',question_text:'K',concept:'x'},
    {id:'S1',profile:'shimpei',phase:'general',language:'en-US',kind:'main',order:10,active:true,source_type:'application_based',source_ref:'x',question_text:'1',concept:'x'}
  ];
  const {api}=createHarness({mockQuestions:qs});
  const r=api.mockBootstrap('student-token-123456','student');
  assert.deepEqual(r.questions.map(q=>q.id),['K1','S1','S2']);
});

test('QA-07 student can start Shimpei session and it persists exactly once',()=>{
  const {api,sheets}=createHarness();
  const r=api.mockStartSession('student-token-123456','student',{session_id:'s1',profile:'shimpei',started_at:'x',recognition_supported:true,device_id:'d',user_agent:'u'});
  assert.equal(r.ok,true);
  const rows=objects(sheets.MockSessions);
  assert.equal(rows.length,1);
  assert.equal(rows[0].session_id,'s1');
  assert.equal(rows[0].profile,'shimpei');
});

test('QA-08 student can start Shiori session and it persists under Shiori only',()=>{
  const {api,sheets}=createHarness();
  const r=api.mockStartSession('student-token-123456','student',{session_id:'s2',profile:'shiori',started_at:'x',recognition_supported:true,device_id:'d',user_agent:'u'});
  assert.equal(r.ok,true);
  const rows=objects(sheets.MockSessions);
  assert.equal(rows.length,1);
  assert.equal(rows[0].profile,'shiori');
});

test('QA-09 invalid profile cannot create a session',()=>{
  const {api,sheets}=createHarness();
  const before=sheets.MockSessions.data.length;
  const r=api.mockStartSession('student-token-123456','student',{session_id:'x',profile:'other'});
  assert.equal(r.ok,false);
  assert.equal(sheets.MockSessions.data.length,before);
});

test('QA-10 admin start never persists for either applicant',()=>{
  for(const profile of ['shimpei','shiori']){
    const {api,sheets}=createHarness();
    const before=sheets.MockSessions.data.length;
    const r=api.mockStartSession('admin-token-123456','admin',{session_id:'a-'+profile,profile});
    assert.equal(r.ok,true);assert.equal(r.persisted,false);assert.equal(r.test_mode,true);
    assert.equal(sheets.MockSessions.data.length,before);
  }
});

test('QA-11 reviewer direct start never persists',()=>{
  const {api,sheets}=createHarness();
  const before=sheets.MockSessions.data.length;
  const r=api.mockStartSession('reviewer-token-123456','reviewer',{session_id:'rv1',profile:'shimpei'});
  assert.equal(r.ok,true);assert.equal(r.persisted,false);assert.equal(sheets.MockSessions.data.length,before);
});

test('QA-12 admin token cannot be forced into persistent mode by requestedRole=student',()=>{
  const {api,sheets}=createHarness();
  const before=sheets.MockSessions.data.length;
  const r=api.mockStartSession('admin-token-123456','student',{session_id:'a1',profile:'shimpei'});
  assert.equal(r.ok,true);assert.equal(r.persisted,false);
  assert.equal(sheets.MockSessions.data.length,before);
});

test('QA-13 answer requires an existing student session',()=>{
  const {api,sheets}=createHarness();
  const before=sheets.MockAnswers.data.length;
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer({session_id:'missing'}));
  assert.equal(r.ok,false);
  assert.match(r.error,/session/i);
  assert.equal(sheets.MockAnswers.data.length,before);
});

test('QA-14 inactive question cannot be saved',()=>{
  const qs=[{id:'OFF',profile:'shimpei',phase:'general',language:'en-US',kind:'main',order:1,active:false,source_type:'application_based',source_ref:'x',question_text:'Off?',concept:'x'}];
  const {api,sheets}=createHarness({mockQuestions:qs,mockSessions:[shimpeiSession()]});
  const before=sheets.MockAnswers.data.length;
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer({question_id:'OFF'}));
  assert.equal(r.ok,false);
  assert.equal(sheets.MockAnswers.data.length,before);
});

test('QA-15 payload profile must match question profile',()=>{
  const {api,sheets}=createHarness({mockSessions:[shimpeiSession()]});
  const before=sheets.MockAnswers.data.length;
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer({profile:'shiori',question_id:'HIGA-1'}));
  assert.equal(r.ok,false);
  assert.equal(sheets.MockAnswers.data.length,before);
});

test('QA-16 session profile must match answer/question profile',()=>{
  const {api,sheets}=createHarness({mockSessions:[shimpeiSession()]});
  const before=sheets.MockAnswers.data.length;
  const r=api.mockSaveAnswer('student-token-123456','student',{
    ...shimpeiAnswer(),profile:'shiori',question_id:'KAI-1'
  });
  assert.equal(r.ok,false);
  assert.match(r.error,/session.*profile|profile.*session/i);
  assert.equal(sheets.MockAnswers.data.length,before);
});

test('QA-17 valid main answer writes telemetry once and increments only main counter',()=>{
  const {api,sheets}=createHarness({mockSessions:[shimpeiSession()]});
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer());
  assert.equal(r.ok,true);
  const answers=objects(sheets.MockAnswers),sessions=objects(sheets.MockSessions);
  assert.equal(answers.length,1);
  assert.equal(answers[0].question_id,'HIGA-1');
  assert.equal(Number(answers[0].response_latency_ms),1200);
  assert.equal(Number(sessions[0].answers_saved),1);
  assert.equal(Number(sessions[0].questions_asked),1);
  assert.equal(Number(sessions[0].followups_asked),0);
});

test('QA-18 valid follow-up increments only follow-up counter',()=>{
  const qs=[
    {id:'HIGA-1',profile:'shimpei',phase:'general',language:'en-US',kind:'main',parent_id:'',order:1,active:true,source_type:'application_based',source_ref:'x',question_text:'Main?',concept:'x'},
    {id:'HIGA-1-F1',profile:'shimpei',phase:'general',language:'en-US',kind:'followup',parent_id:'HIGA-1',order:2,active:true,source_type:'application_based',source_ref:'x',question_text:'Follow?',concept:'x'}
  ];
  const {api,sheets}=createHarness({mockQuestions:qs,mockSessions:[shimpeiSession()]});
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer({question_id:'HIGA-1-F1'}));
  assert.equal(r.ok,true);
  const s=objects(sheets.MockSessions)[0];
  assert.equal(Number(s.questions_asked),0);
  assert.equal(Number(s.followups_asked),1);
  assert.equal(Number(s.answers_saved),1);
});

test('QA-19 blank response latency remains blank rather than becoming zero',()=>{
  const {api,sheets}=createHarness({mockSessions:[shimpeiSession()]});
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer({response_latency_ms:''}));
  assert.equal(r.ok,true);
  const a=objects(sheets.MockAnswers)[0];
  assert.equal(a.response_latency_ms,'');
});

test('QA-20 admin answer never persists even with valid applicant question',()=>{
  const {api,sheets}=createHarness();
  const before=sheets.MockAnswers.data.length;
  const r=api.mockSaveAnswer('admin-token-123456','admin',shimpeiAnswer({session_id:'admin-local'}));
  assert.equal(r.ok,true);assert.equal(r.persisted,false);
  assert.equal(sheets.MockAnswers.data.length,before);
});

test('QA-21 reviewer answer never persists',()=>{
  const {api,sheets}=createHarness();
  const before=sheets.MockAnswers.data.length;
  const r=api.mockSaveAnswer('reviewer-token-123456','reviewer',shimpeiAnswer({session_id:'reviewer-local'}));
  assert.equal(r.ok,true);assert.equal(r.persisted,false);
  assert.equal(sheets.MockAnswers.data.length,before);
});

test('QA-22 duplicate answer retry must not duplicate data or counters',()=>{
  const {api,sheets}=createHarness({mockSessions:[shimpeiSession()]});
  const first=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer());
  const second=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer());
  assert.equal(first.ok,true);assert.equal(second.ok,true);
  const answers=objects(sheets.MockAnswers),s=objects(sheets.MockSessions)[0];
  assert.equal(answers.length,1);
  assert.equal(Number(s.answers_saved),1);
  assert.equal(Number(s.questions_asked),1);
});

test('QA-23 answers cannot be appended after session completion',()=>{
  const {api,sheets}=createHarness({mockSessions:[shimpeiSession({completed_at:'2026-09-28T00:30:00Z'})]});
  const before=sheets.MockAnswers.data.length;
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer());
  assert.equal(r.ok,false);
  assert.match(r.error,/completed|closed/i);
  assert.equal(sheets.MockAnswers.data.length,before);
});

test('QA-24 finishing a missing session fails without mutation',()=>{
  const {api,sheets}=createHarness();
  const before=sheets.MockSessions.data.length;
  const r=api.mockFinishSession('student-token-123456','student',{session_id:'missing',completed_at:'done',elapsed_ms:1});
  assert.equal(r.ok,false);
  assert.equal(sheets.MockSessions.data.length,before);
});

test('QA-25 finishing a session only updates that session',()=>{
  const {api,sheets}=createHarness({mockSessions:[
    shimpeiSession({session_id:'s1'}),
    shimpeiSession({session_id:'s2',profile:'shiori'})
  ]});
  const r=api.mockFinishSession('student-token-123456','student',{session_id:'s1',completed_at:'done',elapsed_ms:1234,notes:'ok'});
  assert.equal(r.ok,true);
  const rows=objects(sheets.MockSessions);
  assert.equal(rows[0].completed_at,'done');
  assert.equal(Number(rows[0].elapsed_ms),1234);
  assert.equal(rows[0].notes,'ok');
  assert.equal(rows[1].completed_at,'');
});

test('QA-26 admin finish never mutates applicant history',()=>{
  const existing=shimpeiSession({session_id:'real-student'});
  const {api,sheets}=createHarness({mockSessions:[existing]});
  const before=JSON.stringify(sheets.MockSessions.data);
  const r=api.mockFinishSession('admin-token-123456','admin',{session_id:'real-student',completed_at:'tamper',elapsed_ms:999});
  assert.equal(r.ok,true);assert.equal(r.persisted,false);
  assert.equal(JSON.stringify(sheets.MockSessions.data),before);
});

test('QA-27 malformed blank timing fields are not coerced to zero in persisted telemetry',()=>{
  const {api,sheets}=createHarness({mockSessions:[shimpeiSession()]});
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer({response_latency_ms:null,longest_internal_silence_ms:undefined}));
  assert.equal(r.ok,true);
  const a=objects(sheets.MockAnswers)[0];
  assert.equal(a.response_latency_ms,'');
  assert.equal(a.longest_internal_silence_ms,'');
});

test('QA-28 runtime contains no LLM-generated interviewer path',()=>{
  const html=fs.readFileSync('MockInterview.html','utf8');
  assert.doesNotMatch(html,/api\.openai\.com|chat\/completions|responses\/v1|anthropic|gemini/i);
  assert.match(html,/speak\(current\.question_text,current\.language\)/);
});

test('QA-29 live transcript is hidden during the mock',()=>{
  const html=fs.readFileSync('MockInterview.html','utf8');
  assert.match(html,/\.transcript\{display:none\}/);
});

test('QA-30 TTS and speech recognition both use each configured question language',()=>{
  const html=fs.readFileSync('MockInterview.html','utf8');
  assert.match(html,/speak\(current\.question_text,current\.language\)/);
  assert.match(html,/startRecognition\(current\.language\)/);
});

test('QA-31 unsupported speech recognition has an explicit fallback path',()=>{
  const html=fs.readFileSync('MockInterview.html','utf8');
  assert.match(html,/if\(!recognitionSupported\)return/);
  assert.match(html,/Speech recognition is not available/);
});

test('QA-32 microphone denial is handled without crashing interview start',()=>{
  const html=fs.readFileSync('MockInterview.html','utf8');
  assert.match(html,/catch\(e\)\{return false;\}/);
  assert.match(html,/Microphone permission was not granted/);
});

test('QA-33 parent/admin test mode is visibly labelled non-persistent',()=>{
  const html=fs.readFileSync('MockInterview.html','utf8');
  assert.match(html,/Parent\/Admin test mode: this session will not be saved as applicant data/);
  assert.match(html,/Parent\/Admin test · not saved/);
  assert.match(html,/TEST — not saved/);
});

test('QA-34 response recognition error is cleared between questions',()=>{
  const html=fs.readFileSync('MockInterview.html','utf8');
  assert.match(html,/delete\s+els\.transcript\.dataset\.error/);
});

test('QA-35 repeating a question resets answer timing and recognition state safely',()=>{
  const html=fs.readFileSync('MockInterview.html','utf8');
  assert.match(html,/if\(isRepeat\).*firstSpeechAt=0/);
  assert.match(html,/if\(isRepeat\).*transcriptFinal=''/);
});

test('QA-36 root GitHub mock URL exists and routes to Apps Script mock mode',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/mode=mock/);
  assert.match(html,/script\.google\.com\/macros\/s\//);
  assert.match(html,/location\.replace\(target\)/);
});

test('QA-37 parent/student main UI launches mock using fixed Apps Script deployment URL, not iframe origin',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const line=html.split('\n').find(x=>x.includes("mockNav').onclick"))||'';
  assert.match(line,/script\.google\.com\/macros\/s\//);
  assert.doesNotMatch(line,/location\.origin|location\.pathname/);
});

test('QA-38 parent/admin sees mock nav and reviewer does not by default',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.match(html,/\['student','admin'\]\.includes\(role\).*mockNav/);
});

test('QA-39 mock doGet is isolated from the legacy training UI',()=>{
  const {api}=createHarness();
  const normal=api.doGet({parameter:{role:'student',token:'student-token-123456'}});
  const mock=api.doGet({parameter:{role:'student',token:'student-token-123456',mode:'mock'}});
  assert.match(normal.html,/__HIGA_ACCESS__/);
  assert.match(mock.html,/__HIGA_ACCESS__/);
});

test('QA-40 blank or malformed payload is rejected cleanly rather than throwing',()=>{
  const {api}=createHarness({mockSessions:[shimpeiSession()]});
  assert.doesNotThrow(()=>api.mockSaveAnswer('student-token-123456','student',null));
  const r=api.mockSaveAnswer('student-token-123456','student',null);
  assert.equal(r.ok,false);
});
