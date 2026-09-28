import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createStorage } from '../lib/storage.mjs';
import { createApp, passwordHash, profiles } from '../server.mjs';
const noteId='3f0c2b1e-8a4d-4c6e-9f1a-2b3c4d5e6f70';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';

test('a notebook from before profiles keeps every note, day, and session, all belonging to the primary account',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'thermalnote-upgrade-'));
 try{
  // The exact schema a single-person notebook had, with data in it.
  const old=new DatabaseSync(path.join(dir,'notes.sqlite'));
  old.exec(`CREATE TABLE notes (id TEXT PRIMARY KEY,title TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,version INTEGER NOT NULL,deleted_at TEXT,marks TEXT NOT NULL DEFAULT '[]');
   CREATE TABLE days (date TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL);
   CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);`);
  old.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?)').run(noteId,'Mine','<p>Robert’s words</p>','2026-09-01T00:00:00.000Z','2026-09-02T00:00:00.000Z',7,null,'[]');
  old.prepare('INSERT INTO days VALUES (?,?,?,?)').run('2026-09-20',JSON.stringify({movements:[{name:'Squat',sets:[{w:'225',r:'5'}]}],meals:[]}),'2026-09-20T12:00:00.000Z',3);
  old.prepare('INSERT INTO sessions VALUES (?,?)').run('a'.repeat(64),Date.now()+60000);
  old.close();
  const db=await createStorage({},dir);
  try{
   const [note]=await db.list('primary');
   assert.equal(note.title,'Mine');assert.equal(note.content,'<p>Robert’s words</p>');assert.equal(note.version,7);assert.equal(note.created_at,'2026-09-01T00:00:00.000Z');
   const [day]=await db.listDays('primary');
   assert.deepEqual(day,{date:'2026-09-20',data:{movements:[{name:'Squat',sets:[{w:'225',r:'5'}]}],meals:[]},updated_at:'2026-09-20T12:00:00.000Z',version:3});
   assert.equal(await db.getSession('a'.repeat(64)),'primary','an existing sign-in keeps working');
   assert.deepEqual(await db.list('cat'),[]);assert.deepEqual(await db.listDays('cat'),[]);
   // The same date can now be logged by both people without touching each other.
   await db.saveDay('cat','2026-09-20',{movements:[],meals:[{name:'Toast'}]},0);
   assert.equal((await db.saveDay('primary','2026-09-20',{...day.data,meals:[{name:'Eggs'}]},3)).version,4);
   assert.equal((await db.listDays('cat'))[0].data.meals[0].name,'Toast');
  }finally{db.close();}
  // Opening it again is a no-op for the upgrade.
  const again=await createStorage({},dir);try{assert.equal((await again.listDays('primary'))[0].version,4);}finally{again.close();}
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('two profiles sign in separately and never see each other’s notes, days, or pictures',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'thermalnote-profiles-'));
 const env={APP_USERNAME:'robert',APP_PASSWORD_HASH:passwordHash('robert-pass'),APP_EXTRA_USERS:`Cat:${passwordHash('cat-pass')}`};
 const {server}=await createApp({env,dataDirectory:dir});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const call=(cookie,url,method='GET',data)=>fetch(origin+url,{method,headers:{origin,'content-type':'application/json',cookie},body:data===undefined?undefined:JSON.stringify(data)});
 const signIn=async(username,password)=>{const response=await call('','/api/login','POST',{username,password});return {response,cookie:response.headers.get('set-cookie')?.split(';')[0]};};
 try{
  assert.equal((await signIn('Cat','robert-pass')).response.status,401,'one person’s password does not open the other’s account');
  assert.equal((await signIn('nobody','cat-pass')).response.status,401);
  const robert=await signIn('robert','robert-pass'),cat=await signIn('cat','cat-pass');
  assert.equal(robert.response.status,200);assert.equal(cat.response.status,200,'names are not case sensitive');
  assert.deepEqual(await (await call(cat.cookie,'/api/session')).json(),{username:'Cat',profile:'cat',storage:'local'});
  assert.equal((await call(robert.cookie,'/api/notes/'+noteId,'PUT',{title:'Robert',content:'<p>r</p>',version:0})).status,200);
  assert.equal((await call(cat.cookie,'/api/notes/'+noteId,'PUT',{title:'Hijack',content:'<p>x</p>',version:1})).status,409,'a note id from another account cannot be overwritten');
  assert.equal((await call(cat.cookie,'/api/notes/'+noteId,'DELETE',{version:1})).status,409,'or deleted');
  assert.deepEqual(await (await call(cat.cookie,'/api/notes')).json(),[]);
  assert.equal((await (await call(robert.cookie,'/api/notes')).json())[0].title,'Robert');
  await call(robert.cookie,'/api/days/2026-09-28','PUT',{data:{movements:[],meals:[{name:'Eggs'}]},version:0});
  assert.equal((await call(cat.cookie,'/api/days/2026-09-28','PUT',{data:{movements:[],meals:[{name:'Oats'}]},version:0})).status,200);
  assert.equal((await (await call(robert.cookie,'/api/days')).json())[0].data.meals[0].name,'Eggs');
  assert.equal((await (await call(cat.cookie,'/api/days')).json())[0].data.meals[0].name,'Oats');
  const {src}=await (await call(robert.cookie,'/api/images','POST',{type:'image/png',data:png})).json();
  assert.equal((await call(robert.cookie,src)).status,200);
  assert.equal((await call(cat.cookie,src)).status,404,'a picture is only found in its owner’s storage');
  const {src:catSrc}=await (await call(cat.cookie,'/api/images','POST',{type:'image/png',data:png})).json();
  assert.equal((await call(cat.cookie,catSrc)).status,200);
 }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

test('a removed profile’s sessions stop working, and bad profile settings refuse to start',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'thermalnote-removed-'));await mkdir(dir,{recursive:true});
 const base={APP_USERNAME:'robert',APP_PASSWORD_HASH:passwordHash('robert-pass')};
 const first=await createApp({env:{...base,APP_EXTRA_USERS:`Cat:${passwordHash('cat-pass')}`},dataDirectory:dir});
 await new Promise(resolve=>first.server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${first.server.address().port}`;
 const login=await fetch(origin+'/api/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({username:'Cat',password:'cat-pass'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 await new Promise(resolve=>first.server.close(resolve));
 const second=await createApp({env:base,dataDirectory:dir});
 await new Promise(resolve=>second.server.listen(0,'127.0.0.1',resolve));const origin2=`http://127.0.0.1:${second.server.address().port}`;
 try{assert.equal((await fetch(origin2+'/api/session',{headers:{cookie}})).status,401);}
 finally{await new Promise(resolve=>second.server.close(resolve));await rm(dir,{recursive:true,force:true});}
 const hash=passwordHash('x');
 assert.deepEqual(profiles({...base,APP_EXTRA_USERS:`Cat:${hash}\nsam:${hash}`}).map(p=>p.id),['primary','cat','sam']);
 assert.throws(()=>profiles({...base,APP_EXTRA_USERS:'Cat:plaintext-password'}),/APP_EXTRA_USERS/);
 assert.throws(()=>profiles({...base,APP_EXTRA_USERS:`primary:${hash}`}),/APP_EXTRA_USERS/);
 assert.throws(()=>profiles({...base,APP_EXTRA_USERS:`Robert:${hash}`}),/twice/);
});
