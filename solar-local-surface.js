import * as THREE from './vendor/three.module.js';

// Only the spherical cap between the sub-observer point and the limb is visible.
// Its local origin is directly below the hull. Metre-scale vertex positions never
// subtract Neptune's heliocentric coordinates or even the planet's own radius on GPU.
export function capGeometry(rings, segments) {
  const coords = [0,0,0], indices = [];
  for (let row=1; row<=rings; row++) {
    const r=(row/rings)**1.5;
    for(let col=0;col<segments;col++) {
      const a=col*2*Math.PI/segments;
      coords.push(Math.cos(a)*r,Math.sin(a)*r,0);
      const i=1+(row-1)*segments+col, j=1+(row-1)*segments+(col+1)%segments;
      if(row===1) indices.push(0,i,j);
      else indices.push(i-segments,i,j,j,j-segments,i-segments);
    }
  }
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
  geom.setIndex(indices);
  return geom;
}

export const capVertex=`
  uniform vec3 sunlight, radial, tangent, bitangent;
  uniform float bodyRadius, capAngle, heightKm;
  uniform sampler2D ground;
  float reliefHeight(vec2 km) {
    #if defined(EARTH) || defined(STELLAR) || defined(WEATHER)
      return 0.;
    #else
      return texture2D(ground,km/64.).a*.36 + texture2D(ground,km/2.).a*.010;
    #endif
  }
  uniform vec2 materialOrigin;
  uniform vec3 materialU, materialV;
  varying vec3 lightLocal,eyeLocal,bodyPoint;
  varying vec2 surfaceUv, localKm;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    float r=length(position.xy), theta=r*capAngle;
    vec3 along=(position.x*tangent+position.y*bitangent)/max(r,1e-8);
    vec3 delta=bodyRadius*(along*sin(theta)-radial*(2.*pow(sin(.5*theta),2.)));
    localKm=materialOrigin+vec2(dot(materialU,delta),dot(materialV,delta));
    // Keep the hull's subpoint on the local datum, preserving the measured clearance.
    // The same fixed relief field drives the surrounding rocky hills all the way to the limb.
    float rise=(reliefHeight(localKm)-reliefHeight(materialOrigin))*(1.-smoothstep(.015,.2,heightKm/bodyRadius));
    delta+=radial*rise;
    bodyPoint=radial+delta/bodyRadius;
    surfaceUv=vec2(0.);
    vec4 mvPosition=modelViewMatrix*vec4(delta,1.);
    vec3 L=normalize(mat3(viewMatrix)*sunlight);
    mat3 orientation=mat3(normalize(normalMatrix[0]),normalize(normalMatrix[1]),normalize(normalMatrix[2]));
    lightLocal=L*orientation;
    eyeLocal=(-mvPosition.xyz)*orientation;
    gl_Position=projectionMatrix*mvPosition;
    #include <logdepthbuf_vertex>
  }`;

const axisX=new THREE.Vector3(1,0,0),axisY=new THREE.Vector3(0,1,0),axisZ=new THREE.Vector3(0,0,1);
const radial=new THREE.Vector3(), localCamera=new THREE.Vector3();
export function positionCap(cap, body, cameraPos, radius) {
  body.updateWorldMatrix(true,false);
  localCamera.copy(cameraPos);
  body.worldToLocal(localCamera);
  const distance=localCamera.length(), altitude=Math.max(.0001,distance-radius);
  const u=cap.material.uniforms;
  radial.copy(localCamera).multiplyScalar(1/distance);
  cap.position.copy(radial).multiplyScalar(radius);
  u.radial.value.copy(radial);
  u.tangent.value.crossVectors(Math.abs(radial.y)>.9 ? axisX : axisY,radial).normalize();
  u.bitangent.value.crossVectors(radial,u.tangent.value);
  u.capAngle.value=Math.atan2(Math.sqrt(altitude*(2*radius+altitude)),radius)*1.07+.00001;
  u.heightKm.value=altitude;
  // A body-fixed planar projection. The CPU reduces the origin modulo the widest
  // material repeat before it reaches the GPU; pinprick detail stays put while moving.
  const a=Math.abs(radial.x), b=Math.abs(radial.y), c=Math.abs(radial.z);
  u.materialU.value.copy(a>b && a>c ? axisZ : axisX);
  u.materialV.value.copy(b>a && b>c ? axisZ : axisY);
  u.materialOrigin.value.set(cap.position.dot(u.materialU.value)%64,cap.position.dot(u.materialV.value)%64);
}

