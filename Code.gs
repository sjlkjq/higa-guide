const SHEETS = {CONFIG:'Config',STRATEGY:'Strategy',QUESTIONS:'Questions',STATE:'State',ATTEMPTS:'Attempts',EVENTS:'EventLog',ACK:'Acknowledgements',MOCKQ:'MockQuestions',MOCKA:'MockAnswers',MOCKS:'MockSessions',MOCKTA:'MockTestAnswers',MOCKTS:'MockTestSessions'};
const APP_VERSION = '1.7.0';

function doGet(e){
  const params=(e && e.parameter)||{};
  const mode=String(params.mode||'').toLowerCase();
  const fileName=mode==='mock'?'MockInterview':mode==='mockreview'?'MockReview':'index';
  const source = HtmlService.createHtmlOutputFromFile(fileName).getContent();
  const access = {
    role: String(params.role || ''),
    token: String(params.token || '')
  };
  const accessScript = '<script>window.__HIGA_ACCESS__=' + JSON.stringify(access) + ';' +
    'try{if(window.__HIGA_ACCESS__.token){localStorage.setItem("higa_token",window.__HIGA_ACCESS__.token);localStorage.setItem("higa_role",window.__HIGA_ACCESS__.role||"student");}}catch(e){}</script>';
  let html = source.includes('</head>') ? source.replace('</head>', accessScript + '</head>') : accessScript + source;
  if(!['mock','mockreview'].includes(mode) && access.role === 'admin' && html.includes('</body>')){
    const adminJa = HtmlService.createHtmlOutputFromFile('AdminJa').getContent();
    html = html.replace('</body>', adminJa + '</body>');
  }
  return HtmlService.createHtmlOutput(html)
    .setTitle(mode==='mock'?'Mock Interview':mode==='mockreview'?'Mock Review':'HiGA Interview Training')
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


function mockBootstrap(token, requestedRole){
  try{
    const auth=authorize_(token,requestedRole); if(!auth.ok)return auth;
    const questions=rows_(SHEETS.MOCKQ)
      .filter(r=>truthy_(r.active))
      .map(r=>({
        id:String(r.id||''), profile:String(r.profile||''), phase:String(r.phase||''),
        language:String(r.language||'en-US'), kind:String(r.kind||'main'),
        parent_id:String(r.parent_id||''), order:Number(r.order||0),
        source_type:String(r.source_type||''), source_ref:String(r.source_ref||''),
        question_text:String(r.question_text||''), concept:String(r.concept||''),
        ask_rule:String(r.ask_rule||'always'), notes:String(r.notes||'')
      }))
      .sort((a,b)=>a.profile.localeCompare(b.profile)||a.order-b.order);
    const recent=rows_(SHEETS.MOCKS)
      .sort((a,b)=>String(b.started_at||'').localeCompare(String(a.started_at||'')))
      .slice(0,20)
      .map(r=>({session_id:r.session_id,profile:r.profile,started_at:r.started_at,completed_at:r.completed_at,questions_asked:r.questions_asked,followups_asked:r.followups_asked,answers_saved:r.answers_saved}));
    return {ok:true,role:auth.role,actor_label:auth.label,test_mode:auth.role!=='student',questions,recent_sessions:recent,app_version:APP_VERSION};
  }catch(err){return {ok:false,error:String(err.message||err)};}
}

function mockStartSession(token, requestedRole, payload){
  const auth=authorize_(token,requestedRole); if(!auth.ok)return auth;
  if(!payload || typeof payload!=='object')return {ok:false,error:'Invalid mock session payload.'};
  const profile=String(payload.profile||'').toLowerCase();
  if(!['shimpei','shiori'].includes(profile))return {ok:false,error:'Invalid profile.'};
  const sessionId=String(payload.session_id||('mock_'+new Date().getTime()+'_'+Math.random().toString(36).slice(2,8)));
  const names=mockSheetNames_(auth.role);
  if(findBy_(names.sessions,'session_id',sessionId))return {ok:false,error:'Mock session already exists.'};
  appendObject_(names.sessions,{
    session_id:sessionId,profile,started_at:payload.started_at||new Date().toISOString(),completed_at:'',
    elapsed_ms:'',questions_asked:0,followups_asked:0,answers_saved:0,
    recognition_supported:payload.recognition_supported,device_id:payload.device_id||'',
    user_agent:payload.user_agent||'',notes:''
  });
  return {ok:true,session_id:sessionId,test_mode:auth.role!=='student',persisted:true,data_scope:names.scope};
}

function mockSaveAnswer(token, requestedRole, payload){
  const auth=authorize_(token,requestedRole); if(!auth.ok)return auth;
  if(!payload || typeof payload!=='object')return {ok:false,error:'Invalid mock answer payload.'};
  const q=findBy_(SHEETS.MOCKQ,'id',payload.question_id);
  if(!q || !truthy_(q.active))return {ok:false,error:'Mock question not found.'};
  if(String(q.profile)!==String(payload.profile))return {ok:false,error:'Question/profile mismatch.'};
  const names=mockSheetNames_(auth.role);
  const session=findBy_(names.sessions,'session_id',payload.session_id);
  if(!session)return {ok:false,error:'Mock session not found.'};
  if(String(session.profile)!==String(payload.profile))return {ok:false,error:'Session/profile mismatch.'};
  if(String(session.completed_at||'').trim())return {ok:false,error:'Mock session is already completed.'};
  const duplicate=rows_(names.answers).find(r=>String(r.session_id)===String(payload.session_id)&&String(r.question_id)===String(payload.question_id));
  if(duplicate)return {ok:true,persisted:true,duplicate:true,audio_saved:!!String(duplicate.audio_file_id||'').trim(),audio_status:duplicate.audio_status||''};
  const audio=saveMockAudio_(auth.role,payload);
  if(truthy_(payload.audio_expected) && !audio.file_id){
    return {ok:false,error:'Audio recording could not be saved to Google Drive: '+String(audio.error||audio.status||'unknown error'),
      audio_saved:false,audio_status:audio.status||'save_error'};
  }
  const stt=mockTranscribeDeepgram_(payload,String(payload.profile||''));
  appendObject_(names.answers,{
    session_id:payload.session_id,profile:payload.profile,question_id:payload.question_id,parent_id:q.parent_id||'',
    question_kind:q.kind||'main',language:q.language||'',started_at:payload.started_at||'',
    completed_at:payload.completed_at||new Date().toISOString(),transcript:stt.transcript||'',
    response_latency_ms:numberOrBlank_(payload.response_latency_ms),answer_duration_ms:numberOrBlank_(payload.answer_duration_ms),
    longest_internal_silence_ms:numberOrBlank_(payload.longest_internal_silence_ms),speech_detected:truthy_(payload.speech_detected),
    recognition_supported:truthy_(payload.recognition_supported),recognition_error:payload.recognition_error||'',
    repeat_count:Number(payload.repeat_count||0),device_id:payload.device_id||'',user_agent:payload.user_agent||'',
    audio_file_id:audio.file_id||'',audio_mime_type:audio.mime_type||'',audio_status:audio.status||'',
    audio_error:audio.error||'',audio_bytes:Number(audio.bytes||0),
    browser_transcript:stt.browser_transcript||'',stt_provider:stt.provider||'',stt_model:stt.model||'',
    stt_language_mode:stt.language_mode||'',stt_detected_language:stt.detected_language||'',
    stt_confidence:stt.confidence===''?'':stt.confidence,stt_status:stt.status||'',stt_error:stt.error||''
  });
  incrementMockSessionCounters_(names.sessions,payload.session_id,String(q.kind)==='followup');
  return {ok:true,test_mode:auth.role!=='student',persisted:true,data_scope:names.scope,
    audio_saved:!!audio.file_id,audio_status:audio.status||'',audio_bytes:Number(audio.bytes||0),
    stt:{provider:stt.provider,status:stt.status,language_mode:stt.language_mode,detected_language:stt.detected_language,confidence:stt.confidence}};
}

function mockFinishSession(token, requestedRole, payload){
  const auth=authorize_(token,requestedRole); if(!auth.ok)return auth;
  if(!payload || typeof payload!=='object')return {ok:false,error:'Invalid mock finish payload.'};
  const names=mockSheetNames_(auth.role);
  const sh=sheet_(names.sessions),vals=sh.getDataRange().getValues(); if(vals.length<2)return {ok:false,error:'Mock session not found.'};
  const h=vals[0].map(String),idc=h.indexOf('session_id');
  const ri=vals.findIndex((r,i)=>i>0&&String(r[idc])===String(payload.session_id));
  if(ri<1)return {ok:false,error:'Mock session not found.'};
  const row=ri+1;
  const completedCol=h.indexOf('completed_at');
  if(completedCol>=0 && String(vals[ri][completedCol]||'').trim())return {ok:true,persisted:true,duplicate:true};
  setByHeader_(sh,h,row,'completed_at',payload.completed_at||new Date().toISOString());
  setByHeader_(sh,h,row,'elapsed_ms',numberOrBlank_(payload.elapsed_ms));
  setByHeader_(sh,h,row,'notes',payload.notes||'');
  return {ok:true,test_mode:auth.role!=='student',persisted:true,data_scope:names.scope};
}

function incrementMockSessionCounters_(sheetName,sessionId,isFollowup){
  const sh=sheet_(sheetName),vals=sh.getDataRange().getValues(); if(vals.length<2)return;
  const h=vals[0].map(String),idc=h.indexOf('session_id');
  const ri=vals.findIndex((r,i)=>i>0&&String(r[idc])===String(sessionId)); if(ri<1)return;
  const row=ri+1;
  const bump=(key)=>{const c=h.indexOf(key);if(c>=0)sh.getRange(row,c+1).setValue(Number(vals[ri][c]||0)+1);};
  bump('answers_saved'); bump(isFollowup?'followups_asked':'questions_asked');
}
function numberOrBlank_(v){if(v===null||v===undefined||String(v).trim()==='')return '';const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.round(n)):'';}

