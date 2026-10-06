import { mkdir, writeFile } from 'node:fs/promises';

export function siteUrl(value = process.env.AUDIT_SITE_URL ?? 'https://system-design.space/') {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid AUDIT_SITE_URL');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}
export function publicRoute(value, base = siteUrl()) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value) || /(^|\/)\.\.(\/|$)/.test(value)) throw new Error('Unsafe public route');
  const route = new URL(value.slice(1), base);
  if (route.origin !== base.origin || !route.pathname.startsWith(base.pathname)) throw new Error('Route escaped site');
  if (!route.pathname.endsWith('/')) route.pathname += '/';
  return route;
}
export function validateManifest(value) {
  if (!value || value.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(value.publicationId ?? '') || typeof value.basePath !== 'string' || !/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(value.basePath)) throw new Error('Invalid audit manifest identity');
  for (const key of ['layoutRoutes', 'svgRoutes', 'linkRoutes']) if (!Array.isArray(value[key]) || !value[key].length) throw new Error(`Empty ${key}`);
  for (const route of value.layoutRoutes) {
    publicRoute(route.path);
    if (!['ru','en'].includes(route.locale) || !['top-level','theme','chapter','learning','trust'].includes(route.kind) || typeof route.rootTestId !== 'string' || !Array.isArray(route.auditTargetTestIds) || !route.auditTargetTestIds.length || route.auditTargetTestIds.some(x => typeof x !== 'string')) throw new Error('Invalid layout route');
    if (route.readyMarker && (!['selector','testId'].includes(route.readyMarker.type) || typeof route.readyMarker.value !== 'string')) throw new Error('Invalid ready marker');
  }
  for (const key of ['svgRoutes', 'linkRoutes']) for (const route of value[key]) publicRoute(route);
  return value;
}
export async function fetchManifest(base = siteUrl()) {
  const url = new URL('data/site-audit.v1.json', base);
  url.searchParams.set('audit', String(Date.now()));
  const response = await fetch(url, { cache: 'no-store', headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
  const manifest = validateManifest(await response.json());
  if (manifest.basePath !== base.pathname) throw new Error('Manifest basePath does not match audit URL');
  return manifest;
}
export async function waitForClientReady(page) {
  await page.waitForFunction(() => window.__SDS_ROUTE_READY__ === true && window.__SDS_GLOBAL_SEARCH_READY__ === true && [...document.querySelectorAll('[data-playground-shell]')].every(node => node.getAttribute('data-interactive') === 'true'), null, { timeout: 15000 });
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}
export async function settleAnimations(page) {
  await page.evaluate(async () => {
    const animations = document.getAnimations().filter(animation => {
      const timing = animation.effect?.getComputedTiming();
      return timing && Number.isFinite(timing.endTime) && timing.endTime <= 2000;
    });
    await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
export async function openPublicPage(page, route) {
  const response = await page.goto(publicRoute(route).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (!response?.ok()) throw new Error(`Page HTTP ${response?.status()}: ${route}`);
  await waitForClientReady(page);
}
export async function pooled(items, fn, concurrency = 4) {
  const pending = items.map((value, index) => ({ value, index }));
  const result = new Array(items.length);
  await Promise.all(Array.from({length: Math.max(1, Math.min(concurrency, items.length))}, async () => {
    while (pending.length) { const {value,index} = pending.shift(); result[index] = await fn(value, index); }
  }));
  return result;
}
export function finishStatus(before, after, failures) {
  if (!after || before.publicationId !== after.publicationId) return 'incomplete';
  return failures ? 'failed' : 'passed';
}
export async function writeAuditReport(name, report) {
  await mkdir('reports', { recursive: true });
  await writeFile(`reports/${name}.json`, JSON.stringify(report, null, 2)+'\n');
  await writeFile(`reports/${name}.md`, `# ${name}\n\nStatus: ${report.status}\n\nPublication: ${report.publicationId ?? 'unavailable'}\n\nChecks: ${report.results?.length ?? 0}\n\n` + (report.errors ?? []).map(error => `- ${String(error).replace(/[\r\n]+/g,' ')}\n`).join(''));
}

/** Public-site browsers may fetch the audited origin, but never execute external tags. */
export async function createAuditContext(browser, options = {}, base = siteUrl()) {
  const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
  try {
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === base.origin) return route.fallback();
      const kind = route.request().resourceType();
      return route.fulfill({
        status: kind === 'script' || kind === 'document' ? 200 : 204,
        contentType: kind === 'script' ? 'application/javascript' : 'text/html',
        headers: { 'access-control-allow-origin': '*' },
        body: '',
      });
    });
    await context.routeWebSocket('**/*', socket => {
      const url = new URL(socket.url());
      url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
      if (url.origin === base.origin) socket.connectToServer();
      else socket.close();
    });
    return context;
  } catch (error) {
    await context.close();
    throw error;
  }
}
