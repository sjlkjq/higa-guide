from pathlib import Path
import re

p = Path('index.html')
s = p.read_text()

assert "const APP_VERSION='1.3.0';" in s, 'Expected app version 1.3.0 not found'

# Add styles for full question/answer/review context.
old_css = ".feedback-target{background:#fff9ec;border:1px solid #f4d7a7;border-radius:9px;padding:9px 10px;margin:6px 0;font-size:11px;line-height:1.45;color:#6a4611}.reflection{"
new_css = ".feedback-target{background:#fff9ec;border:1px solid #f4d7a7;border-radius:9px;padding:9px 10px;margin:6px 0;font-size:11px;line-height:1.45;color:#6a4611}.feedback-question{font-size:13px;font-weight:700;line-height:1.5;color:#17202b;background:#f7f9fc;border:1px solid #e5e9f0;border-radius:9px;padding:10px}.answer-block{font-size:12px;line-height:1.6;color:#344054;background:#f7fbff;border:1px solid #dbe6ff;border-radius:9px;padding:10px}.followup-block{margin-top:10px;padding-top:9px;border-top:1px solid #dbe6ff}.review-meta{font-size:10px;color:var(--muted);margin-top:8px}.reflection{"
assert old_css in s, 'Feedback CSS anchor not found'
s = s.replace(old_css, new_css, 1)

# Add a reviewed-history panel for parent/teacher reviewers.
old_html = '      </div>\n      <div class="panel live" style="margin-top:14px"><h4>Record a live interview session</h4>'
new_html = '      </div>\n      <div class="panel" style="margin-top:14px"><h4>Reviewed attempts & feedback</h4><div class="panel-sub">Question, Shimpei\'s recorded answer, reviewer feedback and next changes are kept together here.</div><div id="reviewHistory"></div></div>\n      <div class="panel live" style="margin-top:14px"><h4>Record a live interview session</h4>'
assert old_html in s, 'Reviewer history HTML anchor not found'
s = s.replace(old_html, new_html, 1)

# Replace student feedback rendering with full context: question + recorded answers + critique + action points.
student_block = r'''function answerText(s){return esc(s||'—').replace(/\n/g,'<br>')}
function recordedAnswerHtml(a,q,title){const fs=(q&&q.followups)||[];let h=`<div class="feedback-label">Question</div><div class="feedback-question">${esc(q?q.main_question:'Question unavailable')}</div><div class="feedback-label">${esc(title||"Shimpei's recorded answer")}</div><div class="answer-block"><b>Main answer — recorded key points</b><br>${answerText(a.key_points)}`;if(fs[0]||a.followup1_key_points){h+=`<div class="followup-block"><b>Follow-up 1</b><br>${esc(fs[0]||'Follow-up question unavailable')}<br><br><b>Shimpei's recorded key points</b><br>${answerText(a.followup1_key_points)}</div>`}if(fs[1]||a.followup2_key_points){h+=`<div class="followup-block"><b>Follow-up 2</b><br>${esc(fs[1]||'Follow-up question unavailable')}<br><br><b>Shimpei's recorded key points</b><br>${answerText(a.followup2_key_points)}</div>`}h+=`</div><div class="helper">The app stores the key points Shimpei recorded after speaking, not an audio recording or word-for-word transcript.</div>`;return h}
function reviewAdviceHtml(a){const targets=[a.improvement_target_1,a.improvement_target_2].filter(Boolean);return `<div class="feedback-label">Reviewer feedback</div><div class="feedback-note">${answerText(a.reviewer_note||'The reviewer left the action points below.')}</div><div class="feedback-label">What to change next</div>${targets.length?targets.map((t,i)=>`<div class="feedback-target"><b>${i+1}.</b> ${esc(t)}</div>`).join(''):'<div class="helper">No specific improvement target was recorded.</div>'}<div class="review-meta">Reviewed by: ${esc(a.reviewed_by||'Reviewer')} · ${esc(shortDate(a.reviewed_at||a.completed_at))}</div>`}
function renderStudentFeedback(){const panel=$('studentFeedbackPanel'),box=$('studentFeedback');if(!panel||!box)return;if(role!=='student'){panel.classList.add('hidden');return}const qmap=Object.fromEntries((boot.questions||[]).map(q=>[q.id,q]));const arr=(boot.attempts||[]).filter(a=>Number(a.content||0)>0&&a.review_type!=='live').sort((a,b)=>String(b.reviewed_at||b.completed_at).localeCompare(String(a.reviewed_at||a.completed_at)));panel.classList.remove('hidden');if(!arr.length){box.innerHTML='<div class="empty">No reviewer feedback yet. Once an attempt is reviewed, the question, your recorded answer and the specific advice will appear here together.</div>';return}box.innerHTML=arr.map(a=>{const q=qmap[a.question_id];return `<div class="feedback-card"><h5>${esc(a.question_id)} · ${esc(shortDate(a.completed_at))}</h5>${recordedAnswerHtml(a,q,'Your recorded answer')}${reviewAdviceHtml(a)}<div class="btns"><button class="btn primary" data-feedback-q="${esc(a.question_id)}">Practice this question again</button></div></div>`}).join('');document.querySelectorAll('[data-feedback-q]').forEach(b=>b.onclick=()=>startQuestion(b.dataset.feedbackQ))}
function renderQuestions()'''
pattern = r"function renderStudentFeedback\(\)\{.*?\}\nfunction renderQuestions\(\)"
s, n = re.subn(pattern, student_block, s, count=1, flags=re.S)
assert n == 1, f'renderStudentFeedback replacement count={n}'