function deepgramApiKey_(){
  try{return String(PropertiesService.getScriptProperties().getProperty('DEEPGRAM_API_KEY')||'').trim();}
  catch(err){return '';}
}

function mockSttSettings_(profile){
  const p=String(profile||'').toLowerCase();
  if(p==='shiori'){
    return {
      provider:'deepgram',model:'nova-3',language:'multi',
      keyterms:['GSC','Kaichi Tokorozawa','Kaichi','Cambridge','IGCSE','international school','attitude','evidence']
    };
  }
  return {
    provider:'deepgram',model:'nova-3',language:'en',
    keyterms:['HiGA','Hiroshima Global Academy','Seto Inland Sea','horseshoe crab','marine biology','ecology','conservation','quadratic','parabola','Inquiry Report','Mathematics Report','Koh Tao']
  };
}

function mockTranscribeDeepgram_(payload,profile){
  const browserTranscript=String(payload&&payload.transcript||'').trim();
  const settings=mockSttSettings_(profile);
  const base={
    transcript:browserTranscript,browser_transcript:browserTranscript,provider:'browser-fallback',
    model:'',language_mode:settings.language,detected_language:'',confidence:'',status:'',error:''
  };
  const b64=String(payload&&payload.audio_base64||'').trim();
  if(!b64){base.status='no_audio';return base;}
  const key=deepgramApiKey_();
  if(!key){base.status='deepgram_not_configured';return base;}
  try{
    const mime=String(payload.audio_mime_type||'audio/webm');
    const query=['model='+encodeURIComponent(settings.model),'language='+encodeURIComponent(settings.language),'smart_format=true'];
    settings.keyterms.forEach(k=>query.push('keyterm='+encodeURIComponent(k)));
    const url='https://api.deepgram.com/v1/listen?'+query.join('&');
    const response=UrlFetchApp.fetch(url,{
      method:'post',
      headers:{Authorization:'Token '+key},
      contentType:mime,
      payload:Utilities.base64Decode(b64),
      muteHttpExceptions:true
    });
    const code=Number(response.getResponseCode());
    const text=String(response.getContentText()||'');
    if(code<200||code>=300){
      base.status='deepgram_http_'+code;base.error=text.slice(0,500);return base;
    }
    const data=JSON.parse(text||'{}');
    const channel=data&&data.results&&data.results.channels&&data.results.channels[0]||{};
    const alt=channel.alternatives&&channel.alternatives[0]||{};
    const transcript=String(alt.transcript||'').trim();
    return {
      transcript:transcript||browserTranscript,
      browser_transcript:browserTranscript,
      provider:'deepgram',
      model:settings.model,
      language_mode:settings.language,
      detected_language:String(channel.detected_language||''),
      confidence:(alt.confidence===0||alt.confidence)?Number(alt.confidence):'',
      status:transcript?'ok':'empty_fallback_browser',
      error:''
    };
  }catch(err){
    base.status='deepgram_error';base.error=String(err.message||err).slice(0,500);return base;
  }
}

