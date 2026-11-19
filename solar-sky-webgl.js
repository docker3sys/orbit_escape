import * as THREE from './vendor/three.module.js';
import { skyAtlas, starCatalogue } from './solar-sky.js';

// Clip-space depth is pinned at the far plane. Rotation alone matters for this
// solar-system sky and stays precise even at billion-kilometre camera coordinates.
const rotationOnly = 'vec4 skyClip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); gl_Position = skyClip.xyww;';

export function createStellarSky() {
  const group = new THREE.Group();
  group.name = 'Небо J2000';
  const atlas = new THREE.TextureLoader().load(skyAtlas);
  atlas.flipY = false;
  atlas.minFilter = THREE.LinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.generateMipmaps = false;
  const diffuse = new THREE.ShaderMaterial({
    uniforms: {atlas: {value:atlas}},
    vertexShader: 'varying vec3 direction; void main(){direction=position;' + rotationOnly + '}',
    fragmentShader: `
      uniform sampler2D atlas;
      varying vec3 direction;
      void main() {
        vec3 n = direction, a = abs(n);
        vec2 p, tile;
        if (a.x >= a.y && a.x >= a.z) {
          p = vec2(n.x >= 0.0 ? -n.z : n.z, -n.y) / a.x;
          tile = vec2(n.x >= 0.0 ? 0.0 : 1.0,0.0);
        } else if (a.y >= a.z) {
          p = vec2(n.x, n.y >= 0.0 ? n.z : -n.z) / a.y;
          tile = n.y >= 0.0 ? vec2(2.0,0.0) : vec2(0.0,1.0);
        } else {
          p = vec2(n.z >= 0.0 ? n.x : -n.x, -n.y) / a.z;
          tile = vec2(n.z >= 0.0 ? 1.0 : 2.0,1.0);
        }
        vec2 faceUv = clamp(.5 + .5*p, vec2(.5/384.0), vec2(1.0-.5/384.0));
        gl_FragColor = vec4(texture2D(atlas,(tile+faceUv)/vec2(3.0,2.0)).rgb,1.0);
      }`,
    transparent:true, depthTest:true, depthWrite:false, toneMapped:false, side:THREE.BackSide,
  });
  // The rest of the scene's disposal path handles ordinary map properties.
  diffuse.addEventListener('dispose', () => atlas.dispose());
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1,32,24),diffuse);
  dome.frustumCulled = false;
  dome.renderOrder = -102;
  group.add(dome);

  const stars = starCatalogue();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(stars.position,3));
  geometry.setAttribute('stellarColor',new THREE.BufferAttribute(stars.color,3));
  geometry.setAttribute('diameter',new THREE.BufferAttribute(stars.diameter,1));
  const material = new THREE.ShaderMaterial({
    uniforms:{pixelsPerCss:{value:1}},
    vertexShader:`
      uniform float pixelsPerCss;
      attribute vec3 stellarColor;
      attribute float diameter;
      varying vec3 tint;
      void main() {
        tint=stellarColor;
        ${rotationOnly}
        gl_PointSize=diameter*pixelsPerCss;
      }`,
    fragmentShader:`
      varying vec3 tint;
      void main() {
        vec2 delta = gl_PointCoord * 2.0 - 1.0;
        float q = dot(delta,delta);
        if (q >= 1.0) discard;
        float spread = .85*exp(-7.4*q)+.15*exp(-2.35*q);
        gl_FragColor=vec4(tint,spread);
      }`,
    transparent:true, depthTest:true, depthWrite:false, toneMapped:false,
  });
  const field = new THREE.Points(geometry,material);
  field.frustumCulled = false;
  field.renderOrder = -101;
  field.onBeforeRender = renderer => {
    const surface=renderer.domElement;
    material.uniforms.pixelsPerCss.value=surface.height / Math.max(1,surface.clientHeight);
  };
  group.add(field);
  return group;
}
