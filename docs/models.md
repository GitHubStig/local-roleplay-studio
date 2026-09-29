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
Limits' clothing check works the same. **Prose stays the default: it won on both installed Image
Models.** Measured on three Frames of the Kael tavern Roleplay (6: Kael alone; 9 and 12: both), each Art Agent writing prose, Danbooru-style tags
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

Rendered (gemma4's three prompt sets, 512×512, seed 7, clothing the Limits would block changed by hand):

| Image Model               | Prose                 | Booru tags                                                    | Plain tags                                      |
| ------------------------- | --------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| FLUX.2 Klein 4B (~5 s)    | all right             | 9: who does what swapped; 12: three people (a second `1girl`) | 6: wrong identity; 9 and 12 right               |
| Qwen-Image 2.1 (~26–32 s) | all right, and staged | everyone faces the viewer; Elara added to 6; no staging       | 6 right; 9: the wrong person pointing; 12 close |

Both installed Image Models read prompts with an LLM text encoder, which understands sentences: tags
can't say who does what to whom, and with two people that's what goes wrong. Booru tags are worst:
their vocabulary is for anime checkpoints trained on Danbooru, none of which are installed. So the
Tags style writes plain tags; it's there for speed, or for a future tag-trained Image Model.

## Image Model

**Use FLUX.2 Klein 4B** (`flux2-klein-4b`, the default), 4 steps.

| Model | Time per image | Notes |
|---|---|---|
| **FLUX.2 Klein 4B** | 832×1216: ~10–13 s · 512×768: ~5 s · 512×512: ~4 s | Follows the subject description (skin, hair) and keeps her consistent across Frames with a fixed seed. Peak memory ~17.6 GB at 832×1216, ~10.5 GB at 512 px. |
| Z-Image Turbo (4-bit) | 832×1216: ~42 s (9 steps) | Ignored the subject's described skin tone and hair. |
| Krea 2 (Turbo) | 512×512: ~32 s (8 steps) | Peak memory ~39 GB. |
| ERNIE-Image Turbo | 512×512: ~18 s (8 steps) | Peak memory ~25 GB. |
| Boogu Image Turbo | 512×512: ~16 s (4 steps) | Peak memory ~29 GB. |
| Qwen-Image 2.1 | 512×512: ~23 s (25 steps) · ~38 s (40, mflux's default) | 25 steps looks as good as 40 at 512 px, so it's our default. Peak memory ~35 GB. |

Timings for the last four are one test image each (2026-09-25, 48 GB Mac, no quantization,
including model loading), not a comparison of how well they follow the prompt or keep a
subject consistent. FLUX.2 Klein 9B is built into mflux too, but isn't offered until its
weights are downloaded.

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
