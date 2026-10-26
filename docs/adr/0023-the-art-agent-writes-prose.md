---
status: accepted
---

# The Art Agent writes prose, not tags

Since 2026-09-29 Settings had an Art Agent style: prose (the default), or a few comma-separated tags per aspect of a Roleplay picture (`art-frame-tags.md`), for speed or for a tag-trained Image Model. Decided with the owner on 2026-10-26 to drop it: the Art Agent writes prose only.

- **Prose did better everywhere it was measured** (models.md, "Tags instead of prose"; the set in [bench/art-tags](../bench/art-tags/README.md)). It got who's in the picture right on all three Art Agents, and rendered right on all seven installed Image Models; no tag set was right on any. Tags can't say who does what to whom, or where each person is, so with two people actions swap, one person's features land on the other, and everyone stands on one level facing the viewer. They also ignored "dress them" far more.
- **The Image Models the app runs read full prose.** Most take prose prompts well; the exceptions (Ideogram 4, FIBO) want JSON captions, not tags, and none is trained on tags, so the style had no model to serve.
- **Speed alone isn't worth it.** Tags were about twice as fast to write, but a faster Text Model or the heretic's prose (4–8 s a picture) gets most of that without the mistakes.

So `artStyle` goes from Settings, with its prompt, schema and the "as tags" note on a Frame. No Session on the Mac had a picture written as tags; one elsewhere keeps its `pictureStyle` field, unread. A Settings file that still has `artStyle` loads as before, the field dropped.

## Considered Options

- **Keep it, as a switch.** A choice nobody should pick is a trap for a player who doesn't know the findings.
- **Keep it for a future tag-trained Image Model.** None is in sight; the bench and models.md keep what's needed to bring it back.

## Consequences

A picturing format other than prose (JSON captions for Ideogram 4 or FIBO, open-threads.md) would be added for the Image Models that need it, not as a Setting for every model.
