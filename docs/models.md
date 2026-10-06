# Choosing models

What we've measured about the local models this project runs, and which to pick. All timings
are on the development Mac (Apple silicon), 2026-09-24.

## Text Model

**Use Gemma 4 26B-A4B, with Thinking off, for every text job**: `gemma4:26b-nvfp4` from Ollama, or
an uncensored Heretic build of it made the same way (`gemma-4-26b-heretic:nvfp4`, see "The heretic
26B-A4B as MLX NVFP4" below). A mixture of experts with about 4B parameters active per token, it is
the fastest model here that does every job well, 17 GB loaded. One model for everything, so none
waits for another to load. Set it in **Settings → Text Model**; it applies from the next Session.

### What the job asks of the model

Each Frame the Text Model gets the current Image Prompt (one paragraph of nine sentences, one per
aspect: subject → pose → expression → camera → clothing → environment → lighting → color →
style) and an Action, and must return the paragraph with only the affected sentences rewritten,
everything the change contradicts removed, and the rest copied word for word
([ADR 0005](adr/0005-image-prompt-is-the-state.md)). Changing the right parts, and only those,
is a real instruction-following task, and it separates small models from large ones.

### How we compared them

Each model played a Chain from the tavern Scenario (`scenarios/tavern.md`) on 2026-10-06: its
Opening, then seven Actions, text only, Thinking off, one model loaded at a time:

1. he is now frightened, not wary
2. move them out onto the rainy street
3. remove the rain
4. the sky is now lit by a burning ship in the harbour
5. art style is now a Japanese woodblock print
6. he draws a knife and crouches, ready to fight
7. ready to fight (a repeat: the right answer is *unclear*, or no change)

The telling cases are 1 (the Opening has him looking up "warily", which must go too), 2 (the
street must replace the tavern wherever it shows, and his pose had him behind the bar), 3 (the
rain runs through the environment, the light and the colour) and 7.

### Results

| Model | Size | Per Action | Opening | 2: the street | 7: the repeat |
|---|---|---|---|---|---|
| **`gemma-4-26b-heretic:nvfp4`** | 25B (4B active), 17 GB loaded | **3.3–3.9 s** | left the traveller out | replaced the tavern, but kept him "behind the warped wooden bar… toward the doorway" | rewrote the pose and expression again |
| `gemma-4-12b-heretic:nvfp4` | 12B, 8.1 GB loaded | 8.0–9.6 s | left the traveller out | the same: the street, but still "behind the bar" | changed nothing (right) |
| `orcarouter/Qwen3.8-27B-Uncensored:mlx-4bit` | 27B, 16 GB | 17.4–19.8 s | the only one with her, in the doorway shaking the rain from her cloak | moved him onto the street too, and the camera, light and colour with him | asked what to change (right, though marked *declined*, not *unclear*) |

All three got the rest right: "frightened" changed only the expression sentence and dropped
"warily", the rain went from every sentence it was in, the burning ship's light replaced the
lamp's, the woodblock print replaced the oil painting, and the knife changed the pose (and, fairly,
the expression). Each copied unchanged sentences word for word throughout.

**Takeaways**

- The difference is staging: both Gemmas move the scene but not the people in it, so a pose can
  keep a piece of the old place; Qwen3.8 rewrites everything a change touches, like an art
  director, at five times the time. The Prompt tab's word diff shows what was left behind.
- Gemma 4 26B-A4B is about 2.5× as fast as the 12B (4B parameters active per token against 12B)
  and as careful; the 12B is the one for when memory is short.
- Small models (4–8B) can't hold this format: in earlier tests they didn't make the change, or
  damaged the prompt (dropping sentences, writing edit notes into it), while their Narration
  claimed success.
- Uncensored models make no difference to what's rendered: the engine's Limits check every
  Action and every prompt whichever model wrote it ([ADR 0002](adr/0002-guardrails-enforced-by-the-engine.md)).
- The first Frame after switching model is slower while Ollama loads it.
- Earlier, with a structured JSON Scene, spark-x2.5 4B also marked a change it had been told to
  refuse as done: small models are unreliable at following rules, not just formats.

### Thinking

Thinking makes the model reason before it answers, which is exactly what catches implied edits
("not wary" also changes how he looks up). It costs time, and with a small model it didn't pay off.
Measured on spark-x2.5 4B (an earlier version of the prompt format, four Actions):

