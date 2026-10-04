// Movement catalogue. Names are the search terms, so they read the way a gym says them.
export const slug=name=>name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
// Reps are the unit for these; any weight is weight *added* to the body.
const BODY=new Set(['Push-Up','Dip','Pull-Up','Chin-Up','Inverted Row','Bench Dip','Hanging Leg Raise','Ab Wheel Rollout','Crunch','Bicycle Crunch','Dead Bug','Nordic Curl','Glute-Ham Raise','Sissy Squat',
  'Box Jump','Burpee','Jump Squat','Jumping Lunge','Skater Jump','Bodyweight Squat','Pistol Squat','Glute Bridge','Single-Leg Glute Bridge','Bird Dog','Clamshell','Banded Lateral Walk','TRX Row','Step-Through Lunge']);
// Held, not repeated: logged in seconds.
const TIME=new Set(['Barbell Hold','Plank','Side Plank','Hollow Hold','Dead Hang','Farmer’s Carry','Plate Pinch','Wall Sit',
  'Suitcase Carry','Overhead Carry','Bear Crawl','Mountain Climber','Battle Ropes','Jump Rope','Sled Push','Copenhagen Plank']);
// Yoga poses are held, so they log in seconds too, and look up as poses rather than lifts.
const YOGA=['Mountain Pose','Downward-Facing Dog','Upward-Facing Dog','Cobra Pose','Child’s Pose','Cat-Cow','Low Lunge','High Lunge','Warrior I','Warrior II','Warrior III','Reverse Warrior','Triangle Pose','Extended Side Angle','Chair Pose','Tree Pose','Half Moon Pose','Plank Pose','Chaturanga','Side Plank Pose','Boat Pose','Bridge Pose','Wheel Pose','Camel Pose','Pigeon Pose','Lizard Pose','Garland Pose','Seated Forward Fold','Standing Forward Fold','Butterfly Pose','Supine Twist','Happy Baby','Crow Pose','Dolphin Pose','Locust Pose','Legs-Up-the-Wall'];
const YOGA_SET=new Set(YOGA);
// Everything loaded on a barbell (landmine work included), so "barbell" finds them whatever they are called.
export const BARBELL=new Set(['Barbell Bench Press','Incline Barbell Bench Press','Decline Bench Press','Close-Grip Bench Press','Barbell Floor Press','Barbell Pullover',
  'Deadlift','Barbell Row','Pendlay Row','T-Bar Row','Rack Pull','Shrug','Yates Row','Meadows Row','Landmine Row','Snatch-Grip Deadlift','Deficit Deadlift','Barbell High Pull',
  'Overhead Press','Upright Row','Seated Barbell Press','Push Press','Landmine Press','Barbell Front Raise','Z Press',
  'Barbell Curl','EZ-Bar Curl','Reverse Curl','Drag Curl','Wide-Grip Barbell Curl','Close-Grip Barbell Curl','Barbell Preacher Curl',
  'Skull Crusher','Close-Grip Floor Press','JM Press','Barbell Overhead Triceps Extension','Wrist Curl','Reverse Wrist Curl','Barbell Hold',
  'Back Squat','Front Squat','Zercher Squat','Box Squat','Pause Squat','Barbell Lunge','Barbell Reverse Lunge','Barbell Split Squat','Barbell Bulgarian Split Squat','Barbell Step-Up','Landmine Squat','Barbell Hack Squat',
  'Romanian Deadlift','Stiff-Leg Deadlift','Good Morning','Barbell Single-Leg RDL','Hip Thrust','Barbell Glute Bridge','Sumo Deadlift','Landmine Glute Kickback',
  'Barbell Calf Raise','Barbell Seated Calf Raise','Barbell Rollout','Landmine Rotation','Barbell Russian Twist',
  'Thruster','Power Clean','Hang Clean','Clean and Press','Power Snatch','Barbell Complex']);
