// Spherical image lookup and diffuse lighting, cached at screen resolution for Canvas2D.
const maps = {
  sun: './assets/textures/sun.jpg',
  earth: './assets/textures/earth.jpg', moon: './assets/textures/moon.jpg',
  mercury: './assets/textures/mercury.jpg', venus: './assets/textures/venus.jpg',
  mars: './assets/textures/mars.jpg', jupiter: './assets/textures/jupiter.jpg',
  saturn: './assets/textures/saturn.jpg', uranus: './assets/textures/uranus.jpg',
  neptune: './assets/textures/neptune.jpg',
};
const lightsUrl = './assets/textures/earth-lights.jpg';
const cloudsUrl = './assets/textures/earth-clouds.jpg';
const tau = Math.PI * 2;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, hi));
const normal = a => { const n = Math.hypot(...a) || 1; return a.map(x => x / n); };
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

function raster(url, ready) {
  const image = new Image();
  image.onload = () => {
    // Old WebViews cap decoded texture memory here, independently of screen DPR.
    const width = Math.min(768, image.naturalWidth);
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
  const sprites = new Map();
  let cloudMap = null, nightMap = null;
  let cloudRequest = false;
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
      if (sprites.get(body.key) === e) { e.map = map; e.stamp = null; }
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
    const spinning = Math.floor(tick*.11) / 100;
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
    const longitude = body.key === 'earth' ? .585 + spinning : .5 + spinning;
    const surface = e.map;
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
        const u=(Math.atan2(nx,nz)/tau+longitude+1)%1;
        const v=clamp(.5-Math.asin(clamp(ny,-1,1))/Math.PI,0,.999999);
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
  return {globe};
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
