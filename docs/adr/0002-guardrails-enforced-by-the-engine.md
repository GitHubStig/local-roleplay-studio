---
status: accepted
---

# Guardrails are enforced by the engine, not by the models

The Text Models this game runs locally include uncensored ones, and Image Models such as Z-Image Turbo ignore negative prompts. So the rules that matter most can't depend on either model behaving. The Scenario says what a character refuses (in its System prompt), but the engine enforces the outcome: a Declined Turn keeps the previous Scene and image, whatever the Text Model returned, and renders nothing; the Opening Turn can't be declined; and every image prompt starts with the Scenario's `imagePrefix`, which states the fixed facts (for the photoshoot: an adult, fully clothed in the brief's wardrobe) ahead of anything the Text Model wrote.

## Considered Options

- **Trust the Text Model's refusals and let it write the image prompt.** Rejected: in testing, a small model marked a Turn declined yet changed the Scene, and wrote Directions into the image prompt that it never recorded in the Scene.
- **Negative prompts.** Rejected as a guardrail: FLUX.2 rejects them and Z-Image Turbo ignores them.
- **A keyword filter on the Action.** Not done: it's easy to phrase around and blocks legitimate Directions. The Scenario's refusal rules plus the engine's lock on Declined Turns cover the same ground.

## Consequences

The guardrail on images is positive, not subtractive: `imagePrefix` asserts what must be true, but nothing strips unwanted words from the Scene text itself. A Text Model that ignored the System prompt could still write unwanted terms into an accepted Turn's Scene, and they would reach the image prompt after the prefix. Narration is best effort too: a model can mark a Turn declined yet narrate the Action happening (see [open-threads.md](../open-threads.md)); the Scene and image stay safe regardless.
