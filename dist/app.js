import { setupPhotos } from './photos.js';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CinemaShader, sunIsOccluded } from './cinema-post.js';
import { createStarField } from './starfield.js';
import { createEarthMaterial } from './earth-material.js';
import { presentShip } from './ship-presentation.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { AU, DAY, EVENTS, RADII, timeAt, sample, visual, poseAt, cameraDistance, advanceProgress, travelRate, smoothTrajectory, encounterAt, planetTitleAt, setJourneyEnd } from './journey.js';

const $=id=>document.getElementById(id), mobile=()=>innerWidth<701;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const dateFormat=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
const number=new Intl.NumberFormat('en-GB',{maximumFractionDigits:0});
const textureLoader=new THREE.TextureLoader(),cache={},bodies={},positions={},orbits=[],localArcs={};
const minimumRadius={sun:.065,mercury:.018,venus:.022,earth:.032,mars:.02,jupiter:.05,saturn:.045,uranus:.028,neptune:.028};
let photos;
let data,renderer,scene,camera,controls,composer,bloomPass,cinemaPass,keyLight,mapLight,ship,earthMaterial,starField;
let progress=0,playbackSpeed=1,playing=false,ready=false,overview=false,autoCamera=true,lastFrame=0,lastUI=0,pose,timelinePreview=null,encounter=encounterAt(0);
let distanceLine,flownPath,nearPast,nearFuture,activeTrail,trajectoryPositions,trajectoryTimes;
const WORLD_DISTANCE=30;
const origin=new THREE.Vector3(),targetCamera=new THREE.Vector3(),sunDirection=new THREE.Vector3(),zero=new THREE.Vector3();

function setupScene(){
 renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,mobile()?1.7:1.5));renderer.setSize(innerWidth,innerHeight);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;$('scene').append(renderer.domElement);
 scene=new THREE.Scene();scene.background=new THREE.Color(0x030509);
 const environment=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);
 scene.environment=pmrem.fromScene(environment,.04).texture;scene.environmentIntensity=.55;environment.dispose();pmrem.dispose();
 camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.25,2500);camera.position.set(0,0,30);
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.065;controls.enablePan=false;controls.minDistance=7;controls.maxDistance=160;controls.rotateSpeed=.4;controls.zoomSpeed=.65;
 controls.addEventListener('start',()=>{const wasPlaying=playing;setPlaying(false);autoCamera=false;if(wasPlaying&&progress<1)showResume(true);});
 keyLight=new THREE.DirectionalLight(0xffeddb,3.2);keyLight.position.set(-20,12,30);keyLight.castShadow=true;keyLight.shadow.mapSize.set(2048,2048);
 Object.assign(keyLight.shadow.camera,{left:-20,right:20,top:20,bottom:-20,near:.1,far:110});keyLight.shadow.normalBias=.008;keyLight.shadow.bias=-.0001;
 scene.add(keyLight,new THREE.HemisphereLight(0x9eb5d7,0x131724,.4));
 mapLight=new THREE.PointLight(0xffeddb,0,0,0);scene.add(mapLight);
 const rim=new THREE.DirectionalLight(0xa2bbdc,.6);rim.position.set(6,4,-20);scene.add(rim);
 const gl=renderer.getContext(),sampleOptions=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES)||[]).filter(n=>n>0&&n<=4);
 const samples=sampleOptions.length?(mobile()?Math.min(...sampleOptions):Math.max(...sampleOptions)):0;
 const renderTarget=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType,samples});
 composer=new EffectComposer(renderer,renderTarget);composer.addPass(new RenderPass(scene,camera));
 bloomPass=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.34,.78,1.05);
 bloomPass.highPassUniforms.smoothWidth.value=.35;
 bloomPass.bloomTintColors.forEach((tint,i)=>tint.set(1,.99-i*.012,.97-i*.024));composer.addPass(bloomPass);
 cinemaPass=new ShaderPass(CinemaShader);cinemaPass.material.toneMapped=false;cinemaPass.uniforms.detailStrength.value=mobile()?0:.13;composer.addPass(cinemaPass);composer.addPass(new OutputPass());
 composer.setSize(innerWidth,innerHeight);renderer.getDrawingBufferSize(cinemaPass.uniforms.resolution.value);
}
function loadTexture(name,color=true){return new Promise((resolve,reject)=>textureLoader.load(`./assets/${name}`,t=>{
 const isSky=name.startsWith('milky-way-');
 const limit=Math.min(renderer.capabilities.maxTextureSize,isSky?(mobile()?4096:6000):(mobile()?2048:4096));
 if(t.image.width>limit){const c=document.createElement('canvas');c.width=limit;c.height=Math.round(t.image.height*limit/t.image.width);const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(t.image,0,0,c.width,c.height);t.image=c;t.needsUpdate=true;}
 if(color)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;resolve(t);
},undefined,reject));}

