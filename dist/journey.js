import * as THREE from 'three';
export const AU=149597870.7, DAY=86400000;
export const EVENTS=[
 {p:0,time:Date.parse('1977-09-05T13:59:00Z'),name:'Earth',year:1977},
 {p:.40,time:Date.parse('1979-03-05T12:05:00Z'),name:'Jupiter',year:1979},
 {p:.66,time:Date.parse('1980-11-12T23:46:00Z'),name:'Saturn',year:1980},
 {p:.85,time:Date.parse('1990-02-14T00:00:00Z'),name:'Pale Blue Dot',year:1990},
 {p:.93,time:Date.parse('2012-08-25T00:00:00Z'),name:'Interstellar space',year:2012},
 {p:1,time:Date.parse('2026-11-18T10:16:07Z'),name:'One light-day',year:2026}
];
export const LAUNCH_TIME=Date.parse('1977-09-05T12:56:00Z');
export const LIGHT_DAY_TIME=EVENTS.at(-1).time;
const KNOTS=[
 [0,EVENTS[0].time],[.045,Date.parse('1977-09-05T14:20:00Z')],[.06,Date.parse('1977-09-05T16:00:00Z')],
 [.10,Date.parse('1977-09-08T00:00:00Z')],[.18,Date.parse('1977-11-01T00:00:00Z')],
 [.27,Date.parse('1978-09-01T00:00:00Z')],[.33,Date.parse('1979-02-25T00:00:00Z')],
 [.38,EVENTS[1].time-3*3600000],[.40,EVENTS[1].time],[.42,EVENTS[1].time+3*3600000],
 [.44,EVENTS[1].time+12*3600000],[.46,EVENTS[1].time+4*DAY],[.475,EVENTS[1].time+30*DAY],
 [.55,Date.parse('1980-08-01T00:00:00Z')],[.61,Date.parse('1980-11-07T00:00:00Z')],
 [.64,EVENTS[2].time-3*3600000],[.66,EVENTS[2].time],[.68,EVENTS[2].time+3*3600000],
 [.70,EVENTS[2].time+12*3600000],[.72,EVENTS[2].time+4*DAY],[.735,EVENTS[2].time+30*DAY],
 [.78,Date.parse('1983-01-01T00:00:00Z')],[.85,EVENTS[3].time],[.93,EVENTS[4].time],[1,EVENTS[5].time]
];
// PCHIP time interpolation: monotonic dates and continuous acceleration through shots.
let slopes,tangents;
function rebuildTimeCurve(){
 slopes=KNOTS.map((v,i)=>i<KNOTS.length-1?(KNOTS[i+1][1]-v[1])/(KNOTS[i+1][0]-v[0]):0);
 tangents=KNOTS.map((v,i)=>{
 if(i===0)return slopes[0];if(i===KNOTS.length-1)return slopes[i-1];
 const a=v[0]-KNOTS[i-1][0],b=KNOTS[i+1][0]-v[0],w1=2*b+a,w2=b+2*a;
 return (w1+w2)/(w1/slopes[i-1]+w2/slopes[i]);
});
}
rebuildTimeCurve();
export function setJourneyEnd(now=Date.now(),availableUntil=LIGHT_DAY_TIME){
 const end=Math.max(EVENTS[4].time+DAY,Math.min(now,availableUntil,LIGHT_DAY_TIME));
 Object.assign(EVENTS.at(-1),{time:end,name:now<=availableUntil?'Today':'Latest data',year:new Date(end).getUTCFullYear()});
 KNOTS.at(-1)[1]=end;rebuildTimeCurve();return end;
}
export function elapsedSinceLaunch(end,launch=LAUNCH_TIME){
 end=Math.max(end,launch);const start=new Date(launch),finish=new Date(end);
 let years=finish.getUTCFullYear()-start.getUTCFullYear();
 let anchor=new Date(launch);anchor.setUTCFullYear(start.getUTCFullYear()+years);
 if(anchor.getTime()>end){years--;anchor=new Date(launch);anchor.setUTCFullYear(start.getUTCFullYear()+years);}
 let months=(finish.getUTCFullYear()-anchor.getUTCFullYear())*12+finish.getUTCMonth()-anchor.getUTCMonth();
 const monthStart=new Date(anchor);monthStart.setUTCMonth(anchor.getUTCMonth()+months);
 if(monthStart.getTime()>end){months--;monthStart.setUTCMonth(monthStart.getUTCMonth()-1);}
 return {years,months,days:Math.floor((end-monthStart.getTime())/DAY)};
}
export function timeAt(p){
 p=THREE.MathUtils.clamp(p,0,1);let i=0;while(i<KNOTS.length-2&&p>KNOTS[i+1][0])i++;
 const a=KNOTS[i],b=KNOTS[i+1],h=b[0]-a[0],u=(p-a[0])/h;
 return (2*u**3-3*u*u+1)*a[1]+(u**3-2*u*u+u)*h*tangents[i]+(-2*u**3+3*u*u)*b[1]+(u**3-u*u)*h*tangents[i+1];
}

