import {BUILDS, encryptSagittarius, decryptSagittarius, previewWrongPassword, detectBuild} from "./sagittarius.js";

const $ = (id) => document.getElementById(id);
const els = {
  modelGrid: $("model-grid"), versionGrid: $("version-grid"), modelDetail: $("model-detail"),
  modelNote: $("model-note"), selectedBuild: $("selected-build"), selectorCard: $("selector-card"),
  modeEncrypt: $("mode-encrypt"), modeDecrypt: $("mode-decrypt"),
  input: $("input"), output: $("output"), password: $("password"), wrongMode: $("wrong-mode"),
  wrongWrap: $("wrong-wrap"), run: $("run"), copy: $("copy"), clear: $("clear"),
  previewWrong: $("preview-wrong"), status: $("status"), metrics: $("metrics"),
  inputLabel: $("input-label"), outputLabel: $("output-label"),
  passwordToggle: $("password-toggle"), upload: $("upload"), fileInput: $("file-input"),
  download: $("download"), fileName: $("file-name")
};

const PREVIEW_LIMIT = 240_000;
const FILE_LIMIT = 64 * 1024 * 1024;

const FAMILY_META = {
  Tesseract: {order: 0, tag: "Maze transport", description: "Key-derived maze transport with deliberately hostile visible output."},
  Parallel: {order: 1, tag: "Oversized", description: "Rare supplementary-plane Unicode expanded into a deliberately oversized transport."},
  Sapphire: {order: 2, tag: "Balanced", description: "Mixed-symbol Sagittarius output with a balanced size and junk profile."},
  Violet: {order: 3, tag: "Lean", description: "A compact operator-heavy path built around mathematical glyphs and symbols."},
  Transcendent: {order: 4, tag: "Unavailable", description: "Transcendent 7 is reserved in the Sagittarius family but is not available in this release."}
};

function buildCatalog() {
  const families = new Map();
  for (const build of Object.values(BUILDS)) {
    if (!families.has(build.family)) families.set(build.family, []);
    families.get(build.family).push({
      key: build.key,
      version: build.version,
      available: true,
      build
    });
  }

  if (!families.has("Transcendent")) {
    families.set("Transcendent", [{
      key: "Transcendent 7",
      version: 7,
      available: false,
      build: null
    }]);
  }

  return [...families.entries()]
    .map(([family, versions]) => ({
      family,
      meta: FAMILY_META[family] || {order: 99, tag: "Model", description: "Sagittarius encryption model."},
      versions: versions.sort((a, b) => b.version - a.version)
    }))
    .sort((a, b) => a.meta.order - b.meta.order);
}

const CATALOG = buildCatalog();

let mode = "encrypt";
let buildKey = BUILDS["Tesseract 7"] ? "Tesseract 7" : Object.keys(BUILDS)[0];
let selectedFamily = BUILDS[buildKey]?.family || CATALOG[0]?.family || "";
let lastEncrypted = "";
let lastFullOutput = "";
let lastOutputBuild = "";
let loadedFileName = "";

function currentGroup() {
  return CATALOG.find(group => group.family === selectedFamily) || CATALOG[0];
}

function currentBuild() {
  return buildKey ? BUILDS[buildKey] || null : null;
}

function selectFamily(family) {
  selectedFamily = family;
  const group = currentGroup();
  const available = group.versions.filter(item => item.available);
  buildKey = available[0]?.key || "";
  renderSelection();

  if (!available.length) {
    setStatus(`${family} 7 is listed, but it is not available yet.`, "warn");
  } else if (mode === "encrypt") {
    setStatus(`${buildKey} selected.`, "neutral");
  }
}

function selectVersion(key) {
  const build = BUILDS[key];
  if (!build) return;
  selectedFamily = build.family;
  buildKey = key;
  renderSelection();
  if (mode === "encrypt") setStatus(`${buildKey} selected.`, "neutral");
}

