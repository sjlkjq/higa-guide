const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('index.html','utf8');

test('student feedback keeps question answer feedback and next action together',()=>{
  assert.match(html,/function recordedAnswerHtml\(/);
  assert.match(html,/feedback-label\">Question/);
  assert.match(html,/Your recorded answer/);
  assert.match(html,/Reviewer feedback/);
  assert.match(html,/What to change next/);
});

test('recorded answer includes main and follow-up question context',()=>{
  assert.match(html,/Main answer — recorded key points/);
  assert.match(html,/Follow-up 1/);
  assert.match(html,/Follow-up 2/);
  assert.match(html,/const fs=\(q&&q\.followups\)\|\|\[\]/);
});

test('retry view shows the previous recorded answer instead of hiding it',()=>{
  assert.match(html,/Feedback from your last reviewed attempt/);
  assert.match(html,/Your previous recorded answer/);
  assert.doesNotMatch(html,/Your previous answer is hidden on purpose/);
});

test('reviewer dashboard contains reviewed feedback history',()=>{
  assert.match(html,/id="reviewHistory"/);
  assert.match(html,/function renderReviewHistory\(/);
  assert.match(html,/Reviewed attempts & feedback/);
  assert.match(html,/Shimpei's recorded answer/);
});

test('pending reviewer view also shows question and follow-up context',()=>{
  assert.match(html,/function selectReview\(id\)/);
  assert.match(html,/recordedAnswerHtml\(selectedReview,q,"Shimpei's recorded answer"\)/);
});

test('feedback UI is version 1.4.0',()=>{
  assert.match(html,/const APP_VERSION='1\.4\.0';/);
});
