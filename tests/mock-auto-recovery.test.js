const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers');

function objects(sheet){
  const [h,...rows]=sheet.data;
  return rows.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])));
}
function applicantSession(overrides={}){
  return {session_id:'s1',profile:'shimpei',started_at:'2026-09-29T00:00:00Z',completed_at:'',elapsed_ms:'',questions_asked:0,followups_asked:0,answers_saved:0,recognition_supported:true,device_id:'d1',user_agent:'test',notes:'',...overrides};
}
function blankAnswer(overrides={}){
  return {session_id:'s1',profile:'shimpei',question_id:'HIGA-1',started_at:'2026-09-29T00:00:01Z',completed_at:'2026-09-29T00:00:10Z',transcript:'',response_latency_ms:1200,answer_duration_ms:9000,longest_internal_silence_ms:800,speech_detected:true,recognition_supported:true,recognition_error:'no-result',repeat_count:0,device_id:'d1',user_agent:'test',audio_expected:true,audio_base64:Buffer.from('saved-audio').toString('base64'),audio_mime_type:'audio/webm',...overrides};
}

test('automatic recovery restores a missing applicant transcript without selecting a session',()=>{
  const {api,context,sheets,scriptProps,fetchCalls}=createHarness({mockSessions:[applicantSession()]});
  const saved=api.mockSaveAnswer('student-token-123456','student',blankAnswer());
  assert.equal(saved.ok,true);
  assert.equal(objects(sheets.MockAnswers)[0].transcript,'');
  scriptProps.set('DEEPGRAM_API_KEY','x'.repeat(32));
  const before=fetchCalls.length;
  const r=context.mockAutoRetranscribeMissing('admin-token-123456','admin',20);
  assert.equal(r.ok,true);
  assert.equal(r.processed,1);
  assert.equal(r.rescued,1);
  assert.equal(r.failed,0);
  assert.equal(fetchCalls.length,before+1);
  assert.equal(objects(sheets.MockAnswers)[0].transcript,'Deepgram transcript');
});

test('automatic recovery does not retry the same failed recording on every Review load',()=>{
  const {api,context,sheets,scriptProps,fetchCalls}=createHarness({
    mockSessions:[applicantSession()],
    deepgramStatus:500,
    deepgramResponse:'temporary failure'
  });
  api.mockSaveAnswer('student-token-123456','student',blankAnswer());
  scriptProps.set('DEEPGRAM_API_KEY','x'.repeat(32));
  const before=fetchCalls.length;
  const first=context.mockAutoRetranscribeMissing('admin-token-123456','admin',20);
  assert.equal(first.processed,1);
  assert.equal(first.failed,1);
  assert.equal(fetchCalls.length,before+1);
  assert.match(String(objects(sheets.MockAnswers)[0].stt_status),/^auto_failed_/);
  const afterFirst=fetchCalls.length;
  const second=context.mockAutoRetranscribeMissing('admin-token-123456','admin',20);
  assert.equal(second.processed,0);
  assert.equal(fetchCalls.length,afterFirst);
});

test('automatic recovery ignores Parent/Admin test history',()=>{
  const {api,context,sheets,scriptProps,fetchCalls}=createHarness();
  const started=api.mockStartSession('admin-token-123456','admin',{session_id:'t1',profile:'shimpei',started_at:'x'});
  assert.equal(started.ok,true);
  const saved=api.mockSaveAnswer('admin-token-123456','admin',blankAnswer({session_id:'t1'}));
  assert.equal(saved.ok,true);
  assert.equal(objects(sheets.MockTestAnswers)[0].transcript,'');
  scriptProps.set('DEEPGRAM_API_KEY','x'.repeat(32));
  const before=fetchCalls.length;
  const r=context.mockAutoRetranscribeMissing('admin-token-123456','admin',20);
  assert.equal(r.processed,0);
  assert.equal(fetchCalls.length,before);
});

test('Mock Review starts applicant recovery automatically and explains retry behavior',()=>{
  const html=fs.readFileSync('MockReview.html','utf8');
  assert.match(html,/function runAutoRecovery\(\)/);
  assert.match(html,/mockAutoRetranscribeMissing/);
  assert.match(html,/a\.scope==='applicant'/);
  assert.match(html,/不要なAPI利用を避けるため自動再試行しません/);
});
