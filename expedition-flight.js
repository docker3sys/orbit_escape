// All distances in the expedition are local navigation units.
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const directionError = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

function seeded(seed) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(1664525, n) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

// A precomputed equirectangular sky avoids evaluating fractal noise per frame.
function deepSky(T, random) {
  const width = 768, height = 384;
  const bytes = new Uint8Array(width * height * 4);
  const lattice = Float32Array.from({length: 4096}, random);
  function noise(x, y) {
    const a = Math.floor(x), b = Math.floor(y);
    const u = x-a, v = y-b, f = u*u*(3-2*u), g = v*v*(3-2*v);
    const index = ((b & 63) << 6) | (a & 63);
    const next = ((b & 63) << 6) | ((a+1) & 63);
    const row = (index + 64) & 4095, rowNext = (next + 64) & 4095;
    return (lattice[index] * (1-f) + lattice[next] * f) * (1-g)
      + (lattice[row] * (1-f) + lattice[rowNext] * f) * g;
  }
  for (let y=0; y<height; y++) {
    for (let x=0; x<width; x++) {
      const u=x/width, v=y/height;
      const lat=(v-.5)*Math.PI, lon=u*TAU;
      const dx=Math.cos(lon)*Math.cos(lat), dy=Math.sin(lat), dz=Math.sin(lon)*Math.cos(lat);
      const nx=dx*.63 + dz*.77, ny=dy*.95 + dx*.12 - dz*.22;
      const broad=noise(nx*4+28,ny*4+13), mid=noise(nx*12+31,ny*14+19);
      const fine=noise(nx*34+20,ny*40+51), dust=noise(nx*77+22,ny*84+3);
      const lane=ny + .11*Math.sin(3*lon) - .08*(broad-.5);
      const envelope=Math.exp(-Math.pow(lane/.24,2)) * Math.cos(lat)**2;
      const filament=clamp((broad*.42+mid*.34+fine*.18+dust*.06-.25)*1.9,0,1);
      const shadow=.45+.55*clamp(Math.abs(lane+.05*(mid-.5))/.055,0,1);
      const cloud=envelope*filament*filament*shadow;
      const warm=.5+.5*Math.sin(lon+.2);
      const i=(x+y*width)*4;
      bytes[i]=Math.round(3.4 + cloud*(30+42*warm));
      bytes[i+1]=Math.round(7 + cloud*(54-12*warm));
      bytes[i+2]=Math.round(16 + cloud*(75+7*warm));
      bytes[i+3]=255;
    }
  }
  const tex=new T.DataTexture(bytes,width,height,T.RGBAFormat);
  tex.minFilter=tex.magFilter=T.LinearFilter;
  tex.colorSpace=T.SRGBColorSpace;
  tex.needsUpdate=true;
  const group=new T.Group();
  const sky=new T.Mesh(new T.SphereGeometry(390,40,24),new T.MeshBasicMaterial({map:tex, side:T.BackSide,depthWrite:false,toneMapped:false}));
  sky.renderOrder=-10;
  group.add(sky);
  const count=3700, pos=[], colors=[], sizes=[];
  const palette=[[.83,.91,1],[.56,.78,1],[1,.9,.76],[.7,1,.96],[.98,.96,1]];
  for(let i=0;i<count;i++) {
    const a=TAU*random(), h=2*random()-1, r=Math.sqrt(1-h*h);
    pos.push(340*r*Math.cos(a),340*h,340*r*Math.sin(a));
    const c=palette[Math.floor(random()*palette.length)], l=.41+.59*random();
    colors.push(c[0]*l,c[1]*l,c[2]*l);
    sizes.push(1.1+Math.pow(random(),6)*4.4);
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  geo.setAttribute('tint',new T.Float32BufferAttribute(colors,3));
  geo.setAttribute('size',new T.Float32BufferAttribute(sizes,1));
  const stars=new T.Points(geo,new T.ShaderMaterial({
    transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,
    uniforms:{pixel:{value:1}},
    vertexShader:'attribute vec3 tint; attribute float size; varying vec3 c; uniform float pixel; void main(){ c=tint; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize=size*pixel; }',
    fragmentShader:'varying vec3 c; void main(){ vec2 p=(gl_PointCoord-.5)*2.; float d=dot(p,p); if(d>1.) discard; gl_FragColor=vec4(c,exp(-3.6*d)); }'
  }));
  stars.renderOrder=-8;
  group.add(stars);
  return {group,stars};
}

function cylinder(T, from, to, radius, material, sides=7) {
  const a=new T.Vector3(...from), b=new T.Vector3(...to);
  const delta=b.clone().sub(a);
  const mesh=new T.Mesh(new T.CylinderGeometry(radius,radius,delta.length(),sides),material);
  mesh.position.copy(a).lerp(b,.5);
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());
  return mesh;
}

