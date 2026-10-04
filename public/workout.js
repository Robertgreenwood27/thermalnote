import { $, api, toast, backup, now } from './core.js';
import { GROUPS, CATALOGUE, BARBELL, byId, slug, imageSearch, searchText } from './movements.js';
import { initBody, openBody, closeBody } from './body.js';
import { PLAN, slotOf, isTrainingDay, nextTrainingDay, nextWorkout, targetText, progress, noteFor } from './plan.js';
// A training day runs 4am to 4am, so a late-night session lands on the day it belonged to.
const DAY_START=4;
const FIELDS={weight:[['w','lb','decimal'],['r','reps','numeric'],['rir','RIR','decimal']],body:[['r','reps','numeric'],['w','+lb','decimal'],['rir','RIR','decimal']],time:[['sec','sec','numeric']]};
const state={days:new Map(),viewing:null,loaded:false,unauthorized:null,profile:'primary',settings:null};
// Per-account preferences ride in the day store under a date no real day can have, so they need no table of their own
// and follow the account from phone to laptop. It is kept out of state.days, so history, bests, and the body never see it.
export const SETTINGS_DATE='1970-01-01';
const settingsDoc=()=>state.settings||(state.settings={date:SETTINGS_DATE,data:{},version:0,updated_at:now()});
export function setProfile(profile){state.profile=profile||'primary';}
// Two focuses over the same features. Nothing is hidden: the focus decides what comes first.
const FOCUSES={hypertrophy:'Hypertrophy',functional:'Functional'};
const focus=()=>FOCUSES[settingsDoc().data.focus]?settingsDoc().data.focus:state.profile==='primary'?'hypertrophy':'functional';
// The plan is on for a hypertrophy focus unless it has been turned off, and off otherwise until turned on.
const planOn=()=>typeof settingsDoc().data.plan==='boolean'?settingsDoc().data.plan:focus()==='hypertrophy';
const queues=new Map();
const SVG='http://www.w3.org/2000/svg';
function magnifier(){const svg=document.createElementNS(SVG,'svg');svg.setAttribute('viewBox','0 0 16 16');svg.setAttribute('width','15');svg.setAttribute('height','15');svg.setAttribute('aria-hidden','true');const ring=document.createElementNS(SVG,'circle');ring.setAttribute('cx','6.8');ring.setAttribute('cy','6.8');ring.setAttribute('r','4.5');const handle=document.createElementNS(SVG,'line');handle.setAttribute('x1','10.2');handle.setAttribute('y1','10.2');handle.setAttribute('x2','14');handle.setAttribute('y2','14');for(const part of[ring,handle]){part.setAttribute('fill','none');part.setAttribute('stroke','currentColor');part.setAttribute('stroke-width','1.7');part.setAttribute('stroke-linecap','round');}svg.append(ring,handle);return svg;}
function lookupLink(name,className){const link=el('a',className);link.href=imageSearch(name);link.target='_blank';link.rel='noopener noreferrer';link.title=`See ${name}`;link.setAttribute('aria-label',`See images of ${name}`);link.append(magnifier());return link;}
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
const num=value=>{const parsed=parseFloat(value);return Number.isFinite(parsed)?parsed:0;};
const fmt=value=>Number.isInteger(value)?String(value):String(Math.round(value*10)/10);
const group=value=>Math.round(value).toLocaleString();
export function dayKey(at=new Date()){const shifted=new Date(at.getTime()-DAY_START*3600*1000);return `${shifted.getFullYear()}-${String(shifted.getMonth()+1).padStart(2,'0')}-${String(shifted.getDate()).padStart(2,'0')}`;}
const asDate=key=>new Date(`${key}T12:00:00`);
// A day is placed at its own midday. Nothing records the hour a set was done, and with a
// recovery half-life measured in days a few hours either way does not change the colour.
export const dayTime=key=>asDate(key).getTime();
const longDate=key=>new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(asDate(key));
const shortDate=key=>new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric'}).format(asDate(key));
const shiftDay=(key,days)=>{const date=asDate(key);date.setDate(date.getDate()+days);return dayKey(new Date(date.getTime()+DAY_START*3600*1000));};

// ---- the shape of a day -------------------------------------------------
const blank=kind=>kind==='time'?{sec:''}:kind==='body'?{r:'',w:'',rir:''}:{w:'',r:'',rir:''};
// Days saved before cardio existed carried a single ride; it becomes the day's first cardio entry.
export function normalizeDay(data){
  data.movements||=[];data.meals||=[];
  if(!Array.isArray(data.cardio)){data.cardio=[];const mi=num(data.ride?.mi),min=num(data.ride?.min);if(mi>0||min>0)data.cardio.push({type:'ride',mi:String(data.ride.mi??''),min:String(data.ride.min??'')});}
  delete data.ride;
  if(!Array.isArray(data.yoga))data.yoga=[];
  return data;
}
function docFor(date){if(date===SETTINGS_DATE)return settingsDoc();if(!state.days.has(date))state.days.set(date,{date,data:{movements:[],meals:[],note:''},version:0,updated_at:now()});const doc=state.days.get(date);normalizeDay(doc.data);return doc;}
const docAt=date=>date===SETTINGS_DATE?state.settings:state.days.get(date);
// Everything outside lifting is optional and allowed to stay blank: a ride of 0, a forgotten weigh-in, a skipped check-in.
const MOODS=[['morning','Morning','First thing'],['noon','Midday','Around noon'],['night','Bedtime','Before bed']];
const text=value=>typeof value==='string'?value.trim():'';
export const CARDIO=[['run','Run'],['ride','Ride'],['walk','Walk'],['hike','Hike'],['swim','Swim'],['row','Row'],['elliptical','Elliptical']];
const cardioName=type=>(CARDIO.find(([id])=>id===type)||[type,'Cardio'])[1];
const YOGA_STYLES=['Flow','Hatha','Yin','Power','Restorative','Stretch','Hot'];
const cardioLogged=item=>num(item.mi)>0||num(item.min)>0;
const yogaLogged=item=>num(item.min)>0||!!text(item.note);
const cardioOf=doc=>(doc.data.cardio||[]).filter(cardioLogged);
const yogaOf=doc=>(doc.data.yoga||[]).filter(yogaLogged);
const hasCardio=doc=>cardioOf(doc).length>0;
const hasYoga=doc=>yogaOf(doc).length>0;
const hasMood=doc=>MOODS.some(([key])=>text(doc.data.mood?.[key]));
const mealLogged=meal=>text(meal.name)||num(meal.protein)>0||num(meal.cal)>0;
// A plan's pre-filled numbers are targets, not work done: they count once a set is typed into (RIR is enough).
const logged=entry=>entry.sets.filter(set=>!(entry.plan&&set.g)&&(entry.kind==='time'?num(set.sec)>0:num(set.r)>0));
const hasContent=doc=>doc.data.movements.some(entry=>logged(entry).length)||doc.data.meals.some(mealLogged)||num(doc.data.weight)>0||hasCardio(doc)||hasYoga(doc)||hasMood(doc);

