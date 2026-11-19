import { createGameRenderer } from "../game-renderer.js";
import * as THREE from "../vendor/three.module.js";
import { createPlanetSurfaces } from "../planet-surface.js";
import { createRenderBudget, getQualityPreference, setQualityPreference } from "../mobile-quality.js";
import { createCampaign, UPGRADES, FACTS } from "./gameplay.mjs";
const campaign = createCampaign();
const budget = createRenderBudget();
let stopping = false;
try {
  document.documentElement.dataset.hand = localStorage.getItem('orbit-escape/pilot-hand/1') === 'left' ? 'left' : 'right';
  if (localStorage.getItem('orbit-escape/graphics/1') === null) setQualityPreference(campaign.state.settings.quality);
  if (campaign.state.settings.quality !== getQualityPreference()) campaign.setSetting('quality', getQualityPreference());
  const muted = localStorage.getItem('orbit-escape/quiet-beacon/muted');
  if (muted !== null && campaign.state.settings.sound !== (muted !== '1')) campaign.setSetting('sound', muted !== '1');
} catch {}

const $ = (id) => document.getElementById(id);
const touchDevice = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
let paused = true, panel = "launch", playing = false, route = null, scanning = false;
let energy = 100, shield = 100, damageCooldown = 0, toastTimeout = 0, lastHud = 0, saveTimer = 0;
let joy = {x:0,y:0,id:null}, lookPointer = null, mouseDragging = false;
let boostHeld = false, brakeHeld = false, audioCtx = null, musicNodes = [], lastRenderTime = 0;
let encounter = [], encounterGroup = null, station = null, stationTarget = "", stationLocation = null;
let panelReturn = "pause", qualityLow = false, fps = 60, fpsFrames = 0, fpsTime = 0;
const cachedRotating = [], cachedFollowers = [];
document.body.classList.toggle("touch", touchDevice);


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

const renderer = createGameRenderer(THREE,{
  canvas,
  antialias: !touchDevice,
  logarithmicDepthBuffer: true,
  powerPreference: "default",
});

renderer.setPixelRatio(budget.pixelRatio(innerWidth, innerHeight));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
const surfaces = createPlanetSurfaces(renderer, path => path.startsWith('./assets/') ? '../' + path.slice(2) : path);
const axisTilt = {mercury:0.03,venus:177.36,earth:23.44,mars:25.19,jupiter:3.13,saturn:26.73,uranus:97.77,neptune:28.32};

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 1e-7, 2e19);
camera.position.set(0, 9, 126);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);
const keys = new Set();
const touchState = new Set();

const world = new THREE.Group();
scene.add(world);

const labelEntries = [];
const orbitLines = [];
const visibilityAids = [];
const targetButtons = new Map();
const targetObjects = [];

let selectedTarget = null;
let labelsVisible = true;
let orbitsVisible = false;
let yaw = 0;
let pitch = 0;
let roll = 0;
let draggingLook = false;
let lastTouch = null;
let velocity = new THREE.Vector3();
let targetPulse = 0;
let renderProbeDone = false;
let superCruise = false;

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const tempVec = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();
const tempQuat = new THREE.Quaternion();
const tempEuler = new THREE.Euler(0, 0, 0, "YXZ");

const AU_KM = 149_597_870.7;
const AU_TO_UNITS = AU_KM;
const KM_TO_UNITS = AU_TO_UNITS / AU_KM;
const METERS_TO_UNITS = KM_TO_UNITS / 1000;
const SUN_RADIUS_KM = 695_700;
const LIGHT_SPEED_KM_S = 299_792.458;
const LY_KM = 9_460_730_472_580.8;
const SHIP_LENGTH_KM = 0.109;
const SHIP_RADIUS_KM = SHIP_LENGTH_KM / 2;
const FORWARD_CRUISE_MULTIPLIER = 30;
const MILKY_WAY_RADIUS_LY = 52_850;
const SUN_TO_GALACTIC_CENTER_LY = 26_660;
const EPHEMERIS_EPOCH = "2026-05-19 00:00 TDB";
const ASTEROID_BELT_INNER_AU = 2.05;
const ASTEROID_BELT_OUTER_AU = 3.35;
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

const planetSpecs = [
  {
    key: "mercury",
    name: "Меркурий",
    trueRadiusKm: 2439.7,
    positionAU: [0.047959651626, 0.303161889615, 0.020376651693],
    orbitAU: 0.307608,
    rotationSpeed: 0.58,
    roughness: 0.72,
    texture: "mercury.jpg",
    colors: ["#9f9686", "#ded1bb", "#5f5a52", "#b8ac9d"],
  },
  {
    key: "venus",
    name: "Венера",
    trueRadiusKm: 6051.8,
    positionAU: [-0.531076427796, 0.482428747067, 0.037270691319],
    orbitAU: 0.718449,
    rotationSpeed: -0.15,
    roughness: 0.38,
    texture: "venus.jpg",
    colors: ["#c79042", "#f4dd97", "#875a33", "#f7c76c"],
  },
  {
    key: "earth",
    name: "Земля",
    trueRadiusKm: 6371,
    positionAU: [-0.540789263351, -0.854915766526, 0.000052018045],
    orbitAU: 1.0116,
    rotationSpeed: 0.85,
    roughness: 0.24,
    texture: "earth.jpg",
    colors: ["#1d5f9e", "#54b46e", "#e2d7bd", "#0b2f66"],
    clouds: true,
    moon: true,
  },
  {
    key: "mars",
    name: "Марс",
    trueRadiusKm: 3389.5,
    positionAU: [1.380389484491, 0.240381251646, -0.028810584985],
    orbitAU: 1.401459,
    rotationSpeed: 0.78,
    roughness: 0.64,
    texture: "mars.jpg",
    colors: ["#9f3f25", "#df8a57", "#5b2419", "#f2b175"],
  },
  {
    key: "jupiter",
    name: "Юпитер",
    trueRadiusKm: 69911,
    positionAU: [-2.651996445048, 4.543818325489, 0.040459653926],
    orbitAU: 5.261274,
    rotationSpeed: 1.34,
    roughness: 0.18,
    bands: true,
    texture: "jupiter.jpg",
    colors: ["#d5ad78", "#f2dfb8", "#8b6042", "#c78756"],
  },
  {
    key: "saturn",
    name: "Сатурн",
    trueRadiusKm: 58232,
    positionAU: [9.412333564228, 1.023890906836, -0.392498617414],
    orbitAU: 9.475992,
    rotationSpeed: 1.12,
    roughness: 0.2,
    bands: true,
    rings: true,
    texture: "saturn.jpg",
    colors: ["#d9ba79", "#f4dfaa", "#8e7041", "#c99f5a"],
  },
  {
    key: "uranus",
    name: "Уран",
    trueRadiusKm: 25362,
    positionAU: [9.403782089303, 17.043308210166, -0.058635646926],
    orbitAU: 19.465583,
    rotationSpeed: -0.82,
    roughness: 0.12,
    rings: "thin",
    texture: "uranus.jpg",
    colors: ["#79c9d6", "#d1f7f4", "#4aa0b7", "#9ee6e8"],
  },
  {
    key: "neptune",
    name: "Нептун",
    trueRadiusKm: 24622,
    positionAU: [29.857699369897, 0.954457685053, -0.707708761517],
    orbitAU: 29.881333,
    rotationSpeed: 0.78,
    roughness: 0.18,
    texture: "neptune.jpg",
    colors: ["#2a5cc7", "#76a7ff", "#102d78", "#3c75d8"],
  },
];

