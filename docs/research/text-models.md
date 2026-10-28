# Text Models: findings

The evidence behind the Text Model in [models.md](../models.md): every bench run on a Text Model, and the survey that picked the candidates, each dated. Some of it is history, kept for what it showed: models since dropped, prompt shapes since changed. Timings are on the Mac (Apple silicon, 48 GB) unless they say the Windows PC (RTX 4070, 12 GB). How Ollama itself pulls, builds and loads models is in [ollama.md](ollama.md).

Each bench is newest at the bottom of its section. The Kael tavern Roleplay several of them use was played from the public tavern Scenario (`scenarios/tavern.md`).

## The Chain's prompt edit (2026-10-06)

### What the job asks of the model

Each Frame the Text Model gets the Chain's current Image Prompt (one paragraph of nine sentences, one per
aspect: subject → pose → expression → camera → clothing → environment → lighting → color →
style) and an Action, and must return the paragraph with only the affected sentences rewritten,
everything the change contradicts removed, and the rest copied word for word
([ADR 0005](../adr/0005-image-prompt-is-the-state.md)). Changing the right parts, and only those,
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
  Action and every prompt whichever model wrote it ([ADR 0002](../adr/0002-guardrails-enforced-by-the-engine.md)).
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
  limit (see [design.md](../design.md#the-frame-loop)).
- **The Setup matters.** Describing someone's identity with an expression in it ("a wry smile")
  puts that expression into the identity sentence, where it then contradicts "make him
  frightened". Keep each Setup fact in its own aspect ([scenarios.md](../scenarios.md)).

## A small uncensored model: `richardyoung/mistral-7b-instruct-v0.3-abliterated:Q4_K_M` (2026-10-05)

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

## Two smaller Heretic models (2026-10-05)

From the survey [below](#survey-small-uncensored-text-models-under-12-gb-2026-10-05), the
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

**The GGUF on an NVIDIA card** (2026-10-07; Windows 11, RTX 4070 12 GB, Ollama 0.40.0): the Text
Model for Windows, where the MLX build can't run. 8.3 GB loaded, 100% GPU, ~53 tokens/s; its
context is cheap (7.5–8.3 GB at `num_ctx` 16k to 128k alike, and a 56.5k-token chat read in 30 s
with 11.2 GB of the card in use; see the README on the context length). Through the app at 16k:
Cast 7.5–18.4 s, Replies 4.8–5.9 s, Suggest 2.2–3.8 s, a Chain's text 5.5–15.3 s (each after
ComfyUI's render, so with a reload). Only these runs, not the four tests above. A QAT Q4_0 build
([igorls](https://huggingface.co/igorls/gemma-4-12B-it-qat-q4_0-unquantized-heretic-GGUF), 7.0 GB)
may lose less to quantization; not tried.

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
before: someone alone (6, 29), an empty room (7), and three with both people and detail the Limits
block (9, 16, 24).

**Thinking: not worth it.** Qwen3.8 27B (uncensored), Thinking off against on:

| | Off | On |
|---|---|---|
| Time per picture | 24–49 s | 135–536 s (5–22×) |
| Reasoning | none | 6,000–18,000 characters |
| Who's in the picture | right on all five | same, except Frame 29: it invented Elara as a distant figure, and the picture was blocked |

With Thinking the sentences were more cinematic and one per aspect, and once more accurate (Frame
16), but it also dropped a detail in Frame 24. No gain in correctness,
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
31B, which kept more of the story's props in 9 and 24 (pictures blocked while the Limits
are on). Qwen3.8 again wrote about absences ("Elara Vance is absent from the frame"). Settings → Art
Agent model sets a separate model for pictures (Thinking off), so the Character can be played by
one model and pictured by another.

**Two schema traps, both gemma4:** with the yes/no "is this person in the picture" answers first in
the reply, gemma4 wrote them and then only blank lines until its token cap, 6 times in 6 (as
"yes"/"no" words, 3 in 6); with them last, 0 in 6. A `maxLength` on each sentence did the same. So
the answers come last and the sentences are trimmed in code (`trimFields`).

### Tags instead of prose (2026-09-29)

Settings → Art Agent style could have the Art Agent write each aspect as short comma-separated tags
instead of a sentence (`prompts/roleplay/art-frame-tags.md`; removed 2026-10-26 on these findings,
[ADR 0023](../adr/0023-the-art-agent-writes-prose.md)). The identities stay the Look's
sentences; only the seven aspects become tags, and clothing tags still name each person, so the
Limits' clothing check works the same. **Prose stays the default: it won on all seven installed
Image Models.** Measured on three Frames of the Kael tavern Roleplay (6: Kael alone; 9 and 12:
both), each Art Agent writing prose, Danbooru-style tags
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
- **Tags follow the story more literally, and ignore "dress them" far more.** gemma4's tags, in both
  styles, kept clothing the Limits would block, and so did the heretic's booru tags. (Its prose
  also did once, which the Limits now catch.)
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

The prompts, grids and render script are kept in [bench/art-tags/](../bench/art-tags/), to compare a
new Image Model on the same prompts (and when to write a fresh set instead).

### How long each Text Model pictures (2026-10-09)

**How long each Text Model pictures** (the same Roleplay Pictures above, by the model that wrote
them, as recorded on each; same instructions and caps, all prose):

| Model | Pictures | Words, median (range) |
|---|---|---|
| Qwen3.8 27B (`orcarouter/Qwen3.8-27B-Uncensored:mlx-4bit`) | 19 | 312 (201–380) |
| gemma-4 26B heretic (`pdurlej/gemma-4-26B-A4B-it-heretic`) | 4 | 186 (172–223) |
| the same, NVFP4 (`gemma-4-26b-heretic:nvfp4`) | 1 | 143 |
| not recorded (older pictures) | 11 | 244 (187–297) |

One model writes about 1.7× as much as another from the same instructions, so a length a model is
told to keep isn't a length it keeps: a budget per Image Model has to be enforced by the app, and a
test of what length renders best holds only for the Text Model it was run with.

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

## Survey: small uncensored Text Models under ~12 GB (2026-10-05)

The survey that chose the candidates benched above ("Two smaller Heretic models"). Nothing in it was run; its notes on pulling and building models with Ollama are now in [ollama.md](ollama.md).

Which uncensored ("abliterated", "heretic") local language models under about 12 GB could take
over this app's text jobs on a 48 GB Apple Silicon Mac, next to 20–39 GB Image Models? This note
surveys what exists as of **2026-10-05**, run through Ollama (MLX or GGUF), and ends with a
shortlist to benchmark.

Every claim links to the source that owns it: the model card, the Hugging Face file listing, the
ollama.com page, or the leaderboard's own data file. Sizes are the published file or tag sizes.
"Not verified" means exactly that. Nothing was pulled or run. The only local checks were
`ollama list`, `ollama show` on the two installed baselines, `ollama create --help` (Ollama 0.35.1),
and reading the app's code for which Ollama options it sets.

### Summary

- **The best bet is Gemma 4 12B, decensored with Heretic.** It is a dense 12B model that Google
  released in May 2026. Its official scores sit close to the 26B-A4B mixture of experts that this
  app already likes. On EQ-Bench Creative Writing v3 it scores Elo 1288.9 against 1304.6, and on
  Longform 48.7 against 50.7. A Heretic build with very little damage (KL 0.0284, 0/100 refusals)
  is 7.4 GB at Q4_K_M. Its risk is speed: all 12B parameters are active for every token, against
  about 4B for the 26B-A4B.
- **The same weights can run on Ollama's MLX engine** if you build an NVFP4 model from the
  full-precision weights with `ollama create -q nvfp4`. Ollama measured NVFP4 on exactly this
  model, Gemma 4 12B, and found it loses about half as much quality as q4_K_M and generates about
  20% faster. No uncensored Gemma 4 12B MLX tag was found on ollama.com.
- **Qwen3.5-9B Heretic is the best non-Gemma option**: a different model family, KL 0.0241,
  7.4 GB at Q6_K. It is weaker as a writer on the UGI leaderboard, and it thinks by default, so
  Thinking must stay off.
- **The 26B-A4B heretic at 3 bits fits (11.3–11.6 GB),** and it is worth one run because it is an
  exact comparison against the model already measured. But that model already garbles copied
  sentences at Q4_K_M (the benches above), and fewer bits are unlikely to help.
- **Everything else either doesn't fit or is too weak.** Qwen3.6-35B-A3B, GLM-4.7-Flash and
  Nemotron 3.5 Lightning are 30–35B in total, so they fit only at about 2 bits. Gemma 4 E4B,
  Ministral 3, Mistral Nemo, Phi-4 and Granite 4.2 score well below the 12B on the leaderboards,
  in the range where this app's Mistral 7B test failed.

### What the jobs ask for

From the benches above: the hard job is the Chain's prompt edit, which rewrites only the
affected sentences of a nine-sentence prompt and copies the rest word for word. Every 4–8B model
measured so far failed it: spark-x2.5 4B, llama3 8B and Mistral 7B abliterated. Even the 26B-A4B
heretic garbled one copied sentence per run. The other jobs went better. On the Art Agent (who is
in the picture), Suggest (the player's terse lowercase style) and Roleplay replies (strict JSON
`{internal, actions, dialogue}`, never acting for the player), the 26B-A4B heretic was the
fastest and good. Mistral 7B acted for the player and broke format.

So the deciding qualities are instruction-following and faithful copying, then writing, then
speed. Refusal removal only has to be good enough: the engine's Limits check everything the model
writes, whichever model wrote it ([ADR 0002](../adr/0002-guardrails-enforced-by-the-engine.md)).

### Reading the abliteration numbers

[Heretic](https://github.com/p-e-w/heretic) removes refusals by directional ablation. It tunes the
ablation by "co-minimizing the number of refusals and the KL divergence from the original model".
Each Heretic model card reports two numbers:

- **Refusals**: how many of 100 harmful prompts were still refused.
- **KL divergence**: how far the model's output moved on harmless prompts. Lower means less
  damage.

For scale, Heretic's own gemma-3-12b-it scored 3/100 refusals at KL 0.16. Earlier hand-made
abliterations of the same model scored KL 0.45 and 1.04 ([Heretic
README](https://github.com/p-e-w/heretic)). The README also warns that the values "might be
platform- and hardware-dependent". Each uploader also picks their own prompt sets, so KL compares
fairly only between builds of the *same* base model, and even then only roughly.

Gemma 4 and Qwen 3.5 are hybrid thinking models. Some abliterations target only the
non-thinking answer. That suits this app, which runs every Text Model with Thinking off
(the benches above). One uploader states this outright and recommends thinking off for
roleplay ([igorls/gemma-4-12B-it-heretic](https://huggingface.co/igorls/gemma-4-12B-it-heretic-v1)).

### What the leaderboards say

**UGI leaderboard** ([space](https://huggingface.co/spaces/DontPlanToEnd/UGI-Leaderboard),
[data file](https://huggingface.co/spaces/DontPlanToEnd/UGI-Leaderboard/blob/main/ugi-leaderboard-data.csv),
last updated 2026-10-03). The columns used here are UGI (overall uncensored general intelligence),
W/10 (willingness to answer, out of 10), NatInt (general knowledge and intelligence) and Writing.
Rows are the no-thinking runs where the board has one, since that is how the app runs models:

| Model (as listed) | Total / active params | UGI | W/10 | NatInt | Writing | Tested |
|---|---|---|---|---|---|---|
| llmfan46/gemma-4-26B-A4B-it-ultra-uncensored-heretic | 26B / 4B | 44.96 | 8.8 | 33.71 | 42.12 | 2026-04-20 |
| llmfan46/Qwen3.6-35B-A3B-uncensored-heretic (no think) | 35B / 3B | 44.25 | 9.5 | 28.42 | 37.6 | 2026-04-26 |
| trohrbaugh/Qwen3.5-9B-heretic-v2 (no thinking) | 9B | 37.57 | 9.2 | 16.05 | 32.52 | 2026-04-05 |
| huihui-ai/Huihui-Qwen3.5-9B-abliterated (no thinking) | 9B | 37.63 | 9.0 | 14.88 | 29.12 | 2026-04-05 |
| llmfan46/gemma-4-E4B-it-ultra-uncensored-heretic | 8B / 4.5B | 38.12 | 9.2 | 16.7 | 19.06 | 2026-06-28 |
| coder3101/gemma-4-E4B-it-heretic | 8B / 4.5B | 37.71 | 9.8 | 18.73 | 22.27 | 2026-06-28 |
| p-e-w/phi-4-heretic | 14B | 36.63 | 8.0 | 21.43 | 24.0 | 2025-11-16 |
| mistralai/Ministral-3-14B-Instruct-2512 (original) | 14B | 32.57 | 6.2 | 16.73 | 31.44 | 2025-12-03 |
| p-e-w/Mistral-Nemo-Instruct-2407-heretic-noslop | 12B | 29.48 | 4.2 | 22.19 | 37.64 | 2026-01-13 |

**Gemma 4 12B is not on the UGI board in any form** as of that data file. It came out on
2026-05-23 ([google/gemma-4-12B-it](https://huggingface.co/google/gemma-4-12B-it)).

**EQ-Bench Creative Writing v3 and Longform** ([creative writing](https://eqbench.com/creative_writing.html),
[longform](https://eqbench.com/creative_writing_longform.html), read from the pages' data files
on 2026-10-05). These test the original models only:

| Model | Creative Writing v3 Elo | Longform score |
|---|---|---|
| google/gemma-4-31B-it | 1368.2 | 56.5 |
| Qwen/Qwen3.8-27B | 1671.3 | 53.3 |
| google/gemma-4-26B-A4B-it | 1304.6 | 50.7 |
| **google/gemma-4-12B-it** | **1288.9** | **48.7** |
| nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4 | 1280.3 | — |
| zai-org/GLM-4.7-Flash | 1124.7 | 47.8 |
| Qwen/Qwen3.5-35B-A3B | — | 44.5 |
| mistralai/Ministral-3-14B-Instruct-2512 | — | 31.9 |
| mistralai/Mistral-Nemo-Instruct-2407 | 880.9 | 28.7 |
| openai/gpt-oss-20b | 665.6 | 21.2 |

Qwen3.5-9B and Gemma 4 E4B are not on either EQ-Bench list.

**Google's own benchmarks** ([gemma-4-12B-it card](https://huggingface.co/google/gemma-4-12B-it))
put the 12B close to the 26B-A4B on instruction and agent tasks and well above the E4B:

| | 26B A4B | 12B | E4B |
|---|---|---|---|
| MMLU Pro | 82.6% | 77.2% | 69.4% |
| Tau2 (agentic, avg of 3) | 68.2% | 69.0% | 42.2% |
| BigBench Extra Hard | 64.8% | 53.0% | 33.1% |

Qwen reports IFEval 91.5 and IFBench 64.5 for Qwen3.5-9B
([Qwen3.5-9B card](https://huggingface.co/Qwen/Qwen3.5-9B)). Google's card gives no IFEval number
for Gemma 4, so the two can't be compared on instruction-following from first-party numbers.

### Candidates

#### 1. Gemma 4 12B, Heretic (igorls, v1)

- **Base:** [google/gemma-4-12B-it](https://huggingface.co/google/gemma-4-12B-it). A dense model
  of 11.95B parameters, released 2026-05-23, with 256K context. The licence is Apache 2.0 per
  Google's card, although igorls's repos tag it `gemma`. The card says Gemma 4 has native
  `system` role support, so it should not hit the strict-alternation problem that Mistral 7B hit.
  Thinking is switchable (`enable_thinking`). The installed Gemma 4 GGUF defaults to thinking *on*
  in Ollama (`ollama show`), so the app's `think: false` matters.
- **Decensored build:** [igorls/gemma-4-12B-it-heretic-v1](https://huggingface.co/igorls/gemma-4-12B-it-heretic-v1).
  Heretic, **0/100 refusals, KL 0.0284**, abliterated for the non-thinking answer.
- **GGUF:** [igorls/gemma-4-12B-it-heretic-GGUF](https://huggingface.co/igorls/gemma-4-12B-it-heretic-GGUF)
  has Q4_K_M at **7.38 GB** and Q8_0 at 12.67 GB (from the file listing).
  Pull: `ollama pull hf.co/igorls/gemma-4-12B-it-heretic-GGUF:Q4_K_M` (the
  [hf.co syntax](https://huggingface.co/docs/hub/ollama)).
- **On ollama.com:** [HammerAI/gemma-4-12b-heretic](https://ollama.com/HammerAI/gemma-4-12b-heretic)
  is 7.4 GB (`12b-q4_K_M`). Its description names igorls's v1 as the source, but there is no
  readme and the page lists 128K context, so whether it is the same file is **not verified**.
- **MLX:** no uncensored Gemma 4 12B MLX tag was found on ollama.com. The official, censored
  [`gemma4:12b-mlx`](https://ollama.com/library/gemma4/tags) is 7.7 GB. See
  [Building an MLX model](ollama.md#building-an-mlx-model-from-a-heretic-checkpoint) for making one from the
  v1 safetensors (23.95 GB download).
- **Expected memory when loaded:** about 8–9 GB. This is an estimate: the 26B-A4B heretic grows
  from 16 GB on disk to 18 GB loaded here, at Ollama's default context. Check with `ollama ps`.
- **Why it might fit:** it scores close to the 26B-A4B on Google's benchmarks and on EQ-Bench. It
  is the same family as the two Gemmas this app already rates, gemma4 31B for literal edits and
  the 26B-A4B heretic for Art, Suggest and Replies. It is also among the lowest-KL Heretic builds
  listed here.
- **Risks:** 12B active parameters against about 4B for the 26B-A4B, so it should be noticeably
  slower per token than the current fast model (not measured). Only Google's own scores and
  EQ-Bench (original model) exist for it, with no UGI entry. The Chain's word-for-word copying is
  untested at this size. The two Gemmas measured here passed it at 31B, and the 26B-A4B slipped.

Other Gemma 4 12B uncensored builds, for reference:

| Build | Refusals / KL (card) | Size | Note |
|---|---|---|---|
| [igorls QAT Q4_0 heretic](https://huggingface.co/igorls/gemma-4-12B-it-qat-q4_0-unquantized-heretic-GGUF), on Ollama as [`igorls/gemma-4-12B-it-qat-q4_0-unquantized-heretic`](https://ollama.com/igorls/gemma-4-12B-it-qat-q4_0-unquantized-heretic) | Ollama page: 0/99, KL 0.0154. HF GGUF card (v1.1, 2026-06-07): ~22% with thinking on, **KL 0.32** | Q4_0 7.0 GB | The two pages disagree, and which build the Ollama tag holds is not verified. Q4_0 matches Google's quantization-aware training. |
| [llmfan46/gemma-4-12B-it-uncensored-heretic](https://huggingface.co/llmfan46/gemma-4-12B-it-uncensored-heretic) (ARA method) | 6/100, KL 0.1203 | GGUF repo exists | About four times igorls's KL. |
| [HauhauCS/Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced](https://huggingface.co/HauhauCS/Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced) | "0/465", no KL | Q4_K_M 6.9 GB | Not Heretic. The card says it "reasons before answering", and it ships its own recommended sampling. |
| [huihui_ai/gemma-4-abliterated:12b](https://ollama.com/huihui_ai/gemma-4-abliterated/tags) | none published on the page | 7.6 GB (`12b-qat` also 7.6 GB) | `mgraffam/gemma4-heretic:12b` has the same digest, so it is a copy of this one, not a Heretic build. |

#### 2. Qwen3.5-9B, Heretic (llmfan46, v2)

- **Base:** [Qwen/Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B). A dense 9B model with a
  hybrid design (Gated DeltaNet plus gated attention) and 262K context, Apache 2.0, released
  2026-02. It **thinks by default** and has a separate non-thinking mode.
- **Decensored build:** [llmfan46/Qwen3.5-9B-ultra-uncensored-heretic](https://huggingface.co/llmfan46/Qwen3.5-9B-ultra-uncensored-heretic).
  Heretic 1.2.0 (ARA), **4/100 refusals (from 86), KL 0.0241**.
- **GGUF:** [llmfan46/Qwen3.5-9B-ultra-uncensored-heretic-GGUF](https://huggingface.co/llmfan46/Qwen3.5-9B-ultra-uncensored-heretic-GGUF)
  (v2 files): Q4_K_M 5.53 GB, **Q6_K 7.36 GB**, Q8_0 9.53 GB.
- **On ollama.com:** [`huihui_ai/qwen3.5-abliterated:9b`](https://ollama.com/huihui_ai/qwen3.5-abliterated/tags)
  is 6.6 GB (q4_K) or 11 GB (q8_0). It is a huihui abliteration, not Heretic, and the page gives
  no KL.
- **MLX:** the official [`qwen3.5:9b-nvfp4`](https://ollama.com/library/qwen3.5/tags) is 7.2 GB
  but censored. An uncensored MLX build would have to be made with `ollama create -q nvfp4`.
- **Why it might fit:** it is a different family from Gemma, so it tells the benchmark whether
  failures belong to Gemma or to the model size. Qwen reports strong instruction-following
  (IFEval 91.5). Its KL is low.
- **Risks:** it is far below the Gemma 4 MoE on UGI (NatInt 16.05 against 33.71, Writing 32.52
  against 42.12, no-thinking runs). The larger Qwen measured here, Qwen3.8 27B, tended to change
  things it wasn't asked to (the benches above). Whether a 9B shares that habit is not
  known. Thinking must be off (`think: false`), and whether Ollama recognises the thinking toggle
  in a GGUF pulled from hf.co is not verified. Check with `ollama show`.

#### 3. Gemma 4 26B-A4B Heretic at 3 bits

- **Build:** [llmfan46/gemma-4-26B-A4B-it-uncensored-heretic](https://huggingface.co/llmfan46/gemma-4-26B-A4B-it-uncensored-heretic),
  **11/100 refusals, KL 0.0468**. The "ultra" sibling has 3/100 refusals at KL 0.1237.
- **GGUF at under 12 GB:** [mradermacher/gemma-4-26B-A4B-it-uncensored-heretic-i1-GGUF](https://huggingface.co/mradermacher/gemma-4-26B-A4B-it-uncensored-heretic-i1-GGUF)
  has IQ3_XXS at 11.33 GB, **IQ3_XS at 11.64 GB** and IQ2_M at 10.38 GB (imatrix quants). The
  baseline Q4_K_M is 16.8 GB.
- **Params:** 25.2B total, 3.8B active, 8 of 128 experts per token, 256K context (Google's card).
- **Expected memory when loaded:** about 13 GB (estimate, by the same 16 → 18 GB growth). That is
  a little over the target.
- **Why it might fit:** it is the same model already measured as fast and good at Art, Suggest
  and Replies, so a run shows exactly what dropping from 4 to 3 bits costs.
- **Risks:** at Q4_K_M it already garbled one copied word per Chain run
  (the benches above), so quantization damage will most likely show up first in that job.
  It is not the same upload as the installed `pdurlej/gemma-4-26B-A4B-it-heretic`, whose source
  checkpoint isn't stated on [its Ollama page](https://ollama.com/pdurlej/gemma-4-26B-A4B-it-heretic).

#### 4. Qwen3.8-27B-Uncensored at 2 bits (wildcard)

- **Tags:** [`orcarouter/Qwen3.8-27B-Uncensored`](https://ollama.com/orcarouter/Qwen3.8-27B-Uncensored/tags)
  has `mlx-2bit` (MLX) at **9.4 GB**, `iq2_m` at 11 GB and `iq2_xxs` at 9.8 GB. The installed
  `mlx-4bit` is 16 GB.
- **Why it might fit:** it is the careful model already measured, which was right on most Chain
  Actions and never garbled a copy. It has MLX at this size.
- **Risks:** the uploader's own notes call iq2_m "some quality loss" and iq2_xxs "most degraded".
  The MLX 2-bit gets no comment. The model is dense, with all 27B active, and was the slowest
  measured here at 4 bits (14.7–17.5 s per Chain Action). Whether 2 bits makes it faster or keeps
  it careful is not known.

#### Set aside

| Model | Why not |
|---|---|
| Gemma 4 E4B heretic, e.g. [coder3101](https://huggingface.co/coder3101/gemma-4-E4B-it-heretic) (3/100, KL 0.0058), [igorls GGUF](https://huggingface.co/igorls/gemma-4-E4B-it-heretic-GGUF) Q8_0 8.03 GB | 4.5B effective. Google rates it far below the 12B (Tau2 42.2% against 69.0%). UGI NatInt is 16.7–18.7 against 33.7 for the 26B-A4B. That is the size class that failed the Chain here. |
| Qwen3.6-35B-A3B heretic ([llmfan46](https://huggingface.co/llmfan46/Qwen3.6-35B-A3B-uncensored-heretic), 10/100, KL 0.0015) | Strong on UGI (44.25 no-think), but under 12 GB only at IQ2 (9.5–11.7 GB, [mradermacher i1](https://huggingface.co/mradermacher/Qwen3.6-35B-A3B-uncensored-heretic-i1-GGUF)). The 3-bit files are 13.6 GB and up. |
| GLM-4.7-Flash heretics (30B total, 3B active, [UGI](https://huggingface.co/spaces/DontPlanToEnd/UGI-Leaderboard)) | Same size problem as Qwen3.6-35B-A3B. EQ-Bench Creative Elo 1124.7, below Gemma 4 12B. Low-bit file sizes not checked. |
| NVIDIA Nemotron 3.5 Lightning (30B, 3B active, [Ollama blog](https://ollama.com/blog)) | 30B total. No abliterated build was looked for. |
| gpt-oss-20b heretic ([p-e-w](https://huggingface.co/p-e-w/gpt-oss-20b-heretic-ara-v4)) | Lowest of these on EQ-Bench (Creative Elo 665.6, Longform 21.2). |
| Ministral 3 8B / 14B (2025-12) | UGI Writing 28.79 / 31.44 for the originals. Longform 31.9 for the 14B. Abliterated builds not checked. |
| Mistral Nemo 12B heretic-noslop ([p-e-w](https://huggingface.co/p-e-w/Mistral-Nemo-Instruct-2407-heretic-noslop)) | A 2024 base. EQ-Bench Creative Elo 880.9, Longform 28.7. Mistral's chat template caused the alternation failure here. Whether Nemo's template does the same is not verified. |
| Phi-4 heretic ([p-e-w](https://huggingface.co/p-e-w/phi-4-heretic)) | UGI NatInt 21.43, Writing 24.0. |
| IBM Granite 4.2 8B heretic ([`richardyoung/granite-4.2-8b-heretic`](https://ollama.com/richardyoung/granite-4.2-8b-heretic)) | 12/100, KL 0.080 per the page. No writing benchmark found. |
| "Qwen3.8-9B" heretics (e.g. [mradermacher](https://huggingface.co/mradermacher/Qwen3.8-9B-heretic-uncensored-GGUF)) | Not an official Qwen model. [empero-ai/Qwen3.8-9B-Distill](https://huggingface.co/empero-ai/Qwen3.8-9B-Distill) is Qwen3.5-9B fine-tuned on reasoning traces weighted toward "hard math and competitive programming", and it opens every answer with `<think>`. |
| Muse Glimmer 30B heretic ([`richardyoung/muse-glimmer-30b-heretic`](https://ollama.com/richardyoung/muse-glimmer-30b-heretic)) | 30B, and still 52/100 refusals per the page. |

### Shortlist to benchmark

In order of expected payoff. Run each through the existing harness (Chain 7 Actions, Art Agent 6
Kael Frames, Suggest 5 cuts, Roleplay replies 4 cuts), Thinking off, one model loaded at a time.
Record `ollama ps` size for each.

1. **Gemma 4 12B Heretic (igorls v1), GGUF Q4_K_M, 7.4 GB.** The likeliest replacement for the
   26B-A4B heretic.
   ```sh
   ollama pull hf.co/igorls/gemma-4-12B-it-heretic-GGUF:Q4_K_M
   ```
2. **The same model as MLX NVFP4.** Same weights, Ollama's faster engine and better 4-bit format.
   Optionally pull the censored official `gemma4:12b-mlx` (7.7 GB) as a control, to tell the
   12B's own limits from abliteration damage.
   ```sh
   hf download igorls/gemma-4-12B-it-heretic-v1 --local-dir ~/models/gemma-4-12B-it-heretic-v1
   printf 'FROM .\n' > ~/models/gemma-4-12B-it-heretic-v1/Modelfile
   cd ~/models/gemma-4-12B-it-heretic-v1 && ollama create gemma-4-12b-heretic:nvfp4 -q nvfp4
   ```
3. **Qwen3.5-9B Heretic (llmfan46 v2), GGUF Q6_K, 7.4 GB.** The non-Gemma comparison.
   ```sh
   ollama pull hf.co/llmfan46/Qwen3.5-9B-ultra-uncensored-heretic-GGUF:Q6_K
   ```
4. **Gemma 4 26B-A4B Heretic (llmfan46) at IQ3_XS, 11.6 GB.** An exact comparison against the
   current fast model at fewer bits.
   ```sh
   ollama pull hf.co/mradermacher/gemma-4-26B-A4B-it-uncensored-heretic-i1-GGUF:gemma-4-26B-A4B-it-uncensored-heretic.i1-IQ3_XS.gguf
   ```
5. **Wildcard: Qwen3.8-27B-Uncensored MLX 2-bit, 9.4 GB.** Only if 1–3 all fail the Chain. It
   checks whether the careful model survives 2 bits.
   ```sh
   ollama pull orcarouter/Qwen3.8-27B-Uncensored:mlx-2bit
   ```

Recipe 2 is untested: the `hf` download path, the Modelfile and the create step were not run.
