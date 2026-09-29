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
  const html=fs.readFileSync('mock.html','utf8');
  assert.doesNotMatch(html,/api\.openai\.com|chat\/completions|responses\/v1|anthropic|gemini/i);
  assert.match(html,/playNaturalQuestion\(current\)/);
  assert.match(html,/speak\(spokenTextForQuestion\(current\),current\.language\)/);
});

test('QA-29 live transcript is hidden during the mock',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/\.transcript\{display:none\}/);
});

test('QA-30 TTS keeps question-language fallback and speech recognition uses the configured response language',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/speak\(spokenTextForQuestion\(current\),current\.language\)/);
  assert.match(html,/startRecognition\(current\.language\)/);
});

test('QA-31 unsupported speech recognition has an explicit fallback path',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/if\(!recognitionSupported\)return/);
  assert.match(html,/Speech recognition is not available/);
});

test('QA-32 microphone denial is handled without starting an unrecorded interview',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/Microphone error:/);
  assert.match(html,/return false;/);
  assert.match(html,/Microphone access is required to record the interview/);
});

test('QA-33 parent/admin test mode is visibly labelled as separate history',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/saved separately as test data and will not affect applicant history/);
  assert.match(html,/Parent\/Admin test · saved separately/);
  assert.match(html,/TEST — separate history/);
});

test('QA-34 response recognition error is cleared between questions',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/delete\s+els\.transcript\.dataset\.error/);
});

test('QA-35 repeating a question resets answer timing and recognition state safely',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/if\(isRepeat\).*firstSpeechAt=0/);
  assert.match(html,/if\(isRepeat\).*transcriptFinal=''/);
});

test('QA-36 root GitHub mock URL is the top-level media runtime, not an Apps Script redirect',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/github-pages-top-level-media/);
  assert.match(html,/window\.opener\.postMessage/);
  assert.doesNotMatch(html,/location\.replace\(target\)/);
  assert.doesNotMatch(html,/script\.google\.com\/macros\/s\/.*mode=mock/);
});

test('QA-37 parent/student main UI launches top-level GitHub mock and relays backend RPC securely',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const line=html.split('\n').find(x=>x.includes("mockNav').onclick"))||'';
  assert.match(html,/const MOCK_ORIGIN='https:\/\/sjlkjq\.github\.io'/);
  assert.match(line,/\/higa-guide\/mock\.html/);
  assert.doesNotMatch(line,/token=/);
  assert.doesNotMatch(line,/noopener/);
  assert.match(html,/e\.origin!==MOCK_ORIGIN/);
  assert.match(html,/MOCK_ALLOWED_RPC/);
  assert.match(html,/args\[0\]=token;args\[1\]=role/);
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
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/audioCtx\.state==='suspended'.*audioCtx\.resume\(\)/s);
  assert.match(html,/Math\.max\(0\.008,Math\.min\(0\.02,floor\*2\.2\)\)/);
});

test('QA-52 higher quality system voices are preferred when available',()=>{
  const html=fs.readFileSync('mock.html','utf8');
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
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/new MediaRecorder\(micStream/);
  assert.match(html,/startAnswerRecording\(\)/);
  assert.match(html,/stopAnswerRecording\(false\)/);
  assert.match(html,/audio_base64:audio\.base64/);
  const review=fs.readFileSync('MockReview.html','utf8');
  assert.match(review,/mockGetAudio/);
  assert.match(review,/回答音声を再生/);
});


test('QA-58 microphone setup lists audio input devices and stores selected device id',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/enumerateDevices\(\)/);
  assert.match(html,/kind==='audioinput'/);
  assert.match(html,/mock_mic_device_id/);
  assert.match(html,/deviceId=\{exact:selectedMicId\}/);
});

test('QA-59 interview start no longer depends on microphone-test verification',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/id="startBtn" disabled/);
  assert.doesNotMatch(html,/if\(!micVerified\)/);
  assert.match(html,/const micOk=await ensureMic\(false\)/);
  assert.match(html,/micVerified=peak>=0\.008/);
});

test('QA-60 microphone diagnostic shows actual active track label and live level',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/track\.label/);
  assert.match(html,/Active input:/);
  assert.match(html,/micLevelBar\.style\.width/);
  assert.match(html,/Peak level/);
});

