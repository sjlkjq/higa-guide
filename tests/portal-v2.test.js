const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const src=fs.readFileSync('app.html','utf8');

test('production portal exists at the GitHub Pages root path',()=>{
  assert.equal(fs.existsSync('app.html'),true);
});

test('production portal takes role from query so each role URL forces a page navigation',()=>{
  assert.match(src,/query\.get\('role'\)/);
  assert.doesNotMatch(src,/hash\.get\('role'\)/);
});

test('production portal keeps token in URL fragment rather than GitHub query',()=>{
  assert.match(src,/hash\.get\('token'\)/);
  assert.doesNotMatch(src,/query\.get\('token'\)/);
});

test('production portal accepts exactly student reviewer and admin roles',()=>{
  assert.match(src,/\['student','reviewer','admin'\]\.includes\(role\)/);
});

test('production portal forwards both role and token to Apps Script and adds a role cache buster',()=>{
  assert.match(src,/\?role=/);
  assert.match(src,/&token=/);
  assert.match(src,/&_=/);
});

test('production portal does not silently fall back to Student when access is invalid',()=>{
  assert.match(src,/if\(!valid\)/);
  assert.doesNotMatch(src,/role\s*=\s*['\"]student['\"]/);
});