// ---- metrics ------------------------------------------------------------
const setVolume=(set,kind)=>kind==='time'?num(set.sec):kind==='body'?num(set.r):num(set.w)*num(set.r);
export const entryVolume=entry=>logged(entry).reduce((sum,set)=>sum+setVolume(set,entry.kind),0);
// Epley. Only meaningful when an external load is on the bar.
const e1rm=set=>num(set.w)>0&&num(set.r)>0?num(set.w)*(1+num(set.r)/30):0;
const dayVolume=doc=>doc.data.movements.filter(entry=>entry.kind==='weight').reduce((sum,entry)=>sum+entryVolume(entry),0);
const dayProtein=doc=>doc.data.meals.reduce((sum,meal)=>sum+num(meal.protein),0);
const dayCalories=doc=>doc.data.meals.reduce((sum,meal)=>sum+num(meal.cal),0);
// Rides read as speed; everything on foot or in the water reads as minutes per mile.
export function paceText(item){
  const mi=num(item.mi),min=num(item.min);if(!(mi>0&&min>0))return '';
  if(item.type==='ride')return `${fmt(mi/(min/60))} mph`;
  const per=min/mi,whole=Math.floor(per),sec=Math.round((per-whole)*60);
  return `${sec===60?whole+1:whole}:${String(sec===60?0:sec).padStart(2,'0')} /mi`;
}
export function cardioText(item){const parts=[];if(num(item.mi)>0)parts.push(`${fmt(num(item.mi))} mi`);if(num(item.min)>0)parts.push(`${fmt(num(item.min))} min`);const pace=paceText(item);return `${cardioName(item.type)} — ${parts.join(' in ')}${pace?` · ${pace}`:''}`;}
function yogaText(item){return [`${item.style||'Yoga'} — ${num(item.min)?`${fmt(num(item.min))} min`:'time not noted'}`,text(item.note)].filter(Boolean).join(' · ');}
// Minutes moving: cardio, yoga sessions, and anything held on the clock.
const activeMinutes=doc=>cardioOf(doc).reduce((sum,item)=>sum+num(item.min),0)+yogaOf(doc).reduce((sum,item)=>sum+num(item.min),0)+doc.data.movements.filter(entry=>entry.kind==='time').reduce((sum,entry)=>sum+entryVolume(entry),0)/60;
const miles=doc=>cardioOf(doc).reduce((sum,item)=>sum+num(item.mi),0);
const workSets=doc=>doc.data.movements.reduce((sum,entry)=>sum+logged(entry).length,0);
function lastDays(date,count){const days=[];for(let i=0;i<count;i++){const doc=state.days.get(shiftDay(date,-i));if(doc)days.push(doc);}return days;}
// A seven-day average smooths out water and salt, which is what makes a weight-loss trend readable.
export function weightAverage(weights){const values=weights.filter(value=>value>0);return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;}
function weightTrend(date){
  const averageFrom=start=>weightAverage([0,1,2,3,4,5,6].map(i=>num(state.days.get(shiftDay(date,-(start+i)))?.data.weight)));
  const recent=averageFrom(0),before=averageFrom(7);return{avg:recent,change:recent&&before?recent-before:0};
}
function previousWeight(beforeDate){const dates=[...state.days.keys()].filter(date=>date<beforeDate).sort().reverse();for(const date of dates){const weight=num(state.days.get(date).data.weight);if(weight>0)return{date,weight};}return null;}
export function volumeText(entry){const total=entryVolume(entry);if(!total)return '';return entry.kind==='time'?`${Math.floor(total/60)}:${String(Math.round(total%60)).padStart(2,'0')}`:entry.kind==='body'?`${group(total)} reps`:`${group(total)} lb`;}
function setText(set,kind){if(kind==='time')return `${fmt(num(set.sec))}s`;if(kind==='body')return num(set.w)>0?`+${fmt(num(set.w))}×${fmt(num(set.r))}`:`${fmt(num(set.r))}`;return `${fmt(num(set.w))}×${fmt(num(set.r))}`;}
// Consecutive identical sets collapse: "30×10 ×3" rather than the same thing three times.
export function setsText(entry,withRir=false){const parts=[];for(const set of logged(entry)){const label=setText(set,entry.kind)+(withRir&&set.rir!==''&&set.rir!=null?` RIR${fmt(num(set.rir))}`:'');const last=parts[parts.length-1];if(last&&last.label===label)last.count++;else parts.push({label,count:1});}return parts.map(part=>part.count>1?`${part.label} ×${part.count}`:part.label).join(', ');}
function previous(mid,beforeDate){const dates=[...state.days.keys()].filter(date=>date<beforeDate).sort().reverse();for(const date of dates){const entry=state.days.get(date).data.movements.find(item=>item.mid===mid);if(entry&&logged(entry).length)return{date,entry};}return null;}
// ---- the plan -----------------------------------------------------------
// A workout counts as done once any of its movements has a logged set, so opening one and walking away does not move the rotation.
const planDone=doc=>!!doc.data.plan&&doc.data.movements.some(entry=>entry.plan&&logged(entry).length);
function lastWorkout(beforeDate){const dates=[...state.days.keys()].filter(date=>date<beforeDate).sort().reverse();for(const date of dates){const doc=state.days.get(date);if(planDone(doc))return{date,letter:doc.data.plan};}return null;}
// A slot opens on whichever of its options filled it last time, so a home swap sticks until the gym comes back.
// Only this slot counts: goblet squats done in workout B say nothing about what fills A's leg press.
function preferredOption(letter,index,date){
  const slot=slotOf(letter,index),dates=[...state.days.keys()].filter(day=>day<date).sort().reverse();
  for(const day of dates){const entry=state.days.get(day).data.movements.find(item=>item.plan?.w===letter&&item.plan?.i===index&&logged(item).length);const name=entry&&slot.options.find(option=>slug(option)===entry.mid);if(name)return name;}
  return slot.options[0];
}
function plannedEntry(letter,index,name,date){
  const movement=byId.get(slug(name))||{id:slug(name),name,group:'custom',kind:'weight'};
  const history=previous(movement.id,date);
  return{id:crypto.randomUUID(),mid:movement.id,name:movement.name,group:movement.group,kind:movement.kind,plan:{w:letter,i:index},sets:progress(slotOf(letter,index),movement.name,history&&{sets:logged(history.entry)}).sets};
}
function startWorkout(letter){
  const doc=docFor(state.viewing);
  // Switching workouts clears the other one's untouched movements; anything already logged stays.
  if(doc.data.plan&&doc.data.plan!==letter)doc.data.movements=doc.data.movements.filter(entry=>!(entry.plan&&entry.plan.w!==letter&&!logged(entry).length));
  doc.data.plan=letter;
  for(const[index,slot]of PLAN.workouts[letter].entries()){
    const existing=doc.data.movements.find(entry=>slot.options.some(name=>slug(name)===entry.mid));
    if(existing){existing.plan={w:letter,i:index};continue;}
    doc.data.movements.push(plannedEntry(letter,index,preferredOption(letter,index,state.viewing),state.viewing));
  }
  markDirty(state.viewing);renderDay();
}
function swapOption(entry){
  const slot=slotOf(entry.plan.w,entry.plan.i);if(!slot||slot.options.length<2)return;
  const typed=entry.sets.some(set=>!set.g&&(num(set.w)>0||num(set.r)>0||num(set.sec)>0));
  const name=slot.options[(slot.options.findIndex(option=>slug(option)===entry.mid)+1)%slot.options.length];
  if(typed&&!confirm(`Swap to ${name}? The sets typed for ${entry.name} will be cleared.`))return false;
  const doc=docFor(state.viewing);doc.data.movements[doc.data.movements.indexOf(entry)]={...plannedEntry(entry.plan.w,entry.plan.i,name,state.viewing),id:entry.id,...(entry.note?{note:entry.note}:{})};
  return true;
}
function renderPlan(doc){
  const box=$('w-plan');box.replaceChildren();
  const today=doc.date===dayKey();
  if(!planOn()||(!doc.data.plan&&!today)){box.hidden=true;return;}
  box.hidden=false;
  const rules=el('p','plan-rules',`Leave ${PLAN.rir.join('–')} reps in the tank. Big lifts rest ${PLAN.rest.big.join('–')} min, the rest ${PLAN.rest.small.join('–')}. Top of the range on every set, then add weight.`);
  if(doc.data.plan){
    const slots=PLAN.workouts[doc.data.plan]||[],entries=doc.data.movements.filter(entry=>entry.plan?.w===doc.data.plan);
    const done=entries.filter(entry=>logged(entry).length>=(slotOf(entry.plan.w,entry.plan.i)?.sets||1)).length;
    box.append(el('p','plan-kicker',PLAN.name),el('h2','plan-title',`Workout ${doc.data.plan}`),el('p','plan-sub',`${done} of ${slots.length} movements done`));
    // Removed a movement, or closed them all? The workout can always be loaded back in.
    const missing=slots.filter((slot,index)=>!entries.some(entry=>entry.plan.i===index)).length;
    if(missing){const load=el('button','plan-start',entries.length?`Add the ${missing} missing ${missing===1?'movement':'movements'}`:`Load workout ${doc.data.plan}`);load.type='button';load.dataset.act='start-plan';load.dataset.letter=doc.data.plan;box.append(load);}
    const switchTo=nextWorkout(doc.data.plan),swap=el('button','plan-alt',`or switch to workout ${switchTo}`);swap.type='button';swap.dataset.act='start-plan';swap.dataset.letter=switchTo;
    box.append(swap,rules);
    return;
  }
  const last=lastWorkout(doc.date),letter=nextWorkout(last?.letter),other=nextWorkout(letter);
  const names=PLAN.workouts[letter].map((slot,index)=>preferredOption(letter,index,doc.date)).join(', ');
  const start=el('button','plan-start',`Start workout ${letter}`);start.type='button';start.dataset.act='start-plan';start.dataset.letter=letter;
  const alt=el('button','plan-alt',`or workout ${other}`);alt.type='button';alt.dataset.act='start-plan';alt.dataset.letter=other;
  if(isTrainingDay(doc.date)){
    box.append(el('p','plan-kicker',PLAN.name),el('h2','plan-title',`Workout ${letter} today`),el('p','plan-sub',names),start,alt,rules);
  }else{
    const next=nextTrainingDay(doc.date);
    box.append(el('p','plan-kicker',PLAN.name),el('h2','plan-title','Rest day'),el('p','plan-sub',`Next: workout ${letter} on ${new Intl.DateTimeFormat(undefined,{weekday:'long'}).format(asDate(next))}. ${names}.`));
    start.textContent=`Do workout ${letter} today instead`;start.classList.add('quiet');box.append(start,alt);
  }
}

