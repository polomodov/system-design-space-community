import { chromium } from '@playwright/test';
import { fetchManifest, finishStatus, openPublicPage, pooled, writeAuditReport } from './common.mjs';
import { layoutViewportProfiles, openRouteForLayoutAudit, runLayoutAudit } from './layout.mjs';
import { collectLabelSpills } from './svg.mjs';

const report = { status: 'incomplete', publicationId: null, results: [], errors: [] };
let browser;
try {
  const before = await fetchManifest();
  report.publicationId = before.publicationId;
  const filter = process.env.AUDIT_ROUTES?.split(',').filter(Boolean);
  const selected = route => !filter || filter.includes(route.replace(/\/$/, '') || '/');
  const profiles = layoutViewportProfiles.filter(x => !process.env.LAYOUT_VIEWPORT || x.id === process.env.LAYOUT_VIEWPORT);
  if (!profiles.length) throw new Error('Unknown LAYOUT_VIEWPORT');
  const checks = profiles.flatMap(profile => before.layoutRoutes.filter(route => selected(route.path)).map(route => ({ kind: 'layout', route, profile })));
  if (!process.env.LAYOUT_VIEWPORT || process.env.LAYOUT_VIEWPORT === 'desktop') checks.push(...before.svgRoutes.filter(selected).map(path => ({ kind: 'svg', route: {path}, profile: layoutViewportProfiles.find(x=>x.id==='desktop') })));
  if (!checks.length) throw new Error('No matching audit routes');
  browser = await chromium.launch();
  report.results = await pooled(checks, async ({kind,route,profile}) => {
    const context = await browser.newContext({ viewport: {width:profile.width,height:profile.height}, deviceScaleFactor:profile.deviceScaleFactor, isMobile:profile.isMobile, hasTouch:profile.hasTouch, serviceWorkers:'block', reducedMotion:'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    try {
      if (kind === 'layout') {
        await openRouteForLayoutAudit(page, route);
        await runLayoutAudit(page, route, profile, {attach:async()=>{}});
      } else {
        await openPublicPage(page, route.path);
        const spills = await collectLabelSpills(page);
        if (spills.length) throw new Error(JSON.stringify(spills));
      }
      return {kind,path:route.path,viewport:profile.id,status:'passed'};
    } catch (error) {
      return {kind,path:route.path,viewport:profile.id,status:'failed',error:error.message};
    } finally { await context.close(); }
  }, Number(process.env.AUDIT_CONCURRENCY ?? 4));
  let after;
  try { after = await fetchManifest(); } catch(error) { report.errors.push(error.message); }
  report.status = finishStatus(before,after,report.results.some(x=>x.status==='failed'));
  report.errors.push(...report.results.filter(x=>x.status==='failed').map(x=>`${x.path} [${x.viewport}, ${x.kind}]: ${x.error}`));
} catch(error) { report.errors.push(error.message); }
finally { await browser?.close(); await writeAuditReport(`layout-${process.env.LAYOUT_VIEWPORT ?? 'all'}`,report); }
console.log(`Layout audit: ${report.status}, ${report.results.length} checks, ${report.errors.length} errors`);
if (report.status !== 'passed') process.exitCode = 1;
