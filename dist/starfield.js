import * as THREE from 'three';

// Camera-centred sky: stable directions, no artificial twinkle or parallax.
// The licensed Milky Way panorama supplies dust structure; HDR points add depth.
export function createStarField(texture,pixelRatio,compact,openingForward){
 const group=new THREE.Group();
 const uniforms={dpr:{value:pixelRatio},visibility:{value:.65},viewport:{value:new THREE.Vector2(1920,1080)}};
 const skyMaterial=new THREE.ShaderMaterial({
  uniforms:{map:{value:texture},visibility:uniforms.visibility,viewport:uniforms.viewport},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform sampler2D map;uniform float visibility;uniform vec2 viewport;varying vec2 vUv;
   void main(){
    // Soften only the photographic background by about one output pixel.
    // Keep the high-resolution source; never blur planets, paths or labels.
    vec2 dx=dFdx(vUv)*1.15,dy=dFdy(vUv)*1.15;
    vec3 sky=texture2D(map,vUv).rgb*.4;
    sky+=(texture2D(map,vUv+dx).rgb+texture2D(map,vUv-dx).rgb+texture2D(map,vUv+dy).rgb+texture2D(map,vUv-dy).rgb)*.15;
    float luma=dot(sky,vec3(.2126,.7152,.0722));
    // Compress the galactic core well below the bloom threshold, preserving hue.
    float subdued=.065*(1.0-exp(-luma*5.0));
    sky*=subdued/max(luma,.00001);
    vec2 screen=gl_FragCoord.xy/viewport;
    float focus=length((screen-.5)*vec2(viewport.x/viewport.y,1.0));
    float separation=mix(.62,1.0,smoothstep(.10,.65,focus));
    gl_FragColor=vec4(min(sky,vec3(.08))*visibility*separation,1.0);}`,
  side:THREE.BackSide,depthWrite:false,depthTest:false,toneMapped:false
 });
 const sky=new THREE.Mesh(new THREE.SphereGeometry(2450,64,40),skyMaterial);
 // Put the galactic band diagonally above the map's main subject, with a fixed
 // celestial orientation throughout the trip (no camera-following rotation).
 const forward=new THREE.Vector3(-.42,-.6,-1.2).normalize();
 const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
 const up=new THREE.Vector3().crossVectors(right,forward).normalize();
 // The same fixed galactic plane crosses both the opening and the solar view.
 // This avoids making the Milky Way disappear behind the departure camera.
 const normal=openingForward?new THREE.Vector3().crossVectors(forward,openingForward).normalize():up;
 const axis=forward.clone().addScaledVector(normal,.10).normalize();
 const vertical=normal.clone().addScaledVector(axis,-normal.dot(axis)).normalize();
 const side=new THREE.Vector3().crossVectors(axis,vertical).normalize();
 const skyRotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axis,vertical,side));
 sky.quaternion.copy(skyRotation);sky.renderOrder=-1000;sky.frustumCulled=false;group.add(sky);
 let seed=1977;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const count=compact?1000:1800,positions=new Float32Array(count*3),colors=new Float32Array(count*3),sizes=new Float32Array(count),energies=new Float32Array(count);
 const palette=[new THREE.Color(0xc5d9ff),new THREE.Color(0xe5ecff),new THREE.Color(0xfff6e8),new THREE.Color(0xffdbb0)];
 for(let i=0;i<count;i++){
  // More fine stars along the galactic plane, with quiet areas between them.
  const z=i<count*.38?THREE.MathUtils.clamp((rand()+rand()+rand()-1.5)*.18,-1,1):rand()*2-1,angle=rand()*Math.PI*2,r=Math.sqrt(1-z*z);
  positions.set([Math.cos(angle)*r*2300,z*2300,Math.sin(angle)*r*2300],i*3);
  const bright=Math.pow(rand(),9),temperature=rand(),color=palette[temperature<.14?0:temperature<.4?1:temperature<.9?2:3];
  colors.set(color.toArray(),i*3);energies[i]=.18+bright*1.2;sizes[i]=3.2+bright*7;
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
 geometry.setAttribute('size',new THREE.BufferAttribute(sizes,1));geometry.setAttribute('energy',new THREE.BufferAttribute(energies,1));
 const material=new THREE.ShaderMaterial({
  uniforms,
  vertexShader:`attribute vec3 color;attribute float size;attribute float energy;uniform float dpr;
   varying vec3 vColor;varying float vRadius;varying float vEnergy;
   void main(){vColor=color;vRadius=size*.5;vEnergy=energy;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=size*dpr;}`,
  fragmentShader:`uniform float visibility;varying vec3 vColor;varying float vRadius;varying float vEnergy;
   void main(){vec2 q=(gl_PointCoord-.5)*2.0;float r=length(q)*vRadius;
    float core=exp(-r*r/ .32);float halo=exp(-r*r/4.8)*.045;
    float bright=smoothstep(3.0,6.0,vEnergy);
    float rays=(exp(-abs(q.x)*60.0)*exp(-abs(q.y)*6.0)+exp(-abs(q.y)*60.0)*exp(-abs(q.x)*6.0))*bright*.025;
    float edge=1.0-smoothstep(.72,1.0,length(q));
    gl_FragColor=vec4(vColor*(core+halo+rays)*vEnergy*visibility*edge,1.0);}`,
  transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:true,toneMapped:false
 });
 const stars=new THREE.Points(geometry,material);stars.quaternion.copy(skyRotation);stars.frustumCulled=false;group.add(stars);
 group.userData.uniforms=uniforms;
 return group;
}
