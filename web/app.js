import {BUILDS, encryptSagittarius, decryptSagittarius, previewWrongPassword, detectBuild} from "./sagittarius.js";

const $ = (id) => document.getElementById(id);
const els = {
  buildGrid: $("build-grid"), modeEncrypt: $("mode-encrypt"), modeDecrypt: $("mode-decrypt"),
  input: $("input"), output: $("output"), password: $("password"), wrongMode: $("wrong-mode"),
  wrongWrap: $("wrong-wrap"), run: $("run"), copy: $("copy"), clear: $("clear"),
  previewWrong: $("preview-wrong"), status: $("status"), metrics: $("metrics"),
  modeLabel: $("mode-label"), inputLabel: $("input-label"), outputLabel: $("output-label"),
  passwordToggle: $("password-toggle"), detectBadge: $("detected-build")
};

let mode = "encrypt";
let buildKey = "Sapphire 3";
let lastEncrypted = "";

function renderBuilds() {
  els.buildGrid.innerHTML = "";
  for (const build of Object.values(BUILDS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `build-card ${build.key === buildKey ? "selected" : ""}`;
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
  els.inputLabel.textContent = enc ? "Plaintext" : "Sagittarius payload";
  els.outputLabel.textContent = enc ? "Encrypted payload" : "Recovered output";
  els.run.textContent = enc ? "Encrypt" : "Decrypt";
  els.input.placeholder = enc ? "Paste text, code, JSON, notes…" : "Paste a Sagittarius Violet 1, Sapphire 3, or Parallel 5 payload…";
  els.output.placeholder = enc ? "Encrypted Sagittarius output appears here." : "Plaintext or wrong-key behavior appears here.";
  els.detectBadge.textContent = enc ? buildKey : "Auto-detect";
  setStatus("Ready.", "neutral");
  renderBuilds();
}

function setStatus(text, kind = "neutral") {
  els.status.textContent = text;
  els.status.dataset.kind = kind;
}

function renderMetrics(stats, prefix = "") {
  if (!stats) { els.metrics.innerHTML = ""; return; }
  const entries = Object.entries(stats);
  els.metrics.innerHTML = entries.map(([k,v]) => `<span><b>${prefix}${humanKey(k)}</b>${formatValue(k,v)}</span>`).join("");
}

function humanKey(k) {
  return k.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
}

function formatValue(k,v) {
  if (typeof v === "number" && /Bytes$/.test(k)) return `${v.toLocaleString()} B`;
  return String(v);
}

async function run() {
  const input = els.input.value;
  const password = els.password.value;
  if (!input) return setStatus("Input is empty.", "error");
  if (!password) return setStatus("Enter a password.", "error");
  els.run.disabled = true;
  els.output.value = "";
  renderMetrics(null);
  setStatus(mode === "encrypt" ? "Encrypting locally…" : "Decrypting locally…", "busy");
  try {
    if (mode === "encrypt") {
      const result = await encryptSagittarius(input, password, buildKey);
      els.output.value = result.payload;
      lastEncrypted = result.payload;
      els.previewWrong.hidden = false;
      els.detectBadge.textContent = result.build.key;
      renderMetrics(result.stats);
      setStatus(`${result.build.key} encryption complete. Nothing was uploaded.`, "ok");
    } else {
      const result = await decryptSagittarius(input, password, {wrongKeyMode: els.wrongMode.value});
      els.output.value = result.output ?? "";
      els.detectBadge.textContent = result.build.key;
      renderMetrics(result.stats);
      if (result.ok) setStatus(`${result.build.key} authenticated and decrypted.`, "ok");
      else setStatus(`${result.build.key}: wrong-key path shown; plaintext was not recovered.`, "warn");
    }
  } catch (err) {
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
    els.output.value = result.output;
    setStatus("Wrong-password preview: authentication failed, so Sagittarius returned its decoy path.", "warn");
    renderMetrics(null);
  } catch (err) {
    setStatus(err?.message || String(err), "error");
  } finally {
    els.previewWrong.disabled = false;
  }
}

els.modeEncrypt.addEventListener("click", () => setMode("encrypt"));
els.modeDecrypt.addEventListener("click", () => setMode("decrypt"));
els.run.addEventListener("click", run);
els.previewWrong.addEventListener("click", wrongPreview);
els.clear.addEventListener("click", () => {
  els.input.value = ""; els.output.value = ""; lastEncrypted = ""; els.previewWrong.hidden = true;
  renderMetrics(null); setStatus("Cleared.", "neutral");
});
els.copy.addEventListener("click", async () => {
  if (!els.output.value) return setStatus("Nothing to copy.", "error");
  await navigator.clipboard.writeText(els.output.value);
  setStatus("Output copied.", "ok");
});
els.passwordToggle.addEventListener("click", () => {
  const hidden = els.password.type === "password";
  els.password.type = hidden ? "text" : "password";
  els.passwordToggle.textContent = hidden ? "Hide" : "Show";
});
els.input.addEventListener("input", () => {
  if (mode !== "decrypt" || !els.input.value.trim()) return;
  try {
    const detected = detectBuild(els.input.value);
    els.detectBadge.textContent = detected.build.key;
  } catch (_) {
    els.detectBadge.textContent = "Auto-detect";
  }
});

renderBuilds();
setMode("encrypt");
