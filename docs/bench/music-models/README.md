# Music models bench

Stage 2 of [the music plan](../../music-plans.md): what each music model does with the captions an adapter would write from a Score and a Cue. `render.py` renders its cases (MiniMax Music 3 through mlx-audio, on the Mac); clips go to `out/` as WAV (gitignored), timings to `results.jsonl`; the clips kept for reference are in [clips/](clips/), one folder per build, as 96 kbps AAC (`ffmpeg -i x.wav -c:a aac -b:a 96k x.m4a`). The captions follow the example Scenarios' Music sections; the song quotes tavern-style lines of the kind a Roleplay collects.

## MiniMax Music 3, mxfp8 against 4-bit (2026-11-07, Mac)

mlx-audio 0.6.4, `mlx-community/MiniMax-Music3-mxfp8` (13.9 GB) and `-4bit` (9.2 GB), seed 1, 30 steps, a 60 s cap (150 s for the song), the Text Model unloaded. "Ends" is how the last quarter-second sounds: about −50 dB is a fade to silence, the model's own end; louder is a cut at the cap.

| Case | mxfp8: length, time, peak | Ends | 4-bit: length, time, peak | Ends |
|---|---|---|---|---|
| Tavern | 29.6 s, 156 s, 30.2 GB | fade | 60.1 s, 262 s, 25.3 GB | cut at the cap |
| Tavern, tense | 14.6 s, 66 s, 21.2 GB | fade | 20.7 s, 85 s, 20.7 GB | fade |
| Heaven, wordless choir | 60.1 s, 301 s, 29.9 GB | cut at the cap | 31.8 s, 126 s, 26.4 GB | fade |
| Buffet | 28.7 s, 143 s, 30.0 GB | −36 dB, near a fade | 60.1 s, 247 s, 25.2 GB | cut at the cap |
| Tavern, "in D minor" | 14.0 s, 64 s, 21.1 GB | fade | 23.8 s, 91 s, 21.7 GB | fade |
| Tavern, "in A major" | 20.5 s, 101 s, 25.3 GB | −44 dB | 31.1 s, 126 s, 26.2 GB | fade |
| Song with lyrics | 28.1 s, 143 s, 29.8 GB | fade | 103.3 s, 447 s, 21.7 GB | fade |

