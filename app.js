import { createGameRenderer } from "./game-renderer.js";
import { createRenderBudget } from "./mobile-quality.js";
import { createOrbitalClock, worldCoordinates, orbitPaths } from "./solar-system-clock.js";
import { getSolarEphemeris } from "./solar-ephemeris.js";
import { planetSpecs as planetCatalog, spacecraftSpecs, galacticDirection } from "./solar-catalog.js";
import * as THREE from "./vendor/three.module.js";
import { SHIP_LENGTH_KM, HULL_CLEARANCE_KM, arrivalRangeKm, approachSpeedLimit, greenwichSiderealAngle } from './solar-scale.js';
import { createPlanetSurfaces } from "./planet-surface.js";
import { buildBeltScene } from "./solar-belt.js";
import { createSolarObservatory } from "./solar-observatory.js";
import { createStellarSky } from "./solar-sky-webgl.js";
import { createSolarTouch } from "./solar-touch.js";

const canvas = document.querySelector("#space");
const launchPanel = document.querySelector("#launchPanel");
const launchButton = document.querySelector("#launchButton");
const speedReadout = document.querySelector("#speedReadout");
const targetReadout = document.querySelector("#targetReadout");
const distanceReadout = document.querySelector("#distanceReadout");
const targetList = document.querySelector("#targetList");
const orbitToggle = document.querySelector("#orbitToggle");
const labelsToggle = document.querySelector("#labelsToggle");
const jumpButton = document.querySelector("#jumpButton");
const labelsRoot = document.querySelector("#labels");

const renderBudget = createRenderBudget();
const inputListeners = new AbortController();
const renderer = createGameRenderer(THREE,{
  canvas,
  antialias: renderBudget.profile() !== "low",
  logarithmicDepthBuffer: true,
  powerPreference: "default",
});

renderer.setDrawingBufferSize(innerWidth, innerHeight, renderBudget.pixelRatio(innerWidth, innerHeight));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
const surfaces = createPlanetSurfaces(renderer, undefined, {closeFlight:true});

const scene = new THREE.Scene();
scene.add(surfaces.sky);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 1e-7, 2e19);
camera.position.set(0, 9, 126);
let framingAspect = 0, framingFactor = 0;

const clock = new THREE.Clock();
let solarActive = false;
let solarFrame = 0;
let retired = false;
let nextHud = 0;
const keys = new Set();
const compactSolar = matchMedia("(pointer: coarse), (max-width: 760px)");
const routeButton = document.querySelector("#solarRoute");
const routePanel = document.querySelector("#solarRoutePanel");
const touchJump = document.querySelector("#solarJump");
const touchHint = document.querySelector("#solarTouchHint");
const arrival = document.querySelector("#solarArrival");
const touchVelocity = new THREE.Vector3();
let solarTouch;
let routeOpen = false;
let jumpCount = 0;
let arrivalTimer;
let hintTimer;
let showTouchHint = true;

const world = new THREE.Group();
scene.add(world);

const spinningObjects = [];
const labelEntries = [];
const orbitLines = [];
const targetButtons = new Map();
const targetObjects = [];

let selectedTarget = null;
let labelsVisible = false;
let orbitsVisible = false;
let yaw = 0;
let pitch = 0;
let roll = 0;
let velocity = new THREE.Vector3();
let renderProbeDone = !new URLSearchParams(location.search).has("render-probe");
let superCruise = false;

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const tempVec = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();
const tempQuat = new THREE.Quaternion();
const flightFrame = new THREE.Quaternion();
const frameInverse = new THREE.Quaternion();
const horizonMatrix = new THREE.Matrix4();
const horizonDirection = new THREE.Vector3();
const fixedCenter = new THREE.Vector3();
const fixedEye = new THREE.Vector3();
const priorSpin = new THREE.Quaternion(), spinDifference = new THREE.Quaternion();
const tempEuler = new THREE.Euler(0, 0, 0, "YXZ");

const AU_KM = 149_597_870.7;
const AU_TO_UNITS = AU_KM;
const KM_TO_UNITS = AU_TO_UNITS / AU_KM;
const METERS_TO_UNITS = KM_TO_UNITS / 1000;
const SUN_RADIUS_KM = 695_700;
const LIGHT_SPEED_KM_S = 299_792.458;
const LY_KM = 9_460_730_472_580.8;

const FORWARD_CRUISE_MULTIPLIER = 30;
const MILKY_WAY_RADIUS_LY = 52_850;
const SUN_TO_GALACTIC_CENTER_LY = 26_660;
const orbitalClock = createOrbitalClock();
const orbitalObjects = [];
const clockEye = [0,0,0];
let beltScene;
const gameKeyCodes = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "KeyC",
  "KeyF",
  "KeyB",
  "KeyL",
  "KeyO",
  "KeyT",
  "Space",
  "ShiftLeft",
  "ShiftRight",
]);

const initialPositions = getSolarEphemeris(Date.now()).positionsAU;
const planetSpecs = planetCatalog.map(spec => ({...spec, radius:kmToWorld(spec.trueRadiusKm), positionAU:initialPositions[spec.key]}));

const galacticTargets = [
  {
    key: "galactic-center",
    name: "Центр Млечного Пути",
    color: 0xffd487,
    positionKm: new THREE.Vector3(...galacticDirection).multiplyScalar(SUN_TO_GALACTIC_CENTER_LY * LY_KM),
    approachDistanceKm: 2 * LY_KM,
  },
  {
    key: "milky-way-rim",
    name: "Край Млечного Пути",
    color: 0xa8d7ff,
    positionKm: new THREE.Vector3(...galacticDirection).multiplyScalar(-(MILKY_WAY_RADIUS_LY - SUN_TO_GALACTIC_CENTER_LY) * LY_KM),
    approachDistanceKm: 2 * LY_KM,
  },
];

initLights();
scene.add(createStellarSky());
initSolarSystem();
initAsteroidBelt();
initSpacecraft();
initGalaxyScaleTargets();
initMilkyWayOutline();
scene.traverse(object => {
  if (object.userData.rotationSpeed || object.userData.orbitSpeed) spinningObjects.push(object);
});
initUi();
bindControls();

function initLights() {
  const ambient = new THREE.AmbientLight(0x4f668a, 0.82);
  scene.add(ambient);

  const sunLight = new THREE.PointLight(0xffdf99, 2.4, 0, 0);
  sunLight.position.set(0, 0, 0);
  world.add(sunLight);

  const rimLight = new THREE.DirectionalLight(0x8ec7ff, 1.1);
  rimLight.position.set(-400, 180, 600);
  scene.add(rimLight);
}

