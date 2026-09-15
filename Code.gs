const SHEETS = {CONFIG:'Config',STRATEGY:'Strategy',QUESTIONS:'Questions',STATE:'State',ATTEMPTS:'Attempts',EVENTS:'EventLog',ACK:'Acknowledgements'};
const APP_VERSION = '1.2.0';

function doGet(e){
  const source = HtmlService.createHtmlOutputFromFile('index').getContent();
  const access = {
    role: String((e && e.parameter && e.parameter.role) || ''),
    token: String((e && e.parameter && e.parameter.token) || '')
  };
  const accessScript = '<script>window.__HIGA_ACCESS__=' + JSON.stringify(access) + ';' +
    'try{if(window.__HIGA_ACCESS__.token){localStorage.setItem("higa_token",window.__HIGA_ACCESS__.token);localStorage.setItem("higa_role",window.__HIGA_ACCESS__.role||"student");}}catch(e){}</script>';
  let html = source.includes('</head>') ? source.replace('</head>', accessScript + '</head>') : accessScript + source;
  if(access.role === 'admin' && html.includes('</body>')){
    const adminJa = HtmlService.createHtmlOutputFromFile('AdminJa').getContent();
    html = html.replace('</body>', adminJa + '</body>');
  }
  return HtmlService.createHtmlOutput(html)
    .setTitle('HiGA Interview Training')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function bootstrap(token, requestedRole){
  try{
    const auth = authorize_(token, requestedRole);
    if(!auth.ok) return auth;
    const config = config_();
    const questions = rows_(SHEETS.QUESTIONS).filter(r => truthy_(r.active)).map(r => ({
      id:r.id, category:r.category, priority:r.priority, source:r.source,
      main_question:r.main_question,
      followups:[r.followup_1,r.followup_2,r.followup_3,r.followup_4].filter(Boolean),
      coach_focus:r.coach_focus, risk:r.risk, order:Number(r.order||0),
      think_seconds:Number(r.think_seconds||config.default_think_seconds||45),
      min_followups:Number(r.min_followups||2), notes:r.notes
    }));
    const strategy = rows_(SHEETS.STRATEGY).sort((a,b)=>Number(a.order)-Number(b.order));
    const states = rows_(SHEETS.STATE);
    const attemptsAll = rows_(SHEETS.ATTEMPTS).sort((a,b)=>String(b.completed_at||b.started_at).localeCompare(String(a.completed_at||a.started_at)));
    const attempts = ['admin','reviewer'].includes(auth.role) ? attemptsAll.slice(0,400) : attemptsAll.slice(0,160);
    const acks = rows_(SHEETS.ACK).sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)));
    return {
      ok:true, role:auth.role, actor_label:auth.label, config:publicConfig_(config),
      strategy, questions, states, attempts, ack:acks[0]||null
    };
  } catch(err){ return {ok:false,error:String(err.message||err)}; }
}

function saveAcknowledgement(token, requestedRole, payload){
  const auth=authorize_(token,requestedRole); if(!auth.ok)return auth;
  if(auth.role!=='student' && auth.role!=='admin') return {ok:false,error:'Student access required.'};
  appendObject_(SHEETS.ACK, payload);
  return {ok:true};
}

function logEvent(token, requestedRole, payload){
  const auth=authorize_(token,requestedRole); if(!auth.ok)return auth;
  appendObject_(SHEETS.EVENTS, payload);
  return {ok:true};
}

