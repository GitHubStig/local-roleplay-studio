# float16, `--low-ram` and the saved copy on mflux 0.22 (2026-10-09)

Qwen-Image 2.1 through mflux 0.22 on the Mac (M5 Pro, 48 GB), 1024×1024, seed 7, Frame 9 of the
Kael tavern (gemma4's prose prompt from [art-tags](../art-tags/prompts/gemma4-31b.json)), the
app's settings: the saved 8-bit copy, 25 steps. Each run once: as it is, with
`--compute-precision float16` and with `--low-ram`; then the step cache, Fast and the original
weights with `-q 8` the same three ways, and FLUX.2 Klein 4B at 832×1216 with and without float16. Last, every other Image Model at
1024×1024 with and without `--low-ram`.

The results and what they mean are in [models.md](../../models.md), "Qwen-Image 2.1 on mflux
0.22". `precision.sh` renders it again into `out/` (it saves the 8-bit copy first, as the app
would, if this mflux hasn't one yet); `out/results.txt` lists time and peak memory per run.
