import * as THREE from "three";

const GAS_Z = new Set([1, 2, 7, 8, 9, 10, 17, 18, 36, 54, 86, 118]);
const LIQUID_METAL_Z = new Set([31, 55, 80, 87]);
const LIQUID_NONMETAL_Z = new Set([35]);
const CRYSTAL_Z = new Set([5, 6, 14, 15, 16, 32, 33, 34, 51, 52, 53, 85]);
const NOBLE_Z = new Set([2, 10, 18, 36, 54, 86, 118]);
const DIATOMIC_Z = new Set([1, 7, 8, 9, 17, 35, 53]);
const DIAMOND_Z = new Set([6, 14, 32, 50]);
const BCC_Z = new Set([3, 11, 19, 23, 24, 26, 37, 41, 42, 55, 56, 63, 73, 74, 87, 88]);
const HCP_Z = new Set([4, 12, 21, 22, 27, 30, 39, 40, 43, 44, 48, 57, 59, 60, 61, 64, 65, 66, 67, 68, 69, 71, 72, 75, 76, 81, 95, 96, 97, 98]);

const ELEMENT_COLORS = {
  1: 0xa985d8, 2: 0xd9b89c, 6: 0x353942, 7: 0x7b90d8, 8: 0x76b4de,
  9: 0xc9cb88, 10: 0xd97352, 14: 0x626b7a, 15: 0xa6463f, 16: 0xd4be4c,
  17: 0xa3bf73, 18: 0x8f82d9, 22: 0x9aa2ad, 24: 0xc2c8d1, 26: 0x8d939e,
  27: 0x8b98ad, 28: 0xbab4a8, 29: 0xc87852, 30: 0xa5aeb8, 31: 0xbac3ce,
  32: 0x767d87, 34: 0x6e5d66, 35: 0x872f1d, 36: 0x9fc6d9, 46: 0xd1d4db,
  47: 0xe6e8ed, 53: 0x4e3c5e, 54: 0x799ed6, 55: 0xd8c182, 74: 0x7d838e,
  76: 0x8ea0b5, 78: 0xd8dce3, 79: 0xe3b84f, 80: 0xd2d7de, 82: 0x6f7580,
  83: 0xb6a4c7, 86: 0x9b8cc4, 92: 0x67706c, 94: 0x6d7570
};

function getElementVisual(el) {
  const z = el.num;
  const cat = el.catKey || "";
  const isGas = GAS_Z.has(z);
  const isLiquidMetal = LIQUID_METAL_Z.has(z);
  const isLiquidNonmetal = LIQUID_NONMETAL_Z.has(z);
  const isCrystal = CRYSTAL_Z.has(z);
  const isMetal = !isGas && !isLiquidNonmetal && !isCrystal && cat !== "nonmetal" && cat !== "noble" && cat !== "halogen";

  let hex = ELEMENT_COLORS[z];
  if (hex === undefined) {
    if (cat === "alkali") hex = 0xc5cad1;
    else if (cat === "alkaline") hex = 0xbec4cc;
    else if (cat === "lanthanide") hex = 0xb9bec7;
    else if (cat === "actinide") hex = 0x737b78;
    else if (cat === "metalloid") hex = 0x78808c;
    else if (cat === "nonmetal") hex = 0x6d7785;
    else if (cat === "halogen") hex = 0x6c6378;
    else if (cat === "noble") hex = 0x8ea6cf;
    else hex = 0xb4bac4;
  }

  let lat = "fcc";
  const latTxt = `${el.vis?.latEn || ""} ${el.vis?.latRu || ""}`.toLowerCase();
  if (NOBLE_Z.has(z) || latTxt.includes("monoatom") || latTxt.includes("одноатом")) lat = "noble";
  else if (DIATOMIC_Z.has(z) || latTxt.includes("diatom") || latTxt.includes("двухатом") || latTxt.includes("молекул")) lat = "molecular";
  else if (DIAMOND_Z.has(z) || latTxt.includes("diamond") || latTxt.includes("алмаз")) lat = "diamond";
  else if (HCP_Z.has(z) || latTxt.includes("hcp") || latTxt.includes("hexag") || latTxt.includes("гексагон")) lat = "hcp";
  else if (BCC_Z.has(z) || latTxt.includes("bcc") || latTxt.includes("оцк")) lat = "bcc";
  else if (latTxt.includes("simple") || latTxt.includes("примитив")) lat = "simple";

  let spec = "ingot";
  if (isLiquidMetal) spec = "liquid_metal";
  else if (isLiquidNonmetal) spec = "liquid_nonmetal";
  else if (isGas) spec = "gas";
  else if (z === 83) spec = "bismuth";
  else if (isCrystal) spec = "crystal";
  else if (cat === "alkali" || cat === "alkaline" || cat === "lanthanide" || cat === "actinide") spec = "nugget";

  return {
    hex,
    isMetal,
    metalness: isLiquidMetal ? 0.98 : isMetal ? 0.9 : (cat === "metalloid" ? 0.58 : 0.08),
    roughness: isLiquidMetal ? 0.045 : (z === 79 || z === 47 || z === 78 ? 0.16 : isMetal ? 0.24 : isCrystal ? 0.28 : 0.42),
    lat,
    spec
  };
}

