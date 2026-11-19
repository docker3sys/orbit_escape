// The aperture and ship both use normalized screen coordinates, independent of DPI.
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mix = (a, b, u) => a + (b - a) * u;
const LEGS = [
  { x: -.50, y: -.29, span: 5.1, tone: "#93f1d5", rgb: "117,235,203" },
  { x: .48, y: .33, span: 4.9, tone: "#ffd19b", rgb: "249,187,119" },
  { x: -.16, y: -.55, span: 4.7, tone: "#b9c9ff", rgb: "166,190,255" },
];

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function path(ctx, pts, color, width, close = false, fill = false) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
  if (fill) { ctx.fillStyle = color; ctx.fill(); }
  else { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
}

function ellipse(ctx, x, y, rx, ry, tilt, color, width = 0, start = 0, end = TAU) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), tilt, start, end);
  if (width) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
  else { ctx.fillStyle = color; ctx.fill(); }
}

function bloom(ctx, x, y, r, stops) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [p,c] of stops) g.addColorStop(p,c);
  ctx.fillStyle = g;
  ctx.fillRect(x-r, y-r, r*2, r*2);
}

// A small baked radiance field keeps the folds of the aurora stationary against the stars.
function makeSky(w, h, dpr) {
  const out = document.createElement("canvas");
  out.width = Math.round(w*dpr); out.height = Math.round(h*dpr);
  const ctx = out.getContext("2d");
  const tint = document.createElement("canvas");
  tint.width = 420; tint.height = Math.round(clamp(420*h/w, 190, 650));
  const sm = tint.getContext("2d");
  const image = sm.createImageData(tint.width, tint.height);
  const rng = seeded(18435);
  const noise = Float32Array.from({length:4096}, rng);
  function value(x,y) {
    const ix=Math.floor(x), iy=Math.floor(y);
    let a=x-ix, b=y-iy;
    a=a*a*(3-2*a);b=b*b*(3-2*b);
    const j=(iy&63)*64, k=((iy+1)&63)*64, p=ix&63,q=(ix+1)&63;
    return mix(mix(noise[j+p],noise[j+q],a),mix(noise[k+p],noise[k+q],a),b);
  }
  const pw=tint.width, ph=tint.height;
  for(let j=0;j<ph;j++) {
    const y=j/ph;
    for(let i=0;i<pw;i++) {
      const x=i/pw;
      const bend=value(x*4.1+12,y*4+24);
      const n=value(x*11+2*bend,y*12+36+2*bend)*.53+value(x*30+3*bend,y*27+12)*.31+value(x*86,y*79+8)*.16;
      const ridge=.33+.15*Math.sin(4.7*x-.78)+.058*Math.sin(12.5*x+1.2)+.09*(bend-.5)-.32*x;
      const depth=y-ridge;
      const lanes=Math.sin(x*84+bend*8+depth*4)*.11+Math.sin(x*107+depth*11+bend*4)*.065;
      const curtain=Math.exp(-Math.pow((depth+.033)/(.09+.07*bend),2)) * Math.max(0,n-.19+lanes);
      const fold=Math.exp(-Math.abs(depth-.015*(n-.5))/.014)*(.22+.65*n);
      const wing=Math.exp(-Math.pow((y-.79+.42*x+.13*Math.sin(4*x)+.12*bend)/.15,2))*Math.max(0,n-.29);
      const dark= .75 + .22*Math.cos((x-.46)*3)*Math.cos((y-.45)*3);
      const g=(j*pw+i)*4;
      image.data[g]=(4+6*n+curtain*(23+38*x)+fold*12+wing*46)*dark;
      image.data[g+1]=(9+7*n+curtain*(104-44*x)+fold*69+wing*18)*dark;
      image.data[g+2]=(20+12*n+curtain*(84+40*x)+fold*49+wing*47)*dark;
      image.data[g+3]=255;
    }
  }
  sm.putImageData(image,0,0);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.drawImage(tint,0,0,w,h);
  for(let i=0, n=Math.min(1150,Math.max(310,w*h/580));i<n;i++) {
    const x=rng()*w,y=rng()*h,v=rng(),r=.3+v*v*.72;
    ctx.globalAlpha=.25+.68*v;
    ctx.fillStyle=i%5===0?"#f8d7af":i%4===0?"#9cd6f3":"#e2e9ee";
    ctx.fillRect(x,y,r,r);
    if(v>.981) {
      ctx.globalAlpha=.21;ctx.fillRect(x-2.7,y,6.2,.8);ctx.fillRect(x,y-2.8,.8,6.1);
    }
  }
  ctx.globalAlpha=1;
  const min=Math.min(w,h),r=min*.55, cx=w*.06-r*.29, cy=h*.96+r*.48;
  // Foreground ice giant; its rings disappear into a clouded night side.
  ctx.save(); ctx.translate(cx,cy);ctx.rotate(-.23);
  for(let k=0;k<15;k++) {
    const rr=r*(1.22+k*.027);
    ellipse(ctx,0,0,rr,rr*.21,0,`rgba(178,211,207,${.05+.05*Math.cos(k*1.6)})`,(1+k%2)*.7);
  }
  const limb=ctx.createLinearGradient(-r,-r,r*.7,r*.85);
  limb.addColorStop(0,"#426772");limb.addColorStop(.25,"#203947");
  limb.addColorStop(.5,"#111f30");limb.addColorStop(1,"#080e1c");
  ellipse(ctx,0,0,r,r,0,limb);ctx.clip();
  for(let k=0;k<37;k++) {
    const cy=-r+k*r*.055;
    ctx.beginPath();ctx.moveTo(-r,cy);
    ctx.bezierCurveTo(-r*.38,cy-r*.24,r*.46,cy+r*.13,r,cy-r*.16);
    ctx.strokeStyle=k%5===0?"rgba(119,163,167,.085)":"rgba(4,11,20,.09)";
    ctx.lineWidth=r*(.012+.012*rng());ctx.stroke();
  }
  ctx.restore();
  ellipse(ctx,cx,cy,r+1.2,r+1.2,0,"rgba(144,218,209,.34)",1.6,3.44,5.11);
  return out;
}

