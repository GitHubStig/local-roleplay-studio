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

The app loaded Z-Image Turbo from `filipstrand/Z-Image-Turbo-mflux-4bit`, which still exists and still works on 0.24 (mflux's own README still names it). mflux-community now has `z-image-turbo-mflux-q3` to `-q6`, `-q8` and `-bf16` (Apache-2.0); `-q4` is the same size (5.9 GB), but a re-saved copy: 20 of the 21 files differ by hash. Rendered the same prompt (two people at a table, rain on the window), 832×1216, 9 steps, seed 42, `--low-ram`, float16: both peak at 4.40 GB; 32 s with the old repo and 30 s with the new, each from cache (wall clock, including the model load; the 5.9 GB download was not timed apart). Side by side the pictures are the same scene, composition and faces; the mean difference is 1.3 of 255 (maximum 181). One prompt and one seed. The app now uses `mflux-community/z-image-turbo-mflux-q4`; the old copy was removed from the Mac's Hugging Face cache (`hf cache rm`, 5.9 GB freed).

### FLUX.3 Klein's repo moved to mflux-community (Mac, 2026-10-27)

The app ran FLUX.3 Klein through mflux's alias `flux3-image-klein`, which 0.24 still resolves to Black Forest Labs' gated repo (20.3 GB; FLUX Kommunity License, so `hf auth login` first). mflux-community now publishes ungated copies (`flux-3-image-klein-mflux-bf16`, 18.5 GB, and `-q8`, `-q6`, `-q4`, 9.9 to 5.3 GB; the license is still "other"). Rendered the same prompt (two people at a table, rain on the window), 832×1216, 16 steps, seed 42, `--low-ram`, float16, from each: the pictures are byte-identical (mean difference 0.0), both peak at 10.93 GB; 40.6 s from the BFL copy and 40 s from the community copy, each from cache (wall clock, including the model load; the 18.5 GB download was not timed apart). The app now uses `mflux-community/flux-3-image-klein-mflux-bf16` with `--base-model flux3-image-klein`, so a fresh install needs no Hugging Face sign-in for it. The quantised copies were not tried. The BFL copy was removed from the Mac's Hugging Face cache (`hf cache rm`, 20.3 GB freed).

### Krea 2's repo moved to mflux-community (Mac, 2026-10-27)

Krea 2 (`krea-2` and `krea-2-lora`) ran through mflux's alias `krea-2`, which 0.24 still resolves to Krea's gated repo `krea/Krea-2-Turbo` (35.7 GB cached; license "other"). mflux-community has ungated copies: `krea-2-turbo-mflux-bf16` (34.2 GB) and `-q8`, `-q6`, `-q5`, `-q4`, `-q3` (22.2 to 15.8 GB for q8 and q4). 0.24 fixes "saved Krea 2 checkpoints on Hugging Face now load by repo id". Rendered the same prompt (two people at a table, rain on the window), 832×1216, 8 steps, seed 42, `--low-ram`, with `--base-model krea-2` for the community copy. Pictures from the two are byte-identical (mean difference 0.0, maximum 0), also with the Krea 2 + LoRA settings (the refusal-reduction LoRA at 0.8). Peak memory 34.30 GB for both. Times are wall clock from cache, including the model load, and the download was not timed apart: the gated copy 116 s on its first run after a long idle and 85 s on a second run; the community copy 84 s, and 83 s with the LoRA (the gated copy with the LoRA was not timed). The quantised copies were not tried. The gated copy was removed from the Mac's Hugging Face cache (`hf cache rm`, 35.7 GB freed).

### FLUX.2 Klein 9B's repo moved to mflux-community (Mac, 2026-10-27)

FLUX.2 Klein 9B ran through mflux's alias `flux2-klein-9b`, which 0.24 resolves to Black Forest Labs' gated repo `black-forest-labs/FLUX.2-klein-9B` (34.7 GB cached; non-commercial licence). mflux-community's `flux2-klein-9b-mflux-bf16` is ungated (33.5 GB; `-q8` 17.9 GB not tried). Rendered the same prompt (two people at a table, rain on the window), 832×1216, 4 steps, seed 42, `--low-ram`, float16, `--base-model flux2-klein-9b` for the community copy. **The pictures are not identical**: the same scene, people and composition, with small differences in detail (mean difference 1.63 of 255, maximum 185; the same on both runs of the new copy, and the two runs of the BFL copy are identical to each other). Peak memory 20.47 GB for both. Wall clock from cache, including the model load: BFL copy 20 s and 19 s, community copy 20 s and 19 s. The 33.5 GB download took 799 s (downloaded with `hf download`, timed apart). Saves 1.2 GB on disk and the gate; one prompt and one seed. The app now uses the community copy. The BFL copy was removed with `hf cache rm` (hf 2.3.0, reporting 34.7G freed), which freed no disk: six blobs, 34.5 GB, were left in `hub/blobs` and matched by size to the repo's files, then deleted (free space 49 to 81 GiB).

FLUX.2 Klein 4B was pointed at `mflux-community/flux2-klein-4b-mflux-bf16` (16.0 GB, ungated, Apache-2.0) the same day. Only the repo's file layout was checked: not downloaded or rendered, since the BFL repo it replaced had been removed from the cache by the owner and there was nothing to compare against.

### ERNIE-Image Turbo and Boogu Image Turbo moved to mflux-community (Mac, 2026-10-27)

Both ran through mflux's aliases (`ernie-image-turbo` to `baidu/ERNIE-Image-Turbo`, `boogu-image-turbo` to `Boogu/Boogu-Image-0.1-Turbo`; neither gated, both Apache-2.0). The app now uses mflux-community's `ernie-image-turbo-mflux-bf16` (23.1 GB) and `boogu-image-turbo-mflux-bf16` (35.9 GB, against 24.0 and 38.5 GB cached), each with `--base-model` set to the alias. Same prompt (two people at a table, rain on the window), 832×1216, `--low-ram`, seed 42, ERNIE at 8 steps and Boogu at 4, no float16. Pictures from the two copies are byte-identical for both (mean difference 0.0, maximum 0, on two runs each). Peak memory: ERNIE 23.12 GB and Boogu 25.19 GB, for both copies. Wall clock from cache, including the model load: ERNIE 54 s and 51 s with the original, 52 s and 52 s with the community copy; Boogu 38 s and 34 s with the original, 34 s and 34 s with the community copy. The downloads were timed apart, with `hf download`: 319 s for ERNIE and 482 s for Boogu.

The owner doesn't use either model enough locally to keep them, so after the test **all four copies were removed from this Mac** (`hf cache rm`): both models download again on first use. The two community copies, downloaded by `hf` 2.3.0, freed their disk space (26 to 81 GiB free). The two original repos, downloaded earlier by mflux's own `huggingface_hub` 1.33.0, left 13 blobs (62.4 GB) behind, all of which matched the removed repos' files by size and were deleted: 139 GiB free at the end.

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