# When retrying, show the previous question, recorded answer and feedback together.
previous_block = r'''function renderPreviousFeedback(){const a=latestReviewed(currentQ.id);const box=$('previousFeedback');if(!a){box.classList.add('hidden');box.innerHTML='';return}box.classList.remove('hidden');box.innerHTML=`<h4>Feedback from your last reviewed attempt</h4>${recordedAnswerHtml(a,currentQ,'Your previous recorded answer')}${reviewAdviceHtml(a)}<div class="helper">Use the feedback above to improve the next answer. Do not memorise the old wording; explain it again in your own words.</div>`}
$('startThink')'''
pattern = r"function renderPreviousFeedback\(\)\{.*?\}\n\$\('startThink'\)"
s, n = re.subn(pattern, previous_block, s, count=1, flags=re.S)
assert n == 1, f'renderPreviousFeedback replacement count={n}'

# Reviewers need access to completed reviews too, not only the pending queue.
reviewer_block = r'''function renderReviewHistory(qmap){const box=$('reviewHistory');if(!box)return;const arr=(boot.attempts||[]).filter(a=>a.review_type!=='live'&&Number(a.content||0)>0).sort((a,b)=>String(b.reviewed_at||b.completed_at).localeCompare(String(a.reviewed_at||a.completed_at)));box.innerHTML=arr.length?arr.map(a=>{const q=qmap[a.question_id];return `<div class="feedback-card"><h5>${esc(a.question_id)} · ${esc(shortDate(a.completed_at))}</h5>${recordedAnswerHtml(a,q,"Shimpei's recorded answer")}${reviewAdviceHtml(a)}</div>`}).join(''):'<div class="empty">No reviewed home attempts yet.</div>'}
function renderReviewer(){if(!['admin','reviewer'].includes(role))return;const qmap=Object.fromEntries((boot.questions||[]).map(q=>[q.id,q]));const arr=(boot.attempts||[]).filter(a=>a.review_type!=='live'&&!Number(a.content||0));$('reviewQueue').innerHTML=arr.length?arr.map(a=>`<div class="risk" style="cursor:pointer" data-aid="${esc(a.attempt_id)}"><span class="badge medium">REVIEW</span><div><b>${esc(a.question_id)} — ${esc(qmap[a.question_id]?qmap[a.question_id].main_question:'')}</b><span>${esc(shortDate(a.completed_at))} · Reflection: ${esc(a.reflection_hardest||'')}</span></div></div>`).join(''):'<div class="empty">Nothing waiting for review.</div>';document.querySelectorAll('[data-aid]').forEach(x=>x.onclick=()=>selectReview(x.dataset.aid));renderReviewHistory(qmap)}
function selectReview'''
pattern = r"function renderReviewer\(\)\{.*?\}\nfunction selectReview"
s, n = re.subn(pattern, reviewer_block, s, count=1, flags=re.S)
assert n == 1, f'renderReviewer replacement count={n}'

# For a pending review, show the actual follow-up questions next to Shimpei's stored key points.
select_block = r'''function selectReview(id){selectedReview=(boot.attempts||[]).find(a=>a.attempt_id===id);if(!selectedReview)return;let q=(boot.questions||[]).find(q=>q.id===selectedReview.question_id);$('reviewEmpty').classList.add('hidden');$('reviewBody').classList.remove('hidden');$('reviewQuestion').innerHTML=`<b>${esc(selectedReview.question_id)}</b>`;$('reviewAnswerMeta').innerHTML=`${recordedAnswerHtml(selectedReview,q,"Shimpei's recorded answer")}<div class="feedback-label">Student reflection</div><div class="feedback-note"><b>Hardest:</b> ${esc(selectedReview.reflection_hardest||'—')}<br><b>Next:</b> ${esc(selectedReview.reflection_next||'—')}</div>`;$('scoreFields').innerHTML=CORE_FIELDS.map(f=>scoreSelectHtml('score_'+f,f)).join('');$('improve1').value='';$('improve2').value='';$('reviewerNote').value='';document.querySelectorAll('#scoreFields select').forEach(x=>x.onchange=updateReviewSaveState);['improve1','improve2','reviewerNote'].forEach(id=>$(id).oninput=updateReviewSaveState);updateReviewSaveState()}
function scoreSelectHtml'''
pattern = r"function selectReview\(id\)\{.*?\}\nfunction scoreSelectHtml"
s, n = re.subn(pattern, select_block, s, count=1, flags=re.S)
assert n == 1, f'selectReview replacement count={n}'

s = s.replace("const APP_VERSION='1.3.0';", "const APP_VERSION='1.4.0';", 1)
p.write_text(s)
