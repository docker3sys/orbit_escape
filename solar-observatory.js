// A fictional 920 m listening station. Geometry is built in model units;
// the solar renderer applies its existing kilometres-to-world scale.
export function createSolarObservatory(T) {
  const model = new T.Group();
  const alloy = new T.MeshStandardMaterial({color:0x879cae, roughness:0.55, metalness:0.35, emissive:0x273645, emissiveIntensity:0.6});
  const dark = new T.MeshStandardMaterial({color:0x364b59, roughness:0.65, emissive:0x152735});
  const gold = new T.MeshStandardMaterial({color:0xd3a26d, emissive:0x594024, metalness:0.36, roughness:0.46, side:T.DoubleSide});
  const dishMetal = new T.MeshStandardMaterial({color:0xc7d6ca, emissive:0x526967, emissiveIntensity:0.57, side:T.DoubleSide, roughness:0.72});
  const rib = new T.LineBasicMaterial({color:0x445752});
  const rim = new T.MeshBasicMaterial({color:0xe5ceb1});
  const lamp = new T.MeshBasicMaterial({color:0xffcc82});
  const blue = new T.MeshBasicMaterial({color:0x75e9ea});
  const panelMaterial = new T.MeshStandardMaterial({color:0x245680,emissive:0x102f55,roughness:0.38,metalness:0.33});
  const box = new T.BoxGeometry();
  function block(parent, pos, dims, material) {
    const m=new T.Mesh(box,material);
    m.position.set(...pos);m.scale.set(...dims);
    parent.add(m);
    return m;
  }
  function rod(parent, a, b, width, material) {
    const start=new T.Vector3(...a), end=new T.Vector3(...b), dv=end.clone().sub(start);
    const m=new T.Mesh(new T.CylinderGeometry(width,width,dv.length(),7),material);
    m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dv.normalize());
    m.position.copy(start).add(end).multiplyScalar(0.5);
    parent.add(m);return m;
  }
  function wire(parent, points, material) {
    const g=new T.BufferGeometry().setFromPoints(points.map(point=>new T.Vector3(...point)));
    parent.add(new T.Line(g,material));
  }

  // Twin booms carry tiled solar blankets; the spine and its cross-bracing
  // stay visible in silhouette when the player orbits the station.
  for(const side of [-1,1]){
    rod(model,[side*.85,-.05,0],[side*5.6,-.05,0],.095,alloy);
    for(let i=0;i<3;i++){
      const x=side*(2.48+i*1.37);
      block(model,[x,-.04,-.06],[1.24,2.18,.12],alloy);
      block(model,[x,-.04,.015],[1.16,2.06,.065],panelMaterial);
      block(model,[x,-.04,-.14],[1.16,2.06,.05],panelMaterial);
      for(let j=-2;j<=2;j++){
        block(model,[x,-.04+j*.375,.059],[1.16,.018,.014],alloy);
      }
      block(model,[x,-.04,.063],[.025,2.05,.012],alloy);
    }
    rod(model,[side*.8,-.35,-.17],[side*2.8,-.04,-.02],.04,alloy);
  }
  block(model,[0,-.18,0],[2.45,1.46,1.45],dark);
  for(const x of [-1.04,-.56,-.08,.40,.90]){
    block(model,[x,-.19,.02],[.058,1.53,1.53],alloy);
  }
  block(model,[0,-.69,.70],[2.4,.13,.15],gold);
  const windows=[];
  for(let i=0;i<6;i++)windows.push(block(model,[-.92+i*.365,-.14,.755],[.23,.25,.035],lamp));

  // Telescope bowl opens toward the visitor. The reflector is a true
  // paraboloid with a forward feed horn rather than a flat circular sprite.
  const telescope=new T.Group();
  telescope.position.set(-.54,.83,.03);telescope.rotation.set(-.75,-.29,-.34);
  model.add(telescope);
  const radius=2.04, depth=.76;
  const profile=[];
  for(let i=0;i<19;i++){
    const f=i/18;profile.push(new T.Vector2(radius*f,depth*f*f));
  }
  const dish=new T.Mesh(new T.LatheGeometry(profile,64),dishMetal);
  dish.rotation.x=Math.PI*.5;telescope.add(dish);
  const lip=new T.Mesh(new T.TorusGeometry(radius,.043,8,64),rim);
  lip.position.z=depth;telescope.add(lip);
  for(let i=0;i<20;i++){
    const angle=2*Math.PI*i/20;
    const points=profile.map(p=>[p.x*Math.cos(angle),p.x*Math.sin(angle),p.y+.014]);
    wire(telescope,points,rib);
    if(i%5===0)rod(telescope,points[18],[0,0,1.47],.034,gold);
  }
  for(const fraction of [.45,.72]){
    const ring=new T.Mesh(new T.TorusGeometry(radius*fraction,.015,4,56),alloy);
    ring.position.z=depth*fraction*fraction+.012;telescope.add(ring);
  }
  rod(telescope,[0,0,1.42],[0,0,1.71],.095,gold);
  block(telescope,[0,0,1.73],[.18,.18,.07],blue);
  rod(model,[-.87,.36,-.16],[-.54,1.40,-.36],.16,dark);

  const relay=new T.Group();
  relay.position.set(1.18,0,-.12);model.add(relay);
  for(const sign of [-1,1]){
    rod(relay,[sign*.16,-.15,0],[0,2.91,.12],.037,alloy);
  }
  for(let i=0;i<3;i++){
    const ring=new T.Mesh(new T.TorusGeometry(.35-i*.055,.035,6,32),blue);
    ring.rotation.x=.92;ring.position.set(0,1.78+i*.44,.12);relay.add(ring);
  }
  const relayTip = new T.Mesh(new T.SphereGeometry(.13,10,8),blue);
  relayTip.position.set(0,2.97,.12);relay.add(relayTip);
  const pennant=new T.Mesh(new T.ConeGeometry(.13,.39,12),gold);
  pennant.position.set(-1.11,-1.05,.08);model.add(pennant);
  const setChoice = choice => {
    const occupied = choice === "people";
    for(const window of windows) window.visible=occupied;
    relay.visible=!occupied;
  };
  return {model, setChoice};
}