function completeAttempt(token, requestedRole, payload){
  const auth=authorize_(token,requestedRole); if(!auth.ok)return auth;
  if(auth.role!=='student' && auth.role!=='admin') return {ok:false,error:'Student access required.'};
  if(!truthy_(payload.valid_attempt) || !truthy_(payload.answer_done)) return {ok:false,error:'Attempt does not meet completion rules.'};
  const q = findBy_(SHEETS.QUESTIONS,'id',payload.question_id);
  if(!q) return {ok:false,error:'Question not found.'};
  const c=config_();
  const minFollow = Math.min(Number(q.min_followups||2), 2);
  const minKeyPoints = Number(c.min_key_points||2);
  const minFollowPoints = Number(c.min_followup_key_points||1);
  if(lineCount_(payload.key_points) < minKeyPoints) return {ok:false,error:'At least '+minKeyPoints+' main-answer key points are required.'};
  if(Number(payload.think_elapsed_sec||0) < Math.max(5,Number(q.think_seconds||45)-2)) return {ok:false,error:'Required thinking time was not completed.'};
  if(minFollow>=1 && (!truthy_(payload.followup1_done) || lineCount_(payload.followup1_key_points)<minFollowPoints)) return {ok:false,error:'Follow-up 1 needs an answer and key point.'};
  if(minFollow>=2 && (!truthy_(payload.followup2_done) || lineCount_(payload.followup2_key_points)<minFollowPoints)) return {ok:false,error:'Follow-up 2 needs an answer and key point.'};
  if(!String(payload.reflection_hardest||'').trim()) return {ok:false,error:'Choose what was hardest.'};
  if(!String(payload.reflection_next||'').trim()) return {ok:false,error:'Choose what you will try next time.'};
  payload.review_type='home';
  payload.student_reflection=[payload.reflection_hardest,payload.reflection_next,payload.reflection_note].filter(Boolean).join(' | ');
  appendObject_(SHEETS.ATTEMPTS, payload);
  updateStateAfterAttempt_(payload.question_id,payload);
  return {ok:true};
}

function saveReview(token, requestedRole, payload){
  const auth=authorize_(token,requestedRole); if(!auth.ok)return auth;
  if(!['admin','reviewer'].includes(auth.role)) return {ok:false,error:'Reviewer access required.'};
  const core=['content','logic','specificity','ownership'];
  if(core.some(k=>Number(payload[k]||0)<1 || Number(payload[k]||0)>5)) return {ok:false,error:'Score all four reasoning areas.'};
  const sh=sheet_(SHEETS.ATTEMPTS), vals=sh.getDataRange().getValues();
  if(vals.length<2)return {ok:false,error:'Attempt not found.'};
  const headers=vals[0].map(String), idx=headers.indexOf('attempt_id');
  const rowIndex=vals.findIndex((r,i)=>i>0 && String(r[idx])===String(payload.attempt_id));
  if(rowIndex<1)return {ok:false,error:'Attempt not found.'};
  const reviewedAt=payload.reviewed_at||new Date().toISOString();
  const updates={
    content:payload.content, logic:payload.logic, specificity:payload.specificity, ownership:payload.ownership,
    english:'', delivery:'', coach_note:payload.reviewer_note||'', reviewer_note:payload.reviewer_note||'',
    review_type:'home', reviewed_by:auth.label, reviewed_at:reviewedAt,
    improvement_target_1:payload.improvement_target_1||'', improvement_target_2:payload.improvement_target_2||''
  };
  Object.keys(updates).forEach(k=>{const c=headers.indexOf(k); if(c>=0)sh.getRange(rowIndex+1,c+1).setValue(updates[k]);});
  const qid=headers.indexOf('question_id')>=0?vals[rowIndex][headers.indexOf('question_id')]:payload.question_id;
  const status = statusFromScores_(payload,qid);
  const cStatus=headers.indexOf('status_after'); if(cStatus>=0)sh.getRange(rowIndex+1,cStatus+1).setValue(status);
  updateStateAfterReview_(qid,payload,status,auth.label);
  appendObject_(SHEETS.EVENTS,{timestamp:reviewedAt,session_id:'review',device_id:'review',question_id:qid,event_type:'review_saved',event_value:status,elapsed_sec:'',page:'reviewer',attempt_id:payload.attempt_id,user_role:auth.role,app_version:APP_VERSION,note:payload.improvement_target_1||''});
  return {ok:true,status};
}

