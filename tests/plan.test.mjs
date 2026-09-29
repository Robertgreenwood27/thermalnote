import test from 'node:test';
import assert from 'node:assert/strict';
import { byId, slug } from '../public/movements.js';
import { targetsOf } from '../public/muscles.js';
import { PLAN, nextWorkout, isTrainingDay, nextTrainingDay, progress, targetText, slotOf } from '../public/plan.js';

test('every movement the plan names is in the catalogue and lights up the body',()=>{
 for(const[letter,slots]of Object.entries(PLAN.workouts))for(const slot of slots)for(const name of slot.options){
  assert.ok(byId.has(slug(name)),`${letter}: ${name} is not in the catalogue`);
  assert.ok(targetsOf(slug(name)).primary.length,`${name} trains nothing`);
 }
});

test('workouts alternate, which is A B A then B A B across Tue, Thu, Sat',()=>{
 let last=null;const run=[];
 for(let i=0;i<6;i++){last=nextWorkout(last);run.push(last);}
 assert.deepEqual(run,['A','B','A','B','A','B']);
});

test('training days are Tuesday, Thursday, and Saturday',()=>{
 // 2026-09-29 is a Tuesday.
 assert.equal(isTrainingDay('2026-09-29'),true);
 assert.equal(isTrainingDay('2026-09-30'),false);
 assert.equal(nextTrainingDay('2026-09-29'),'2026-10-01');
 assert.equal(nextTrainingDay('2026-10-03'),'2026-10-06','Saturday rolls to next Tuesday');
});

test('top of the range on every set adds weight; anything short holds it',()=>{
 const bench=slotOf('A',0);
 const hit=progress(bench,'Dumbbell Bench Press',{sets:[{w:'40',r:'12'},{w:'40',r:'12'},{w:'40',r:'12'}]});
 assert.equal(hit.step,'add');
 assert.equal(hit.text,'Add 5 lb: every set hit 12 last time.');
 assert.deepEqual(hit.sets.map(set=>[set.w,set.r]),[['45','8'],['45','8'],['45','8']]);
 const short=progress(bench,'Dumbbell Bench Press',{sets:[{w:'40',r:'12'},{w:'40',r:'10'},{w:'40',r:'9'}]});
 assert.equal(short.step,'hold');
 assert.match(short.text,/5 reps to go/);
 assert.deepEqual(short.sets.map(set=>[set.w,set.r]),[['40','12'],['40','10'],['40','9']]);
 assert.ok(short.sets.every(set=>set.g),'suggestions are dimmed until typed over');
 const missing=progress(bench,'Dumbbell Bench Press',{sets:[{w:'40',r:'12'},{w:'40',r:'12'}]});
 assert.equal(missing.step,'hold','a skipped set is not every set');
 assert.equal(missing.sets.length,3);
 const press=progress(slotOf('A',2),'Leg Press',{sets:[{w:'200',r:'15'},{w:'200',r:'15'},{w:'180',r:'15'}]});
 assert.equal(press.sets[0].w,'210','the leg press jumps by 10 from the heaviest set');
 assert.match(press.text,/10–20 lb/);
 const first=progress(bench,'Dumbbell Bench Press',null);
 assert.equal(first.step,'first');assert.equal(first.sets.length,3);
});

test('targets read as sets, reps, effort, and rest',()=>{
 assert.equal(targetText(slotOf('A',1)),'3 × 8–12 each side · RIR 1–2 · rest 2–3 min');
 assert.equal(targetText(slotOf('A',5)),'2 × 10–15 · RIR 1–2 · rest 1–2 min · last set to failure');
});
