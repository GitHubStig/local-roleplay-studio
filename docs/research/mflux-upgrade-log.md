# mflux upgrade log

Newest first. The procedure is in [mflux-upgrade.md](../mflux-upgrade.md). mflux runs on the Apple Silicon Mac only.

## 0.24.0 — reviewed 2026-10-27, not installed

Mac installed version: 0.23.0 (`uv tool list`). Reviewed from the [release notes](https://github.com/mflux-community/mflux/releases) as summarised by a page fetch, not read line by line, and not compared yet with the flags in `server/images/mflux/`. Nothing was installed, downloaded or run.

### Install changes — decide before upgrading

- **Python 3.11 or newer** (3.10 dropped). The Mac's tool uses managed Python 3.14, so no change.
- **Pillow 13.0.0 or newer is required** (it fixes a heap overflow in FlashPix JPEG decoding), and "commands no longer crash at startup with Pillow 13" is listed as fixed. This is the problem behind the `--with 'pillow<13'` pin of 2026-10-17 (below). The pin conflicts with 0.24, so the install is expected to drop it: `uv tool install --upgrade --managed-python --python 3.14 mflux`. Not tried; whether `uv tool upgrade` alone would trip over the old pin is also not checked. Afterwards, update [image-model-setup.md](../image-model-setup.md) (the version floor and the pin note).
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

### To do after the owner says to upgrade

Install, then run the smoke check from the procedure and record it here with the Mac's date and versions. Nothing about 0.24 working with the app is established yet.

## 0.23.0 — Mac, 2026-10-17

Upgraded from 0.22 with `uv tool upgrade mflux`. That pulled in Pillow 13.0.0, which fails to import on uv's Python 3.14.4 (`cannot import name '_IntegralLike' from 'numbers'`), so every mflux command failed. Reinstalled with `uv tool install --managed-python --python 3.14 mflux --with 'pillow<13'` (Pillow 12.3.0); FLUX.2 Klein 4B then rendered again: 512², 4 steps, float16, 10.1 s including the load, 10.2 GB peak. 0.23 pins each built-in model to a Hugging Face commit; Klein 4B's cache needed nothing fetched.

New in 0.23, which the app uses: FLUX.3 Klein and Qwen-Image 2.1 Turbo as mflux Image Models (measured in [models.md](../models.md#mflux-023-flux3-klein-and-qwen-image-21-turbo-on-the-mac-2026-10-17)). Not used yet: `mflux-generate-flux3-edit`, FLUX.3 LoRAs, and the Z-Image and Krea 2 ControlNets ([open-threads.md](../open-threads.md)).

Moved here from models.md on 2026-10-27; the earlier releases were not logged at the time.

## Earlier releases (backfilled from models.md and open-threads.md)

- **0.22** (Mac, 2026-10-09 to 2026-10-14): Ming-Image 0.1 Design, Ideogram 4 (gated), FIBO 1.5 and Z-Image base became Image Models; `mflux-generate-qwen-2.1-controlnet` noted. Ideogram 4 needs JSON captions and returned a safety-filter black picture on a plain tavern prompt.
- **0.21** (Mac, 2026-10-04 to 2026-10-06): Qwen-Image 2.1, its step cache (`--step-cache-ratio`) and Viggle's turbo LoRA; `mflux-generate-qwen-2.1-edit` with up to ten reference images and `--auto-mask`.
- **0.20**: the version the early image-to-3d research used (Depth Pro in MLX, Qwen-Image-Edit-2509, Kontext, FLUX.2 edit).