function saveLiveReview(token, requestedRole, payload){
  const auth=authorize_(token,requestedRole); if(!auth.ok)return auth;
  if(!['admin','reviewer'].includes(auth.role)) return {ok:false,error:'Reviewer access required.'};
  const q=findBy_(SHEETS.QUESTIONS,'id',payload.question_id); if(!q)return {ok:false,error:'Question not found.'};
  const core=['content','logic','specificity','ownership','delivery'];
  if(core.some(k=>Number(payload[k]||0)<1 || Number(payload[k]||0)>5)) return {ok:false,error:'Score all live-interview areas.'};
  const now=new Date().toISOString();
  const attemptId=payload.attempt_id||('live_'+new Date().getTime()+'_'+Math.random().toString(36).slice(2,8));
  const row={
    attempt_id:attemptId,question_id:payload.question_id,started_at:now,think_started_at:'',think_elapsed_sec:'',
    key_points:payload.live_note||'',answer_done:true,followup1_done:'',followup2_done:'',completed_at:now,
    content:payload.content,logic:payload.logic,specificity:payload.specificity,english:'',delivery:payload.delivery,ownership:payload.ownership,
    student_confidence:'',student_reflection:'',coach_note:payload.reviewer_note||'',status_after:'',device_id:'reviewer',session_id:'live',source:'live',valid_attempt:true,
    followup1_key_points:'',followup2_key_points:'',reflection_hardest:'',reflection_next:'',reflection_note:'',review_type:'live',
    reviewed_by:auth.label,reviewed_at:now,improvement_target_1:payload.improvement_target_1||'',improvement_target_2:payload.improvement_target_2||'',
    reviewer_note:payload.reviewer_note||'',delivery_note:payload.delivery_note||''
  };
  appendObject_(SHEETS.ATTEMPTS,row);
  const status=statusFromScores_(payload,payload.question_id);
  updateAttemptStatus_(attemptId,status);
  updateStateAfterAttempt_(payload.question_id,{completed_at:now,attempt_id:attemptId,student_reflection:''});
  updateStateAfterReview_(payload.question_id,payload,status,auth.label);
  appendObject_(SHEETS.EVENTS,{timestamp:now,session_id:'live',device_id:'reviewer',question_id:payload.question_id,event_type:'live_review_saved',event_value:status,elapsed_sec:'',page:'reviewer',attempt_id:attemptId,user_role:auth.role,app_version:APP_VERSION,note:payload.improvement_target_1||''});
  return {ok:true,status,attempt_id:attemptId};
}

function authorize_(token, requestedRole){
  const c=config_();
  if(token && token===String(c.parent_token||'')) return {ok:true,role:'admin',label:String(c.admin_label||'Parent / Admin')};
  if(token && token===String(c.reviewer_token||'')) return {ok:true,role:'reviewer',label:String(c.reviewer_label||'Reviewer')};
  if(token && token===String(c.student_token||'')) return {ok:true,role:'student',label:String(c.student_label||'Student')};
  return {ok:false,error:'Invalid access token.'};
}

function publicConfig_(c){
  return {app_title:c.app_title||'HiGA Interview Training',student_label:c.student_label||'Student',default_think_seconds:Number(c.default_think_seconds||45),require_acknowledgement:truthy_(c.require_acknowledgement),min_key_points:Number(c.min_key_points||2),min_followup_key_points:Number(c.min_followup_key_points||1),min_ready_attempts:Number(c.min_ready_attempts||2),ready_threshold:Number(c.ready_threshold||4)};
}

function config_(){ const out={}; rows_(SHEETS.CONFIG).forEach(r=>{if(r.key)out[r.key]=r.value}); return out; }
function sheet_(name){ const s=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); if(!s)throw new Error('Missing sheet: '+name); return s; }
function rows_(name){ const sh=sheet_(name), vals=sh.getDataRange().getValues(); if(!vals.length)return[]; const h=vals[0].map(String); return vals.slice(1).filter(r=>r.some(v=>v!==''&&v!==null)).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]]))); }
function findBy_(name,key,value){ return rows_(name).find(r=>String(r[key])===String(value)); }
function truthy_(v){ return v===true || String(v).toLowerCase()==='true' || String(v)==='1' || String(v).toLowerCase()==='yes'; }
function appendObject_(name,obj){ const sh=sheet_(name), headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String); sh.appendRow(headers.map(h=>obj[h]??'')); }
function lineCount_(s){return String(s||'').split(/\n+/).map(x=>x.trim()).filter(x=>x.length>3).length;}

