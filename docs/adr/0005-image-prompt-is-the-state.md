---
status: accepted
---

# The Image Prompt, one paragraph of nine sentences, replaces the Scenario-defined Scene

Each Session's state was a Scene whose JSON shape every Scenario defined, which the engine flattened into an image prompt behind a Scenario `imagePrefix`. It is now the **Image Prompt** itself: one paragraph of nine sentences, one per aspect, always in this order: subject and identity → pose and limbs → expression → camera angle and framing → clothing → environment → lighting → color → art style and medium. Details within a sentence are separated by commas or semicolons, and each sentence covers only its own aspect. Each Frame, the Text Model gets the current Image Prompt and the Action, and returns the rewritten paragraph (changed sentences rewritten, the rest copied word for word) plus a terse list of what changed. The engine renders `adult, ` plus the paragraph. The Scenario's Setup is only given on the Opening Frame; afterwards the Image Prompt is the whole state.

## Considered Options

- **Nine separate fields, joined by the engine.** Tried first, and dropped: the same trait ended up in two fields (the subject field kept "easy smile" while the expression field said "scared"), and a small model updated only one of them. As one paragraph the model sees every sentence at once, and the player reads one prompt.
- **A free-form paragraph with no structure.** Also tried: small models dropped whole details (the clothing vanished when the scene moved to Mars) and left old details next to new ones. One sentence per aspect gives the model a fixed checklist to carry and a single place to change.
- **Keep per-Scenario Scene schemas.** Rejected: every Scenario had to design a schema, and the flattened prompts read badly. FLUX.2's text encoder reads prose well, so sentences suit it.

## Consequences

Scenarios got simpler: a title, a description, an optional Setup and notes, and the Opening instructions. What the Prompt tab shows is exactly what was rendered (after "adult, "), with a word-level diff against the previous Frame. The format asks a lot of a small Text Model: with the same compound Action ("she's scared; art style is Michelangelo"), spark-x2.5 4B applied half of it and ignored the sentence format, while gemma4 31B and qwen3.8 27B applied it fully, in about 8 s per Frame.
