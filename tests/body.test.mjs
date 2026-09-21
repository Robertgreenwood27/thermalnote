import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE } from '../public/movements.js';
import { MUSCLES, TARGETS, muscleById, muscleForPart, targetsOf, movementsForMuscle } from '../public/muscles.js';
import { SECONDARY_SHARE, HALF_LIFE_HOURS, effortOf, fadeOver, muscleHeat, heatLabel, daysAgoText } from '../public/recovery.js';
import { sessionsFrom } from '../public/body.js';

const project=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HOUR=3600*1000,DAY=24*HOUR;
const dayTime=key=>new Date(`${key}T12:00:00`).getTime();
const close=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-9,`${message}: ${actual} is not ${expected}`);

test('every mapped muscle part is a real part of the shipped model',async()=>{
 // The join between muscles.js and body-muscles.glb is a name. A typo on either side would
 // leave a muscle that silently never lights up, so the names are checked against the file.
 const bytes=await readFile(path.join(project,'public','body-muscles.glb'));
 assert.equal(bytes.readUInt32LE(0),0x46546c67); // "glTF"
 const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 const parts=new Set(gltf.nodes.map(node=>node.extras.part));
 for(const[part]of muscleForPart)assert.ok(parts.has(part),`${part} is not in the model`);
 for(const muscle of MUSCLES)assert.ok(muscle.parts.length,`${muscle.id} has no meshes`);
 assert.ok(gltf.nodes.every(node=>node.mesh!==undefined&&node.extras?.part));
});

test('every movement in the catalogue targets muscles that exist',()=>{
 const known=new Set(MUSCLES.map(muscle=>muscle.id));
 for(const movement of CATALOGUE){
  const targets=targetsOf(movement.id);
  assert.ok(targets.primary.length,`${movement.id} has no primary muscle`);
  for(const id of [...targets.primary,...targets.secondary])assert.ok(known.has(id),`${movement.id} targets unknown ${id}`);
  assert.equal(new Set([...targets.primary,...targets.secondary]).size,targets.primary.length+targets.secondary.length,`${movement.id} lists a muscle twice`);
 }
 assert.deepEqual(Object.keys(TARGETS).filter(id=>!CATALOGUE.some(movement=>movement.id===id)),[]);
 // A muscle knows its movements, and those movements agree that they train it.
 const {primary,secondary}=movementsForMuscle('lats');
 assert.ok(primary.some(movement=>movement.id==='pull-up'));
 assert.ok(secondary.some(movement=>movement.id==='deadlift'));
 assert.ok(!primary.some(movement=>secondary.includes(movement)));
});

test('a logged day heats the muscles it trained, primaries hardest',()=>{
 const days=new Map([['2026-09-21',{date:'2026-09-21',data:{movements:[
   {id:'a',mid:'barbell-bench-press',name:'Barbell Bench Press',kind:'weight',sets:[{w:'135',r:'8'},{w:'135',r:'8'},{w:'135',r:'6'}]},
   {id:'b',mid:'ghost-movement',name:'Something New',kind:'weight',sets:[{w:'20',r:'10'}]}, // Not mapped yet.
   {id:'c',mid:'crunch',name:'Crunch',kind:'weight',sets:[{w:'',r:''}]} // Added but never done.
 ],meals:[]}}]]);
 const sessions=sessionsFrom(days,dayTime);
 assert.deepEqual(sessions.map(session=>session.mid),['barbell-bench-press']);
 assert.equal(sessions[0].sets,3);
 const heat=muscleHeat(sessions,dayTime('2026-09-21'));
 close(heat.get('chest').heat,effortOf(3),'chest');
 close(heat.get('triceps').heat,effortOf(3)*SECONDARY_SHARE,'triceps');
 assert.ok(heat.get('chest').heat>heat.get('triceps').heat);
 assert.equal(heat.get('quads'),undefined); // Nothing trained legs, so nothing is warm.
 assert.equal(heat.get('chest').last.name,'Barbell Bench Press');
});

test('heat fades on a half-life and stacked sessions never exceed fully worked',()=>{
 const session={mid:'barbell-curl',name:'Barbell Curl',date:'2026-09-21',at:dayTime('2026-09-21'),muscles:{biceps:1}};
 assert.equal(fadeOver(0),1);
 assert.equal(fadeOver(HALF_LIFE_HOURS),0.5);
 assert.equal(fadeOver(-5),1); // A day logged in the future reads as today, not hotter than possible.
 const after=hours=>muscleHeat([session],session.at+hours*HOUR).get('biceps').heat;
 close(after(HALF_LIFE_HOURS),0.5,'one half-life');
 assert.ok(after(0)>after(2*DAY/HOUR)&&after(2*DAY/HOUR)>after(7*DAY/HOUR));
 assert.ok(after(7*DAY/HOUR)<0.15); // A week out, a muscle is all but cool again.
 const twice=muscleHeat([session,{...session,at:session.at-2*DAY}]).get('biceps');
 assert.ok(twice.heat<=1&&twice.heat>muscleHeat([session]).get('biceps').heat);
 assert.equal(twice.last.at,session.at); // The most recent session is the one that dates it.
 assert.ok(effortOf(6)>effortOf(3)&&effortOf(20)<1); // More sets is always more, but it saturates.
});

test('heat and recency read the way a training week is spoken',()=>{
 assert.equal(heatLabel(0.9),'Worked hard');
 assert.equal(heatLabel(0.4),'Still recovering');
 assert.equal(heatLabel(0.1),'Nearly fresh');
 assert.equal(heatLabel(0),'Fresh');
 const now=dayTime('2026-09-21');
 assert.equal(daysAgoText(now,now),'today');
 assert.equal(daysAgoText(now-DAY,now),'yesterday');
 assert.equal(daysAgoText(now-3*DAY,now),'3 days ago');
 assert.equal(daysAgoText(now-9*DAY,now),'last week');
 assert.equal(daysAgoText(now-21*DAY,now),'3 weeks ago');
 assert.equal(muscleById.get('quads').name,'Quads');
});
