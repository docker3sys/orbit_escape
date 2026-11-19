import { greenwichSiderealAngle } from './solar-scale.js';
import { getIdaShape, idaTexture } from './solar-belt.js';
// Spherical image lookup and diffuse lighting, cached at screen resolution for Canvas2D.
const maps = {
  sun: './assets/textures/sun.jpg',
  earth: './assets/textures/earth.jpg', moon: './assets/textures/moon.jpg',
  mercury: './assets/textures/mercury.jpg', venus: './assets/textures/venus.jpg',
  mars: './assets/textures/mars.jpg', jupiter: './assets/textures/jupiter.jpg',
  saturn: './assets/textures/saturn.jpg', uranus: './assets/textures/uranus.jpg',
  neptune: './assets/textures/neptune.jpg',
};
const detailUrls = {
  sun:'./assets/planet-detail/sun.webp',earth:'./assets/planet-detail/earth.webp',moon:'./assets/planet-detail/moon.webp',
  mercury:'./assets/planet-detail/mercury.webp',venus:'./assets/planet-detail/venus.webp',mars:'./assets/planet-detail/mars.webp',
  jupiter:'./assets/planet-detail/jupiter.webp',saturn:'./assets/planet-detail/saturn.webp',uranus:'./assets/planet-detail/uranus.webp',neptune:'./assets/planet-detail/neptune.webp',
};
const tilt=23.43928*Math.PI/180, cosTilt=Math.cos(tilt), sinTilt=Math.sin(tilt);
const wrap=n=>n-Math.floor(n);
const periodDays={sun:25.05,moon:27.3217,mercury:58.646,venus:-243.025,mars:1.025957,jupiter:.41354,saturn:.444,uranus:-.71833,neptune:.67125};
function bodyRotation(key){return key==='earth'?greenwichSiderealAngle(Date.now())/(2*Math.PI):wrap(Date.now()/86400000/(periodDays[key]||1));}
// Bilinear interpolation prevents the global map becoming square kilometre-wide tiles
// in the local view. Horizontal samples wrap across the prime meridian.
function filtered(map,u,v,channel){
  const x=u*map.width-.5,y=clamp(v*map.height-.5,0,map.height-1),i=Math.floor(x),j=Math.floor(y);
  const k=(i+map.width)%map.width,l=(k+1)%map.width,j1=Math.min(j+1,map.height-1),fx=x-i,fy=y-j;
  const a=map.data[4*(j*map.width+k)+channel],b=map.data[4*(j*map.width+l)+channel];
  const c=map.data[4*(j1*map.width+k)+channel],d=map.data[4*(j1*map.width+l)+channel];
  return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
}
let grain;
function grainAt(x,y){
  if(!grain){grain=new Uint8Array(4096);let seed=37;for(let i=0;i<grain.length;i++){seed=(Math.imul(1664525,seed)+1013904223)>>>0;grain[i]=seed>>>24;}}
  const gx=Math.floor(x),gy=Math.floor(y);let u=x-gx,v=y-gy;u=u*u*(3-2*u);v=v*v*(3-2*v);
  const x0=gx&63,x1=(gx+1)&63,y0=(gy&63)*64,y1=((gy+1)&63)*64;
  return ((grain[y0+x0]*(1-u)+grain[y0+x1]*u)*(1-v)+(grain[y1+x0]*(1-u)+grain[y1+x1]*u)*v)/255;
}
const lightsUrl = './assets/textures/earth-lights.jpg';
const cloudsUrl = './assets/textures/earth-clouds.jpg';
const tau = Math.PI * 2;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, hi));
const normal = a => { const n = Math.hypot(...a) || 1; return a.map(x => x / n); };
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

function raster(url, ready, maxWidth=768) {
  const image = new Image();
  image.onload = () => {
    // Old WebViews cap decoded texture memory here, independently of screen DPR.
    const width = Math.min(maxWidth, image.naturalWidth);
    const height = Math.max(1, Math.round(width * image.naturalHeight / image.naturalWidth));
    const surface = document.createElement('canvas');
    surface.width = width;
    surface.height = height;
    const brush = surface.getContext('2d', {willReadFrequently:true});
    try {
      brush.drawImage(image, 0, 0, width, height);
      ready({width, height, data:brush.getImageData(0, 0, width, height).data});
    } catch { ready(null); }
    surface.width = surface.height = 1;
  };
  image.onerror = () => ready(null);
  image.src = url;
}