function best(mid,excludeDate){let volume=0,top=0;for(const[date,doc]of state.days){if(date===excludeDate)continue;const entry=doc.data.movements.find(item=>item.mid===mid);if(!entry||!logged(entry).length)continue;volume=Math.max(volume,entryVolume(entry));if(entry.kind==='weight')for(const set of logged(entry))top=Math.max(top,e1rm(set));}return{volume,top};}

// ---- saving -------------------------------------------------------------
function queue(date){if(!queues.has(date))queues.set(date,{generation:0,saved:0,busy:null,timer:null,maxTimer:null,error:null,retry:0});return queues.get(date);}
function markDirty(date){const doc=docFor(date),item=queue(date);item.generation++;item.error=item.error?.status===409?item.error:null;doc.updated_at=now();backup('days','put',JSON.parse(JSON.stringify(doc))).catch(()=>{});schedule(date);renderStatus();}
function schedule(date){const item=queue(date);clearTimeout(item.timer);item.timer=setTimeout(()=>persist(date),450);if(!item.maxTimer)item.maxTimer=setTimeout(()=>persist(date),1600);}
async function persist(date){const doc=docAt(date);if(!doc)return;const item=queue(date);clearTimeout(item.timer);clearTimeout(item.maxTimer);item.timer=item.maxTimer=null;if(item.busy)return item.busy;if(item.saved===item.generation||item.error?.status===409)return;const generation=item.generation,payload={data:doc.data,version:doc.version};
  item.busy=(async()=>{renderStatus();try{const saved=await api(`/api/days/${date}`,{method:'PUT',body:JSON.stringify(payload)});doc.version=saved.version;item.saved=generation;item.error=null;item.retry=0;if(item.generation===generation)await backup('days','delete',date).catch(()=>{});}catch(error){item.error=error;if(![401,409].includes(error.status)&&item.retry<4){item.retry++;item.timer=setTimeout(()=>persist(date),Math.min(30000,1500*2**item.retry));}}finally{item.busy=null;renderStatus();if(!item.error&&item.generation>generation)persist(date);}})();
  return item.busy;
}
export async function flushDays(){await Promise.all([...queues.keys()].map(date=>persist(date)));return [...queues.values()].every(item=>item.saved===item.generation);}
function renderStatus(){const failed=[...queues.values()].find(item=>item.error);const pending=[...queues.values()].some(item=>item.saved<item.generation||item.busy);const status=$('w-status');status.dataset.state=failed?'error':pending?'saving':'saved';status.textContent=failed?(failed.error.status===401?'Sign in again':'Save failed'):pending?'Saving…':'Saved';if(failed?.error.status===401)state.unauthorized?.();}

