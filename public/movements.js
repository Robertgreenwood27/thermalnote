// Movement catalogue. Names are the search terms, so they read the way a gym says them.
export const slug=name=>name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
// Reps are the unit for these; any weight is weight *added* to the body.
const BODY=new Set(['Push-Up','Dip','Pull-Up','Chin-Up','Inverted Row','Bench Dip','Hanging Leg Raise','Ab Wheel Rollout','Crunch','Bicycle Crunch','Dead Bug','Nordic Curl','Glute-Ham Raise','Sissy Squat']);
// Held, not repeated: logged in seconds.
const TIME=new Set(['Plank','Side Plank','Hollow Hold','Dead Hang','Farmer’s Carry','Plate Pinch','Wall Sit']);
export const kindOf=name=>BODY.has(name)?'body':TIME.has(name)?'time':'weight';
export const GROUPS=[
  {id:'chest',name:'Chest',movements:['Barbell Bench Press','Incline Barbell Bench Press','Dumbbell Bench Press','Incline Dumbbell Press','Decline Bench Press','Machine Chest Press','Cable Fly','Dumbbell Fly','Pec Deck','Push-Up','Dip']},
  {id:'back',name:'Back',movements:['Deadlift','Barbell Row','Pendlay Row','Dumbbell Row','Chest-Supported Row','Seated Cable Row','T-Bar Row','Lat Pulldown','Pull-Up','Chin-Up','Straight-Arm Pulldown','Inverted Row','Rack Pull','Shrug']},
  {id:'shoulders',name:'Shoulders',movements:['Overhead Press','Seated Dumbbell Press','Arnold Press','Machine Shoulder Press','Lateral Raise','Cable Lateral Raise','Front Raise','Rear Delt Fly','Face Pull','Upright Row']},
  {id:'biceps',name:'Biceps',movements:['Barbell Curl','EZ-Bar Curl','Dumbbell Curl','Hammer Curl','Incline Dumbbell Curl','Preacher Curl','Cable Curl','Concentration Curl','Spider Curl']},
  {id:'triceps',name:'Triceps',movements:['Close-Grip Bench Press','Triceps Pushdown','Rope Pushdown','Overhead Triceps Extension','Skull Crusher','Dumbbell Kickback','Bench Dip']},
  {id:'forearms',name:'Forearms',movements:['Wrist Curl','Reverse Wrist Curl','Reverse Curl','Farmer’s Carry','Dead Hang','Plate Pinch']},
  {id:'quads',name:'Quads',movements:['Back Squat','Front Squat','Hack Squat','Leg Press','Goblet Squat','Bulgarian Split Squat','Walking Lunge','Step-Up','Leg Extension','Sissy Squat','Wall Sit']},
  {id:'hamstrings',name:'Hamstrings',movements:['Romanian Deadlift','Stiff-Leg Deadlift','Single-Leg RDL','Lying Leg Curl','Seated Leg Curl','Nordic Curl','Good Morning','Glute-Ham Raise']},
  {id:'glutes',name:'Glutes',movements:['Hip Thrust','Barbell Glute Bridge','Sumo Deadlift','Cable Pull-Through','Cable Kickback','Hip Abduction','Reverse Hyperextension']},
  {id:'calves',name:'Calves',movements:['Standing Calf Raise','Seated Calf Raise','Leg Press Calf Raise','Single-Leg Calf Raise','Donkey Calf Raise']},
  {id:'core',name:'Core',movements:['Plank','Side Plank','Hollow Hold','Hanging Leg Raise','Cable Crunch','Ab Wheel Rollout','Crunch','Bicycle Crunch','Russian Twist','Pallof Press','Dead Bug']}
];
export const CATALOGUE=GROUPS.flatMap(group=>group.movements.map(name=>({id:slug(name),name,group:group.id,groupName:group.name,kind:kindOf(name)})));
export const byId=new Map(CATALOGUE.map(movement=>[movement.id,movement]));
export const imageSearch=name=>`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(name+' exercise form')}`;
