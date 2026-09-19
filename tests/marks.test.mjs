import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createStorage } from '../lib/storage.mjs';
import { createApp, passwordHash } from '../server.mjs';
import { DAY, HALF_LIVES, anchorMarks, isDue, newMark, parseMarks, reconcileMarks, retention, review, tier, toggleMark, trimRange } from '../public/marks.js';
const id='2b4d2ad1-1d0e-4b63-8f53-6b7c4f1b0d21';
const at=1_700_000_000_000;
const mark=(start,end,text,extra={})=>({...newMark(text,start,end,at),...extra});

test('a fresh mark is fully warm, and evidence of recall decays into warmth again',()=>{
 const fresh=mark(0,7,'TACACS+');
 assert.equal(retention(fresh,at),0);
 assert.equal(tier(fresh,at),0);
 assert.ok(isDue(fresh,at));
 const once=review(fresh,'got',at);
 assert.equal(once.recalls,1);
 assert.ok(!isDue(once,at),'a passage just recalled is not asking for attention');
 assert.ok(isDue(once,at+3*DAY),'one recall does not keep a passage cool for three days');
 let seasoned=fresh;
 for(let n=0;n<9;n++)seasoned=review(seasoned,'got',at);
 assert.equal(seasoned.recalls,HALF_LIVES.length-1,'the recall streak stops at the longest half-life');
 assert.ok(!isDue(seasoned,at+30*DAY),'fifteen recalls survive a month');
 assert.ok(isDue(seasoned,at+200*DAY),'nothing stays cool forever');
});

test('forgetting resets the streak and hard repeats the current interval',()=>{
 const strong=review(review(review(mark(0,7,'TACACS+'),'got',at),'got',at),'got',at);
 assert.equal(review(strong,'hard',at).recalls,3);
 const lapsed=review(strong,'forgot',at);
 assert.equal(lapsed.recalls,0);
 assert.equal(lapsed.lapses,1);
 assert.equal(retention(lapsed,at),0);
 assert.equal(review(mark(0,4,'RADIUS'),'hard',at).recalls,1,'a hard recall still counts as a recall');
});

test('marks ride along with edits and lose confidence only when their own words change',()=>{
 const before='RADIUS uses UDP 1812. TACACS+ uses TCP 49.',one=mark(22,29,'TACACS+'),two=mark(0,6,'RADIUS');
 const settled=review(review(one,'got',at),'got',at);
 const after='AAA notes: '+before;
 const shifted=reconcileMarks(before,after,[two,settled],{start:0,end:0},at+DAY);
 assert.deepEqual(shifted.map(m=>[m.start,m.end]),[[11,17],[33,40]],'text inserted above moves both marks');
 assert.equal(shifted[1].recalls,2,'text elsewhere leaves confidence alone');
 assert.equal(after.slice(shifted[1].start,shifted[1].end),'TACACS+');
 const edited=before.replace('TACACS+','TACACS');
 const touched=reconcileMarks(before,edited,[settled],{start:28,end:29},at+DAY);
 assert.equal(touched[0].text,'TACACS');
 assert.equal(touched[0].recalls,0,'editing the passage voids the evidence you knew it');
 assert.equal(touched[0].reviewed,at+DAY);
 assert.equal(reconcileMarks(before,'RADIUS uses UDP 1812. ',[settled],null,at).length,0,'a deleted passage takes its mark with it');
});

test('typing at either edge of a mark leaves the mark exactly where it was',()=>{
 const before='see TACACS+ here',one=mark(4,11,'TACACS+');
 const ahead=reconcileMarks(before,'see xTACACS+ here',[one],{start:4,end:4},at);
 assert.deepEqual([ahead[0].start,ahead[0].end],[5,12]);
 assert.equal(ahead[0].recalls,0);
 assert.equal('see xTACACS+ here'.slice(ahead[0].start,ahead[0].end),'TACACS+');
 const behind=reconcileMarks(before,'see TACACS+x here',[one],{start:11,end:11},at);
 assert.deepEqual([behind[0].start,behind[0].end],[4,11]);
});