// ---- rendering ----------------------------------------------------------
function movementCard(entry,date){
  const section=el('section','mv');section.dataset.id=entry.id;
  const head=el('header','mv-head');
  const look=lookupLink(entry.name,'mv-look');
  const drop=el('button','mv-drop','×');drop.type='button';drop.dataset.act='drop-movement';drop.setAttribute('aria-label',`Remove ${entry.name}`);
  head.append(el('h3',null,entry.name),look,drop);
  const history=previous(entry.mid,date),record=best(entry.mid,date);
  const past=el('p','mv-prev');
  past.append(el('span','mv-prev-main',history?`Last ${shortDate(history.date)}: ${setsText(history.entry)} · ${volumeText(history.entry)}`:'First time logging this'));
  // Whatever you wrote about it last time comes back with it: "left shoulder twinged", "use the red band".
  if(text(history?.entry.note))past.append(el('span','mv-last-note',`Last note: ${text(history.entry.note)}`));
  if(record.volume>0)past.append(el('span','mv-pb',entry.kind==='weight'?`PB ${group(record.volume)} lb${record.top?` · ${fmt(record.top)} e1RM`:''}`:`PB ${group(record.volume)}${entry.kind==='body'?' reps':'s'}`));
  const slot=entry.plan&&slotOf(entry.plan.w,entry.plan.i);
  if(slot){
    const plan=el('div','mv-plan');
    const target=el('p','mv-target',targetText(slot));
    if(slot.options.length>1){const swap=el('button','mv-swap',`⇄ ${slot.options[(slot.options.findIndex(option=>slug(option)===entry.mid)+1)%slot.options.length]}`);swap.type='button';swap.dataset.act='swap-option';swap.title='Swap for the other option';target.append(swap);}
    plan.append(target,el('p','mv-step',progress(slot,entry.name,history&&{sets:logged(history.entry)}).text));
    const notes=[entry.plan.i===0?'Warm up first: 1–2 light sets.':'',noteFor(entry.name)].filter(Boolean);
    if(notes.length)plan.append(el('p','mv-note',notes.join(' ')));
    // A planned movement's first time is already spelled out in its next step.
    section.append(head);if(history)section.append(past);section.append(plan);
  }
  const fields=FIELDS[entry.kind]||FIELDS.weight;
  const grid=el('div','mv-grid');grid.style.setProperty('--cols',fields.length);
  grid.append(el('span','col-h'));
  for(const[,label]of fields)grid.append(el('span','col-h',label));
  grid.append(el('span','col-h'));
  for(const[index,set]of entry.sets.entries()){
    grid.append(el('span','set-n',String(index+1)));
    for(const[key,label,mode]of fields){
      const input=el('input','set-in'+(set.g?' ghost':''));input.value=set[key]??'';input.inputMode=mode;input.autocomplete='off';
      input.dataset.set=index;input.dataset.key=key;input.setAttribute('aria-label',`Set ${index+1} ${label}`);grid.append(input);
    }
    const remove=el('button','set-drop','×');remove.type='button';remove.dataset.act='drop-set';remove.dataset.set=index;remove.setAttribute('aria-label',`Remove set ${index+1}`);grid.append(remove);
  }
  const foot=el('div','mv-foot');
  const add=el('button','add-set','+ Set');add.type='button';add.dataset.act='add-set';
  const comment=el('textarea','mv-comment');comment.rows=2;comment.value=entry.note??'';comment.placeholder='How it felt, form cues, what to change next time';comment.setAttribute('aria-label',`Note on ${entry.name}`);comment.hidden=!text(entry.note);
  const noteButton=el('button','mv-note-btn','+ Note');noteButton.type='button';noteButton.dataset.act='open-note';noteButton.hidden=!comment.hidden;
  foot.append(add,noteButton,el('span','mv-total'));
  if(!slot)section.append(head,past);
  section.append(grid,foot,comment);
  refresh(section,entry,date);
  return section;
}
function refresh(section,entry,date){
  const history=previous(entry.mid,date),total=entryVolume(entry);
  const label=section.querySelector('.mv-total');label.replaceChildren();
  if(!total)return;
  label.append(el('span',null,volumeText(entry)));
  if(history){const delta=total-entryVolume(history.entry);if(delta>0)label.append(el('span','up',`+${group(delta)}`));else if(delta<0)label.append(el('span','down',group(delta)));}
}
function renderMeals(doc){
  const list=$('w-meals');list.replaceChildren();
  for(const[index,meal]of doc.data.meals.entries()){
    const row=el('div','meal-row');
    const name=el('input','meal-name');name.value=meal.name??'';name.placeholder='What you ate';name.dataset.meal=index;name.dataset.key='name';name.setAttribute('aria-label','Meal');
    const protein=el('input','meal-p');protein.value=meal.protein??'';protein.inputMode='numeric';protein.placeholder='g';protein.dataset.meal=index;protein.dataset.key='protein';protein.setAttribute('aria-label','Protein in grams');
    const cal=el('input','meal-p meal-cal');cal.value=meal.cal??'';cal.inputMode='numeric';cal.placeholder='cal';cal.dataset.meal=index;cal.dataset.key='cal';cal.setAttribute('aria-label','Calories');
    const drop=el('button','set-drop','×');drop.type='button';drop.dataset.act='drop-meal';drop.dataset.meal=index;drop.setAttribute('aria-label','Remove meal');
    row.append(name,protein,cal,drop);list.append(row);
  }
  const chips=el('div','chips');
  for(const meal of recentMeals(doc)){const chip=el('button','chip',[meal.name,num(meal.protein)?`${fmt(num(meal.protein))}g`:'',num(meal.cal)?`${group(num(meal.cal))} cal`:''].filter(Boolean).join(' · '));chip.type='button';chip.dataset.act='repeat-meal';chip.dataset.name=meal.name;chip.dataset.protein=meal.protein??'';chip.dataset.cal=meal.cal??'';chips.append(chip);}
  if(chips.childElementCount)list.append(chips);
}
function recentMeals(doc){
  const taken=new Set(doc.data.meals.map(meal=>(meal.name||'').toLowerCase()));const found=new Map();
  for(const date of [...state.days.keys()].sort().reverse()){if(date===doc.date)continue;
    for(const meal of state.days.get(date).data.meals||[]){const key=(meal.name||'').trim().toLowerCase();if(!key||taken.has(key)||found.has(key))continue;found.set(key,meal);if(found.size>=6)return[...found.values()];}}
  return [...found.values()];
}
function renderTotals(doc){
  const volume=dayVolume(doc),protein=dayProtein(doc),count=doc.data.movements.filter(entry=>logged(entry).length).length;
  const calories=dayCalories(doc),functional=focus()==='functional',active=Math.round(activeMinutes(doc)),distance=miles(doc);
  $('w-volume').textContent=functional
    ?([active?`${active} active min`:'',distance?`${fmt(distance)} mi`:'',count?`${count} movement${count===1?'':'s'}`:''].filter(Boolean).join(' · ')||'Nothing logged yet')
    :(count?`${count} movement${count===1?'':'s'} · ${group(volume)} lb`:'Nothing logged yet');
  const week=lastDays(doc.date,7);
  const weekText=functional
    ?[`${Math.round(week.reduce((sum,day)=>sum+activeMinutes(day),0))} active min`,`${fmt(week.reduce((sum,day)=>sum+miles(day),0))} mi`,`${week.reduce((sum,day)=>sum+yogaOf(day).length,0)} yoga`]
    :[`${week.reduce((sum,day)=>sum+workSets(day),0)} sets`,`${group(week.reduce((sum,day)=>sum+dayVolume(day),0))} lb`,`${week.filter(day=>workSets(day)>0).length} lifting days`];
  $('w-week').textContent=week.some(hasContent)?`Last 7 days: ${weekText.join(' · ')}`:'';
  const proteinText=`${group(protein)} g protein`,calorieText=calories?`${group(calories)} cal`:'';
  $('w-protein').textContent=(functional?[calorieText,proteinText]:[proteinText,calorieText]).filter(Boolean).join(' · ');
  for(const[index,item]of (doc.data.cardio||[]).entries()){const pace=$('w-cardio').querySelector(`[data-pace="${index}"]`);if(pace)pace.textContent=paceText(item);}
  const weight=num(doc.data.weight),last=previousWeight(doc.date),note=$('w-weight-prev');
  const parts=[];
  if(last){const delta=weight>0?weight-last.weight:0;parts.push(`Last ${shortDate(last.date)}: ${fmt(last.weight)} lb`+(delta?` (${delta>0?'+':''}${fmt(delta)})`:''));}
  const trend=weightTrend(doc.date);if(trend.avg)parts.push(`7-day avg ${fmt(trend.avg)}`+(trend.change?` (${trend.change>0?'+':''}${fmt(trend.change)} vs week before)`:''));
  note.textContent=parts.join(' · ');
}
// Cardio and yoga are short lists, one row per run, ride, or session.
function select(options,value,data){const box=el('select','daily-select');for(const[id,label]of options){const option=el('option',null,label);option.value=id;box.append(option);}box.value=value;Object.assign(box.dataset,data);return box;}
function numberBox(value,placeholder,mode,data,label){const input=el('input','daily-in');input.value=value??'';input.placeholder=placeholder;input.inputMode=mode;input.autocomplete='off';input.setAttribute('aria-label',label);Object.assign(input.dataset,data);return input;}
function dropButton(act,index,label){const drop=el('button','set-drop','×');drop.type='button';drop.dataset.act=act;drop.dataset.index=index;drop.setAttribute('aria-label',label);return drop;}
function renderCardio(doc){
  const list=$('w-cardio');list.replaceChildren();
  for(const[index,item]of doc.data.cardio.entries()){
    const row=el('div','cardio-row');
    row.append(select(CARDIO,item.type,{list:'cardio',index,key:'type'}),numberBox(item.mi,'0','decimal',{list:'cardio',index,key:'mi'},'Distance in miles'),el('span','daily-unit','mi'),numberBox(item.min,'0','decimal',{list:'cardio',index,key:'min'},'Time in minutes'),el('span','daily-unit','min'));
    const pace=el('span','cardio-pace',paceText(item));pace.dataset.pace=index;row.append(pace,dropButton('drop-cardio',index,'Remove this cardio'));
    list.append(row);
  }
}
function renderYoga(doc){
  const list=$('w-yoga');list.replaceChildren();
  for(const[index,item]of doc.data.yoga.entries()){
    const row=el('div','yoga-row');
    const note=el('input','yoga-note');note.value=item.note??'';note.placeholder='How it felt, what you worked on';note.dataset.list='yoga';note.dataset.index=index;note.dataset.key='note';note.setAttribute('aria-label','Yoga note');
    row.append(select(YOGA_STYLES.map(name=>[name,name]),item.style,{list:'yoga',index,key:'style'}),numberBox(item.min,'0','decimal',{list:'yoga',index,key:'min'},'Minutes'),el('span','daily-unit','min'),dropButton('drop-yoga',index,'Remove this session'),note);
    list.append(row);
  }
}
function renderFocus(){
  const current=focus();$('mode-workout').dataset.focus=current;
  for(const button of document.querySelectorAll('[data-focus-pick]'))button.setAttribute('aria-pressed',String(button.dataset.focusPick===current));
  for(const button of document.querySelectorAll('[data-plan-pick]'))button.setAttribute('aria-pressed',String((button.dataset.planPick==='on')===planOn()));
}
// The fields that are a single value per day, not a list: weight and the three check-ins.
function renderDaily(doc){for(const input of document.querySelectorAll('#w-day [data-path]')){const [head,key]=input.dataset.path.split('.');const value=key?doc.data[head]?.[key]:doc.data[head];input.value=value??'';}}
export function renderDay(){
  const doc=docFor(state.viewing);
  $('w-date').textContent=state.viewing===dayKey()?'Today':longDate(state.viewing);
  $('w-subdate').textContent=state.viewing===dayKey()?longDate(state.viewing):'';
  $('w-next').disabled=state.viewing>=dayKey();
  renderPlan(doc);
  const list=$('w-movements');list.replaceChildren();
  for(const entry of doc.data.movements)list.append(movementCard(entry,state.viewing));
  if(!doc.data.movements.length&&$('w-plan').hidden)list.append(el('p','empty','No movements yet. Add the first one below.'));
  renderFocus();renderMeals(doc);renderCardio(doc);renderYoga(doc);renderDaily(doc);renderTotals(doc);renderStatus();
}
const meals=doc=>doc.data.meals.some(mealLogged);
function renderHistory(){
  const list=$('w-history-list');list.replaceChildren();
  const days=[...state.days.values()].filter(hasContent).sort((a,b)=>b.date.localeCompare(a.date));
  for(const doc of days){
    const item=el('button','day-card');item.type='button';item.dataset.act='open-day';item.dataset.date=doc.date;
    item.append(el('strong',null,shortDate(doc.date)));
    const names=doc.data.movements.filter(entry=>logged(entry).length).map(entry=>entry.name);
    const activities=[...new Set(cardioOf(doc).map(item=>cardioName(item.type)))].concat(hasYoga(doc)?['Yoga']:[]);
    item.append(el('p',null,[...activities,...names].join(', ')||[meals(doc)&&'Food',num(doc.data.weight)>0&&'Weigh-in',hasMood(doc)&&'Mood'].filter(Boolean).join(', ')));
    const volume=dayVolume(doc),protein=dayProtein(doc),calories=dayCalories(doc),weight=num(doc.data.weight),distance=miles(doc),active=Math.round(activeMinutes(doc));
    item.append(el('small',null,[weight?`${fmt(weight)} lb body`:'',volume?`${group(volume)} lb lifted`:'',distance?`${fmt(distance)} mi`:'',active?`${active} active min`:'',protein?`${group(protein)} g protein`:'',calories?`${group(calories)} cal`:''].filter(Boolean).join(' · ')));
    list.append(item);
  }
  if(!days.length)list.append(el('p','empty','Nothing logged yet.'));
}

