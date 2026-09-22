# Sagittarius Python Source

The full desktop/reference implementation is packaged as [`Sagittarius-Python-Source.zip`](./Sagittarius-Python-Source.zip).

It contains the three installed build types:

- Sagittarius Violet 1
- Sagittarius Sapphire 3
- Sagittarius Parallel 5

The Python build uses the original scrypt/HKDF/AES-GCM implementation and is intentionally a separate container format from the browser-native GitHub Pages engine.

## Run

```bash
python -m pip install -r requirements.txt
python test_all.py
python demo.py
```

The archive includes the CLI, tests, compatibility facade, and the `sagittarius/` package source.
