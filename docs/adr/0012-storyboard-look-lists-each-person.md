---
status: accepted
---

# A Storyboard's Look lists each person, and each Frame says who it shows

A Storyboard's Look was one subject sentence, put in front of every Frame (ADR 0006). A Brief with
several people kept only one of them: planned from a Brief with five named people, the Look
described the first, and he was in every Frame's prompt, in Frames about someone else and in Frames
of the scenery alone (2026-10-08).

Now the Look has an identity for **each person** the Brief names or picks out (a name, and the
subject sentence for that person alone), plus the style. Each Frame's reply ends with **`shown`**:
the names of the people in its picture, the most prominent first. The engine puts those people's
identities before the Frame's seven sentences, at most three of them (`MAX_SHOWN`); a Frame showing
no one has no subject sentence, and is a picture of the place alone. The player can change who a
Frame shows (a toggle per person, beside its sentences), and add, rename or remove people in the
Look. This is the Roleplay Art Agent's approach (its `character_shown` and `persona_shown`), for any
number of people.

## Considered Options

- **The model writes each Frame's subject sentence itself**, no shared identities. Rejected for
  the reason ADR 0006 gave: nothing keeps a person's description the same from Frame to Frame.
- **Every identity in every Frame.** Simple, but it's the bug in another form: people drawn into
  pictures they're not in, and five identities push the Frame's own sentences past what an image
  model reads.
- **No cap on the people a Frame shows.** An image model keeps two or three people apart at best,
  and reads only the start of a long prompt. The prompt asks for the people the Frame is about
  first; the rest of a group is described by the Frame's own sentences ("two guards behind
  her").
- **`shown` as an enum of the Look's names.** Not possible: the Look and the Frames are written in
  the same streamed reply, so the schema can't know the names in advance. The engine matches the
  names instead (`matchShown`: case, and a name written longer or shorter, "Cal Reyes" for
  "Cal"), and drops one that isn't in the Look.

## Consequences

- `shown` comes last in each Frame's reply: put first, gemma4 stalls on such answers (as found for
  the Art Agent; docs/models.md).
- Renaming someone in the Look keeps them shown where they were, matched by their place in the list
  while the number of people is the same.
- Storyboards planned before this aren't read any more: there was one, and it was deleted.
- A sentence a model writes as "N/A", or only "No people.", for a picture with no one in it is
  dropped: the prompt says not to, and Gemma 4 26B did both anyway.
- Chains are unchanged (one Subject, rewritten Frame by Frame).

## Roleplays too (2026-10-09)

A Roleplay's Look had two identities, the Character's and the Persona's, and each picture a yes
or no for each; anyone else the story brought in (a guard, the barkeep) was described afresh in
every picture, so looked different each time. Its Look now has the same shape (`server/look.ts`,
shared): written from the Cast with the Character, the Persona and anyone the Brief names, then
**grown by the pictures**. The Art Agent's reply ends with `newcomers` (anyone in this picture who
isn't in the Look yet and whom the story names or singles out, with a name and an identity), then
`shown` (names). Newcomers join the Look unless they match someone already in it (`matchShown`)
or their identity crosses a Limit, so the next picture reuses their identity word for word.

- **No toggle per picture**, unlike a Storyboard Frame: in a Roleplay the story decides who is
  present, and Picture again is the way to correct it.
- **The clothing check** (with the Limits on, everyone shown must be dressed by name) covers two
  or more people, matching any word of a name ("the barkeep" by "barkeep").
- **Tried with gemma-4 26B heretic (NVFP4) on the Mac**, on a copy of the Kael tavern Roleplay
  with two made-up exchanges bringing in a guard: an ordinary Frame added no one; the guard's first
  Frame added him with a good identity sentence; his second, pictured four times, reused it and
  never added him twice (docs/models.md).
- Roleplays from before weren't converted in code (the app isn't released): the three in
  `sessions/` were ported by hand, every prompt unchanged.