function mockSttConfig(token,requestedRole){
  const auth=authorize_(token,requestedRole); if(!auth.ok)return auth;
  if(!['admin','reviewer'].includes(auth.role))return {ok:false,error:'Reviewer access required.'};
  return {ok:true,configured:!!deepgramApiKey_(),provider:'Deepgram',model:'nova-3',
    shimpei_language:'en',shiori_language:'multi',role:auth.role};
}

function mockSetDeepgramApiKey(token,requestedRole,apiKey){
  const auth=authorize_(token,requestedRole); if(!auth.ok)return auth;
  if(auth.role!=='admin')return {ok:false,error:'Admin access required.'};
  const key=String(apiKey||'').trim();
  if(key && key.length<20)return {ok:false,error:'Deepgram API key looks too short.'};
  const props=PropertiesService.getScriptProperties();
  if(key)props.setProperty('DEEPGRAM_API_KEY',key);else props.deleteProperty('DEEPGRAM_API_KEY');
  return {ok:true,configured:!!key};
}

function mockTtsSpokenText_(q){
  let text=String(q&&q.question_text||'').trim();
  text=text.replace(/^\s*\(\d+\)\s*/,'');
  text=text.replace(/開智所沢中等教育学校/g,'かいちところざわ中等教育学校');
  text=text.replace(/開智所沢/g,'かいちところざわ');
  text=text.replace(/GSC/g,'ジーエスシー');
  text=text.replace(/^なぜ(?![、,])/,'なぜ、');
  text=text.replace(/か。$/,'か？');
  return text;
}

