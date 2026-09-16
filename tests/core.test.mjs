import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createStorage, ConflictError } from '../lib/storage.mjs';
import { reconcileHeat, COOLING_MS } from '../public/heat.js';
import { createApp, passwordHash } from '../server.mjs';
const id='f738b76b-1796-488a-9641-466ab72fa5e9';
test('independent character ages survive insertion, deletion, and cooling',()=>{
 let runs=reconcileHeat('','ab',[],100);runs=reconcileHeat('ab','abc',runs,1000);
 assert.deepEqual(runs,[{start:0,end:2,born:100},{start:2,end:3,born:1000}]);
 runs=reconcileHeat('abc','aXbc',runs,1500,{start:1,end:1});
 assert.deepEqual(runs,[{start:0,end:1,born:100},{start:2,end:3,born:100},{start:3,end:4,born:1000},{start:1,end:2,born:1500}]);
 runs=reconcileHeat('aXbc','aXc',runs,1600,{start:2,end:3});assert.equal(runs.find(r=>r.born===1000).start,2);
 runs=reconcileHeat('aXc','aXcd',runs,100+COOLING_MS);assert.ok(runs.every(r=>r.born!==100));
});
test('repeated letters use the actual cursor position; old text never reheats',()=>{
 const runs=reconcileHeat('aaa','aaaa',[],1000,{start:1,end:1});assert.deepEqual(runs,[{start:1,end:2,born:1000}]);
 assert.deepEqual(reconcileHeat('old words','old words',[],2000),[]);
});
test('durable storage rejects stale writers and survives reopening',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'thermalnote-db-'));let db=await createStorage({},dir);
 try{const first=await db.save({id,title:'My note',content:'<p>Hot text</p>'},0);assert.equal(first.version,1);
 const second=await db.save({...first,content:'<p>Cool text</p>'},1);assert.equal(second.version,2);
 await assert.rejects(()=>db.save({...first,content:'stale'},1),ConflictError);db.close();db=await createStorage({},dir);assert.equal((await db.list())[0].content,'<p>Cool text</p>');await db.remove(id,2);assert.equal((await db.list()).length,0);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
test('private API authenticates writes, enforces versions, and protects images',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'thermalnote-api-'));const {server}=await createApp({env:{APP_USERNAME:'test-user',APP_PASSWORD_HASH:passwordHash('test-password')},dataDirectory:dir});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;let cookie='';
 const call=(url,method='GET',data,overrides={})=>fetch(origin+url,{method,headers:{origin,'content-type':'application/json',cookie,...overrides},body:data===undefined?undefined:JSON.stringify(data)});
 try{assert.equal((await call('/api/notes')).status,401);assert.equal((await call('/.env')).status,404);
 assert.equal((await call('/api/login','POST',{username:'test-user',password:'wrong'})).status,401);
 const login=await call('/api/login','POST',{username:'test-user',password:'test-password'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly/);
 assert.equal((await call('/api/notes/'+id,'PUT',{title:'Hello',content:'<p>Still typing</p>',version:0},{origin:'https://attacker.example'})).status,403);
 const save=await call('/api/notes/'+id,'PUT',{title:'Hello',content:'<p>Still typing</p>',version:0});assert.equal(save.status,200);assert.equal((await save.json()).version,1);
 assert.equal((await call('/api/notes/'+id,'PUT',{title:'stale',content:'oops',version:0})).status,409);
 assert.equal((await (await call('/api/notes')).json())[0].title,'Hello');
 assert.equal((await call('/api/images','POST',{type:'image/png',data:Buffer.from('not png').toString('base64')})).status,400);
 const upload=await call('/api/images','POST',{type:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII='});assert.equal(upload.status,201);const {src}=await upload.json();assert.equal((await call(src)).status,200);
 await call('/api/logout','POST',{});assert.equal((await call(src)).status,401);
 }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

test('login survives a new server instance and logout revokes it across instances',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'thermalnote-sessions-'));
 const env={APP_USERNAME:'test-user',APP_PASSWORD_HASH:passwordHash('test-password')};
 const first=await createApp({env,dataDirectory:directory});
 const second=await createApp({env,dataDirectory:directory});
 await new Promise(r=>first.server.listen(0,'127.0.0.1',r));
 await new Promise(r=>second.server.listen(0,'127.0.0.1',r));
 const url1=`http://127.0.0.1:${first.server.address().port}`;
 const url2=`http://127.0.0.1:${second.server.address().port}`;
 try {
  const login=await fetch(url1+'/api/login',{method:'POST',headers:{origin:url1,'content-type':'application/json'},body:JSON.stringify({username:'test-user',password:'test-password'})});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(url2+'/api/session',{headers:{cookie}})).status,200);
  const out=await fetch(url2+'/api/logout',{method:'POST',headers:{cookie,origin:url2,'content-type':'application/json'},body:'{}'});
  assert.equal(out.status,200);
  assert.equal((await fetch(url1+'/api/session',{headers:{cookie}})).status,401);
 } finally {await Promise.all([first,second].map(app=>new Promise(r=>app.server.close(r))));await rm(directory,{recursive:true,force:true});}
});

test('shared login limiting cannot be bypassed by changing server instance',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'thermalnote-limit-'));
 const one=await createStorage({},directory),two=await createStorage({},directory);
 try {for(let i=1;i<=11;i++)assert.equal(await(i%2?one:two).attemptLogin(),i);await two.clearLoginAttempts();assert.equal(await one.attemptLogin(),1);}
 finally {one.close();two.close();await rm(directory,{recursive:true,force:true});}
});

test('the function handler accepts parsed request bodies and keeps production cookies secure',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'thermalnote-function-'));
 const origin='https://notebook.example';
 const app=await createApp({env:{APP_USERNAME:'test-user',APP_PASSWORD_HASH:passwordHash('test-password'),APP_ORIGIN:origin},dataDirectory:directory});
 let format='object';
 const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const raw=Buffer.concat(chunks);
  req.body=format==='object'?JSON.parse(raw.toString()):format==='buffer'?raw:raw.toString();
  await app.handler(req,res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/api/login`;
 try {
  for(format of ['object','string','buffer']){
   const result=await fetch(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({username:'test-user',password:'test-password'})});
   assert.equal(result.status,200,format);
   assert.match(result.headers.get('set-cookie'),/; Secure/);
  }
  const invalid=await fetch(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:'null'});
  assert.equal(invalid.status,400);
 } finally {await new Promise(resolve=>server.close(resolve));app.storage.close();await rm(directory,{recursive:true,force:true});}
});

test('Vercel refuses local storage before creating files',async()=>{
 await assert.rejects(()=>createApp({env:{VERCEL:'1',APP_USERNAME:'test-user',APP_PASSWORD_HASH:'configured'},dataDirectory:'/this-path-must-never-be-created'}),/Vercel requires Supabase/);
});