function makeVoyager(T) {
  const probe=new T.Group();
  const rng=seeded(198909), size=96, foil=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const crease=Math.sin(x*.33+1.7*Math.sin(y*.12))*.49+Math.sin(y*.31+x*.14)*.3;
    const l=.69+.18*crease+.12*rng()+.26*Math.exp(-Math.abs(crease)*19);
    const n=(x+y*size)*4;foil[n]=Math.min(255,242*l);foil[n+1]=Math.min(255,179*l);foil[n+2]=Math.min(255,92*l);foil[n+3]=255;
  }
  const film=new T.DataTexture(foil,size,size);
  film.colorSpace=T.SRGBColorSpace;film.wrapS=film.wrapT=T.RepeatWrapping;film.repeat.set(3,1);
  film.minFilter=film.magFilter=T.LinearFilter;film.needsUpdate=true;
  const gold=new T.MeshStandardMaterial({color:0xf5dbad,map:film,metalness:.43,roughness:.41,flatShading:true});
  const ivory=new T.MeshStandardMaterial({color:0xd6d5ca,roughness:.54,metalness:.22,side:T.DoubleSide});
  const dark=new T.MeshStandardMaterial({color:0x273743,metalness:.56,roughness:.48});
  const body=new T.Mesh(new T.CylinderGeometry(.75,.8,.76,10),gold);
  probe.add(body);
  const dish=new T.Group();
  dish.position.set(-.15,1.01,.37); dish.rotation.x=.92; dish.rotation.z=-.23;
  const dishPoints=[];
  for(let i=0;i<=15;i++) { const r=.02+i/15*1.32; dishPoints.push(new T.Vector2(r,.30*r*r-.24)); }
  dish.add(new T.Mesh(new T.LatheGeometry(dishPoints,60),ivory));
  // Concentric panel seams and the 24 ribs make the antenna readable even edge-on.
  const seams=[];
  function mark(r,a){return [r*Math.cos(a),.30*r*r-.228,r*Math.sin(a)];}
  for(let i=0;i<24;i++) {
    const a=i*TAU/24;
    for(let k=0;k<10;k++)seams.push(...mark(.12+.12*k,a),...mark(.24+.12*k,a));
  }
  for(const radius of [.39,.77,1.12,1.315]){
    for(let i=0;i<72;i++)seams.push(...mark(radius,i*TAU/72),...mark(radius,(i+1)*TAU/72));
  }
  const ribs=new T.BufferGeometry();ribs.setAttribute('position',new T.Float32BufferAttribute(seams,3));
  dish.add(new T.LineSegments(ribs,new T.LineBasicMaterial({color:0x685e4e,opacity:.33,transparent:true})));
  for(let i=0;i<3;i++){
    const a=i*TAU/3;
    dish.add(cylinder(T,[Math.cos(a)*1.22,.22,Math.sin(a)*1.22],[0,.86,0],.018,dark));
  }
  const feed=new T.Mesh(new T.CylinderGeometry(.07,.105,.20,10),gold); feed.position.y=.88; dish.add(feed);
  probe.add(dish);
  const deck=new T.Mesh(new T.CylinderGeometry(.78,.79,.13,10),dark);
  deck.position.y=-.38; probe.add(deck);
  for(let i=0;i<6;i++){
    const box=new T.Mesh(new T.BoxGeometry(.18,.27,.10),dark);
    const a=i*TAU/10;
    box.position.set(.76*Math.cos(a),-.04,.76*Math.sin(a));box.rotation.y=Math.PI/2-a;probe.add(box);
  }
  const sensor=new T.Mesh(new T.BoxGeometry(.42,.48,.45),ivory);sensor.position.set(1.03,.05,.12);probe.add(sensor);
  const port=new T.Mesh(new T.CylinderGeometry(.11,.15,.18,12),dark);
  port.rotation.x=Math.PI/2;port.position.copy(sensor.position);port.position.z+=.28;probe.add(port);
  const boom=new T.Group();
  const beamEnds=[[.15,.11,.11],[.15,-.12,.11],[.15,0,-.12]];
  for(const [x,y,z] of beamEnds)boom.add(cylinder(T,[x,y,z],[3.8,y*.5,z*.5],.017,ivory));
  for(let i=0;i<7;i++)boom.add(cylinder(T,[.2+i*.5,-.1,.11],[.7+i*.5,.11,.11],.015,ivory));
  boom.position.x=.45; boom.rotation.z=-.12; probe.add(boom);
  const camera=new T.Mesh(new T.BoxGeometry(.48,.32,.28),dark); camera.position.set(4.04,-.34,0);probe.add(camera);
  probe.add(cylinder(T,[-.52,-.25,0],[-2.2,-.54,.02],.11,gold));
  for(let i=0;i<7;i++) {
    const fin=new T.Mesh(new T.CylinderGeometry(.24,.24,.05,8),dark);
    fin.rotation.z=Math.PI/2+.18; fin.position.set(-1.47-i*.11,-.40-i*.02,0); probe.add(fin);
  }
  probe.add(cylinder(T,[.22,-.27,0],[-1.9,-2.12,.1],.018,ivory),cylinder(T,[.22,-.27,0],[1.6,-2.24,.1],.018,ivory));
  probe.rotation.set(.12,-.58,-.24);
  return probe;
}

