# Voices: findings

The evidence behind the voice setup in [models.md](../models.md): how the voice engine was chosen, how lines are directed, the audio format, and the voice service's memory. Everything here runs through mlx-audio on the Mac; what changed with each mlx-audio release is in [mlx-audio-upgrade-log.md](mlx-audio-upgrade-log.md), and voices through ComfyUI on the PC in [comfyui.md](comfyui.md#voices-through-comfyui). The lines and clips are kept in [bench/voices/](../bench/voices/).

## Choosing the engine and directing lines (2026-09-30 to 2026-10-01)

Measured 2026-09-30 on a 48 GB Mac, everything through mlx-audio. The brief: each Character's voice
**unique** (designed for them) and **expressive** (suiting each moment), and the same voice from the
first line to the last. The lines and clips are kept in [bench/voices/](../bench/voices/).

**Round 1, six lines** of Kael's (dry, a flat warning, just stabbed, menacing, exhausted, stunned),
in a voice designed from his Cast by Qwen3-TTS VoiceDesign:

| Setup | Voice | Emotion control | Per line | Peak memory | Heard |
| ----- | ----- | --------------- | -------- | ----------- | ----- |
| Higgs TTS 3 (4B), cloning | the designed clip | inline tags (`<\|emotion:anger\|>`, pauses, sighs…) | 1.5–3.5 s | ~10 GB | usable |
| Qwen3-TTS VoiceDesign (1.7B), afresh per line | redesigned from the description each time | instructions in words | 0.5–1.7 s | ~7 GB | usable, but drifts |
| Qwen3-TTS Base (1.7B), cloning | the designed clip | none: cloning ignores instructions | 0.5–1.5 s | ~9 GB | generic |
| Chatterbox, cloning | the designed clip | one intensity dial | 0.7–2 s | ~4 GB | generic |

Speech-to-text heard the right words on all but one-word lines ("Debt?" as "Oh, dead?" or
"Debts?"); no tag was ever read aloud. The two that cloned without steering the delivery sounded
generic; VoiceDesign drifts from line to line, as nothing anchors it. So: design the voice once,
clone it with Higgs.

**Round 2, the whole conversation** (29 lines, emotion, style, pace and sounds chosen by gemma4
from each Reply): **Higgs drifted**. Kael's first lines were right; then his voice rose, and six
lines were a woman's. Pitch tracked what was heard: the designed clip is 97 Hz, the lines heard as
right 86–87 Hz, the six heard as a woman's 167–336 Hz. Over eight lines, three seeds each, at
70–125 Hz:

| Higgs TTS 3 | Kael's pitch held |
| ----------- | ----------------- |
| emotion + style tags, default sampling (temperature 1.0, no top-k) | 6 of 24 |
| Boson's sampling (0.8, top-k 50) | 11 of 24 |
| steadier sampling (0.5, top-k 30) | 11 of 24 |
| steadier, emotion tag only | 14 of 24 |
| steadier, emotion tag only, an 18 s reference instead of 8 s | 16 of 24 |
| **steadier, untagged** | **24 of 24** |
| **steadier, pace, pauses and sounds only** | **24 of 24** |

The emotion and style tags pull the clone off the voice ("disgust" put "Keep it buttoned" near
240 Hz on every seed). **Round 3**, all 29 lines untagged with steadier sampling: one voice
throughout, "not gruff enough but consistent". That's what the app does: the Text Model describes
the voice from the Cast in sound terms, VoiceDesign designs it once, and Higgs clones it, untagged,
for every line. In the app's own first run, gemma4's description of Kael ("low pitch with a
gravelly, husky texture") came out deeper than the test voice: 70–79 Hz against 97, which may help
with the missing gruffness.

**Round 4, a woman's voice** (2026-10-01): ten of Elara's lines, teasing to furious, from two new
Roleplays, in a soft voice written by hand ("soft, low, warm…"), untagged:

| Setup | Pitch (ref 170 Hz) | Held the voice | Breathiness, HNR (ref 13.1 dB) | Per second of speech | Heard |
| ----- | ------------------ | -------------- | ------------------------------ | -------------------- | ----- |
| **Higgs TTS 3** | 164–214 | 9 of 10 | 13.8 | 0.8 s | **best** |
| Qwen3-TTS clone | 165–195 | 10 of 10 | 15.0 | 0.4 s | decent but bland |
| Chatterbox | 169–182 | 10 of 10 | 14.0 | 0.45 s | weird, inconsistent, "not a native speaker" |
| KugelAudio (7B, own voice) | 123–308 | 1 of 10 | 10.0 | 8 s | a man on one line |

Untagged, nothing drifted, Higgs included, as with Kael. KugelAudio can't clone in mlx-audio and
ships four preset voices, so it can't give a Character their own voice. Higgs stays.

**The voice prompt made Elara a child.** Described by gemma4 from her Cast as "a high, melodic
pitch… lyrical cadence", VoiceDesign made her 338 Hz, high and chirpy (a woman's speaking voice is
about 160–230 Hz). VoiceDesign takes words literally, so `voice.md` now asks for a natural adult
voice: an adult age ("a woman in her early twenties"), a register (low, low-mid, mid), and none of
the words that push a voice young or extreme (high-pitched, chirpy, girlish, melodic, lyrical…).
Three descriptions each, designed: Elara 165–271 Hz (one take at the upper edge; New take fixes
that), Kael 88–103 Hz, all stating an adult age.

**Round 6, more expression without breaking the voice** (2026-10-01): Kael's six test lines and
Elara's ten (soft voice), each four ways on Higgs TTS 3, deliveries set by hand so the methods are
judged and not the directing:

| Method | Voice held (pitch within 20%) | Heard |
| ------ | ----------------------------- | ----- |
| untagged (as before) | 15 of 16 | the baseline |
| **pace and sounds**: a pace, pauses between sentences when slow, a sigh, laugh or cough first | 14 of 16 | **better than untagged** |
| mood clips: each Character speaks five charged sentences (playful, angry, hurt, scared, intimate) in their own cloned voice; a line is cloned from the clip of its mood | 14 of 16 | too subtle: cloning copies the timbre, little of the mood |
| emotion tag + pitch guard: re-speak a line that strays, up to three times, else untagged | 10 of 16; 6 fell back | no different from pace and sounds |

The guard defeats itself: in Higgs a strong emotion and a pitch shift come together, so it throws
away the takes where the tag did something and keeps the subtle ones. Making Kael's mood clips
drifted the same way (angry: 345 Hz on all five tagged tries, against his 97). A voice also rises
naturally when shouting (Elara's desperate line at 214 Hz against 170 is right), so ±20% can't
tell "angrier" from "someone else"; a man turning into a woman is far outside it.

So lines are directed with a pace and a sound, by the Art Agent's model (`voice-delivery.md`, at
temperature 0.3). Asked for mood and emotion too, both gemma4s over-acted, marking nearly every
line slow. Narrowed to pace and sound with "normal" the default, the heretic gemma-4 26B-A4B still
read Kael's clipped, flat manner as weary (two lines slow, every run); two rules fixed that (their
usual manner is never a reason to change pace; when unsure, normal): the heretic 16 of 16 twice,
gemma4 31B 15 and 16. At the default temperature the same line came back slow one time in two.

**Round 7, thoughts** (2026-10-01): six thoughts each for Kael and Elara, directed as the app does
(told it's a private thought), spoken plain and with Higgs's whispering style. Whispered sounded
better, and kept the voice: Kael 82–99 Hz against his 97, Elara 175–184 against her 170, unlike the
emotion tags; Higgs's whisper is hushed and breathy rather than toneless. A cough the director put
on Kael's thought sounded wrong in the mind, so thoughts take a pace but never a sound.

Other notes:

- Gemma4 asked to write Higgs tags freely used only pauses, mid-phrase ("Keep <pause> it
  buttoned"); given fixed choices (an emotion, a style, a pace, a sound) it overused "slow",
  "sadness" and whispering. Moot while the tags stay off; pace and sounds are safe if wanted.
- Speaker-similarity scores (Qwen3-TTS's speaker encoder) didn't separate voices: a woman's scored
  0.95 against Kael, as close as his own lines. Pitch and listening are the tests.
- Also looked at: VibeVoice (long multi-speaker podcasts; no per-line emotion control; the 7B was
  withdrawn; KugelAudio, tested above, is built on it), Kokoro (preset voices only), Voxtral TTS, CSM and OmniVoice (no emotion control).
  Higgs TTS 3 is research and non-commercial licensed; Qwen3-TTS is Apache 2.0, Chatterbox MIT.
- mlx-audio doesn't map Higgs's renamed repo (`bosonai/higgs-tts-3-4b`) to its model by itself:
  load it with `model_type='higgs_audio_v3'`. Its codec needs torch.

## Audio format (2026-10-02)

Spoken lines and thoughts are saved as **MP3 at 96 kbps** (24 kHz mono, what Higgs speaks); the
voice's reference clip stays WAV, since every line is cloned from it, and lines spoken before stay
WAV and keep playing. A line is about a quarter of its WAV (a 7.7 s line: 360 KB against 90 KB; a
200-line Roleplay ~7 MB instead of ~30 MB). Listened to on Kael's voice and both Elara voices, a
line and a whispered thought each, at 64, 96 and 128 kbps: none could be told from the WAV, so 96
was picked as the margin over 64 for whispers (mostly breath, which MP3 handles worst).

- **Encoder:** libsndfile through soundfile (bundled in its wheel), in 3–4 ms a line; mlx-audio's
  own MP3, FLAC and Ogg go through ffmpeg, which the app otherwise doesn't need. libsndfile takes a
  compression level, not a bitrate: at a constant bitrate 0.4 gives 96 kbps, 0.6 64, 0.25 128.
  Its `.ogg`/`vorbis` in mlx-audio are FLAC inside Ogg, nearly FLAC-sized.
- **Memory and speed:** none to speak of. Browsers decode any format to PCM to play it, and
  encoding takes milliseconds against seconds to speak the line: the saving is disk.
- **Playback:** every browser plays MP3 (checked in Chromium: full length, `canPlayType`
  "probably"), and VS Code's audio preview opens `.mp3` and `.wav` but not FLAC or M4A. Ogg Opus
  would be ~3× smaller again but Safari's support is unconfirmed.

## The voice service's memory (2026-10-01)

The voice service held 36 GB with only Higgs (~10 GB) loaded, and later 46 GB
with nothing loaded. Two causes: MLX keeps each generation's working memory for reuse (now capped
and cleared after every request: 9.1–9.7 GB over a run of long lines), and the models hold
reference cycles, so an unloaded model stayed in memory until Python's cycle collector happened to
run: every idle unload and every switch between VoiceDesign and Higgs left one behind. Unloading
now collects them: designing, speaking and unloading three times over goes 4.6 → 8.8 → 0 GB each
round. Its `/health` reports the memory it holds (`gb`). Reloading Higgs takes 1.9 s warm and 3.2 s
straight after Qwen-Image, so it now unloads after a minute unused instead of ten.
