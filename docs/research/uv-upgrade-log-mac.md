# uv upgrade log: Apple Silicon Mac

## 2026-11-17 — uv 0.13.8, then 0.13.9

On the Mac (Apple silicon, 48 GB), updated the standalone uv at `~/.local/bin/uv` from 0.13.7 to 0.13.8 with `uv self update 0.13.8` (0.13.7 had been installed without an entry here), then to 0.13.9, released the same day, with `uv self update 0.13.9`.

- **0.13.8** ([release notes](https://github.com/astral-sh/uv/releases/tag/0.13.8)) rebuilds the managed CPython builds with pip 26.3, zlib 1.4 and Expat 2.10.0, and changes nothing about script metadata, lockfiles or index resolution that these scripts use. `uv python upgrade 3.14 3.13` reinstalled 3.14.10 as the rebuilt build and moved 3.13 from 3.13.17 to 3.13.18 (for LiTo). Removed the leftover 3.13.17, after checking that no `pyvenv.cfg` under the home folder pointed at it.
- **0.13.9** ([release notes](https://github.com/astral-sh/uv/releases/tag/0.13.9)) brings no new managed Python builds, so Python stays at 3.14.10 and 3.13.18. It writes lockfiles more compactly when markers repeat (#23184) and fixes `uv lock --locked` on equivalent platform markers written differently (#23185).

On each version, all five checked-in Python script lockfiles passed `uv lock --script … --check`, and no lockfile or script changed (none was rewritten despite #23184). `--help` passed for all five: voice, SHARP, TripoSplat and style scoring on 3.14, LiTo on 3.13.

With dependencies and weights already cached, SHARP made one 1,179,648-splat scene (66 MB) from `docs/bench/backends/seed7-mac.webp` on each version (4.7 s load and 6.3 s make on 0.13.8, 4.5 s and 6.4 s on 0.13.9), and the style embedder returned its result for that image and one caption (4.9 s load, 0.3 s embed on both). TripoSplat, LiTo and voice inference were not run, so their real inference paths are still unverified on this Mac.

## 2026-10-27 — uv 0.13.6

Updated the standalone uv installation at `~/.local/bin/uv` from 0.13.5 to 0.13.6 with `uv self update 0.13.6`. The [release notes](https://github.com/astral-sh/uv/releases/tag/0.13.6) list CPython 3.14.10 and 3.15.2 builds. The installed managed Python 3.14 was 3.14.9, so it was upgraded to 3.14.10 with `uv python upgrade 3.14`; managed Python 3.13 remains installed for LiTo.

All five checked-in Python script locks passed `uv lock --script <script> --check` with uv 0.13.6. No script metadata or lockfile changes were needed.

All five scripts' `--help` checks passed offline: voice, SHARP, TripoSplat, and style scoring on Python 3.14; LiTo on Python 3.13. With cached dependencies and weights, SHARP ran against the public `docs/bench/backends/seed7-mac.webp` image and wrote a non-empty 63 MB scene with 1,179,648 splats (5.0 s load, 8.7 s make). Style scoring processed that image and a caption, returned both embeddings, and completed in 5.3 s (4.6 s load, 0.7 s embed).

TripoSplat, LiTo, and voice inference were not run; their real inference paths remain unverified on this Mac.
