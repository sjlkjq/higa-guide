const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const src=fs.readFileSync('site/app.html','utf8');

test('v2 portal takes role from query so each role URL forces a page navigation',()=>{
  assert.match(src,/query\.get\('role'\)/);
  assert.doesNotMatch(src,/hash\.get\('role'\)/);
});

test('v2 portal keeps token in URL fragment rather than GitHub query',()=>{
  assert.match(src,/hash\.get\('token'\)/);
  assert.doesNotMatch(src,/query\.get\('token'\)/);
});

test('v2 portal accepts exactly student reviewer and admin roles',()=>{
  assert.match(src,/\['student','reviewer','admin'\]\.includes\(role\)/);
});

test('v2 portal forwards both role and token to Apps Script and adds a role cache buster',()=>{
  assert.match(src,/\?role=/);
  assert.match(src,/&token=/);
  assert.match(src,/&_=/);
});

test('v2 portal does not silently fall back to Student when access is invalid',()=>{
  assert.match(src,/if\(!valid\)/);
  assert.doesNotMatch(src,/role\s*=\s*['\"]student['\"]/);
});
