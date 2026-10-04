// The training plan: which workout comes next, what it holds, and what to lift. Plain data and arithmetic, no page,
// so changing the plan is editing the table below and reloading.
import { kindOf } from './movements.js';

// Each slot lists the movements that can fill it, gym choice first. A lift that needs a matched pair of dumbbells
// also lists its closest barbell version, for training at home with one bar and odd single dumbbells. A swap (home,
// a busy machine, no pair) is remembered: the slot opens on whichever option was done most recently.
export const PLAN={
  name:'Full-body hypertrophy, beginner',
  days:[2,4,6], // Tue, Thu, Sat, as Date.getDay() numbers them
  // Week 1 is A B A and week 2 is B A B, which is plain alternation. Following the last workout done rather than the
  // calendar keeps that true through a missed day: skip Thursday and Saturday brings the one that was missed.
  order:['A','B'],
  rir:[1,2],
  rest:{big:[2,3],small:[1,2]},
  workouts:{
    A:[
      {options:['Dumbbell Bench Press','Barbell Bench Press'],sets:3,reps:[8,12],big:true},
      {options:['Dumbbell Row'],sets:3,reps:[8,12],big:true,perSide:true},
      {options:['Leg Press','Goblet Squat'],sets:3,reps:[10,15],big:true},
      {options:['Seated Leg Curl','Dumbbell Romanian Deadlift','Romanian Deadlift'],sets:2,reps:[10,15],big:true,failLast:true},
      {options:['Seated Dumbbell Press','Seated Barbell Press'],sets:2,reps:[8,12]},
      {options:['Incline Dumbbell Curl','Barbell Curl'],sets:2,reps:[10,15],failLast:true}
    ],
    B:[
      {options:['Pull-Up','Lat Pulldown'],sets:3,reps:[6,12],big:true},
      {options:['Incline Dumbbell Press','Incline Barbell Bench Press'],sets:3,reps:[8,12],big:true},
      {options:['Goblet Squat'],sets:3,reps:[10,15],big:true},
      {options:['Dumbbell Romanian Deadlift','Romanian Deadlift'],sets:3,reps:[8,12],big:true},
      {options:['Cable Lateral Raise','Lateral Raise'],sets:3,reps:[12,20],failLast:true},
      {options:['Overhead Triceps Extension'],sets:2,reps:[10,15]}
    ]
  }
};
// How much to add once every set reaches the top of the range. Dumbbells go up in 5s; the leg press takes bigger jumps.
const INCREMENT={'Leg Press':[10,20]};
const NOTES={'Pull-Up':'Too hard: jump to the top and lower over 3–5 s'};
export const incrementFor=name=>INCREMENT[name]||[5];
export const noteFor=name=>NOTES[name]||'';

const num=value=>{const parsed=parseFloat(value);return Number.isFinite(parsed)?parsed:0;};
const range=([low,high=low])=>low===high?`${low}`:`${low}–${high}`;
const asDate=key=>new Date(`${key}T12:00:00`);
const keyOf=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const slotOf=(letter,index)=>PLAN.workouts[letter]?.[index]||null;
export const isTrainingDay=key=>PLAN.days.includes(asDate(key).getDay());
export function nextTrainingDay(key){const date=asDate(key);for(let i=0;i<7;i++){date.setDate(date.getDate()+1);if(PLAN.days.includes(date.getDay()))return keyOf(date);}return key;}
// What follows the last workout done. Nothing done yet starts at the top.
export function nextWorkout(last){const at=PLAN.order.indexOf(last);return at<0?PLAN.order[0]:PLAN.order[(at+1)%PLAN.order.length];}

// "3 × 8–12 each side · RIR 1–2 · rest 2–3 min · last set to failure"
export function targetText(slot){
  return [`${slot.sets} × ${range(slot.reps)}${slot.perSide?' each side':''}`,`RIR ${range(PLAN.rir)}`,`rest ${range(slot.big?PLAN.rest.big:PLAN.rest.small)} min`,slot.failLast?'last set to failure':''].filter(Boolean).join(' · ');
}

// The rule: every prescribed set at the top of the range earns more weight next time; anything short keeps the
// weight and chases reps. Returns what to say and the sets to pre-fill, dimmed until they are typed over.
export function progress(slot,name,last){
  const kind=kindOf(name),[low,high]=slot.reps;
  const done=(last?.sets||[]).filter(set=>num(set.r)>0);
  if(!done.length)return{step:'first',text:kind==='body'?`First time: see how many clean reps you get, up to ${high}.`:`First time: pick a weight you can lift ${low}–${high} times with ${range(PLAN.rir)} reps to spare.`,sets:Array.from({length:slot.sets},()=>kind==='body'?{r:'',w:'',rir:''}:{w:'',r:'',rir:''})};
  const counted=done.slice(0,slot.sets);
  const short=counted.reduce((sum,set)=>sum+Math.max(0,high-num(set.r)),0)+(slot.sets-counted.length)*high;
  if(!short){
    const step=incrementFor(name),top=Math.max(...counted.map(set=>num(set.w)));
    return{step:'add',text:`Add ${range(step)} lb: every set hit ${high} last time.`,sets:Array.from({length:slot.sets},()=>({w:String(top+step[0]),r:String(low),rir:'',g:1}))};
  }
  const sets=Array.from({length:slot.sets},(_,i)=>{const set=counted[Math.min(i,counted.length-1)];return{w:set.w??'',r:set.r??'',rir:'',g:1};});
  return{step:'hold',text:`Same weight. ${short} ${short===1?'rep':'reps'} to go until ${high} on every set, then add weight.`,sets};
}