function initSolarSystem() {
  const sunRadius = kmToWorld(SUN_RADIUS_KM);
  const sun = surfaces.create("sun",sunRadius,new THREE.Vector3(0,0,1));
  sun.name = "Солнце";
  sun.userData.kind = "sun";
  sun.userData.trueRadius = sunRadius;
  sun.userData.approachDistance = sunRadius * 8 + SHIP_LENGTH_KM;
  world.add(sun);
  addLabel("Солнце", sun, 0xffca6a);
  addTarget("Солнце", sun, "sun");

  const sunGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture("#ffca6a", "#ff7a2f"),
      color: 0xffffff,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sunGlow.scale.setScalar(sunRadius * 4.1);
  sun.add(sunGlow);

  const solarCorona = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture("#fff6b0", "#ff3d00"),
      color: 0xffffff,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  solarCorona.scale.setScalar(sunRadius * 7.4);
  sun.add(solarCorona);

  planetSpecs.forEach((spec) => {
    const planet = createPlanet(spec);
    planet.position.copy(auToWorld(spec.positionAU));
    planet.userData.trueRadius = spec.radius;
    planet.userData.frameExtent = spec.radius * (spec.rings === true ? 2.30 : spec.rings ? 1.87 : 1.04);
    planet.userData.approachDistance = spec.radius * (spec.rings ? 5.7 : 3.45) + SHIP_LENGTH_KM;
    world.add(planet);
    addLabel(spec.name, planet, new THREE.Color(spec.colors[1]).getHex());
    addTarget(spec.name, planet, spec.key);

    planet.userData.spec = spec;
    orbitalObjects.push([spec.key,planet]);

    if (spec.moon) {
      const moonRadius = kmToWorld(1737.4);
      const light = planet.position.clone().normalize().negate();
      const moon = surfaces.create("moon",moonRadius,light);
      moon.userData.approachVector = approachFromSun(light);
      moon.rotation.y = Math.atan2(moon.userData.approachVector.x,moon.userData.approachVector.z)-Math.PI/2;
      moon.position.copy(auToWorld(initialPositions.moon));
      moon.userData.trueRadius = moonRadius;
      moon.userData.frameExtent = moonRadius;
      moon.userData.approachDistance = moon.userData.trueRadius * 3.45 + SHIP_LENGTH_KM;
      world.add(moon);
      orbitalObjects.push(["moon",moon]);
      addLabel("Луна", moon, 0xd7d6cf);
      addTarget("Луна", moon, "moon");
    }

    if (spec.rings) {
      const ring = surfaces.rings(spec,planet.material.uniforms.sunlight.value);
      planet.add(ring);
    }
  });
}

function initAsteroidBelt() {
  beltScene = buildBeltScene(THREE,world);
  addLabel("243 Ида",beltScene.primary,0xbaaea0);
  addTarget("Пояс астероидов · Ида",beltScene.primary,"asteroid-belt");
}

function initSpacecraft() {
  spacecraftSpecs.forEach((spec) => {
    const craft = createSpacecraft(spec);
    craft.position.copy(auToWorld(spec.positionAU));
    craft.name = spec.name;
    craft.userData.kind = "spacecraft";
    craft.userData.spec = spec;
    craft.userData.trueRadius = (spec.spanMeters * METERS_TO_UNITS) / 2;
    craft.userData.approachDistance = Math.max(craft.userData.trueRadius * 12 + SHIP_LENGTH_KM * 2, camera.near * 80);
    craft.lookAt(0, 0, 0);
    world.add(craft);

    addRadialGuide(craft.position, spec.color);
    addLabel(spec.name, craft, spec.color);
    addTarget(spec.name, craft, spec.key);
  });
}

let returnObservatory;
function setRouteOpen(open) {
  routeOpen = open && compactSolar.matches;
  routePanel.hidden = compactSolar.matches && !routeOpen;
  routeButton.setAttribute("aria-expanded", String(routeOpen));
  if (!open) routePanel.querySelector("details").open = false;
}

function hideTouchHint() {
  showTouchHint = false;
  clearTimeout(hintTimer);
  touchHint.hidden = true;
}

export function setObservatoryUnlocked(choice) {
  if (choice !== "people" && choice !== "relay") return;
  if (!returnObservatory) {
    returnObservatory = createSolarObservatory(THREE);
    const span = 920;
    scaleModelToRealSpan(returnObservatory.model, span);
    const station = new THREE.Group();
    station.name = "Обсерватория · экспедиция";
    station.position.copy(auToWorld([72.5, -18.2, 3.42]));
    station.userData.trueRadius = span * METERS_TO_UNITS / 2;
    station.userData.approachDistance = span * METERS_TO_UNITS * 1.56;
    station.userData.approachVector = new THREE.Vector3(0.27, 0.32, 1).normalize();
    station.userData.targetColor = 0xa4e5d5;
    station.add(returnObservatory.model);
    world.add(station);
    addLabel(station.name, station, station.userData.targetColor);
    addTarget(station.name, station, "return-observatory");
  }
  returnObservatory.setChoice(choice);
}

export function visitObservatory() {
  if (!returnObservatory) return;
  selectTarget("return-observatory", false);
  jumpToSelectedTarget();
}

function initGalaxyScaleTargets() {
  galacticTargets.forEach((target) => {
    const marker = new THREE.Group();
    marker.position.copy(target.positionKm);
    marker.name = target.name;
    marker.userData.kind = "galactic-target";
    marker.userData.approachDistance = target.approachDistanceKm;

    const beacon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(`#${target.color.toString(16).padStart(6, "0")}`, "#ffffff"),
        color: target.color,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    beacon.userData.navigationAid = true;
    beacon.scale.setScalar(0.8 * LY_KM);
    marker.add(beacon);

    world.add(marker);
    addRadialGuide(marker.position, target.color);
    addLabel(target.name, marker, target.color);
    addTarget(target.name, marker, target.key);
  });
}

