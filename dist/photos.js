// Capture dates from the linked JPL records, not their publication dates.
// Records give calendar days only; trigger at the start of that UTC day.
import { CATALOG } from './photo-catalog.js';
import { t,localizePhoto,LOCALE } from './i18n.js';
export const PHOTO_GROUPS=[{name:'Earth',p:.13},{name:'Jupiter',p:.4},{name:'Saturn',p:.66},{name:'Portrait',p:.85}];
const END={Earth:.27,Jupiter:.52,Saturn:.81,Portrait:.985};
export const PHOTOS=CATALOG.map(photo=>({...localizePhoto(photo),time:Date.parse(photo.capturedAt??(photo.date+'T00:00:00Z')),end:END[photo.group],src:`./assets/photos/${photo.id}.jpg`,thumb:`./assets/photos/${photo.id}-thumb.jpg`}));

export function photoProgress(time,timeAt){
 let low=0,high=1;
 for(let i=0;i<48;i++){const mid=(low+high)/2;if(timeAt(mid)<time)low=mid;else high=mid;}
 return (low+high)/2;
}
// Reserve at least 2.5 viewing seconds per photograph, without slowing the mission.
// A fast cruise can cross several capture dates in less than a second.
export function photoSchedule(timeAt,travelRate,duration=180){
 const steps=8192,clock=[0];
 for(let i=1;i<=steps;i++)clock.push(clock[i-1]+duration/steps/travelRate((i-.5)/steps));
 const secondsAt=p=>{const x=p*steps,i=Math.min(steps-1,Math.floor(x));return clock[i]+(clock[i+1]-clock[i])*(x-i);};
 const progressAt=t=>{let lo=0,hi=steps;while(hi-lo>1){const m=(lo+hi)>>1;if(clock[m]<t)lo=m;else hi=m;}return (lo+(t-clock[lo])/(clock[hi]-clock[lo]))/steps;};
 let previous=-Infinity;
 const entries=PHOTOS.filter(photo=>photo.featured).map(photo=>{const start=Math.max(secondsAt(photoProgress(photo.time,timeAt)),previous+2.5);previous=start;return {id:photo.id,start,end:Math.max(secondsAt(photo.end),start+2.5)};});
 return entries.map((entry,i)=>({id:entry.id,start:progressAt(entry.start),end:Math.min(1,progressAt(Math.min(entry.end,entries[i+1]?.start??Infinity)))}));
}
export function activePhoto(time,progress,schedule){
 if(progress>=1)return -1;
 const slot=schedule.findLast(entry=>progress>=entry.start&&progress<entry.end);
 return slot?PHOTOS.findIndex(photo=>photo.id===slot.id&&photo.time<=time):-1;
}

export function setupPhotos({timeAt,travelRate,setPlaying}){
 const $=id=>document.getElementById(id),dialog=$('photo-gallery'),card=$('photo-card');
 const format=new Intl.DateTimeFormat(LOCALE,{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
 const schedule=photoSchedule(timeAt,travelRate);
 let active=-1,selected=0,opener=null,filter='All';
 const visibleIndices=()=>PHOTOS.map((photo,i)=>filter==='All'||photo.group===filter?i:-1).filter(i=>i>=0);
 function step(direction){const indices=visibleIndices();select(indices[(indices.indexOf(selected)+direction+indices.length)%indices.length]);}
 function setFilter(group){filter=group;[...$('photo-strip').children].forEach((button,i)=>button.hidden=filter!=='All'&&PHOTOS[i].group!==filter);[...$('photo-groups').children].forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.group===filter)));if(!visibleIndices().includes(selected))select(visibleIndices()[0]);}
 const date=photo=>format.format(new Date(photo.time)).replaceAll('.','').replaceAll(' de ',' ');
 const image=(photo,thumb=false)=>{const img=document.createElement('img');img.src=thumb?photo.thumb:photo.src;img.alt=photo.alt;img.decoding='async';return img;};
 function select(index){
  selected=(index+PHOTOS.length)%PHOTOS.length;const photo=PHOTOS[selected];
  $('photo-full').replaceChildren(image(photo));
  $('photo-title').textContent=`${photo.body} · ${photo.title}`;
  $('photo-date').textContent=date(photo);$('photo-date').dateTime=photo.date;
  $('photo-source').href=photo.source;$('photo-source').textContent=photo.credit+' ↗';
  $('photo-note').textContent=photo.note;$('photo-note').hidden=!photo.note;
  $('photo-count').textContent=`${selected+1} / ${PHOTOS.length}`;
  [...$('photo-strip').children].forEach((button,i)=>button.setAttribute('aria-pressed',String(i===selected)));
  const thumb=$('photo-strip').children[selected];if(thumb)$('photo-strip').scrollLeft=thumb.offsetLeft-$('photo-strip').offsetLeft-$('photo-strip').clientWidth/2+thumb.clientWidth/2;
 }
 function open(index,from,group='All'){
  if(dialog.open)return;
  opener=from;setPlaying(false);selected=index;setFilter(group);dialog.showModal();select(index);$('photo-close').focus();
 }
 $('photos-open').onclick=e=>open(active>=0?active:0,e.currentTarget);
 card.onclick=e=>{if(active>=0)open(active,e.currentTarget);};
 $('photo-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{setPlaying(true);opener?.focus();});
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 dialog.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='ArrowRight'){e.preventDefault();step(1);}if(e.key==='ArrowLeft'){e.preventDefault();step(-1);}});
 $('photo-prev').onclick=()=>step(-1);$('photo-next').onclick=()=>step(1);
 PHOTOS.forEach((photo,index)=>{
  const button=document.createElement('button');button.type='button';button.append(image(photo,true));button.setAttribute('aria-label',`${photo.body}, ${date(photo)}: ${photo.title}`);button.onclick=()=>select(index);$('photo-strip').append(button);
 });
 $('photos-open').setAttribute('aria-label',t('View all photographs',PHOTOS.length));
 for(const group of ['All',...PHOTO_GROUPS.map(g=>g.name)]){const button=document.createElement('button');button.textContent=t(group);button.dataset.group=group;button.onclick=()=>setFilter(group);button.setAttribute('aria-pressed',String(group===filter));$('photo-groups').append(button);}
 // Four encounter groups keep the expanded archive off the main canvas.
 for(const {name:body,p} of PHOTO_GROUPS){
  const index=PHOTOS.findIndex(photo=>photo.group===body),photo=PHOTOS[index],total=PHOTOS.filter(photo=>photo.group===body).length;
  const button=document.createElement('button');button.type='button';button.className='photo-marker';button.style.left=`${p*100}%`;
  button.append(image(photo,true));const count=document.createElement('span');count.textContent=total;button.append(count);
  button.setAttribute('aria-label',t('View group',t(body),total));button.title=t('Group photographs',t(body));button.onclick=e=>open(index,e.currentTarget,body);$('photo-markers').append(button);
 }
 return {update(time,progress){
  const next=activePhoto(time,progress,schedule);if(next===active)return;active=next;
  card.hidden=active<0;
  if(active>=0){const photo=PHOTOS[active];$('photo-card-image').replaceChildren(image(photo,true));$('photo-card-date').textContent=date(photo);$('photo-card-date').dateTime=photo.date;$('photo-card-credit').textContent=photo.credit+' ↗';card.setAttribute('aria-label',t('View photograph',`${photo.body}, ${date(photo)}`));}
 }};
}
