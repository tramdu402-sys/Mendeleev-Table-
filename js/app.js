import { I18N, ELEMENTS } from "./data.js";
import { createScene3D } from "./scene3d.js";

const $ = (id) => document.getElementById(id);
const hapticTick = () => { try { window.AndroidHaptics?.tick(); } catch (_) {} };

const UI_TEXT = {
  ru: {
    title: "Таблица Менделеева",
    brand: "Таблица Менделеева",
    heroTitle: "Д. И. МЕНДЕЛЕЕВ",
    selectPrompt: "Нажми на элемент или зажми на 0.15с и веди пальцем",
    themeName: { dark: "Тёмная", light: "Светлая" }
  },
  en: {
    title: "Periodic Table",
    brand: "Periodic Table",
    heroTitle: "D. I. MENDELEEV",
    selectPrompt: "Tap an element or hold 0.15s and drag",
    themeName: { dark: "Dark", light: "Light" }
  }
};

/* ===== PREFERENCES ===== */
const PREFS_KEY = "mendeleev_prefs_v3";
const prefs = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    return {
      lang: s.lang === "en" ? "en" : "ru",
      theme: s.theme === "light" ? "light" : "dark",
      layout: s.layout === "long" ? "long" : "short"
    };
  } catch (_) {
    return { lang: "ru", theme: "dark", layout: "short" };
  }
})();
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) {} };

/* ===== DOM REFS ===== */
const metaTheme = $("metaTheme");
const topbar = $("topbar");
const shortGrid = $("shortGrid"), oxideRow = $("oxideRow");
const shortLaRow = $("shortLaRow"), shortAcRow = $("shortAcRow"), ptableLong = $("ptableLong");
const tableSection = $("tableSection"), selectPrompt = $("selectPrompt"), detailSection = $("detailSection");
const searchToggle = $("searchToggle"), searchInput = $("searchInput"), clearSearch = $("clearSearch");
const settingsBtn = $("settingsBtn"), settingsModal = $("settingsModal"), settingsClose = $("settingsClose");
const fZ = $("fZ"), fSym = $("fSym"), fPrimary = $("fPrimary"), fSecondary = $("fSecondary");
const fPos = $("fPos"), fMass = $("fMass"), fCat = $("fCat"), fDesc = $("fDesc"), fFeat = $("fFeat");
const btnPrev = $("btnPrev"), btnNext = $("btnNext"), btnClose = $("btnClose");
const stage3dSlot = $("stage3dSlot"), fsPortal = $("fsPortal"), stage3d = $("stage3d");
const hud3dLabel = $("hud3dLabel"), hudShells = $("hudShells"), hudCfg = $("hudCfg");
const btnExpand = $("btnExpand");
const modeBtns = document.querySelectorAll(".mode-btn[data-mode]");

/* Floating scrub loupe above finger */
const scrubBadge = document.createElement("div");
scrubBadge.className = "scrub-badge";
scrubBadge.innerHTML =
  `<div class="scrub-badge-sym" id="sbSym"></div>` +
  `<div class="scrub-badge-meta">` +
    `<div class="scrub-badge-name" id="sbName"></div>` +
    `<div class="scrub-badge-sub" id="sbSub"></div>` +
  `</div>`;
document.body.appendChild(scrubBadge);
const sbSym = $("sbSym"), sbName = $("sbName"), sbSub = $("sbSub");

let selectedNum = null;
let activeCategory = null;
const shortCellMap = new Map();
const longCellMap = new Map();
const rowGroups = new Map();
const colGroups = new Map();
let activeCrossCells = [];
let activePopCell = null;

function indexCell(cell, grid, row, col) {
  cell._grid = grid;
  cell._row = row;
  cell._col = col;
  const rk = `${grid}:r:${row}`;
  const ck = `${grid}:c:${col}`;
  if (!rowGroups.has(rk)) rowGroups.set(rk, []);
  if (!colGroups.has(ck)) colGroups.set(ck, []);
  rowGroups.get(rk).push(cell);
  colGroups.get(ck).push(cell);
}

/* ===== BUILD TABLES ===== */
function makeCell(el) {
  const cell = document.createElement("div");
  cell.className = "cell";
  cell.dataset.num = el.num;
  cell.innerHTML =
    `<span class="cell-mass">${el.mass}</span>` +
    `<span class="cell-sym">${el.sym}</span>` +
    `<span class="cell-name">${el.ru}</span>`;
  return cell;
}

