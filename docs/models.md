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
