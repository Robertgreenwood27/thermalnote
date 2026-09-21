// The Body pane. It turns logged training days into muscle heat, hands that to the 3D view,
// and turns a tapped muscle back into movements that can be added to today. The 3D module is
// imported only when the pane is first opened, so nobody downloads a body they never look at.
import { $ } from './core.js';
import { muscleById, muscleForPart, targetsOf, movementsForMuscle } from './muscles.js';
import { SECONDARY_SHARE, effortOf, muscleHeat, heatLabel, daysAgoText } from './recovery.js';

const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
const state={view:null,loading:null,hooks:null,selected:null,heats:new Map()};

// One session per logged movement per day: which muscles it worked and how hard. This is the
// only place the shape of a training day meets the muscle map, so changing either is local.
export function sessionsFrom(days,dayTime){
  const sessions=[];
  for(const doc of days.values()){
    for(const entry of doc.data.movements||[]){
      const sets=(entry.sets||[]).filter(set=>entry.kind==='time'?parseFloat(set.sec)>0:parseFloat(set.r)>0).length;
      if(!sets)continue;
      const targets=targetsOf(entry.mid);
      if(!targets.primary.length&&!targets.secondary.length)continue; // A movement added by hand, not yet mapped.
      const effort=effortOf(sets),muscles={};
      for(const id of targets.primary)muscles[id]=Math.max(muscles[id]||0,effort);
      for(const id of targets.secondary)muscles[id]=Math.max(muscles[id]||0,effort*SECONDARY_SHARE);
      sessions.push({mid:entry.mid,name:entry.name,date:doc.date,sets,at:dayTime(doc.date),muscles});
    }
  }
  return sessions;
}

function recompute(){
  state.heats=muscleHeat(sessionsFrom(state.hooks.days(),state.hooks.dayTime));
  state.view?.paint(new Map([...state.heats].map(([id,value])=>[id,value.heat])));
}

function movementButton(movement,role){
  const button=el('button','body-move');button.type='button';button.dataset.mid=movement.id;
  button.append(el('span',null,movement.name));
  if(role)button.append(el('small',null,role));
  return button;
}

function renderOverview(){
  const panel=$('w-body-panel');panel.replaceChildren();
  const warm=[...state.heats.entries()].filter(([,value])=>value.heat>=0.04).sort((a,b)=>b[1].heat-a[1].heat).slice(0,6);
  panel.append(el('p','body-hint',warm.length?'Tap a muscle to see what trains it.':'Nothing is warm yet. Log a movement and the muscles it trained turn red.'));
  if(!warm.length)return;
  const list=el('div','body-ranking');
  for(const[id,value]of warm){
    const row=el('button','body-rank');row.type='button';row.dataset.muscle=id;
    row.append(el('span','body-rank-name',muscleById.get(id)?.name||id));
    const bar=el('span','body-rank-bar');
    const fill=el('span','body-rank-fill');fill.style.width=`${Math.round(value.heat*100)}%`;
    bar.append(fill);
    row.append(bar,el('small',null,daysAgoText(value.last.at)));
    list.append(row);
  }
  panel.append(list);
}

function renderMuscle(id){
  const muscle=muscleById.get(id);
  const panel=$('w-body-panel');panel.replaceChildren();
  if(!muscle)return renderOverview();
  const value=state.heats.get(id);
  // Only what was done on the last day this muscle was worked: listing older sessions beside
  // "last trained today" reads as though they all happened today.
  const lastDay=value?[...new Set(value.recent.filter(session=>session.date===value.last.date).map(session=>session.name))]:[];
  const head=el('div','body-head');
  head.append(el('h3',null,muscle.name));
  const close=el('button','body-clear','×');close.type='button';close.dataset.act='clear';close.setAttribute('aria-label','Close muscle');
  head.append(close);
  panel.append(head);
  panel.append(el('p','body-state',value
    ?`${heatLabel(value.heat)} · last trained ${daysAgoText(value.last.at)} — ${lastDay.slice(0,3).join(', ')}`
    :'Never trained in this log.'));
  const {primary,secondary}=movementsForMuscle(id);
  if(!primary.length&&!secondary.length){panel.append(el('p','body-hint','Nothing in your movement list trains this one yet.'));return;}
  const moves=el('div','body-moves');
  for(const movement of primary)moves.append(movementButton(movement,null));
  for(const movement of secondary)moves.append(movementButton(movement,'also'));
  panel.append(el('p','body-label','Trains this muscle'),moves);
}

function pick(id){
  state.selected=state.view?.select(id)??null;
  if(state.selected)renderMuscle(state.selected);else renderOverview();
}

export function initBody(hooks){
  state.hooks=hooks;
  $('w-body-panel').addEventListener('click',event=>{
    const target=event.target.closest('[data-mid],[data-muscle],[data-act]');
    if(!target)return;
    if(target.dataset.act==='clear')return pick(null);
    if(target.dataset.muscle)return pick(target.dataset.muscle);
    hooks.addMovement(target.dataset.mid);
  });
  $('w-body-front').addEventListener('click',()=>state.view?.face('front'));
  $('w-body-back').addEventListener('click',()=>state.view?.face('back'));
}

// Called every time the pane opens: the first call downloads and builds the view, later ones
// only restart the render loop and repaint from whatever has been logged since.
export async function openBody(){
  renderOverview();
  if(!state.view&&!state.loading){
    $('w-body-note').textContent='Loading the body…';
    state.loading=(async()=>{
      const {createBody}=await import('./body3d.js');
      state.view=await createBody($('w-body-canvas'),{muscleOf:part=>muscleForPart.get(part)||null,onPick:pick});
      $('w-body-note').hidden=true;
    })().catch(error=>{
      console.error('Body view failed to load:',error);
      $('w-body-note').textContent='The 3D body could not load here. Everything else still works.';
      state.loading=null;
    });
  }
  await state.loading;
  recompute();
  // The panel was drawn before the heat was known, so draw it again now that it is.
  if(state.selected)renderMuscle(state.selected);else renderOverview();
  state.view?.start();
}

export function closeBody(){state.view?.stop();}