function buildShortTable() {
  const sf = document.createDocumentFragment();
  const romans = ["I", "II", "III", "IV", "V", "VI", "VII"];
  romans.forEach((r, idx) => {
    const h = document.createElement("div");
    h.className = "grp-hdr";
    h.textContent = r;
    h.style.gridColumn = String(idx + 1);
    h.style.gridRow = "1";
    sf.appendChild(h);
  });
  const h8 = document.createElement("div");
  h8.className = "grp-hdr g-viii";
  h8.textContent = "VIII";
  h8.style.gridColumn = "8 / 11";
  h8.style.gridRow = "1";
  sf.appendChild(h8);

  const laFrag = document.createDocumentFragment();
  const acFrag = document.createDocumentFragment();

  for (const el of ELEMENTS) {
    const cell = makeCell(el);
    shortCellMap.set(el.num, cell);
    if (el.srow <= 11) {
      cell.style.gridRow = String(el.srow + 1);
      cell.style.gridColumn = String(el.scol);
      indexCell(cell, "sm", el.srow, el.scol);
      sf.appendChild(cell);
    } else if (el.srow === 12) {
      indexCell(cell, "sf", 12, el.scol);
      laFrag.appendChild(cell);
    } else {
      indexCell(cell, "sf", 13, el.scol);
      acFrag.appendChild(cell);
    }
  }
  shortGrid.appendChild(sf);
  shortLaRow.appendChild(laFrag);
  shortAcRow.appendChild(acFrag);

  const oxides = ["R<sub>2</sub>O", "RO", "R<sub>2</sub>O<sub>3</sub>", "RO<sub>2</sub>", "R<sub>2</sub>O<sub>5</sub>", "RO<sub>3</sub>", "R<sub>2</sub>O<sub>7</sub>", "RO<sub>4</sub>"];
  const of = document.createDocumentFragment();
  oxides.forEach((fx, idx) => {
    const c = document.createElement("div");
    c.className = "oxide-cell";
    c.innerHTML = fx;
    if (idx === 7) c.style.gridColumn = "8 / 11";
    of.appendChild(c);
  });
  oxideRow.appendChild(of);
}

function buildLongTable() {
  const lf = document.createDocumentFragment();
  for (let g = 1; g <= 18; g++) {
    const h = document.createElement("div");
    h.className = "grp-hdr";
    h.textContent = String(g);
    h.style.gridRow = "1";
    h.style.gridColumn = String(g);
    lf.appendChild(h);
  }

  for (const [text, row] of [["57–71", 7], ["89–103", 8]]) {
    const m = document.createElement("div");
    m.className = "series-marker";
    m.textContent = text;
    m.style.gridRow = String(row);
    m.style.gridColumn = "3";
    lf.appendChild(m);
  }

  const gap = document.createElement("div");
  gap.className = "long-gap";
  gap.style.gridRow = "9";
  lf.appendChild(gap);

  for (const el of ELEMENTS) {
    const cell = makeCell(el);
    cell.style.gridRow = String(el.lrow + 1);
    cell.style.gridColumn = String(el.lcol);
    indexCell(cell, "lg", el.lrow, el.lcol);
    longCellMap.set(el.num, cell);
    lf.appendChild(cell);
  }
  ptableLong.appendChild(lf);
}

buildShortTable();
buildLongTable();

/* ===== CROSSHAIR & SCRUB LOUPE ===== */
function clearCrosshair() {
  for (let i = 0; i < activeCrossCells.length; i++) {
    activeCrossCells[i].classList.remove("crosshair");
  }
  activeCrossCells = [];
  if (activePopCell) {
    activePopCell.classList.remove("scrub-pop");
    activePopCell = null;
  }
}

function setCrosshair(cell, pop) {
  clearCrosshair();
  if (!cell || !cell._grid) return;
  const rList = rowGroups.get(`${cell._grid}:r:${cell._row}`) || [];
  const cList = colGroups.get(`${cell._grid}:c:${cell._col}`) || [];
  for (let i = 0; i < rList.length; i++) {
    rList[i].classList.add("crosshair");
    activeCrossCells.push(rList[i]);
  }
  for (let i = 0; i < cList.length; i++) {
    if (cList[i] !== cell) {
      cList[i].classList.add("crosshair");
      activeCrossCells.push(cList[i]);
    }
  }
  if (pop) {
    cell.classList.add("scrub-pop");
    activePopCell = cell;
  }
}