const spacecraftSpecs = [
  {
    key: "voyager1",
    name: "Voyager 1",
    model: "voyager",
    color: 0x6ee7ff,
    spanMeters: 13,
    positionAU: [-32.001575284081, -135.763328078132, 98.228592196721],
    distanceAU: 170.600816,
  },
  {
    key: "voyager2",
    name: "Voyager 2",
    model: "voyager",
    color: 0x87f7c7,
    spanMeters: 13,
    positionAU: [39.562538578009, -104.736059563586, -88.820873727697],
    distanceAU: 142.912506,
  },
  {
    key: "pioneer10",
    name: "Pioneer 10",
    model: "pioneer",
    color: 0xffca6a,
    spanMeters: 5.2,
    positionAU: [23.975420862988, 138.759201163527, 7.345396027793],
    distanceAU: 141.006707,
  },
  {
    key: "pioneer11",
    name: "Pioneer 11",
    model: "pioneer",
    color: 0xffb07a,
    spanMeters: 5.2,
    positionAU: [28.772202869738, -109.981189488408, 28.039595117498],
    distanceAU: 117.08937,
  },
  {
    key: "new-horizons",
    name: "New Horizons",
    model: "newHorizons",
    color: 0x9fb7ff,
    spanMeters: 3.1,
    positionAU: [20.433169403998, -61.301527896528, 2.252174135241],
    distanceAU: 64.656508,
  },
  {
    key: "parker",
    name: "Parker Solar Probe",
    model: "parker",
    color: 0xfff0a8,
    spanMeters: 3.0,
    positionAU: [0.545181250122, -0.195577515414, -0.034119254405],
    distanceAU: 0.580205,
  },
  {
    key: "jwst",
    name: "James Webb",
    model: "jwst",
    color: 0xf4ca65,
    spanMeters: 21.2,
    positionAU: [-0.542921985543, -0.865986305273, -0.001634129816],
    distanceAU: 1.022105,
  },
];

applyRealScaleSpecs();

const galacticTargets = [
  {
    key: "galactic-center",
    name: "Центр Млечного Пути",
    color: 0xffd487,
    positionKm: new THREE.Vector3(-SUN_TO_GALACTIC_CENTER_LY * LY_KM, 0, 0),
    approachDistanceKm: 2 * LY_KM,
  },
  {
    key: "milky-way-rim",
    name: "Край Млечного Пути",
    color: 0xa8d7ff,
    positionKm: new THREE.Vector3((MILKY_WAY_RADIUS_LY - SUN_TO_GALACTIC_CENTER_LY) * LY_KM, 0, 0),
    approachDistanceKm: 2 * LY_KM,
  },
];

initLights();
initStars();
initSolarSystem();
initAsteroidBelt();
initSpacecraft();
// Galaxy destinations remain outside the playable courier network.
// Preserved source helpers below for future exploration mode.

scene.background = new THREE.Color(0x030710);
initUi();
bindControls();
world.traverse(o => { if(o.userData.rotationSpeed) cachedRotating.push(o); });
scene.traverse(o => { if(o.userData.followCamera) cachedFollowers.push(o); });
applyQuality();
restoreFlight();
updateCampaignUi();
$("loadingPanel").hidden = true;
window.__ORBIT_ESCAPE__ = { get snapshot() { return {paused,panel,route:route?.target.key ?? null, energy,shield, joy:{x:joy.x,y:joy.y}, boosts:boostHeld, mission:campaign.getMission(), state:JSON.parse(JSON.stringify(campaign.state)), camera:camera.position.toArray(), selected:selectedTarget?.key, fps, drawCalls:renderer.info.render.calls, qualityLow}; } };
animate();

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

function initStars() {
  const starGeometry = new THREE.BufferGeometry();
  const starCount = 2400;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const color = new THREE.Color();

  for (let i = 0; i < starCount; i += 1) {
    const radius = THREE.MathUtils.randFloat(900, 7800);
    const theta = THREE.MathUtils.randFloat(0, Math.PI * 2);
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    const index = i * 3;

    positions[index] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index + 1] = radius * Math.cos(phi);
    positions[index + 2] = radius * Math.sin(phi) * Math.sin(theta);

    const starType = Math.random();
    if (starType > 0.92) {
      color.set("#ffd8a8");
    } else if (starType < 0.08) {
      color.set("#a9d7ff");
    } else {
      color.set("#ffffff");
    }

    const intensity = THREE.MathUtils.randFloat(0.55, 1.0);
    colors[index] = color.r * intensity;
    colors[index + 1] = color.g * intensity;
    colors[index + 2] = color.b * intensity;
  }

  starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  starGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const starField = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      size: 1.9,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );

  starField.userData.followCamera = true;
  starField.renderOrder = -100; starField.material.transparent = false; starField.material.depthTest = false;
  scene.add(starField);

  const dustGeometry = new THREE.BufferGeometry();
  const dustCount = 250;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustColors = new Float32Array(dustCount * 3);

  for (let i = 0; i < dustCount; i += 1) {
    const radius = THREE.MathUtils.randFloat(420, 4200);
    const theta = THREE.MathUtils.randFloat(0, Math.PI * 2);
    const y = THREE.MathUtils.randFloatSpread(180);
    const index = i * 3;

    dustPositions[index] = Math.cos(theta) * radius;
    dustPositions[index + 1] = y;
    dustPositions[index + 2] = Math.sin(theta) * radius;

    color.set(Math.random() > 0.55 ? "#ffca6a" : "#6ee7ff");
    dustColors[index] = color.r * 0.75;
    dustColors[index + 1] = color.g * 0.75;
    dustColors[index + 2] = color.b * 0.75;
  }

  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute("color", new THREE.BufferAttribute(dustColors, 3));

  const dust = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({
      size: 3.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  dust.userData.followCamera = true;
  dust.renderOrder = -99; dust.material.transparent = false; dust.material.depthTest = false;
  scene.add(dust);
}

function initSolarSystem() {
  const sunRadius = kmToWorld(SUN_RADIUS_KM);
  const sunMap = makeSunTexture();
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(sunRadius, 96, 64),
    new THREE.MeshBasicMaterial({
      map: sunMap,
      color: 0xffffff,
    }),
  );
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
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sunGlow.scale.setScalar(sunRadius * 8);
  sun.add(sunGlow);

  const solarCorona = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture("#fff6b0", "#ff3d00"),
      color: 0xffffff,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  solarCorona.scale.setScalar(sunRadius * 18);
  sun.add(solarCorona);

  planetSpecs.forEach((spec) => {
    const sunlight = auToWorld(spec.positionAU).negate().normalize();
    const planet = surfaces.create(spec.key, spec.radius, sunlight);
    planet.name = spec.name;
    planet.rotation.order = 'ZXY';
    planet.rotation.z = THREE.MathUtils.degToRad(axisTilt[spec.key]);
    planet.userData.rotationSpeed = spec.rotationSpeed * .025;
    planet.position.copy(auToWorld(spec.positionAU));
    planet.userData.trueRadius = spec.radius;
    planet.userData.approachDistance = spec.radius * (spec.rings ? 16 : 8) + SHIP_LENGTH_KM;
    world.add(planet);
    addOrbit(spec.orbitAU * AU_TO_UNITS, spec.colors[1]);
    addLabel(spec.name, planet, new THREE.Color(spec.colors[1]).getHex());
    addTarget(spec.name, planet, spec.key);

    planet.userData.spec = spec;

    if (spec.moon) {
      const moonPivot = new THREE.Group();
      planet.add(moonPivot);

      const moon = surfaces.create('moon', kmToWorld(1737.4), sunlight);
      moon.position.copy(auToWorld([0.000062379024, 0.002397512493, 0.000192102199]));
      moon.userData.trueRadius = kmToWorld(1737.4);
      moon.userData.approachDistance = moon.userData.trueRadius * 8 + SHIP_LENGTH_KM;
      moonPivot.add(moon);
      world.attach(moon);
      addLabel("Луна", moon, 0xd7d6cf);
      addTarget("Луна", moon, "moon");
      planet.userData.moonPivot = moonPivot;
    }

    if (spec.rings) {
      const ring = surfaces.rings(spec, sunlight);
      planet.add(ring);
    }
  });
}

