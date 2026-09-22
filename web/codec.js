import { BUILDS } from "./builds.js";
import { QUOTES, QUOTE_STYLES, QUOTE_STYLE_ORDER } from "./quotes.js";
import { te, td, FORMAT_VERSION, HEADER_SIZE, MAX_CONTAINER_BYTES, assert, concatBytes, bytesToIndices, indicesToBytes, sha256, prngFromBytes, u32be, readU32be, randomBytes } from "./primitives.js";

const BUILD_LIST = Object.values(BUILDS);
const TESS_FRAME_OPEN = "꧁";
const TESS_FRAME_CLOSE = "꧂";
const TESS_SEPARATOR = "꧅꧅";
const TESS_MAZE_VERSION = 1;

function fullwidthText(text) {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (ch === " ") out += "　";
    else if (ch === "\n") out += " ";
    else if (cp >= 0x21 && cp <= 0x7e) out += String.fromCodePoint(cp + 0xfee0);
    else out += ch;
  }
  return out;
}

export const TESSERACT_PROLOGUE = fullwidthText(
  "YOU HAVE NOT REACHED THE PAYLOAD. THIS IS ONLY THE FIRST WALL OF THE MAZE. " +
  "EVERY STEP BELOW MAY BE A SURVIVOR, JUNK, A RETURN TO A PATH YOU ALREADY CROSSED, OR A MEMORY REQUIRED BY A LATER STEP. " +
  "THE ORDER IS NOT WRITTEN FOR YOU. THE KEY DOES NOT SIMPLY OPEN A LOCK. IT TELLS THE READER HOW MANY PASSES TO TAKE, " +
  "WHICH CORRIDORS TO THROW AWAY, WHICH POSITIONS TO KEEP, WHEN TO REVERSE, WHEN TO ROTATE, AND WHAT STATE MUST BE CARRIED FORWARD. " +
  "A CORRECT GLYPH RECOVERED AT THE WRONG MOMENT IS STILL WRONG. A CORRECT ROUTE WALKED FOR THE WRONG NUMBER OF ROUNDS BECOMES NOISE AGAIN. " +
  "THE CIPHERTEXT EXISTS INSIDE THIS STRUCTURE, BUT THE STRUCTURE IS DESIGNED TO DESTROY CONFIDENCE BEFORE THE CIPHER HAS TO REJECT YOU. " +
  "IF YOU THINK YOU FOUND A PATTERN, REMEMBER THAT TESSERACT EXPECTS YOU TO THINK THAT."
);

export async function quoteLayout(quoteKey, container, build, nTokens) {
  if (nTokens < 3 || !build.quoteDensity) return [];
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

export function headerMatches(container, build) {
  if (!container || container.length < HEADER_SIZE + 16) return false;
  const magic = td.decode(container.slice(0, 4));
  return magic === build.magic && container[4] === FORMAT_VERSION;
}

function mix32(h, v) {
  h ^= v >>> 0;
  h = Math.imul(h, 0x01000193);
  h ^= h >>> 13;
  return h >>> 0;
}

function seedFrom(mazeSeed, ...parts) {
  let h = 0x811c9dc5;
  for (const b of mazeSeed) h = mix32(h, b);
  for (const part of parts) {
    let v = Number(part) >>> 0;
    h = mix32(h, v & 0xff);
    h = mix32(h, (v >>> 8) & 0xff);
    h = mix32(h, (v >>> 16) & 0xff);
    h = mix32(h, (v >>> 24) & 0xff);
  }
  return h || 0x9e3779b9;
}

function rng32(seed) {
  let x = seed >>> 0 || 0x9e3779b9;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    return x >>> 0;
  };
}

function randBelow(next, n) {
  return n <= 1 ? 0 : next() % n;
}

function rotateLeft(values, amount) {
  if (!values.length) return values.slice();
  amount %= values.length;
  return amount ? values.slice(amount).concat(values.slice(0, amount)) : values.slice();
}

function rotateRight(values, amount) {
  if (!values.length) return values.slice();
  amount %= values.length;
  return amount ? values.slice(-amount).concat(values.slice(0, -amount)) : values.slice();
}