function initMilkyWayOutline() {
  const center = galacticTargets.find((target) => target.key === "galactic-center").positionKm;
  const radius = MILKY_WAY_RADIUS_LY * LY_KM;
  // IAU north Galactic pole (J2000 192.85948°, +27.12825°), in the game's ecliptic axes.
  const pole = new THREE.Vector3(-.8676661490, .4971471917, .0003515900);
  const transverse = pole.clone().cross(center).normalize();
  const radial = transverse.clone().cross(pole).normalize();
  const points = [];
  for (let i = 0; i < 384; i += 1) {
    const angle = (i / 384) * Math.PI * 2;
    points.push(center.clone().addScaledVector(radial,radius * Math.cos(angle))
      .addScaledVector(transverse,radius * Math.sin(angle)));
  }

  const disk = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color: 0x9fc7ff,
      transparent: true,
      opacity: 0.12,
    }),
  );
  disk.name = "Реальный диаметр Млечного Пути";
  disk.userData.kind = "galaxy-outline";
  disk.visible = orbitsVisible;
  orbitLines.push(disk);
  world.add(disk);
}

function createSpacecraft(spec) {
  const group = new THREE.Group();
  let model;

  if (spec.model === "pioneer") {
    model = createPioneerModel(spec.color);
  } else if (spec.model === "newHorizons") {
    model = createNewHorizonsModel(spec.color);
  } else if (spec.model === "parker") {
    model = createParkerModel(spec.color);
  } else if (spec.model === "jwst") {
    model = createJwstModel();
  } else {
    model = createVoyagerModel(spec.color);
  }

  scaleModelToRealSpan(model, spec.spanMeters);

  group.add(model);
  return group;
}

function createVoyagerModel(color) {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8bec8, roughness: 0.42, metalness: 0.72 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x171a20, roughness: 0.66, metalness: 0.3 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8ad56, roughness: 0.36, metalness: 0.78, side: THREE.DoubleSide });
  const accent = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.08, roughness: 0.5, metalness: 0.28 });

  const dish = createDish(1.55, 0.46, gold);
  dish.rotation.x = Math.PI / 2;
  dish.position.z = 0.7;
  group.add(dish);

  const bus = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.68, 0.72), metal);
  bus.position.z = -0.1;
  group.add(bus);

  const mast = createCylinderBetween(new THREE.Vector3(0, 0, -0.46), new THREE.Vector3(0, 0, 0.54), 0.045, dark);
  group.add(mast);

  const boomA = createCylinderBetween(new THREE.Vector3(-0.42, 0.06, -0.2), new THREE.Vector3(-2.7, 0.18, -1.55), 0.035, dark);
  const boomB = createCylinderBetween(new THREE.Vector3(0.36, 0.02, -0.16), new THREE.Vector3(2.45, -0.2, -1.15), 0.03, dark);
  const boomC = createCylinderBetween(new THREE.Vector3(0.04, 0.24, -0.22), new THREE.Vector3(0.2, 2.2, -1.1), 0.026, dark);
  group.add(boomA, boomB, boomC);

  const rtg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.96, 24), accent);
  rtg.rotation.z = Math.PI / 2;
  rtg.position.set(-2.95, 0.2, -1.7);
  group.add(rtg);

  const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), metal);
  sensor.position.set(2.62, -0.22, -1.22);
  group.add(sensor);

  return group;
}

function createPioneerModel(color) {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xc1c5c8, roughness: 0.4, metalness: 0.82 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2328, roughness: 0.68, metalness: 0.35 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc99a45, roughness: 0.38, metalness: 0.72, side: THREE.DoubleSide });
  const accent = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.06, roughness: 0.48, metalness: 0.28 });

  const dish = createDish(1.48, 0.54, metal);
  dish.rotation.x = Math.PI / 2;
  dish.position.z = 0.42;
  group.add(dish);

  const bus = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.56, 0.62, 8), gold);
  bus.rotation.x = Math.PI / 2;
  bus.position.z = -0.26;
  group.add(bus);

  group.add(createCylinderBetween(new THREE.Vector3(-0.2, 0, -0.3), new THREE.Vector3(-2.4, 0.32, -1.18), 0.032, dark));
  group.add(createCylinderBetween(new THREE.Vector3(0.22, 0, -0.3), new THREE.Vector3(2.38, -0.26, -1.08), 0.032, dark));
  group.add(createCylinderBetween(new THREE.Vector3(0, 0.22, -0.3), new THREE.Vector3(0.16, 2.0, -1.0), 0.028, dark));

  const rtgLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.72, 20), accent);
  rtgLeft.rotation.z = Math.PI / 2;
  rtgLeft.position.set(-2.62, 0.34, -1.28);
  const rtgRight = rtgLeft.clone();
  rtgRight.position.set(2.6, -0.28, -1.18);
  group.add(rtgLeft, rtgRight);

  return group;
}

function createNewHorizonsModel(color) {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x9fa7b0, roughness: 0.48, metalness: 0.68 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15181f, roughness: 0.72, metalness: 0.24 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xcf9d44, roughness: 0.4, metalness: 0.76, side: THREE.DoubleSide });
  const accent = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.08, roughness: 0.52, metalness: 0.22 });

  const dish = createDish(0.92, 0.28, metal);
  dish.rotation.x = Math.PI / 2;
  dish.position.z = 0.56;
  group.add(dish);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.72, 0.8, 6), gold);
  body.rotation.x = Math.PI / 2;
  body.position.z = -0.08;
  group.add(body);

  group.add(createCylinderBetween(new THREE.Vector3(0.44, 0, -0.12), new THREE.Vector3(1.62, -0.18, -0.32), 0.05, dark));

  const rtg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.82, 24), accent);
  rtg.rotation.z = Math.PI / 2;
  rtg.position.set(1.94, -0.22, -0.36);
  group.add(rtg);

  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.08, 0.5), dark);
  panel.position.set(-0.18, -0.5, -0.24);
  panel.rotation.z = 0.18;
  group.add(panel);

  return group;
}

function createParkerModel(color) {
  const group = new THREE.Group();
  const shield = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92, metalness: 0.12 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xbd7d34, roughness: 0.42, metalness: 0.72 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x213e78, emissive: 0x07182f, emissiveIntensity: 0.22, roughness: 0.5, metalness: 0.18 });
  const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.16, roughness: 0.58, metalness: 0.28 });

  const heatShield = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.16, 64), shield);
  heatShield.rotation.x = Math.PI / 2;
  heatShield.position.z = 0.46;
  group.add(heatShield);

  const bus = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.52, 0.58), copper);
  bus.position.z = -0.05;
  group.add(bus);

  const leftPanel = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.05, 0.42), blue);
  leftPanel.position.set(-1.08, 0, -0.15);
  const rightPanel = leftPanel.clone();
  rightPanel.position.x = 1.08;
  group.add(leftPanel, rightPanel);

  const antenna = new THREE.Mesh(new THREE.SphereGeometry(0.14, 24, 16), glow);
  antenna.position.set(0, 0.44, -0.42);
  group.add(antenna);

  return group;
}

