// The flight plane is measured in local navigation units. The screen may rotate
// the chart by 90 degrees on portrait devices, but radio propagation stays put.
const TAU = Math.PI * 2;
const HULL = 21, CLEARANCE = 24;
const ORIGIN = { x: 0, y: 0 };
const BEACONS = { a: { x: -116, y: -34 }, b: { x: 116, y: -34 } };
const GATE = { x: -3, y: -65 };
const MINT = "#90e0d5", AMBER = "#ffc08a", DUST = "#9cb4c0";
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const length = (p, q = ORIGIN) => Math.hypot(q.x - p.x, q.y - p.y);
const polar = (angle, radius) => ({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
const angleOf = p => Math.atan2(p.y, p.x);

function generator(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(1664525, value) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function segmentClearance(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const fraction = clamp(-(a.x * dx + a.y * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(a.x + fraction * dx, a.y + fraction * dy);
}

function outside(point) {
  const d = length(point);
  if (d >= CLEARANCE) return point;
  return d < .01 ? { x: 0, y: CLEARANCE } : { x: point.x * CLEARANCE / d, y: point.y * CLEARANCE / d };
}

// Only the station itself is solid. A tap across the hull plots a tangent,
// follows the rim, then continues along the original course.
function plotCourse(from, to) {
  if (segmentClearance(from, to) >= CLEARANCE - .02) return [to];
  const a = angleOf(from), b = angleOf(to);
  const deltaA = Math.acos(clamp(CLEARANCE / length(from), -1, 1));
  const deltaB = Math.acos(clamp(CLEARANCE / length(to), -1, 1));
  const arcs = [-1, 1].map(sign => {
    const start = a + sign * deltaA, end = b - sign * deltaB;
    return { sign, start, span: ((sign * (end - start)) % TAU + TAU) % TAU };
  });
  const arc = arcs[0].span < arcs[1].span ? arcs[0] : arcs[1];
  const pieces = Math.max(1, Math.ceil(arc.span / .18));
  const points = [];
  for (let i = 0; i <= pieces; i++) points.push(polar(arc.start + arc.sign * arc.span * i / pieces, CLEARANCE));
  points.push(to);
  return points;
}

function paintSky(ctx, width, height) {
  const rnd = generator(37021);
  const nw = 360, nh = 248, low = document.createElement("canvas");
  low.width = nw; low.height = nh;
  const small = low.getContext("2d");
  const pixels = small.createImageData(nw, nh);
  const table = Array.from({ length: 4096 }, rnd);
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx *= fx * (3 - 2 * fx); fy *= fy * (3 - 2 * fy);
    const ix0 = ix & 63, ix1 = (ix + 1) & 63, iy0 = (iy & 63) * 64, iy1 = ((iy + 1) & 63) * 64;
    return ((1 - fx) * table[iy0 + ix0] + fx * table[iy0 + ix1]) * (1 - fy)
      + ((1 - fx) * table[iy1 + ix0] + fx * table[iy1 + ix1]) * fy;
  }
  for (let j = 0; j < nh; j++) {
    for (let i = 0; i < nw; i++) {
      const x = i / nw, y = j / nh;
      const warp = noise(x * 4 + 17, y * 5 + 16);
      const n = noise(x * 8 + warp * 4, y * 8 + warp * 4) * .62
        + noise(x * 26 + warp * 7, y * 31 + 6) * .28 + noise(x * 82, y * 95) * .10;
      const band = (y - .94 + .77 * x + .14 * Math.sin(5.5 * x) + .12 * warp) * 3.65;
      const stream = Math.exp(-band * band) * Math.max(0, 1.22 * n - .32);
      const warm = Math.max(0, (x - .45) * 1.7);
      const idx = (j * nw + i) * 4;
      pixels.data[idx] = 5 + 4 * n + stream * (18 + warm * 42);
      pixels.data[idx + 1] = 11 + 8 * n + stream * (49 - warm * 13);
      pixels.data[idx + 2] = 20 + 9 * n + stream * (52 - warm * 13);
      pixels.data[idx + 3] = 255;
    }
  }
  small.putImageData(pixels, 0, 0);
  ctx.drawImage(low, 0, 0, width, height);
  for (let i = 0, count = Math.min(650, Math.max(150, width * height / 800)); i < count; i++) {
    const x = rnd() * width, y = rnd() * height, light = rnd();
    ctx.fillStyle = i % 6 === 0 ? "rgba(255,215,176,.68)" : "rgba(204,226,236,.7)";
    ctx.globalAlpha = .22 + light * .65;
    const r = light > .988 ? 1.25 : .25 + light * .51;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (light > .988) {
      ctx.globalAlpha = .23;
      ctx.fillRect(x - 3.4, y - .4, 6.8, .8);
      ctx.fillRect(x - .4, y - 3.4, .8, 6.8);
    }
  }
  ctx.globalAlpha = 1;
  // The distant limb is a landmark outside the navigation plane.
  const r = Math.min(width, height) * .34;
  const cx = width - r * .18, cy = -r * .44;
  const haze = ctx.createRadialGradient(cx, cy, r * .89, cx, cy, r * 1.18);
  haze.addColorStop(0, "rgba(24,45,49,0)");
  haze.addColorStop(.40, "rgba(98,150,151,.26)");
  haze.addColorStop(.53, "rgba(77,132,142,.13)");
  haze.addColorStop(1, "rgba(66,121,136,0)");
  ctx.fillStyle = haze; ctx.fillRect(cx - r * 1.2, cy - r * 1.2, r * 2.4, r * 2.4);
  const globe = ctx.createRadialGradient(cx + r * .23, cy - r * .28, r * .32, cx, cy, r);
  globe.addColorStop(0, "#060e17"); globe.addColorStop(.82, "#0d1922"); globe.addColorStop(.97, "#182e35"); globe.addColorStop(1, "#618183");
  ctx.fillStyle = globe; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
}

function line(ctx, a, b, color, width = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}
function circle(ctx, x, y, radius, fill, stroke, width = 1) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function glow(ctx, x, y, radius, color) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color); gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient; ctx.fillRect(x-radius, y-radius, radius*2, radius*2);
}

function shadowCone(ctx, point, id) {
  const d = length(point), center = angleOf(point) + Math.PI;
  const aperture = Math.asin(HULL / d);
  const left = center - aperture, right = center + aperture;
  const touch = Math.sqrt(d * d - HULL * HULL);
  function ray(r, theta) { return { x: point.x + r * Math.cos(theta), y: point.y + r * Math.sin(theta) }; }
  const a = ray(touch, left), b = ray(touch, right), c = ray(410, right), e = ray(410, left);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x,c.y); ctx.lineTo(e.x,e.y); ctx.closePath();
  ctx.fillStyle = id === "a" ? "rgba(105,194,198,.082)" : "rgba(221,156,104,.094)";
  ctx.fill();
  ctx.setLineDash([1.7, 2.9]);
  const color = id === "a" ? "rgba(130,218,214,.39)" : "rgba(251,184,133,.39)";
  line(ctx,a,e,color,.48); line(ctx,b,c,color,.48); ctx.setLineDash([]);
}

function station(ctx, people) {
  const metal = ctx.createLinearGradient(-22,-23,26,22);
  metal.addColorStop(0,"#b8c8c9"); metal.addColorStop(.22,"#5a737d"); metal.addColorStop(.52,"#2f4154"); metal.addColorStop(.80,"#122735"); metal.addColorStop(1,"#62717c");
  circle(ctx,0,0,21,"#0a1622","#7b989f",.66);
  circle(ctx,0,0,20,metal);
  circle(ctx,0,0,15.45,"#0b1b26","#c3c9b4",.55);
  circle(ctx,0,0,11.15,"#152835","#819398",.57);
  for(let i=0;i<28;i++) {
    const a=TAU*i/28, active=i<(people?12:18);
    const p=polar(a,17.9), q=polar(a,19.6);
    line(ctx,p,q,i%2 ? "#344e58":"#c1cac3",.45);
    ctx.beginPath();ctx.arc(0,0,18.5,a+.027,a+.132);
    ctx.strokeStyle=active?"#ffcf8a":"#465764";ctx.lineWidth=1.06;ctx.stroke();
  }
  for(let i=0;i<6;i++) {
    ctx.save();ctx.rotate(TAU*i/6+.21);
    ctx.fillStyle="#637e87";ctx.fillRect(6,-.9,10.2,1.8);
    ctx.fillStyle="#263e4a";ctx.fillRect(12,-2,3.2,4);ctx.restore();
  }
  circle(ctx,0,0,6.6,metal,"#9db7b7",.6);
  circle(ctx,0,0,3.3,"#091e28","#74bdbe",.6);
  circle(ctx,-1,-.85,1.24,"#bcf8df");
  // Two docking arms projecting slightly beyond the load-bearing hull.
  for(const side of [-1,1]) {
    ctx.save();ctx.rotate(-.29+Math.PI*(side+1)/2);
    ctx.fillStyle="#88969a";ctx.fillRect(17.3,-1.4,7.9,2.8);
    ctx.fillStyle="#2b444f";ctx.fillRect(23.6,-2.4,3.6,4.8);
    ctx.fillStyle="#efb779";ctx.fillRect(26.25,-2.4,.9,4.8);ctx.restore();
  }
}

function drawBeacon(ctx, id, people) {
  const p=BEACONS[id], active=id === "a"?people:!people, color=id === "a"?MINT:AMBER;
  glow(ctx,p.x,p.y,13,active?"rgba(146,227,209,.17)":"rgba(194,190,161,.08)");
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(id==="a"?-.23:.26);
  if(id==="a") {
    ctx.fillStyle="#4b6575";ctx.fillRect(-7,-2.7,14,5.4);
    ctx.fillStyle="#1d3547";ctx.fillRect(-5.5,-5,5,10);ctx.fillRect(1.2,-4.1,4.4,8.2);
    ctx.fillStyle=active?"#ffe4a8":"#71858b";
    for(let j=0;j<6;j++) ctx.fillRect(-4.7+(j%3)*3.0,-1.8+Math.floor(j/3)*2.5,1.4,1.15);
  } else {
    ctx.strokeStyle="#b7b9af";ctx.lineWidth=.8;ctx.beginPath();
    ctx.moveTo(-5,3);ctx.lineTo(5,-4);ctx.moveTo(1,-1);ctx.lineTo(2,5);ctx.stroke();
    ctx.beginPath();ctx.ellipse(2,-2,5,2.15,-.52,0,Math.PI);ctx.stroke();
    ctx.fillStyle="#657990";ctx.fillRect(-7,0,3,4);ctx.fillRect(3,3,4,3);
    circle(ctx,5,-4,1,active?"#ffdca4":"#9a9988");
  }
  ctx.restore();
  circle(ctx,p.x,p.y,9.3,null,color,.43);
}

function littleShip(ctx,p,heading,color,size,thrust) {
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(heading);ctx.scale(size,size);
  if(thrust) {
    const exhaust=ctx.createLinearGradient(-3.3,0,-11,0);exhaust.addColorStop(0,"#a7f1e4");exhaust.addColorStop(1,"rgba(85,197,207,0)");
    ctx.fillStyle=exhaust;ctx.beginPath();ctx.moveTo(-2.8,-1);ctx.lineTo(-11,0);ctx.lineTo(-2.8,1);ctx.fill();
  }
  ctx.beginPath();ctx.moveTo(5.8,0);ctx.lineTo(-3.7,-2.8);ctx.lineTo(-2.4,0);ctx.lineTo(-3.7,2.8);ctx.closePath();
  ctx.fillStyle=color;ctx.fill();ctx.lineWidth=.56;ctx.strokeStyle="#132130";ctx.stroke();
  ctx.beginPath();ctx.moveTo(2.1,0);ctx.lineTo(-1.9,-.73);ctx.lineTo(-1.45,.6);ctx.closePath();ctx.fillStyle="#47747e";ctx.fill();
  ctx.restore();
}

export function createEchoFlight(canvas, hooks = {}) {
  const ctx=canvas.getContext("2d", {alpha:false});
  if(!ctx) throw new Error("Для карты нужен Canvas 2D");
  const bg=document.createElement("canvas"), bgCtx=bg.getContext("2d");
  const pressed=new Set();
  let w=0,h=0,scale=1,portrait=false,ratio=1;
  let ship={x:0,y:70}, heading=-Math.PI/2, route=[], clock=0, arrivalTime=0;
  let previousPhase=null, pending=null, latest=null, disposed=false;
  let state={phase:"listen",samples:{a:false,b:false},choice:"people"}, readings=null;
  const trail=[];
  let trailClock=0;

  function resize() {
    const rect=canvas.getBoundingClientRect();
    const width=Math.max(1,Math.round(rect.width)), height=Math.max(1,Math.round(rect.height));
    const dpr=clamp(globalThis.devicePixelRatio || 1,1,2);
    if(w===width&&h===height&&ratio===dpr) return;
    w=width;h=height;ratio=dpr;portrait=w/h<1.05;
    scale=portrait?Math.min(w/210,h/328):Math.min(w/328,h/210);
    canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
    bg.width=canvas.width;bg.height=canvas.height;
    bgCtx.setTransform(ratio,0,0,ratio,0,0);paintSky(bgCtx,w,h);
  }
  function screen(p) {
    return {x:w/2+(portrait?-p.y:p.x)*scale,y:h/2+(portrait?p.x:p.y)*scale};
  }
  function world(nx,ny) {
    const x=(nx*w-w/2)/scale, y=(ny*h-h/2)/scale;
    return portrait?{x:y,y:-x}:{x,y};
  }
  function screenText(text,p,offsetY,color,align="center") {
    const q=screen(p);
    ctx.font="600 "+clamp(scale*3.7,9,13)+"px system-ui, sans-serif";
    ctx.textAlign=align;ctx.textBaseline="middle";
    ctx.lineJoin="round";ctx.lineWidth=3;ctx.strokeStyle="rgba(5,15,23,.88)";
    ctx.strokeText(text,q.x,q.y+offsetY);ctx.fillStyle=color;ctx.fillText(text,q.x,q.y+offsetY);
  }
  function sensor(id) {
    const source=BEACONS[id], clearance=segmentClearance(source,ship);
    const blocked=clearance<HULL;
    const base=clamp(1.02-length(source,ship)/520,.50,1);
    // A finite penumbra turns the visual crossing into an audible fade.
    const transmission=clamp((clearance-HULL+2.1)/4.2,0,1);
    return {blocked, power:base*(.055+.945*transmission)};
  }
  function tell(name) {
    if(pending!==null) return;
    pending=name;
    hooks.onEvent?.(name);
  }
  function read() {
    const a=sensor("a"), b=sensor("b");
    const captured=state.samples || {};
    const clean = a.power>.48&&b.power<.19&&!captured.a?"a":b.power>.48&&a.power<.19&&!captured.b?"b":null;
    const canCapture=state.phase==="listen"?clean:null;
    const distance=length(ship,GATE);
    return {a:a.power,b:b.power,occludedA:a.blocked,occludedB:b.blocked,
      canCapture,nearGate:distance<7,targetDistance:distance,signalPhase:(clock%3.6)/3.6};
  }

  function moveTo(nx,ny) {
    if(disposed||state.phase==="arrived"||!Number.isFinite(nx)||!Number.isFinite(ny)||!w) return;
    const end=world(clamp(nx,0,1),clamp(ny,0,1));
    const destination=outside({x:clamp(end.x,-151,151),y:clamp(end.y,-95,95)});
    route=plotCourse(ship,destination);
  }
  function key(name,down) {
    if(!["left","right","up","down"].includes(name)) return;
    if(down) {pressed.add(name);route=[];} else pressed.delete(name);
  }
  function interact() {
    if(disposed||!readings) return;
    if(readings.canCapture) tell("sample-"+readings.canCapture);
    else if(state.phase==="gate"&&readings.nearGate) tell("arrived");
  }

  function advance(dt) {
    if(state.phase==="arrived") return false;
    let dx=Number(pressed.has("right"))-Number(pressed.has("left")),dy=Number(pressed.has("down"))-Number(pressed.has("up"));
    if(dx||dy) {
      if(portrait) [dx,dy]=[dy,-dx];
      const d=Math.hypot(dx,dy);dx/=d;dy/=d;
      const next=outside({x:ship.x+dx*48*dt,y:ship.y+dy*48*dt});
      ship={x:clamp(next.x,-151,151),y:clamp(next.y,-95,95)};heading=Math.atan2(dy,dx);
      return true;
    }
    let remaining=dt*48, moved=false;
    while(route.length&&remaining>0) {
      const p=route[0],dist=length(ship,p);
      if(dist<.015){route.shift();continue;}
      const step=Math.min(remaining,dist);
      dx=(p.x-ship.x)/dist;dy=(p.y-ship.y)/dist;
      ship={x:ship.x+step*dx,y:ship.y+step*dy};heading=Math.atan2(dy,dx);
      remaining-=step;moved=true;
      if(step===dist)route.shift();
    }
    return moved;
  }

  function mapFrame() {
    ctx.translate(w/2,h/2);if(portrait)ctx.rotate(Math.PI/2);ctx.scale(scale,scale);
  }
  function mapBase() {
    ctx.save();mapFrame();
    ctx.strokeStyle="rgba(116,164,178,.13)";ctx.lineWidth=.42;
    for(const radius of [43,74,106,139]) {
      ctx.beginPath();ctx.ellipse(0,0,radius,radius*.77,-.16,0,TAU);ctx.stroke();
    }
    const people=state.choice==="people";
    if(state.phase==="listen") {shadowCone(ctx,BEACONS.a,"a");shadowCone(ctx,BEACONS.b,"b");}
    for(const id of ["a","b"]) {
      const source=BEACONS[id], blocked=id==="a"?readings.occludedA:readings.occludedB;
      if(state.phase!=="arrived") {
        ctx.setLineDash(blocked?[1.5,3.4]:[.9,1.9]);
        line(ctx,ship,source,blocked?"rgba(134,151,166,.25)":id==="a"?"rgba(143,230,216,.52)":"rgba(255,192,138,.55)",.56);
        ctx.setLineDash([]);
      }
      const sample=state.samples?.[id];
      if(sample) circle(ctx,source.x,source.y,11.2,null,id==="a"?MINT:AMBER,.65);
      const time=state.reducedMotion?.4:((clock/(id==="a"?3.6:2.4)+.28)%1);
      circle(ctx,source.x,source.y,10+time*9,null,id==="a"?`rgba(145,220,209,${.18*(1-time)})`:`rgba(255,184,127,${.2*(1-time)})`,.52);
      drawBeacon(ctx,id,people);
    }
    if(state.phase!=="listen") {
      for(const id of ["a","b"]) {
        ctx.setLineDash([2,3]);line(ctx,BEACONS[id],GATE,"rgba(179,219,207,.32)",.51);ctx.setLineDash([]);
      }
    }
    station(ctx,people);
    ctx.restore();
    screenText("КРОМКА",ORIGIN,-Math.max(13,scale*28),"#d3e1df");
    screenText("A · СТВОР",BEACONS.a,Math.max(13,scale*14),MINT);
    screenText("B · ДАЛЬНИЙ БУЙ",BEACONS.b,Math.max(13,scale*14),AMBER);
  }
  function drawGate() {
    if(state.phase==="listen")return;
    const pulse=state.reducedMotion?.3:.5+.5*Math.sin(clock*2.2);
    ctx.save();mapFrame();ctx.translate(GATE.x,GATE.y);
    glow(ctx,0,0,21+pulse*2,"rgba(193,233,208,.21)");
    ctx.strokeStyle="#d5f3d9";ctx.lineWidth=.95;ctx.beginPath();ctx.ellipse(0,0,8,10,-.36,0,TAU);ctx.stroke();
    ctx.strokeStyle="#75a4a5";ctx.lineWidth=.58;ctx.beginPath();ctx.ellipse(0,0,10.6,12.5,-.36,.41,4.9);ctx.stroke();
    ctx.beginPath();ctx.ellipse(0,0,6.1,8,-.36,0,TAU);ctx.fillStyle="rgba(150,225,192,.13)";ctx.fill();
    ctx.restore();screenText("ПРОХОД",GATE,-Math.max(14,scale*14),"#d6edda");
  }
  function drawPilot(moving) {
    ctx.save();mapFrame();
    if(route.length) {
      ctx.beginPath();ctx.moveTo(ship.x,ship.y);for(const p of route)ctx.lineTo(p.x,p.y);
      ctx.setLineDash([1.8,1.9]);ctx.lineWidth=.46;ctx.strokeStyle="rgba(236,244,222,.62)";ctx.stroke();ctx.setLineDash([]);
      const p=route[route.length-1];circle(ctx,p.x,p.y,2.6,null,"#dcf3de",.55);
    }
    for(let i=1;i<trail.length;i++) {
      line(ctx,trail[i-1],trail[i],`rgba(141,215,207,${i/trail.length*.4})`,.69);
    }
    glow(ctx,ship.x,ship.y,8,"rgba(133,232,211,.24)");
    littleShip(ctx,ship,heading,"#e9fff1",1.04,moving);
    if(readings.canCapture) circle(ctx,ship.x,ship.y,7.4,null,"#f0e4be",.65);
    ctx.restore();
  }
  function drawShuttle() {
    const elapsed=Math.max(0,clock-arrivalTime);
    const cycle=(elapsed%13.4)/13.4;
    const t=cycle<.5?clamp(cycle/.45,0,1):1-clamp((cycle-.5)/.45,0,1);
    const from={x:-4,y:-18}, middle={x:-37,y:-43}, to=GATE;
    const u=1-t;
    const point={x:u*u*from.x+2*u*t*middle.x+t*t*to.x,y:u*u*from.y+2*u*t*middle.y+t*t*to.y};
    const orientation=Math.atan2(u*(middle.y-from.y)+t*(to.y-middle.y),u*(middle.x-from.x)+t*(to.x-middle.x));
    ctx.save();mapFrame();ctx.setLineDash([2,2]);ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.quadraticCurveTo(middle.x,middle.y,to.x,to.y);
    ctx.strokeStyle="#8daf9b";ctx.lineWidth=.6;ctx.stroke();ctx.setLineDash([]);
    littleShip(ctx,point,orientation+(cycle<.5?0:Math.PI),"#ffce91",1.08,true);ctx.restore();
    screenText("ЧЕЛНОК",point,Math.max(11,scale*7),"#ffdaab");
  }

  function render(elapsed,nextState) {
    if(disposed)return;
    state=nextState||state;
    const dt=clamp(Number.isFinite(elapsed)?elapsed:0,0,.12);
    resize();clock+=dt;
    if(previousPhase==="arrived"&&state.phase==="listen") {ship={x:0,y:70};route=[];trail.length=0;}
    if(previousPhase!==state.phase) {
      route=[];pressed.clear();
      if(state.phase==="arrived") arrivalTime=clock;
    }
    const token=state.phase+Number(!!state.samples?.a)+Number(!!state.samples?.b);
    if(latest!==token) {latest=token;pending=null;}
    previousPhase=state.phase;
    const moving=advance(dt);
    trailClock+=dt;
    if(trailClock>.12) {
      trailClock=0;trail.push({...ship});if(trail.length>14) trail.shift();
    }
    readings=read();
    hooks.onTelemetry?.(readings);
    if(state.phase==="gate"&&readings.nearGate) tell("arrived");
    ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(bg,0,0);
    ctx.setTransform(ratio,0,0,ratio,0,0);
    mapBase();drawGate();drawPilot(moving&&!state.reducedMotion);
    if(state.phase==="arrived")drawShuttle();
  }
  function snapshot() {
    return { x: ship.x, y: ship.y };
  }
  function restore(saved) {
    if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return false;
    const point = { x: clamp(saved.x, -151, 151), y: clamp(saved.y, -95, 95) };
    // Waypoints on the hull follow short safe chords just inside the clearance radius.
    if (length(point) < HULL + .8) return false;
    ship = outside(point);
    route = []; pressed.clear(); trail.length = 0;
    return true;
  }
  return { render, moveTo, key, interact, snapshot, restore, dispose() {disposed=true;pressed.clear();route=[];bg.width=bg.height=1;} };
}
