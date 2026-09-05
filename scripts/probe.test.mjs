import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {probe} from '../audits/probe.mjs';
test('link probe retries GET when HEAD is rejected',async()=>{
 const methods=[];
 const server=createServer((req,res)=>{methods.push(req.method);res.writeHead(req.method==='HEAD'?405:200);res.end('ok');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {const result=await probe(`http://127.0.0.1:${server.address().port}/article`);assert.equal(result.status,200);assert.deepEqual(methods,['HEAD','GET']);}
 finally{await new Promise(resolve=>server.close(resolve));}
});