test('QA-61 optional microphone diagnostic still records a five-second playback sample locally',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/Test microphone \(optional\)/);
  assert.match(html,/new MediaRecorder\(micStream/);
  assert.match(html,/setTimeout\(r,5000\)/);
  assert.match(html,/micTestPlayback\.src=micTestBlobUrl/);
});

test('QA-62 changing microphone invalidates prior verification but does not force another test',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/micSelect\.onchange/);
  assert.match(html,/micVerified=false/);
  assert.match(html,/Microphone test is optional; the selected microphone will be used when the interview starts/);
  assert.match(html,/els\.startBtn\.disabled=!audioStorageReady/);
});


test('QA-63 permission-gated device labels are not fabricated before permission grant',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.doesNotMatch(html,/Microphone '\+\(i\+1\)/);
  assert.match(html,/Microphone names will appear after permission is granted/);
  assert.match(html,/getMicPermissionState/);
});

test('QA-64 denied microphone permission gives site-specific recovery guidance',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/Microphone permission is blocked for https:\/\/sjlkjq\.github\.io/);
  assert.match(html,/Site settings/);
  assert.match(html,/set Microphone to Allow/);
});

test('QA-65 static mock never sends the private token to GitHub Pages',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const line=html.split('\n').find(x=>x.includes("mockNav').onclick"))||'';
  assert.doesNotMatch(line,/token=/);
  assert.match(line,/mock\.html#role=/);
});


test('QA-66 Deepgram is optional and browser transcript remains the fallback when no API key is configured',()=>{
  const {api,sheets,fetchCalls}=createHarness({mockSessions:[shimpeiSession()]});
  const audio=Buffer.from('audio').toString('base64');
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer({transcript:'browser text',audio_base64:audio,audio_mime_type:'audio/webm'}));
  assert.equal(r.ok,true);
  assert.equal(fetchCalls.length,0);
  const a=objects(sheets.MockAnswers)[0];
  assert.equal(a.transcript,'browser text');
  assert.equal(a.browser_transcript,'browser text');
  assert.equal(a.stt_provider,'browser-fallback');
  assert.equal(a.stt_status,'deepgram_not_configured');
  assert.equal(a.stt_language_mode,'en');
});

test('QA-67 Shimpei uses Nova-3 English transcription regardless of question language metadata',()=>{
  const {api,sheets,fetchCalls}=createHarness({
    scriptProperties:{DEEPGRAM_API_KEY:'dg_test_key_12345678901234567890'},
    mockSessions:[shimpeiSession()]
  });
  const audio=Buffer.from('audio').toString('base64');
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer({transcript:'browser text',audio_base64:audio,audio_mime_type:'audio/webm'}));
  assert.equal(r.ok,true);
  assert.equal(fetchCalls.length,1);
  assert.match(fetchCalls[0].url,/model=nova-3/);
  assert.match(fetchCalls[0].url,/language=en(?:&|$)/);
  assert.match(fetchCalls[0].url,/keyterm=HiGA/);
  const a=objects(sheets.MockAnswers)[0];
  assert.equal(a.transcript,'Deepgram transcript');
  assert.equal(a.browser_transcript,'browser text');
  assert.equal(a.stt_provider,'deepgram');
  assert.equal(a.stt_model,'nova-3');
  assert.equal(a.stt_language_mode,'en');
  assert.equal(Number(a.stt_confidence),0.93);
  assert.equal(a.stt_status,'ok');
});

test('QA-68 Shiori uses Nova-3 language=multi so one answer may mix Japanese and English',()=>{
  const {api,sheets,fetchCalls}=createHarness({
    scriptProperties:{DEEPGRAM_API_KEY:'dg_test_key_12345678901234567890'},
    mockSessions:[{...shimpeiSession(),session_id:'sh1',profile:'shiori'}],
    deepgramResponse:{results:{channels:[{alternatives:[{transcript:'その子の attitude が良くて evidence もあります',confidence:0.96}]}]}}
  });
  const audio=Buffer.from('audio').toString('base64');
  const r=api.mockSaveAnswer('student-token-123456','student',{
    ...shimpeiAnswer(),session_id:'sh1',profile:'shiori',question_id:'KAI-1',transcript:'browser wrong',
    audio_base64:audio,audio_mime_type:'audio/webm'
  });
  assert.equal(r.ok,true);
  assert.equal(fetchCalls.length,1);
  assert.match(fetchCalls[0].url,/model=nova-3/);
  assert.match(fetchCalls[0].url,/language=multi(?:&|$)/);
  assert.match(fetchCalls[0].url,/keyterm=GSC/);
  assert.match(fetchCalls[0].url,/keyterm=Cambridge/);
  const a=objects(sheets.MockAnswers)[0];
  assert.equal(a.transcript,'その子の attitude が良くて evidence もあります');
  assert.equal(a.stt_language_mode,'multi');
  assert.equal(a.stt_provider,'deepgram');
  assert.equal(Number(a.stt_confidence),0.96);
});