/* ===== PROCEDURAL STUDIO ENVIRONMENT (CRISP REFLECTIONS, ZERO GLARE) ===== */
function createStudioEnv(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x0d1017);

  const addPanel = (color, intensity, w, h, x, y, z) => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    envScene.add(mesh);
  };

  addPanel(0xffffff, 2.1, 14, 10, 0, 12, 3);
  addPanel(0xfff5e8, 1.8, 9, 9, 11, 5, 8);
  addPanel(0xdbe8ff, 1.4, 10, 8, -11, 3, -6);
  addPanel(0xeef3ff, 0.85, 16, 6, 0, -9, 6);

  const rt = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  envScene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  return rt.texture;
}

/* ===== PRECOMPUTED LATTICE TEMPLATES ===== */
function buildLatticeTemplate(type) {
  const pts = [];
  const bonds = [];
  const addBondsByDist = (maxDist) => {
    const maxSq = maxDist * maxDist;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i][0] - pts[j][0];
        const dy = pts[i][1] - pts[j][1];
        const dz = pts[i][2] - pts[j][2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 0.001 && d2 <= maxSq) bonds.push([i, j]);
      }
    }
  };

  let atomR = 0.24;
  let boxSize = 2.0;

  if (type === "bcc") {
    const s = 1.05;
    boxSize = s * 2;
    for (const x of [-s, s]) for (const y of [-s, s]) for (const z of [-s, s]) pts.push([x, y, z]);
    pts.push([0, 0, 0]);
    for (let i = 0; i < 8; i++) bonds.push([i, 8]);
    atomR = 0.28;
  } else if (type === "fcc") {
    const s = 1.08;
    boxSize = s * 2;
    for (const x of [-s, s]) for (const y of [-s, s]) for (const z of [-s, s]) pts.push([x, y, z]);
    pts.push([s, 0, 0], [-s, 0, 0], [0, s, 0], [0, -s, 0], [0, 0, s], [0, 0, -s]);
    addBondsByDist(s * 1.46);
    atomR = 0.24;
  } else if (type === "hcp") {
    const r = 1.08;
    const h = 0.88;
    boxSize = 0;
    for (const y of [-h, h]) {
      pts.push([0, y, 0]);
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
      }
    }
    const rMid = r * 0.577;
    for (let k = 0; k < 3; k++) {
      const a = (k * 2 * Math.PI) / 3 + Math.PI / 6;
      pts.push([Math.cos(a) * rMid, 0, Math.sin(a) * rMid]);
    }
    addBondsByDist(r * 1.12);
    atomR = 0.23;
  } else if (type === "diamond") {
    const s = 1.08;
    boxSize = s * 2;
    for (const x of [-s, s]) for (const y of [-s, s]) for (const z of [-s, s]) pts.push([x, y, z]);
    pts.push([s, 0, 0], [-s, 0, 0], [0, s, 0], [0, -s, 0], [0, 0, s], [0, 0, -s]);
    const h = s * 0.5;
    pts.push([h, h, h], [-h, -h, h], [-h, h, -h], [h, -h, -h]);
    addBondsByDist(s * 0.92);
    atomR = 0.21;
  } else if (type === "molecular") {
    boxSize = 0;
    const centers = [
      [-0.85, 0.55, 0.35], [0.85, -0.5, 0.4],
      [0.45, 0.72, -0.65], [-0.55, -0.7, -0.55],
      [0.05, 0.02, 0.92], [-0.08, 0.05, -0.95]
    ];
    const dirs = [
      [0.8, 0.5, 0.3], [-0.7, 0.6, 0.35],
      [0.3, -0.8, 0.5], [0.6, 0.4, -0.7],
      [0.9, -0.25, 0.15], [-0.4, 0.85, 0.3]
    ];
    centers.forEach((c, idx) => {
      const d = dirs[idx];
      const len = Math.hypot(d[0], d[1], d[2]) || 1;
      const off = 0.24;
      const i0 = pts.length;
      pts.push([c[0] - (d[0] / len) * off, c[1] - (d[1] / len) * off, c[2] - (d[2] / len) * off]);
      pts.push([c[0] + (d[0] / len) * off, c[1] + (d[1] / len) * off, c[2] + (d[2] / len) * off]);
      bonds.push([i0, i0 + 1]);
    });
    atomR = 0.22;
  } else if (type === "noble") {
    boxSize = 0;
    pts.push([0, 0, 0]);
    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < 12; i++) {
      const y = 1 - (i / 11) * 2;
      const rr = Math.sqrt(Math.max(0, 1 - y * y));
      const th = phi * i;
      pts.push([Math.cos(th) * rr * 1.38, y * 1.38, Math.sin(th) * rr * 1.38]);
    }
    atomR = 0.24;
  } else {
    const s = 0.98;
    boxSize = s * 2;
    for (const x of [-s, s]) for (const y of [-s, s]) for (const z of [-s, s]) pts.push([x, y, z]);
    addBondsByDist(s * 2.05);
    atomR = 0.29;
  }

  return { pts, bonds, atomR, boxSize };
}

