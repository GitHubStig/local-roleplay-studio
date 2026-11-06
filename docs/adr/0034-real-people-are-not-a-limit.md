---
status: accepted
---

# Real people are not a Limit

Until 2026-11-06 the Limits were three: no sexual or nude imagery, no real, identifiable people, and no restraint or captivity ([ADR 0002](0002-guardrails-enforced-by-the-engine.md)). Decided with the owner that day to drop the second: a Scenario, an Action or a Message may name a real person, living or dead, and the pictures may show them. The Limits are now two.

- **The owner wants stories about real people.** The example Scenario The Buffet of Souls has Patrick Swayze as the guide of the newly dead, and is also a way to see which Image Models were trained on real people and which weren't.
- **The worst use is still caught.** With the Limits on, sexual or nude imagery of anyone is declined, and restraint or captivity too, real person or not.
- **The check was partial anyway.** It ran on Actions, Messages and a Storyboard's Brief and Beats, but not on a Scenario's text, which only the term list read, nor on the Image Prompts the Text Model wrote.

What went: the yes/no question to the Text Model (`namesRealPerson`, its prompt `shared/real-person.md`, and `mightNameAPerson`, which decided when to ask it), the Limit's sentence in every prompt that tells the models the Limits, and the tests of them. The Roleplay's engine no longer needs a `TextModel` of its own, as that question was all it used it for.

## Considered Options

- **A switch for each Limit**, so a player could allow real people and keep the other two. More code and more settings for a choice the owner doesn't want to keep; the Limits stay one switch.
- **Keep the Limit and name the guide something else** in the public example. The owner wants Swayze.

## Consequences

Anyone who clones the repo can make pictures of real people by default. Settings' Limits switch now says real people are allowed. A determined player could always switch the Limits off; now naming someone needs no switch at all.