function updateScrubBadge(el, x, y) {
  sbSym.textContent = el.sym;
  sbName.textContent = prefs.lang === "en" ? el.en : el.ru;
  sbSub.textContent = `+${el.num} · Ar ${el.mass}`;
  const clampedX = Math.max(88, Math.min(window.innerWidth - 88, x));
  const clampedY = Math.max(106, y - 48);
  scrubBadge.style.left = `${clampedX}px`;
  scrubBadge.style.top = `${clampedY}px`;
  scrubBadge.classList.add("visible");
}

function hideScrubBadge() {
  scrubBadge.classList.remove("visible");
}

/* ===== 3D ENGINE + FAST THROTTLED SWITCH ===== */
function update3DHud(el, mode) {
  if (!el) return;
  const isEn = prefs.lang === "en";
  if (mode === "atom") hud3dLabel.textContent = isEn ? `3D · ATOM +${el.num}` : `3D · АТОМ +${el.num}`;
  else if (mode === "lattice") hud3dLabel.textContent = `3D · ${isEn ? el.vis.latEn : el.vis.latRu}`;
  else hud3dLabel.textContent = `3D · ${isEn ? el.vis.specEn : el.vis.specRu}`;
  const sh = el.shells, head = sh.slice(0, -1).join("·"), val = sh[sh.length - 1];
  hudShells.innerHTML = head ? `e⁻: ${head}·<b>${val}</b>` : `e⁻: <b>${val}</b>`;
  hudCfg.textContent = el.ecfg;
}

const scene3d = createScene3D({
  stage: stage3d,
  canvas: $("canvas3d"),
  errEl: $("webglErr"),
  onHudUpdate: update3DHud
});

let last3DTime = 0;
let pending3DTimer = 0;
let pending3DEl = null;

function show3DFast(el, immediate) {
  if (pending3DTimer) {
    clearTimeout(pending3DTimer);
    pending3DTimer = 0;
  }
  const now = performance.now();
  if (immediate || now - last3DTime >= 45) {
    last3DTime = now;
    pending3DEl = null;
    scene3d.show(el, !immediate);
  } else {
    pending3DEl = el;
    pending3DTimer = setTimeout(() => {
      pending3DTimer = 0;
      if (!pending3DEl) return;
      last3DTime = performance.now();
      const target = pending3DEl;
      pending3DEl = null;
      scene3d.show(target, true);
    }, 45 - (now - last3DTime));
  }
}

/* ===== ELEMENT SELECTION ===== */
function fillFields(el) {
  const d = I18N[prefs.lang];
  fZ.textContent = `+${el.num}`;
  fSym.textContent = el.sym;
  fPrimary.textContent = prefs.lang === "en" ? el.en : el.ru;
  fSecondary.textContent = prefs.lang === "en" ? el.ru : el.en;
  const subLabel = prefs.lang === "en" ? el.sub : (el.sub === "A" ? "А" : "Б");
  fPos.textContent = `${el.period} ${d.perUnit} · ${el.groupRoman}${subLabel}`;
  fMass.textContent = `Ar ${el.mass}`;
  fCat.textContent = d.cats[el.catKey];
  fCat.classList.toggle("active", activeCategory === el.catKey);
  fDesc.textContent = el.desc[prefs.lang];
  fFeat.textContent = el.feat[prefs.lang];
}

