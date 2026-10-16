# People in pictures

How the app's prompts handle the people in a picture: who a Storyboard Frame shows, side characters joining a Roleplay's Look, and clothing carried from picture to picture. Moved here from docs/models.md on 2026-10-16, which keeps to the models themselves; the decisions are in ADR 0007 and ADR 0012. Two people in one picture, and a Chain's people, are in [bench/two-people](../bench/two-people/README.md).

## Storyboard plans: who each Frame shows (2026-10-08, Mac)

ADR 0012 gave the Look an identity per person and each Frame a `shown` list. Checked by planning a
16-Frame Storyboard from a Brief with five named people twice on `gemma-4-26b-heretic:nvfp4`
(Ollama, Thinking off, the Session's seed), plus one Action on the result; nothing was rendered.

- Each plan took 44–47 s, the same as before the change, and listed all five people.
- Every name in `shown` matched the Look exactly (none needed `matchShown`'s word matching).
- Frames about one person showed only them; the four Frames of the scenery showed no one. Group
  Frames named four people, cut to the first three. The two runs disagreed on whether a Frame
  where one person signals the others shows just him or the whole group.
- An Action bringing a second person into a Frame ("X stands beside Y") put them in `shown` and
  left the Look alone.
- Faults the engine now handles: identity sentences without a full stop (they ran into each
  other), and "No people." written as an empty Frame's clothing sentence, despite the prompt saying
  not to (before the change, the same model wrote "N/A (Environmental focus)" there).

**32 Frames** (the most since 2026-10-08, from 16), from the `contact` Scenario, four plans, not
seeded:

- 60–83 s each (16 Frames took 44–47 s); about 2.5 s per Frame once the Look and Beats are written.
  No escaped line breaks, "N/A" or broken JSON, all five people in every Look.
- In three plans every Frame's sentences and `shown` matched its Beat. In the first, `shown` sat one
  Frame late in two runs of four Frames (the Frame about Dillon naming Dutch, and so on); its
  sentences weren't printed, so whether they lagged too is unknown. Not seen again.
- Close-ups of guns and brass named the men until the prompt said a close-up of an object shows no
  one; then they came back empty. Frames of no one sometimes name something else instead ("The
  jungle", "style"), which the engine drops as it isn't a person in the Look.
- Every Beat started with its number ("Frame 12: …", as the 16-Frame plans' "01: …"); the engine
  strips it.
- The owner's first 16-Frame plan of the `contact` Scenario in the app (seed 42) ran away inside
  Frame 1 on both attempts, each running to the 12,400-token cap (3 min 53 s and 4 min 1 s by
  Ollama's log) before failing. Replayed with the same seed outside the app it finished in 45 s,
  twice: Ollama doesn't repeat a reply exactly here. What it wrote wasn't kept. Since then a plan is
  stopped once 8,000 characters pass without the next part (the Look, the Beats, a Frame)
  complete (`RUNAWAY_CHARS`), logging its last words, and retried; stopping the stream ends
  Ollama's request at once ("Request terminated", checked).
- **Whitespace between the parts (2026-10-09, Mac).** A 15-Frame plan in the app ran away on both
  attempts, padding with spaces and blank lines. Replayed outside the app on
  `gemma-4-26b-heretic:nvfp4`, short one-line Briefs failed 6 of 12 times; the `tavern` and
  `contact` Scenarios, 0 of 5. The whitespace always began right after a part closed: after the
  Look's `}`, or after the Beats' `]` with all 15 written. The model took its answer as done there,
  and with `}` barred by the schema (the next part still required) it padded instead. The plan's
  user message now says the reply holds all three parts, in order, and is done only after the last
  Frame: the same Briefs then failed 0 of 10.

## Side characters joining the Look (2026-10-09, Mac)

gemma-4 26B heretic (`gemma-4-26b-heretic:nvfp4`), prose, on a copy of the Kael tavern Roleplay
(its Look ported to people) with two made-up exchanges added, in which a named city guard comes in,
is served, and keeps looking at the Persona (ADR 0012, "Roleplays too"):

| Frame | Times pictured | Newcomers | Shown | Art Agent time |
|---|---|---|---|---|
| An ordinary Frame (only the two of them) | 1 | none | both | 7.8 s |
| The guard's first | 4 | him, once; then none | the Character and him | 5.6–8.1 s (37 s once, with a retry) |
| The guard's second | 4 | none | the Character and him, plus the Persona 2 times in 4 | 4.7–8.9 s |

- **It adds the right person once**: an identity sentence in the Look's own style (name, age,
  build, beard, skin), and reuses it afterwards; the Look stayed at three people. A passing
  mention of "a man" in the story added no one.
- **One reply in nine ran past the length limit** (1,600 tokens, about four times a picture) and
  was retried; the other eight didn't. Worth watching: it's the kind of stall gemma4 showed when
  yes/no answers came first.
- Whether the Persona, watching from a corner, is in the picture varied run to run: a judgement
  call, which Picture again settles.

## Clothing carried from picture to picture (2026-10-09, Mac)

gemma-4 26B heretic (`gemma-4-26b-heretic:nvfp4`), prose, Limits off, on a 30-Frame Roleplay
replayed from the Kael tavern's Messages (in which the Persona undresses in stages, a towel comes
and goes, the Character is stabbed, and two men join). Every Frame pictured in order, without and
then with each person's last clothing sentence given to the Art Agent to copy forward (design.md):

- **Without it, clothing was re-imagined every picture**: the Character's clothes were described
  differently from one Frame to the next (a linen shirt, a tunic, "practical garments"), and the
  Persona's dress came back in 6 of the 16 Frames after she had taken it off.
- **With it**, the Character's clothing sentence was the same in all 30 Frames, his wound's blood
  stayed from the stabbing to the end, and the Persona's state followed the story (the dress
  unfastened, a towel, then without it) and never came back.
- **One miss, fixed by the prompt**: she undressed in a Frame whose picture didn't show her, so the
  next picture copied her last-known dress. Told that the story after that Frame wins over the
  copied clothing, the next picture had her undressed, 2 times in 2.
- Passing states stick too: the steam dampened the Character's clothes in one Frame, and "damp"
  carries forward until the story changes it.
- 2 of 30 replies ran past the length limit and were retried (1 in 9 before, with newcomers).
- **Replayed with seed 42** (the same 30 Replies, word for word) after one person per Look
  entry: the two men who come in together joined the Look as two people, each kept in his 11
  pictures, and no reply ran past the length limit. With all four people in a picture, only three
  identities are carried (`MAX_SHOWN`); in the one picture that went wrong, the image model put the
  Persona's top back on though her prompt said she was bare from the waist up.
- **Replayed with the Limits on** (seed 42, same Messages): one Message declined (the towel), no
  nudity in any picture, and her clothing consistent from Frame to Frame (her cloak off, then her
  undergarments, then a wrap). One picture was blocked wrongly by the clothing check: "the two men
  wear…" dressed both men, but the check looked for "man"; a name's plural now counts.