/* ===== HIGH-CRAFT SPECIMEN GEOMETRIES ===== */
function makeBeveledIngotGeo() {
  const w = 1.45, h = 0.92, r = 0.18;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.52,
    bevelEnabled: true,
    bevelSegments: 5,
    steps: 1,
    bevelSize: 0.12,
    bevelThickness: 0.12,
    curveSegments: 14
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function makeSmoothNuggetGeo() {
  const geo = new THREE.SphereGeometry(1.06, 56, 42);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n =
      0.065 * Math.sin(x * 2.4 + 0.5) * Math.cos(y * 2.2) +
      0.048 * Math.cos(z * 2.8 - x * 1.6) +
      0.032 * Math.sin(y * 3.7 + z * 2.1);
    const s = 1 + n;
    pos.setXYZ(i, x * s * 1.12, y * s * 0.86, z * s * 0.96);
  }
  geo.computeVertexNormals();
  return geo;
}

function makeLiquidDropGeo() {
  const pts = [];
  const steps = 36;
  pts.push(new THREE.Vector2(0.002, -0.44));
  pts.push(new THREE.Vector2(0.82, -0.44));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = -Math.PI * 0.44 + t * Math.PI * 0.94;
    const rx = 0.82 + Math.cos(ang) * 0.48;
    const ry = -0.02 + Math.sin(ang) * 0.56;
    const taper = t > 0.55 ? 1 - Math.pow((t - 0.55) / 0.45, 2.2) : 1;
    const x = Math.max(0.002, rx * (t > 0.55 ? (0.002 + 0.998 * taper) : 1));
    pts.push(new THREE.Vector2(x, ry));
  }
  pts.push(new THREE.Vector2(0.002, 0.56));
  const geo = new THREE.LatheGeometry(pts, 72);
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function makeAmpouleGeo(radius, halfBody) {
  const pts = [];
  const capSteps = 16;
  for (let i = 0; i <= capSteps; i++) {
    const a = -Math.PI / 2 + (i / capSteps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.002, Math.cos(a) * radius), -halfBody + Math.sin(a) * radius));
  }
  for (let i = 0; i <= capSteps; i++) {
    const a = (i / capSteps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.002, Math.cos(a) * radius), halfBody + Math.sin(a) * radius));
  }
  const geo = new THREE.LatheGeometry(pts, 56);
  geo.computeVertexNormals();
  return geo;
}

