// Heat is transient paint. No wrapper elements, document changes, or saved marks.
export const COOLING_MS = 4200;
export const STAGES = [650,1500,2550,3650,4200];
export function reconcileHeat(previous,next,runs,now,change){
  if(previous===next)return runs.filter(run=>now-run.born<COOLING_MS);
  let start=0,endBefore=previous.length,endAfter=next.length;
  // beforeinput ranges disambiguate typing repeated characters in the middle.
  if(change&&change.start>=0&&change.end>=change.start){
    const inserted=next.length-(previous.length-(change.end-change.start));
    if(inserted>=0&&previous.slice(0,change.start)===next.slice(0,change.start)&&previous.slice(change.end)===next.slice(change.start+inserted)){start=change.start;endBefore=change.end;endAfter=start+inserted;}
    else change=null;
  }
  if(!change){while(start<endBefore&&start<endAfter&&previous[start]===next[start])start++;while(endBefore>start&&endAfter>start&&previous[endBefore-1]===next[endAfter-1]){endBefore--;endAfter--;}}
  const delta=endAfter-endBefore,result=[];
  for(const run of runs){if(now-run.born>=COOLING_MS)continue;if(run.start<start)result.push({...run,end:Math.min(run.end,start)});if(run.end>endBefore)result.push({...run,start:Math.max(run.start,endBefore)+delta,end:run.end+delta});}
  if(endAfter>start)result.push({start,end:endAfter,born:now});
  return result.filter(run=>run.end>run.start);
}
export class HeatLayer{
  constructor(elements){this.elements=elements;this.enabled=!matchMedia('(prefers-reduced-motion: reduce)').matches;this.supported=typeof Highlight!=='undefined'&&!!CSS.highlights;this.states=new Map();this.frame=0;this.lastPaint=0;this.highlights=[];
    if(this.supported)for(const name of ['red','orange','gold','blue','white']){const highlight=new Highlight();CSS.highlights.set(`heat-${name}`,highlight);this.highlights.push(highlight);}
    for(const el of elements){this.states.set(el,{text:el.textContent,runs:[],rangeHint:null,composing:false});el.addEventListener('beforeinput',event=>{const range=event.getTargetRanges?.()[0];const state=this.states.get(el);state.rangeHint=null;if(range){const start=this.offset(el,range.startContainer,range.startOffset),end=this.offset(el,range.endContainer,range.endOffset);state.rangeHint={start,end};}});el.addEventListener('compositionstart',()=>{this.states.get(el).composing=true;});el.addEventListener('compositionend',()=>{this.states.get(el).composing=false;this.update(el);});el.addEventListener('input',()=>this.update(el));}
  }
  offset(root,node,offset){try{const range=document.createRange();range.selectNodeContents(root);range.setEnd(node,offset);return range.toString().length;}catch{return -1;}}
  update(el){const state=this.states.get(el);if(state.composing)return;const text=el.textContent;state.runs=this.enabled?reconcileHeat(state.text,text,state.runs,performance.now(),state.rangeHint):[];state.text=text;state.rangeHint=null;if(this.supported&&!this.frame)this.paint();}
  reset(){cancelAnimationFrame(this.frame);this.frame=0;for(const[el,state]of this.states){state.text=el.textContent;state.runs=[];state.rangeHint=null;}this.highlights.forEach(h=>h.clear());}
  toggle(){this.enabled=!this.enabled;this.reset();return this.enabled;}
  paint=()=>{this.frame=0;const now=performance.now();if(now-this.lastPaint<40){this.frame=requestAnimationFrame(this.paint);return;}this.lastPaint=now;this.highlights.forEach(h=>h.clear());let active=false;
    for(const[el,state]of this.states){state.runs=state.runs.filter(r=>now-r.born<COOLING_MS);if(!state.runs.length)continue;active=true;const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const nodes=[];let offset=0,node;while((node=walker.nextNode())){nodes.push({node,start:offset,end:offset+node.length});offset+=node.length;}
      for(const run of state.runs){const stage=STAGES.findIndex(t=>now-run.born<t);if(stage<0)continue;for(const item of nodes){if(item.end<=run.start)continue;if(item.start>=run.end)break;const range=document.createRange();range.setStart(item.node,Math.max(0,run.start-item.start));range.setEnd(item.node,Math.min(item.node.length,run.end-item.start));this.highlights[stage].add(range);}}
    }
    if(active)this.frame=requestAnimationFrame(this.paint);
  };
}
