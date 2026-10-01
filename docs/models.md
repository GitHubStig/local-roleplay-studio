# Choosing models

What we've measured about the local models this project runs, and which to pick. All timings
are on the development Mac (Apple silicon), 2026-09-24.

## Text Model

**Use `gemma4:31b-mlx`, with Thinking off.** It was the only model that was both correct on
every Action and literal about what it changed. Set it in **Settings → Text Model**; it applies
from the next Session.

### What the job asks of the model

Each Frame the Text Model gets the current Image Prompt (one paragraph of nine sentences, one per
aspect: subject → pose → expression → camera → clothing → environment → lighting → color →
style) and an Action, and must return the paragraph with only the affected sentences rewritten,
everything the change contradicts removed, and the rest copied word for word
([ADR 0005](adr/0005-image-prompt-is-the-state.md)). Changing the right parts, and only those,
is a real instruction-following task, and it separates small models from large ones.

### How we compared them

Each model replayed the same seven Actions from a real Session (photoshoot Scenario), text only,
Thinking off:

1. she is now in mars
2. remove all studio backdrop
3. she is now scared and not relaxed
4. the background is now showing space
5. art style is now Michelangelo / High Renaissance
6. she's in an attack stance like boxing
7. boxing stance (a repeat: the right answer is *unclear*, or no change)

The telling cases are 3 (the pose sentence also says "relaxed", so it must change too), 4
(space must replace Mars, not sit next to it) and 6 (the pose must actually change).

### Results

| Model | Size | Result | Text per Frame |
|---|---|---|---|
| **`gemma4:31b-mlx`** | 31B | **All correct.** Changes only what's asked; answers the repeat with *unclear*. | ~10 s |
| `orcarouter/Qwen3.8-27B-Uncensored:mlx-4bit` | 27B | All correct, richest prose, but also adjusts things not asked for (Mars lighting and palette; changed "scared" to "aggressive" on the boxing Action). | ~17 s |
| `qwen3.8:27b-mlx` | 27B | Correct on a compound Action ("scared; art style is Michelangelo"), also adapting lighting and palette unasked. (Tested on that case only.) | ~8 s |
| `muse-glimmer:30b-mlx` | 30B | Wrongly declined "she is now in mars" as restraint; kept "relaxed" in the pose after "not relaxed"; asked what kind of space. | ~7 s |
| `llama3:latest` | 8B | Corrupted the prompt: pasted the engine's instructions in as content, dropped the clothing, kept two contradictory styles. Narrations still claimed the right changes. | ~4 s |
| `maternion/spark-x2.5-heretic:4b` | 4B | Narrated changes it didn't make (the prompt came back identical on "boxing stance"); left "relaxed" in the pose; wrote edit notes into the prompt ("…red dust replaced"). | ~3 s |

**Takeaways**

- Small models (4–8B) can't hold this format: they either don't make the change, or damage the
  prompt, while their Narration claims success. The Prompt tab's word diff is the way to spot it.
- Among the ~30B models, the choice is style: **gemma4** is literal (good for stepping through
  changes and checking the diff); **Qwen3.8** acts more like an art director and harmonises
  related details, at the cost of changes you didn't ask for.
- Uncensored models make no difference to what's rendered: the engine's Limits check every
  Action and every prompt whichever model wrote it ([ADR 0002](adr/0002-guardrails-enforced-by-the-engine.md)).
- The first Frame after switching model is slower while Ollama loads it (gemma4: ~20 s).
- Earlier, with a structured JSON Scene, spark-x2.5 also marked a wardrobe change it had been
  told to refuse as done: small models are unreliable at following rules, not just formats.

### Thinking

Thinking makes the model reason before it answers, which is exactly what catches implied edits
("not relaxed" also affects the pose). It costs time, and with a small model it didn't pay off.
Measured on spark-x2.5 4B (an earlier version of the prompt format, four Actions):

| spark-x2.5 4B | Correct | Text per Frame |
|---|---|---|
| Thinking off | 2 of 4 | ~3 s |
| Thinking on | 3 of 4 | 12 s to 102 s (160 s for the opening) |

gemma4 got every Action right without Thinking, so leave it off; turn it on only if the model
starts missing implied changes.