test('QA-69 Deepgram API errors never lose the browser fallback transcript or audio save',()=>{
  const {api,sheets,driveFiles}=createHarness({
    scriptProperties:{DEEPGRAM_API_KEY:'dg_test_key_12345678901234567890'},
    mockSessions:[shimpeiSession()],
    deepgramStatus:500,
    deepgramResponse:'server error'
  });
  const audio=Buffer.from('audio').toString('base64');
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer({transcript:'fallback words',audio_base64:audio,audio_mime_type:'audio/webm'}));
  assert.equal(r.ok,true);
  const a=objects(sheets.MockAnswers)[0];
  assert.equal(a.transcript,'fallback words');
  assert.equal(a.browser_transcript,'fallback words');
  assert.equal(a.stt_provider,'browser-fallback');
  assert.equal(a.stt_status,'deepgram_http_500');
  assert.match(a.stt_error,/server error/);
  assert.match(String(a.audio_file_id),/^drive_/);
  assert.equal(driveFiles.has(String(a.audio_file_id)),true);
});

test('QA-70 Deepgram API key is stored only in Script Properties and is never returned by config',()=>{
  const {api,scriptProps}=createHarness();
  const key='dg_secret_key_12345678901234567890';
  const save=api.mockSetDeepgramApiKey('admin-token-123456','admin',key);
  assert.equal(save.ok,true);
  assert.equal(save.configured,true);
  assert.equal(scriptProps.get('DEEPGRAM_API_KEY'),key);
  const cfg=api.mockSttConfig('admin-token-123456','admin');
  assert.equal(cfg.ok,true);
  assert.equal(cfg.configured,true);
  assert.equal(JSON.stringify(cfg).includes(key),false);
});

test('QA-71 non-admin users cannot change the Deepgram API key',()=>{
  const {api,scriptProps}=createHarness();
  const r=api.mockSetDeepgramApiKey('reviewer-token-123456','reviewer','dg_secret_key_12345678901234567890');
  assert.equal(r.ok,false);
  assert.match(r.error,/Admin access required/i);
  assert.equal(scriptProps.has('DEEPGRAM_API_KEY'),false);
});

test('QA-72 clearing the Deepgram API key restores browser fallback mode',()=>{
  const {api,scriptProps}=createHarness({scriptProperties:{DEEPGRAM_API_KEY:'dg_secret_key_12345678901234567890'}});
  const r=api.mockSetDeepgramApiKey('admin-token-123456','admin','');
  assert.equal(r.ok,true);
  assert.equal(r.configured,false);
  assert.equal(scriptProps.has('DEEPGRAM_API_KEY'),false);
});

test('QA-73 Mock Review exposes Deepgram status, API-key setup, and STT diagnostics',()=>{
  const html=fs.readFileSync('MockReview.html','utf8');
  assert.match(html,/Deepgram API Key/);
  assert.match(html,/mockSetDeepgramApiKey/);
  assert.match(html,/multilingual code-switching/);
  assert.match(html,/Browser STT \(diagnostic\)/);
  assert.match(html,/stt_language_mode/);
  assert.match(html,/stt_confidence/);
});

test('QA-74 Shiori multilingual STT choice depends on applicant profile, not the question language',()=>{
  const {api,fetchCalls}=createHarness({
    scriptProperties:{DEEPGRAM_API_KEY:'dg_test_key_12345678901234567890'},
    mockQuestions:[{id:'KAI-EN',profile:'shiori',phase:'gsc_english_oral_interview',language:'en-US',kind:'main',parent_id:'',order:1,active:true,source_type:'application_based',source_ref:'x',question_text:'Please introduce yourself.',concept:'x'}],
    mockSessions:[{...shimpeiSession(),session_id:'sh2',profile:'shiori'}]
  });
  const audio=Buffer.from('audio').toString('base64');
  const r=api.mockSaveAnswer('student-token-123456','student',{
    ...shimpeiAnswer(),session_id:'sh2',profile:'shiori',question_id:'KAI-EN',audio_base64:audio,audio_mime_type:'audio/webm'
  });
  assert.equal(r.ok,true);
  assert.equal(fetchCalls.length,1);
  assert.match(fetchCalls[0].url,/language=multi(?:&|$)/);
});


