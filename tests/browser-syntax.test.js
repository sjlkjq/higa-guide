const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function inlineScript(html){
  const matches=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.ok(matches.length>0,'index.html should contain an inline script');
  return matches.map(m=>m[1]).join('\n');
}

test('index inline JavaScript parses without syntax errors',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const script=inlineScript(html);
  assert.doesNotThrow(()=>new vm.Script(script,{filename:'index-inline.js'}));
});
