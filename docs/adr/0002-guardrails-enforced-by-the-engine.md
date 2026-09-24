---
status: accepted (revised with ADR 0005)
---

# Limits are enforced by the engine, not by the models

The Text Models this runs locally include uncensored ones, and any Section of the Image Prompt can be changed by an Action, so the lines that matter can't depend on a model's judgement. The engine enforces four Limits on every Turn: everyone depicted is an adult; no sexual or nude imagery; no real, identifiable people; no restraint or captivity. The Text Model is told them too, but the engine checks anyway:

- **A term list** (`server/limits.ts`) is checked against the Action, *before* the Text Model is asked, and against the new Image Prompt it writes. A hit declines the Turn: the Image Prompt and image stay as they were, and the Narration names the Limit.
- **Real people** can't be caught by a list, so an Action that looks like it names someone (a capitalised full name, "look like", "resemble", "celebrity") gets a narrow yes/no question to the Text Model: "does this ask to depict a real, identifiable person?" Small models answer that far more reliably than they follow a rule buried in long instructions.
- **Every rendered prompt starts with "adult"**, whatever the Sections say.
- An Opening Turn whose prompt crosses a Limit fails rather than being declined, since there's no earlier prompt to keep.

Anything inside the Limits is the player's to direct, and the Text Model's to carry out.

## Considered Options

- **Leave it to the Text Model.** Rejected: in testing, spark-x2.5 (an uncensored 4B model) marked a wardrobe change it was told to refuse as done, and turned "make her look like Serena Williams" into a prompt naming her.
- **Scenario-level briefs** (what a character will and won't do, with refusal lines). Used before ADR 0005; removed because the project became a general prompt generator where only the four Limits apply.
- **Negative prompts.** Rejected: FLUX.2 rejects them and Z-Image Turbo ignores them.

## Consequences

A term list is blunt. It aims at unambiguous phrases and leaves ordinary photography language alone ("jacket tied around the waist", "sports bra", "forced perspective", "baby blue"), which the tests pin down; a determined rephrasing can still slip past it, and the Text Model's own instruction to decline is the second line. The real-person question costs about half a second, and only on Actions that look like they name someone.
