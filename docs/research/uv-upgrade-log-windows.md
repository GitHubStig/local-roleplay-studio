# uv upgrade log: Windows PC

## 2026-10-27 — uv 0.13.6

On the Windows PC with an RTX 4070 12 GB, updated uv from 0.13.4 to 0.13.6, then upgraded managed Python 3.14 from 3.14.8 to 3.14.10.

All five checked-in Python script lockfiles passed `uv lock --script … --check` with uv 0.13.6.

With dependencies and weights already cached, the style embedder made one image's pair of 768-dimensional embeddings and one 768-dimensional text embedding in 14.5 s (13.6 s load, 0.9 s embed). SHARP made one 1,179,648-splat scene in 23.4 s (13.6 s load, 9.8 s make), and TripoSplat made one 524,288-splat figure in 47.6 s (16.0 s load, 31.6 s make), all from public benchmark images. These are smoke runs, not a full test of the optional scripts or their download paths.
