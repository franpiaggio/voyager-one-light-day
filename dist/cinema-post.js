import * as THREE from 'three';

// Work in linear HDR. OutputPass performs the only tone/color-space conversion.
export const CinemaShader={
 name:'VoyagerCinemaGrade',
 uniforms:{tDiffuse:{value:null},resolution:{value:new THREE.Vector2(1,1)},sunUV:{value:new THREE.Vector2(-2,-2)},sunVisibility:{value:0},sunRadius:{value:.001},detailStrength:{value:.13},encounterUV:{value:new THREE.Vector2(-2,-2)},encounterStrength:{value:0},encounterPulse:{value:0},encounterRadius:{value:.003},encounterColor:{value:new THREE.Color(0xffcf97)}},
 vertexShader:`varying vec2 vUv;
 void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
 fragmentShader:`
 uniform sampler2D tDiffuse;
 uniform vec2 resolution;
 uniform vec2 sunUV;
 uniform float sunVisibility;
 uniform float sunRadius;
 uniform float detailStrength;
 uniform vec2 encounterUV;
 uniform vec3 encounterColor;
 uniform float encounterStrength;
 uniform float encounterPulse;
 uniform float encounterRadius;
 varying vec2 vUv;
 float noise(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
 void main(){
  vec3 color=max(texture2D(tDiffuse,vUv).rgb,vec3(0.0));
  float luma=dot(color,vec3(.2126,.7152,.0722));
  // Bound texture clarity to avoid ringing at limbs and star cores.
  // Compact screens keep this pass to one texture tap.
  if(detailStrength>0.0){
   vec2 px=1.0/resolution;
   vec3 neighbors=texture2D(tDiffuse,vUv+vec2(px.x,0.0)).rgb+texture2D(tDiffuse,vUv-vec2(px.x,0.0)).rgb
    +texture2D(tDiffuse,vUv+vec2(0.0,px.y)).rgb+texture2D(tDiffuse,vUv-vec2(0.0,px.y)).rgb;
   vec3 detail=clamp(color-neighbors*.25,vec3(-.035),vec3(.035));
   color+=detail*detailStrength*smoothstep(.025,.12,luma)*(1.0-smoothstep(1.0,2.5,luma));
  }
  // Preserve texture color; cool the mid shadows and gently warm highlights.
  float shadows=(1.0-smoothstep(.04,.32,luma))*smoothstep(.004,.035,luma);
  float highlights=smoothstep(.45,2.0,luma);
  color*=mix(vec3(1.0),vec3(.94,.985,1.065),shadows*.55);
  color*=mix(vec3(1.0),vec3(1.04,1.012,.975),highlights*.65);
  color=max(mix(vec3(dot(color,vec3(.2126,.7152,.0722))),color,1.035),vec3(0.0));
  color=pow(color,vec3(1.012));
  // A restrained optical halo only around the unoccluded, visible Sun.
  vec2 q=(vUv-sunUV)*vec2(resolution.x/resolution.y,1.0);
  float r=length(q);
  float source=max(sunRadius,1.25/resolution.y);
  float halo=exp(-r/(source*3.0+.003))*.12+exp(-r/(source*10.0+.016))*.022;
  float streak=exp(-abs(q.y)*resolution.y*.55)*exp(-abs(q.x)/(source*12.0+.055))*.024;
  color+=vec3(1.0,.84,.66)*(halo+streak)*sunVisibility;
  // One local encounter pulse. Its phase follows mission progress, so pause,
  // scrubbing, replay and playback speed all produce the same visible event.
  if(encounterStrength>0.0){
   vec2 delta=(vUv-encounterUV)*vec2(resolution.x/resolution.y,1.0);
   float distanceToPlanet=length(delta);
   float radius=encounterRadius*2.2+.004+encounterPulse*.038;
   float thickness=max(.0007,1.1/resolution.y);
   float ring=exp(-pow((distanceToPlanet-radius)/thickness,2.0));
   float innerRing=exp(-pow((distanceToPlanet-radius*.68)/(thickness*.75),2.0))*.22;
   float glow=exp(-distanceToPlanet/(encounterRadius*2.5+.006))*.085;
   color+=encounterColor*((ring+innerRing)*.4+glow)*encounterStrength;
  }
  vec2 edge=(vUv-.5)*2.0;
  color*=1.0-.19*smoothstep(.24,1.7,dot(edge,edge));
  // Static subpixel dither avoids temporal shimmer on planetary surfaces.
  float grain=noise(floor(vUv*resolution))-.5;
  color+=grain*.00055*smoothstep(.008,.045,luma);
  gl_FragColor=vec4(max(color,vec3(0.0)),1.0);
 }`
};

export function sunIsOccluded(cameraPosition,sunPosition,occluders,sunRadius=0){
 const toSun=sunPosition.clone().sub(cameraPosition),distance=toSun.length();
 if(distance<1e-6)return false;
 const ray=new THREE.Ray(cameraPosition,toSun.divideScalar(distance)),hit=new THREE.Vector3();
 for(const object of occluders){
  if(!object.visible)continue;
  const sphere=new THREE.Sphere(object.position,object.scale.x);
  if(ray.intersectSphere(sphere,hit)&&hit.distanceTo(cameraPosition)<distance-sunRadius)return true;
 }
 return false;
}