function mockTtsQuestion(token,requestedRole,questionId){
  const auth=authorize_(token,requestedRole); if(!auth.ok)return auth;
  const q=findBy_(SHEETS.MOCKQ,'id',questionId);
  if(!q || !truthy_(q.active))return {ok:false,error:'Mock question not found.'};
  const profile=String(q.profile||'').toLowerCase();
  const language=String(q.language||'').toLowerCase();
  const spokenText=mockTtsSpokenText_(q);
  if(profile!=='shiori' || !language.startsWith('ja')){
    return {ok:true,supported:false,configured:!!deepgramApiKey_(),spoken_text:spokenText};
  }
  const key=deepgramApiKey_();
  if(!key)return {ok:true,supported:true,configured:false,spoken_text:spokenText,voice:'aura-2-ama-ja'};
  try{
    const url='https://api.deepgram.com/v1/speak?model=aura-2-ama-ja&encoding=mp3';
    const response=UrlFetchApp.fetch(url,{
      method:'post',
      headers:{Authorization:'Token '+key},
      contentType:'application/json',
      payload:JSON.stringify({text:spokenText}),
      muteHttpExceptions:true
    });
    const code=Number(response.getResponseCode());
    if(code<200||code>=300){
      return {ok:true,supported:true,configured:true,spoken_text:spokenText,voice:'aura-2-ama-ja',
        error:'Deepgram TTS HTTP '+code+': '+String(response.getContentText()||'').slice(0,300)};
    }
    const blob=response.getBlob();
    return {ok:true,supported:true,configured:true,spoken_text:spokenText,voice:'aura-2-ama-ja',
      mime_type:blob.getContentType()||'audio/mpeg',audio_base64:Utilities.base64Encode(blob.getBytes())};
  }catch(err){
    return {ok:true,supported:true,configured:true,spoken_text:spokenText,voice:'aura-2-ama-ja',
      error:String(err.message||err).slice(0,300)};
  }
}