function initAsteroidBelt() {
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const material = new THREE.MeshStandardMaterial({
    color: 0xb0a08a,
    roughness: 0.92,
    metalness: 0.05,
  });
  const belt = new THREE.InstancedMesh(geometry, material, 560);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();

  for (let i = 0; i < 560; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = THREE.MathUtils.randFloat(ASTEROID_BELT_INNER_AU, ASTEROID_BELT_OUTER_AU) * AU_TO_UNITS;
    const height = THREE.MathUtils.randFloatSpread(0.18);
    const size = kmToWorld(THREE.MathUtils.randFloat(8, 86));

    position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    euler.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    quaternion.setFromEuler(euler);
    scale.set(size, size * THREE.MathUtils.randFloat(0.55, 1.2), size);
    matrix.compose(position, quaternion, scale);
    belt.setMatrixAt(i, matrix);
  }

  belt.instanceMatrix.needsUpdate = true;
  belt.name = "Пояс астероидов";
  world.add(belt);

  const beltMarker = new THREE.Group();
  beltMarker.position.set(((ASTEROID_BELT_INNER_AU + ASTEROID_BELT_OUTER_AU) / 2) * AU_TO_UNITS, 0.02, 0);
  beltMarker.name = "Пояс астероидов";
  beltMarker.userData.approachDistance = 0.22;
  world.add(beltMarker);
  addLabel("Пояс астероидов", beltMarker, 0xffca6a);
  addTarget("Пояс астероидов", beltMarker, "asteroid-belt");
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
  const points = [];
  for (let i = 0; i <= 384; i += 1) {
    const angle = (i / 384) * Math.PI * 2;
    points.push(new THREE.Vector3(center.x + Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
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
  orbitLines.push(disk);
  world.add(disk);
}

function initNebulaBackdrop() {
  const nebulae = [
    { position: new THREE.Vector3(-2600, 720, -5200), scale: 1600, inner: "#e67aa8", outer: "#245d95" },
    { position: new THREE.Vector3(3900, -420, 3600), scale: 1180, inner: "#a8d7ff", outer: "#6f4aa6" },
  ];

  nebulae.forEach((nebula) => {
    const cloud = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeNebulaTexture(nebula.inner, nebula.outer),
        color: 0xffffff,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    cloud.position.copy(nebula.position);
    cloud.scale.setScalar(nebula.scale);
    cloud.userData.followCamera = true;
    cloud.userData.followOffset = nebula.position.clone();
    scene.add(cloud);
  });
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

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(`#${spec.color.toString(16).padStart(6, "0")}`, "#ffffff"),
      color: spec.color,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.userData.navigationAid = true;
  halo.scale.setScalar(spec.model === "jwst" ? 0.46 : 0.34);
  group.add(halo);
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

function addOrbit(radius, color) {
  const points = [];
  for (let i = 0; i <= 256; i += 1) {
    const angle = (i / 256) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }

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

function applyRealScaleSpecs() {
  planetSpecs.forEach((spec) => {
    spec.radius = kmToWorld(spec.trueRadiusKm);
  });
}

function auToWorld([x, y, z]) {
  return new THREE.Vector3(x * AU_TO_UNITS, z * AU_TO_UNITS, y * AU_TO_UNITS);
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

function addVisibilityAid(target, color) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeMarkerTexture(),
      color,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    }),
  );

  sprite.name = `${target.name} visibility marker`;
  sprite.userData.navigationAid = true;
  sprite.renderOrder = 30;
  world.add(sprite);
  visibilityAids.push({ sprite, target, baseColor: color });
}

function addTarget(name, object, key) {
  if (!object.name) object.name = name;
  const color = object.userData.targetColor ?? 0xffffff;
  const entry = { name, object, key };
  targetObjects.push(entry);
  addVisibilityAid(entry, color);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = name;
  button.addEventListener("click", () => selectTarget(key));
  targetList.append(button);
  targetButtons.set(key, button);
}

function selectTarget(key, lock = true) {
  const nextTarget = targetObjects.find((target) => target.key === key) ?? null;
  selectedTarget = nextTarget;
  targetPulse = 1;

  targetButtons.forEach((button) => button.classList.remove("is-active"));
  if (nextTarget) {
    targetButtons.get(nextTarget.key)?.classList.add("is-active");
    targetReadout.textContent = nextTarget.name;
  } else {
    targetReadout.textContent = "Свободный полет";
  }

  if (lock) {
    canvas.focus();
    requestLock();
  }
}

function initUi() {
  selectTarget("earth", false);
  placeCameraNearTarget("earth");
  orbitLines.forEach(o => o.visible = false);
  orbitToggle.onclick = () => { orbitsVisible = !orbitsVisible; orbitLines.forEach(o => o.visible = orbitsVisible); orbitToggle.setAttribute('aria-pressed',orbitsVisible); };
  labelsToggle.onclick = () => { labelsVisible = !labelsVisible; labelsRoot.hidden = !labelsVisible; labelsToggle.setAttribute('aria-pressed',labelsVisible); };
  jumpButton.onclick = () => startRoute();
  launchButton.textContent = campaign.state.started ? 'Продолжить полёт' : 'Начать экспедицию';
  campaign.subscribe(event => {
    updateCampaignUi();
    if (event.type === 'reward') {
      scanning = false; sound('reward'); haptic(35);
      notifyToast(event.mission ? 'Контракт выполнен' : 'Груз подобран', event.text);
      if(campaign.state.missionIndex === 12) {
        $('achievementTitle').textContent = 'Солнечная сеть восстановлена';
        $('achievementText').textContent = 'Ты завершил 12 рейсов. Все планеты доступны для свободных полётов, а новые контракты уже ждут.';
        $('achievement').hidden = false;
      }
    } else if(event.type === 'save-error') notifyToast('Сохранение недоступно',event.text);
  });
}

function showPanel(name) {
  panel = name; paused = !!name;
  const panels = {launch:'launchPanel',pause:'pausePanel',nav:'navPanel',contract:'contractPanel',settings:'settingsPanel',help:'helpPanel'};
  for(const [key,id] of Object.entries(panels)) $(id).hidden = key !== name;
  playing = campaign.state.started;
  document.body.classList.toggle('playing', playing && name !== 'launch');
  document.body.classList.toggle('modal-open',!!name);
  clearControls();
  if(paused) { document.exitPointerLock?.(); saveFlight(); }
  if(!paused)startAudio();
  if(audioCtx) { if(paused) audioCtx.suspend().catch(()=>{}); else if(campaign.state.settings.sound) audioCtx.resume().catch(()=>{}); }
  if(name === 'contract') updateCampaignUi();
  if(name === 'nav') updateTargetInfo();
  if(name === 'settings') {
    $('qualitySelect').value = getQualityPreference();
    $('sensitivityInput').value = campaign.state.settings.sensitivity;
    for(const key of ['invert','sound','haptics']) $(key+'Toggle').checked = campaign.state.settings[key === 'invert' ? 'invertY' : key];
  }
}

function placeCameraNearTarget(key) {
  const target = targetObjects.find(t=>t.key===key); if(!target) return;
  target.object.getWorldPosition(tempVec);
  const distance = getApproachDistance(target.object);
  camera.position.copy(tempVec).add(new THREE.Vector3(distance*.2,distance*.12,distance));
  velocity.set(0,0,0); lookAtWorldPosition(tempVec); createEncounter(target);
}
function lookAtWorldPosition(position) {
  const direction = position.clone().sub(camera.position).normalize();
  yaw = Math.atan2(-direction.x,-direction.z);
  pitch = Math.asin(THREE.MathUtils.clamp(direction.y,-1,1)); roll=0;
  camera.quaternion.setFromEuler(tempEuler.set(pitch,yaw,roll));
}
function getApproachDistance(object) {
  if(object.userData.spec?.trueRadiusKm || object.name === 'Луна') return object.userData.trueRadius * 6.8;
  return object.userData.approachDistance ?? Math.max((object.userData.trueRadius??1)*8,1);
}
function requestLock() { /* Drag-to-look works without browser pointer-lock permissions. */ }
function jumpToSelectedTarget() { startRoute(); }
function updateTargetInfo() {
  if($('targetInfo')) $('targetInfo').textContent = FACTS[selectedTarget?.key] || 'Исследуй аппарат в свободном полёте. Масштабы и скорости перелётов адаптированы для игры.';
  $('navigateButton').textContent = selectedTarget ? 'Курс: '+selectedTarget.name : 'Выбери цель';
}
function startRoute(local = false) {
  if(!selectedTarget || !playing) return;
  selectedTarget.object.getWorldPosition(tempVec);
  const end = tempVec.clone().add(new THREE.Vector3(0,0.12,1).multiplyScalar(getApproachDistance(selectedTarget.object)*(local?.48:1)));
  const distance = camera.position.distanceTo(end);
  if(distance < getApproachDistance(selectedTarget.object)*.03) { showPanel(''); return; }
  const duration = local ? 3.5 : Math.max(5,Math.min(11,5+Math.log10(Math.max(1,distance/1e6))*.8))/(1+campaign.state.upgrades.engine*.09);
  const midpoint = camera.position.clone().lerp(end,.5);
  // A high arc keeps interplanetary travel clear of the Sun.
  if(!local) midpoint.y += Math.max(distance*.28,SUN_RADIUS_KM*4);
  route = {target:selectedTarget,start:camera.position.clone(),end,midpoint,duration,time:0,local};
  velocity.set(0,0,0); scanning=false; showPanel('');
  sound('route'); notifyToast(local?'Точный подлёт':'Маршрут построен', 'Любой манёвр или «Тормоз» вернёт ручное управление.');
}
function nearestBody() {
  let nearest=null, ratio=Infinity;
  for(const t of targetObjects) {
    if(!FACTS[t.key] || t.key==='sun') continue;
    const r=t.object.userData.trueRadius; if(!r) continue;
    const d=camera.position.distanceTo(t.object.getWorldPosition(new THREE.Vector3()));
    if(d/r < ratio) { ratio=d/r; nearest=t; }
  }
  return {target:nearest,ratio};
}
function doAction() {
  if(paused) return;
  if(route) { route=null; velocity.set(0,0,0); return; }
  const m=campaign.getMission();
  if(!campaign.state.active) { showPanel('contract'); return; }
  const {target,ratio}=nearestBody();
  if(!target || target.key!==m.target || ratio>8) { selectTarget(m.target,false); startRoute(); return; }
  if(m.kind==='scan') { scanning=!scanning; velocity.set(0,0,0); if(scanning) { lookAtWorldPosition(target.object.getWorldPosition(new THREE.Vector3())); sound('scan'); } return; }
  if(ratio>3.9) { selectTarget(m.target,false); startRoute(true); return; }
  velocity.set(0,0,0); shield=100+campaign.state.upgrades.shield*25; energy=100;
  campaign.arrive(target.key); saveFlight(); sound('reward');
}
function clearControls() {
  keys.clear(); touchState.clear(); joy={x:0,y:0,id:null}; lookPointer=null; mouseDragging=false;
  boostHeld=false; brakeHeld=false;
  if($('joystickKnob')) $('joystickKnob').style.transform='translate(-50%,-50%)';
  $('boostButton')?.classList.remove('held'); $('brakeButton')?.classList.remove('held');
}
function bindControls() {
  launchButton.onclick = () => { const fresh=!campaign.state.started; campaign.start(); startAudio(); showPanel(''); if(fresh) { selectTarget(campaign.getMission().target,false); notifyToast('Добро пожаловать, пилот','Нажми «К цели». У Луны попробуй ручной полёт и стыковку.'); } };
  const actions = {pauseButton:()=>showPanel('pause'),resumeButton:()=>showPanel(''),navButton:()=>showPanel('nav'),closeNav:()=>showPanel(''),contractButton:()=>showPanel('contract'),closeContract:()=>showPanel(''),navigateButton:()=>startRoute(),actionButton:doAction,acceptMission:()=>{campaign.accept();selectTarget(campaign.getMission().target,false);showPanel('');},settingsButton:()=>{panelReturn='pause';showPanel('settings');},closeSettings:()=>showPanel(panelReturn),helpButton:()=>showPanel('help'),closeHelp:()=>showPanel('pause'),dismissAchievement:()=>{$('achievement').hidden=true;}};
  for(const [id,fn] of Object.entries(actions)) $(id).onclick=fn;
  let resetArmed=false;
  $('newGameButton').onclick=()=>{ if(!resetArmed) { resetArmed=true; $('newGameButton').textContent='Точно начать заново?'; setTimeout(()=>{resetArmed=false;$('newGameButton').textContent='Новая экспедиция';},4000); return; } campaign.reset();campaign.start(); route=null;scanning=false;shield=100;energy=100;placeCameraNearTarget('earth');selectTarget('moon',false);showPanel('');saveFlight(); };
  $('qualitySelect').onchange = event => {
    const value = event.target.value;
    setQualityPreference(value);
    campaign.setSetting('quality', value);
    applyQuality();
  };
  $('sensitivityInput').oninput=e=>campaign.setSetting('sensitivity',Number(e.target.value));
  for(const [id,key] of [['invertToggle','invertY'],['soundToggle','sound'],['hapticsToggle','haptics']]) $(id).onchange=e=>{campaign.setSetting(key,e.target.checked);if(key==='sound'&&!e.target.checked) audioCtx?.suspend();};
  const joystick=$('joystick');
  const setJoy=e=>{const r=joystick.getBoundingClientRect(); const dx=(e.clientX-r.left-r.width/2)/(r.width*.34),dy=(e.clientY-r.top-r.height/2)/(r.height*.34); const len=Math.max(1,Math.hypot(dx,dy)); joy.x=dx/len;joy.y=dy/len;$('joystickKnob').style.transform=`translate(calc(-50% + ${joy.x*40}px),calc(-50% + ${joy.y*40}px))`;};
  joystick.onpointerdown=e=>{if(paused||joy.id!==null)return;e.preventDefault();joy.id=e.pointerId;joystick.setPointerCapture(e.pointerId);setJoy(e);};
  joystick.onpointermove=e=>{if(joy.id===e.pointerId)setJoy(e);};
  const endJoy=e=>{if(joy.id!==e.pointerId)return;joy={x:0,y:0,id:null};$('joystickKnob').style.transform='translate(-50%,-50%)';};
  joystick.onpointerup=endJoy;joystick.onpointercancel=endJoy;joystick.onlostpointercapture=endJoy;
  for(const id of ['boostButton','brakeButton']) {
    const el=$(id); let pointer=null;
    el.onpointerdown=e=>{if(paused||pointer!==null)return;e.preventDefault();pointer=e.pointerId;el.setPointerCapture(pointer);el.classList.add('held');if(id==='boostButton'){boostHeld=true;haptic(12);}else{brakeHeld=true;route=null;scanning=false;}};
    const release=e=>{if(e.pointerId!==pointer)return;pointer=null;el.classList.remove('held');if(id==='boostButton')boostHeld=false;else brakeHeld=false;};
    el.onpointerup=release;el.onpointercancel=release;el.onlostpointercapture=release;
  }
  for(const el of [canvas,$('lookZone')]) {
    el.onpointerdown=e=>{if(paused||lookPointer)return;e.preventDefault();lookPointer={id:e.pointerId,x:e.clientX,y:e.clientY};el.setPointerCapture(e.pointerId);};
    el.onpointermove=e=>{if(paused||lookPointer?.id!==e.pointerId)return;const sensitivity=.003*campaign.state.settings.sensitivity; yaw-=(e.clientX-lookPointer.x)*sensitivity;pitch-=(e.clientY-lookPointer.y)*sensitivity*(campaign.state.settings.invertY?-1:1);pitch=THREE.MathUtils.clamp(pitch,-1.48,1.48);lookPointer.x=e.clientX;lookPointer.y=e.clientY;};
    const release=e=>{if(lookPointer?.id===e.pointerId)lookPointer=null;};el.onpointerup=release;el.onpointercancel=release;el.onlostpointercapture=release;
  }
  window.addEventListener('keydown',e=>{
    if(e.target.matches('input,select,textarea')) return;
    if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
    if(e.code==='Escape'&&!e.repeat){e.preventDefault();if(!back())exitCourier();return;} if(paused)return;
    keys.add(e.code);
    if(e.repeat)return;
    if(e.code==='KeyM')showPanel('nav');if(e.code==='KeyJ')showPanel('contract');if(e.code==='KeyE')doAction();
    if(e.code==='KeyT'){selectTarget(campaign.getMission().target,false);startRoute();}
    if(e.code==='KeyO')orbitToggle.click();if(e.code==='KeyL')labelsToggle.click();
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{clearControls();if(playing&&!paused)showPanel('pause');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearControls();if(playing)showPanel('pause');}});
  window.orbitCourierBack = back;
  window.addEventListener('nativepause',()=>{if(playing)showPanel('pause');saveFlight();});
  window.addEventListener('resize',resize);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    closeCourier('orbit:courier-lite');
  });
  $('exitLaunch').addEventListener('click', exitCourier);
  $('exitPause').addEventListener('click', exitCourier);
  window.addEventListener('pagehide', () => { clearControls(); saveFlight(); audioCtx?.suspend().catch(()=>{}); });
  document.addEventListener('freeze', () => { clearControls(); if(playing) showPanel('pause'); });
}
function closeCourier(name) {
  if (stopping) return;
  stopping = true;
  clearControls();
  saveFlight();
  if (audioCtx && audioCtx.state !== 'closed') audioCtx.close().catch(()=>{});
  surfaces.dispose();
  renderer.dispose();
  if (name === 'orbit:courier-exit') renderer.forceContextLoss();
  if (window.parent !== window) window.parent.dispatchEvent(new Event(name));
  else location.assign('../index.html');
}
function exitCourier() { closeCourier('orbit:courier-exit'); }

