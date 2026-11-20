---
status: accepted
---

# `session.json` version 2: one record of who wrote what, a Frame's `image`, a picture's `file`

`session.json` grew a field at a time, and three patterns had drifted by 2026-11-20, when versions arrived (ADR 0041) and made a reshaping cheap to land. This is version 2 (`server/migrations/session/v2.ts`).

## Decision

- **Who wrote something is one shape, `Written`** (`{ model, seconds, thinking? }`, `shared/session.ts`), wherever the Text Model wrote it: a Frame's `written` (from `textModel`, `timings.text` and `thinking`), a Roleplay's `lookWritten` and `scoreWritten` (from `look*` and `score*`), the music's direction and the hindsight pass (`written`, from `model` and `timings.text`). It had been stored about seven ways, with one-field `timings: { text }` objects; the screens now say it with one helper (`writtenPart`).
- **Every Frame keeps its Image Prompt in `image`**, of every kind, so code that reads Frames of any kind (rendering, the picture menu, Compare, clips) reads `frame.image?.prompt`, with no helper (`shared/` holds no functions) and no field that means something else on another kind:
  - a Chain Frame's is `{ prompt }`, always there, as it's written with the Frame;
  - a Storyboard Frame's is `{ body, prompt, blocked?, written }`, there once its sentences are written (who it shows stays outside, in the plan);
  - a Roleplay Frame's adds `shown` and `clothing`, there once the Art Agent pictures it.

  "Written or not" is then the type's to enforce, not a convention of empty strings, and who wrote the sentences can't be there without them. Until version 2 a Storyboard Frame's were `''` until written, and a Roleplay Frame's eight separate optional fields (the sentences, the prompt, who and what they wear, the Art Agent's record), all set together or not at all on every Frame on the Mac.
- **A picture's file is its `file`** (a Picture's and each edit's; from `image`), so it isn't confused with a Frame's `image`, and matches what its other files are called (`scene.file`, `clip.file`).

## Considered Options

- **Flat fields, `''` until written, on a Roleplay Frame as on a Storyboard Frame.** The smallest change, and code shared by every kind kept reading `frame.prompt`; but "written or not" stays a convention, and the Art Agent's record could disagree with the fields beside it. Turned down by the owner, for the format that's best going forward, whatever the change costs.
- **An `art` object on Storyboard and Roleplay Frames only.** Puts the prompt in a different place on a Chain Frame, so code shared by every kind needs a helper, which `shared/` can't hold. Giving every kind the object removes that, and `image` names it for what it is, whoever writes it (a Chain's is the Text Model's, not the Art Agent's).
- **Keeping a picture's `image`.** `frame.image.prompt` beside `frame.pictures[0].image` read as two meanings of one word, and a test helper that spread a picture onto its Frame overwrote one with the other.
- **Designing ahead for the open threads** (Look versions per Frame, summaries of long Roleplays, a Session's export). Left for when each is built, as a version now costs a step and its test.

## Consequences

- **A written Frame without who wrote it can't be migrated**: version 2 fails it, naming the Frame, rather than claim a model that didn't write it. None on the Mac lacked it (2026-11-20).
- **A Roleplay Frame pictured before the clothing sentence** would now have `clothing: ''`, which the Limits' check reads as no one dressed when two or more are shown. None on the Mac lacked it.
- **The Compare export keeps `image` and `prompt`** in its own rows (`shared/comparison.ts`), a shape of its own, not a Picture's.
