import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingMeter, PAUSE_MS, wpm } from '../public/typing.js';

// 60 WPM is 300 characters a minute: one character every 200 ms.
function type(meter,chars,from,every=200){for(let i=0;i<chars;i++)meter.record('type',1,from+i*every);return from+(chars-1)*every;}

test('five characters make a word',()=>{
 assert.equal(wpm(300,60000),60);
 assert.equal(wpm(0,1000),0);
});

test('steady typing reads at its true speed, live and for the session',()=>{
 const meter=new TypingMeter(),end=type(meter,100,0);
 assert.ok(Math.abs(meter.live(end)-60)<3,`live ${meter.live(end)}`);
 assert.ok(Math.abs(meter.session(end).avg-60)<2,`avg ${meter.session(end).avg}`);
});

test('pauses end the burst and never count against the average',()=>{
 const meter=new TypingMeter();
 let end=type(meter,60,0);
 assert.equal(meter.live(end+PAUSE_MS+1),null,'nobody is typing after the pause');
 end=type(meter,60,end+60000);                        // a full minute of thinking in between
 const session=meter.session(end+PAUSE_MS+1);
 assert.ok(Math.abs(session.avg-60)<3,`avg ${session.avg} ignores the minute of thinking`);
 assert.ok(session.best>55,'a burst long enough to count sets the best');
});

test('pastes are not typing, and backspaces lower what was kept',()=>{
 const meter=new TypingMeter();
 const end=type(meter,50,0);
 meter.record('type',400,end+100);
 assert.equal(meter.session(end+100).typed,50,'a 400-character insert is a paste');
 meter.record('delete',5,end+200);
 assert.equal(Math.round(meter.session(end+200).kept*100),90);
});
