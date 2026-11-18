import * as THREE from 'three';

// The opening uses a foreground presentation of the actual model. Its screen
// bearing follows the ephemeris after a brief illustrative Earth emergence.
export function presentShip({pose,missionPosition,camera,width,height,span,planetPosition,planetRadius=0}){
 const hero=pose.hero||0;
 const detail=Math.max(hero,1-THREE.MathUtils.smoothstep(pose.distance,.03,.35));
 const position=camera.position.clone().lerp(missionPosition,1-.76*hero);
 const departureReveal=pose.departureReveal??1;
 if(departureReveal<1&&planetPosition){
  // A two-second illustrative emergence, not a reconstructed launch ascent.
  // Start just above the near-facing globe, then join the existing hero shot.
  const outward=position.clone().sub(planetPosition).normalize();
  const start=planetPosition.clone().addScaledVector(outward,planetRadius*1.2);
  position.lerp(start,1-departureReveal);
 }
 const depth=Math.max(.1,position.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())));
 const short=Math.min(width,height),normalPixels=Math.min(110,short*.23),heroPixels=Math.min(760,short*.95);
 const pixels=THREE.MathUtils.lerp(Math.min(32,short*.065),THREE.MathUtils.lerp(normalPixels,heroPixels,hero),departureReveal)*detail;
 let scale=pixels*2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*depth/(height*span);
 if(planetPosition){const clearance=position.distanceTo(planetPosition)-planetRadius;scale=Math.min(scale,Math.max(.001,clearance/(span*2)));}
 return {position,scale,detail,hero};
}