function localParams(mazeSeed, roundIndex, blockIndex, size) {
  if (size <= 1) return [0, false];
  const next = rng32(seedFrom(mazeSeed, 0x6c6f6361, roundIndex, blockIndex, size));
  return [randBelow(next, size), Boolean(next() & 1)];
}

function transformBlock(block, mazeSeed, roundIndex, blockIndex, inverse = false) {
  if (block.length <= 1) return block.slice();
  const [rot, rev] = localParams(mazeSeed, roundIndex, blockIndex, block.length);
  if (!inverse) {
    const out = rotateLeft(block, rot);
    if (rev) out.reverse();
    return out;
  }
  const out = block.slice();
  if (rev) out.reverse();
  return rotateRight(out, rot);
}

function roundParams(mazeSeed, roundIndex, n) {
  const next = rng32(seedFrom(mazeSeed, 0x726f756e, roundIndex, n));
  const blockSize = 17 + randBelow(next, 48);
  const globalRot = randBelow(next, Math.max(1, n));
  const globalReverse = Boolean(next() & 1);
  return {blockSize, globalRot, globalReverse, next};
}

function roundForward(values, mazeSeed, roundIndex) {
  const n = values.length;
  if (n <= 1) return values.slice();
  const {blockSize, globalRot, globalReverse, next} = roundParams(mazeSeed, roundIndex, n);
  const fullCount = Math.floor(n / blockSize);
  const fullLen = fullCount * blockSize;
  let blocks = [];
  for (let i = 0; i < fullLen; i += blockSize) blocks.push(values.slice(i, i + blockSize));
  const tail = values.slice(fullLen);
  blocks = blocks.map((b, i) => transformBlock(b, mazeSeed, roundIndex, i, false));
  if (fullCount > 1) {
    const perm = Array.from({length: fullCount}, (_, i) => i);
    for (let i = perm.length - 1; i > 0; i--) {
      const j = randBelow(next, i + 1);
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    blocks = perm.map(i => blocks[i]);
  }
  let out = blocks.flat().concat(tail.length ? transformBlock(tail, mazeSeed, roundIndex, fullCount, false) : []);
  out = rotateLeft(out, globalRot);
  if (globalReverse) out.reverse();
  return out;
}

function roundInverse(values, mazeSeed, roundIndex) {
  const n = values.length;
  if (n <= 1) return values.slice();
  const {blockSize, globalRot, globalReverse, next} = roundParams(mazeSeed, roundIndex, n);
  let out = values.slice();
  if (globalReverse) out.reverse();
  out = rotateRight(out, globalRot);
  const fullCount = Math.floor(n / blockSize);
  const fullLen = fullCount * blockSize;
  let blocks = [];
  for (let i = 0; i < fullLen; i += blockSize) blocks.push(out.slice(i, i + blockSize));
  const tail = out.slice(fullLen);
  if (fullCount > 1) {
    const perm = Array.from({length: fullCount}, (_, i) => i);
    for (let i = perm.length - 1; i > 0; i--) {
      const j = randBelow(next, i + 1);
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    const restored = new Array(fullCount);
    for (let physical = 0; physical < fullCount; physical++) restored[perm[physical]] = blocks[physical];
    blocks = restored;
  }
  blocks = blocks.map((b, i) => transformBlock(b, mazeSeed, roundIndex, i, true));
  const restoredTail = tail.length ? transformBlock(tail, mazeSeed, roundIndex, fullCount, true) : [];
  return blocks.flat().concat(restoredTail);
}

function memoryForward(values, mazeSeed) {
  const next = rng32(seedFrom(mazeSeed, 0x6d656d6f, values.length));
  let memory = mazeSeed[1] & 63;
  const out = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const mask = next() & 63;
    out[i] = (values[i] ^ mask ^ memory) & 63;
    memory = ((memory * 13) ^ values[i] ^ ((i * 7) & 63)) & 63;
  }
  return out;
}

function memoryInverse(values, mazeSeed) {
  const next = rng32(seedFrom(mazeSeed, 0x6d656d6f, values.length));
  let memory = mazeSeed[1] & 63;
  const out = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const mask = next() & 63;
    const value = (values[i] ^ mask ^ memory) & 63;
    out[i] = value;
    memory = ((memory * 13) ^ value ^ ((i * 7) & 63)) & 63;
  }
  return out;
}

