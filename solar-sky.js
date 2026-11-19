// World axes are [ecliptic X, ecliptic Z, -ecliptic Y]. Both renderers share this sky.
import { packedStars } from './solar-stars.js';

export const skyAtlas = './assets/solar-deep-sky.jpg';
const obliquity = 23.4392911 * Math.PI / 180;
const cosEpsilon = Math.cos(obliquity), sinEpsilon = Math.sin(obliquity);
let catalogue;

export function starCatalogue() {
  if (catalogue) return catalogue;
  const bytes = atob(packedStars);
  const count = bytes.length / 6;
  const position = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const diameter = new Float32Array(count);
  const tintStops = [
    [-.40,167,194,255], [0,203,217,255], [.35,240,241,255],
    [.65,255,249,236], [1.08,255,224,187], [1.60,255,192,150], [3,254,176,137],
  ];
  for (let i = 0; i < count; i++) {
    const j = i * 6, k = i * 3;
    const ra = (bytes.charCodeAt(j) + bytes.charCodeAt(j + 1) * 256) * (2 * Math.PI / 65535);
    const dec = (bytes.charCodeAt(j + 2) + bytes.charCodeAt(j + 3) * 256) * (Math.PI / 65535) - Math.PI / 2;
    const mag = bytes.charCodeAt(j + 4) / 25 - 2;
    const bv = bytes.charCodeAt(j + 5) / 80 - .45;
    const y = Math.cos(dec) * Math.sin(ra), z = Math.sin(dec);
    position[k] = Math.cos(dec) * Math.cos(ra);
    position[k + 1] = z * cosEpsilon - y * sinEpsilon;
    position[k + 2] = -(y * cosEpsilon + z * sinEpsilon);
    // Compress the catalogue's ~1000:1 flux range to a phone display; only the
    // brighter stars retain appreciable colour at a dark-adapted exposure.
    const peak = Math.min(1, .09 + 1.05 * Math.exp(-.31 * (mag + .35)));
    diameter[i] = 2.7 + 7.0 * Math.exp(-.43 * (mag + 1.5));
    let upper = 1;
    while (upper < tintStops.length - 1 && bv > tintStops[upper][0]) upper++;
    const lo = tintStops[upper - 1], hi = tintStops[upper];
    const t = Math.max(0, Math.min(1, (bv - lo[0]) / (hi[0] - lo[0])));
    const chroma = .14 + .86 * Math.min(1, Math.max(0, (5.7 - mag) / 4));
    for (let channel = 0; channel < 3; channel++) {
      const tint = (lo[channel+1] * (1-t) + hi[channel+1] * t) / 255;
      color[k+channel] = peak * (1 - chroma * (1 - tint));
    }
  }
  catalogue = {count, position, color, diameter};
  return catalogue;
}

// The old Android software canvas makes hundreds of scaled sprite draws expensive.
// Rasterise just the few touched pixels per visible star into one transparent plate.
function makeStarLayer(stars) {
  const layer=document.createElement('canvas'), ctx=layer.getContext('2d');
  const psf=new Uint8Array(257);
  for (let i=0;i<256;i++) {
    const q=i/255;
    psf[i]=Math.round(255*(.85*Math.exp(-7.4*q)+.15*Math.exp(-2.35*q)));
  }
  let pixels;
  return (out,w,h,lens,scale,axes) => {
    if (layer.width!==w||layer.height!==h||!pixels) {
      layer.width=w;layer.height=h;pixels=ctx.createImageData(w,h);
    } else {
      pixels.data.fill(0);
    }
    const f=axes.forward, r=axes.right, u=axes.up, pos=stars.position, bytes=pixels.data;
    for (let i=0;i<stars.count;i++) {
      const k=i*3, x=pos[k], y=pos[k+1], z=pos[k+2], depth=x*f[0]+y*f[1]+z*f[2];
      if (depth<=0) continue;
      const radius=stars.diameter[i]*scale*.5, px=w*.5+(x*r[0]+y*r[1]+z*r[2])*lens/depth;
      if (px<-radius||px>w+radius) continue;
      const py=h*.5-(x*u[0]+y*u[1]+z*u[2])*lens/depth;
      if (py<-radius||py>h+radius) continue;
      const x0=Math.max(0,Math.ceil(px-radius-.5)), x1=Math.min(w-1,Math.floor(px+radius-.5));
      const y0=Math.max(0,Math.ceil(py-radius-.5)), y1=Math.min(h-1,Math.floor(py+radius-.5));
      const inv=256/(radius*radius),red=stars.color[k]*255, green=stars.color[k+1]*255, blue=stars.color[k+2]*255;
      for (let yy=y0;yy<=y1;yy++) {
        const dy=yy+.5-py, row=yy*w;
        for (let xx=x0;xx<=x1;xx++) {
          const dx=xx+.5-px, q=(dx*dx+dy*dy)*inv;
          if (q>=256) continue;
          const j=(row+xx)*4, alpha=psf[q|0];
          if (alpha*red<=bytes[j]*bytes[j+3]) continue;
          bytes[j]=red; bytes[j+1]=green; bytes[j+2]=blue; bytes[j+3]=alpha;
        }
      }
    }
    ctx.putImageData(pixels,0,0);
    out.drawImage(layer,0,0);
  };
}

