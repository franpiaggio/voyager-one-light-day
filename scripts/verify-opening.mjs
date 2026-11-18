import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
async function localModule(name){
 const source=fs.readFileSync(new URL(`../dist/${name}`,import.meta.url),'utf8').replace("from 'three'",`from '${new URL('../dist/vendor/three/build/three.module.js',import.meta.url).href}'`);
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const {sample,visual,timeAt,poseAt,cameraDistance,RADII}=await localModule('journey.js');
const {presentShip}=await localModule('ship-presentation.js');
const {createEarthMaterial}=await localModule('earth-material.js');
const data=JSON.parse(fs.readFileSync(new URL('../dist/data/ephemeris.json',import.meta.url)));
// Read the actual NASA model, including node transforms, rather than treating a
// tracker dot or the long antenna bounds as evidence that the dish is readable.
const glb=fs.readFileSync(new URL('../dist/assets/voyager.glb',import.meta.url));
const jsonLength=glb.readUInt32LE(12),gltf=JSON.parse(glb.subarray(20,20+jsonLength)),binStart=28+jsonLength;
const vertices=[],dish=[];
function visit(index,parent){
 const node=gltf.nodes[index],matrix=new THREE.Matrix4();
 if(node.matrix)matrix.fromArray(node.matrix);else matrix.compose(new THREE.Vector3(...(node.translation||[0,0,0])),new THREE.Quaternion(...(node.rotation||[0,0,0,1])),new THREE.Vector3(...(node.scale||[1,1,1])));
 matrix.premultiply(parent);
 for(const primitive of gltf.meshes[node.mesh]?.primitives||[]){
  const material=gltf.materials[primitive.material];if(material.alphaMode==='BLEND')continue;
  const accessor=gltf.accessors[primitive.attributes.POSITION],view=gltf.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType,5126);
  for(let i=0;i<accessor.count;i++){
   const offset=binStart+(view.byteOffset||0)+(accessor.byteOffset||0)+i*(view.byteStride||12);
   const point=new THREE.Vector3(glb.readFloatLE(offset),glb.readFloatLE(offset+4),glb.readFloatLE(offset+8)).applyMatrix4(matrix);
   vertices.push(point);if(material.name==='tex_02_AO')dish.push(point);
  }
 }
 for(const child of node.children||[])visit(child,matrix);
}
for(const root of gltf.scenes[gltf.scene||0].nodes)visit(root,new THREE.Matrix4());
const box=new THREE.Box3().setFromPoints(vertices),centre=box.getCenter(new THREE.Vector3()),span=box.getSize(new THREE.Vector3()).length();
for(const point of vertices)point.sub(centre);
for(const [width,height] of [[1920,1080],[390,844],[320,740]]){
 let minDish=Infinity,minCraft=Infinity,firstEarth=null,lastEarth=null,initialCraft=null,previousEmergenceSize=0;
 for(const p of [...new Set([0,.0145,.015,.03,.045,.055,...Array.from({length:59},(_,i)=>i*.00025),...Array.from({length:30},(_,i)=>(i+1)*.006)])].sort((a,b)=>a-b)){
  const positions=Object.fromEntries(Object.keys(data.bodies).map(key=>[key,visual(sample(data,key,timeAt(p)))]));
  const pose=poseAt(p,positions,false,width/height),camera=new THREE.PerspectiveCamera(43,width/height,.25,2500);
  camera.position.copy(pose.direction).multiplyScalar(cameraDistance(width/height));camera.lookAt(0,0,0);camera.updateMatrixWorld();
  if(p<=.055){assert.equal(pose.hero,1);assert.ok(Math.abs(pose.distance/RADII.earth-4.8)<1e-10,'no opening zoom before departure is established');}
  const factor=30/pose.distance,missionPosition=positions.voyager.clone().sub(pose.focus).multiplyScalar(factor),earth=positions.earth.clone().sub(pose.focus).multiplyScalar(factor),earthRadius=RADII.earth*factor;
  const presentation=presentShip({pose,missionPosition,camera,width,height,span,planetPosition:earth,planetRadius:earthRadius});
  const home=positions.earth.clone().sub(positions.voyager).normalize(),rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),home).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.65));
  function screenBounds(points){
   const projected=points.map(point=>point.clone().applyQuaternion(rotation).multiplyScalar(presentation.scale).add(presentation.position).project(camera));
   const bounds=new THREE.Box3().setFromPoints(projected);
   assert.ok(bounds.min.z>-1&&bounds.max.z<1,'spacecraft is not clipped');
   return {bounds,width:(bounds.max.x-bounds.min.x)*width/2,height:(bounds.max.y-bounds.min.y)*height/2};
  }
  const craft=screenBounds(vertices),antenna=screenBounds(dish);
  assert.ok(craft.bounds.min.x>-.96&&craft.bounds.max.x<.96&&craft.bounds.min.y>-.85&&craft.bounds.max.y<.85,`complete spacecraft stays in frame at ${width}×${height}, p=${p}: ${craft.bounds.min.toArray()} to ${craft.bounds.max.toArray()}`);
  if(p>.055)continue;
  const craftSize=Math.max(craft.width,craft.height);
  if(p===0){
   initialCraft=craftSize;
   assert.ok(craftSize>=4&&craftSize<35,'begin with a small but visible spacecraft');
   assert.ok(presentation.position.distanceTo(earth)<earthRadius*1.21,'the opening begins at the Earth, not in the foreground');
  }
  if(p<=.0145){assert.ok(craftSize>=previousEmergenceSize-.2,'spacecraft grows continuously into the foreground');previousEmergenceSize=craftSize;}
  if(p>=.0145){minCraft=Math.min(minCraft,craftSize);minDish=Math.min(minDish,Math.min(antenna.width,antenna.height));assert.equal(pose.departureReveal,1,'existing hero shot is fully restored after two seconds');}
  const shipDepth=presentation.position.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())),earthDepth=earth.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3()));
  assert.ok(shipDepth+span*presentation.scale/2<earthDepth-earthRadius,'Earth stays behind the foreground spacecraft');
  const apparentEarth=earthRadius/earthDepth;if(firstEarth===null)firstEarth=apparentEarth;lastEarth=apparentEarth;
  const depthStep=earthDepth**2*(camera.far-camera.near)/(camera.far*camera.near*2**24);
  assert.ok(earthRadius*.035>depthStep*20,'atmosphere separation exceeds depth quantization');
 }
 assert.ok(minCraft>Math.min(width,height)*.42,'Voyager must be a foreground subject, not a small dot');
 assert.ok(minDish>(width<701?45:90),'the dish itself must be recognizable');
 assert.ok(lastEarth<firstEarth*.7,'Earth visibly recedes while camera distance stays constant');
 console.log(`PASS: ${width}×${height} opening: ${initialCraft.toFixed(0)}px spacecraft emerges from Earth into ≥${minCraft.toFixed(0)}px hero; dish ≥${minDish.toFixed(0)}px; Earth shrinks to ${(lastEarth/firstEarth*100).toFixed(0)}% behind it; no camera pullback.`);
}
const material=createEarthMaterial({},new THREE.Vector3(1,0,0));
assert.equal(material.transparent,false);assert.equal(material.depthWrite,true);assert.ok(material.uniforms.cloudMap,'clouds are composited in the opaque terrain material');
console.log('PASS: Earth terrain/clouds share one opaque depth surface; foreground geometry and depth precision checked against the actual NASA model.');
