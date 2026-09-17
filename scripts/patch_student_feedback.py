from pathlib import Path
import re

index = Path('index.html')
s = index.read_text()
assert "const APP_VERSION='1.4.0';" in s, 'Expected app version 1.4.0 not found'

# 1) Add dedicated Feedback Review navigation item.
nav_anchor = '    <button data-sec="practice" id="practiceNav">Practice</button>\n    <button data-sec="strategy">Strategy</button>'
nav_repl = '    <button data-sec="practice" id="practiceNav">Practice</button>\n    <button data-sec="feedback" id="feedbackNav">Feedback Review</button>\n    <button data-sec="strategy">Strategy</button>'
assert nav_anchor in s, 'Navigation anchor not found'
s = s.replace(nav_anchor, nav_repl, 1)

# 2) Make Overview feedback a compact recent-feedback summary instead of a long archive.
s = s.replace(
    '<div id="studentFeedbackPanel" class="panel hidden" style="margin-top:14px"><h4>Reviewer feedback — what to fix next</h4><div class="panel-sub">Do not chase the score. Read what worked, what needs fixing, then retry the same question.</div><div id="studentFeedback"></div></div>',
    '<div id="studentFeedbackPanel" class="panel hidden" style="margin-top:14px"><h4>Recent reviewer feedback</h4><div class="panel-sub">A quick view of the latest feedback. Use Feedback Review for the full history.</div><div id="studentFeedback"></div></div>',
    1
)

# 3) Add a dedicated, filterable review section before Strategy.
strategy_anchor = '    <section id="strategy" class="section"><div class="panel"><h4>Interview strategy</h4><div id="strategyList"></div></div></section>'
feedback_section = '''    <section id="feedback" class="section">
      <div class="panel">
        <h4>Feedback Review</h4>
        <div class="panel-sub">Review the question, what Shimpei recorded after answering, the reviewer comment, and exactly what to change next.</div>
        <div class="feedback-toolbar">
          <label><span>Category</span><select id="feedbackCategory"><option value="all">All categories</option></select></label>
          <label><span>Search</span><input id="feedbackSearch" type="text" placeholder="Search question or feedback"></label>
          <label><span>Sort</span><select id="feedbackSort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
        </div>
        <div id="feedbackReviewCount" class="helper"></div>
      </div>
      <div id="feedbackReviewList" style="margin-top:14px"></div>
    </section>
'''
assert strategy_anchor in s, 'Strategy section anchor not found'
s = s.replace(strategy_anchor, feedback_section + strategy_anchor, 1)

# 4) Remove the long duplicate reviewer-history block. Reviewers use the same Feedback Review tab.
review_history_panel = '      <div class="panel" style="margin-top:14px"><h4>Reviewed attempts & feedback</h4><div class="panel-sub">Question, Shimpei\'s recorded answer, reviewer feedback and next changes are kept together here.</div><div id="reviewHistory"></div></div>\n'
assert review_history_panel in s, 'Reviewer history panel not found'
s = s.replace(review_history_panel, '', 1)

# 5) Add styles for compact summaries and accordion review cards.
css_anchor = '.review-meta{font-size:10px;color:var(--muted);margin-top:8px}.reflection{'
css_add = '''.review-meta{font-size:10px;color:var(--muted);margin-top:8px}.feedback-toolbar{display:grid;grid-template-columns:180px 1fr 160px;gap:10px;align-items:end}.feedback-toolbar label{font-size:10px;color:var(--muted);display:grid;gap:5px}.feedback-toolbar select,.feedback-toolbar input{width:100%;border:1px solid #d0d5dd;border-radius:9px;padding:8px 9px;background:#fff;font:inherit;font-size:11px}.feedback-summary-row{display:grid;grid-template-columns:1fr 210px 72px;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #f0f2f5}.feedback-summary-row:last-child{border-bottom:0}.feedback-summary-q{font-size:12px;font-weight:700;line-height:1.45}.feedback-summary-target{font-size:11px;line-height:1.4;color:#6a4611}.feedback-accordion{background:#fff;border:1px solid var(--line);border-radius:12px;margin:10px 0;box-shadow:var(--shadow);overflow:hidden}.feedback-accordion summary{list-style:none;cursor:pointer;padding:14px 16px;display:grid;grid-template-columns:1fr 220px 28px;gap:12px;align-items:center}.feedback-accordion summary::-webkit-details-marker{display:none}.feedback-accordion summary:after{content:'＋';font-size:18px;color:var(--muted);text-align:right}.feedback-accordion[open] summary:after{content:'−'}.feedback-accordion[open] summary{border-bottom:1px solid var(--line);background:#fbfcfe}.feedback-accordion-title{font-size:13px;font-weight:750;line-height:1.45}.feedback-accordion-meta{font-size:10px;color:var(--muted);margin-top:3px}.feedback-accordion-target{font-size:11px;line-height:1.4;color:#6a4611}.feedback-detail{padding:4px 16px 16px}.reflection{'''
assert css_anchor in s, 'Feedback CSS anchor not found'
s = s.replace(css_anchor, css_add, 1)
s = s.replace('.strategy-grid,.grid2,.practice-wrap,.hero,.review-grid{grid-template-columns:1fr}', '.strategy-grid,.grid2,.practice-wrap,.hero,.review-grid,.feedback-toolbar{grid-template-columns:1fr}', 1)
s = s.replace('.category-row{grid-template-columns:110px 1fr 42px}', '.feedback-summary-row,.feedback-accordion summary{grid-template-columns:1fr}.category-row{grid-template-columns:110px 1fr 42px}', 1)