function selectElement(num, shouldScroll = true, isScrub = false) {
  if (selectedNum === num) return;

  if (selectedNum !== null) {
    shortCellMap.get(selectedNum)?.classList.remove("active");
    longCellMap.get(selectedNum)?.classList.remove("active");
  }

  selectedNum = num;

  if (num === null) {
    if (isExpanded) setFullscreen(false);
    clearCrosshair();
    detailSection.classList.remove("open");
    detailSection.setAttribute("aria-hidden", "true");
    selectPrompt.classList.remove("hidden");
    scene3d.stop();
    return;
  }

  const el = ELEMENTS[num - 1];
  if (!el) return;

  shortCellMap.get(num)?.classList.add("active");
  longCellMap.get(num)?.classList.add("active");

  hapticTick();
  fillFields(el);
  selectPrompt.classList.add("hidden");
  detailSection.classList.add("open");
  detailSection.setAttribute("aria-hidden", "false");

  show3DFast(el, !isScrub);

  if (shouldScroll) {
    requestAnimationFrame(() => {
      detailSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
}

/* ===== HOLD (0.15s) + SCRUB TOUCH & MOUSE INTERACTION ===== */
const HOLD_MS = 150;
const MOVE_CANCEL_PX = 10;
let holdTimer = 0;
let isScrubbing = false;
let touchStartX = 0, touchStartY = 0;
let touchMoved = false;
let holdCell = null;
let lastTouchHandled = 0;

function cancelHold() {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = 0;
  }
}

function scrubAtPoint(x, y) {
  const elAt = document.elementFromPoint(x, y);
  const cell = elAt ? elAt.closest(".cell") : null;
  if (!cell) return;
  const num = Number(cell.dataset.num);
  if (!num) return;
  setCrosshair(cell, true);
  selectElement(num, false, true);
  updateScrubBadge(ELEMENTS[num - 1], x, y);
}

function startScrubMode(cell, x, y) {
  isScrubbing = true;
  tableSection.classList.add("scrubbing");
  const num = Number(cell.dataset.num);
  if (num) {
    setCrosshair(cell, true);
    selectElement(num, false, true);
    updateScrubBadge(ELEMENTS[num - 1], x, y);
  }
}

function endScrubMode() {
  cancelHold();
  if (!isScrubbing) return;
  isScrubbing = false;
  tableSection.classList.remove("scrubbing");
  clearCrosshair();
  hideScrubBadge();
  if (selectedNum !== null) {
    show3DFast(ELEMENTS[selectedNum - 1], true);
  }
}

tableSection.addEventListener("contextmenu", (e) => {
  if (e.target.closest(".cell")) e.preventDefault();
});

tableSection.addEventListener("touchstart", (e) => {
  if (e.touches.length !== 1) {
    endScrubMode();
    return;
  }
  const cell = e.target.closest(".cell");
  if (!cell) return;
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
  touchMoved = false;
  holdCell = cell;
  cancelHold();
  holdTimer = setTimeout(() => {
    holdTimer = 0;
    if (!touchMoved && holdCell) {
      startScrubMode(holdCell, touchStartX, touchStartY);
    }
  }, HOLD_MS);
}, { passive: true });

tableSection.addEventListener("touchmove", (e) => {
  if (e.touches.length !== 1) return;
  const t = e.touches[0];
  if (isScrubbing) {
    e.preventDefault();
    scrubAtPoint(t.clientX, t.clientY);
    return;
  }
  if (holdTimer) {
    const dist = Math.hypot(t.clientX - touchStartX, t.clientY - touchStartY);
    if (dist > MOVE_CANCEL_PX) {
      touchMoved = true;
      cancelHold();
    }
  }
}, { passive: false });

tableSection.addEventListener("touchend", () => {
  lastTouchHandled = performance.now();
  if (isScrubbing) {
    endScrubMode();
    holdCell = null;
    return;
  }
  cancelHold();
  if (!touchMoved && holdCell) {
    const num = Number(holdCell.dataset.num);
    if (num) selectElement(num, true, false);
  }
  holdCell = null;
}, { passive: true });

tableSection.addEventListener("touchcancel", () => {
  endScrubMode();
  holdCell = null;
});

/* Desktop mouse support (click + hover crosshair + hold-drag) */
let mouseDownCell = null;
tableSection.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "touch" || e.button !== 0) return;
  const cell = e.target.closest(".cell");
  if (!cell) return;
  mouseDownCell = cell;
  const sx = e.clientX, sy = e.clientY;
  cancelHold();
  holdTimer = setTimeout(() => {
    holdTimer = 0;
    if (mouseDownCell) startScrubMode(mouseDownCell, sx, sy);
  }, HOLD_MS);
});

window.addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch") return;
  if (isScrubbing) {
    scrubAtPoint(e.clientX, e.clientY);
  }
});

window.addEventListener("pointerup", (e) => {
  if (e.pointerType === "touch") return;
  if (isScrubbing) {
    endScrubMode();
    mouseDownCell = null;
    return;
  }
  cancelHold();
  mouseDownCell = null;
});

tableSection.addEventListener("pointerover", (e) => {
  if (e.pointerType === "touch" || isScrubbing) return;
  const cell = e.target.closest(".cell");
  if (cell) setCrosshair(cell, false);
});

