import * as THREE from "./vendor/three.module.js";

export const planetImages = {
  sun: "./assets/textures/sun.jpg",
  mercury: "./assets/textures/mercury.jpg",
  venus: "./assets/textures/venus.jpg",
  earth: "./assets/textures/earth.jpg",
  moon: "./assets/textures/moon.jpg",
  mars: "./assets/textures/mars.jpg",
  jupiter: "./assets/textures/jupiter.jpg",
  saturn: "./assets/textures/saturn.jpg",
  uranus: "./assets/textures/uranus.jpg",
  neptune: "./assets/textures/neptune.jpg",
};
const detailImages = {
  sun: "./assets/planet-detail/sun.webp",
  mercury: "./assets/planet-detail/mercury.webp",
  venus: "./assets/planet-detail/venus.webp",
  earth: "./assets/planet-detail/earth.webp",
  moon: "./assets/planet-detail/moon.webp",
  mars: "./assets/planet-detail/mars.webp",
  jupiter: "./assets/planet-detail/jupiter.webp",
  saturn: "./assets/planet-detail/saturn.webp",
  uranus: "./assets/planet-detail/uranus.webp",
  neptune: "./assets/planet-detail/neptune.webp",
};
export const cloudImage = "./assets/textures/earth-clouds.jpg";
export const ringImage = "./assets/saturn-ring.png";
const lightsImage = "./assets/textures/earth-lights.jpg";
const reliefImage = "./assets/textures/moon-normal.jpg";

// Both planetary shaders use unit-radius coordinates for illumination, including at outer-planet distances.
const vertex = `
  uniform vec3 sunlight;
  uniform float bodyRadius;
  varying vec3 lightLocal;
  varying vec3 eyeLocal;
  varying vec3 bodyPoint;
  varying vec2 surfaceUv;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec3 lightView = normalize(mat3(viewMatrix) * sunlight);
    vec3 ex = normalize(normalMatrix[0]), ey = normalize(normalMatrix[1]), ez = normalize(normalMatrix[2]);
    lightLocal = vec3(dot(ex,lightView), dot(ey,lightView), dot(ez,lightView));
    eyeLocal = vec3(dot(ex,-mvPosition.xyz), dot(ey,-mvPosition.xyz), dot(ez,-mvPosition.xyz)) / bodyRadius;
    bodyPoint = position / bodyRadius;
    surfaceUv = uv;
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
  }`;
