---
status: accepted
---

# LiTo makes figures on the Mac only

LiTo, one of the two figure makers (`FigureMaker`), runs on the Mac through mlx-spatial, an MLX port. On Windows it's off, as worked out at startup (`server/features.ts`), and TripoSplat makes figures there instead (on the RTX 4070, ~52 s a figure). Decided with the owner on 2026-11-01 not to bring LiTo to Windows, closing the thread parked since 2026-10-07.

- **Apple's own code doesn't run on Windows.** [apple/ml-lito](https://github.com/apple/ml-lito) declares only `linux-64` (NVIDIA, built for A100, H100 and B200) and `osx-arm64` (on MLX), and its Linux setup compiles nvdiffrast, spconv, TRELLIS, xformers or flash-attention, gsplat and torchsparse ([research/windows.md](../research/windows.md), "3D on Windows").
- **The only way would be WSL2**, not installed on the PC: either mlx-spatial on MLX's CUDA backend (unverified that its LiTo runs there) or Apple's PyTorch code (tens of GB and long builds, and whether it fits 12 GB is unknown), with the app running it through `wsl`. A lot of setup and a second runtime on the PC for a figure TripoSplat already makes.

## Considered Options

- **LiTo through WSL2**, either way above. Not tried, for the cost above.

## Consequences

The PC makes figures with TripoSplat only; the Mac with either. A Session's LiTo figures made on the Mac still open on the PC, as made files play wherever the feature is off. Nothing in the code changes. Revisit if Apple or mlx-spatial ship a build that runs on Windows.
