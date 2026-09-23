import { te, td, FORMAT_VERSION, HEADER_SIZE, MAX_CONTAINER_BYTES, assert, concatBytes, bytesToIndices, indicesToBytes, u32be, readU32be, randomBytes } from './primitives.js';

const FRAME_OPEN = '⫷';
const FRAME_CLOSE = '⫸';
const SEPARATOR = '⟪⟫⟪⟫';
const MAZE_VERSION = 2;

function fullwidthText(text) {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (ch === ' ') out += '　';
    else if (ch === '\n') out += ' ';
    else if (cp >= 0x21 && cp <= 0x7e) out += String.fromCodePoint(cp + 0xfee0);
    else out += ch;
  }
  return out;
}

export const TESSERACT7_PROLOGUE = fullwidthText(
  'YOU ARE NOT LOOKING AT THE MESSAGE. YOU ARE LOOKING AT THE DAMAGE LEFT BY ITS ABSENCE. ' +
  'IF YOU CAME HERE EXPECTING A PATTERN, THE MAZE HAS ALREADY CHOSEN THE MOST EXPENSIVE WAY TO DISAPPOINT YOU. ' +
  'EVERY CORRIDOR CAN BE REAL, EVERY REAL CORRIDOR CAN BE MOVED, AND EVERY CORRECT SYMBOL CAN BECOME WRONG BY ARRIVING ONE STEP EARLY. ' +
  'THE KEY DOES NOT POINT TO AN ANSWER. IT RECREATES THE ORDER IN WHICH THE ANSWER WAS ALLOWED TO EXIST. ' +
  'YOU MAY COUNT THE MARKS, SORT THE GLYPHS, REMOVE THE NOISE, REVERSE THE LINES, AND STILL RECOVER NOTHING BUT A MORE ORGANIZED FAILURE. ' +
  'THE CIPHER DOES NOT NEED YOU TO GIVE UP. THE MAZE ONLY WANTS YOU TO WASTE ENOUGH TIME TO WISH YOU HAD.'
);

function readU32le(bytes, off) {
  return new DataView(bytes.buffer, bytes.byteOffset + off, 4).getUint32(0, true);
}
function writeU32le(out, off, value) {
  new DataView(out.buffer, out.byteOffset + off, 4).setUint32(0, value >>> 0, true);
}
function rotl32(x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; }
function qr(x, a, b, c, d) {
  x[a] = (x[a] + x[b]) >>> 0; x[d] ^= x[a]; x[d] = rotl32(x[d], 16);
  x[c] = (x[c] + x[d]) >>> 0; x[b] ^= x[c]; x[b] = rotl32(x[b], 12);
  x[a] = (x[a] + x[b]) >>> 0; x[d] ^= x[a]; x[d] = rotl32(x[d], 8);
  x[c] = (x[c] + x[d]) >>> 0; x[b] ^= x[c]; x[b] = rotl32(x[b], 7);
}
function chachaBlock(key, counter, nonce) {
  assert(key.length === 32, 'ChaCha20 key must be 32 bytes.');
  assert(nonce.length === 12, 'ChaCha20 nonce must be 12 bytes.');
  const s = new Uint32Array(16);
  s[0] = 0x61707865; s[1] = 0x3320646e; s[2] = 0x79622d32; s[3] = 0x6b206574;
  for (let i = 0; i < 8; i++) s[4+i] = readU32le(key, i*4);
  s[12] = counter >>> 0;
  s[13] = readU32le(nonce, 0); s[14] = readU32le(nonce, 4); s[15] = readU32le(nonce, 8);
  const x = new Uint32Array(s);
  for (let i = 0; i < 10; i++) {
    qr(x,0,4,8,12); qr(x,1,5,9,13); qr(x,2,6,10,14); qr(x,3,7,11,15);
    qr(x,0,5,10,15); qr(x,1,6,11,12); qr(x,2,7,8,13); qr(x,3,4,9,14);
  }
  const out = new Uint8Array(64);
  for (let i = 0; i < 16; i++) writeU32le(out, i*4, (x[i] + s[i]) >>> 0);
  return out;
}
function chachaXor(key, nonce, counter, input) {
  const out = new Uint8Array(input.length);
  for (let pos = 0; pos < input.length; pos += 64) {
    const block = chachaBlock(key, counter++, nonce);
    const n = Math.min(64, input.length - pos);
    for (let i = 0; i < n; i++) out[pos+i] = input[pos+i] ^ block[i];
  }
  return out;
}
function leBytesToBigInt(bytes) {
  let x = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) x = (x << 8n) | BigInt(bytes[i]);
  return x;
}
function bigIntToLe16(x) {
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) { out[i] = Number(x & 0xffn); x >>= 8n; }
  return out;
}
function poly1305(message, oneTimeKey) {
  assert(oneTimeKey.length === 32, 'Poly1305 key must be 32 bytes.');
  const rBytes = oneTimeKey.slice(0,16);
  rBytes[3] &= 15; rBytes[7] &= 15; rBytes[11] &= 15; rBytes[15] &= 15;
  rBytes[4] &= 252; rBytes[8] &= 252; rBytes[12] &= 252;
  const r = leBytesToBigInt(rBytes);
  const s = leBytesToBigInt(oneTimeKey.slice(16,32));
  const p = (1n << 130n) - 5n;
  let acc = 0n;
  for (let off = 0; off < message.length; off += 16) {
    const block = message.slice(off, Math.min(off + 16, message.length));
    const n = leBytesToBigInt(block) + (1n << BigInt(block.length * 8));
    acc = ((acc + n) * r) % p;
  }
  return bigIntToLe16((acc + s) & ((1n << 128n) - 1n));
}
function pad16(bytes) {
  const n = (16 - (bytes.length % 16)) % 16;
  return n ? new Uint8Array(n) : new Uint8Array(0);
}
function le64(n) {
  let x = BigInt(n);
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) { out[i] = Number(x & 0xffn); x >>= 8n; }
  return out;
}
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
export function chacha20Poly1305Encrypt(key, nonce, plaintext, aad = new Uint8Array(0)) {
  const otk = chachaBlock(key, 0, nonce).slice(0,32);
  const ciphertext = chachaXor(key, nonce, 1, plaintext);
  const macData = concatBytes(aad, pad16(aad), ciphertext, pad16(ciphertext), le64(aad.length), le64(ciphertext.length));
  const tag = poly1305(macData, otk);
  return concatBytes(ciphertext, tag);
}
export function chacha20Poly1305Decrypt(key, nonce, sealed, aad = new Uint8Array(0)) {
  assert(sealed.length >= 16, 'ChaCha20-Poly1305 payload is truncated.');
  const ciphertext = sealed.slice(0,-16);
  const tag = sealed.slice(-16);
  const otk = chachaBlock(key, 0, nonce).slice(0,32);
  const macData = concatBytes(aad, pad16(aad), ciphertext, pad16(ciphertext), le64(aad.length), le64(ciphertext.length));
  const expected = poly1305(macData, otk);
  if (!constantTimeEqual(tag, expected)) throw new Error('ChaCha20-Poly1305 authentication failed.');
  return chachaXor(key, nonce, 1, ciphertext);
}