function mazeRoundCount(mazeSeed) {
  return 20 + (mazeSeed[0] % 21);
}

function scramble(values, mazeSeed) {
  let out = memoryForward(values, mazeSeed);
  const rounds = mazeRoundCount(mazeSeed);
  for (let r = 0; r < rounds; r++) out = roundForward(out, mazeSeed, r);
  return out;
}

function unscramble(values, mazeSeed) {
  let out = values.slice();
  const rounds = mazeRoundCount(mazeSeed);
  for (let r = rounds - 1; r >= 0; r--) out = roundInverse(out, mazeSeed, r);
  return memoryInverse(out, mazeSeed);
}

function junkPlan(mazeSeed, n) {
  const next = rng32(seedFrom(mazeSeed, 0x6a756e6b, n));
  const checkpoint = 41 + randBelow(next, 48);
  const plan = new Array(n);
  let totalJunk = 0;
  for (let i = 0; i < n; i++) {
    let junk = 1 + randBelow(next, 5);
    if (i && i % checkpoint === 0) junk += 8 + randBelow(next, 25);
    const before = randBelow(next, junk + 1);
    const after = junk - before;
    plan[i] = [before, after];
    totalJunk += junk;
  }
  return {plan, totalJunk};
}

function interleaveJunk(values, mazeSeed) {
  const {plan, totalJunk} = junkPlan(mazeSeed, values.length);
  const random = randomBytes(totalJunk);
  let rp = 0;
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const [before, after] = plan[i];
    for (let j = 0; j < before; j++) out.push(random[rp++] & 63);
    out.push(values[i]);
    for (let j = 0; j < after; j++) out.push(random[rp++] & 63);
  }
  return out;
}

function removeJunk(values, mazeSeed, realCount) {
  const {plan} = junkPlan(mazeSeed, realCount);
  const out = new Array(realCount);
  let pos = 0;
  for (let i = 0; i < realCount; i++) {
    const [before, after] = plan[i];
    const need = before + 1 + after;
    if (pos + need > values.length) throw new Error("Tesseract maze ended inside a junk corridor.");
    out[i] = values[pos + before];
    pos += need;
  }
  if (pos !== values.length) throw new Error("Tesseract maze contains an unexpected corridor.");
  return out;
}

function renderIndices(indices, build) {
  return indices.map(i => build.tokens[i]).join("");
}

