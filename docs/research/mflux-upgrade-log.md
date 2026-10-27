# mflux upgrade log

Newest first. The procedure is in [mflux-upgrade.md](../mflux-upgrade.md). mflux runs on the Apple Silicon Mac only.

## 0.24.0 — Mac, 2026-10-27

Upgraded the Mac from 0.23.0 with `uv tool install --upgrade --managed-python --python 3.14 mflux` (no Pillow pin). It installed mflux 0.24.0, Pillow 13.0.0 (from 12.3.0), opencv-python 5.0.0.93 (from 4.14.0.94), transformers 5.21.0 (from 5.20.1) and python-dateutil 3.0.0, on Python 3.14.10; 50 commands, among them the new `mflux-generate-fibo2`, `-fibo2-edit`, `-anima`, `-iris`, `-moss-image` and `mflux-check`. Commands start with Pillow 13, so the 0.23 import failure is gone.

**Smoke check (Mac, M5 Pro, 48 GB):** `mflux-generate-flux2 --model flux2-klein-4b`, 512², 4 steps, seed 42, `--low-ram`, cached weights, nothing fetched: wrote a picture, 8.0 s wall clock, peak MLX memory 8.73 GB (0.23 on 2026-10-17: 10.1 s, 10.2 GB, measured differently, so not a comparison). Not tested: the app's own renders through the server, every other Image Model, the edit and upscale commands, and the new flags. Windows has no mflux.