tableSection.addEventListener("pointerleave", (e) => {
  if (e.pointerType === "touch" || isScrubbing) return;
  clearCrosshair();
});

tableSection.addEventListener("click", (e) => {
  if (performance.now() - lastTouchHandled < 450) return;
  const cell = e.target.closest(".cell");
  if (!cell) return;
  const num = Number(cell.dataset.num);
  if (num) selectElement(num, true, false);
});

/* ===== FILTER & SEARCH ===== */
function openSearch(open) {
  topbar.classList.toggle("search-open", open);
  if (open) {
    searchInput.focus();
  } else {
    searchInput.blur();
  }
}

function applyFilter() {
  const q = searchInput.value.trim().toLowerCase().replace(/^\+/, "");
  const matches = [];
  for (const el of ELEMENTS) {
    const mSearch = !q ||
      String(el.num) === q ||
      el.sym.toLowerCase().includes(q) ||
      el.ru.toLowerCase().includes(q) ||
      el.en.toLowerCase().includes(q);
    const mCat = !activeCategory || el.catKey === activeCategory;
    const dim = !(mSearch && mCat);
    const cm = Boolean(activeCategory && el.catKey === activeCategory);
    for (const map of [shortCellMap, longCellMap]) {
      const c = map.get(el.num);
      c.classList.toggle("dimmed", dim);
      c.classList.toggle("cat-match", cm);
    }
    if (mSearch && mCat) matches.push(el);
  }
  if (q) {
    if (window.scrollY < window.innerHeight * 0.45) {
      $("tableAnchor").scrollIntoView({ behavior: "smooth" });
    }
    const exact = matches.find(e => String(e.num) === q || e.sym.toLowerCase() === q || e.ru.toLowerCase() === q || e.en.toLowerCase() === q);
    if (exact) selectElement(exact.num, false, false);
    else if (matches.length === 1) selectElement(matches[0].num, false, false);
  }
}

searchToggle.addEventListener("click", () => {
  openSearch(true);
  hapticTick();
});

searchInput.addEventListener("input", applyFilter);

clearSearch.addEventListener("click", () => {
  if (searchInput.value.length > 0) {
    searchInput.value = "";
    activeCategory = null;
    applyFilter();
    searchInput.focus();
  } else {
    openSearch(false);
  }
});

/* ===== FULLSCREEN 3D ===== */
let isExpanded = false;
function setFullscreen(expand) {
  if (isExpanded === expand) return;
  isExpanded = expand;
  if (expand) {
    fsPortal.classList.add("open");
    fsPortal.appendChild(stage3d);
    btnExpand.textContent = "✕";
    btnExpand.classList.add("active");
  } else {
    stage3dSlot.appendChild(stage3d);
    fsPortal.classList.remove("open");
    btnExpand.textContent = "⤢";
    btnExpand.classList.remove("active");
  }
  scene3d.resize();
}

/* ===== APPLY PREFERENCES ===== */
function applyPreferences() {
  const d = I18N[prefs.lang];
  const u = UI_TEXT[prefs.lang];
  document.documentElement.lang = prefs.lang;
  document.documentElement.dataset.theme = prefs.theme;
  document.documentElement.dataset.layout = prefs.layout;
  document.title = u.title;
  metaTheme.content = prefs.theme === "light" ? "#FCFAFF" : "#000000";

  try { window.AndroidHaptics?.setTheme?.(prefs.theme); } catch (_) {}

  $("heroKicker").textContent = d.heroKicker;
  $("heroTitle").textContent = u.heroTitle;
  $("brandTitle").textContent = u.brand;
  searchInput.placeholder = d.searchPh;
  $("oxideCaption").textContent = d.oxideCaption;
  selectPrompt.textContent = u.selectPrompt;
  $("modeAtom").textContent = d.modeAtom;
  $("modeLattice").textContent = d.modeLattice;
  $("modeSpecimen").textContent = d.modeSpecimen;
  $("lblDesc").textContent = d.lblDesc;
  $("lblFeat").textContent = d.lblFeat;
  $("webglErr").textContent = d.webglErr;

  $("setTitle").textContent = d.setTitle;
  $("setLangLbl").textContent = d.setLangLbl;
  $("setThemeLbl").textContent = d.setThemeLbl;
  $("setLayoutLbl").textContent = d.setLayoutLbl;
  $("btnLayoutShort").textContent = d.layoutShortBtn;
  $("btnLayoutLong").textContent = d.layoutLongBtn;
  $("setLangVal").textContent = d.langName[prefs.lang];
  $("setThemeVal").textContent = u.themeName[prefs.theme];
  $("setLayoutVal").textContent = d.layoutName[prefs.layout];

  document.querySelectorAll("[data-lang]").forEach(b => b.classList.toggle("active", b.dataset.lang === prefs.lang));
  document.querySelectorAll("[data-theme-pick]").forEach(b => b.classList.toggle("active", b.dataset.themePick === prefs.theme));
  document.querySelectorAll("[data-layout-pick]").forEach(b => b.classList.toggle("active", b.dataset.layoutPick === prefs.layout));

  for (const el of ELEMENTS) {
    const label = prefs.lang === "en" ? el.en : el.ru;
    shortCellMap.get(el.num).querySelector(".cell-name").textContent = label;
    longCellMap.get(el.num).querySelector(".cell-name").textContent = label;
  }

  scene3d.setTheme(prefs.theme);
  if (selectedNum !== null) {
    const el = ELEMENTS[selectedNum - 1];
    fillFields(el);
    update3DHud(el, scene3d.getMode());
  }
  savePrefs();
}

