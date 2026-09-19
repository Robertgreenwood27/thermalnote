// Confidence is durable metadata. It lives beside the note, never inside its words.
import { diffRange } from './heat.js';
export const DAY=86400000;
// Half-life of a memory, in days, after this many consecutive recalls. Nothing stays warm-free forever.
export const HALF_LIVES=[0,0.6,2,5,12,30,75];
export const TIERS=[0.35,0.55,0.7,0.88];
export const TIER_NAMES=['red','orange','gold','blue'];
export const DUE=TIERS[2];
const freshId=()=>Math.random().toString(36).slice(2,10);
export function newMark(text,start,end,at=Date.now()){return{id:freshId(),text,start,end,recalls:0,lapses:0,reviewed:at,created:at};}
// What the notebook believes you would retrieve right now, not what you once said you knew.
export function retention(mark,now=Date.now()){const half=HALF_LIVES[Math.min(mark.recalls,HALF_LIVES.length-1)];return half?2**(-Math.max(0,now-mark.reviewed)/(half*DAY)):0;}
export function tier(mark,now){const value=retention(mark,now),index=TIERS.findIndex(limit=>value<limit);return index<0?TIER_NAMES.length:index;}
export const isDue=(mark,now)=>retention(mark,now)<DUE;
export function review(mark,result,at=Date.now()){const recalls=result==='got'?Math.min(mark.recalls+1,HALF_LIVES.length-1):result==='hard'?Math.max(mark.recalls,1):0;return{...mark,recalls,lapses:mark.lapses+(result==='forgot'?1:0),reviewed:at};}
export function trimRange(text,start,end){while(start<end&&/\s/.test(text[start]))start++;while(end>start&&/\s/.test(text[end-1]))end--;return{start,end};}
// One gesture does both jobs: mark a fresh passage, or release one you already marked.
export function toggleMark(marks,start,end,text,at=Date.now()){const overlap=marks.filter(mark=>mark.start<end&&mark.end>start);return overlap.length?marks.filter(mark=>!overlap.includes(mark)):[...marks,newMark(text.slice(start,end),start,end,at)].sort((a,b)=>a.start-b.start);}
// Editing a passage voids the evidence that you knew it. The mark survives; its confidence does not.
export function reconcileMarks(previous,next,marks,change,at=Date.now()){
  if(previous===next||!marks.length)return marks;
  const {start,endBefore,endAfter}=diffRange(previous,next,change),delta=endAfter-endBefore,result=[];
  for(const mark of marks){
    const from=mark.start>=endBefore?mark.start+delta:Math.min(mark.start,start),to=mark.end>endBefore?mark.end+delta:Math.min(mark.end,start);
    if(to<=from)continue;
    const touched=start<mark.end&&endBefore>mark.start;
    result.push(touched?{...mark,start:from,end:to,text:next.slice(from,to),recalls:0,reviewed:at}:{...mark,start:from,end:to});
  }
  return result;
}
// Offsets saved yesterday are only a guess about today's text: verify, then search, then let go.
export function anchorMarks(marks,text){
  const found=[];
  for(const mark of marks){
    if(!mark.text)continue;
    if(text.slice(mark.start,mark.end)===mark.text){found.push(mark);continue;}
    let best=-1;
    for(let at=text.indexOf(mark.text);at>=0;at=text.indexOf(mark.text,at+1))if(best<0||Math.abs(at-mark.start)<Math.abs(best-mark.start))best=at;
    if(best>=0)found.push({...mark,start:best,end:best+mark.text.length});
  }
  return found.sort((a,b)=>a.start-b.start);
}
export function parseMarks(value){
  let list=value;
  if(typeof value==='string'){try{list=JSON.parse(value);}catch{return[];}}
  if(!Array.isArray(list))return[];
  const now=Date.now();
  return list.filter(mark=>mark&&typeof mark.text==='string'&&mark.text.length>0&&Number.isInteger(mark.start)&&Number.isInteger(mark.end)&&mark.end>mark.start&&mark.start>=0)
    .map(mark=>({id:typeof mark.id==='string'&&mark.id?mark.id:freshId(),text:mark.text,start:mark.start,end:mark.end,recalls:Math.max(0,Number(mark.recalls)||0),lapses:Math.max(0,Number(mark.lapses)||0),reviewed:Number(mark.reviewed)||now,created:Number(mark.created)||now}))
    .sort((a,b)=>a.start-b.start);
}
// Marks are painted, never wrapped: the note's own markup stays exactly as it was typed.
export class MarkLayer{
  constructor(element){
    this.element=element;this.marks=[];this.text=element.textContent;this.hint=null;this.hidden=null;this.focus=null;
    this.supported=typeof Highlight!=='undefined'&&!!CSS.highlights;this.layers=new Map();
    if(this.supported){for(const name of TIER_NAMES)this.register(name,1);this.register('focus',2);this.register('hidden',3);}
    element.addEventListener('beforeinput',event=>{const range=event.getTargetRanges?.()[0];this.hint=null;if(!range)return;const start=this.offset(range.startContainer,range.startOffset),end=this.offset(range.endContainer,range.endOffset);if(start>=0&&end>=start)this.hint={start,end};});
  }
  register(key,priority){const highlight=new Highlight();highlight.priority=priority;CSS.highlights.set(`mark-${key}`,highlight);this.layers.set(key,highlight);}
  offset(node,offset){try{const range=document.createRange();range.selectNodeContents(this.element);range.setEnd(node,offset);return range.toString().length;}catch{return -1;}}
  load(marks){this.marks=marks;this.text=this.element.textContent;this.hint=null;this.hidden=null;this.focus=null;this.paint();}
  sync(){const text=this.element.textContent;if(text===this.text)return this.marks;this.marks=reconcileMarks(this.text,text,this.marks,this.hint);this.text=text;this.hint=null;this.paint();return this.marks;}
  nodes(){const walker=document.createTreeWalker(this.element,NodeFilter.SHOW_TEXT),list=[];let offset=0,node;while((node=walker.nextNode())){list.push({node,start:offset,end:offset+node.length});offset+=node.length;}return list;}
  ranges(nodes,start,end){const out=[];for(const item of nodes){if(item.end<=start)continue;if(item.start>=end)break;const range=document.createRange();range.setStart(item.node,Math.max(0,start-item.start));range.setEnd(item.node,Math.min(item.node.length,end-item.start));out.push(range);}return out;}
  paint(now=Date.now()){
    if(!this.supported)return;
    for(const layer of this.layers.values())layer.clear();
    if(!this.marks.length)return;
    const nodes=this.nodes();
    for(const mark of this.marks){
      const hide=this.hidden===mark.id,level=tier(mark,now);
      if(!hide&&mark.id!==this.focus&&level>=TIER_NAMES.length)continue;
      const layer=this.layers.get(hide?'hidden':TIER_NAMES[Math.min(level,TIER_NAMES.length-1)]);
      for(const range of this.ranges(nodes,mark.start,mark.end)){layer.add(range);if(mark.id===this.focus)this.layers.get('focus').add(range);}
    }
  }
  find(id){return this.marks.find(mark=>mark.id===id)||null;}
}
