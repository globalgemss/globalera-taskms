const assert=require('node:assert/strict');const fs=require('fs'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const contents=fs.readFileSync('src/lib/permissions.ts','utf8');
const js=ts.transpileModule(contents,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const sandbox={exports:{}};vm.runInNewContext(js,sandbox);
const p=sandbox.exports;
assert.equal(p.canManageTasks('staff'),false);assert.equal(p.canManageUsers('staff'),false);assert.equal(p.canReview('staff'),false);
assert.equal(p.canManageTasks('manager'),true);assert.equal(p.canManageUsers('manager'),false);assert.equal(p.canReview('manager'),true);
assert.equal(p.canManageTasks('admin'),true);assert.equal(p.canManageUsers('admin'),true);
console.log('ROLE UI GUARD SMOKE TEST: 8 assertions passed (not a backend/RLS test)');
