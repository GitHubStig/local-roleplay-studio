---
status: accepted (revised with ADR 0005)
---

# Limits are enforced by the engine, not by the models

The Text Models this runs locally include uncensored ones, and any Section of the Image Prompt can be changed by an Action, so the lines that matter can't depend on a model's judgement. When the Limits are on, the engine enforces three Limits on every Frame: no sexual or nude imagery; no real, identifiable people; no restraint or captivity. Age is unrestricted. The Text Model is told the Limits too, but the engine checks anyway:

- **A term list** (`server/limits.ts`) is checked against the Action, *before* the Text Model is asked, and against the new Image Prompt it writes. A hit declines the Action: no Frame is saved (the Image Prompt and image stay as they were), and the player is told which Limit. Until 2026-10-05 a declined Action was saved as a Frame that kept the previous prompt and image; it now saves nothing, as a declined Roleplay Message does (ADR 0007), so it's simply reworded and sent again.
- **Real people** can't be caught by a list, so an Action that looks like it names someone (a capitalised full name, "look like", "resemble", "celebrity") gets a narrow yes/no question to the Text Model: "does this ask to depict a real, identifiable person?" Small models answer that far more reliably than they follow a rule buried in long instructions.
- An Opening Frame whose prompt crosses a Limit fails rather than being declined, since there's no earlier prompt to keep.

Anything inside the Limits is the player's to direct, and the Text Model's to carry out.

## Considered Options

- **Leave it to the Text Model.** Rejected: in testing, spark-x2.5 (an uncensored 4B model) marked a wardrobe change it was told to refuse as done, and turned "make her look like Serena Williams" into a prompt naming her.
- **Scenario-level briefs** (what a character will and won't do, with refusal lines). Used before ADR 0005; removed because the project became a general prompt generator where only the three Limits apply.
- **Negative prompts.** Rejected: FLUX.2 rejects them and Z-Image Turbo ignores them.

## Consequences

A term list is blunt. The sexual-content and restraint patterns aim at unambiguous phrases and leave ordinary photography language alone ("jacket tied around the waist", "sports bra", "forced perspective", "baby blue"), which the tests pin down; a determined rephrasing can still slip past them, and the Text Model's own instructions are another line. Real people can't be caught by a list, so Actions that look like they name someone get a narrow yes/no question to the Text Model; this costs about half a second.
