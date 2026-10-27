# Updating mflux

This is the routine for reviewing and installing an mflux release on the Apple Silicon Mac. mflux runs only there (MLX), so there is no Windows step; the Windows PC renders through ComfyUI ([comfyui-upgrade.md](./comfyui-upgrade.md)). An mflux upgrade does not download model weights or select a model.

## What goes where

- **This file** is the repeatable upgrade and review procedure.
- **The rolling upgrade log** in [research/mflux-upgrade-log.md](./research/mflux-upgrade-log.md) records each release under a dated version heading: relevant changes, how they relate to what the app uses, and what was checked.
- [hf-cache.md](./hf-cache.md): removing models from the Hugging Face cache, and checking the disk space came back.
- [image-model-setup.md](./image-model-setup.md) is the install command for a new Mac. Update it when the command changes (a version floor, a pin added or removed).
- [models.md](./models.md) records models only after they have been selected and measured. Ideas not chosen yet belong in [open-threads.md](./open-threads.md).

## How mflux is installed

A `uv tool` on uv's managed Python 3.14, with the commands on the PATH (`~/.local/bin/mflux-*`):

```sh
uv tool install --managed-python --python 3.14 mflux
```

The app only needs the commands to exist; it finds mflux through `mflux-generate-flux2` on the PATH (`server/features.ts`) and calls the per-model commands from `server/images/mflux/`. The `hf` command is a separate install ([hf-cache.md](./hf-cache.md)); mflux downloads with its own copy of `huggingface_hub`.

## Routine

