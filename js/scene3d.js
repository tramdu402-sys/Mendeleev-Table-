import * as THREE from "three";

const TAU = Math.PI * 2;
const WORLD_X = new THREE.Vector3(1, 0, 0);
const WORLD_Y = new THREE.Vector3(0, 1, 0);
const HOME_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.28, 0.48, 0, "YXZ"));

/* ===== DETERMINISTIC SMOOTH 3D NOISE FOR HIGH-POLY SCULPTING ===== */
function hash3(ix, iy, iz, seed) {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 2147483647) + Math.imul(seed, 1274126177);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function noise3(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const n000 = hash3(ix, iy, iz, seed),     n100 = hash3(ix + 1, iy, iz, seed);
  const n010 = hash3(ix, iy + 1, iz, seed), n110 = hash3(ix + 1, iy + 1, iz, seed);
  const n001 = hash3(ix, iy, iz + 1, seed), n101 = hash3(ix + 1, iy, iz + 1, seed);
  const n011 = hash3(ix, iy + 1, iz + 1, seed), n111 = hash3(ix + 1, iy + 1, iz + 1, seed);

  const nx00 = n000 + (n100 - n000) * ux;
  const nx10 = n010 + (n110 - n010) * ux;
  const nx01 = n001 + (n101 - n001) * ux;
  const nx11 = n011 + (n111 - n011) * ux;
  const nxy0 = nx00 + (nx10 - nx00) * uy;
  const nxy1 = nx01 + (nx11 - nx01) * uy;
  return (nxy0 + (nxy1 - nxy0) * uz) * 2 - 1;
}

function fbm3(x, y, z, seed, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise3(x * freq, y * freq, z * freq, seed + i * 31) * amp;
    freq *= 2.05;
    amp *= 0.5;
  }
  return sum;
}

/* Fix UV seam normals on indexed SphereGeometry so reflections are 100% seamless */
function fixSphereSeamNormals(geo, segW, segH) {
  geo.computeVertexNormals();
  const n = geo.attributes.normal;
  const rowStride = segW + 1;
  for (let iy = 0; iy <= segH; iy++) {
    const i0 = iy * rowStride;
    const i1 = i0 + segW;
    let nx = n.getX(i0) + n.getX(i1);
    let ny = n.getY(i0) + n.getY(i1);
    let nz = n.getZ(i0) + n.getZ(i1);
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    n.setXYZ(i0, nx, ny, nz);
    n.setXYZ(i1, nx, ny, nz);
  }
  n.needsUpdate = true;
}