function createJwstModel() {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xd6a740, roughness: 0.32, metalness: 0.86 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xc6ccd2, roughness: 0.5, metalness: 0.62 });
  const purple = new THREE.MeshStandardMaterial({ color: 0x6f668c, roughness: 0.82, metalness: 0.1, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.7, metalness: 0.28 });

  for (let row = -2; row <= 2; row += 1) {
    const count = 5 - Math.abs(row);
    for (let col = 0; col < count; col += 1) {
      const mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 6), gold);
      mirror.rotation.x = Math.PI / 2;
      mirror.position.set((col - (count - 1) / 2) * 0.42 + (Math.abs(row) % 2) * 0.2, row * 0.36, 0.7);
      group.add(mirror);
    }
  }

  const secondary = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), silver);
  secondary.position.set(0, 0, 1.48);
  group.add(secondary);
  group.add(createCylinderBetween(new THREE.Vector3(0, 0, 0.78), new THREE.Vector3(0, 0, 1.4), 0.018, silver));
  group.add(createCylinderBetween(new THREE.Vector3(-0.52, 0.38, 0.65), new THREE.Vector3(0, 0, 1.4), 0.014, silver));
  group.add(createCylinderBetween(new THREE.Vector3(0.52, 0.38, 0.65), new THREE.Vector3(0, 0, 1.4), 0.014, silver));

  for (let i = 0; i < 5; i += 1) {
    const shield = new THREE.Mesh(new THREE.PlaneGeometry(4.6 - i * 0.18, 2.35 - i * 0.1), purple);
    shield.rotation.x = Math.PI / 2;
    shield.position.set(0, -0.04 * i - 0.58, 0.08 - i * 0.035);
    group.add(shield);
  }

  const bus = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.42, 0.42), dark);
  bus.position.set(0, -0.18, 0.32);
  group.add(bus);

  return group;
}

function createDish(radius, depth, material) {
  const profile = [];
  for (let i = 0; i <= 18; i += 1) {
    const t = i / 18;
    profile.push(new THREE.Vector2(t * radius, -depth * t * t));
  }
  const geometry = new THREE.LatheGeometry(profile, 64);
  return new THREE.Mesh(geometry, material);
}

function createCylinderBetween(start, end, radius, material) {
  const direction = tempVec2.copy(end).sub(start);
  const length = direction.length();
  const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), material);
  cylinder.position.copy(start).add(end).multiplyScalar(0.5);
  cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return cylinder;
}

function tiltFor(key) {
  const degrees = {mercury:.03,venus:2.6,earth:23.4,mars:25.2,jupiter:3.1,saturn:26.7,uranus:97.8,neptune:28.3};
  return THREE.MathUtils.degToRad(degrees[key]);
}
function approachFromSun(light) {
  const tangent = new THREE.Vector3().crossVectors(light, new THREE.Vector3(0,1,0)).normalize();
  return light.clone().multiplyScalar(.68).addScaledVector(tangent,.68).setY(.31).normalize();
}
function createPlanet(spec) {
  const light = auToWorld(spec.positionAU).normalize().negate();
  const planet = surfaces.create(spec.key,spec.radius,light);
  const approach = approachFromSun(light);
  planet.userData.approachVector = approach;
  planet.name = spec.name;
  planet.rotation.order = "ZXY";
  planet.rotation.z = tiltFor(spec.key);
  // Present mapped longitudes on arrival, then let the surface drift slowly underneath.
  planet.rotation.y = Math.atan2(approach.x,approach.z) - Math.PI/2;
  if (spec.key==="jupiter") planet.rotation.y+=.65;
  // Earth's zero longitude crosses the vernal equinox at Greenwich sidereal zero.
  // Other bodies rotate at their approximate sidereal period; their prime-meridian
  // phase is illustrative. Retrograde Uranus is encoded by its >90° axial tilt.
  const days={mercury:58.646,venus:-243.025,earth:.99726968,mars:1.025957,jupiter:.41354,saturn:.444,uranus:.71833,neptune:.67125};
  planet.userData.rotationSpeed=2*Math.PI/(days[spec.key]*86400);
  if(spec.key==='earth'){
    planet.rotation.order='XYZ';
    planet.rotation.x=-THREE.MathUtils.degToRad(23.43928);
    planet.rotation.y=greenwichSiderealAngle(Date.now());
    planet.rotation.z=0;
  }

  if (spec.airglow) {
    const air = new THREE.Mesh(planet.geometry, new THREE.ShaderMaterial({
      uniforms: {
        tint: { value: new THREE.Color(spec.airglow) },
        sunlight: { value: auToWorld(spec.positionAU).normalize().negate() },
      },
      vertexShader: `
        varying float incidence;
        varying float daylight;
        uniform vec3 sunlight;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * normal);
          incidence = dot(n, normalize(-mvPosition.xyz));
          daylight = dot(n, normalize(mat3(viewMatrix) * sunlight));
          gl_Position = projectionMatrix * mvPosition;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `
        uniform vec3 tint;
        varying float incidence;
        varying float daylight;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          float rim = pow(1.0 - clamp(incidence, 0.0, 1.0), 3.4);
          float light = smoothstep(-0.5, 0.7, daylight);
          gl_FragColor = vec4(tint, rim * (0.24 + 0.66 * light));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    air.scale.setScalar(spec.key === "earth" ? 1.035 : 1.018);
    planet.add(air);
    planet.userData.airglow=air;
  }

  return planet;
}

let orbitGuidesReady = false;
function createOrbitGuides() {
  if (orbitGuidesReady) return;
  orbitGuidesReady = true;
  const lines = orbitPaths(Date.now());
  for (const spec of planetSpecs) {
    if (lines[spec.key]) addOrbit(lines[spec.key].map(v=>new THREE.Vector3(...v)), spec.colors[1]);
  }
}

function addOrbit(points, color) {
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.2,
    }),
  );

  line.visible = orbitsVisible;
  orbitLines.push(line);
  world.add(line);
}

function addRadialGuide(position, color) {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), position.clone()]),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.16,
    }),
  );
  line.visible = orbitsVisible;
  orbitLines.push(line);
  world.add(line);
}

function auToWorld(position) {
  return new THREE.Vector3(...worldCoordinates(position));
}

function kmToWorld(km) {
  return km * KM_TO_UNITS;
}

