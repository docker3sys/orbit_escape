// A procedurally illustrated print of the observable ending. No network or font assets.
const WIDTH = 1080;
const HEIGHT = 1350;
const TURN = Math.PI * 2;

function randomStars(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function line(ctx, points, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
  ctx.stroke();
}

function shape(ctx, points, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
  ctx.closePath();
  ctx.fill();
}

function star(ctx, x, y, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x,y,r,0,TURN);
  ctx.fill();
}

function glow(ctx, x, y, r, center, edge) {
  const g=ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,center);
  g.addColorStop(1,edge);
  ctx.fillStyle=g;
  ctx.fillRect(x-r,y-r,2*r,2*r);
}

function print(ctx, label, x, y, font, fill, align="left") {
  ctx.textAlign=align;
  ctx.font=font;
  ctx.fillStyle=fill;
  ctx.fillText(label,x,y);
}

function drawFirmament(ctx, crew) {
  const sky = ctx.createLinearGradient(100,110,910,980);
  sky.addColorStop(0, "#10182e");
  sky.addColorStop(.53, crew ? "#22354f" : "#193749");
  sky.addColorStop(1, crew ? "#554356" : "#235457");
  ctx.fillStyle=sky;
  ctx.fillRect(0,0,WIDTH,HEIGHT);
  const rand = randomStars(17291);
  for (let i=0; i<730; i++) {
    const x=rand()*WIDTH,y=rand()*920;
    const r=.4+1.6*rand()**4;
    star(ctx,x,y,r,`rgba(221,232,236,${.24+rand()*.7})`);
    if (r>1.95) {
      line(ctx,[[x-4,y],[x+4,y]],"#a5c4d7",.8);
      line(ctx,[[x,y-4],[x,y+4]],"#a5c4d7",.8);
    }
  }
  const aurora = ctx.createLinearGradient(340,320,930,710);
  aurora.addColorStop(0, "rgba(147,140,250,0)");
  aurora.addColorStop(.48, crew ? "rgba(143,154,242,.22)" : "rgba(114,191,219,.19)");
  aurora.addColorStop(.78, crew ? "rgba(232,151,174,.24)" : "rgba(122,239,205,.24)");
  aurora.addColorStop(1, "rgba(222,207,170,0)");
  ctx.strokeStyle=aurora;
  ctx.lineWidth=1.7;
  for(let i=0;i<63;i++){
    const t=i/63;
    ctx.beginPath();
    ctx.moveTo(-30, 420+145*t);
    ctx.bezierCurveTo(280, 280+80*t, 360, 700-205*t, 680, 550-207*t);
    ctx.bezierCurveTo(880, 455-190*t, 925, 200+95*t, 1120, 85+158*t);
    ctx.stroke();
  }
  // The star trace is the return route. Its three bright knots match the three flight legs.
  const chart=[[106,502],[237,447],[330,497],[490,373],[570,400],[753,305],[924,373]];
  line(ctx,chart,"rgba(210,219,243,.33)",1.2);
  for(const [i,[x,y]] of chart.entries()) {
    const major = [1,3,5].includes(i);
    star(ctx,x,y,major ? 4.5 : 2.8,major ? "#ffddb2" : "#c9d4e5");
    if(major){
      ctx.beginPath();ctx.arc(x,y,11,0,TURN);
      ctx.strokeStyle="rgba(245,221,185,.51)";ctx.lineWidth=1;ctx.stroke();
      line(ctx,[[x-15,y],[x-10,y]],"#e9cda8",1);
      line(ctx,[[x+10,y],[x+15,y]],"#e9cda8",1);
    }
  }
}

function ridge(ctx, baseline, amplitude, fill, seed) {
  const rand=randomStars(seed);
  const points=[[-8,HEIGHT]];
  for(let x=-8;x<WIDTH+28;x+=15) {
    points.push([x,baseline+amplitude*(.67*Math.sin(x/135+seed)+.23*Math.sin(x/39)+.2*(rand()-.5))]);
  }
  points.push([WIDTH+28,HEIGHT]);
  shape(ctx,points,fill);
}

