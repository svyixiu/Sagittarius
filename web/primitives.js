export const te = new TextEncoder();
export const td = new TextDecoder();

export const FORMAT_VERSION = 1;
export const HEADER_SIZE = 4 + 1 + 16 + 12;
export const MAX_INPUT_BYTES = 1024 * 1024;
export const MAX_CONTAINER_BYTES = 16 * 1024 * 1024;

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function concatBytes(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

export function u32be(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, false);
  return b;
}

export function readU32be(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function bytesToB64(bytes) {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function b64ToBytes(s) {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function bytesToIndices(bytes) {
  const s = bytesToB64(bytes).replace(/=+$/g, "");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const map = new Map(Array.from(alphabet).map((c, i) => [c, i]));
  return Array.from(s, c => map.get(c));
}

export function indicesToBytes(indices) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let s = indices.map(i => alphabet[i]).join("");
  s += "=".repeat((4 - (s.length % 4)) % 4);
  return b64ToBytes(s);
}

export async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export async function deriveKeys(password, salt, build) {
  assert(password.length > 0, "Password must not be empty.");
  const webVersion = build.tesseract ? 2 : 1;
  const domain = te.encode(`Sagittarius/${build.family}/${build.version}/Web/${webVersion}`);
  const domainHash = await sha256(domain);
  const pbkdf = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  const rootBits = await crypto.subtle.deriveBits({
    name: "PBKDF2", salt: concatBytes(salt, domain), iterations: build.iterations, hash: "SHA-256"
  }, pbkdf, 256);
  const hkdf = await crypto.subtle.importKey("raw", rootBits, "HKDF", false, ["deriveBits"]);
  const encBits = await crypto.subtle.deriveBits({name:"HKDF", hash:"SHA-256", salt:domainHash, info:te.encode("encryption")}, hkdf, 256);
  const quoteBits = await crypto.subtle.deriveBits({name:"HKDF", hash:"SHA-256", salt:domainHash, info:te.encode("quotes")}, hkdf, 256);
  const mazeBits = await crypto.subtle.deriveBits({name:"HKDF", hash:"SHA-256", salt:domainHash, info:te.encode("tesseract-maze")}, hkdf, 256);
  const encKey = await crypto.subtle.importKey("raw", encBits, {name:"AES-GCM"}, false, ["encrypt", "decrypt"]);
  const quoteKey = await crypto.subtle.importKey("raw", quoteBits, {name:"HMAC", hash:"SHA-256"}, false, ["sign"]);
  return {encKey, quoteKey, mazeSeed: new Uint8Array(mazeBits)};
}

async function streamTransform(bytes, kind) {
  const Ctor = kind === "compress" ? globalThis.CompressionStream : globalThis.DecompressionStream;
  if (!Ctor) throw new Error("This browser does not support native deflate streams.");
  const stream = new Blob([bytes]).stream().pipeThrough(new Ctor("deflate"));
  const out = await new Response(stream).arrayBuffer();
  return new Uint8Array(out);
}

export async function maybeCompress(raw, build) {
  if (build.compression === "none") return {id: 0, data: raw};
  try {
    const zipped = await streamTransform(raw, "compress");
    if (build.compression === "deflate") return {id: 1, data: zipped};
    if (build.compression === "adaptive-deflate" && zipped.length + 16 < raw.length) return {id: 1, data: zipped};
  } catch (_) {}
  return {id: 0, data: raw};
}

export async function decompress(id, data, expectedSize) {
  if (id === 0) return data;
  if (id !== 1) throw new Error("Unknown compression method.");
  const out = await streamTransform(data, "decompress");
  if (out.length !== expectedSize) throw new Error("Authenticated size mismatch after decompression.");
  return out;
}

export function makeHeader(build, salt, iv) {
  const magic = te.encode(build.magic);
  return concatBytes(magic, new Uint8Array([FORMAT_VERSION]), salt, iv);
}

export function buildRecord(rawData, compId, originalSize, build) {
  const baseJunk = Math.ceil(rawData.length * build.junkRatio);
  const unpadded = 13 + rawData.length + baseJunk;
  const target = Math.ceil(unpadded / build.padBlock) * build.padBlock;
  const junkLen = baseJunk + (target - unpadded);
  const junk = randomBytes(junkLen);
  return concatBytes(new Uint8Array([compId]), u32be(originalSize), u32be(rawData.length), u32be(junkLen), rawData, junk);
}

export function parseRecord(record) {
  assert(record.length >= 13, "Encrypted payload record is truncated.");
  const compId = record[0];
  const originalSize = readU32be(record, 1);
  const dataLen = readU32be(record, 5);
  const junkLen = readU32be(record, 9);
  assert(originalSize <= MAX_INPUT_BYTES, "Authenticated original size exceeds the browser safety limit.");
  assert(13 + dataLen + junkLen === record.length, "Encrypted payload record lengths do not match.");
  return {compId, originalSize, data: record.slice(13, 13 + dataLen), junkLen};
}

export function prngFromBytes(bytes) {
  let x = (((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0) || 0x9e3779b9;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    return (x >>> 0) / 0x100000000;
  };
}

export function randomBytes(length) {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 65536) {
    crypto.getRandomValues(out.subarray(i, Math.min(i + 65536, length)));
  }
  return out;
}
