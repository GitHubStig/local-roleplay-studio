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

- **Qwen-Image 2.1 `--small-text-encoder`** (a ~2.1 GB download instead of 17.5 GB). Related to the Turbo text encoder stored twice ([open-threads.md](../open-threads.md)) and to the Qwen disk cost in [image-models.md](image-models.md#mflux-023-flux3-klein-and-qwen-image-21-turbo-on-the-mac-2026-10-17). Whether it changes output, and whether it works with the Turbo and Viggle variants, is unchecked. FLUX.2 also gets `--small-text-encoder` and `--small-decoder`.
- **VAE decoding in row strips** for several models (about 1.6 GB at 1024²; `--vae-full-precision` restores the old behaviour). Peak memory in [image-models.md](image-models.md) may change for those models. `--vae-tiling` no longer shifts colours.
- **FIBO 2** (`mflux-generate-fibo2`, `-edit`; Dev and Edit Turbo, with `--expand-prompt`, `--cfg-end`, `--step-cache-ratio`). The same models were added to the app on ComfyUI on 2026-10-27, CC BY-NC. See open-threads.md ("FIBO 2.0 as a ComfyUI Image Model").
- **MOSS-Image** (`mflux-generate-moss-image`, `--model moss-image-base`, `--lora`), an Image Model on ComfyUI since 2026-10-19.
- Fixes: saved Krea 2 checkpoints load by repo id; FLUX.2 klein `--config-from-metadata` rejects a non-boolean `small_text_encoder`; Z-Image ControlNet mlsd no longer crashes on OpenCV 5.
- `mflux-check` validates local model packages without downloads (`--fix` restores missing shards from a local cache); `mflux-save --hf-symlink`.
- No CLI renames listed.

### Candidates, not selected

- **Anima** (circlestone-labs; `mflux-generate-anima`, Turbo, Aesthetic and Base) and **Iris-3B** (`mflux-generate-iris`, Turbo by default and a base) are new. Sizes, licenses and fit on the 48 GB Mac are unknown; to be looked up before offering them.

### Repos moved to mflux-community (Mac, 2026-10-27)

mflux 0.24 still resolves most built-in model names (`krea-2`, `flux3-image-klein`, …) to the model makers' own Hugging Face repos, some of them gated, and the app used those names. mflux-community publishes ungated copies in mflux's saved format (`<model>-mflux-bf16`, and quantised `-q3` to `-q8`). Each Image Model below was rendered from the old and the new repo with the same settings, then switched in `server/images/mflux/models.ts` with `--base-model` set to the old name. The method is in [mflux-upgrade.md](../mflux-upgrade.md).

**What moved:**

| Image Model (id) | Loaded from before | Loaded from now | Gated before? | Size on disk, before → now | Old copy |
|---|---|---|---|---|---|
| Z-Image Turbo (`z-image-turbo`) | `filipstrand/Z-Image-Turbo-mflux-4bit` | `mflux-community/z-image-turbo-mflux-q4` | no | 5.9 → 5.9 GB (a re-save: 20 of 21 files differ) | removed |
| FLUX.3 Klein (`flux3-klein`) | alias `flux3-image-klein`, `black-forest-labs/flux-3-image-klein` | `mflux-community/flux-3-image-klein-mflux-bf16` | yes (FLUX Kommunity License) | 20.3 → 18.5 GB | removed |
| Krea 2 and Krea 2 + LoRA (`krea-2`, `krea-2-lora`) | alias `krea-2`, `krea/Krea-2-Turbo` | `mflux-community/krea-2-turbo-mflux-bf16` | yes (auto approval, licence "other") | 35.7 → 34.2 GB | removed |
| FLUX.2 Klein 9B (`flux2-klein-9b`) | alias `flux2-klein-9b`, `black-forest-labs/FLUX.2-klein-9B` | `mflux-community/flux2-klein-9b-mflux-bf16` | yes (auto approval, non-commercial) | 34.7 → 33.5 GB | removed |
| FLUX.2 Klein 4B (`flux2-klein-4b`) | alias `flux2-klein-4b`, `black-forest-labs/FLUX.2-klein-4B` | `mflux-community/flux2-klein-4b-mflux-bf16` | no (Apache-2.0) | 16.0 → 16.0 GB | removed by the owner before any test |
| ERNIE-Image Turbo (`ernie-image-turbo`) | alias `ernie-image-turbo`, `baidu/ERNIE-Image-Turbo` | `mflux-community/ernie-image-turbo-mflux-bf16` | no (Apache-2.0) | 24.0 → 23.1 GB | removed, with the new copy: not kept on this Mac |
| Boogu Image Turbo (`boogu-image-turbo`) | alias `boogu-image-turbo`, `Boogu/Boogu-Image-0.1-Turbo` | `mflux-community/boogu-image-turbo-mflux-bf16` | no (Apache-2.0) | 38.5 → 35.9 GB | removed, with the new copy: not kept on this Mac |
| Ming-Image 0.1 Design (`ming-image`) | `joeynyc/Ming-Image-0.1-Design-mflux-q8-te5` (a personal repo) | `mflux-community/ming-image-0-1-mflux-q8` | no (MIT) | 19.2 → **25.2 GB** | removed |
| Qwen-Image 2.1 (`qwen-image-2.1`, Viggle, edit) | alias `qwen-image-2.1`, `Qwen/Qwen-Image-2.1` | **not moved**, see below | no | 33.1 GB (community bf16: 30.7) | kept (the community copy was removed again) |

**What was measured** (Mac, M5 Pro, 48 GB, mflux 0.24.0; 832×1216, seed 42, `--low-ram`, one prompt: two people at a table beside a lamp, rain on the window, painterly; Ming and Qwen used a prompt with a sign reading "THE RUSTY LANTERN"; float16 where the Image Model takes it):

| Image Model | Steps | Picture, new against old | Peak memory, old / new | Wall clock from cache, old / new | Download of the new copy |
|---|---|---|---|---|---|
| Z-Image Turbo | 9 | differs slightly: mean 1.3 of 255, maximum 181 | 4.40 / 4.40 GB | 32 s / 30 s (one run each) | not timed apart |
| FLUX.3 Klein | 16 | byte-identical | 10.93 / 10.93 GB | 40.6 s / 40 s (one run each) | not timed apart |
| Krea 2 | 8 | byte-identical, also with the LoRA (0.8) | 34.30 / 34.30 GB | 116 s (first run after a long idle) and 85 s / 84 s; with the LoRA 83 s (the old copy's was not timed) | not timed apart |
| FLUX.2 Klein 9B | 4 | differs slightly: mean 1.63 of 255, maximum 185 (the same on both new runs) | 20.47 / 20.47 GB | 20 s, 19 s / 20 s, 19 s | 799 s for 33.5 GB |
| FLUX.2 Klein 4B | 4 | not rendered | not measured | not measured | not downloaded (only the repo's file layout was checked) |
| ERNIE-Image Turbo | 8 | byte-identical | 23.12 / 23.12 GB | 54 s, 51 s / 52 s, 52 s | 319 s for 23.1 GB |
| Boogu Image Turbo | 4 | byte-identical | 25.19 / 25.19 GB | 38 s, 34 s / 34 s, 34 s | 482 s for 35.9 GB |
| Ming-Image Design | 12 | differs: mean 10.2 of 255, maximum 240; same scene style, the sign's lettering right | 12.55 / **18.52 GB** | 42 s, 41 s / 41 s, 43 s | 1070 s for 25.2 GB |
| Qwen-Image 2.1 (25 steps, step cache 0.4) | 25 | byte-identical | 15.82 / 15.82 GB | 53 s, 54 s / 51 s, 54 s | 505 s for 30.7 GB |
| Qwen-Image 2.1 Viggle Turbo | 6 | byte-identical | 16.60 / 16.60 GB | 31 s / 31 s | (the same copy) |
| Qwen-Image 2.1 Edit (`-q 8`) | | **the community copy is refused** (see below) | 13.49 GB (old only) | 178 s, 178 s (old only) | |

All times are wall clock **from cache, including the model load**; a download is never part of a time, so the two columns are comparable. Two numbers in a cell are two runs. Wherever a copy was rendered twice, both pictures were identical, so a difference between old and new is a difference in the weights. Every picture is one prompt and one seed.

**Notes:**

- The pictures of the byte-identical copies are the same weights in mflux's saved format. The three that differ are re-saves (Z-Image Turbo, Klein 9B) or a different quantisation (Ming: the text encoder at 8 bits instead of 5).
- **Ming is bigger on both counts**: +6 GB on disk and +6 GB peak (the text encoder is 17.0 GB instead of 11.0), because mflux-community has no copy with the DiT at 8 bits and the text encoder at 5. It was chosen over `-q6` (19.4 GB, untested) for the lettering.
- **Not tried:** the quantised copies (`-q8`, `-q6`, `-q4`…) of any model except Ming's, and whether Klein 4B's copy renders the same as BFL's.
- **`hf cache rm` left the old copies' weights behind** for Z-Image Turbo, Krea 2, Klein 4B, Klein 9B, ERNIE and Boogu (their blobs sat in the shared `hub/blobs`, with no `.refs` files): 57.4 GB (Z-Image Turbo, Krea 2 and Klein 4B together), 34.5 GB (Klein 9B) and 62.4 GB (ERNIE and Boogu) had to be deleted by hand after matching them by size. The old FLUX.3 Klein and Ming copies, and the new copies downloaded by `hf` 2.3.0, freed their space properly. See [hf-cache.md](../hf-cache.md) for the check.
- ERNIE and Boogu were removed from the Mac on purpose (the owner doesn't use them enough locally); both download again on first use.

### Qwen-Image 2.1 on mflux-community: tried, not moved (Mac, 2026-10-27)

Qwen-Image 2.1 (`qwen-image-2.1`, and `qwen-image-2.1-viggle`, which is the same model with a LoRA) runs through mflux's alias, which 0.24 resolves to `Qwen/Qwen-Image-2.1` (33.1 GB cached, not gated). mflux-community has `qwen-image-2-1-mflux-bf16` (30.7 GB) and `-q8` (24.0 GB). Same prompt (a tavern sign reading "THE RUSTY LANTERN", two people at a table, rain on the window), 832×1216, seed 42, `--low-ram`, float16, with the app's flags (25 steps with step cache 0.4; Viggle at 6 steps with its scheduler and LoRA), the community copy loaded with `--base-model qwen-image-2.1`:

- **Generation: byte-identical** (mean difference 0.0, maximum 0) to the original, for both the standard render and Viggle, with the same peak memory (15.82 GB and 16.60 GB). Wall clock from cache, including the model load: standard 53 s and 54 s with the original, 51 s and 54 s with the community copy; Viggle 31 s both ways. The 30.7 GB download took 505 s, timed apart.
- **Editing does not work with it.** `mflux-generate-qwen-2.1-edit --model mflux-community/qwen-image-2-1-mflux-bf16 --base-model qwen-image-2.1` stops after 2 s with mflux's own `ValueError`: "Editing requires a complete checkpoint with component configs; missing: ['vae', 'transformer', 'text_encoder']. Use the original Qwen-Image-2.1 checkpoint or an export from QwenImage21Edit.save_model; text-only exports do not contain the visual encoder and processor needed for editing." The check is in mflux 0.24.0 (`mflux/models/qwen21/qwen_image21_initializer.py`, line 63), not in the app or on Hugging Face: it requires `vae/config.json`, `transformer/config.json` and `text_encoder/config.json` in the model folder (only the first two with `--small-text-encoder`). The community repo has the weights and their index files in those folders but no `config.json` in any of them, while the original has all three; the "text-only export" wording is mflux's explanation, and the repo does have a `processor/` folder. Whether the community's weights hold everything an edit needs (its text encoder is 15.1 GB against 17.5 GB) was not checked. The app's edit (`editArgs`, `-q 8`) needs the original, which holds the weights the edit shares with generation, so moving generation would keep both copies (63.8 GB) instead of one. The original edit still ran on the Mac for the baseline (832×1216, `-q 8`, seed 42: 178 s both runs from cache including the load, 13.49 GB peak).

Decision (the owner, 2026-10-27): leave Qwen-Image 2.1 on the original. The community copy was removed from the cache again. **Check at each mflux release** whether the edit command accepts mflux-community's Qwen-Image 2.1 (a complete export, or an edit that loads the visual encoder from the original repo), then move generation and edits together ([open-threads.md](../open-threads.md)).

### VAE decode in bf16 row strips: on by default, no gain seen on Z-Image Turbo (Mac, 2026-10-27)

0.24's release notes say several models now decode the VAE in bf16 row strips (about 1.6 GB at 1024×1024, against 8.6 GB for the earlier full-image fp32 decode, which `--vae-full-precision` brings back). Read from the code: the initializers of FLUX.2 (Klein 4B and 9B), FLUX.3 Klein, Z-Image (Turbo and base), ERNIE-Image, Ideogram 4, FIBO 2 and Lens set `vae.decode_mode = LOW_MEMORY` unconditionally, whether or not `--low-ram` is used, and `--vae-full-precision` defaults to off. The app never passes it, so seven of its mflux Image Models (FLUX.2 Klein 4B and 9B, FLUX.3 Klein, Z-Image Turbo, Z-Image, ERNIE-Image Turbo and Ideogram 4) decode this way. Krea 2, Qwen-Image 2.1 (and its Turbo, Viggle and edit), Boogu, Ming-Image, FIBO 1.5 and SeedVR2 don't use it.

Measured on Z-Image Turbo (mflux-community's 4-bit copy, 832×1216, 9 steps, seed 42, `--low-ram`, float16), two runs each, wall clock including the model load: default 28 s and 29 s, `--vae-full-precision` 28 s and 29 s. Peak memory 4.40 GB for both. The default decode reproduces the picture from earlier today exactly; `--vae-full-precision` gives a slightly different one (mean difference 0.47 of 255, maximum 43). So at this size the decode is not what sets the process's peak, and there is nothing to gain by changing the flag. Not measured: larger pictures, or the other six models. The speed, memory and picture numbers in [image-models.md](image-models.md) for these models were taken on 0.22 or 0.23, with the older decode.

### MOSS-Image on mflux 0.24.0: added, but black from long prompts (Mac, 2026-10-27)

`mflux-generate-moss-image` with `mflux-community/moss-image-sft-mflux-bf16` (26.2 GB, Apache-2.0, not gated; the community also has q8 14.0 GB, q6 10.7, q4 7.5, q5 and q3). Downloaded with `hf download` on its own: **633 s**. mflux's defaults are 50 steps and guidance 3 (the negative branch skips layer 22, so two transformer passes a step); the app's entry uses them too (ComfyUI's template runs 25 and 2.5; not compared on mflux). A saved copy has only `mflux_model.json` and the tokenizer, no `config.json` in the folders, so a future edit command that wants the maker's layout could refuse it, as Qwen-Image 2.1's did. mflux has no MOSS edit command today (`Moss-Image-Edit` loads as a LoRA but the port takes no reference images).

**It doesn't work on 0.24.0 for the app's prompts.** The Qwen3.5 text encoder's Gated DeltaNet goes non-finite on longer prompts and the picture comes out all black ("invalid value encountered in cast"). Seed 42, `--low-ram`, bf16, from cache:

| Run | Result |
|---|---|
| Tavern Image Prompt (nine sentences, 350 tokens), 832×1216, 50 steps, guidance 3 | black, twice: 249 s and 246 s, peak MLX memory 26.83 GB |
| Same prompt at 512², 6 steps | black; also with `-q 8`, and without `--low-ram` |
| First 4 sentences (145 words, ~180 tokens) | renders |
| First 5 sentences (176 words, ~217 tokens) | black |
| Fox prompt, 512² and 832×1216, 10 steps | renders (18 s at 512²) |

So the limit here is about 200 tokens, and the quotes don't matter. It is mflux issue #920 (reported at ~500 tokens), fixed by PR #939, merged on 2026-10-27 after the 0.24.0 release. Decision (the owner): wait for 0.24.1 rather than install from main. Not tested: any picture, so nothing is known yet of how it draws, the steps or guidance, the 8- and 4-step LoRAs, or q8 and q4.

### FIBO 2.0 Dev on mflux 0.24.0: added (Mac, 2026-10-27)

`mflux-generate-fibo2` with `mflux-community/fibo-2-0-dev-mflux-bf16` (25.1 GB; also q8 13.4, q6 10.3, q4 7.2, q5, q3; not gated, licence `other`, CC BY-NC) and the Edit Turbo copies (`fibo-2-0-edit-turbo-mflux-*`, the same sizes). Downloaded with `hf download` on its own: **796 s**. Measurements, pictures and the checks are in [image-models.md](image-models.md#fibo-20-dev-on-mflux-2026-10-27-mac) ("FIBO 2.0 Dev on mflux"): 505–513 s at 50 steps with the VLM, 292 s at 30 steps with `--cfg-end 0.6`, peak 17.85 GB. The edit command takes the community copy; the mask edit repaints outside the mask. `--expand-prompt` gave a photograph where plain prose gave the painting asked for, so the entry sends prose. Not tried: LoRAs, Quantize, the q8 copy, `float16`.

Edit Turbo (`mflux-community/fibo-2-0-edit-turbo-mflux-bf16`, 25.1 GB, download **360 s**) is the second Image Model, `fibo-2.0-turbo`: 21 s a picture from prose, 4 steps, peak 17.40 GB ([image-models.md](image-models.md#fibo-20-turbo-on-mflux-2026-10-27-mac-devs-picture-in-21-s)).

### Still to do

Render through the app with the Image Models already cached, and compare the flags with `server/images/mflux/` (the release review above was not compared with them yet). Not tried: Anima, Iris-3B, MOSS-Image on mflux (`--lora`, with the community's 8- and 4-step LoRAs), FIBO 2, `--small-text-encoder` and `--small-decoder`. Adding the new models is next.

## 0.23.0 — Mac, 2026-10-17

Upgraded from 0.22 with `uv tool upgrade mflux`. That pulled in Pillow 13.0.0, which fails to import on uv's Python 3.14.4 (`cannot import name '_IntegralLike' from 'numbers'`), so every mflux command failed. Reinstalled with `uv tool install --managed-python --python 3.14 mflux --with 'pillow<13'` (Pillow 12.3.0); FLUX.2 Klein 4B then rendered again: 512², 4 steps, float16, 10.1 s including the load, 10.2 GB peak. 0.23 pins each built-in model to a Hugging Face commit; Klein 4B's cache needed nothing fetched.

New in 0.23, which the app uses: FLUX.3 Klein and Qwen-Image 2.1 Turbo as mflux Image Models (measured in [image-models.md](image-models.md#mflux-023-flux3-klein-and-qwen-image-21-turbo-on-the-mac-2026-10-17)). Not used yet: `mflux-generate-flux3-edit`, FLUX.3 LoRAs, and the Z-Image and Krea 2 ControlNets ([open-threads.md](../open-threads.md)).

Moved here from models.md on 2026-10-27; the earlier releases were not logged at the time.

## Earlier releases (backfilled from models.md and open-threads.md; the measurements below were moved from models.md on 2026-10-28)

- **0.22** (Mac, 2026-10-09 to 2026-10-14): on its own, a little faster than 0.21 on Qwen-Image 2.1 (1024², M5 Pro: 93 s against 98–100 s; with the step cache 60 s against 66 s) and a 3 GB lower peak (36 GB against 39 GB); the release notes' ~24 GB to ~13 GB was at 512² from 8-bit weights. The `--compute-precision float16` and lazy-loading measurements are in [below](#qwen-image-21-on-mflux-022-float16---low-ram-and-the-saved-copy-2026-10-09). Also: Ming-Image 0.1 Design, Ideogram 4 (gated), FIBO 1.5 and Z-Image base became Image Models; `mflux-generate-qwen-2.1-controlnet` noted. Ideogram 4 needs JSON captions and returned a safety-filter black picture on a plain tavern prompt.
- **0.21** (Mac, 2026-10-04 to 2026-10-06): on its own only 2–5% faster than 0.20 on Qwen-Image 2.1 (1024², 8-bit copy, 25 steps: 98–100 s against 103 s, the same picture), so the release notes' "~1.8× faster" was mostly the step cache. The saved copy made by 0.20 loaded in 0.21 (the app saved a fresh one, named for 0.21). The step cache and turbo LoRA measurements are in [below](#qwen-image-21-on-mflux-021-the-step-cache-and-viggles-turbo-lora-2026-10-04). Also: Qwen-Image 2.1, its step cache (`--step-cache-ratio`) and Viggle's turbo LoRA; `mflux-generate-qwen-2.1-edit` with up to ten reference images and `--auto-mask`.
- **0.20**: the version the early image-to-3d research used (Depth Pro in MLX, Qwen-Image-Edit-2509, Kontext, FLUX.2 edit).

### Qwen-Image 2.1 on mflux 0.21: the step cache and Viggle's turbo LoRA (2026-10-04)

mflux 0.21 adds a step cache for Qwen-Image 2.1 (`--step-cache-ratio`, TeaCache-style: it skips
the transformer on that share of the steps whose timestep changes least, and reuses the step
before) and a scheduler for Viggle's 6-step turbo LoRA (`--scheduler viggle_turbo`). Measured on
the app's settings at the time (the 0.20 and 0.21 comparison is in [research/mflux-upgrade-log.md](mflux-upgrade-log.md)): the saved 8-bit copy, 25 steps, no CFG, one prompt (Elara,
waist-up) and seed, at 1024×1024, everything else closed:

| Run | Time | Peak memory | Looks |
|---|---|---|---|
| 25 steps | 98–100 s | 39.1–39.3 GB | |
| + step cache 0.4 | 66 s (1.5×) | 38.7 GB | near the same: same pose, face and dress; slightly softer brushwork |
| turbo LoRA, 6 steps | 29–31 s (3.4×) | 38.9–39.2 GB | a different take on the prompt: smoother, more polished, less painterly; the face holds up |

- **Both work on the 8-bit saved copy**, the one the app renders from, and the copy saved by 0.20
  loads in 0.21.
- **The step cache is on in the app** for Qwen-Image 2.1 (Settings → Step cache, 0.4 by default;
  0.25, 0.5 or off). The other Image Models' commands don't take it (2026-10-04). It leaves runs
  under 10 steps alone.
- **The turbo LoRA was Settings → Fast** (an Image Model of its own since 2026-10-14, ADR 0016):
  `Viggle/Qwen-Image-2.1-viggle-turbo`
  (v0.3, rank 256, 1.3 GB), passed to mflux as `repo:file`, so mflux fetches it into the Hugging
  Face cache on first use. It must run at exactly 6 steps with its scheduler, so it takes no
  other steps and no step cache. It's under Qwen's research license (non-commercial), like LiTo. At
  512×512 on the 8-bit copy: 5 s of denoising, 24.5 GB peak. It's v0.3, the file the model card
  says to use; v0.2.1 (crisper, grainier) is also in the repo. Viggle's 9-step mode (the same
  LoRA, switched off for the last two steps, for finer detail at ~1.4–1.5× the time) isn't
  possible through mflux, and was dropped on 2026-10-17: as a preview of 25 steps, 6 are close
  enough ("Viggle or Qwen's Turbo", below).
- **Most of a turbo render is starting up** (Mac, 2026-10-05): of a 32.7 s run, 5 s was denoising
  and ~27 s loading ~22 GB, encoding the prompt and decoding the picture (loading surely the most);
  Upscale (SeedVR2) is ~46 s, mostly loading. In 2026-09-24's measure, loading was ~5 s of a 42 s
  Z-Image Turbo render. A service keeping the model loaded could bring it under 10 s, but on
  48 GB it would have to unload before every Reply, so it would help only back-to-back renders
  (Render all); dropped 2026-10-08.

### float16 on every Image Model that takes it: no gain on an M5 Pro (Mac, 2026-10-28)

Prompted by the Anima PR (mflux #931), which says float16 is about 20% slower than bf16 on an M5 Max. Measured on the Mac (M5 Pro, 48 GB, mflux 0.24.0) with the app's flags (`--low-ram`), seed 7, 1024×1024, each model's app steps, times including the model load ([bench/precision](../bench/precision/README.md), `float16.sh`). Default, then float16 (two runs each for all but the last two):

| Model | Default | float16 | Peak |
|---|---|---|---|
| FLUX.2 Klein 9B | 20, 20 s | 20, 20 s | 20.2 GB |
| FLUX.3 Klein | 42, 44 s | 44, 45 s | 11.7 GB |
| Z-Image Turbo (4-bit) | 34, 32 s | 32, 32 s | 5.6 GB |
| Z-Image (8-bit), 30 steps | 206 s | 207 s | 8.8 GB |
| Qwen-Image 2.1, 25 steps | 90 s | 91 s | 16.3 GB |
| Qwen-Image 2.1 Turbo | 35, 35 s | 35, 35 s | 16.3 GB |
| Qwen-Image 2.1 Viggle Turbo | 32, 31 s | 31, 33 s | 16.8 GB |

- **No difference in time or memory on any of them**, and none of the 20% slowdown the Anima PR saw. The pictures differ slightly (0.5–2.1 per pixel of 255, measured on 2026-10-09).
- **Decision**: the float16 setting is now Automatic, Off or On, Automatic by default: on for M1 to M3, off from M4 (`server/images/mflux/chip.ts`). M1 and M2 are mflux's own claim and **unmeasured here**, as is M3 (a guess). If someone with an M1 to M4 measures it, replace the guess.
- Not run: FLUX.2 Klein 4B (not downloaded; 10 s either way on 2026-10-09), and Windows (no mflux).

### Qwen-Image 2.1 on mflux 0.22: float16, `--low-ram` and the saved copy (2026-10-09)

mflux 0.22 adds `--compute-precision float16` (FLUX.2 Klein, Z-Image, Qwen-Image 2.1) and loads
Qwen-Image 2.1 lazily, each part read (and quantized) only when a step first needs it. Measured on
the Mac (M5 Pro, 48 GB), the same prompt, seed and 1024×1024 as on 0.21, everything else closed
([bench/precision](../bench/precision/README.md)):

| Run | Default | float16 | `--low-ram` |
|---|---|---|---|
| saved 8-bit copy, 25 steps | 93 s, 36.0 GB | 94 s, 36.1 GB | **90 s, 9.4 GB** |
| + step cache 0.4 | 60 s, 36.1 GB | 57 s, 36.6 GB | **56 s, 9.4 GB** |
| Fast (turbo LoRA, 6 steps) | 30 s, 36.6 GB | 30 s, 36.6 GB | **31 s, 11.6 GB** |
| original weights, `-q 8`, 25 steps | 91 s, 36.2 GB | 91 s, 36.1 GB | 91 s, 9.3 GB |
| FLUX.2 Klein 4B, 832×1216, 4 steps | 10 s, 19.8 GB | 10 s, 19.9 GB | |

Peak is macOS's peak memory footprint (`/usr/bin/time -l`), which counts the GPU's share of
unified memory.

- **float16 gains nothing on an M5 Pro** (within a second or two, run to run), as mflux's help
  says ("helps most on GPUs with slow bfloat16 (Apple M1 and M2); the gain is small or zero on M4
  and M5"). It changes the picture slightly (mean 0.5–0.8 per pixel of 255 on Qwen-Image 2.1, 2.1
  on Klein).
- **`--low-ram` cuts the peak by three-quarters at no cost in time**: 36 GB to 9.4 GB, the
  picture all but the same (mean 0.4 per pixel). It works with the step cache and the turbo LoRA.
- **The saved 8-bit copy no longer helps Qwen-Image 2.1**: rendering from the original weights with
  `-q 8` gives the very same picture (mean difference 0.0) in the same time and peak. One caveat:
  the original weights were likely still in the disk cache (the copy had been saved from them
  minutes before), so a cold first read may take some seconds longer. Saving the copy took 18 s
  and peaked at 24.3 GB.

**`--low-ram` on the other Image Models** (the same day, Mac, 1024×1024, each model's steps in the
app, full precision unless noted):

| Image Model | Default | `--low-ram` | Picture |
|---|---|---|---|
| FLUX.2 Klein 4B (4 steps) | 10 s, 20.1 GB | 10 s, **9.9 GB** | identical |
| FLUX.2 Klein 9B (4 steps) | 18 s, 22.7 GB | 19 s, 20.3 GB | identical |
| FLUX.2 Klein 9B, `-q 8` | 22 s, 23.2 GB | 22 s, 19.9 GB | identical |
| Z-Image Turbo, 4-bit (9 steps) | 34 s, 17.2 GB | 32 s, **5.6 GB** | near the same (1.1 of 255) |
| Krea 2 Turbo (8 steps) | 102 s, 35.7 GB | 92 s, 33.6 GB | near the same (0.1) |
| ERNIE-Image Turbo (8 steps) | 58 s, 35.9 GB | 56 s, 22.7 GB | identical |
| Boogu Image Turbo (4 steps) | 38 s, 36.3 GB | 38 s, 24.9 GB | near the same (1.2) |

**`--low-ram` is on for every Image Model in the app** since 2026-10-09: none is slower, and every
peak is lower, by 2–14 GB (Krea 2 and Klein 9B gain least). It does less for Klein 9B with `-q 8`
than its saved copy did (12.6 GB against 20.9 GB at 512 px on 2026-10-01), but the copies were
dropped all the same to free disk (22 GB each).

#### Saved quantized copies (0.20, 2026-10-01; dropped on 0.22)

*Saved copies dropped 2026-10-09 (mflux 0.22):* `--low-ram`, now on every render, lowers the peak
further than a saved copy did, and 0.22 converts Qwen-Image 2.1 as it loads, so its copy made the
same picture in the same time ("Qwen-Image 2.1 on mflux 0.22", above). Quantize now converts at
every render. The measurements below are kept for the record.

**Quantizing as mflux does it doesn't lower the peak** (2026-10-01, 512 px, the art-tags test
set's nine prompts): `--quantize` loads the full weights and converts them as it goes, so the peak
comes first. So Settings → Quantize renders from a copy saved once instead:

| Image Model | Off | 8-bit, converted each render | 8-bit, converted once and saved |
| ----------- | --- | ---------------------------- | ------------------------------- |
| FLUX.2 Klein 4B | 4.1 s, 10.5 GB | 4.9 s, 10.5 GB | 4.3 s, 7.0 GB |
| FLUX.2 Klein 9B | 9.6 s, 20.9 GB | 10.4 s, 20.9 GB | 7.1 s, 12.6 GB |
| Qwen-Image 2.1 | 28.7 s, 20.5 GB | 34.1 s, 20.5 GB | 28.5 s, 13.4 GB |

Saved once (`mflux-save --quantize 8`, 6–10 s; 8.6 GB for Klein 4B, 17 GB for Klein 9B, 22 GB for
Qwen-Image, on top of the originals) and rendered from that copy (`--model <path> --base-model
<id>`), 8-bit saves 3.5–8 GB at the same speed or faster, with the same pictures as converting each
time. Against
full precision the pictures keep their composition and only fine detail shifts (mean pixel
difference about 1 of 255 on Qwen-Image, 5–11 on the Kleins). The app saves a copy the first time a
render needs it (`server/images/mflux/quantized.ts`), in `models/quantized/<model>-<bits>bit-mflux<version>` (in the project, gitignored),
inside the render queue; a copy made by another mflux is replaced on next use, Settings lists the
copies with their sizes to delete, and if saving fails the render converts as it goes.

**Why mflux converts after loading, and why the app saves its own copies.** mflux has two loading
paths (`models/common/weights/loading/weight_applier.py`, mflux 0.20): original weights with
`--quantize` are loaded into the model whole and then converted (`nn.quantize`), so full precision
is in memory first; weights saved already quantized (by `mflux-save`, which records their bit
width) have the model set up quantized first and the small weights loaded straight into it, so
full precision never is. The first suits most users: one download serves every bit width (3, 4, 5,
6, 8 or none), with no extra disk, no step beforehand and nothing to go stale when mflux or the
model updates; it costs peak memory and a little speed, which only matter next to other big models
on a 48 GB Mac. The saved copies use mflux's own second path; the app adds only when a copy is
made, where it's kept, replacing it after an mflux update, and listing it in Settings.

The mflux project also publishes copies already converted, in the same format
(`mflux-community/flux2-klein-4b-mflux-q3` … `-q8`, `flux2-klein-9b-mflux-q3` … `-q5`). Converting
locally fits better: 6–10 s against an 8–17 GB download per model and bit width; every Image Model
and bit width, where the published ones cover some (no 8-bit Klein 9B or Qwen-Image 2.1 there,
2026-10-01); no extra download; and made by the installed mflux.
A published copy would only save the conversion on a fresh machine, for the models it covers. Qwen-Image 2.1's peak
here, 20.5 GB, is lower than the ~35 GB measured on 2026-09-25 with an earlier setup.