export async function deriveTesseract7Keys(password, salt, build) {
  assert(password.length > 0, 'Password must not be empty.');
  const domain = te.encode('Sagittarius/' + build.family + '/' + build.version + '/Web/3');
  const domainHash = new Uint8Array(await crypto.subtle.digest('SHA-256', domain));
  const pbkdf = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits']);
  const rootBits = await crypto.subtle.deriveBits({name:'PBKDF2', salt:concatBytes(salt, domain), iterations:build.iterations, hash:'SHA-256'}, pbkdf, 256);
  const hkdf = await crypto.subtle.importKey('raw', rootBits, 'HKDF', false, ['deriveBits']);
  const cipherBits = await crypto.subtle.deriveBits({name:'HKDF', hash:'SHA-256', salt:domainHash, info:te.encode('chacha20-poly1305')}, hkdf, 256);
  const mazeBits = await crypto.subtle.deriveBits({name:'HKDF', hash:'SHA-256', salt:domainHash, info:te.encode('tesseract7-maze')}, hkdf, 256);
  return {chachaKey:new Uint8Array(cipherBits), mazeSeed:new Uint8Array(mazeBits)};
}

function mix32(h,v){h^=v>>>0;h=Math.imul(h,0x01000193);h^=h>>>13;return h>>>0}
function seedFrom(seed,...parts){let h=0x811c9dc5;for(const b of seed)h=mix32(h,b);for(const part of parts){let v=Number(part)>>>0;h=mix32(h,v&255);h=mix32(h,(v>>>8)&255);h=mix32(h,(v>>>16)&255);h=mix32(h,(v>>>24)&255)}return h||0x9e3779b9}
function rng32(seed){let x=seed>>>0||0x9e3779b9;return()=>{x^=x<<13;x>>>=0;x^=x>>>17;x>>>=0;x^=x<<5;x>>>=0;return x>>>0}}
function randBelow(next,n){return n<=1?0:next()%n}
function rotateLeft(v,a){if(!v.length)return v.slice();a%=v.length;return a?v.slice(a).concat(v.slice(0,a)):v.slice()}
function rotateRight(v,a){if(!v.length)return v.slice();a%=v.length;return a?v.slice(-a).concat(v.slice(0,-a)):v.slice()}
function localParams(seed,r,b,size){if(size<=1)return[0,false];const next=rng32(seedFrom(seed,0x74376c70,r,b,size));return[randBelow(next,size),Boolean(next()&1)]}
function transformBlock(block,seed,r,b,inverse=false){if(block.length<=1)return block.slice();const[rot,rev]=localParams(seed,r,b,block.length);if(!inverse){const out=rotateLeft(block,rot);if(rev)out.reverse();return out}const out=block.slice();if(rev)out.reverse();return rotateRight(out,rot)}
function roundParams(seed,r,n){const next=rng32(seedFrom(seed,0x74377264,r,n));return{blockSize:19+randBelow(next,62),globalRot:randBelow(next,Math.max(1,n)),globalReverse:Boolean(next()&1),next}}
function roundForward(values,seed,r){const n=values.length;if(n<=1)return values.slice();const{blockSize,globalRot,globalReverse,next}=roundParams(seed,r,n);const fullCount=Math.floor(n/blockSize),fullLen=fullCount*blockSize;let blocks=[];for(let i=0;i<fullLen;i+=blockSize)blocks.push(values.slice(i,i+blockSize));const tail=values.slice(fullLen);blocks=blocks.map((b,i)=>transformBlock(b,seed,r,i,false));if(fullCount>1){const perm=Array.from({length:fullCount},(_,i)=>i);for(let i=perm.length-1;i>0;i--){const j=randBelow(next,i+1);[perm[i],perm[j]]=[perm[j],perm[i]]}blocks=perm.map(i=>blocks[i])}let out=blocks.flat().concat(tail.length?transformBlock(tail,seed,r,fullCount,false):[]);out=rotateLeft(out,globalRot);if(globalReverse)out.reverse();return out}
function roundInverse(values,seed,r){const n=values.length;if(n<=1)return values.slice();const{blockSize,globalRot,globalReverse,next}=roundParams(seed,r,n);let out=values.slice();if(globalReverse)out.reverse();out=rotateRight(out,globalRot);const fullCount=Math.floor(n/blockSize),fullLen=fullCount*blockSize;let blocks=[];for(let i=0;i<fullLen;i+=blockSize)blocks.push(out.slice(i,i+blockSize));const tail=out.slice(fullLen);if(fullCount>1){const perm=Array.from({length:fullCount},(_,i)=>i);for(let i=perm.length-1;i>0;i--){const j=randBelow(next,i+1);[perm[i],perm[j]]=[perm[j],perm[i]]}const restored=new Array(fullCount);for(let physical=0;physical<fullCount;physical++)restored[perm[physical]]=blocks[physical];blocks=restored}blocks=blocks.map((b,i)=>transformBlock(b,seed,r,i,true));const rt=tail.length?transformBlock(tail,seed,r,fullCount,true):[];return blocks.flat().concat(rt)}
function memoryForward(values,seed){const next=rng32(seedFrom(seed,0x74376d65,values.length));let a=seed[1]&63,b=seed[2]&63;const out=new Array(values.length);for(let i=0;i<values.length;i++){const v=values[i],mask=next()&63;out[i]=(v^mask^a^((b+i)&63))&63;a=((a*13)^v^((i*7)&63))&63;b=((b*29)+v+a+i)&63}return out}
function memoryInverse(values,seed){const next=rng32(seedFrom(seed,0x74376d65,values.length));let a=seed[1]&63,b=seed[2]&63;const out=new Array(values.length);for(let i=0;i<values.length;i++){const mask=next()&63,v=(values[i]^mask^a^((b+i)&63))&63;out[i]=v;a=((a*13)^v^((i*7)&63))&63;b=((b*29)+v+a+i)&63}return out}
function mazeRoundCount(seed){return 28+(seed[0]%29)}
function scramble(values,seed){let out=memoryForward(values,seed);const rounds=mazeRoundCount(seed);for(let r=0;r<rounds;r++)out=roundForward(out,seed,r);return out}
function unscramble(values,seed){let out=values.slice();const rounds=mazeRoundCount(seed);for(let r=rounds-1;r>=0;r--)out=roundInverse(out,seed,r);return memoryInverse(out,seed)}
function junkPlan(seed,n){const next=rng32(seedFrom(seed,0x74376a6b,n));const checkpoint=29+randBelow(next,44);const plan=new Array(n);let totalJunk=0;for(let i=0;i<n;i++){let junk=2+randBelow(next,5);if(i&&i%checkpoint===0)junk+=10+randBelow(next,31);const before=randBelow(next,junk+1),after=junk-before;plan[i]=[before,after];totalJunk+=junk}return{plan,totalJunk}}
function interleaveJunk(values,seed){const{plan,totalJunk}=junkPlan(seed,values.length);const random=randomBytes(totalJunk);let rp=0;const out=[];for(let i=0;i<values.length;i++){const[before,after]=plan[i];for(let j=0;j<before;j++)out.push(random[rp++]&63);out.push(values[i]);for(let j=0;j<after;j++)out.push(random[rp++]&63)}return out}
function removeJunk(values,seed,realCount){const{plan}=junkPlan(seed,realCount);const out=new Array(realCount);let pos=0;for(let i=0;i<realCount;i++){const[before,after]=plan[i],need=before+1+after;if(pos+need>values.length)throw new Error('Tesseract 7 maze ended inside a junk corridor.');out[i]=values[pos+before];pos+=need}if(pos!==values.length)throw new Error('Tesseract 7 maze contains an unexpected corridor.');return out}
function renderIndices(indices,build){return indices.map(i=>build.tokens[i]).join('')}
function readFixedTokens(text,build){const chars=Array.from(text),width=Array.from(build.tokens[0]).length;if(chars.length%width)throw new Error('Tesseract 7 glyph-stack width is invalid.');const map=new Map(build.tokens.map((t,i)=>[t,i]));const out=new Array(chars.length/width);let p=0;for(let i=0;i<chars.length;i+=width){const token=chars.slice(i,i+width).join(''),idx=map.get(token);if(idx===undefined)throw new Error('Glyph does not belong to Tesseract 7.');out[p++]=idx}return out}
function bytesEqual(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0}
function buildBootstrap(salt,build,tokenCount){return concatBytes(salt,te.encode(build.magic),new Uint8Array([FORMAT_VERSION,MAZE_VERSION]),u32be(tokenCount))}
function headerMatches(container,build){if(!container||container.length<HEADER_SIZE+16)return false;return td.decode(container.slice(0,4))===build.magic&&container[4]===FORMAT_VERSION}
export function parseTesseract7Visible(payload,build){const text=payload.trim();if(!text.startsWith(FRAME_OPEN)||!text.endsWith(FRAME_CLOSE))throw new Error('Missing Tesseract 7 frame.');const core=text.slice(FRAME_OPEN.length,-FRAME_CLOSE.length),lead=TESSERACT7_PROLOGUE+SEPARATOR;if(!core.startsWith(lead))throw new Error('Tesseract 7 confidence-breaker prologue is missing or altered.');const rest=core.slice(lead.length),cut=rest.indexOf(SEPARATOR);if(cut<0)throw new Error('Tesseract 7 bootstrap separator is missing.');const bootstrapText=rest.slice(0,cut),body=rest.slice(cut+SEPARATOR.length),bootIndices=readFixedTokens(bootstrapText,build),bootstrap=indicesToBytes(bootIndices);if(bootstrap.length!==26)throw new Error('Invalid Tesseract 7 bootstrap size.');const salt=bootstrap.slice(0,16),magic=td.decode(bootstrap.slice(16,20)),fmt=bootstrap[20],mazeVersion=bootstrap[21],tokenCount=readU32be(bootstrap,22);if(magic!==build.magic||fmt!==FORMAT_VERSION||mazeVersion!==MAZE_VERSION||tokenCount<=0)throw new Error('Tesseract 7 bootstrap profile mismatch.');return{salt,tokenCount,body}}
export function encodeTesseract7Visible(container,build,salt,mazeSeed){const trueIndices=bytesToIndices(container),scrambled=scramble(trueIndices,mazeSeed),visible=interleaveJunk(scrambled,mazeSeed),bootstrap=buildBootstrap(salt,build,trueIndices.length),bootstrapText=renderIndices(bytesToIndices(bootstrap),build),body=renderIndices(visible,build);return{payload:FRAME_OPEN+TESSERACT7_PROLOGUE+SEPARATOR+bootstrapText+SEPARATOR+body+FRAME_CLOSE,rounds:mazeRoundCount(mazeSeed),realTokens:trueIndices.length,visibleTokens:visible.length}}
export function decodeTesseract7Visible(payload,build,mazeSeed){const parsed=parseTesseract7Visible(payload,build),visibleIndices=readFixedTokens(parsed.body,build),scrambled=removeJunk(visibleIndices,mazeSeed,parsed.tokenCount),trueIndices=unscramble(scrambled,mazeSeed),container=indicesToBytes(trueIndices);if(container.length>MAX_CONTAINER_BYTES)throw new Error('Tesseract 7 container exceeds the browser safety limit.');if(!headerMatches(container,build))throw new Error('Wrong key or Tesseract 7 maze was modified.');const saltInContainer=container.slice(5,21);if(!bytesEqual(saltInContainer,parsed.salt))throw new Error('Tesseract 7 bootstrap does not match the reconstructed container.');return{container,salt:parsed.salt,rounds:mazeRoundCount(mazeSeed),realTokens:parsed.tokenCount,visibleTokens:visibleIndices.length}}
export function detectTesseract7(payload,build){const parsed=parseTesseract7Visible(payload,build);return{build,container:null,found:[],tesseract7:parsed}}