test('saved offsets are a guess: verify, then search, then let go',()=>{
 const text='A long preamble. RADIUS uses UDP 1812.';
 const kept=mark(6,12,'RADIUS'),gone=mark(2,9,'TACACS+');
 const found=anchorMarks([kept,gone],text);
 assert.equal(found.length,1,'a mark whose words are gone is not pointed at the wrong ones');
 assert.deepEqual([found[0].start,found[0].end],[17,23]);
 assert.equal(found[0].id,kept.id,'re-anchoring keeps the mark, and its history');
 assert.equal(anchorMarks([mark(0,6,'RADIUS')],text)[0].start,17);
});

test('one gesture marks a passage and releases it',()=>{
 const text='RADIUS uses UDP 1812.';
 const marked=toggleMark([],0,6,text);
 assert.equal(marked[0].text,'RADIUS');
 assert.equal(toggleMark(marked,3,9,text).length,0,'a selection touching a mark releases it');
 assert.deepEqual(trimRange(text,6,12),{start:7,end:11},'sloppy selections are trimmed to the words');
});

test('stored marks are rebuilt defensively and ignore nonsense',()=>{
 assert.deepEqual(parseMarks('not json'),[]);
 assert.deepEqual(parseMarks('{"start":0}'),[]);
 const parsed=parseMarks(JSON.stringify([{id:'x',text:'TCP 49',start:5,end:11,recalls:2,lapses:1,reviewed:at,created:at},{text:'',start:0,end:1},{text:'ok',start:4,end:2}]));
 assert.equal(parsed.length,1);
 assert.deepEqual(parsed[0],{id:'x',text:'TCP 49',start:5,end:11,recalls:2,lapses:1,reviewed:at,created:at});
});

test('marks persist beside the note text, and a notebook written before marks gains them',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'thermalnote-marks-'));
 let db=await createStorage({},dir);
 const marks=JSON.stringify([mark(0,7,'TACACS+')]);
 try{
  const first=await db.save({id,title:'AAA',content:'<p>TACACS+ is centralized AAA.</p>',marks},0);
  assert.equal(first.marks,marks);
  db.close();db=await createStorage({},dir);
  const [reopened]=await db.list();
  assert.equal(reopened.marks,marks,'marks survive a restart');
  assert.equal(reopened.content,'<p>TACACS+ is centralized AAA.</p>','the note text is untouched by marking');
  const cleared=await db.save({...reopened,marks:'[]'},reopened.version);
  assert.equal(cleared.marks,'[]');
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('the API stores marks, defaults them, and refuses anything that is not a list',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'thermalnote-marks-api-'));
 const {server}=await createApp({env:{APP_USERNAME:'test-user',APP_PASSWORD_HASH:passwordHash('test-password')},dataDirectory:dir});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;let cookie='';
 const call=(url,method='GET',data)=>fetch(origin+url,{method,headers:{origin,'content-type':'application/json',cookie},body:data===undefined?undefined:JSON.stringify(data)});
 try{
  const login=await call('/api/login','POST',{username:'test-user',password:'test-password'});cookie=login.headers.get('set-cookie').split(';')[0];
  const marks=JSON.stringify([mark(0,7,'TACACS+')]);
  assert.equal((await call('/api/notes/'+id,'PUT',{title:'AAA',content:'<p>TACACS+</p>',marks,version:0})).status,200);
  assert.equal((await (await call('/api/notes')).json())[0].marks,marks);
  assert.equal((await call('/api/notes/'+id,'PUT',{title:'AAA',content:'<p>TACACS+</p>',marks:'{"not":"a list"}',version:1})).status,400);
  assert.equal((await call('/api/notes/'+id,'PUT',{title:'AAA',content:'<p>TACACS+</p>',marks:7,version:1})).status,400);
  const plain=await call('/api/notes/'+id,'PUT',{title:'AAA',content:'<p>TACACS+</p>',version:1});
  assert.equal(plain.status,200);
  assert.equal((await plain.json()).marks,'[]','a note saved without marks keeps an empty list');
 }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
