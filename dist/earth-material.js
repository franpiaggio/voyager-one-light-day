import * as THREE from 'three';

// Composite clouds and terrain on one opaque surface. Separate, nearly touching
// shells lose depth precision as Earth recedes and can visibly fight each other.
export function createEarthMaterial(textures,sunDirection){
 return new THREE.ShaderMaterial({
  uniforms:{dayMap:{value:textures['earth.jpg']},nightMap:{value:textures['earth-night.jpg']},cloudMap:{value:textures['earth-clouds.jpg']},sunDir:{value:sunDirection}},
  vertexShader:`varying vec2 vUv;varying vec3 vNormal;
   void main(){vUv=uv;vNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform sampler2D dayMap;uniform sampler2D nightMap;uniform sampler2D cloudMap;uniform vec3 sunDir;varying vec2 vUv;varying vec3 vNormal;
   void main(){
    float N=dot(normalize(vNormal),sunDir);
    float daylight=smoothstep(-.15,.2,N);
    float cloud=texture2D(cloudMap,vUv).g*.84;
    vec3 surface=texture2D(dayMap,vUv).rgb;
    vec3 day=mix(surface,vec3(.94,.96,1.0),cloud)*(max(0.0,N)*1.65+.035);
    vec3 night=texture2D(nightMap,vUv).rgb*(1.0-cloud*.75)*.65;
    gl_FragColor=vec4(day+night*(1.0-daylight),1.0);
   }`,
  transparent:false,depthWrite:true,depthTest:true,toneMapped:false
 });
}