function updateAttemptStatus_(attemptId,status){
  const sh=sheet_(SHEETS.ATTEMPTS), vals=sh.getDataRange().getValues(), h=vals[0].map(String);
  const ri=vals.findIndex((r,i)=>i>0 && String(r[h.indexOf('attempt_id')])===String(attemptId));
  if(ri>0){const c=h.indexOf('status_after'); if(c>=0)sh.getRange(ri+1,c+1).setValue(status);}
}

function updateStateAfterAttempt_(qid,payload){
  const sh=sheet_(SHEETS.STATE), vals=sh.getDataRange().getValues(), h=vals[0].map(String), idc=h.indexOf('question_id');
  let ri=vals.findIndex((r,i)=>i>0 && String(r[idc])===String(qid));
  if(ri<1){ sh.appendRow(h.map(k=>k==='question_id'?qid:k==='status'?'Awaiting review':k==='attempt_count'?1:k==='last_practiced'?payload.completed_at:k==='last_attempt_id'?payload.attempt_id:k==='updated_at'?new Date().toISOString():k==='updated_by'?'student':'')); return; }
  const row=ri+1;
  setByHeader_(sh,h,row,'status','Awaiting review');
  setByHeader_(sh,h,row,'attempt_count',Number(vals[ri][h.indexOf('attempt_count')]||0)+1);
  setByHeader_(sh,h,row,'last_practiced',payload.completed_at);
  setByHeader_(sh,h,row,'last_attempt_id',payload.attempt_id);
  setByHeader_(sh,h,row,'student_note',payload.student_reflection||'');
  setByHeader_(sh,h,row,'updated_at',new Date().toISOString());
  setByHeader_(sh,h,row,'updated_by','student');
}

function updateStateAfterReview_(qid,p,status,actorLabel){
  const sh=sheet_(SHEETS.STATE), vals=sh.getDataRange().getValues(), h=vals[0].map(String), idc=h.indexOf('question_id');
  let ri=vals.findIndex((r,i)=>i>0 && String(r[idc])===String(qid));
  if(ri<1){ sh.appendRow(h.map(k=>k==='question_id'?qid:k==='status'?status:k==='attempt_count'?1:'')); ri=sh.getLastRow()-1; }
  const row=ri+1, rowVals=sh.getRange(row,1,1,h.length).getValues()[0];
  ['content','logic','specificity','ownership','delivery'].forEach(k=>{
    const col='best_'+k, ci=h.indexOf(col); if(ci>=0 && Number(p[k]||0)>0) sh.getRange(row,ci+1).setValue(Math.max(Number(rowVals[ci]||0),Number(p[k]||0)));
  });
  setByHeader_(sh,h,row,'status',status);
  setByHeader_(sh,h,row,'parent_note',p.improvement_target_1||p.reviewer_note||'');
  setByHeader_(sh,h,row,'updated_at',new Date().toISOString());
  setByHeader_(sh,h,row,'updated_by',actorLabel||'reviewer');
}
function setByHeader_(sh,h,row,key,val){ const c=h.indexOf(key); if(c>=0)sh.getRange(row,c+1).setValue(val); }

function statusFromScores_(p,qid){
  const core=['content','logic','specificity','ownership'].map(k=>Number(p[k]||0));
  const avg=core.reduce((x,y)=>x+y,0)/core.length;
  const c=config_();
  const threshold=Number(c.ready_threshold||4);
  const minReadyAttempts=Math.max(1,Number(c.min_ready_attempts||2));
  const reviewedCount=rows_(SHEETS.ATTEMPTS).filter(r=>String(r.question_id)===String(qid) && Number(r.content||0)>0 && Number(r.logic||0)>0 && Number(r.specificity||0)>0 && Number(r.ownership||0)>0).length;
  if(avg>=threshold && core.every(x=>x>=threshold) && reviewedCount>=minReadyAttempts)return 'Ready';
  if(avg>=2.75)return 'Developing';
  return 'Weak';
}