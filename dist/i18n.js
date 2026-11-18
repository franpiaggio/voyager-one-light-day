// Interface language comes from <html lang>. English is the default; /es/ sets lang="es".
// Data modules keep English names as stable keys; only displayed text is translated here.
export const LANG=globalThis.document?.documentElement.lang.startsWith('es')?'es':'en';
export const LOCALE=LANG==='es'?'es-ES':'en-GB';

const ES={
 'km from Earth':'km de la Tierra',
 'kilometres from Earth':'kilómetros de la Tierra',
 'Pause journey':'Pausar el viaje','Play journey':'Reproducir el viaje','Pause':'Pausa','Play':'Reproducir',
 'Playback speed':'Velocidad de reproducción',
 'The trajectory data could not be loaded.':'No se pudieron cargar los datos de la trayectoria.',
 'WebGL is unavailable. Open this demo in a browser with 3D graphics enabled.':'WebGL no está disponible. Abrí esta demo en un navegador con gráficos 3D activados.',
 // Milestones and planet titles
 'Earth':'Tierra','Jupiter':'Júpiter','Saturn':'Saturno','Pale Blue Dot':'Pale Blue Dot',
 'Interstellar space':'Espacio interestelar','One light-day':'Un día luz','Today':'Hoy','Latest data':'Último dato',
 // Photo archive
 'All':'Todas','Portrait':'Retrato',
 'Earth & Moon':'Tierra y Luna','Europa':'Europa','Io':'Ío','Ganymede':'Ganímedes','Callisto':'Calisto',
 'Titan':'Titán','Dione':'Dione','Mimas':'Mimas','Rhea':'Rea','Solar System':'Sistema solar',
 'View all photographs':n=>`Ver las ${n} fotografías de la Voyager`,
 'View group':(body,n)=>`${body}: ver ${n} fotografía${n===1?'':'s'} de la Voyager`,
 'Group photographs':body=>`Fotografías: ${body}`,
 'View photograph':label=>`Ver fotografía: ${label}`,
 'Photographed by Voyager 1':(body,title)=>`${body}: ${title}, fotografiada por la Voyager 1`
};
const EN={
 'View all photographs':n=>`View all ${n} Voyager photographs`,
 'View group':(body,n)=>`${body}: view ${n} Voyager photograph${n===1?'':'s'}`,
 'Group photographs':body=>`${body} photographs`,
 'View photograph':label=>`View photograph: ${label}`
};

// Photo titles and notes, keyed by NASA/JPL catalog id.
const PHOTOS_ES={
 PIA00013:['Nuestra primera mirada atrás','Composición en color; la Luna fue aclarada respecto de la Tierra.'],
 PIA00029:['El primer primer plano',''],
 PIA00358:['Júpiter y tres lunas',''],
 PIA00014:['La Gran Mancha Roja',''],
 PIA00016:['Un mundo helado',''],
 PIA01484:['El descubrimiento del anillo','Exposición múltiple; las estelas son estrellas de fondo.'],
 PIA01971:['Una erupción volcánica','Brillo del penacho realzado. Tomada el 5 de marzo UTC (4 de marzo PST).'],
 PIA01514:['Terreno volcánico',''],
 PIA02279:['Surcos en el hielo',''],
 PIA00080:['Una antigua cuenca de impacto','Mosaico de exposiciones de la Voyager 1.'],
 PIA01324:['La media luna que se aleja',''],
 PIA01383:['Saturno y tres lunas','Mosaico de exposiciones de la Voyager 1.'],
 PIA00024:['Tetis, Dione y las sombras de los anillos',''],
 PIA00733:['Bajo una bruma naranja',''],
 PIA01366:['Cráteres y terreno brillante',''],
 PIA01968:['El cráter de impacto gigante',''],
 PIA02238:['Una atmósfera densa',''],
 PIA02240:['Una antigua superficie helada',''],
 PIA02271:['Dejando Saturno','Sobreexpuesta para revelar los anillos; la media luna se ve más brillante.'],
 PIA01969:['Mirando atrás',''],
 PIA00451:['El retrato de familia','Mosaico de 60 cuadros, con vistas ampliadas de los planetas. No es una sola exposición.'],
 PIA23645:['Pale Blue Dot','Exposiciones de 1990, reprocesadas en 2020. La Tierra es el punto en el rayo de sol.']
};

export function t(key,...args){
 const value=(LANG==='es'?ES:EN)[key]??EN[key]??key;
 return typeof value==='function'?value(...args):value;
}
export function localizePhoto(photo){
 if(LANG!=='es')return photo;
 const [title,note]=PHOTOS_ES[photo.id]??[photo.title,photo.note];
 const body=t(photo.body);
 return {...photo,body,title,note,alt:t('Photographed by Voyager 1',body,title)};
}