function scaleModelToRealSpan(model, spanMeters) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(tempVec);
  const maxDimension = Math.max(size.x, size.y, size.z);
  if (maxDimension > 0) {
    model.scale.setScalar((spanMeters * METERS_TO_UNITS) / maxDimension);
  }
}

function addLabel(name, object, color) {
  const element = document.createElement("div");
  element.className = "label";
  element.textContent = name;
  element.style.borderColor = `#${color.toString(16).padStart(6, "0")}88`;
  object.userData.targetColor = color;
  labelsRoot.append(element);
  labelEntries.push({ element, object });
}

function addTarget(name, object, key) {
  const entry = { name, object, key };
  targetObjects.push(entry);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = name;
  listen(button, "click", () => {
    selectTarget(key, false);
  });
  targetList.append(button);
  targetButtons.set(key, button);
}

function selectTarget(key, lock = true) {
  const nextTarget = targetObjects.find((target) => target.key === key) ?? null;
  if (selectedTarget !== nextTarget) {
    clearTimeout(arrivalTimer);
    arrival.classList.remove("is-arriving");
  }
  selectedTarget = nextTarget;

  targetButtons.forEach((button, targetKey) => {
    const selected = nextTarget?.key === targetKey;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  if (nextTarget) {
    touchJump.setAttribute("aria-label", "Прыжок к цели: " + nextTarget.name);
    targetReadout.textContent = nextTarget.name;
  } else {
    targetReadout.textContent = "Свободный полет";
  }

  if (lock) canvas.focus();
}

function initUi() {
  setRouteOpen(false);
  listen(routeButton, "click", () => setRouteOpen(!routeOpen));
  listen(document.getElementById("solarAim"), "click", () => {
    if (!selectedTarget) return;
    selectedTarget.object.getWorldPosition(tempVec);
    lookAtWorldPosition(tempVec);
    setRouteOpen(false);
    canvas.focus();
  });
  const optics = document.getElementById("solarOptics");
  listen(optics, "change", () => {
    camera.zoom = Number(optics.value) || 1;
    camera.updateProjectionMatrix();
    framingAspect = 0;
  });
  listen(compactSolar, "change", () => setRouteOpen(false));
  listen(touchJump, "click", jumpToSelectedTarget);
  selectTarget("earth", false);
  placeCameraNearTarget("earth");
  orbitToggle.classList.toggle("chip--active", orbitsVisible);
  orbitToggle.setAttribute("aria-pressed", String(orbitsVisible));
  labelsToggle.classList.toggle("chip--active", labelsVisible);
  labelsToggle.setAttribute("aria-pressed", String(labelsVisible));
  labelsRoot.style.display = labelsVisible ? "block" : "none";

  listen(orbitToggle, "click", () => {
    orbitsVisible = !orbitsVisible;
    if (orbitsVisible) createOrbitGuides();
    orbitToggle.classList.toggle("chip--active", orbitsVisible);
    orbitToggle.setAttribute("aria-pressed", String(orbitsVisible));
    orbitLines.forEach((orbit) => {
      orbit.visible = orbitsVisible;
    });
  });

  listen(labelsToggle, "click", () => {
    labelsVisible = !labelsVisible;
    labelsToggle.classList.toggle("chip--active", labelsVisible);
    labelsToggle.setAttribute("aria-pressed", String(labelsVisible));
    labelsRoot.style.display = labelsVisible ? "block" : "none";
  });

  listen(jumpButton, "click", () => {
    jumpToSelectedTarget();
  });
}

function placeCameraNearTarget(key) {
  flightFrame.identity();
  const target = targetObjects.find((entry) => entry.key === key);
  if (!target) {
    return;
  }

  target.object.getWorldPosition(tempVec);
  const approachDistance = getApproachDistance(target.object);
  const arrivalDirection = target.object.userData.approachVector || new THREE.Vector3(0,.3,1).normalize();
  camera.position.copy(tempVec).addScaledVector(arrivalDirection,approachDistance);
  velocity.set(0, 0, 0);
  lookAtWorldPosition(tempVec);
}

function jumpToSelectedTarget() {
  if (!selectedTarget) {
    return;
  }

  selectedTarget.object.getWorldPosition(tempVec);
  const currentDirection = tempVec2.copy(camera.position).sub(tempVec);
  setRouteOpen(false);
  hideTouchHint();
  const approachVector = selectedTarget.object.userData.approachVector;
  if (approachVector) currentDirection.copy(approachVector);
  if (currentDirection.lengthSq() < 0.001) {
    currentDirection.copy(tempVec).normalize();
  }
  if (currentDirection.lengthSq() < 0.001) {
    currentDirection.set(0.4, 0.25, 1).normalize();
  }

  const mode=document.querySelector('#solarApproach')?.value || 'orbit';
  const radius=selectedTarget.object.userData.trueRadius;
  const chosen=arrivalRangeKm(radius,mode,selectedTarget.key);
  const approachDistance = chosen ?? getApproachDistance(selectedTarget.object);
  camera.position.copy(tempVec).addScaledVector(currentDirection.normalize(), approachDistance);
  velocity.set(0,0,0);
  flightFrame.identity();
  if(chosen) {
    // This local navigation frame keeps the horizon upright at every landing latitude.
    horizonDirection.set(0,1,0);
    if(Math.abs(currentDirection.y)>.95) horizonDirection.set(1,0,0);
    horizonDirection.addScaledVector(currentDirection,-horizonDirection.dot(currentDirection)).normalize();
    fixedEye.copy(camera.position).add(horizonDirection);
    horizonMatrix.lookAt(camera.position,fixedEye,currentDirection);
    flightFrame.setFromRotationMatrix(horizonMatrix);
    yaw=roll=0;pitch=mode==='surface' ? -.18 : -Math.acos(radius/approachDistance)-.17;
    tempEuler.set(pitch,yaw,roll);
    camera.quaternion.copy(tempQuat.setFromEuler(tempEuler)).premultiply(flightFrame);
  } else lookAtWorldPosition(tempVec);
  jumpCount++;
  clearTimeout(arrivalTimer);
  arrival.querySelector("span").textContent = selectedTarget.name;
  arrival.classList.remove("is-arriving");
  void arrival.offsetWidth;
  arrival.classList.add("is-arriving");
  arrivalTimer = setTimeout(() => arrival.classList.remove("is-arriving"), 2150);
  canvas.focus();
}

function lookAtWorldPosition(position) {
  const direction = tempVec2.copy(position).sub(camera.position).normalize().applyQuaternion(frameInverse.copy(flightFrame).invert());
  yaw = Math.atan2(-direction.x, -direction.z);
  pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
  roll = 0;
  tempEuler.set(pitch, yaw, roll);
  camera.quaternion.copy(tempQuat.setFromEuler(tempEuler)).premultiply(flightFrame);
}

function getApproachDistance(object) {
  const radius = object.userData.trueRadius ?? 0;
  const nominal = object.userData.approachDistance ?? Math.max(radius * 8, 1e-6);
  if (!object.userData.frameExtent) return nominal;
  if (camera.aspect !== framingAspect) {
    framingAspect = camera.aspect;
    const halfView = Math.atan(.90 * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()/2)) * Math.min(camera.aspect,1));
    framingFactor = 1 / Math.sin(halfView);
  }
  return Math.max(nominal, object.userData.frameExtent * framingFactor);
}

