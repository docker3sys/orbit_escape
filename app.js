import * as THREE from "./vendor/three.module.js";
import { createSolarObservatory } from "./solar-observatory.js";
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

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  logarithmicDepthBuffer: true,
  powerPreference: "high-performance",
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
const textureLoader = new THREE.TextureLoader();
textureLoader.setPath("./assets/textures/");
const textureCache = new Map();

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 1e-7, 2e19);
camera.position.set(0, 9, 126);

const clock = new THREE.Clock();
let solarActive = false;
let solarFrame = 0;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);
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

const labelEntries = [];
const orbitLines = [];
const visibilityAids = [];
const targetButtons = new Map();
const targetObjects = [];

let selectedTarget = null;
let labelsVisible = false;
let orbitsVisible = false;
let yaw = 0;
let pitch = 0;
let roll = 0;
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
    airglow: 0xffd08b,
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
    airglow: 0x88d9ff,
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
    airglow: 0xffdfa5,
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
initGalaxyScaleTargets();
initMilkyWayOutline();
initNebulaBackdrop();
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

function initStars() {
  const starGeometry = new THREE.BufferGeometry();
  const starCount = 6200;
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
  scene.add(starField);

  const dustGeometry = new THREE.BufferGeometry();
  const dustCount = 1300;
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
    const planet = createPlanet(spec);
    planet.position.copy(auToWorld(spec.positionAU));
    planet.userData.trueRadius = spec.radius;
    planet.userData.approachDistance = spec.radius * (spec.rings ? 16 : 8) + SHIP_LENGTH_KM;
    world.add(planet);
    addOrbit(spec.orbitAU * AU_TO_UNITS, spec.colors[1]);
    addLabel(spec.name, planet, new THREE.Color(spec.colors[1]).getHex());
    addTarget(spec.name, planet, spec.key);

    planet.userData.spec = spec;

    if (spec.clouds) {
      const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(spec.radius * 1.022, 64, 42),
        new THREE.MeshStandardMaterial({
          map: makeCloudTexture(),
          transparent: true,
          opacity: 0.48,
          roughness: 0.9,
          metalness: 0,
          depthWrite: false,
        }),
      );
      clouds.userData.rotationSpeed = 0.18;
      planet.add(clouds);
      planet.userData.clouds = clouds;
    }

    if (spec.moon) {
      const moonPivot = new THREE.Group();
      planet.add(moonPivot);

      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(kmToWorld(1737.4), 36, 24),
        new THREE.MeshStandardMaterial({
          map: makePlanetTexture({
            colors: ["#8c8e91", "#d5d3cc", "#53555a", "#b8b8b4"],
            roughness: 0.78,
          }),
          roughness: 1,
        }),
      );
      moon.position.copy(auToWorld([0.000062379024, 0.002397512493, 0.000192102199]));
      moon.userData.trueRadius = kmToWorld(1737.4);
      moon.userData.approachDistance = moon.userData.trueRadius * 8 + SHIP_LENGTH_KM;
      moonPivot.add(moon);
      addLabel("Луна", moon, 0xd7d6cf);
      addTarget("Луна", moon, "moon");
      planet.userData.moonPivot = moonPivot;
    }

    if (spec.rings) {
      const ring = createRing(spec);
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

function createPlanet(spec) {
  const albedoTexture = loadPlanetTexture(spec) ?? makePlanetTexture(spec);
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(spec.radius, 72, 48),
    new THREE.MeshStandardMaterial({
      map: albedoTexture,
      roughness: 0.86,
      metalness: 0.02,
    }),
  );

  planet.name = spec.name;
  planet.rotation.z = THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-14, 14));
  planet.userData.rotationSpeed = spec.rotationSpeed;
  planet.userData.albedoTexture = albedoTexture;

  const nightRim = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(spec.colors[1], spec.colors[0]),
      color: new THREE.Color(spec.colors[1]),
      transparent: true,
      opacity: spec.key === "earth" ? 0.16 : 0.09,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  nightRim.scale.setScalar(spec.radius * 4.3);
  planet.add(nightRim);

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
  }

  return planet;
}