function back() {
  if (panel === 'launch') return false;
  if (!$('achievement').hidden) $('achievement').hidden = true;
  else if (panel === 'settings' || panel === 'help') showPanel('pause');
  else showPanel(paused ? '' : 'pause');
  return true;
}
function applyQuality() {
  qualityLow = budget.profile() === 'low';
  resize();
}
function resize() {
  camera.aspect = innerWidth / Math.max(1,innerHeight);
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(budget.pixelRatio(innerWidth,innerHeight));
  renderer.setSize(innerWidth,innerHeight);
}
function animate(now=0) {
  if (stopping || renderer.getContext().isContextLost()) return;
  requestAnimationFrame(animate);
  if(document.hidden){ budget.resetTiming(); return; }
  if (budget.frame(now)) applyQuality();

  if(qualityLow&&now-lastRenderTime<31)return;
  lastRenderTime=now;
  const delta=Math.min(clock.getDelta(),.06); const elapsed=clock.elapsedTime;
  fpsFrames++;fpsTime+=delta;if(fpsTime>=1){fps=Math.round(fpsFrames/fpsTime);fpsFrames=0;fpsTime=0;}
  if(!paused){updateCamera(delta);updateSolarSystem(delta,elapsed);saveTimer+=delta;if(saveTimer>12){saveTimer=0;saveFlight();}}
  else if(!playing) updateSolarSystem(delta*.2,elapsed);
  updateCameraAnchoredBackgrounds();updateVisibilityAids(elapsed);
  if(elapsed-lastHud>.08){updateHud();updateLabels();lastHud=elapsed;}
  surfaces.update(delta,camera.position,budget.profile());
  renderer.render(scene,camera);updateRenderProbe(elapsed);
}
function updateCamera(dt) {
  targetPulse = Math.max(0, targetPulse - dt * 0.8);
  const x=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'))+joy.x;
  const z=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'))-joy.y;
  const braking=brakeHeld||keys.has('Space'); const moving=Math.hypot(x,z)>.12;
  if(moving||braking){route=null;scanning=false;}
  if(route){
    route.time+=dt;const t=Math.min(1,route.time/route.duration);const u=t*t*(3-2*t);
    const old=camera.position.clone();
    camera.position.copy(route.start).multiplyScalar((1-u)*(1-u)).addScaledVector(route.midpoint,2*(1-u)*u).addScaledVector(route.end,u*u);
    velocity.copy(camera.position).sub(old).divideScalar(dt);
    route.target.object.getWorldPosition(tempVec);lookAtWorldPosition(tempVec);
    if(t>=1){const target=route.target;route=null;velocity.set(0,0,0);createEncounter(target);sound('arrive');saveFlight();notifyToast(target.name,'Ты на орбите. Маневрируй стиком или нажми кнопку действия.');}
    return;
  }
  const {target,ratio}=nearestBody();
  const r=target?.object.userData.trueRadius??6371;
  let localScale=r*.65;
  if(selectedTarget?.object.userData.kind==='spacecraft' && camera.position.distanceTo(selectedTarget.object.getWorldPosition(new THREE.Vector3())) < getApproachDistance(selectedTarget.object)*20) localScale=getApproachDistance(selectedTarget.object)*.3;
  const speed=Math.max(.001,localScale)*(1+campaign.state.upgrades.engine*.22);
  const boosting=(boostHeld||keys.has('ShiftLeft')||keys.has('ShiftRight'))&&energy>2&&moving&&!braking;
  energy=THREE.MathUtils.clamp(energy+dt*(boosting?-26:17),0,100);
  roll=THREE.MathUtils.lerp(roll,-x*.07,1-Math.exp(-5*dt));
  camera.quaternion.slerp(tempQuat.setFromEuler(tempEuler.set(pitch,yaw,roll)),1-Math.exp(-15*dt));
  camera.getWorldDirection(forward);right.set(1,0,0).applyQuaternion(camera.quaternion);
  const desired=forward.clone().multiplyScalar(z).addScaledVector(right,x);if(desired.length()>1)desired.normalize();
  desired.multiplyScalar(braking||scanning?0:speed*(boosting?2.4:1));
  velocity.lerp(desired,1-Math.exp(-(moving?3.8:6.5)*dt));camera.position.addScaledVector(velocity,dt);
  damageCooldown=Math.max(0,damageCooldown-dt);
  shield=Math.min(100+campaign.state.upgrades.shield*25,shield+dt*2);
  for(const body of targetObjects){
    const radius=body.object.userData.trueRadius;if(!radius||body.object.userData.kind==='spacecraft')continue;
    const center=body.object.getWorldPosition(new THREE.Vector3());const offset=camera.position.clone().sub(center);
    if(offset.length()<radius*1.22){if(offset.length()<1)offset.set(0,0,1);camera.position.copy(center).add(offset.setLength(radius*1.23));velocity.multiplyScalar(-.15);damage(18);}
  }
  updateEncounter(dt,r);
  if(scanning){
    const m=campaign.getMission();const near=target?.key===m.target&&ratio<8;
    const stable=velocity.length()<speed*.15;
    if(!near){scanning=false;notifyToast('Сигнал потерян','Вернись ближе к цели исследования.');}
    if(campaign.scan(dt,{targetKey:target?.key,near,stable})){scanning=false;saveFlight();}
  }
  camera.fov=THREE.MathUtils.lerp(camera.fov,boosting?68:64,dt*3);camera.updateProjectionMatrix();
}
function createEncounter(target) {
  if(encounterGroup){scene.remove(encounterGroup);encounterGroup.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});}
  encounter=[];encounterGroup=new THREE.Group();scene.add(encounterGroup);stationTarget=target.key;
  if(!FACTS[target.key])return;
  const r=target.object.userData.trueRadius; if(!r)return;
  const center=target.object.getWorldPosition(new THREE.Vector3());
  stationLocation=center.clone().add(new THREE.Vector3(0,r*.35,r*3.15));
  station=new THREE.Mesh(new THREE.TorusGeometry(r*.18,r*.022,8,40),new THREE.MeshBasicMaterial({color:0x74e4da}));
  station.position.copy(stationLocation);encounterGroup.add(station);
  for(let i=0;i<14;i++) {
    const collectible=i%3===0;
    const radius=r*(collectible?.035:.065);
    const mesh=new THREE.Mesh(collectible?new THREE.OctahedronGeometry(radius):new THREE.IcosahedronGeometry(radius,0),collectible?new THREE.MeshBasicMaterial({color:0xffcc7c}):new THREE.MeshStandardMaterial({color:0x697e92,roughness:.95}));
    const angle=i*2.399;
    mesh.position.copy(center).add(new THREE.Vector3(Math.sin(angle)*r*(.5+(i%3)*.35),Math.cos(angle)*r*.4,r*(3.8+i*.18)));
    encounterGroup.add(mesh);encounter.push({mesh,radius,collectible,done:false});
  }
}
function updateEncounter(dt,r) {
  for(const item of encounter){
    if(item.done)continue;item.mesh.rotation.y+=dt*.3;
    const d=camera.position.distanceTo(item.mesh.position);
    if(item.collectible&&d<r*(.21+campaign.state.upgrades.scanner*.09)){item.done=true;item.mesh.visible=false;campaign.salvage(1);sound('pickup');}
    else if(!item.collectible&&d<item.radius+r*.035){damage(12);velocity.multiplyScalar(-.2);camera.position.add(camera.position.clone().sub(item.mesh.position).normalize().multiplyScalar(r*.05));}
  }
}
function damage(amount){
  if(damageCooldown>0)return;damageCooldown=1.2;shield-=amount;haptic(35);sound('damage');document.body.classList.add('damaged');setTimeout(()=>document.body.classList.remove('damaged'),230);
  if(shield<=0){shield=100+campaign.state.upgrades.shield*25;route=null;placeCameraNearTarget('earth');notifyToast('Спасательная служба','Корабль доставлен к Земле. Контракт и кредиты сохранены.');saveFlight();}
}
function saveFlight(){
  if(!campaign.state.started)return;campaign.save();
  try{localStorage.setItem('orbit-escape.flight.v2',JSON.stringify({position:camera.position.toArray(),yaw,pitch,target:selectedTarget?.key,shield,energy}));}catch{}
}
function restoreFlight(){
  if(!campaign.state.started)return;
  try{const d=JSON.parse(localStorage.getItem('orbit-escape.flight.v2'));if(d&&Array.isArray(d.position)&&d.position.length===3&&d.position.every(v=>Number.isFinite(v)&&Math.abs(v)<1e14)&&Number.isFinite(d.yaw)&&Number.isFinite(d.pitch)){camera.position.fromArray(d.position);yaw=d.yaw;pitch=THREE.MathUtils.clamp(d.pitch,-1.48,1.48);camera.quaternion.setFromEuler(tempEuler.set(pitch,yaw,0));selectTarget(d.target??'earth',false);shield=Math.max(1,Math.min(100+campaign.state.upgrades.shield*25,Number(d.shield)||100));energy=Math.max(0,Math.min(100,Number(d.energy)||100));const t=nearestBody().target;if(t)createEncounter(t);}}catch{}
}
function haptic(ms){if(!campaign.state.settings.haptics||!touchDevice)return;if(window.OrbitNative?.haptic)window.OrbitNative.haptic(ms);else navigator.vibrate?.(ms);}
function notifyToast(title,text){$('toastTitle').textContent=title;$('toastText').textContent=text;$('toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').hidden=true,4300);}
function startAudio(){
  if(!campaign.state.settings.sound)return;
  try{audioCtx??=new (window.AudioContext||window.webkitAudioContext)();audioCtx.resume();if(!musicNodes.length){const gain=audioCtx.createGain();gain.gain.value=.014;gain.connect(audioCtx.destination);for(const f of [55,82.4,110.2]){const o=audioCtx.createOscillator();o.frequency.value=f;o.type='sine';o.connect(gain);o.start();musicNodes.push(o);}}}catch{}
}
function sound(kind){
  if(!campaign.state.settings.sound||!audioCtx)return;
  const notes={reward:[523,659,784],route:[164,246,329],arrive:[392,523],scan:[440,554],pickup:[880],damage:[90,60]}[kind]||[440];
  notes.forEach((frequency,i)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain(),t=audioCtx.currentTime+i*.11;o.frequency.value=frequency;o.type='sine';g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.075,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+.25);o.connect(g);g.connect(audioCtx.destination);o.start(t);o.stop(t+.27);});
}