Release review: reviewed from the [release notes](https://github.com/mflux-community/mflux/releases) as summarised by a page fetch, not read line by line, and not compared yet with the flags in `server/images/mflux/`. 

### Install changes — decide before upgrading

- **Python 3.11 or newer** (3.10 dropped). The Mac's tool uses managed Python 3.14, so no change.
- **Pillow 13.0.0 or newer is required** (it fixes a heap overflow in FlashPix JPEG decoding), and "commands no longer crash at startup with Pillow 13" is listed as fixed. This is the problem behind the `--with 'pillow<13'` pin of 2026-10-17 (below). The pin conflicts with 0.24, so the install dropped it (see above). Whether `uv tool upgrade` alone would have tripped over the old pin was not checked.
- opencv-python 5 is now allowed.

### Relevant to existing findings (unverified until tried)

- **Qwen-Image 2.1 `--small-text-encoder`** (a ~2.1 GB download instead of 17.5 GB). Related to the Turbo text encoder stored twice ([open-threads.md](../open-threads.md)) and to the Qwen disk cost in [models.md](../models.md). Whether it changes output, and whether it works with the Turbo and Viggle variants, is unchecked. FLUX.2 also gets `--small-text-encoder` and `--small-decoder`.
- **VAE decoding in row strips** for several models (about 1.6 GB at 1024²; `--vae-full-precision` restores the old behaviour). Peak memory in models.md may change for those models. `--vae-tiling` no longer shifts colours.
- **FIBO 2** (`mflux-generate-fibo2`, `-edit`; Dev and Edit Turbo, with `--expand-prompt`, `--cfg-end`, `--step-cache-ratio`). The same models were added to the app on ComfyUI on 2026-10-27, CC BY-NC. See open-threads.md ("FIBO 2.0 as a ComfyUI Image Model").
- **MOSS-Image** (`mflux-generate-moss-image`, `--model moss-image-base`, `--lora`), an Image Model on ComfyUI since 2026-10-19.
- Fixes: saved Krea 2 checkpoints load by repo id; FLUX.2 klein `--config-from-metadata` rejects a non-boolean `small_text_encoder`; Z-Image ControlNet mlsd no longer crashes on OpenCV 5.
- `mflux-check` validates local model packages without downloads (`--fix` restores missing shards from a local cache); `mflux-save --hf-symlink`.
- No CLI renames listed.

### Candidates, not selected

- **Anima** (circlestone-labs; `mflux-generate-anima`, Turbo, Aesthetic and Base) and **Iris-3B** (`mflux-generate-iris`, Turbo by default and a base) are new. Sizes, licenses and fit on the 48 GB Mac are unknown; to be looked up before offering them.

### Z-Image Turbo's repo moved to mflux-community (Mac, 2026-10-27)

The app loaded Z-Image Turbo from `filipstrand/Z-Image-Turbo-mflux-4bit`, which still exists and still works on 0.24 (mflux's own README still names it). mflux-community now has `z-image-turbo-mflux-q3` to `-q6`, `-q8` and `-bf16` (Apache-2.0); `-q4` is the same size (5.9 GB), but a re-saved copy: 20 of the 21 files differ by hash. Rendered the same prompt (two people at a table, rain on the window), 832×1216, 9 steps, seed 42, `--low-ram`, float16: both peak at 4.40 GB; old 32 s from cache, new 137 s including the 5.9 GB download. Side by side the pictures are the same scene, composition and faces; the mean difference is 1.3 of 255 (maximum 181). One prompt and one seed. The app now uses `mflux-community/z-image-turbo-mflux-q4`; the old copy was removed from the Mac's Hugging Face cache (`hf cache rm`, 5.9 GB freed).

### Still to do

Render through the app with the Image Models already cached, and compare the flags with `server/images/mflux/` (the release review above was not compared with them yet). Anima, Iris and the new flags are untried.

## 0.23.0 — Mac, 2026-10-17

Upgraded from 0.22 with `uv tool upgrade mflux`. That pulled in Pillow 13.0.0, which fails to import on uv's Python 3.14.4 (`cannot import name '_IntegralLike' from 'numbers'`), so every mflux command failed. Reinstalled with `uv tool install --managed-python --python 3.14 mflux --with 'pillow<13'` (Pillow 12.3.0); FLUX.2 Klein 4B then rendered again: 512², 4 steps, float16, 10.1 s including the load, 10.2 GB peak. 0.23 pins each built-in model to a Hugging Face commit; Klein 4B's cache needed nothing fetched.

New in 0.23, which the app uses: FLUX.3 Klein and Qwen-Image 2.1 Turbo as mflux Image Models (measured in [models.md](../models.md#mflux-023-flux3-klein-and-qwen-image-21-turbo-on-the-mac-2026-10-17)). Not used yet: `mflux-generate-flux3-edit`, FLUX.3 LoRAs, and the Z-Image and Krea 2 ControlNets ([open-threads.md](../open-threads.md)).

Moved here from models.md on 2026-10-27; the earlier releases were not logged at the time.

## Earlier releases (backfilled from models.md and open-threads.md)

- **0.22** (Mac, 2026-10-09 to 2026-10-14): on its own, a little faster than 0.21 on Qwen-Image 2.1 (1024², M5 Pro: 93 s against 98–100 s; with the step cache 60 s against 66 s) and a 3 GB lower peak (36 GB against 39 GB); the release notes' ~24 GB to ~13 GB was at 512² from 8-bit weights. The `--compute-precision float16` and lazy-loading measurements are in [models.md](../models.md#qwen-image-21-on-mflux-022-float16---low-ram-and-the-saved-copy-2026-10-09). Also: Ming-Image 0.1 Design, Ideogram 4 (gated), FIBO 1.5 and Z-Image base became Image Models; `mflux-generate-qwen-2.1-controlnet` noted. Ideogram 4 needs JSON captions and returned a safety-filter black picture on a plain tavern prompt.
- **0.21** (Mac, 2026-10-04 to 2026-10-06): on its own only 2–5% faster than 0.20 on Qwen-Image 2.1 (1024², 8-bit copy, 25 steps: 98–100 s against 103 s, the same picture), so the release notes' "~1.8× faster" was mostly the step cache. The saved copy made by 0.20 loaded in 0.21 (the app saved a fresh one, named for 0.21). The step cache and turbo LoRA measurements are in [models.md](../models.md#qwen-image-21-on-mflux-021-the-step-cache-and-viggles-turbo-lora-2026-10-04). Also: Qwen-Image 2.1, its step cache (`--step-cache-ratio`) and Viggle's turbo LoRA; `mflux-generate-qwen-2.1-edit` with up to ten reference images and `--auto-mask`.
- **0.20**: the version the early image-to-3d research used (Depth Pro in MLX, Qwen-Image-Edit-2509, Kontext, FLUX.2 edit).