| spark-x2.5 4B | Correct | Text per Frame |
|---|---|---|
| Thinking off | 2 of 4 | ~3 s |
| Thinking on | 3 of 4 | 12 s to 102 s (160 s for the opening) |

Gemma 4 catches the implied changes without it, so leave it off; turn it on only if the model
starts missing them.

### Other lessons

- **Runaway replies.** Small models writing JSON under a schema occasionally never stop, padding
  with whitespace until their context fills. One such reply from spark blocked Ollama, and every
  request queued behind it, for 14 minutes. Every Text Model call now has a token cap and a time
  limit (see [design.md](design.md#the-frame-loop)).
- **The Setup matters.** Describing someone's identity with an expression in it ("a wry smile")
  puts that expression into the identity sentence, where it then contradicts "make him
  frightened". Keep each Setup fact in its own aspect ([scenarios.md](scenarios.md)).

### A small uncensored model: `richardyoung/mistral-7b-instruct-v0.3-abliterated:Q4_K_M` (2026-10-05)

Mistral 7B Instruct v0.3, abliterated (refusals removed), GGUF Q4_K_M, 4.4 GB: a quarter of the
others' size. Compared with the two other uncensored models on everything a Text Model does here,
Thinking off, one model loaded at a time: a seven-Action Chain (an earlier set, since redone on the
tavern above), the Art Agent's six Kael
Frames, the five Suggest cuts, and the Character's reply to the player's real next message after
Frames 1, 4, 12 and 26 of the Kael Roleplay.

| | Mistral 7B abliterated | heretic 26B-A4B | Qwen3.8 27B (uncensored) |
|---|---|---|---|
| Chain, per Action | 2.5–3.9 s | 3.1–3.7 s | 14.7–17.5 s |
| Chain prompts | **broken**: dropped whole sentences (the style, the place, the lighting); wrote edit notes into the prompt; ignored a change of art style | copied word for word; invented a new place for a removal; undid a pose on the repeat | right on most; asked what to remove instead (*unclear*, fair); kept the old place under a new background |
| Art Agent, per picture | 8–16 s | **3–6 s** | 17–58 s |
| Art: who's in the picture | 24 wrong: Kael alone, doing what Elara did | 24: wrote Elara in, marked only Kael as shown | right on all six (16 blocked by a Limit) |
| Suggest, per message | 1.6–4.8 s | **0.8–2.7 s** | 4.6–10 s |
| Suggest | echoed the steer, then a stray second paragraph; tidied ("I slide…"); at 28, "kills both younger men" | short and in the player's style, but wrote the Persona as "she" at 12 | in style; at 26 just "my father" |
| Reply, per message | 4.5–10 s | **2.7–5.8 s** | 9–18 s |
| Replies | in character, but acted for the Persona ("As Elara takes a seat…", "watches her pick it up") and once thought in the third person | in character, in Kael's clipped voice, never acting for her | the richest prose, the tersest dialogue ("Clever girl.") |

**Mistral 7B isn't worth it.** The heretic is a mixture of experts with about 4B parameters active
per token, so it is as fast as a 7B model or faster at every task, and better at all four. Mistral's
only edge is size (4.4 GB against 16), which matters less now that renders unload the Text Model
first. Like the other small models it can't hold the Chain's prompt format.

**It needed a fix to play the Character at all.** Mistral's chat template refuses any history in
which an assistant turn follows the system message, and the Roleplay's did: the Character speaks
first. Every reply failed with Ollama's "conversation roles must alternate user/assistant" error. The
history now begins with the request that asked for the opening Reply (`roleplayMessages`), as the
model saw it then, so turns alternate from the start for every model; the replies above for all
three were rerun with it.

### Two smaller Heretic models (2026-10-05)

From the survey in [research/small-uncensored-models.md](research/small-uncensored-models.md), the
two best candidates under 12 GB, on the same four tests as above, beside the heretic 26B-A4B's run
from the same day:

| | Gemma 4 12B Heretic (igorls, Q4_K_M) | Qwen3.5-9B Heretic (llmfan46, Q6_K) | heretic 26B-A4B |
|---|---|---|---|
| On disk / loaded (`ollama ps`) | 7.4 GB / **9.5 GB** | 8.3 GB / 12 GB (it carries a vision encoder) | 16 GB / 18 GB |
| Chain, per Action | 7.4–9.8 s | 6.4–7.5 s | **3.1–3.7 s** |
| Chain prompts | copied word for word; right on all but one detail of the old place left in the lighting; left the repeat alone (right, though marked *done*, not *unclear*) | copied word for word; kept the person standing in the old place under a new background | see above: invented a place, undid a pose |
| Art Agent, per picture | 8.5–21 s | 6.6–20.6 s | **3–6 s** |
| Art: who's in the picture | **right on all six**, 24 included | right on five; 24 muddled (who was awake and who asleep); 9 and 16 blocked | 24: wrote Elara in, marked only Kael as shown |
| Suggest, per message | 1.6–5.5 s | 2.1–4.1 s | **0.8–2.7 s** |
| Suggest | tidied three of five ("I take a sip, the bitterness…"), against the player's style | addressed Kael as "you" at 12; otherwise in style | short and in style |
| Reply, per message | 6–13 s | 4.5–8.7 s | **2.7–5.8 s** |
| Replies | in character, terse ("I'll keep my distance."), never acting for her | in character, but odder ("Left is better."; counts "One" to himself) | in character |

**Gemma 4 12B Heretic is the one to keep** for when memory is tight: half the heretic 26B-A4B's
memory (9.5 GB against 18), as careful as Qwen3.8 27B at the Chain's word-for-word copying and at
who's in the picture while about twice as fast, and good replies. It costs speed: a dense 12B works all its
weights on every token, so it is 2–3× slower than the 26B-A4B (about 4B active), about as fast as
gemma4 31B. Its Suggest tidies the player's style more than the others. Qwen3.5-9B Heretic is
faster than Gemma 12B but not smaller once loaded, and wanders more.

**The same Gemma 4 12B Heretic on Ollama's MLX engine (NVFP4).** No uncensored MLX build of it is
published, so it was made from igorls's full-precision weights (`igorls/gemma-4-12B-it-heretic-v1`,
24 GB of safetensors) with a Modelfile of just `FROM <the downloaded folder>` and
`ollama create gemma-4-12b-heretic:nvfp4 -q nvfp4` (Ollama 0.35.1; 17 s, 8.0 GB). It keeps the
model's Thinking (on by default; the app turns it off) and its vision and audio encoders. Against
the GGUF Q4_K_M, the same four tests:

| | GGUF Q4_K_M | MLX NVFP4 |
|---|---|---|
| Loaded (`ollama ps`) | 9.5 GB | **8.1 GB** |
| Chain, per Action | 7.4–9.8 s | **6.0–8.5 s** |
| Chain prompts | right; left the repeat alone | right; left the repeat alone; but a new pose also changed the expression unasked |
| Art Agent, per picture | 8.5–21 s | 9.5–23 s |
| Art: who's in the picture | right on all six | **two wrong:** put Elara into 6 (Kael alone); 24 lost the two men |
| Suggest, per message | 1.6–5.5 s | 2.6–5.3 s |
| Reply, per message | 6–13 s | 5.4–10.9 s |
| Replies | in character | in character, as good |

One run each, so the Art Agent difference may be partly chance, but it's the job where this model
was best. The MLX build is the one for playing the Character (smaller, a little faster); for the
Art Agent the GGUF was the more careful.

**Converting to MLX saves little memory; bits do.** Memory is the weights times the bits per
weight, and the 4-bit formats store about the same (Q4_K_M about 4.8 bits a weight, NVFP4 about
4.5): the 12B went from 9.5 GB to 8.1. What MLX buys is speed. Ollama 0.35.1's `create -q` offers
only `int4`, `int8`, `nvfp4`, `mxfp4` and `mxfp8`, so nothing under 4 bits can be built this way.

**mlx-community's ready-made MLX models don't run in Ollama when they're mixtures of experts.**
`mlx-community/gemma-4-26B-A4B-it-heretic-4bit` (and its 2.6-bit sibling) imported with
`ollama create` from the folder, but every request failed with "mlx runner failed: layer 0: missing
MoE expert weights". mlx-vlm, which converted them, splits each layer's experts into three
quantized matrices (`experts.switch_glu.gate_proj`, `up_proj`, `down_proj`); Ollama's runner wants
the original layout (`experts.gate_up_proj`, `experts.down_proj`), which only an `ollama create -q`
from the full-precision weights writes (2026-10-05).

**The heretic 26B-A4B as MLX NVFP4**, built that way from `coder3101/gemma-4-26B-A4B-it-heretic`
(51.6 GB of safetensors; a different Heretic build from pdurlej's GGUF): 17 GB on disk (the GGUF is
16), **17 GB loaded against 18**. On the same four tests, beside the GGUF's run from the same day:

| | GGUF Q4_K_M (pdurlej) | MLX NVFP4 (coder3101) |
|---|---|---|
| Chain, per Action | 3.1–3.7 s | 2.9–4.0 s |
| Chain prompts | invented a new place for a removal; undid a pose on the repeat | kept the place for the removal (right); undid a pose on the repeat; reworked the lighting and palette unasked; no garbled words |
| Art Agent, per picture | 3–6 s | 4.7–8.1 s |
| Art: who's in the picture | 24: wrote Elara in, marked only Kael | right on all six, 24 included; wrote "Elara is out of sight" into Kael's pictures |
| Suggest, per message | 0.8–2.7 s | 0.9–2.3 s |
| Reply, per message | 2.7–5.8 s | 2.8–4.3 s |

Much the same model, about as fast, 1 GB lighter: not a reason to switch on its own, and not a way
under 12 GB. A 26B-A4B under 12 GB would need about 3 bits, which `ollama create` can't make.

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

### Audio format (2026-10-02)

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

### Qwen-Image 2.1 on mflux 0.21: the step cache and Viggle's turbo LoRA (2026-10-04)

mflux 0.21 adds a step cache for Qwen-Image 2.1 (`--step-cache-ratio`, TeaCache-style: it skips
the transformer on that share of the steps whose timestep changes least, and reuses the step
before) and a scheduler for Viggle's 6-step turbo LoRA (`--scheduler viggle_turbo`). Measured on
the app's settings at the time: the saved 8-bit copy, 25 steps, no CFG, one prompt (Elara,
waist-up) and seed, at 1024×1024, everything else closed:

