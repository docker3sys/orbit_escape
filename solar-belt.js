import { elements } from './solar-belt-catalog.js';
import { idaShape } from './solar-ida-shape.js';

const AU = 149597870.7, DAY = 86400000, DEG = Math.PI / 180;
const EPOCH = (2461200.5 - 2440587.5) * DAY;
export const IDA_RADIUS = 31;
export const IDA_APPROACH = 103;
export const idaTexture = './assets/ida-surface.jpg';
const orbitRate = .9856076686 * DEG;
let catalogue, shape;
function makeOrbit(id,a,e,i,node,peri,m,diameter) {
  const c=Math.cos(node),s=Math.sin(node),ci=Math.cos(i),si=Math.sin(i),w=Math.cos(peri),v=Math.sin(peri);
  // Rotate the two perifocal unit vectors straight into the game's right-handed frame.
  return {id,radius:diameter*.5,a:a*AU,e,m,n:orbitRate/Math.pow(a,1.5),b:Math.sqrt(1-e*e),
    x:[c*w-s*v*ci,v*si,-(s*w+c*v*ci)],y:[-c*v-s*w*ci,w*si,s*v-c*w*ci]};
}
function orbits() {
  if (catalogue) return catalogue;
  const raw=atob(elements), data=[];
  const u=i=>raw.charCodeAt(i)+raw.charCodeAt(i+1)*256;
  for(let p=0;p<raw.length;p+=16){
    const id=u(p);
    data.push(id===243?makeOrbit(id,2.863348031699649,.04610962795708528,1.130363094271507*DEG,323.5366609419851*DEG,113.2571826848795*DEG,49.64769088009876*DEG,32):
      makeOrbit(id,u(p+2)*.0001,u(p+4)*.0001,u(p+6)*.01*DEG,u(p+8)*.01*DEG,u(p+10)*.01*DEG,u(p+12)*.01*DEG,u(p+14)*.1));
  }
  catalogue=data;
  return data;
}
function propagate(orbit,days,positions,offset) {
  const mean=(orbit.m+days*orbit.n)%(Math.PI*2);
  let E=mean;
  for(let k=0;k<4;k++) E-=(E-orbit.e*Math.sin(E)-mean)/(1-orbit.e*Math.cos(E));
  const p=orbit.a*(Math.cos(E)-orbit.e),q=orbit.a*orbit.b*Math.sin(E);
  for(let k=0;k<3;k++)positions[offset+k]=orbit.x[k]*p+orbit.y[k]*q;
}
export function createBeltField(time=Date.now()) {
  const records=orbits(),primary=records.find(r=>r.id===243), coords=new Float64Array(records.length*3);
  const ida=[0,0,0], dactyl=[0,0,0], local=[];
  let previousTime=null, coarseTime=-Infinity, searchTime=-Infinity;
  const field={ida,dactyl,local,records,coords,spin:0,update};
  function update(now,eye) {
    const days=(now-EPOCH)/DAY;
    const follows=eye&&previousTime!==null&&Math.hypot(eye[0]-ida[0],eye[1]-ida[1],eye[2]-ida[2])<7000;
    const x=ida[0],y=ida[1],z=ida[2];
    propagate(primary,days,ida,0);
    if(follows){eye[0]+=ida[0]-x;eye[1]+=ida[1]-y;eye[2]+=ida[2]-z;}
    previousTime=now;
    // Dactyl's full orbit is unconstrained; this is an illustrative bound orbit at its observed scale.
    const phase=days*2*Math.PI/(1.54), sep=92;
    dactyl[0]=ida[0]+sep*Math.cos(phase);dactyl[1]=ida[1]+sep*.16*Math.sin(phase);dactyl[2]=ida[2]+sep*.987*Math.sin(phase);
    field.spin=days*2*Math.PI/(4.633/24)%(2*Math.PI);
    if(Math.abs(now-coarseTime)>=600000){
      for(let i=0;i<records.length;i++)propagate(records[i],days,coords,3*i);
      coarseTime=now;
    }
    if(!eye)return;
    if(Math.abs(now-searchTime)>=300){
      local.length=0;
      for(let i=0;i<records.length;i++){
        const r=records[i];if(r===primary)continue;
        const j=3*i,dx=coords[j]-eye[0],dy=coords[j+1]-eye[1],dz=coords[j+2]-eye[2];
        const range=r.radius*70000+15000;
        if(dx*dx+dy*dy+dz*dz<range*range)local.push(i);
      }
      local.sort((a,b)=>records[b].radius-records[a].radius);local.length=Math.min(24,local.length);searchTime=now;
    }
    for(const i of local)propagate(records[i],days,coords,i*3);
  }
  update(time,null);return field;
}

