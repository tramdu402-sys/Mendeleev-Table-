import { I18N, ELEMENTS } from "./data.js";
import { createScene3D } from "./scene3d.js";

const $ = (id) => document.getElementById(id);
const hapticTick = () => { try { window.AndroidHaptics?.tick(); } catch (_) {} };

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
const shortGrid = $("shortGrid"), oxideRow = $("oxideRow");
const shortLaRow = $("shortLaRow"), shortAcRow = $("shortAcRow"), ptableLong = $("ptableLong");
const tableSection = $("tableSection"), selectPrompt = $("selectPrompt"), detailSection = $("detailSection");
const searchInput = $("searchInput"), clearSearch = $("clearSearch");
const settingsBtn = $("settingsBtn"), settingsModal = $("settingsModal"), settingsClose = $("settingsClose");
const fZ = $("fZ"), fSym = $("fSym"), fPrimary = $("fPrimary"), fSecondary = $("fSecondary");
const fPos = $("fPos"), fMass = $("fMass"), fCat = $("fCat"), fDesc = $("fDesc"), fFeat = $("fFeat");
const btnPrev = $("btnPrev"), btnNext = $("btnNext"), btnClose = $("btnClose");
const stage3dSlot = $("stage3dSlot"), fsPortal = $("fsPortal"), stage3d = $("stage3d");
const hud3dLabel = $("hud3dLabel"), hudShells = $("hudShells"), hudCfg = $("hudCfg");
const btnExpand = $("btnExpand");
const modeBtns = document.querySelectorAll(".mode-btn[data-mode]");

let selectedNum = null;
let activeCategory = null;
const shortCellMap = new Map();
const longCellMap = new Map();

/* ===== BUILD TABLES ===== */
function makeCell(el, mode) {
  const cell = document.createElement("div");
  cell.className = "cell" + (mode === "short" && el.sub === "B" && el.srow <= 11 ? " sub-b" : "");
  cell.dataset.num = el.num;
  cell.innerHTML =
    `<span class="cell-z">+${el.num}</span>` +
    `<span class="cell-sym">${el.sym}</span>` +
    `<span class="cell-name">${el.ru}</span>`;
  return cell;
}

function buildShortTable() {
  const sf = document.createDocumentFragment();
  const romans = ["I","II","III","IV","V","VI","VII"];
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
    const cell = makeCell(el, "short");
    shortCellMap.set(el.num, cell);
    if (el.srow <= 11) {
      cell.style.gridRow = String(el.srow + 1);
      cell.style.gridColumn = String(el.scol);
      sf.appendChild(cell);
    } else if (el.srow === 12) {
      laFrag.appendChild(cell);
    } else {
      acFrag.appendChild(cell);
    }
  }
  shortGrid.appendChild(sf);
  shortLaRow.appendChild(laFrag);
  shortAcRow.appendChild(acFrag);

  // Higher Oxides row matching the exact 10-col short grid
  const oxides = ["R<sub>2</sub>O","RO","R<sub>2</sub>O<sub>3</sub>","RO<sub>2</sub>","R<sub>2</sub>O<sub>5</sub>","RO<sub>3</sub>","R<sub>2</sub>O<sub>7</sub>","RO<sub>4</sub>"];
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
  const gap = document.createElement("div");
  gap.className = "long-gap";
  gap.style.gridRow = "9";
  lf.appendChild(gap);

  for (const el of ELEMENTS) {
    const cell = makeCell(el, "long");
    cell.style.gridRow = String(el.lrow <= 7 ? el.lrow + 1 : el.lrow + 1);
    cell.style.gridColumn = String(el.lcol);
    longCellMap.set(el.num, cell);
    lf.appendChild(cell);
  }
  ptableLong.appendChild(lf);
}

buildShortTable();
buildLongTable();

/* ===== 3D ENGINE ===== */
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

