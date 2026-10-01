# Character voices: a fixed test set

The reference behind "Voices" in [models.md](../../models.md): one Character's lines spoken by local
TTS setups, so a new model can be tried on the same lines and voice, and compared by ear and by
pitch.

## What's here

- `kael-ref.wav`: Kael's voice, designed by Qwen3-TTS VoiceDesign from a description of his Cast
  (in `render.py`). The cloning setups copy it; its pitch is about 97 Hz.
- `clips/round1-*`: six of Kael's lines from the tavern Roleplay, each with a different moment
  (dry, a flat warning, just stabbed, menacing, exhausted, stunned), on four setups: Higgs TTS 3
  with hand-written emotion tags, Qwen3-TTS cloning, Chatterbox, and Qwen3-TTS VoiceDesign afresh
  per line.
- `clips/round2-tagged`: all 29 of Kael's lines on Higgs TTS 3, with emotion, style, pace and
  sound tags chosen by gemma4 from each Reply. It drifted: listened to in order, his voice rose,
  and six lines came out as a woman's.
- `clips/round3-untagged`: the same 29 lines on Higgs TTS 3, untagged, with steadier sampling
  (temperature 0.5, top-k 30). It held; this is what the app does.
- `results.json`: per clip, the text sent, timings and memory (round 1), what a speech-to-text
  model heard, and its median pitch; the delivery gemma4 chose for each line; and the stability
  test (eight lines × three seeds per setting) behind round 3.
- `render.py`, `pitch.py`: speak the lines with a setup, and measure pitch.
- `elara/`: a woman's voice (2026-10-01). Ten of Elara Vance's lines, teasing to furious, from two
  Roleplays (a flirty business proposal, and the tavern story with the roles swapped; the texts
  are in `elara/results.json`), in a soft voice written by hand (`ref-soft.wav`, 170 Hz), on
  Higgs TTS 3, Chatterbox, Qwen3-TTS cloning and KugelAudio (which can't clone, so it picks its
  own voice). `ref-app-too-high.mp3` is the voice the app first designed for her, at 338 Hz: a
  child's, from the description "a high, melodic pitch… lyrical". `results.json` has each clip's
  pitch, breathiness (harmonics-to-noise) and brightness (spectral centroid), what speech-to-text
  heard, and the voices the fixed prompt describes.

- `expression/`: Round 6 (2026-10-01), four ways to add expression on Higgs TTS 3, on Kael's six
  lines and Elara's ten: `clips/` has each line untagged and with pace and sounds (the one the
  app uses), `moods/` each Character's mood clips, and `results.json` the deliveries, pitches and
  how the Text Models scored as directors.

## Trying a new model

1. Add it to `SETUPS` in `render.py`: its repo, and how a line (and the reference clip) is passed.
2. `uv run render.py <name>` for the six lines, or `--story` for all 29; output goes to `out/`.
3. `uv run --with librosa python pitch.py out/<name>/*.wav`, then listen against the clips here.

## Caveats

Pitch catches the worst drift (a man's voice turning into a woman's: 167–336 Hz against Kael's
86–97 Hz) but not all of it: three lines heard as "no longer gruff" measured 99–102 Hz. A speaker
similarity model didn't help either: it scored a woman's voice as close to Kael as his own lines.
So the final judgement is by ear.

It's one Character, one designed voice and one Roleplay. A voice that's easier to clone (or harder)
may behave differently, and an mlx-audio or model update may change what a setup does.
