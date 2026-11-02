# Truths against a pushy player (2026-11-02, Mac)

The test behind Truths in a Roleplay ([ADR 0032](../../adr/0032-scenarios-are-stories-kept-in-each-session.md)). The owner found the player's Persona too powerful: whatever a Message says happens, happens, so the player can overpower or talk round anyone. Does a Truth in the Cast ("Kael is far stronger than Elara; she can't overpower him unless she catches him off guard") stop that?

## What was run

[`tavern-pushy.yaml`](../../../server/replay/replays/tavern-pushy.yaml) through the running app (`deno task replay … --no-pictures`), the public tavern Scenario, Elara played against Kael. Four Messages, each writing its own outcome, face to face with no surprise: she pins him to the shelves by the throat; twists his wrist until he drops the letter; threatens to tell the harbourmaster about his smuggling; hauls him across the bar, throws him down and stands on his chest. Each run on seeds 7 and 8, with the tavern as it is and with a copy without Kael's Truth, Thinking off. Kael gives in physically if the Reply has the outcome Elara wrote happen.

| Text Model | Wording | With the Truth | Without it |
|---|---|---|---|
| Gemma 4 26B Heretic (nvfp4) | the Truth alone | gives in to all three moves, both seeds | the same |
| Gemma 4 26B Heretic | + "what the player writes is what the Persona tries; how it lands is yours to decide" in the system message | gives in to all three, both seeds | the same |
| Gemma 4 26B Heretic | + that, and a reminder after the newest Message only | gives in to all three, both seeds; the Truth shows only in his thoughts ("he knows he could likely throw her off") | the same |
| Gemma 4 26B Heretic | + "When Elara tries something these rule out, it fails: show how it fails, in the story" after the Truths | gives in to all three, both seeds | (not run) |
| Gemma 4 26B Heretic | that, with Thinking on | gives in to all three, both seeds; its reasoning quotes the Truth, then reads the shove as catching him off guard ("Elara's attempt to pin him worked because he didn't resist yet/was surprised") though the Message says he's watching her; each Reply 8–12 s against 2–3 s, the Cast 64–81 s against 4 s | (not run) |
| Gemma 4 26B Heretic | that, Thinking off, and the Truth with no exception ("she can't overpower, pin or disarm him") | gives in to all three, both seeds ("he doesn't struggle, he knows his strength would make this messier") | (not run) |
| Gemma 4 26B Heretic | Thinking off; the Truths under `### CHARACTER TRUTHS (IMMUTABLE LAWS)`, then `### NEGATIVE CONSTRAINTS (FORBIDDEN ACTIONS)`: "NEVER allow Elara to overpower, pin, restrain, disarm or throw Kael", "NEVER let anything happen that a Truth above rules out", "write the realistic failure" (a prompt shape suggested for Gemma 4, with a constraint written for this Truth) | gives in to five of the six moves: at seed 8 her shove leaves him "solid and immovable", then he drops the letter and is thrown all the same | (not run) |
| Gemma 4 26B Heretic | Thinking off; **a judge first**: a separate call, on the same model, gets the Truths, Kael's latest Reply and the Message, and answers `{ breaks, outcome }`; when broken, the outcome goes after the Message as "(What actually happens: …)" | **all three moves fail, both seeds**: she can't pin him ("rooted to the spot"), the twist gets "no concession", the throw fails (he sidesteps and she stumbles, or he doesn't budge); the threat is let through. About 1 s more per Message (2–4 s against 2–3 s) | no judge without Truths |
| Qwen3.8 27B Uncensored (mlx-4bit) | the Truth alone | fights back some of the time: seed 8 throws her off and elbows her; seed 7 pries her grip loose, then gives in | fights back a little, gives in to the throw |
| Qwen3.8 27B Uncensored | + the "tries" line and the reminder | fights back in every run: turns her arm, elbows her ribs, rolls out from under her boot and kicks her down | fights back too, nearly as hard |

- **On Gemma 4 26B nothing helped**: six wordings (one a prompt shape suggested for Gemma 4, NEVER bullets naming the forbidden moves), and Thinking. The Truth reached the Character's system message (checked), and with Thinking its reasoning even checked against it, but each Reply took the Message's outcome as done, explaining it away; the Truth shaped only how Kael thought and talked (slower to give a name). An exception in a Truth ("unless she catches him off guard") is a way out a model will take.
- **Qwen 27B decides outcomes itself**, with or without the Truth, more so with the "tries" line and reminder. The Truth seemed to make it stronger still at seed 8, but two seeds can't separate it from chance. Its Replies broke the format often, though: narration in `dialogue`, lines cut off ("Red wax,"), an empty `dialogue`, and once a whole Reply written as Elara's actions. And each replay took 75–93 s against 15–18 s on Gemma.
- **Kept:** the Truths; the "tries" line in `character.md`; and what happens when a Truth is broken, in `truths.md`. Both say what's wanted in plain terms, right for any model, and didn't hurt Gemma. **Dropped:** the reminder after the newest Message (scaffolding that didn't help Gemma and isn't needed by Qwen), and Thinking (no help, about 4× slower).

- **What worked on Gemma is deciding the outcome first, and handing it over as what happens**: a model that lets the player's written outcome stand also keeps to an outcome it's given. The judge is a short call under a schema, only when the Cast has Truths. Against [`tavern-arrival.yaml`](../../../server/replay/replays/tavern-arrival.yaml) (four ordinary moves, the Truths on) it let all four through. Rough edges: a verdict can half-allow a move ("her arm presses against his throat" with Kael unmoved), which a later Reply then carries on; and once a Reply sat Kael on a stool he'd never sat on.

Whether the player decides outcomes is mostly the Text Model's doing. The judge is a workaround for that (AGENTS.md): check again when the Text Model changes, and drop it once the Character keeps to the Truths by itself.

## Decision models as the judge (2026-11-02, Mac)

Ollama's decision models (the `decision` capability, `POST /v1/systemone`, Ollama 0.40.13) don't write text: they're given a `state` and named questions and return probabilities. Asked, for the judge's eight inputs above (the four pushy moves, three of which break Kael's Truth, and the four ordinary arrival moves), a yes/no question ("does Elara's move, or how the player says it turns out, go against any of the truths?", with what yes and no mean) and a choice of which Truth; gemma asked as the app's judge does. Thinking off, warm calls after a first one that loads the model:

| Model | Size loaded | First call (load) | Per call | Right |
|---|---|---|---|---|
| laya (421M) | 0.8 GB | 1.5 s | ~37 ms | 4 of 8 (no better than chance: near 0.5 on everything; the input, ~520 tokens, is about its 512-token context) |
| strands-decider 2B (nvfp4) | 1.9 GB | 1.9 s | ~100 ms | 7 of 8 (the threat called a break, at 0.54) |
| d1 3B (lfm2, q8_0) | 3.7 GB | 5.3 s | ~187 ms | 8 of 8 (0.79–0.85 for the breaks, 0.09–0.21 for the rest) |
| Gemma 4 26B Heretic (the app's judge) | already loaded | — | 370–970 ms | 8 of 8, and writes what happens instead |

- **d1 judges as well as Gemma here, about 3× faster per call**, but that saves only a few hundred milliseconds a Message, and it can't write the outcome: the Character would be told only that the move fails, and which Truth. It's also a second model to keep loaded: after the run Ollama had unloaded d1 to load Gemma, so as things stand it would reload too. Eight inputs from one story is a small sample.
- **Kept: the Text Model as the judge** (one Text Model for every text job). A decision model like d1 is worth another look if the judge becomes slow (a thinking or larger Text Model) or starts misjudging.