// The speed selector multiplies this editorial pace. Ease into each encounter,
// stay with the closest approach, and cross uneventful cruise legs quickly.
export const TOUR_DURATION=180;
export function travelRate(p){
 const smooth=THREE.MathUtils.smootherstep;
 let rate=12;
 rate=THREE.MathUtils.lerp(rate,1.3,1-smooth(p,.06,.18));
 for(const event of [EVENTS[1],EVENTS[2]]){
  const delta=p-event.p;
  // Keep the bend readable, then accelerate gradually through the pullback.
  const encounterRate=delta<0?THREE.MathUtils.lerp(.95,12,smooth(-delta,.017,.048)):THREE.MathUtils.lerp(.95,12,smooth(delta,.035,.062));
  rate=Math.min(rate,encounterRate);
 }
 return THREE.MathUtils.lerp(rate,1.2,smooth(p,.965,.999));
}
export function advanceProgress(p,seconds,speed=1){
 const step=seconds*speed/TOUR_DURATION;
 return Math.min(1,p+step*travelRate(Math.min(1,p+step*travelRate(p)*.5)));
}
export function encounterAt(p){
 for(const [event,body,tint] of [[EVENTS[1],'jupiter',0xffcf97],[EVENTS[2],'saturn',0xc4dcff]]){
  const delta=p-event.p;
  if(Math.abs(delta)>.028)continue;
  const strength=THREE.MathUtils.smootherstep(delta,-.028,-.004)*(1-THREE.MathUtils.smootherstep(delta,.004,.028));
  return {body,strength,pulse:THREE.MathUtils.clamp(delta/.028,0,1),tint};
 }
 return {body:null,strength:0,pulse:0,tint:0xffffff};
}
export function sample(data,body,t){
 const a=data.bodies[body];if(t<=a[0][0])return new THREE.Vector3(...a[0].slice(1,4));if(t>=a.at(-1)[0])return new THREE.Vector3(...a.at(-1).slice(1,4));
 let lo=0,hi=a.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(a[m][0]>t)hi=m;else lo=m;}
 const s=a[lo],e=a[hi],u=(t-s[0])/(e[0]-s[0]),dt=(e[0]-s[0])/DAY;
 return new THREE.Vector3(...[1,2,3].map(j=>(2*u**3-3*u*u+1)*s[j]+(u**3-2*u*u+u)*dt*s[j+3]+(-2*u**3+3*u*u)*e[j]+(u**3-u*u)*dt*e[j+3]));
}
export function visual(v){return new THREE.Vector3(v.x,v.z,-v.y);}

