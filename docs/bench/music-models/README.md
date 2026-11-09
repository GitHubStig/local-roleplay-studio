# Music models bench

Stage 2 of [the music plan](../../music-plans.md): what each music model does with the captions a cue writer would give it, judged by the owner's ear; what was concluded is in [research/music-models.md](../../research/music-models.md). `render.py` renders MiniMax Music 3 through mlx-audio (dropped; its builds deleted), `ace.py` ACE-Step 1.5 through a running ComfyUI (the pick), `words.py` times a song's words with Whisper, and `analyse.py` sets measures of each clip beside the owner's verdicts (`verdicts.json`). Raw output goes to `out/` (gitignored), timings to `results.jsonl`; the clips kept for reference are in [clips/](clips/), one folder per setup, as 96 kbps AAC (`ffmpeg -i x.flac -c:a aac -b:a 96k x.m4a`): only those the owner liked and those that show a finding (27 of 89, 2026-11-08), so a clip named below may not be there; `verdicts.json` still lists every clip judged, and `analysis.jsonl` has its measures. The captions follow the example Scenarios' Music sections; the songs quote tavern-style lines of the kind a Roleplay collects. On the Mac (M5 Pro, 48 GB) unless a section says the PC; a row of `results.jsonl` with no `machine` is the Mac's.

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

## MiniMax with its own prompt format (2026-11-08, Mac)

A fair last test: the tavern, Heaven (the owner's low choir), the Buffet and a tense Cue as Structured Captions in the format of MiniMax's own example (Global Metadata with the BPM and key, the emotional progression, the setting, the production; an Arrangement saying when each instrument plays), the lyrics section tags (`[intro] [instrumental] [solo] [instrumental] [outro]`) rather than `[instrumental]` alone, as the guides advise. `render.py guide-*-120`, the 4-bit, seed 1, a 120 s cap ([clips](clips/MiniMax-Music3-4bit/)).

| Case | Length | Time | Peak |
|---|---|---|---|
| Tavern | 26.3 s | 111 s | 23.4 GB |
| Heaven | 22.1 s | 95 s | 21.2 GB |
| Buffet | 42.7 s | 196 s | 31.0 GB |
| Tense | 29.9 s | 132 s | 25.9 GB |

- **Still the model's length**: each ended itself (a fade) at 22–43 s, five section tags and a 120 s cap notwithstanding; the same 4.2–4.6 s of rendering a second.
- **By ear** (the owner): "much better than our initial batch". The tavern "ok, short and better"; the Buffet ok, but with singing, which may not fit the scene (voices again where none were asked); Heaven "like a Christmas song"; the tense Cue not tense and not tavern-like, "a different song".

So MiniMax's own format matters a great deal for it (as ACE-Step's guide did for ACE-Step), and the bench's first verdict was partly the captions' fault; but the length, the voices and the time remain.

## Verdict on MiniMax Music 3 (2026-11-08)

Not good enough for the app's music, by the owner's ear: "all pretty bad… inconsistent… feels like super slop", the 4-bit song "ok-ish", and "I might just mute it". Against it as well: its length is its own (14–32 s, or cut at the cap), 4–5 s of rendering for each second of music, 20–30 GB on the Mac with the Text Model unloaded, voices where none were asked, no keys followed, and no reference audio for variations in mlx-audio. Of the four builds the 4-bit was best (it sang the song whole); the mxfp4 wasn't tried, as the least accurate 4-bit format. Its own prompt format, tried after (above), made it much better by ear, but not its length (22–43 s), its voices where none were asked, or its time. **Dropped** (the owner, 2026-11-08), as its length can't be set; its model files removed once this was written down.

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

## Variations and extending (2026-11-08, Mac)

ComfyUI 0.44.2 has no template for either, and its ACE-Step 1.5 nodes are text to music and "Set Reference Audio" (`ReferenceTimbreAudio`) only; `ace.py`'s `FROM=` and `MODE=` build them from its own nodes.

