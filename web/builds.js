const VIOLET_TOKENS = Array.from("∀∂∃∅∆∇∈∉∋∏∑−∓∗∘∙√∝∞∠∧∨∩∪∫∴∵∼≈≠≡≤≥⊂⊃⊄⊆⊇⊕⊗⊙⊥⋄⋆⋈⋮⋯⟂⚡☄★✦✧❖✺✹☯☢☣⚙♜♞♠♦");

const SAPPHIRE_TOKENS = [
  "4","u","─","=","h","f","o","?","🌀","e","9","❄","+","v","x","▓",
  "w","6","■","0","🌟","5","╱","3","$","7","d","!","⭐","䷩","j","2",
  "z","8","#","a","m","g","䷀","b","c","q","k","┃","╋","p","r","s",
  "t","y","l","n","%","*","@","^","~","|","◆","●","⠁","⠛","🔥","🎲"
];

const PARALLEL_TOKENS = Array.from({length: 64}, (_, i) =>
  String.fromCodePoint(0x13000 + i) + String.fromCodePoint(0x1D300 + i) + String.fromCodePoint(0x1F700 + i)
);

function makeTesseractTokens() {
  const base = 0x0300;
  const span = 0x70;
  return Array.from({length: 64}, (_, value) => {
    const cps = [base + value];
    for (let j = 1; j < 32; j++) {
      const mixed = (value * 37 + j * 53 + ((value ^ j) * 11) + (value * j * 3)) % span;
      cps.push(base + mixed);
    }
    return String.fromCodePoint(...cps);
  });
}

const TESSERACT_TOKENS = makeTesseractTokens();

const TESSERACT7_BASES = Array.from("!@#$%&*+=?/~^:;<>[]{}()_-.,|");
const TESSERACT7_MARKS = [
  0x30d,0x30e,0x304,0x305,0x33f,0x311,0x306,0x310,0x352,0x357,0x351,0x307,0x308,0x30a,0x342,0x313,
  0x34a,0x34b,0x34c,0x303,0x302,0x30c,0x350,0x300,0x301,0x30b,0x30f,0x312,0x314,0x33d,0x309,
  0x363,0x364,0x365,0x366,0x367,0x368,0x369,0x36a,0x36b,0x36c,0x36d,0x36e,0x36f,0x33e,0x35b,0x346,0x31a,
  0x315,0x31b,0x340,0x341,0x358,0x321,0x322,0x327,0x328,0x334,0x335,0x336,0x35c,0x35d,0x35e,0x35f,0x360,
  0x362,0x338,0x337,0x316,0x317,0x318,0x319,0x31c,0x31d,0x31e,0x31f,0x320,0x324,0x325,0x326,0x329,0x32a,
  0x32b,0x32c,0x32d,0x32e,0x32f,0x330,0x331,0x332,0x333,0x339,0x33a,0x33b,0x33c,0x345,0x347,0x348,0x349,
  0x34d,0x34e,0x353,0x354,0x355,0x356,0x359,0x35a,0x20d0,0x20d1,0x20d2,0x20d3,0x20d4,0x20d5,0x20d6,
  0x20d7,0x20d8,0x20d9,0x20da,0x20db,0x20dc,0x20dd,0x20de,0x20df,0x20e0,0x20e1,0x20e2,0x20e4
];

function makeTesseract7Tokens() {
  const tokens = Array.from({length: 64}, (_, value) => {
    const marks = [];
    for (let j = 0; j < 15; j++) {
      const index = (value * 29 + j * 17 + ((value ^ j) * 7) + j * j) % TESSERACT7_MARKS.length;
      marks.push(TESSERACT7_MARKS[index]);
    }
    return TESSERACT7_BASES[value % TESSERACT7_BASES.length] + String.fromCodePoint(...marks);
  });
  if (new Set(tokens).size !== 64 || new Set(tokens.map(t => Array.from(t).length)).size !== 1) {
    throw new Error("Tesseract 7 token table is invalid.");
  }
  return tokens;
}

const TESSERACT7_TOKENS = makeTesseract7Tokens();

export const BUILDS = {
  "Violet 1": {
    key: "Violet 1", family: "Violet", version: 1, magic: "SGV1", tokens: VIOLET_TOKENS,
    compression: "deflate", junkRatio: 0.35, padBlock: 128, quoteDensity: 95, wrapTokens: 96,
    iterations: 240000,
    summary: "Lean operator-heavy output with mathematical symbols, glyphs and emoji."
  },
  "Sapphire 3": {
    key: "Sapphire 3", family: "Sapphire", version: 3, magic: "SGS3", tokens: SAPPHIRE_TOKENS,
    compression: "adaptive-deflate", junkRatio: 0.75, padBlock: 256, quoteDensity: 150, wrapTokens: 0,
    iterations: 420000,
    summary: "Balanced mixed-symbol build with the classic Sagittarius hostile-text appearance."
  },
  "Parallel 5": {
    key: "Parallel 5", family: "Parallel", version: 5, magic: "SGP5", tokens: PARALLEL_TOKENS,
    compression: "none", junkRatio: 1.50, padBlock: 512, quoteDensity: 70, wrapTokens: 30,
    iterations: 320000,
    summary: "Oversized rare-Unicode output: three supplementary-plane codepoints per token."
  },
  "Tesseract 6": {
    key: "Tesseract 6", family: "Tesseract", version: 6, magic: "SGT6", tokens: TESSERACT_TOKENS,
    compression: "none", junkRatio: 1.50, padBlock: 512, quoteDensity: 0, wrapTokens: 0,
    iterations: 320000, tesseract: true,
    summary: "Brutal all-Unicode maze: 32-codepoint glyph stacks, key-derived rounds and indistinguishable junk corridors."
  },
  "Tesseract 7": {
    key: "Tesseract 7", family: "Tesseract", version: 7, magic: "SGT7", tokens: TESSERACT7_TOKENS,
    compression: "adaptive-deflate", junkRatio: 0.35, padBlock: 256, quoteDensity: 0, wrapTokens: 0,
    iterations: 600000, tesseract: true, tesseract7: true, cipher: "ChaCha20-Poly1305",
    summary: "ChaCha-driven symbol maze: adaptive compression, corrupted non-alphanumeric glyph stacks and deeper key-derived corridors."
  }
};