function renderSelection() {
  renderModels();
  renderVersions();
  renderModelDetail();

  if (mode === "encrypt") {
    els.selectedBuild.textContent = buildKey || "Unavailable";
    els.modelNote.textContent = currentGroup().versions.length > 1
      ? `Choose a ${selectedFamily} generation.`
      : `${selectedFamily} currently has one listed generation.`;
  } else {
    els.selectedBuild.textContent = "Auto detect";
    els.modelNote.textContent = "Payload model and version are detected automatically while decrypting.";
  }

  syncRunAvailability();
  installRipples();
}

function renderModels() {
  els.modelGrid.innerHTML = "";
  for (const group of CATALOG) {
    const availableCount = group.versions.filter(item => item.available).length;
    const unavailable = availableCount === 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `model-card ripple ${group.family === selectedFamily ? "selected" : ""} ${unavailable ? "unavailable" : ""}`;
    button.setAttribute("aria-pressed", String(group.family === selectedFamily));
    button.innerHTML = `
      <span class="model-name">${group.family}</span>
      <span class="model-tag">${group.meta.tag}</span>
      <span class="model-count">${group.versions.length === 1 ? `v${group.versions[0].version}` : `${group.versions.length} versions`}</span>
      ${unavailable ? '<span class="availability">Unavailable</span>' : ""}
    `;
    button.addEventListener("click", () => selectFamily(group.family));
    els.modelGrid.appendChild(button);
  }
}

function renderVersions() {
  els.versionGrid.innerHTML = "";
  const group = currentGroup();

  for (const item of group.versions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `version-pill ripple ${item.key === buildKey ? "active" : ""}`;
    button.textContent = `Version ${item.version}`;
    button.disabled = !item.available;
    if (item.available) button.addEventListener("click", () => selectVersion(item.key));
    els.versionGrid.appendChild(button);
  }
}

function renderModelDetail() {
  const group = currentGroup();
  const build = currentBuild();

  if (!build) {
    els.modelDetail.innerHTML = `
      <div class="model-detail-copy">
        <strong>Transcendent 7</strong>
        <p>${group.meta.description}</p>
      </div>
      <div class="detail-tags">
        <span>UNAVAILABLE</span>
      </div>
    `;
    return;
  }

  const cipher = build.cipher || "AES-256-GCM";
  const compression = build.compression === "adaptive-deflate" ? "ADAPTIVE DEFLATE" : build.compression.toUpperCase();
  els.modelDetail.innerHTML = `
    <div class="model-detail-copy">
      <strong>${build.key}</strong>
      <p>${build.summary}</p>
    </div>
    <div class="detail-tags">
      <span>${cipher}</span>
      <span>${compression}</span>
      <span>V${build.version}</span>
    </div>
  `;
}

function safeName(value) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "output";
}

function humanBytes(n) {
  if (!Number.isFinite(n)) return String(n);
  if (n < 1024) return `${n.toLocaleString()} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MiB`;
  return `${(n / 1024 ** 3).toFixed(2)} GiB`;
}

function setMode(next) {
  mode = next;
  const encrypting = mode === "encrypt";

  els.modeEncrypt.classList.toggle("active", encrypting);
  els.modeDecrypt.classList.toggle("active", !encrypting);
  els.wrongWrap.hidden = encrypting;
  els.previewWrong.hidden = !encrypting || !lastEncrypted;
  els.inputLabel.textContent = encrypting ? "Plaintext" : "Sagittarius payload";
  els.outputLabel.textContent = encrypting ? "Encrypted payload" : "Recovered output";
  els.run.textContent = encrypting ? "Encrypt" : "Decrypt";
  els.input.placeholder = encrypting
    ? "Write or paste anything here…"
    : "Paste any supported Sagittarius payload here…";
  els.output.placeholder = encrypting
    ? "Your encrypted result appears here."
    : "Recovered plaintext appears here.";

  setStatus(
    encrypting
      ? "Ready. Choose a model and encrypt."
      : "Ready. Model and version will be detected from the payload.",
    "neutral"
  );

  renderSelection();
  if (!encrypting) detectInputBuild();
}

