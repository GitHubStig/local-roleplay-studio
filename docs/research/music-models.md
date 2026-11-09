# Music models: findings

The evidence behind the music pick in [models.md](../models.md#music) and [ADR 0035](../adr/0035-music-from-ace-step-through-comfyui.md): which model makes a Roleplay's Cues, how it's prompted, and what it can't do. Stage 2 of [the music plan](../music-plans.md). The numbers are from the Mac (M5 Pro, 48 GB), 2026-11-07 and -08, except [on the PC](#on-the-pc-2026-11-09-windows-pc) (RTX 4070, 12 GB, 16 GB of RAM), 2026-11-09. The tables, the captions and every clip are in the bench, [bench/music-models/](../bench/music-models/README.md); this is what was concluded from it. How the Music Director decides when the music changes is in [music-director.md](music-director.md) and its own bench.

## Two models

- **MiniMax Music 3** (through mlx-audio 0.6.4; mxfp8, 4-bit, nvfp4 and bf16 builds): **dropped**. Its length is its own: the duration given is only a cap, and it ends a piece when it samples its end token, 14–43 s for an instrumental whatever was asked, or is cut at the cap. 4–5 s of rendering for each second of music; 20–31 GB at the peak on the 4-bit (50–54 GB on bf16, into swap); keys not followed; voices where none were asked, as it's made for songs. By ear (the owner): "super slop" with the bench's first captions; "much better" with captions in its own Structured Caption format, but the length and the voices remained. MiniMax's own example clip has the same "high, warbly, electronic-ish" sound, so that's the model, not mlx-audio's port or the compression. The 4-bit was the best build (nvfp4 no better, mxfp4 not tried, bf16 no more consistent).
- **ACE-Step 1.5** (through ComfyUI 0.44.2, its own nodes and its "ACE-Step 1.5" templates): **the pick**. The length asked, every time (60–180 s), each piece ending in a fade; the asked-for key and tempo mostly followed; lyrics sung as written. By ear: better than MiniMax and fitting the scenes from the first clips.

## ACE-Step's setups

ACE-Step is a planner (a language model that sketches the piece as audio codes) and a music model (a DiT that renders it). Both machines now keep only the pick, the XL turbo with the 4B planner: the owner deleted the others (the PC and the Mac, 2026-11-09), as quality matters as much as speed, so there's no quicker setting. These are the measurements that led there.

| Music model | Planner | 60 s of music | ComfyUI's memory, at the most | By ear |
|---|---|---|---|---|
| 2B turbo | 1.7B | 76–81 s | about 20 GB more of the Mac's in use (not measured on its own) | fits the scenes; thinner |
| XL turbo (4B) | 1.7B | 79–85 s | 24 GB | richer, a little more synthesizer-like, busier; "usable but not great" |
| **XL turbo (4B)** | **4B** | **167–202 s** | **26–27 GB (34 GB for a 150 s song)** | **the best: "playing together", smoother, "more production-grade"** |

ComfyUI keeps about 21 GB loaded between runs; the app frees it after (`/free`). Those are the Mac's; the PC's are next.

### On the PC (2026-11-09, Windows PC)

| Music model | Planner | 60 s of music | 150 s song | Card in use, at the most (60 s; song) | ComfyUI's RAM |
|---|---|---|---|---|---|
| 2B turbo | 1.7B | 12 s | 18 s | 7.8–9.6 GB; 11.6 GB | 2.6–2.8 GB |
| XL turbo (4B) | 1.7B | 14 s | 21 s | 10.4–10.8 GB; 10.9 GB | 2.6 GB |
| **XL turbo (4B)** | **4B** | **19–21 s** | **36 s** | **11.2 GB; 11.6 GB** | **2.7–3.4 GB** |

- **The pick fits and is about nine times the Mac's speed**: the XL with its 4B planner, on 12 GB with 16 GB of RAM and everyday apps open, with no failure and no growth in the page file. So the 2B fallback isn't needed. The card's figure is the whole card's and dynamic loading fills what's free, so it shows it fit, not how much a setup needs.
- **`/free` works**: the card back where it began within 0.1 s in all 15 renders, and a picture just after music as quick as one before (12.7 s against 14.5 s). Freeing costs the next clip about a second.
- **By ear, the same order as on the Mac** (the owner): for instrumentals, the 2B "not great, lots of things going on that doesn't flow", the XL with the 1.7B smoother but still not flowing, the XL with the 4B planner the best. For a song with a voice, all three "decent, believable". So the 2B isn't a good fallback for Cues. The PC's clips are comparable with the Mac's.
- **A seed repeats on one machine**, byte for byte (one clip tried), **but not across machines**: measured against the Mac's clips, the PC's seed 1 is as far from the Mac's seed 1 as the Mac's seed 2 is (harmony over time 0.46 against 0.44; unrelated captions 0.05). It's another take of the caption.
- **The level varies between takes**: the Buffet's caption and seed average −26 dB on the PC against −15 dB on the Mac. That softness is part of what the owner likes in it ("knows to go soft and keep the mood"), so it isn't a fault; matching Cues' levels in the player is a question for listening to them crossfaded, and shouldn't flatten a soft Cue.
- Not checked: a first render from a cold disk (the disk cache was warm) and a Text Model beside it. Details in the [bench](../bench/music-models/README.md#ace-step-15-on-the-pc-2026-11-09-windows-pc).

### Music on the Mac's own ComfyUI, through the app (2026-11-09, Mac)

The hired-killer replay, 13 Messages and 8 Cues, with the 26B and ACE-Step both on the Mac, no pictures, no other load. Each track took 185–214 s, ComfyUI 27 GB at the most, the free memory 35% at the lowest, and the swap about where it began (5.4 GB). ComfyUI and Ollama both let go after, ComfyUI down to 1.2 GB.

**A Reply that arrives while a track renders waits for it: 192–223 s, for 6 of the 13 Messages**, against 5–11 s for the rest. The Text Model can't sit beside ACE-Step on the Mac, so text calls wait for the heavy job running (ADR 0029). The whole replay took 28 minutes, nearly all of it the music, where the same story took under 3 with music on the PC. So on the Mac, music as it stands holds up the story.

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

**A Text Model doesn't write captions this good from rules** (2026-11-09, Mac, Gemma 4 26B, by ear). The rules above, as a prompt, gave captions that passed every check and sounded wrong, seven times, swinging from droning to busy, as a word in the prompt ("long notes", "keep the melody moving") shows up throughout. Given the owner's own captions to adapt, the scenes came out usable. So the cue writer adapts one of four ([bench](../bench/music-cues/README.md), [ADR 0035](../adr/0035-music-from-ace-step-through-comfyui.md)). A liked caption isn't a liked clip, though: on the other machine or seed it's another take, and clips can fade on a second listen (the tense Cue, "good 40 sec in", 2026-11-09). A long first stage matters too: a reader has moved on before a track reaches its second.

## What it can't do through ComfyUI

- **Extend a Cue**: ACE-Step's repaint isn't exposed by ComfyUI's ACE-Step 1.5, and its general latent mask fails on an audio latent. ACE-Step's own repo has it. Not needed: a Cue of up to 3 minutes renders directly, and **a loop works with the fade-out cut and a 3 s crossfade** (end to end, the owner thought the music had stopped; 4 s was maybe too long, 2 s too fast).
- **Keep Cues sounding related by audio**: "Set Reference Audio" is ACE-Step's cover, which builds the new music over the old, in 29 s; but by ear a cover with the same caption "sounds a little similar but the instruments seem different", and with another caption "totally different". So Cues are related by text: the Score's genre, instruments and production in every caption.

## Songs

ACE-Step sang the bench's song (verses and choruses with lines of the kind a Roleplay collects) as written on every setup, for the end song. Whisper (large-v3-turbo through mlx-audio, its word times) found every line in each, and clips cut at its times were "right on every clip" by ear; not needed, as nothing is shown in time with the song (the owner).

## Measures against the ear

Measures of each clip (how much it develops, its loudness's range, brightness, notes a second; CLAP, audio against text) were set beside the owner's 47 verdicts. None predicts a liked clip, none picks the better of two takes (two of four), and none hears the difference between the planners; but several bear out a particular remark: the Christmas-like Heaven, the choir gone, the monotonous tension, MiniMax's brightness. CLAP's choir score didn't tell a heard choir from one the owner couldn't hear, though. So they could be checks a take might fail ("doesn't develop"), never a judge of a good one. "Sounds like Christmas" is weaker than it looked, once read in one format (below).

One hint that didn't hold: on the PC (2026-11-09, one seed), how much the sound changes between 2 s windows fell in the ear's order of the three setups on all four instrumentals, following "doesn't flow" where the 10 s measures don't. On the Mac (2026-11-09), it runs the other way on the seven XL pairs of the same caption and seed: the preferred 4B planner changes more on five by the mean (0.025 against 0.018) and six by the 95th percentile (0.059 against 0.037), and the "gappy" 1.7B Buffet reads as smoother than the "good" 4B one. It doesn't follow the verdicts or pick the better take either, and seeds move it about as much as the planners. So it's most likely luck among the nine measures tried, and nothing is built on it ([bench](../bench/music-models/README.md#the-2-s-measure-of-flow-on-the-macs-planner-pairs)).

**CLAP's scores depend on the audio's format** (2026-11-09, Mac): on the same audio, 96 kbps AAC raises "Christmas" by 0.10 on average (up to 0.19), and "electronic" by 0.06, against the FLAC, though each probe's order mostly survives. So compare them within one format only, and any check on a take should read one format. Read in one, the gap between the bad Heavens and the liked one narrows ([bench](../bench/music-models/README.md#clap-depends-on-the-audios-format)).

Another hint that didn't hold (2026-11-09, Mac): the longest gap between note onsets separated monotonous takes from liked ones on one round, then failed a blind test on the next ([bench](../bench/music-cues/README.md)).