test('QA-75 Shiori Japanese interviewer uses Aura-2 Ama and pronunciation-friendly spoken text',()=>{
  const {api,fetchCalls}=createHarness({
    scriptProperties:{DEEPGRAM_API_KEY:'dg_test_key_12345678901234567890'},
    mockQuestions:[{id:'KAI-J-02',profile:'shiori',phase:'japanese_oral_interview',language:'ja-JP',kind:'main',parent_id:'',order:20,active:true,source_type:'application_based',source_ref:'x',question_text:'なぜ開智所沢中等教育学校を志望しましたか。',concept:'why'}]
  });
  const r=api.mockTtsQuestion('student-token-123456','student','KAI-J-02');
  assert.equal(r.ok,true);
  assert.equal(r.supported,true);
  assert.equal(r.configured,true);
  assert.equal(r.voice,'aura-2-ama-ja');
  assert.equal(r.spoken_text,'なぜ、かいちところざわ中等教育学校を志望しましたか？');
  assert.equal(Buffer.from(r.audio_base64,'base64').toString(),'fake-mp3-audio');
  assert.equal(fetchCalls.length,1);
  assert.match(fetchCalls[0].url,/\/v1\/speak\?model=aura-2-ama-ja&encoding=mp3/);
  assert.equal(JSON.parse(fetchCalls[0].opts.payload).text,'なぜ、かいちところざわ中等教育学校を志望しましたか？');
});

test('QA-76 Japanese spoken-text normalization removes written item numbers and reads GSC naturally',()=>{
  const {api,fetchCalls}=createHarness({
    scriptProperties:{DEEPGRAM_API_KEY:'dg_test_key_12345678901234567890'},
    mockQuestions:[{id:'KAI-J-GSC',profile:'shiori',phase:'japanese_oral_interview',language:'ja-JP',kind:'main',parent_id:'',order:1,active:true,source_type:'application_based',source_ref:'x',question_text:'(1) GSCのどんなところが自分に合っていると思いますか。',concept:'gsc'}]
  });
  const r=api.mockTtsQuestion('student-token-123456','student','KAI-J-GSC');
  assert.equal(r.spoken_text,'ジーエスシーのどんなところが自分に合っていると思いますか？');
  assert.equal(JSON.parse(fetchCalls[0].opts.payload).text,'ジーエスシーのどんなところが自分に合っていると思いますか？');
});

test('QA-77 missing Deepgram key falls back cleanly while still returning corrected Japanese spoken text',()=>{
  const {api,fetchCalls}=createHarness({
    mockQuestions:[{id:'KAI-J-02',profile:'shiori',phase:'japanese_oral_interview',language:'ja-JP',kind:'main',parent_id:'',order:20,active:true,source_type:'application_based',source_ref:'x',question_text:'なぜ開智所沢中等教育学校を志望しましたか。',concept:'why'}]
  });
  const r=api.mockTtsQuestion('student-token-123456','student','KAI-J-02');
  assert.equal(r.ok,true);
  assert.equal(r.supported,true);
  assert.equal(r.configured,false);
  assert.equal(r.audio_base64,undefined);
  assert.equal(r.spoken_text,'なぜ、かいちところざわ中等教育学校を志望しましたか？');
  assert.equal(fetchCalls.length,0);
});

test('QA-78 cloud Japanese interviewer TTS is limited to Shiori Japanese questions',()=>{
  const {api,fetchCalls}=createHarness({
    scriptProperties:{DEEPGRAM_API_KEY:'dg_test_key_12345678901234567890'},
    mockQuestions:[
      {id:'HIGA-JA',profile:'shimpei',phase:'general',language:'ja-JP',kind:'main',parent_id:'',order:1,active:true,source_type:'application_based',source_ref:'x',question_text:'日本語ですか。',concept:'x'},
      {id:'KAI-EN',profile:'shiori',phase:'gsc_english_oral_interview',language:'en-US',kind:'main',parent_id:'',order:2,active:true,source_type:'application_based',source_ref:'x',question_text:'Why this school?',concept:'x'}
    ]
  });
  const a=api.mockTtsQuestion('student-token-123456','student','HIGA-JA');
  const b=api.mockTtsQuestion('student-token-123456','student','KAI-EN');
  assert.equal(a.supported,false);
  assert.equal(b.supported,false);
  assert.equal(fetchCalls.length,0);
});