function observatory(ctx, crew) {
  const accent=crew?"#ffc995":"#93eddc";
  ridge(ctx,695,84,"#374153",4);
  ridge(ctx,754,83,"#242e40",13);
  ridge(ctx,803,52,"#162433",9);

  ctx.save();
  ctx.translate(614,747);
  // The main dome is a shallow ribbed shell with a slit for the telescope.
  const metal=ctx.createLinearGradient(-117,-180,98,30);
  metal.addColorStop(0,"#66747a");metal.addColorStop(.45,"#53666c");metal.addColorStop(1,"#162934");
  ctx.fillStyle=metal;ctx.beginPath();ctx.arc(0,-32,118,Math.PI,TURN);ctx.closePath();ctx.fill();
  for(let i=-3;i<=3;i++){
    ctx.beginPath();ctx.moveTo(i*.7,-148);
    ctx.quadraticCurveTo(i*26,-111,i*37,-32);
    ctx.strokeStyle=i<1?"#89908c":"#344b55";ctx.lineWidth=2.2;ctx.stroke();
  }
  shape(ctx,[[-7,-150],[17,-148],[43,-35],[20,-33]],"#0f202a");
  line(ctx,[[17,-148],[43,-35]],accent,2);
  shape(ctx,[[-124,-33],[122,-33],[119,3],[-123,10]],"#52616a");
  shape(ctx,[[-124,-18],[122,-20],[121,-12],[-123,-7]],"#243c49");
  shape(ctx,[[-121,3],[120,-5],[120,59],[-121,69]],"#202e39");
  line(ctx,[[-123,10],[119,3]],"#99a49f",2);
  shape(ctx,[[-174,27],[-113,6],[-108,67],[-181,73]],"#344a54");
  shape(ctx,[[119,5],[179,26],[182,58],[118,59]],"#142630");
  for(let i=0;i<6;i++){
    const x=-93+i*31;
    ctx.fillStyle=crew ? "#ffe3a5" : i===4 ? "#96efdf":"#486273";
    ctx.fillRect(x,22-i*.8,12,15);
    if(crew||i===4)glow(ctx,x+6,28,18,crew?"rgba(255,210,136,.23)":"rgba(140,249,223,.26)","rgba(31,55,68,0)");
  }
  // Long-baseline dish on its own pier. The relay ending animates it in the player's world.
  line(ctx,[[164,42],[185,-20],[202,38]],"#617680",5);
  line(ctx,[[184,-16],[214,-54]],"#aab9b5",4);
  ctx.save();
  ctx.translate(185,-19);ctx.rotate(-.56);
  ctx.beginPath();ctx.moveTo(-36,-24);ctx.quadraticCurveTo(0,12,36,-24);
  ctx.lineTo(-36,-24);ctx.closePath();ctx.fillStyle="#809291";ctx.fill();ctx.strokeStyle="#c0c6b8";ctx.lineWidth=1.8;ctx.stroke();
  line(ctx,[[-36,-24],[0,-49],[36,-24]],"#b1bbb1",1.6);
  star(ctx,0,-49,3,accent);ctx.restore();
  if(!crew) {
    for(const r of [35,55,78]){
      ctx.beginPath();ctx.arc(207,-70,r,-1.46,-.69);
      ctx.strokeStyle="rgba(149,235,219,.66)";ctx.lineWidth=2;ctx.stroke();
    }
  }
  ctx.restore();
  ridge(ctx,843,29,"#12202b",31);
  ridge(ctx,870,32,"#101b25",23);
  if(crew){
    // The inhabited route is marked by six refuelling lamps running down the ridge.
    for(let i=0;i<6;i++){
      const x=282+i*38,y=833-15*Math.cos(i*.72);
      glow(ctx,x,y,14,"rgba(255,192,111,.4)","rgba(210,132,80,0)");
      star(ctx,x,y,2.3,"#ffd59a");
    }
  }
}

export function drawLastCard(choice) {
  if(choice!=="people"&&choice!=="relay") throw new Error("Unknown observatory outcome");
  const crew=choice==="people";
  const canvas=document.createElement("canvas");
  canvas.width=WIDTH;canvas.height=HEIGHT;
  const ctx=canvas.getContext("2d");
  drawFirmament(ctx,crew);
  observatory(ctx,crew);
  print(ctx,"ORBIT ESCAPE",59,89,"bold 35px sans-serif","#f0eee3");
  print(ctx,"ЭКСПЕДИЦИЯ 03",1020,86,"24px monospace","#c2ced5","right");
  line(ctx,[[59,115],[1020,115]],"#72838c",1);
  print(ctx,"Обратный свет",55,244,"bold 102px sans-serif","#fff1dc");
  ctx.fillStyle="#101b25";ctx.fillRect(0,905,WIDTH,HEIGHT-905);
  print(ctx,"ОБСЕРВАТОРИЯ",60,1000,"25px monospace",crew?"#edc49b":"#9adcca");
  print(ctx,crew?"Горят окна.":"Антенна в эфире.",56,1095,"bold 80px sans-serif","#fff1df");
  const message=crew
    ? ["Механик со «Створа» услышал ответ.","По твоему маршруту снова можно найти дорогу."]
    : ["Ретранслятор принял дальний позывной.","По твоему маршруту снова можно найти дорогу."];
  message.forEach((s,i)=>print(ctx,s,62,1164+i*44,"34px sans-serif","#c7d3d6"));
  line(ctx,[[60,1253],[1020,1253]],"#65767a",1);
  print(ctx,"КРОМКА   →   ОБСЕРВАТОРИЯ",60,1304,"25px monospace","#b5c9ca");
  return canvas;
}