const common = `
  varying vec3 lightLocal;
  varying vec3 eyeLocal;
  varying vec3 bodyPoint;
  varying vec2 surfaceUv;
  #include <common>
  #include <logdepthbuf_pars_fragment>
`;
const surfaceFragment = common + `
  uniform sampler2D albedo;
  #ifdef EARTH
    uniform sampler2D clouds;
    uniform sampler2D lights;
    uniform float cloudDrift;
  #endif
  #ifdef LUNAR
    uniform sampler2D relief;
  #endif
  #ifdef RINGS
    uniform sampler2D ring;
  #endif
  void main() {
    #include <logdepthbuf_fragment>
    vec3 pos = normalize(bodyPoint);
    vec3 n = pos;
    vec3 L = normalize(lightLocal);
    vec3 V = normalize(eyeLocal);
    vec3 base = texture2D(albedo,surfaceUv).rgb;
    #if defined(EARTH) || defined(LUNAR)
      vec3 east = normalize(vec3(pos.z + 0.000001,0.0,-pos.x));
      vec3 north = cross(pos,east);
    #endif
    #ifdef LUNAR
      vec3 normalSample = texture2D(relief,surfaceUv).rgb*2.0-1.0;
      n = normalize(east*normalSample.x+north*normalSample.y+pos*normalSample.z);
    #endif
    float sun = dot(n,L);
    float cosLight = max(sun,0.0);
    float shade = 1.0;
    #ifdef RINGS
      if (abs(L.y)>0.012) {
        float t = -pos.y/L.y;
        float r = length(pos.xz+t*L.xz);
        float ringUV = (r-1.24)/(2.30-1.24);
        if (t>0.0 && ringUV>0.0 && ringUV<1.0) shade -= .81*texture2D(ring,vec2(ringUV,.5)).a;
      }
    #endif
    // Starlight alone leaves the night hemisphere almost black.
    vec3 color = base*(vec3(.009,.012,.018)+1.25*cosLight*shade);
    #ifdef EARTH
      vec2 uvCloud = vec2(fract(surfaceUv.x+cloudDrift),surfaceUv.y);
      float mist = texture2D(clouds,uvCloud).r;
      vec2 shadowShift = vec2(dot(L,east)*.004/max(.22,length(pos.xz)),dot(L,north)*.008);
      float shadow = texture2D(clouds,uvCloud+shadowShift).r;
      color *= 1.0-shadow*.28*smoothstep(.0,.30,cosLight);
      float sea = smoothstep(.07,.42,(base.b-base.r)/max(.025,base.b));
      float glint = pow(max(dot(n,normalize(V+L)),0.0),66.0)*sea*cosLight;
      color += vec3(.72,.77,.8)*glint*.95;
      float limb = pow(1.0-clamp(dot(n,V),0.0,1.0),4.0);
      color = mix(color,vec3(.77,.83,.90)*(.009+1.25*cosLight),clamp(mist*1.14,0.,.94));
      float night = texture2D(lights,surfaceUv).r;
      color += vec3(1.0,.63,.26)*night*(1.0-smoothstep(-.24,.04,sun))*(1.0-.78*mist)*.63;
      color += vec3(.07,.19,.32)*limb*smoothstep(-.12,.75,sun);
    #endif
    #ifdef STELLAR
      float granules = dot(base,vec3(.55,.39,.06));
      float edge = .51+.49*sqrt(max(dot(n,V),0.0));
      color = vec3(1.6,1.26,.88)*(.35+granules*2.6)*edge;
    #endif
    gl_FragColor = vec4(color,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const ringFragment = common + `
  uniform sampler2D ring;
  uniform float innerEdge;
  uniform float outerEdge;
  void main() {
    #include <logdepthbuf_fragment>
    float r = length(bodyPoint.xz);
    vec4 ice = texture2D(ring,vec2(clamp((r-innerEdge)/(outerEdge-innerEdge),0.,1.),.5));
    if(ice.a<.025) discard;
    vec3 L = normalize(lightLocal);
    float z = dot(bodyPoint,L);
    float rayDistance = dot(bodyPoint,bodyPoint)-z*z;
    float lit = z < 0. ? smoothstep(.95,1.06,rayDistance) : 1.0;
    float grazing = abs(L.y);
    float forwardScatter = pow(max(-dot(normalize(eyeLocal),L),0.),4.);
    vec3 color = ice.rgb*(.10+lit*(.93+.65*grazing+forwardScatter*.30));
    gl_FragColor = vec4(color,ice.a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function solid(color,colorSpace) {
  const tex = new THREE.DataTexture(new Uint8Array(color),1,1);
  tex.colorSpace = colorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Keep compact maps for all destinations, and at most one decoded high-resolution surface.
// If a pilot jumps again mid-decode, ignore stale callbacks and release their GPU object.
export function createPlanetSurfaces(renderer, resolveAsset = url => url) {
  const loader = new THREE.TextureLoader();
  const bodies = new Map();
  const aux = new Map();
  const aniso = Math.min(4,renderer.capabilities.getMaxAnisotropy());
  const placeholder = solid([105,111,120,255],THREE.SRGBColorSpace);
  let disposed = false;
  let active = null;
  let elapsed = 0;
  const point = new THREE.Vector3();

  function load(url,colorSpace,done,failed) {
    const texture = loader.load(resolveAsset(url),() => {
      if (disposed) texture.dispose(); else done(texture);
    },undefined,() => {
      texture.dispose();
      failed?.();
    });
    texture.colorSpace = colorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = aniso;
  }
  function extra(url,fallback,colorSpace=THREE.NoColorSpace) {
    if (!aux.has(url)) {
      const seed = solid(fallback,colorSpace);
      const uniform = {value:seed};
      aux.set(url,uniform);
      load(url,colorSpace,tex => {uniform.value=tex;seed.dispose();});
    }
    return aux.get(url);
  }
  function create(key,radius,sunlight) {
    const uniform = {value:placeholder};
    const uniforms = {albedo:uniform,bodyRadius:{value:radius},sunlight:{value:sunlight}};
    const defines = {};
    if (key==="sun") defines.STELLAR=1;
    if (key==="earth") {
      defines.EARTH=1;
      uniforms.clouds = extra(cloudImage,[0,0,0,255]);
      uniforms.lights = extra(lightsImage,[0,0,0,255]);
      uniforms.cloudDrift = {value:0};
    }
    if (key==="moon") { defines.LUNAR=1; uniforms.relief=extra(reliefImage,[128,128,255,255]); }
    if (key==="saturn") { defines.RINGS=1; uniforms.ring=extra(ringImage,[0,0,0,0],THREE.SRGBColorSpace); }
    const mat = new THREE.ShaderMaterial({uniforms,defines,vertexShader:vertex,fragmentShader:surfaceFragment});
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius,64,40),mat);
    const entry = {mesh,radius,key,uniform,low:placeholder,high:null,failed:false};
    bodies.set(key,entry);
    load(planetImages[key],THREE.SRGBColorSpace,tex => {
      entry.low=tex;
      if (!entry.high) uniform.value=tex;
    });
    return mesh;
  }
  function choose(next) {
    if (active?.entry===next || (!active && !next)) return;
    if (active) {
      const old = active.entry;
      old.uniform.value=old.low;
      old.high?.dispose();
      old.high=null;
    }
    active=null;
    if (!next) return;
    const request={entry:next};
    active=request;
    load(detailImages[next.key],THREE.SRGBColorSpace,texture => {
      if (active!==request) {texture.dispose();return;}
      next.uniform.value=texture;
      next.high=texture;
    },() => {next.failed=true;});
  }
  function update(dt,cameraPos,profile) {
    elapsed+=dt;
    const cloud = bodies.get("earth");
    if (cloud) cloud.mesh.material.uniforms.cloudDrift.value += dt*.000026;
    if(elapsed<.35) return;
    elapsed=0;
    let nearest=null,ratio=0.058;
    if (profile!=="low" && renderer.capabilities.maxTextureSize>=2048) {
      for (const entry of bodies.values()) {
        const distance = cameraPos.distanceTo(entry.mesh.getWorldPosition(point));
        const angular = entry.radius/Math.max(1,distance);
        if (!entry.failed && angular>ratio) {nearest=entry;ratio=angular;}
      }
    }
    choose(nearest);
  }
  function rings(spec,sunlight) {
    const isThin = spec.rings==="thin";
    const innerEdge=isThin?1.55:1.24, outerEdge=isThin?1.87:2.30;
    const geom=new THREE.RingGeometry(spec.radius*innerEdge,spec.radius*outerEdge,144,1);
    geom.rotateX(-Math.PI/2);
    if (isThin) {
      const uv=geom.attributes.uv,p=geom.attributes.position;
      for(let i=0;i<uv.count;i++) uv.setXY(i,(Math.hypot(p.getX(i),p.getZ(i))/spec.radius-innerEdge)/(outerEdge-innerEdge),.5);
      // Uranus has several narrow occulting rings rather than Saturn's broad icy disc.
      const bands=new Uint8Array(128*4);
      for(const [i,a] of [[4,38],[31,47],[41,65],[60,50],[92,91],[117,125],[118,92]]) bands.set([146,154,157,a],i*4);
      const texture=new THREE.DataTexture(bands,128,1);
      texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
      return new THREE.Mesh(geom,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,transparent:true,depthWrite:false}));
    }
    const material = new THREE.ShaderMaterial({
      uniforms:{bodyRadius:{value:spec.radius},sunlight:{value:sunlight},innerEdge:{value:innerEdge},outerEdge:{value:outerEdge},
        ring:extra(ringImage,[0,0,0,0],THREE.SRGBColorSpace)},
      vertexShader:vertex,fragmentShader:ringFragment,side:THREE.DoubleSide,transparent:true,depthWrite:false,
    });
    material.forceSinglePass=true;
    return new THREE.Mesh(geom,material);
  }
  function dispose() {
    disposed=true;
    choose(null);
    for (const entry of bodies.values()) if (entry.low!==placeholder) entry.low.dispose();
    for (const uniform of aux.values()) uniform.value.dispose();
    placeholder.dispose();
    bodies.clear();
    aux.clear();
  }
  return {create,rings,update,dispose,releaseDetail:()=>choose(null)};
}
