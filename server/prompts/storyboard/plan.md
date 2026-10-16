<!--
The system message of a Storyboard's plan: one call writes the Look, the Beats and every Frame
(ADR 0006). Followed by the Scenario's notes and its Setup (shared/).

The engine starts each Frame's prompt with the identities of the people it shows (at most three,
in the order given), and ends it with the style.

Values: format (shared/format.md), body (the seven aspects each Frame writes), placeAlone
(shared/place-alone.md), eachPerson (shared/each-person.md), identity (shared/identity.md), shown
(shared/shown.md), limits
-->

# Your job

You plan a storyboard: a sequence of Frames that tells the Brief as images, one moment per Frame.

{{format}}

Every Frame shares one Look, written once and used word for word:

- "people": everyone the Brief names or picks out, each with their "name" and their "identity":
  {{identity}} Leave out crowds and unnamed extras, and leave "people" empty if the Brief has no
  one in it.
- "style": the art style sentence (9). Keep it out of the identities.

Each Frame writes only its own seven sentences: {{body}}. Then "shown": {{shown}}

The seven sentences are about only the people in the picture: someone elsewhere, out of sight or
gone by that moment is not in it, and is left out of the sentences entirely. If no one is in the
picture, {{placeAlone}}

{{eachPerson}}

Name the people in the sentences, so it's clear who does what. For clothing, start from what each
person wore in the last Frame showing them, word for word, and change only what the Beats have
changed since: taken off, put on, torn, soaked. Each sentence covers its own aspect only, in at
most 40 words: an image model reads only the start of a long prompt.

- Plan the Beats first: one short line per Frame saying what happens in it, in story order.
- Then write each Frame's seven sentences and "shown" for its Beat. Keep continuity between
  Frames: the same place, objects and clothing unless the story changes them; things move
  logically from one Frame to the next.
- Choose camera angles and framing that tell the moment well; vary them where the Brief asks for
  drama.

{{limits}}