// ---- panes --------------------------------------------------------------
const PANES={day:'w-day',history:'w-history',body:'w-body'};
function showPane(name){
  for(const[pane,id]of Object.entries(PANES))$(id).hidden=pane!==name;
  if(name!=='body')closeBody();
}

// ---- the movement picker ------------------------------------------------
function knownMovements(){
  const all=new Map(CATALOGUE.map(movement=>[movement.id,movement]));
  for(const doc of state.days.values())for(const entry of doc.data.movements)if(!all.has(entry.mid))all.set(entry.mid,{id:entry.mid,name:entry.name,group:entry.group||'custom',groupName:'Yours',kind:entry.kind});
  return all;
}
function usage(){const counts=new Map();for(const doc of state.days.values())for(const entry of doc.data.movements)if(logged(entry).length)counts.set(entry.mid,(counts.get(entry.mid)||0)+1);return counts;}
function pickerRow(movement,showGroup){
  const row=el('div','pick-row');
  const choose=el('button','pick-name');choose.type='button';choose.dataset.act='pick';choose.dataset.mid=movement.id;
  choose.append(el('span',null,movement.name));
  if(showGroup&&movement.groupName)choose.append(el('small',null,movement.groupName));
  row.append(choose,lookupLink(movement.name,'pick-look'));return row;
}
function section(title,movements,showGroup=false){const wrap=el('div','pick-group');wrap.append(el('h4',null,title));for(const movement of movements)wrap.append(pickerRow(movement,showGroup));return wrap;}
// Functional focus leads with whole-body work and yoga; hypertrophy keeps the muscle-by-muscle order.
const FUNCTIONAL_ORDER=['functional','yoga','core','glutes','quads','hamstrings','back','shoulders','chest','calves','biceps','triceps','forearms'];
function renderPicker(term='',only=null){
  const list=$('w-picker-list');list.replaceChildren();
  const all=knownMovements(),query=term.trim().toLowerCase();
  if(query){
    // Every word has to appear somewhere, in any order, so "barbell overhead press" finds Overhead Press.
    const words=query.split(/\s+/).filter(Boolean);
    const matches=[...all.values()].filter(movement=>{const hay=searchText(movement.name);return words.every(word=>hay.includes(word));}).sort((a,b)=>a.name.localeCompare(b.name));
    if(matches.length)list.append(section(`${matches.length} match${matches.length===1?'':'es'}`,matches,true));
    if(!matches.some(movement=>movement.name.toLowerCase()===query)){
      const custom=el('button','pick-custom',`Add “${term.trim()}” as a new movement`);custom.type='button';custom.dataset.act='pick-custom';list.append(custom);
    }
    return;
  }
  const counts=usage();
  const recent=[...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([mid])=>all.get(mid)).filter(movement=>movement&&(!only||movement.group===only)).slice(0,8);
  if(recent.length)list.append(section('Most used',recent,true));
  // Everything that goes on a barbell, together: the whole home gym in one place.
  if(!only)list.append(section('Barbell',CATALOGUE.filter(movement=>BARBELL.has(movement.name)).sort((a,b)=>a.name.localeCompare(b.name)),true));
  const groups=only?GROUPS.filter(item=>item.id===only):focus()==='functional'?[...GROUPS].sort((a,b)=>FUNCTIONAL_ORDER.indexOf(a.id)-FUNCTIONAL_ORDER.indexOf(b.id)):GROUPS;
  for(const item of groups)list.append(section(item.name,item.movements.map(name=>all.get(slug(name))).filter(Boolean)));
}
function addMovement(movement){
  const doc=docFor(state.viewing);
  if(doc.data.movements.some(entry=>entry.mid===movement.id)){toast(`${movement.name} is already in this day.`);return;}
  const history=previous(movement.id,state.viewing);
  // Start from last time's numbers so the question is "can I beat this", not "what did I do".
  const sets=history?history.entry.sets.filter(set=>movement.kind==='time'?num(set.sec)>0:num(set.r)>0).map(set=>({...set,rir:'',g:1})):[blank(movement.kind)];
  doc.data.movements.push({id:crypto.randomUUID(),mid:movement.id,name:movement.name,group:movement.group,kind:movement.kind,sets:sets.length?sets:[blank(movement.kind)]});
  markDirty(state.viewing);renderDay();
  $('w-movements').lastElementChild?.scrollIntoView({block:'nearest',behavior:'smooth'});
}

