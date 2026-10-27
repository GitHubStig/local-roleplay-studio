# Choosing models

What we've measured about the local models this project runs, and which to pick. Timings are on
the development Mac (Apple silicon, 48 GB) unless they say the Windows PC (RTX 4070, 12 GB), each
with its date.

## Text Model

**Use Gemma 4 12B Heretic (the GGUF Q4_K_M), with Thinking off, for every text job, on a Mac or
Windows** (`hf.co/igorls/gemma-4-12B-it-heretic-GGUF:Q4_K_M`; recommended since 2026-10-08, as the
project may run on smaller machines): uncensored, 9.5 GB loaded, right on all six pictures in the
Art Agent test below (the NVFP4 build of the same model got two wrong), and the same build on both
machines ("Two smaller Heretic models", "The GGUF on an NVIDIA card" below). On a Mac with memory
to spare, **Gemma 4 26B-A4B Heretic** (`gemma-4-26b-heretic:nvfp4`, an uncensored build made
locally: "The heretic 26B-A4B as MLX NVFP4" below) is 2–3× faster, 18 GB loaded, Mac only: a mixture of experts with about 4B parameters active per
token, the fastest model here that does every job well. Whichever, one model for everything, so
none waits for another to load. Set it in **Settings → Text Model**; it applies from the next Session.

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