// Tessellate the same velocity-aware Hermite curve used by the spacecraft.
// Retain every source knot; subdivide the bends instead of rounding flybys
// with an unconstrained spline, which could cut through a planet.
export function smoothTrajectory(data,{body=null,start=EVENTS[0].time,end=EVENTS.at(-1).time}={}){
 const pointAt=time=>{const p=sample(data,'voyager',time);if(body)p.sub(sample(data,body,time));return visual(p);};
 const times=[...new Set([start,end,...data.bodies.voyager.map(row=>row[0]),...(body?data.bodies[body].map(row=>row[0]):[])])].filter(t=>t>=start&&t<=end).sort((a,b)=>a-b);
 const result=[{time:start,position:pointAt(start)}];
 function subdivide(a,b,depth=0){
  const midTime=(a.time+b.time)/2,mid={time:midTime,position:pointAt(midTime)};
  let reference=mid.position.length();
  if(!body){const v=sample(data,'voyager',midTime);reference=Math.min(...['earth','jupiter','saturn'].map(k=>v.distanceTo(sample(data,k,midTime))));}
  const tolerance=Math.max(2e-9,reference*.00012);
  let error=mid.position.distanceTo(a.position.clone().lerp(b.position,.5));
  for(const u of [.25,.75])error=Math.max(error,pointAt(a.time+(b.time-a.time)*u).distanceTo(a.position.clone().lerp(b.position,u)));
  if(error>tolerance&&depth<14&&b.time-a.time>1000){subdivide(a,mid,depth+1);subdivide(mid,b,depth+1);}else result.push(b);
 }
 for(let i=1;i<times.length;i++)subdivide(result.at(-1),{time:times[i],position:pointAt(times[i])});
 return result;
}
export const RADII={sun:695700/AU,mercury:2439.7/AU,venus:6051.8/AU,earth:6371/AU,mars:3389.5/AU,jupiter:69911/AU,saturn:58232/AU,uranus:25362/AU,neptune:24622/AU};
// The prologue looks back toward Earth; the map and flybys retain one compass.
const MAP_DIRECTION=new THREE.Vector3(.42,.6,1.2).normalize();
const CAMERA_RIGHT=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),MAP_DIRECTION).normalize();
const CAMERA_UP=new THREE.Vector3().crossVectors(MAP_DIRECTION,CAMERA_RIGHT).normalize();
export const cameraDistance=aspect=>aspect<1?52:30;
function departureDirection(positions){
 const outward=positions.voyager.clone().sub(positions.earth).normalize();
 const side=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),outward).normalize();
 return outward.multiplyScalar(.987).addScaledVector(side,-.16).normalize();
}
const TAN_FOV=Math.tan(43*Math.PI/360);
// Fit both subjects in the useful viewport, including rings and a spacecraft margin.
function subjectDistance(focus,subjects,aspect){
 let distance=0;
 for(const [position,radius] of subjects){
  const offset=position.clone().sub(focus),depth=offset.dot(MAP_DIRECTION);
  distance=Math.max(distance,depth+Math.max((Math.abs(offset.dot(CAMERA_RIGHT))+radius)/(TAN_FOV*aspect*.73),(Math.abs(offset.dot(CAMERA_UP))+radius)/(TAN_FOV*.65)));
 }
 return distance*30/cameraDistance(aspect);
}
// Measure the opening in viewing seconds, not in nonuniform timeline space.
// Otherwise faster cruise pacing concentrates the entire pullback into a jerk.
const OPENING_END=.18;
function viewingClock(start,end){
 const steps=256,times=[0];
 for(let i=1;i<=steps;i++){
  const a=start+(i-1)*(end-start)/steps,b=start+i*(end-start)/steps,m=(a+b)/2;
  times.push(times.at(-1)+(b-a)*TOUR_DURATION/6*(1/travelRate(a)+4/travelRate(m)+1/travelRate(b)));
 }
 return p=>{const scaled=THREE.MathUtils.clamp((p-start)/(end-start),0,1)*steps,i=Math.min(steps-1,Math.floor(scaled));return THREE.MathUtils.lerp(times[i],times[i+1],scaled-i)/times.at(-1);};
}
const openingFraction=viewingClock(.055,OPENING_END);
// Halve only the zoom transitions in viewing time, preserving both close-shot boundaries.
// The pullback spans only its own mission window, so the cruise that follows can speed up without shortening it.
const quickApproach=clock=>p=>THREE.MathUtils.clamp(clock(p)*2-1,0,1);
const quickDeparture=clock=>p=>THREE.MathUtils.clamp(clock(p)*2,0,1);
const FLYBYS=[{event:EVENTS[1],body:'jupiter',extent:1},{event:EVENTS[2],body:'saturn',extent:2.32}].map(f=>({...f,start:f.event.p-.065,end:f.event.p+.095,approach:quickApproach(viewingClock(f.event.p-.065,f.event.p-.006)),departure:viewingClock(f.event.p+.02,f.event.p+.037)}));
export function planetTitleAt(p,overview=false){
 const flyby=!overview&&FLYBYS.find(f=>p>f.start&&p<f.end);
 if(!flyby)return {name:'',opacity:0};
 const opacity=THREE.MathUtils.smootherstep(flyby.approach(p),.48,.9)*(1-THREE.MathUtils.smootherstep(flyby.departure(p),.08,.56));
 return {name:opacity>0?flyby.event.name:'',opacity};
}
function solarPose(positions,wide=false,aspect=16/9){
 const radius=positions.voyager.length();
 const focus=wide?new THREE.Vector3():positions.voyager.clone().multiplyScalar(.72);
 const distance=Math.max(wide?76+radius*3:10+radius*1.7,subjectDistance(focus,[[positions.voyager,.05],[new THREE.Vector3(),.1]],aspect));
 return {focus,direction:MAP_DIRECTION.clone(),distance,body:'sun',mapBlend:1,closeup:0};
}
export function poseAt(p,positions,overview=false,aspect=16/9){
 const map=solarPose(positions,overview,aspect);
 if(overview)return map;
 if(p>=OPENING_END){
  const flyby=FLYBYS.find(f=>p>f.start&&p<f.end);
  if(!flyby)return map;
  const weight=THREE.MathUtils.smoothstep(flyby.approach(p),0,1)*(1-THREE.MathUtils.smootherstep(flyby.departure(p),0,1));
  // Follow Voyager through the actual encounter. The planet occupies the other
  // side of the composition; zoom responds to their changing separation.
  const extent=RADII[flyby.body]*flyby.extent;
  const closeFocus=positions.voyager.clone().lerp(positions[flyby.body],.32);
  const closeDistance=Math.max(extent*5.4,subjectDistance(closeFocus,[[positions.voyager,extent*.14],[positions[flyby.body],extent*1.08]],aspect));
  const distance=Math.exp(THREE.MathUtils.lerp(Math.log(map.distance),Math.log(closeDistance),weight));
  // Scale the map offset with zoom so the spacecraft never drifts offscreen.
  const focus=positions.voyager.clone().addScaledVector(closeFocus.sub(positions.voyager),weight).addScaledVector(map.focus.clone().sub(positions.voyager),distance/map.distance*(1-weight));
  const fitted=Math.max(distance,subjectDistance(focus,[[positions.voyager,extent*.14],[positions[flyby.body],extent*1.08]],aspect));
  return {focus,direction:MAP_DIRECTION.clone(),distance:fitted,body:flyby.body,mapBlend:1-weight,closeup:weight};
 }
 const u=THREE.MathUtils.smootherstep(openingFraction(p),0,1);
 // A constant-distance tracking shot: the ship stays large, Earth recedes behind it.
 const departure=departureDirection(positions),rotation=new THREE.Quaternion().setFromUnitVectors(departure,MAP_DIRECTION);
 const direction=departure.applyQuaternion(new THREE.Quaternion().slerp(rotation,u));
 const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right);
 const departureDistance=RADII.earth*4.8;
 const distance=Math.exp(THREE.MathUtils.lerp(Math.log(departureDistance),Math.log(map.distance),u));
 const closeOffset=right.multiplyScalar(-departureDistance*(aspect<1?.03:.075)).addScaledVector(up,departureDistance*.025);
 const focus=positions.voyager.clone().addScaledVector(closeOffset,1-u).addScaledVector(map.focus.clone().sub(positions.voyager),distance/map.distance*u);
 return {focus,direction,distance,body:'earth',mapBlend:u,closeup:0,hero:1-u,departureReveal:THREE.MathUtils.smootherstep(p,0,.0145)};
}
