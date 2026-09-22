import { BUILDS } from "./builds.js";
import { te, td, FORMAT_VERSION, HEADER_SIZE, MAX_INPUT_BYTES, MAX_CONTAINER_BYTES, assert, concatBytes, bytesToIndices, deriveKeys, maybeCompress, decompress, makeHeader, buildRecord, parseRecord } from "./primitives.js";
import { quoteLayout, weave, detectBuild, sameLayout, makeDecoy } from "./codec.js";
export { BUILDS };
export { detectBuild } from "./codec.js";

export async function encryptSagittarius(plaintext, password, buildKey = "Sapphire 3") {
  const build = BUILDS[buildKey];
  assert(build, "Unknown Sagittarius build.");
  assert(password.length > 0, "Password must not be empty.");
  const raw = te.encode(plaintext);
  assert(raw.length <= MAX_INPUT_BYTES, `Input exceeds the ${MAX_INPUT_BYTES / 1024 / 1024} MiB browser limit.`);

  const compressed = await maybeCompress(raw, build);
  const record = buildRecord(compressed.data, compressed.id, raw.length, build);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = makeHeader(build, salt, iv);
  const {encKey, quoteKey} = await deriveKeys(password, salt, build);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM", iv, additionalData:header, tagLength:128}, encKey, record));
  const container = concatBytes(header, cipher);
  assert(container.length <= MAX_CONTAINER_BYTES, "Generated container exceeds the browser safety limit.");

  const indices = bytesToIndices(container);
  const tokens = indices.map(i => build.tokens[i]);
  const layout = await quoteLayout(quoteKey, container, build, tokens.length);
  const payload = weave(tokens, layout, build.wrapTokens);
  return {
    payload,
    build,
    stats: {
      inputBytes: raw.length,
      compressedBytes: compressed.data.length,
      compression: compressed.id === 1 ? "deflate" : "none",
      junkBytes: record.length - 13 - compressed.data.length,
      containerBytes: container.length,
      outputBytes: te.encode(payload).length,
      quotes: layout.length
    }
  };
}

export async function decryptSagittarius(payload, password, {wrongKeyMode = "taunt"} = {}) {
  assert(password.length > 0, "Password must not be empty.");
  const detected = detectBuild(payload);
  const {build, container, found} = detected;
  assert(container.length <= MAX_CONTAINER_BYTES, "Container exceeds the browser safety limit.");
  const version = container[4];
  assert(version === FORMAT_VERSION, "Unsupported Sagittarius web format version.");
  const salt = container.slice(5, 21);
  const iv = container.slice(21, 33);
  const header = container.slice(0, HEADER_SIZE);
  const cipher = container.slice(HEADER_SIZE);
  const {encKey, quoteKey} = await deriveKeys(password, salt, build);

  let record;
  try {
    record = new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM", iv, additionalData:header, tagLength:128}, encKey, cipher));
  } catch (_) {
    const decoy = await makeDecoy(password, container, build, wrongKeyMode);
    if (wrongKeyMode === "strict") throw new Error("Authentication failed: incorrect password or modified payload.");
    return {ok:false, build, wrongKey:true, output:decoy, reason:"Authentication failed before plaintext recovery."};
  }

  const expectedLayout = await quoteLayout(quoteKey, container, build, bytesToIndices(container).length);
  if (!sameLayout(found, expectedLayout)) throw new Error("Sagittarius quote layout was modified or removed.");

  const parsed = parseRecord(record);
  const plainBytes = await decompress(parsed.compId, parsed.data, parsed.originalSize);
  assert(plainBytes.length === parsed.originalSize, "Authenticated plaintext size does not match.");
  return {
    ok:true,
    build,
    wrongKey:false,
    output: td.decode(plainBytes),
    stats: {
      plaintextBytes: plainBytes.length,
      compressedBytes: parsed.data.length,
      compression: parsed.compId === 1 ? "deflate" : "none",
      junkBytes: parsed.junkLen,
      containerBytes: container.length,
      quotes: found.length
    }
  };
}

export async function previewWrongPassword(payload, realPassword, mode = "taunt") {
  const wrong = `${realPassword}\u2063wrong`;
  return decryptSagittarius(payload, wrong, {wrongKeyMode: mode});
}
