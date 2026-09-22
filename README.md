# Sagittarius

Sagittarius is a multi-build authenticated encryption / hostile-transport experiment. The program name stays constant; the second word identifies a build path and the number identifies that path's version.

## Installed builds

| Build | Path | Compression | Junk profile | Visible grammar |
| --- | --- | --- | --- | --- |
| Sagittarius Violet 1 | Lean | Deflate-first | Low | operators, mathematical Unicode, glyphs, emoji |
| Sagittarius Sapphire 3 | Balanced | Adaptive | Medium | ASCII, box glyphs, operators, emoji |
| Sagittarius Parallel 5 | Oversized | None | Heavy | three supplementary-plane Unicode codepoints per token |
| Sagittarius Tesseract 6 | Maze | None | Extreme | 32-codepoint combining stacks, key-derived rounds, junk corridors, giant prologue |

Naming convention: **`[Program] [Build Type] [Build Version]`**.

## Web Engine 2

The browser application lives in [`web/`](./web) and is deployable as a static Vercel or GitHub Pages site. It supports:

- all four installed builds;
- password-based encryption and automatic build detection during decryption;
- strict, taunt and gibberish wrong-password behavior;
- local text/code file upload;
- complete output download and clipboard copy;
- bounded on-screen previews for very large ciphertext while preserving the full output in memory;
- Web Engine 1 compatibility for existing Violet 1, Sapphire 3 and Parallel 5 browser payloads.

All browser cryptography runs locally. Hosting only serves static HTML/CSS/JavaScript; plaintext, ciphertext and passwords are not submitted to Sagittarius or Vercel.

The web engine uses browser-native **AES-256-GCM**, **PBKDF2-SHA-256**, and **HKDF-SHA-256**. Tesseract adds a password-derived reversible maze transport on top of the authenticated container; that maze is obfuscation/presentation rather than additional cryptographic key strength.

> The browser container and the Python/scrypt reference container are separate formats. Browser payloads decrypt in the browser implementation; Python payloads decrypt in the Python implementation.

## Tesseract 6 in the browser

Tesseract has one large Unicode confidence-breaker prologue instead of the ordinary Sagittarius quote weaving. Its real container sextets are state-mixed, passed through 20–40 key-derived permutation rounds, surrounded by indistinguishable junk corridors, and finally rendered as 32-codepoint combining-mark stacks. The browser caps Tesseract plaintext at 96 KiB because the visible representation can expand into tens of megabytes.

## Python / desktop

The Python/reference bundle remains under [`python/`](./python). It uses scrypt/HKDF/AES-GCM and is the reference implementation for the desktop container family.

## Deployment

- **GitHub Pages:** `.github/workflows/pages.yml` publishes `web/` automatically.
- **Vercel:** `vercel.json` rewrites the production root to the same static `web/` application and adds restrictive security headers.