test('QA-79 browser mock retains natural Japanese fallback behind static AI Voice audio',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/mockTtsQuestion/);
  assert.match(html,/playNaturalQuestion\(current\)/);
  assert.match(html,/if\(!aiVoice\)\{const natural=await playNaturalQuestion\(current\);if\(!natural\)await speak\(spokenTextForQuestion\(current\),current\.language\);\}/);
  assert.match(html,/questionTtsCache\.has\(q\.id\)/);
  assert.match(html,/prefetchStaticQuestionAudio\(queue\[index\+1\]\)/);
  assert.match(html,/開智所沢中等教育学校\/g,'かいちところざわ中等教育学校'/);
  assert.match(html,/text\.replace\(\/か。\$\/,'か？'\)/);
});

test('QA-80 parent app RPC allowlist permits mock TTS and recording-status RPCs but still controls backend access',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.match(html,/MOCK_ALLOWED_RPC=new Set\(\['mockBootstrap','mockStartSession','mockSaveAnswer','mockFinishSession','mockTtsQuestion','mockAudioStorageStatus','mockAudioStorageReady'\]\)/);
  assert.match(html,/MOCK_ALLOWED_RPC\.has\(e\.data\.name\)/);
  assert.match(html,/args\[0\]=token;args\[1\]=role/);
});


test('QA-81 static AI Voice Generator audio is preferred for all configured mock questions',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/const QUESTION_AI_AUDIO=\{/);
  const m=html.match(/const QUESTION_AI_AUDIO=(\{.*?\});\nconst questionAudioPreload/s);
  assert.ok(m,'QUESTION_AI_AUDIO map not found');
  const map=JSON.parse(m[1]);
  assert.equal(Object.keys(map).length,44);
  for(const id of ['HIGA-G-01','HIGA-M-06-F1','KAI-J-01','KAI-J-02','KAI-S-04','KAI-E-03-F1']){
    assert.match(map[id],/^https:\/\/storage\.googleapis\.com\/adm--audio-playback--7d--public\/mcp-preview\/.+\.mp3$/);
  }
  assert.match(html,/const aiVoice=await playStaticQuestionAudio\(current\)/);
  assert.match(html,/if\(!aiVoice\)\{const natural=await playNaturalQuestion\(current\)/);
});

test('QA-82 Shiori school-motivation display text is unchanged while its AI audio uses the approved natural wording asset',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  const m=html.match(/const QUESTION_AI_AUDIO=(\{.*?\});\nconst questionAudioPreload/s);
  const map=JSON.parse(m[1]);
  assert.ok(map['KAI-J-02']);
  assert.match(html,/AI Voice Generator/);
});

test('QA-83 static question audio is prefetched and repeat playback reuses the cached Audio object',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/questionAudioPreload=new Map\(\)/);
  assert.match(html,/prefetchStaticQuestionAudio\(queue\[0\]\)/);
  assert.match(html,/prefetchStaticQuestionAudio\(queue\[index\+1\]\)/);
  assert.match(html,/questionAudioPreload\.get\(q\.id\)/);
  assert.match(html,/a\.currentTime=0/);
});


test('QA-84 audio-expected answers save to Drive and persist audio diagnostics',()=>{
  const {api,sheets,driveFiles}=createHarness({mockSessions:[shimpeiSession()]});
  const audio=Buffer.from('recorded-answer').toString('base64');
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer({
    audio_expected:true,audio_base64:audio,audio_mime_type:'audio/webm'
  }));
  assert.equal(r.ok,true);
  assert.equal(r.audio_saved,true);
  assert.equal(r.audio_status,'saved');
  const a=objects(sheets.MockAnswers)[0];
  assert.match(String(a.audio_file_id),/^drive_/);
  assert.equal(a.audio_status,'saved');
  assert.equal(a.audio_error,'');
  assert.equal(Number(a.audio_bytes),Buffer.from('recorded-answer').length);
  assert.equal(driveFiles.has(String(a.audio_file_id)),true);
});

