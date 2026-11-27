import * as THREE from "three";

const HOME_X = 0.28, HOME_Y = 0.48, TAU = Math.PI * 2;
const wrapPi = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

export function createScene3D({ stage, canvas, errEl, onHudUpdate }) {
  let renderer = null, scene = null, camera = null;
  let rootGroup = null, contentGroup = null;
  let keyLight = null, rimLight = null, fillLight = null, hemiLight = null;
  let envTexture = null;

  const procTex = { glow: null, brushed: null, rock: null };

  const sharedGeo = {
    sphereHi: new THREE.SphereGeometry(1, 28, 22),
    sphereMid: new THREE.SphereGeometry(1, 16, 12),
    sphereLow: new THREE.SphereGeometry(1, 10, 8),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 14, 1)
  };

  const tmpM4 = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const tmpScale = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const upVec = new THREE.Vector3(0, 1, 0);

  const state = {
    ok: false, initialized: false, running: false, rafId: 0,
    mode: "atom", theme: "dark", el: null,
    rotX: HOME_X, rotY: HOME_Y,
    velX: 0, velY: 0.34, autoSpin: 0.34,
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
    g.addColorStop(0.24, "rgba(255,255,255,0.72)");
    g.addColorStop(0.55, "rgba(255,255,255,0.16)");
    g.addColorStop(1.0, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function makeBrushedTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#888888";
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y++) {
      const v = 120 + ((Math.sin(y * 1.4) * 14 + Math.cos(y * 4.7) * 9) | 0);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(0, y, 256, 1);
    }
    for (let i = 0; i < 380; i++) {
      const y = (i * 53) % 256, x = (i * 97) % 256, w = 20 + (i % 80);
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)";
      ctx.fillRect(x, y, w, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    return t;
  }

  function makeRockTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 220; i++) {
      const x = (i * 73) % 256, y = (i * 131) % 256, r = 8 + (i % 24);
      const s = 70 + ((i * 37) % 130);
      ctx.fillStyle = `rgba(${s},${s},${s},0.28)`;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.9, y + r * 0.45);
      ctx.lineTo(x - r * 0.8, y + r * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  /* ===== BRIGHT 360 STUDIO HDR ENVIRONMENT (METALS ALWAYS GLEAM, NEVER BLACK!) ===== */
  function buildBrightStudioEnv(rend) {
    const pmrem = new THREE.PMREMGenerator(rend);
    pmrem.compileEquirectangularShader();
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x475066);

    const addSoftbox = (hex, power, pos, rot, sx, sy) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(sx, sy),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(power), side: THREE.DoubleSide })
      );
      m.position.set(...pos);
      m.rotation.set(...rot);
      envScene.add(m);
    };

    // Full wrap-around studio softboxes so every metallic facet reflects bright light & clean dark accents
    addSoftbox(0xffffff, 2.8, [0, 7, 1], [Math.PI / 2, 0, 0], 11, 8);
    addSoftbox(0xe6f0ff, 2.3, [-7, 2.5, 4], [0, Math.PI / 2.6, 0], 7, 9);
    addSoftbox(0xfff1e0, 2.2, [7, 1.5, 3], [0, -Math.PI / 2.5, 0], 7, 9);
    addSoftbox(0xd8e6ff, 1.8, [0, 1.5, 8], [0, Math.PI, 0], 10, 6);
    addSoftbox(0xffdfc2, 1.9, [0, 3, -7], [0, 0, 0], 10, 7);
    addSoftbox(0x6e7894, 1.3, [0, -7, 0], [-Math.PI / 2, 0, 0], 14, 14);

    // Dark contrast strip for crisp metallic specular definition
    addSoftbox(0x111522, 1.0, [-3.5, -1, 6], [0, Math.PI / 6, 0], 1.8, 7);
    addSoftbox(0x111522, 1.0, [4.2, -1, 5.5], [0, -Math.PI / 6, 0], 1.8, 7);

    const rt = pmrem.fromScene(envScene, 0.04);
    envScene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
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
      renderer.toneMappingExposure = 1.08;

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
      camera.position.set(0, 0.04, 3.8);

      procTex.glow = makeGlowTexture();
      procTex.brushed = makeBrushedTexture();
      procTex.rock = makeRockTexture();

      envTexture = buildBrightStudioEnv(renderer);
      scene.environment = envTexture;

      hemiLight = new THREE.HemisphereLight(0xf6f9ff, 0x3b445e, 1.15);
      scene.add(hemiLight);

      keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
      keyLight.position.set(-4, 6, 5);
      scene.add(keyLight);

      rimLight = new THREE.DirectionalLight(0xcfe4ff, 1.5);
      rimLight.position.set(5, 2, -4);
      scene.add(rimLight);

      fillLight = new THREE.PointLight(0xffe8d6, 1.2, 18);
      fillLight.position.set(3.5, -3.5, 4);
      scene.add(fillLight);

      rootGroup = new THREE.Group();
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
    const bump = opts.bump === "brushed" ? procTex.brushed : (opts.bump === "rock" ? procTex.rock : null);
    const bCfg = bump ? { bumpMap: bump, bumpScale: opts.bumpScale ?? 0.018 } : {};

    if (n === 83) {
      return new THREE.MeshPhysicalMaterial({
        color: 0xbac8dc, metalness: 0.92, roughness: 0.16,
        iridescence: 1.0, iridescenceIOR: 1.9, iridescenceThicknessRange: [180, 680],
        clearcoat: 0.85
      });
    }
    if (n === 6) {
      return new THREE.MeshPhysicalMaterial({
        color: 0xeaf4ff, metalness: 0.08, roughness: 0.04,
        transparent: true, opacity: 0.78, clearcoat: 1.0, reflectivity: 1.0,
        iridescence: 0.85, iridescenceIOR: 2.4
      });
    }
    if (n === 35) {
      return new THREE.MeshPhysicalMaterial({
        color: 0xa62008, emissive: 0x3b0800, metalness: 0.08, roughness: 0.08,
        clearcoat: 1.0, transparent: true, opacity: 0.88
      });
    }
    if (n === 16 || n === 15) {
      return new THREE.MeshPhysicalMaterial({
        color: v.baseColor, metalness: 0.08, roughness: 0.24, clearcoat: 0.55, ...bCfg
      });
    }
    if (n === 53) {
      return new THREE.MeshPhysicalMaterial({
        color: 0x5c2b82, metalness: 0.68, roughness: 0.20, clearcoat: 0.7, ...bCfg
      });
    }
    if ([14, 32, 5, 33, 51, 52].includes(n)) {
      return new THREE.MeshPhysicalMaterial({
        color: v.baseColor, metalness: 0.82, roughness: 0.18, clearcoat: 0.5, iridescence: 0.22, ...bCfg
      });
    }
    // Metals (gleaming realistic silver, gold, copper, steel, titanium — NEVER black!)
    return new THREE.MeshPhysicalMaterial({
      color: v.baseColor,
      metalness: opts.metalness ?? 0.86,
      roughness: opts.roughness ?? 0.24,
      clearcoat: opts.clearcoat ?? 0.35,
      iridescence: [22, 41, 73, 72].includes(n) ? 0.22 : 0.0,
      ...bCfg
    });
  }

  /* ============================================================
     MODE 1: DISTINCT 3D ATOM (NATURAL COLORS + QUANTUM ORBITAL LOBES)
     - Different nucleus size per atomic number
     - Real shell count (1..7)
     - Distinct s / p / d / f 3D quantum orbital cloud shapes!
     ============================================================ */
  function buildAtom(el) {
    const light = state.theme === "light";
    const blend = light ? THREE.NormalBlending : THREE.AdditiveBlending;
    const atomCol = new THREE.Color(el.vis.atomColor);
    const innerCol = atomCol.clone().lerp(new THREE.Color(light ? 0x3a4a6b : 0xd8e4ff), 0.55);

    // 1) Proportional Nucleus (clearly small for H/He, huge & dense for W/Sm/Np!)
    const nCount = el.num === 1 ? 1 : (el.num === 2 ? 4 : Math.min(46, Math.round(4 + Math.pow(el.num, 0.72) * 1.45)));
    const spread = nCount === 1 ? 0 : 0.075 + Math.pow(el.num / 118, 0.45) * 0.17;
    const nucR = nCount === 1 ? 0.115 : Math.max(0.046, 0.078 - nCount * 0.0007);

    const protons = [], neutrons = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < nCount; i++) {
      const y = nCount === 1 ? 0 : 1 - (i / (nCount - 1)) * 2;
      const rS = Math.sqrt(Math.max(0, 1 - y * y));
      const th = golden * i + el.num * 0.41;
      const rad = spread * (0.65 + 0.35 * ((i * 7) % 5) / 4);
      const p = new THREE.Vector3(Math.cos(th) * rS * rad, y * rad, Math.sin(th) * rS * rad);
      if (i % 2 === 0) protons.push(p); else neutrons.push(p);
    }

    const protonMat = new THREE.MeshPhysicalMaterial({
      color: 0xe6493a, emissive: 0x6b150c, emissiveIntensity: light ? 0.25 : 0.65,
      metalness: 0.22, roughness: 0.25, clearcoat: 0.8
    });
    const neutronMat = new THREE.MeshPhysicalMaterial({
      color: 0x7b8ba6, metalness: 0.62, roughness: 0.28, clearcoat: 0.4
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

    // Nucleus halo
    const auraMat = new THREE.SpriteMaterial({
      map: procTex.glow, color: el.vis.glowColor,
      transparent: true, opacity: light ? 0.30 : 0.55, blending: blend, depthWrite: false
    });
    const aura = new THREE.Sprite(auraMat);
    aura.userData.ownMat = true;
    const auraScale = (spread + nucR) * 3.6;
    aura.scale.set(auraScale, auraScale, 1);
    nucGroup.add(aura);
    contentGroup.add(nucGroup);

    // 2) Distinct 3D Quantum Orbital Cloud by subshell block (s / p / d / f)
    const orbitalGroup = new THREE.Group();
    const orbMat = new THREE.MeshPhysicalMaterial({
      color: atomCol, emissive: atomCol, emissiveIntensity: light ? 0.18 : 0.35,
      transparent: true, opacity: light ? 0.14 : 0.12, roughness: 0.15, depthWrite: false, side: THREE.DoubleSide
    });
    const addLobe = (pos, scale, rot) => {
      const m = new THREE.Mesh(sharedGeo.sphereMid, orbMat);
      m.position.set(...pos);
      m.scale.set(...scale);
      if (rot) m.rotation.set(...rot);
      orbitalGroup.add(m);
    };

    if (el.block === "s") {
      // Spherical s-orbital shell
      const m = new THREE.Mesh(sharedGeo.sphereHi, orbMat);
      m.scale.setScalar(0.56);
      m.userData.ownMat = true;
      orbitalGroup.add(m);
    } else if (el.block === "p") {
      // Classic 3D figure-8 p-orbital dumbbells
      addLobe([0, 0.44, 0], [0.22, 0.38, 0.22]);
      addLobe([0, -0.44, 0], [0.22, 0.38, 0.22]);
      addLobe([0.44, 0, 0], [0.38, 0.20, 0.20]);
      addLobe([-0.44, 0, 0], [0.38, 0.20, 0.20]);
      orbitalGroup.children[0].userData.ownMat = true;
    } else if (el.block === "d") {
      // 4-leaf cloverleaf d-orbital lobes + equatorial ring
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        addLobe([Math.cos(a) * 0.46, Math.sin(a) * 0.46, 0], [0.19, 0.36, 0.19], [0, 0, a - Math.PI / 2]);
      }
      const dRing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.08, 12, 48), orbMat);
      dRing.rotation.x = Math.PI / 2;
      dRing.userData.ownGeo = true;
      orbitalGroup.add(dRing);
      orbitalGroup.children[0].userData.ownMat = true;
    } else {
      // Intricate 8-lobed f-orbital rosette (Lanthanides like Sm, Actinides like Np!)
      for (let ix = -1; ix <= 1; ix += 2) {
        for (let iy = -1; iy <= 1; iy += 2) {
          for (let iz = -1; iz <= 1; iz += 2) {
            const v = new THREE.Vector3(ix, iy, iz).normalize();
            const m = new THREE.Mesh(sharedGeo.sphereMid, orbMat);
            m.position.copy(v).multiplyScalar(0.46);
            m.quaternion.setFromUnitVectors(upVec, v);
            m.scale.set(0.15, 0.30, 0.15);
            orbitalGroup.add(m);
          }
        }
      }
      orbitalGroup.children[0].userData.ownMat = true;
    }
    contentGroup.add(orbitalGroup);

    // 3) Electron Shells (exact count 1..7, visually distinct spread & natural spectral glow)
    const shells = el.shells, total = shells.length;
    const valRingMat = new THREE.MeshBasicMaterial({ color: atomCol, transparent: true, opacity: light ? 0.78 : 0.85 });
    const innerRingMat = new THREE.MeshBasicMaterial({ color: innerCol, transparent: true, opacity: light ? 0.32 : 0.28 });
    const valList = [], coreList = [];

    for (let s = 0; s < total; s++) {
      const radius = total === 1 ? 0.72 : (0.34 + (s / (total - 1)) * 0.72);
      const isVal = s === total - 1;
      // Distinct structured inclination per shell (looks architectural, not messy!)
      const tiltX = isVal ? 0.32 : ((s * 0.78 + 0.4) % Math.PI) - Math.PI * 0.5;
      const tiltZ = isVal ? -0.25 : ((s * 1.25 + 0.2) % Math.PI) - Math.PI * 0.5;
      const speed = (s % 2 === 0 ? 1 : -1) * (1.5 / (0.65 + s * 0.28));

      const ringGeo = new THREE.TorusGeometry(radius, isVal ? 0.008 : 0.0036, 8, 96);
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
        const item = { radius, qTilt, speed, phase: s * 1.2 + (e / visN) * TAU };
        if (isVal) valList.push(item); else coreList.push(item);
      }
    }

    const valMat = new THREE.MeshBasicMaterial({ color: light ? atomCol : 0xffffff });
    const coreMat = new THREE.MeshBasicMaterial({ color: innerCol });
    const valMesh = valList.length ? new THREE.InstancedMesh(sharedGeo.sphereMid, valMat, valList.length) : null;
    const coreMesh = coreList.length ? new THREE.InstancedMesh(sharedGeo.sphereLow, coreMat, coreList.length) : null;
    if (valMesh) { valMesh.userData.ownMat = true; contentGroup.add(valMesh); }
    if (coreMesh) { coreMesh.userData.ownMat = true; contentGroup.add(coreMesh); }

    const valSprites = [];
    if (valList.length) {
      const spMat = new THREE.SpriteMaterial({
        map: procTex.glow, color: atomCol,
        transparent: true, opacity: light ? 0.55 : 0.92, blending: blend, depthWrite: false
      });
      for (let i = 0; i < valList.length; i++) {
        const sp = new THREE.Sprite(spMat);
        sp.scale.set(0.24, 0.24, 1);
        if (i === 0) sp.userData.ownMat = true;
        contentGroup.add(sp);
        valSprites.push(sp);
      }
    }

    state.dyn = { type: "atom", nucGroup, aura, auraScale, orbitalGroup, valMesh, coreMesh, valSprites, valList, coreList };
  }

  /* ============================================================
     MODE 2: AUTHENTIC CRYSTAL LATTICE (NATURAL COLORS & CLEAR STRUCTURE)
     ============================================================ */
  function buildLattice(el) {
    const light = state.theme === "light";
    const blend = light ? THREE.NormalBlending : THREE.AdditiveBlending;
    const kind = el.vis.lat;
    const nodes = [], edges = [], faces = [];
    const seen = new Set();
    const addE = (a, b, acc = false) => {
      const k = a < b ? a * 256 + b : b * 256 + a;
      if (seen.has(k)) return;
      seen.add(k);
      edges.push([a, b, acc]);
    };
    const addF = (idx, acc = false) => faces.push({ idx, acc });

    const cageMat = new THREE.LineBasicMaterial({ color: light ? 0x4b5b7a : 0x9eb0cf, transparent: true, opacity: 0.30 });

    if (kind === "s8") {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        nodes.push({ x: Math.cos(a) * 0.72, y: i % 2 === 0 ? 0.20 : -0.20, z: Math.sin(a) * 0.72, acc: true, r: 0.16 });
      }
      for (let i = 0; i < 8; i++) addE(i, (i + 1) % 8, true);
    } else if (kind === "p4") {
      const s = 0.54;
      [[s,s,s],[s,-s,-s],[-s,s,-s],[-s,-s,s]].forEach(([x,y,z]) => nodes.push({ x, y, z, acc: true, r: 0.18 }));
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) addE(i, j, true);
      [[0,1,2],[0,1,3],[0,2,3],[1,2,3]].forEach(f => addF(f, true));
    } else if (kind === "bcc" || kind === "fcc") {
      const s = 0.58;
      const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s * 2, s * 2, s * 2)), cageMat);
      cage.userData.ownGeo = true; cage.userData.ownMat = true;
      contentGroup.add(cage);

      for (let ix = -1; ix <= 1; ix += 2)
        for (let iy = -1; iy <= 1; iy += 2)
          for (let iz = -1; iz <= 1; iz += 2)
            nodes.push({ x: ix*s, y: iy*s, z: iz*s, acc: false, r: 0.125 });
      [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]].forEach(([a,b]) => addE(a,b,false));

      if (kind === "bcc") {
        const c = nodes.length;
        nodes.push({ x: 0, y: 0, z: 0, acc: true, r: 0.18 });
        for (let i = 0; i < 8; i++) addE(c, i, true);
      } else {
        const st = nodes.length;
        [[s,0,0],[-s,0,0],[0,s,0],[0,-s,0],[0,0,s],[0,0,-s]].forEach(([x,y,z]) => nodes.push({x,y,z,acc:true,r:0.145}));
        [[0,2],[0,3],[0,4],[0,5],[1,2],[1,3],[1,4],[1,5],[2,4],[2,5],[3,4],[3,5]].forEach(([a,b]) => addE(st+a,st+b,true));
        [[0,2,4],[0,4,3],[0,3,5],[0,5,2],[1,2,4],[1,4,3],[1,3,5],[1,5,2]].forEach(f => addF(f.map(k => st+k), true));
      }
    } else if (kind === "hcp") {
      const R = 0.64, H = 0.56;
      for (let l = -1; l <= 1; l += 2) {
        const base = nodes.length, y = l * H;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          nodes.push({ x: Math.cos(a) * R, y, z: Math.sin(a) * R, acc: false, r: 0.115 });
        }
        const c = nodes.length;
        nodes.push({ x: 0, y, z: 0, acc: true, r: 0.14 });
        for (let i = 0; i < 6; i++) { addE(base+i, base+((i+1)%6), false); addE(c, base+i, false); }
        addF([base,base+1,base+2,base+3,base+4,base+5], false);
      }
      for (let i = 0; i < 6; i++) addE(i, 7+i, false);
      const m = nodes.length;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + Math.PI / 6;
        nodes.push({ x: Math.cos(a) * R * 0.55, y: 0, z: Math.sin(a) * R * 0.55, acc: true, r: 0.155 });
      }
      addE(m, m+1, true); addE(m+1, m+2, true); addE(m+2, m, true);
      addF([m, m+1, m+2], true);
    } else if (kind === "diamond") {
      const s = 0.58;
      const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s * 2, s * 2, s * 2)), cageMat);
      cage.userData.ownGeo = true; cage.userData.ownMat = true;
      contentGroup.add(cage);
      [[-s,-s,-s],[s,s,-s],[s,-s,s],[-s,s,s],[s,-s,-s],[-s,s,-s],[-s,-s,s],[s,s,s]].forEach(([x,y,z], i) => nodes.push({ x, y, z, acc: i < 4, r: 0.11 }));
      const t = 0.29, b = nodes.length;
      [[0,0,0],[-t,-t,-t],[t,t,-t],[t,-t,t],[-t,t,t]].forEach(([x,y,z]) => nodes.push({ x, y, z, acc: true, r: 0.145 }));
      for (let i = 1; i <= 4; i++) { addE(b, b+i, true); addE(b+i, i-1, true); }
      [[b+1,b+2,b+3],[b+1,b+2,b+4],[b+1,b+3,b+4],[b+2,b+3,b+4]].forEach(f => addF(f, true));
    } else if (kind === "gas2") {
      const d = 0.44;
      nodes.push({ x: -d, y: 0, z: 0, acc: true, r: 0.25 }, { x: d, y: 0, z: 0, acc: true, r: 0.25 });
      const bonds = el.num === 7 ? 3 : (el.num === 8 ? 2 : 1);
      for (let i = 0; i < bonds; i++) {
        const off = (i - (bonds - 1) / 2) * 0.15, a = nodes.length;
        nodes.push({ x: -d, y: off, z: 0, acc: false, r: 0 }, { x: d, y: off, z: 0, acc: false, r: 0 });
        addE(a, a + 1, true);
      }
      const moGeo = new THREE.CapsuleGeometry(0.48, 0.74, 14, 24);
      moGeo.rotateZ(Math.PI * 0.5);
      const moMat = new THREE.MeshPhysicalMaterial({ color: el.vis.glowColor, emissive: el.vis.glowColor, emissiveIntensity: 0.25, transparent: true, opacity: 0.18, roughness: 0.1, depthWrite: false });
      contentGroup.add(ownMesh(moGeo, moMat));
    } else if (kind === "noble") {
      const em = el.vis.glowColor;
      const coreMat = new THREE.MeshPhysicalMaterial({ color: em, emissive: em, emissiveIntensity: 0.95, roughness: 0.12, clearcoat: 1.0 });
      const core = new THREE.Mesh(sharedGeo.sphereHi, coreMat);
      core.scale.setScalar(0.30); core.userData.ownMat = true;
      contentGroup.add(core);
      const spMat = new THREE.SpriteMaterial({ map: procTex.glow, color: em, transparent: true, opacity: light ? 0.5 : 0.85, blending: blend, depthWrite: false });
      const sp = new THREE.Sprite(spMat); sp.scale.set(1.6, 1.6, 1); sp.userData.ownMat = true;
      contentGroup.add(sp);
      const rMat = new THREE.MeshBasicMaterial({ color: em, transparent: true, opacity: 0.55 });
      for (let r = 0; r < 3; r++) {
        const tm = new THREE.Mesh(new THREE.TorusGeometry(0.56 + r * 0.15, 0.007, 8, 84), rMat);
        tm.rotation.set(r * 0.95, r * 1.15, 0);
        tm.userData.ownGeo = true;
        if (r === 0) tm.userData.ownMat = true;
        contentGroup.add(tm);
      }
      state.dyn = { type: "noble", sp };
      return;
    } else if (kind === "liquid") {
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < 16; i++) {
        const y = 1 - (i / 15) * 2, rS = Math.sqrt(1 - y * y), th = golden * i + el.num;
        const rad = 0.52 + 0.16 * Math.sin(i * 2.1);
        nodes.push({ x: Math.cos(th)*rS*rad, y: y*rad, z: Math.sin(th)*rS*rad, acc: i % 3 === 0, r: i % 3 === 0 ? 0.145 : 0.105, phase: i * 0.7 });
      }
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++)
          if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y, nodes[i].z - nodes[j].z) < 0.66)
            addE(i, j, nodes[i].acc && nodes[j].acc);
    } else if (kind === "radio") {
      const r = 0.74;
      [[r,0,0],[-r,0,0],[0,r,0],[0,-r,0],[0,0,r],[0,0,-r]].forEach(([x,y,z]) => nodes.push({x,y,z,acc:false,r:0.125}));
      [[0,2,4],[0,4,3],[0,3,5],[0,5,2],[1,2,4],[1,4,3],[1,3,5],[1,5,2]].forEach(f => {
        addF(f, true); addE(f[0],f[1],true); addE(f[1],f[2],true); addE(f[2],f[0],true);
      });
      nodes.push({ x: 0, y: 0, z: 0, acc: true, r: 0.24 });
    } else {
      const sx = 0.64, sy = 0.48, sz = 0.52, skew = 0.16;
      for (let ix = -1; ix <= 1; ix += 2)
        for (let iy = -1; iy <= 1; iy += 2)
          for (let iz = -1; iz <= 1; iz += 2)
            nodes.push({ x: ix*sx + iy*skew, y: iy*sy, z: iz*sz, acc: false, r: 0.115 });
      [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]].forEach(([a,b]) => addE(a,b,false));
      const m = nodes.length;
      nodes.push({ x: -0.22, y: 0, z: 0.16, acc: true, r: 0.15 }, { x: 0.22, y: 0, z: -0.16, acc: true, r: 0.15 });
      addE(m, m+1, true); addE(m, 0, true); addE(m, 3, true); addE(m+1, 4, true); addE(m+1, 7, true);
    }

    const mainMat = makeNaturalMaterial(el, { metalness: 0.80, roughness: 0.20, clearcoat: 0.5 });
    const secMat = new THREE.MeshPhysicalMaterial({ color: 0xcbd5e8, metalness: 0.82, roughness: 0.22, clearcoat: 0.4 });
    const bondMainMat = new THREE.MeshPhysicalMaterial({ color: el.vis.atomColor, emissive: el.vis.atomColor, emissiveIntensity: 0.18, metalness: 0.55, roughness: 0.24 });
    const bondSecMat = new THREE.MeshPhysicalMaterial({ color: 0x9aa7bf, metalness: 0.78, roughness: 0.26 });

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
    addFaceGroup(faces.filter(f => f.acc), el.vis.atomColor, 0.16);
    addFaceGroup(faces.filter(f => !f.acc), 0xb0c4e8, 0.08);

    let radioSparks = null;
    if (kind === "radio") {
      const rm = new THREE.MeshBasicMaterial({ color: el.vis.glowColor });
      radioSparks = new THREE.InstancedMesh(sharedGeo.sphereLow, rm, 14);
      radioSparks.userData.ownMat = true;
      contentGroup.add(radioSparks);
    }

    const curPos = nodes.map(n => new THREE.Vector3(n.x, n.y, n.z));
    const updateLattice = (t) => {
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i], p = curPos[i];
        if (kind === "liquid") {
          const ph = n.phase || i;
          p.set(n.x + Math.sin(t * 2.1 + ph) * 0.05, n.y + Math.cos(t * 1.8 + ph * 1.3) * 0.05, n.z + Math.sin(t * 2.4 - ph) * 0.05);
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
      placeBonds(eAccMesh, accEdges, 0.024);
      placeBonds(eSecMesh, secEdges, 0.015);

      if (radioSparks) {
        tmpQuat.identity();
        for (let i = 0; i < 14; i++) {
          const life = (t * 0.65 + i / 14) % 1;
          const a = i * 2.3 + 0.4, elv = ((i % 3) - 1) * 0.72, d = 0.24 + life * 0.94;
          tmpPos.set(Math.cos(a) * Math.cos(elv) * d, Math.sin(elv) * d, Math.sin(a) * Math.cos(elv) * d);
          tmpScale.setScalar((1 - life) * 0.05);
          tmpM4.compose(tmpPos, tmpQuat, tmpScale);
          radioSparks.setMatrixAt(i, tmpM4);
        }
        radioSparks.instanceMatrix.needsUpdate = true;
      }
    };
    updateLattice(0);
    state.dyn = { type: "lattice", kind, update: updateLattice };
  }

  /* ===== HELPER: SCULPT ORGANIC FACETED METAL / ORE CHUNK (ZERO BORING CUBES!) ===== */
  function makeSculptedChunkGeo(seed, radius, detail, flatScale, jaggedness) {
    const geo = new THREE.IcosahedronGeometry(radius, detail);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n1 = Math.sin(x * 3.1 + seed) * Math.cos(y * 2.7 - seed * 0.6) * Math.sin(z * 3.3 + seed * 0.4);
      const n2 = Math.cos(x * 6.4 - z * 5.2 + seed * 1.3) * Math.sin(y * 5.8 + seed);
      const disp = 1 + n1 * jaggedness + n2 * (jaggedness * 0.45);
      pos.setXYZ(i, x * disp * flatScale[0], y * disp * flatScale[1], z * disp * flatScale[2]);
    }
    const faceted = geo.toNonIndexed();
    geo.dispose();
    faceted.computeVertexNormals();
    return faceted;
  }

  /* ============================================================
     MODE 3: REALISTIC, RECOGNIZABLE 3D SPECIMENS (NO CUBES, NO CAGES, NO STANDS)
     ============================================================ */
  function buildSpecimen(el) {
    const sp = el.vis.spec;
    const light = state.theme === "light";
    const blend = light ? THREE.NormalBlending : THREE.AdditiveBlending;

    // 1) TUNGSTEN (W): Iconic Glowing Coiled Incandescent Filament!
    if (sp === "filament") {
      const pts = [];
      const turns = 12, steps = 320;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const arcA = (u - 0.5) * Math.PI * 1.15;
        const mainR = 0.68;
        const cx = Math.sin(arcA) * mainR;
        const cy = Math.cos(arcA) * mainR - 0.16;
        // Tangent & normal along the arch
        const tx = Math.cos(arcA), ty = -Math.sin(arcA);
        const nx = -ty, ny = tx;
        const coilA = u * turns * TAU;
        const coilR = 0.125;
        pts.push(new THREE.Vector3(
          cx + nx * Math.cos(coilA) * coilR,
          cy + ny * Math.cos(coilA) * coilR,
          Math.sin(coilA) * coilR
        ));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const coilGeo = new THREE.TubeGeometry(curve, 260, 0.028, 10, false);
      const coilMat = new THREE.MeshPhysicalMaterial({
        color: 0xffd59e, emissive: 0xff7b1c, emissiveIntensity: 1.55,
        metalness: 0.72, roughness: 0.22, clearcoat: 0.4
      });
      const coil = ownMesh(coilGeo, coilMat);
      contentGroup.add(coil);

      // Silvery tungsten support lead wires
      const leadMat = makeNaturalMaterial(el, { metalness: 0.92, roughness: 0.20 });
      const leadGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.68, 12);
      const l1 = new THREE.Mesh(leadGeo, leadMat); l1.position.set(-0.66, -0.42, 0); l1.rotation.z = -0.18; l1.userData.ownGeo = true; l1.userData.ownMat = true;
      const l2 = new THREE.Mesh(leadGeo, leadMat); l2.position.set(0.66, -0.42, 0); l2.rotation.z = 0.18;
      contentGroup.add(l1, l2);

      // Warm incandescent radiant halo
      const glowMat = new THREE.SpriteMaterial({ map: procTex.glow, color: 0xff9b3d, transparent: true, opacity: light ? 0.35 : 0.72, blending: blend, depthWrite: false });
      const glow = new THREE.Sprite(glowMat);
      glow.position.y = 0.32; glow.scale.set(1.9, 1.4, 1); glow.userData.ownMat = true;
      contentGroup.add(glow);
      state.dyn = { type: "filament", coilMat, glow };
      return;
    }

    // 2) CARBON (C): Brilliant-Cut Sparkling Diamond!
    if (sp === "diamond") {
      const mat = makeNaturalMaterial(el);
      const crownGeo = new THREE.CylinderGeometry(0.42, 0.76, 0.26, 12, 1);
      const pavGeo = new THREE.ConeGeometry(0.76, 0.78, 12, 1);
      pavGeo.rotateX(Math.PI);

      const crown = ownMesh(crownGeo, mat); crown.position.y = 0.24;
      const pav = new THREE.Mesh(pavGeo, mat); pav.position.y = -0.28; pav.userData.ownGeo = true;
      const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: light ? 0.5 : 0.4 });
      const w1 = new THREE.LineSegments(new THREE.EdgesGeometry(crownGeo, 10), wireMat); w1.position.y = 0.24; w1.userData.ownGeo = true; w1.userData.ownMat = true;
      const w2 = new THREE.LineSegments(new THREE.EdgesGeometry(pavGeo, 10), wireMat); w2.position.y = -0.28; w2.userData.ownGeo = true;
      contentGroup.add(crown, pav, w1, w2);

      const spMat = new THREE.SpriteMaterial({ map: procTex.glow, color: 0xd8f3ff, transparent: true, opacity: light ? 0.45 : 0.85, blending: blend, depthWrite: false });
      const sparkle = new THREE.Sprite(spMat); sparkle.position.set(0.32, 0.36, 0.42); sparkle.scale.set(0.55, 0.55, 1); sparkle.userData.ownMat = true;
      contentGroup.add(sparkle);
      state.dyn = { type: "sparkle", sparkle };
      return;
    }

    // 3) BISMUTH (Bi): Stepped Rainbow Hopper Crystal
    if (sp === "bismuth") {
      const mat = makeNaturalMaterial(el);
      const steps = [
        { s: 1.12, h: 0.21, y: -0.34 },
        { s: 0.84, h: 0.23, y: -0.13 },
        { s: 0.58, h: 0.23, y: 0.09 },
        { s: 0.34, h: 0.21, y: 0.29 }
      ];
      steps.forEach((st, idx) => {
        const o = st.s * 0.5, i = o * 0.64;
        const sh = new THREE.Shape();
        sh.moveTo(-o, -o); sh.lineTo(o, -o); sh.lineTo(o, o); sh.lineTo(-o, o); sh.closePath();
        const hole = new THREE.Path();
        hole.moveTo(-i, -i); hole.lineTo(i, -i); hole.lineTo(i, i); hole.lineTo(-i, i); hole.closePath();
        sh.holes.push(hole);
        const g = new THREE.ExtrudeGeometry(sh, { depth: st.h, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });
        g.rotateX(Math.PI * 0.5); g.center();
        const m = new THREE.Mesh(g, mat);
        m.position.y = st.y; m.rotation.y = idx * 0.1; m.userData.ownGeo = true;
        if (idx === 0) m.userData.ownMat = true;
        contentGroup.add(m);
      });
      return;
    }

    // 4) GASES (H, He, N, O, F, Ne, Cl, Ar, Kr, Xe, Rn, Og): Crystal Glass Orb + Living Plasma Nebula!
    if (sp === "gas_orb") {
      const em = el.vis.glowColor;
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xeaf2ff, metalness: 0.05, roughness: 0.05,
        transparent: true, opacity: light ? 0.22 : 0.16,
        clearcoat: 1.0, reflectivity: 1.0, side: THREE.FrontSide, depthWrite: false
      });
      const orb = new THREE.Mesh(sharedGeo.sphereHi, glassMat);
      orb.scale.setScalar(0.84); orb.userData.ownMat = true;
      contentGroup.add(orb);

      // Inner swirling glowing core + volumetric sprites
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
      const core = new THREE.Mesh(sharedGeo.sphereMid, coreMat);
      core.scale.setScalar(0.14); core.userData.ownMat = true;
      contentGroup.add(core);

      const spMat = new THREE.SpriteMaterial({ map: procTex.glow, color: em, transparent: true, opacity: light ? 0.55 : 0.90, blending: blend, depthWrite: false });
      const aura = new THREE.Sprite(spMat); aura.scale.set(1.55, 1.55, 1); aura.userData.ownMat = true;
      contentGroup.add(aura);

      const pMat = new THREE.MeshBasicMaterial({ color: em });
      const pMesh = new THREE.InstancedMesh(sharedGeo.sphereLow, pMat, 28);
      pMesh.userData.ownMat = true;
      contentGroup.add(pMesh);
      state.dyn = { type: "gas_orb", aura, pMesh };
      return;
    }

    // 5) LIQUIDS (Hg, Ga, Br): Levitated Rippling Liquid Metal / Bromine Orb (Zero Black Caps!)
    if (sp === "liquid") {
      const mat = makeNaturalMaterial(el, { metalness: el.num === 35 ? 0.08 : 0.96, roughness: 0.05, clearcoat: 1.0 });
      const geo = new THREE.IcosahedronGeometry(0.62, 5);
      const basePos = new Float32Array(geo.attributes.position.array);
      contentGroup.add(ownMesh(geo, mat));
      state.dyn = { type: "droplet", geo, basePos };
      return;
    }

    // 6) ACTINIDES & RADIOACTIVE ELEMENTS (Np, U, Pu, Ra, Am, Cm, etc.): Glowing Raw Crystalline Ore + Cherenkov Veins!
    if (sp === "actinide_ore") {
      const oreMat = new THREE.MeshPhysicalMaterial({
        color: el.vis.baseColor, metalness: 0.78, roughness: 0.32,
        bumpMap: procTex.rock, bumpScale: 0.025, clearcoat: 0.3
      });
      const oreGeo = makeSculptedChunkGeo(el.num * 1.7, 0.58, 2, [1.1, 0.88, 0.95], 0.24);
      contentGroup.add(ownMesh(oreGeo, oreMat));

      // Luminous crystalline veins emerging from the mineral chunk
      const crystalMat = new THREE.MeshPhysicalMaterial({
        color: el.vis.glowColor, emissive: el.vis.glowColor, emissiveIntensity: light ? 0.65 : 1.15,
        metalness: 0.12, roughness: 0.14, transparent: true, opacity: 0.88, clearcoat: 1.0
      });
      const shards = [
        [0.14, 0.42, 0.12, 0.13, 0.72, 0.22, -0.35],
        [-0.28, 0.34, 0.20, 0.11, 0.62, 0.34, 0.42],
        [0.34, 0.14, -0.24, 0.10, 0.56, -0.45, -0.58],
        [-0.22, -0.28, 0.36, 0.10, 0.52, 0.72, 0.28],
        [0.05, 0.18, -0.40, 0.11, 0.58, -0.68, 0.14]
      ];
      shards.forEach(([x, y, z, r, h, rx, rz], idx) => {
        const g = new THREE.ConeGeometry(r, h, 6);
        const m = new THREE.Mesh(g, crystalMat);
        m.position.set(x, y, z); m.rotation.set(rx, idx * 0.9, rz);
        m.userData.ownGeo = true;
        if (idx === 0) m.userData.ownMat = true;
        contentGroup.add(m);
      });

      // Soft radioluminescent aura + drifting scintillation sparks
      const auraMat = new THREE.SpriteMaterial({ map: procTex.glow, color: el.vis.glowColor, transparent: true, opacity: light ? 0.32 : 0.62, blending: blend, depthWrite: false });
      const aura = new THREE.Sprite(auraMat); aura.scale.set(1.85, 1.85, 1); aura.userData.ownMat = true;
      contentGroup.add(aura);

      const spMat = new THREE.MeshBasicMaterial({ color: el.vis.glowColor });
      const sparks = new THREE.InstancedMesh(sharedGeo.sphereLow, spMat, 18);
      sparks.userData.ownMat = true;
      contentGroup.add(sparks);
      state.dyn = { type: "radio_ore", aura, sparks };
      return;
    }

    // 7) LANTHANIDES (Sm, Nd, Gd, Eu, La–Lu): Gleaming Hexagonal Rare-Earth Crystal Prisms!
    if (sp === "lanthanide_prism") {
      const mat = makeNaturalMaterial(el, { metalness: 0.90, roughness: 0.18, clearcoat: 0.55, bump: "brushed" });
      const prisms = [
        [0, 0.04, 0, 0.24, 1.25, 0.04, -0.06],
        [0.32, -0.08, 0.18, 0.17, 0.94, 0.24, -0.34],
        [-0.30, -0.10, 0.22, 0.16, 0.86, 0.28, 0.36],
        [0.16, -0.14, -0.30, 0.16, 0.80, -0.36, -0.20],
        [-0.26, -0.16, -0.20, 0.15, 0.72, -0.28, 0.34],
        [0.40, -0.24, -0.14, 0.12, 0.58, -0.18, -0.58]
      ];
      prisms.forEach(([x, y, z, r, h, rx, rz], idx) => {
        const bodyH = h * 0.74, tipH = h * 0.26;
        const g1 = new THREE.CylinderGeometry(r * 0.86, r, bodyH, 6);
        const g2 = new THREE.ConeGeometry(r * 0.86, tipH, 6);
        const grp = new THREE.Group();
        const m1 = new THREE.Mesh(g1, mat); m1.userData.ownGeo = true;
        if (idx === 0) m1.userData.ownMat = true;
        const m2 = new THREE.Mesh(g2, mat); m2.position.y = (bodyH + tipH) * 0.5; m2.userData.ownGeo = true;
        grp.add(m1, m2);
        grp.position.set(x, y, z);
        grp.rotation.set(rx, idx * 0.8 + el.num * 0.2, rz);
        contentGroup.add(grp);
      });
      return;
    }

    // 8) NONMETAL & METALLOID MINERALS (S, P, Si, Ge, B, I, Se, Te, As, Sb): Natural Crystal Druze!
    if (sp === "mineral") {
      const mat = makeNaturalMaterial(el, { bump: "rock" });
      const spires = [
        [0, 0.05, 0, 0.26, 1.22, 0.05, 0],
        [0.30, -0.08, 0.18, 0.19, 0.90, 0.28, -0.35],
        [-0.28, -0.10, 0.20, 0.18, 0.82, 0.30, 0.38],
        [0.14, -0.14, -0.30, 0.17, 0.76, -0.38, -0.18],
        [-0.26, -0.16, -0.18, 0.15, 0.70, -0.30, 0.34],
        [0.40, -0.22, -0.12, 0.13, 0.56, -0.16, -0.56],
        [-0.38, -0.22, 0.06, 0.13, 0.52, 0.12, 0.58]
      ];
      spires.forEach(([x, y, z, r, h, rx, rz], idx) => {
        const bodyH = h * 0.68, tipH = h * 0.32;
        const g1 = new THREE.CylinderGeometry(r * 0.82, r, bodyH, 6);
        const g2 = new THREE.ConeGeometry(r * 0.82, tipH, 6);
        const grp = new THREE.Group();
        const m1 = new THREE.Mesh(g1, mat); m1.userData.ownGeo = true;
        if (idx === 0) m1.userData.ownMat = true;
        const m2 = new THREE.Mesh(g2, mat); m2.position.y = (bodyH + tipH) * 0.5; m2.userData.ownGeo = true;
        grp.add(m1, m2);
        grp.position.set(x, y, z);
        grp.rotation.set(rx, idx * 0.7 + el.num * 0.17, rz);
        contentGroup.add(grp);
      });
      return;
    }

    // 9) PRECIOUS NATIVE NUGGET (Au, Ag, Pt, Cu, Pd, Rh, Ir, Os): Sculpted Gleaming Metallic Nugget!
    if (sp === "nugget") {
      const mat = makeNaturalMaterial(el, { metalness: 0.95, roughness: 0.18, clearcoat: 0.45, bump: "rock", bumpScale: 0.012 });
      const gMain = makeSculptedChunkGeo(el.num * 2.3, 0.64, 3, [1.22, 0.82, 0.94], 0.26);
      const gSub = makeSculptedChunkGeo(el.num * 4.1, 0.38, 2, [0.95, 1.15, 0.9], 0.24);
      const m1 = ownMesh(gMain, mat);
      const m2 = new THREE.Mesh(gSub, mat); m2.position.set(0.36, 0.22, 0.16); m2.userData.ownGeo = true;
      contentGroup.add(m1, m2);
      return;
    }

    // 10) ALKALI METALS (Li, Na, K, Rb, Cs): Freshly-Sliced Metallic Wedge (Bright Cut + Matte Crust)!
    if (sp === "alkali_wedge") {
      const cutMat = makeNaturalMaterial(el, { metalness: 0.96, roughness: 0.12, clearcoat: 0.6 });
      const shape = new THREE.Shape();
      shape.moveTo(-0.62, -0.34); shape.lineTo(0.62, -0.34);
      shape.lineTo(0.46, 0.38); shape.lineTo(-0.52, 0.26); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.68, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3 });
      geo.center();
      contentGroup.add(ownMesh(geo, cutMat));
      return;
    }

    // 11) ALKALINE EARTH METALS (Be, Mg, Ca, Sr, Ba): Coiled Metallic Lab Ribbon!
    if (sp === "ribbon") {
      const mat = makeNaturalMaterial(el, { metalness: 0.92, roughness: 0.22, bump: "brushed" });
      const pts = [];
      for (let i = 0; i <= 140; i++) {
        const u = i / 140;
        const a = u * 3.4 * TAU;
        const r = 0.26 + u * 0.52;
        pts.push(new THREE.Vector3(Math.cos(a) * r, (u - 0.5) * 0.52, Math.sin(a) * r));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.062, 10, false);
      geo.scale(1, 0.55, 1);
      contentGroup.add(ownMesh(geo, mat));
      return;
    }

    // 12) TRANSITION & POST-TRANSITION METALS (Fe, Ti, Cr, Ni, Co, Mo, Hf, Ta, Al, Pb, etc.):
    //     Authentic Sculpted Crystalline Metallic Chunk — NEVER a flat black cube!
    const mat = makeNaturalMaterial(el, { metalness: 0.88, roughness: 0.22, clearcoat: 0.4, bump: "brushed", bumpScale: 0.015 });
    const geo = makeSculptedChunkGeo(el.num * 1.37, 0.68, 2, [1.14, 0.86, 0.96], 0.22);
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
      state.morphScale = 0.76;
      state.morphVel = 4.2;
      state.velY += 1.4;
    }
  }

  function animateIn() {
    state.morphScale = 0.72;
    state.morphVel = 4.8;
    state.velY = 1.6;
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

    if (state.resettingCam) {
      const k = 1 - Math.exp(-10 * dt);
      const dX = wrapPi(HOME_X - state.rotX), dY = wrapPi(HOME_Y - state.rotY);
      state.rotX += dX * k; state.rotY += dY * k;
      state.velX = 0; state.velY = state.autoSpin;
      if (Math.abs(dX) < 0.004 && Math.abs(dY) < 0.004) { state.rotX = HOME_X; state.rotY = HOME_Y; state.resettingCam = false; }
    } else if (!state.dragging) {
      state.rotX += state.velX * dt;
      state.rotY += state.velY * dt;
      const decay = Math.exp(-3.6 * dt);
      state.velX *= decay;
      state.velY = state.autoSpin + (state.velY - state.autoSpin) * decay;
    }

    const sc = Math.max(0.05, state.morphScale) * state.zoom;
    rootGroup.scale.setScalar(sc);
    rootGroup.rotation.set(state.rotX, state.rotY, 0, "XYZ");

    const dyn = state.dyn, t = state.time;
    if (dyn) {
      if (dyn.type === "atom") {
        const pulse = 1 + Math.sin(t * 2.8) * 0.03;
        dyn.nucGroup.scale.setScalar(pulse);
        dyn.aura.scale.set(dyn.auraScale * (0.94 + Math.sin(t * 2.8) * 0.08), dyn.auraScale * (0.94 + Math.sin(t * 2.8) * 0.08), 1);
        dyn.orbitalGroup.rotation.y = t * 0.22;
        dyn.orbitalGroup.rotation.x = Math.sin(t * 0.3) * 0.14;

        tmpQuat.identity();
        if (dyn.valMesh) {
          tmpScale.setScalar(0.038);
          for (let i = 0; i < dyn.valList.length; i++) {
            const e = dyn.valList[i], a = e.phase + t * e.speed;
            tmpPos.set(Math.cos(a) * e.radius, 0, Math.sin(a) * e.radius).applyQuaternion(e.qTilt);
            tmpM4.compose(tmpPos, tmpQuat, tmpScale);
            dyn.valMesh.setMatrixAt(i, tmpM4);
            dyn.valSprites[i].position.copy(tmpPos);
          }
          dyn.valMesh.instanceMatrix.needsUpdate = true;
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
      } else if (dyn.type === "lattice" && (dyn.kind === "liquid" || dyn.kind === "gas2" || dyn.kind === "radio")) {
        dyn.update(t);
      } else if (dyn.type === "noble") {
        const s = 1.5 + Math.sin(t * 2.6) * 0.14;
        dyn.sp.scale.set(s, s, 1);
      } else if (dyn.type === "filament") {
        dyn.coilMat.emissiveIntensity = 1.45 + Math.sin(t * 5.0) * 0.18;
        const s = 1.85 + Math.sin(t * 5.0) * 0.12;
        dyn.glow.scale.set(s, s * 0.75, 1);
      } else if (dyn.type === "sparkle") {
        const s = 0.42 + Math.abs(Math.sin(t * 3.2)) * 0.34;
        dyn.sparkle.scale.set(s, s, 1);
      } else if (dyn.type === "gas_orb") {
        const s = 1.45 + Math.sin(t * 3.4) * 0.12;
        dyn.aura.scale.set(s, s, 1);
        tmpQuat.identity();
        for (let i = 0; i < 28; i++) {
          const ph = i * 1.17;
          const r = 0.16 + ((i * 19) % 100) / 200;
          const th = t * (1.0 + (i % 4) * 0.3) + ph;
          const elv = Math.sin(t * 0.9 + ph * 1.3) * 0.85;
          tmpPos.set(Math.cos(th) * Math.cos(elv) * r, Math.sin(elv) * r, Math.sin(th) * Math.cos(elv) * r);
          tmpScale.setScalar(0.022);
          tmpM4.compose(tmpPos, tmpQuat, tmpScale);
          dyn.pMesh.setMatrixAt(i, tmpM4);
        }
        dyn.pMesh.instanceMatrix.needsUpdate = true;
      } else if (dyn.type === "radio_ore") {
        const s = 1.75 + Math.sin(t * 3.2) * 0.16;
        dyn.aura.scale.set(s, s, 1);
        tmpQuat.identity();
        for (let i = 0; i < 18; i++) {
          const life = (t * 0.55 + i / 18) % 1;
          const a = i * 2.1, elv = ((i % 5) - 2) * 0.42, d = 0.42 + life * 0.85;
          tmpPos.set(Math.cos(a) * Math.cos(elv) * d, Math.sin(elv) * d, Math.sin(a) * Math.cos(elv) * d);
          tmpScale.setScalar((1 - life) * 0.036);
          tmpM4.compose(tmpPos, tmpQuat, tmpScale);
          dyn.sparks.setMatrixAt(i, tmpM4);
        }
        dyn.sparks.instanceMatrix.needsUpdate = true;
      } else if (dyn.type === "droplet") {
        const arr = dyn.geo.attributes.position.array, base = dyn.basePos;
        for (let i = 0; i < arr.length; i += 3) {
          const bx = base[i], by = base[i + 1], bz = base[i + 2];
          const w = 1 + 0.065 * Math.sin(by * 5.8 + t * 2.9) * Math.cos(bx * 5.4 - t * 2.2);
          arr[i] = bx * w; arr[i + 1] = by * w; arr[i + 2] = bz * w;
        }
        dyn.geo.attributes.position.needsUpdate = true;
        dyn.geo.computeVertexNormals();
      }
    }

    renderer.render(scene, camera);
  }

  /* ===== TOUCH & MOUSE CONTROLS ===== */
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
      state.rotY += dx * 0.011; state.rotX += dy * 0.011;
      state.velY = dx * 0.18; state.velX = dy * 0.18;
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
