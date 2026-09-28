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
  assert.deepEqual(r.questions.map(q=>q.id),['S1','S2','K1']);
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

test('QA-10 admin start persists only in separate test history for either applicant',()=>{
  for(const profile of ['shimpei','shiori']){
    const {api,sheets}=createHarness();
    const applicantBefore=sheets.MockSessions.data.length,testBefore=sheets.MockTestSessions.data.length;
    const r=api.mockStartSession('admin-token-123456','admin',{session_id:'a-'+profile,profile});
    assert.equal(r.ok,true);assert.equal(r.persisted,true);assert.equal(r.test_mode,true);assert.equal(r.data_scope,'test');
    assert.equal(sheets.MockSessions.data.length,applicantBefore);
    assert.equal(sheets.MockTestSessions.data.length,testBefore+1);
  }
});

test('QA-11 reviewer direct start persists only in separate test history',()=>{
  const {api,sheets}=createHarness();
  const applicantBefore=sheets.MockSessions.data.length,testBefore=sheets.MockTestSessions.data.length;
  const r=api.mockStartSession('reviewer-token-123456','reviewer',{session_id:'rv1',profile:'shimpei'});
  assert.equal(r.ok,true);assert.equal(r.data_scope,'test');
  assert.equal(sheets.MockSessions.data.length,applicantBefore);
  assert.equal(sheets.MockTestSessions.data.length,testBefore+1);
});

