import {createServer} from 'node:http';
import {test,expect} from '@playwright/test';
import {createAuditContext} from './common.mjs';

test('public audit contexts never deliver script, image, fetch, iframe or popup requests off-origin', async ({browser})=>{
  let delivered=0;
  const receiver=createServer((_req,res)=>{delivered++;res.end('control');});
  await new Promise(resolve=>receiver.listen(0,'127.0.0.1',resolve));
  const endpoint=`http://0.0.0.0:${receiver.address().port}`;
  expect((await fetch(endpoint)).status).toBe(200);
  expect(delivered).toBe(1);delivered=0;
  const origin=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end('<!doctype html><title>Audit probe</title>');});
  await new Promise(resolve=>origin.listen(0,'127.0.0.1',resolve));
  const base=new URL(`http://127.0.0.1:${origin.address().port}`);
  const context=await createAuditContext(browser,{},base);
  try{
    const page=await context.newPage();await page.goto(base.href);
    await page.evaluate(async endpoint=>{
      const pending=[];
      for(const kind of ['script','iframe','img'])pending.push(new Promise(resolve=>{
        const node=document.createElement(kind);node.onload=node.onerror=resolve;node.src=endpoint+'/'+kind;document.body.appendChild(node);
      }));
      pending.push(fetch(endpoint+'/fetch',{mode:'no-cors'}));
      navigator.sendBeacon(endpoint+'/beacon','audit');
      await Promise.all(pending);
    },endpoint);
    const popupPromise=page.waitForEvent('popup');
    await page.evaluate(endpoint=>window.open(endpoint+'/popup'),endpoint);
    const popup=await popupPromise;await popup.waitForLoadState();
    expect(delivered).toBe(0);
  }finally{
    await context.close();receiver.closeAllConnections();origin.closeAllConnections();
    await Promise.all([new Promise(resolve=>receiver.close(resolve)),new Promise(resolve=>origin.close(resolve))]);
  }
});

test('no-JavaScript fallback is isolated before the first page opens',async({browser})=>{
  let delivered=0;
  const server=createServer((req,res)=>{
    if(req.url==='/page'){res.setHeader('content-type','text/html');res.end(`<noscript><iframe src="http://0.0.0.0:${server.address().port}/ns.html?id=GTM-PROBE"></iframe></noscript>`);}
    else{delivered++;res.end('control');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const context=await createAuditContext(browser,{javaScriptEnabled:false},new URL(`http://127.0.0.1:${server.address().port}`));
  try{
    await(await context.newPage()).goto(`http://127.0.0.1:${server.address().port}/page`);
    expect(delivered).toBe(0);
  }finally{await context.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
