const SHEETS = {CONFIG:'Config',STRATEGY:'Strategy',QUESTIONS:'Questions',STATE:'State',ATTEMPTS:'Attempts',EVENTS:'EventLog',ACK:'Acknowledgements'};

function doGet(e){
  return HtmlService.createHtmlOutputFromFile('Index')
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
    const attempts = auth.role==='parent' ? attemptsAll.slice(0,200) : attemptsAll.slice(0,40);
    const acks = rows_(SHEETS.ACK).sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)));
    return {ok:true, role:auth.role, config:publicConfig_(config), strategy, questions, states, attempts, ack:acks[0]||null};
  } catch(err){ return {ok:false,error:String(err.message||err)}; }
}

function saveAcknowledgement(token, requestedRole, payload){
  const auth=authorize_(token,requestedRole); if(!auth.ok)return auth;
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
  if(auth.role!=='student' && auth.role!=='parent') return {ok:false,error:'Invalid role'};
  if(!truthy_(payload.valid_attempt) || !truthy_(payload.answer_done)) return {ok:false,error:'Attempt does not meet completion rules.'};
  const q = findBy_(SHEETS.QUESTIONS,'id',payload.question_id);
  if(!q) return {ok:false,error:'Question not found.'};
  const minFollow = Number(q.min_followups||2);
  const followDone = (truthy_(payload.followup1_done)?1:0)+(truthy_(payload.followup2_done)?1:0);
  if(followDone < Math.min(minFollow,2)) return {ok:false,error:'Required follow-ups were not completed.'};
  if(String(payload.key_points||'').trim().split(/\n+/).filter(x=>x.trim().length>3).length < 2) return {ok:false,error:'At least two key points are required.'};
  if(Number(payload.think_elapsed_sec||0) < Math.max(5,Number(q.think_seconds||45)-2)) return {ok:false,error:'Required thinking time was not completed.'};
  appendObject_(SHEETS.ATTEMPTS, payload);
  updateStateAfterAttempt_(payload.question_id,payload);
  return {ok:true};
}

function saveReview(token, requestedRole, payload){
  const auth=authorize_(token,requestedRole); if(!auth.ok)return auth;
  if(auth.role!=='parent') return {ok:false,error:'Parent access required.'};
  const sh=sheet_(SHEETS.ATTEMPTS), vals=sh.getDataRange().getValues();
  if(vals.length<2)return {ok:false,error:'Attempt not found.'};
  const headers=vals[0].map(String), idx=headers.indexOf('attempt_id');
  const rowIndex=vals.findIndex((r,i)=>i>0 && String(r[idx])===String(payload.attempt_id));
  if(rowIndex<1)return {ok:false,error:'Attempt not found.'};
  ['content','logic','specificity','english','delivery','ownership','coach_note'].forEach(k=>{
    const c=headers.indexOf(k); if(c>=0) sh.getRange(rowIndex+1,c+1).setValue(payload[k]??'');
  });
  const qid=headers.indexOf('question_id')>=0?vals[rowIndex][headers.indexOf('question_id')]:payload.question_id;
  const status = statusFromScores_(payload);
  const cStatus=headers.indexOf('status_after'); if(cStatus>=0)sh.getRange(rowIndex+1,cStatus+1).setValue(status);
  updateStateAfterReview_(qid,payload,status);
  appendObject_(SHEETS.EVENTS,{timestamp:payload.reviewed_at||new Date().toISOString(),session_id:'parent',device_id:'parent',question_id:qid,event_type:'parent_review_saved',event_value:status,elapsed_sec:'',page:'parent',attempt_id:payload.attempt_id,user_role:'parent',app_version:'1.0.0',note:payload.coach_note||''});
  return {ok:true,status};
}

function authorize_(token, requestedRole){
  const c=config_();
  if(token && token===String(c.parent_token||'')) return {ok:true,role:'parent'};
  if(token && token===String(c.student_token||'')) return {ok:true,role:'student'};
  return {ok:false,error:'Invalid access token.'};
}

function publicConfig_(c){
  return {app_title:c.app_title||'HiGA Interview Training',student_label:c.student_label||'Student',default_think_seconds:Number(c.default_think_seconds||45),require_acknowledgement:truthy_(c.require_acknowledgement),min_key_points:Number(c.min_key_points||2),min_ready_attempts:Number(c.min_ready_attempts||2),ready_threshold:Number(c.ready_threshold||4)};
}

function config_(){ const out={}; rows_(SHEETS.CONFIG).forEach(r=>{if(r.key)out[r.key]=r.value}); return out; }
function sheet_(name){ const s=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); if(!s)throw new Error('Missing sheet: '+name); return s; }
function rows_(name){ const sh=sheet_(name), vals=sh.getDataRange().getValues(); if(!vals.length)return[]; const h=vals[0].map(String); return vals.slice(1).filter(r=>r.some(v=>v!==''&&v!==null)).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]]))); }
function findBy_(name,key,value){ return rows_(name).find(r=>String(r[key])===String(value)); }
function truthy_(v){ return v===true || String(v).toLowerCase()==='true' || String(v)==='1' || String(v).toLowerCase()==='yes'; }
function appendObject_(name,obj){ const sh=sheet_(name), headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String); sh.appendRow(headers.map(h=>obj[h]??'')); }

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

function updateStateAfterReview_(qid,p,status){
  const sh=sheet_(SHEETS.STATE), vals=sh.getDataRange().getValues(), h=vals[0].map(String), idc=h.indexOf('question_id');
  let ri=vals.findIndex((r,i)=>i>0 && String(r[idc])===String(qid));
  if(ri<1){ sh.appendRow(h.map(k=>k==='question_id'?qid:k==='status'?status:k==='attempt_count'?1:'')); ri=sh.getLastRow()-1; }
  const row=ri+1, rowVals=sh.getRange(row,1,1,h.length).getValues()[0];
  ['content','logic','specificity','english','delivery','ownership'].forEach(k=>{
    const col='best_'+k, ci=h.indexOf(col); if(ci>=0) sh.getRange(row,ci+1).setValue(Math.max(Number(rowVals[ci]||0),Number(p[k]||0)));
  });
  setByHeader_(sh,h,row,'status',status);
  setByHeader_(sh,h,row,'parent_note',p.coach_note||'');
  setByHeader_(sh,h,row,'updated_at',new Date().toISOString());
  setByHeader_(sh,h,row,'updated_by','parent');
}
function setByHeader_(sh,h,row,key,val){ const c=h.indexOf(key); if(c>=0)sh.getRange(row,c+1).setValue(val); }
function statusFromScores_(p){ const a=['content','logic','specificity','english','delivery','ownership'].map(k=>Number(p[k]||0)); const avg=a.reduce((x,y)=>x+y,0)/a.length; if(avg>=4 && Number(p.ownership)>=4 && Number(p.logic)>=4)return 'Ready'; if(avg>=2.75)return 'Developing'; return 'Weak'; }