/* ===== EVENTS ===== */
for (const btn of modeBtns) {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    for (const b of modeBtns) b.classList.toggle("active", b === btn);
    scene3d.setMode(btn.dataset.mode);
    hapticTick();
  });
}

btnExpand.addEventListener("click", (e) => { e.stopPropagation(); setFullscreen(!isExpanded); });
btnClose.addEventListener("click", () => { activeCategory = null; selectElement(null, false, false); applyFilter(); });
btnPrev.addEventListener("click", () => { if (selectedNum !== null) selectElement(selectedNum > 1 ? selectedNum - 1 : 118, false, false); });
btnNext.addEventListener("click", () => { if (selectedNum !== null) selectElement(selectedNum < 118 ? selectedNum + 1 : 1, false, false); });

fCat.addEventListener("click", () => {
  if (selectedNum === null) return;
  const key = ELEMENTS[selectedNum - 1].catKey;
  activeCategory = activeCategory === key ? null : key;
  applyFilter();
  fCat.classList.toggle("active", activeCategory === key);
});

function openSettings(open) {
  settingsModal.classList.toggle("open", open);
  settingsModal.setAttribute("aria-hidden", open ? "false" : "true");
  settingsBtn.classList.toggle("active", open);
}
settingsBtn.addEventListener("click", () => { openSettings(!settingsModal.classList.contains("open")); hapticTick(); });
settingsClose.addEventListener("click", () => openSettings(false));
settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) openSettings(false); });

document.querySelectorAll("[data-lang]").forEach(b => b.addEventListener("click", () => {
  if (prefs.lang === b.dataset.lang) return;
  prefs.lang = b.dataset.lang; applyPreferences(); hapticTick();
}));
document.querySelectorAll("[data-theme-pick]").forEach(b => b.addEventListener("click", () => {
  if (prefs.theme === b.dataset.themePick) return;
  prefs.theme = b.dataset.themePick; applyPreferences(); hapticTick();
}));
document.querySelectorAll("[data-layout-pick]").forEach(b => b.addEventListener("click", () => {
  if (prefs.layout === b.dataset.layoutPick) return;
  prefs.layout = b.dataset.layoutPick; applyPreferences(); hapticTick();
}));

window.addEventListener("keydown", (e) => {
  if (document.activeElement === searchInput) {
    if (e.key === "Escape") openSearch(false);
    return;
  }
  if (e.key === "Escape") {
    if (settingsModal.classList.contains("open")) { openSettings(false); return; }
    if (isExpanded) { setFullscreen(false); return; }
    if (topbar.classList.contains("search-open")) { openSearch(false); return; }
    activeCategory = null; selectElement(null, false, false); applyFilter();
  } else if (e.key === "ArrowRight") {
    selectElement(selectedNum === null ? 1 : (selectedNum < 118 ? selectedNum + 1 : 1), false, false);
  } else if (e.key === "ArrowLeft") {
    selectElement(selectedNum === null ? 118 : (selectedNum > 1 ? selectedNum - 1 : 118), false, false);
  }
});

applyPreferences();