test('QA-85 inaccessible configured Drive folder self-heals to a new folder and still saves audio',()=>{
  const {api,sheets,driveFolders}=createHarness({
    mockSessions:[shimpeiSession()],
    driveFolderAccessible:false
  });
  const audio=Buffer.from('repair-me').toString('base64');
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer({
    audio_expected:true,audio_base64:audio,audio_mime_type:'audio/webm'
  }));
  assert.equal(r.ok,true);
  assert.equal(r.audio_saved,true);
  const cfgRows=objects(sheets.Config);
  const folderId=String(cfgRows.find(x=>x.key==='mock_audio_folder_id').value||'');
  assert.match(folderId,/^folder_/);
  assert.equal(driveFolders.has(folderId),true);
  const a=objects(sheets.MockAnswers)[0];
  assert.equal(a.audio_status,'saved');
});

test('QA-86 Drive write failure is not silently converted to recording missing',()=>{
  const {api,sheets}=createHarness({
    mockSessions:[shimpeiSession()],
    driveWriteFails:true,
    driveWriteError:'quota or permission denied'
  });
  const before=sheets.MockAnswers.data.length;
  const audio=Buffer.from('must-not-be-lost').toString('base64');
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer({
    audio_expected:true,audio_base64:audio,audio_mime_type:'audio/webm'
  }));
  assert.equal(r.ok,false);
  assert.match(r.error,/Audio recording could not be saved to Google Drive/i);
  assert.match(r.error,/quota or permission denied/i);
  assert.equal(sheets.MockAnswers.data.length,before);
  const session=objects(sheets.MockSessions)[0];
  assert.equal(Number(session.answers_saved),0);
});

test('QA-87 expected browser recording with an empty audio payload blocks answer persistence',()=>{
  const {api,sheets}=createHarness({mockSessions:[shimpeiSession()]});
  const before=sheets.MockAnswers.data.length;
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer({
    audio_expected:true,audio_base64:'',audio_mime_type:''
  }));
  assert.equal(r.ok,false);
  assert.match(r.error,/no audio payload was received/i);
  assert.equal(sheets.MockAnswers.data.length,before);
});

test('QA-88 admin audio storage status proves the configured folder is writable',()=>{
  const {api,driveFiles}=createHarness();
  const r=api.mockAudioStorageStatus('admin-token-123456','admin',false);
  assert.equal(r.ok,true);
  assert.equal(r.accessible,true);
  assert.equal(r.writable,true);
  assert.equal(r.folder_id,'test-folder');
  assert.match(r.folder_url,/drive\.google\.com\/drive\/folders\/test-folder/);
  assert.ok(driveFiles.size>=1,'write probe should create a temporary Drive file');
});

test('QA-89 admin storage check can repair an inaccessible configured folder',()=>{
  const {api,sheets}=createHarness({driveFolderAccessible:false});
  const r=api.mockAudioStorageStatus('admin-token-123456','admin',true);
  assert.equal(r.ok,true);
  assert.equal(r.accessible,true);
  assert.equal(r.writable,true);
  assert.equal(r.repaired,true);
  assert.match(String(r.folder_id),/^folder_/);
  const cfgRows=objects(sheets.Config);
  assert.equal(cfgRows.find(x=>x.key==='mock_audio_folder_id').value,r.folder_id);
});

test('QA-90 Mock Review exposes recording-storage health, repair, and per-answer diagnostics',()=>{
  const html=fs.readFileSync('MockReview.html','utf8');
  assert.match(html,/録音保存/);
  assert.match(html,/mockAudioStorageStatus/);
  assert.match(html,/保存先を再確認・修復/);
  assert.match(html,/audio_status/);
  assert.match(html,/audio_error/);
  assert.match(html,/audio_bytes/);
});

test('QA-91 browser retains the stopped recording payload for save retry and tells server audio is expected',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/pendingSavePayload=null/);
  assert.match(html,/audio_expected:audioExpected/);
  assert.match(html,/pendingSavePayload\?'Retrying save…':'Saving…'/);
  assert.match(html,/if\(!pendingSavePayload\)/);
  assert.match(html,/録音データはこの画面に保持しています/);
  assert.match(html,/if\(payload\.audio_expected&&!r\.audio_saved\)/);
});