function projectDiffuse(plate, texels, face, width, height, focal, axes) {
  const ctx = plate.getContext('2d');
  const image = ctx.createImageData(plate.width,plate.height);
  const stepX = width / (focal * plate.width), stepY = height / (focal * plate.height);
  const f=axes.forward, r=axes.right, u=axes.up;
  for (let j = 0, pixel = 0; j < plate.height; j++) {
    const v=(plate.height/2-j-.5)*stepY, left=(.5-plate.width/2)*stepX;
    let x=f[0]+v*u[0]+left*r[0], y=f[1]+v*u[1]+left*r[1], z=f[2]+v*u[2]+left*r[2];
    for (let i=0; i<plate.width; i++, pixel+=4, x+=stepX*r[0], y+=stepX*r[1], z+=stepX*r[2]) {
      const ax=Math.abs(x), ay=Math.abs(y), az=Math.abs(z);
      let side, a, b, major;
      if (ax >= ay && ax >= az) {
        side=x>=0?0:1; major=ax; a=x>=0?-z:z; b=-y;
      } else if (ay >= az) {
        side=y>=0?2:3; major=ay; a=x; b=y>=0?z:-z;
      } else {
        side=z>=0?4:5; major=az; a=z>=0?x:-x; b=-y;
      }
      const fx = Math.max(0,Math.min(face-1,(.5+.5*a/major)*face-.5));
      const fy = Math.max(0,Math.min(face-1,(.5+.5*b/major)*face-.5));
      const ix=fx|0, iy=fy|0, wx=fx-ix, wy=fy-iy;
      const row=(side%3)*face + (Math.floor(side/3)*face+iy)*3*face;
      const top=(row+ix)*4, right=ix+1<face?4:0, down=iy+1<face?12*face:0;
      for (let channel=0; channel<3; channel++) {
        const p=top+channel;
        image.data[pixel+channel]=(1-wy)*((1-wx)*texels[p]+wx*texels[p+right])
          + wy*((1-wx)*texels[p+down]+wx*texels[p+down+right]);
      }
      image.data[pixel+3]=255;
    }
  }
  ctx.putImageData(image,0,0);
}

export function createCanvasSky() {
  const drawStars=makeStarLayer(starCatalogue());
  const diffuse=document.createElement('canvas'), cache=document.createElement('canvas');
  const face=192, atlas=document.createElement('canvas'), img=new Image();
  let texels=null, lastView=null;
  img.onload=() => {
    atlas.width=face*3; atlas.height=face*2;
    const ctx=atlas.getContext('2d');
    ctx.drawImage(img,0,0,atlas.width,atlas.height);
    texels=ctx.getImageData(0,0,atlas.width,atlas.height).data;
    atlas.width=atlas.height=1; lastView=null;
  };
  img.src=skyAtlas;
  return (out,w,h,focal,axes) => {
    const maxPixels = Math.min(1, 1100 / Math.max(w,h));
    const cw=Math.max(1,Math.round(w*maxPixels)), ch=Math.max(1,Math.round(h*maxPixels));
    const f=axes.forward, r=axes.right;
    const view=[cw,ch,focal,...f,...r];
    if (!lastView || view.some((value,i)=>Math.abs(value-lastView[i])>1e-6)) {
      lastView=view;
      if (cache.width!==cw || cache.height!==ch) {cache.width=cw;cache.height=ch;}
      const ctx=cache.getContext('2d'), lens=focal*maxPixels;
      ctx.fillStyle='#020305';ctx.fillRect(0,0,cw,ch);
      if (texels) {
        const scale=Math.min(1,144 / Math.max(cw,ch));
        const dw=Math.max(1,Math.round(cw*scale)), dh=Math.max(1,Math.round(ch*scale));
        if (diffuse.width!==dw || diffuse.height!==dh) {diffuse.width=dw;diffuse.height=dh;}
        projectDiffuse(diffuse,texels,face,cw,ch,lens,axes);
        ctx.drawImage(diffuse,0,0,cw,ch);
      }
      drawStars(ctx,cw,ch,lens,maxPixels,axes);
    }
    out.drawImage(cache,0,0,w,h);
  };
}