function updateSolarSystem(delta) {
  for (const object of cachedRotating) object.rotation.y += object.userData.rotationSpeed * delta;
}
function updateCameraAnchoredBackgrounds() {
  for (const object of cachedFollowers) {
    object.position.copy(camera.position);
    if(object.userData.followOffset) object.position.add(object.userData.followOffset);
  }
}

function updateVisibilityAids(elapsed) {
  const viewportHeight = Math.max(window.innerHeight, 1);
  const angularWorldPerPixel = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) / viewportHeight;

  visibilityAids.forEach(({ sprite, target }) => {
    target.object.getWorldPosition(tempVec);
    sprite.position.copy(tempVec);

    const distance = camera.position.distanceTo(tempVec);
    const radius = target.object.userData.trueRadius ?? 0;
    const selected = target === selectedTarget;
    const pixels = selected ? 54 : 34;
    const screenScale = Math.max(distance * angularWorldPerPixel * pixels, radius * 4, 0.02);
    const nearFadeStart = Math.max(radius * 120, getApproachDistance(target.object) * 2, 0.35);
    const nearFadeEnd = Math.max(radius * 22, getApproachDistance(target.object) * 0.55, 0.08);
    const nearAlpha = THREE.MathUtils.smoothstep(distance, nearFadeEnd, nearFadeStart);
    const pulse = selected ? 1 + Math.sin(elapsed * 5.4) * 0.11 + targetPulse * 0.45 : 1;

    sprite.scale.setScalar(screenScale * pulse);
    sprite.material.opacity = (selected ? 0.78 : 0.42) * nearAlpha;
    sprite.visible = sprite.material.opacity > 0.015 && (selected || distance < nearFadeStart * 1.4);
  });
}

