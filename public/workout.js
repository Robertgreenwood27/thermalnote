import { $, api, toast, backup, now } from './core.js';
import { GROUPS, CATALOGUE, byId, slug, imageSearch } from './movements.js';
import { initBody, openBody, closeBody } from './body.js';
// A training day runs 4am to 4am, so a late-night session lands on the day it belonged to.
const DAY_START=4;
const FIELDS={weight:[['w','lb','decimal'],['r','reps','numeric'],['rir','RIR','numeric']],body:[['r','reps','numeric'],['w','+lb','decimal'],['rir','RIR','numeric']],time:[['sec','sec','numeric']]};
const state={days:new Map(),viewing:null,loaded:false,unauthorized:null};
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
function docFor(date){if(!state.days.has(date))state.days.set(date,{date,data:{movements:[],meals:[],note:''},version:0,updated_at:now()});const doc=state.days.get(date);doc.data.movements||=[];doc.data.meals||=[];return doc;}
// Everything outside lifting is optional and allowed to stay blank: a ride of 0, a forgotten weigh-in, a skipped check-in.
const MOODS=[['morning','Morning','First thing'],['noon','Midday','Around noon'],['night','Bedtime','Before bed']];
const text=value=>typeof value==='string'?value.trim():'';
const rideOf=doc=>({mi:num(doc.data.ride?.mi),min:num(doc.data.ride?.min)});
const hasRide=doc=>{const ride=rideOf(doc);return ride.mi>0||ride.min>0;};
const hasMood=doc=>MOODS.some(([key])=>text(doc.data.mood?.[key]));
const mealLogged=meal=>text(meal.name)||num(meal.protein)>0||num(meal.cal)>0;
const logged=entry=>entry.sets.filter(set=>entry.kind==='time'?num(set.sec)>0:num(set.r)>0);
const hasContent=doc=>doc.data.movements.some(entry=>logged(entry).length)||doc.data.meals.some(mealLogged)||num(doc.data.weight)>0||hasRide(doc)||hasMood(doc);

// ---- metrics ------------------------------------------------------------
const setVolume=(set,kind)=>kind==='time'?num(set.sec):kind==='body'?num(set.r):num(set.w)*num(set.r);
export const entryVolume=entry=>logged(entry).reduce((sum,set)=>sum+setVolume(set,entry.kind),0);
// Epley. Only meaningful when an external load is on the bar.
const e1rm=set=>num(set.w)>0&&num(set.r)>0?num(set.w)*(1+num(set.r)/30):0;
const dayVolume=doc=>doc.data.movements.filter(entry=>entry.kind==='weight').reduce((sum,entry)=>sum+entryVolume(entry),0);
const dayProtein=doc=>doc.data.meals.reduce((sum,meal)=>sum+num(meal.protein),0);
const dayCalories=doc=>doc.data.meals.reduce((sum,meal)=>sum+num(meal.cal),0);
const speed=ride=>ride.mi>0&&ride.min>0?ride.mi/(ride.min/60):0;
function rideText(ride){const parts=[];if(ride.mi>0)parts.push(`${fmt(ride.mi)} mi`);if(ride.min>0)parts.push(`${fmt(ride.min)} min`);const mph=speed(ride);return parts.join(' in ')+(mph?` · ${fmt(mph)} mph`:'');}
function previousWeight(beforeDate){const dates=[...state.days.keys()].filter(date=>date<beforeDate).sort().reverse();for(const date of dates){const weight=num(state.days.get(date).data.weight);if(weight>0)return{date,weight};}return null;}
export function volumeText(entry){const total=entryVolume(entry);if(!total)return '';return entry.kind==='time'?`${Math.floor(total/60)}:${String(Math.round(total%60)).padStart(2,'0')}`:entry.kind==='body'?`${group(total)} reps`:`${group(total)} lb`;}
function setText(set,kind){if(kind==='time')return `${fmt(num(set.sec))}s`;if(kind==='body')return num(set.w)>0?`+${fmt(num(set.w))}×${fmt(num(set.r))}`:`${fmt(num(set.r))}`;return `${fmt(num(set.w))}×${fmt(num(set.r))}`;}
// Consecutive identical sets collapse: "30×10 ×3" rather than the same thing three times.
export function setsText(entry,withRir=false){const parts=[];for(const set of logged(entry)){const label=setText(set,entry.kind)+(withRir&&set.rir!==''&&set.rir!=null?` RIR${fmt(num(set.rir))}`:'');const last=parts[parts.length-1];if(last&&last.label===label)last.count++;else parts.push({label,count:1});}return parts.map(part=>part.count>1?`${part.label} ×${part.count}`:part.label).join(', ');}
function previous(mid,beforeDate){const dates=[...state.days.keys()].filter(date=>date<beforeDate).sort().reverse();for(const date of dates){const entry=state.days.get(date).data.movements.find(item=>item.mid===mid);if(entry&&logged(entry).length)return{date,entry};}return null;}
function best(mid,excludeDate){let volume=0,top=0;for(const[date,doc]of state.days){if(date===excludeDate)continue;const entry=doc.data.movements.find(item=>item.mid===mid);if(!entry||!logged(entry).length)continue;volume=Math.max(volume,entryVolume(entry));if(entry.kind==='weight')for(const set of logged(entry))top=Math.max(top,e1rm(set));}return{volume,top};}

