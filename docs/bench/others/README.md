# Others in a Roleplay (2026-11-03, Mac)

The test behind other People in a Roleplay ([ADR 0032](../../adr/0032-scenarios-are-stories-kept-in-each-session.md)): a Roleplay stays one-on-one, but the Scenario's other People are in the Cast (`others`, a line each), and may act and say a few words inside the Character's `actions`: never in `dialogue`, which is voiced as the Character, nor `internal`, and never for the Persona.

## What was run

The public tavern with a third Person added, as a copy in `scenarios/` (deleted after): Bram, Kael's stable boy (fourteen, thin, nervous, mumbles too fast), sweeping by the hearth in the Opening. A baseline copy had the same Opening but no Bram among the People, so the Cast had no others, as before this change. Replays through the running app (`--no-pictures`), Elara played against Kael, Gemma 4 26B Heretic (nvfp4), Thinking off:

- **Pushy** (seeds 7 and 8, with and without Bram listed): Elara orders the boy to fetch a brandy; asks him to tell Kael what he saw by the stables; writes Bram's own outburst ("Sir, she's the one who left the letter!"); grabs him as a shield and walks round the bar towards Kael.
- **Spoken to** (seeds 7–9): she gives him a coin and asks his name; asks whether he saw anyone come by.
- **Harmless** (seeds 7–9): she asks him, away from the bar, for stew and a stall for her horse.

| Wording | Bram acts in `actions` | Bram speaks | His words in `dialogue` (voiced as Kael) |
|---|---|---|---|
| Baseline, Bram not listed | now and then, as "the lad" | never: Kael answers for him | — |
| `others.md`: "can act and say a few words inside actions" | in nearly every Reply, in character (jumps, scurries, pales, freezes) | once in 23 Replies | that once (a whole line about a drafty shed) |
| + where his words go, with an example (they mumble, "There's a bit left."), why `dialogue` is the Character's alone (it's voiced), and that he can answer for himself | the same | 14 of 23 Replies, a line each, in character ("I... I'm Bram, miss", "No one went by, Miss... just the shadows and the rain") | never |

- **Kept:** the second wording. It says what's wanted in plain terms, for any model: where an other's words go, and why. Kael still often answers for Bram when he has a reason to (shielding a boy who knows about the letter), which fits him.
- **The player can speak for an other**: when a Message wrote Bram's outburst, every Reply took it as said. Only the Truths are refereed (the judge), so this stands, as a player's own outcomes do outside the Truths. Left to the owner.
- **The judge blocked the shield move** in every run (walking round the bar towards Kael holding the boy, judged to break "Elara can't overpower Kael"). Strict, and kept so (the owner: a strong Truth is wanted, and the player can edit it mid-play). But it didn't know who Bram is, and once made him "too heavy" to move.

## The judge and the others (2026-11-03, Mac)

The judge got only the Truths, the Character's latest Reply and the Message. Sent straight to Ollama with the judge's own messages (the Cast above, Kael's last Reply ordering Bram back to work), seeds 1–10, Thinking off:

| Judge told | Shield move blocked | Its outcome contradicts Bram | "I press a coin into Bram's hand and send him up to the stables" let through |
|---|---|---|---|
| The Truths alone | 10 of 10 | 7 of 10 ("the heavy weight of Bram", "the heavier man") | 10 of 10 |
| + the Cast's others (`judge-others.md`) | 10 of 10 | none ("the boy is too small and light to serve as a barrier", "he slips from her grip") | 10 of 10 |

Kept: the judge is told who else is in the story. It blocks no more than before, and what it says happens stays true to them.
