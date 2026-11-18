// Flight display for WebViews without a WebGL2 context. All artwork is generated offline.
const TAU = Math.PI * 2;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const wrap = (n, period) => ((n % period) + period) % period;
const angle = n => Math.atan2(Math.sin(n), Math.cos(n));

function randomSequence() {
  let s = 1271981;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function surface(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function nebulaArt(rand) {
  const c = surface(800, 560), g = c.getContext("2d");
  g.fillStyle = "#030712";
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 185; i++) {
    const x = rand()*960-80;
    const y = 340 - Math.sin(x/300)*112 + (rand()-.5)*115;
    const r = 10 + rand()**2*115;
    const grad = g.createRadialGradient(x,y,0,x,y,r);
    const rgb = i%5===0 ? "153,104,107" : i%3===0 ? "96,108,167" : "37,103,118";
    grad.addColorStop(0,`rgba(${rgb},${.018+rand()*.069})`);
    grad.addColorStop(1,`rgba(${rgb},0)`);
    g.fillStyle=grad;g.fillRect(x-r,y-r,r*2,r*2);
  }
  return c;
}

function blackHoleArt() {
  const w=440,h=255,c=surface(w,h),g=c.getContext("2d"),img=g.createImageData(w,h);
  const gauss = n => Math.exp(-n*n);
  for(let py=0;py<h;py++)for(let px=0;px<w;px++){
    const sx=(px-w*.5)/(w*.5),sy=(py-h*.51)/(w*.5);
    const x=sx*.978-sy*.21, y=sy*.978+sx*.21;
    const r=Math.hypot(x,y), a=Math.atan2(y,x);
    const event=.20, eclipse=clamp((event-r)*210,0,1);
    const shadow=clamp((event+.022-r)*70,0,1);
    const photon=gauss((r-event)/.0054);
    const red=gauss((r-event-.011)/.017);
    const lensR=Math.hypot(x/.342,y/(y<0?.316:.235));
    const whorls=.8+.14*Math.sin(102*lensR+4*Math.sin(a*3))+.06*Math.sin(162*lensR+a*12);
    const lens=(gauss((lensR-1)/.119)+.28*gauss((lensR-.842)/.032))*whorls*(y<0?1.04:.56);
    const taper=Math.max(0,1-Math.abs(x)**1.5);
    const diskY=y-.018-.025*x*x;
    const diskHeight=.012+.036*taper*taper;
    const striae=.82+.10*Math.sin(diskY*475+Math.abs(x)*19)+.08*Math.sin(diskY*704-x*54);
    const beaming=clamp(.76-.49*x,.24,1.2);
    const disk=(gauss(diskY/diskHeight)*striae+.47*gauss(diskY/(diskHeight*.27)))*taper*beaming;
    const veil=(lens+.36*photon+.21*red)*(1-eclipse);
    const glow=.14*gauss((r-.25)/.16)*(1-eclipse)+.15*gauss(diskY/(diskHeight*3))*taper;
    const light=disk+veil, alpha=clamp(Math.max(shadow,1.6*light+glow),0,1), heat=clamp((light-.36)*1.05,0,1);
    const i=(px+py*w)*4;
    img.data[i]=Math.min(255,(light*.95+heat*.6+glow*.51)/Math.max(.01,alpha)*260);
    img.data[i+1]=Math.min(255,(light*.34+heat*.57+glow*.12)/Math.max(.01,alpha)*255);
    img.data[i+2]=Math.min(255,(light*.12+heat*.39+glow*.055)/Math.max(.01,alpha)*255);
    img.data[i+3]=alpha*255;
  }
  g.putImageData(img,0,0);return c;
}

function ring(g,x,y,r,stroke,width=1) {
  if(r<=0)return;
  g.strokeStyle=stroke;g.lineWidth=width;g.beginPath();g.arc(x,y,r,0,TAU);g.stroke();
}

function path(g, points, fill, line=null, width=1) {
  g.beginPath();g.moveTo(points[0][0], points[0][1]);
  for(let i=1;i<points.length;i++)g.lineTo(points[i][0],points[i][1]);
  if(fill){g.closePath();g.fillStyle=fill;g.fill()}
  if(line){g.strokeStyle=line;g.lineWidth=width;g.stroke()}
}

function voyager(g,x,y,scale) {
  g.save();g.translate(x,y);g.scale(scale,scale);g.rotate(-.29);
  path(g,[[-3,2],[73,-5],[73,0],[0,10]],null,"#788d91",1.2);
  for(let i=0;i<8;i++)path(g,[[i*8,7-i],[i*8+5,-i],[i*8+9,6-i]],null,"#a9adb1",.7);
  path(g,[[-14,3],[-7,-4],[9,-4],[15,5],[9,14],[-13,13]],"#9c672a","#e4b674",1);
  for(let i=0;i<7;i++)path(g,[[-10+i*3,5],[-12+i*3,12]],null,"#d19847",1.3);
  path(g,[[-10,10],[-46,23]],null,"#939b9b",2.2);
  for(let i=0;i<7;i++)path(g,[[-25-i*2,11+i*.7],[-22-i*2,20+i*.7]],null,"#586972",2);
  path(g,[[5,9],[-20,62]],null,"#8da4ae",.9);
  path(g,[[5,9],[44,53]],null,"#8296a0",.9);
  g.save();g.rotate(-.38);g.translate(0,-7);
  g.fillStyle="#b9b9b3";g.beginPath();g.moveTo(-22,0);g.bezierCurveTo(-15,17,9,26,20,1);g.closePath();g.fill();
  g.fillStyle="#dfdfd4";g.beginPath();g.ellipse(0,0,22,7,0,0,TAU);g.fill();
  path(g,[[-20,0],[1,-20],[20,0]],null,"#697883",.9);
  path(g,[[1,-20],[4,4]],null,"#80909a",.75);
  g.fillStyle="#d5983d";g.fillRect(-1,-22,5,4);g.restore();g.restore();
}

function station(g,x,y,scale,outpost,lit,t) {
  g.save();g.translate(x,y);g.scale(scale,scale);g.rotate(-.095);
  path(g,[[-40,5],[23,-13],[46,-9],[-16,11]],"#607480","#c2d2ce",1);
  for(const sign of [-1,1]){
    g.save();g.scale(sign,1);
    for(let i=0;i<2;i++){
      const a=13+i*21;
      path(g,[[a,-1],[a+12,-5],[a+31,22],[a+17,27]],outpost?"#29354c":"#243c55","#7891a4",.8);
      for(let j=1;j<=4;j++)path(g,[[a+j*3,-1-j],[a+17+j*3,26-j]],null,"#476379",.55);
    }
    g.restore();
  }
  g.fillStyle="#9ba9a9";g.fillRect(-8,-11,17,19);g.fillStyle="#586974";g.fillRect(-5,-14,10,6);
  path(g,[[-2,-11],[1,-31]],null,"#b3cace",1.2);
  for(let i=0;i<(lit?5:2);i++){g.fillStyle=lit?"#ffe1a4":"#75d4d6";g.fillRect(-7+i*3,-6,1.3,3)}
  ring(g,1,-31,1.9,`rgba(115,251,223,${.5+.45*Math.sin(t*2)})`,1.3);
  g.restore();
}

function aperture(g,x,y,r,t,open,strength) {
  g.save();g.translate(x,y);g.scale(r,r);
  const glow=g.createRadialGradient(0,0,.2,0,0,1.65);
  glow.addColorStop(0,"rgba(2,13,25,.45)");glow.addColorStop(.48,"rgba(26,84,108,.30)");
  glow.addColorStop(.63,`rgba(60,207,225,${open?.50:.27})`);glow.addColorStop(.75,"rgba(44,183,195,.10)");
  glow.addColorStop(1,"rgba(30,120,160,0)");
  g.fillStyle=glow;g.fillRect(-1.65,-1.65,3.3,3.3);
  for(let n=0;n<4;n++){
    g.beginPath();
    for(let i=0;i<=84;i++){
      const a=i/84*TAU;
      const rad=(open?1.03:.93)-n*.065+Math.sin(5*a+t*.8+n)*.021+Math.sin(8*a-t*.5)*.011;
      const px=Math.cos(a)*rad,py=Math.sin(a)*rad;
      if(!i)g.moveTo(px,py);else g.lineTo(px,py);
    }
    g.strokeStyle=n===0?`rgba(194,254,255,${.53+.34*strength})`:`rgba(63,205,231,${.41/(n+.3)})`;
    g.lineWidth=n===0?.024:.014;g.stroke();
  }
  g.restore();
}

export function createFallbackFlight(canvas, _THREE, hooks={}) {
  const g=canvas.getContext("2d",{alpha:false});
  if(!g)throw new Error("Canvas 2D unavailable");
  const rand=randomSequence(), sky=nebulaArt(rand), black=blackHoleArt();
  const stars=Array.from({length:470},()=>({x:rand(),y:rand(),s:.5+rand()**3*1.4,b:.29+rand()*.67,warm:rand()<.19}));
  const held=new Set();
  let stage="", choice=null, yaw=0,pitch=0,time=0,dist=0,initialDist=0,speed=0;
  let bx=0,by=0,hold=0,latched=false,warp=0,warpEvent="",hazard=0,guiding=0,dead=false;
  let W=1,H=1,pixelRatio=1,reducedMotion=false;
  const stageInfo={scan:[0,.36,.075],gate:[14,.36,.075],approach:[63,.18,-.035],choice:[0,.18,-.035],
    deliver:[49,.40,.075],return:[48,-.29,.025],complete:[0,.36,.075]};
  function enter(s){
    stage=s;const data=stageInfo[s]||stageInfo.scan;
    initialDist=dist=data[0];bx=data[1];by=data[2];hold=0;hazard=0;speed=0;latched=false;
    if(s==="approach"||s==="return"){yaw=0;pitch=0}
    if(s==="deliver"&&choice==="relay"){bx=-.12;by=.085}
  }
  function reset(){
    stage="";choice=null;time=0;yaw=0;pitch=0;warp=0;warpEvent="";speed=0;guiding=0;
    held.clear();
  }
  function event(name){
    if(latched)return;latched=true;hooks.onEvent?.(name);
  }
  function drag(dx,dy){
    if(dead||warp>0||!Number.isFinite(dx)||!Number.isFinite(dy))return;
    yaw=angle(yaw+dx*.0043);pitch=clamp(pitch-dy*.0043,-1.1,1.1);
  }
  function input(key,on){
    if(on){held.add(key);if(key==="action")guiding=.9;}else held.delete(key);
  }
  function project(az,el) {
    const f=Math.min(W,H)*.91;
    const dx=angle(az-yaw),dy=el-pitch;
    if(Math.abs(dx)>1.5 || Math.abs(dy)>1.5)return [W*4,H*4];
    return [W*.5+Math.tan(dx)*f,H*.49-Math.tan(dy)*f];
  }
  function draw(packet){
    const width=Math.max(1,canvas.clientWidth||canvas.width),height=Math.max(1,canvas.clientHeight||canvas.height);
    const ratio=Math.min(globalThis.devicePixelRatio||1,1.5,Math.max(.75,Math.sqrt(1600000/(width*height))));
    if(width!==W||height!==H||ratio!==pixelRatio){
      W=width;H=height;pixelRatio=ratio;
      canvas.width=Math.max(1,Math.round(W*ratio));canvas.height=Math.max(1,Math.round(H*ratio));
    }
    g.setTransform(pixelRatio,0,0,pixelRatio,0,0);g.globalAlpha=1;
    g.fillStyle="#030712";g.fillRect(0,0,W,H);
    const oX=Math.sin(yaw)*W*.09,oY=Math.sin(pitch)*H*.09;
    g.drawImage(sky,-W*.14-oX,-H*.14+oY,W*1.28,H*1.28);
    const stretch=warp>0?1-warp/1.15:0;
    const scale=Math.min(W,H);
    for(const s of stars){
      const x=wrap(s.x-yaw*.19,1)*W,y=wrap(s.y+pitch*.33,1)*H;
      g.fillStyle=s.warm?`rgba(255,219,178,${s.b})`:`rgba(200,230,252,${s.b})`;
      g.fillRect(x,y,s.s,s.s);
      if(warp>0&&!reducedMotion){
        g.strokeStyle=g.fillStyle;g.lineWidth=s.s*.75;
        g.beginPath();g.moveTo(x,y);g.lineTo(x+(x-W*.5)*(.035+stretch*.29),y+(y-H*.49)*(.035+stretch*.29));g.stroke();
      }
    }
    const [gx,gy]=project(bx,by);
    const local=stage==="scan"||stage==="gate"||stage==="complete";
    if(local) {
      const [vx,vy]=project(-.17,.045);voyager(g,vx,vy,scale*.0038);
    } else {
      const [hx,hy]=project(-.40,.15);
      const bhW=scale*1.01;g.drawImage(black,hx-bhW*.5,hy-bhW*.29,bhW,bhW*.58);
      const [sx,sy]=project(.18,-.035);
      const stationSize=Math.min(2.1,.72+24/Math.max(18,dist));
      station(g,sx,sy,scale*.00165*(stage==="approach"?stationSize:1.26),false,true,time);
      const [ox,oy]=project(.40,.075);
      const occupied=choice==="people"&&stage==="return";
      const outpostSize=stage==="deliver"&&choice==="people"?stationSize:1;
      station(g,ox,oy,scale*.0023*outpostSize,true,occupied,time);
      for(let i=0;i<3;i++){
        const [x,y]=project(-.19+i*.108,-.14+i*.022),sz=scale*.0018;
        path(g,[[x,y-3.5*sz],[x+2.5*sz,y],[x,y+3.5*sz],[x-2.5*sz,y]],"#d3b67c");
        ring(g,x,y,5*sz,`rgba(246,202,125,${.2+.14*Math.sin(time*2+i)})`,1);
      }
    }
    if(stage==="scan"||stage==="gate"||stage==="return"||stage==="complete"||(stage==="deliver"&&choice==="relay")){
      const size=stage==="scan"?scale*(.027+.039*packet.strength):scale*(.055+.12*packet.progress);
      aperture(g,gx,gy,size*(warp>0&&!reducedMotion?1+stretch*1.5:1),time,packet.windowOpen,packet.strength);
      if(choice==="relay"&&(stage==="return"||stage==="complete")){
        for(let i=0;i<6;i++){
          const a=i*TAU/6,rx=gx+Math.cos(a)*size*1.27,ry=gy+Math.sin(a)*size*1.27;
          ring(g,rx,ry,Math.max(1.4,size*.041),"#c2ffe4",1.5);
        }
      }
    }
    if(warp>0&&!reducedMotion){
      const halo=g.createRadialGradient(W*.5,H*.49,scale*.03,W*.5,H*.49,scale*.7);
      halo.addColorStop(0,"rgba(98,231,237,0)");halo.addColorStop(1,`rgba(48,150,198,${.25*Math.sin(stretch*Math.PI)})`);
      g.fillStyle=halo;g.fillRect(0,0,W,H);
    }
  }
  function render(dt,state){
    if(dead||!state)return;
    dt=clamp(Number(dt)||0,0,.08);
    choice=state.choice;
    reducedMotion=Boolean(state.reducedMotion);
    if(state.stage!==stage)enter(state.stage);
    time+=dt;
    const phase=(time%3.6)/3.6,extended=stage==="return"&&choice==="relay";
    const windowOpen=phase>=(extended?.42:.48)&&phase<=(extended?.93:.83);
    const pulse=windowOpen?1:((phase<.07||(phase>=.2&&phase<.27))?.72:.06);
    if(held.has("left"))yaw-=dt*.85;if(held.has("right"))yaw+=dt*.85;
    if(held.has("up"))pitch+=dt*.7;if(held.has("down"))pitch-=dt*.7;
    yaw=angle(yaw);pitch=clamp(pitch,-1.1,1.1);
    let dx=angle(bx-yaw),dy=by-pitch;
    const error=Math.hypot(dx,dy),strength=clamp(1-error/.83,0,1),aligned=error<.17;
    const driving=held.has("thrust")||held.has("action")||guiding>0;
    guiding=Math.max(0,guiding-dt);
    if(!latched&&!warp){
      if(stage==="scan"){
        hold=aligned?hold+dt:Math.max(0,hold-dt*1.5);
        if(hold>=.56)event("signal");
      }else if(["gate","approach","deliver","return"].includes(stage)){
        speed+=(driving?34:-7)*dt;
        if(held.has("brake"))speed-=dt*55;
        speed=clamp(speed,0,18);
        if(error<.55)dist=Math.max(0,dist-speed*dt*Math.max(0,Math.cos(error*2.3)));
        if(stage==="approach"){
          const danger=Math.hypot(angle(yaw+.40),pitch-.15)<.135;
          hazard=danger&&driving?hazard+dt:Math.max(0,hazard-dt*2);
          if(hazard>1.1){
            hazard=0;dist=initialDist*.67;yaw=.02;pitch=0;speed=0;hooks.onEvent?.("rescue");
          }
        }
        if(dist<=1.1&&aligned&&(driving||speed>1)){
          if(stage==="gate"||stage==="return"){
            if(windowOpen){warp=1.15;warpEvent=stage==="gate"?"crossed":"returned";}
          }else event(stage==="approach"?"docked":"delivered");
        }
      }
    }
    if(warp>0){
      warp=Math.max(0,warp-dt);if(warp===0){event(warpEvent);warpEvent=""}
    }
    const progress=stage==="scan"?clamp(hold/.56,0,1):initialDist>0?1-dist/initialDist:1;
    const packet={strength,pulse,phase,windowOpen,aligned,distance:dist,bearingX:clamp(dx/.70,-1,1),
      bearingY:clamp(dy/.53,-1,1),progress,warping:warp>0};
    draw(packet);hooks.onTelemetry?.(packet);return packet;
  }
  function dispose(){dead=true;held.clear();}
  return {render,input,drag,reset,dispose};
}