// Other names a lift goes by, so searching the gym's word for it still finds it.
const ALIASES={'Overhead Press':'barbell overhead press military press ohp standing press','Romanian Deadlift':'rdl barbell rdl','Back Squat':'barbell squat','Barbell Bench Press':'bench','Deadlift':'barbell deadlift conventional','Skull Crusher':'lying triceps extension','Hip Thrust':'barbell hip thrust','Shrug':'barbell shrug','Upright Row':'barbell upright row','Good Morning':'barbell good morning','Front Squat':'barbell front squat','Barbell Row':'bent-over row bent over row','Wrist Curl':'barbell wrist curl','Reverse Wrist Curl':'barbell reverse wrist curl','Reverse Curl':'barbell reverse curl','Push Press':'barbell push press','Landmine Press':'barbell landmine','Z Press':'seated floor press barbell','JM Press':'barbell'};
export const searchText=name=>`${name} ${BARBELL.has(name)?'barbell':''} ${ALIASES[name]||''}`.toLowerCase();
export const kindOf=name=>BODY.has(name)?'body':TIME.has(name)||YOGA_SET.has(name)?'time':'weight';
export const isPose=name=>YOGA_SET.has(name);
export const GROUPS=[
  {id:'chest',name:'Chest',movements:['Barbell Bench Press','Incline Barbell Bench Press','Dumbbell Bench Press','Incline Dumbbell Press','Decline Bench Press','Machine Chest Press','Cable Fly','Dumbbell Fly','Pec Deck','Push-Up','Dip','Barbell Floor Press','Barbell Pullover']},
  {id:'back',name:'Back',movements:['Deadlift','Barbell Row','Pendlay Row','Dumbbell Row','Chest-Supported Row','Seated Cable Row','T-Bar Row','Lat Pulldown','Pull-Up','Chin-Up','Straight-Arm Pulldown','Inverted Row','Rack Pull','Shrug','Yates Row','Meadows Row','Landmine Row','Snatch-Grip Deadlift','Deficit Deadlift','Barbell High Pull']},
  {id:'shoulders',name:'Shoulders',movements:['Overhead Press','Seated Dumbbell Press','Arnold Press','Machine Shoulder Press','Lateral Raise','Cable Lateral Raise','Front Raise','Rear Delt Fly','Face Pull','Upright Row','Seated Barbell Press','Push Press','Landmine Press','Barbell Front Raise','Z Press']},
  {id:'biceps',name:'Biceps',movements:['Barbell Curl','EZ-Bar Curl','Dumbbell Curl','Hammer Curl','Incline Dumbbell Curl','Preacher Curl','Cable Curl','Concentration Curl','Spider Curl','Drag Curl','Wide-Grip Barbell Curl','Close-Grip Barbell Curl','Barbell Preacher Curl']},
  {id:'triceps',name:'Triceps',movements:['Close-Grip Bench Press','Triceps Pushdown','Rope Pushdown','Overhead Triceps Extension','Skull Crusher','Dumbbell Kickback','Bench Dip','Close-Grip Floor Press','JM Press','Barbell Overhead Triceps Extension']},
  {id:'forearms',name:'Forearms',movements:['Wrist Curl','Reverse Wrist Curl','Reverse Curl','Farmer’s Carry','Dead Hang','Plate Pinch','Barbell Hold']},
  {id:'quads',name:'Quads',movements:['Back Squat','Front Squat','Hack Squat','Leg Press','Goblet Squat','Bulgarian Split Squat','Walking Lunge','Step-Up','Leg Extension','Sissy Squat','Wall Sit','Zercher Squat','Box Squat','Pause Squat','Barbell Lunge','Barbell Reverse Lunge','Barbell Split Squat','Barbell Bulgarian Split Squat','Barbell Step-Up','Landmine Squat','Barbell Hack Squat']},
  {id:'hamstrings',name:'Hamstrings',movements:['Romanian Deadlift','Dumbbell Romanian Deadlift','Stiff-Leg Deadlift','Single-Leg RDL','Lying Leg Curl','Seated Leg Curl','Nordic Curl','Good Morning','Glute-Ham Raise','Barbell Single-Leg RDL']},
  {id:'glutes',name:'Glutes',movements:['Hip Thrust','Barbell Glute Bridge','Sumo Deadlift','Cable Pull-Through','Cable Kickback','Hip Abduction','Reverse Hyperextension','Landmine Glute Kickback']},
  {id:'calves',name:'Calves',movements:['Standing Calf Raise','Seated Calf Raise','Leg Press Calf Raise','Single-Leg Calf Raise','Donkey Calf Raise','Barbell Calf Raise','Barbell Seated Calf Raise']},
  {id:'core',name:'Core',movements:['Plank','Side Plank','Hollow Hold','Hanging Leg Raise','Cable Crunch','Ab Wheel Rollout','Crunch','Bicycle Crunch','Russian Twist','Pallof Press','Dead Bug','Barbell Rollout','Landmine Rotation','Barbell Russian Twist']},
  // Whole-body, athletic, and conditioning work: carries, kettlebells, jumps, and the small stabilisers.
  {id:'functional',name:'Functional',movements:['Kettlebell Swing','Kettlebell Clean','Kettlebell Snatch','Turkish Get-Up','Thruster','Wall Ball','Medicine Ball Slam','Suitcase Carry','Overhead Carry','Sled Push','Box Jump','Burpee','Jump Squat','Jumping Lunge','Skater Jump','Mountain Climber','Bear Crawl','Battle Ropes','Jump Rope','Bodyweight Squat','Pistol Squat','Reverse Lunge','Lateral Lunge','Step-Through Lunge','Glute Bridge','Single-Leg Glute Bridge','Bird Dog','Clamshell','Banded Lateral Walk','Copenhagen Plank','TRX Row','Power Clean','Hang Clean','Clean and Press','Power Snatch','Barbell Complex']},
  {id:'yoga',name:'Yoga',movements:YOGA}
];
export const CATALOGUE=GROUPS.flatMap(group=>group.movements.map(name=>({id:slug(name),name,group:group.id,groupName:group.name,kind:kindOf(name)})));
export const byId=new Map(CATALOGUE.map(movement=>[movement.id,movement]));
export const imageSearch=name=>`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(name+(YOGA_SET.has(name)?' yoga':' exercise form'))}`;
