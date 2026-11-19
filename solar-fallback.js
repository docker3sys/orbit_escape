// A perspective solar navigator rendered by Canvas2D when WebGL is unavailable.
import { planetSpecs, spacecraftSpecs, galacticDirection } from './solar-catalog.js';
import { createOrbitalClock, worldCoordinates, orbitPaths } from './solar-system-clock.js';
import { IDA_RADIUS, IDA_APPROACH, createBeltField } from './solar-belt.js';
import { createCanvasSky } from './solar-sky.js';
import { HULL_CLEARANCE_KM, approachSpeedLimit, arrivalRangeKm, lodFromDistance } from './solar-scale.js';
import { createSolarTouch } from './solar-touch.js';
import { createRenderBudget } from './mobile-quality.js';
import { createPlanetPainter, ring, spacecraft, createCanvasIda } from './solar-fallback-art.js';

const AU = 149597870.7;
const LY = 9460730472580.8;
const TAU = Math.PI*2;
const PITCH_LIMIT = Math.PI/2 - .000001;
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const len = a => Math.hypot(a[0],a[1],a[2]);
const minus = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const unit = a => {const n=len(a)||1;return a.map(v=>v/n);};
const world = worldCoordinates;
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const identity = [[1,0,0],[0,1,0],[0,0,1]];
const compact = matchMedia('(pointer: coarse), (max-width: 760px)');
const number = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});
const gameKeys = ['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyC','KeyB','KeyL','KeyO','KeyT','Space','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];

function makeCatalog(positions, belt) {
  const planets=planetSpecs.map(p=>({
    key:p.key,name:p.name,pos:positions[p.key],radius:p.trueRadiusKm,
    approach:p.trueRadiusKm*(p.key==='saturn'?6.9:3.65),color:p.colors[1],
    rgb:[1,3,5].map(i=>parseInt(p.colors[1].slice(i,i+2),16)),kind:'planet',orbit:p.orbitAU*AU,
  }));
  const earth=planets.find(p=>p.key==='earth');
  planets.splice(planets.indexOf(earth)+1,0,{key:'moon',name:'Луна',pos:positions.moon,
    radius:1737.4,approach:7040,color:'#d7d6cf',rgb:[172,168,157],kind:'planet'});
  const probes=spacecraftSpecs.map(p=>({
    key:p.key,name:p.name,pos:world(p.positionAU),radius:p.spanMeters/2000,
    approach:Math.max(.026,p.spanMeters/1000*2.65),radioRange:p.spanMeters/2000*12+.218,color:'#c9c6a6',kind:'craft',
  }));
  return [
    {key:'sun',name:'Солнце',pos:[0,0,0],radius:695700,approach:4300000,color:'#fff1cb',rgb:[249,211,138],kind:'sun'},
    ...planets,{key:'asteroid-belt',name:'Пояс астероидов · Ида',pos:belt.ida,radius:IDA_RADIUS,approach:IDA_APPROACH,color:'#a79f93',kind:'rock'},
    ...probes,{key:'galactic-center',name:'Центр Млечного Пути',pos:galacticDirection.map(x=>x*26660*LY),radius:.38*LY,approach:2*LY,color:'#edc593',kind:'core'},
    {key:'milky-way-rim',name:'Край Млечного Пути',pos:galacticDirection.map(x=>-x*26190*LY),radius:.28*LY,approach:2*LY,color:'#b0d2db',kind:'rim'},
  ];
}
function separation(km) {
  if(km>=.1*LY)return (km/LY).toFixed(km>=100*LY?0:2)+' св. лет';
  if(km>=AU)return (km/AU).toFixed(km>=20*AU?1:2)+' а.е.';
  if(km>=1e6)return (km/1e6).toFixed(1)+' млн км';
  return km>=1?number.format(km)+' км':number.format(km*1000)+' м';
}

function copyNode(id) {
  const old=document.getElementById(id);
  const fresh=old.cloneNode(true);
  old.replaceWith(fresh);
  return fresh;
}

export function createSolarFallback(options={}) {
  const sky=copyNode('space');
  sky.dataset.renderer='canvas2d';
  sky.tabIndex=0;
  sky.style.width='100%';sky.style.height='100%';
  const ctx=sky.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('Canvas2D unavailable');
  const budget=createRenderBudget();
  const listeners=new AbortController();
  const on={signal:listeners.signal};
  const painter=createPlanetPainter();
  const clock=createOrbitalClock(), belt=createBeltField(), drawSky=createCanvasSky(), drawIda=createCanvasIda();
  const bodies=makeCatalog(clock.update(Date.now(),null).positions,belt), keys=new Set();
  const dactyl={key:'dactyl',name:'Дактиль',pos:belt.dactyl,radius:.73,kind:'minor',color:'#8e8780'};
  let paths=null, viewFrame=identity;
  function syncPositions(time) {
    const sample=clock.update(time,eye);
    if(sample){
      for(const body of bodies) if(sample.positions[body.key])body.pos=sample.positions[body.key];
      for(let i=0;i<3;i++)eye[i]+=sample.drift[i];
    }
    belt.update(time,eye);
  }
  const buttons=new Map();
  const targetList=copyNode('targetList');
  targetList.textContent = "";
  const labels=document.querySelector('#labels');
  labels.textContent = "";labels.style.display='none';
  const aim=copyNode('solarAim'), optics=copyNode('solarOptics'), approachMode=document.querySelector('#solarApproach');
  const route=copyNode('solarRoute'), routePanel=document.querySelector('#solarRoutePanel');
  const warp=copyNode('solarJump'), jump=copyNode('jumpButton'), orbit=copyNode('orbitToggle'), names=copyNode('labelsToggle');
  const hint=document.querySelector('#solarTouchHint'), arrival=document.querySelector('#solarArrival');
  const dock=document.querySelector('#game'), distanceText=document.querySelector('#distanceReadout');
  const speedText=document.querySelector('#speedReadout'), targetText=document.querySelector('#targetReadout');
  const inputStick=copyNode('solarStick');
  let eye=[0,0,0], velocity=[0,0,0], yaw=0, pitch=0, roll=0, choice=null, current;
  let active=false, raf=0, last=0, width=1, height=1, dpr=1, focal=1, seconds=0;
  let showNames=false, showOrbits=false, routeOpen=false, cruise=false, jumps=0, hintTimer=0, arriveTimer=0, showHint=true;
  let sensitivity=1, invertY=false, engine=0;
  let axes, nextHud=0, mouse=null, physicalLimit=1;

  function drawAxes() {
    const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
    const r=[cy,0,-sy],u=[sy*sp,cp,cy*sp],cr=Math.cos(roll),sr=Math.sin(roll);
    const inWorld = v=>v.map((_,i)=>v[0]*viewFrame[0][i]+v[1]*viewFrame[1][i]+v[2]*viewFrame[2][i]);
    axes={forward:inWorld([-sy*cp,sp,-cy*cp]),right:inWorld(r.map((v,i)=>v*cr+u[i]*sr)),up:inWorld(u.map((v,i)=>v*cr-r[i]*sr))};
  }
  function select(key) {
    const body=bodies.find(p=>p.key===key);
    if(!body)return;
    if(current!==body){clearTimeout(arriveTimer);arrival.classList.remove('is-arriving');}
    current=body;targetText.textContent=body.name;
    for(const [id,node] of buttons){
      node.classList.toggle('is-active',id===body.key);
      node.setAttribute('aria-pressed',String(id===body.key));
    }
    warp.setAttribute('aria-label','Прыжок к цели: '+body.name);
    nextHud=0;
    updateHud();
  }
  function setRoute(open) {
    routeOpen=Boolean(open)&&compact.matches;
    route.setAttribute('aria-expanded',String(routeOpen));
    routePanel.hidden=compact.matches&&!routeOpen;
    if(!open)routePanel.querySelector('details').open=false;
  }
  function addButton(body) {
    const btn=document.createElement('button');
    btn.type='button';btn.textContent=body.name;btn.setAttribute('aria-pressed','false');
    btn.addEventListener('click',()=>{ select(body.key); },on);
    buttons.set(body.key,btn);targetList.append(btn);
  }
  function setObservatoryUnlocked(value) {
    if(value!=='people'&&value!=='relay')return;
    choice=value;
    if(buttons.has('return-observatory'))return;
    const station={key:'return-observatory',name:'Обсерватория · экспедиция',kind:'craft',pos:world([72.5,-18.2,3.42]),radius:.46,approach:1.4352,color:'#b9dcd4'};
    bodies.push(station);addButton(station);
  }
  function aimAt(body){
    const direction=unit(minus(body.pos,eye));
    yaw=Math.atan2(-dot(direction,viewFrame[0]),-dot(direction,viewFrame[2]));
    pitch=Math.asin(clamp(dot(direction,viewFrame[1]),-1,1));roll=0;drawAxes();
  }
  function approach(body,mode='orbit') {
    const light=body.key==='sun'?[.55,.30,1]:unit(body.pos.map(v=>-v));
    const lateral=unit([light[2],0,-light[0]]);
    const n=body.key==='moon'?unit(minus(bodies.find(p=>p.key==='earth').pos,body.pos)):
      unit([light[0]+lateral[0]*.78,light[1]+.34,light[2]+lateral[2]*.78]);
    const chosen=arrivalRangeKm(body.radius,mode,body.key);
    const extent=body.radius*(body.key==='saturn'?2.3:1.04);
    const halfAngle=Math.atan(.9*Math.tan(Math.PI/5)*Math.min((sky.clientWidth||innerWidth)/(sky.clientHeight||innerHeight),1));
    const dist=chosen??Math.max(body.approach,extent/Math.sin(halfAngle));
    eye=body.pos.map((v,i)=>v+n[i]*dist);viewFrame=identity;
    if(chosen && (mode==='surface'||mode==='local')){
      const pole=Math.abs(n[1])>.95?[1,0,0]:[0,1,0];
      const tangent=unit(pole.map((v,i)=>v-dot(pole,n)*n[i]));
      const back=tangent.map(v=>-v);
      viewFrame=[unit(cross(n,back)),n,back];yaw=roll=0;pitch=mode==='surface'?-.18:-Math.acos(body.radius/dist)-.17;drawAxes();
    } else aimAt(body);
    velocity=[0,0,0];updateHud();
  }
  function dismissHint() {showHint=false;clearTimeout(hintTimer);hint.hidden=true;}
  function warpToTarget() {
    setRoute(false);dismissHint();syncPositions(Date.now());approach(current,approachMode.value);jumps++;
    arrival.querySelector('span').textContent=current.name;
    arrival.classList.remove('is-arriving');void arrival.offsetWidth;arrival.classList.add('is-arriving');
    clearTimeout(arriveTimer);arriveTimer=setTimeout(()=>arrival.classList.remove('is-arriving'),2100);
    sky.focus({preventScroll:true});
  }
  function toggle(button,value) {
    button.setAttribute('aria-pressed',String(value));
    button.classList.toggle('chip--active',value);
  }
  function turn(dx,dy,gain) { yaw-=dx*gain*sensitivity;pitch=clamp(pitch-dy*gain*sensitivity*(invertY?-1:1),-PITCH_LIMIT,PITCH_LIMIT); }
  const touch=createSolarTouch(inputStick,sky,{
    signal:listeners.signal,onUse:dismissHint,onSky:()=>setRoute(false),
    onLook:(dx,dy)=>turn(dx,dy,2.35/Math.max(320,Math.min(width,height))),
  });
  function resetInput() {touch.reset();keys.clear();velocity=[0,0,0];mouse=null;}
  function resize() {
    const w=Math.max(1,Math.round(sky.clientWidth||innerWidth));
    const h=Math.max(1,Math.round(sky.clientHeight||innerHeight));
    const ratio=budget.pixelRatio(w,h);
    if(w!==width||h!==height)resetInput();
    width=w;height=h;
    focal=height/(2*Math.tan(Math.PI/5))*(Number(optics.value)||1);
    if(sky.width!==Math.round(w*ratio)||sky.height!==Math.round(h*ratio)) {
      sky.width=Math.max(1,Math.round(w*ratio));sky.height=Math.max(1,Math.round(h*ratio));
    }
    dpr=sky.width/w;
  }
  for(const body of bodies)addButton(body);
  setObservatoryUnlocked(options.unlocked);
  select('earth');approach(current);
  function restoreFlightSnapshot(snapshot={}) {
    const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
    if(snapshot.target&&buttons.has(snapshot.target)){
      select(snapshot.target);
      if(snapshot.near>.67)approach(current);
    }
    if([1,3,8].includes(snapshot.opticalZoom)) {optics.value=String(snapshot.opticalZoom);resize();}
    if(vector(snapshot.position)){
      viewFrame=identity;eye=snapshot.position.slice();
      const anchor=snapshot.pin && bodies.find(body=>body.key===snapshot.pin.key&&body.kind==='planet');
      if(anchor&&vector(snapshot.pin.offset)){
        const range=len(snapshot.pin.offset);
        if(range>=anchor.radius && range<=48*anchor.radius){
          eye=anchor.pos.map((v,i)=>v+snapshot.pin.offset[i]);
        }
      }
      const basis=snapshot.viewBasis;
      if(Array.isArray(basis)&&basis.length===3&&basis.every(v=>vector(v)&&Math.abs(len(v)-1)<.001)&&
          Math.abs(dot(basis[0],basis[1]))<.001 && dot(cross(basis[0],basis[1]),basis[2])>.999){
        viewFrame=basis.map(v=>v.slice());yaw=pitch=roll=0;
      }else{
        if(Number.isFinite(snapshot.yaw))yaw=snapshot.yaw;
        if(Number.isFinite(snapshot.pitch))pitch=clamp(snapshot.pitch,-PITCH_LIMIT,PITCH_LIMIT);
      }
      resetInput();drawAxes();updateHud();
    }
  }
  function getFlightSnapshot() {
    const snapshot={...getSolarSoundState(),position:eye.slice(),yaw:Math.atan2(-axes.forward[0],-axes.forward[2]),
      pitch:Math.asin(clamp(axes.forward[1],-1,1)),viewBasis:[axes.right.slice(),axes.up.slice(),axes.forward.map(v=>-v)],opticalZoom:Number(optics.value)||1};
    let best=48;
    for(const body of bodies){
      if(body.kind!=='planet')continue;
      const offset=minus(eye,body.pos), ratio=len(offset)/body.radius;
      if(ratio<best){best=ratio;snapshot.pin={key:body.key,offset};}
    }
    return snapshot;
  }
  function setPilotOptions(value={}) {
    if(Number.isFinite(value.engine))engine=clamp(value.engine,0,4);
    if(Number.isFinite(value.sensitivity))sensitivity=clamp(value.sensitivity,.3,2.5);
    if(typeof value.invertY==='boolean')invertY=value.invertY;
  }
  restoreFlightSnapshot(options);
  setRoute(false);toggle(orbit,false);toggle(names,false);
  aim.addEventListener('click',()=>{syncPositions(Date.now());aimAt(current);setRoute(false);dismissHint();sky.focus({preventScroll:true});},on);
  optics.addEventListener('change',()=>resize(),on);
  route.addEventListener('click',()=>setRoute(!routeOpen),on);
  compact.addEventListener('change',()=>setRoute(false),on);
  for(const control of [warp,jump])control.addEventListener('click',warpToTarget,on);
  orbit.addEventListener('click',()=>{showOrbits=!showOrbits;if(showOrbits&&!paths)paths=orbitPaths(Date.now());toggle(orbit,showOrbits);},on);
  names.addEventListener('click',()=>{showNames=!showNames;toggle(names,showNames);},on);
  sky.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='mouse'||e.button!==0)return;
    sky.setPointerCapture(e.pointerId);mouse=e.pointerId;
  },on);
  sky.addEventListener('pointermove',e=>{if(e.pointerId===mouse)turn(e.movementX,e.movementY,.0038);},on);
  for(const evt of ['pointerup','pointercancel','lostpointercapture'])sky.addEventListener(evt,e=>{if(e.pointerId===mouse)mouse=null;},on);
  window.addEventListener('keydown',e=>{
    if(!active||e.ctrlKey||e.altKey||e.metaKey)return;
    if(e.code==='Escape'&&routeOpen){setRoute(false);route.focus();return;}
    if(!gameKeys.includes(e.code)||e.code==='Space'&&document.activeElement?.matches('button'))return;
    e.preventDefault();keys.add(e.code);
    if(e.repeat)return;
    if(e.code==='KeyT')warpToTarget();
    if(e.code==='KeyB')cruise=!cruise;
    if(e.code==='KeyO')orbit.click();
    if(e.code==='KeyL')names.click();
  },on);
  window.addEventListener('keyup',e=>keys.delete(e.code),on);
  window.addEventListener('blur',resetInput,on);
  window.addEventListener('pagehide',resetInput,on);
  document.addEventListener('freeze',resetInput,on);
  window.addEventListener('resize',()=>{if(active)resize();},on);

  function movement(dt) {
    const key=code=>Number(keys.has(code));
    yaw+=(key('ArrowLeft')-key('ArrowRight'))*dt;
    pitch=clamp(pitch+(key('ArrowUp')-key('ArrowDown'))*dt,-PITCH_LIMIT,PITCH_LIMIT);
    roll+=((key('KeyQ')-key('KeyE'))*.3-roll)*(1-Math.exp(-dt*8));
    drawAxes();
    let closest=null,gap=Infinity;
    for(const body of bodies) {
      const d=len(minus(eye,body.pos))-body.radius;
      if(d<gap){gap=d;closest=body;}
    }
    physicalLimit=approachSpeedLimit(gap)*(1+engine*.22);
    const drive=(cruise?Math.max(physicalLimit,2997924):physicalLimit)*(keys.has('ShiftLeft')||keys.has('ShiftRight')?3:1);
    const a=clamp(touch.state.y+key('KeyW')-key('KeyS'),-1,1);
    const b=clamp(touch.state.x+key('KeyD')-key('KeyA'),-1,1);
    const c=clamp(key('Space')-key('KeyC')+touch.state.lift*.55,-1,1);
    const gain=1-Math.exp(-dt*(a||b||c?7:13));
    for(let i=0;i<3;i++) {
      const goal=(axes.forward[i]*a+.72*axes.right[i]*b+axes.up[i]*c)*drive;
      velocity[i]+=(goal-velocity[i])*gain;
      if(!a&&!b&&!c&&Math.abs(velocity[i])<physicalLimit*.004)velocity[i]=0;
      eye[i]+=velocity[i]*dt;
    }
    const delta=minus(eye,closest.pos), d=len(delta), min=closest.radius+HULL_CLEARANCE_KM;
    if(d<min && d>0){
      for(let i=0;i<3;i++)eye[i]=closest.pos[i]+delta[i]/d*min;
      const inward=dot(velocity,delta)/d;
      if(inward<0)for(let i=0;i<3;i++)velocity[i]-=inward*delta[i]/d;
    }
  }
  function updateHud() {
    if(!current)return;
    const speed=len(velocity);
    const speedLabel=speed>0&&speed<1?number.format(speed*1000)+' м/с':number.format(speed)+' км/с';
    const isSurface=current.kind==='planet'||current.kind==='sun';
    const range=len(minus(eye,current.pos)), local=isSurface && range<1.22*current.radius;
    const dist=local?'Высота '+separation(Math.max(0,range-current.radius)):separation(range);
    const rate=speedLabel+(cruise?' | SC':'');
    if(speedText.textContent!==rate)speedText.textContent=rate;
    if(distanceText.textContent!==dist)distanceText.textContent=dist;
  }
  function getSolarSoundState() {
    const d=len(minus(eye,current.pos));
    return {target:current.key,near:clamp((3-d/(current.radioRange||current.approach))/2,0,1),speed:clamp(len(velocity)/Math.max(.04,physicalLimit),0,1),jump:jumps};
  }

  function guides() {
    ctx.strokeStyle='rgba(121,172,163,.3)';ctx.lineWidth=.8;
    for(const points of Object.values(paths||{})){
      ctx.beginPath();let contiguous=false;
      for(const point of points){
        const delta=minus(point,eye), z=dot(axes.forward,delta);
        if(z<=0){contiguous=false;continue;}
        const x=width*.5+dot(axes.right,delta)/z*focal, y=height*.5-dot(axes.up,delta)/z*focal;
        if(x< -width*2||x>width*3||y< -height*2||y>height*3){contiguous=false;continue;}
        if(contiguous)ctx.lineTo(x,y);else ctx.moveTo(x,y);contiguous=true;
      }
      ctx.stroke();
    }
  }
  function glow(x,y,r,core) {
    const halo=ctx.createRadialGradient(x,y,0,x,y,r*1.85);
    halo.addColorStop(0,core?'#fff4ca':'#e5cba3');halo.addColorStop(.47,core?'#f6ce85':'#ac8360');
    halo.addColorStop(.55,core?'rgba(232,174,94,.361)':'rgba(166,130,101,.208)');halo.addColorStop(1,'rgba(204,136,82,0)');
    ctx.fillStyle=halo;ctx.fillRect(x-r*1.85,y-r*1.85,r*3.7,r*3.7);
  }
  function drawBody(body,x,y,r,d) {
    if(r<1.15){
      if(r<.16&&!showNames)return;
      ctx.fillStyle=body.color;ctx.globalAlpha=r<.16?.45:.8;
      ctx.fillRect(x,y,1.15,1.15);ctx.globalAlpha=1;
    } else if(body.kind==='planet'||body.kind==='sun'){
      if(body.kind==='sun'&&d/body.radius>40){
        const halo=ctx.createRadialGradient(x,y,r*.92,x,y,r*2.2);
        halo.addColorStop(0,'rgba(255,246,220,.85)');halo.addColorStop(.30,'rgba(255,236,206,.15)');halo.addColorStop(1,'rgba(255,237,213,0)');
        ctx.fillStyle=halo;ctx.fillRect(x-r*2.2,y-r*2.2,r*4.4,r*4.4);
        ctx.fillStyle='#fffdf4';ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();return;
      }
      if(body.kind==='sun')glow(x,y,r,true);
      if(body.key==='saturn')ring(ctx,x,y,r,false);
      const [sprite,angle]=painter.globe(body,r,d,eye,axes,seconds,dpr);
      ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.drawImage(sprite,-r,-r,r*2,r*2);ctx.restore();
      if(body.key==='saturn')ring(ctx,x,y,r,true);
    } else if(body.kind==='craft') spacecraft(ctx,body,x,y,r,choice);
    else if(body.kind==='core')glow(x,y,r,false);
    else if(body.kind==='rock')drawIda(ctx,body,eye,axes,width,height,focal,belt.spin);
    else if(body.kind==='minor'){
      ctx.fillStyle=body.color;ctx.beginPath();ctx.ellipse(x,y,r,r*.79,-.24,0,TAU);ctx.fill();
    } else {
      ctx.save();ctx.translate(x,y);ctx.rotate(-.45);ctx.scale(1,.28);glow(0,0,r,false);ctx.restore();
    }
    if(showNames&&x>3&&x<width-3&&y>12&&y<height-12){
      ctx.font='12px system-ui,sans-serif';ctx.fillStyle='#c8dadc';
      ctx.textAlign='center';ctx.fillText(body.name,x,y-Math.min(r,55)-9,width*.55);
    }
  }
  function frame(now) {
    if(!active)return;
    if(budget.frame(now))resize();
    const dt=clamp((now-last)/1000,0,.05);last=now;seconds+=dt;
    syncPositions(Date.now());movement(dt);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    drawSky(ctx,width,height,focal,axes);if(showOrbits)guides();
    const visible=[];
    const candidates=[...bodies,dactyl];
    for(const i of belt.local){
      const item=belt.records[i],j=3*i;
      candidates.push({key:String(item.id),name:String(item.id),kind:'minor',color:'#918c87',radius:item.radius,pos:[belt.coords[j],belt.coords[j+1],belt.coords[j+2]]});
    }
    let foreground=null;
    for(const body of candidates) {
      const v=minus(body.pos,eye), z=dot(axes.forward,v);
      if((body.kind==='planet'||body.kind==='sun')&&lodFromDistance(body.radius,len(v))==='near'){
        foreground=body;continue;
      }
      if(z<=0)continue;
      const d=len(v),r=Math.min(Math.max(width,height)*4,body.radius/Math.sqrt(Math.max(1e-14,d*d-body.radius*body.radius))*focal);
      const x=width*.5+dot(axes.right,v)/z*focal,y=height*.5-dot(axes.up,v)/z*focal;
      if(x+2.4*r<0||x-2.4*r>width||y+2.4*r<0||y-2.4*r>height)continue;
      visible.push({body,x,y,r,d});
    }
    visible.sort((a,b)=>b.d-a.d);
    const closestMap=foreground || visible.filter(v=>(v.body.kind==='planet'||v.body.kind==='sun')&&v.d/v.body.radius<16).pop()?.body;
    painter.chooseDetail(closestMap?.key||null,budget.profile());
    for(const v of visible)drawBody(v.body,v.x,v.y,v.r,v.d);
    if(foreground) painter.horizon(ctx,foreground,eye,axes,width,height,focal,now,budget.profile());
    if(now>=nextHud){nextHud=now+120;updateHud();}
    raf=requestAnimationFrame(frame);
  }
  function pauseSolarFlight() {
    active=false;cancelAnimationFrame(raf);resetInput();setRoute(false);painter.release();
    clearTimeout(hintTimer);clearTimeout(arriveTimer);arrival.classList.remove('is-arriving');
  }
  function resumeSolarFlight() {
    if(active)return;
    active=true;syncPositions(Date.now());clock.refresh();last=performance.now();budget.resetTiming();setRoute(false);resize();
    dock.dataset.solarRenderer='canvas2d';
    if(compact.matches&&showHint){hint.hidden=false;hintTimer=setTimeout(dismissHint,7400);}
    raf=requestAnimationFrame(frame);
  }
  function visitObservatory(){if(choice){select('return-observatory');warpToTarget();}}
  function dispose(){pauseSolarFlight();listeners.abort();}
  return {resumeSolarFlight,pauseSolarFlight,setObservatoryUnlocked,visitObservatory,getSolarSoundState,
    selectDestination:select,getFlightSnapshot,restoreFlightSnapshot,setPilotOptions,halt:resetInput,dispose};
}