function shouldCaptureKey(event) {
  if (!solarActive) return false;
  const gameIsActive = document.pointerLockElement === canvas || launchPanel.classList.contains("is-hidden");
  const browserFlightShortcut =
    event.ctrlKey &&
    ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "Space", "ShiftLeft", "ShiftRight"].includes(event.code);
  return gameIsActive && (gameKeyCodes.has(event.code) || browserFlightShortcut);
}

function listen(target, type, handler, options = {}) {
  target?.addEventListener(type, handler, {...options, signal:inputListeners.signal});
}

function bindControls() {
  listen(canvas, "webglcontextlost", loseSolarContext);
  listen(launchButton, "click", () => {
    launchPanel.classList.add("is-hidden");
    requestLock();
  });

  listen(canvas, "pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button === 0) requestLock();
  });

  listen(document, "pointerlockchange", () => {
    if (document.pointerLockElement === canvas) {
      launchPanel.classList.add("is-hidden");
    }
  });

  listen(document, "mousemove", (event) => {
    if (document.pointerLockElement !== canvas) {
      return;
    }

    yaw -= event.movementX * 0.0022;
    pitch -= event.movementY * 0.0022;
    pitch = THREE.MathUtils.clamp(pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
  });

  listen(window, "keydown", (event) => {
    if (!solarActive) return;
    if (shouldCaptureKey(event)) {
      event.preventDefault();
    }

    if (event.code === "Escape" && routeOpen) {
      setRouteOpen(false);
      routeButton.focus();
      return;
    }
    if (gameKeyCodes.has(event.code)) solarTouch.state.assisted = false;
    keys.add(event.code);

    if (event.code === "KeyO") {
      orbitToggle.click();
    }

    if (event.code === "KeyL") {
      labelsToggle.click();
    }

    if (event.code === "KeyB" && !event.repeat) {
      superCruise = !superCruise;
    }

    if (event.code === "KeyT" && !event.repeat) {
      jumpToSelectedTarget();
    }
  });

  listen(window, "keyup", (event) => {
    if (shouldCaptureKey(event)) {
      event.preventDefault();
    }
    keys.delete(event.code);
  });

  function releaseFlightControls() {
    keys.clear();
    solarTouch.reset();
    if (solarTouch.state.assisted) velocity.set(0, 0, 0);
  }
  listen(window, "blur", releaseFlightControls);
  listen(window, "pagehide", releaseFlightControls);
  listen(document, "freeze", releaseFlightControls);

  listen(window, "resize", resize);

  listen(canvas,
    "wheel",
    (event) => {
      event.preventDefault();
      solarTouch.state.assisted = false;
      const impulse = -Math.sign(event.deltaY) * (superCruise ? LIGHT_SPEED_KM_S * 0.12 : 12);
      camera.getWorldDirection(forward);
      velocity.addScaledVector(forward, impulse);
    },
    { passive: false },
  );

  solarTouch = createSolarTouch(document.querySelector("#solarStick"), canvas, {
    signal: inputListeners.signal,
    onUse: hideTouchHint,
    onSky: () => { if (routeOpen) setRouteOpen(false); },
    onLook(dx, dy) {
      const sensitivity = 2.35 / Math.max(320, Math.min(innerWidth, innerHeight));
      yaw -= dx * sensitivity;
      pitch = THREE.MathUtils.clamp(pitch - dy * sensitivity, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    }
  });
}

function requestLock() {
  if (solarActive && matchMedia("(any-pointer: fine)").matches &&
      document.pointerLockElement !== canvas && "requestPointerLock" in canvas) {
    canvas.requestPointerLock()?.catch(() => {});
  }
}

function resize() {
  if (retired) return;
  solarTouch?.reset();
  setSurfaceSize();
}

function setSurfaceSize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setDrawingBufferSize(width, height, renderBudget.pixelRatio(width, height));
}

export function resumeSolarFlight() {
  if (solarActive || retired) return;
  renderBudget.resetTiming();
  nextHud = 0;
  solarActive = true;
  launchPanel.classList.add("is-hidden");
  clock.getDelta();
  orbitalClock.refresh();
  resize();
  if (compactSolar.matches && showTouchHint) {
    touchHint.hidden = false;
    hintTimer = setTimeout(hideTouchHint, 7400);
  }
  animate();
}