- **The length is the model's.** The duration given is only a cap (mlx-audio's `max_frames`): the model ends a track when it samples its end token, so the same caption and seed ends at a different point on each build, and asking for 60 s or 120 s gives the same clip byte for byte (mxfp8 tavern). Instrumental pieces ran 14–32 s when they ended on their own; three of the 14 ran into the cap.
- **Time**: about 4–5 s to render each second of music on either build, the 4-bit a little quicker (4.0–4.4× against 4.6–5.3×). A 30 s Cue takes about 2 minutes.
- **Memory**: MLX's peak is 21–30 GB on either build, well above the weights; the 4-bit's is 0–5 GB lower. Nothing else of size fits beside it on the 48 GB Mac: the Text Model has to be unloaded.
- **Lyrics**: the 4-bit sang the whole song as written, verses and both choruses, in 103 s; Whisper (large-v3-turbo) heard it word for word but for two slips ("quay" as "king", "set" as "said", which may be Whisper's). The mxfp8 ended after 28 s with no voice Whisper could hear, though its model card recommends it for lyrics. One seed each.
- **Keys** (estimated from the clips' chroma, a rough guide): the 4-bit played D minor when asked; the other three asked-for keys came out elsewhere (A major as G minor, D minor as G# minor, A major as B minor). Not followed reliably.
- **No reference audio** in mlx-audio's MiniMax (a caption and lyrics only), so no variations or extensions on the Mac: a Cue's music is a short piece that ends, to be looped or crossfaded.

## nvfp4 (2026-11-08, Mac)

`mlx-community/MiniMax-Music3-nvfp4` (14 GB on disk, as big as the mxfp8), the same cases and seed.

| Case | Length, time, peak | Ends |
|---|---|---|
| Tavern | 60.1 s, 251 s, 25.3 GB | cut at the cap |
| Tavern, tense | 27.7 s, 114 s, 24.0 GB | fade |
| Heaven, wordless choir | 43.7 s, 183 s, 31.3 GB | fade |
| Buffet | 25.8 s, 108 s, 23.6 GB | fade |
| Tavern, "in D minor" | 60.1 s, 261 s, 25.3 GB | cut at the cap (heard as G major) |
| Tavern, "in A major" | 20.1 s, 84 s, 20.5 GB | fade (heard as C# minor) |
| Song with lyrics | 150.2 s, 670 s, 19.2 GB | cut at the cap |

- About 4.2–4.5 s a second of music, as the others; the peak no lower than the 4-bit's.
- The song: the first verse, the chorus and the second verse as written, then a garbled line ("In the hand in the air, Minuatu"), the second verse twice more, no second chorus, and cut at 150 s. Worse than the 4-bit's.
- Neither asked-for key followed.

## bf16 (2026-11-08, Mac)

`mlx-community/MiniMax-Music3-bf16` (27 GB on disk), the uncompressed model, the same cases and seed, with nothing else loaded.

| Case | Length, time, peak | Ends |
|---|---|---|
| Tavern | 23.2 s, 138 s, 53.1 GB | fade |
| Tavern, tense | 60.1 s, 360 s, 51.4 GB | cut at the cap |
| Heaven, wordless choir | 59.7 s, 366 s, 51.3 GB | cut at the cap |
| Buffet | 35.5 s, 211 s, 53.6 GB | fade |
| Tavern, "in D minor" | 60.1 s, 355 s, 51.4 GB | cut at the cap |
| Tavern, "in A major" | 20.1 s, 119 s, 50.5 GB | fade |
| Song with lyrics | 112.2 s, 696 s, 53.6 GB | fade |

- **Too big for the 48 GB Mac**: MLX's peak is 50–54 GB, so it ran into swap (5.4 GB of swap before, 9.3 GB at the most; 22% of memory free at the lowest) and took about 6 s a second of music, against 4–5 s for the compressed builds.
- **The song**: the whole song as written, both choruses, then about 30 s more of made-up words ("Get ready, Druring you Christmas") before it faded. The same course as the 4-bit's until the end.
- **No better by the numbers**: its lengths are as scattered as the compressed builds', so the inconsistency is the model's (or mlx-audio's port), not the compression's.

## MiniMax's own example (2026-11-08, Mac)

The model card's reproducible request (`scripts/end_to_end/minimax_ttm_test.py` and its audio, `assets/minimax_ttm.wav`, on [MiniMaxAI/MiniMax-Music3](https://huggingface.co/MiniMaxAI/MiniMax-Music3)): a blues-rock song, its caption a Structured Caption of several paragraphs (Global Metadata, Vocal Details, Arrangement: the emotional course, the setting, the production, each instrument's part section by section). `render.py reference-120` reads it from the script fetched into `out/reference/`. On the 4-bit, capped at 120 s: 120.2 s in 663 s, 29.2 GB ([clip](clips/MiniMax-Music3-4bit/reference-120-s1.m4a)).

- The owner: ours "sounds fine"; MiniMax's own is more rock, ours lower and smoother. So mlx-audio's port and the 4-bit aren't what made the bench's clips bad.
- MiniMax's own clip has the same sound the owner heard in ours: "a tiny bit high, warbly, tangy, electronic-ish, fake-ish". That's the model's.
- How it's meant to be prompted, which the bench's captions weren't (one line of tags): MiniMax Music 3 is made for songs with vocals; instrumentals come from `[instrumental]` and are secondary (the guides say to give section tags, `[Intro]`, `[Instrumental]`, `[Solo]`, `[Outro]`, rather than `[instrumental]` alone), which may be why voices came in where none were asked for. The caption it wants is prose only a Text Model could write from a scene, not a template's tags.

## Verdict on MiniMax Music 3 (2026-11-08)

Not good enough for the app's music, by the owner's ear: "all pretty bad… inconsistent… feels like super slop", the 4-bit song "ok-ish", and "I might just mute it". Against it as well: its length is its own (14–32 s, or cut at the cap), 4–5 s of rendering for each second of music, 20–30 GB on the Mac with the Text Model unloaded, voices where none were asked, no keys followed, and no reference audio for variations in mlx-audio. Of the four builds the 4-bit was best (it sang the song whole); the mxfp4 wasn't tried, as the least accurate 4-bit format. Better captions weren't tried; they might bring the instrumentals nearer the scene, but not remove the sound. Kept as the song model to compare with, for the end credits.

## Not checked yet

- **MiniMax with Structured Captions** written for the scenes, and more seeds: how long instrumental pieces tend to run, and whether section tags (`[intro]`, `[verse]`, `[outro]` with `[instrumental]`) make them longer.
- **Whisper's word times** on the song, for the end credits.
- **ACE-Step 1.5 through ComfyUI**, on the Mac and the PC: lengths it's asked for, reference audio, repaint and extend.