### Other lessons

- **Runaway replies.** Small models writing JSON under a schema occasionally never stop, padding
  with whitespace until their context fills. One such reply from spark blocked Ollama, and every
  request queued behind it, for 14 minutes. Every Text Model call now has a token cap and a time
  limit (see [design.md](design.md#the-frame-loop)).
- **The Setup matters.** Describing Maya's identity as including "an easy smile" put an
  expression into the identity sentence, which then contradicted "make her scared". Keep each
  Setup fact in its own aspect ([scenarios.md](scenarios.md)).

### A third model: `pdurlej/gemma-4-26B-A4B-it-heretic` (2026-09-28)

A 25B mixture-of-experts gemma 4 (about 4B parameters active per token), uncensored ("heretic"),
GGUF Q4_K_M rather than MLX. Replayed on the same seven Actions, Thinking off, beside fresh runs of
the other two:

| | gemma4 31B | gemma-4 26B-A4B heretic | Qwen3.8 27B (uncensored) |
|---|---|---|---|
| Time per Action | 9.0 s | **3.2–3.3 s** (warmed up; 4 s to load) | 18.5 s |
| 3: scared, not relaxed | right (pose too) | right (pose too) | right, but also changed the camera |
| 4: space | right: replaced Mars | right: replaced Mars | kept Mars under the stars |
| 6: boxing stance | right | right | right, and made her "aggressive" unasked |
| 7: the repeat | **unclear** (right) | **wrong, 3 runs in 3:** undid the stance ("arms resting at her sides") | changed the stance again |
| Copying unchanged sentences | exact | **garbled one each run, 3 in 3:** "her *simplicity* arms", "*certainly* balanced", "pulled *enough* to her chest" | exact |
| 2: remove the studio backdrop (already gone) | wrong this time: put the white studio back | changed nothing | changed nothing |

The heretic model is about 3× faster than gemma4 31B (timed again after a first run shared the
machine with other work), but in every run it garbled a sentence it should have copied word for
word, somewhere different each time, and undid the boxing stance on the repeat. In a Chain each
Frame builds on the last, so a garbled word stays in the prompt: for prompting, gemma4 31B stays
the pick.

## Art Agent (picturing Roleplay Frames)

The Art Agent uses the Session's Text Model. Measured 2026-09-28 on six Frames of a 30-Frame
Roleplay (the Kael tavern scene), all on the same fixed Look, picked for what had tripped it
before: someone alone (6, 29), an empty room (7), and three with both people and detail the Limits block (9, 16, 24).

**Thinking: not worth it.** Qwen3.8 27B (uncensored), Thinking off against on:

| | Off | On |
|---|---|---|
| Time per picture | 24–49 s | 135–536 s (5–22×) |
| Reasoning | none | 6,000–18,000 characters |
| Who's in the picture | right on all five | same, except Frame 29: it invented Elara as a distant figure, and the picture was blocked |

With Thinking the sentences were more cinematic and one per aspect, and once more accurate (Frame 16), but it also dropped a detail in Frame 24. No gain in correctness,
at 2–9 minutes a picture, so there's no Art Agent Thinking setting.

**gemma4 is better at it than Qwen3.8, and faster** (both Thinking off):

| Frame | gemma4 31B | Qwen3.8 27B (uncensored) |
|---|---|---|
| Time per picture | **12–20 s** | 18–57 s |
| 16: Elara and the two men | right: who does what | wrong: what she does given to the two men |
| 24: Elara awake, the others asleep | right | wrong: "all three asleep", Elara left out |
| 7: Kael walks into the back room | shows him turning to go | shows the empty room, but still wrote "no visible garments" |
| 6, 9, 29 | right | right; richer prose |

gemma4 is the more literal reader of the story, which is what a picture needs.

The heretic gemma-4 26B-A4B (2026-09-28, the same six Frames, Thinking off) is **the fastest by
far: 3–9 s a picture**, against 12–35 s for gemma4 31B and 20–68 s for Qwen3.8 in the same run. It
wrote one clean sentence per aspect and got who's in each picture right (Kael alone in 6, 7 and
29; both in 9, 16 and 24; Qwen put only Elara in 16). It carries a little less detail than gemma4
31B, which kept more of the story's props in 9 and 24 (pictures blocked while the Limits are on). Qwen3.8 again wrote about absences ("Elara Vance is absent from the frame"). Settings → Art
Agent model sets a separate model for pictures (Thinking off), so the Character can be played by
one model and pictured by another.

**Two schema traps, both gemma4:** with the yes/no "is this person in the picture" answers first in
the reply, gemma4 wrote them and then only blank lines until its token cap, 6 times in 6 (as
"yes"/"no" words, 3 in 6); with them last, 0 in 6. A `maxLength` on each sentence did the same. So
the answers come last and the sentences are trimmed in code (`trimFields`).

### Tags instead of prose (2026-09-29)

Settings → Art Agent style can have the Art Agent write each aspect as short comma-separated tags
instead of a sentence (`prompts/roleplay/art-frame-tags.md`). The identities stay the Look's
sentences; only the seven aspects become tags, and clothing tags still name each person, so the
Limits' clothing check works the same. **Prose stays the default: it won on all seven installed
Image Models.** Measured on three Frames of the Kael tavern Roleplay (6: Kael alone; 9 and 12: both), each Art Agent writing prose, Danbooru-style tags
(`1boy, 1girl, from below, …`) and plain descriptive tags
(`Kael pointing at the floor, Elara wool robe, …`), Thinking off.

Who's in the picture, right of three:

|       | gemma4 31B | heretic 26B-A4B | Qwen3.8 27B |
| ----- | ---------- | --------------- | ----------- |
| Prose | 3          | 3               | 3           |
| Booru | 2          | 3               | 1           |
| Plain | 2          | 2               | 2           |

- **Tags are about twice as fast to write**, and half as long: 450–950 characters a prompt against
  1,000–1,950 for prose. Prose per picture: gemma4 14–30 s, heretic 4–8 s, Qwen3.8 19–25 s.
- **Tags follow the story more literally, and ignore "dress them" far more.** gemma4's tags, in both styles, kept clothing the Limits would block, and so did the heretic's booru tags. (Its prose also did once, which the Limits now catch.)
- **Qwen3.8 as a tag writer:** the least reliable. Booru tags got who's shown right once in three,
  and its plain tags were the shortest (about 200 characters), dropping names so the aspects no
  longer said who was who. Its prose was right on all three.
- The two tag schemas were first written as arrays of strings; gemma4 then wrote only blank lines
  until its token cap. One comma-separated string per aspect, with the yes/no answers last (as for
  prose), finished every time in a retest.

Rendered on every installed Image Model (gemma4's three prompt sets, 512×512, seed 7, the model's
default steps, clothing the Limits would block changed by hand). Frame 6 is Kael alone at the window with his pipe; 9,
Kael at the foot of the stairs pointing up at Elara on the balcony; 12, Elara at the top of the
stairs with knives, Kael crouched at the bottom. The tags for 6 named both people (the Art Agent's
miss above), so a second person there is the prompt's fault, not the Image Model's:

| Image Model                 | Prose                                    | Booru tags                                                             | Plain tags                                              |
| --------------------------- | ---------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| FLUX.2 Klein 4B (~5 s)      | all right                                | 9: who does what swapped; 12: three people (a second `1girl`)          | 6: wrong identity; 9 and 12 right                       |
| FLUX.2 Klein 9B (~8 s)      | all right, and staged                    | 6: Kael with Elara's ponytail; 9: an extra child; 12: two Kaels        | Elara added to 6; 9: pointing across, not up; 12 right  |
| Boogu Image Turbo (~11 s)   | all right, and staged                    | 6: Kael with Elara's ponytail; 9: no staging; 12: Kael holds the knife | 6: the same ponytail; 9: on one level; 12 right         |
| Z-Image Turbo 4-bit (~12 s) | all right, and staged                    | Elara added to 6; 9: she points, no balcony; 12: two Kaels             | 6 right; 9: on one level; 12 close                      |
| ERNIE-Image Turbo (~19 s)   | 6 and 12 right; 9 right but on one level | 6 right; 9 and 12: an extra person                                     | 6: Kael with Elara's ponytail; 9: no pointing; 12 right |
| Qwen-Image 2.1 (~26–32 s)   | all right, and staged                    | everyone faces the viewer; Elara added to 6; no staging                | 6 right; 9: the wrong person pointing; 12 close         |
| Krea 2 (~32–45 s)           | all right, and the best staged           | 3, 3 and 4 people: each `1boy` / `1girl` read as another one           | Elara added to 6; 9 and 12 right                        |

Prose was right on all seven Image Models (ERNIE flattened one balcony); no tag set was right on
any. Tags can't say who does what to whom, or where each person is, and with two people that's what
goes wrong: swapped actions, one person's features on the other (a ponytail is only "hers" in a
sentence), and everyone on one level facing the viewer. Booru tags are worst, adding people on five
of the seven: their vocabulary is for anime checkpoints trained on Danbooru, none of which are
installed. So the Tags style writes plain tags; it's there for speed, or for a future tag-trained
Image Model.

