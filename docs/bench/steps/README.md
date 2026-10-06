# How a picture forms, and how many steps it needs (2026-10-06)

Qwen-Image 2.1 through mflux 0.21, on the saved 8-bit copy, 1024×1024, seed 7, no step cache, Frame
9 of the Kael tavern (gemma4's prose prompt from [art-tags](../art-tags/prompts/gemma4-31b.json)):
Kael at the foot of the stairs pointing up at Elara on the balcony.

## How it forms

mflux's `--stepwise-image-output-dir` saves the picture at every denoising step.

- **[strip-40.webp](strip-40.webp)**: nine steps of a 40-step run. **[grid-40.webp](grid-40.webp)**: all
  of them.
- **[strip-10.webp](strip-10.webp)**: every step of a 10-step run.

For about three-quarters of the run the saved step is purple and green static (steps 1–30 of 40):
mflux decodes the half-finished, still-noisy image as it stands. The picture comes through grainy
around step 34 and sharpens over the last six. It's a good picture of how diffusion works (the
image comes out of the noise only at the end), but not of watching a picture form, which would
need each step's *guess* at the final picture instead (what ComfyUI's previews show), and mflux
has no option for that. Saving every step also costs: 63 s became 140 s on a 25-step run with the
step cache, and the 40-step run took 277 s against about 136 s.

## How many steps

A step's picture in a 40-step run isn't what a shorter run makes (the noise comes off on a
different schedule), so each count was rendered on its own. **[counts.webp](counts.webp)**: 10, 15,
20, 25, 30 and 40 steps, whole and with close-ups of both faces.

| Steps | Time | Change from 40 (mean per pixel, 0–255) | SSIM against 40 | Change from the count before |
|---|---|---|---|---|
| 10 | ~42 s | 18.7 | 0.40 | |
| 15 | 58 s | 14.4 | 0.61 | 5.4 |
| 20 | 78 s | 10.2 | 0.77 | 6.5 |
| 25 | 94 s | 5.5 | 0.90 | 6.1 |
| 30 | 110 s | 3.6 | 0.94 | 2.7 |
| 40 | ~136 s | 0 | 1 | 3.6 |

About 3.2 s a step plus ~10 s to load (10 and 40 estimated the same way: those two runs saved
every step, 72 s and 277 s). SSIM is a standard measure of how alike two pictures look (1 is the
same).

- **10–15 steps:** murky, under-lit and soft; the faces generic.
- **20:** bright and detailed, but not settled: Elara has a different face from the one she has at
  25 and above.
- **25: settled.** Both faces, the light and the composition match 30 and 40; the change from 25 to
  30 (2.7) is less than half the change into 25 (6.1).
- **30 and 40:** finer texture in the skin and the brushstrokes only, for ~16 s per 5 steps.

**25 steps is the default for Qwen-Image 2.1, and it holds at 1024² too** (it was picked at
512 px). 20 is the one for speed when a face can come out a little differently. One picture and one
seed: enough to see where it settles, not to split 25 from 30 for every scene.

`steps.sh` renders it all again into `out/`; `analyse.py` (run inside `out/`) makes the strips, the
comparison and the figures.