export function pauseSolarFlight() {
  solarActive = false;
  surfaces.releaseDetail();
  cancelAnimationFrame(solarFrame);
  keys.clear();
  solarTouch.reset();
  if (solarTouch.state.assisted) velocity.set(0, 0, 0);
  setRouteOpen(false);
  clearTimeout(hintTimer);
  clearTimeout(arrivalTimer);
  arrival.classList.remove("is-arriving");
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function animate(time = performance.now()) {
  if (!solarActive || retired || renderer.getContext().isContextLost()) return;
  if (renderBudget.frame(time)) setSurfaceSize();
  const delta = Math.min(clock.getDelta(), 0.04);
  const elapsed = clock.elapsedTime;

  syncOrbitalPositions();
  beltScene.step(Date.now(),camera.position);
  updateCamera(delta);
  updateSolarSystem(delta, elapsed);
  if (time >= nextHud) {
    updateHud();
    nextHud = time + 90;
  }
  updateLabels();

  renderer.render(scene, camera);
  updateRenderProbe(elapsed);
  solarFrame = requestAnimationFrame(animate);
}

// A lost Android surface may never come back. The caller can continue this exact
// viewpoint with the Canvas renderer, including when the activity was backgrounded.
function loseSolarContext(event) {
  event.preventDefault();
  if (retired) return;
  camera.getWorldDirection(horizonDirection);
  const detail = {...getSolarSoundState(), position:camera.position.toArray(), yaw:Math.atan2(-horizonDirection.x,-horizonDirection.z), pitch:Math.asin(THREE.MathUtils.clamp(horizonDirection.y,-1,1)), wasActive:solarActive};
  detail.opticalZoom = camera.zoom;
  detail.viewBasis = [[1,0,0],[0,1,0],[0,0,1]].map(axis =>
    new THREE.Vector3(...axis).applyQuaternion(camera.quaternion).toArray());
  let nearest = Infinity;
  for (const [key,object] of orbitalObjects) {
    const offset = tempVec.copy(camera.position).sub(object.position);
    const range = offset.length()/object.userData.trueRadius;
    if (range < 48 && range < nearest) {
      nearest = range;
      detail.pin = {key,offset:offset.toArray()};
    }
  }
  retireSolarFlight();
  window.dispatchEvent(new CustomEvent('orbit:solar-context-lost', {detail}));
}

export function retireSolarFlight() {
  if (retired) return;
  pauseSolarFlight();
  retired = true;
  inputListeners.abort();
  surfaces.dispose();
  const textures = new Set();
  scene.traverse(object => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
    if (object.isInstancedMesh) object.dispose();
  });
  textures.forEach(texture => texture.dispose());
  scene.clear();
  world.clear();
  labelEntries.length = targetObjects.length = 0;
  targetButtons.clear();
  spinningObjects.length = 0;
  renderer.dispose();
  if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
}

function updateCamera(delta) {
  const rollDirection = Number(keys.has("KeyQ")) - Number(keys.has("KeyE"));
  roll = THREE.MathUtils.lerp(roll, rollDirection * 0.26, 1 - Math.exp(-8 * delta));

  tempEuler.set(pitch, yaw, roll);
  tempQuat.setFromEuler(tempEuler).premultiply(flightFrame);
  camera.quaternion.slerp(tempQuat, 1 - Math.exp(-18 * delta));

  camera.getWorldDirection(forward);
  right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  up.set(0, 1, 0).applyQuaternion(camera.quaternion);

  if (solarTouch.state.assisted) {
    flyWithStick(delta);
    return;
  }

  const forwardInput = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
  const rightInput = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
  const upInput = Number(keys.has("Space")) - Number(keys.has("KeyC"));
  const afterburner = keys.has("ShiftLeft") || keys.has("ShiftRight");

  const baseAcceleration = afterburner ? 92 : 28;
  const axialAcceleration = superCruise ? LIGHT_SPEED_KM_S * 24 : baseAcceleration * FORWARD_CRUISE_MULTIPLIER;
  const maneuverAcceleration = superCruise ? LIGHT_SPEED_KM_S * 24 : baseAcceleration;

  if (forwardInput !== 0) {
    velocity.addScaledVector(forward, forwardInput * axialAcceleration * delta);
  }

  if (rightInput !== 0) {
    velocity.addScaledVector(right, rightInput * maneuverAcceleration * delta);
  }

  if (upInput !== 0) {
    velocity.addScaledVector(up, upInput * maneuverAcceleration * delta);
  }

  if (selectedTarget && keys.has("KeyF")) {
    selectedTarget.object.getWorldPosition(tempVec2);
    tempVec2.sub(camera.position).normalize();
    velocity.addScaledVector(tempVec2, maneuverAcceleration * 0.75 * delta);
  }

  const nearest=findClosestHull();
  const cruiseLimit=superCruise ? LIGHT_SPEED_KM_S * 1000 : (afterburner ? 145 : 42) * FORWARD_CRUISE_MULTIPLIER;
  const maxSpeed=Math.min(cruiseLimit,Math.max(.0012,nearest.gap*.85));
  if (velocity.length() > maxSpeed) {
    velocity.setLength(maxSpeed);
  }

  velocity.multiplyScalar(Math.exp((superCruise ? -0.06 : -0.28) * delta));
  camera.position.addScaledVector(velocity, delta);

  keepHullClear(nearest.object);
}

const closestHull={object:null,gap:Infinity};
function findClosestHull() {
  closestHull.object=null;closestHull.gap=Infinity;
  for(const target of targetObjects) {
    const radius=target.object.userData.trueRadius;
    if(!radius) continue;
    target.object.getWorldPosition(tempVec);
    const gap=camera.position.distanceTo(tempVec)-radius;
    if(gap<closestHull.gap){closestHull.object=target.object;closestHull.gap=gap;}
  }
  return closestHull;
}

function keepHullClear(object) {
  if(!object) return;
  object.getWorldPosition(tempVec);
  tempVec2.copy(camera.position).sub(tempVec);
  const minDistance=object.userData.trueRadius+HULL_CLEARANCE_KM;
  if(tempVec2.lengthSq()>=minDistance*minDistance) return;
  if(tempVec2.lengthSq()===0) tempVec2.copy(forward).negate();
  tempVec2.normalize();
  camera.position.copy(tempVec).addScaledVector(tempVec2,minDistance);
  const inward=velocity.dot(tempVec2);
  if(inward<0) velocity.addScaledVector(tempVec2,-inward);
}

// A ship seven metres long can move at walking speed just above the terrain.
function flyWithStick(delta) {
  const {x,y,lift=0}=solarTouch.state;
  const moving=x!==0 || y!==0 || lift!==0;
  if(!moving && velocity.lengthSq()===0) return;
  const nearest=findClosestHull();
  const limit=approachSpeedLimit(nearest.gap);
  touchVelocity.copy(forward).multiplyScalar(y*limit);
  touchVelocity.addScaledVector(right,x*limit*.72);
  touchVelocity.addScaledVector(up,lift*limit*.55);
  velocity.lerp(touchVelocity,1-Math.exp(-(moving?7:13)*delta));
  if(!moving && velocity.length()<limit*.008) velocity.set(0,0,0);
  camera.position.addScaledVector(velocity,delta);
  keepHullClear(nearest.object);
}

export function getSolarSoundState() {
  const object = selectedTarget?.object;
  let near = 0;
  let speedScale = 1260;
  if (object) {
    object.getWorldPosition(tempVec);
    const distance = camera.position.distanceTo(tempVec);
    near = THREE.MathUtils.clamp((3 - distance / getApproachDistance(object)) / 2, 0, 1);
    if (solarTouch.state.assisted) {
      speedScale = approachSpeedLimit(distance-(object.userData.trueRadius||0));
    }
  }
  return { speed: Math.min(1, velocity.length() / speedScale), target: selectedTarget?.key, near, jump: jumpCount };
}

