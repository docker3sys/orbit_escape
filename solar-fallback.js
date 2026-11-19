// A perspective solar navigator rendered by Canvas2D when WebGL is unavailable.
import { planetSpecs, spacecraftSpecs } from './solar-catalog.js';
import { createSolarTouch } from './solar-touch.js';
import { createRenderBudget } from './mobile-quality.js';
import { createPlanetPainter, ring, spacecraft } from './solar-fallback-art.js';

const AU = 149597870.7;
const LY = 9460730472580.8;
const TAU = Math.PI*2;
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const len = a => Math.hypot(a[0],a[1],a[2]);
const minus = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const unit = a => {const n=len(a)||1;return a.map(v=>v/n);};
const world = ([x,y,z]) => [x*AU,z*AU,y*AU];
const compact = matchMedia('(pointer: coarse), (max-width: 760px)');
const number = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});
const gameKeys = ['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyC','KeyB','KeyL','KeyO','KeyT','Space','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];

function makeCatalog() {
  const planets=planetSpecs.map(p=>({
    key:p.key,name:p.name,pos:world(p.positionAU),radius:p.trueRadiusKm,
    approach:p.trueRadiusKm*(p.key==='saturn'?6.9:3.65),color:p.colors[1],
    rgb:[1,3,5].map(i=>parseInt(p.colors[1].slice(i,i+2),16)),kind:'planet',orbit:p.orbitAU*AU,
  }));
  const earth=planets.find(p=>p.key==='earth');
  const moonOffset=world([.000062379024,.002397512493,.000192102199]);
  planets.splice(planets.indexOf(earth)+1,0,{key:'moon',name:'Луна',pos:earth.pos.map((v,i)=>v+moonOffset[i]),
    radius:1737.4,approach:7040,color:'#d7d6cf',rgb:[172,168,157],kind:'planet'});
  const probes=spacecraftSpecs.map(p=>({
    key:p.key,name:p.name,pos:world(p.positionAU),radius:p.spanMeters/2000,
    approach:Math.max(.026,p.spanMeters/1000*2.65),radioRange:p.spanMeters/2000*12+.218,color:'#c9c6a6',kind:'craft',
  }));
  return [
    {key:'sun',name:'Солнце',pos:[0,0,0],radius:695700,approach:4300000,color:'#fff1cb',rgb:[249,211,138],kind:'sun'},
    ...planets,{key:'asteroid-belt',name:'Пояс астероидов',pos:[2.7*AU,.02,0],radius:.026,approach:.22,color:'#a79f93',kind:'rock'},
    ...probes,{key:'galactic-center',name:'Центр Млечного Пути',pos:[-26660*LY,0,0],radius:.38*LY,approach:2*LY,color:'#edc593',kind:'core'},
    {key:'milky-way-rim',name:'Край Млечного Пути',pos:[26190*LY,0,0],radius:.28*LY,approach:2*LY,color:'#b0d2db',kind:'rim'},
  ];
}
function skyStars() {
  let seed=419170;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const list=[];
  for(let i=0;i<2050;i++){
    const a=TAU*rand();
    const plane=i>850;
    const y=plane ? clamp((rand()+rand()+rand()-1.5)*.21,-1,1) : rand()*2-1;
    const v=Math.sqrt(1-y*y);
    let z=v*Math.cos(a);
    let h=y;
    if(plane){h=.88*y+.475*z;z=.88*z-.475*y;}
    const magnitude=rand();
    list.push({v:[v*Math.sin(a),h,z],r:magnitude>.98?1.25:magnitude>.76?.8:.52,
      color:['#d9dee4','#c7d6e8','#e8decf','#a6bfd4'][i%4],alpha:(plane?.15:.32)+magnitude*(plane?.4:.60)});
  }
  return list;
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
  const stars=skyStars(), bodies=makeCatalog(), keys=new Set();
  const buttons=new Map();
  const targetList=copyNode('targetList');
  targetList.textContent = "";
  const labels=document.querySelector('#labels');
  labels.textContent = "";labels.style.display='none';
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
    axes={forward:[-sy*cp,sp,-cy*cp],right:r.map((v,i)=>v*cr+u[i]*sr),up:u.map((v,i)=>v*cr-r[i]*sr)};
  }
  function select(key) {
    const body=bodies.find(p=>p.key===key);
    if(!body)return;
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
    btn.addEventListener('click',()=>{ select(body.key); setRoute(false); if(compact.matches)warp.focus({preventScroll:true}); },on);
    buttons.set(body.key,btn);targetList.append(btn);
  }
  function setObservatoryUnlocked(value) {
    if(value!=='people'&&value!=='relay')return;
    choice=value;
    if(buttons.has('return-observatory'))return;
    const station={key:'return-observatory',name:'Обсерватория · экспедиция',kind:'craft',pos:world([72.5,-18.2,3.42]),radius:.46,approach:1.4352,color:'#b9dcd4'};
    bodies.push(station);addButton(station);
  }
  function approach(body) {
    // Arrive above the illuminated hemisphere, looking along the limb into the solar night.
    const l=body.key==='sun'?[.55,.30,1]:unit(body.pos.map(v=>-v));
    const lateral=unit([l[2],0,-l[0]]);
    const n=unit([l[0]+lateral[0]*.78,l[1]+.34,l[2]+lateral[2]*.78]);
    eye=body.pos.map((v,i)=>v+n[i]*body.approach);
    yaw=Math.atan2(n[0],n[2]);pitch=-Math.asin(n[1]);roll=0;
    velocity=[0,0,0];
    drawAxes();updateHud();
  }
  function dismissHint() {showHint=false;clearTimeout(hintTimer);hint.hidden=true;}
  function warpToTarget() {
    setRoute(false);dismissHint();approach(current);jumps++;
    arrival.querySelector('span').textContent=current.name;
    arrival.classList.remove('is-arriving');void arrival.offsetWidth;arrival.classList.add('is-arriving');
    clearTimeout(arriveTimer);arriveTimer=setTimeout(()=>arrival.classList.remove('is-arriving'),2100);
    sky.focus({preventScroll:true});
  }
  function toggle(button,value) {
    button.setAttribute('aria-pressed',String(value));
    button.classList.toggle('chip--active',value);
  }
  function turn(dx,dy,gain) { yaw-=dx*gain*sensitivity;pitch=clamp(pitch-dy*gain*sensitivity*(invertY?-1:1),-1.51,1.51); }
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
    focal=height*.72;
    if(sky.width!==Math.round(w*ratio)||sky.height!==Math.round(h*ratio)) {
      sky.width=Math.max(1,Math.round(w*ratio));sky.height=Math.max(1,Math.round(h*ratio));
    }
    dpr=sky.width/w;
  }
  for(const body of bodies)addButton(body);
  setObservatoryUnlocked(options.unlocked);
  select('earth');approach(current);
  function restoreFlightSnapshot(snapshot={}) {
    if(snapshot.target&&buttons.has(snapshot.target)){
      select(snapshot.target);
      if(snapshot.near>.67)approach(current);
    }
    if(Array.isArray(snapshot.position)&&snapshot.position.length===3&&snapshot.position.every(Number.isFinite)){
      eye=snapshot.position.slice();
      if(Number.isFinite(snapshot.yaw))yaw=snapshot.yaw;
      if(Number.isFinite(snapshot.pitch))pitch=clamp(snapshot.pitch,-1.55,1.55);
      resetInput();drawAxes();updateHud();
    }
  }
  function getFlightSnapshot() {return {...getSolarSoundState(),position:eye.slice(),yaw,pitch};}
  function setPilotOptions(value={}) {
    if(Number.isFinite(value.engine))engine=clamp(value.engine,0,4);
    if(Number.isFinite(value.sensitivity))sensitivity=clamp(value.sensitivity,.3,2.5);
    if(typeof value.invertY==='boolean')invertY=value.invertY;
  }
  restoreFlightSnapshot(options);
  setRoute(false);toggle(orbit,false);toggle(names,false);
  route.addEventListener('click',()=>setRoute(!routeOpen),on);
  compact.addEventListener('change',()=>setRoute(false),on);
  for(const control of [warp,jump])control.addEventListener('click',warpToTarget,on);
  orbit.addEventListener('click',()=>{showOrbits=!showOrbits;toggle(orbit,showOrbits);},on);
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
    pitch=clamp(pitch+(key('ArrowUp')-key('ArrowDown'))*dt,-1.51,1.51);
    roll+=((key('KeyQ')-key('KeyE'))*.3-roll)*(1-Math.exp(-dt*8));
    drawAxes();
    let closest=null,gap=Infinity;
    for(const body of bodies) {
      const d=len(minus(eye,body.pos))-body.radius;
      if(d<gap){gap=d;closest=body;}
    }
    physicalLimit=clamp(gap*.74,.04,149896)*(1+engine*.22);
    const drive=(cruise?Math.max(physicalLimit,2997924):physicalLimit)*(keys.has('ShiftLeft')||keys.has('ShiftRight')?3:1);
    const a=clamp(touch.state.y+key('KeyW')-key('KeyS'),-1,1);
    const b=clamp(touch.state.x+key('KeyD')-key('KeyA'),-1,1);
    const c=key('Space')-key('KeyC');
    const gain=1-Math.exp(-dt*(a||b||c?7:13));
    for(let i=0;i<3;i++) {
      const goal=(axes.forward[i]*a+.72*axes.right[i]*b+axes.up[i]*c)*drive;
      velocity[i]+=(goal-velocity[i])*gain;
      if(!a&&!b&&!c&&Math.abs(velocity[i])<physicalLimit*.004)velocity[i]=0;
      eye[i]+=velocity[i]*dt;
    }
    const delta=minus(eye,closest.pos), d=len(delta), min=closest.radius*1.045+.007;
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
    const dist=separation(len(minus(eye,current.pos)));
    const rate=speedLabel+(cruise?' | SC':'');
    if(speedText.textContent!==rate)speedText.textContent=rate;
    if(distanceText.textContent!==dist)distanceText.textContent=dist;
  }
  function getSolarSoundState() {
    const d=len(minus(eye,current.pos));
    return {target:current.key,near:clamp((3-d/(current.radioRange||current.approach))/2,0,1),speed:clamp(len(velocity)/Math.max(.04,physicalLimit),0,1),jump:jumps};
  }

  function backdrop() {
    ctx.fillStyle='#030508';ctx.fillRect(0,0,width,height);
    for(const star of stars) {
      const z=dot(axes.forward,star.v);
      if(z<.22)continue;
      const x=width*.5+dot(axes.right,star.v)/z*focal;
      const y=height*.5-dot(axes.up,star.v)/z*focal;
      if(x<0||x>width||y<0||y>height)continue;
      ctx.fillStyle=star.color;ctx.globalAlpha=star.alpha;
      ctx.fillRect(x,y,star.r,star.r);
    }
    ctx.globalAlpha=1;
  }
  function guides() {
    ctx.strokeStyle='rgba(121,172,163,.3)';ctx.lineWidth=.8;
    for(const body of bodies) {
      if(!body.orbit)continue;
      ctx.beginPath();let contiguous=false;
      for(let j=0;j<=100;j++) {
        const a=j*TAU/100;
        const delta=[Math.cos(a)*body.orbit-eye[0],-eye[1],Math.sin(a)*body.orbit-eye[2]];
        const z=dot(axes.forward,delta);
        if(z<=0){contiguous=false;continue;}
        const x=width*.5+dot(axes.right,delta)/z*focal;
        const y=height*.5-dot(axes.up,delta)/z*focal;
        if(x< -width*2||x>width*3||y< -height*2||y>height*3){contiguous=false;continue;}
        if(contiguous)ctx.lineTo(x,y);else ctx.moveTo(x,y);
        contiguous=true;
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
      if(r<.16&&body!==current&&!showNames)return;
      ctx.fillStyle=body.color;ctx.globalAlpha=r<.16?.45:.8;
      ctx.fillRect(x,y,body===current?2:1.15,body===current?2:1.15);ctx.globalAlpha=1;
    } else if(body.kind==='planet'||body.kind==='sun'){
      if(body.kind==='sun')glow(x,y,r,true);
      if(body.key==='saturn')ring(ctx,x,y,r,false);
      const [sprite,angle]=painter.globe(body,r,d,eye,axes,seconds,dpr);
      ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.drawImage(sprite,-r,-r,r*2,r*2);ctx.restore();
      if(body.key==='saturn')ring(ctx,x,y,r,true);
    } else if(body.kind==='craft') spacecraft(ctx,body,x,y,r,choice);
    else if(body.kind==='core')glow(x,y,r,false);
    else if(body.kind==='rock'){
      ctx.save();ctx.translate(x,y);ctx.scale(r,r);
      ctx.fillStyle='#5b574e';ctx.beginPath();ctx.moveTo(-1,-.28);ctx.lineTo(-.52,-.87);ctx.lineTo(.51,-.79);ctx.lineTo(.91,-.08);ctx.lineTo(.74,.66);ctx.lineTo(-.20,.81);ctx.lineTo(-.83,.42);ctx.fill();
      ctx.fillStyle='#373633';ctx.beginPath();ctx.moveTo(-.52,-.87);ctx.lineTo(.05,.15);ctx.lineTo(.91,-.08);ctx.lineTo(.74,.66);ctx.lineTo(-.20,.81);ctx.fill();ctx.restore();
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
    movement(dt);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    backdrop();if(showOrbits)guides();
    const visible=[];
    for(const body of bodies) {
      const v=minus(body.pos,eye), z=dot(axes.forward,v);
      if(z<=0)continue;
      const d=len(v),r=Math.min(Math.max(width,height)*4,body.radius/Math.sqrt(Math.max(1e-14,d*d-body.radius*body.radius))*focal);
      const x=width*.5+dot(axes.right,v)/z*focal,y=height*.5-dot(axes.up,v)/z*focal;
      if(x+2.4*r<0||x-2.4*r>width||y+2.4*r<0||y-2.4*r>height)continue;
      visible.push({body,x,y,r,d});
    }
    visible.sort((a,b)=>b.d-a.d);
    for(const v of visible)drawBody(v.body,v.x,v.y,v.r,v.d);
    if(now>=nextHud){nextHud=now+120;updateHud();}
    raf=requestAnimationFrame(frame);
  }
  function pauseSolarFlight() {
    active=false;cancelAnimationFrame(raf);resetInput();setRoute(false);
    clearTimeout(hintTimer);clearTimeout(arriveTimer);arrival.classList.remove('is-arriving');
  }
  function resumeSolarFlight() {
    if(active)return;
    active=true;last=performance.now();budget.resetTiming();setRoute(false);resize();
    dock.dataset.solarRenderer='canvas2d';
    if(compact.matches&&showHint){hint.hidden=false;hintTimer=setTimeout(dismissHint,7400);}
    raf=requestAnimationFrame(frame);
  }
  function visitObservatory(){if(choice){select('return-observatory');warpToTarget();}}
  function dispose(){pauseSolarFlight();listeners.abort();}
  return {resumeSolarFlight,pauseSolarFlight,setObservatoryUnlocked,visitObservatory,getSolarSoundState,
    selectDestination:select,getFlightSnapshot,restoreFlightSnapshot,setPilotOptions,halt:resetInput,dispose};
}