export function createScene3D({ stage, canvas, errEl, onHudUpdate }) {
  let renderer = null, scene = null, camera = null;
  let rootGroup = null, contentGroup = null;
  let keyLight = null, rimLight = null, fillLight = null, hemiLight = null;
  let envTexture = null;

  const procTex = { glow: null, brushed: null, grain: null };

  const sharedGeo = {
    sphereHi: new THREE.SphereGeometry(1, 36, 28),
    sphereMid: new THREE.SphereGeometry(1, 22, 16),
    sphereLow: new THREE.SphereGeometry(1, 14, 10),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 18, 1)
  };

  const tmpM4 = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const tmpScale = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const qStepX = new THREE.Quaternion();
  const qStepY = new THREE.Quaternion();
  const upVec = new THREE.Vector3(0, 1, 0);

  const state = {
    ok: false, initialized: false, running: false, rafId: 0,
    mode: "atom", theme: "dark", el: null,
    quat: HOME_QUAT.clone(),
    velX: 0, velY: 0.28, autoSpin: 0.28,
    resettingCam: false, zoom: 1.0, targetZoom: 1.0,
    morphScale: 1, morphVel: 0,
    pointers: new Map(), dragging: false, dragDist: 0,
    lastX: 0, lastY: 0, lastPinchDist: 0,
    time: 0, lastFrame: 0,
    dyn: null
  };

  /* ===== PROCEDURAL TEXTURES ===== */
  function makeGlowTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0.0, "rgba(255,255,255,1)");
    g.addColorStop(0.22, "rgba(255,255,255,0.78)");
    g.addColorStop(0.52, "rgba(255,255,255,0.18)");
    g.addColorStop(1.0, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function makeBrushedTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#848484";
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y++) {
      const v = 124 + ((Math.sin(y * 1.9) * 10 + Math.cos(y * 6.1) * 7) | 0);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(0, y, 256, 1);
    }
    for (let i = 0; i < 420; i++) {
      const y = (i * 53) % 256, x = (i * 97) % 256, w = 24 + (i % 90);
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.09)";
      ctx.fillRect(x, y, w, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 3);
    return t;
  }

  function makeMicroGrainTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(256, 256);
    const d = img.data;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const n = fbm3(x * 0.08, y * 0.08, 1.3, 19, 3);
        const v = Math.max(0, Math.min(255, Math.round(128 + n * 75)));
        const idx = (y * 256 + x) * 4;
        d[idx] = d[idx + 1] = d[idx + 2] = v;
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    return t;
  }

  /* ===== SMOOTH 360° STUDIO EQUIRECTANGULAR HDR ENVIRONMENT ===== */
  function buildStudioEnv(rend) {
    const W = 512, H = 256;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");

    // Smooth vertical studio sky-to-floor gradient (no blocky squares!)
    const base = ctx.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0.0, "#eef4ff");
    base.addColorStop(0.22, "#b5c5df");
    base.addColorStop(0.46, "#4f5c74");
    base.addColorStop(0.52, "#1c2230");
    base.addColorStop(0.68, "#2c3448");
    base.addColorStop(1.0, "#626e86");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    // Smooth curved studio softbox reflections (gives buttery liquid-chrome & gem highlights)
    const addSpot = (cx, cy, rx, ry, color, alpha) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0.0, color);
      g.addColorStop(0.45, color);
      g.addColorStop(1.0, "rgba(255,255,255,0)");
      ctx.globalAlpha = alpha;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, TAU);
      ctx.fill();
      ctx.restore();
    };

    // Main overhead diffuser
    addSpot(W * 0.5, H * 0.14, 210, 44, "#ffffff", 0.95);
    // Warm right key softbox
    addSpot(W * 0.22, H * 0.36, 95, 58, "#fff2e0", 0.90);
    // Cool left fill softbox
    addSpot(W * 0.76, H * 0.34, 105, 62, "#dceaff", 0.88);
    // Back rim highlight strip
    addSpot(W * 0.50, H * 0.44, 70, 26, "#ffffff", 0.75);
    // Subtle dark horizon accents for crisp chrome contrast
    addSpot(W * 0.36, H * 0.56, 65, 22, "#0b0e16", 0.65);
    addSpot(W * 0.64, H * 0.56, 65, 22, "#0b0e16", 0.65);
    // Soft floor bounce
    addSpot(W * 0.5, H * 0.86, 180, 45, "#a6b6d4", 0.50);

    const eqTex = new THREE.CanvasTexture(c);
    eqTex.mapping = THREE.EquirectangularReflectionMapping;
    eqTex.colorSpace = THREE.SRGBColorSpace;

    const pmrem = new THREE.PMREMGenerator(rend);
    pmrem.compileEquirectangularShader();
    const rt = pmrem.fromEquirectangular(eqTex);
    eqTex.dispose();
    pmrem.dispose();
    return rt.texture;
  }

  function ensureInit() {
    if (state.initialized) return;
    state.initialized = true;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
      camera.position.set(0, 0.02, 3.85);

      procTex.glow = makeGlowTexture();
      procTex.brushed = makeBrushedTexture();
      procTex.grain = makeMicroGrainTexture();

      envTexture = buildStudioEnv(renderer);
      scene.environment = envTexture;

      hemiLight = new THREE.HemisphereLight(0xf6f9ff, 0x38415a, 1.1);
      scene.add(hemiLight);

      keyLight = new THREE.DirectionalLight(0xfffaf2, 1.9);
      keyLight.position.set(-3.8, 5.5, 5.2);
      scene.add(keyLight);

      rimLight = new THREE.DirectionalLight(0xcbe2ff, 1.45);
      rimLight.position.set(4.8, 2.2, -4.2);
      scene.add(rimLight);

      fillLight = new THREE.PointLight(0xffe6d0, 1.1, 18);
      fillLight.position.set(3.4, -3.2, 4.2);
      scene.add(fillLight);

      rootGroup = new THREE.Group();
      rootGroup.quaternion.copy(state.quat);
      scene.add(rootGroup);

      contentGroup = new THREE.Group();
      rootGroup.add(contentGroup);

      state.ok = true;
      setTheme(state.theme);
      resize();
    } catch (_) {
      state.ok = false;
      errEl.style.display = "flex";
    }
  }

  function resize() {
    if (!state.ok) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    if (w < 2 || h < 2) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);

  function setTheme(theme) {
    state.theme = theme;
    if (!state.ok) return;
    const light = theme === "light";
    renderer.setClearColor(light ? 0xeef2f9 : 0x06070b, 1);
    hemiLight.intensity = light ? 1.35 : 1.05;
    if (state.el) build(state.el);
  }

  function clearContent() {
    while (contentGroup.children.length > 0) {
      const ch = contentGroup.children[0];
      contentGroup.remove(ch);
      ch.traverse((node) => {
        if (node.userData?.ownGeo && node.geometry) node.geometry.dispose();
        if (node.userData?.ownMat && node.material) {
          if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
          else node.material.dispose();
        }
      });
    }
    state.dyn = null;
  }

  function ownMesh(geo, mat) {
    const m = new THREE.Mesh(geo, mat);
    m.userData.ownGeo = true;
    m.userData.ownMat = true;
    return m;
  }

  /* ===== NATURAL ELEMENT MATERIAL FACTORY ===== */
  function makeNaturalMaterial(el, opts = {}) {
    const n = el.num, v = el.vis;
    const bump = opts.bump === "brushed" ? procTex.brushed : (opts.bump === "grain" ? procTex.grain : null);
    const bCfg = bump ? { bumpMap: bump, bumpScale: opts.bumpScale ?? 0.012 } : {};

    if (n === 83) {
      return new THREE.MeshPhysicalMaterial({
        color: 0xc2d0e4, metalness: 0.94, roughness: 0.13,
        iridescence: 1.0, iridescenceIOR: 1.95, iridescenceThicknessRange: [150, 740],
        clearcoat: 0.9
      });
    }
    if (n === 6) {
      return new THREE.MeshPhysicalMaterial({
        color: 0xf0f8ff, metalness: 0.05, roughness: 0.02,
        transparent: true, opacity: 0.80, clearcoat: 1.0, clearcoatRoughness: 0.02,
        reflectivity: 1.0, iridescence: 1.0, iridescenceIOR: 2.42,
        iridescenceThicknessRange: [120, 520], envMapIntensity: 1.5
      });
    }
    if (n === 35) {
      return new THREE.MeshPhysicalMaterial({
        color: 0x9b1a08, emissive: 0x3b0700, emissiveIntensity: 0.55,
        metalness: 0.06, roughness: 0.04, clearcoat: 1.0, clearcoatRoughness: 0.03,
        transparent: true, opacity: 0.92, envMapIntensity: 1.35
      });
    }
    if (n === 16) {
      return new THREE.MeshPhysicalMaterial({
        color: 0xf4dc26, emissive: 0x332800, emissiveIntensity: 0.22,
        metalness: 0.04, roughness: 0.18, clearcoat: 0.82, clearcoatRoughness: 0.12, ...bCfg
      });
    }
    if (n === 15) {
      return new THREE.MeshPhysicalMaterial({
        color: 0xc83222, emissive: 0x260502, emissiveIntensity: 0.2,
        metalness: 0.08, roughness: 0.22, clearcoat: 0.7, ...bCfg
      });
    }
    if (n === 53) {
      return new THREE.MeshPhysicalMaterial({
        color: 0x522678, metalness: 0.84, roughness: 0.14, clearcoat: 0.85,
        iridescence: 0.65, iridescenceIOR: 1.7, ...bCfg
      });
    }
    if (n === 5) {
      return new THREE.MeshPhysicalMaterial({
        color: 0x454f62, metalness: 0.84, roughness: 0.15, clearcoat: 0.78,
        iridescence: 0.25, envMapIntensity: 1.25, ...bCfg
      });
    }
    if ([14, 32, 33, 34, 51, 52].includes(n)) {
      return new THREE.MeshPhysicalMaterial({
        color: v.baseColor, metalness: 0.90, roughness: 0.14, clearcoat: 0.72,
        iridescence: 0.28, envMapIntensity: 1.25, ...bCfg
      });
    }
    return new THREE.MeshPhysicalMaterial({
      color: v.baseColor,
      metalness: opts.metalness ?? 0.92,
      roughness: opts.roughness ?? 0.18,
      clearcoat: opts.clearcoat ?? 0.42,
      clearcoatRoughness: 0.14,
      iridescence: [22, 41, 73, 72].includes(n) ? 0.24 : 0.0,
      envMapIntensity: 1.25,
      ...bCfg
    });
  }

  /* ============================================================
     MODE 1: CRISP 3D ATOM (NO GRAY BALLOONS! CLEAR NUCLEUS + ORBITS + COMET TRAILS)
     ============================================================ */
  function buildAtom(el) {
    const light = state.theme === "light";
    const blend = light ? THREE.NormalBlending : THREE.AdditiveBlending;
    const atomCol = new THREE.Color(el.vis.atomColor);
    if (light) atomCol.multiplyScalar(0.76);
    const innerCol = atomCol.clone().lerp(new THREE.Color(light ? 0x3b4d6e : 0xcbd8f2), 0.58);

    // 1) Proportional high-detail Nucleus
    const nCount = el.num === 1 ? 1 : (el.num === 2 ? 4 : Math.min(54, Math.round(4 + Math.pow(el.num, 0.74) * 1.55)));
    const spread = nCount === 1 ? 0 : 0.068 + Math.pow(el.num / 118, 0.46) * 0.175;
    const nucR = nCount === 1 ? 0.118 : Math.max(0.044, 0.076 - nCount * 0.00058);

    const protons = [], neutrons = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < nCount; i++) {
      const y = nCount === 1 ? 0 : 1 - (i / (nCount - 1)) * 2;
      const rS = Math.sqrt(Math.max(0, 1 - y * y));
      const th = golden * i + el.num * 0.37;
      const rad = spread * (0.64 + 0.36 * ((i * 7) % 5) / 4);
      const p = new THREE.Vector3(Math.cos(th) * rS * rad, y * rad, Math.sin(th) * rS * rad);
      if (i % 2 === 0) protons.push(p); else neutrons.push(p);
    }

    const protonMat = new THREE.MeshPhysicalMaterial({
      color: 0xe64538, emissive: 0x6b140a, emissiveIntensity: light ? 0.22 : 0.62,
      metalness: 0.25, roughness: 0.22, clearcoat: 0.85
    });
    const neutronMat = new THREE.MeshPhysicalMaterial({
      color: 0x798ba8, metalness: 0.72, roughness: 0.22, clearcoat: 0.55
    });

    const nucGroup = new THREE.Group();
    const addNuc = (pts, mat) => {
      if (!pts.length) return;
      const im = new THREE.InstancedMesh(sharedGeo.sphereMid, mat, pts.length);
      im.userData.ownMat = true;
      tmpScale.setScalar(nucR);
      tmpQuat.identity();
      pts.forEach((p, i) => { tmpM4.compose(p, tmpQuat, tmpScale); im.setMatrixAt(i, tmpM4); });
      im.instanceMatrix.needsUpdate = true;
      nucGroup.add(im);
    };
    addNuc(protons, protonMat);
    addNuc(neutrons, neutronMat);

    const auraMat = new THREE.SpriteMaterial({
      map: procTex.glow, color: el.vis.glowColor,
      transparent: true, opacity: light ? 0.24 : 0.48, blending: blend, depthWrite: false
    });
    const aura = new THREE.Sprite(auraMat);
    aura.userData.ownMat = true;
    const auraScale = (spread + nucR) * 3.2;
    aura.scale.set(auraScale, auraScale, 1);
    nucGroup.add(aura);
    contentGroup.add(nucGroup);

    // 2) Clean Harmonic Electron Shells + Comet-Trail Valence Electrons
    const shells = el.shells, total = shells.length;
    const valRingMat = new THREE.MeshBasicMaterial({ color: atomCol, transparent: true, opacity: light ? 0.82 : 0.86 });
    const innerRingMat = new THREE.MeshBasicMaterial({ color: innerCol, transparent: true, opacity: light ? 0.34 : 0.30 });
    const valList = [], coreList = [];

    for (let s = 0; s < total; s++) {
      const radius = total === 1 ? 0.74 : (0.34 + (s / (total - 1)) * 0.74);
      const isVal = s === total - 1;
      const tiltX = isVal ? 0.24 : (((s + 1) / (total + 1)) * 1.45 - 0.72);
      const tiltZ = isVal ? -0.18 : ((s % 2 === 0 ? 1 : -1) * (0.35 + s * 0.22));
      const speed = (s % 2 === 0 ? 1 : -1) * (1.45 / (0.68 + s * 0.26));

      const ringGeo = new THREE.TorusGeometry(radius, isVal ? 0.0075 : 0.0036, 10, 128);
      const ring = new THREE.Mesh(ringGeo, isVal ? valRingMat : innerRingMat);
      ring.userData.ownGeo = true;
      if (isVal) ring.userData.ownMat = true;
      else if (s === 0) ring.userData.ownMat = true;

      const qBase = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI * 0.5, 0, 0));
      const qTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, 0, tiltZ, "YXZ"));
      ring.quaternion.copy(qTilt).multiply(qBase);
      contentGroup.add(ring);

      const visN = isVal ? shells[s] : Math.min(shells[s], 10);
      for (let e = 0; e < visN; e++) {
        const item = { radius, qTilt, speed, phase: s * 1.15 + (e / visN) * TAU };
        if (isVal) valList.push(item); else coreList.push(item);
      }
    }

    const valMat = new THREE.MeshPhysicalMaterial({
      color: light ? atomCol : 0xffffff, emissive: atomCol, emissiveIntensity: light ? 0.45 : 1.1,
      roughness: 0.15, metalness: 0.1
    });
    const coreMat = new THREE.MeshBasicMaterial({ color: innerCol });
    const valMesh = valList.length ? new THREE.InstancedMesh(sharedGeo.sphereMid, valMat, valList.length) : null;
    const coreMesh = coreList.length ? new THREE.InstancedMesh(sharedGeo.sphereLow, coreMat, coreList.length) : null;
    if (valMesh) { valMesh.userData.ownMat = true; contentGroup.add(valMesh); }
    if (coreMesh) { coreMesh.userData.ownMat = true; contentGroup.add(coreMesh); }

    // Smooth fading comet trails behind valence electrons
    const TRAIL_STEPS = 5;
    let trailMesh = null;
    if (valList.length) {
      const trMat = new THREE.MeshBasicMaterial({ color: atomCol, transparent: true, opacity: light ? 0.35 : 0.55 });
      trailMesh = new THREE.InstancedMesh(sharedGeo.sphereLow, trMat, valList.length * TRAIL_STEPS);
      trailMesh.userData.ownMat = true;
      contentGroup.add(trailMesh);
    }

    const valSprites = [];
    if (valList.length) {
      const spMat = new THREE.SpriteMaterial({
        map: procTex.glow, color: atomCol,
        transparent: true, opacity: light ? 0.45 : 0.88, blending: blend, depthWrite: false
      });
      for (let i = 0; i < valList.length; i++) {
        const sp = new THREE.Sprite(spMat);
        sp.scale.set(0.24, 0.24, 1);
        if (i === 0) sp.userData.ownMat = true;
        contentGroup.add(sp);
        valSprites.push(sp);
      }
    }

    // Subtle radioactive decay sparks for unstable elements
    let decaySparks = null;
    if (el.catKey === "ac" || el.num === 43 || el.num === 61 || el.num >= 84) {
      const dm = new THREE.MeshBasicMaterial({ color: el.vis.glowColor });
      decaySparks = new THREE.InstancedMesh(sharedGeo.sphereLow, dm, 12);
      decaySparks.userData.ownMat = true;
      contentGroup.add(decaySparks);
    }

    state.dyn = { type: "atom", nucGroup, aura, auraScale, valMesh, coreMesh, trailMesh, TRAIL_STEPS, valSprites, valList, coreList, decaySparks };
  }

  /* ============================================================
     MODE 2: CHEMICALLY ACCURATE 3D CRYSTAL LATTICE (NO UGLY EMPTY WIREFRAMES!)
     ============================================================ */
  function buildLattice(el) {
    const light = state.theme === "light";
    const blend = light ? THREE.NormalBlending : THREE.AdditiveBlending;
    const kind = el.num === 5 ? "b12" : el.vis.lat;
    const nodes = [], edges = [], faces = [];
    const seen = new Set();
    const addE = (a, b, acc = false) => {
      const k = a < b ? a * 512 + b : b * 512 + a;
      if (seen.has(k)) return;
      seen.add(k);
      edges.push([a, b, acc]);
    };
    const addF = (idx, acc = false) => faces.push({ idx, acc });

    if (kind === "b12") {
      // True alpha-rhombohedral Boron B12 Icosahedron!
      const phi = (1 + Math.sqrt(5)) * 0.5;
      const sc = 0.42;
      const raw = [
        [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
        [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
        [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]
      ];
      raw.forEach(([x, y, z]) => nodes.push({ x: x * sc, y: y * sc, z: z * sc, acc: true, r: 0.165 }));
      for (let i = 0; i < 12; i++) {
        for (let j = i + 1; j < 12; j++) {
          const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y, nodes[i].z - nodes[j].z);
          if (d < 0.92) addE(i, j, true);
        }
      }
      // Subtle translucent icosahedral crystal faces
      const icoFaces = [
        [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
        [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
        [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
        [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]
      ];
      icoFaces.forEach(f => addF(f, true));
    } else if (kind === "s8") {
      // Two paired puckered S8 crown rings (orthorhombic sulfur packing)
      for (let ring = 0; ring < 2; ring++) {
        const base = nodes.length;
        const oy = ring === 0 ? 0.24 : -0.24;
        const ox = ring === 0 ? -0.10 : 0.10;
        const rot = ring * 0.39;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + rot;
          nodes.push({
            x: ox + Math.cos(a) * 0.62,
            y: oy + (i % 2 === 0 ? 0.14 : -0.14),
            z: Math.sin(a) * 0.62,
            acc: ring === 0, r: 0.145
          });
        }
        for (let i = 0; i < 8; i++) addE(base + i, base + ((i + 1) % 8), ring === 0);
      }
    } else if (kind === "p4") {
      const s = 0.50;
      [[s,s,s],[s,-s,-s],[-s,s,-s],[-s,-s,s]].forEach(([x,y,z]) => nodes.push({ x, y, z, acc: true, r: 0.22 }));
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) addE(i, j, true);
      [[0,1,2],[0,1,3],[0,2,3],[1,2,3]].forEach(f => addF(f, true));
    } else if (kind === "bcc" || kind === "fcc") {
      const s = 0.56;
      for (let ix = -1; ix <= 1; ix += 2)
        for (let iy = -1; iy <= 1; iy += 2)
          for (let iz = -1; iz <= 1; iz += 2)
            nodes.push({ x: ix * s, y: iy * s, z: iz * s, acc: false, r: 0.165 });
      [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]].forEach(([a,b]) => addE(a,b,false));

      if (kind === "bcc") {
        const c = nodes.length;
        nodes.push({ x: 0, y: 0, z: 0, acc: true, r: 0.22 });
        for (let i = 0; i < 8; i++) addE(c, i, true);
      } else {
        const st = nodes.length;
        [[s,0,0],[-s,0,0],[0,s,0],[0,-s,0],[0,0,s],[0,0,-s]].forEach(([x,y,z]) => nodes.push({ x, y, z, acc: true, r: 0.185 }));
        [[0,2],[0,3],[0,4],[0,5],[1,2],[1,3],[1,4],[1,5],[2,4],[2,5],[3,4],[3,5]].forEach(([a,b]) => addE(st + a, st + b, true));
        [[0,2,4],[0,4,3],[0,3,5],[0,5,2],[1,2,4],[1,4,3],[1,3,5],[1,5,2]].forEach(f => addF(f.map(k => st + k), true));
      }
    } else if (kind === "hcp") {
      const R = 0.62, H = 0.52;
      for (let l = -1; l <= 1; l += 2) {
        const base = nodes.length, y = l * H;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          nodes.push({ x: Math.cos(a) * R, y, z: Math.sin(a) * R, acc: false, r: 0.15 });
        }
        const c = nodes.length;
        nodes.push({ x: 0, y, z: 0, acc: true, r: 0.175 });
        for (let i = 0; i < 6; i++) { addE(base + i, base + ((i + 1) % 6), false); addE(c, base + i, false); }
        addF([base, base+1, base+2, base+3, base+4, base+5], false);
      }
      for (let i = 0; i < 6; i++) addE(i, 7 + i, false);
      const m = nodes.length;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + Math.PI / 6;
        nodes.push({ x: Math.cos(a) * R * 0.56, y: 0, z: Math.sin(a) * R * 0.56, acc: true, r: 0.185 });
      }
      addE(m, m+1, true); addE(m+1, m+2, true); addE(m+2, m, true);
      addF([m, m+1, m+2], true);
    } else if (kind === "diamond") {
      // Rich 18-atom Diamond / Silicon tetrahedral crystal network
      const s = 0.56, t = 0.28;
      // 8 corners
      [[-s,-s,-s],[s,s,-s],[s,-s,s],[-s,s,s],[s,-s,-s],[-s,s,-s],[-s,-s,s],[s,s,s]]
        .forEach(([x,y,z]) => nodes.push({ x, y, z, acc: false, r: 0.13 }));
      // 6 face centers
      [[s,0,0],[-s,0,0],[0,s,0],[0,-s,0],[0,0,s],[0,0,-s]]
        .forEach(([x,y,z]) => nodes.push({ x, y, z, acc: false, r: 0.145 }));
      // 4 interior tetrahedral atoms
      const b = nodes.length;
      [[-t,-t,-t],[t,t,-t],[t,-t,t],[-t,t,t]]
        .forEach(([x,y,z]) => nodes.push({ x, y, z, acc: true, r: 0.165 }));
      // Connect every interior atom to its 4 nearest tetrahedral neighbors
      for (let i = b; i < b + 4; i++) {
        for (let j = 0; j < b; j++) {
          const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y, nodes[i].z - nodes[j].z);
          if (d < 0.52) addE(i, j, true);
        }
      }
      [[b, b+1, b+2], [b, b+1, b+3], [b, b+2, b+3], [b+1, b+2, b+3]].forEach(f => addF(f, true));
    } else if (kind === "gas2") {
      const d = 0.40;
      nodes.push({ x: -d, y: 0, z: 0, acc: true, r: 0.28 }, { x: d, y: 0, z: 0, acc: true, r: 0.28 });
      const bonds = el.num === 7 ? 3 : (el.num === 8 ? 2 : 1);
      for (let i = 0; i < bonds; i++) {
        const off = (i - (bonds - 1) / 2) * 0.15, a = nodes.length;
        nodes.push({ x: -d, y: off, z: 0, acc: false, r: 0 }, { x: d, y: off, z: 0, acc: false, r: 0 });
        addE(a, a + 1, true);
      }
      const moGeo = new THREE.CapsuleGeometry(0.46, 0.72, 20, 36);
      moGeo.rotateZ(Math.PI * 0.5);
      const moMat = new THREE.MeshPhysicalMaterial({
        color: el.vis.glowColor, emissive: el.vis.glowColor, emissiveIntensity: 0.25,
        transparent: true, opacity: light ? 0.14 : 0.18, roughness: 0.08, clearcoat: 1.0, depthWrite: false
      });
      contentGroup.add(ownMesh(moGeo, moMat));
    } else if (kind === "noble") {
      const em = el.vis.glowColor;
      const coreMat = new THREE.MeshPhysicalMaterial({ color: em, emissive: em, emissiveIntensity: 0.95, roughness: 0.10, clearcoat: 1.0 });
      const core = new THREE.Mesh(sharedGeo.sphereHi, coreMat);
      core.scale.setScalar(0.32); core.userData.ownMat = true;
      contentGroup.add(core);
      const spMat = new THREE.SpriteMaterial({ map: procTex.glow, color: em, transparent: true, opacity: light ? 0.42 : 0.82, blending: blend, depthWrite: false });
      const sp = new THREE.Sprite(spMat); sp.scale.set(1.65, 1.65, 1); sp.userData.ownMat = true;
      contentGroup.add(sp);
      const rMat = new THREE.MeshBasicMaterial({ color: em, transparent: true, opacity: 0.58 });
      for (let r = 0; r < 3; r++) {
        const tm = new THREE.Mesh(new THREE.TorusGeometry(0.56 + r * 0.15, 0.007, 10, 108), rMat);
        tm.rotation.set(r * 0.95, r * 1.15, 0);
        tm.userData.ownGeo = true;
        if (r === 0) tm.userData.ownMat = true;
        contentGroup.add(tm);
      }
      state.dyn = { type: "noble", sp };
      return;
    } else if (kind === "liquid") {
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < 20; i++) {
        const y = 1 - (i / 19) * 2, rS = Math.sqrt(1 - y * y), th = golden * i + el.num;
        const rad = 0.50 + 0.17 * Math.sin(i * 2.1);
        nodes.push({ x: Math.cos(th)*rS*rad, y: y*rad, z: Math.sin(th)*rS*rad, acc: i % 3 === 0, r: i % 3 === 0 ? 0.155 : 0.12, phase: i * 0.65 });
      }
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++)
          if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y, nodes[i].z - nodes[j].z) < 0.62)
            addE(i, j, nodes[i].acc && nodes[j].acc);
    } else if (kind === "radio") {
      // Dense 13-atom Cuboctahedral Heavy Actinide Coordination Cluster
      const d = 0.56;
      nodes.push({ x: 0, y: 0, z: 0, acc: true, r: 0.25 });
      const dirs = [
        [d,d,0],[d,-d,0],[-d,d,0],[-d,-d,0],
        [d,0,d],[d,0,-d],[-d,0,d],[-d,0,-d],
        [0,d,d],[0,d,-d],[0,-d,d],[0,-d,-d]
      ];
      dirs.forEach(([x,y,z]) => nodes.push({ x, y, z, acc: false, r: 0.145 }));
      for (let i = 1; i <= 12; i++) {
        addE(0, i, true);
        for (let j = i + 1; j <= 12; j++) {
          const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y, nodes[i].z - nodes[j].z);
          if (dist < d * 1.45) addE(i, j, false);
        }
      }
    } else {
      // Puckered Layered Rhombohedral Bilayer (Bi, Sb, As, Se, Te, I)
      const R = 0.58;
      for (let layer = 0; layer < 2; layer++) {
        const yBase = layer === 0 ? 0.30 : -0.30;
        const base = nodes.length;
        nodes.push({ x: 0, y: yBase + (layer === 0 ? 0.08 : -0.08), z: 0, acc: true, r: 0.165 });
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + (layer * Math.PI / 6);
          const puck = i % 2 === 0 ? 0.08 : -0.08;
          nodes.push({ x: Math.cos(a) * R, y: yBase + puck, z: Math.sin(a) * R, acc: i % 2 === 0, r: 0.145 });
        }
        for (let i = 1; i <= 6; i++) {
          addE(base + i, base + (i % 6) + 1, layer === 0);
          if (i % 2 === 1) addE(base, base + i, true);
        }
      }
      for (let i = 1; i <= 6; i += 2) addE(i, 7 + i, false);
    }

    const mainMat = makeNaturalMaterial(el, { metalness: 0.85, roughness: 0.16, clearcoat: 0.65 });
    const secMat = new THREE.MeshPhysicalMaterial({ color: 0xcbd6ea, metalness: 0.84, roughness: 0.18, clearcoat: 0.5 });
    const bondMainMat = new THREE.MeshPhysicalMaterial({ color: el.vis.atomColor, emissive: el.vis.atomColor, emissiveIntensity: light ? 0.12 : 0.26, metalness: 0.60, roughness: 0.20 });
    const bondSecMat = new THREE.MeshPhysicalMaterial({ color: 0x9aa8c2, metalness: 0.82, roughness: 0.22 });

    const accIdx = [], secIdx = [];
    nodes.forEach((n, i) => { if (n.r > 0) (n.acc ? accIdx : secIdx).push(i); });

    const accMesh = accIdx.length ? new THREE.InstancedMesh(sharedGeo.sphereHi, mainMat, accIdx.length) : null;
    const secMesh = secIdx.length ? new THREE.InstancedMesh(sharedGeo.sphereMid, secMat, secIdx.length) : null;
    if (accMesh) { accMesh.userData.ownMat = true; contentGroup.add(accMesh); }
    if (secMesh) { secMesh.userData.ownMat = true; contentGroup.add(secMesh); }

    const accEdges = edges.filter(e => e[2]), secEdges = edges.filter(e => !e[2]);
    const eAccMesh = accEdges.length ? new THREE.InstancedMesh(sharedGeo.cyl, bondMainMat, accEdges.length) : null;
    const eSecMesh = secEdges.length ? new THREE.InstancedMesh(sharedGeo.cyl, bondSecMat, secEdges.length) : null;
    if (eAccMesh) { eAccMesh.userData.ownMat = true; contentGroup.add(eAccMesh); }
    if (eSecMesh) { eSecMesh.userData.ownMat = true; contentGroup.add(eSecMesh); }

    const addFaceGroup = (list, col, op) => {
      if (!list.length) return;
      const pos = [];
      for (const f of list) {
        for (let k = 1; k < f.idx.length - 1; k++) {
          const a = nodes[f.idx[0]], b = nodes[f.idx[k]], c = nodes[f.idx[k + 1]];
          pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshPhysicalMaterial({ color: col, transparent: true, opacity: op, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false });
      contentGroup.add(ownMesh(geo, mat));
    };
    addFaceGroup(faces.filter(f => f.acc), el.vis.atomColor, 0.12);
    addFaceGroup(faces.filter(f => !f.acc), 0xb0c4e8, 0.06);

    let radioSparks = null;
    if (kind === "radio") {
      const rm = new THREE.MeshBasicMaterial({ color: el.vis.glowColor });
      radioSparks = new THREE.InstancedMesh(sharedGeo.sphereLow, rm, 16);
      radioSparks.userData.ownMat = true;
      contentGroup.add(radioSparks);
    }

    const curPos = nodes.map(n => new THREE.Vector3(n.x, n.y, n.z));
    const updateLattice = (t) => {
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i], p = curPos[i];
        if (kind === "liquid") {
          const ph = n.phase || i;
          p.set(n.x + Math.sin(t * 2.1 + ph) * 0.055, n.y + Math.cos(t * 1.8 + ph * 1.3) * 0.055, n.z + Math.sin(t * 2.4 - ph) * 0.055);
        } else if (kind === "gas2" && i < 2) {
          p.set(n.x + (i === 0 ? -1 : 1) * Math.sin(t * 4.5) * 0.036, n.y, n.z);
        } else {
          p.set(n.x, n.y, n.z);
        }
      }
      tmpQuat.identity();
      const placeNodes = (mesh, idxs) => {
        if (!mesh) return;
        idxs.forEach((ni, k) => { tmpScale.setScalar(nodes[ni].r); tmpM4.compose(curPos[ni], tmpQuat, tmpScale); mesh.setMatrixAt(k, tmpM4); });
        mesh.instanceMatrix.needsUpdate = true;
      };
      placeNodes(accMesh, accIdx);
      placeNodes(secMesh, secIdx);

      const placeBonds = (mesh, list, rad) => {
        if (!mesh) return;
        for (let i = 0; i < list.length; i++) {
          const a = curPos[list[i][0]], b = curPos[list[i][1]];
          tmpPos.copy(a).add(b).multiplyScalar(0.5);
          tmpDir.copy(b).sub(a);
          const len = tmpDir.length();
          if (len < 1e-4) continue;
          tmpDir.divideScalar(len);
          tmpQuat.setFromUnitVectors(upVec, tmpDir);
          tmpScale.set(rad, len, rad);
          tmpM4.compose(tmpPos, tmpQuat, tmpScale);
          mesh.setMatrixAt(i, tmpM4);
        }
        mesh.instanceMatrix.needsUpdate = true;
      };
      placeBonds(eAccMesh, accEdges, 0.032);
      placeBonds(eSecMesh, secEdges, 0.020);

      if (radioSparks) {
        tmpQuat.identity();
        for (let i = 0; i < 16; i++) {
          const life = (t * 0.62 + i / 16) % 1;
          const a = i * 2.3 + 0.4, elv = ((i % 3) - 1) * 0.72, d = 0.25 + life * 0.96;
          tmpPos.set(Math.cos(a) * Math.cos(elv) * d, Math.sin(elv) * d, Math.sin(a) * Math.cos(elv) * d);
          tmpScale.setScalar((1 - life) * 0.044);
          tmpM4.compose(tmpPos, tmpQuat, tmpScale);
          radioSparks.setMatrixAt(i, tmpM4);
        }
        radioSparks.instanceMatrix.needsUpdate = true;
      }
    };
    updateLattice(0);
    state.dyn = { type: "lattice", kind, update: updateLattice };
  }

  /* ===== HIGH-POLY SCULPTED GEOMETRY GENERATORS (2,000 - 12,000+ TRIANGLES) ===== */

  /* Natural Fractured Crystalline Mineral (smooth beveled cleavage planes — ZERO "pencils"!) */
  function makeFracturedCrystalGeo(seed, radius = 0.72, segW = 72, segH = 54) {
    const geo = new THREE.SphereGeometry(radius, segW, segH);
    const pos = geo.attributes.position;
    // Generate 14 natural cleavage plane normals & distances
    const planes = [];
    for (let p = 0; p < 14; p++) {
      const th = hash3(p, 1, 2, seed) * TAU;
      const cz = hash3(p, 3, 4, seed) * 2 - 1;
      const sz = Math.sqrt(Math.max(0, 1 - cz * cz));
      const dist = radius * (0.62 + hash3(p, 5, 6, seed) * 0.34);
      planes.push([Math.cos(th) * sz, cz, Math.sin(th) * sz, dist]);
    }
    // Smooth-min cleavage intersection (produces realistic sharp-yet-beveled crystal mineral chunks!)
    const k = 14.0;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      const len = Math.hypot(vx, vy, vz) || 1;
      const dx = vx / len, dy = vy / len, dz = vz / len;

      let rCut = radius * 1.35;
      // Compute smooth minimum distance across all cleavage planes along ray direction
      let expSum = 0;
      const vals = [];
      for (let p = 0; p < planes.length; p++) {
        const pl = planes[p];
        const dot = dx * pl[0] + dy * pl[1] + dz * pl[2];
        if (dot > 0.08) {
          const t = pl[3] / dot;
          vals.push(t);
        }
      }
      if (vals.length) {
        let minV = vals[0];
        for (let j = 1; j < vals.length; j++) if (vals[j] < minV) minV = vals[j];
        for (let j = 0; j < vals.length; j++) expSum += Math.exp(-k * (vals[j] - minV));
        rCut = minV - Math.log(expSum) / k;
      }
      // Subtle stepped crystalline fracture striations
      const micro = fbm3(dx * 4.5, dy * 4.5, dz * 4.5, seed + 77, 3) * 0.048;
      const rFinal = Math.max(0.24, Math.min(radius * 1.18, rCut + micro));
      pos.setXYZ(i, dx * rFinal * 1.06, dy * rFinal * 0.94, dz * rFinal * 1.02);
    }
    fixSphereSeamNormals(geo, segW, segH);
    return geo;
  }

  /* Organic Smooth High-Poly Sculpted Metal Nugget / Ingot (9,600+ smooth triangles!) */
  function makeSculptedMetalGeo(seed, radius = 0.66, scale = [1.18, 0.84, 0.96], amp = 0.24, segW = 80, segH = 60) {
    const geo = new THREE.SphereGeometry(radius, segW, segH);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      const len = Math.hypot(vx, vy, vz) || 1;
      const dx = vx / len, dy = vy / len, dz = vz / len;

      const nLow = fbm3(dx * 1.85, dy * 1.85, dz * 1.85, seed, 4);
      const nRid = Math.abs(noise3(dx * 3.8, dy * 3.8, dz * 3.8, seed + 51));
      const r = radius * (1.0 + nLow * amp + (0.5 - nRid) * amp * 0.42);
      pos.setXYZ(i, dx * r * scale[0], dy * r * scale[1], dz * r * scale[2]);
    }
    fixSphereSeamNormals(geo, segW, segH);
    return geo;
  }

  /* ============================================================
     MODE 3: HIGH-POLY REALISTIC 3D SPECIMENS (ZERO TRIANGLES, ZERO PENCILS, ZERO CUBES)
     ============================================================ */
  function buildSpecimen(el) {
    const sp = el.vis.spec;
    const light = state.theme === "light";
    const blend = light ? THREE.NormalBlending : THREE.AdditiveBlending;

    // 1) LIQUIDS (Hg, Ga, Br): 12,288-Triangle Ultra-Smooth Flowing Liquid Metal / Bromine!
    if (sp === "liquid") {
      const segW = 96, segH = 64, R = 0.65;
      const geo = new THREE.SphereGeometry(R, segW, segH);
      const pos = geo.attributes.position;
      const dirs = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const l = Math.hypot(x, y, z) || 1;
        dirs[i * 3] = x / l; dirs[i * 3 + 1] = y / l; dirs[i * 3 + 2] = z / l;
      }
      const isBr = el.num === 35;
      const mat = isBr
        ? makeNaturalMaterial(el)
        : new THREE.MeshPhysicalMaterial({
            color: el.num === 31 ? 0xd2deec : 0xeaf0f8,
            metalness: 1.0,
            roughness: 0.025,
            clearcoat: 1.0,
            clearcoatRoughness: 0.02,
            envMapIntensity: 1.48
          });
      const drop = ownMesh(geo, mat);
      contentGroup.add(drop);

      let vapor = null;
      if (isBr) {
        const vm = new THREE.SpriteMaterial({ map: procTex.glow, color: 0xe64518, transparent: true, opacity: light ? 0.25 : 0.45, blending: blend, depthWrite: false });
        vapor = new THREE.Sprite(vm);
        vapor.scale.set(1.9, 1.9, 1);
        vapor.userData.ownMat = true;
        contentGroup.add(vapor);
      }
      state.dyn = { type: "liquid_drop", geo, dirs, segW, segH, R, vapor };
      return;
    }

    // 2) TUNGSTEN (W): High-Res Glowing Incandescent Double-Helix Filament with Heat Gradient!
    if (sp === "filament") {
      const pts = [];
      const turns = 15, steps = 420;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const arcA = (u - 0.5) * Math.PI * 1.18;
        const mainR = 0.68;
        const cx = Math.sin(arcA) * mainR;
        const cy = Math.cos(arcA) * mainR - 0.16;
        const tx = Math.cos(arcA), ty = -Math.sin(arcA);
        const nx = -ty, ny = tx;
        const coilA = u * turns * TAU;
        const coilR = 0.12;
        pts.push(new THREE.Vector3(
          cx + nx * Math.cos(coilA) * coilR,
          cy + ny * Math.cos(coilA) * coilR,
          Math.sin(coilA) * coilR
        ));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const coilGeo = new THREE.TubeGeometry(curve, 360, 0.024, 14, false);
      // Vertex heat gradient: white-hot arch crest -> fiery orange shoulders -> dark metal ends
      const uv = coilGeo.attributes.uv;
      const colors = new Float32Array(uv.count * 3);
      const cHot = new THREE.Color(0xfff6d4), cWarm = new THREE.Color(0xff6b1a), cCool = new THREE.Color(0x6b7588), cTmp = new THREE.Color();
      for (let i = 0; i < uv.count; i++) {
        const heat = Math.pow(Math.sin(uv.getX(i) * Math.PI), 0.72);
        if (heat > 0.5) cTmp.copy(cWarm).lerp(cHot, (heat - 0.5) * 2);
        else cTmp.copy(cCool).lerp(cWarm, heat * 2);
        colors[i * 3] = cTmp.r; colors[i * 3 + 1] = cTmp.g; colors[i * 3 + 2] = cTmp.b;
      }
      coilGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const coilMat = new THREE.MeshPhysicalMaterial({
        vertexColors: true, emissive: 0xff7b22, emissiveIntensity: 1.25,
        metalness: 0.55, roughness: 0.22, clearcoat: 0.4
      });
      contentGroup.add(ownMesh(coilGeo, coilMat));

      const leadMat = makeNaturalMaterial(el, { metalness: 0.94, roughness: 0.18 });
      const leadGeo = new THREE.CylinderGeometry(0.020, 0.024, 0.68, 18);
      const l1 = new THREE.Mesh(leadGeo, leadMat); l1.position.set(-0.67, -0.43, 0); l1.rotation.z = -0.18; l1.userData.ownGeo = true; l1.userData.ownMat = true;
      const l2 = new THREE.Mesh(leadGeo, leadMat); l2.position.set(0.67, -0.43, 0); l2.rotation.z = 0.18;
      contentGroup.add(l1, l2);

      const glowMat = new THREE.SpriteMaterial({ map: procTex.glow, color: 0xffa042, transparent: true, opacity: light ? 0.32 : 0.72, blending: blend, depthWrite: false });
      const glow = new THREE.Sprite(glowMat);
      glow.position.y = 0.34; glow.scale.set(1.9, 1.35, 1); glow.userData.ownMat = true;
      contentGroup.add(glow);
      state.dyn = { type: "filament", coilMat, glow };
      return;
    }

    // 3) CARBON (C): Precision 16-Fold Round Brilliant-Cut Diamond!
    if (sp === "diamond") {
      const mat = makeNaturalMaterial(el);
      const profile = [
        new THREE.Vector2(0.0001, -0.58),
        new THREE.Vector2(0.76, 0.02),
        new THREE.Vector2(0.76, 0.065),
        new THREE.Vector2(0.46, 0.34),
        new THREE.Vector2(0.0001, 0.34)
      ];
      const dGeo = new THREE.LatheGeometry(profile, 16);
      const faceted = dGeo.toNonIndexed();
      dGeo.dispose();
      faceted.computeVertexNormals();
      contentGroup.add(ownMesh(faceted, mat));

      const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: light ? 0.45 : 0.36 });
      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(faceted, 8), wireMat);
      wire.userData.ownGeo = true; wire.userData.ownMat = true;
      contentGroup.add(wire);

      const spMat = new THREE.SpriteMaterial({ map: procTex.glow, color: 0xd8f3ff, transparent: true, opacity: light ? 0.45 : 0.9, blending: blend, depthWrite: false });
      const sparkle = new THREE.Sprite(spMat); sparkle.position.set(0.30, 0.34, 0.42); sparkle.scale.set(0.55, 0.55, 1); sparkle.userData.ownMat = true;
      contentGroup.add(sparkle);
      state.dyn = { type: "sparkle", sparkle };
      return;
    }

    // 4) BISMUTH (Bi): Multi-Axis Iridescent Stepped Hopper Crystal!
    if (sp === "bismuth") {
      const mat = makeNaturalMaterial(el);
      const buildTower = (parent, scale) => {
        const steps = [
          { s: 1.08, h: 0.16, y: -0.34 },
          { s: 0.88, h: 0.17, y: -0.18 },
          { s: 0.68, h: 0.17, y: -0.02 },
          { s: 0.50, h: 0.17, y: 0.14 },
          { s: 0.33, h: 0.16, y: 0.29 },
          { s: 0.18, h: 0.13, y: 0.42 }
        ];
        steps.forEach((st, idx) => {
          const o = st.s * 0.5 * scale, i = o * 0.66;
          const sh = new THREE.Shape();
          sh.moveTo(-o, -o); sh.lineTo(o, -o); sh.lineTo(o, o); sh.lineTo(-o, o); sh.closePath();
          const hole = new THREE.Path();
          hole.moveTo(-i, -i); hole.lineTo(i, -i); hole.lineTo(i, i); hole.lineTo(-i, i); hole.closePath();
          sh.holes.push(hole);
          const g = new THREE.ExtrudeGeometry(sh, { depth: st.h * scale, bevelEnabled: true, bevelSize: 0.014 * scale, bevelThickness: 0.014 * scale, bevelSegments: 3 });
          g.rotateX(Math.PI * 0.5); g.center();
          const m = new THREE.Mesh(g, mat);
          m.position.y = st.y * scale;
          m.rotation.y = idx * 0.04;
          m.userData.ownGeo = true;
          if (idx === 0 && scale === 1) m.userData.ownMat = true;
          parent.add(m);
        });
      };
      buildTower(contentGroup, 1.0);
      const sub = new THREE.Group();
      sub.position.set(0.34, -0.14, 0.24);
      sub.rotation.set(0.55, 0.42, -0.78);
      buildTower(sub, 0.58);
      contentGroup.add(sub);
      return;
    }

    // 5) GASES (H, He, N, O, F, Ne, Cl, Ar, Kr, Xe, Rn, Og): High-Res Blown-Glass Plasma Globe + Live Electric Arcs!
    if (sp === "gas_orb") {
      const em = el.vis.glowColor;
      const glassGeo = new THREE.SphereGeometry(0.84, 64, 48);
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xeef5ff, metalness: 0.02, roughness: 0.04,
        transparent: true, opacity: light ? 0.20 : 0.14,
        clearcoat: 1.0, clearcoatRoughness: 0.03, reflectivity: 1.0,
        envMapIntensity: 1.5, depthWrite: false
      });
      contentGroup.add(ownMesh(glassGeo, glassMat));

      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
      const core = new THREE.Mesh(sharedGeo.sphereMid, coreMat);
      core.scale.setScalar(0.11); core.userData.ownMat = true;
      contentGroup.add(core);

      // 6 smooth luminous plasma filaments radiating from core inside the glass sphere
      const arcGroup = new THREE.Group();
      const arcMat = new THREE.MeshBasicMaterial({ color: em, transparent: true, opacity: light ? 0.72 : 0.88, blending: blend });
      for (let a = 0; a < 6; a++) {
        const th = (a / 6) * TAU + el.num * 0.2;
        const elv = ((a % 3) - 1) * 0.65;
        const pts = [];
        for (let k = 0; k <= 12; k++) {
          const u = k / 12;
          const r = 0.08 + u * 0.68;
          const wob = Math.sin(u * Math.PI) * 0.14;
          const ang = th + wob * (a % 2 === 0 ? 1 : -1);
          const phi = elv + Math.cos(u * Math.PI * 2 + a) * 0.16;
          pts.push(new THREE.Vector3(Math.cos(ang) * Math.cos(phi) * r, Math.sin(phi) * r, Math.sin(ang) * Math.cos(phi) * r));
        }
        const tGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.012, 8, false);
        const tMesh = new THREE.Mesh(tGeo, arcMat);
        tMesh.userData.ownGeo = true;
        if (a === 0) tMesh.userData.ownMat = true;
        arcGroup.add(tMesh);
      }
      contentGroup.add(arcGroup);

      const spMat = new THREE.SpriteMaterial({ map: procTex.glow, color: em, transparent: true, opacity: light ? 0.45 : 0.86, blending: blend, depthWrite: false });
      const aura = new THREE.Sprite(spMat); aura.scale.set(1.55, 1.55, 1); aura.userData.ownMat = true;
      contentGroup.add(aura);

      const pMat = new THREE.MeshBasicMaterial({ color: em });
      const pMesh = new THREE.InstancedMesh(sharedGeo.sphereLow, pMat, 26);
      pMesh.userData.ownMat = true;
      contentGroup.add(pMesh);
      state.dyn = { type: "gas_orb", aura, arcGroup, pMesh };
      return;
    }

    // 6) ACTINIDES & RADIOACTIVE ELEMENTS (U, Np, Pu, Ra, Am, Cm, Fm, etc.):
    //    High-Poly Sculpted Dark Ore with Glowing Emissive Crevice Veins!
    if (sp === "actinide_ore") {
      const segW = 76, segH = 56, R = 0.66;
      const geo = new THREE.SphereGeometry(R, segW, segH);
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      const cRock = new THREE.Color(el.vis.baseColor).multiplyScalar(0.55);
      const cGlow = new THREE.Color(el.vis.glowColor);
      const cTmp = new THREE.Color();

      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
        const len = Math.hypot(vx, vy, vz) || 1;
        const dx = vx / len, dy = vy / len, dz = vz / len;

        const baseN = fbm3(dx * 2.1, dy * 2.1, dz * 2.1, el.num * 17, 4);
        const ridge = Math.abs(noise3(dx * 3.4, dy * 3.4, dz * 3.4, el.num * 29 + 7));
        // Sharp glowing mineral crevices where ridge is near 0
        const vein = Math.pow(Math.max(0, 1.0 - ridge * 4.8), 2.2);
        const r = R * (1.0 + baseN * 0.24 - vein * 0.085);
        pos.setXYZ(i, dx * r * 1.12, dy * r * 0.90, dz * r * 0.98);

        cTmp.copy(cRock).lerp(cGlow, vein);
        colors[i * 3] = cTmp.r; colors[i * 3 + 1] = cTmp.g; colors[i * 3 + 2] = cTmp.b;
      }
      fixSphereSeamNormals(geo, segW, segH);
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

      const oreMat = new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        emissive: el.vis.glowColor,
        emissiveIntensity: light ? 0.16 : 0.34,
        metalness: 0.72, roughness: 0.28,
        bumpMap: procTex.grain, bumpScale: 0.018, clearcoat: 0.45
      });
      contentGroup.add(ownMesh(geo, oreMat));

      const auraMat = new THREE.SpriteMaterial({ map: procTex.glow, color: el.vis.glowColor, transparent: true, opacity: light ? 0.26 : 0.56, blending: blend, depthWrite: false });
      const aura = new THREE.Sprite(auraMat); aura.scale.set(1.85, 1.85, 1); aura.userData.ownMat = true;
      contentGroup.add(aura);

      const spMat = new THREE.MeshBasicMaterial({ color: el.vis.glowColor });
      const sparks = new THREE.InstancedMesh(sharedGeo.sphereLow, spMat, 20);
      sparks.userData.ownMat = true;
      contentGroup.add(sparks);
      state.dyn = { type: "radio_ore", aura, sparks };
      return;
    }

    // 7) MINERALS & METALLOIDS (B, Si, Ge, S, P, I, Se, Te, As, Sb):
    //    High-Poly Naturally Fractured Crystalline Chunk (7,700+ triangles — ZERO pencils!)
    if (sp === "mineral") {
      const mat = makeNaturalMaterial(el, { bump: "grain", bumpScale: 0.010 });
      const geo = makeFracturedCrystalGeo(el.num * 13 + 5, 0.72, 72, 54);
      contentGroup.add(ownMesh(geo, mat));
      return;
    }

    // 8) LANTHANIDES (La–Lu: Sm, Nd, Eu, Gd, etc.):
    //    High-Poly Cleaved Crystalline Rare-Earth Metallic Boule (ZERO pencils!)
    if (sp === "lanthanide_prism") {
      const mat = makeNaturalMaterial(el, { metalness: 0.94, roughness: 0.14, clearcoat: 0.55, bump: "brushed", bumpScale: 0.008 });
      const geo = makeFracturedCrystalGeo(el.num * 19 + 3, 0.72, 72, 54);
      contentGroup.add(ownMesh(geo, mat));
      return;
    }

    // 9) PRECIOUS NATIVE NUGGET (Au, Ag, Pt, Cu, Pd, Rh, Ir, Os):
    //    Ultra-Smooth High-Poly Natural Sculpted Native Nugget (9,600+ triangles!)
    if (sp === "nugget") {
      const mat = makeNaturalMaterial(el, { metalness: 0.97, roughness: 0.14, clearcoat: 0.45, bump: "grain", bumpScale: 0.008 });
      const geo = makeSculptedMetalGeo(el.num * 23, 0.64, [1.24, 0.80, 0.96], 0.30, 84, 62);
      contentGroup.add(ownMesh(geo, mat));
      return;
    }

    // 10) ALKALI METALS (Li, Na, K, Rb, Cs): Smooth Freshly-Sliced Metallic Ingot
    if (sp === "alkali_wedge") {
      const mat = makeNaturalMaterial(el, { metalness: 0.96, roughness: 0.11, clearcoat: 0.65, bump: "brushed", bumpScale: 0.006 });
      const shape = new THREE.Shape();
      shape.moveTo(-0.62, -0.32); shape.lineTo(0.62, -0.32);
      shape.lineTo(0.44, 0.38); shape.lineTo(-0.54, 0.24); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.64, bevelEnabled: true, bevelSize: 0.045, bevelThickness: 0.045, bevelSegments: 6, curveSegments: 24
      });
      geo.center();
      contentGroup.add(ownMesh(geo, mat));
      return;
    }

    // 11) ALKALINE EARTH METALS (Be, Mg, Ca, Sr, Ba): Smooth High-Poly Rolled Metallic Ribbon!
    if (sp === "ribbon") {
      const mat = makeNaturalMaterial(el, { metalness: 0.94, roughness: 0.18, bump: "brushed", bumpScale: 0.008 });
      const pts = [];
      for (let i = 0; i <= 180; i++) {
        const u = i / 180;
        const a = u * 3.3 * TAU;
        const r = 0.24 + u * 0.54;
        pts.push(new THREE.Vector3(Math.cos(a) * r, (u - 0.5) * 0.48, Math.sin(a) * r));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.058, 16, false);
      geo.scale(1, 0.52, 1);
      geo.computeVertexNormals();
      contentGroup.add(ownMesh(geo, mat));
      return;
    }

    // 12) TRANSITION & POST-TRANSITION METALS (Fe, Ti, Cr, Ni, Co, Mo, Al, Zn, Pb, Sn, etc.):
    //     High-Poly Sculpted Gleaming Metallic Ingot / Crystalline Chunk (9,600+ smooth triangles!)
    const mat = makeNaturalMaterial(el, { metalness: 0.93, roughness: 0.17, clearcoat: 0.42, bump: "brushed", bumpScale: 0.010 });
    const geo = makeSculptedMetalGeo(el.num * 11 + 7, 0.66, [1.18, 0.85, 0.95], 0.22, 80, 60);
    contentGroup.add(ownMesh(geo, mat));
  }

  function build(el) {
    ensureInit();
    if (!state.ok) return;
    state.el = el;
    clearContent();
    if (state.mode === "atom") buildAtom(el);
    else if (state.mode === "lattice") buildLattice(el);
    else buildSpecimen(el);
    onHudUpdate?.(el, state.mode);
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    if (state.el) {
      build(state.el);
      state.morphScale = 0.78;
      state.morphVel = 4.2;
      state.velY += 1.2;
    }
  }

  function animateIn() {
    state.morphScale = 0.76;
    state.morphVel = 4.5;
    state.velY = 1.4;
  }

  function start() {
    if (!state.ok || state.running || document.hidden || !state.el) return;
    state.running = true;
    state.lastFrame = performance.now();
    state.rafId = requestAnimationFrame(loop);
  }

  function stop() {
    state.running = false;
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = 0; }
  }

  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else start(); });

  function loop(now) {
    if (!state.running) return;
    state.rafId = requestAnimationFrame(loop);

    const dt = Math.min(0.05, Math.max(0.001, (now - state.lastFrame) / 1000));
    state.lastFrame = now;
    state.time += dt;

    if (Math.abs(1 - state.morphScale) > 0.0015 || Math.abs(state.morphVel) > 0.005) {
      const force = (1 - state.morphScale) * 200;
      state.morphVel = (state.morphVel + force * dt) * Math.exp(-15 * dt);
      state.morphScale += state.morphVel * dt;
    } else {
      state.morphScale = 1; state.morphVel = 0;
    }

    state.zoom += (state.targetZoom - state.zoom) * (1 - Math.exp(-14 * dt));

    // World-space quaternion rotation (ALWAYS matches finger direction, zero flip/inversion!)
    if (state.resettingCam) {
      const k = 1 - Math.exp(-10 * dt);
      state.quat.slerp(HOME_QUAT, k);
      state.velX = 0; state.velY = state.autoSpin;
      if (state.quat.angleTo(HOME_QUAT) < 0.005) {
        state.quat.copy(HOME_QUAT);
        state.resettingCam = false;
      }
    } else if (!state.dragging) {
      qStepY.setFromAxisAngle(WORLD_Y, state.velY * dt);
      qStepX.setFromAxisAngle(WORLD_X, state.velX * dt);
      state.quat.premultiply(qStepY).premultiply(qStepX).normalize();
      const decay = Math.exp(-3.8 * dt);
      state.velX *= decay;
      state.velY = state.autoSpin + (state.velY - state.autoSpin) * decay;
    }

    const sc = Math.max(0.05, state.morphScale) * state.zoom;
    rootGroup.scale.setScalar(sc);
    rootGroup.quaternion.copy(state.quat);

    const dyn = state.dyn, t = state.time;
    if (dyn) {
      if (dyn.type === "atom") {
        const pulse = 1 + Math.sin(t * 2.6) * 0.025;
        dyn.nucGroup.scale.setScalar(pulse);
        dyn.aura.scale.set(dyn.auraScale * (0.94 + Math.sin(t * 2.6) * 0.07), dyn.auraScale * (0.94 + Math.sin(t * 2.6) * 0.07), 1);

        tmpQuat.identity();
        if (dyn.valMesh) {
          tmpScale.setScalar(0.038);
          let ti = 0;
          for (let i = 0; i < dyn.valList.length; i++) {
            const e = dyn.valList[i], a = e.phase + t * e.speed;
            tmpPos.set(Math.cos(a) * e.radius, 0, Math.sin(a) * e.radius).applyQuaternion(e.qTilt);
            tmpM4.compose(tmpPos, tmpQuat, tmpScale);
            dyn.valMesh.setMatrixAt(i, tmpM4);
            dyn.valSprites[i].position.copy(tmpPos);

            if (dyn.trailMesh) {
              const dirSign = e.speed >= 0 ? -1 : 1;
              for (let step = 1; step <= dyn.TRAIL_STEPS; step++) {
                const aTrail = a + dirSign * step * 0.085;
                tmpPos.set(Math.cos(aTrail) * e.radius, 0, Math.sin(aTrail) * e.radius).applyQuaternion(e.qTilt);
                tmpScale.setScalar(0.032 * (1 - step / (dyn.TRAIL_STEPS + 1)));
                tmpM4.compose(tmpPos, tmpQuat, tmpScale);
                dyn.trailMesh.setMatrixAt(ti++, tmpM4);
              }
              tmpScale.setScalar(0.038);
            }
          }
          dyn.valMesh.instanceMatrix.needsUpdate = true;
          if (dyn.trailMesh) dyn.trailMesh.instanceMatrix.needsUpdate = true;
        }
        if (dyn.coreMesh) {
          tmpScale.setScalar(0.022);
          for (let i = 0; i < dyn.coreList.length; i++) {
            const e = dyn.coreList[i], a = e.phase + t * e.speed;
            tmpPos.set(Math.cos(a) * e.radius, 0, Math.sin(a) * e.radius).applyQuaternion(e.qTilt);
            tmpM4.compose(tmpPos, tmpQuat, tmpScale);
            dyn.coreMesh.setMatrixAt(i, tmpM4);
          }
          dyn.coreMesh.instanceMatrix.needsUpdate = true;
        }
        if (dyn.decaySparks) {
          for (let i = 0; i < 12; i++) {
            const life = (t * 0.55 + i / 12) % 1;
            const a = i * 2.4, elv = ((i % 5) - 2) * 0.45, d = 0.22 + life * 0.92;
            tmpPos.set(Math.cos(a) * Math.cos(elv) * d, Math.sin(elv) * d, Math.sin(a) * Math.cos(elv) * d);
            tmpScale.setScalar((1 - life) * 0.028);
            tmpM4.compose(tmpPos, tmpQuat, tmpScale);
            dyn.decaySparks.setMatrixAt(i, tmpM4);
          }
          dyn.decaySparks.instanceMatrix.needsUpdate = true;
        }
      } else if (dyn.type === "liquid_drop") {
        // Real fluid surface tension ripples on 12,288-triangle seamless sphere!
        const arr = dyn.geo.attributes.position.array;
        const dirs = dyn.dirs;
        const spinBoost = Math.min(1.6, 1.0 + Math.hypot(state.velX, state.velY) * 0.14);
        const R = dyn.R;
        for (let i = 0; i < dirs.length; i += 3) {
          const dx = dirs[i], dy = dirs[i + 1], dz = dirs[i + 2];
          const w1 = Math.sin(dx * 3.1 + t * 2.1) * Math.cos(dy * 2.8 - t * 1.7) * 0.055;
          const w2 = Math.sin((dy - dz) * 4.4 + t * 2.8) * Math.cos(dx * 3.6 + t * 1.5) * 0.032;
          const w3 = Math.cos((dx + dz) * 6.2 - t * 3.4) * Math.sin(dy * 5.0 + t * 2.2) * 0.015;
          const rad = R * (1.0 + (w1 + w2 + w3) * spinBoost);
          arr[i] = dx * rad;
          arr[i + 1] = dy * rad;
          arr[i + 2] = dz * rad;
        }
        dyn.geo.attributes.position.needsUpdate = true;
        fixSphereSeamNormals(dyn.geo, dyn.segW, dyn.segH);
        if (dyn.vapor) {
          const s = 1.8 + Math.sin(t * 2.2) * 0.12;
          dyn.vapor.scale.set(s, s, 1);
        }
      } else if (dyn.type === "lattice" && (dyn.kind === "liquid" || dyn.kind === "gas2" || dyn.kind === "radio")) {
        dyn.update(t);
      } else if (dyn.type === "noble") {
        const s = 1.55 + Math.sin(t * 2.6) * 0.14;
        dyn.sp.scale.set(s, s, 1);
      } else if (dyn.type === "filament") {
        dyn.coilMat.emissiveIntensity = 1.2 + Math.sin(t * 4.8) * 0.16;
        const s = 1.85 + Math.sin(t * 4.8) * 0.10;
        dyn.glow.scale.set(s, s * 0.72, 1);
      } else if (dyn.type === "sparkle") {
        const s = 0.42 + Math.abs(Math.sin(t * 3.2)) * 0.36;
        dyn.sparkle.scale.set(s, s, 1);
      } else if (dyn.type === "gas_orb") {
        const s = 1.48 + Math.sin(t * 3.2) * 0.12;
        dyn.aura.scale.set(s, s, 1);
        dyn.arcGroup.rotation.y = t * 0.75;
        dyn.arcGroup.rotation.x = Math.sin(t * 0.9) * 0.25;
        tmpQuat.identity();
        for (let i = 0; i < 26; i++) {
          const ph = i * 1.17;
          const r = 0.16 + ((i * 19) % 100) / 190;
          const th = t * (1.0 + (i % 4) * 0.3) + ph;
          const elv = Math.sin(t * 0.9 + ph * 1.3) * 0.85;
          tmpPos.set(Math.cos(th) * Math.cos(elv) * r, Math.sin(elv) * r, Math.sin(th) * Math.cos(elv) * r);
          tmpScale.setScalar(0.022);
          tmpM4.compose(tmpPos, tmpQuat, tmpScale);
          dyn.pMesh.setMatrixAt(i, tmpM4);
        }
        dyn.pMesh.instanceMatrix.needsUpdate = true;
      } else if (dyn.type === "radio_ore") {
        const s = 1.75 + Math.sin(t * 3.0) * 0.14;
        dyn.aura.scale.set(s, s, 1);
        tmpQuat.identity();
        for (let i = 0; i < 20; i++) {
          const life = (t * 0.55 + i / 20) % 1;
          const a = i * 2.1, elv = ((i % 5) - 2) * 0.42, d = 0.44 + life * 0.86;
          tmpPos.set(Math.cos(a) * Math.cos(elv) * d, Math.sin(elv) * d, Math.sin(a) * Math.cos(elv) * d);
          tmpScale.setScalar((1 - life) * 0.034);
          tmpM4.compose(tmpPos, tmpQuat, tmpScale);
          dyn.sparks.setMatrixAt(i, tmpM4);
        }
        dyn.sparks.instanceMatrix.needsUpdate = true;
      }
    }

    renderer.render(scene, camera);
  }

  /* ===== WORLD-SPACE TOUCH & MOUSE TRACKBALL CONTROLS ===== */
  let lastTap = 0;
  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    e.stopPropagation();
    stage.setPointerCapture(e.pointerId);
    state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    state.resettingCam = false;
    if (state.pointers.size === 1) {
      state.dragging = true; state.dragDist = 0;
      state.lastX = e.clientX; state.lastY = e.clientY;
      state.velX = 0; state.velY = 0;
    } else if (state.pointers.size === 2) {
      const pts = [...state.pointers.values()];
      state.lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  });

  stage.addEventListener("pointermove", (e) => {
    if (!state.pointers.has(e.pointerId)) return;
    e.stopPropagation();
    state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (state.pointers.size === 2) {
      const pts = [...state.pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (state.lastPinchDist > 0) state.targetZoom = Math.max(0.65, Math.min(2.2, state.targetZoom * (dist / state.lastPinchDist)));
      state.lastPinchDist = dist; state.dragDist = 999;
      return;
    }
    if (state.dragging) {
      const dx = e.clientX - state.lastX, dy = e.clientY - state.lastY;
      state.lastX = e.clientX; state.lastY = e.clientY;
      state.dragDist += Math.hypot(dx, dy);

      qStepY.setFromAxisAngle(WORLD_Y, dx * 0.0095);
      qStepX.setFromAxisAngle(WORLD_X, dy * 0.0095);
      state.quat.premultiply(qStepY).premultiply(qStepX).normalize();

      state.velY = Math.max(-7, Math.min(7, dx * 0.16));
      state.velX = Math.max(-7, Math.min(7, dy * 0.16));
    }
  });

  function onUp(e) {
    const wasTap = e.type === "pointerup" && state.pointers.size === 1 && state.dragDist < 8 && !e.target.closest("button");
    state.pointers.delete(e.pointerId);
    if (state.pointers.size < 2) state.lastPinchDist = 0;
    if (state.pointers.size === 0) {
      state.dragging = false;
      if (wasTap) {
        const now = performance.now();
        if (now - lastTap < 280) { state.resettingCam = true; state.targetZoom = 1.0; }
        lastTap = now;
      }
    } else {
      const rem = [...state.pointers.values()][0];
      state.lastX = rem.x; state.lastY = rem.y;
    }
  }
  stage.addEventListener("pointerup", onUp);
  stage.addEventListener("pointercancel", onUp);
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    state.targetZoom = Math.max(0.65, Math.min(2.2, state.targetZoom * (e.deltaY < 0 ? 1.1 : 0.91)));
  }, { passive: false });

  return {
    show(el) { build(el); animateIn(); resize(); start(); },
    setMode,
    setTheme,
    resize,
    stop,
    getMode: () => state.mode
  };
}