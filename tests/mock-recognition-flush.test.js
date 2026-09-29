const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');

function extractFunction(source,name){
  const start=source.indexOf('function '+name+'(');
  if(start<0)throw new Error('Function not found: '+name);
  const brace=source.indexOf('{',start);
  let depth=0,quote='',escaped=false;
  for(let i=brace;i<source.length;i++){
    const ch=source[i];
    if(quote){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch===quote)quote='';
      continue;
    }
    if(ch==="'"||ch==='"`'||ch==='"'){quote=ch;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'){depth--;if(depth===0)return source.slice(start,i+1);}
  }
  throw new Error('Unclosed function: '+name);
}

test('browser STT flush waits for the recognizer final result before resolving',async()=>{
  const html=fs.readFileSync('mock.html','utf8');
  const fn=extractFunction(html,'stopRecognitionAndFlush');
  const context={
    recognitionWanted:true,
    recognizer:null,
    transcriptFinal:'',
    transcriptInterim:'',
    setTimeout,
    Math,
    Number,
    Promise
  };
  const fake={
    onend(){},
    stop(){
      setTimeout(()=>{
        context.transcriptFinal='final words from recognizer';
        this.onend({type:'end'});
      },20);
    }
  };
  context.recognizer=fake;
  vm.createContext(context);
  vm.runInContext(fn+';globalThis.flush=stopRecognitionAndFlush;',context);
  await context.flush(500);
  assert.equal(context.transcriptFinal,'final words from recognizer');
  assert.equal(context.recognizer,null);
  assert.equal(context.recognitionWanted,false);
});

test('browser STT flush has a bounded timeout if Chrome never fires onend',async()=>{
  const html=fs.readFileSync('mock.html','utf8');
  const fn=extractFunction(html,'stopRecognitionAndFlush');
  const context={
    recognitionWanted:true,
    recognizer:{onend(){},stop(){}},
    setTimeout,
    Math,
    Number,
    Promise
  };
  vm.createContext(context);
  vm.runInContext(fn+';globalThis.flush=stopRecognitionAndFlush;',context);
  await context.flush(1);
  assert.equal(context.recognizer,null);
  assert.equal(context.recognitionWanted,false);
});