| Run | Time | Peak memory | Looks |
|---|---|---|---|
| mflux 0.20, 25 steps | 103 s | | |
| mflux 0.21, 25 steps | 98–100 s | 39.1–39.3 GB | the same picture as 0.20 |
| + step cache 0.4 | 66 s (1.5×) | 38.7 GB | near the same: same pose, face and dress; slightly softer brushwork |
| turbo LoRA, 6 steps | 29–31 s (3.4×) | 38.9–39.2 GB | a different take on the prompt: smoother, more polished, less painterly; the face holds up |

- **The release notes' "~1.8× faster" is mostly the step cache**: 0.21 alone is only 2–5% faster.
- **Both work on the 8-bit saved copy**, the one the app renders from, and the copy saved by 0.20
  loads in 0.21 (the app still saves a fresh one, named for 0.21, and deletes the old).
- **The step cache is on in the app** for Qwen-Image 2.1 (Settings → Step cache, 0.4 by default;
  0.25, 0.5 or off). The other Image Models' commands don't take it (2026-10-04). It leaves runs
  under 10 steps alone.
- **The turbo LoRA is Settings → Fast**, off by default: `Viggle/Qwen-Image-2.1-viggle-turbo`
  (v0.3, rank 256, 1.3 GB), passed to mflux as `repo:file`, so mflux fetches it into the Hugging
  Face cache on first use. It must run at exactly 6 steps with its scheduler, so Fast overrides
  Steps and the step cache. It's under Qwen's research license (non-commercial), like LiTo. At
  512×512 on the 8-bit copy: 5 s of denoising, 24.5 GB peak. It's v0.3, the file the model card
  says to use; v0.2.1 (crisper, grainier) is also in the repo. Viggle's 9-step mode (the same
  LoRA, switched off for the last two steps) isn't possible through mflux 0.21
  ([open-threads.md](open-threads.md)).

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
at 25–39 GB even at 512 px: next to gemma4 on a 48 GB Mac they can push the system into swap.