export function createScene3D({ stage, canvas, errEl, onHudUpdate }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
  } catch (_) {
    if (errEl) errEl.style.display = "flex";
    return {
      show() {},
      stop() {},
      resize() {},
      setTheme() {},
      setMode() {},
      getMode: () => "atom"
    };
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const envTex = createStudioEnv(renderer);
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  let camDist = 6.2;
  let targetCamDist = 6.2;
  camera.position.set(0, 0.25, camDist);

  /* Balanced, soft museum lighting — zero blowout */
  const hemiLight = new THREE.HemisphereLight(0xf6f8ff, 0x222836, 0.65);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfffaf2, 1.35);
  keyLight.position.set(5, 7, 6);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xcfe0ff, 0.65);
  rimLight.position.set(-6, 3, -5);
  scene.add(rimLight);

  const root = new THREE.Group();
  scene.add(root);

  /* Scratch objects for zero-GC 120fps render loop */
  const _mat4 = new THREE.Matrix4();
  const _pos = new THREE.Vector3();
  const _quat = new THREE.Quaternion();
  const _scale = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _dir = new THREE.Vector3();
  const _mid = new THREE.Vector3();

  /* ===== 1. ATOM GROUP (INSTANCED, ZERO REBUILD LAG) ===== */
  const atomGroup = new THREE.Group();
  root.add(atomGroup);

  const nucGeo = new THREE.SphereGeometry(1, 18, 14);
  const protonMat = new THREE.MeshStandardMaterial({ color: 0xd95838, metalness: 0.18, roughness: 0.36 });
  const neutronMat = new THREE.MeshStandardMaterial({ color: 0x8e96a6, metalness: 0.22, roughness: 0.4 });
  const MAX_NUC = 44;
  const protonMesh = new THREE.InstancedMesh(nucGeo, protonMat, MAX_NUC);
  const neutronMesh = new THREE.InstancedMesh(nucGeo, neutronMat, MAX_NUC);
  protonMesh.frustumCulled = false;
  neutronMesh.frustumCulled = false;
  atomGroup.add(protonMesh, neutronMesh);

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.22,
    depthWrite: false
  });
  const MAX_SHELLS = 7;
  const ringMeshes = [];
  const ringGeoUnit = new THREE.TorusGeometry(1, 0.0085, 8, 96);
  for (let i = 0; i < MAX_SHELLS; i++) {
    const rm = new THREE.Mesh(ringGeoUnit, ringMat);
    rm.visible = false;
    atomGroup.add(rm);
    ringMeshes.push(rm);
  }

  const elecGeo = new THREE.SphereGeometry(0.068, 16, 12);
  const elecMat = new THREE.MeshStandardMaterial({
    color: 0x58a6ff,
    emissive: 0x2a66c8,
    emissiveIntensity: 0.22,
    metalness: 0.35,
    roughness: 0.22
  });
  const MAX_ELEC = 118;
  const elecMesh = new THREE.InstancedMesh(elecGeo, elecMat, MAX_ELEC);
  elecMesh.frustumCulled = false;
  atomGroup.add(elecMesh);

  /* Typed arrays for zero-allocation electron animation */
  let elecCount = 0;
  const eR = new Float32Array(MAX_ELEC);
  const ePhase = new Float32Array(MAX_ELEC);
  const eSpeed = new Float32Array(MAX_ELEC);
  const eUX = new Float32Array(MAX_ELEC), eUY = new Float32Array(MAX_ELEC), eUZ = new Float32Array(MAX_ELEC);
  const eVX = new Float32Array(MAX_ELEC), eVY = new Float32Array(MAX_ELEC), eVZ = new Float32Array(MAX_ELEC);

  const SHELL_TILTS = [
    [0.25, 0.15], [-0.55, 0.65], [0.78, -0.42], [-0.32, -0.88],
    [0.95, 0.38], [-0.82, 0.22], [0.42, 0.92]
  ];

  function updateAtom(el) {
    const z = el.num;
    const totalNuc = z === 1 ? 1 : Math.min(64, Math.max(4, Math.round(z * 1.45)));
    const pTarget = Math.min(MAX_NUC, z === 1 ? 1 : Math.max(1, Math.round(totalNuc * 0.48)));
    const nTarget = Math.min(MAX_NUC, z === 1 ? 0 : Math.max(0, totalNuc - pTarget));
    const nucCount = pTarget + nTarget;
    const nucRadius = nucCount === 1 ? 0.26 : Math.min(0.62, 0.24 + Math.cbrt(nucCount) * 0.1);
    const ballR = nucCount === 1 ? 0.26 : Math.max(0.115, 0.22 - nucCount * 0.0014);

    let pi = 0, ni = 0;
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < nucCount; i++) {
      let x = 0, y = 0, zc = 0;
      if (nucCount > 1) {
        const t = (i + 0.5) / nucCount;
        const rad = nucRadius * Math.cbrt(t) * 0.88;
        const yy = 1 - 2 * t;
        const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
        const th = golden * i;
        x = Math.cos(th) * rr * rad;
        y = yy * rad;
        zc = Math.sin(th) * rr * rad;
      }
      _pos.set(x, y, zc);
      _scale.set(ballR, ballR, ballR);
      _quat.identity();
      _mat4.compose(_pos, _quat, _scale);
      const isP = (i % 2 === 0 && pi < pTarget) || ni >= nTarget;
      if (isP && pi < MAX_NUC) {
        protonMesh.setMatrixAt(pi++, _mat4);
      } else if (ni < MAX_NUC) {
        neutronMesh.setMatrixAt(ni++, _mat4);
      }
    }
    protonMesh.count = pi;
    neutronMesh.count = ni;
    protonMesh.instanceMatrix.needsUpdate = true;
    neutronMesh.instanceMatrix.needsUpdate = true;

    const shells = el.shells || [1];
    const sCount = Math.min(MAX_SHELLS, shells.length);
    const rMin = Math.max(0.92, nucRadius + 0.42);
    const rMax = sCount === 1 ? 1.38 : 2.38;
    const step = sCount > 1 ? (rMax - rMin) / (sCount - 1) : 0;

    let ei = 0;
    for (let s = 0; s < MAX_SHELLS; s++) {
      const rm = ringMeshes[s];
      if (s >= sCount) {
        rm.visible = false;
        continue;
      }
      const radius = rMin + step * s;
      const [tx, tz] = SHELL_TILTS[s];
      rm.visible = true;
      rm.scale.set(radius, radius, radius);
      rm.rotation.set(tx, 0, tz);

      const euler = new THREE.Euler(tx, 0, tz);
      const uVec = new THREE.Vector3(1, 0, 0).applyEuler(euler);
      const vVec = new THREE.Vector3(0, 1, 0).applyEuler(euler);

      const cnt = shells[s];
      const spd = (1.55 / (0.65 + s * 0.42)) * (s % 2 === 0 ? 1 : -1);
      for (let k = 0; k < cnt && ei < MAX_ELEC; k++) {
        eR[ei] = radius;
        ePhase[ei] = (k / cnt) * Math.PI * 2 + s * 0.7;
        eSpeed[ei] = spd;
        eUX[ei] = uVec.x; eUY[ei] = uVec.y; eUZ[ei] = uVec.z;
        eVX[ei] = vVec.x; eVY[ei] = vVec.y; eVZ[ei] = vVec.z;
        ei++;
      }
    }
    elecCount = ei;
    elecMesh.count = ei;
  }

  function stepElectrons(t) {
    const arr = elecMesh.instanceMatrix.array;
    for (let i = 0; i < elecCount; i++) {
      const a = ePhase[i] + t * eSpeed[i];
      const c = Math.cos(a) * eR[i];
      const s = Math.sin(a) * eR[i];
      const base = i * 16;
      arr[base] = 1; arr[base + 1] = 0; arr[base + 2] = 0; arr[base + 3] = 0;
      arr[base + 4] = 0; arr[base + 5] = 1; arr[base + 6] = 0; arr[base + 7] = 0;
      arr[base + 8] = 0; arr[base + 9] = 0; arr[base + 10] = 1; arr[base + 11] = 0;
      arr[base + 12] = c * eUX[i] + s * eVX[i];
      arr[base + 13] = c * eUY[i] + s * eVY[i];
      arr[base + 14] = c * eUZ[i] + s * eVZ[i];
      arr[base + 15] = 1;
    }
    elecMesh.instanceMatrix.needsUpdate = true;
  }

  /* ===== 2. LATTICE GROUP (PRECOMPUTED INSTANCED CRYSTALS) ===== */
  const latticeGroup = new THREE.Group();
  latticeGroup.visible = false;
  root.add(latticeGroup);

  const LATTICE_TEMPLATES = {
    bcc: buildLatticeTemplate("bcc"),
    fcc: buildLatticeTemplate("fcc"),
    hcp: buildLatticeTemplate("hcp"),
    diamond: buildLatticeTemplate("diamond"),
    molecular: buildLatticeTemplate("molecular"),
    noble: buildLatticeTemplate("noble"),
    simple: buildLatticeTemplate("simple")
  };

  const latAtomGeo = new THREE.SphereGeometry(1, 26, 20);
  const latAtomMat = new THREE.MeshStandardMaterial({ color: 0xc0c6d0, metalness: 0.72, roughness: 0.24 });
  const latAtomMesh = new THREE.InstancedMesh(latAtomGeo, latAtomMat, 32);
  latAtomMesh.frustumCulled = false;

  const latBondGeo = new THREE.CylinderGeometry(0.036, 0.036, 1, 10, 1);
  const latBondMat = new THREE.MeshStandardMaterial({
    color: 0x9aa4b4,
    metalness: 0.35,
    roughness: 0.5,
    transparent: true,
    opacity: 0.65
  });
  const latBondMesh = new THREE.InstancedMesh(latBondGeo, latBondMat, 72);
  latBondMesh.frustumCulled = false;

  const unitCellEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const unitCellMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 });
  const unitCellWire = new THREE.LineSegments(unitCellEdges, unitCellMat);

  latticeGroup.add(latAtomMesh, latBondMesh, unitCellWire);

  let lastLatType = "";
  function updateLattice(el, vis) {
    latAtomMat.color.setHex(vis.hex);
    latAtomMat.metalness = vis.isMetal ? 0.84 : 0.16;
    latAtomMat.roughness = vis.isMetal ? 0.22 : 0.38;

    if (lastLatType === vis.lat) return;
    lastLatType = vis.lat;
    const tpl = LATTICE_TEMPLATES[vis.lat] || LATTICE_TEMPLATES.fcc;

    _quat.identity();
    _scale.set(tpl.atomR, tpl.atomR, tpl.atomR);
    for (let i = 0; i < tpl.pts.length; i++) {
      const p = tpl.pts[i];
      _pos.set(p[0], p[1], p[2]);
      _mat4.compose(_pos, _quat, _scale);
      latAtomMesh.setMatrixAt(i, _mat4);
    }
    latAtomMesh.count = tpl.pts.length;
    latAtomMesh.instanceMatrix.needsUpdate = true;

    let bi = 0;
    for (let i = 0; i < tpl.bonds.length && bi < 72; i++) {
      const a = tpl.pts[tpl.bonds[i][0]];
      const b = tpl.pts[tpl.bonds[i][1]];
      _mid.set((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5);
      _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const len = _dir.length();
      if (len < 0.001) continue;
      _dir.divideScalar(len);
      _quat.setFromUnitVectors(_up, _dir);
      _scale.set(1, len, 1);
      _mat4.compose(_mid, _quat, _scale);
      latBondMesh.setMatrixAt(bi++, _mat4);
    }
    latBondMesh.count = bi;
    latBondMesh.instanceMatrix.needsUpdate = true;

    if (tpl.boxSize > 0) {
      unitCellWire.visible = true;
      unitCellWire.scale.set(tpl.boxSize, tpl.boxSize, tpl.boxSize);
    } else {
      unitCellWire.visible = false;
    }
  }

  /* ===== 3. SPECIMEN GROUP (PREBUILT HIGH-CRAFT SILHOUETTES) ===== */
  const specimenGroup = new THREE.Group();
  specimenGroup.visible = false;
  root.add(specimenGroup);

  const specSolidMat = new THREE.MeshStandardMaterial({
    color: 0xd0d5dd,
    metalness: 0.9,
    roughness: 0.22,
    envMapIntensity: 1.05
  });

  const specLiquidNonmetalMat = new THREE.MeshPhysicalMaterial({
    color: 0x872f1d,
    metalness: 0.05,
    roughness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    transparent: true,
    opacity: 0.9
  });

  /* 3a. Beveled metallic ingot */
  const ingotMesh = new THREE.Mesh(makeBeveledIngotGeo(), specSolidMat);
  ingotMesh.rotation.set(0.28, -0.35, 0.08);
  specimenGroup.add(ingotMesh);

  /* 3b. Smooth sculpted metallic nugget */
  const nuggetMesh = new THREE.Mesh(makeSmoothNuggetGeo(), specSolidMat);
  specimenGroup.add(nuggetMesh);

  /* 3c. Smooth liquid droplet + satellite micro-drop */
  const liquidGroup = new THREE.Group();
  const mainDropGeo = makeLiquidDropGeo();
  const mainDrop = new THREE.Mesh(mainDropGeo, specSolidMat);
  const subDrop = new THREE.Mesh(mainDropGeo, specSolidMat);
  subDrop.scale.set(0.28, 0.28, 0.28);
  subDrop.position.set(1.22, -0.32, 0.42);
  liquidGroup.add(mainDrop, subDrop);
  specimenGroup.add(liquidGroup);

  /* 3d. Architectural crystal cluster */
  const crystalGroup = new THREE.Group();
  const prismSpecs = [
    [0.36, 1.85, 0, 0, 0, 0.06, 0.1, -0.05],
    [0.28, 1.35, 0.48, -0.22, 0.2, 0.22, 0.4, -0.34],
    [0.26, 1.28, -0.46, -0.25, 0.16, -0.18, -0.3, 0.36],
    [0.24, 1.12, 0.12, -0.32, -0.46, -0.36, 0.2, -0.1],
    [0.22, 0.95, -0.22, -0.38, -0.35, -0.26, -0.5, 0.24]
  ];
  for (const [r, h, x, y, z, rx, ry, rz] of prismSpecs) {
    const sub = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.06, h, 6, 1), specSolidMat);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.15, 6, 1), specSolidMat);
    tip.position.y = h * 0.5 + r * 0.575;
    sub.add(shaft, tip);
    sub.position.set(x, y, z);
    sub.rotation.set(rx, ry, rz);
    crystalGroup.add(sub);
  }
  specimenGroup.add(crystalGroup);

  /* 3e. Bismuth stepped hopper crystal */
  const bismuthGroup = new THREE.Group();
  const bisMat = new THREE.MeshPhysicalMaterial({
    color: 0xb6a8cc,
    metalness: 0.92,
    roughness: 0.18,
    iridescence: 0.95,
    iridescenceIOR: 1.45,
    iridescenceThicknessRange: [180, 520]
  });
  for (let i = 0; i < 4; i++) {
    const s = 1.45 - i * 0.28;
    const h = 0.22;
    const step = new THREE.Mesh(new THREE.BoxGeometry(s, h, s), bisMat);
    step.position.y = (i - 1.5) * 0.24;
    step.rotation.y = i * 0.14;
    bismuthGroup.add(step);
  }
  bismuthGroup.rotation.set(0.32, 0.5, 0.16);
  specimenGroup.add(bismuthGroup);

  /* 3f. Glass gas ampoule (crisp clearcoat glass, subtle vapor core, zero neon bloom) */
  const gasGroup = new THREE.Group();
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xeef4ff,
    metalness: 0.06,
    roughness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.24,
    depthWrite: false
  });
  const ampouleShell = new THREE.Mesh(makeAmpouleGeo(0.54, 1.02), glassMat);
  const vaporMat = new THREE.MeshStandardMaterial({
    color: 0x8ea8e6,
    emissive: 0x5c7cc8,
    emissiveIntensity: 0.16,
    roughness: 0.7,
    metalness: 0.0,
    transparent: true,
    opacity: 0.42
  });
  const vaporCore = new THREE.Mesh(makeAmpouleGeo(0.42, 0.88), vaporMat);
  const capMat = new THREE.MeshStandardMaterial({ color: 0x8e95a3, metalness: 0.88, roughness: 0.26 });
  const capGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.14, 36);
  const topCap = new THREE.Mesh(capGeo, capMat);
  topCap.position.y = 1.12;
  const botCap = new THREE.Mesh(capGeo, capMat);
  botCap.position.y = -1.12;
  gasGroup.add(vaporCore, ampouleShell, topCap, botCap);
  gasGroup.rotation.z = -0.22;
  specimenGroup.add(gasGroup);

  function updateSpecimen(el, vis) {
    ingotMesh.visible = false;
    nuggetMesh.visible = false;
    liquidGroup.visible = false;
    crystalGroup.visible = false;
    bismuthGroup.visible = false;
    gasGroup.visible = false;

    specSolidMat.color.setHex(vis.hex);
    specSolidMat.metalness = vis.metalness;
    specSolidMat.roughness = vis.roughness;

    if (vis.spec === "liquid_metal") {
      mainDrop.material = specSolidMat;
      subDrop.material = specSolidMat;
      liquidGroup.visible = true;
    } else if (vis.spec === "liquid_nonmetal") {
      specLiquidNonmetalMat.color.setHex(vis.hex);
      mainDrop.material = specLiquidNonmetalMat;
      subDrop.material = specLiquidNonmetalMat;
      liquidGroup.visible = true;
    } else if (vis.spec === "gas") {
      vaporMat.color.setHex(vis.hex);
      vaporMat.emissive.setHex(vis.hex);
      gasGroup.visible = true;
    } else if (vis.spec === "bismuth") {
      bismuthGroup.visible = true;
    } else if (vis.spec === "crystal") {
      crystalGroup.visible = true;
    } else if (vis.spec === "nugget") {
      nuggetMesh.visible = true;
    } else {
      ingotMesh.visible = true;
    }
  }

  /* ===== INTERACTION: FINGER-FOLLOW ROTATION + PINCH ZOOM ===== */
  let rotX = 0.22, rotY = 0.35;
  let velX = 0, velY = 0;
  let dragging = false;
  let activePointers = new Map();
  let prevPinchDist = 0;
  let lastTap = 0;

  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    stage.setPointerCapture(e.pointerId);
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 1) {
      dragging = true;
      velX = 0;
      velY = 0;
      const now = performance.now();
      if (now - lastTap < 280) {
        rotX = 0.22;
        rotY = 0.35;
        targetCamDist = 6.2;
      }
      lastTap = now;
    } else if (activePointers.size === 2) {
      dragging = false;
      const pts = [...activePointers.values()];
      prevPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  });

  stage.addEventListener("pointermove", (e) => {
    const prev = activePointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;

    if (activePointers.size === 1 && dragging) {
      const sens = 0.0075;
      rotY += dx * sens;
      rotX = Math.max(-1.35, Math.min(1.35, rotX + dy * sens));
      velY = dx * sens * 0.45;
      velX = dy * sens * 0.45;
    } else if (activePointers.size === 2) {
      const pts = [...activePointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (prevPinchDist > 0) {
        targetCamDist = Math.max(3.4, Math.min(10.5, targetCamDist - (dist - prevPinchDist) * 0.018));
      }
      prevPinchDist = dist;
    }
  });

  const endPointer = (e) => {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) prevPinchDist = 0;
    if (activePointers.size === 0) dragging = false;
  };
  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", endPointer);

  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    targetCamDist = Math.max(3.4, Math.min(10.5, targetCamDist + e.deltaY * 0.004));
  }, { passive: false });

  /* ===== STATE, THEME, RESIZE & VISIBILITY-AWARE 120FPS LOOP ===== */
  let mode = "atom";
  let currentEl = null;
  let currentVis = null;
  let running = false;
  let inViewport = true;
  let rafId = 0;
  let lastFrameTime = 0;
  let simTime = 0;
  let lastW = 0, lastH = 0;

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w < 2 || h < 2) return;
    if (w === lastW && h === lastH) return;
    lastW = w;
    lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(resize).observe(stage);
  }
  if (typeof IntersectionObserver !== "undefined") {
    new IntersectionObserver((entries) => {
      inViewport = entries[0]?.isIntersecting ?? true;
      if (inViewport && running && !rafId) {
        lastFrameTime = performance.now();
        rafId = requestAnimationFrame(loop);
      }
    }, { threshold: 0.01 }).observe(stage);
  }

  function applyActiveMode() {
    atomGroup.visible = mode === "atom";
    latticeGroup.visible = mode === "lattice";
    specimenGroup.visible = mode === "specimen";
    if (!currentEl || !currentVis) return;
    if (mode === "atom") updateAtom(currentEl);
    else if (mode === "lattice") updateLattice(currentEl, currentVis);
    else updateSpecimen(currentEl, currentVis);
  }

  function loop(now) {
    if (!running || !inViewport) {
      rafId = 0;
      return;
    }
    rafId = requestAnimationFrame(loop);

    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) * 0.001));
    lastFrameTime = now;
    simTime += dt;

    if (!dragging) {
      const decay = Math.exp(-7.5 * dt);
      rotY += velY * (dt * 60) + 0.24 * dt;
      rotX = Math.max(-1.35, Math.min(1.35, rotX + velX * (dt * 60)));
      velX *= decay;
      velY *= decay;
    }

    camDist += (targetCamDist - camDist) * Math.min(1, 12 * dt);
    camera.position.z = camDist;

    root.rotation.y = rotY;
    root.rotation.x = rotX;

    if (mode === "atom") {
      stepElectrons(simTime);
    }

    renderer.render(scene, camera);
  }

  function setTheme(theme) {
    const light = theme === "light";
    scene.background = new THREE.Color(light ? 0xeef2f9 : 0x06070b);
    ringMat.color.setHex(light ? 0x182238 : 0xfcfaff);
    ringMat.opacity = light ? 0.22 : 0.20;
    unitCellMat.color.setHex(light ? 0x182238 : 0xfcfaff);
    unitCellMat.opacity = light ? 0.22 : 0.16;
    protonMat.color.setHex(light ? 0xc83e4d : 0xea5c2a);
    elecMat.color.setHex(light ? 0x2457c5 : 0x6cb0ff);
    elecMat.emissive.setHex(light ? 0x183e8f : 0x2458b8);
    hemiLight.intensity = light ? 0.85 : 0.62;
    renderer.toneMappingExposure = light ? 1.06 : 1.0;
  }

  function show(el) {
    if (!el) return;
    currentEl = el;
    currentVis = getElementVisual(el);
    applyActiveMode();
    if (onHudUpdate) onHudUpdate(el, mode);
    resize();
    if (!running) {
      running = true;
      lastFrameTime = performance.now();
      if (inViewport && !rafId) rafId = requestAnimationFrame(loop);
    } else if (!rafId && inViewport) {
      lastFrameTime = performance.now();
      rafId = requestAnimationFrame(loop);
    }
  }

  function stop() {
    running = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function setMode(nextMode) {
    if (mode === nextMode) return;
    mode = nextMode;
    applyActiveMode();
    if (currentEl && onHudUpdate) onHudUpdate(currentEl, mode);
  }

  setTheme("dark");

  return {
    show,
    stop,
    resize,
    setTheme,
    setMode,
    getMode: () => mode
  };
}
