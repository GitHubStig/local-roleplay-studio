---
status: accepted
---

# The Image Prompt, in nine fixed Sections, replaces the Scenario-defined Scene

Each Session's state was a Scene whose JSON shape every Scenario defined, which the engine flattened into an image prompt behind a Scenario `imagePrefix`. It is now the **Image Prompt** itself: nine Sections in a fixed order (subject and identity → pose and limbs → expression → camera angle and framing → clothing → environment → lighting → color → art style and medium), joined by the engine into exactly the text the Image Model renders. Each Turn, the Text Model gets the current Image Prompt and the Action, and returns the edited Image Prompt plus a terse list of what changed. The Scenario's Setup is only given on the Opening Turn; afterwards the Image Prompt is the whole state.

## Considered Options

- **One free-text prompt, rewritten whole each Turn.** Rejected: small Text Models drift and drop details when rewriting a paragraph; "edit these Sections, copy the rest exactly" is a much easier task, and the fixed Sections let the UI show exactly what an Action changed.
- **Keep per-Scenario Scene schemas.** Rejected: every Scenario had to design a schema, the engine's flattening produced awkward prompts, and state could hide in fields that didn't render well. One fixed shape suits any Scenario, since every Scenario ends in an image.

## Consequences

Scenarios got simpler: a title, a description, an optional Setup and notes, and the Opening instructions. What you see in the Prompt tab is exactly what was rendered. The Text Model is told what each Section covers and to replace rather than append; without that, spark-x2.5 piled old and new text into one Section ("Eye-level 50mm… Low floor angle, 24mm lens").
