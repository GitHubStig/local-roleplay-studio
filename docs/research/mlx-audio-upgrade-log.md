# mlx-audio upgrade log

Newest first. The procedure is in [mlx-audio-upgrade.md](../mlx-audio-upgrade.md). mlx-audio runs the voice service (`python/voice/serve.py`) on the Apple Silicon Mac only; the Windows PC speaks through ComfyUI.

## 0.6.1 — Mac, 2026-10-21

From 0.5.9, with transformers 5.20.1 to 5.20.2. One voice designed from a description and four lines cloned from it (three said, one whispered thought), the same text and seeds on each version:

- **Speaking is unchanged:** cloned from the same reference clip, every line and the thought came out byte for byte the same on 0.6.1, in the same time (2.6–3.9 s a line). A Character's saved voice sounds exactly as before.
- **Designing a voice changed:** the same description and seed gave another take (a median pitch of 139 Hz against 149, 5.1 s against 4.6 for the reference sentence; lines cloned from it followed it down). Voice design passes no sampling of its own, and 0.6.0 made Qwen3-TTS use the model's own sampling settings by default and changed how it reads in the text ("prefill full text to avoid slow speech"). Speaking passes its own (`SPEAK_SAMPLING`), so it's untouched. Not judged by ear yet whether the new takes are better.
- The same three warnings are logged on both versions (transformers on the `qwen3_tts` type, a divide in Higgs's codec, a leaked semaphore at shutdown), so none is new.

## 0.5.9 — Mac, before 2026-10-21

The version locked when each Python program first got a lock (`build(python): lock each program's packages at the versions in use`); the voice benches of 2026-09-30 to 2026-10-02 ([voices.md](voices.md)) ran on an mlx-audio of that time, not recorded.