// ---- saving -------------------------------------------------------------
function queue(date){if(!queues.has(date))queues.set(date,{generation:0,saved:0,busy:null,timer:null,maxTimer:null,error:null,retry:0});return queues.get(date);}
function markDirty(date){const doc=docFor(date),item=queue(date);item.generation++;item.error=item.error?.status===409?item.error:null;doc.updated_at=now();backup('days','put',JSON.parse(JSON.stringify(doc))).catch(()=>{});schedule(date);renderStatus();}
function schedule(date){const item=queue(date);clearTimeout(item.timer);item.timer=setTimeout(()=>persist(date),450);if(!item.maxTimer)item.maxTimer=setTimeout(()=>persist(date),1600);}
async function persist(date){const doc=state.days.get(date);if(!doc)return;const item=queue(date);clearTimeout(item.timer);clearTimeout(item.maxTimer);item.timer=item.maxTimer=null;if(item.busy)return item.busy;if(item.saved===item.generation||item.error?.status===409)return;const generation=item.generation,payload={data:doc.data,version:doc.version};
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
  if(record.volume>0)past.append(el('span','mv-pb',entry.kind==='weight'?`PB ${group(record.volume)} lb${record.top?` · ${fmt(record.top)} e1RM`:''}`:`PB ${group(record.volume)}${entry.kind==='body'?' reps':'s'}`));
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
  foot.append(add,el('span','mv-total'));
  section.append(head,past,grid,foot);
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
  $('w-volume').textContent=count?`${count} movement${count===1?'':'s'} · ${group(volume)} lb`:'Nothing logged yet';
  const calories=dayCalories(doc);$('w-protein').textContent=`${group(protein)} g protein`+(calories?` · ${group(calories)} cal`:'');
  const ride=rideOf(doc),mph=speed(ride);$('w-ride-speed').textContent=mph?`${fmt(mph)} mph`:'';
  const weight=num(doc.data.weight),last=previousWeight(doc.date),note=$('w-weight-prev');
  if(last){const delta=weight>0?weight-last.weight:0;note.textContent=`Last ${shortDate(last.date)}: ${fmt(last.weight)} lb`+(delta?` (${delta>0?'+':''}${fmt(delta)})`:'');}else note.textContent='';
}
// The fields that are a single value per day, not a list: weight, the ride, and the three check-ins.
function renderDaily(doc){for(const input of document.querySelectorAll('#w-day [data-path]')){const [head,key]=input.dataset.path.split('.');const value=key?doc.data[head]?.[key]:doc.data[head];input.value=value??'';}}
export function renderDay(){
  const doc=docFor(state.viewing);
  $('w-date').textContent=state.viewing===dayKey()?'Today':longDate(state.viewing);
  $('w-subdate').textContent=state.viewing===dayKey()?longDate(state.viewing):'';
  $('w-next').disabled=state.viewing>=dayKey();
  const list=$('w-movements');list.replaceChildren();
  for(const entry of doc.data.movements)list.append(movementCard(entry,state.viewing));
  if(!doc.data.movements.length)list.append(el('p','empty','No movements yet. Add the first one below.'));
  renderMeals(doc);renderDaily(doc);renderTotals(doc);renderStatus();
}
const meals=doc=>doc.data.meals.some(mealLogged);
function renderHistory(){
  const list=$('w-history-list');list.replaceChildren();
  const days=[...state.days.values()].filter(hasContent).sort((a,b)=>b.date.localeCompare(a.date));
  for(const doc of days){
    const item=el('button','day-card');item.type='button';item.dataset.act='open-day';item.dataset.date=doc.date;
    item.append(el('strong',null,shortDate(doc.date)));
    const names=doc.data.movements.filter(entry=>logged(entry).length).map(entry=>entry.name);
    item.append(el('p',null,names.join(', ')||[hasRide(doc)&&'Ride',meals(doc)&&'Food',num(doc.data.weight)>0&&'Weigh-in',hasMood(doc)&&'Mood'].filter(Boolean).join(', ')));
    const volume=dayVolume(doc),protein=dayProtein(doc),calories=dayCalories(doc),ride=rideOf(doc),weight=num(doc.data.weight);
    item.append(el('small',null,[weight?`${fmt(weight)} lb body`:'',volume?`${group(volume)} lb lifted`:'',ride.mi?`${fmt(ride.mi)} mi ride`:ride.min?`${fmt(ride.min)} min ride`:'',protein?`${group(protein)} g protein`:'',calories?`${group(calories)} cal`:''].filter(Boolean).join(' · ')));
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
function renderPicker(term=''){
  const list=$('w-picker-list');list.replaceChildren();
  const all=knownMovements(),query=term.trim().toLowerCase();
  if(query){
    const matches=[...all.values()].filter(movement=>movement.name.toLowerCase().includes(query)).sort((a,b)=>a.name.localeCompare(b.name));
    if(matches.length)list.append(section(`${matches.length} match${matches.length===1?'':'es'}`,matches,true));
    if(!matches.some(movement=>movement.name.toLowerCase()===query)){
      const custom=el('button','pick-custom',`Add “${term.trim()}” as a new movement`);custom.type='button';custom.dataset.act='pick-custom';list.append(custom);
    }
    return;
  }
  const counts=usage();
  const recent=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([mid])=>all.get(mid)).filter(Boolean);
  if(recent.length)list.append(section('Most used',recent,true));
  for(const item of GROUPS)list.append(section(item.name,item.movements.map(name=>all.get(slug(name))).filter(Boolean)));
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
  if(num(doc.data.weight)>0)lines.push(`Morning weight: ${fmt(num(doc.data.weight))} lb`);
  const done=doc.data.movements.filter(entry=>logged(entry).length);
  if(done.length){
    lines.push('','WORKOUT');
    for(const entry of done){
      lines.push(`${entry.name} — ${setsText(entry,true)} · ${volumeText(entry)}`);
      const history=withPrevious&&previous(entry.mid,doc.date);
      if(history){const delta=entryVolume(entry)-entryVolume(history.entry);lines.push(`  prev ${shortDate(history.date)} — ${setsText(history.entry)} · ${volumeText(history.entry)}${delta?` (${delta>0?'+':''}${group(delta)})`:''}`);}
    }
    const volume=dayVolume(doc);if(volume)lines.push(`Day volume: ${group(volume)} lb`);
  }
  if(hasRide(doc))lines.push('','RIDE',rideText(rideOf(doc)));
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
  markDirty(state.viewing);refresh(section,entry,state.viewing);renderTotals(doc);
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
  $('w-movements').addEventListener('input',event=>{if(event.target.classList.contains('set-in'))editSet(event.target);});
  $('w-movements').addEventListener('click',event=>{
    const action=event.target.dataset.act;if(!action)return;
    const doc=docFor(state.viewing),section=event.target.closest('.mv');
    const entry=doc.data.movements.find(item=>item.id===section.dataset.id);if(!entry)return;
    if(action==='add-set'){const last=entry.sets[entry.sets.length-1];entry.sets.push(last?{...last,rir:''}:blank(entry.kind));for(const set of entry.sets)delete set.g;}
    if(action==='drop-set')entry.sets.splice(Number(event.target.dataset.set),1);
    if(action==='drop-movement')doc.data.movements.splice(doc.data.movements.indexOf(entry),1);
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
  state.days=new Map(days.map(day=>[day.date,{date:day.date,data:day.data||{movements:[],meals:[]},version:day.version,updated_at:day.updated_at}]));
  const recovered=await backup('days','getAll').catch(()=>[]);
  for(const draft of recovered){
    const cloud=state.days.get(draft.date);
    if(cloud&&JSON.stringify(cloud.data)===JSON.stringify(draft.data)){await backup('days','delete',draft.date).catch(()=>{});continue;}
    if(cloud&&cloud.version!==draft.version)continue; // The server moved on; keep its copy.
    state.days.set(draft.date,draft);queue(draft.date).generation=1;schedule(draft.date);
  }
  state.loaded=true;
  // A session left open overnight should roll to the new day on its own.
  if(state.viewing&&state.viewing<dayKey()&&!hasContent(docFor(state.viewing)))state.viewing=dayKey();
  renderDay();
}