export function getIdaShape() {
  if(shape)return shape;
  const raw=atob(idaShape), positions=new Float32Array(raw.length/2),uv=new Float32Array(46*24*2), indices=[];
  for(let i=0;i<positions.length;i++){
    const n=raw.charCodeAt(2*i)+raw.charCodeAt(2*i+1)*256;
    positions[i]=(n<32768?n:n-65536)/512;
  }
  function face(a,b,c){
    const i=a*3,j=b*3,k=c*3;
    const ax=positions[j]-positions[i],ay=positions[j+1]-positions[i+1],az=positions[j+2]-positions[i+2];
    const bx=positions[k]-positions[i],by=positions[k+1]-positions[i+1],bz=positions[k+2]-positions[i+2];
    const sign=positions[i]*(ay*bz-az*by)+positions[i+1]*(az*bx-ax*bz)+positions[i+2]*(ax*by-ay*bx);
    if(Math.abs(sign)>.001)indices.push(a,sign>0?b:c,sign>0?c:b);
  }
  for(let y=0;y<24;y++)for(let x=0;x<46;x++){
    const i=y*46+x;uv[i*2]=x/45;uv[i*2+1]=1-y/23;
    if(x<45&&y<23){face(i,i+1,i+46);face(i+1,i+47,i+46);}
  }
  shape={positions,uv,indices:new Uint16Array(indices)};return shape;
}

export function buildBeltScene(THREE,world) {
  const field=createBeltField(), geomData=getIdaShape(), geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(geomData.positions,3));
  geometry.setAttribute('uv',new THREE.BufferAttribute(geomData.uv,2));
  geometry.setIndex(new THREE.BufferAttribute(geomData.indices,1));geometry.computeVertexNormals();
  const texture=new THREE.TextureLoader().load(idaTexture);texture.colorSpace=THREE.SRGBColorSpace;
  const primary=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:texture,roughness:1,metalness:0}));
  const dactyl=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:0x9e9891,roughness:1}));
  dactyl.scale.set(.80,.65,.60);
  primary.name='243 Ида';primary.userData.trueRadius=IDA_RADIUS;primary.userData.frameExtent=IDA_RADIUS;primary.userData.approachDistance=IDA_APPROACH;
  primary.userData.approachVector=new THREE.Vector3();
  world.add(primary,dactyl);
  const eye=[0,0,0];
  const pebbleGeometry=new THREE.IcosahedronGeometry(1,1), pebbleMaterial=new THREE.MeshStandardMaterial({color:0xaca299,roughness:1});
  const pebbles=[];
  function step(now,cameraPosition){
    if(cameraPosition){eye[0]=cameraPosition.x;eye[1]=cameraPosition.y;eye[2]=cameraPosition.z;}
    field.update(now,cameraPosition?eye:null);
    if(cameraPosition)cameraPosition.fromArray(eye);
    primary.position.fromArray(field.ida);primary.rotation.y=field.spin;
    primary.userData.approachVector.copy(primary.position).normalize().negate();
    primary.userData.approachVector.y+=.42;primary.userData.approachVector.normalize();
    dactyl.position.fromArray(field.dactyl);
    for(let j=0;j<field.local.length;j++){
      const index=field.local[j],record=field.records[index];
      if(!pebbles[j]){pebbles[j]=new THREE.Mesh(pebbleGeometry,pebbleMaterial);world.add(pebbles[j]);}
      const mesh=pebbles[j];mesh.visible=true;mesh.position.fromArray(field.coords,3*index);
      mesh.rotation.set(record.m,record.e,record.m*.53);mesh.scale.set(record.radius*1.08,record.radius*.87,record.radius);
    }
    for(let j=field.local.length;j<pebbles.length;j++)pebbles[j].visible=false;
  }
  step(Date.now(),null);return {primary,step};
}
