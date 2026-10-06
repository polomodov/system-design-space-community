import {test} from 'node:test';
import assert from 'node:assert/strict';
import {finishStatus,publicRoute,siteUrl,validateManifest} from '../audits/common.mjs';
const manifest=()=>({schemaVersion:1,publicationId:'a'.repeat(64),basePath:'/',layoutRoutes:[{path:'/',kind:'top-level',locale:'ru',rootTestId:'home-page',auditTargetTestIds:['home-page']}],svgRoutes:['/chapter/test'],linkRoutes:['/']});
test('reject malformed manifest and external route escapes',()=>{
  for(const value of [null,{}, {...manifest(),schemaVersion:2},{...manifest(),layoutRoutes:[]},{...manifest(),basePath:'//evil/'},{...manifest(),svgRoutes:['//evil.invalid/']}])assert.throws(()=>validateManifest(value));
  assert.equal(validateManifest(manifest()).schemaVersion,1);
  for(const path of ['//evil.invalid','/\\evil.invalid','https://evil.invalid','/../escape'])assert.throws(()=>publicRoute(path));
});
test('preserve base path and query while canonicalizing directory URL',()=>{
  assert.equal(publicRoute('/en/search?q=cache',siteUrl('https://example.org/book/')).href,'https://example.org/book/en/search/?q=cache');
});
test('changed or unreadable publication overrides both success and failure',()=>{
  const before=manifest();
  assert.equal(finishStatus(before,before,false),'passed');
  assert.equal(finishStatus(before,before,true),'failed');
  assert.equal(finishStatus(before,{...before,publicationId:'b'.repeat(64)},false),'incomplete');
  assert.equal(finishStatus(before,null,true),'incomplete');
});

// New public browser entry points must not omit context isolation.
for (const file of ['run-layout.mjs','run-links.mjs']) {
  test(`public auditor ${file} uses isolated context creation`, async () => {
    const {readFile} = await import('node:fs/promises');
    const source=await readFile(new URL(`../audits/${file}`,import.meta.url),'utf8');
    assert.ok(source.includes('createAuditContext(browser,'));
    assert.ok(!source.includes('browser.newContext('));
  });
}
