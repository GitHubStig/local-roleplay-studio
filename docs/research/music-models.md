# Music models: findings

The evidence behind the music pick in [models.md](../models.md#music) and [ADR 0035](../adr/0035-music-from-ace-step-through-comfyui.md): which model makes a Roleplay's Cues, how it's prompted, and what it can't do. Stage 2 of [the music plan](../music-plans.md). Every number is from the Mac (M5 Pro, 48 GB), 2026-11-07 and -08; the PC hasn't been tried. The tables, the captions and every clip are in the bench, [bench/music-models/](../bench/music-models/README.md); this is what was concluded from it. How the Music Director decides when the music changes is in [music-director.md](music-director.md) and its own bench.

## Two models

- **MiniMax Music 3** (through mlx-audio 0.6.4; mxfp8, 4-bit, nvfp4 and bf16 builds): **dropped**. Its length is its own: the duration given is only a cap, and it ends a piece when it samples its end token, 14–43 s for an instrumental whatever was asked, or is cut at the cap. 4–5 s of rendering for each second of music; 20–31 GB at the peak on the 4-bit (50–54 GB on bf16, into swap); keys not followed; voices where none were asked, as it's made for songs. By ear (the owner): "super slop" with the bench's first captions; "much better" with captions in its own Structured Caption format, but the length and the voices remained. MiniMax's own example clip has the same "high, warbly, electronic-ish" sound, so that's the model, not mlx-audio's port or the compression. The 4-bit was the best build (nvfp4 no better, mxfp4 not tried, bf16 no more consistent).
- **ACE-Step 1.5** (through ComfyUI 0.44.2, its own nodes and its "ACE-Step 1.5" templates): **the pick**. The length asked, every time (60–180 s), each piece ending in a fade; the asked-for key and tempo mostly followed; lyrics sung as written. By ear: better than MiniMax and fitting the scenes from the first clips.

## ACE-Step's setups

ACE-Step is a planner (a language model that sketches the piece as audio codes) and a music model (a DiT that renders it).

| Music model | Planner | 60 s of music | ComfyUI's memory, at the most | By ear |
|---|---|---|---|---|
| 2B turbo | 1.7B | 76–81 s | about 20 GB more of the Mac's in use (not measured on its own) | fits the scenes; thinner |
| XL turbo (4B) | 1.7B | 79–85 s | 24 GB | richer, a little more synthesizer-like, busier; "usable but not great" |
| **XL turbo (4B)** | **4B** | **167–202 s** | **26–27 GB (34 GB for a 150 s song)** | **the best: "playing together", smoother, "more production-grade"** |

ComfyUI keeps about 21 GB loaded between runs; the app frees it after (`/free`).

## Prompting it

What changed the results most, over the bench's tries with the owner listening:

- **Its own guide's caption**: prose on the style, the emotion, the instruments, the timbre and the production; the tempo, key and length set as their own inputs, never in the caption; an instrumental's lyrics are section tags that agree with the caption.
- **What's heard, never the subtext**: "creeping menace under a calm surface, a friendly face hiding a knife" came out calm.
- **How it develops over the track**, with the section tags following the same stages. A caption naming a texture ("a staccato ostinato") got that texture unchanged for a minute, "very monotonous"; the same written as a course (a pulse, stabs breaking in, brass joining, a near-silent break, a surge back) was the first tense Cue that was tense. On the 1.7B planner the course made ok Cues of bad ones; the 4B planner made them good.
- **No negations** ("no high organ notes"): they pull in what they name.
- **Change one thing at a time**, and **the player's own words** for what's missing ("more low choir in the background").
- **The genre may have to leave the Score's**: tension wasn't possible in folk ("too playful", at any tempo); a thriller score had it.
- **The seed matters as much as the caption**: two seeds of one caption came out bad and decent, so a Cue may want a take or two to pick from.
- **Voices come from the lyrics**: a choir in the background was never heard while the lyrics were instrumental section tags, however the caption put it; given lines to sing ("Ooh… aah…"), it was, on both seeds. Made the lead, the voices are warbly.

## What it can't do through ComfyUI

- **Extend a Cue**: ACE-Step's repaint isn't exposed by ComfyUI's ACE-Step 1.5, and its general latent mask fails on an audio latent. ACE-Step's own repo has it. Not needed: a Cue of up to 3 minutes renders directly, and **a loop works with the fade-out cut and a 3 s crossfade** (end to end, the owner thought the music had stopped; 4 s was maybe too long, 2 s too fast).
- **Keep Cues sounding related by audio**: "Set Reference Audio" is ACE-Step's cover, which builds the new music over the old, in 29 s; but by ear a cover with the same caption "sounds a little similar but the instruments seem different", and with another caption "totally different". So Cues are related by text: the Score's genre, instruments and production in every caption.

## Songs

ACE-Step sang the bench's song (verses and choruses with lines of the kind a Roleplay collects) as written on every setup, for the end song. Whisper (large-v3-turbo through mlx-audio, its word times) found every line in each, and clips cut at its times were "right on every clip" by ear; not needed, as nothing is shown in time with the song (the owner).

## Measures against the ear

Measures of each clip (how much it develops, its loudness's range, brightness, notes a second; CLAP, audio against text) were set beside the owner's 47 verdicts. None predicts a liked clip, none picks the better of two takes (two of four), and none hears the difference between the planners; but several bear out a particular remark: the Christmas-like Heaven, the choir gone, the monotonous tension, MiniMax's brightness. CLAP's choir score didn't tell a heard choir from one the owner couldn't hear, though. So they could be checks a take might fail ("sounds like Christmas", "doesn't develop"), never a judge of a good one.