function updateCampaignUi(){
  const m=campaign.getMission();
  $('missionTitle').textContent=campaign.state.active?m.title:'Новый контракт доступен';
  $('missionCounter').textContent=`Рейс ${Math.min(campaign.state.missionIndex+1,12)} / 12`;
  $('creditsReadout').textContent=campaign.state.credits.toLocaleString('ru-RU');
  $('contractTitle').textContent=m.title;$('contractDescription').textContent=m.description;$('contractReward').textContent='Награда: '+m.reward+' кр.';
  $('acceptMission').disabled=campaign.state.active;$('acceptMission').textContent=campaign.state.active?'Контракт уже принят':'Принять контракт';
  $('upgradeList').textContent = '';
  for(const [id,upgrade] of Object.entries(UPGRADES)){
    const item=document.createElement('div');item.className='upgrade';
    const text=document.createElement('div');const title=document.createElement('strong');title.textContent=upgrade.title+' · '+campaign.state.upgrades[id]+'/4';const hint=document.createElement('p');hint.textContent=upgrade.description;text.append(title,hint);
    const btn=document.createElement('button');const cost=campaign.getUpgradeCost(id);btn.textContent=cost===null?'Максимум':cost+' кр.';btn.disabled=cost===null||campaign.state.credits<cost;btn.onclick=()=>{if(campaign.purchase(id)){sound('reward');updateCampaignUi();}};item.append(text,btn);$('upgradeList').append(item);
  }
}
function updateHud(){
  speedReadout.textContent=formatSpeed(velocity.length());
  if(selectedTarget){selectedTarget.object.getWorldPosition(tempVec);distanceReadout.textContent=formatDistance(camera.position.distanceTo(tempVec)/AU_TO_UNITS);}
  $('shieldBar').style.width=(shield/(100+campaign.state.upgrades.shield*25)*100)+'%';
  $('energyBar').style.width=energy+'%';$('scannerBar').style.width=(campaign.state.progress*100)+'%';
  $('shieldBar').parentElement.setAttribute('aria-valuenow',Math.round(shield));
  const {target,ratio}=nearestBody();const m=campaign.getMission();
  let label='К цели',hint='Автопилот довезёт до нужной планеты.';
  if(route){label='Отмена курса';hint=`Курс: ${route.target.name} · ${Math.ceil(route.duration-route.time)} с`;}
  else if(!campaign.state.active){label='Контракты';hint='Получи новый рейс и улучши корабль.';}
  else if(target?.key===m.target&&ratio<8){
    if(m.kind==='scan'){label=scanning?'Стоп скан':'Сканировать';hint=scanning?'Сканирование · сохраняй позицию':'Нажми «Сканировать». Корабль сам погасит скорость.';}
    else if(ratio<3.9){label='Стыковка';hint='Порт рядом. Нажми «Стыковка», чтобы передать груз.';}
    else{label='Автоподлёт';hint='Стик вперёд — подлёт к планете. Или включи помощь.';}
  }
  $('actionButton').textContent=label;$('missionHint').textContent=hint;
  $('statusReadout').textContent=route?'АВТОПИЛОТ':scanning?'ИССЛЕДОВАНИЕ':velocity.length()>1?'РУЧНОЙ ПОЛЁТ':'СТАБИЛИЗАЦИЯ';
  if($('targetInfo')&&!$('navPanel').hidden)updateTargetInfo();
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

  return `${Math.max(0, Math.round(km)).toLocaleString("ru-RU")} км`;
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
    const projected = tempVec.clone().project(camera);
    const visible =
      projected.z < 1 &&
      projected.z > -1 &&
      projected.x > -1.08 &&
      projected.x < 1.08 &&
      projected.y > -1.08 &&
      projected.y < 1.08;

    const relevant = selectedTarget?.object === object || distance < getApproachDistance(object) * 3;
    if (!visible || !relevant || !playing || distance < 0.00001) {
      element.style.opacity = "0";
      return;
    }

    const x = projected.x * halfWidth + halfWidth;
    const y = -projected.y * halfHeight + halfHeight;
    const opacity = THREE.MathUtils.clamp(1 - distance / 4e10, 0.32, 1);

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

function makePlanetTexture(spec) {
  const size = 512;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext("2d");
  const colors = spec.colors;

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, colors[1]);
  gradient.addColorStop(0.45, colors[0]);
  gradient.addColorStop(1, colors[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  if (spec.bands) {
    drawGasBands(ctx, size, colors);
  } else {
    drawRockPattern(ctx, size, colors, spec.roughness ?? 0.4);
  }

  const shade = ctx.createRadialGradient(size * 0.32, size * 0.32, size * 0.05, size * 0.52, size * 0.5, size * 0.72);
  shade.addColorStop(0, "rgba(255,255,255,0.22)");
  shade.addColorStop(0.56, "rgba(255,255,255,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.34)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function drawGasBands(ctx, size, colors) {
  for (let y = 0; y < size; y += 1) {
    const wave = Math.sin(y * 0.028) * 8 + Math.sin(y * 0.073) * 3;
    const mix = (Math.sin(y * 0.036 + wave * 0.02) + 1) / 2;
    ctx.fillStyle = blend(colors[0], colors[Math.random() > 0.5 ? 1 : 2], mix * 0.36);
    ctx.fillRect(0, y, size, 1);
  }

  for (let i = 0; i < 170; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const width = THREE.MathUtils.randFloat(22, 120);
    const height = THREE.MathUtils.randFloat(3, 11);
    ctx.fillStyle = `${colors[Math.floor(Math.random() * colors.length)]}55`;
    ctx.beginPath();
    ctx.ellipse(x, y, width, height, Math.random() * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(156, 54, 37, 0.46)";
  ctx.beginPath();
  ctx.ellipse(size * 0.67, size * 0.58, 42, 19, -0.15, 0, Math.PI * 2);
  ctx.fill();
}

function drawRockPattern(ctx, size, colors, roughness) {
  const blobs = Math.floor(160 + roughness * 240);

  for (let i = 0; i < blobs; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = THREE.MathUtils.randFloat(6, 42 + roughness * 48);
    const color = colors[Math.floor(Math.random() * colors.length)];
    const alpha = THREE.MathUtils.randFloat(0.08, 0.26 + roughness * 0.14);

    ctx.fillStyle = hexWithAlpha(color, alpha);
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      radius * THREE.MathUtils.randFloat(0.7, 1.8),
      radius * THREE.MathUtils.randFloat(0.35, 1),
      Math.random() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  for (let i = 0; i < 900; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = Math.random() > 0.52 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.055)";
    ctx.fillRect(x, y, THREE.MathUtils.randFloat(0.6, 1.8), THREE.MathUtils.randFloat(0.6, 1.8));
  }
}

function makeSunTexture() {
  const size = 512;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext("2d");

  const gradient = ctx.createRadialGradient(size * 0.38, size * 0.34, 20, size * 0.5, size * 0.52, size * 0.72);
  gradient.addColorStop(0, "#fff9bc");
  gradient.addColorStop(0.3, "#ffd76b");
  gradient.addColorStop(0.72, "#ff8f32");
  gradient.addColorStop(1, "#a4210b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 1300; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = THREE.MathUtils.randFloat(4, 34);
    ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.09)" : "rgba(136,32,7,0.12)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeCloudTexture() {
  const size = 512;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  for (let i = 0; i < 280; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = THREE.MathUtils.randFloat(12, 70);
    const alpha = THREE.MathUtils.randFloat(0.08, 0.28);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * THREE.MathUtils.randFloat(1.2, 2.8), radius * THREE.MathUtils.randFloat(0.22, 0.58), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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

function makeMarkerTexture() {
  const size = 256;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext("2d");
  const center = size / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(center, center, 62, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(center, 28);
  ctx.lineTo(center, 68);
  ctx.moveTo(center, size - 28);
  ctx.lineTo(center, size - 68);
  ctx.moveTo(28, center);
  ctx.lineTo(68, center);
  ctx.moveTo(size - 28, center);
  ctx.lineTo(size - 68, center);
  ctx.stroke();

  const glow = ctx.createRadialGradient(center, center, 0, center, center, center);
  glow.addColorStop(0, "rgba(255,255,255,0.18)");
  glow.addColorStop(0.38, "rgba(255,255,255,0.08)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeNebulaTexture(inner, outer) {
  const size = 512;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  const base = ctx.createRadialGradient(size * 0.48, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.5);
  base.addColorStop(0, hexWithAlpha(inner, 0.62));
  base.addColorStop(0.38, hexWithAlpha(outer, 0.22));
  base.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 120; i += 1) {
    const x = THREE.MathUtils.randFloat(size * 0.2, size * 0.8);
    const y = THREE.MathUtils.randFloat(size * 0.18, size * 0.82);
    const radius = THREE.MathUtils.randFloat(16, 96);
    const color = Math.random() > 0.48 ? inner : outer;
    ctx.fillStyle = hexWithAlpha(color, THREE.MathUtils.randFloat(0.035, 0.11));
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      radius * THREE.MathUtils.randFloat(1.4, 3.2),
      radius * THREE.MathUtils.randFloat(0.28, 0.74),
      THREE.MathUtils.randFloat(-0.9, 0.9),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeRingTexture(spec) {
  const size = 512;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = 1;
  const ctx = textureCanvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, size, 0);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.18, hexWithAlpha(spec.colors[2], 0.32));
  gradient.addColorStop(0.38, hexWithAlpha(spec.colors[1], 0.78));
  gradient.addColorStop(0.52, "rgba(20,15,9,0.12)");
  gradient.addColorStop(0.72, hexWithAlpha(spec.colors[0], 0.64));
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, 1);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function blend(hexA, hexB, amount) {
  const a = new THREE.Color(hexA);
  const b = new THREE.Color(hexB);
  a.lerp(b, amount);
  return `#${a.getHexString()}`;
}

function hexWithAlpha(hex, alpha) {
  const color = new THREE.Color(hex);
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `rgba(${r},${g},${b},${alpha})`;
}
