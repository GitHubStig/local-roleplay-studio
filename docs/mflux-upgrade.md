# Updating mflux

This is the routine for reviewing and installing an mflux release on the Apple Silicon Mac. mflux runs only there (MLX), so there is no Windows step; the Windows PC renders through ComfyUI ([comfyui-upgrade.md](./comfyui-upgrade.md)). An mflux upgrade does not download model weights or select a model.

## What goes where

- **This file** is the repeatable upgrade and review procedure.
- **The rolling upgrade log** in [research/mflux-upgrade-log.md](./research/mflux-upgrade-log.md) records each release under a dated version heading: relevant changes, how they relate to what the app uses, and what was checked.
- [image-model-setup.md](./image-model-setup.md) is the install command for a new Mac. Update it when the command changes (a version floor, a pin added or removed).
- [models.md](./models.md) records models only after they have been selected and measured. Ideas not chosen yet belong in [open-threads.md](./open-threads.md).

## How mflux is installed

A `uv tool` on uv's managed Python 3.14, with the commands on the PATH (`~/.local/bin/mflux-*`):

```sh
uv tool install --managed-python --python 3.14 mflux
```

mflux 0.23 and older needed `--with 'pillow<13'` (added 2026-10-17): they fail to import with Pillow 13.0 on Python 3.14.4. 0.24.0 requires Pillow 13 or newer, so the pin was dropped on 2026-10-27. The app only needs the commands to exist; it finds mflux through `mflux-generate-flux2` on the PATH (`server/features.ts`) and calls the per-model commands from `server/images/mflux/`.

The project is now at <https://github.com/mflux-community/mflux> (it moved from Filip Strand's account in August 2026); the README still credits him.

## Routine

1. **Pull first** and note the installed version: `uv tool list | grep mflux`.
2. **Read every release between the installed version and the new one**, not just the latest ([releases](https://github.com/mflux-community/mflux/releases)). Look for: a new minimum Python or Pillow, renamed or removed commands and flags, changed defaults, new models, memory changes, and fixes for anything in [models.md](./models.md) or [open-threads.md](./open-threads.md). Compare them with the commands and flags the app builds in `server/images/mflux/` and with the Image Models in `server/images/mflux/models.ts`.
3. **Separate what is known from what needs testing.** A changelog entry is evidence that code changed, not that the app's issue is fixed. Label unverified fixes and run a focused check before calling one resolved.
4. **Present new models; do not download them.** For anything newly supported, give the official source, size, license or gating, the command, and the likely fit on the 48 GB Mac. Ask which, if any, to try. Weights are large; downloads wait for a yes.
5. **Ask before upgrading if the release changes the install**, such as a new Python minimum, a changed pin, or a new required flag. A routine release can be installed straight away.
6. **Install.** Reinstall with the command above, adjusted for the release (drop or change the `--with` pins the notes make obsolete), rather than `uv tool upgrade mflux`. `uv tool upgrade` honours the requirements the tool was first installed with, so an old `--with` pin carries over, and the 0.23 upgrade pulled in Pillow 13 and broke every command. A plain `uv tool install --upgrade mflux …` with the full intended options writes them afresh. Then check `uv tool list` and that `mflux-generate-flux2 --help` runs.
7. **Smoke-check with models already cached.** Render one small picture (512², few steps) with FLUX.2 Klein 4B, and one with each other Image Model the release touched that is already cached. Check at least that the command-line flags the app passes are still accepted (`--low-ram`, the model and step flags, quantize or precision flags) and that the app shows the picture. Use a public input (`scenarios/tavern.md`), not a real Session. Note any model that fetched new files: 0.23 pins each built-in model to a Hugging Face commit, so an upgrade can fetch changed files, and the app reports a download when it happens.
8. **Benchmarks are scheduled, not run.** A speed, memory or quality comparison is a long GPU run: say what will run, how long, what it downloads, and what it measures, and wait for the owner to pick a time when the Mac is otherwise idle. A smoke render's timing is not a benchmark.
9. **Record the result.** Append a dated section to [research/mflux-upgrade-log.md](./research/mflux-upgrade-log.md) (newest first): versions, sources, checks run, pass or fail, and what was not tested. Update `image-model-setup.md` if the install command changed. Add selected and measured models to `models.md`; keep ideas in `open-threads.md`. Check the open threads that name mflux, such as the Qwen-Image 2.1 Turbo text encoder stored twice.
10. **Run `deno task test` and `deno task check`** if a change to `server/images/mflux/` was needed, and ask before committing.

## Review prompt

> mflux **[new version]** is out; the Mac has **[installed version]**. Read the release notes from the installed version through the new one at <https://github.com/mflux-community/mflux/releases>. Compare them with `server/images/mflux/` (the commands and flags the app passes), `docs/research/mflux-upgrade-log.md`, `docs/image-model-setup.md`, and the open threads that mention mflux. Tell me: any change to the install (Python, Pillow, pins), anything breaking for the app, documented issues a release may fix (confirmed or only possible), and new models with source, size, license and fit on the 48 GB Mac. Do not install, download or benchmark anything until I say so; propose the install and smoke checks first.