function setConfigValue_(key,value){
  const sh=sheet_(SHEETS.CONFIG),vals=sh.getDataRange().getValues(),h=vals[0].map(String);
  const kc=h.indexOf('key'),vc=h.indexOf('value'); if(kc<0||vc<0)throw new Error('Config sheet must contain key/value columns.');
  const ri=vals.findIndex((r,i)=>i>0&&String(r[kc])===String(key));
  if(ri>0)sh.getRange(ri+1,vc+1).setValue(value);
  else sh.appendRow(h.map((col,i)=>i===kc?key:i===vc?value:''));
}

function ensureMockAudioFolder_(repair){
  const c=config_(),configuredId=String(c.mock_audio_folder_id||'').trim();
  if(configuredId){
    try{
      const folder=DriveApp.getFolderById(configuredId);
      folder.getName();
      return {ok:true,folder,id:folder.getId(),name:folder.getName(),repaired:false};
    }catch(err){
      if(!repair)return {ok:false,error:'Configured audio folder is not accessible: '+String(err.message||err),configured_id:configuredId};
    }
  }else if(!repair){
    return {ok:false,error:'mock_audio_folder_id is not configured.'};
  }
  try{
    const folder=DriveApp.createFolder('HiGA Mock Interview Audio');
    setConfigValue_('mock_audio_folder_id',folder.getId());
    return {ok:true,folder,id:folder.getId(),name:folder.getName(),repaired:true};
  }catch(err){
    return {ok:false,error:'Could not create audio folder in the deploying account Drive: '+String(err.message||err),configured_id:configuredId};
  }
}