export function createPlanetPainter() {
  const sprites = new Map(), closeImage=document.createElement('canvas');
  let closeStamp=null,closeTime=-Infinity,closeKey=null,detail=null;
  let cloudMap = null, nightMap = null;
  let cloudRequest = false, groundRequested=false,ground=null;
  let serial = 0;

  function entryFor(body) {
    let e = sprites.get(body.key);
    if (e) {e.use = ++serial;return e;}
    if (sprites.size >= 3) {
      const oldest = [...sprites.values()].reduce((a,b) => a.use < b.use ? a : b);
      sprites.delete(oldest.key);
      oldest.surface.width = oldest.surface.height = 1;
    }
    e = {key:body.key, use:++serial, surface:document.createElement('canvas'), map:null, stamp:null};
    sprites.set(body.key,e);
    if (maps[body.key]) raster(maps[body.key], map => {
      if (sprites.get(body.key) === e) { e.map = map; e.stamp = null; e.revision=(e.revision||0)+1; }
    });
    if (body.key === 'earth' && !cloudRequest) {
      cloudRequest = true;
      raster(lightsUrl, map => { nightMap = map; const earth=sprites.get('earth'); if (earth) earth.stamp=null; });
      raster(cloudsUrl, map => { cloudMap = map; const earth=sprites.get('earth'); if (earth) earth.stamp=null; });
    }
    return e;
  }

  function globe(body, radius, distance, eye, axes, tick, pixelRatio) {
    const e = entryFor(body);
    // Only regenerate a sprite when surface rotation, viewing angle or apparent size changes.
    const diameter = 2*radius*pixelRatio;
    const side = diameter < 48 ? 48 : diameter < 100 ? 96 : diameter < 190 ? 176 : diameter < 300 ? 272 : 368;
    // Near the limb use the eye ray for perspective, including at near-surface distances.
    const toward = normal(eye.map((v,i)=>v-body.pos[i]));
    const rawRight = normal([toward[2],0,-toward[0]]);
    const rawUp = [toward[1]*rawRight[2],toward[2]*rawRight[0]-toward[0]*rawRight[2],-toward[1]*rawRight[0]];
    const angle = Math.atan2(dot(axes.right,rawUp),dot(axes.right,rawRight));
    const spinning = Math.round(bodyRotation(body.key)*1000)/1000;
    const stamp = [side,Math.round(toward[0]*14),Math.round(toward[1]*14),Math.round(toward[2]*14),Math.round(body.radius/distance*20),spinning].join('/');
    if (e.stamp === stamp) return [e.surface,angle];
    e.stamp = stamp;
    if (e.surface.width !== side) e.surface.width = e.surface.height = side;
    const ctx = e.surface.getContext('2d');
    const output = ctx.createImageData(side,side);
    const pixels = output.data;
    const light = normal(body.pos.map(v=>-v));
    const polar = Math.min(.96, body.radius/distance);
    const cap = Math.sqrt(Math.max(.001,1-polar*polar));
    const base = body.rgb;
    const surface = detail?.key===body.key && detail.map || e.map;
    const atmospheric = body.key==='earth' || body.key==='venus' || body.key==='neptune';
    for (let y=0;y<side;y++) {
      const sy=1-(2*y+1)/side;
      for (let x=0;x<side;x++) {
        const sx=(2*x+1)/side-1;
        const square=sx*sx+sy*sy;
        if (square>=1) continue;
        const q = Math.sqrt(1-square);
        const zz=(polar*square + cap*cap*q)/(cap*cap + polar*polar*square);
        const scale=Math.sqrt(Math.max(0,1-zz*zz)/(square||1));
        const xx=sx*scale, yy=sy*scale;
        const nx=xx*rawRight[0]+yy*rawUp[0]+zz*toward[0];
        const ny=xx*rawRight[1]+yy*rawUp[1]+zz*toward[1];
        const nz=xx*rawRight[2]+yy*rawUp[2]+zz*toward[2];
        const sun=nx*light[0]+ny*light[1]+nz*light[2];
        const lat=body.key==='earth'?ny*cosTilt-nz*sinTilt:ny, eqz=body.key==='earth'?ny*sinTilt+nz*cosTilt:nz;
        const u=wrap(.5+Math.atan2(-eqz,nx)/tau-spinning);
        const v=clamp(.5-Math.asin(clamp(lat,-1,1))/Math.PI,0,.999999);
        const k=(y*side+x)*4;
        let r=base[0],g=base[1],b=base[2];
        if (surface) {
          const si=4*(Math.floor(v*surface.height)*surface.width+Math.floor(u*surface.width));
          r=surface.data[si];g=surface.data[si+1];b=surface.data[si+2];
        }
        if (body.key==='earth' && cloudMap) {
          const ci=4*(Math.floor(v*cloudMap.height)*cloudMap.width+Math.floor(u*cloudMap.width));
          const f=Math.min(.87,cloudMap.data[ci]/255*.91);
          r+=(236-r)*f;g+=(240-g)*f;b+=(243-b)*f;
        }
        if(body.key==='earth'){
          const sunlight=Math.sqrt(Math.max(0,sun));
          // Short-wavelength daylight scattered above dark oceans lifts the lit disc.
          r=Math.min(255, r*1.11+sunlight*4);g=Math.min(255,g*1.13+sunlight*10);b=Math.min(255,b*1.13+sunlight*17);
        }
        const illumination=body.key==='sun'?.68+.32*Math.sqrt(q):.042+.98*Math.sqrt(Math.max(sun,0));
        let city=0;
        if(body.key==='earth'&&nightMap&&sun<.10){
          const ni=4*(Math.floor(v*nightMap.height)*nightMap.width+Math.floor(u*nightMap.width));
          city=nightMap.data[ni]*clamp((.10-sun)*4,0,1)*.82;
        }
        const rim=atmospheric ? (1-q)**3 * clamp(sun*2+.35,0,1) : 0;
        pixels[k]=r*illumination+rim*70+city;
        pixels[k+1]=g*illumination+rim*118+city*.73;
        pixels[k+2]=b*illumination+rim*156+city*.33;
        pixels[k+3]=clamp((1-Math.sqrt(square))*side*.78,0,1)*255;
      }
    }
    ctx.putImageData(output,0,0);
    return [e.surface,angle];
  }
  // Above an ellipsoid the limb can pass through the frame even when the body's
  // centre is behind the camera. Intersect each view ray in local kilometres;
  // h(2R+h) keeps a four-metre clearance stable even at Jupiter's radius.
  function horizon(out,body,eye,axes,width,height,focal,time,profile) {
    if(!groundRequested){groundRequested=true;raster('./assets/planet-detail/ground-material.webp',map=>{ground=map;closeStamp=null;},256);}
    const entry=entryFor(body), R=body.radius, offset=eye.map((v,i)=>v-body.pos[i]);
    const range=Math.hypot(...offset), h=Math.max(.000001,range-R), c=h*(2*R+h);
    const limit=profile==='low'?285:420, scale=Math.min(1,limit/Math.max(width,height));
    const w=Math.max(1,Math.round(width*scale)), hh=Math.max(1,Math.round(height*scale));
    const f=axes.forward,r=axes.right,up=axes.up, surface=detail?.key===body.key&&detail.map||entry.map;
    const localResolution=Math.max(.00008,h*.002);
    const revision=[w,hh,Math.round(focal),entry.revision||0,surface?.width||0,
      ...offset.map(v=>Math.round(v/localResolution)),...f.map(v=>Math.round(v*1300)),...up.map(v=>Math.round(v*1300)),
      Math.floor(Date.now()/5000)].join('/');
    if(revision!==closeStamp && (time-closeTime>58||closeKey!==body.key||!closeStamp)){
      closeKey=body.key;closeStamp=revision;closeTime=time;
      if(closeImage.width!==w||closeImage.height!==hh){closeImage.width=w;closeImage.height=hh;}
      const brush=closeImage.getContext('2d'), img=brush.createImageData(w,hh), pix=img.data;
      const light=normal(body.pos.map(v=>-v)), toward=offset.map(v=>v/range);
      const sunlit=dot(toward,light), earth=body.key==='earth', luminous=body.key==='sun';
      const air=earth?Math.exp(-h/8.5)*clamp(sunlit*4+.22,0,1):0;
      const rotation=bodyRotation(body.key), scaleX=width/w/focal, scaleY=height/hh/focal;
      const solid=['moon','mars','mercury','earth','venus'].includes(body.key);
      for(let y=0;y<hh;y++){
        const sy=(hh/2-y-.5)*scaleY;
        for(let x=0;x<w;x++){
          const sx=(x+.5-w/2)*scaleX, dx=f[0]+r[0]*sx+up[0]*sy,dy=f[1]+r[1]*sx+up[1]*sy,dz=f[2]+r[2]*sx+up[2]*sy;
          const b=offset[0]*dx+offset[1]*dy+offset[2]*dz, a=1+sx*sx+sy*sy;
          const delta=b*b-a*c, k=4*(y*w+x);
          if(b>=0||delta<=0){
            if(air>.007){const zenith=clamp(b/(range*Math.sqrt(a)),0,1), haze=Math.exp(-zenith*5);
              pix[k]=51+104*haze;pix[k+1]=117+70*haze;pix[k+2]=199+13*haze;pix[k+3]=air*255;}
            continue;
          }
          const t=c/(-b+Math.sqrt(delta)),rx=offset[0]+dx*t,ry=offset[1]+dy*t,rz=offset[2]+dz*t;
          const nx=rx/R,ny=ry/R,nz=rz/R, sun=nx*light[0]+ny*light[1]+nz*light[2];
          const lat=earth?ny*cosTilt-nz*sinTilt:ny, eqz=earth?ny*sinTilt+nz*cosTilt:nz;
          const u=wrap(.5+Math.atan2(-eqz,nx)/tau-rotation), v=clamp(.5-Math.asin(clamp(lat,-1,1))/Math.PI,0,.999999);
          let red=surface?filtered(surface,u,v,0):body.rgb[0],green=surface?filtered(surface,u,v,1):body.rgb[1],blue=surface?filtered(surface,u,v,2):body.rgb[2];
          const water=earth&&blue-red>Math.max(4,blue*.18);
          const grain=solid?.24:.13;
          // Illustrative local roughness; its wavelength is in kilometres. Fade
          // octaves below the ray's pixel footprint, preventing crawling on approach.
          const depth=t*Math.sqrt(a), footprint=Math.max(.001,depth*scaleX);
          let micro=1;
          if(footprint<10){
            const m=Math.min(1,.36/footprint),n=Math.min(1,.010/footprint);
            const x1=rx*1.7+ry*.55,z1=rz*1.7-ry*.71;
            micro+=grain*(grainAt(x1,z1)-.50)*m+grain*.73*(grainAt(x1*29.6,z1*29.6)-.5)*n;
            if(ground){
              const ch=solid?(earth?(water?2:1):0):2;
              const wide=filtered(ground,wrap(x1/47),wrap(z1/47),ch)/255-.5;
              const med=filtered(ground,wrap(x1/3),wrap(z1/3),ch)/255-.5;
              const fine=filtered(ground,wrap(x1*2.8),wrap(z1*2.8),ch)/255-.5;
              micro+=(wide*.6*Math.min(1,1.6/footprint)+med*.55*m+fine*.6*n)*(water?.56:1.30);
            }
          }
          const illum=luminous?1:.046+.98*Math.sqrt(Math.max(0,sun));
          red*=micro*illum;green*=micro*illum;blue*=micro*illum;
          if(water){
            const mu=clamp(-(nx*dx+ny*dy+nz*dz)/Math.sqrt(a),0,1);
            const skyReflection=(.055+.56*(1-mu)**4)*clamp(sunlit*3,0,1)*Math.exp(-h/9);
            red+=skyReflection*97;green+=skyReflection*145;blue+=skyReflection*178;
          }
          if(earth&&h>25&&cloudMap){
            const cloud=Math.min(.84,filtered(cloudMap,u,v,0)/255*.94)*clamp((h-25)/100,0,1);red+=(230*illum-red)*cloud;green+=(235*illum-green)*cloud;blue+=(241*illum-blue)*cloud;}
          if(earth&&nightMap&&sun<.1){const ci=4*(Math.floor(v*nightMap.height)*nightMap.width+Math.floor(u*nightMap.width));
            const city=nightMap.data[ci]*clamp((.10-sun)*4,0,1)*.75;red+=city;green+=city*.73;blue+=city*.33;}
          const haze=air*(1-Math.exp(-depth/67))*.88;
          pix[k]=red*(1-haze)+149*haze;pix[k+1]=green*(1-haze)+180*haze;pix[k+2]=blue*(1-haze)+199*haze;pix[k+3]=255;
        }
      }
      brush.putImageData(img,0,0);
    }
    out.drawImage(closeImage,0,0,width,height);
  }
  function chooseDetail(key,profile){
    const next=profile==='low'?null:key;
    if((detail?.key||null)===next)return;
    detail=null;closeStamp=null;
    if(!next||!detailUrls[next])return;
    const request={key:next,map:null};detail=request;
    raster(detailUrls[next],map=>{if(detail===request){detail.map=map;closeStamp=null;const e=sprites.get(next);if(e)e.stamp=null;}},1024);
  }
  function release(){detail=null;closeStamp=null;closeImage.width=closeImage.height=1;}
  return {globe,horizon,chooseDetail,release};

}

