// How hot a muscle reads, and how it cools. Pure arithmetic over plain objects: no DOM, no
// Three.js, no knowledge of how a training day is stored. The curve lives alone so it can be
// retuned — or replaced with something that reads RIR and volume — without touching the view.
//
// The notebook already cools marked passages on a half-life; a worked muscle does the same
// thing. Red means the notebook has no reason to believe that muscle is recovered yet.

// Soreness from a hard session is mostly gone inside a week. A 60-hour half-life puts a
// muscle at roughly two thirds heat the next morning, a third after three days, a tenth
// after a week — close enough to how a session actually feels.
export const HALF_LIFE_HOURS=60;
// Sets are the unit because they are the one thing every movement has: pounds, reps, and
// seconds are not comparable, and set count tracks how much work a muscle actually took.
// Six hard sets is most of the stimulus a muscle gets in a session, so the curve saturates
// around there rather than rewarding junk volume.
export const SATURATION_SETS=6;
// A secondary muscle takes real work, but not the work the movement was chosen for.
export const SECONDARY_SHARE=0.45;

export const effortOf=sets=>1-Math.exp(-sets/SATURATION_SETS);
export const fadeOver=hours=>0.5**(Math.max(0,hours)/HALF_LIFE_HOURS);
const HOUR=3600*1000;

// Sessions are `{muscles:{id:share}, at:ms, mid, name, date}` — one per logged movement.
// Heat combines as overlapping evidence rather than a sum: two half-worked sessions leave a
// muscle warmer than either alone but never past fully worked, which is what the body does.
export function muscleHeat(sessions,at=Date.now()){
  const heat=new Map();
  for(const session of sessions){
    const age=fadeOver((at-session.at)/HOUR);
    for(const[id,share]of Object.entries(session.muscles)){
      const value=share*age;
      if(value<=0)continue;
      const current=heat.get(id)||{heat:0,last:null,recent:[]};
      current.heat=1-(1-current.heat)*(1-value);
      // "Last trained" is the most recent session that touched the muscle at all, whatever
      // its share, so a muscle worked lightly yesterday still says yesterday.
      if(!current.last||session.at>current.last.at)current.last=session;
      current.recent.push(session);
      heat.set(id,current);
    }
  }
  for(const entry of heat.values())entry.recent.sort((a,b)=>b.at-a.at);
  return heat;
}

// "Fresh", "Worked hard", and the words between. The bands are named once here so the panel
// and any future summary agree on what a number means.
export function heatLabel(heat){
  if(heat>=0.66)return 'Worked hard';
  if(heat>=0.33)return 'Still recovering';
  if(heat>=0.08)return 'Nearly fresh';
  return 'Fresh';
}

// Whole days, not hours: "3 days ago" is how a training week is actually counted.
export function daysAgoText(from,to=Date.now()){
  const days=Math.round((to-from)/(24*HOUR));
  if(days<=0)return 'today';
  if(days===1)return 'yesterday';
  if(days<7)return `${days} days ago`;
  if(days<14)return 'last week';
  return `${Math.round(days/7)} weeks ago`;
}