# 6) Render the dedicated review tab and keep Overview compact.
pattern = r"function renderStudentFeedback\(\)\{.*?\}\nfunction renderQuestions\(\)"
replacement = r'''function reviewedHomeAttempts(){return (boot.attempts||[]).filter(a=>a.review_type!=='live'&&Number(a.content||0)>0).sort((a,b)=>String(b.reviewed_at||b.completed_at).localeCompare(String(a.reviewed_at||a.completed_at)))}
function renderStudentFeedback(){const panel=$('studentFeedbackPanel'),box=$('studentFeedback');if(!panel||!box)return;if(role!=='student'){panel.classList.add('hidden');return}const qmap=Object.fromEntries((boot.questions||[]).map(q=>[q.id,q]));const arr=reviewedHomeAttempts();panel.classList.remove('hidden');if(!arr.length){box.innerHTML='<div class="empty">No reviewer feedback yet.</div>';return}box.innerHTML=arr.slice(0,3).map(a=>{const q=qmap[a.question_id],target=a.improvement_target_1||'Open the review to see what to change next.';return `<div class="feedback-summary-row"><div><div class="feedback-summary-q">${esc(q?q.main_question:a.question_id)}</div><div class="feedback-accordion-meta">${esc(a.question_id)} · ${esc(q?q.category:'')} · ${esc(shortDate(a.reviewed_at||a.completed_at))}</div></div><div class="feedback-summary-target">${esc(target)}</div><button class="btn" data-overview-feedback="${esc(a.attempt_id)}">Review</button></div>`}).join('')+`<div class="btns"><button id="openFeedbackReview" class="btn primary">Open Feedback Review</button></div>`;$('openFeedbackReview').onclick=()=>showSec('feedback');document.querySelectorAll('[data-overview-feedback]').forEach(b=>b.onclick=()=>{showSec('feedback');setTimeout(()=>{const el=document.querySelector(`[data-feedback-attempt="${CSS.escape(b.dataset.overviewFeedback)}"]`);if(el){el.open=true;el.scrollIntoView({behavior:'smooth',block:'start'})}},0)})}
function renderFeedbackReview(){const list=$('feedbackReviewList'),catEl=$('feedbackCategory'),searchEl=$('feedbackSearch'),sortEl=$('feedbackSort'),countEl=$('feedbackReviewCount');if(!list||!catEl||!searchEl||!sortEl||!countEl)return;const qmap=Object.fromEntries((boot.questions||[]).map(q=>[q.id,q]));const all=reviewedHomeAttempts();const selected=catEl.value||'all';const cats=[...new Set(all.map(a=>qmap[a.question_id]&&qmap[a.question_id].category).filter(Boolean))].sort();catEl.innerHTML='<option value="all">All categories</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');catEl.value=cats.includes(selected)?selected:'all';const term=searchEl.value.trim().toLowerCase();let arr=all.filter(a=>{const q=qmap[a.question_id]||{};const categoryOk=catEl.value==='all'||q.category===catEl.value;const hay=[a.question_id,q.main_question,q.category,a.key_points,a.followup1_key_points,a.followup2_key_points,a.reviewer_note,a.improvement_target_1,a.improvement_target_2].join(' ').toLowerCase();return categoryOk&&(!term||hay.includes(term))});if(sortEl.value==='oldest')arr.reverse();countEl.textContent=`${arr.length} reviewed attempt${arr.length===1?'':'s'} shown`;if(!arr.length){list.innerHTML='<div class="panel empty">No reviewed attempts match this filter.</div>';return}list.innerHTML=arr.map(a=>{const q=qmap[a.question_id]||{},target=a.improvement_target_1||'No specific target recorded.',practice=role==='reviewer'?'':`<div class="btns"><button class="btn primary" data-feedback-review-q="${esc(a.question_id)}">Practice this question again</button></div>`;return `<details class="feedback-accordion" data-feedback-attempt="${esc(a.attempt_id)}"><summary><div><div class="feedback-accordion-title">${esc(q.main_question||a.question_id)}</div><div class="feedback-accordion-meta">${esc(a.question_id)} · ${esc(q.category||'')} · ${esc(shortDate(a.reviewed_at||a.completed_at))} · ${esc(readinessLabel(a.question_id))}</div></div><div class="feedback-accordion-target">${esc(target)}</div></summary><div class="feedback-detail">${recordedAnswerHtml(a,q,role==='student'?'Your recorded answer':"Shimpei's recorded answer")}${reviewAdviceHtml(a)}<div class="feedback-label">Student reflection</div><div class="feedback-note"><b>Hardest:</b> ${esc(a.reflection_hardest||'—')}<br><b>Next:</b> ${esc(a.reflection_next||'—')}</div>${practice}</div></details>`}).join('');document.querySelectorAll('[data-feedback-review-q]').forEach(b=>b.onclick=()=>startQuestion(b.dataset.feedbackReviewQ))}
function renderQuestions()'''
s, n = re.subn(pattern, replacement, s, count=1, flags=re.S)
assert n == 1, f'renderStudentFeedback replacement count={n}'