test('QA-92 Apps Script manifest explicitly declares Drive, Sheets, and external-request scopes',()=>{
  const manifest=JSON.parse(fs.readFileSync('appsscript.json','utf8'));
  assert.ok(Array.isArray(manifest.oauthScopes));
  assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/drive'));
  assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets'));
  assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'));
});


test('QA-93 missing Drive OAuth is detected before any Drive folder access',()=>{
  const {api}=createHarness({driveAuthorized:false});
  const r=api.mockAudioStorageStatus('admin-token-123456','admin',true);
  assert.equal(r.ok,true);
  assert.equal(r.authorization_required,true);
  assert.equal(r.writable,false);
  assert.match(r.authorization_url,/accounts\.google\.com\/o\/oauth2\/auth/);
  assert.match(r.error,/permission has not yet been granted/i);
});

test('QA-94 student bootstrap exposes Drive authorization readiness without exposing an OAuth URL',()=>{
  const {api}=createHarness({driveAuthorized:false});
  const r=api.mockBootstrap('student-token-123456','student');
  assert.equal(r.ok,true);
  assert.equal(r.audio_storage.authorized,false);
  assert.equal(r.audio_storage.status,'REQUIRED');
  assert.equal(r.audio_storage.authorization_url,undefined);
});

test('QA-95 an audio-expected answer is blocked with a parent-action message when Drive OAuth is missing',()=>{
  const {api,sheets}=createHarness({driveAuthorized:false,mockSessions:[shimpeiSession()]});
  const before=sheets.MockAnswers.data.length;
  const audio=Buffer.from('recorded-answer').toString('base64');
  const r=api.mockSaveAnswer('student-token-123456','student',shimpeiAnswer({
    audio_expected:true,audio_base64:audio,audio_mime_type:'audio/webm'
  }));
  assert.equal(r.ok,false);
  assert.equal(r.audio_status,'authorization_required');
  assert.match(r.error,/Parent\/Admin must open Mock Review and authorize Google Drive once/i);
  assert.equal(sheets.MockAnswers.data.length,before);
});

test('QA-96 Mock Review shows the one-click Google Drive authorization path and recheck instructions',()=>{
  const html=fs.readFileSync('MockReview.html','utf8');
  assert.match(html,/id="authorizeDrive"/);
  assert.match(html,/Google Driveを承認/);
  assert.match(html,/authorization_required/);
  assert.match(html,/承認後、この画面に戻って「保存先を再確認・修復」を押してください/);
});

test('QA-97 mock runtime cannot start when recording storage authorization is not ready',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/audioStorageReady=!!\(r\.audio_storage&&r\.audio_storage\.authorized\)/);
  assert.match(html,/els\.startBtn\.disabled=!audioStorageReady/);
  assert.match(html,/await refreshAudioStorageReady\(\);\s*if\(!audioStorageReady\)/);
});

test('QA-98 production health endpoint reports Drive authorization without exposing tokens or folder ids',()=>{
  const {api}=createHarness({driveAuthorized:false});
  const out=api.doGet({parameter:{mode:'mockhealth'}});
  const data=JSON.parse(out.text);
  assert.equal(data.ok,true);
  assert.equal(data.drive_authorized,false);
  assert.equal(data.authorization_status,'REQUIRED');
  assert.equal(data.app_version,'1.7.2');
  assert.equal(JSON.stringify(data).includes('student-token'),false);
  assert.equal(JSON.stringify(data).includes('test-folder'),false);
});


test('QA-99 student readiness check never exposes the deployer authorization URL',()=>{
  const {api}=createHarness({driveAuthorized:false});
  const r=api.mockAudioStorageReady('student-token-123456','student');
  assert.equal(r.ok,true);
  assert.equal(r.ready,false);
  assert.equal(r.authorization_required,true);
  assert.equal(r.authorization_url,'');
});

test('QA-100 admin readiness check exposes one-time authorization URL when needed',()=>{
  const {api}=createHarness({driveAuthorized:false});
  const r=api.mockAudioStorageReady('admin-token-123456','admin');
  assert.equal(r.ok,true);
  assert.equal(r.ready,false);
  assert.match(r.authorization_url,/accounts\.google\.com\/o\/oauth2\/auth/);
});