function drawObservatory(ctx, x, y, scale, t, awake, people, still) {
  // Three petal mirrors share a truss and a receiver; the local crew lights
  // the warm habitation windows, while the relay ending lights a second dish.
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.rotate(-.12);
  const beam=awake?(people?"#ffd59a":"#a6f6d9"):"#6c898b";
  const sweep=still?.1:.12*Math.sin(t*.25);
  bloom(ctx,0,-6,101,[[0,awake?"rgba(96,195,185,.17)":"rgba(64,110,131,.08)"],[1,"rgba(20,65,77,0)"]]);
  for(const side of [-1,1]) {
    for(let k=0;k<3;k++) {
      const bx=side*(34+k*22), ex=bx+side*19;
      const panel=[[bx,7],[ex,5],[ex+6,24],[bx+6,26]];
      path(ctx,panel,"#172f3d",0,true,true);
      path(ctx,panel,"#698887",.8,true);
      for(let n=1;n<4;n++) {
        const xx=mix(bx,ex,n/4);
        path(ctx,[[xx,6],[xx+6,25]],"#3f6570",.65);
      }
      path(ctx,[[bx+3,16],[ex+3,14]],"#879b8c",.7);
    }
    path(ctx,[[side*16,12],[side*38,16],[side*98,12]],"#8b9283",1.4);
  }
  // A pressurized torus sits behind the mirror mount; the shaded underside
  // and the sparse running lamps keep the docking side legible at a distance.
  ellipse(ctx,0,21,45,9,-.07,"#101e2a",4.6);
  ellipse(ctx,0,19,45,8,-.07,"#6d7d7b",1.5);
  for(let i=0;i<12;i++) {
    const angle=i*TAU/12, xx=Math.cos(angle)*45, yy=19+Math.sin(angle)*8-xx*.07;
    path(ctx,[[xx,yy],[xx,yy+2.5]],awake&&i%2===0?beam:"#4e626b",1.6);
  }
  const hull=[[-21,-3],[-7,-13],[17,-13],[28,2],[18,22],[-10,27],[-23,16]];
  path(ctx,hull,"#283c46",0,true,true);path(ctx,hull,"#afb8a5",1.6,true);
  path(ctx,[[-20,-3],[-6,-12],[17,-12],[22,-5],[7,4],[-11,6]],"#69796f",0,true,true);
  const roof=ctx.createLinearGradient(-18,-13,18,4);
  roof.addColorStop(0,"#c2b699");roof.addColorStop(.47,"#7d8b83");roof.addColorStop(1,"#45585e");
  path(ctx,[[-17,-4],[-5,-12],[16,-12],[20,-7],[7,1],[-12,4]],roof,0,true,true);
  for(let i=0;i<5;i++) {
    const m=i*5;
    path(ctx,[[-12+m,0],[-3+m,-7]],"#576a68",.7);
  }
  path(ctx,[[18,-6],[25,2],[16,17],[-9,22]],"#455d66",.8);
  path(ctx,[[-22,14],[-14,18],[-9,18]],"#acbbac",.85);
  if(awake&&people)bloom(ctx,-2,12,13,[[0,"rgba(255,197,122,.24)"],[1,"rgba(255,181,95,0)"]]);
  for(let k=0;k<6;k++) {ctx.fillStyle=awake&&people?beam:"#58727a";ctx.fillRect(-13+k*5.2,9,2.4,5.5);}
  path(ctx,[[-10,-8],[-7,-35],[5,-30],[15,-8]],"#93a79e",1.5);
  ctx.save();ctx.translate(-6,-28);ctx.rotate(sweep-.16);
  for(let k=0;k<3;k++) {
    const x0=(k-1)*18, rim=-48+(k%2)*5;
    const shape=[[0,0],[x0-13,rim+9],[x0-4,rim],[x0+15,rim+5],[x0+8,rim+16]];
    const facet=ctx.createLinearGradient(x0-12,rim,x0+6,-3);
    facet.addColorStop(0,k===1?"#dcc094":"#97a694");facet.addColorStop(.38,k===1?"#93866c":"#728789");
    facet.addColorStop(1,"#384d56");
    path(ctx,shape,facet,0,true,true);
    path(ctx,shape,"#c3c8ac",1,true);
    for(let j=1;j<4;j++) {
      const q=j/4;
      path(ctx,[[0,0],[x0-12+j*6,rim+5]],"#384f59",.8);
      path(ctx,[[(x0-13)*q,(rim+9)*q],[(x0-4)*q,rim*q],[(x0+14)*q,(rim+5)*q]],"#acb5a3",.48);
    }
  }
  path(ctx,[[0,0],[-2,-57]],"#d0cdad",1.3);
  if(awake) {
    bloom(ctx,-2,-56,16,[[0,"rgba(255,238,190,.72)"],[.17,"rgba(176,238,217,.37)"],[1,"rgba(104,176,171,0)"]]);
    ellipse(ctx,-2,-56,1.8,1.8,0,beam);
  }
  ctx.restore();
  if(awake&&!people) {
    path(ctx,[[24,9],[42,-2],[46,-17]],"#9ecdb6",1.7);
    ellipse(ctx,45,-14,9,3,-.48,"#aac7b7",1.2);
    ellipse(ctx,46,-18,1.8,1.8,0,beam);
  }
  ctx.restore();
}

