---
status: accepted (revised with ADR 0005)
---

# Limits are enforced by the engine, not by the models

The Text Models this runs locally include uncensored ones, and any Section of the Image Prompt can be changed by an Action, so the lines that matter can't depend on a model's judgement. The engine enforces four Limits on every Frame: everyone depicted is an adult; no sexual or nude imagery; no real, identifiable people; no restraint or captivity. The Text Model is told them too, but the engine checks anyway:

- **A term list** (`server/limits.ts`) is checked against the Action, *before* the Text Model is asked, and against the new Image Prompt it writes. A hit declines the Action: no Frame is saved (the Image Prompt and image stay as they were), and the player is told which Limit. Until 2026-10-05 a declined Action was saved as a Frame that kept the previous prompt and image; it now saves nothing, as a declined Roleplay Message does (ADR 0007), so it's simply reworded and sent again.
- **Real people** can't be caught by a list, so an Action that looks like it names someone (a capitalised full name, "look like", "resemble", "celebrity") gets a narrow yes/no question to the Text Model: "does this ask to depict a real, identifiable person?" Small models answer that far more reliably than they follow a rule buried in long instructions.
- **Every rendered prompt started with "adult"**, whatever the Sections said, until 2026-10-08.
  The owner removed it: it read as part of the picture (Storyboard Frames of the scenery alone
  began with "adult,") and could lead the Image Model to add a person. The adult Limit
  is now held by the term list and the Text Model's instructions alone, and an Image Prompt that
  doesn't state an age leaves it to the Image Model.
- An Opening Frame whose prompt crosses a Limit fails rather than being declined, since there's no earlier prompt to keep.

Anything inside the Limits is the player's to direct, and the Text Model's to carry out.

## Considered Options

- **Leave it to the Text Model.** Rejected: in testing, spark-x2.5 (an uncensored 4B model) marked a wardrobe change it was told to refuse as done, and turned "make her look like Serena Williams" into a prompt naming her.
- **Scenario-level briefs** (what a character will and won't do, with refusal lines). Used before ADR 0005; removed because the project became a general prompt generator where only the four Limits apply.
- **Negative prompts.** Rejected: FLUX.2 rejects them and Z-Image Turbo ignores them.

## Consequences

**The Limits can be switched off in Settings** (on by default), after they cost repeated false declines while testing Roleplays. Off, the engine skips the sexual, restraint and real-person checks and the Text Model is told only that everyone depicted is an adult. That one Limit is never switched off: with uncensored models and an image generator, it is the line that must hold whatever the player chooses. The switch is read on every request, so it applies to running Sessions at once.

A term list is blunt. It catches any stated age under 18, in digits or words ("sixteen year
old", "aged 16"): in testing, a Storyboard Brief about a high school player led the Text Model to
write "a sixteen year old" despite being told everyone is an adult, so the model is now also told
to write implied minors as 18 or older. It aims at unambiguous phrases and leaves ordinary photography language alone ("jacket tied around the waist", "sports bra", "forced perspective", "baby blue"), which the tests pin down; a determined rephrasing can still slip past it, and the Text Model's own instruction to decline is the second line. The real-person question costs about half a second, and only on Actions that look like they name someone.
