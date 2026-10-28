# Updating mlx-audio

This is the routine for reviewing and installing an mlx-audio release for the voice service (`python/voice/serve.py`). mlx-audio runs only on the Apple Silicon Mac (MLX); the Windows PC speaks through ComfyUI's TTS Audio Suite instead ([comfyui-upgrade.md](./comfyui-upgrade.md)), so there's no Windows step. An upgrade downloads no models and changes no voice already saved with a Roleplay.

## What goes where

- **This file** is the repeatable upgrade and review procedure.
- **The rolling upgrade log** in [research/mlx-audio-upgrade-log.md](./research/mlx-audio-upgrade-log.md) records each release under a dated version heading: what changed, how it bears on the voice service, and what was checked.
- [research/voices.md](./research/voices.md) holds the findings the voice service is built on (why Higgs clones untagged, the sampling, the pace and sound tags). [models.md](./models.md) says what's in use now; update it only when a pick or a number there changes.
- [uv-upgrades.md](./uv-upgrades.md) covers uv itself and managed Python. An mlx-audio upgrade is a package upgrade, which that file leaves to a change of its own: this one.

## How mlx-audio is installed

Not as a tool: it's a dependency of the voice service's script, `dependencies = ["mlx-audio", "torch", "soundfile"]` in its inline metadata, resolved in the committed lock beside it (`python/voice/serve.py.lock`), which `uv run` follows. So the version in use is the lock's, and upgrading means changing the lock:

```sh
grep -A1 '^name = "mlx-audio"' python/voice/serve.py.lock   # the version in use
uv lock --script python/voice/serve.py --upgrade-package mlx-audio
```

`--upgrade-package mlx-audio` moves mlx-audio and whatever its new version requires (mlx, mlx-lm, transformers…), and leaves the rest where they are. The voice service uses two models: `DESIGN_MODEL` (Qwen3-TTS VoiceDesign) to design a Character's voice once, and `SPEAK_MODEL` (Higgs TTS 3, loaded with `model_type='higgs_audio_v3'`, as mlx-audio doesn't map the renamed repo by itself) to clone it for every line, at `SPEAK_SAMPLING`.

## Routine

1. **Pull first** and note the locked versions of mlx-audio, mlx and transformers.
2. **Read every release between the locked version and the new one**, not just the latest ([releases](https://github.com/Blaizzy/mlx-audio/releases)). Look for changes to Qwen3-TTS and Higgs (sampling defaults, how text is read in, the model type mapping), to `generate` and its arguments as `serve.py` calls them, to memory, and to the Python range. A changelog entry says code changed, not that the voice service is affected: read the code where it matters, in the installed package under uv's cache.
3. **Ask before upgrading if the release changes the install**: a new Python minimum, torch or transformers moving a major version. A routine release can be locked straight away.
4. **Lock and diff.** Run the `uv lock` above and read `git diff python/voice/serve.py.lock`: name every package that moved, from and to.
5. **Check it against the version before, on the same input.** With the voice service stopped (the app starts it when needed), design one voice from a fixed description and seed, and clone four lines from one reference clip (three said, one whispered thought), the same text and seeds on both versions. Use public text (the tavern Scenario's), not a real Session. Compare:
   - **Speaking**: cloned from the same reference clip, are the lines byte for byte the same? If not, their median pitch against the reference's, and listen. This is what decides whether Characters' saved voices still sound the same.
   - **Designing**: the same description and seed may give another take; say so, and its median pitch, but a new take changes no saved voice.
   - **Time** per line and **memory** (`/health` reports the memory the service holds), and any new warning in the log (three are known: transformers on the `qwen3_tts` type, a divide in Higgs's codec, a leaked semaphore at shutdown).
6. **Run the app**: design a voice and speak a few lines in a test Roleplay made from the tavern Scenario, then delete it.
7. **Benchmarks are scheduled, not run.** A longer comparison (the 29-line Kael conversation, pitch over several seeds, as in [research/voices.md](./research/voices.md)) is GPU time: say what will run and how long, and wait for the owner to pick a time.
8. **Record the result.** Add a dated section to [research/mlx-audio-upgrade-log.md](./research/mlx-audio-upgrade-log.md) (newest first): versions from and to (mlx-audio, mlx, transformers), what was checked, what changed, and what wasn't tested. Update `models.md` if the version it names or a number changed.
9. **Commit the lock with the log**, as `build(voice): mlx-audio <version>`, after the owner's yes.

## Review prompt

> mlx-audio **[new version]** is out; the voice service's lock has **[locked version]**. Read the release notes from the locked version through the new one at <https://github.com/Blaizzy/mlx-audio/releases>. Compare them with `python/voice/serve.py` (the models, how each is loaded and called, the sampling) and `docs/research/mlx-audio-upgrade-log.md`. Tell me: any change to the install (Python, mlx, torch, transformers), anything breaking for the voice service, changed defaults for Qwen3-TTS or Higgs (read the code, not only the notes), and fixes for anything in `docs/research/voices.md` or the open threads. Don't change the lock or run anything until I say so; propose the lock and the check first.