function drawShuttle(ctx,x,y,size,angle,people) {
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(size,size);
  path(ctx,[[-8,-3],[-25,0],[-8,3]],"rgba(120,232,213,.36)",0,true,true);
  path(ctx,[[-8,-5],[10,0],[-8,6],[-4,0]],"#bdc7bf",0,true,true);
  path(ctx,[[-2,-2],[5,0],[-2,2]],people?"#ffbe82":"#96f7d2",0,true,true);
  ctx.restore();
}

export function createLastFlight(canvas, hooks={}) {
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw new Error("Canvas 2D unavailable");
  let w=0,h=0,ratio=0,sky=null,clock=0,elapsed=0,active=true;
  let mode="",section=-1,passed=false,afterMiss=0,shipX=0,shipY=0,wantX=0,wantY=0;
  const held=new Set();
  let stickX=0,stickY=0;
  function stick(x,y) {stickX=x;stickY=y;}
  const rng=seeded(483195);
  const motes=Array.from({length:104},()=>({angle:rng()*TAU, spread:.2+rng()*1.04, z:rng(), tint:rng()}));

  function resize() {
    const rect=canvas.getBoundingClientRect(), nextW=Math.max(1,Math.round(rect.width)), nextH=Math.max(1,Math.round(rect.height));
    const nextRatio=clamp(window.devicePixelRatio||1,1,2);
    if(w===nextW&&h===nextH&&ratio===nextRatio)return;
    w=nextW;h=nextH;ratio=nextRatio;
    canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
    sky=makeSky(w,h,ratio);
  }
  function steer(x,y) {
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    wantX=clamp(x,-.94,.94);wantY=clamp(y,-.93,.93);
  }
  function key(name,pressed) {
    if(pressed)held.add(name);else held.delete(name);
  }
  function sideCurtains(cx,cy,min,leg,t,still) {
    // Long filaments flow past the ship on either side of the navigable opening.
    const speed=still?0:t*.25, fade=afterMiss>0?.7:1;
    ctx.save();ctx.lineCap="round";
    for(const side of [-1,1]) {
      for(let k=0;k<15;k++) {
        const depth=k/14, points=[];
        for(let a=0;a<=24;a++) {
          const v=a/24, reach=Math.pow(v,.89);
          const twist=Math.sin(2.6*v+leg*.69+side*.55+depth*.38+speed*.24);
          const ripple=Math.sin(v*12.6+depth*.75-speed*.8)*.03;
          points.push([cx+side*(.115+reach*(.77+depth*.42))*w*.72,
            cy+(side*.14+twist*.34+depth*(.22+.1*v)+ripple-.31)*min*(.21+reach*1.33)]);
        }
        const tint=side<0?[108,213,184]:leg===1?[255,169,100]:[162,159,228];
        const alpha=(k%4===0?.24:.075)*fade;
        path(ctx,points,`rgba(${tint.join(",")},${alpha})`,k%4===0?1.35:.75);
        if(k%5===0)path(ctx,points,`rgba(${tint.join(",")},.017)`,min*.043);
      }
    }
    ctx.restore();
  }
  function starTrails(cx,cy,leg,t,still) {
    if(still)return;
    const diag=Math.hypot(w,h)*.65, offset=elapsed*2;
    for(const m of motes) {
      const d=(m.z+t*.105)%1;
      const reach=(.009+d*d)*diag*m.spread;
      const a=m.angle+.03*Math.sin(t*.14+m.angle);
      const dx=Math.cos(a),dy=Math.sin(a);
      const x=cx+dx*reach,y=cy+dy*reach;
      const tail=(1+d**4*(12+leg*1.8)+.3*Math.sin(offset+m.angle));
      ctx.strokeStyle=m.tint>.71?`rgba(255,207,157,${.07+.49*d})`:`rgba(171,228,233,${.07+.61*d})`;
      ctx.lineWidth=.6+d*.75;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx*tail,y+dy*tail);ctx.stroke();
    }
  }
  function navigationSpars(cx,cy,t,still) {
    const unit=Math.min(w,h);
    // Objects on either bank grow nonlinearly past the canopy. The nearest
    // facets pass out of frame, so motion reads even with the stars disabled.
    for(let i=0;i<12;i++) {
      const side=i%2===0?-1:1;
      const depth=(i*.381966+(still?.24:t*.14))%1;
      const proj=.095+depth*depth*.97;
      const angle=i*1.63+side*.34;
      const x=cx+side*w*proj*(.51+.12*Math.sin(i*2.3));
      const y=cy+unit*proj*(.49*Math.sin(angle)+.19*side);
      const r=(1.8+unit*.038*proj)*(.64+.38*Math.sin(i+1)**2);
      // Keep the target area clear of the near foreground guides.
      ctx.save();ctx.translate(x,y);ctx.rotate(side*(.67+i%3*.16));
      ctx.globalAlpha=.24+.52*depth;
      path(ctx,[[-.65*r,-.18*r],[0,-.42*r],[1.48*r,-.16*r],[.89*r,.18*r],[-r,.2*r]],"#263e4d",0,true,true);
      path(ctx,[[0,-.42*r],[1.48*r,-.16*r],[.89*r,.18*r]],"#688181",0,true,true);
      path(ctx,[[-r,.2*r],[.89*r,.18*r]],side<0?"#a2dbce":"#c4aa98",Math.max(.5,r*.068));
      ellipse(ctx,0,-.34*r,Math.max(.8,r*.13),Math.max(.7,r*.095),0,side<0?"#b7ffe7":"#ffd6ab");
      ctx.restore();
    }
  }
  function drawIris(x,y,r,look,aligned,i,p,still) {
    const tilt=.18*Math.sin(i*1.9+.7),ry=r*.87;
    const rot=still?i:clock*(.16+i*.026)+i*1.73;
    const mid=aligned?"#daffe5":look.tone;
    ctx.save();ctx.translate(x,y);ctx.rotate(tilt);
    bloom(ctx,0,0,r*1.63,[[0,"rgba(21,40,58,0)"],[.45,`rgba(${look.rgb},.055)`],[.62,`rgba(${look.rgb},.16)`],[.81,`rgba(${look.rgb},.032)`],[1,`rgba(${look.rgb},0)`]]);
    const shadow=ctx.createRadialGradient(0,0,0,0,0,r);
    shadow.addColorStop(0,"rgba(6,16,28,.68)");shadow.addColorStop(.68,"rgba(8,17,33,.64)");shadow.addColorStop(1,"rgba(48,74,79,.30)");
    ellipse(ctx,0,0,r,ry,0,shadow);
    ellipse(ctx,0,0,r,ry,0,`rgba(${look.rgb},.26)`,Math.max(3,r*.18));
    ellipse(ctx,0,0,r,ry,0,mid,Math.max(1.3,r*.035));
    ellipse(ctx,0,0,r*.88,ry*.88,0,`rgba(${look.rgb},.70)`,1);
    for(let k=0;k<6;k++) {
      const a=rot+k*TAU/6;
      ellipse(ctx,0,0,r*1.12,ry*1.12,0,"rgba(23,32,44,.92)",Math.max(2,r*.095),a+.10,a+.74);
      ellipse(ctx,0,0,r*1.16,ry*1.16,0,`rgba(${look.rgb},.67)`,1.2,a+.12,a+.68);
      const dx=Math.cos(a),dy=Math.sin(a),sx=dx*r,sy=dy*ry;
      path(ctx,[[sx*1.02,sy*1.02],[sx*1.35,sy*1.35]],k%2===0?mid:"#789092",k%2===0?2:1);
    }
    const pulse=still?.5:(.5+.5*Math.sin(clock*2.2));
    ctx.globalAlpha=.24+.34*pulse;
    path(ctx,[[-r*.23,0],[-r*.08,0]],mid,1);path(ctx,[[r*.08,0],[r*.23,0]],mid,1);
    path(ctx,[[0,-ry*.23],[0,-ry*.08]],mid,1);path(ctx,[[0,ry*.08],[0,ry*.23]],mid,1);
    ctx.globalAlpha=1;
    // Three teeth are physical beacons that can be read with colour or audio disabled.
    if(p>.41) for(let k=0;k<=i;k++) {
      const px=(k-i/2)*6;
      ctx.fillStyle=mid;ctx.fillRect(px-1.3,ry*1.44,2.6,4.4);
    }
    ctx.restore();
  }
  function drawReticle(x,y,aligned,rmin) {
    const r=clamp(rmin*.036,10,22);
    ctx.save();ctx.translate(x,y);
    const color=aligned?"#e1ffdf":"#fff2d5";
    for(const s of [-1,1]) {
      const pts=[[s*r*2.15,r*.39],[s*r*1.18,r*.19],[s*r*.80,-r*.40]];
      path(ctx,pts,"rgba(4,14,24,.86)",4.3);path(ctx,pts,color,1.65);
    }
    ellipse(ctx,0,0,2.0,2.0,0,color);
    if(aligned) ellipse(ctx,0,0,r*.57,r*.57,0,"rgba(209,255,220,.77)",1);
    ctx.restore();
  }
  function stillScene(home,choice,reduced) {
    const unit=Math.min(w,h), cx=w*(home?.58:.53),cy=h*(home?.47:.50);
    const scale=clamp(unit/(home?270:360),.58,2.28);
    if(home) {
      const aclock=reduced?.13:clock*.26;
      const a=aclock-.46;
      ellipse(ctx,cx,cy+scale*9,scale*136,scale*46,-.21,"rgba(170,213,194,.16)",1);
      if(Math.sin(a)<0)drawShuttle(ctx,cx+Math.cos(a)*scale*130,cy+Math.sin(a)*scale*40-Math.cos(a)*scale*24,scale*.45,a+Math.PI/2,choice==="people");
      drawObservatory(ctx,cx,cy,scale,clock,true,choice==="people",reduced);
      if(Math.sin(a)>=0)drawShuttle(ctx,cx+Math.cos(a)*scale*130,cy+Math.sin(a)*scale*40-Math.cos(a)*scale*24,scale*.45,a+Math.PI/2,choice==="people");
    } else {
      drawObservatory(ctx,cx,cy,scale,clock,false,false,reduced);
      for(let k=0;k<3;k++) {
        const u=(clock*.18+k/3)%1;
        const frac=reduced?(k+1)/4:u;
        ellipse(ctx,cx-6*scale,cy-41*scale,(29+72*frac)*scale,(29+72*frac)*scale,-.14,`rgba(130,209,201,${.24*(1-frac)})`,1,3.5,5.55);
      }
    }
  }
  function render(rawDt,state={}) {
    if(!active)return;
    resize();
    const dt=clamp(Number.isFinite(rawDt)?rawDt:0,0,.10);
    const nextMode=state.phase||"tune",leg=clamp(Math.floor(Number(state.leg)||0),0,2);
    if(mode!==nextMode||section!==leg) {
      mode=nextMode;section=leg;elapsed=0;passed=false;afterMiss=0;
      if(mode!=="fly"){shipX=shipY=wantX=wantY=0;held.clear();}
    }
    clock+=dt;
    const level=LEGS[leg], reduced=!!state.reducedMotion;
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.drawImage(sky,0,0,w,h);
    const u=Math.min(w,h), phase01=(clock%3.6)/3.6;
    if(mode!=="fly") {
      stillScene(mode==="home",state.choice,reduced);
      hooks.onTelemetry?.({x:0,y:0,targetX:0,targetY:0,distance:0,aligned:false,progress:0,phase01,visible:false});
      return;
    }
    let dx=Number(held.has("right"))-Number(held.has("left"));
    let dy=Number(held.has("down"))-Number(held.has("up"));
    if(dx&&dy){dx*=Math.SQRT1_2;dy*=Math.SQRT1_2;}
    if(dx||dy||stickX||stickY) {
      const step = dt * Math.min(w,h) * 2.25;
      steer(wantX + dx*dt*1.16 + stickX*step/w, wantY + dy*dt*1.42 + stickY*step/h);
    }
    const follow=1-Math.exp(-dt*(reduced?12:8.8));
    shipX=mix(shipX,wantX,follow);shipY=mix(shipY,wantY,follow);
    afterMiss=Math.max(0,afterMiss-dt);
    if(!passed && afterMiss===0)elapsed+=dt;
    const p=clamp(elapsed/level.span,0,1), perspective=.51+.49*p;
    const drift=reduced?0:(1-p)*.044;
    const tx=level.x*perspective+Math.sin(1.4*clock+leg)*drift;
    const ty=level.y*perspective+Math.cos(1.1*clock+leg)*drift;
    const px=(tx+1)*w*.5,py=(ty+1)*h*.5;
    const sx=(shipX+1)*w*.5,sy=(shipY+1)*h*.5;
    // The same ellipse drives drawing and capture. Minimum radius keeps a
    // landscape phone's short viewport reasonable under a thumb.
    const radius=clamp(u*.112,23,63)*(.48+.52*p*p);
    const hit=((sx-px)/radius)**2+((sy-py)/(radius*.87))**2<=1;
    const vx=w*(.5+tx*.09)-shipX*u*.038,vy=h*(.5+ty*.09)-shipY*u*.026;
    sideCurtains(vx,vy,u,leg,clock,reduced);
    starTrails(vx,vy,leg,clock,reduced);
    navigationSpars(vx,vy,clock,reduced);
    drawIris(px,py,radius,level,hit,leg,p,reduced);
    drawReticle(sx,sy,hit,u);
    if(afterMiss>0) {
      ctx.strokeStyle=`rgba(229,148,100,${.45*afterMiss/.75})`;
      ctx.lineWidth=2;ctx.strokeRect(3,3,w-6,h-6);
    }
    hooks.onTelemetry?.({x:shipX,y:shipY,targetX:tx,targetY:ty,distance:Math.round((1-p)*420),aligned:hit,progress:p,phase01,visible:true});
    if(p>=1&&!passed) {
      if(hit) { passed=true;hooks.onEvent?.("pass"); }
      else { elapsed=0;afterMiss=.75;hooks.onEvent?.("miss"); }
    }
  }
  return {render,steer,key,stick,dispose() {active=false;held.clear();if(sky){sky.width=sky.height=1;sky=null;}}};
}
