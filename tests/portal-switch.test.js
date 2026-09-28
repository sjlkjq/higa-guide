const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const router=require('../site/router.js');

function makeElement(){
  return {
    style:{},attrs:{},listeners:{},_src:'',
    addEventListener(type,fn){this.listeners[type]=fn;},
    removeAttribute(name){if(name==='src')this._src='';delete this.attrs[name];},
    set src(v){this._src=v;},
    get src(){return this._src;}
  };
}

test('portal changes iframe role when only the URL hash changes in the same tab',()=>{
  const html=fs.readFileSync('site/index.html','utf8');
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
  const inline=scripts[scripts.length-1];
  const frame=makeElement(),loading=makeElement(),error=makeElement();
  const elements={app:frame,loading,error};
  const location={
    href:'https://sjlkjq.github.io/higa-guide/#role=student&token=student-token-123456',
    search:'',pathname:'/higa-guide/',hash:'#role=student&token=student-token-123456'
  };
  const windowListeners={};
  const context={
    HigaPortal:router,
    location,
    document:{getElementById:id=>elements[id]},
    history:{replaceState(){}},
    window:{addEventListener:(type,fn)=>{windowListeners[type]=fn;}},
    encodeURIComponent,
    console
  };
  vm.createContext(context);
  vm.runInContext(inline,context,{filename:'site/index.inline.js'});

  assert.match(frame.src,/role=student/);
  assert.match(frame.src,/student-token-123456/);

  location.href='https://sjlkjq.github.io/higa-guide/#role=admin&token=admin-token-123456';
  location.hash='#role=admin&token=admin-token-123456';
  windowListeners.hashchange();
  assert.match(frame.src,/role=admin/);
  assert.match(frame.src,/admin-token-123456/);

  location.href='https://sjlkjq.github.io/higa-guide/#role=reviewer&token=reviewer-token-123456';
  location.hash='#role=reviewer&token=reviewer-token-123456';
  windowListeners.hashchange();
  assert.match(frame.src,/role=reviewer/);
  assert.match(frame.src,/reviewer-token-123456/);
});


test('root mock page is a top-level GitHub media page and requires an opener',()=>{
  const html=fs.readFileSync('mock.html','utf8');
  assert.match(html,/github-pages-top-level-media/);
  assert.match(html,/window\.opener/);
  assert.match(html,/Open Mock Interview from the Student or Parent\/Admin screen/);
  assert.doesNotMatch(html,/location\.replace\(target\)/);
});

test('main app exposes external Mock Interview to student and admin roles',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.match(html,/id="mockNav"/);
  assert.match(html,/\['student','admin'\]\.includes\(role\)/);
  assert.match(html,/sjlkjq\.github\.io\/higa-guide\/mock\.html/);
});


test('Mock Interview launcher opens GitHub Pages without leaking the token and keeps opener RPC',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const line=html.split('\n').find(x=>x.includes("mockNav').onclick"))||'';
  assert.match(line,/https:\/\/sjlkjq\.github\.io\/higa-guide\/mock\.html/);
  assert.doesNotMatch(line,/token=/);
  assert.doesNotMatch(line,/noopener/);
  assert.match(html,/MOCK_ALLOWED_RPC/);
});


test('external mock backend relay accepts only the GitHub Pages origin and allowlisted RPC names',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.match(html,/const MOCK_ORIGIN='https:\/\/sjlkjq\.github\.io'/);
  assert.match(html,/e\.origin!==MOCK_ORIGIN/);
  assert.match(html,/MOCK_ALLOWED_RPC\.has\(e\.data\.name\)/);
  assert.match(html,/mockBootstrap/);
  assert.match(html,/mockSaveAnswer/);
});
