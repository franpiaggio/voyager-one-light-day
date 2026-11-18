import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
const root=path.resolve(import.meta.dirname,'../dist');
const journeySource=fs.readFileSync(path.join(root,'journey.js'),'utf8').replace("from 'three'",`from '${new URL('../dist/vendor/three/build/three.module.js',import.meta.url).href}'`);
const {EVENTS,AU,DAY,RADII,LIGHT_DAY_TIME,LAUNCH_TIME,timeAt,sample,visual,poseAt,cameraDistance,advanceProgress,travelRate,smoothTrajectory,encounterAt,planetTitleAt,setJourneyEnd,elapsedSinceLaunch}=await import('data:text/javascript;base64,'+Buffer.from(journeySource).toString('base64'));
const data=JSON.parse(fs.readFileSync(path.join(root,'data/ephemeris.json'),'utf8'));
const expected=[7631,679102637,1525067961,6054909538,18164521003,25902068371];
const xyz=t=>Object.fromEntries(Object.keys(data.bodies).map(k=>[k,visual(sample(data,k,t))]));
for(let i=0;i<EVENTS.length;i++){
 const t=timeAt(EVENTS[i].p);assert.ok(Math.abs(t-EVENTS[i].time)<1,'exact milestone time');
 const distance=sample(data,'voyager',t).distanceTo(sample(data,'earth',t))*AU;assert.ok(Math.abs(distance-expected[i])<2,`distance at event ${i}: ${distance}`);
}
let previousTime=0,previousDirection=null,previousDistance=0,maxZoomStep=0,maxZoomP=0,maxAngle=0,maxAngleP=0,minShipMargin=1,maxVertical=0,maxHorizontal=0;
for(let i=0;i<=3600;i++){
 const p=i/3600,t=timeAt(p);assert.ok(t>previousTime);previousTime=t;
 const positions=xyz(t),pose=poseAt(p,positions);
 assert.ok(Number.isFinite(pose.distance)&&pose.distance>0);assert.ok(pose.focus.toArray().every(Number.isFinite));
 assert.ok(Math.abs(pose.direction.length()-1)<1e-6);
 assert.ok(Math.hypot(pose.direction.x,pose.direction.z)>.08,'camera up-vector singularity');
 if(p>=.18&&pose.closeup===0)assert.ok(pose.focus.distanceTo(positions.voyager.clone().multiplyScalar(.72))<1e-10,'map follows Voyager with solar context');
 if(previousDistance&&Math.abs(Math.log(pose.distance/previousDistance))>maxZoomStep){maxZoomStep=Math.abs(Math.log(pose.distance/previousDistance));maxZoomP=p;}previousDistance=pose.distance;
 if(previousDirection&&previousDirection.angleTo(pose.direction)>maxAngle){maxAngle=previousDirection.angleTo(pose.direction);maxAngleP=p;}previousDirection=pose.direction;
 for(const aspect of [16/9,390/844]){
  const pose=poseAt(p,positions,false,aspect),cam=new THREE.PerspectiveCamera(43,aspect,.25,2500),factor=30/pose.distance;
  cam.position.copy(pose.direction).multiplyScalar(cameraDistance(aspect));cam.lookAt(0,0,0);cam.updateMatrixWorld();
  const ship=positions.voyager.clone().sub(pose.focus).multiplyScalar(factor),point=ship.clone().project(cam);
  // Voyager is the subject at every distance, including the full encounter.
  {
   assert.ok(point.z>-1&&point.z<1,`ship depth p=${p}`);maxHorizontal=Math.max(maxHorizontal,Math.abs(point.x));maxVertical=Math.max(maxVertical,Math.abs(point.y));
   assert.ok(Math.abs(point.x)<.78&&Math.abs(point.y)<.72,`ship outside tracking frame p=${p}, aspect=${aspect}, ${point.toArray()}`);
  }
  if(pose.closeup>0||p<=.055){
   const centre=positions[pose.body].clone().sub(pose.focus).multiplyScalar(factor),planet=centre.clone().project(cam);
   assert.ok(planet.z>-1&&planet.z<1&&Math.abs(planet.x)<.85&&Math.abs(planet.y)<.85,'closeup must keep its planet in frame');
   const extent=RADII[pose.body]*(pose.body==='saturn'?2.32:1)*factor,right=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,1);
   for(let j=0;j<12;j++){const angle=j/12*Math.PI*2,edge=centre.clone().addScaledVector(right,Math.cos(angle)*extent).addScaledVector(up,Math.sin(angle)*extent).project(cam);assert.ok(Math.abs(edge.x)<.83&&Math.abs(edge.y)<.8,`full ${pose.body} stays framed at p=${p}, aspect=${aspect}, edge=${edge.toArray()}`);}
   if(pose.closeup>.9||p<=.055){
    const ray=new THREE.Ray(cam.position,ship.clone().sub(cam.position).normalize()),hit=ray.intersectSphere(new THREE.Sphere(centre,RADII[pose.body]*factor),new THREE.Vector3());
    assert.ok(!hit||hit.distanceTo(cam.position)>ship.distanceTo(cam.position),'planet must not occlude Voyager during closeup');
    if(pose.body==='saturn'){
     const normal=new THREE.Vector3(0,1,0).applyEuler(new THREE.Euler(.15,0,.45)),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,centre),ringHit=ray.intersectPlane(plane,new THREE.Vector3());
     if(ringHit&&ringHit.distanceTo(cam.position)<ship.distanceTo(cam.position)){const r=ringHit.distanceTo(centre)/(RADII.saturn*factor);assert.ok(r<1.24||r>2.32,'Saturn rings must not hide Voyager');}
    }
   }
  }
  // Verify the camera itself cannot cross a nearby planetary surface during a shot.
  const worldCam=cam.position.clone().divideScalar(factor).add(pose.focus);
  for(const key of ['earth','jupiter','saturn']){const separation=worldCam.distanceTo(positions[key]);assert.ok(separation>RADII[key]*1.04,`camera inside ${key} at ${p}`);}
 }
}
assert.ok(maxAngle<.18,`abrupt camera rotation ${maxAngle} at ${maxAngleP}, ${new Date(timeAt(maxAngleP)).toISOString()}`);
for(const p of [.18,.3,.4,.5,.66,.8,1])assert.ok(poseAt(p,xyz(timeAt(p))).direction.angleTo(poseAt(.18,xyz(timeAt(.18))).direction)<1e-6,'map and flyby compass stays fixed');
assert.ok(maxZoomStep<.6,`discontinuous timeline zoom ${maxZoomStep} at ${maxZoomP}`);
assert.ok(Math.abs(sample(data,'voyager',EVENTS[5].time).distanceTo(sample(data,'earth',EVENTS[5].time))*AU/299792.458-86400)<.01);
const checked=new Set();
function checkImport(file){if(checked.has(file))return;assert.ok(fs.existsSync(file),`missing module ${file}`);checked.add(file);for(const [,dep] of fs.readFileSync(file,'utf8').matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){let resolved;if(dep==='three')resolved=path.join(root,'vendor/three/build/three.module.js');else if(dep.startsWith('three/addons/'))resolved=path.join(root,'vendor/three/examples/jsm',dep.slice(13));else if(dep.startsWith('.'))resolved=path.resolve(path.dirname(file),dep);if(resolved)checkImport(resolved);}}
checkImport(path.join(root,'app.js'));
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const [,id] of fs.readFileSync(path.join(root,'app.js'),'utf8').matchAll(/\$\('([^']+)'\)/g))assert.ok(html.includes(`id="${id}"`),`missing UI target ${id}`);
console.log(`PASS: 6 exact milestones; 3,601 monotonic dates and camera poses; desktop + mobile framing; no camera/planet collisions or spacecraft occultations; ${checked.size} module dependencies.`);
console.log(`Uniform-timeline samples: max log zoom step ${maxZoomStep.toFixed(3)}, max camera turn ${(maxAngle*180/Math.PI).toFixed(2)}°; max viewport fractions x=${maxHorizontal.toFixed(3)}, y=${maxVertical.toFixed(3)}.`);