**The GGUF on an NVIDIA card** (2026-10-07; Windows 11, RTX 4070 12 GB, Ollama 0.40.0): the Text
Model for Windows, where the MLX build can't run. 8.3 GB loaded, 100% GPU, ~53 tokens/s; its
context is cheap (7.5–8.3 GB at `num_ctx` 16k to 128k alike, and a 56.5k-token chat read in 30 s
with 11.2 GB of the card in use; see the README on the context length). Through the app at 16k:
Cast 7.5–18.4 s, Replies 4.8–5.9 s, Suggest 2.2–3.8 s, a Chain's text 5.5–15.3 s (each after
ComfyUI's render, so with a reload). Only these runs, not the four tests above. A QAT Q4_0 build
([igorls](https://huggingface.co/igorls/gemma-4-12B-it-qat-q4_0-unquantized-heretic-GGUF), 7.0 GB)
may lose less to quantization; not tried.

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

### Loading and speed, Mac against PC (2026-10-16)

A raw timing of Ollama, outside the app, to choose which machine to test text-only features on. Both used Ollama 0.40.5 and the same script, which unloads every model, then sends one cold request and warm ones through `/api/chat` (`num_ctx` 16384, temperature 0, seed 42, at most 300 tokens out, Thinking off). The short prompt is the tavern Scenario with a request for the innkeeper's opening line (672 tokens). The long one repeats the Scenario to 8,218 tokens, about a 30-Frame Roleplay's history. One run each. The machines ran different models (the Mac's 12B wasn't run), so this compares each machine's best Text Model, not one model on two machines.

| | PC: 12B Heretic GGUF Q4_K_M | Mac: 26B-A4B Heretic NVFP4 |
|---|---|---|
| Loaded (`ollama ps`) | 8.3 GB, 100% GPU | 19 GB, MLX |
| Cold request (load) | 13.6 s (9.4 s) | **7.1 s (2.9 s)** |
| Warm, short prompt | 4.1–4.2 s | **3.6 s** |
| Long prompt, first read | **7.6 s** | 8.5 s |
| Long prompt, read again from Ollama's cache | 4.2 s | 4.1 s |
| Writing | ~52 tok/s, 49 after the long prompt | **70 tok/s**, 54 after the long prompt |
| Reading a new prompt | **~2,600–2,950 tok/s** (1,500 cold) | 1,200–1,800 tok/s |

The PC's load may have come from Windows' file cache, as the app had the model loaded just before. The two come out about even: the Mac's 26B loads three times as fast and writes faster, and the PC reads a new prompt about 1.5× as fast. In a running Roleplay most of the history comes from Ollama's cache, so writing speed counts most there. The Mac's 12B wasn't measured here: from the per-Action timings above, it would be slower than the PC's.

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
[ADR 0023](adr/0023-the-art-agent-writes-prose.md)). The identities stay the Look's
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

### mlx-audio 0.6.1 (2026-10-21, Mac)

From 0.5.9, with transformers 5.20.1 to 5.20.2. One voice designed from a description and four lines cloned from it (three said, one whispered thought), the same text and seeds on each version:

- **Speaking is unchanged:** cloned from the same reference clip, every line and the thought came out byte for byte the same on 0.6.1, in the same time (2.6–3.9 s a line). A Character's saved voice sounds exactly as before.
- **Designing a voice changed:** the same description and seed gave another take (a median pitch of 139 Hz against 149, 5.1 s against 4.6 for the reference sentence; lines cloned from it followed it down). Voice design passes no sampling of its own, and 0.6.0 made Qwen3-TTS use the model's own sampling settings by default and changed how it reads in the text ("prefill full text to avoid slow speech"). Speaking passes its own (`SPEAK_SAMPLING`), so it's untouched. Not judged by ear yet whether the new takes are better.
- The same three warnings are logged on both versions (transformers on the `qwen3_tts` type, a divide in Higgs's codec, a leaked semaphore at shutdown), so none is new.

## Image Model

**Use Qwen-Image 2.1** (`qwen-image-2.1`, the default since 2026-10-08), 25 steps: the model both
backends run (mflux on the Mac, ComfyUI on either; "mflux and ComfyUI side by side" in
[research/comfyui.md](research/comfyui.md)), and the one measured most here (the steps trial, the
step cache and Viggle's turbo, below). On the Mac at 832×1216: 96.5 s with mflux, 55.7 s with the step cache;
on the RTX 4070 through ComfyUI, ~21 s. For speed on a Mac alone, FLUX.2 Klein 4B (`flux2-klein-4b`,
4 steps, ~10–13 s) was the default until then; ComfyUI runs it too since 2026-10-15 (below).

| Model | Time per image | Notes |
|---|---|---|
| **FLUX.2 Klein 4B** | 832×1216: ~10–13 s · 512×768: ~5 s · 512×512: ~4 s | Follows the subject description (skin, hair) and keeps her consistent across Frames with a fixed seed. Peak memory ~17.6 GB at 832×1216, ~10.5 GB at 512 px. |
| FLUX.2 Klein 9B | 832×1216: ~22 s · 512×768: ~10 s · 512×512: ~8 s (4 steps) | Stages two people a little better than 4B from prose (someone up on a balcony stays up there); no better from tags. Peak memory ~28 GB at 832×1216, ~21 GB at 512 px. Not yet checked for keeping a subject consistent across Frames. |
| Z-Image Turbo (4-bit) | 832×1216: ~42 s (9 steps) | Ignored the subject's described skin tone and hair. |
| Z-Image (8-bit) | 1216×832: ~190 s (30 steps, our default) · ~155 s (25) · ~300 s (50, mflux's default) | Added 2026-10-13, measured on the Mac (M5 Pro, mflux 0.22, bfloat16). Turbo's undistilled base: real guidance (the app passes 4, as mflux's README does; mflux's own default is 0, no CFG), so each step costs ~6 s against Turbo's ~4 s. mflux-community's saved 8-bit copy (11 GB; the 4-bit one is 5.9 GB, the original ~31 GB), downloaded in ~3 min. Peak memory ~7.8 GB. **Steps:** 8 Frames of one Chain (painterly styles), rendered at 50 in the app, then again at 30 and 25 with the same prompt and seed: the same composition, figure, palette and finish each time; only small things move between them (a drape there or not, a cherub or a hand added or lost), no more often at 25 or 30 than between the two. Up close, 50 is a little smoother and 25–30 show a little more brush grain. So 30 is the default; 25 is close. |
| Krea 2 (Turbo) | 512×512: ~32 s (8 steps) | Peak memory ~39 GB. |
| ERNIE-Image Turbo | 512×512: ~18 s (8 steps) | Peak memory ~25 GB. |
| Boogu Image Turbo | 512×512: ~16 s (4 steps) | Peak memory ~29 GB. |
| Qwen-Image 2.1 | 512×512: ~23 s (25 steps) · ~38 s (40, mflux's default) | 25 steps looks as good as 40 at 512 px, so it's our default; it holds at 1024² too, where 20 hasn't settled yet ([bench/steps](bench/steps/README.md)). Peak memory ~35 GB. |
| Qwen-Image 2.1 Viggle Turbo | 512×512: ~13.5 s (6 steps; Mac, 2026-10-14) · 1024²: ~30 s | Qwen-Image 2.1 with Viggle's turbo LoRA, an Image Model of its own since 2026-10-14 (Settings → Fast before; ADR 0016). The nearest of any model to Qwen-Image 2.1 at 25 steps: a quick preview of it ("Viggle or Qwen's Turbo", below). |
| Ming-Image 0.1 Design | 512×512: ~14 s (12 steps) | Added 2026-10-11 (mflux 0.22). A design model (posters, cards, lettering) rendering RGBA, flattened onto white (`--flatten-alpha`; the file comes out RGB). Runs the saved copy mflux's README recommends: DiT at 8 bits, its ~16B MoE text encoder at 5 (18 GB on disk; the original is 53 GB). Peak memory ~13.2 GB. From the Art Agent's kind of prose, one test scene: everything described, the sign's lettering right, painterly. |
| FIBO 1.5 (8-bit) | 512×512: ~82 s (6 steps) | Added 2026-10-12 (mflux 0.22). Bria's distilled FIBO (DMD, then DMD-R for realism): 4–6 steps at guidance 1, against FIBO's 50 at 5, so the app passes both (mflux reads it as FIBO); the test render bore them out. mflux-community's saved 8-bit copy (14 GB; CC BY-NC like FIBO). Trained on long JSON captions: a prose Image Prompt is first written out as one by FIBO's own VLM (`briaai/FIBO-vlm`, 8.3 GB, always seed 42), freed before rendering. The 6 steps took ~14 s of the 82; the rest is loading both models and the VLM writing, not timed apart. Peak memory footprint 28.7 GB. Reads up to 2048 tokens. One test scene from prose: everything described, the sign's lettering right but partly hidden behind a carved stag. **Quoted lines break it** (2026-10-12): the VLM copies a prompt's straight double quotes (a speech bubble's line) into its JSON unescaped, and mflux fails on the JSON (`JSONDecodeError`), whatever the seed (the VLM's is fixed at 42 in mflux anyway; the Frame's seed reaches only the render). The app sends FIBO curly quotes instead; the Frame that failed then rendered (832×1216: 131 s, 37.3 GB peak), its bubbles' lines legible. |
| Ideogram 4 (8-bit) | 512×512: ~57 s (20 steps) · ~36 s (12) | Added 2026-10-11 (mflux 0.22). A typography model. Runs mflux-community's saved 8-bit copy (26 GB): the same size as the FP8 original, without dequantizing at each step. Gated: accept its terms on Hugging Face and `hf auth login` once. Peak memory ~30.4 GB. A preset sets the steps (and its guidance schedule): Steps offers its three, 12 (turbo), 20 (the default) and 48 (quality). **Needs JSON captions**: from prose it stamped a line of garbled lettering across the middle of the picture (both presets); the same scene as a JSON caption came out clean, sign spelled right (open-threads.md). |

Ming-Image and Ideogram 4 were timed on the 48 GB Mac (2026-10-11; FIBO 1.5 2026-10-12; mflux 0.22, seed 42, with the
app's own arguments, `--low-ram` included): one image each, wall time including loading, with no
Text Model loaded; peak is macOS's peak memory footprint. Timings for the four before those are one test image each (2026-09-25, 48 GB Mac, no quantization,
including model loading), not a comparison of how well they follow the prompt or keep a
subject consistent. FLUX.2 Klein 9B (added 2026-09-29) is about twice as slow as 4B and needs twice
the memory, which next to gemma4 on a 48 GB Mac is tight.

### On ComfyUI with an RTX 4070: four Image Models (2026-10-15)

Three Image Models joined Qwen-Image 2.1 on ComfyUI, each from ComfyUI's own template
(`workflows/` in `server/images/comfyui/`), with Comfy-Org's files:

- **Qwen-Image 2.1 Turbo** (`qwen-image-2.1-turbo`): Qwen's own distilled DiT
  (`qwen_image_2.1_turbo_int8_convrot`, 7.3 GB), not mflux's Viggle LoRA (a separate Image Model,
  `qwen-image-2.1-viggle`). It shares Qwen-Image 2.1's text encoder and VAE. The template fixes 8
  steps (`ManualSigmas`), so Steps offers only 8, and adds `QwenImage21Cache` (the prompt's part of
  each step kept rather than recomputed). The template's optional prompt rewriter is left out.
- **FLUX.2 Klein 4B** (`flux-2-klein-4b`, 7.8 GB, bf16: Comfy-Org has no smaller build): the
  template's distilled half, 4 steps.
- **Z-Image Turbo** (`z_image_turbo_int8_convrot`, 6.2 GB): 8 steps. Its template names the fp8
  Qwen3 4B, but the bf16 one Klein uses (`qwen_3_4b`, 8.0 GB) is the same file in both of Comfy-Org's
  repos, so one download serves both.

Measured on the Windows PC (RTX 4070 12 GB, 16 GB of RAM, ComfyUI 0.40.0), through the app's own
ComfyUI generator: one picture each at 832×1216, seed 42, one prose prompt (the tavern scenario's
opening: two people, rain, firelight), ComfyUI's models freed before each, Ollama unloaded. The
second of two passes (the first ran while a download was still writing to the disk, and was up to
twice as slow):

| Model | Steps | From cold | Sampling and decoding | What it drew |
|---|---|---|---|---|
| Qwen-Image 2.1 | 25 | 32.5 s | 12.4 s | (not looked at: the reference) |
| Qwen-Image 2.1 Turbo | 8 | 12.2 s | 4.3 s | everything asked for, painterly |
| FLUX.2 Klein 4B | 4 | 9.8 s | 3.0 s | everything, but an old grey innkeeper, resting rather than polishing; the most cartoon-like |
| Z-Image Turbo | 8 | 11.4 s | 4.8 s | everything, illustrated; rain falling inside the tavern too |

"From cold" includes loading the models from disk; the rest of it is loading and the text encoder.
ComfyUI filled the card for every model (~11.6 GB peak VRAM in each), so VRAM doesn't tell them
apart. Not checked: keeping a subject consistent across Frames, prompts from tags, or more than one
picture each.

### FLUX.3 Klein on ComfyUI with an RTX 4070 (2026-10-16)

**FLUX.3 Image Klein** (`flux3-klein`), added with ComfyUI 0.41 ([research/comfyui.md](research/comfyui.md), "Image Models built into ComfyUI"): BFL's distilled checkpoint (`flux3_image_klein_sd_int8_convrot`, 5.4 GB) with its Qwen3-VL-4B encoder (`qwen3vl_4b_int8_convrot`, 4.5 GB) and FLUX.2's VAE, 16 steps, no guidance, no prompt upsampler. Gated on Hugging Face (`black-forest-labs/flux-3-image-klein-comfy`: accept the FLUX Kommunity License).

Measured on the Windows PC (ComfyUI 0.41.1), through the app's own ComfyUI generator: one prose
prompt written from the tavern scenario (Kael behind the bar with the letter, the traveller in the
doorway, the lamp, the rainy window, the scenario's style), seed 42, 832×1216, each from cold (the
generator frees ComfyUI's models after a render), Ollama unloaded, one after another:

| Model | Steps | From cold | From step 1 | What it drew |
|---|---|---|---|---|
| FLUX.3 Klein | 16 | 12.7 s, then 10.9 s | 6.3 s, 5.9 s | everything, the most detailed and painterly; Kael older than 42, his scars as red smears on his coat as well as his face; the staircase seen through the doorway, outside |
| FLUX.2 Klein 4B | 4 | 10.5 s | 3.3 s | everything; the scars as cuts on his face; her in a long coat and trousers, more modern than 18th-century |
| Qwen-Image 2.1 Turbo | 8 | 13.7 s | 4.9 s | everything, the darkest and most chiaroscuro; the letter held up in his hands |

So FLUX.3 Klein costs about as much as the other quick models on the 4070, and needs no step
setting changed. Not checked: the Mac (ComfyUI or mflux), keeping a subject consistent across
Frames, tags, more than one seed, and whether the Text Model's Image Prompts are full enough
captions without BFL's upsampler (this prompt was, by hand).

### MOSS-Image on ComfyUI with an RTX 4070 (2026-10-19)

**MOSS-Image** (`moss-image`), added with ComfyUI 0.42 ([research/comfyui.md](research/comfyui.md), "Image Models built into ComfyUI"): OpenMOSS's instruction-tuned checkpoint, **Apache-2.0** and not gated, from Comfy-Org's repack (`Comfy-Org/MOSS-Image`): `moss_image_sft_int8_convrot` (5.4 GB), **Qwen3.5-9B** as its text encoder (`qwen3.5_9b_w4a8_gptq`, 7.3 GB) and a smaller FLUX.2 VAE (`flux2-vae_small`, 0.25 GB). ComfyUI's template settings: 25 steps, real CFG 2.5 with a short negative (the template's, less its "nsfw"), `er_sde`. No prompt upsampler, as for FLUX.3 Klein. `_base_` files are the checkpoint for fine-tuning, so they're never picked.

Measured on the Windows PC (ComfyUI 0.42.1), through the app's own ComfyUI generator: the same prose prompt as the 0.42 check (a traveller in a wet cloak at a corner table, a broad innkeeper with rolled sleeves setting down a mug, firelight, rain on the window), seed 42, 832×1216, ComfyUI's models freed before each, Ollama unloaded:

| Model | Steps | From cold | Peak VRAM | Least RAM free | What it drew |
|---|---|---|---|---|---|
| MOSS-Image | 25 | 24.8 s, then 25.8 s | 12.0 GB | 1.8 GB of 16 | everything asked for, and closest to the words: the innkeeper broad, sleeves rolled, setting the mug down; warm, photographic |
| Qwen-Image 2.1 | 25 | 22.6 s | 12.0 GB | 2.7 GB | everything, but the innkeeper seated across from him rather than serving; much darker |

So on the 4070 MOSS-Image costs about what Qwen-Image 2.1 does, despite its 12.7 GB of weights and two passes a step. The 16 GB of RAM held, with the least free 0.9 GB lower than Qwen's. Not checked: more than one seed or prompt, several Frames in a Session (and Ollama loaded beside it, which the RAM may not allow), tags, its layout captions (`MOSSImageLayoutPrompt`), and the Mac.

### Ming-Image on ComfyUI with an RTX 4070 (2026-10-20)

**Ming-Image 0.1 Design** (`ming-image`, the same id as mflux's) runs on ComfyUI too: it's built into 0.42.1 (`comfy_extras/nodes_ming.py`), no custom nodes. Comfy-Org's repack (`Comfy-Org/Ming-Image`, MIT): the DiT `ming_image_0.1_design_int8_convrot` (5.75 GB), its ~16B MoE text encoder Ling-mini 2.0 as **w4a8** (`ming_image_0.1_ling_mini_2.0_w4a8`, 11.9 GB) and its VAE (0.24 GB). ComfyUI's template names the int8 encoder instead, but at 18.2 GB it's more than the PC's 16 GB of RAM; the app takes w4a8 first and falls back to int8, then bf16. The `_layer_` files are Ming-Image-Layer (a picture split into layers), never picked. The workflow is the template's (12 steps, no CFG, euler, simple, `ModelSamplingFlux` at the picture's size) without its prompt enhancer (Qwen3.8-27B), and sent as RGB (`SplitImageWithAlpha`), as Qwen-Image 2.1's is; mflux flattens onto white instead, which a scene with no transparency doesn't tell apart.

It keeps the template's **Comfy Kitchen int8 attention** (`ModelAttentionBackend`): attention's queries and keys rounded to 8 bits and multiplied on the card's int8 tensor cores. Where it can't run (no NVIDIA or AMD card, as on a Mac) the node logs a warning and falls back to PyTorch's attention, so the workflow still runs there (read in ComfyUI's code; not run on the Mac).

Measured on the Windows PC (ComfyUI 0.42.1), through the app's own ComfyUI generator: one prose prompt from the tavern scenario (a traveller in a rain-soaked cloak at a corner table by the window, a broad innkeeper with rolled sleeves setting a mug down, firelight, lanterns, beams), seed 42, 832×1216, ComfyUI's models freed before each, Ollama unloaded. Ming-Image twice with each attention, alternating:

| Model | Steps | From cold | From step 1 | Peak VRAM | Least RAM free | What it drew |
|---|---|---|---|---|---|---|
| Ming-Image, Kitchen attention | 12 | 15.8–16.0 s (18.3 s the first time, its files read from disk) | 5.7–6.1 s | 10.0–10.9 GB | 1.9 GB of 16 | everything asked for, and closest to the words: the cloak beaded with rain, the innkeeper setting the mug down; painterly. A scrawled signature at the bottom right |
| Ming-Image, PyTorch attention | 12 | 16.8–17.6 s | 6.6–6.9 s | 9.7–10.4 GB | 1.9 GB | the same composition, small things moved (the window's panes, a chair); the signature too |
| Qwen-Image 2.1 | 25 | 20.8 s | 12.9 s | 11.4 GB | 4.6 GB | everything, the innkeeper standing at the table rather than setting the mug down; the traveller seen from behind |

So on the 4070 Ming-Image is a little faster than Qwen-Image 2.1, and Kitchen attention takes ~15% off its sampling (about a second at this size, more at larger ones). The 16 GB of RAM held, about as close as MOSS-Image's. Each run gave the same file each time for a seed. Not checked: more seeds or prompts, the signature's frequency (a design model's habit; a negative can't be given with no CFG), several Frames in a Session (and Ollama loaded beside it), tags, and Kitchen attention for the other ComfyUI Image Models.

### mflux 0.23: FLUX.3 Klein and Qwen-Image 2.1 Turbo on the Mac (2026-10-17)

mflux 0.23 (2026-10-16) runs two Image Models the app had only on ComfyUI, so both are now mflux Image Models too, under the same ids: **FLUX.3 Klein** (`flux3-klein`, `mflux-generate-flux3`, the distilled checkpoint: 16 steps, no guidance; gated, 20.3 GB) and **Qwen-Image 2.1 Turbo** (`qwen-image-2.1-turbo`, Qwen's own 8-step checkpoint through `mflux-generate-qwen-2.1`, no CFG, no step cache; 32.5 GB).

Measured on the Mac (M5 Pro, 48 GB, 2026-10-17, mflux 0.23, float16, `--low-ram`, as the app runs them), one tavern prompt (two people, a letter, lamps, rain), seed 42, times including the model load:

| Image Model | 832×1216 | 512² | Peak memory | The picture at 832×1216 |
|---|---|---|---|---|
| Qwen-Image 2.1, 25 steps, step cache 0.4 | 55.9 s | | 16.7 GB | everything asked for, painterly |
| Qwen-Image 2.1 Viggle Turbo, 6 steps | 30.2 s | | 18.0 GB | nearly the same picture as 25 steps |
| **Qwen-Image 2.1 Turbo**, 8 steps | 33.2 s, 33.4 s | 11.7 s | 16.9 GB | everything; a little cleaner, less brushy than 25 steps; reruns pixel-identical |
| **FLUX.3 Klein**, 16 steps | 40.9 s, 39.2 s | 11.6 s | 13.3 GB | everything, the most detailed (bottles, more lamps, the rain lit), the only one showing the scars; but the man made old and grey, as on the PC |

**Qwen Turbo below 1024 px**, as mflux warns: at 512² the picture has a fine crosshatched grid over it, seen when zoomed. Not at 832×1216. **Qwen Turbo's text encoder is Qwen-Image 2.1's**: all 750 tensors byte-identical, only split into one file instead of four, so 17.5 GB of its 32.5 GB repeats what's on disk (the Hugging Face cache never shares files across repos, so a fresh install that runs both stores it twice too). Its VAE is the base VAE cast to bf16 (all 238 tensors equal after the cast; 0.7 GB against 1.4). Its transformer is distilled: 234 of 297 tensors differ. Rechecked 2026-10-18 with MLX array comparisons as well as byte hashes, with the transformers as a control. Not checked: either model over many Frames, or keeping a Subject consistent.

The 0.22 to 0.23 upgrade itself (the Pillow 13 failure and its pin) is in [research/mflux-upgrade-log.md](research/mflux-upgrade-log.md#0230--mac-2026-10-17).

Also in 0.23, not used yet: `mflux-generate-flux3-edit` (up to ten reference images, a lighter candidate for Subject consistency than Qwen-Image 2.1's edit; open-threads.md), FLUX.3 LoRAs, and `mflux-generate-krea2-controlnet` (Krea 2 Turbo from a depth map).

### Viggle or Qwen's Turbo: a quick Qwen-Image 2.1 (2026-10-17)

Two Image Models render Qwen-Image 2.1 in about half its time: **Viggle's turbo LoRA** on it (`qwen-image-2.1-viggle`, 6 steps) and **Qwen's own distilled Turbo** (`qwen-image-2.1-turbo`, 8 steps). Compared on the Mac (mflux 0.23) on the Chain of 31 Frames that the style scores were chosen on, each Frame asking for an art style of its own, all three rendered from the same Image Prompts and seed, then embedded for the Compare dialog's style scores ([research/style-scores.md](research/style-scores.md)):

| Image Model | Render, mean of 31 | Distance from Qwen-Image 2.1's picture of the same Frame, CSD (style) · CLIP | Distinct styles (CSD Vendi) | Matches its Frame (top 3) |
|---|---|---|---|---|
| Qwen-Image 2.1, 25 steps, step cache 0.4 | 55.1 s | | 4.38 | 29% |
| Viggle LoRA, 6 steps | 30.9 s | 0.052 · 0.038 | 4.18 | 23% |
| Qwen's Turbo, 8 steps | 33.2 s | 0.130 · 0.080 | 3.58 | 16% |

- **Viggle is a preview of Qwen-Image 2.1**: its picture was the nearer to Qwen-Image 2.1's in 31 of 31 Frames by CSD (30 of 31 by CLIP), and the nearest of the eleven other models by both; the next, FLUX.3 Klein, was at 0.294 · 0.139. The owner's eye agreed: Viggle's look like the 25-step pictures, Turbo's are pictures of their own.
- **Qwen's Turbo is a model of its own**, and the least varied in style of the twelve: last on distinct styles and on matching its Frame, so in a Chain that changes style each Frame it follows the change least.
- So both stay: Viggle to see quickly what Qwen-Image 2.1 will draw, Turbo as a fast model in its own right. Not checked: fine detail and small text side by side, more than one seed, the PC.

### Qwen-Image 2.1 on mflux 0.21: the step cache and Viggle's turbo LoRA (2026-10-04)

mflux 0.21 adds a step cache for Qwen-Image 2.1 (`--step-cache-ratio`, TeaCache-style: it skips
the transformer on that share of the steps whose timestep changes least, and reuses the step
before) and a scheduler for Viggle's 6-step turbo LoRA (`--scheduler viggle_turbo`). Measured on
the app's settings at the time (the 0.20 and 0.21 comparison is in [research/mflux-upgrade-log.md](research/mflux-upgrade-log.md)): the saved 8-bit copy, 25 steps, no CFG, one prompt (Elara,
waist-up) and seed, at 1024×1024, everything else closed:

| Run | Time | Peak memory | Looks |
|---|---|---|---|
| 25 steps | 98–100 s | 39.1–39.3 GB | |
| + step cache 0.4 | 66 s (1.5×) | 38.7 GB | near the same: same pose, face and dress; slightly softer brushwork |
| turbo LoRA, 6 steps | 29–31 s (3.4×) | 38.9–39.2 GB | a different take on the prompt: smoother, more polished, less painterly; the face holds up |

- **Both work on the 8-bit saved copy**, the one the app renders from, and the copy saved by 0.20
  loads in 0.21.
- **The step cache is on in the app** for Qwen-Image 2.1 (Settings → Step cache, 0.4 by default;
  0.25, 0.5 or off). The other Image Models' commands don't take it (2026-10-04). It leaves runs
  under 10 steps alone.
- **The turbo LoRA was Settings → Fast** (an Image Model of its own since 2026-10-14, ADR 0016):
  `Viggle/Qwen-Image-2.1-viggle-turbo`
  (v0.3, rank 256, 1.3 GB), passed to mflux as `repo:file`, so mflux fetches it into the Hugging
  Face cache on first use. It must run at exactly 6 steps with its scheduler, so it takes no
  other steps and no step cache. It's under Qwen's research license (non-commercial), like LiTo. At
  512×512 on the 8-bit copy: 5 s of denoising, 24.5 GB peak. It's v0.3, the file the model card
  says to use; v0.2.1 (crisper, grainier) is also in the repo. Viggle's 9-step mode (the same
  LoRA, switched off for the last two steps, for finer detail at ~1.4–1.5× the time) isn't
  possible through mflux, and was dropped on 2026-10-17: as a preview of 25 steps, 6 are close
  enough ("Viggle or Qwen's Turbo", below).
- **Most of a turbo render is starting up** (Mac, 2026-10-05): of a 32.7 s run, 5 s was denoising
  and ~27 s loading ~22 GB, encoding the prompt and decoding the picture (loading surely the most);
  Upscale (SeedVR2) is ~46 s, mostly loading. In 2026-09-24's measure, loading was ~5 s of a 42 s
  Z-Image Turbo render. A service keeping the model loaded could bring it under 10 s, but on
  48 GB it would have to unload before every Reply, so it would help only back-to-back renders
  (Render all); dropped 2026-10-08.

### How much of the Image Prompt each model reads (2026-10-09)

mflux tokenizes the prompt, inside each model's own template or chat template, and silently cuts it
at a fixed length (mflux 0.22, from each model's weight definition). Counted with mflux's own
tokenizers on the Mac, over the 37 Image Prompts in the local Sessions (35 from Roleplays' Art
Agent, 2 from a Chain; 120–380 words, median 253 for the Roleplays):

| Image Model | Cut at (tokens) | Template | Median prompt | Longest | Cut |
|---|---|---|---|---|---|
| FLUX.2 Klein 4B and 9B | 512 | 12 | 352 | 523 | 1 of 37 |
| Z-Image Turbo | 512 | 8 | 348 | 519 | 1 of 37 |
| Krea 2 | 1024 | 39 | 379 | 550 | 0 |
| Boogu | 1024 | 0 | 340 | 511 | 0 |
| ERNIE-Image | 2048 | 1 | 347 | 525 | 0 |
| Qwen-Image 2.1 | 2048 | 22 | 362 | 533 | 0 |
| Z-Image (full) | 512 | 8 | 259* | 414* | 0 of 198* |
| Qwen-Image 2.1 Viggle Turbo | 2048 | 22 | 273* | 428* | 0 of 198* |
| Ming-Image 0.1 Design | none | 26 | 280* | 435* | 0 of 198* |
| FIBO 1.5 | 2048, on the JSON caption; the prose: none | 0; the VLM's: 11 | 262* (prose) | 417* (prose) | prose: 0 of 198*; caption: not measured |
| Ideogram 4 | none: fails past 2048 | 8 | 259* | 414* | 0 of 198* |

\* Counted 2026-10-16 on the Mac (mflux 0.22, the same method) over a different, shorter set: the 198 Image Prompts in `docs/bench/two-people/prompts/`, from the public tavern scenario (99–307 words, median 185). Every count includes the template.

- **Qwen-Image 2.1, the default, reads all of every prompt**, with room for four times as much.
- **Klein and Z-Image already lose the end of the longest** (a 380-word Roleplay picture, by 7–11
  tokens). The end is the **art style**, as every Image Prompt ends with it (ADR 0005), so those
  are the words a 512-token model drops first.
- **The caps allow more than was seen**: seven sentences of up to 280 characters each come to about
  450 tokens on their own, before the identities and the style, so a busy Frame with both people
  could reach ~600. A Storyboard Frame adds an identity for each person it shows (up to three); no
  Storyboard was saved here to measure.
- **ComfyUI cuts nothing** (checked 2026-10-16 in ComfyUI 0.41.1's code, `comfy/text_encoders/`, on the PC): every text encoder the app uses on it sets `max_length=99999999`, unpadded: Qwen3-VL 8B for Qwen-Image 2.1 and its Turbo, Qwen3-VL 4B for FLUX.3 Klein, Qwen3 4B for FLUX.2 Klein 4B and Z-Image Turbo; and past a tokenizer's length ComfyUI starts another chunk rather than cutting (`sd1_clip.py`). So on ComfyUI the whole prompt is always read; the cuts above are mflux's.
- **None of the bench's prompts is cut by the five models added since** (2026-10-16). Their longest, 297 words from a long Chain, is 414–435 tokens. But that set is shorter than the Sessions'.
- **Z-Image (full) reads like Z-Image Turbo**: the same token ids over all the bench's prompts, the same 8-token template, the same cut at 512 (`z_image_weight_definition.py`). So it would also lose the end, the art style, of the longest Session prompt.
- **Viggle's LoRA leaves the text side alone**: it changes only the transformer's blocks (`qwen21_lora_mapping.py`), so the Turbo reads as Qwen-Image 2.1 does.
- **Ming-Image cuts nothing**: its weight definition gives 1024, but `MingImage.encode_prompt` calls the tokenizer itself, without a length. Its template is the checkpoint's chat template, written out in `ming_condition_encoder.py`.
- **Ideogram 4 fails rather than cuts**: `Ideogram4Tokenizer.tokenize_one` raises an error past 2048 tokens, so an over-long prompt fails the render instead of losing its end. The app sends it prose, which mflux passes on as it is, with a warning that it isn't a JSON caption. A JSON caption would go through the same path, as compact JSON text.
- **FIBO 1.5 cuts the caption, not the prose**: FIBO's VLM (`FiboVLM.generate`) reads the whole prose prompt in an 11-token template, uncut (the 1024 in its weight definition isn't used on that path). It writes a JSON caption of up to 4096 tokens, and FIBO's text encoder reads that caption, without a template, cut at 2048 (`fibo_weight_definition.py`, `fibo_text_encoder/prompt_encoder.py`). How long the captions run wasn't measured: the app doesn't keep them, and counting them needs the VLM run on each prompt.
- A limit is set by the model's text encoder and by mflux's or ComfyUI's code, so it changes only with a new model or an upgrade of either: check again then, as above (mflux 0.22, ComfyUI 0.41.1).

"About 250 words" (2026-09-27) was a measure of what the Art Agent wrote, not a target; the limit
in force is the 280-character cap per sentence (`FIELD_LENGTH`, `server/roleplay/art.ts`).

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

### Qwen-Image 2.1 on mflux 0.22: float16, `--low-ram` and the saved copy (2026-10-09)

mflux 0.22 adds `--compute-precision float16` (FLUX.2 Klein, Z-Image, Qwen-Image 2.1) and loads
Qwen-Image 2.1 lazily, each part read (and quantized) only when a step first needs it. Measured on
the Mac (M5 Pro, 48 GB), the same prompt, seed and 1024×1024 as on 0.21, everything else closed
([bench/precision](bench/precision/README.md)):

| Run | Default | float16 | `--low-ram` |
|---|---|---|---|
| saved 8-bit copy, 25 steps | 93 s, 36.0 GB | 94 s, 36.1 GB | **90 s, 9.4 GB** |
| + step cache 0.4 | 60 s, 36.1 GB | 57 s, 36.6 GB | **56 s, 9.4 GB** |
| Fast (turbo LoRA, 6 steps) | 30 s, 36.6 GB | 30 s, 36.6 GB | **31 s, 11.6 GB** |
| original weights, `-q 8`, 25 steps | 91 s, 36.2 GB | 91 s, 36.1 GB | 91 s, 9.3 GB |
| FLUX.2 Klein 4B, 832×1216, 4 steps | 10 s, 19.8 GB | 10 s, 19.9 GB | |

Peak is macOS's peak memory footprint (`/usr/bin/time -l`), which counts the GPU's share of
unified memory.

- **float16 gains nothing on an M5 Pro** (within a second or two, run to run), as mflux's help
  says ("helps most on GPUs with slow bfloat16 (Apple M1 and M2); the gain is small or zero on M4
  and M5"). It changes the picture slightly (mean 0.5–0.8 per pixel of 255 on Qwen-Image 2.1, 2.1
  on Klein).
- **`--low-ram` cuts the peak by three-quarters at no cost in time**: 36 GB to 9.4 GB, the
  picture all but the same (mean 0.4 per pixel). It works with the step cache and the turbo LoRA.
- **The saved 8-bit copy no longer helps Qwen-Image 2.1**: rendering from the original weights with
  `-q 8` gives the very same picture (mean difference 0.0) in the same time and peak. One caveat:
  the original weights were likely still in the disk cache (the copy had been saved from them
  minutes before), so a cold first read may take some seconds longer. Saving the copy took 18 s
  and peaked at 24.3 GB.

**`--low-ram` on the other Image Models** (the same day, Mac, 1024×1024, each model's steps in the
app, full precision unless noted):

| Image Model | Default | `--low-ram` | Picture |
|---|---|---|---|
| FLUX.2 Klein 4B (4 steps) | 10 s, 20.1 GB | 10 s, **9.9 GB** | identical |
| FLUX.2 Klein 9B (4 steps) | 18 s, 22.7 GB | 19 s, 20.3 GB | identical |
| FLUX.2 Klein 9B, `-q 8` | 22 s, 23.2 GB | 22 s, 19.9 GB | identical |
| Z-Image Turbo, 4-bit (9 steps) | 34 s, 17.2 GB | 32 s, **5.6 GB** | near the same (1.1 of 255) |
| Krea 2 Turbo (8 steps) | 102 s, 35.7 GB | 92 s, 33.6 GB | near the same (0.1) |
| ERNIE-Image Turbo (8 steps) | 58 s, 35.9 GB | 56 s, 22.7 GB | identical |
| Boogu Image Turbo (4 steps) | 38 s, 36.3 GB | 38 s, 24.9 GB | near the same (1.2) |

**`--low-ram` is on for every Image Model in the app** since 2026-10-09: none is slower, and every
peak is lower, by 2–14 GB (Krea 2 and Klein 9B gain least). It does less for Klein 9B with `-q 8`
than its saved copy did (12.6 GB against 20.9 GB at 512 px on 2026-10-01), but the copies were
dropped all the same to free disk (22 GB each).

### Qwen-Image 2.1 Edit: fixing a hand with a painted mask (2026-10-23, Mac)

The first step of "Editing a Frame's picture" (open-threads.md): `mflux-generate-qwen-2.1-edit` (mflux 0.23) on a malformed hand in a painted 1216×832 Frame, with a soft ellipse painted over the hand (`--mask-image`, white repainted), the output at the picture's own size, seed 1, the tool's other defaults (strength 1.0). M5 Pro, 48 GB, with Edge and VS Code open (~8 GB) and ~4 GB in swap throughout.

| Run | Time | Peak |
|---|---|---|
| full weights | 169–174 s | 38.9–39.3 GB |
| `-q 8` | 177 s | 39.4 GB |
| `--low-ram` | 168 s | 25.9 GB |
| **`-q 8 --low-ram`** | **179 s** | **15.1 GB** |

- **What isn't painted stays as it was**: in every run, no pixel outside the mask moved by more than 9 of 255, and their mean change rounds to 0.
- **The instruction has to describe the result, not ask for a fix.** "Fix the hand…: an open, well-formed right hand…, in the same style" gave back the same malformed hand, only sharper (a mean change of 4.5 of 255 inside the mask). Saying what to paint instead ("Replace the hand… with a new, anatomically correct right hand reaching forward: palm facing down, index finger extended, the other fingers relaxed…, five distinct fingers") repainted it cleanly (a mean change of 19), in the picture's brushwork, with no visible seam at the mask's edge.
- **`-q 8` and `--low-ram` change nothing visible**: within 1.3 of 255 of the full run inside the mask. `-q 8` alone saves nothing (it quantizes after loading the full weights); with `--low-ram` the peak falls to 15.1 GB, so that's the pair to run, as for renders. Nothing to download: it runs on Qwen-Image 2.1's own weights.
- About 3 minutes an edit at this size, every way, against ~90 s for a 1024² render with the saved 8-bit copy (above); likely the picture passed as a reference and the edit tool's guidance, as in the reference-portrait trial, not separated.

**Two areas in one edit, and dark areas** (2026-10-23, Mac, `-q 8 --low-ram`, seed 42, a 1024² FLUX.2 Klein 9B picture from a Session: a lit face, a shirt in shadow, and a lit object apart from the face). Seven edits, ~3 minutes each, mean change of 255 in each area, nothing outside them moving by more than 1:

| Painted | Told | Face | Second area |
|---|---|---|---|
| face + shirt (in shadow under the gun) | terse: "laughing face, red shirt" | 26.6 | 1.9 |
| face + shirt | each area described ("In the painted area over his face: … In the painted area over his shirt: …") | 27.8 | 1.9 |
| face | terse: "laughing face" | 26.5 | – |
| face | described: "The same man's face, laughing, mouth wide open…" | 27.5 | – |
| shirt | "The same shirt, bright red." | – | 2.5 |
| face + the object (lit, apart from the face) | each area described, the object to be "painted bright red" | 26.1 | 22.1 |
| object | "The same [object], painted bright red." | – | 19.0 |

- **Several areas take one instruction each, in one edit**: the face laughed and the object turned red together, as each did alone. Saying which painted area gets what is enough; Qwen's own way, coloured outlines drawn on the picture with the prompt naming the colours, wasn't needed, and the mask keeps the rest exactly as it was.
- **Dark areas resist**: a shirt in deep shadow went only faintly dark red, alone or with the face, as two objects asked for on a dark shelf on 2026-10-23 came back as the bottles that were there. Something bright painted into shadow stays mostly shadow.
- **A face responds to terse or described wording alike**: an edit of a face that changes nothing is likelier asking in words the model doesn't know than painted wrong.

### Edits through ComfyUI (Windows PC)

ComfyUI now has four edit models (`server/images/comfyui/models.ts`, `COMFYUI_EDITORS`). The first two described here use their Image Model's own files, so nothing more is downloaded: Qwen-Image 2.1 Edit (`qwen_image_2.1_int8_convrot`, `qwen3vl_8b_int8_convrot`, `qwen_image_2.1_vae_bf16`) at 25 steps, and FLUX.3 Klein distilled (`flux3_image_klein_sd_int8_convrot`, `qwen3vl_4b_int8_convrot`, `flux2-vae`) at 16, as in ComfyUI's templates. The pictures were rendered from the public tavern scenario (`scenarios/tavern.md`), not taken from a Session. RTX 4070 (12 GB), 16 GB of RAM, ComfyUI 0.42.5.

**First trials** (2026-10-24), with the first workflows, which gave the model the picture but not the painted area, and pasted the result back through the mask; a hand repainted at 832×1216:

- **Both fit the 4070 at the app's portrait size**: Qwen's lowest free VRAM was 1.32 GB and free RAM 2.80 GB; FLUX.3's 1.55 GB and 4.63 GB, in about 17 s.
- **Qwen's hand came out brighter and more sharply textured** than the oil painting around it. FLUX.3's kept the painting's dark palette and brushwork, once its oval covered the whole hand and wrist (one that missed part of the hand left stray fingertips).

**Telling the model where to paint** (2026-10-26). The owner found FLUX.3's edits did nothing useful. A hand is already in the picture, so "change the hand" says where; something new isn't, and the model put it where it liked. Asked for "a pewter tankard of foaming ale" on a bare bar, FLUX.3 drew a large tankard in the middle of the bar and the mask kept a cut-off slice of it. Four ways (seed 43, one oval mask over the bar top; the mean change per pixel, of 255, inside the mask and outside it, before it's pasted back):

| FLUX.3 told | Inside | Outside | Tankard |
|---|---|---|---|
| the instruction, as built | 20.5 | 11.6 | a slice of one drawn elsewhere |
| + the area as a box (`<obj_1>` and its bbox, as ComfyUI's `Flux3LayoutPrompt` writes) | 35.9 | 9.9 | whole, in place |
| + the area as the latent's noise mask (`SetLatentNoiseMask`) | 13.3 | 1.6 | cut off |
| **both** | 29.7 | **1.7** | **whole, in place** |

- **So both went in**: the box tells FLUX.3 where, and the noise mask holds the rest of the picture while it paints. Qwen has no boxes, but takes the noise mask the same way. Each edit is still pasted back through the mask, so nothing outside it moves.
- **Through the app** (`comfyuiImageGenerator().edit`, the same picture and mask): FLUX.3 in 13.6 s, a whole tankard in place, though with a stray strap down one side; Qwen in 29.1 s, a smaller, cleaner one. Outside the mask a mean change of 0.01 each, the most 17–22 in the softened rim the paste-back blends across.
- **Not tried yet**: Qwen's hand again with the noise mask, more seeds, and two painted areas in one FLUX.3 edit (each gets its own box).

### FIBO 2.0 on ComfyUI (2026-10-27, Windows PC)

With the int8 Comfy-Org repack on the RTX 4070 (12 GB VRAM, 16 GB RAM), ComfyUI 0.43.0, using the app's `comfyuiImageGenerator` directly against its local API. One render each at 832×1216; the prompt described a rain-soaked tavern, a traveller at a window table, and an innkeeper setting down a mug. FIBO Dev used seed 42; both edits used the same render, seed 43, and a rectangular mask over the mug.

| Model and task | Steps / CFG | App call | Peak VRAM | Least free RAM | Result |
|---|---:|---:|---:|---:|---|
| FIBO 2.0 Dev, text-to-image | 50 / 5 | 63.0 s | 11,518 MiB | 3,491 MiB | Rainy tavern scene with both people and the innkeeper serving the mug; painterly, with illegible sign text and a signature-like mark |
| FIBO 2.0 Dev Edit, painted mug | 50 / 5 | 127.7 s | 11,451 MiB | 2,439 MiB | Replaced the mug with a silver tankard and blue stag; preserved the scene |
| FIBO 2.0 Edit Turbo, painted mug | 4 / 1 | 13.4 s | 11,490 MiB | 3,069 MiB | Similar tankard edit in about one tenth of the Dev Edit time |

Memory was sampled about twice a second with `nvidia-smi` and Windows' available physical memory counter; VRAM includes roughly 1.3 GiB already in use before each run. Pixel comparison of each edit with its source found a mean absolute RGB change of 23.2 (Dev) and 26.0 (Turbo) inside the mask, and exactly 0 outside it across 993,512 pixels. These are single runs, not a benchmark; the text model was not loaded. The tests used the typed instruction directly; adding a box-style location caption as with FLUX.3 was not compared.

The FIBO edit workflows use the reference image's VAE-encoded latent with the painted noise mask; both edits changed only pixels inside the mask. Only int8 weights were run. The file picker accepts the named bf16 DiT and text-encoder alternatives, but neither was tested with an actual render.


### Upscaler

Upscale uses **SeedVR2 7B** by default (`seedvr2-7b`, `mflux-upscale-seedvr2 --resolution 2048`);
3B can be chosen in **Settings → Upscaler**. From a
512×512 image to 2048×2048: 7B ~46 s, 3B ~41 s, most of it loading the model (832×1216 to
2048×2992 with 7B: 64–66 s, through the app or the CLI alike, 2026-10-07; the upscale itself ~15 s); both add real
texture (fabric weave, skin) over plain resizing, 7B slightly cleaner. Peak memory ~39 GB for
either, so, like the larger Image Models, it can push a 48 GB Mac into swap next to gemma4.

**`--low-ram` on SeedVR2** (2026-10-09, Mac, mflux 0.22, 7B, a 1024×1024 picture to 2048×2048,
twice each): **57 s and 20.1 GB with it, against 45–47 s and 36.4–36.5 GB without**, the same
picture to the pixel. Unlike the Image Models it costs time, about 25%, but it nearly halves the
peak, so the app passes it to every upscale too.

**On ComfyUI with an RTX 4070** (2026-10-07; Comfy-Org's fp8 builds, ComfyUI's built-in SeedVR2):
512×512 to 2048×2048 in **9.5 s with 7B, 7.9 s with 3B**, about 5× the Mac; 832×1216 to 2048×2992
in 11–14 s. Settings → "Upscale with" can send Upscale there from a Mac rendering with mflux. Its
colour correction is `lab`: without it the result came out 11% darker. Details in
[research/comfyui.md](research/comfyui.md).

Model loading is only ~5 s of an image, so keeping the Image Model loaded in a separate process
isn't worth it yet ([open-threads.md](open-threads.md)).

## Memory

The Text Model and the Image Model share the Mac's memory. gemma4 31B (~19 GB) plus FLUX.2 Klein
(~10.5 GB at 512 px, ~17.6 GB at 832×1216) fits comfortably on a large-memory Mac; on a smaller
one, use the 512 px sizes. The larger Image Models (Krea 2, Qwen-Image 2.1, Boogu, ERNIE) peak
at 25–39 GB even at 512 px: next to gemma4 on a 48 GB Mac they can push the system into swap.

*Saved copies dropped 2026-10-09 (mflux 0.22):* `--low-ram`, now on every render, lowers the peak
further than a saved copy did, and 0.22 converts Qwen-Image 2.1 as it loads, so its copy made the
same picture in the same time ("Qwen-Image 2.1 on mflux 0.22", above). Quantize now converts at
every render. The measurements below are kept for the record.

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
render needs it (`server/images/mflux/quantized.ts`), in `models/quantized/<model>-<bits>bit-mflux<version>` (in the project, gitignored),
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