**Best Image Models for tags:** FLUX.2 Klein 4B and Krea 2, the only two that got both two-person
Frames (9 and 12) right from plain tags; ERNIE, Boogu and Klein 9B got one, Qwen-Image and Z-Image neither
quite. Frame 6 is left out, since its tags named both people. Tags are for speed, so FLUX.2 Klein 4B
(~5 s a picture) is the one to pair them with; Krea 2 stages them best, at 30–45 s. Three Frames,
one seed and one Art Agent is enough to rank them roughly, not to split close neighbours.

The prompts, grids and render script are kept in [bench/art-tags/](bench/art-tags/), to compare a
new Image Model on the same prompts (and when to write a fresh set instead).

## Suggest (writing the player's next Message)

Suggest uses the Session's Text Model, Thinking off. Measured 2026-09-30 on the Kael tavern
Roleplay, cut after Frames 1, 4, 12, 26 and 28 (points where the next move needn't cross a Limit),
with an empty box and with two typed steers, on one model at a time. The player writes short,
lowercase, often without "I" (median 21 words).

**Told only to match "their length and tone", every model tidied the player up:** "I take a slow
sip of the ale, ignoring the taste. I set the mug down and look him straight in the eye…", and the
heretic once wrote the Persona as "she", at length. Telling them the player's usual length in words
(the median of their last five Messages) and to keep their capitalisation and dropped "I", even if
it isn't polished, fixed it on all three:

| After Frame | gemma4 31B | heretic 26B-A4B | Qwen3.8 27B (uncensored) |
| ----------- | ---------- | --------------- | ------------------------ |
| 1 | take a sip and set the mug down. i'm not here for the drink, kail. i'm here for you. | takes a sip of the bitter ale and watches him closely. | sip it, but the rain's not stopping. who are you? |
| 4, steer "flip him a coin, hint i might have more later" | flip a coin onto the bar and slide it toward him. "for the room. i might have more for you later." | slides a gold coin across the wood toward him, eyes flickering with a secret. "consider that a tip. i might have more for you later." | grabs the key and flips a coin on the bar. "for now. more to discuss in the morning, if you're free." |
| 28 | walk into the cold rain and disappear into the mist | step out into the rain and let the cold soak my skin, disappearing into the mist. | walk out into the rain, not looking back. |
| Time per suggestion | 1.4–13 s | **0.2–2.5 s** | 1–22 s |

All three kept to the Persona's own actions and words, moved the scene on (none just nodded or
waited), and wrote typed steers out faithfully ("tell him the debt is paid": "the debt is paid now,
old man."). gemma4 once copied the lowercase into a misspelling ("kail"). Time grows with the
story: each suggestion reads all of it, though Ollama reuses the part that hasn't changed since the
last one. The heretic is the fastest by far and as good here, so a Roleplay played on it gets
near-instant suggestions; a separate Suggest model setting, like the Art Agent's, could come if
another Text Model feels slow.

With all three models loaded at once, a 48 GB Mac swapped: gemma4 took up to 64 s and Qwen3.8 ran
past the 2-minute limit. Ollama keeps a model loaded for a few minutes after its last use, so
switching Text Models back and forth has the same effect.

## Voices (speaking a Roleplay Character's lines)

Measured 2026-09-30 on a 48 GB Mac, everything through mlx-audio. The brief: each Character's voice
**unique** (designed for them) and **expressive** (suiting each moment), and the same voice from the
first line to the last. The lines and clips are kept in [bench/voices/](bench/voices/).

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

## Image Model

**Use FLUX.2 Klein 4B** (`flux2-klein-4b`, the default), 4 steps.

| Model | Time per image | Notes |
|---|---|---|
| **FLUX.2 Klein 4B** | 832×1216: ~10–13 s · 512×768: ~5 s · 512×512: ~4 s | Follows the subject description (skin, hair) and keeps her consistent across Frames with a fixed seed. Peak memory ~17.6 GB at 832×1216, ~10.5 GB at 512 px. |
| FLUX.2 Klein 9B | 832×1216: ~22 s · 512×768: ~10 s · 512×512: ~8 s (4 steps) | Stages two people a little better than 4B from prose (someone up on a balcony stays up there); no better from tags. Peak memory ~28 GB at 832×1216, ~21 GB at 512 px. Not yet checked for keeping a subject consistent across Frames. |
| Z-Image Turbo (4-bit) | 832×1216: ~42 s (9 steps) | Ignored the subject's described skin tone and hair. |
| Krea 2 (Turbo) | 512×512: ~32 s (8 steps) | Peak memory ~39 GB. |
| ERNIE-Image Turbo | 512×512: ~18 s (8 steps) | Peak memory ~25 GB. |
| Boogu Image Turbo | 512×512: ~16 s (4 steps) | Peak memory ~29 GB. |
| Qwen-Image 2.1 | 512×512: ~23 s (25 steps) · ~38 s (40, mflux's default) | 25 steps looks as good as 40 at 512 px, so it's our default. Peak memory ~35 GB. |

Timings for the last four are one test image each (2026-09-25, 48 GB Mac, no quantization,
including model loading), not a comparison of how well they follow the prompt or keep a
subject consistent. FLUX.2 Klein 9B (added 2026-09-29) is about twice as slow as 4B and needs twice
the memory, which next to gemma4 on a 48 GB Mac is tight; 4B stays the default.

### Upscaler

Upscale uses **SeedVR2 7B** by default (`seedvr2-7b`, `mflux-upscale-seedvr2 --resolution 2048`);
3B can be chosen in **Settings → Upscaler**. From a
512×512 image to 2048×2048: 7B ~46 s, 3B ~41 s, most of it loading the model; both add real
texture (fabric weave, skin) over plain resizing, 7B slightly cleaner. Peak memory ~39 GB for
either, so, like the larger Image Models, it can push a 48 GB Mac into swap next to gemma4.

Model loading is only ~5 s of an image, so keeping the Image Model loaded in a separate process
isn't worth it yet ([open-threads.md](open-threads.md)).

## Memory

The Text Model and the Image Model share the Mac's memory. gemma4 31B (~19 GB) plus FLUX.2 Klein
(~10.5 GB at 512 px, ~17.6 GB at 832×1216) fits comfortably on a large-memory Mac; on a smaller
one, use the 512 px sizes. The larger Image Models (Krea 2, Qwen-Image 2.1, Boogu, ERNIE) peak
at 25–39 GB even at 512 px: next to gemma4 on a 48 GB Mac they can push the system into swap,
so set **Quantize** (8 or 4 bit) in Settings to shrink them.

**Python's version doesn't change memory or speed** (2026-10-01, uv's Python 3.14.4 against
3.11.15, same Mac, nothing else loaded): FLUX.2 Klein 4B at 512 px peaked at 10.53 GB on both and
rendered in ~4.0 s against ~4.4 s (within `uv run`'s own overhead); Higgs TTS 3 peaked at 10.1 GB
on both and spoke the same three lines in 2.55–2.84 s on both. The work runs in MLX's compiled
code on the GPU; Python only drives it. The memory is the models' weights: see the memory
headroom thread in [open-threads.md](open-threads.md). mflux, mlx-audio and the voice service run
on uv's own Python (`--managed-python`, `python-preference = "only-managed"`), apart from any
other Python on the Mac.
