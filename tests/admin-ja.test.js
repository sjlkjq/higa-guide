const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const code=fs.readFileSync('Code.gs','utf8');
const adminJa=fs.readFileSync('AdminJa.html','utf8');
const claspIgnore=fs.readFileSync('.claspignore','utf8');

test('Japanese localization is injected only for requested admin access',()=>{
  assert.match(code,/access\.role\s*===\s*'admin'/);
  assert.match(code,/createHtmlOutputFromFile\('AdminJa'\)/);
});

test('admin localization waits for authenticated Admin UI before translating',()=>{
  assert.match(adminJa,/actorLabel/);
  assert.match(adminJa,/Admin/);
  assert.match(adminJa,/adminReady\(\)/);
});

test('admin localization covers parent explanation and reviewer workflow',()=>{
  assert.match(adminJa,/保護者向け/);
  assert.match(adminJa,/この画面の目的/);
  assert.match(adminJa,/レビュー・模擬面接/);
  assert.match(adminJa,/Content \/ Logic \/ Specificity \/ Ownership/);
});

test('admin localization file is included in clasp deployment',()=>{
  assert.match(claspIgnore,/!AdminJa\.html/);
});
