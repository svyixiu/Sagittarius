# Sagittarius

Sagittarius is the program family. Each build type follows a different transformation path and output design while preserving the same recurring quote signature.

## Installed builds

| Build | Path | Compression | Junk profile | Visible grammar |
| --- | --- | --- | --- | --- |
| Sagittarius Violet 1 | Lean | Deflate-first | Low | operators, mathematical Unicode, glyphs, emoji |
| Sagittarius Sapphire 3 | Balanced | Adaptive | Medium | ASCII, box glyphs, operators, emoji |
| Sagittarius Parallel 5 | Oversized | None | Heavy | three supplementary-plane Unicode codepoints per token |

Naming convention: **`[Program] [Build Type] [Build Version]`**.

## Web

The static browser application is in [`web/`](./web). It supports:

- build selection;
- password-based encryption;
- automatic build detection during decryption;
- strict, taunt, and gibberish wrong-password behaviors;
- the shared Sagittarius quote pool in every build;
- local-only browser processing;
- authenticated quote-layout verification.

The web engine uses browser-native **AES-256-GCM**, **PBKDF2-SHA-256**, and **HKDF-SHA-256**. GitHub Pages only serves the files; passwords and plaintext are not sent to the repository or a Sagittarius server.

> The Web Engine 1 container format is separate from the Python/scrypt container format. Web payloads decrypt in the web implementation; Python payloads decrypt in the Python implementation.

## Python / desktop

The complete Python/reference source bundle is in [`python/Sagittarius-Python-Source.zip`](./python/Sagittarius-Python-Source.zip). It contains the three-build package, CLI, tests, compatibility facade, and project README.

```bash
unzip Sagittarius-Python-Source.zip
python -m pip install -r requirements.txt
python test_all.py
```

## GitHub Pages

The workflow at [`.github/workflows/pages.yml`](./.github/workflows/pages.yml) deploys the `web/` directory using GitHub's official Pages actions.

If Pages has never been enabled for this repository, open **Settings → Pages → Build and deployment → Source → GitHub Actions** once. After that, pushes affecting `web/` deploy automatically.
