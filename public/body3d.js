// The 3D body: loading, lighting, orbiting, and picking. It knows nothing about exercises
// or recovery — it is handed a function that names the muscle a mesh belongs to, and a map
// of heat values to paint. Everything it knows about the gym arrives through those two.
//
// The loading and raycast-to-select approach follows hpfrei/body-anatomy-3d-viewer
// (CC BY-SA 4.0), which is also where body-muscles.glb comes from.
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const MODEL='/body-muscles.glb';
// Resting muscle, fully worked muscle, and the tissue this app does not track.
const COLD=new THREE.Color('#7a5148');
const HOT=new THREE.Color('#ff1f0b');
const CONTEXT=new THREE.Color('#37322f');
// A tap that travels this far was a drag of the body, not a choice of muscle.
const TAP_SLOP=9;

export async function createBody(canvas,{muscleOf,onPick}){
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(38,1,0.05,100);
  // Kept deliberately dim: resting muscle has to read as brown, or everything looks trained.
  scene.add(new THREE.HemisphereLight(0xffe9df,0x141017,0.45));
  const key=new THREE.DirectionalLight(0xfff2ea,1.05);key.position.set(2,3,4);scene.add(key);
  const fill=new THREE.DirectionalLight(0xbfd2ff,0.35);fill.position.set(-3,1,-3);scene.add(fill);

  const controls=new OrbitControls(camera,canvas);
  controls.enableDamping=true;controls.dampingFactor=0.08;
  controls.enablePan=false; // One less way to lose the body off the edge of a phone screen.
  controls.minDistance=0.6;controls.maxDistance=6;
  controls.rotateSpeed=0.9;

  const gltf=await new GLTFLoader().loadAsync(MODEL);
  const model=gltf.scene;

  // One material per muscle, shared by every mesh in it, so painting a muscle red is a single
  // colour assignment no matter how many meshes and how many sides of the body it spans.
  const materials=new Map();
  const context=new THREE.MeshStandardMaterial({color:CONTEXT,roughness:0.85,metalness:0,side:THREE.DoubleSide});
  const pickable=[];
  model.traverse(node=>{
    if(!node.isMesh)return;
    // Normals are left out of the model file and recomputed here; see tools/build-body-model.mjs.
    node.geometry.computeVertexNormals();
    const id=muscleOf(node.userData.part);
    if(!id){node.material=context;node.userData.muscle=null;return;}
    if(!materials.has(id))materials.set(id,new THREE.MeshStandardMaterial({color:COLD.clone(),emissive:new THREE.Color(0x000000),roughness:0.62,metalness:0,side:THREE.DoubleSide}));
    node.material=materials.get(id);
    node.userData.muscle=id;
    pickable.push(node);
  });
  scene.add(model);

  // Stand the body in the middle of the frame and look at the chest rather than the navel,
  // because that is where the eye expects a figure's centre to be.
  const bounds=new THREE.Box3().setFromObject(model);
  const centre=bounds.getCenter(new THREE.Vector3());
  const size=bounds.getSize(new THREE.Vector3());
  model.position.sub(centre);
  const distance=size.y/(2*Math.tan(camera.fov*Math.PI/360))*1.04;
  controls.target.set(0,0,0);
  camera.position.set(0,0,distance);
  controls.update();

  let selected=null,heats=new Map(),frame=null,running=false;
  const warm=new THREE.Color();

  function shade(id){
    const material=materials.get(id);if(!material)return;
    const heat=heats.get(id)||0;
    material.color.copy(COLD).lerp(HOT,heat);
    // The glow is what carries at a glance on a phone; colour alone is too subtle in the dark.
    material.emissive.copy(HOT).multiplyScalar(heat*0.7+(id===selected?0.2:0));
    if(id===selected)material.color.lerp(warm.setHex(0xffd9c9),0.28);
    material.needsUpdate=false;
  }
  const shadeAll=()=>{for(const id of materials.keys())shade(id);};

  function resize(){
    const width=canvas.clientWidth||1,height=canvas.clientHeight||1;
    renderer.setSize(width,height,false);
    camera.aspect=width/height;camera.updateProjectionMatrix();
  }
  const observer=new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  function loop(){
    frame=requestAnimationFrame(loop);
    if(!canvas.clientWidth)return; // The pane is hidden: keep the loop alive but draw nothing.
    controls.update();
    renderer.render(scene,camera);
  }

  // A pointer that moved is an orbit; a pointer that stayed put is a choice.
  const pointer=new THREE.Vector2();
  const raycaster=new THREE.Raycaster();
  let down=null;
  canvas.addEventListener('pointerdown',event=>{down={x:event.clientX,y:event.clientY};});
  canvas.addEventListener('pointerup',event=>{
    if(!down)return;
    const moved=Math.hypot(event.clientX-down.x,event.clientY-down.y);
    down=null;
    if(moved>TAP_SLOP)return;
    const box=canvas.getBoundingClientRect();
    pointer.set((event.clientX-box.left)/box.width*2-1,-((event.clientY-box.top)/box.height)*2+1);
    raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects(pickable,false)[0];
    onPick(hit?hit.object.userData.muscle:null);
  });

  return {
    paint(next){heats=next;shadeAll();},
    select(id){const before=selected;selected=materials.has(id)?id:null;if(before)shade(before);if(selected)shade(selected);return selected;},
    // Spinning the model to a named side beats explaining that the back is round the other way.
    face(side){
      const radius=camera.position.distanceTo(controls.target);
      const angle=side==='back'?Math.PI:0;
      camera.position.set(Math.sin(angle)*radius,controls.target.y,Math.cos(angle)*radius);
      controls.update();
    },
    start(){if(running)return;running=true;resize();loop();},
    stop(){running=false;cancelAnimationFrame(frame);}
  };
}