// ---- clipboard ----------------------------------------------------------
export function dayText(doc,{previous:withPrevious=true}={}){
  const lines=[longDate(doc.date)+`, ${asDate(doc.date).getFullYear()}`];
  if(doc.data.plan)lines.push(`Plan: workout ${doc.data.plan} (${PLAN.name})`);
  if(num(doc.data.weight)>0)lines.push(`Morning weight: ${fmt(num(doc.data.weight))} lb`);
  const done=doc.data.movements.filter(entry=>logged(entry).length);
  if(done.length){
    lines.push('','WORKOUT');
    for(const entry of done){
      lines.push(`${entry.name} — ${setsText(entry,true)} · ${volumeText(entry)}`);
      if(text(entry.note))lines.push(`  note: ${text(entry.note).replace(/\s*\n\s*/g,' / ')}`);
      const history=withPrevious&&previous(entry.mid,doc.date);
      if(history){const delta=entryVolume(entry)-entryVolume(history.entry);lines.push(`  prev ${shortDate(history.date)} — ${setsText(history.entry)} · ${volumeText(history.entry)}${delta?` (${delta>0?'+':''}${group(delta)})`:''}`);}
    }
    const volume=dayVolume(doc);if(volume)lines.push(`Day volume: ${group(volume)} lb`);
  }
  if(hasCardio(doc))lines.push('','CARDIO',...cardioOf(doc).map(cardioText));
  if(hasYoga(doc))lines.push('','YOGA',...yogaOf(doc).map(yogaText));
  const meals=doc.data.meals.filter(mealLogged);
  if(meals.length){
    lines.push('','FOOD');
    for(const meal of meals){const facts=[num(meal.protein)?`${fmt(num(meal.protein))} g protein`:'',num(meal.cal)?`${group(num(meal.cal))} cal`:''].filter(Boolean).join(' · ');lines.push(`${meal.name||'Meal'}${facts?` — ${facts}`:''}`);}
    lines.push(`Total protein: ${group(dayProtein(doc))} g`);
    if(dayCalories(doc))lines.push(`Total calories: ${group(dayCalories(doc))}`);
  }
  if(hasMood(doc)){lines.push('','MOOD');for(const[key,label]of MOODS){const entry=text(doc.data.mood?.[key]);if(entry)lines.push(`${label}: ${entry}`);}}
  if(doc.data.note?.trim())lines.push('','NOTES',doc.data.note.trim());
  return lines.join('\n');
}
// The whole log, oldest first. Each day already sits beside the one before it, so the "prev" lines would only repeat it.
export function allDaysText(docs){
  const days=[...docs].sort((a,b)=>a.date.localeCompare(b.date));
  if(!days.length)return '';
  const span=key=>new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(asDate(key));
  const head=`TRAINING LOG — ${days.length} ${days.length===1?'day':'days'}, ${span(days[0].date)} to ${span(days.at(-1).date)}`;
  return head+'\n\n'+days.map(doc=>dayText(doc,{previous:false})).join('\n\n----------\n\n');
}
async function copy(text){
  try{await navigator.clipboard.writeText(text);return true;}
  catch{const area=el('textarea');area.value=text;area.style.cssText='position:fixed;top:0;opacity:0';document.body.append(area);area.select();const ok=document.execCommand('copy');area.remove();return ok;}
}