let ringStrip, ringPending=false, ringHalves;
function paintedRingHalves() {
  const size=576, height=178, earthR=size/4.7;
  const halves=[document.createElement('canvas'),document.createElement('canvas')];
  for(let side=0;side<2;side++) {
    const canvas=halves[side];
    canvas.width=size;canvas.height=height;
    const brush=canvas.getContext('2d'), image=brush.createImageData(size,height);
    for(let y=side?height/2:0;y<(side?height:height/2);y++) {
      const dy=(y+.5-height/2)/(earthR*.285);
      for(let x=0;x<size;x++){
        const dx=(x+.5-size/2)/earthR, radius=Math.hypot(dx,dy);
        const f=(radius-1.18)/1.15;
        if(f<0||f>=1)continue;
        const k=(y*size+x)*4;
        const ix=Math.floor(f*(ringStrip?.width||1))*4;
        // One side of the far rings crosses Saturn's penumbra.
        const shade=side?1:.66+.34*clamp(Math.abs(dx-.91)/.76,0,1);
        if(ringStrip){
          for(let i=0;i<3;i++)image.data[k+i]=Math.min(255,(ringStrip.data[ix+i]*1.24+17)*shade);
          image.data[k+3]=ringStrip.data[ix+3];
        } else {
          const gap=f>.59&&f<.65, band=154+28*Math.sin(f*185)+21*Math.sin(f*70);
          image.data[k]=band*shade;image.data[k+1]=band*.94*shade;image.data[k+2]=band*.79*shade;
          image.data[k+3]=(gap?.12:f<.2?.40:.85)*255;
        }
      }
    }
    brush.putImageData(image,0,0);
  }
  return halves;
}
export function ring(c,x,y,r,nearHalf) {
  if(!ringPending){
    ringPending=true;
    raster('./assets/saturn-ring.png',map=>{ringStrip=map;ringHalves=null;});
  }
  ringHalves??=paintedRingHalves();
  const half=ringHalves[Number(nearHalf)], w=r*4.7, h=w*half.height/half.width;
  c.save();c.translate(x,y);c.rotate(-.29);
  c.drawImage(half,-w/2,-h/2,w,h);c.restore();
}
function line(c,a,b,color,width) {
  c.strokeStyle=color;
  c.lineWidth=width;
  c.beginPath();c.moveTo(...a);c.lineTo(...b);c.stroke();
}
function polygon(c,points,fill) {
  c.fillStyle=fill;
  c.beginPath();c.moveTo(...points[0]);for(let i=1;i<points.length;i++)c.lineTo(...points[i]);c.closePath();c.fill();
}
function dish(c,x,y,r) {
  c.save();c.translate(x,y);c.rotate(-.28);
  polygon(c,[[-r,0],[r,0],[.19*r,.62*r],[-.13*r,.64*r]],'#7e817f');
  c.fillStyle='#d6cfc0';c.beginPath();c.ellipse(0,0,r,r*.38,0,0,tau);c.fill();
  c.strokeStyle='#706f70';c.lineWidth=.028*r;
  for(let j=0;j<12;j++){
    const phi=j*tau/12;line(c,[Math.cos(phi)*r,Math.sin(phi)*r*.38],[0,.07*r],'#92928c',.018*r);
  }
  line(c,[-.65*r,-.12*r],[.08*r,-.72*r],'#d6b371',.045*r);
  line(c,[r*.59,-.08*r],[.08*r,-.72*r],'#e8c989',.045*r);
  c.fillStyle='#d8ae68';c.fillRect(0,-.78*r,.18*r,.13*r);c.restore();
}
export function spacecraft(c,body,x,y,r,choice) {
  c.save();c.translate(x,y);c.scale(r,r);c.rotate(-.13);
  if(body.key==='jwst'){
    polygon(c,[[-1,.13],[-.20,-.17],[1,.19],[.16,.56],[-.21,.56]],'#b4b6c7');
    polygon(c,[[-.96,.18],[.14,.57],[.97,.23],[.17,.65]],'#58637c');
    line(c,[0,-.55],[-.1,.25],'#c6b787',.06);
    for(let column=-2;column<=2;column++) for(let row=-2;row<=2;row++){
      if(Math.abs(column+row)>2||(!column&&!row)) continue;
      const px=column*.172, py=(row+.5*column)*.162-.32;
      const hex=[];for(let k=0;k<6;k++)hex.push([px+.104*Math.cos(k*tau/6),py+.083*Math.sin(k*tau/6)]);
      polygon(c,hex,['#d8b45e','#aa8338','#edc97e'][(column+4*row+14)%3]);
    }
  } else if(body.key==='return-observatory'||body.key==='parker'){
    for(const s of [-1,1]) {
      line(c,[0,0],[s,0],'#b7a78d',.045);
      for(let i=0;i<3;i++){
        c.fillStyle='#456477';c.fillRect(s>0?.32+i*.21:-.52-i*.21,-.135,.195,.28);
        line(c,[s*(.33+i*.21),0],[s*(.49+i*.21),0],'#91acb2',.012);
      }
    }
    c.fillStyle='#757f81';c.fillRect(-.24,-.14,.48,.32);
    if(body.key==='parker'){
      polygon(c,[[-.34,-.17],[-.20,-.28],[.32,-.25],[.41,-.11],[.17,-.04],[-.30,-.06]],'#d2c8b2');
    } else {
      dish(c,-.02,-.24,.34);
      if(choice==='people'){c.fillStyle='#ffcc71';for(let i=0;i<6;i++)c.fillRect(-.2+i*.071,-.02,.045,.05);}
      else{line(c,[.18,-.07],[.30,-.49],'#a7cace',.02);c.fillStyle='#8cf4e9';c.beginPath();c.arc(.3,-.49,.034,0,tau);c.fill();}
    }
  } else {
    const pioneer=body.key.startsWith('pioneer');
    const horizon=body.key==='new-horizons';
    line(c,[-.26,.14],[-.93,.53],'#c1ad80',.021);
    line(c,[.13,.06],[.95,.41],'#aa9c79',.024);
    line(c,[-.1,.12],[.84,.73],'#b2ae9f',.012);
    polygon(c,[[-.36,-.04],[.01,-.20],[.33,-.04],[.28,.19],[-.05,.27],[-.33,.17]],'#bda35d');
    polygon(c,[[-.36,-.04],[-.08,.03],[-.05,.27],[-.33,.17]],'#6d664a');
    dish(c,-.08,-.19,pioneer?.62:horizon?.39:.48);
    c.fillStyle='#897c68';c.fillRect(.71,.27,.18,.18);
    if(!pioneer&&!horizon)line(c,[-.14,-.01],[-.98,-.67],'#c6c1aa',.014);
  }
  c.restore();
}