function selectElement(num, shouldScroll = true) {
  if (selectedNum === num) return;

  if (selectedNum !== null) {
    shortCellMap.get(selectedNum)?.classList.remove("active");
    longCellMap.get(selectedNum)?.classList.remove("active");
  }

  selectedNum = num;

  if (num === null) {
    if (isExpanded) setFullscreen(false);
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

  scene3d.show(el);

  if (shouldScroll) {
    requestAnimationFrame(() => {
      detailSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
}

/* ===== FILTER & SEARCH ===== */
function applyFilter() {
  const q = searchInput.value.trim().toLowerCase().replace(/^\+/, "");
  clearSearch.classList.toggle("visible", q.length > 0);
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
    const exact = matches.find(e => String(e.num) === q || e.sym.toLowerCase() === q || e.ru.toLowerCase() === q || e.en.toLowerCase() === q);
    if (exact) selectElement(exact.num, false);
    else if (matches.length === 1) selectElement(matches[0].num, false);
  }
}

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
  document.documentElement.lang = prefs.lang;
  document.documentElement.dataset.theme = prefs.theme;
  document.documentElement.dataset.layout = prefs.layout;
  document.title = d.title;
  metaTheme.content = prefs.theme === "light" ? "#FCFAFF" : "#000000";

  try { window.AndroidHaptics?.setTheme?.(prefs.theme); } catch (_) {}

  $("heroKicker").textContent = d.heroKicker;
  $("heroTitle").textContent = d.heroTitle;
  $("heroScrollTxt").textContent = d.heroScroll;
  $("brandTitle").textContent = d.brand;
  searchInput.placeholder = d.searchPh;
  $("oxideCaption").textContent = d.oxideCaption;
  selectPrompt.textContent = d.selectPrompt;
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
  $("setThemeVal").textContent = d.themeName[prefs.theme];
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
$("heroScrollBtn").addEventListener("click", () => {
  $("topbar").scrollIntoView({ behavior: "smooth" });
});

tableSection.addEventListener("click", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell) return;
  const num = Number(cell.dataset.num);
  if (num) selectElement(num, true);
});

for (const btn of modeBtns) {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    for (const b of modeBtns) b.classList.toggle("active", b === btn);
    scene3d.setMode(btn.dataset.mode);
    hapticTick();
  });
}

btnExpand.addEventListener("click", (e) => { e.stopPropagation(); setFullscreen(!isExpanded); });
btnClose.addEventListener("click", () => { activeCategory = null; selectElement(null, false); applyFilter(); });
btnPrev.addEventListener("click", () => { if (selectedNum !== null) selectElement(selectedNum > 1 ? selectedNum - 1 : 118, false); });
btnNext.addEventListener("click", () => { if (selectedNum !== null) selectElement(selectedNum < 118 ? selectedNum + 1 : 1, false); });

fCat.addEventListener("click", () => {
  if (selectedNum === null) return;
  const key = ELEMENTS[selectedNum - 1].catKey;
  activeCategory = activeCategory === key ? null : key;
  applyFilter();
  fCat.classList.toggle("active", activeCategory === key);
});

searchInput.addEventListener("input", applyFilter);
clearSearch.addEventListener("click", () => { searchInput.value = ""; activeCategory = null; applyFilter(); searchInput.focus(); });

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
    if (e.key === "Escape") searchInput.blur();
    return;
  }
  if (e.key === "Escape") {
    if (settingsModal.classList.contains("open")) { openSettings(false); return; }
    if (isExpanded) { setFullscreen(false); return; }
    activeCategory = null; selectElement(null, false); applyFilter();
  } else if (e.key === "ArrowRight") {
    selectElement(selectedNum === null ? 1 : (selectedNum < 118 ? selectedNum + 1 : 1), false);
  } else if (e.key === "ArrowLeft") {
    selectElement(selectedNum === null ? 118 : (selectedNum > 1 ? selectedNum - 1 : 118), false);
  }
});

applyPreferences();