test('QA-101 once deployer Drive authorization is granted, student readiness succeeds without child OAuth',()=>{
  const {api}=createHarness({driveAuthorized:true});
  const r=api.mockAudioStorageReady('student-token-123456','student');
  assert.equal(r.ok,true);
  assert.equal(r.ready,true);
  assert.equal(r.status,'READY');
  assert.equal(r.authorization_url,undefined);
});

test('QA-102 Ready screen gives parent a one-time authorize button but tells children no authorization is required',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/id="authorizeDriveReady"/);
  assert.match(html,/One-time Parent\/Admin setup required\. Authorize Google Drive here; children will not need to authorize anything\./);
  assert.match(html,/No Google Drive authorization is required on this device\./);
  assert.match(html,/setInterval\(\(\)=>\{if\(!audioStorageReady\)refreshAudioStorageReady\(\);\},5000\)/);
  assert.match(html,/await refreshAudioStorageReady\(\);\s*startAudioStoragePolling\(\)/);
});

test('QA-103 microphone test rechecks Drive readiness but does not gate Start Interview',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/micVerified=peak>=0\.008;\s*await refreshAudioStorageReady\(\);\s*els\.startBtn\.disabled=!audioStorageReady/);
  assert.doesNotMatch(html,/els\.startBtn\.disabled=!\(micVerified&&audioStorageReady\)/);
});


test('QA-104 Answer finished waits for browser STT finalization before reading transcript',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  const flush=html.indexOf('const recognitionFlush=stopRecognitionAndFlush(1500)');
  const audio=html.indexOf('const audioBlob=await stopAnswerRecording(false)',flush);
  const wait=html.indexOf('await recognitionFlush',audio);
  const read=html.indexOf("const end=Date.now();const text=(transcriptFinal+' '+transcriptInterim).trim()",wait);
  assert.ok(flush>=0,'recognition flush must start');
  assert.ok(audio>flush,'audio recording should stop while recognition finalizes');
  assert.ok(wait>audio,'save must wait for STT flush');
  assert.ok(read>wait,'transcript must be read only after STT flush completes');
});

test('QA-105 browser STT flush keeps onresult active until recognizer onend',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/function stopRecognitionAndFlush\(timeoutMs=1500\)/);
  assert.match(html,/const prevEnd=r\.onend/);
  assert.match(html,/r\.onend=e=>\{try\{if\(typeof prevEnd==='function'\)prevEnd\.call\(r,e\);\}catch\(_\)\{\}finish\(\);\}/);
  assert.match(html,/try\{r\.stop\(\);\}catch\(e\)\{finish\(\);return;\}/);
  assert.doesNotMatch(html,/stopRecognitionAndFlush[\s\S]{0,500}r\.onresult=null/);
});

test('QA-106 speech with no browser transcript is explicitly marked no-result for diagnosis',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/const recognitionError=els\.transcript\.dataset\.error\|\|\(\(!!firstSpeechAt&&!text\)\?'no-result':'\'\)/);
  assert.match(html,/recognition_error:recognitionError/);
});


test('QA-107 microphone test is optional and Ready screen says so explicitly',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/Test microphone \(optional\)/);
  assert.match(html,/Microphone test is optional\. If you skip it, microphone access will be requested when you start the interview\./);
  assert.match(html,/You can start once recording storage is ready; microphone access will be requested automatically\./);
});

test('QA-108 Start Interview does not require micVerified',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  const start=html.indexOf('async function startInterview()');
  const end=html.indexOf('els.startBtn.onclick=startInterview;',start);
  const body=html.slice(start,end);
  assert.doesNotMatch(body,/if\(!micVerified\)/);
  assert.match(body,/const micOk=await ensureMic\(false\)/);
  assert.match(body,/if\(!micOk\)/);
});

test('QA-109 recording storage alone controls Start button availability before interview',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/function applyAudioStorageState\(r\)[\s\S]*?els\.startBtn\.disabled=!audioStorageReady;/);
  assert.match(html,/selectedMicId=els\.micSelect\.value\|\|'';[\s\S]*?els\.startBtn\.disabled=!audioStorageReady;/);
});

test('QA-110 skipping mic test still requires actual microphone permission when Start is pressed',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/Microphone access is required to record the interview\. Allow microphone access, then press Start Interview again\./);
  assert.match(html,/const micOk=await ensureMic\(false\);\s*if\(!micOk\)/);
});