function readFixedTokens(text, build) {
  const chars = Array.from(text);
  const width = Array.from(build.tokens[0]).length;
  if (chars.length % width) throw new Error("Tesseract glyph-stack width is invalid.");
  const tokenMap = new Map(build.tokens.map((t, i) => [t, i]));
  const out = new Array(chars.length / width);
  let p = 0;
  for (let i = 0; i < chars.length; i += width) {
    const token = chars.slice(i, i + width).join("");
    const idx = tokenMap.get(token);
    if (idx === undefined) throw new Error("Glyph does not belong to Tesseract 6.");
    out[p++] = idx;
  }
  return out;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function buildBootstrap(salt, build, tokenCount) {
  return concatBytes(salt, te.encode(build.magic), new Uint8Array([FORMAT_VERSION, TESS_MAZE_VERSION]), u32be(tokenCount));
}

export function parseTesseractVisible(payload, build) {
  const text = payload.trim();
  if (!text.startsWith(TESS_FRAME_OPEN) || !text.endsWith(TESS_FRAME_CLOSE)) throw new Error("Missing Tesseract 6 frame.");
  const core = text.slice(TESS_FRAME_OPEN.length, -TESS_FRAME_CLOSE.length);
  const lead = TESSERACT_PROLOGUE + TESS_SEPARATOR;
  if (!core.startsWith(lead)) throw new Error("Tesseract confidence-breaker prologue is missing or altered.");
  const rest = core.slice(lead.length);
  const cut = rest.indexOf(TESS_SEPARATOR);
  if (cut < 0) throw new Error("Tesseract bootstrap separator is missing.");
  const bootstrapText = rest.slice(0, cut);
  const body = rest.slice(cut + TESS_SEPARATOR.length);
  const bootIndices = readFixedTokens(bootstrapText, build);
  const bootstrap = indicesToBytes(bootIndices);
  if (bootstrap.length !== 26) throw new Error("Invalid Tesseract bootstrap size.");
  const salt = bootstrap.slice(0, 16);
  const magic = td.decode(bootstrap.slice(16, 20));
  const fmt = bootstrap[20], mazeVersion = bootstrap[21];
  const tokenCount = readU32be(bootstrap, 22);
  if (magic !== build.magic || fmt !== FORMAT_VERSION || mazeVersion !== TESS_MAZE_VERSION || tokenCount <= 0) throw new Error("Tesseract bootstrap profile mismatch.");
  return {salt, tokenCount, body};
}

export function encodeTesseractVisible(container, build, salt, mazeSeed) {
  const trueIndices = bytesToIndices(container);
  const scrambled = scramble(trueIndices, mazeSeed);
  const visible = interleaveJunk(scrambled, mazeSeed);
  const bootstrap = buildBootstrap(salt, build, trueIndices.length);
  const bootstrapText = renderIndices(bytesToIndices(bootstrap), build);
  const body = renderIndices(visible, build);
  return {
    payload: TESS_FRAME_OPEN + TESSERACT_PROLOGUE + TESS_SEPARATOR + bootstrapText + TESS_SEPARATOR + body + TESS_FRAME_CLOSE,
    rounds: mazeRoundCount(mazeSeed),
    realTokens: trueIndices.length,
    visibleTokens: visible.length
  };
}

export function decodeTesseractVisible(payload, build, mazeSeed) {
  const parsed = parseTesseractVisible(payload, build);
  const visibleIndices = readFixedTokens(parsed.body, build);
  const scrambled = removeJunk(visibleIndices, mazeSeed, parsed.tokenCount);
  const trueIndices = unscramble(scrambled, mazeSeed);
  const container = indicesToBytes(trueIndices);
  if (!headerMatches(container, build)) throw new Error("Wrong key or Tesseract maze was modified.");
  const saltInContainer = container.slice(5, 21);
  if (!bytesEqual(saltInContainer, parsed.salt)) throw new Error("Tesseract bootstrap does not match the reconstructed container.");
  return {container, salt: parsed.salt, rounds: mazeRoundCount(mazeSeed), realTokens: parsed.tokenCount, visibleTokens: visibleIndices.length};
}

export function detectBuild(payload) {
  for (const build of BUILD_LIST) {
    try {
      if (build.tesseract) {
        const parsed = parseTesseractVisible(payload, build);
        return {build, container: null, found: [], tesseract: parsed};
      }
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

export async function makeDecoy(password, sourceBytes, build, mode) {
  if (mode === "strict") return null;
  const digest = await sha256(concatBytes(te.encode(`${build.magic}/wrong-key/${password}/`), sourceBytes.slice(0, Math.min(sourceBytes.length, 4096))));
  const rng = prngFromBytes(digest);
  if (mode === "taunt") {
    if (build.tesseract) {
      return [
        `[Sagittarius ${build.key} Recovery]`,
        "The key produced a route. The route did not produce the container.",
        "You remembered the wrong state, survived the wrong corridor, or stopped one round too early.",
        "The maze has returned you to noise."
      ].join("\n");
    }
    return [
      `[Sagittarius ${build.key} Recovery]`,
      "The supplied password completed a path, but not the real one.",
      QUOTES[Math.floor(rng() * QUOTES.length)],
      QUOTES[Math.floor(rng() * QUOTES.length)],
      "What came back is intentionally not the plaintext."
    ].join("\n");
  }
  const count = Math.min(1800, Math.max(160, Math.floor(sourceBytes.length * 0.65)));
  const tokens = Array.from({length: count}, () => build.tokens[Math.floor(rng() * build.tokens.length)]);
  if (build.tesseract) return TESS_FRAME_OPEN + tokens.join("") + TESS_FRAME_CLOSE;
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