function syncOrbitalPositions() {
  const sample = orbitalClock.update(Date.now(),camera.position.toArray(clockEye));
  if (!sample) return;
  camera.position.add(tempVec.fromArray(sample.drift));
  for (const [key,object] of orbitalObjects) {
    object.position.fromArray(sample.positions[key]);
    const sunDirection = tempVec.copy(object.position).normalize().negate();
    object.material.uniforms.sunlight.value.copy(sunDirection);
    for (const layer of object.children) {
      const sunlight = layer.material?.uniforms?.sunlight;
      if (sunlight) sunlight.value.copy(sunDirection);
    }
    if (key === "moon") {
      // The Moon is tidally locked. Arrivals on the near side have a clear sightline to Earth.
      const earthward = tempVec2.fromArray(sample.positions.earth).sub(object.position).normalize();
      object.rotation.y = Math.atan2(-earthward.z,earthward.x);
      object.userData.approachVector.copy(earthward);
    } else {
      object.userData.approachVector.copy(approachFromSun(sunDirection));
    }
  }
}

function updateSolarSystem(delta, elapsed) {
  spinningObjects.forEach(object => {
    if (object.userData.rotationSpeed) {
      const radius=object.userData.trueRadius || 0;
      object.getWorldPosition(fixedCenter);
      fixedEye.copy(camera.position).sub(fixedCenter);
      const following=radius>0 && fixedEye.length()<radius*1.22;
      if(following) object.getWorldQuaternion(priorSpin);
      if(object.userData.spec?.key==='earth') object.rotation.y=greenwichSiderealAngle(Date.now());
      else object.rotation.y += object.userData.rotationSpeed*delta;
      if(following){
        object.getWorldQuaternion(spinDifference).multiply(priorSpin.invert());
        camera.position.copy(fixedCenter).add(fixedEye.applyQuaternion(spinDifference));
        flightFrame.premultiply(spinDifference);
        camera.quaternion.premultiply(spinDifference);
      }
    }

    if (object.userData.orbitSpeed) {
      object.rotation.y += object.userData.orbitSpeed * delta * 0.34;
    }
  });

  surfaces.update(delta,camera,renderBudget.profile());
}

function updateHud() {
  speedReadout.textContent = `${formatSpeed(velocity.length())}${superCruise ? " | SC" : ""}`;

  if (!selectedTarget) {
    distanceReadout.textContent = "--";
    return;
  }

  selectedTarget.object.getWorldPosition(tempVec);
  const distance = camera.position.distanceTo(tempVec);
  const radius = selectedTarget.object.userData.trueRadius || 0;
  const local = selectedTarget.object.userData.surfaceLod && distance < 1.22*radius;
  distanceReadout.textContent = (local?'Высота ':'')+formatDistance((local?Math.max(0,distance-radius):distance)/AU_TO_UNITS);
}

function formatDistance(au) {
  const km = au * AU_KM;
  const ly = km / LY_KM;
  if (ly >= 0.1) {
    return `${ly.toFixed(ly >= 100 ? 0 : 2)} св. лет`;
  }

  if (au >= 1) {
    return `${au.toFixed(au >= 20 ? 1 : 2)} а.е.`;
  }

  if (km >= 1_000_000) {
    return `${(km / 1_000_000).toFixed(1)} млн км`;
  }

  if (km < 1) return `${Math.max(0, Math.round(km * 1000))} м`;
  return `${Math.round(km).toLocaleString("ru-RU")} км`;
}

function formatSpeed(worldUnitsPerSecond) {
  const kmPerSecond = (worldUnitsPerSecond / AU_TO_UNITS) * AU_KM;
  const c = kmPerSecond / LIGHT_SPEED_KM_S;
  if (c >= 1) {
    return `${c.toFixed(c >= 100 ? 0 : 1)} c`;
  }
  if (kmPerSecond >= 1_000_000) {
    return `${(kmPerSecond / 1_000_000).toFixed(1)} млн км/с`;
  }
  if (kmPerSecond > 0 && kmPerSecond < 1) return `${Math.round(kmPerSecond * 1000)} м/с`;
  return `${Math.round(kmPerSecond).toLocaleString("ru-RU")} км/с`;
}

function updateLabels() {
  if (!labelsVisible) {
    return;
  }

  const halfWidth = window.innerWidth / 2;
  const halfHeight = window.innerHeight / 2;

  labelEntries.forEach(({ element, object }) => {
    object.getWorldPosition(tempVec);
    const distance = camera.position.distanceTo(tempVec);
    const projected = tempVec2.copy(tempVec).project(camera);
    const visible =
      projected.z < 1 &&
      projected.z > -1 &&
      projected.x > -1.08 &&
      projected.x < 1.08 &&
      projected.y > -1.08 &&
      projected.y < 1.08;

    if (!visible || distance < 8) {
      element.style.opacity = "0";
      return;
    }

    const x = projected.x * halfWidth + halfWidth;
    const y = -projected.y * halfHeight + halfHeight;
    const opacity = THREE.MathUtils.clamp(1 - distance / 4200, 0.32, 1);

    element.style.opacity = String(opacity);
    element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  });
}

function updateRenderProbe(elapsed) {
  if (renderProbeDone || elapsed < 1) {
    return;
  }

  renderProbeDone = true;

  const gl = renderer.getContext();
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  const samples = [
    [0.5, 0.5],
    [0.35, 0.42],
    [0.65, 0.42],
    [0.42, 0.62],
    [0.58, 0.62],
  ];
  let energy = 0;

  samples.forEach(([x, y]) => {
    const pixel = new Uint8Array(4);
    gl.readPixels(
      Math.floor(width * x),
      Math.floor(height * y),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixel,
    );
    energy += pixel[0] + pixel[1] + pixel[2];
  });

  window.__ORBIT_ESCAPE_RENDER__ = {
    energy,
    ok: energy > 8,
    width,
    height,
  };
  document.documentElement.dataset.renderEnergy = String(energy);
  document.documentElement.dataset.renderOk = String(energy > 8);
}

function makeGlowTexture(inner, outer) {
  const size = 256;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.24, hexWithAlpha(inner, 0.72));
  gradient.addColorStop(0.58, hexWithAlpha(outer, 0.22));
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function hexWithAlpha(hex, alpha) {
  const color = new THREE.Color(hex);
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `rgba(${r},${g},${b},${alpha})`;
}