// ---- wiring -------------------------------------------------------------
function editSet(target){
  const doc=docFor(state.viewing),section=target.closest('.mv');
  const entry=doc.data.movements.find(item=>item.id===section.dataset.id);if(!entry)return;
  const set=entry.sets[Number(target.dataset.set)];if(!set)return;
  set[target.dataset.key]=target.value.trim();
  if(set.g){delete set.g;target.closest('.mv').querySelectorAll('.set-in.ghost').forEach(input=>input.classList.remove('ghost'));for(const item of entry.sets)delete item.g;}
  markDirty(state.viewing);refresh(section,entry,state.viewing);renderTotals(doc);if(entry.plan)renderPlan(doc);
}
export function initWorkout({onUnauthorized}={}){
  state.unauthorized=onUnauthorized;state.viewing=dayKey();
  // Tapping a movement under a muscle puts it on today's page, which is the whole point of
  // showing it there: the body answers "what should I train", the day answers "with what".
  initBody({days:()=>state.days,dayTime,addMovement:mid=>{
    const movement=knownMovements().get(mid);if(!movement)return;
    if(state.viewing!==dayKey())state.viewing=dayKey();
    showPane('day');renderDay();addMovement(movement);
  }});
  $('w-movements').addEventListener('input',event=>{
    if(event.target.classList.contains('set-in'))editSet(event.target);
    if(event.target.classList.contains('mv-comment')){const entry=docFor(state.viewing).data.movements.find(item=>item.id===event.target.closest('.mv').dataset.id);if(!entry)return;entry.note=event.target.value;markDirty(state.viewing);}
  });
  $('w-movements').addEventListener('click',event=>{
    const action=event.target.dataset.act;if(!action)return;
    if(action==='open-note'){const section=event.target.closest('.mv'),box=section.querySelector('.mv-comment');event.target.hidden=true;box.hidden=false;box.focus();return;}
    const doc=docFor(state.viewing),section=event.target.closest('.mv');
    const entry=doc.data.movements.find(item=>item.id===section.dataset.id);if(!entry)return;
    if(action==='add-set'){const last=entry.sets[entry.sets.length-1];entry.sets.push(last?{...last,rir:''}:blank(entry.kind));for(const set of entry.sets)delete set.g;}
    if(action==='drop-set')entry.sets.splice(Number(event.target.dataset.set),1);
    if(action==='drop-movement')doc.data.movements.splice(doc.data.movements.indexOf(entry),1);
    if(action==='swap-option'&&!swapOption(entry))return;
    if(action==='drop-set'&&!entry.sets.length)entry.sets.push(blank(entry.kind));
    markDirty(state.viewing);renderDay();
  });
  $('w-meals').addEventListener('input',event=>{
    const index=event.target.dataset.meal;if(index===undefined)return;
    const doc=docFor(state.viewing);doc.data.meals[Number(index)][event.target.dataset.key]=event.target.value.trim();
    markDirty(state.viewing);renderTotals(doc);
  });
  $('w-meals').addEventListener('click',event=>{
    const action=event.target.dataset.act,doc=docFor(state.viewing);
    if(action==='drop-meal')doc.data.meals.splice(Number(event.target.dataset.meal),1);
    else if(action==='repeat-meal')doc.data.meals.push({name:event.target.dataset.name,protein:event.target.dataset.protein,cal:event.target.dataset.cal});
    else return;
    markDirty(state.viewing);renderDay();
  });
  $('w-day').addEventListener('input',event=>{
    const path=event.target.dataset?.path;if(!path)return;
    const doc=docFor(state.viewing),[head,key]=path.split('.'),value=event.target.tagName==='TEXTAREA'?event.target.value:event.target.value.trim();
    if(key){if(!doc.data[head]||typeof doc.data[head]!=='object')doc.data[head]={};doc.data[head][key]=value;}else doc.data[head]=value;
    markDirty(state.viewing);renderTotals(doc);
  });
  // Cardio and yoga rows: edit in place, so the keyboard stays where it is.
  for(const id of ['w-cardio','w-yoga'])$(id).addEventListener('input',event=>{
    const {list,index,key}=event.target.dataset;if(!list)return;
    const doc=docFor(state.viewing),item=doc.data[list][Number(index)];if(!item)return;
    item[key]=event.target.tagName==='INPUT'?event.target.value.trim():event.target.value;
    markDirty(state.viewing);renderTotals(doc);
  });
  for(const id of ['w-cardio','w-yoga'])$(id).addEventListener('click',event=>{
    const act=event.target.dataset.act;if(act!=='drop-cardio'&&act!=='drop-yoga')return;
    const doc=docFor(state.viewing);doc.data[act==='drop-cardio'?'cardio':'yoga'].splice(Number(event.target.dataset.index),1);
    markDirty(state.viewing);renderDay();
  });
  $('w-cardio-add').addEventListener('click',event=>{
    const type=event.target.closest('[data-cardio]')?.dataset.cardio;if(!type)return;
    const doc=docFor(state.viewing);doc.data.cardio.push({type,mi:'',min:''});markDirty(state.viewing);renderDay();
    $('w-cardio').lastElementChild?.querySelector('input')?.focus();
  });
  $('w-yoga-add').addEventListener('click',()=>{
    const doc=docFor(state.viewing),last=[...state.days.values()].filter(day=>day.date<state.viewing).sort((a,b)=>b.date.localeCompare(a.date)).flatMap(day=>day.data.yoga||[])[0];
    doc.data.yoga.push({style:last?.style||'Flow',min:'',note:''});markDirty(state.viewing);renderDay();
    $('w-yoga').lastElementChild?.querySelector('input')?.focus();
  });
  $('w-yoga-pose').addEventListener('click',()=>{$('w-search').value='';renderPicker('','yoga');$('w-picker').showModal();});
  for(const button of document.querySelectorAll('[data-focus-pick]'))button.addEventListener('click',()=>{
    const doc=settingsDoc();if(doc.data.focus===button.dataset.focusPick)return;
    doc.data.focus=button.dataset.focusPick;markDirty(SETTINGS_DATE);renderDay();
    toast(`${FOCUSES[doc.data.focus]} focus. Everything is still here; this just changes what comes first.`);
  });
  $('w-plan').addEventListener('click',event=>{const button=event.target.closest('[data-act="start-plan"]');if(button)startWorkout(button.dataset.letter);});
  for(const button of document.querySelectorAll('[data-plan-pick]'))button.addEventListener('click',()=>{
    const doc=settingsDoc(),on=button.dataset.planPick==='on';if(planOn()===on)return;
    doc.data.plan=on;markDirty(SETTINGS_DATE);renderDay();
    toast(on?`Following ${PLAN.name}. Today's page shows what to do.`:'Plan off. Days are logged freely, as before.');
  });
  $('w-add-meal').addEventListener('click',()=>{const doc=docFor(state.viewing);doc.data.meals.push({name:'',protein:'',cal:''});markDirty(state.viewing);renderDay();$('w-meals').querySelector('.meal-row:last-of-type .meal-name')?.focus();});
  $('w-prev').addEventListener('click',()=>{state.viewing=shiftDay(state.viewing,-1);renderDay();});
  $('w-next').addEventListener('click',()=>{if(state.viewing<dayKey()){state.viewing=shiftDay(state.viewing,1);renderDay();}});
  $('w-date').addEventListener('click',()=>{state.viewing=dayKey();renderDay();});
  $('w-add').addEventListener('click',()=>{$('w-search').value='';renderPicker('');$('w-picker').showModal();});
  $('w-picker-close').addEventListener('click',()=>$('w-picker').close());
  $('w-search').addEventListener('input',event=>renderPicker(event.target.value));
  $('w-picker-list').addEventListener('click',event=>{
    const action=event.target.closest('[data-act]')?.dataset.act;
    if(action==='pick'){const movement=knownMovements().get(event.target.closest('[data-act]').dataset.mid);$('w-picker').close();addMovement(movement);}
    if(action==='pick-custom'){const name=$('w-search').value.trim();if(!name)return;$('w-picker').close();addMovement({id:slug(name),name,group:'custom',kind:'weight'});}
  });
  $('w-history-open').addEventListener('click',()=>{renderHistory();showPane('history');});
  $('w-history-close').addEventListener('click',()=>showPane('day'));
  $('w-body-open').addEventListener('click',()=>{showPane('body');openBody();});
  $('w-body-close').addEventListener('click',()=>showPane('day'));
  $('w-history-list').addEventListener('click',event=>{
    const card=event.target.closest('[data-act="open-day"]');if(!card)return;
    state.viewing=card.dataset.date;showPane('day');renderDay();
  });
  $('w-copy-all').addEventListener('click',async()=>{
    const days=[...state.days.values()].filter(hasContent);
    if(!days.length){toast('Nothing logged yet.');return;}
    toast(await copy(allDaysText(days))?`${days.length} ${days.length===1?'day':'days'} copied. Paste it anywhere.`:'Copying was blocked. Select the text manually.');
  });
  $('w-copy').addEventListener('click',async()=>{
    const doc=docFor(state.viewing);
    if(!hasContent(doc)){toast('Nothing logged for this day yet.');return;}
    toast(await copy(dayText(doc))?'Day copied. Paste it anywhere.':'Copying was blocked. Select the text manually.');
  });
  $('w-status').addEventListener('click',()=>{for(const[date,item]of queues)if(item.error?.status!==409){item.error=null;item.retry=0;persist(date);}flushDays();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)flushDays();});
  window.addEventListener('online',()=>{for(const[date,item]of queues)if(item.error&&![401,409].includes(item.error.status)){item.error=null;item.retry=0;persist(date);}});
}
export async function loadWorkout(){
  if(state.loaded){renderDay();return;}
  const days=await api('/api/days');
  state.days=new Map(days.map(day=>[day.date,{date:day.date,data:day.date===SETTINGS_DATE?(day.data||{}):normalizeDay(day.data||{}),version:day.version,updated_at:day.updated_at}]));
  state.settings=state.days.get(SETTINGS_DATE)||null;
  const recovered=await backup('days','getAll').catch(()=>[]);
  for(const draft of recovered){
    if(draft.date!==SETTINGS_DATE)normalizeDay(draft.data);
    const cloud=state.days.get(draft.date);
    if(cloud&&JSON.stringify(cloud.data)===JSON.stringify(draft.data)){await backup('days','delete',draft.date).catch(()=>{});continue;}
    if(cloud&&cloud.version!==draft.version)continue; // The server moved on; keep its copy.
    state.days.set(draft.date,draft);queue(draft.date).generation=1;schedule(draft.date);
  }
  state.settings=state.days.get(SETTINGS_DATE)||state.settings;state.days.delete(SETTINGS_DATE);
  state.loaded=true;
  // A session left open overnight should roll to the new day on its own.
  if(state.viewing&&state.viewing<dayKey()&&!hasContent(docFor(state.viewing)))state.viewing=dayKey();
  renderDay();
}