// Test the animated schedule, not just uniformly sampled timeline positions.
let playhead=0,seconds=0,priorPose=null,peakZoom=0,peakTurn=0,earthDeparture=0;
const departureStats={jupiter:{close:0,pullback:0,approach:0,oldApproach:0,oldPullback:0,peakZoom:0},saturn:{close:0,pullback:0,approach:0,oldApproach:0,oldPullback:0,peakZoom:0}};
const dwell={launch:0,jupiter:0,saturn:0,cruise:0,earthToJupiter:0,jupiterToSaturn:0};
while(playhead<1&&seconds<240){
 const next=advanceProgress(playhead,.05),currentPose=poseAt(next,xyz(timeAt(next)));
 assert.ok(next>playhead,'automatic playback must always progress');
 if(priorPose){peakZoom=Math.max(peakZoom,Math.abs(Math.log(currentPose.distance/priorPose.distance)));peakTurn=Math.max(peakTurn,currentPose.direction.angleTo(priorPose.direction));}
 if(next<.055){earthDeparture+=.05;assert.equal(currentPose.mapBlend,0,'stay with Earth departure before opening the map');}
 for(const [event,body] of [[EVENTS[1],'jupiter'],[EVENTS[2],'saturn']]){
  if(playhead>=event.p-.065&&playhead<event.p-.006)departureStats[body].oldApproach+=.05;
  if(playhead>=event.p+.02&&playhead<event.p+.095)departureStats[body].oldPullback+=.05;
  if(playhead<event.p-.006&&currentPose.body===body&&currentPose.closeup>0)departureStats[body].approach+=.05;
  if(playhead>=event.p&&playhead<event.p+.02)departureStats[body].close+=.05;
  if(playhead>=event.p+.02&&currentPose.body===body&&currentPose.closeup>0){
   departureStats[body].pullback+=.05;
   if(priorPose)departureStats[body].peakZoom=Math.max(departureStats[body].peakZoom,Math.log(currentPose.distance/priorPose.distance));
  }
 }
 if(playhead<.18)dwell.launch+=.05;else if(playhead>=.335&&playhead<=.495)dwell.jupiter+=.05;else if(playhead>=.595&&playhead<=.755)dwell.saturn+=.05;else dwell.cruise+=.05;
 if(playhead>=.18&&playhead<.335)dwell.earthToJupiter+=.05;
 if(playhead>.495&&playhead<.595)dwell.jupiterToSaturn+=.05;
 priorPose=currentPose;playhead=next;seconds+=.05;
}
assert.equal(playhead,1,'tour reaches the final milestone');
assert.ok(seconds<65&&seconds>45,`unexpected overall pacing: ${seconds}s`);
assert.ok(dwell.jupiter>13&&dwell.jupiter<19&&dwell.saturn>13&&dwell.saturn<19,'flybys include the turn and an unhurried pullback');
assert.ok(dwell.earthToJupiter<3.5&&dwell.jupiterToSaturn<3.5,'empty interplanetary legs must stay short');
assert.ok(travelRate(.23)>travelRate(EVENTS[1].p)*6,'cruise is substantially faster than Jupiter');
assert.ok(travelRate(.85)>travelRate(EVENTS[2].p)*6,'interstellar cruise is faster than Saturn');
assert.ok(peakTurn<.18,`automatic pace creates camera turn ${peakTurn}`);
assert.ok(peakZoom<.38,`automatic pace creates zoom jump ${peakZoom}`);
console.log(`PASS: adaptive tour ${seconds.toFixed(1)}s; launch ${dwell.launch.toFixed(1)}s, Jupiter ${dwell.jupiter.toFixed(1)}s, Saturn ${dwell.saturn.toFixed(1)}s; peak 50ms zoom ${peakZoom.toFixed(3)}, turn ${(peakTurn*180/Math.PI).toFixed(2)}°.`);
console.log(`PASS: cruise Earth→Jupiter ${dwell.earthToJupiter.toFixed(1)}s; Jupiter→Saturn ${dwell.jupiterToSaturn.toFixed(1)}s; Voyager-led map between closeups; map/flyby compass stays fixed.`);
assert.ok(earthDeparture>7&&earthDeparture<9,'linger with Voyager leaving Earth');
const departurePositions=xyz(timeAt(.055));
assert.ok(departurePositions.voyager.distanceTo(departurePositions.earth)>RADII.earth*7,'Earth recedes before the map reveal');
console.log(`PASS: ${earthDeparture.toFixed(1)}s with Earth departure before the solar-map pullback.`);
for(const [event,body] of [[EVENTS[1],'jupiter'],[EVENTS[2],'saturn']]){
 const stats=departureStats[body];
 assert.ok(Math.abs(stats.approach/stats.oldApproach-.5)<.025,'zoom-in takes half the previous viewing duration');
 assert.ok(stats.oldPullback-stats.pullback<2,'the cruise after each pullback resumes quickly instead of lingering on a static map');
 console.log(`${body}: zoom-in ${stats.approach.toFixed(2)}s (was ${stats.oldApproach.toFixed(2)}s); zoom-out ${stats.pullback.toFixed(2)}s, then ${(stats.oldPullback-stats.pullback).toFixed(2)}s until full cruise.`);
 assert.ok(stats.close>3.5,'keep the spacecraft close after periapsis');
 assert.ok(stats.pullback>3&&stats.pullback<3.4,'planet pullbacks must take half their former duration at 1×');
 assert.ok(stats.peakZoom<.28,`pullback is too abrupt: ${body} ${stats.peakZoom}`);
 const turnTime=timeAt(event.p+.02),relative=t=>sample(data,'voyager',t).sub(sample(data,body,t)),velocity=t=>relative(t+60000).sub(relative(t-60000)).normalize();
 const turn=velocity(event.time-12*3600000).angleTo(velocity(turnTime))*180/Math.PI;
 assert.ok(turn>40,'a clear direction change precedes the pullback');
 assert.equal(poseAt(event.p+.02,xyz(turnTime)).closeup,1,'retain the close shot through the bend');
 console.log(`PASS: ${body} stays close ${stats.close.toFixed(1)}s after encounter; ${turn.toFixed(1)}° turn before its ${stats.pullback.toFixed(1)}s pullback, max 50ms zoom ${stats.peakZoom.toFixed(3)}.`);
}
for(const [index,body] of [[1,'jupiter'],[2,'saturn']]){
 const p=EVENTS[index].p;
 assert.deepEqual(planetTitleAt(p),{name:EVENTS[index].name,opacity:1},'only the arriving planet name appears at encounter');
 assert.equal(planetTitleAt(p-.006).opacity,1,'title is legible before closest approach');
 assert.equal(planetTitleAt(p+.02).opacity,1,'title remains while Voyager makes the turn');
 assert.deepEqual(planetTitleAt(p,true),{name:'',opacity:0},'overview suppresses the encounter title');
 assert.equal(encounterAt(p).body,body);assert.equal(encounterAt(p).strength,1,'encounter effect peaks at the exact milestone');
 assert.ok(encounterAt(p+.014).pulse>encounterAt(p).pulse,'pulse expands after closest approach');
 assert.equal(encounterAt(p-.03).strength,0);assert.equal(encounterAt(p+.03).strength,0,'effect clears outside encounter');
 const positions=xyz(timeAt(p)),pose=poseAt(p,positions),extent=RADII[body]*(body==='saturn'?2.32:1);
 assert.ok(pose.closeup>.98,'planet remains in closeup while Voyager passes');
 for(const aspect of [16/9,390/844]){
  const pose=poseAt(p,positions,false,aspect),cam=new THREE.PerspectiveCamera(43,aspect,.25,2500);cam.position.copy(pose.direction).multiplyScalar(cameraDistance(aspect));cam.lookAt(0,0,0);cam.updateMatrixWorld();
  const right=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,1),radius=extent*30/pose.distance,centre=positions[body].clone().sub(pose.focus).multiplyScalar(30/pose.distance);
  let minY=1,maxY=-1;
  for(let i=0;i<64;i++){const a=i/64*Math.PI*2,point=centre.clone().addScaledVector(right,Math.cos(a)*radius).addScaledVector(up,Math.sin(a)*radius).project(cam);assert.ok(Math.abs(point.x)<.85&&Math.abs(point.y)<.85,`${body} or rings cropped`);minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);}
  assert.ok((maxY-minY)/2/Math.min(1,aspect)>.19,`${body} too small to be a closeup`);
 }
 let cursor=p-.065,elapsed=0,closest={distance:Infinity},arrival=0,priorRelative=null,minimumMotion=Infinity;
 while(cursor<p+.04){
  const previous=cursor;cursor=advanceProgress(cursor,.05);elapsed+=.05;
  const pos=xyz(timeAt(cursor)),shot=poseAt(cursor,pos);
  if(previous<p&&cursor>=p)arrival=elapsed;
  if(shot.distance<closest.distance)closest={distance:shot.distance,progress:cursor,elapsed};
  if(shot.closeup>.9){
   const relativeCamera=shot.direction.clone().multiplyScalar(shot.distance).add(shot.focus).sub(pos[body]).divideScalar(extent);
   if(priorRelative)minimumMotion=Math.min(minimumMotion,relativeCamera.distanceTo(priorRelative));priorRelative=relativeCamera;
  }else priorRelative=null;
 }
 const lead=arrival-closest.elapsed;
 assert.ok(Math.abs(closest.progress-p)<.021,'tightest framing follows the physical encounter');
 assert.ok(poseAt(p-.006,xyz(timeAt(p-.006))).closeup>.95,'zoom is already established on the approach');
 assert.ok(travelRate(p+.06)>travelRate(p)*2,'departure visibly accelerates away');
 assert.ok(minimumMotion>.0001,'camera must keep passing, not hold still relative to the planet');
 console.log(`PASS: ${body} tightest framing relative to arrival ${(-lead).toFixed(1)}s; continuous passage, minimum motion ${minimumMotion.toFixed(4)} planet/ring radii per 50ms.`);
 assert.equal(poseAt(p,positions,true).closeup,0,'overview remains available during flyby');
}
console.log('PASS: Voyager and planet/rings remain framed together on desktop and portrait, with overview override.');
for(const p of [0,.01,.18,.27,.52,.79,.85,.93,1])assert.deepEqual(planetTitleAt(p),{name:'',opacity:0},'no encounter text during departure, cruise or finale');
for(const event of [EVENTS[1],EVENTS[2]]){
 let previous=0;
 for(let i=0;i<=100;i++){const p=event.p-.065+i*.065/100,opacity=planetTitleAt(p).opacity;assert.ok(opacity>=previous&&opacity<=1,'title fades in monotonically');previous=opacity;}
 for(let i=0;i<=100;i++){const p=event.p+i*.095/100,opacity=planetTitleAt(p).opacity;assert.ok(opacity<=previous&&opacity>=0,'title fades away during departure');previous=opacity;}
 assert.equal(previous,0,'title fully clears before the next cruise');
}
console.log('PASS: minimal Jupiter/Saturn titles fade on approach, remain through the turn, clear on departure and on overview/seek.');

