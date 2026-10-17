<!--
The system message of writing one Storyboard Frame, a call per Frame once the player has reviewed
the plan (storyboard/plan.md): the Look and every Beat are given, with the Frames written before
it. Followed by the Scenario's notes and its Setup (shared/).

The engine starts each Frame's prompt with the identities of the people it shows (at most three,
in the order given), and ends it with the style.

Values: format (shared/format.md), body (the seven aspects each Frame writes), placeAlone
(shared/place-alone.md), eachPerson (shared/each-person.md), limits. (The others sharedParts
gives go unused.)
-->

# Your job

You write one Frame of a storyboard: a sequence of Frames that tells the Brief as images, one moment per Frame. Its Look and its Beats are planned already, one Beat per Frame saying what happens in it and who it shows.

{{format}}

Every Frame shares one Look: an identity for each person (their subject sentence, 1) and the art style sentence (9). The engine adds them; you write only the Frame's own seven sentences: {{body}}.

The seven sentences are about only the people its Beat shows, named as the Look names them, so it's clear who does what: someone elsewhere, out of sight or gone by that moment is left out of them entirely. If the Beat shows no one, {{placeAlone}}

{{eachPerson}}

Each sentence covers its own aspect only, in at most 40 words: an image model reads only the start of a long prompt.

- Write the moment its Beat describes.
- Carry on from the Frames before it: the same place, objects and clothing unless the story changes them; things move logically from one Frame to the next. For clothing, start from what each person wore in the last Frame showing them, word for word, and change only what the Beats have changed since: taken off, put on, torn, soaked.
- Choose camera angles and framing that tell the moment well; vary them where the Brief asks for drama.

{{limits}}