function atmosphere(radius,color,power=3.6,strength=1,lightDirection=sunDirection,singleShell=false){
 const group=new THREE.Group();
 for(const outer of (singleShell?[true]:[false,true])){
  const material=new THREE.ShaderMaterial({
   uniforms:{tint:{value:new THREE.Color(color)},sunDir:{value:lightDirection},power:{value:power},strength:{value:strength*(outer?.65:1)}},
   vertexShader:`varying vec3 vNormal;varying vec3 vWorldNormal;varying vec3 vEye;
   void main(){vec4 p=modelViewMatrix*vec4(position,1.0);vNormal=normalize(normalMatrix*normal);vWorldNormal=normalize(mat3(modelMatrix)*normal);vEye=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,
   fragmentShader:`varying vec3 vNormal;varying vec3 vWorldNormal;varying vec3 vEye;
   uniform vec3 tint;uniform vec3 sunDir;uniform float power;uniform float strength;
   void main(){float limb=pow(1.0-abs(dot(normalize(vNormal),normalize(vEye))),power);
   float sun=dot(normalize(vWorldNormal),normalize(sunDir));float day=smoothstep(-.24,.65,sun);
   float dusk=(1.0-smoothstep(.025,.24,abs(sun)))*.18;
   vec3 scatter=mix(tint,vec3(.74,.33,.16),dusk);
   gl_FragColor=vec4(scatter*1.65,limb*(.035+.57*day)*strength);}`,
   transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:outer?THREE.BackSide:THREE.FrontSide
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(radius*(singleShell?1.035:outer?1.025:1.006),96,64),material));
 }
 return group;
}
function buildPlanet(name,radius,high=true){
  const group=new THREE.Group(),localSun=new THREE.Vector3();group.userData.sunDirection=localSun;
  let material;
  if(name==='earth'&&high){
    material=createEarthMaterial(cache,localSun);earthMaterial=material;
  }else material=new THREE.MeshStandardMaterial({map:cache[`${name}.jpg`],roughness:1,metalness:0});
  const sphere=new THREE.Mesh(new THREE.SphereGeometry(radius,high?128:40,high?96:28),material);sphere.castShadow=name==='saturn';sphere.receiveShadow=name==='saturn';sphere.rotation.y=.6;group.add(sphere);group.userData.sphere=sphere;
  if(name==='earth'&&high)group.add(atmosphere(radius,0x408bdf,3.4,.75,localSun,true));
  if(name==='jupiter'&&high)group.add(atmosphere(radius,0xd0b493,5,.32,localSun));
  if(name==='saturn'){
    if(high)group.add(atmosphere(radius,0xd8bd90,5,.28,localSun));
    const geo=new THREE.RingGeometry(radius*1.24,radius*2.32,high?256:96,8);const pos=geo.attributes.position,uv=geo.attributes.uv;
    for(let i=0;i<pos.count;i++){const r=Math.hypot(pos.getX(i),pos.getY(i));uv.setXY(i,(r/radius-1.24)/(2.32-1.24),.5);}
    const ring=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:cache['saturn-ring.png'],side:THREE.DoubleSide,transparent:true,opacity:.94,roughness:1,alphaTest:.015,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.castShadow=true;ring.receiveShadow=true;group.add(ring);group.rotation.z=.45;group.rotation.x=.15;
  }
  group.userData.atmospheres=[];group.traverse(object=>{const uniform=object.material?.uniforms?.strength;if(uniform)group.userData.atmospheres.push({uniform,base:uniform.value});});
  return group;
}
function makePath(capacity,color,opacity){
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
 const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false}));line.frustumCulled=false;scene.add(line);return line;
}
function setupWorld(){
 const openingPositions=Object.fromEntries(['earth','voyager'].map(body=>[body,visual(sample(data,body,timeAt(.025)))]));
 const openingForward=poseAt(.025,openingPositions).direction.negate();
 starField=createStarField(cache['milky-way-eso-6k.jpg'],renderer.getPixelRatio(),mobile(),openingForward);scene.add(starField);
 for(const key of Object.keys(RADII)){
  let object;
  if(key==='sun')object=new THREE.Mesh(new THREE.SphereGeometry(1,40,32),new THREE.MeshBasicMaterial({color:new THREE.Color(4.5,3,1.6)}));
  else object=buildPlanet(key,1,['earth','jupiter','saturn'].includes(key));
  bodies[key]=object;scene.add(object);if(key!=='sun')createOrbit(key);
 }
 distanceLine=makePath(2,0xe8c997,0);distanceLine.material.depthTest=false;distanceLine.renderOrder=3;
 const trajectory=smoothTrajectory(data);
 trajectoryPositions=trajectory.map(row=>row.position);trajectoryTimes=trajectory.map(row=>row.time);
 flownPath=makePath(trajectoryPositions.length+1,0xc5ae88,.85);
 for(const [body,center,before,after] of [['earth',EVENTS[0].time,0,5],['jupiter',EVENTS[1].time,16,16],['saturn',EVENTS[2].time,14,14]]){
  const start=center-before*DAY,end=center+after*DAY;
  localArcs[body]=smoothTrajectory(data,{body,start,end});
 }
 const capacity=Math.max(...Object.values(localArcs).map(rows=>rows.length))+2;
 nearPast=makePath(capacity,0xc5ae88,.85);nearFuture=makePath(capacity,0x8c9db8,.17);
 activeTrail=makePath(97,0xffffff,.95);activeTrail.renderOrder=2;activeTrail.material.vertexColors=true;
 const colors=new Float32Array(97*3);
 for(let i=0;i<97;i++){const gain=.08+Math.pow(i/96,1.7)*1.35;colors.set([gain,gain*.77,gain*.43],i*3);}
 activeTrail.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
}
function createOrbit(name){
 const row=data.bodies[name][0],r=new THREE.Vector3(...row.slice(1,4)),v=new THREE.Vector3(...row.slice(4,7)),mu=.0002959122082855911;
 const h=new THREE.Vector3().crossVectors(r,v),evec=new THREE.Vector3().crossVectors(v,h).divideScalar(mu).sub(r.clone().normalize()),e=evec.length(),p=h.lengthSq()/mu;
 const axis=evec.clone().normalize(),side=new THREE.Vector3().crossVectors(h.clone().normalize(),axis),points=[];
 for(let i=0;i<=1024;i++){const a=i/1024*Math.PI*2,rr=p/(1+e*Math.cos(a));points.push(visual(axis.clone().multiplyScalar(rr*Math.cos(a)).addScaledVector(side,rr*Math.sin(a))));}
 orbits.push({name,points,line:makePath(points.length,0x6e809c,.2)});
}
async function setupShip(){
 const gltf=await new GLTFLoader().loadAsync('./assets/voyager.glb');ship=new THREE.Group();const model=gltf.scene;ship.add(model);scene.add(ship);
 const bounds=new THREE.Box3().setFromObject(model);model.position.sub(bounds.getCenter(new THREE.Vector3()));
 ship.userData.span=bounds.getSize(new THREE.Vector3()).length();
 model.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;for(const m of (Array.isArray(o.material)?o.material:[o.material])){if(m.transparent)m.depthWrite=false;if(m.name==='clear')m.colorWrite=false;if(m.map)m.map.anisotropy=4;if(m.metalness!==undefined)m.metalness=Math.min(m.metalness,.8);if(m.roughness!==undefined)m.roughness=Math.max(m.roughness,.3);}}});
}
function writePoint(attribute,index,point,scale){attribute.setXYZ(index,(point.x-origin.x)*scale,(point.y-origin.y)*scale,(point.z-origin.z)*scale);}
function updatePaths(t,scale){
 const pathReveal=1-(pose.hero||0);
 const local=localArcs[pose.body],localWeight=local&&!overview?1-THREE.MathUtils.smoothstep(pose.distance,.03,.20):0;
 flownPath.material.opacity=.27*(1-localWeight)*pathReveal;flownPath.visible=localWeight<.999;nearPast.visible=nearFuture.visible=localWeight>.001;
 if(flownPath.visible){
  let lo=0,hi=trajectoryTimes.length;while(lo<hi){const m=(lo+hi)>>1;if(trajectoryTimes[m]<=t)lo=m+1;else hi=m;}
  const attr=flownPath.geometry.attributes.position;
  for(let i=0;i<lo;i++)writePoint(attr,i,trajectoryPositions[i],scale);
  writePoint(attr,lo,positions.voyager,scale);attr.needsUpdate=true;flownPath.geometry.setDrawRange(0,lo+1);
 }
 if(localWeight>.001){
  const past=nearPast.geometry.attributes.position,future=nearFuture.geometry.attributes.position;let n=0,m=1;
  writePoint(future,0,positions.voyager,scale);
  for(const row of local){const point=row.position.clone().add(positions[pose.body]);if(row.time<=t)writePoint(past,n++,point,scale);else writePoint(future,m++,point,scale);}
  writePoint(past,n++,positions.voyager,scale);past.needsUpdate=future.needsUpdate=true;nearPast.geometry.setDrawRange(0,n);nearFuture.geometry.setDrawRange(0,m);nearPast.material.opacity=.34*localWeight*pathReveal;nearFuture.material.opacity=.1*localWeight*pathReveal;
 }
 const attr=activeTrail.geometry.attributes.position,regularStart=Math.max(0,progress-THREE.MathUtils.lerp(.045,.025,pose.closeup));
 const flyby=pose.body==='jupiter'?EVENTS[1]:pose.body==='saturn'?EVENTS[2]:null;
 // Retain the incoming branch until the turn and pullback have finished.
 const start=flyby?THREE.MathUtils.lerp(regularStart,Math.min(regularStart,flyby.p-.026),pose.closeup):regularStart;
 for(let i=0;i<97;i++){
  const sampleTime=timeAt(THREE.MathUtils.lerp(start,progress,i/96)),point=visual(sample(data,'voyager',sampleTime));
  if(localWeight>.001)point.addScaledVector(positions[pose.body].clone().sub(visual(sample(data,pose.body,sampleTime))),localWeight);
  writePoint(attr,i,point,scale);
 }
 attr.needsUpdate=true;activeTrail.geometry.setDrawRange(0,97);activeTrail.material.opacity=.95*pathReveal;
 const orbitOpacity=.12*THREE.MathUtils.smoothstep(pose.distance,.02,.2);
 for(const {name,points,line} of orbits){line.visible=orbitOpacity>.001;if(!line.visible)continue;const a=line.geometry.attributes.position;points.forEach((point,i)=>writePoint(a,i,point,scale));a.needsUpdate=true;line.geometry.setDrawRange(0,points.length);const highlight=name===encounter.body?encounter.strength:0;line.material.opacity=orbitOpacity+highlight*.065;line.material.color.setHex(0x91a5be).lerp(new THREE.Color(encounter.tint),highlight*.85);}
}
function updateWorld(t,dt,snap=false){
 for(const key of Object.keys(data.bodies))positions[key]=visual(sample(data,key,t));positions.sun=zero;
 pose=poseAt(progress,positions,overview,camera.aspect);encounter=encounterAt(progress);origin.copy(pose.focus);const scale=WORLD_DISTANCE/pose.distance;
 const title=planetTitleAt(progress,overview),heading=$('planet-title');
 if(heading.textContent!==title.name)heading.textContent=title.name;
 heading.hidden=title.opacity<=0;heading.style.opacity=title.opacity;
 for(const [key,object] of Object.entries(bodies)){
  object.position.copy(positions[key]).sub(origin).multiplyScalar(scale);
  const real=RADII[key]*scale,mapVisibility=THREE.MathUtils.smoothstep(pose.distance,.015,.5);
  const depth=Math.max(.1,cameraDistance(camera.aspect)-object.position.dot(pose.direction));
  const pixels=key==='sun'?4:(mobile()?1.8:2.4);
  const pixelFloor=pixels*2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*depth/innerHeight;
  const min=Math.max(minimumRadius[key]*1.55,pixelFloor)*mapVisibility;
  const emphasis=key===encounter.body?1+encounter.strength*.6:1;
  object.scale.setScalar(Math.max(real,min*emphasis));object.visible=object.position.length()<1800;
  if(object.userData.sunDirection)object.userData.sunDirection.copy(positions[key]).negate().normalize();
  const apparentRadius=object.scale.x/Math.max(.1,object.position.distanceTo(camera.position))*innerHeight/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
  const atmosphereFade=key==='earth'?THREE.MathUtils.smoothstep(apparentRadius,2,10):1;
  for(const layer of object.userData.atmospheres||[])layer.uniform.value=layer.base*atmosphereFade*(key===encounter.body?1+encounter.strength*.35:1);
 }
 targetCamera.copy(pose.direction).multiplyScalar(cameraDistance(camera.aspect));
 if(autoCamera){if(snap||playing)camera.position.copy(targetCamera);else camera.position.lerp(targetCamera,1-Math.exp(-dt*5));controls.target.set(0,0,0);}
 controls.update();camera.updateMatrixWorld();
 const shipPosition=positions.voyager.clone().sub(origin).multiplyScalar(scale);
 const planet=bodies[pose.body];
 const presentation=presentShip({pose,missionPosition:shipPosition,camera,width:innerWidth,height:innerHeight,span:ship.userData.span,planetPosition:planet?.position,planetRadius:planet?.scale.x});
 const {detail,hero}=presentation;
 ship.position.copy(presentation.position);ship.scale.setScalar(presentation.scale);ship.visible=detail>.001;
 const home=positions.earth.clone().sub(positions.voyager).normalize();ship.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),home);ship.rotateY(.65);
 const point=shipPosition.clone().project(camera),locator=$('voyager-locator');
 locator.hidden=!(point.z>-1&&point.z<1&&Math.abs(point.x)<1&&Math.abs(point.y)<1);
 locator.style.transform=`translate(${(point.x*.5+.5)*innerWidth}px,${(-point.y*.5+.5)*innerHeight}px)`;
 locator.style.setProperty('--detail',detail.toFixed(3));
 locator.style.setProperty('--hero',hero.toFixed(3));
 locator.style.setProperty('--reticle-size',`${THREE.MathUtils.lerp(22,mobile()?48:62,detail)}px`);
 sunDirection.copy(origin.lengthSq()>1e-12?origin:positions.earth).negate().normalize();keyLight.position.copy(sunDirection).multiplyScalar(45);keyLight.intensity=3.2*(1-pose.mapBlend);
 mapLight.position.copy(bodies.sun.position);mapLight.intensity=3.2*pose.mapBlend;earthMaterial.uniforms.sunDir.value.copy(positions.earth).negate().normalize();
 renderer.getDrawingBufferSize(starField.userData.uniforms.viewport.value);starField.position.copy(camera.position);starField.userData.uniforms.visibility.value=THREE.MathUtils.lerp(.62,.92,THREE.MathUtils.smoothstep(pose.distance,.025,2));updatePaths(t,scale);updateDistanceMeasure(scale,shipPosition);
}
function updateDistanceMeasure(scale,shipPosition){
 const amount=THREE.MathUtils.smootherstep(progress,.985,1);
 distanceLine.visible=amount>0;
 const attr=distanceLine.geometry.attributes.position;
 writePoint(attr,0,positions.earth,scale);writePoint(attr,1,positions.voyager,scale);
 attr.needsUpdate=true;distanceLine.geometry.setDrawRange(0,2);distanceLine.material.opacity=.72*amount;
 for(const [id,point] of [['earth-endpoint',bodies.earth.position],['voyager-endpoint',shipPosition]]){
  const el=$(id),ndc=point.clone().project(camera);
  el.hidden=amount===0||ndc.z<=-1||ndc.z>=1||Math.abs(ndc.x)>.93||Math.abs(ndc.y)>.9;
  el.style.opacity=amount;el.style.left=`${(ndc.x*.5+.5)*innerWidth}px`;el.style.top=`${(-ndc.y*.5+.5)*innerHeight}px`;
 }
}
function updateTimelineDate(p=timelinePreview??progress){
 if(mobile())return;
 const label=$('timeline-date'),wrap=$('timeline-wrap'),time=timeAt(p),width=wrap.clientWidth;
 label.textContent=dateFormat.format(new Date(time)).replaceAll('.','').replaceAll(' de ',' ');label.dateTime=new Date(time).toISOString();
 label.style.left=`${THREE.MathUtils.clamp(p*width,42,width-42)}px`;
 wrap.classList.toggle('previewing',timelinePreview!==null);
 $('timeline-cursor').style.left=`${p*100}%`;
}
function updateUI(t){
 photos?.update(t,progress);
 const d=positions.voyager.distanceTo(positions.earth)*AU;
 $('date').textContent=dateFormat.format(new Date(t)).replaceAll('.','').replaceAll(' de ',' ');$('date').dateTime=new Date(t).toISOString();
 $('end-distance').textContent=`${number.format(Math.round(d))} km from Earth`;
 $('distance').textContent=number.format(Math.round(d));$('timeline').value=progress*1000;$('progress').style.width=`${progress*100}%`;
 $('timeline').setAttribute('aria-valuetext',`${$('date').textContent}, ${$('distance').textContent} kilometres from Earth`);
 const current=EVENTS.findLastIndex(e=>progress>=e.p-.00001);document.querySelectorAll('.milestone').forEach((el,i)=>el.classList.toggle('active',i===current));
 updateTimelineDate();
 const finished=progress>=1;$('journey-end').classList.toggle('visible',finished);$('journey-end').setAttribute('aria-hidden',String(!finished));
}
function go(p){progress=THREE.MathUtils.clamp(p,0,1);autoCamera=true;lastUI=0;updateWorld(timeAt(progress),.016,true);updateUI(timeAt(progress));if(progress>=1)setPlaying(false);}
function showResume(on){const b=$('resume');if(on){b.hidden=false;requestAnimationFrame(()=>b.classList.add('visible'));}else{b.classList.remove('visible');b.hidden=true;}}
function setPlaying(on){playing=on;showResume(false);if(on)autoCamera=true;$('play').setAttribute('aria-label',on?'Pause journey':'Play journey');$('play').title=on?'Pause':'Play';$('play-icon').innerHTML=on?'<path d="M5 4h3v12H5zM12 4h3v12h-3z"/>':'<path d="M7 4l9 6-9 6z"/>';}
function closeSpeedMenu(restoreFocus=false){$('speed-menu').hidden=true;$('speed').setAttribute('aria-expanded','false');if(restoreFocus)$('speed').focus();}
function setSpeed(value){
 if(![.25,.5,1,2,4].includes(value))return;
 playbackSpeed=value;const text=`${String(value)}×`;$('speed').textContent=text;$('speed').setAttribute('aria-label',`Playback speed: ${text}`);
 document.querySelectorAll('[data-speed]').forEach(button=>button.setAttribute('aria-checked',String(Number(button.dataset.speed)===value)));closeSpeedMenu(true);
}
function updatePostProcessing(now,dt){
 const projected=bodies.sun.position.clone().project(camera),forward=bodies.sun.position.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3()))>0;
 const inside=Math.abs(projected.x)<1.12&&Math.abs(projected.y)<1.12;
 const visible=bodies.sun.visible&&forward&&inside&&!sunIsOccluded(camera.position,bodies.sun.position,Object.entries(bodies).filter(([key])=>key!=='sun').map(([,object])=>object),bodies.sun.scale.x);
 const uniforms=cinemaPass.uniforms;
 if(forward&&Number.isFinite(projected.x)&&Number.isFinite(projected.y))uniforms.sunUV.value.set(projected.x*.5+.5,projected.y*.5+.5);else uniforms.sunUV.value.set(-2,-2);
 const edgeFade=1-THREE.MathUtils.smoothstep(Math.max(Math.abs(projected.x),Math.abs(projected.y)),.85,1.12);
 uniforms.sunVisibility.value=THREE.MathUtils.lerp(uniforms.sunVisibility.value,visible?edgeFade:0,1-Math.exp(-dt*7));
 uniforms.sunRadius.value=Math.min(.08,bodies.sun.scale.x/Math.max(.001,bodies.sun.position.distanceTo(camera.position))/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))));
 uniforms.detailStrength.value=mobile()?0:.13;
 uniforms.encounterStrength.value=0;
 if(encounter.body){
  const planet=bodies[encounter.body],point=planet.position.clone().project(camera);
  if(planet.visible&&point.z>-1&&point.z<1){
   uniforms.encounterUV.value.set(point.x*.5+.5,point.y*.5+.5);uniforms.encounterColor.value.setHex(encounter.tint);
   uniforms.encounterStrength.value=encounter.strength*(1-THREE.MathUtils.smoothstep(pose.closeup,.1,.65));uniforms.encounterPulse.value=reducedMotion?0:encounter.pulse;
   const apparent=planet.scale.x/Math.max(.001,planet.position.distanceTo(camera.position))/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5)));
   uniforms.encounterRadius.value=Math.max(apparent,4/uniforms.resolution.value.y);
  }
 }
 bloomPass.strength=THREE.MathUtils.lerp(.36,.24,THREE.MathUtils.smoothstep(pose.distance,.03,1.5));
}
function setupUI(){
 photos=setupPhotos({timeAt,travelRate,isPlaying:()=>playing,setPlaying});
 $('speed').onclick=()=>{const open=$('speed-menu').hidden;$('speed-menu').hidden=!open;$('speed').setAttribute('aria-expanded',String(open));if(open)$('speed-menu').querySelector('[aria-checked="true"]').focus();};
 $('speed-menu').addEventListener('click',e=>{const option=e.target.closest('[data-speed]');if(option)setSpeed(Number(option.dataset.speed));});
 $('speed-control').addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeSpeedMenu(true);return;}
  if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){
   e.preventDefault();$('speed-menu').hidden=false;$('speed').setAttribute('aria-expanded','true');
   const options=[...$('speed-menu').querySelectorAll('[data-speed]')],index=options.indexOf(document.activeElement);
   const next=e.key==='Home'?0:e.key==='End'?options.length-1:index<0?(e.key==='ArrowDown'?0:options.length-1):(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options[next].focus();
  }
 });
 document.addEventListener('pointerdown',e=>{if(!$('speed-control').contains(e.target))closeSpeedMenu();});
 $('speed-control').addEventListener('focusout',e=>{if(!$('speed-control').contains(e.relatedTarget))closeSpeedMenu();});
 EVENTS.forEach(event=>{const b=document.createElement('button');b.className='milestone';b.style.left=`${event.p*100}%`;b.dataset.progress=event.p;b.setAttribute('aria-label',`${event.name}, ${dateFormat.format(new Date(event.time))}`);b.title=event.name;const year=document.createElement('span');year.className='milestone-year';year.textContent=event.year;year.setAttribute('aria-hidden','true');b.append(year);b.onclick=()=>{setPlaying(false);go(event.p);};b.onfocus=()=>{timelinePreview=event.p;updateTimelineDate();};$('milestones').append(b);});
 $('timeline-wrap').addEventListener('pointermove',e=>{if(e.pointerType==='touch'||mobile())return;const rect=$('timeline-wrap').getBoundingClientRect(),milestone=e.target.closest('.milestone');timelinePreview=milestone?Number(milestone.dataset.progress):THREE.MathUtils.clamp((e.clientX-rect.left)/rect.width,0,1);updateTimelineDate();});
 $('timeline-wrap').addEventListener('pointerleave',()=>{timelinePreview=null;updateTimelineDate();});
 $('timeline-wrap').addEventListener('focusout',e=>{if(!$('timeline-wrap').contains(e.relatedTarget)){timelinePreview=null;updateTimelineDate();}});
 $('resume').onclick=()=>setPlaying(true);
 $('play').onclick=()=>{if(progress>=1)go(0);setPlaying(!playing);};
 $('timeline').addEventListener('input',e=>{timelinePreview=null;setPlaying(false);go(Number(e.target.value)/1000);});
 $('timeline').addEventListener('focus',()=>{timelinePreview=null;updateTimelineDate();});
 document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]'))return;if(['INPUT','BUTTON','A'].includes(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();if(progress>=1)go(0);setPlaying(!playing);}if(['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();setPlaying(false);go(progress+(e.code==='ArrowRight'?.008:-.008));}});
 document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();});
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,mobile()?1.7:1.5));renderer.setSize(innerWidth,innerHeight);composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(innerWidth,innerHeight);renderer.getDrawingBufferSize(cinemaPass.uniforms.resolution.value);if(starField)starField.userData.uniforms.dpr.value=renderer.getPixelRatio();if(ready){updateWorld(timeAt(progress),.016,true);updateTimelineDate();}});
}
function animate(now){
 requestAnimationFrame(animate);if(!ready||document.hidden)return;const dt=Math.min(.05,(now-lastFrame)/1000||.016);lastFrame=now;
 if(playing){progress=advanceProgress(progress,dt,playbackSpeed);if(progress>=1)setPlaying(false);}
 const t=timeAt(progress);updateWorld(t,dt);if(now-lastUI>100){updateUI(t);lastUI=now;}updatePostProcessing(now,dt);composer.render();
}
async function init(){
 try{
  setupScene();$('loading-progress').style.width='14%';const response=await fetch('./data/ephemeris.json');if(!response.ok)throw new Error('The trajectory data could not be loaded.');data=await response.json();
  const end=setJourneyEnd(Date.now(),Math.min(data.bodies.voyager.at(-1)[0],data.bodies.earth.at(-1)[0]));
  let n=0;const textures=['earth.jpg','earth-night.jpg','earth-clouds.jpg','jupiter.jpg','saturn.jpg','saturn-ring.png','mercury.jpg','venus.jpg','mars.jpg','uranus.jpg','neptune.jpg','milky-way-eso-6k.jpg'];
  await Promise.all(textures.map(async name=>{cache[name]=await loadTexture(name,name!=='earth-clouds.jpg');n++;$('loading-progress').style.width=`${15+n/textures.length*65}%`;}));
  setupWorld();await setupShip();setupUI();ready=true;go(0);$('loading-progress').style.width='100%';$('loading').classList.add('done');setTimeout(()=>{if($('loading'))$('loading').remove();setPlaying(!reducedMotion);},900);animate(performance.now());
  window.voyagerDiagnostics=()=>({ready,date:new Date(timeAt(progress)).toISOString(),distanceKm:positions.voyager.distanceTo(positions.earth)*AU,progress,playing,playbackSpeed,automaticRate:travelRate(progress),overview,postProcessing:{msaa:composer.renderTarget1.samples,bloom:bloomPass.strength,cinemaGrade:true},trajectoryVertices:trajectoryPositions.length,cameraDistanceAU:pose.distance,cameraAnchor:pose.body,source:data.metadata});
 }catch(error){console.error(error);$('loading').style.display='none';$('error').hidden=false;$('error-detail').textContent=/WebGL/i.test(error.message)?'WebGL is unavailable. Open this demo in a browser with 3D graphics enabled.':error.message;}
}
init();