- **Extending: not possible through ComfyUI's nodes.** ACE-Step's repaint (`src_latents`, `chunk_masks`) isn't exposed: its `extra_conds` (`comfy/model_base.py`, `ACEStep15`) passes only the reference audio. ComfyUI's general way, a latent noise mask over the new part (`LatentConcat` of the earlier audio and 30 s of empty latent, `SetLatentNoiseMask`), fails at sampling: the mask is reshaped for pictures (`[1, 1, 1, 900]`), one dimension too many for an audio latent ("Input and output must have the same number of spatial dimensions"). ACE-Step's own repo does repaint (3–90 s at a time, per its guide), if it's ever needed; with lengths of 3 minutes rendered directly, a long Cue may need it less than a player that loops.
- **Variations: "Set Reference Audio" is a cover.** ComfyUI's ACE-Step 1.5 treats a reference as the source the new music is built over (`is_covers`), the planner's audio codes off. From the XL tavern Cue (`tavern-60-s1`), on the XL, seed 1: the same caption again, and the tense caption ([clips](clips/ace-step-1.5-xl-turbo/)). Each took **29 s** for 60 s of music, a third of the time from text, as the planner doesn't run. The Mac's memory in use reached 47.4–47.6 GB of 48, but ComfyUI's own peak since it started (`footprint -p`, `phys_footprint_peak`) was 32 GB, over everything that day (the XL, the planner, the failed extension): the rest was most likely the owner's Text Model, loaded just before. From here, ComfyUI's own footprint is what to measure, not the Mac's.
- How much each follows the source, measured (a rough guide; the ear decides): harmony over time (the chroma's correlation, frame by frame) and the loudness's shape, against the source.

| Against `tavern-60-s1` | Harmony over time | Loudness shape |
|---|---|---|
| Cover, the same caption | 0.47 | 0.66 |
| Cover, the tense caption | 0.45 | 0.36 |
| The tense caption from text, for comparison | 0.26 | 0.23 |
| Heaven from text, for comparison | 0.13 | 0.33 |

The numbers overstate it. By ear (the owner): the same-caption cover "sounds a little similar but instruments seem different", and the tense cover "sounds totally different". So a full-strength cover doesn't keep Cues sounding like one score; ComfyUI's node takes no strength (ACE-Step's own `audio_cover_strength`). **Cues stay related by text**: the Score's instruments, genre and production in every Cue's caption, the Cue changing only the mood, energy and arrangement, and the player crossfading.

## The XL with its 4B planner (2026-11-08, Mac)

ComfyUI's XL template as it is: the XL turbo with the 4B planner (`qwen_4b_ace15`, 8.4 GB) in place of the 1.7B, the same captions and seeds as the XL clips above ([clips](clips/ace-step-1.5-xl-turbo-4b-lm/)). Memory is ComfyUI's own now (`footprint`, polled every 2 s), not the Mac's.

| Case | Time | ComfyUI's memory, at the most |
|---|---|---|
| Tavern | 174 s for 60 s (first, with the load) | 27.0 GB |
| Heaven, the low choir, seeds 1 and 2 | 170 s and 167 s | 26.0 GB |
| Tavern, tense | 169 s | 26.0 GB |
| Song with lyrics | 431 s for 150 s | 34.0 GB |

- **Twice as slow as with the 1.7B** (about 170 s against 80 s for 60 s of music): the planner, which writes the audio codes before the music model runs, is most of the time.
- ComfyUI keeps 21 GB loaded between runs, and reaches 26 GB for a minute of music, 34 GB for the song.
- **By ear** (the owner): the tavern and both Heavens "slow, somber… kinda can fit the scene", and richer, "like the instruments go along with each other"; the song "slow and moody… more thought and production-grade". The tense Cue still isn't tense, on any model or planner so far: the caption, or what this model makes of tension in folk, is the open question.

## Tension (2026-11-08, Mac)

No tense Cue had come out tense (three captions, two models, two planners), so three approaches, on the XL with the 1.7B planner, two seeds each ([clips](clips/ace-step-1.5-xl-turbo/)): **A** a thriller score (pulsing low strings in a staccato ostinato, dissonant stabs, a slow drum, 100 BPM; `tense-a-60`); **B** the tavern's instruments played the ways that make strings tense (a fiddle tremolo, a staccato cello pulse, a tight frame drum, 100 BPM; `tense-b-60`); **C** B at 132 BPM (`tense-c-60`). About 80 s each, ComfyUI at 24 GB.

- **A has tension**, by ear (the owner), but monotonous: the same stabs every few seconds without a break, nothing picking up until 20 s in, then only small additions. The caption asked for an ostinato and got one, literally.
- **B and C don't**: folk instruments sound "too playful" for tension, and C is "just regular folk". Tempo didn't carry it.

So a scene's tension may need a genre the Score's palette doesn't have: a folk Score's instruments undo it. Either the cue writer may step outside the palette for a scene that needs it (a Cue's instruments flagged off the palette, as now, rather than barred), or the Score names more than one register from the start. And a caption has to ask for development over time, not only a texture (A's stabs went on unchanged).

**D**, A rewritten as a course (`tense-d-60`, on the 4B planner, two seeds, 175–202 s, ComfyUI at 26–27 GB): the caption says how it unfolds (a low uneasy pulse; dissonant stabs break in and the pulse quickens; brass and a heavy drum join, climbing in waves; a near-silent break midway; a surge back; one low unresolved note), and each stage is a section tag, so the planner is given the shape twice ([clips](clips/ace-step-1.5-xl-turbo-4b-lm/)). By ear (the owner): **"actually good"**, the first tense Cue that is.

So, for the cue writer: a Cue's caption names the sound and **how it develops over the track**, and its section tags follow the same course, stage by stage; the genre may leave the Score's palette when the scene needs it (tension wasn't possible in folk). With the earlier rules: what's heard, never the subtext; no negations; the player's own words for a steer; a take or two to pick from.

## Course captions, and the 4B planner against the 1.7B (2026-11-08, Mac)

The tavern, Heaven and the Buffet written as courses too (`tavern-d-60`, `heaven-d-60`, `buffet-d-60`: how each unfolds, section tags following it), on the XL with the 4B planner and with the 1.7B, two seeds each, and D on the 1.7B ([4B](clips/ace-step-1.5-xl-turbo-4b-lm/), [1.7B](clips/ace-step-1.5-xl-turbo/)). 4B: 170–172 s for 60 s of music, ComfyUI at 26–27 GB; 1.7B: 79–84 s, 24 GB.

- **On the 4B, the course captions are the best yet**, by ear (the owner): both tavern seeds liked, the Buffet good and decent, Heaven's seed 2 liked (though no choir is heard in either seed).
- **On the 1.7B, usable but not great**: every clip "not bad" or ok, the tense Cue "some tenseness but a distracting tune and instrument" and "not bad"; louder, more going on and less smooth than the 4B's; Heaven more synthesizer-like; one Buffet "gappy, the instruments and tunes not layering or playing together". "Overall the 4B is better."
- So both did part: the course caption made the 1.7B's Cues ok where its earlier ones weren't, and the 4B planner made them good. **The 4B planner is the pick for quality, at twice the time.**
- The measures below don't see the difference between the planners: over the seven pairs of the same caption and seed, the 1.7B's are no louder (+0.04 dB on average), no busier (fewer notes a second, −0.8), no brighter, and no more synthesizer-like by CLAP (+0.005). What the owner hears ("playing together", "smooth") is the arrangement's coherence, which none of them measure.

## The ear against measures (2026-11-08, Mac)

`analyse.py` sets the owner's verdicts (`verdicts.json`: 47 clips since the planner comparison; 40 when first run, each 2 good, 1 ok, 0 bad, with the owner's words) beside measures of each clip, over 10 s windows: how far the sound moves from window to window (development), how alike all windows are (repetition), the loudness's range, brightness (spectral centroid), noisiness (flatness), notes a second; and CLAP (`laion/clap-htsat-unfused`, audio against text, on the CPU) for the clip against its own caption and against words for what may be in it. Results in `analysis.jsonl`. One listener, few clips: hints, not findings.

- **No measure predicts a liked clip overall** (Spearman across the 40, every measure within ±0.35; only "drums" past p 0.05, at −0.34). Clips of different scenes are good for different reasons, so a single score doesn't follow the ear.
- **CLAP doesn't pick the better take**: of four pairs of seeds where the owner preferred one, the clip nearer its own caption was the preferred one twice. So the app can't choose between takes by CLAP; the player picks.
- **But several of the owner's specific remarks are borne out:**
  - *"Like a Christmas song"* (MiniMax's Heaven): the most Christmas-like clip of all by CLAP (0.56; the other Heavens 0.18–0.42). Among the Heavens, the Christmas score runs against the verdict, a little: the bad ones 0.31–0.42, the liked `heaven-d-60-s2` 0.28 (corrected 2026-11-09: this said 0.18, its FLAC's figure beside the others' AAC; [see below](#clap-depends-on-the-audios-format)).
  - *"The choir is gone"* (Heaven's second try): the choir score fell from 0.41 on the first Heaven, the one that "started out great", to 0.21–0.25 on the second (other scenes, without a choir: 0.10 on average, 0.28 at most). The course Heavens score 0.24 and 0.33 (from their AAC, corrected 2026-11-09): some choir, perhaps too faint to hear as one, as the owner heard none.
  - *"Very monotonous"* (tension A): the least development of every clip (0.002–0.005, against 0.012–0.049 for the other tense clips) and the narrowest loudness range of the ACE-Step clips (4.1–4.6 dB). The tense Cue the owner liked (D) develops three times as much (0.015–0.016) and spans 6.8–8.0 dB.
  - *"A tiny bit high"* (MiniMax): its song is the brightest (centroid 1650 Hz, against 960–1440 for ACE-Step's songs).
  - *"A bit more synthesizer-ish"* (the XL): slightly, on the clips both made, for what CLAP's "synthesizer" is worth (the tavern 0.13 on the 2B against 0.16 on the XL with the 4B planner, the song 0.12 against 0.15).
  - *Tension itself*: CLAP's "tense" doesn't tell the tense Cue the owner liked from the ones the owner didn't (0.37–0.47 against 0.19–0.41).

So measures can catch particular failures a take may have, and could be checks the app runs on one: a scene that shouldn't sound like Christmas, a Cue that doesn't develop (an instrument asked for and not there, the choir, turned out not to be one: see below). They don't replace the ear: they can only say what's wrong, never what's good.

## Loops and word times (2026-11-08, Mac)

**Loops**: `tavern-d-60-s1` (the 4B planner, liked) played three times over, with ffmpeg as the player would (`out/loops/`, not kept). Every ACE-Step clip ends in a fade to silence (this one's last 4 s at −64 dB), so a loop has to deal with the tail.

- Joined end to end: "wow, I felt like the music ended, do I need to restart it?" Not usable.
- A 4 s crossfade over the silent tail: fine and "less jarring", but maybe too long.
- The tail trimmed (to −55 dB, 60 s to 56.8 s) and a 2 s crossfade: "sounds fast".

So the player loops a Cue by cutting its fade-out and crossfading **3 s** into its start (the owner).

**Word times**: `words.py` times each word of a song with Whisper (large-v3-turbo through mlx-audio, `word_timestamps`), finds each of six quoted lines, and cuts a clip of each line from its times plus a second either side (`out/words/`). On the three ACE-Step songs (the 2B, the XL, the XL with the 4B planner) every line was found, word for word on 16 of the 18 (the other two missing their last word, "eye"), and by ear (the owner) **Whisper "is right on every clip"**. Not needed after all: the end song is only a song, with nothing shown in time with its lines (the owner).

## A choir that's heard (2026-11-08, Mac)

No Heaven since the first had a choir the owner could hear. Each had instrumental section tags and a choir "low", "soft" or "in the background", which the planner may take as an instrumental with a trace of choir; ACE-Step's guide puts sung sounds in the lyrics, wordless ones as vowels. On the XL with the 4B planner, two seeds each ([clips](clips/ace-step-1.5-xl-turbo-4b-lm/)), about 171–181 s, ComfyUI at 27 GB:

- **E** (`heaven-e-60`): the liked course Heaven's caption, unchanged, with choir sections in the lyrics to sing ("Ooh… ooh… / Aah… aah…"). By ear: **"yeah, I can hear them now"**, on both seeds, both decent.
- **F** (`heaven-f-60`): the same lyrics, and the choir made the lead in the caption ("clearly heard, carrying the piece"). By ear: seed 1's voice "warbly, and distracts"; seed 2 better, but "sounds like I'm in a church", which might suit a church scene.

So **voices come from the lyrics**: a choir in the background needs lines to sing, its place in the mix set by the caption. Made the lead, ACE-Step's voices are warbly, as MiniMax's were.

CLAP doesn't hear the difference: its choir score is the same for the course Heaven without a heard choir (0.33, read again from its m4a) as for E's (0.32–0.33). So the earlier hope, that a measure could warn when a choir asked for isn't there, doesn't hold. F's warbly seed 1 is again the most Christmas-like of these (0.42 against 0.18–0.32).

## ACE-Step 1.5 on the PC (2026-11-09, Windows PC)

The RTX 4070 (12 GB) with 16 GB of RAM, ComfyUI 0.44.2 (Comfy Desktop, CUDA, its dynamic VRAM loading), `ace.py` with the cases the owner liked on the Mac, seed 1, one at a time, `FREE=1` (freed after each, as the app does). Everyday apps were open, fewer as the run went on (the machine's RAM in use peaked at 13–14 GB early on, 12–13 GB later), and no Text Model was loaded. Clips are in the `-pc` folders of [clips/](clips/), all 15 kept until the owner has listened.

| Setup | 60 s of music | 150 s song | Card in use, at the most (60 s; song) | ComfyUI's RAM, at the most | Its commit | Machine's RAM in use |
|---|---|---|---|---|---|---|
| **XL turbo, 4B planner** | **19–21 s** | **36 s** | **11.2 GB; 11.6 GB** | **2.7–3.4 GB** | **14–16.5 GB** | **13.1–14.0 GB** |
| XL turbo, 1.7B planner | 14 s | 21 s | 10.4–10.8 GB; 10.9 GB | 2.6 GB | 15 GB | 12.5–13.0 GB |
| 2B turbo, 1.7B planner | 12 s | 18 s | 7.8–9.6 GB; 11.6 GB | 2.6–2.8 GB | 12–16 GB | 12.1–12.3 GB |

The card's figure is the whole card's (nvidia-smi can't split it by process under Windows), with 0.4–1.4 GB of it the desktop's before a job (the XL with the 4B planner, run again with less open, reached 10.8–10.9 GB). RAM is ComfyUI's working set; commit is what it has reserved of RAM and page file. Polled every 2 s.

- **All three fit, and the XL with the 4B planner runs here without trouble**: no failure, and the page file stayed at 0.5–0.6 GB. The planner ran at about 50 steps a second (seen in ComfyUI's log, all 300 steps), and the DiT's 8 steps took about 2 s. The 2B fallback isn't needed.
- **About nine times the Mac's speed** with the 4B planner (19 s against about 170 s), so the 1.7B's saving is small here (5 s), where on the Mac it halves the time.
- **The card's figure isn't what a setup needs**: dynamic loading fills what's free (a picture reaches 10.8–11.3 GB too), and the planner and the DiT take turns on the card. So 11.6 GB doesn't say how close to the limit it is, only that it fit with the desktop's share taken.
- **ComfyUI's RAM stays low** because the weights are read from the disk as they're needed, rather than held in the process: the Mac's 26–34 GB aren't comparable. The disk cache was warm (the files just downloaded, and read again by each run), so a first render after a reboot, likely slower, wasn't measured.
- **Every clip is the length asked**, ending in a fade (−62 to −67 dB over its last second), about as loud as the Mac's.
- **A seed repeats on one machine**: the XL's tavern rendered again, other setups run in between, came out the same file, byte for byte (one clip tried).

**`/free`**: ComfyUI frees ACE-Step when asked, so a picture after music has the card to itself. In all 15 renders the card was back to where it began within 0.1 s of asking (0.3–0.5 GB, or 1.4–1.5 GB in the first four), and ComfyUI's RAM at 2.2–2.5 GB (1.2 GB on its first start, before any job). The same picture through the app's generator (Qwen-Image 2.1 Turbo, landscape):

| When | Time | Card, before → at the most → after |
|---|---|---|
| Before any music | 14.5 s | 1.4 → 11.3 → 1.4 GB |
| Right after the XL and 4B planner's song, freed | 12.7 s | 0.3 → 10.8 → 0.4 GB |
| After two clips left loaded, then a `/free` alone | 12.7 s | 0.5 → 10.9 → 0.5 GB |

Left loaded, ComfyUI kept 4.7 GB on the card and 8.5 GB of commit, down to 0.5 GB and 4.0 GB on `/free`. Freeing costs a clip little: 19 s from freed against 18 s left loaded, so the app can free after each job as it does.

**By ear** (the owner, the PC's clips): the same order as on the Mac. For instrumentals and background music, the 2B with the 1.7B is "not great, lots of things going on that doesn't flow"; the XL with the 1.7B "better, smoother, but still some things going on that doesn't flow-ish"; **the XL with the 4B planner "so far the best"**. For a song with a voice (`song-150`), all three sound "decent, believable". So the 2B isn't a good fallback for Cues; the planner matters less for a song, though on the Mac the owner heard the 4B's as more "production-grade". Against the Mac's, the owner finds the PC's clips comparable.

The Buffet, the clearest case (slow piano with long sustain on all three, none of them gappy): on the 2B, "random notes" that bring the owner out of the music; on the XL with the 1.7B, notes "richer and fuller" and more stable; on the XL with the 4B, the best, slower with a longer sustain, it "knows to go soft and keep the mood". The measures agree: notes a second 0.50, 0.48 and 0.27, and the worst changes between 2 s windows 0.130, 0.040 and 0.035.

**The same seed isn't the same music on the other machine.** Seed, caption inputs, steps, tempo, key, length, DiT and planner are the same in `results.jsonl` on both, from one `ace.py` (the Mac's 2B song is from before the rows named a DiT), yet no clip came out alike. From the `.m4a` on both sides, 0–1 where 1 is identical: the waveform (the best match at any offset), harmony over time (chroma, frame by frame) and the loudness's shape (the mel spectrum's correlation stays at 0.7–0.9 for any two clips, so it tells little). The first three rows are the three captions with a second seed kept on the Mac, all on the XL with the 4B planner.

| Pair | Waveform | Harmony | Loudness shape |
|---|---|---|---|
| PC seed 1 against Mac seed 1 | 0.18 | 0.46 | 0.66 |
| PC seed 1 against Mac seed 2 | 0.10 | 0.44 | 0.69 |
| Mac seed 1 against Mac seed 2 | 0.12 | 0.44 | 0.69 |
| PC against Mac, all eight kept pairs (three setups, songs too) | 0.13 | 0.31 | 0.57 |
| Unrelated captions, on the PC | 0.05 | 0.05 | 0.27 |

So a seed gives a new take on the other machine, as far from the Mac's seed 1 as the Mac's seed 2 is: the caption is what the two share. A Session's seed can't promise the same music across machines, though on one machine it repeats. The waveform is a little nearer with the same seed on all three captions, which might be shared starting noise with the planner's codes differing, too little to hear and not looked into.

**The level varies a lot between takes.** The same Buffet caption and seed averages −25.8 dB on the PC's XL with the 4B planner (−22.2 and −22.7 on the other setups) against −15.0 dB on the Mac; other cases are within 4 dB, and the PC's song is the louder there. The PC's clips run from −12 to −26 dB. The PC's Buffets are evenly quiet rather than gappy (about −19 to −30 dB until they fade), and two are near silent for their last 10 s (−50 dB and below), so a loop's cut has more to take off than the 3 s or so the tavern needed. Being soft is part of what the owner likes in the 4B's Buffet, so it isn't a fault: if the player ever matches Cues' levels (stage 3), it shouldn't flatten a Cue meant to be soft. Whether it's needed is for listening to Cues crossfaded.

**A measure that follows "doesn't flow"**, a hint from one seed and one listener: how much the mel spectrum changes between 2 s windows (one minus their cosine similarity, the last 5 s left out), on the PC's instrumentals.

| Setup | Mean change | The worst changes (95th percentile) |
|---|---|---|
| 2B, 1.7B | 0.044 | 0.108 |
| XL, 1.7B | 0.029 | 0.069 |
| XL, 4B | 0.021 | 0.058 |

Both fall in the ear's order on all four captions, where the seven other measures tried (those of `analyse.py`, and jumps in level) don't. The 10 s `development` of `analyse.py`, which didn't see the planners on the Mac, doesn't here either, so the short window may be what matters. Nine measures were tried, so one in order may be luck. Checked on the Mac's planner pairs, [it doesn't hold](#the-2-s-measure-of-flow-on-the-macs-planner-pairs).

Not checked on the PC: their keys and tempo, the song's lyrics with Whisper, a Text Model loaded beside ACE-Step (the app unloads it first), and a first render from a cold disk. A music job through the app waits for stage 3.

## Checks on the Mac after the PC's (2026-11-09, Mac)

### The 2 s measure of flow on the Mac's planner pairs

**It doesn't hold.** The same measure as the PC's, which gave the PC's figures exactly from its kept `.m4a`, on the Mac's seven XL pairs of the same caption and seed, from their FLACs. The 4B planner is the one the owner preferred on six of the seven (even on the other), yet it has the larger changes on five by the mean and on six by the 95th percentile, the opposite of the PC's order.

| Clip | 1.7B: mean, 95th percentile (verdict) | 4B: mean, 95th percentile (verdict) |
|---|---|---|
| `tense-d-60-s1` | 0.005, 0.018 (1) | 0.014, 0.049 (2) |
| `tense-d-60-s2` | 0.011, 0.032 (1) | 0.007, 0.017 (2) |
| `tavern-d-60-s1` | 0.029, 0.057 (1) | 0.043, 0.098 (2) |
| `tavern-d-60-s2` | 0.029, 0.054 (1) | 0.044, 0.082 (2) |
| `heaven-d-60-s1` | 0.014, 0.031 (1) | 0.011, 0.036 (1) |
| `heaven-d-60-s2` | 0.019, 0.028 (1) | 0.023, 0.033 (2) |
| `buffet-d-60-s1` | 0.020, 0.036 (0) | 0.032, 0.101 (2) |
| **Average** | **0.018, 0.037** | **0.025, 0.059** |

- **The clearest case runs backwards**: the 1.7B's Buffet, "gappy, instruments and tunes not layering or playing together", reads as smoother than the 4B's, "good", by nearly three times on the worst changes.
- **Over all 13 pairs that were kept**, adding the older captions, a second Buffet and the song, the 4B is lower on 6 by the mean and 5 by the 95th percentile: no better than a coin.
- **Seeds move it about as much as the planners**: between two seeds of a course caption on one planner, 0.0055 on average; between planners on one seed, 0.0077.
- **It doesn't follow the verdicts either**: across the 45 instrumentals from ACE-Step with a verdict, Spearman +0.04 for the mean and −0.05 for the 95th percentile; by verdict 0, 1 and 2, the means are 0.025, 0.022 and 0.029. Of five pairs of takes of one caption and setup where the owner preferred one, the preferred one changed less on none by the mean and one by the 95th percentile. It's higher for songs than instrumentals, so the songs are left out here.

So the PC's order on four clips was most likely luck among nine measures tried, or something of that one seed, and nothing should be built on it. It might still tell the 2B from the XL (the Mac's 2B against the XL with the 1.7B, same caption and seed: 0.038 against 0.018, 0.039 against 0.016, 0.059 against 0.037, and 0.088 against 0.054 for the song), which wasn't pursued, as the 2B is gone.

### CLAP depends on the audio's format

The first run of `analyse.py` read clips that were kept as AAC at the time; some were later cut from `clips/`, leaving only their FLACs. Run again, it read 25 clips from FLAC, and CLAP's scores moved, so that run's rows weren't kept: `analysis.jsonl` holds the earlier rows, all from AAC, and the three `-pc` clips', from AAC too (their figures came from that run). Encoding a FLAC at 96 kbps gave the earlier row's figures to three decimals on the three clips tried.

- **On the same audio, 96 kbps AAC raises "Christmas" by 0.10 on average** (45 clips, 0.30 to 0.40, up to 0.19 on one), and "electronic" by 0.06 (up to 0.15). The other probes move by 0.015–0.04 on average, with up to 0.15 on a clip. Notes a second moved by up to 1.3.
- **Each probe's order mostly survives** (Spearman between the formats 0.97 for Christmas, 0.75–0.98 across probes), and its agreement with the verdicts barely changes. So compare CLAP's figures within one format only, and any check the app makes on a take should read one format.
- **It had crept into this README**: the Christmas and choir figures for `heaven-d-60` were from FLAC beside others from AAC, corrected above. On one format, the gap between the bad Heavens and the liked one narrows (above), and from FLAC the bad ones (0.12–0.34) overlap it (0.18), so that remark is weaker than it looked. The other figures in that section weren't all checked for format; `analysis.jsonl` is one format throughout.

`analyse.py` read the PC's clips and cut `ace.py` correctly, 29 s in all on the CPU with CLAP already cached. With the PC's verdicts added, across all 54 rows, no measure predicts a liked clip: every one within ±0.28, and only "drums" past p 0.05, at −0.28.

### `ace.py` on the Mac

`tavern-d-60` on the XL with the 4B planner, seed 3, `FREE=1`, rendered twice; the rows and files were then removed. The file went to `out/ace-step-1.5-xl-turbo-4b-lm/` with no "-mac", 60.0 s long; the row said `"machine": "mac"`, `comfyui_most_gb` 27.0 both times, `took` 171.8 s (with 21 GB already loaded) and 190.5 s (from freed, with other work running on the CPU, so not a clean timing). `free_took` and `freed_ram_gb` were filled in. **A seed repeats on the Mac**, byte for byte, as on the PC (one clip tried).

**`/free` on the Mac**: `free_took` is 0.1 s, as there's no VRAM figure for the wait to watch, so it says nothing there. ComfyUI's memory does fall, but over about 2.4 s after the job ends (polled about every 0.6 s, from 27 GB to 1.3 GB, and 9 to 34 GB free by ComfyUI's `vram_free`). `ace.py` looks after a fixed 2 s, right on that edge, so `freed_ram_gb` read 21.0 once and 1.3 the other, the first with `footprint` a few seconds later at 2.4 GB. So on the Mac, trust a later reading. The app's own wait watches `vram_free` (`server/comfyui/client.ts`), which fell with the memory.

### The other setups deleted

The owner deleted the 2B turbo and the 1.7B planner on the Mac (8.5 GB), as on the PC, so both machines have one setup, the XL with the 4B planner, and `ace.py` defaults to it. Its folder names didn't change, and the tables above stay as history.

The raw FLACs went too (`out/`, and ComfyUI's copies in its `output/bench`, 265 MB each). So only `clips/` remains, at 96 kbps, and **`analyse.py` can now read 27 of its 54 verdict clips**. It reads only `clips/`, so the file stays in one format, and merges: the other 27 keep their earlier rows, whose figures can't be measured again. The planner pairs above can't be measured again, as only `tavern-d-60-s1` has both clips kept.

## Not checked yet

- **Cover strength** (ACE-Step's `audio_cover_strength`, which ComfyUI's node doesn't take): a weaker cover might keep a Cue's sound where a full one didn't.
- **An end song written from a story's ending**, 2–3 minutes (the songs here are written for the bench).