# 7) Bind filters and render the review tab whenever application state is rendered.
old_render_all = "function renderAll(){$('actorLabel').textContent=(boot.actor_label||boot.config.student_label||'Student')+' · '+roleLabel();if(['admin','reviewer'].includes(role))$('reviewerNav').classList.remove('hidden');renderOrientation();renderStrategy();renderDashboard();renderQuestions();renderReviewer();renderLiveForm();applyAckGate()}"
new_render_all = "function renderAll(){$('actorLabel').textContent=(boot.actor_label||boot.config.student_label||'Student')+' · '+roleLabel();if(['admin','reviewer'].includes(role))$('reviewerNav').classList.remove('hidden');renderOrientation();renderStrategy();renderDashboard();renderQuestions();renderFeedbackReview();renderReviewer();renderLiveForm();applyAckGate();if($('feedbackCategory'))$('feedbackCategory').onchange=renderFeedbackReview;if($('feedbackSearch'))$('feedbackSearch').oninput=renderFeedbackReview;if($('feedbackSort'))$('feedbackSort').onchange=renderFeedbackReview}"
assert old_render_all in s, 'renderAll anchor not found'
s = s.replace(old_render_all, new_render_all, 1)

# 8) Reviewer dashboard no longer needs to render a duplicate full history.
s = s.replace(";document.querySelectorAll('[data-aid]').forEach(x=>x.onclick=()=>selectReview(x.dataset.aid));renderReviewHistory(qmap)}", ";document.querySelectorAll('[data-aid]').forEach(x=>x.onclick=()=>selectReview(x.dataset.aid))}", 1)

# 9) Page title/subtitle map for the new tab.
old_titles = "$('pageTitle').textContent={overview:'Overview',questions:'Question Bank',practice:'Practice',strategy:'Strategy',reviewer:'Reviewer Dashboard'}[id]||'Interview Training';$('pageSub').textContent={overview:'Shared progress, feedback and interview readiness.',questions:'Choose one item and improve it over repeated attempts.',practice:'One question at a time.',strategy:'Why this training works this way.',reviewer:'Review home practice and record live interview performance.'}[id]||''"
new_titles = "$('pageTitle').textContent={overview:'Overview',questions:'Question Bank',practice:'Practice',feedback:'Feedback Review',strategy:'Strategy',reviewer:'Reviewer Dashboard'}[id]||'Interview Training';$('pageSub').textContent={overview:'Shared progress, feedback and interview readiness.',questions:'Choose one item and improve it over repeated attempts.',practice:'One question at a time.',feedback:'Review previous answers and turn feedback into the next attempt.',strategy:'Why this training works this way.',reviewer:'Review home practice and record live interview performance.'}[id]||''"
assert old_titles in s, 'showSec title map anchor not found'
s = s.replace(old_titles, new_titles, 1)

s = s.replace("const APP_VERSION='1.4.0';", "const APP_VERSION='1.5.0';", 1)
index.write_text(s)

# 10) Add Japanese shell labels for Hiro/Admin without translating Shimpei's actual answers/questions.
admin = Path('AdminJa.html')
a = admin.read_text()
marker = "  const exact={\n"
assert marker in a, 'AdminJa exact-map anchor not found'
extra = "  const exact={\n    'Feedback Review':'レビュー復習','Recent reviewer feedback':'最近のレビュー','A quick view of the latest feedback. Use Feedback Review for the full history.':'最新のレビューだけを表示します。過去分は「レビュー復習」で確認できます。','Review previous answers and turn feedback into the next attempt.':'過去の回答と指摘を確認し、次の練習に反映します。','Review the question, what Shimpei recorded after answering, the reviewer comment, and exactly what to change next.':'質問・心平が記録した回答・Reviewerの指摘・次回直す点をまとめて確認します。','Category':'カテゴリ','Search':'検索','Sort':'並び順','All categories':'全カテゴリ','Newest first':'新しい順','Oldest first':'古い順','Open Feedback Review':'レビュー復習を開く','Review':'確認',\n"
a = a.replace(marker, extra, 1)
admin.write_text(a)

# 11) Replace feedback tests so they verify the scalable review UI.
test = Path('tests/feedback-context.test.js')
test.write_text(r'''const test=require('node:test');
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

test('reviewers can use feedback tab without duplicate long history panel',()=>{
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
''')