function saveMockAudio_(role,payload){
  const b64=String(payload&&payload.audio_base64||'').trim();
  const expected=truthy_(payload&&payload.audio_expected);
  if(!b64)return {file_id:'',mime_type:'',status:expected?'missing_payload':'not_recorded',error:expected?'Browser recording was expected but no audio payload was received.':'',bytes:0};
  try{
    const storage=ensureMockAudioFolder_(true);
    if(!storage.ok)return {file_id:'',mime_type:'',status:'storage_unavailable',error:storage.error||'Audio storage unavailable.',bytes:0};
    const mime=String(payload.audio_mime_type||'audio/webm');
    const ext=mime.includes('ogg')?'ogg':mime.includes('mp4')?'m4a':'webm';
    const safe=x=>String(x||'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,80);
    const name=[role==='student'?'applicant':'test',safe(payload.profile),safe(payload.session_id),safe(payload.question_id)].join('__')+'.'+ext;
    const bytes=Utilities.base64Decode(b64);
    const blob=Utilities.newBlob(bytes,mime,name);
    const file=storage.folder.createFile(blob);
    return {file_id:file.getId(),mime_type:mime,status:'saved',error:'',bytes:bytes.length,folder_id:storage.id,repaired:!!storage.repaired};
  }catch(err){
    return {file_id:'',mime_type:'',status:'save_error',error:String(err.message||err),bytes:0};
  }
}

function mockAudioStorageStatus(token,requestedRole,repair){
  try{
    const auth=authorize_(token,requestedRole); if(!auth.ok)return auth;
    if(!['admin','reviewer'].includes(auth.role))return {ok:false,error:'Reviewer access required.'};
    const doRepair=truthy_(repair)&&auth.role==='admin';
    const storage=ensureMockAudioFolder_(doRepair);
    if(!storage.ok)return {ok:true,accessible:false,writable:false,error:storage.error||'Audio storage unavailable.',configured_id:storage.configured_id||''};
    let writable=false,writeError='';
    try{
      const probe=storage.folder.createFile(Utilities.newBlob('ok','text/plain','__higa_audio_storage_probe__.txt'));
      probe.setTrashed(true);writable=true;
    }catch(err){writeError=String(err.message||err);}
    return {ok:true,accessible:true,writable,folder_id:storage.id,folder_name:storage.name||'HiGA Mock Interview Audio',
      folder_url:'https://drive.google.com/drive/folders/'+storage.id,repaired:!!storage.repaired,error:writeError};
  }catch(err){return {ok:true,accessible:false,writable:false,error:String(err.message||err)};}
}

function mockGetAudio(token,requestedRole,fileId){
  try{
    const auth=authorize_(token,requestedRole); if(!auth.ok)return auth;
    if(!['admin','reviewer'].includes(auth.role))return {ok:false,error:'Reviewer access required.'};
    const id=String(fileId||'').trim(); if(!id)return {ok:false,error:'Audio file not found.'};
    const allowed=[...rows_(SHEETS.MOCKA),...rows_(SHEETS.MOCKTA)].some(r=>String(r.audio_file_id||'')===id);
    if(!allowed)return {ok:false,error:'Audio file is not part of mock interview history.'};
    const blob=DriveApp.getFileById(id).getBlob();
    return {ok:true,mime_type:blob.getContentType()||'audio/webm',base64:Utilities.base64Encode(blob.getBytes())};
  }catch(err){return {ok:false,error:String(err.message||err)};}
}

function mockSheetNames_(role){
  return role==='student'
    ? {sessions:SHEETS.MOCKS,answers:SHEETS.MOCKA,scope:'applicant'}
    : {sessions:SHEETS.MOCKTS,answers:SHEETS.MOCKTA,scope:'test'};
}

function mockReviewBootstrap(token, requestedRole){
  try{
    const auth=authorize_(token,requestedRole); if(!auth.ok)return auth;
    if(!['admin','reviewer'].includes(auth.role))return {ok:false,error:'Reviewer access required.'};
    const qMap=Object.fromEntries(rows_(SHEETS.MOCKQ).map(q=>[String(q.id),{question_text:String(q.question_text||''),concept:String(q.concept||''),phase:String(q.phase||''),kind:String(q.kind||''),profile:String(q.profile||'')}]));
    const collect=(sessionSheet,answerSheet,scope)=>{
      const sessions=rows_(sessionSheet).map(r=>({...r,scope}));
      const answers=rows_(answerSheet).map(r=>({...r,scope,question:qMap[String(r.question_id)]||{}}));
      return {sessions,answers};
    };
    const applicant=collect(SHEETS.MOCKS,SHEETS.MOCKA,'applicant');
    const test=collect(SHEETS.MOCKTS,SHEETS.MOCKTA,'test');
    const sessions=[...applicant.sessions,...test.sessions].sort((a,b)=>String(b.started_at||'').localeCompare(String(a.started_at||''))).slice(0,200);
    const allowed=new Set(sessions.map(s=>String(s.session_id)));
    const answers=[...applicant.answers,...test.answers].filter(a=>allowed.has(String(a.session_id)));
    return {ok:true,role:auth.role,sessions,answers,app_version:APP_VERSION,stt_config:{configured:!!deepgramApiKey_(),provider:'Deepgram',model:'nova-3',shimpei_language:'en',shiori_language:'multi'}};
  }catch(err){return {ok:false,error:String(err.message||err)};}
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