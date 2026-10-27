# uv upgrade log: Apple Silicon Mac

## 2026-10-27 — uv 0.13.6

Updated the standalone uv installation at `~/.local/bin/uv` from 0.13.5 to 0.13.6 with `uv self update 0.13.6`. The [release notes](https://github.com/astral-sh/uv/releases/tag/0.13.6) list CPython 3.14.10 and 3.15.2 builds. The installed managed Python 3.14 was 3.14.9, so it was upgraded to 3.14.10 with `uv python upgrade 3.14`; managed Python 3.13 remains installed for LiTo.

All five checked-in Python script locks passed `uv lock --script <script> --check` with uv 0.13.6. No script metadata or lockfile changes were needed.

All five scripts' `--help` checks passed offline: voice, SHARP, TripoSplat, and style scoring on Python 3.14; LiTo on Python 3.13. With cached dependencies and weights, SHARP ran against the public `docs/bench/backends/seed7-mac.webp` image and wrote a non-empty 63 MB scene with 1,179,648 splats (5.0 s load, 8.7 s make). Style scoring processed that image and a caption, returned both embeddings, and completed in 5.3 s (4.6 s load, 0.7 s embed).

TripoSplat, LiTo, and voice inference were not run; their real inference paths remain unverified on this Mac.