**Quantizing as mflux does it doesn't lower the peak** (2026-10-01, 512 px, the art-tags test
set's nine prompts): `--quantize` loads the full weights and converts them as it goes, so the peak
comes first. So Settings → Quantize renders from a copy saved once instead:

| Image Model | Off | 8-bit, converted each render | 8-bit, converted once and saved |
| ----------- | --- | ---------------------------- | ------------------------------- |
| FLUX.2 Klein 4B | 4.1 s, 10.5 GB | 4.9 s, 10.5 GB | 4.3 s, 7.0 GB |
| FLUX.2 Klein 9B | 9.6 s, 20.9 GB | 10.4 s, 20.9 GB | 7.1 s, 12.6 GB |
| Qwen-Image 2.1 | 28.7 s, 20.5 GB | 34.1 s, 20.5 GB | 28.5 s, 13.4 GB |

Saved once (`mflux-save --quantize 8`, 6–10 s; 8.6 GB for Klein 4B, 17 GB for Klein 9B, 22 GB for
Qwen-Image, on top of the originals) and rendered from that copy (`--model <path> --base-model
<id>`), 8-bit saves 3.5–8 GB at the same speed or faster, with the same pictures as converting each
time. Against
full precision the pictures keep their composition and only fine detail shifts (mean pixel
difference about 1 of 255 on Qwen-Image, 5–11 on the Kleins). The app saves a copy the first time a
render needs it (`server/quantized.ts`), in `models/quantized/<model>-<bits>bit-mflux<version>` (in the project, gitignored),
inside the render queue; a copy made by another mflux is replaced on next use, Settings lists the
copies with their sizes to delete, and if saving fails the render converts as it goes.