1. **Pull first** and note the installed versions: `uv tool list | grep mflux`, and `hf version` (update it with `hf update` before removing any models).
2. **Read every release between the installed version and the new one**, not just the latest ([releases](https://github.com/mflux-community/mflux/releases)). Look for: a new minimum Python or Pillow, renamed or removed commands and flags, changed defaults, new models, memory changes, and fixes for anything in [models.md](./models.md) or [open-threads.md](./open-threads.md). Compare them with the commands and flags the app builds in `server/images/mflux/` and with the Image Models in `server/images/mflux/models.ts`. A page summary is not a review: for any change that could affect the app (a default, a memory behaviour, a flag), read the code in `~/.local/share/uv/tools/mflux/lib/python3.14/site-packages/mflux/` after installing.
3. **Separate what is known from what needs testing.** A changelog entry is evidence that code changed, not that the app's issue is fixed. Label unverified fixes and run a focused check before calling one resolved.
4. **Present new models; do not download them.** For anything newly supported, give the official source, size, license or gating, the command and flags, whether mflux-community has a saved copy (and which sizes), whether the app already has the model on ComfyUI, and the likely fit on the 48 GB Mac. Ask which, if any, to try. Weights are large; downloads wait for a yes.
5. **Ask before upgrading if the release changes the install**, such as a new Python minimum, a changed pin, or a new required flag. A routine release can be installed straight away.
6. **Install.** Reinstall with the command above, adjusted for the release (drop or change the `--with` pins the notes make obsolete), rather than `uv tool upgrade mflux`. `uv tool upgrade` honours the requirements the tool was first installed with, so an old `--with` pin carries over. A plain `uv tool install --upgrade mflux …` with the full intended options writes them afresh. Then check `uv tool list` and that `mflux-generate-flux2 --help` runs.
7. **Smoke-check with models already cached.** Render one small picture (512², few steps) with FLUX.2 Klein 4B, and one with each other Image Model the release touched that is already cached. Check at least that the command-line flags the app passes are still accepted (`--low-ram`, the model and step flags, quantize or precision flags) and that the app shows the picture. Use a public input (`scenarios/tavern.md`), not a real Session. Note any model that fetched new files: 0.23 pins each built-in model to a Hugging Face commit, so an upgrade can fetch changed files, and the app reports a download when it happens.
8. **Check where each Image Model loads from.** List the `model:` of every entry in `models.ts`. A built-in name (`krea-2`, `flux3-image-klein`) resolves to `model_name=` in mflux's `models/common/config/model_config.py`, usually the maker's own repo, which may be gated, and `mflux-community` may have an ungated copy. Look at what the organisation publishes (`https://huggingface.co/api/models?author=mflux-community&search=<name>`) and each repo's `gated`, licence and file sizes (`…/api/models/<repo>?blobs=true`). A model still on a gated repo is a candidate to move. Recheck the ones the log notes as not moved (Qwen-Image 2.1) at every release.
9. **Moving a repo: compare it fairly, and write down exact numbers.**
   - Render the **old copy first**, with the app's own flags (`mfluxArgs` in `mflux.ts`: steps, step cache, float16, `--low-ram`; the same width, height and seed), once, and save the picture. Do this before downloading, since the old copy can be deleted afterwards. A repeat of the same copy gave an identical picture every time on 2026-10-27, so one render is enough for the picture. Render it a second time only when the timing matters: the first run after a long idle can be slower with a cold disk cache (Krea 2's old copy took 116 s, then 85 s).
   - **Download the new copy on its own** with `hf download <repo>` and time that. Never compare a run that included a download with a cached one.
   - Render the new copy the same way, once (twice if you timed the old copy twice), with `--base-model <the old name>` (as the existing entries do; a pre-quantised repo also sets `preQuantized`, so the Quantize setting isn't applied twice).
   - Compare the pictures pixel by pixel (mean and maximum difference out of 255) and, if they differ, look at them side by side. Identical pictures mean the same weights in mflux's saved format; a difference means a re-save or another quantisation, which is a decision for the owner.
   - Report **wall clock from cache, including the model load**, for both copies, with the peak memory (`Peak MLX memory` in the output). Say how many runs each number is.
   - Then change `models.ts`, update its test in `mflux_test.ts` (which asserts the arguments), and run `deno task test` and `deno task check`.
10. **Check every command that uses the model before moving it.** A saved copy may run text-to-image but not the model's other commands. mflux's Qwen-Image 2.1 edit command refuses a community copy because it wants `config.json` files in the `vae/`, `transformer/` and `text_encoder/` folders (`qwen_image21_initializer.py`), so moving the generator alone would have kept both copies on disk. Try each of the app's commands on the new copy (edits, LoRAs such as Viggle's and Krea 2's, ControlNets if used) before deciding, and note the result in the log.
11. **Read the defaults a release changes.** The 0.24 notes say several models decode the VAE in bf16 row strips; the code shows the initializers turn it on unconditionally for seven of the app's Image Models, and `--vae-full-precision` (which the app never passes) turns it off. Work out from the code which of the app's commands are affected, whether the app passes the flag, and measure one cached model with and without it. Numbers in `models.md` taken on an older release may no longer hold: say so rather than rewriting them untested.
12. **Benchmarks are scheduled, not run.** A speed, memory or quality comparison is a long GPU run: say what will run, how long, what it downloads, and what it measures, and wait for the owner to pick a time when the Mac is otherwise idle. A smoke render's timing is not a benchmark; neither is the repo-move comparison above, which is a check that the pictures and times match.
13. **Mind the disk.** Run `df -h ~` before a download: it has to fit **next to** the old copy while you compare (a 33 GB copy beside a 35 GB one needs about 70 GB free). If it won't fit, save the old copy's pictures first and ask before deleting it. Models the owner doesn't use enough locally can go from the cache after a test (ERNIE-Image Turbo and Boogu Image Turbo did on 2026-10-27); say they will download again on first use.
14. **Remove the old copy by the book.** `hf cache rm` can report "freed" and free nothing: follow [hf-cache.md](./hf-cache.md) (check `df`, run the check for blobs nothing links to, match them by size to the removed repo, ask, delete, check again). Ask before deleting anything.
15. **Record the result.** Add a dated section to [research/mflux-upgrade-log.md](./research/mflux-upgrade-log.md) (newest first): versions, sources, checks run, pass or fail, and what was not tested. Update `image-model-setup.md` if the install command or a gating note changed. Add selected and measured models to `models.md`; keep ideas in `open-threads.md`. Check the open threads that name mflux, such as the Qwen-Image 2.1 Turbo text encoder stored twice and Qwen-Image 2.1 from mflux-community.
16. **Run `deno task test` and `deno task check`** if a change to `server/images/mflux/` was needed, and ask before committing.

## Notes for an agent running the checks

- **zsh doesn't split an unquoted variable.** `B="mflux-generate-flux2 --model x"; $B` fails with "command not found" (or silently runs nothing); use an array, `B=(mflux-generate-flux2 --model x)` and `"${B[@]}"`, and quote globs such as `--include='*.py'`.
- **Time a render with `date +%s` around it**, and keep `Peak MLX memory` from the output. Mind that a first run after a long idle can be slower than a repeat (the disk cache is cold): time two runs.
- A long download or render in the foreground can pass the tool's 10-minute limit: run it in the background and wait for its notification.
- **Look at the pictures**, not only the numbers: put the old and the new side by side before saying they match.

## Review prompt

> mflux **[new version]** is out; the Mac has **[installed version]**. Read the release notes from the installed version through the new one at <https://github.com/mflux-community/mflux/releases>. Compare them with `server/images/mflux/` (the commands and flags the app passes, and the repo each Image Model loads from), `docs/research/mflux-upgrade-log.md` (including the repos noted there as not moved), `docs/image-model-setup.md`, and the open threads that mention mflux. Tell me: any change to the install (Python, Pillow, pins), anything breaking for the app, defaults that change for models the app runs (read the code, not only the notes), documented issues a release may fix (confirmed or only possible), Image Models still on a gated repo that mflux-community now has a copy of, and new models with source, size, license, mflux-community copies and fit on the 48 GB Mac. Do not install, download or benchmark anything until I say so; propose the install and smoke checks first.
