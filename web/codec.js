import { BUILDS } from "./builds.js";
import { QUOTES, QUOTE_STYLES, QUOTE_STYLE_ORDER } from "./quotes.js";
import { te, td, FORMAT_VERSION, HEADER_SIZE, MAX_CONTAINER_BYTES, assert, concatBytes, bytesToIndices, indicesToBytes, sha256, deriveKeys, prngFromBytes } from "./primitives.js";

const BUILD_LIST = Object.values(BUILDS);

export async function quoteLayout(quoteKey, container, build, nTokens) {
  if (nTokens < 3) return [];
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", quoteKey, concatBytes(te.encode(`${build.magic}/quotes/`), container)));
  const rng = prngFromBytes(sig);
  const count = Math.max(2, Math.min(nTokens - 1, Math.floor(nTokens / build.quoteDensity), 300));
  const chosen = new Set();
  while (chosen.size < count) chosen.add(1 + Math.floor(rng() * (nTokens - 1)));
  const positions = [...chosen].sort((a,b) => a-b);
  return positions.map(pos => ({
    pos,
    quote: QUOTES[Math.floor(rng() * QUOTES.length)],
    style: Math.floor(rng() * QUOTE_STYLES.length)
  }));
}

export function weave(tokens, layout, wrapTokens) {
  const byPos = new Map(layout.map(item => [item.pos, item]));
  const units = [];
  for (let i = 0; i <= tokens.length; i++) {
    const q = byPos.get(i);
    if (q) {
      const [op, cl] = QUOTE_STYLES[q.style];
      units.push({text: op + q.quote + cl, cost: 0});
    }
    if (i < tokens.length) units.push({text: tokens[i], cost: 1});
  }
  if (!wrapTokens) return units.map(u => u.text).join("");
  const lines = [];
  let line = "", count = 0;
  for (const u of units) {
    if (line && count + u.cost > wrapTokens) { lines.push(line); line = ""; count = 0; }
    line += u.text; count += u.cost;
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

function seqMatch(chars, i, seq) {
  const part = Array.from(seq);
  if (i + part.length > chars.length) return false;
  for (let j = 0; j < part.length; j++) if (chars[i+j] !== part[j]) return false;
  return true;
}

function findSeq(chars, start, seq) {
  for (let i = start; i < chars.length; i++) if (seqMatch(chars, i, seq)) return i;
  return -1;
}

function normalizeQuote(s) {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

function decodeVisibleWithBuild(payload, build) {
  const chars = Array.from(payload.trim());
  const tokenMap = new Map(build.tokens.map((t, i) => [t, i]));
  const width = Array.from(build.tokens[0]).length;
  const indices = [];
  const found = [];
  let i = 0;
  while (i < chars.length) {
    if (/\s/u.test(chars[i])) { i++; continue; }
    let matchedQuote = false;
    for (const style of QUOTE_STYLE_ORDER) {
      const [op, cl] = QUOTE_STYLES[style];
      if (!seqMatch(chars, i, op)) continue;
      const opLen = Array.from(op).length;
      const end = findSeq(chars, i + opLen, cl);
      if (end < 0) throw new Error("Unterminated Sagittarius quote.");
      const quote = normalizeQuote(chars.slice(i + opLen, end).join(""));
      if (!QUOTES.includes(quote)) throw new Error("Unknown or altered Sagittarius quote.");
      found.push({pos: indices.length, quote, style});
      i = end + Array.from(cl).length;
      matchedQuote = true;
      break;
    }
    if (matchedQuote) continue;
    const token = chars.slice(i, i + width).join("");
    const idx = tokenMap.get(token);
    if (idx === undefined) throw new Error(`Symbol does not belong to Sagittarius ${build.key}.`);
    indices.push(idx);
    i += width;
  }
  const container = indicesToBytes(indices);
  return {container, found};
}

function headerMatches(container, build) {
  if (container.length < HEADER_SIZE + 16) return false;
  const magic = td.decode(container.slice(0, 4));
  return magic === build.magic && container[4] === FORMAT_VERSION;
}

export function detectBuild(payload) {
  for (const build of BUILD_LIST) {
    try {
      const decoded = decodeVisibleWithBuild(payload, build);
      if (headerMatches(decoded.container, build)) return {build, ...decoded};
    } catch (_) {}
  }
  throw new Error("Payload does not match any installed Sagittarius web build.");
}

export function sameLayout(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].pos !== b[i].pos || a[i].quote !== b[i].quote || a[i].style !== b[i].style) return false;
  }
  return true;
}

export async function makeDecoy(password, container, build, mode) {
  if (mode === "strict") return null;
  const digest = await sha256(concatBytes(te.encode(`${build.magic}/wrong-key/${password}/`), container.slice(0, Math.min(container.length, 4096))));
  const rng = prngFromBytes(digest);
  if (mode === "taunt") {
    const lines = [
      `[Sagittarius ${build.key} Recovery]`,
      "The supplied password completed a path, but not the real one.",
      QUOTES[Math.floor(rng() * QUOTES.length)],
      QUOTES[Math.floor(rng() * QUOTES.length)],
      "What came back is intentionally not the plaintext."
    ];
    return lines.join("\n");
  }
  const count = Math.min(1800, Math.max(160, Math.floor(container.length * 0.65)));
  const tokens = Array.from({length: count}, () => build.tokens[Math.floor(rng() * build.tokens.length)]);
  const pseudoLayout = [];
  for (let i = 0; i < Math.max(2, Math.floor(count / 180)); i++) {
    pseudoLayout.push({
      pos: 1 + Math.floor(rng() * (count - 1)),
      quote: QUOTES[Math.floor(rng() * QUOTES.length)],
      style: Math.floor(rng() * QUOTE_STYLES.length)
    });
  }
  pseudoLayout.sort((a,b) => a.pos-b.pos);
  return weave(tokens, pseudoLayout, build.wrapTokens);
}