// A thin, daylight-dependent sky at terrestrial altitudes. Far depth blends it over
// starlight, while the opaque ground and other foreground objects retain their depth.
export function earthSky() {
  const uniform={cameraRight:{value:new THREE.Vector3()},cameraUp:{value:new THREE.Vector3()},
    forward:{value:new THREE.Vector3()},zenith:{value:new THREE.Vector3()},sunlight:{value:new THREE.Vector3()},
    tangentView:{value:new THREE.Vector2()},density:{value:0},radius:{value:1},heightKm:{value:0},scaleHeight:{value:8.5},skyTint:{value:new THREE.Vector3()}};
  const material=new THREE.ShaderMaterial({uniforms:uniform,transparent:true,depthWrite:false,depthTest:true,
    vertexShader:`varying vec2 coord;void main(){coord=position.xy;gl_Position=vec4(coord,.9999999,1.);}`,
    fragmentShader:`varying vec2 coord;uniform vec3 cameraRight,cameraUp,forward,zenith,sunlight;uniform vec2 tangentView;uniform float density,radius,heightKm,scaleHeight;uniform vec3 skyTint;
    void main(){vec3 ray=normalize(forward+coord.x*tangentView.x*cameraRight+coord.y*tangentView.y*cameraUp);
      float elevation=dot(ray,zenith),sunHeight=dot(sunlight,zenith),scatter=smoothstep(-.16,.22,sunHeight);
      float path=1.-exp(-density/(.15+max(elevation,0.)));
      float horizonBand=0.;
      if(elevation<0.) {
        float h=(radius+heightKm)*sqrt(max(0.,1.-elevation*elevation))-radius;
        horizonBand=1.-exp(-sqrt(radius/scaleHeight)*.67*exp(-max(0.,h)/scaleHeight));
        path=max(path,horizonBand);
      }
      float haze=pow(1.-max(elevation,0.),4.),aureole=pow(max(dot(ray,sunlight),0.),18.);
      vec3 sky=mix(skyTint,mix(skyTint,vec3(.9,.9,.88),.55),haze)+aureole*vec3(.25,.19,.10);
      sky=mix(sky,vec3(.87,.29,.10), (1.-smoothstep(-.05,.3,sunHeight))*(.2+.58*haze));
      sky=mix(sky,skyTint*1.35,horizonBand*smoothstep(scaleHeight*3.,scaleHeight*14.,heightKm)*.76);
      gl_FragColor=vec4(sky,path*scatter);}`});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);
  mesh.frustumCulled=false;mesh.renderOrder=-70;mesh.visible=false;
  return mesh;
}

export function setEarthSky(sky,earth,camera,height,center,air) {
  sky.visible=height<earth.userData.trueRadius*.22 && height>=0;
  if(!sky.visible) return;
  const u=sky.material.uniforms;
  u.zenith.value.copy(camera.position).sub(center).normalize();
  u.sunlight.value.copy(earth.material.uniforms.sunlight.value).normalize();
  u.cameraRight.value.set(1,0,0).applyQuaternion(camera.quaternion);
  u.cameraUp.value.set(0,1,0).applyQuaternion(camera.quaternion);
  camera.getWorldDirection(u.forward.value);
  const t=Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()*.5));
  u.tangentView.value.set(t*camera.aspect,t);
  u.density.value=7.5*Math.exp(-height/air[3]);
  u.heightKm.value=height;u.radius.value=earth.userData.trueRadius;u.scaleHeight.value=air[3];
  u.skyTint.value.set(air[0],air[1],air[2]);
}
