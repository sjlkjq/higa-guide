const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('index.html','utf8');

test('sidebar has a dedicated feedback review tab',()=>{
  assert.match(html,/data-sec="feedback"/);
  assert.match(html,/id="feedback" class="section"/);
});

test('feedback review supports category search and sort filters',()=>{
  assert.match(html,/id="feedbackCategory"/);
  assert.match(html,/id="feedbackSearch"/);
  assert.match(html,/id="feedbackSort"/);
  assert.match(html,/function renderFeedbackReview\(/);
});

test('feedback archive is collapsible and keeps full context together',()=>{
  assert.match(html,/feedback-accordion/);
  assert.match(html,/recordedAnswerHtml\(a,q/);
  assert.match(html,/reviewAdviceHtml\(a\)/);
  assert.match(html,/Student reflection/);
});

test('overview only shows latest three feedback summaries',()=>{
  assert.match(html,/arr\.slice\(0,3\)/);
  assert.match(html,/Open Feedback Review/);
});

test('reviewer uses feedback tab without duplicate long history panel',()=>{
  assert.doesNotMatch(html,/id="reviewHistory"/);
  assert.match(html,/role==='reviewer'/);
});

test('pending reviewer view still shows question and follow-up context',()=>{
  assert.match(html,/function selectReview\(id\)/);
  assert.match(html,/recordedAnswerHtml\(selectedReview,q,"Shimpei's recorded answer"\)/);
});

test('feedback UI is version 1.5.0',()=>{
  assert.match(html,/const APP_VERSION='1\.5\.0';/);
});
