// Typing speed, measured the way a typing test scores it: five characters make a word.
// Only bursts count. A pause longer than PAUSE_MS ends the burst, so thinking time never drags the number down.
// Nothing here stores what was typed, only how many characters went in and out.
export const PAUSE_MS=3000;
export const WINDOW_MS=8000;
// Swipe typing and predictive text drop a whole word in at once; anything bigger than this is a paste or a fill, not typing.
export const MAX_STROKE=30;
const MIN_SPAN_MS=2000,MIN_BURST_CHARS=20;
export const wpm=(chars,ms)=>ms>0?(chars/5)/(ms/60000):0;
export class TypingMeter{
  constructor(){this.events=[];this.burst=null;this.typed=0;this.deleted=0;this.activeMs=0;this.best=0;this.last=0;}
  record(kind,count,at=Date.now()){
    if(!(count>0))return;
    if(!this.burst||at-this.burst.last>PAUSE_MS){this.close();this.burst={start:at,last:at,chars:0};this.events=[];}
    if(kind==='type'){
      if(count>MAX_STROKE)return;
      this.burst.chars+=count;this.typed+=count;this.events.push({at,count});
    }else this.deleted+=count;
    this.burst.last=at;
  }
  // A burst is done once the pause has passed; its time and characters join the session.
  close(){
    const burst=this.burst;if(!burst)return;this.burst=null;
    const span=Math.max(burst.last-burst.start,MIN_SPAN_MS);
    if(burst.chars>0){this.activeMs+=span;this.last=wpm(burst.chars,span);}
    if(burst.chars>=MIN_BURST_CHARS)this.best=Math.max(this.best,this.last);
  }
  // Speed over the last few seconds of the current burst, or null when nobody is typing.
  live(at=Date.now()){
    if(this.burst&&at-this.burst.last>PAUSE_MS)this.close();
    if(!this.burst)return null;
    const recent=this.events.filter(event=>at-event.at<=WINDOW_MS);
    if(!recent.length)return null;
    const chars=recent.reduce((sum,event)=>sum+event.count,0);
    return wpm(chars,Math.max(at-recent[0].at,MIN_SPAN_MS));
  }
  session(at=Date.now()){
    this.live(at);
    const open=this.burst&&this.burst.chars>0?Math.max(this.burst.last-this.burst.start,MIN_SPAN_MS):0;
    const chars=this.typed,ms=this.activeMs+open;
    return{avg:wpm(chars,ms),best:this.best,last:this.last,minutes:ms/60000,kept:this.typed?Math.max(0,1-this.deleted/this.typed):1,typed:this.typed};
  }
}
