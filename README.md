# Sagittarius

Sagittarius is a multi-build authenticated encryption / hostile-transport experiment. The program name stays constant; the second word identifies a build path and the number identifies that path's version.

## Installed builds

| Build | Path | Compression | Junk profile | Visible grammar |
| --- | --- | --- | --- | --- |
| Sagittarius Violet 1 | Lean | Deflate-first | Low | operators, mathematical Unicode, glyphs, emoji |
| Sagittarius Sapphire 3 | Balanced | Adaptive | Medium | ASCII, box glyphs, operators, emoji |
| Sagittarius Parallel 5 | Oversized | None | Heavy | three supplementary-plane Unicode codepoints per token |
| Sagittarius Tesseract 6 | Maze | None | Extreme | 32-codepoint combining stacks, key-derived rounds, junk corridors, giant prologue |\n| Sagittarius Tesseract 7 | ChaCha Maze | Adaptive Deflate | Extreme | non-alphanumeric symbol bases with combining corruption, 28–56 key-derived rounds, junk corridors, giant prologue |

Naming convention: **`[Program] [Build Type] [Build Version]`**.

## Local CLI

Sagittarius is intended to run as a local web application first.

On Linux, macOS, WSL, or Git Bash:

```bash
./sagittarius
```

On Windows Command Prompt or PowerShell:

```bat
sagittarius.cmd
```

The launcher uses Python's standard library only. It binds to **`127.0.0.1:7376`** by default, serves the files in `web/`, opens the local UI in the default browser, and stays attached to the terminal until you press **Ctrl+C**.

Useful options:

```bash
./sagittarius --port 8080
./sagittarius --no-open
./sagittarius --quiet
./sagittarius --host 127.0.0.1 --port 7376 --strict-port
```

If the default port is already occupied, Sagittarius automatically tries the next available port unless `--strict-port` is supplied.

The HTTP server does **not** perform encryption or decryption. It only serves the local static interface. Plaintext, passwords, ciphertext and file contents remain in the browser-side application.

## Local web interface

The UI lives in [`web/`](./web) and is styled around GitHub's dark repository interface: repository header, tab navigation, bordered panels, muted metadata, compact controls and monospace editors.

It supports:

- all five installed builds;
- password-based encryption and automatic build detection during decryption;
- strict, taunt and gibberish wrong-password behavior;
- local text/code file upload;
- complete output download and clipboard copy;
- bounded on-screen previews for very large ciphertext while preserving the full output in memory;
- Web Engine 1 compatibility for existing Violet 1, Sapphire 3 and Parallel 5 browser payloads.

The web engine uses **PBKDF2-SHA-256 → HKDF-SHA-256** for browser password derivation. Violet 1, Sapphire 3, Parallel 5 and Tesseract 6 use browser-native **AES-256-GCM**. Tesseract 7 uses an RFC 8439-compatible **ChaCha20-Poly1305** AEAD implementation. Tesseract maze transforms are reversible presentation/obfuscation layers around authenticated ciphertext; they are not counted as additional cryptographic key strength.

> The browser container and the Python/scrypt reference container are separate formats. Browser payloads decrypt in the browser implementation; Python payloads decrypt in the Python implementation.

## Tesseract 6 in the browser

Tesseract has one large Unicode confidence-breaker prologue instead of the ordinary Sagittarius quote weaving. Its real container sextets are state-mixed, passed through 20–40 key-derived permutation rounds, surrounded by indistinguishable junk corridors, and finally rendered as 32-codepoint combining-mark stacks. The browser caps Tesseract plaintext at 96 KiB because the visible representation can expand into tens of megabytes.

## Tesseract 7 in the browser

Tesseract 7 keeps the confidence-breaker concept but changes both the cryptographic container and visible grammar. Plaintext is UTF-8 encoded, Deflate is tried and retained only when it meaningfully reduces the payload, and the resulting record is authenticated and encrypted with ChaCha20-Poly1305 using a fresh 96-bit nonce. The password-derived root is domain-separated into the ChaCha key and the maze seed.

The visible transport begins with a large fixed prologue, then a bootstrap and a reversible key-derived maze. Real Base64 sextets are state-mixed, passed through **28–56** block permutation rounds, surrounded by deterministic-position random junk corridors, and rendered as **16-codepoint clusters**. Each cluster begins with a non-alphanumeric symbol and carries fifteen combining/overlay/enclosing marks. The browser caps Tesseract 7 plaintext at 192 KiB because the visible representation intentionally expands heavily.

The Tesseract 7 ChaCha20-Poly1305 core is validated against the RFC 8439 AEAD known-answer vector. Existing Tesseract 6 payloads remain supported unchanged.

## Python / desktop reference

The Python/reference bundle remains under [`python/`](./python). It uses scrypt/HKDF/AES-GCM and is the reference implementation for the desktop container family.

## Optional static hosting

The same `web/` directory can still be hosted by GitHub Pages or Vercel, but hosted deployment is secondary to the local CLI workflow.

- **GitHub Pages:** `.github/workflows/pages.yml`
- **Vercel:** `vercel.json`