function syncRunAvailability() {
  const unavailableEncryption = mode === "encrypt" && !buildKey;
  els.run.disabled = unavailableEncryption;
}

function setStatus(text, kind = "neutral") {
  els.status.textContent = text;
  els.status.dataset.kind = kind;
}

function renderMetrics(stats, extra = {}) {
  const merged = {...(stats || {}), ...extra};
  const entries = Object.entries(merged);
  els.metrics.innerHTML = entries.map(([key, value]) => `<span><b>${humanKey(key)}</b>${formatValue(key, value)}</span>`).join("");
}

function humanKey(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
}

function formatValue(key, value) {
  if (typeof value === "number" && /Bytes$/.test(key)) return humanBytes(value);
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function presentOutput(value, {build = "", stats = null} = {}) {
  lastFullOutput = value || "";
  lastOutputBuild = build;
  els.download.disabled = !lastFullOutput;
  els.copy.disabled = !lastFullOutput;

  if (!lastFullOutput) {
    els.output.value = "";
    renderMetrics(stats);
    return;
  }

  if (lastFullOutput.length > PREVIEW_LIMIT) {
    els.output.value = lastFullOutput.slice(0, PREVIEW_LIMIT) +
      `\n\n[Preview truncated. Full output is ${humanBytes(new TextEncoder().encode(lastFullOutput).length)}. Copy or Download uses the complete payload.]`;
    renderMetrics(stats, {preview: `${PREVIEW_LIMIT.toLocaleString()} chars`});
  } else {
    els.output.value = lastFullOutput;
    renderMetrics(stats);
  }
}

async function run() {
  const input = els.input.value;
  const password = els.password.value;

  if (!input) return setStatus("Input is empty.", "error");
  if (!password) return setStatus("Enter a password.", "error");
  if (mode === "encrypt" && !buildKey) return setStatus("That model is not available yet.", "warn");

  els.run.disabled = true;
  els.output.value = "";
  lastFullOutput = "";
  els.download.disabled = true;
  renderMetrics(null);

  setStatus(mode === "encrypt" ? `Encrypting with ${buildKey}…` : "Authenticating and decrypting…", "busy");

  try {
    if (mode === "encrypt") {
      const result = await encryptSagittarius(input, password, buildKey);
      presentOutput(result.payload, {build: result.build.key, stats: result.stats});
      lastEncrypted = result.payload;
      els.previewWrong.hidden = false;
      els.selectedBuild.textContent = result.build.key;
      setStatus(`${result.build.key} complete. Plaintext and password stayed in this browser.`, "ok");
    } else {
      const result = await decryptSagittarius(input, password, {wrongKeyMode: els.wrongMode.value});
      presentOutput(result.output ?? "", {build: result.build.key, stats: result.stats});
      els.selectedBuild.textContent = result.build.key;
      if (result.ok) setStatus(`${result.build.key} authenticated and recovered.`, "ok");
      else setStatus(`${result.build.key}: wrong-key path shown; plaintext was not recovered.`, "warn");
    }
  } catch (err) {
    presentOutput("");
    setStatus(err?.message || String(err), "error");
  } finally {
    syncRunAvailability();
  }
}

async function wrongPreview() {
  if (!lastEncrypted || !els.password.value) return;
  els.previewWrong.disabled = true;

  try {
    const result = await previewWrongPassword(lastEncrypted, els.password.value, "taunt");
    presentOutput(result.output || "", {build: result.build.key});
    setStatus("Wrong-password preview generated without recovering plaintext.", "warn");
  } catch (err) {
    setStatus(err?.message || String(err), "error");
  } finally {
    els.previewWrong.disabled = false;
  }
}

async function loadFile(file) {
  if (!file) return;
  if (file.size > FILE_LIMIT) return setStatus(`File is too large for this browser workspace (${humanBytes(file.size)}).`, "error");

  try {
    setStatus(`Reading ${file.name} locally…`, "busy");
    const text = await file.text();
    els.input.value = text;
    loadedFileName = file.name;
    els.fileName.textContent = `${file.name} · ${humanBytes(file.size)}`;
    if (mode === "decrypt") detectInputBuild();
    setStatus(`${file.name} loaded locally.`, "ok");
  } catch (err) {
    setStatus(`Could not read file: ${err?.message || err}`, "error");
  }
}

function detectInputBuild() {
  if (mode !== "decrypt") return;

  if (!els.input.value.trim()) {
    els.selectedBuild.textContent = "Auto detect";
    return;
  }

  try {
    const detected = detectBuild(els.input.value);
    els.selectedBuild.textContent = detected.build.key;
  } catch (_) {
    els.selectedBuild.textContent = "Auto detect";
  }
}

function downloadOutput() {
  if (!lastFullOutput) return setStatus("Nothing to download.", "error");

  const blob = new Blob([lastFullOutput], {type: "text/plain;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const buildSlug = safeName(lastOutputBuild || buildKey);
  const original = loadedFileName ? safeName(loadedFileName) : "payload";

  anchor.href = url;
  anchor.download = mode === "encrypt"
    ? `${original}.${buildSlug}.sagittarius.txt`
    : `${original}.recovered.txt`;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  setStatus(`Downloaded ${anchor.download}.`, "ok");
}

function installRipples(root = document) {
  root.querySelectorAll(".ripple:not([data-ripple-ready])").forEach(element => {
    element.dataset.rippleReady = "true";
    element.addEventListener("pointerdown", event => {
      if (element.disabled) return;
      const rect = element.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2.2;
      const ink = document.createElement("span");
      ink.className = "ripple-ink";
      ink.style.width = ink.style.height = `${size}px`;
      ink.style.left = `${event.clientX - rect.left}px`;
      ink.style.top = `${event.clientY - rect.top}px`;
      element.appendChild(ink);
      ink.addEventListener("animationend", () => ink.remove(), {once: true});
    });
  });
}

let pointerFrame = 0;
window.addEventListener("pointermove", event => {
  if (pointerFrame) return;
  pointerFrame = requestAnimationFrame(() => {
    const x = Math.round((event.clientX / window.innerWidth) * 100);
    const y = Math.round((event.clientY / window.innerHeight) * 100);
    document.documentElement.style.setProperty("--pointer-x", `${x}%`);
    document.documentElement.style.setProperty("--pointer-y", `${y}%`);
    pointerFrame = 0;
  });
}, {passive: true});

els.modeEncrypt.addEventListener("click", () => setMode("encrypt"));
els.modeDecrypt.addEventListener("click", () => setMode("decrypt"));
els.run.addEventListener("click", run);
els.previewWrong.addEventListener("click", wrongPreview);

els.clear.addEventListener("click", () => {
  els.input.value = "";
  els.output.value = "";
  lastEncrypted = "";
  lastFullOutput = "";
  loadedFileName = "";
  els.fileName.textContent = "No file loaded";
  els.previewWrong.hidden = true;
  els.download.disabled = true;
  els.copy.disabled = true;
  renderMetrics(null);
  if (mode === "decrypt") els.selectedBuild.textContent = "Auto detect";
  setStatus("Cleared.", "neutral");
});

els.copy.addEventListener("click", async () => {
  if (!lastFullOutput) return setStatus("Nothing to copy.", "error");

  try {
    await navigator.clipboard.writeText(lastFullOutput);
    setStatus(`Copied ${humanBytes(new TextEncoder().encode(lastFullOutput).length)}.`, "ok");
  } catch (_) {
    setStatus("Clipboard write failed. Use Download instead.", "error");
  }
});

els.download.addEventListener("click", downloadOutput);
els.upload.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", () => loadFile(els.fileInput.files?.[0]));

els.passwordToggle.addEventListener("click", () => {
  const hidden = els.password.type === "password";
  els.password.type = hidden ? "text" : "password";
  els.passwordToggle.textContent = hidden ? "Hide" : "Show";
});

els.input.addEventListener("input", detectInputBuild);

renderSelection();
setMode("encrypt");
installRipples();