**Why mflux converts after loading, and why the app saves its own copies.** mflux has two loading
paths (`models/common/weights/loading/weight_applier.py`, mflux 0.20): original weights with
`--quantize` are loaded into the model whole and then converted (`nn.quantize`), so full precision
is in memory first; weights saved already quantized (by `mflux-save`, which records their bit
width) have the model set up quantized first and the small weights loaded straight into it, so
full precision never is. The first suits most users: one download serves every bit width (3, 4, 5,
6, 8 or none), with no extra disk, no step beforehand and nothing to go stale when mflux or the
model updates; it costs peak memory and a little speed, which only matter next to other big models
on a 48 GB Mac. The saved copies use mflux's own second path; the app adds only when a copy is
made, where it's kept, replacing it after an mflux update, and listing it in Settings.

The mflux project also publishes copies already converted, in the same format
(`mflux-community/flux2-klein-4b-mflux-q3` … `-q8`, `flux2-klein-9b-mflux-q3` … `-q5`). Converting
locally fits better: 6–10 s against an 8–17 GB download per model and bit width; every Image Model
and bit width, where the published ones cover some (no 8-bit Klein 9B or Qwen-Image 2.1 there,
2026-10-01); no extra download; and made by the installed mflux.
A published copy would only save the conversion on a fresh machine, for the models it covers. Qwen-Image 2.1's peak
here, 20.5 GB, is lower than the ~35 GB measured on 2026-09-25 with an earlier setup.

**The voice service** (2026-10-01) held 36 GB with only Higgs (~10 GB) loaded, and later 46 GB
with nothing loaded. Two causes: MLX keeps each generation's working memory for reuse (now capped
and cleared after every request: 9.1–9.7 GB over a run of long lines), and the models hold
reference cycles, so an unloaded model stayed in memory until Python's cycle collector happened to
run: every idle unload and every switch between VoiceDesign and Higgs left one behind. Unloading
now collects them: designing, speaking and unloading three times over goes 4.6 → 8.8 → 0 GB each
round. Its `/health` reports the memory it holds (`gb`). Reloading Higgs takes 1.9 s warm and 3.2 s
straight after Qwen-Image, so it now unloads after a minute unused instead of ten.

**Python's version doesn't change memory or speed** (2026-10-01, uv's Python 3.14.4 against
3.11.15, same Mac, nothing else loaded): FLUX.2 Klein 4B at 512 px peaked at 10.53 GB on both and
rendered in ~4.0 s against ~4.4 s (within `uv run`'s own overhead); Higgs TTS 3 peaked at 10.1 GB
on both and spoke the same three lines in 2.55–2.84 s on both. The work runs in MLX's compiled
code on the GPU; Python only drives it. The memory is the models' weights: see the memory
headroom thread in [open-threads.md](open-threads.md). mflux, mlx-audio and the voice service run
on uv's own Python (`--managed-python`, `python-preference = "only-managed"`), apart from any
other Python on the Mac.
