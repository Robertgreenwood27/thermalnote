// Turns the Z-Anatomy model from body-anatomy-3d-viewer into the muscles-only model the
// Body view loads. Run once when the source model changes; the result is committed.
//
//   git clone --depth 1 https://github.com/hpfrei/body-anatomy-3d-viewer.git /tmp/bav
//   node tools/build-body-model.mjs --source /tmp/bav/public
//
// Three things shrink the file from 7.9 MB to about 2.4 MB, and all three are choices
// the app can afford:
//   - Bones are dropped. This view is about muscles; the skeleton would only hide them.
//   - The anatomy encyclopedia in each node's extras is dropped. 6.8 MB of the source file
//     is Wikipedia prose that a training log never shows. Only the anatomical part name
//     survives, because public/muscles.js maps those names to trainable muscles.
//   - DRACO compression is decoded here rather than in the browser. The runtime decoder
//     needs a blob: worker and WebAssembly, and the app's Content-Security-Policy allows
//     neither; paying the bytes once is cheaper than opening script-src. Normals are
//     dropped with it and recomputed at load, which costs nothing visually on organic
//     shapes and saves another 1.3 MB.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argument=name=>{const at=process.argv.indexOf(name);return at>0?process.argv[at+1]:undefined;};
const source=argument('--source')||path.join(project,'..','body-anatomy-3d-viewer','public');
const out=argument('--out')||path.join(project,'public','body-muscles.glb');
const base=name=>name.replace(/\.\d+$/,'');

function readGLB(bytes){
  if(bytes.readUInt32LE(0)!==0x46546c67)throw Error('Not a GLB file.');
  const jsonLength=bytes.readUInt32LE(12);
  const json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  const binaryStart=20+jsonLength+8;
  return {json,binary:bytes.subarray(binaryStart,binaryStart+bytes.readUInt32LE(20+jsonLength))};
}
function writeGLB(json,binary){
  const jsonBytes=Buffer.from(JSON.stringify(json));
  const jsonPadded=Buffer.concat([jsonBytes,Buffer.alloc((4-jsonBytes.length%4)%4,0x20)]);
  const binaryPadded=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);
  const header=Buffer.alloc(12);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);
  header.writeUInt32LE(12+8+jsonPadded.length+8+binaryPadded.length,8);
  const chunk=(length,type)=>{const head=Buffer.alloc(8);head.writeUInt32LE(length,0);head.writeUInt32LE(type,4);return head;};
  return Buffer.concat([header,chunk(jsonPadded.length,0x4e4f534a),jsonPadded,chunk(binaryPadded.length,0x004e4942),binaryPadded]);
}

// One decode per primitive: positions as floats, triangle indices as-is.
function decodePrimitive(draco,decoder,bytes,attributeIds){
  const buffer=new draco.DecoderBuffer();
  buffer.Init(new Int8Array(bytes),bytes.length);
  const mesh=new draco.Mesh();
  const status=decoder.DecodeBufferToMesh(buffer,mesh);
  if(!status.ok())throw Error(`DRACO decode failed: ${status.error_msg()}`);
  const attribute=decoder.GetAttributeByUniqueId(mesh,attributeIds.POSITION);
  const values=new draco.DracoFloat32Array();
  decoder.GetAttributeFloatForAllPoints(mesh,attribute,values);
  const positions=new Float32Array(values.size());
  for(let i=0;i<positions.length;i++)positions[i]=values.GetValue(i);
  const faces=mesh.num_faces(),points=mesh.num_points();
  // Below 65536 points an unsigned short index is exact and half the size.
  const indices=points<65536?new Uint16Array(faces*3):new Uint32Array(faces*3);
  const face=new draco.DracoInt32Array();
  for(let i=0;i<faces;i++){decoder.GetFaceFromMesh(mesh,i,face);indices[i*3]=face.GetValue(0);indices[i*3+1]=face.GetValue(1);indices[i*3+2]=face.GetValue(2);}
  draco.destroy(face);draco.destroy(values);draco.destroy(mesh);draco.destroy(buffer);
  return {positions,indices,points};
}

const require=createRequire(import.meta.url);
const draco=await require(path.join(source,'libs','draco','draco_decoder.js'))();
const {json,binary}=readGLB(await readFile(path.join(source,'body.glb')));

const output={
  asset:{version:'2.0',generator:'thermalnote build-body-model'},
  scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],accessors:[],bufferViews:[],buffers:[],
  materials:[{name:'Muscle',doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[0.25,0.08,0.05,1],metallicFactor:0,roughnessFactor:0.6}}]
};
const chunks=[];
let offset=0;
function addView(typed){
  const bytes=Buffer.from(typed.buffer,typed.byteOffset,typed.byteLength);
  const padding=(4-offset%4)%4;
  if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}
  chunks.push(bytes);
  output.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});
  offset+=bytes.length;
  return output.bufferViews.length-1;
}
function addAccessor(view,componentType,count,type,extra={}){
  output.accessors.push({bufferView:view,componentType,count,type,...extra});
  return output.accessors.length-1;
}

let kept=0,skipped=0;
for(const node of json.nodes){
  if(node.extras?.type!=='muscle'||node.mesh===undefined){skipped++;continue;}
  const primitives=[];
  for(const primitive of json.meshes[node.mesh].primitives){
    const compression=primitive.extensions?.KHR_draco_mesh_compression;
    if(!compression)throw Error(`Primitive of ${node.name} is not DRACO compressed; this script only handles the published model.`);
    const view=json.bufferViews[compression.bufferView];
    const start=view.byteOffset||0;
    const {positions,indices,points}=decodePrimitive(draco,new draco.Decoder(),binary.subarray(start,start+view.byteLength),compression.attributes);
    let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<positions.length;i+=3)for(let axis=0;axis<3;axis++){
      min[axis]=Math.min(min[axis],positions[i+axis]);max[axis]=Math.max(max[axis],positions[i+axis]);
    }
    primitives.push({
      attributes:{POSITION:addAccessor(addView(positions),5126,points,'VEC3',{min,max})},
      indices:addAccessor(addView(indices),indices.BYTES_PER_ELEMENT===2?5123:5125,indices.length,'SCALAR'),
      material:0,mode:4
    });
  }
  output.meshes.push({primitives});
  // `part` is the join to public/muscles.js. The numeric suffix Blender gives the left and
  // right copy of a muscle is noise here, so it is stripped.
  const fresh={name:node.name,mesh:output.meshes.length-1,extras:{part:base(node.name)}};
  for(const key of ['translation','rotation','scale','matrix'])if(node[key])fresh[key]=node[key];
  output.nodes.push(fresh);
  output.scenes[0].nodes.push(output.nodes.length-1);
  kept++;
}

const buffer=Buffer.concat(chunks);
output.buffers.push({byteLength:buffer.length});
const glb=writeGLB(output,buffer);
await writeFile(out,glb);
const parts=new Set(output.nodes.map(node=>node.extras.part));
console.log(`${kept} muscle meshes (${parts.size} distinct parts), ${skipped} nodes dropped.`);
console.log(`${out} — ${(glb.length/1048576).toFixed(2)} MB`);