// CPU projection of the same compact, measured Ida mesh. A single albedo sample
// per visible triangle keeps this path affordable on WebViews without a GPU.
export function createCanvasIda() {
  let albedo=null, requested=false;
  const mesh=getIdaShape(), count=mesh.positions.length/3;
  const dx=new Float64Array(count), dy=new Float64Array(count), dz=new Float64Array(count);
  const sx=new Float32Array(count), sy=new Float32Array(count), depth=new Float64Array(count);
  return (ctx,body,eye,axes,width,height,focal,spin)=>{
    if(!requested){requested=true;raster(idaTexture,map=>{albedo=map;},256);}
    const center=body.pos.map((v,i)=>v-eye[i]), sun=normal(body.pos.map(v=>-v)),cs=Math.cos(spin),sn=Math.sin(spin);
    for(let i=0;i<count;i++){
      const j=i*3, px=mesh.positions[j], py=mesh.positions[j+1], pz=mesh.positions[j+2];
      const x=dx[i]=center[0]+px*cs+pz*sn, y=dy[i]=center[1]+py, z=dz[i]=center[2]+pz*cs-px*sn;
      const d=depth[i]=x*axes.forward[0]+y*axes.forward[1]+z*axes.forward[2];
      if(d<=.0001)continue;
      sx[i]=width/2+(x*axes.right[0]+y*axes.right[1]+z*axes.right[2])*focal/d;
      sy[i]=height/2-(x*axes.up[0]+y*axes.up[1]+z*axes.up[2])*focal/d;
    }
    const faces=[];
    for(let j=0;j<mesh.indices.length;j+=3){
      const a=mesh.indices[j],b=mesh.indices[j+1],c=mesh.indices[j+2];
      if(depth[a]<=0||depth[b]<=0||depth[c]<=0)continue;
      const sign=(sx[b]-sx[a])*(sy[c]-sy[a])-(sy[b]-sy[a])*(sx[c]-sx[a]);
      if(sign>=0)continue;
      faces.push([a,b,c,depth[a]+depth[b]+depth[c]]);
    }
    faces.sort((a,b)=>b[3]-a[3]);
    for(const [a,b,c] of faces){
      const ux=dx[b]-dx[a],uy=dy[b]-dy[a],uz=dz[b]-dz[a];
      const vx=dx[c]-dx[a],vy=dy[c]-dy[a],vz=dz[c]-dz[a];
      const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
      const light=.075+.93*Math.sqrt(Math.max(0,(nx*sun[0]+ny*sun[1]+nz*sun[2])/(Math.hypot(nx,ny,nz)||1)));
      let value=154;
      if(albedo){
        const u=(mesh.uv[2*a]+mesh.uv[2*b]+mesh.uv[2*c])/3,v=1-(mesh.uv[2*a+1]+mesh.uv[2*b+1]+mesh.uv[2*c+1])/3;
        const ix=4*(Math.min(albedo.height-1,Math.floor(v*albedo.height))*albedo.width+Math.min(albedo.width-1,Math.floor(u*albedo.width)));
        value=albedo.data[ix];
      }
      const v=value*light;ctx.fillStyle=`rgb(${Math.round(v*1.04)},${Math.round(v)},${Math.round(v*.95)})`;
      ctx.lineJoin='round';ctx.lineWidth=.62;ctx.strokeStyle=ctx.fillStyle;
      ctx.beginPath();ctx.moveTo(sx[a],sy[a]);ctx.lineTo(sx[b],sy[b]);ctx.lineTo(sx[c],sy[c]);ctx.closePath();ctx.fill();ctx.stroke();
    }
  };
}