function portal(T) {
  const mat=new T.ShaderMaterial({
    transparent:true,depthWrite:false,toneMapped:false,
    uniforms:{time:{value:0},strength:{value:.6},open:{value:0}},
    vertexShader:'varying vec2 v; void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`
      precision highp float; varying vec2 v; uniform float time,strength,open;
      void main() {
        vec2 p=(v-.5)*2.; float r=length(p), a=atan(p.y,p.x);
        float t=time*.58, rad=.49+.044*open+.012*sin(4.*a-t)+.008*sin(9.*a+t);
        float d=r-rad;
        float rim=exp(-abs(d)*86.);
        float shimmer=.72+.28*sin(5.*a-t*3.+sin(3.*a+t));
        float outer=exp(-abs(d)*15.)*shimmer;
        float inner=1.-smoothstep(.07,rad-.012,r);
        float whirl=.53+.47*sin(32.*r-4.*a+t*3.+.9*sin(19.*r+3.*a-t));
        float ray=(.56+.44*sin(27.*a+sin(11.*a-t)+t)) * exp(-max(d,0.)*13.) * smoothstep(-.01,.02,d);
        vec3 light=vec3(.05,.69,.76)*outer*.68+vec3(.67,1.,1.)*rim*1.3+vec3(.09,.43,.67)*ray*.35;
        light+=inner*whirl*whirl*vec3(.04,.17,.25);
        float alpha=clamp((outer*.8+rim*.9+inner*.66+ray*.18)*strength,0.,1.);
        if(alpha<.005) discard;
        gl_FragColor=vec4(clamp(light*strength/max(alpha,.04),0.,1.),alpha);
      }`
  });
  return new T.Mesh(new T.PlaneGeometry(14,14),mat);
}

function blackHole(T) {
  const mat=new T.ShaderMaterial({
    uniforms:{time:{value:0}}, transparent:true,depthWrite:false,toneMapped:false,
    vertexShader:'varying vec2 v; void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`
      precision highp float; varying vec2 v; uniform float time;
      float gauss(float x){return exp(-x*x);}
      void main(){
        vec2 p=mat2(.986,-.167,.167,.986)*(v*2.-1.);
        float r=length(p),t=time*.2, shadow=1.-smoothstep(.229,.255,r);
        float ring=gauss((r-.253)/.007),halo=gauss((r-.262)/.045);
        float side=smoothstep(-.02,.02,p.y);
        vec2 lens=vec2(p.x/.395,p.y/mix(.270,.392,side));
        float arcR=length(lens),arcA=atan(lens.y,lens.x);
        float grains=.72+.16*sin(145.*arcR+2.5*sin(4.*arcA-t))+.12*sin(248.*arcR-6.*arcA+t);
        float arc=gauss((arcR-1.)/.118)*mix(.42,.97,side)*grains;
        float echo=gauss((arcR-.84)/.033)*mix(.2,.42,side);
        float xx=abs(p.x),end=1.-smoothstep(.57,.96,xx);
        float y=p.y+.034-.020*p.x*p.x,h=.019+.033*(1.-smoothstep(.06,.88,xx));
        float band=gauss(y/h)*end, emit=.66+.34*(1.-smoothstep(-.45,.56,p.x));
        float flux=.78+.14*sin(350.*y+19.*xx+2.*sin(18.*xx-t))+.08*sin(610.*y-42.*xx+t);
        float core=gauss((y+.005)/(.26*h))*end,scatter=.15*gauss(y/(h*3.8))*end;
        float light=emit*(1.17*arc+.55*echo+.78*ring+.16*halo+band*flux+.52*core);
        float aura=.18*gauss((r-.30)/.18)+scatter;
        float alpha=clamp(max(shadow,light*1.6+aura),0.,1.);
        if(alpha<.007) discard;
        vec3 embers=vec3(.92,.29,.075)*min(light,.68)*1.35;
        vec3 hot=vec3(1.,.81,.59)*smoothstep(.35,1.28,light);
        vec3 bloom=vec3(.52,.12,.055)*aura*(1.-shadow);
        gl_FragColor=vec4(clamp((embers+hot+bloom)/max(alpha,.05),0.,1.),alpha);
      }`
  });
  return new T.Mesh(new T.PlaneGeometry(100,100),mat);
}

function navigationLight(T) {
  const s=64, data=new Uint8Array(s*s*4);
  for(let j=0;j<s;j++) for(let i=0;i<s;i++) {
    const d=Math.hypot((i+.5)/s-.5,(j+.5)/s-.5)*2;
    const a=Math.exp(-d*8)+.75*Math.exp(-d*d*75);
    let p=(i+j*s)*4;
    data[p]=255; data[p+1]=255; data[p+2]=255; data[p+3]=Math.min(255,a*255);
  }
  const t=new T.DataTexture(data,s,s);
  t.minFilter=t.magFilter=T.LinearFilter; t.needsUpdate=true; return t;
}

function glow(T, texture, color, size) {
  const s=new T.Sprite(new T.SpriteMaterial({map:texture,color,transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));
  s.scale.setScalar(size); s.renderOrder=3; return s;
}

function station(T, texture, small=false) {
  const object=new T.Group(), wheel=new T.Group();
  const steel=new T.MeshStandardMaterial({color:0x8eafbd,roughness:.68,metalness:.43});
  const carbon=new T.MeshStandardMaterial({color:0x293540,roughness:.58,metalness:.40});
  const solar=new T.MeshStandardMaterial({color:0x263e6c,emissive:0x0b182b,side:T.DoubleSide,roughness:.55,metalness:.2});
  const glass=new T.MeshBasicMaterial({color:small?0xffd097:0xafffe5,toneMapped:false});
  const panelTrim=new T.LineBasicMaterial({color:0x9ba6b4,transparent:true,opacity:.68});
  const hub=new T.Mesh(new T.CylinderGeometry(.82,.93,5.7,12),steel);
  hub.rotation.x=Math.PI/2; object.add(hub);
  const ring=new T.Mesh(new T.TorusGeometry(3.3,.4,8,54),steel);
  wheel.add(ring);
  const collar=new T.Mesh(new T.TorusGeometry(3.3,.075,6,54),glass); collar.position.z=.39; wheel.add(collar);
  const panels=new T.InstancedMesh(new T.BoxGeometry(.37,.19,.13),glass,32);
  const coords=new T.Object3D();
  for(let i=0;i<32;i++) {
    const a=i*TAU/32;
    coords.position.set(3.3*Math.cos(a),3.3*Math.sin(a),.42); coords.rotation.z=a+Math.PI/2;
    coords.updateMatrix();panels.setMatrixAt(i,coords.matrix);
  }
  wheel.add(panels);
  for(let i=0;i<4;i++) {
    const a=i*TAU/4+.25;
    wheel.add(cylinder(T,[0,0,.15],[3.17*Math.cos(a),3.17*Math.sin(a),0],.12,carbon));
  }
  for (const side of [-1,1]) {
    object.add(cylinder(T,[0,.3,-1.4],[side*6,.3,-1.4],.105,steel));
    const b=new T.Mesh(new T.BoxGeometry(3.7,2.3,.12),solar); b.position.set(side*5.5,.3,-1.4);
    object.add(b);
    const pts=[];
    for(let x=-1.8;x<=1.81;x+=.45)pts.push(x,-1.12,.08,x,1.12,.08);
    for(let y=-1.1;y<=1.11;y+=.55)pts.push(-1.82,y,.08,1.82,y,.08);
    const wire=new T.BufferGeometry();wire.setAttribute('position',new T.Float32BufferAttribute(pts,3));
    const grid=new T.LineSegments(wire,panelTrim);grid.position.copy(b.position);object.add(grid);
  }
  const light=glow(T,texture,small?0xffc586:0x68ffe7,3.1);light.position.set(0,0,2.9);object.add(light);
  object.add(wheel);
  object.rotation.set(-.21,.42,small?.56:-.19);
  return {object,wheel,glass,light};
}

function makeBuoy(T, texture) {
  const buoy=new T.Group();
  const dark=new T.MeshStandardMaterial({color:0x557580,metalness:.5,roughness:.54});
  const light=new T.MeshBasicMaterial({color:0x8dffda,toneMapped:false});
  const base=new T.Mesh(new T.OctahedronGeometry(.7),dark);base.scale.y=1.55;buoy.add(base);
  const band=new T.Mesh(new T.TorusGeometry(.48,.06,6,24),light);band.rotation.x=Math.PI/2;buoy.add(band);
  const lamp=glow(T,texture,0x6cffd9,3.2);lamp.position.y=.96;buoy.add(lamp);
  const points=new T.CatmullRomCurve3([new T.Vector3(),new T.Vector3(1.5,-.04,.65),new T.Vector3(2.9,-.09,1.95),new T.Vector3(4,-.12,4.1)]).getPoints(20);
  const trail=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0x57d3bd,transparent:true,opacity:.45}));
  buoy.add(trail);return buoy;
}

function makeWarp(T, random) {
  const a=[];
  for(let i=0;i<420;i++){
    const angle=TAU*random(),dist=.7+Math.pow(random(),.7)*21,z=-2-random()*65;
    const x=Math.cos(angle)*dist,y=Math.sin(angle)*dist;
    a.push(x,y,z,x,y,z-1.6-random()*8);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(a,3));
  const m=new T.LineBasicMaterial({color:0x80f8ed,transparent:true,opacity:0,blending:T.AdditiveBlending,depthTest:false,depthWrite:false});
  const mesh=new T.LineSegments(g,m);mesh.frustumCulled=false;mesh.renderOrder=8;
  return mesh;
}

export function createFlight(canvas, THREE, hooks={}) {
  const T=THREE, random=seeded(0x04c19b);
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.setClearColor(0x030710);
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,1,.1,440);
  camera.rotation.order='YXZ'; scene.add(camera);
  const sky=deepSky(T,random);scene.add(sky.group);
  scene.add(new T.HemisphereLight(0xd3edff,0x2e4055,1.9));
  const key=new T.DirectionalLight(0xffdeb0,3.7);key.position.set(-5,4,9);scene.add(key);
  const edge=new T.DirectionalLight(0x74cbe3,1.65);edge.position.set(4,-2,-3);scene.add(edge);
  const solar=new T.Group(),remote=new T.Group();scene.add(solar,remote);
  const tex=navigationLight(T);
  const probe=makeVoyager(T);probe.position.set(-2.75,.1,-8.6);solar.add(probe);
  const farSun=glow(T,tex,0xffd39d,12);farSun.position.set(-95,18,-130);solar.add(farSun);
  const worm=portal(T),localGate=new T.Vector3(9.4,2.1,-32),remoteGate=new T.Vector3(-1,0,2);
  scene.add(worm);
  const hole=blackHole(T);hole.position.set(-23,5,-67);remote.add(hole);
  const main=station(T,tex),outpost=station(T,tex,true);
  main.object.position.set(17,1,-86);outpost.object.position.set(-8,4,-114);
  outpost.object.scale.setScalar(.72);remote.add(main.object,outpost.object);
  const markers=[[5,-.5,-22],[15,.2,-47],[20,1,-66]].map((xyz,i)=>{
    const b=makeBuoy(T,tex); b.position.set(...xyz);b.rotation.y=i*.45;remote.add(b);return b;
  });
  const relay=makeBuoy(T,tex); relay.position.set(7,1,-18);relay.scale.setScalar(1.3);remote.add(relay);
  const warpLines=makeWarp(T,random);camera.add(warpLines);
  const pos=camera.position, delta=new T.Vector3(), forward=new T.Vector3(), velocity=new T.Vector3(), pull=new T.Vector3(), steer=new T.Vector3();
  const safe=new T.Vector3(), target=new T.Vector3();
  const held=new Set();
  let yaw=0,pitch=0,clock=0,lastStage=null,lastChoice=null,dwell=0,warpTime=0,warpDuration=1.35;
  let sent=null,initialDistance=1,tap=0,dockingIntent=0,oldWidth=0,oldHeight=0,oldDpr=0,disposed=false;
  let lastState={},strength=0,distance=0,ex=0,ey=0,aligned=false;
  function setTarget(stage,choice) {
    if(stage==='scan'||stage==='gate')target.copy(localGate);
    else if(stage==='approach'||stage==='choice')target.copy(main.object.position);
    else if(stage==='deliver')target.copy(choice==='relay'?relay.position:outpost.object.position);
    else if(stage==='return')target.copy(remoteGate);
    else target.copy(probe.position);
  }
  function lookTo(at,offset=0) {
    delta.copy(at).sub(pos);
    if(delta.lengthSq()<.0001)return;
    yaw=Math.atan2(-delta.x,-delta.z)+offset;
    pitch=clamp(Math.asin(delta.y/delta.length()),-1.45,1.45);
  }
  function enter(stage,choice) {
    const old=lastStage;
    lastStage=stage;lastChoice=choice;sent=null;dwell=0;warpTime=0;tap=0;dockingIntent=0;
    warpLines.visible=false;velocity.set(0,0,0);setTarget(stage,choice);
    solar.visible=stage==='scan'||stage==='gate'||stage==='complete';
    remote.visible=!solar.visible;
    if(stage==='scan'||stage==='complete') {
      pos.set(0,0,0);yaw=0;pitch=0;
    } else if(stage==='gate') {
      if(old!=='scan'){pos.set(0,0,0);lookTo(target,.08);}
    } else if(stage==='approach') {
      pos.set(0,0,-4);lookTo(target,.21);
    } else if(stage==='choice') {
      if(old!=='approach')pos.copy(main.object.position).add(new T.Vector3(1,0,8.8));
      lookTo(target);
    } else if(stage==='deliver') {
      if(old!=='choice')pos.copy(main.object.position).add(new T.Vector3(1,0,8.8));
      lookTo(target,.13);
    } else if(stage==='return') {
      if(old!=='deliver'){
        pos.copy(choice==='relay'?relay.position:outpost.object.position);
        pos.z+=choice==='relay'?4:7;
      }
      lookTo(target,-.09);
    }
    worm.position.copy(solar.visible?localGate:remoteGate);
    safe.copy(pos);initialDistance=Math.max(1,pos.distanceTo(target));
  }
  function observeTarget(){
    delta.copy(target).sub(pos);
    distance=delta.length();
    const expectYaw=Math.atan2(-delta.x,-delta.z),expectPitch=Math.asin(clamp(delta.y/Math.max(distance,.001),-1,1));
    ex=directionError(yaw-expectYaw);ey=expectPitch-pitch;
    const error=Math.hypot(ex*Math.cos(pitch),ey);
    strength=clamp(1-error/.95,0,1);
    aligned=error<.13 || distance<.6;
  }
  function event(name) {
    if(sent===name)return;
    sent=name;
    hooks.onEvent?.(name);
  }
  function resize() {
    const w=Math.max(1,Math.round(canvas.clientWidth||canvas.parentElement?.clientWidth||globalThis.innerWidth||1));
    const h=Math.max(1,Math.round(canvas.clientHeight||canvas.parentElement?.clientHeight||globalThis.innerHeight||1));
    const dpr=Math.min(globalThis.devicePixelRatio||1,1.55,Math.max(.75,Math.sqrt(1600000/(w*h))));
    if(w===oldWidth&&h===oldHeight&&dpr===oldDpr)return;
    oldWidth=w;oldHeight=h;oldDpr=dpr;
    renderer.setPixelRatio(dpr);renderer.setSize(w,h,false);
    sky.stars.material.uniforms.pixel.value=dpr;
    camera.aspect=w/h;camera.updateProjectionMatrix();
  }
  function animateModels(stage,choice,phase,open,dt) {
    sky.group.position.copy(pos);sky.group.rotation.y=solar.visible?.22:1.7;
    worm.quaternion.copy(camera.quaternion); hole.quaternion.copy(camera.quaternion);
    worm.material.uniforms.time.value=clock;
    worm.material.uniforms.open.value+=((open?1:0)-worm.material.uniforms.open.value)*Math.min(1,dt*9);
    worm.material.uniforms.strength.value=stage==='scan'?.10+.70*strength**3:1;
    worm.visible=stage!=='complete'||choice==='relay';
    hole.material.uniforms.time.value=clock;
    probe.rotation.z=-.24+.022*Math.sin(clock*.24);
    main.wheel.rotation.z=clock*.035;outpost.wheel.rotation.z=clock*.026;
    const occupied=choice==='people'&&(stage==='return'||stage==='complete');
    outpost.glass.color.setHex(occupied?0xffcf86:0x29383a);
    outpost.light.visible=occupied;
    markers.forEach((b,i)=>{b.position.y=[-.5,.2,1][i]+Math.sin(clock*.55+i)*.26;});
    relay.visible=choice==='relay'&&(stage==='deliver'||stage==='return');
    if(relay.visible)relay.rotation.y=clock*.2;
    const amount=warpTime>0?1-warpTime/warpDuration:0;
    warpLines.visible=warpTime>0&&!lastState.reducedMotion;
    if(warpLines.visible){
      warpLines.material.opacity=Math.sin(Math.PI*amount)**.7*.95;
      warpLines.scale.setScalar(1+amount*2);
    }
    const fov=60+(lastState.reducedMotion?0:(warpTime>0?17*Math.sin(amount*Math.PI):Math.min(4,velocity.length()*.17)));
    if(Math.abs(fov-camera.fov)>.06){camera.fov=fov;camera.updateProjectionMatrix();}
  }
  function travel(dt,thrust,stage) {
    camera.rotation.set(pitch,yaw,0,'YXZ');
    camera.getWorldDirection(forward);
    const max=stage==='gate'?12:23;
    const docking=stage==='gate'||stage==='return';
    const stopAt=docking?2.55:stage==='deliver'&&lastChoice==='relay'?2.7:7.4;
    const limit=Math.min(max,Math.max(2.4,(distance-stopAt)*1.35));
    if(held.has('brake'))velocity.multiplyScalar(Math.exp(-dt*12));
    if(thrust) {
      steer.copy(delta).normalize();
      if(strength>.83)forward.lerp(steer,.32).normalize();
      velocity.lerp(forward.multiplyScalar(limit),1-Math.exp(-dt*4));
    } else velocity.multiplyScalar(Math.exp(-dt*3));
    if(remote.visible&&distance>10){
      pull.copy(hole.position).sub(pos);
      const d=pull.length();
      if(d<55 && d>0.01)velocity.addScaledVector(pull,dt*(1-d/55)*2.9/d);
    }
    if(docking&&distance<=stopAt+.35&&aligned){
      velocity.set(0,0,0);
    }else pos.addScaledVector(velocity,dt);
    if(remote.visible && (pos.distanceTo(hole.position)<12.3 || pos.length()>250)){
      pos.copy(safe);velocity.set(0,0,0);lookTo(target,.06);hooks.onEvent?.('rescue');
    }else if(!remote.visible&&pos.length()>130){
      pos.copy(safe);velocity.set(0,0,0);lookTo(target,.06);hooks.onEvent?.('rescue');
    }
    if(stage==='approach'&&pos.z<-45&&pos.z>-52&&pos.x>5&&pos.x<30)safe.set(15,.2,-47);
  }
  function render(elapsed,state={}) {
    if(disposed)return;
    const dt=clamp(Number.isFinite(elapsed)?elapsed:0,0,.075);
    const stage=state.stage||'scan',choice=state.choice;
    lastState=state;
    if(lastStage!==stage||lastChoice!==choice)enter(stage,choice);
    resize();clock+=dt;
    const phase=(clock%3.6)/3.6;
    const extended=choice==='relay'&&stage==='return';
    const open=phase>=(extended?.42:.48)&&phase<=(extended?.93:.83);
    const pulse=open?1:phase<.09||phase>=.20&&phase<.29?.78:0;
    if(warpTime<=0){
      yaw=directionError(yaw+((held.has('left')?1:0)-(held.has('right')?1:0))*dt*1.45);
      pitch=clamp(pitch+((held.has('up')?1:0)-(held.has('down')?1:0))*dt*1.1,-1.45,1.45);
    }
    const thrust=held.has('thrust')||held.has('action')||tap>0;
    observeTarget();
    if(warpTime>0){
      warpTime=Math.max(0,warpTime-dt);
      if(warpTime===0)event(stage==='gate'?'crossed':'returned');
    } else if(stage==='scan'){
      dwell=aligned?dwell+dt:Math.max(0,dwell-dt*2);
      if(dwell>=.63)event('signal');
    } else if(stage==='gate'||stage==='approach'||stage==='deliver'||stage==='return'){
      travel(dt,thrust,stage);
      observeTarget();
      const isGate=stage==='gate'||stage==='return';
      const dockRadius=isGate?3.35:stage==='deliver'&&choice==='relay'?3.6:8.5;
      const facing=aligned||(!isGate&&strength>.64);
      if(distance<dockRadius&&facing&&thrust)dockingIntent=.85;
      dockingIntent=Math.max(0,dockingIntent-dt);
      if(distance<dockRadius&&facing&&dockingIntent>0&&!sent) {
        if(isGate&&open){warpDuration=state.reducedMotion?.45:1.3;warpTime=warpDuration;velocity.set(0,0,0);}
        else if(!isGate)event(stage==='approach'?'docked':'delivered');
      }
    }
    tap=Math.max(0,tap-dt);
    camera.rotation.set(pitch,yaw,0,'YXZ');
    animateModels(stage,choice,phase,open,dt);
    const progress=stage==='scan'?clamp(dwell/.63,0,1):clamp(1-distance/initialDistance,0,1);
    hooks.onTelemetry?.({strength,pulse,phase,windowOpen:open,aligned,distance,bearingX:clamp(ex/.61,-1,1),bearingY:clamp(ey/.61,-1,1),progress,warping:warpTime>0});
    renderer.render(scene,camera);
  }
  function input(action,pressed) {
    if(pressed){held.add(action);if(action==='action'||action==='thrust')tap=.22;}
    else held.delete(action);
  }
  function drag(dx,dy) {
    if(warpTime>0||disposed)return;
    const sensitivity=2.6/Math.max(350,Math.min(oldWidth||800,oldHeight||600));
    yaw=directionError(yaw-dx*sensitivity);pitch=clamp(pitch-dy*sensitivity,-1.45,1.45);
  }
  function reset() {lastStage=null;lastChoice=null;held.clear();clock=0;tap=0;}
  function dispose() {
    if(disposed)return;
    disposed=true;held.clear();
    const materials=new Set(), geometries=new Set(),textures=new Set();
    scene.traverse(o=>{
      if(o.geometry)geometries.add(o.geometry);
      if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));
      if(o.isInstancedMesh)o.dispose();
    });
    materials.forEach(m=>{if(m.map)textures.add(m.map);m.dispose();});
    textures.forEach(t=>t.dispose());geometries.forEach(g=>g.dispose());renderer.dispose();
  }
  return {render,input,drag,reset,dispose};
}
