import {BUILDS, encryptSagittarius, decryptSagittarius, previewWrongPassword, detectBuild} from "./sagittarius.js";

const $ = (id) => document.getElementById(id);
const els = {
  buildGrid: $("build-grid"), modeEncrypt: $("mode-encrypt"), modeDecrypt: $("mode-decrypt"),
  input: $("input"), output: $("output"), password: $("password"), wrongMode: $("wrong-mode"),
  wrongWrap: $("wrong-wrap"), run: $("run"), copy: $("copy"), clear: $("clear"),
  previewWrong: $("preview-wrong"), status: $("status"), metrics: $("metrics"),
  modeLabel: $("mode-label"), inputLabel: $("input-label"), outputLabel: $("output-label"),
  passwordToggle: $("password-toggle"), detectBadge: $("detected-build"),
  upload: $("upload"), fileInput: $("file-input"), download: $("download"), fileName: $("file-name")
};

const PREVIEW_LIMIT = 240_000;
const FILE_LIMIT = 64 * 1024 * 1024;
let mode = "encrypt";
let buildKey = "Sapphire 3";
let lastEncrypted = "";
let lastFullOutput = "";
let lastOutputBuild = "";
let loadedFileName = "";

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

function renderBuilds() {
  els.buildGrid.innerHTML = "";
  for (const build of Object.values(BUILDS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `build-card build-${build.family.toLowerCase()} ${build.key === buildKey ? "selected" : ""}`;
    button.dataset.build = build.key;
    button.innerHTML = `
      <span class="build-kicker">${build.family.toUpperCase()}</span>
      <span class="build-name">${build.key}</span>
      <span class="build-summary">${build.summary}</span>
      <span class="build-meta">junk ×${build.junkRatio.toFixed(2)} · ${build.compression} · ${Array.from(build.tokens[0]).length}cp/token</span>
    `;
    button.addEventListener("click", () => {
      buildKey = build.key;
      renderBuilds();
      if (mode === "encrypt") els.detectBadge.textContent = build.key;
      setStatus(`${build.key} selected.`, "neutral");
    });
    els.buildGrid.appendChild(button);
  }
}

function setMode(next) {
  mode = next;
  const enc = mode === "encrypt";
  els.modeEncrypt.classList.toggle("active", enc);
  els.modeDecrypt.classList.toggle("active", !enc);
  els.wrongWrap.hidden = enc;
  els.previewWrong.hidden = !enc || !lastEncrypted;
  els.modeLabel.textContent = enc ? "Encryption workspace" : "Decryption workspace";
  els.inputLabel.textContent = enc ? "Plaintext / source" : "Sagittarius payload";
  els.outputLabel.textContent = enc ? "Encrypted payload" : "Recovered output";
  els.run.textContent = enc ? "Encrypt" : "Decrypt";
  els.input.placeholder = enc ? "Paste text, code, JSON, notes… or upload a text/code file." : "Paste or upload a Sagittarius Violet 1, Sapphire 3, Parallel 5, or Tesseract 6 payload…";
  els.output.placeholder = enc ? "Encrypted Sagittarius output appears here." : "Plaintext or wrong-key behavior appears here.";
  els.detectBadge.textContent = enc ? buildKey : "Auto-detect";
  setStatus("Ready. Processing stays in this browser.", "neutral");
  renderBuilds();
}

function setStatus(text, kind = "neutral") {
  els.status.textContent = text;
  els.status.dataset.kind = kind;
}

function renderMetrics(stats, extra = {}) {
  const merged = {...(stats || {}), ...extra};
  const entries = Object.entries(merged);
  els.metrics.innerHTML = entries.map(([k,v]) => `<span><b>${humanKey(k)}</b>${formatValue(k,v)}</span>`).join("");
}

function humanKey(k) {
  return k.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
}

function formatValue(k,v) {
  if (typeof v === "number" && /Bytes$/.test(k)) return humanBytes(v);
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
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
    els.output.value = lastFullOutput.slice(0, PREVIEW_LIMIT) + `\n\n[Preview truncated. Full output is ${humanBytes(new TextEncoder().encode(lastFullOutput).length)}. Copy or Download uses the complete payload.]`;
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
  els.run.disabled = true;
  els.output.value = "";
  lastFullOutput = "";
  els.download.disabled = true;
  renderMetrics(null);
  setStatus(mode === "encrypt" ? `Encrypting locally with ${buildKey}…` : "Decrypting locally…", "busy");
  try {
    if (mode === "encrypt") {
      const result = await encryptSagittarius(input, password, buildKey);
      presentOutput(result.payload, {build: result.build.key, stats: result.stats});
      lastEncrypted = result.payload;
      els.previewWrong.hidden = false;
      els.detectBadge.textContent = result.build.key;
      setStatus(`${result.build.key} encryption complete. Password and plaintext never left this browser.`, "ok");
    } else {
      const result = await decryptSagittarius(input, password, {wrongKeyMode: els.wrongMode.value});
      presentOutput(result.output ?? "", {build: result.build.key, stats: result.stats});
      els.detectBadge.textContent = result.build.key;
      if (result.ok) setStatus(`${result.build.key} authenticated and decrypted.`, "ok");
      else setStatus(`${result.build.key}: wrong-key path shown; plaintext was not recovered.`, "warn");
    }
  } catch (err) {
    presentOutput("");
    setStatus(err?.message || String(err), "error");
  } finally {
    els.run.disabled = false;
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
  if (file.size > FILE_LIMIT) return setStatus(`File is too large for the browser workspace (${humanBytes(file.size)}).`, "error");
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
  if (mode !== "decrypt" || !els.input.value.trim()) return;
  try {
    const detected = detectBuild(els.input.value);
    els.detectBadge.textContent = detected.build.key;
  } catch (_) {
    els.detectBadge.textContent = "Auto-detect";
  }
}

function downloadOutput() {
  if (!lastFullOutput) return setStatus("Nothing to download.", "error");
  const blob = new Blob([lastFullOutput], {type:"text/plain;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const buildSlug = safeName(lastOutputBuild || buildKey);
  const original = loadedFileName ? safeName(loadedFileName) : "payload";
  a.href = url;
  a.download = mode === "encrypt" ? `${original}.${buildSlug}.sagittarius.txt` : `${original}.recovered.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  setStatus(`Downloaded ${a.download}.`, "ok");
}

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
  setStatus("Cleared.", "neutral");
});
els.copy.addEventListener("click", async () => {
  if (!lastFullOutput) return setStatus("Nothing to copy.", "error");
  try {
    await navigator.clipboard.writeText(lastFullOutput);
    setStatus(`Copied the complete ${humanBytes(new TextEncoder().encode(lastFullOutput).length)} output.`, "ok");
  } catch (_) {
    setStatus("Clipboard write failed. Use Download for very large outputs.", "error");
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

renderBuilds();
setMode("encrypt");
