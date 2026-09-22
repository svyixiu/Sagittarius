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
  }
};

