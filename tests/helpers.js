const fs=require('node:fs');
const vm=require('node:vm');

class Range{
  constructor(sheet,row,col,numRows=1,numCols=1){this.sheet=sheet;this.row=row;this.col=col;this.numRows=numRows;this.numCols=numCols;}
  getValues(){
    const out=[];
    for(let r=0;r<this.numRows;r++){
      const row=[];
      for(let c=0;c<this.numCols;c++) row.push(this.sheet.getCell(this.row+r,this.col+c));
      out.push(row);
    }
    return out;
  }
  setValue(v){this.sheet.setCell(this.row,this.col,v);return this;}
}

class Sheet{
  constructor(name,data){this.name=name;this.data=(data||[]).map(r=>r.slice());}
  getCell(row,col){return (this.data[row-1]||[])[col-1]??'';}
  setCell(row,col,v){while(this.data.length<row)this.data.push([]);while(this.data[row-1].length<col)this.data[row-1].push('');this.data[row-1][col-1]=v;}
  getDataRange(){return new Range(this,1,1,Math.max(1,this.getLastRow()),Math.max(1,this.getLastColumn()));}
  getRange(row,col,numRows=1,numCols=1){return new Range(this,row,col,numRows,numCols);}
  appendRow(row){this.data.push(row.slice());}
  getLastColumn(){return this.data.reduce((m,r)=>Math.max(m,r.length),0);}
  getLastRow(){return this.data.length;}
}

class Spreadsheet{
  constructor(sheets){this.sheets=sheets;}
  getSheetByName(name){return this.sheets[name]||null;}
}

const ATTEMPT_HEADERS=['attempt_id','question_id','started_at','think_started_at','think_elapsed_sec','key_points','answer_done','followup1_done','followup2_done','completed_at','content','logic','specificity','english','delivery','ownership','student_confidence','student_reflection','coach_note','status_after','device_id','session_id','source','valid_attempt','followup1_key_points','followup2_key_points','reflection_hardest','reflection_next','reflection_note','review_type','reviewed_by','reviewed_at','improvement_target_1','improvement_target_2','reviewer_note','delivery_note'];
const STATE_HEADERS=['question_id','status','attempt_count','last_practiced','best_content','best_logic','best_specificity','best_english','best_delivery','best_ownership','student_confidence','student_note','parent_note','locked','updated_at','updated_by','last_attempt_id','ready_override'];
const QUESTION_HEADERS=['id','category','priority','source','main_question','followup_1','followup_2','followup_3','followup_4','coach_focus','risk','order','active','think_seconds','min_followups','notes'];
const EVENT_HEADERS=['timestamp','session_id','device_id','question_id','event_type','event_value','elapsed_sec','page','attempt_id','user_role','app_version','note'];
const ACK_HEADERS=['timestamp','session_id','student_summary','promise_text','accepted','device_id','app_version'];

function defaultConfig(overrides={}){
  return {
    version:'1.0',app_title:'HiGA Interview Training',student_label:'Shimpei',default_think_seconds:45,
    require_acknowledgement:true,min_key_points:2,min_ready_attempts:2,ready_threshold:4,
    student_token:'student-token-123456',parent_token:'admin-token-123456',reviewer_token:'reviewer-token-123456',
    admin_label:'Hiro',reviewer_label:'Sakai-sensei',min_followup_key_points:1,live_mode:true,...overrides
  };
}

function objectRows(headers,objects){return [headers,...objects.map(o=>headers.map(h=>o[h]??''))];}

function createHarness(options={}){
  const cfg=defaultConfig(options.config||{});
  const question={id:'ESS-01',category:'Essay',priority:'High',source:'Form 1',main_question:'Why marine science?',followup_1:'Why?',followup_2:'What evidence?',followup_3:'',followup_4:'',coach_focus:'Ownership',risk:'Vague',order:1,active:true,think_seconds:45,min_followups:2,notes:'',...(options.question||{})};
  const sheets={
    Config:new Sheet('Config',[['key','value'],...Object.entries(cfg)]),
    Strategy:new Sheet('Strategy',[['order','heading','body'],[1,'Think independently','Reason from your own ideas.']]),
    Questions:new Sheet('Questions',objectRows(QUESTION_HEADERS,options.questions||[question])),
    State:new Sheet('State',objectRows(STATE_HEADERS,options.states||[])),
    Attempts:new Sheet('Attempts',objectRows(ATTEMPT_HEADERS,options.attempts||[])),
    EventLog:new Sheet('EventLog',objectRows(EVENT_HEADERS,options.events||[])),
    Acknowledgements:new Sheet('Acknowledgements',objectRows(ACK_HEADERS,options.acks||[]))
  };
  const spreadsheet=new Spreadsheet(sheets);
  const context={
    SpreadsheetApp:{getActiveSpreadsheet:()=>spreadsheet},
    HtmlService:{
      createHtmlOutputFromFile:()=>({getContent:()=>'<html><head></head><body></body></html>'}),
      createHtmlOutput:(html)=>({html,setTitle(){return this;},setXFrameOptionsMode(){return this;}}),
      XFrameOptionsMode:{ALLOWALL:'ALLOWALL'}
    },
    console,Date,Math,JSON,String,Number,Boolean,Object,Array,RegExp,Error,Map,Set
  };
  vm.createContext(context);
  const src=fs.readFileSync('Code.gs','utf8')+'\n;globalThis.__higa={doGet,bootstrap,saveAcknowledgement,logEvent,completeAttempt,saveReview,saveLiveReview,authorize_,publicConfig_,truthy_,lineCount_,statusFromScores_,config_,rows_};';
  vm.runInContext(src,context,{filename:'Code.gs'});
  return {api:context.__higa,sheets,cfg,spreadsheet,context};
}

function validAttempt(overrides={}){
  return {
    attempt_id:'a1',question_id:'ESS-01',started_at:'2026-09-15T00:00:00Z',think_started_at:'2026-09-15T00:00:00Z',think_elapsed_sec:45,
    key_points:'Point one has enough detail\nPoint two has enough detail',answer_done:true,followup1_done:true,followup2_done:true,
    followup1_key_points:'Because this matters to me',followup2_key_points:'I observed coral damage directly',completed_at:'2026-09-15T00:01:00Z',
    reflection_hardest:'I had an idea but could not explain why.',reflection_next:'Explain why, not only what.',reflection_note:'',
    status_after:'Awaiting review',device_id:'d1',session_id:'s1',source:'webapp',valid_attempt:true,...overrides
  };
}

module.exports={createHarness,validAttempt,ATTEMPT_HEADERS,STATE_HEADERS,QUESTION_HEADERS,EVENT_HEADERS,ACK_HEADERS};
