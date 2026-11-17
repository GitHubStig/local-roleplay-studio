# uv upgrade log: Windows PC

## 2026-10-27 — uv 0.13.6

On the Windows PC with an RTX 4070 12 GB, updated uv from 0.13.4 to 0.13.6, then upgraded managed Python 3.14 from 3.14.8 to 3.14.10.

All five checked-in Python script lockfiles passed `uv lock --script … --check` with uv 0.13.6.

With dependencies and weights already cached, the style embedder made one image's pair of 768-dimensional embeddings and one 768-dimensional text embedding in 14.5 s (13.6 s load, 0.9 s embed). SHARP made one 1,179,648-splat scene in 23.4 s (13.6 s load, 9.8 s make), and TripoSplat made one 524,288-splat figure in 47.6 s (16.0 s load, 31.6 s make), all from public benchmark images. These are smoke runs, not a full test of the optional scripts or their download paths.

## 2026-11-17 — uv 0.13.8

On the Windows PC with an RTX 4070 12 GB, updated uv from 0.13.7 to 0.13.8 (0.13.7 had been installed without an entry here). `uv python upgrade 3.14` reinstalled 3.14.10 as 0.13.8's rebuilt managed build (pip 26.3, zlib 1.4, Expat 2.10.0); 3.13.18 stays. Removed the leftover 3.14.8 patch, after checking that no `pyvenv.cfg` under the user folder or uv's folder pointed at it.

All five checked-in Python script lockfiles passed `uv lock --script … --check` with uv 0.13.8, and no lockfile or script changed. `--help` passed for SHARP, TripoSplat and style scoring.

With dependencies and weights already cached, SHARP made one 1,179,648-splat scene from `docs/bench/backends/seed7-mac.webp` (13.8 s load, 10.4 s make), TripoSplat made one 524,288-splat figure from `docs/bench/reference-portraits/blink-6.jpg` (15.9 s load, 32.2 s make), and the style embedder returned CSD and CLIP vectors for that scene and one caption (11.9 s load, 0.6 s embed). SHARP, the first to run after the Python rebuild, took 41.7 s end to end against 24.2 s inside the script; the extra time wasn't broken down. These are smoke runs, not a full test of the scripts or their download paths.