function loadPlanetTexture(spec) {
  if (!spec.texture) {
    return null;
  }

  if (textureCache.has(spec.texture)) {
    return textureCache.get(spec.texture);
  }

  const texture = textureLoader.load(spec.texture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  textureCache.set(spec.texture, texture);
  return texture;
}

function createRing(spec) {
  const ringTexture = makeRingTexture(spec);
  const inner = spec.rings === "thin" ? spec.radius * 1.45 : spec.radius * 1.35;
  const outer = spec.rings === "thin" ? spec.radius * 1.74 : spec.radius * 2.35;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 160, 5),
    new THREE.MeshBasicMaterial({
      map: ringTexture,
      color: 0xffffff,
      transparent: true,
      opacity: spec.rings === "thin" ? 0.42 : 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );

  ring.rotation.x = Math.PI / 2;
  ring.rotation.y = THREE.MathUtils.degToRad(spec.key === "uranus" ? 86 : -17);
  return ring;
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
  const color = object.userData.targetColor ?? 0xffffff;
  const entry = { name, object, key };
  targetObjects.push(entry);
  addVisibilityAid(entry, color);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = name;
  button.addEventListener("click", () => {
    selectTarget(key);
    if (compactSolar.matches) {
      setRouteOpen(false);
      touchJump.focus({ preventScroll: true });
    }
  });
  targetList.append(button);
  targetButtons.set(key, button);
}

function selectTarget(key, lock = true) {
  const nextTarget = targetObjects.find((target) => target.key === key) ?? null;
  selectedTarget = nextTarget;
  targetPulse = 1;

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
  routeButton.addEventListener("click", () => setRouteOpen(!routeOpen));
  compactSolar.addEventListener("change", () => setRouteOpen(false));
  touchJump.addEventListener("click", jumpToSelectedTarget);
  selectTarget("earth", false);
  placeCameraNearTarget("earth");
  orbitToggle.classList.toggle("chip--active", orbitsVisible);
  orbitToggle.setAttribute("aria-pressed", String(orbitsVisible));
  labelsToggle.classList.toggle("chip--active", labelsVisible);
  labelsToggle.setAttribute("aria-pressed", String(labelsVisible));
  labelsRoot.style.display = labelsVisible ? "block" : "none";

  orbitToggle.addEventListener("click", () => {
    orbitsVisible = !orbitsVisible;
    orbitToggle.classList.toggle("chip--active", orbitsVisible);
    orbitToggle.setAttribute("aria-pressed", String(orbitsVisible));
    orbitLines.forEach((orbit) => {
      orbit.visible = orbitsVisible;
    });
  });

  labelsToggle.addEventListener("click", () => {
    labelsVisible = !labelsVisible;
    labelsToggle.classList.toggle("chip--active", labelsVisible);
    labelsToggle.setAttribute("aria-pressed", String(labelsVisible));
    labelsRoot.style.display = labelsVisible ? "block" : "none";
  });

  jumpButton?.addEventListener("click", () => {
    jumpToSelectedTarget();
  });
}

function placeCameraNearTarget(key) {
  const target = targetObjects.find((entry) => entry.key === key);
  if (!target) {
    return;
  }

  target.object.getWorldPosition(tempVec);
  const approachDistance = getApproachDistance(target.object);
  camera.position.copy(tempVec).add(new THREE.Vector3(0, approachDistance * 0.32, approachDistance));
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

  const approachDistance = getApproachDistance(selectedTarget.object);
  camera.position.copy(tempVec).addScaledVector(currentDirection.normalize(), approachDistance);
  velocity.set(0, 0, 0);
  lookAtWorldPosition(tempVec);
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
  const direction = tempVec2.copy(position).sub(camera.position).normalize();
  yaw = Math.atan2(-direction.x, -direction.z);
  pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
  roll = 0;
  tempEuler.set(pitch, yaw, roll);
  camera.quaternion.copy(tempQuat.setFromEuler(tempEuler));
}

function getApproachDistance(object) {
  const radius = object.userData.trueRadius ?? 0;
  return object.userData.approachDistance ?? Math.max(radius * 8, 1e-6);
}

function shouldCaptureKey(event) {
  if (!solarActive) return false;
  const gameIsActive = document.pointerLockElement === canvas || launchPanel.classList.contains("is-hidden");
  const browserFlightShortcut =
    event.ctrlKey &&
    ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "Space", "ShiftLeft", "ShiftRight"].includes(event.code);
  return gameIsActive && (gameKeyCodes.has(event.code) || browserFlightShortcut);
}

