import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PHOTOS,photoProgress,photoSchedule,activePhoto } from '../dist/photos.js';
const source=fs.readFileSync(new URL('../dist/journey.js',import.meta.url),'utf8').replace("from 'three'",`from '${new URL('../dist/vendor/three/build/three.module.js',import.meta.url).href}'`);
const {timeAt,advanceProgress,travelRate}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const schedule=photoSchedule(timeAt,travelRate),dwell=PHOTOS.map(()=>0);
for(let p=0;p<1;p=advanceProgress(p,.01)){
 const index=activePhoto(timeAt(p),p,schedule);
 if(index>=0){assert.ok(timeAt(p)>=PHOTOS[index].time,'never show a future capture');dwell[index]+=.01;}
}
PHOTOS.forEach((photo,i)=>{
 assert.ok(Math.abs(timeAt(photoProgress(photo.time,timeAt))-photo.time)<1,'capture date maps onto nonlinear timeline');
 if(photo.featured)assert.ok(dwell[i]>=2.45,`${photo.id} must remain readable, got ${dwell[i]} seconds`);
 for(const asset of [photo.src,photo.thumb])assert.ok(fs.statSync(new URL('../dist/'+asset,import.meta.url)).size>1000,'local photograph exists');
 assert.ok(schedule.every(slot=>slot.end<=1),'photos clear before the finale');
 console.log(`PASS: ${photo.id}, ${photo.date}, ${photo.featured?'featured '+dwell[i].toFixed(2)+'s':'gallery'}.`);
});
for(const p of [0,.05,1])assert.equal(activePhoto(timeAt(p),p,schedule),-1,'clear on replay and finish');
console.log('PASS: photo chronology, minimum viewing time, nonlinear timeline placement and replay/seek state.');