const today=Date.parse('2026-11-17T19:30:00Z');
setJourneyEnd(today);assert.equal(timeAt(1),today,'finish at today, not the future light-day milestone');
assert.deepEqual(elapsedSinceLaunch(timeAt(1)),{years:49,months:2,days:12});
assert.deepEqual(elapsedSinceLaunch(LAUNCH_TIME),{years:0,months:0,days:0});
assert.deepEqual(elapsedSinceLaunch(Date.parse('2024-03-04T12:56:00Z')),{years:46,months:5,days:28},'calendar calculation includes leap February');
assert.deepEqual(elapsedSinceLaunch(Date.parse('2026-11-17T12:55:00Z')),{years:49,months:2,days:11},'only complete days since the real launch time');
setJourneyEnd(Date.parse('2027-01-01T00:00:00Z'));assert.equal(timeAt(1),LIGHT_DAY_TIME,'never extrapolate beyond supplied data');assert.equal(EVENTS.at(-1).name,'Latest data');
setJourneyEnd(LIGHT_DAY_TIME);
console.log('PASS: present-day endpoint, final elapsed calendar duration, launch clock, leap year and ephemeris coverage cap.');

// Independent dense samples bound the line error between generated vertices.
// This catches visible chords at the flyby and any planet-cutting interpolation.
for(const [body,event,before,after] of [['earth',EVENTS[0],0,5],['jupiter',EVENTS[1],16,16],['saturn',EVENTS[2],14,14]]){
 const rows=smoothTrajectory(data,{body,start:event.time-before*DAY,end:event.time+after*DAY});
 let maxError=0,maxBend=0;
 for(let i=1;i<rows.length;i++){
  const a=rows[i-1],b=rows[i];assert.ok(b.time>a.time);
  for(const u of [.125,.375,.625,.875]){
   const t=a.time+(b.time-a.time)*u,exact=visual(sample(data,'voyager',t).sub(sample(data,body,t))),linear=a.position.clone().lerp(b.position,u);
   const relativeError=exact.distanceTo(linear)/exact.length();maxError=Math.max(maxError,relativeError);
   assert.ok(relativeError<.00016,`visible ${body} chord: ${relativeError}`);
   assert.ok(linear.length()>RADII[body],'trail cuts through planet');
  }
  if(i<rows.length-1){const incoming=b.position.clone().sub(a.position),outgoing=rows[i+1].position.clone().sub(b.position);maxBend=Math.max(maxBend,incoming.angleTo(outgoing));}
 }
 assert.ok(maxBend<.035,`${body} has an angular line join: ${maxBend}`);
 console.log(`PASS: ${body} curve ${rows.length} vertices, max interpolation error ${(maxError*100).toFixed(4)}%, max joint ${(maxBend*180/Math.PI).toFixed(2)}°.`);
}
