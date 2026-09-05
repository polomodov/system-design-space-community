import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fetchManifest, finishStatus, openPublicPage, pooled, siteUrl, writeAuditReport } from './common.mjs';
import { probe } from './probe.mjs';

const report = {status:'incomplete',publicationId:null,results:[],errors:[],pages:[]};
let browser;
try {
  const before = await fetchManifest();
  report.publicationId=before.publicationId;
  const allowlist=JSON.parse(await readFile(new URL('./link-check-allowlist.json',import.meta.url),'utf8'));
  if (!Array.isArray(allowlist.softFailDomains) || !Array.isArray(allowlist.ignoredPrefixes) || allowlist.softFailDomains.some(x=>!x.domain || !x.reason || (x.statuses && (!Array.isArray(x.statuses) || x.statuses.some(s=>!Number.isInteger(s))))) || allowlist.ignoredPrefixes.some(x=>!x.prefix || !x.reason)) throw new Error('Invalid link allowlist');
  const filter=process.env.AUDIT_ROUTES?.split(',').filter(Boolean);
  const routes=before.linkRoutes.filter(path=>!filter || filter.includes(path.replace(/\/$/,'') || '/'));
  if(!routes.length) throw new Error('No matching audit routes');
  browser=await chromium.launch();
  const pages=await pooled(routes,async path=>{
    const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce'});
    try {
      const page=await context.newPage();
      await openPublicPage(page,path);
      await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
      await page.waitForTimeout(180);
      const urls=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>node.href));
      return {path,urls};
    } catch(error) { report.errors.push(`${path}: ${error.message}`); return {path,urls:[],failed:true}; }
    finally {await context.close();}
  });
  const sources=new Map();
  for(const page of pages) for(const href of page.urls) {
    let url;try{url=new URL(href);}catch{continue;}
    if(!['https:','http:'].includes(url.protocol) || url.origin===siteUrl().origin) continue;
    url.hash='';
    if(allowlist.ignoredPrefixes.some(x=>url.href.startsWith(x.prefix))) continue;
    if(!sources.has(url.href))sources.set(url.href,new Set());
    sources.get(url.href).add(page.path);
  }
  report.pages=pages.map(({path,failed})=>({path,status:failed?'failed':'passed'}));
  const collected=[...sources.entries()].sort(([a],[b])=>a.localeCompare(b));
  report.results=process.env.LINK_CHECK_COLLECT_ONLY === '1'
    ? collected.map(([url,paths])=>({url,pages:[...paths].sort(),classification:'collected'}))
    : await pooled(collected,async([url,paths])=>{
      const result=await probe(url);
      const soft=allowlist.softFailDomains.find(x=>x.domain===new URL(url).hostname.toLowerCase());
      const restricted=soft && (soft.statuses ?? [401,403,405,429,999]).includes(result.status);
      return {...result,pages:[...paths].sort(),classification:result.status>=200 && result.status<400?'alive':restricted?'restricted':'dead'};
    },Number(process.env.LINK_CHECK_CONCURRENCY ?? 8));
  let after;try{after=await fetchManifest();}catch(error){report.errors.push(error.message);}
  report.status=finishStatus(before,after,report.errors.length>0 || report.results.some(x=>x.classification==='dead'));
  if(pages.some(x=>x.failed))report.status='incomplete';
}catch(error){report.errors.push(error.message);}
finally{await browser?.close();await writeAuditReport('links',report);}
console.log(`Link audit: ${report.status}, ${report.pages.length} pages, ${report.results.length} URLs`);
if(report.status==='incomplete' || (report.status==='failed' && process.env.LINK_CHECK_STRICT==='1'))process.exitCode=1;