function bindControls() {
  launchButton.addEventListener("click", () => {
    launchPanel.classList.add("is-hidden");
    requestLock();
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button === 0) requestLock();
  });

  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === canvas) {
      launchPanel.classList.add("is-hidden");
    }
  });

  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== canvas) {
      return;
    }

    yaw -= event.movementX * 0.0022;
    pitch -= event.movementY * 0.0022;
    pitch = THREE.MathUtils.clamp(pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
  });

  window.addEventListener("keydown", (event) => {
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

  window.addEventListener("keyup", (event) => {
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
  window.addEventListener("blur", releaseFlightControls);
  window.addEventListener("pagehide", releaseFlightControls);
  document.addEventListener("freeze", releaseFlightControls);

  window.addEventListener("resize", resize);

  canvas.addEventListener(
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
  solarTouch?.reset();
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

export function resumeSolarFlight() {
  if (solarActive) return;
  solarActive = true;
  launchPanel.classList.add("is-hidden");
  clock.getDelta();
  resize();
  if (compactSolar.matches && showTouchHint) {
    touchHint.hidden = false;
    hintTimer = setTimeout(hideTouchHint, 7400);
  }
  animate();
}

export function pauseSolarFlight() {
  solarActive = false;
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

function animate() {
  if (!solarActive) return;
  const delta = Math.min(clock.getDelta(), 0.04);
  const elapsed = clock.elapsedTime;

  updateCamera(delta);
  updateSolarSystem(delta, elapsed);
  updateCameraAnchoredBackgrounds();
  updateVisibilityAids(elapsed);
  updateHud(delta);
  updateLabels();

  renderer.render(scene, camera);
  updateRenderProbe(elapsed);
  solarFrame = requestAnimationFrame(animate);
}

function updateCamera(delta) {
  const rollDirection = Number(keys.has("KeyQ")) - Number(keys.has("KeyE"));
  roll = THREE.MathUtils.lerp(roll, rollDirection * 0.26, 1 - Math.exp(-8 * delta));

  tempEuler.set(pitch, yaw, roll);
  tempQuat.setFromEuler(tempEuler);
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

  const maxSpeed = superCruise ? LIGHT_SPEED_KM_S * 1000 : (afterburner ? 145 : 42) * FORWARD_CRUISE_MULTIPLIER;
  if (velocity.length() > maxSpeed) {
    velocity.setLength(maxSpeed);
  }

  velocity.multiplyScalar(Math.exp((superCruise ? -0.06 : -0.28) * delta));
  camera.position.addScaledVector(velocity, delta);

  const solarClearance = kmToWorld(SUN_RADIUS_KM) * 1.2 + SHIP_RADIUS_KM;
  if (camera.position.length() < solarClearance) {
    camera.position.setLength(solarClearance);
    velocity.multiplyScalar(0.62);
  }
}

// Assisted thrust is proportional to local clearance. A metre-size probe and a planet
// can both be inspected without changing gears or drifting through the target.
function flyWithStick(delta) {
  const { x, y } = solarTouch.state;
  if (x === 0 && y === 0 && velocity.lengthSq() === 0) return;
  let nearest = null;
  let clearance = Infinity;
  for (const target of targetObjects) {
    const radius = target.object.userData.trueRadius;
    if (!radius) continue;
    target.object.getWorldPosition(tempVec);
    const gap = camera.position.distanceTo(tempVec) - radius;
    if (gap < clearance) {
      nearest = target.object;
      clearance = gap;
    }
  }
  const limit = THREE.MathUtils.clamp(clearance * 0.74, 0.04, LIGHT_SPEED_KM_S * 0.5);
  touchVelocity.copy(forward).multiplyScalar(y * limit);
  touchVelocity.addScaledVector(right, x * limit * 0.72);
  velocity.lerp(touchVelocity, 1 - Math.exp(-(x || y ? 7 : 13) * delta));
  if (!x && !y && velocity.length() < limit * 0.008) velocity.set(0, 0, 0);
  camera.position.addScaledVector(velocity, delta);
  if (!nearest) return;
  nearest.getWorldPosition(tempVec);
  tempVec2.copy(camera.position).sub(tempVec);
  const radius = nearest.userData.trueRadius;
  const minDistance = radius + Math.max(radius * 0.04, SHIP_RADIUS_KM);
  if (tempVec2.lengthSq() < minDistance * minDistance) {
    tempVec2.normalize();
    camera.position.copy(tempVec).addScaledVector(tempVec2, minDistance);
    const inward = velocity.dot(tempVec2);
    if (inward < 0) velocity.addScaledVector(tempVec2, -inward);
  }
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
      speedScale = THREE.MathUtils.clamp((distance - (object.userData.trueRadius || 0)) * 0.74, 0.04, LIGHT_SPEED_KM_S * 0.5);
    }
  }
  return { speed: Math.min(1, velocity.length() / speedScale), target: selectedTarget?.key, near, jump: jumpCount };
}

function updateSolarSystem(delta, elapsed) {
  world.traverse((object) => {
    if (object.userData.rotationSpeed) {
      object.rotation.y += object.userData.rotationSpeed * delta;
    }

    if (object.userData.orbitSpeed) {
      object.rotation.y += object.userData.orbitSpeed * delta * 0.34;
    }
  });

  const sun = targetObjects.find((target) => target.key === "sun")?.object;
  if (sun) {
    sun.rotation.y += delta * 0.14;
  }

  targetObjects.forEach((target) => {
    if (target.object.userData.clouds) {
      target.object.userData.clouds.rotation.y += delta * 0.18;
    }

    if (target.object.userData.moonPivot) {
      target.object.userData.moonPivot.rotation.y += delta * 0.82;
    }
  });

  if (selectedTarget) {
    targetPulse = Math.max(0, targetPulse - delta * 0.8);
    selectedTarget.object.getWorldPosition(tempVec);

    raycaster.set(camera.position, tempVec2.copy(tempVec).sub(camera.position).normalize());
  }
}

function updateCameraAnchoredBackgrounds() {
  scene.traverse((object) => {
    if (!object.userData.followCamera) {
      return;
    }

    object.position.copy(camera.position);
    if (object.userData.followOffset) {
      object.position.add(object.userData.followOffset);
    }
  });
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
    sprite.visible = sprite.material.opacity > 0.015;
  });
}

function updateHud() {
  speedReadout.textContent = `${formatSpeed(velocity.length())}${superCruise ? " | SC" : ""}`;

  if (!selectedTarget) {
    distanceReadout.textContent = "--";
    return;
  }

  selectedTarget.object.getWorldPosition(tempVec);
  const distanceAU = camera.position.distanceTo(tempVec) / AU_TO_UNITS;
  distanceReadout.textContent = formatDistance(distanceAU);
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
    const projected = tempVec.clone().project(camera);
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
