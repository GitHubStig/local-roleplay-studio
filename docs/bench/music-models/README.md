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

## ACE-Step 1.5 through ComfyUI (2026-11-08, Mac)

`ace.py`: ComfyUI 0.44.2 (Comfy Desktop, on Metal), its own "ACE-Step 1.5 split" template in API format: the 2B turbo (`acestep_v1.5_turbo`, 4.8 GB), the 0.6B and 1.7B text encoders (the 1.7B writes audio codes first, `generate_audio_codes`), the VAE; 8 steps, euler, simple, shift 3, seed 1. The captions are written as ACE-Step's guide asks (its repo's `docs/en/Tutorial.md`): prose on style, emotion, instruments, timbre and production, with no tempo, key or length in them, those set as the node's own inputs; an instrumental's lyrics are section tags that agree with the caption (`[Intro - solo fiddle]`, `[Main Theme - fiddle and cello]`…). Memory is the Mac's in use, before and at the most (polled every 2 s), not the process's own.

| Case | Asked | Length | Time | Memory in use | Key asked → heard | BPM asked → heard |
|---|---|---|---|---|---|---|
| Tavern | 60 s | 60.0 s | 89 s (first, with the load) | 13.3 → 32.9 GB | A minor → A major/minor | 70 → 144 (double time) |
| Tavern | 180 s | 180.0 s | 229 s | 27.8 → 38.5 GB | A minor → A major/minor | 70 → 70 |
| Tavern, tense | 60 s | 60.0 s | 77 s | 34.2 GB | D minor → D minor | 96 → 96 |
| Heaven, wordless choir | 60 s | 60.0 s | 76 s | 21.3 → 27.4 GB | D major → A major/D major | 60 → 108 |
| Buffet | 60 s | 60.0 s | 76 s | 27.4 → 27.6 GB | F major → F major | 66 → 136 (double time) |
| Tavern, D minor | 60 s | 60.0 s | 77 s | 27.6 GB | D minor → D major/minor | 70 → 70 |
| Tavern, A major | 60 s | 60.0 s | 76 s | 21.4 → 27.8 GB | A major → A major | 70 → 70 |
| Song with lyrics | 150 s | 150.0 s | 199 s | 24.3 → 34.5 GB | G major → G major | 72 → 72 |

- **The length is ours**: every clip is the length asked, each ending in a fade to silence (−65 dB), 180 s included.
- **Quick**: about 1.3 s of rendering a second of music (76 s for 60 s, 229 s for 180 s), three to four times quicker than MiniMax on the Mac.
- **Keys and tempo followed**: every clip's estimated key has the asked-for root, and four of the six major or minor right (a rough estimate; the other two heard as their parallel); the tempo is the asked-for BPM or double it, which a beat tracker often reports for slow music, except Heaven's.
- **Memory**: ComfyUI took about 10–20 GB above what was in use before, which leaves less room beside it than this Mac's 48 GB suggests; it keeps the models loaded between runs (the app unloads with `/free`).
- **Lyrics**: Whisper heard the whole song as written, both verses and choruses, but for small slips ("quay" as "Queen", "set" as "I said"), then the outro, which had no words, as made-up ones ("Join me, who are my friends…").

- **By ear** (the owner, 2026-11-08): much better than MiniMax and fits the scenes better; the tavern and the song "sound good"; Heaven began well, then went somewhere the owner didn't like, which may be tweakable. Between the two, the owner would leave ACE-Step's on.

## Captions tried again, and the XL turbo (2026-11-08, Mac)

**Captions** (the 2B turbo, two seeds each), after the owner's listen:

- *Tense, second try* (`tavern-tense-2-60`): the first ("creeping menace under a calm surface, a friendly face hiding a knife") wasn't tense at all, probably as it described the scene's subtext, which the model heard as calm. The second named only the sound (a low cello drone, sparse dissonant fiddle, a heartbeat drum, dread) and added negations ("no melody that resolves"): seed 2 slightly better, quiet at the start, with a "weird electronic instrument" and a silence at 35–38 s; "not great".
- *Heaven, second try* (`heaven-2-60`): the first began well and climbed into high, busy organ after 20 s, following "rising slowly like light through clouds" and a "rising" section. The second rewrote it all, "low", "still", "unchanging", with negations ("no high organ notes"): "just bad", the choir gone. Too much changed at once, and negations, which the plan already warns pull in what they name.
- *Heaven, third try* (`heaven-3-60`): the first caption with only the rising words taken out: seed 1 "still not what I want", seed 2 "alright-ish". The owner then said what was missing: "more low choir singing in the background".
- *Heaven, fourth try* (`heaven-4-60`), the owner's words in the caption and each section tag: on the 2B, seed 2 better than seed 1 "but still meh".

So: describe what's heard, never the subtext; change one thing at a time; no negations; and the seed matters as much as the caption (one seed bad, the other alright, from the same words), so a Cue may want a take or two to pick from. The player's own words ("more low choir in the background") are what a steer should be.

**The XL turbo** (`acestep_v1.5_xl_turbo_bf16`, 4B, 10 GB; the 1.7B planner kept, where ComfyUI's XL template uses the 4B), the first captions unchanged, seed 1, and Heaven's fourth on two seeds ([clips](clips/ace-step-1.5-xl-turbo/)):

- **As quick as the 2B**: 79–85 s for 60 s of music; the song in about the same time as the 2B's. 5–8 GB more in use at the most (36–39 GB of the Mac's, against 27–34).
- **By ear** (the owner): richer, but "a bit more synthesizer-ish"; some instruments sound ok; the song's voice is good; every clip seemed faster in beat than the 2B's. Heaven's fourth: seed 1 "ok, no choir but fits the scene", seed 2 "similar-ish and decent", better than the 2B's.
- The "faster" isn't the tempo, as far as can be measured: a beat tracker reads slow, sparse music poorly (the same clip at 54 or 172 BPM), but the XL plays more notes in some (Heaven 5.2 onsets a second against 1.8, tense 3.5 against 2.8, the rest about the same), so busier playing, more likely.

## Not checked yet

- **MiniMax with Structured Captions** written for the scenes, and more seeds: how long instrumental pieces tend to run, and whether section tags (`[intro]`, `[verse]`, `[outro]` with `[instrumental]`) make them longer.
- **Whisper's word times** on the song, for the end credits.
- **ACE-Step on the PC** (CUDA, 12 GB): whether the XL fits.
- **The XL with its 4B planner** (`qwen_4b_ace15`, 8.4 GB more), as ComfyUI's template has it.
- **ACE-Step's reference audio, cover and repaint**: variations of a Cue, and extending one by repaint (3–90 s at a time, per its guide).
