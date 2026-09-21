// The gym's map of the body. Two tables, both plain data:
//   MUSCLES — a trainable muscle and the anatomical parts of the 3D model that make it up
//   TARGETS — which muscles each movement in the catalogue trains, primary and secondary
// Nothing here knows about Three.js, and body3d.js knows nothing about exercises, so either
// side can be rewritten without disturbing the other. Editing a mapping means editing a
// line in this file and reloading; the model never has to be rebuilt.
import { CATALOGUE } from './movements.js';

// `parts` are node names in body-muscles.glb with Blender's left/right suffix stripped.
// tests/body.test.mjs checks every one of them against the shipped model, so a typo here
// fails the test run rather than quietly leaving a muscle that never lights up.
export const MUSCLES=[
  {id:'chest',name:'Chest',parts:['Clavicular head of pectoralis major muscle','Sternocostal head of pectoralis major muscle','(Abdominal part of pectoralis major muscle)','Pectoralis minor muscle']},
  {id:'front-delt',name:'Front Delt',parts:['Clavicular part of deltoid muscle']},
  {id:'side-delt',name:'Side Delt',parts:['Acromial part of deltoid muscle']},
  {id:'rear-delt',name:'Rear Delt',parts:['Scapular spinal part of deltoid muscle']},
  {id:'triceps',name:'Triceps',parts:['Long head of triceps brachii','Lateral head of triceps brachii','Medial head of triceps brachii','Anconeus muscle']},
  {id:'serratus',name:'Serratus Anterior',parts:['Serratus anterior muscle']},
  {id:'lats',name:'Lats',parts:['Latissimus dorsi muscle','Teres major muscle']},
  {id:'traps',name:'Traps',parts:['Descending part of trapezius muscle','Transverse part of trapezius muscle','Ascending part of trapezius muscle','Levator scapulae']},
  {id:'rhomboids',name:'Rhomboids',parts:['Rhomboid major muscle','Rhomboid minor muscle']},
  {id:'rotator-cuff',name:'Rotator Cuff',parts:['Supraspinatus muscle','Infraspinatus muscle','Teres minor muscle','Subscapularis muscle']},
  {id:'biceps',name:'Biceps',parts:['Long head of biceps brachii','Short head of biceps brachii','Coracobrachialis muscle']},
  {id:'brachialis',name:'Brachialis',parts:['Brachialis muscle']},
  // The hand's own muscles ride with the flexors: what fails on a heavy carry is the grip.
  {id:'forearm-flexors',name:'Forearm Flexors',parts:['Flexor carpi radialis','Humeral head of flexor carpi ulnaris','Ulnar head of flexor carpi ulnaris','Palmaris longus muscle','Humero-ulnar head of flexor digitorum superficialis','Radial head of flexor digitorum superficialis','Flexor digitorum profundus','Flexor pollicis longus','Superficial head of pronator teres','Deep head of pronator teres','Pronator quadratus','Abductor pollicis brevis','Superficial head of flexor pollicis brevis','Deep head of flexor pollicis brevis','Opponens pollicis muscle','Oblique head of adductor pollicis','Transverse head of adductor pollicis','Abductor digiti minimi of hand','Flexor digiti minimi of hand','Opponens digiti minimi muscle of hand','Lumbrical muscles of hand','Palmar interossei muscles','Dorsal interossei muscles of hand']},
  {id:'forearm-extensors',name:'Forearm Extensors',parts:['Brachioradialis muscle','Extensor carpi radialis longus','Extensor carpi radialis brevis','Humeral head of extensor carpi ulnaris','Ulnar head of extensor carpi ulnaris','Extensor digitorum','Extensor digiti minimi','Extensor indicis','Supinator','Abductor pollicis longus','Extensor pollicis brevis','Extensor pollicis longus']},
  {id:'abs',name:'Abs',parts:['Rectus abdominis muscle','Pyramidalis muscle','Linea alba']},
  {id:'obliques',name:'Obliques',parts:['External abdominal oblique muscle','Internal abdominal oblique muscle','Transversus abdominis muscle']},
  {id:'erectors',name:'Lower Back',parts:['Iliocostalis lumborum muscle','Iliocostalis thoracis muscle','Iliocostalis colli muscle','Longissimus thoracis muscle','Longissimus colli muscle','Spinalis thoracis muscle','Spinalis colli muscle','Multifidus lumborum muscle','Multifidus thoracis muscle','Multifidus colli muscle','Quadratus lumborum muscle','Rotatores','Interspinales lumborum muscles','Interspinales thoracis muscles','Serratus posterior inferior muscle']},
  {id:'glutes',name:'Glutes',parts:['Gluteus maximus muscle']},
  {id:'abductors',name:'Glute Med & Min',parts:['Gluteus medius muscle','Gluteus minimus muscle','Piriformis muscle','Superior gemellus muscle','Inferior gemellus muscle','Obturator internus','Obturator externus','Quadratus femoris muscle']},
  {id:'hip-flexors',name:'Hip Flexors',parts:['Psoas major','Iliacus muscle','Sartorius muscle']},
  {id:'quads',name:'Quads',parts:['Rectus femoris muscle','Vastus lateralis muscle','Vastus medialis muscle','Vastus intermedius muscle']},
  {id:'hamstrings',name:'Hamstrings',parts:['Long head of biceps femoris','Short head of biceps femoris','Semitendinosus muscle','Semimembranosus muscle']},
  {id:'adductors',name:'Adductors',parts:['Adductor magnus','Adductor longus','Adductor brevis','Gracilis muscle','Pectineus muscle']},
  {id:'calves',name:'Calves',parts:['Medial head of gastrocnemius','Lateral head of gastrocnemius','Soleus muscle','Plantaris muscle','Tibialis posterior muscle','Flexor digitorum longus','Flexor hallucis longus','Fibularis longus muscle','Fibularis brevis muscle']},
  {id:'shins',name:'Shins',parts:['Tibialis anterior muscle','Extensor digitorum longus','Extensor hallucis longus','Fibularis tertius muscle']}
];

