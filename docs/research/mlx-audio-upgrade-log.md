# mlx-audio upgrade log

Newest first. The procedure is in [mlx-audio-upgrade.md](../mlx-audio-upgrade.md). mlx-audio runs the voice service (`python/voice/serve.py`) on the Apple Silicon Mac only; the Windows PC speaks through ComfyUI.

## 0.6.5 — Mac, 2026-11-10

From 0.6.4. Only mlx-audio moved in the lock: 0.6.5 lets mlx be later than 0.32.4 (#1128) rather than pinning it, but `--upgrade-package mlx-audio` leaves it at 0.32.4, with transformers 5.20.2 and torch 2.14.1. The project has moved from `Blaizzy/mlx-audio` to `Neywa-Labs/mlx-audio` (the old address redirects). Read for the voice service's two models:

- **Qwen3-TTS** (designing): its speech decoder now keeps to the model's sliding window of 72 frames, 5.76 s, rather than looking back over the whole clip (#1117, which brings it in line with the PyTorch decoder), and frames whose first code is 0 are no longer cut from the end of the audio (#1116). Both change the decoded audio, so a new design can come out as another take.
- **Higgs** (speaking): `top_k=1` was broken and is fixed (#1134). At the service's `top_k=30` the old and new slices pick the same logit, so nothing changes there. The top-p fix (#1149) touches other models, not Higgs or Qwen3-TTS.
- The rest add Nemotron Unified speech recognition, fix text normalizers (Zonos2, IndexTTS, Soprano, LongCat, MeloTTS, PocketTTS) and fix other models. The service uses none of them.

The check was the same as for 0.6.4, rerun on both versions: one voice designed from a fixed description (seed 7) and four lines cloned from it (seed 3: plain, slow with a sigh, fast, and a whispered thought), with tavern-style text:

- **Speaking is unchanged**: the four lines cloned from 0.6.4's clip on 0.6.5 are byte for byte the same. A Character's saved voice sounds exactly as before.
- **Designing gives another take**, as expected from #1116 and #1117: the same length (7.52 s), with a median pitch of 146 Hz against 142. The lines cloned from it followed it (111, 142 and 109 Hz against 108, 113 and 105). Not judged by ear.
- **The same time and memory**: 2.0–4.9 s a line (the first includes loading Higgs), 2.9 s to design (3.5 on 0.6.4), with 4.6 GB held while designing and 12–14 GB while speaking. The higher figure is the long line below, not a change.
- The same warnings, none new.
- **Found by the way, on both versions alike**: cloned from 0.6.4's clip, the slow line with a sigh ran on to 48 s (36 s to render), with a steady sound at about −21 dB for 40 s after the words, so Higgs looped and didn't end. Cloned from 0.6.5's take at the same seed, the same line was 12.6 s. One seed on one clip, so it isn't known how often it happens. Not listened to yet.
- Not run: the app itself (step 6). `serve.py` is unchanged and speaking is byte for byte the same.

## 0.6.4 — Mac, 2026-11-06

From 0.6.1, skipping 0.6.2 and 0.6.3. Only mlx-audio moved in the lock: mlx stays 0.32.4 (0.6.4 pins it), transformers 5.20.2, torch 2.14.1, and mlx-audio now asks for `transformers[chat-template]`, whose jinja2 was already locked. The releases add models (Ming 3.0, Maya-2, Audio8-TTS, LFM3-Audio, Nemotron and Granite speech recognition) and fix others; two touch the voice service's: Higgs prefills a shared reference once per batch (#1091, in its batched path, which `serve.py` doesn't use), and Qwen3-TTS primes its streaming decoder with the reference's codes when cloning (#1096, not VoiceDesign, and not streamed here). The same check as for 0.6.1, rerun on both versions: one voice designed from a fixed description (seed 7) and four lines cloned from it (seed 3: plain, slow with a sigh, fast, and a whispered thought), with tavern-style text:

- **Everything is byte for byte the same**, the designed voice included, and so are the four lines cloned from 0.6.1's clip on 0.6.4. A Character's saved voice sounds exactly as before, and a new one designed from the same description comes out the same too.
- **The same time and memory:** 2.3–5.3 s a line (the first includes loading Higgs), 3.9 s to design once Qwen3-TTS is loaded from a warm disk (10.1 s on the first, cold, run on 0.6.1); 4.6 GB held while designing, 8.8 GB while speaking.
- The same three warnings, none new.
- Not run: the app itself (step 6). `serve.py` and its calls are unchanged and the service's outputs are identical, so a Roleplay in the app was skipped.

**Music.** mlx-audio has had a music side since 2026-08 (`mlx_audio.music`, already in 0.6.1), with one model, MiniMax Music 3 (a Qwen3 planner, an RVQ depth decoder, a flow-matching transformer and a stereo 44.1 kHz vocoder; songs from a caption and tagged lyrics, or `[instrumental]`, up to 360 s). mlx-community has it at bf16, 8-, 6- and 4-bit, mxfp8 (the one its docs recommend for lyrics), mxfp4 and nvfp4. Not tried yet: see the open thread on music.

## 0.6.1 — Mac, 2026-10-21

From 0.5.9, with transformers 5.20.1 to 5.20.2. One voice designed from a description and four lines cloned from it (three said, one whispered thought), the same text and seeds on each version:

- **Speaking is unchanged:** cloned from the same reference clip, every line and the thought came out byte for byte the same on 0.6.1, in the same time (2.6–3.9 s a line). A Character's saved voice sounds exactly as before.
- **Designing a voice changed:** the same description and seed gave another take (a median pitch of 139 Hz against 149, 5.1 s against 4.6 for the reference sentence; lines cloned from it followed it down). Voice design passes no sampling of its own, and 0.6.0 made Qwen3-TTS use the model's own sampling settings by default and changed how it reads in the text ("prefill full text to avoid slow speech"). Speaking passes its own (`SPEAK_SAMPLING`), so it's untouched. Not judged by ear yet whether the new takes are better.
- The same three warnings are logged on both versions (transformers on the `qwen3_tts` type, a divide in Higgs's codec, a leaked semaphore at shutdown), so none is new.

## 0.5.9 — Mac, before 2026-10-21

The version locked when each Python program first got a lock (`build(python): lock each program's packages at the versions in use`); the voice benches of 2026-09-30 to 2026-10-02 ([voices.md](voices.md)) ran on an mlx-audio of that time, not recorded.