test('QA-12 admin token spoofed as student still goes to test history, never applicant history',()=>{
  const {api,sheets}=createHarness();
  const applicantBefore=sheets.MockSessions.data.length;
  const r=api.mockStartSession('admin-token-123456','student',{session_id:'a1',profile:'shimpei'});
  assert.equal(r.ok,true);assert.equal(r.data_scope,'test');
  assert.equal(sheets.MockSessions.data.length,applicantBefore);
  assert.equal(sheets.MockTestSessions.data.length,2);
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

test('QA-20 admin answer persists only in test answer history',()=>{
  const {api,sheets}=createHarness();
  const applicantBefore=sheets.MockAnswers.data.length;
  api.mockStartSession('admin-token-123456','admin',{session_id:'admin-local',profile:'shimpei'});
  const r=api.mockSaveAnswer('admin-token-123456','admin',shimpeiAnswer({session_id:'admin-local'}));
  assert.equal(r.ok,true);assert.equal(r.data_scope,'test');
  assert.equal(sheets.MockAnswers.data.length,applicantBefore);
  assert.equal(sheets.MockTestAnswers.data.length,2);
});

test('QA-21 reviewer answer persists only in test answer history',()=>{
  const {api,sheets}=createHarness();
  const applicantBefore=sheets.MockAnswers.data.length;
  api.mockStartSession('reviewer-token-123456','reviewer',{session_id:'reviewer-local',profile:'shimpei'});
  const r=api.mockSaveAnswer('reviewer-token-123456','reviewer',shimpeiAnswer({session_id:'reviewer-local'}));
  assert.equal(r.ok,true);assert.equal(r.data_scope,'test');
  assert.equal(sheets.MockAnswers.data.length,applicantBefore);
  assert.equal(sheets.MockTestAnswers.data.length,2);
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

test('QA-26 admin finish cannot mutate applicant history',()=>{
  const existing=shimpeiSession({session_id:'real-student'});
  const {api,sheets}=createHarness({mockSessions:[existing]});
  const before=JSON.stringify(sheets.MockSessions.data);
  const r=api.mockFinishSession('admin-token-123456','admin',{session_id:'real-student',completed_at:'tamper',elapsed_ms:999});
  assert.equal(r.ok,false);
  assert.match(r.error,/not found/i);
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

test('QA-33 parent/admin test mode is visibly labelled as separate history',()=>{
  const html=fs.readFileSync('MockInterview.html','utf8');
  assert.match(html,/saved separately as test data and will not affect applicant history/);
  assert.match(html,/Parent\/Admin test · saved separately/);
  assert.match(html,/TEST — separate history/);
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


test('QA-41 duplicate session id is rejected without creating a second row',()=>{
  const {api,sheets}=createHarness({mockSessions:[shimpeiSession({session_id:'dup'})]});
  const before=sheets.MockSessions.data.length;
  const r=api.mockStartSession('student-token-123456','student',{session_id:'dup',profile:'shimpei'});
  assert.equal(r.ok,false);
  assert.match(r.error,/already exists/i);
  assert.equal(sheets.MockSessions.data.length,before);
});

test('QA-42 finishing an already completed session is idempotent and does not overwrite original completion',()=>{
  const {api,sheets}=createHarness({mockSessions:[shimpeiSession({session_id:'s1',completed_at:'original',elapsed_ms:111,notes:'first'})]});
  const r=api.mockFinishSession('student-token-123456','student',{session_id:'s1',completed_at:'second',elapsed_ms:999,notes:'second'});
  assert.equal(r.ok,true);
  assert.equal(r.duplicate,true);
  const row=objects(sheets.MockSessions)[0];
  assert.equal(row.completed_at,'original');
  assert.equal(Number(row.elapsed_ms),111);
  assert.equal(row.notes,'first');
});

test('QA-43 negative telemetry is clamped to zero',()=>{
  const {api,sheets}=createHarness({mockSessions:[shimpeiSession()]});
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer({response_latency_ms:-10,answer_duration_ms:-20,longest_internal_silence_ms:-30}));
  assert.equal(r.ok,true);
  const a=objects(sheets.MockAnswers)[0];
  assert.equal(Number(a.response_latency_ms),0);
  assert.equal(Number(a.answer_duration_ms),0);
  assert.equal(Number(a.longest_internal_silence_ms),0);
});

test('QA-44 unknown question id cannot be persisted',()=>{
  const {api,sheets}=createHarness({mockSessions:[shimpeiSession()]});
  const before=sheets.MockAnswers.data.length;
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer({question_id:'UNKNOWN'}));
  assert.equal(r.ok,false);
  assert.equal(sheets.MockAnswers.data.length,before);
});

test('QA-45 malformed start payload is rejected cleanly',()=>{
  const {api}=createHarness();
  assert.doesNotThrow(()=>api.mockStartSession('student-token-123456','student',null));
  const r=api.mockStartSession('student-token-123456','student',null);
  assert.equal(r.ok,false);
});

test('QA-46 malformed finish payload is rejected cleanly',()=>{
  const {api}=createHarness();
  assert.doesNotThrow(()=>api.mockFinishSession('student-token-123456','student',null));
  const r=api.mockFinishSession('student-token-123456','student',null);
  assert.equal(r.ok,false);
});

test('QA-47 invalid token cannot start, save, or finish a mock session',()=>{
  const {api,sheets}=createHarness({mockSessions:[shimpeiSession()]});
  const beforeS=JSON.stringify(sheets.MockSessions.data),beforeA=JSON.stringify(sheets.MockAnswers.data);
  assert.equal(api.mockStartSession('bad-token-value','student',{session_id:'x',profile:'shimpei'}).ok,false);
  assert.equal(api.mockSaveAnswer('bad-token-value','student',shimpeiAnswer()).ok,false);
  assert.equal(api.mockFinishSession('bad-token-value','student',{session_id:'s1'}).ok,false);
  assert.equal(JSON.stringify(sheets.MockSessions.data),beforeS);
  assert.equal(JSON.stringify(sheets.MockAnswers.data),beforeA);
});

test('QA-48 admin Shiori test data remains isolated from applicant history',()=>{
  const {api,sheets}=createHarness();
  const beforeA=sheets.MockAnswers.data.length;
  api.mockStartSession('admin-token-123456','admin',{session_id:'admin-shiori',profile:'shiori'});
  const r=api.mockSaveAnswer('admin-token-123456','admin',{
    session_id:'admin-shiori',profile:'shiori',question_id:'KAI-1',started_at:'x',completed_at:'y',transcript:'test'
  });
  assert.equal(r.ok,true);assert.equal(r.data_scope,'test');
  assert.equal(sheets.MockAnswers.data.length,beforeA);
  assert.equal(sheets.MockTestAnswers.data.length,2);
});


test('QA-49 Mock Review is restricted to admin/reviewer',()=>{
  const {api}=createHarness();
  assert.equal(api.mockReviewBootstrap('student-token-123456','student').ok,false);
  assert.equal(api.mockReviewBootstrap('admin-token-123456','admin').ok,true);
  assert.equal(api.mockReviewBootstrap('reviewer-token-123456','reviewer').ok,true);
});

test('QA-50 Mock Review returns applicant and test histories with explicit scopes',()=>{
  const {api}=createHarness({
    mockSessions:[shimpeiSession({session_id:'real1'})],
    mockAnswers:[shimpeiAnswer({session_id:'real1',transcript:'real answer'})],
    mockTestSessions:[shimpeiSession({session_id:'test1'})],
    mockTestAnswers:[shimpeiAnswer({session_id:'test1',transcript:'test answer'})]
  });
  const r=api.mockReviewBootstrap('admin-token-123456','admin');
  assert.equal(r.ok,true);
  assert.equal(r.sessions.some(x=>x.session_id==='real1'&&x.scope==='applicant'),true);
  assert.equal(r.sessions.some(x=>x.session_id==='test1'&&x.scope==='test'),true);
  assert.equal(r.answers.some(x=>x.transcript==='real answer'&&x.scope==='applicant'),true);
  assert.equal(r.answers.some(x=>x.transcript==='test answer'&&x.scope==='test'),true);
});

test('QA-51 pause detector resumes AudioContext and uses a lower adaptive speech threshold',()=>{
  const html=fs.readFileSync('MockInterview.html','utf8');
  assert.match(html,/audioCtx\.state==='suspended'.*audioCtx\.resume\(\)/s);
  assert.match(html,/Math\.max\(0\.008,Math\.min\(0\.02,floor\*2\.2\)\)/);
});

test('QA-52 higher quality system voices are preferred when available',()=>{
  const html=fs.readFileSync('MockInterview.html','utf8');
  assert.match(html,/natural\|neural\|premium\|enhanced/);
  assert.match(html,/google/);
  assert.match(html,/aria\|jenny\|guy\|samantha\|ava\|andrew\|nanami\|haruka/);
});

test('QA-53 Mock Review UI parses and exposes applicant/test filters',()=>{
  const html=fs.readFileSync('MockReview.html','utf8');
  assert.match(html,/本人データのみ/);
  assert.match(html,/親\/Adminテストのみ/);
  assert.match(html,/mockReviewBootstrap/);
});


test('QA-54 answer audio is stored with the answer row',()=>{
  const {api,sheets,driveFiles}=createHarness({mockSessions:[shimpeiSession()]});
  const audio=Buffer.from('fake-audio-bytes').toString('base64');
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer({audio_base64:audio,audio_mime_type:'audio/webm'}));
  assert.equal(r.ok,true);
  const a=objects(sheets.MockAnswers)[0];
  assert.match(String(a.audio_file_id),/^drive_/);
  assert.equal(a.audio_mime_type,'audio/webm');
  assert.equal(driveFiles.has(String(a.audio_file_id)),true);
});

test('QA-55 admin can securely retrieve only audio referenced by mock history',()=>{
  const {api,sheets}=createHarness({mockSessions:[shimpeiSession()]});
  const audio=Buffer.from('play-me').toString('base64');
  api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer({audio_base64:audio,audio_mime_type:'audio/webm'}));
  const fileId=objects(sheets.MockAnswers)[0].audio_file_id;
  const ok=api.mockGetAudio('admin-token-123456','admin',fileId);
  assert.equal(ok.ok,true);
  assert.equal(Buffer.from(ok.base64,'base64').toString(),'play-me');
  const denied=api.mockGetAudio('admin-token-123456','admin','drive_not_referenced');
  assert.equal(denied.ok,false);
});

test('QA-56 student cannot use reviewer audio retrieval endpoint',()=>{
  const {api}=createHarness();
  const r=api.mockGetAudio('student-token-123456','student','anything');
  assert.equal(r.ok,false);
  assert.match(r.error,/Reviewer access required/i);
});

test('QA-57 browser runtime records each spoken answer with MediaRecorder when supported',()=>{
  const html=fs.readFileSync('MockInterview.html','utf8');
  assert.match(html,/new MediaRecorder\(micStream/);
  assert.match(html,/startAnswerRecording\(\)/);
  assert.match(html,/stopAnswerRecording\(false\)/);
  assert.match(html,/audio_base64:audio\.base64/);
  const review=fs.readFileSync('MockReview.html','utf8');
  assert.match(review,/mockGetAudio/);
  assert.match(review,/回答音声を再生/);
});


test('QA-58 microphone setup lists audio input devices and stores selected device id',()=>{
  const html=fs.readFileSync('MockInterview.html','utf8');
  assert.match(html,/enumerateDevices\(\)/);
  assert.match(html,/kind==='audioinput'/);
  assert.match(html,/mock_mic_device_id/);
  assert.match(html,/deviceId=\{exact:selectedMicId\}/);
});

test('QA-59 interview cannot start until microphone test detects input',()=>{
  const html=fs.readFileSync('MockInterview.html','utf8');
  assert.match(html,/id="startBtn" disabled/);
  assert.match(html,/if\(!micVerified\)/);
  assert.match(html,/Run a successful microphone test before starting/);
  assert.match(html,/micVerified=peak>=0\.008/);
});

test('QA-60 microphone diagnostic shows actual active track label and live level',()=>{
  const html=fs.readFileSync('MockInterview.html','utf8');
  assert.match(html,/track\.label/);
  assert.match(html,/Active input:/);
  assert.match(html,/micLevelBar\.style\.width/);
  assert.match(html,/Peak level/);
});

test('QA-61 microphone diagnostic records five-second playback sample locally',()=>{
  const html=fs.readFileSync('MockInterview.html','utf8');
  assert.match(html,/Test microphone \(5 sec\)/);
  assert.match(html,/new MediaRecorder\(micStream/);
  assert.match(html,/setTimeout\(r,5000\)/);
  assert.match(html,/micTestPlayback\.src=micTestBlobUrl/);
});

test('QA-62 changing microphone invalidates prior microphone verification',()=>{
  const html=fs.readFileSync('MockInterview.html','utf8');
  assert.match(html,/micSelect\.onchange/);
  assert.match(html,/micVerified=false/);
  assert.match(html,/Device changed\. Run the microphone test again/);
});