// Movement id (the slug from movements.js) to the muscles it trains. A movement missing
// from this table — anything added by hand in the picker — simply trains nothing yet.
export const TARGETS={
  'barbell-bench-press':{primary:['chest'],secondary:['front-delt','triceps','serratus']},
  'incline-barbell-bench-press':{primary:['chest','front-delt'],secondary:['triceps']},
  'dumbbell-bench-press':{primary:['chest'],secondary:['front-delt','triceps']},
  'incline-dumbbell-press':{primary:['chest','front-delt'],secondary:['triceps']},
  'decline-bench-press':{primary:['chest'],secondary:['triceps','front-delt']},
  'machine-chest-press':{primary:['chest'],secondary:['front-delt','triceps']},
  'cable-fly':{primary:['chest'],secondary:['front-delt']},
  'dumbbell-fly':{primary:['chest'],secondary:['front-delt']},
  'pec-deck':{primary:['chest'],secondary:['front-delt']},
  'push-up':{primary:['chest'],secondary:['front-delt','triceps','serratus','abs']},
  'dip':{primary:['chest','triceps'],secondary:['front-delt']},

  'deadlift':{primary:['erectors','glutes','hamstrings'],secondary:['traps','lats','quads','forearm-flexors','abs']},
  'barbell-row':{primary:['lats','rhomboids'],secondary:['rear-delt','biceps','erectors','forearm-flexors']},
  'pendlay-row':{primary:['lats','rhomboids'],secondary:['rear-delt','biceps','erectors','forearm-flexors']},
  'dumbbell-row':{primary:['lats'],secondary:['rhomboids','rear-delt','biceps','forearm-flexors']},
  'chest-supported-row':{primary:['lats','rhomboids'],secondary:['rear-delt','biceps']},
  'seated-cable-row':{primary:['lats','rhomboids'],secondary:['rear-delt','biceps','erectors']},
  't-bar-row':{primary:['lats','rhomboids'],secondary:['rear-delt','biceps','erectors']},
  'lat-pulldown':{primary:['lats'],secondary:['biceps','rhomboids','rear-delt','forearm-flexors']},
  'pull-up':{primary:['lats'],secondary:['biceps','rhomboids','forearm-flexors','abs']},
  'chin-up':{primary:['lats','biceps'],secondary:['rhomboids','forearm-flexors','abs']},
  'straight-arm-pulldown':{primary:['lats'],secondary:['triceps','abs']},
  'inverted-row':{primary:['lats','rhomboids'],secondary:['rear-delt','biceps']},
  'rack-pull':{primary:['traps','erectors'],secondary:['lats','glutes','forearm-flexors']},
  'shrug':{primary:['traps'],secondary:['forearm-flexors','rhomboids']},

  'overhead-press':{primary:['front-delt','side-delt'],secondary:['triceps','traps','abs']},
  'seated-dumbbell-press':{primary:['front-delt','side-delt'],secondary:['triceps','traps']},
  'arnold-press':{primary:['front-delt','side-delt'],secondary:['triceps','rotator-cuff']},
  'machine-shoulder-press':{primary:['front-delt','side-delt'],secondary:['triceps']},
  'lateral-raise':{primary:['side-delt'],secondary:['traps','rotator-cuff']},
  'cable-lateral-raise':{primary:['side-delt'],secondary:['traps']},
  'front-raise':{primary:['front-delt'],secondary:['chest']},
  'rear-delt-fly':{primary:['rear-delt'],secondary:['rhomboids','traps','rotator-cuff']},
  'face-pull':{primary:['rear-delt','rotator-cuff'],secondary:['traps','rhomboids']},
  'upright-row':{primary:['side-delt','traps'],secondary:['biceps','rotator-cuff']},

  'barbell-curl':{primary:['biceps'],secondary:['brachialis','forearm-flexors']},
  'ez-bar-curl':{primary:['biceps'],secondary:['brachialis','forearm-flexors']},
  'dumbbell-curl':{primary:['biceps'],secondary:['brachialis','forearm-flexors']},
  'hammer-curl':{primary:['biceps','brachialis'],secondary:['forearm-extensors']},
  'incline-dumbbell-curl':{primary:['biceps'],secondary:['brachialis']},
  'preacher-curl':{primary:['biceps','brachialis'],secondary:['forearm-flexors']},
  'cable-curl':{primary:['biceps'],secondary:['brachialis','forearm-flexors']},
  'concentration-curl':{primary:['biceps'],secondary:['brachialis']},
  'spider-curl':{primary:['biceps'],secondary:['brachialis']},

  'close-grip-bench-press':{primary:['triceps'],secondary:['chest','front-delt']},
  'triceps-pushdown':{primary:['triceps'],secondary:[]},
  'rope-pushdown':{primary:['triceps'],secondary:[]},
  'overhead-triceps-extension':{primary:['triceps'],secondary:['abs']},
  'skull-crusher':{primary:['triceps'],secondary:[]},
  'dumbbell-kickback':{primary:['triceps'],secondary:['rear-delt']},
  'bench-dip':{primary:['triceps'],secondary:['chest','front-delt']},

  'wrist-curl':{primary:['forearm-flexors'],secondary:[]},
  'reverse-wrist-curl':{primary:['forearm-extensors'],secondary:[]},
  'reverse-curl':{primary:['brachialis','forearm-extensors'],secondary:['biceps']},
  'farmer-s-carry':{primary:['forearm-flexors','traps'],secondary:['abs','obliques','erectors','quads']},
  'dead-hang':{primary:['forearm-flexors'],secondary:['lats','rotator-cuff']},
  'plate-pinch':{primary:['forearm-flexors'],secondary:[]},

  'back-squat':{primary:['quads','glutes'],secondary:['erectors','adductors','hamstrings','abs']},
  'front-squat':{primary:['quads'],secondary:['glutes','erectors','abs']},
  'hack-squat':{primary:['quads'],secondary:['glutes','adductors']},
  'leg-press':{primary:['quads','glutes'],secondary:['adductors','hamstrings']},
  'goblet-squat':{primary:['quads','glutes'],secondary:['abs','adductors']},
  'bulgarian-split-squat':{primary:['quads','glutes'],secondary:['adductors','hamstrings','abductors']},
  'walking-lunge':{primary:['quads','glutes'],secondary:['hamstrings','adductors','abductors']},
  'step-up':{primary:['quads','glutes'],secondary:['hamstrings','abductors']},
  'leg-extension':{primary:['quads'],secondary:[]},
  'sissy-squat':{primary:['quads'],secondary:['abs']},
  'wall-sit':{primary:['quads'],secondary:['glutes']},

  'romanian-deadlift':{primary:['hamstrings','glutes'],secondary:['erectors','adductors','forearm-flexors']},
  'stiff-leg-deadlift':{primary:['hamstrings','erectors'],secondary:['glutes','forearm-flexors']},
  'single-leg-rdl':{primary:['hamstrings','glutes'],secondary:['erectors','abductors']},
  'lying-leg-curl':{primary:['hamstrings'],secondary:['calves']},
  'seated-leg-curl':{primary:['hamstrings'],secondary:['calves']},
  'nordic-curl':{primary:['hamstrings'],secondary:['glutes','calves']},
  'good-morning':{primary:['hamstrings','erectors'],secondary:['glutes']},
  'glute-ham-raise':{primary:['hamstrings','glutes'],secondary:['erectors','calves']},

  'hip-thrust':{primary:['glutes'],secondary:['hamstrings','quads']},
  'barbell-glute-bridge':{primary:['glutes'],secondary:['hamstrings']},
  'sumo-deadlift':{primary:['glutes','quads','adductors'],secondary:['erectors','traps','hamstrings','forearm-flexors']},
  'cable-pull-through':{primary:['glutes'],secondary:['hamstrings','erectors']},
  'cable-kickback':{primary:['glutes'],secondary:['hamstrings']},
  'hip-abduction':{primary:['abductors'],secondary:['glutes']},
  'reverse-hyperextension':{primary:['glutes','erectors'],secondary:['hamstrings']},

  'standing-calf-raise':{primary:['calves'],secondary:[]},
  'seated-calf-raise':{primary:['calves'],secondary:[]},
  'leg-press-calf-raise':{primary:['calves'],secondary:[]},
  'single-leg-calf-raise':{primary:['calves'],secondary:[]},
  'donkey-calf-raise':{primary:['calves'],secondary:[]},

  'plank':{primary:['abs'],secondary:['obliques','erectors','front-delt']},
  'side-plank':{primary:['obliques'],secondary:['abs','abductors']},
  'hollow-hold':{primary:['abs'],secondary:['obliques','hip-flexors']},
  'hanging-leg-raise':{primary:['abs','hip-flexors'],secondary:['obliques','forearm-flexors']},
  'cable-crunch':{primary:['abs'],secondary:['obliques']},
  'ab-wheel-rollout':{primary:['abs'],secondary:['obliques','lats','hip-flexors']},
  'crunch':{primary:['abs'],secondary:[]},
  'bicycle-crunch':{primary:['abs','obliques'],secondary:['hip-flexors']},
  'russian-twist':{primary:['obliques'],secondary:['abs']},
  'pallof-press':{primary:['obliques'],secondary:['abs','front-delt']},
  'dead-bug':{primary:['abs'],secondary:['obliques','hip-flexors']}
};

const EMPTY={primary:[],secondary:[]};
export const muscleById=new Map(MUSCLES.map(muscle=>[muscle.id,muscle]));
// Built from `parts`, so body3d.js can turn a clicked mesh straight into a muscle id.
export const muscleForPart=new Map(MUSCLES.flatMap(muscle=>muscle.parts.map(part=>[part,muscle.id])));
export const targetsOf=mid=>TARGETS[mid]||EMPTY;

// The other direction: everything in the catalogue that trains this muscle, primary first.
export function movementsForMuscle(muscleId){
  const primary=[],secondary=[];
  for(const movement of CATALOGUE){
    const targets=targetsOf(movement.id);
    if(targets.primary.includes(muscleId))primary.push(movement);
    else if(targets.secondary.includes(muscleId))secondary.push(movement);
  }
  return {primary,secondary};
}
