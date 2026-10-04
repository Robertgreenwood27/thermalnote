import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE, imageSearch, isPose } from '../public/movements.js';

test('a day saved with a single ride becomes a day with one cardio entry',async()=>{
 const {normalizeDay}=await import('../public/workout.js');
 const old=normalizeDay({movements:[],meals:[],ride:{mi:'12.5',min:'45'}});
 assert.deepEqual(old.cardio,[{type:'ride',mi:'12.5',min:'45'}]);
 assert.equal(old.ride,undefined);
 assert.deepEqual(old.yoga,[]);
 assert.deepEqual(normalizeDay({ride:{mi:'',min:''}}).cardio,[],'an empty ride is not a ride');
 const current=normalizeDay({cardio:[{type:'run',mi:'3',min:'27'}],ride:{mi:'9',min:'30'}});
 assert.deepEqual(current.cardio,[{type:'run',mi:'3',min:'27'}],'cardio already present is left alone');
});

test('pace reads as speed for rides and minutes per mile on foot',async()=>{
 const {paceText,cardioText}=await import('../public/workout.js');
 assert.equal(paceText({type:'ride',mi:'12.5',min:'45'}),'16.7 mph');
 assert.equal(paceText({type:'run',mi:'3.1',min:'28'}),'9:02 /mi');
 assert.equal(paceText({type:'walk',mi:'2',min:'40'}),'20:00 /mi');
 assert.equal(paceText({type:'run',mi:'',min:'30'}),'','no distance, no pace');
 assert.equal(cardioText({type:'run',mi:'3.1',min:'28'}),'Run — 3.1 mi in 28 min · 9:02 /mi');
 assert.equal(cardioText({type:'swim',mi:'',min:'20'}),'Swim — 20 min');
});

test('the weight average ignores days with no weigh-in',async()=>{
 const {weightAverage}=await import('../public/workout.js');
 assert.equal(weightAverage([180,0,182,0,0,0,0]),181);
 assert.equal(weightAverage([0,0,0]),0);
});

test('yoga poses are held on the clock and look up as poses',()=>{
 const poses=CATALOGUE.filter(movement=>movement.group==='yoga'),functional=CATALOGUE.filter(movement=>movement.group==='functional');
 assert.ok(poses.length>=30,`${poses.length} poses`);
 assert.ok(functional.length>=25,`${functional.length} functional movements`);
 assert.ok(poses.every(pose=>pose.kind==='time'&&isPose(pose.name)));
 assert.match(imageSearch('Warrior II'),/yoga/);
 assert.match(imageSearch('Kettlebell Swing'),/exercise%20form/);
 assert.equal(new Set(CATALOGUE.map(movement=>movement.id)).size,CATALOGUE.length,'every movement id is unique');
});

test('every barbell lift is in the catalogue and found by the word barbell',async()=>{
 const {BARBELL,searchText}=await import('../public/movements.js');
 const names=new Set(CATALOGUE.map(movement=>movement.name));
 for(const name of BARBELL)assert.ok(names.has(name),`${name} is tagged barbell but is not in the catalogue`);
 assert.ok(BARBELL.size>=60,`${BARBELL.size} barbell lifts`);
 const find=query=>CATALOGUE.filter(movement=>query.split(' ').every(word=>searchText(movement.name).includes(word))).map(movement=>movement.name);
 assert.ok(find('barbell overhead press').includes('Overhead Press'));
 assert.ok(find('military press').includes('Overhead Press'));
 assert.ok(find('barbell squat').includes('Back Squat'));
 assert.ok(find('rdl').includes('Romanian Deadlift'));
});
