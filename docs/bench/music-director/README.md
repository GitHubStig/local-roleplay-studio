# The Music Director's bench (2026-11-06, Mac)

Does the Music Director (`server/roleplay/director.ts`, docs/music-plans.md) change the music where a story turns, and hold it where it doesn't? The bench replays (`server/replay/replays/music-*.yaml`) each give a course, a step per Frame (begin, hold, gentle, sharp, change, silence, any), and the Director's decisions are scored against it.

## What was run

    deno run -A docs/bench/music-director/run.ts play 1 2 3 4
    deno run -A docs/bench/music-director/run.ts direct <variant> 1 2 3 4
    deno run -A docs/bench/music-director/run.ts table <variant>...

**Play** sends each replay's Messages through the app's engine in a scratch folder at seeds 1–4 and writes the Score, saving the stories; **direct** then directs each saved story Frame by Frame with the app's `directFrame`, under a variant, so every variant reads the same stories. Gemma 4 26B Heretic (`gemma-4-26b-heretic:nvfp4`), Thinking off, on the Mac. A play took 44–49 s, a direct about 35 s.

**Scoring.** A change in the course (gentle, sharp, change, silence) is kept if the Director made one of its kind on that Frame or a Frame either side, as a Reply can make a turn before the Message meant to cause it, or after; a hold is kept if the music held, or if the change there was a neighbouring one come early or late. *Missed*: a change not made within a Frame. *Extra*: a change where the course holds. *Wrong entry*: a change kept but entering the other way (sharp for gentle, or gentle for sharp). `begin` and `any` keep whatever is decided.

The variants: **base**, each replay as written (its Behaviour and Vocals, the whole story); **since**, the same reading only the Frames since the Cue playing began; **buffet-story**, the Buffet played Follows the story against its Steady; **heaven-instrumental**, Heaven with Instrumental only against its wordless voices; **control-cinematic**, the small talk played Cinematic.

## What it showed

The first run, with `director.md` as it was written (4 runs a row; *Voiced*: Cues with wordless voices or a choir):

| Variant | Replay | Kept | Missed | Extra | Wrong entry | Sharp | Cues | Voiced | s/Frame |
|---|---|---|---|---|---|---|---|---|---|
| base | small talk (control) | 51/60 (85%) | 0 | 9 | 0 | 4 | 13 | 0 | 2.4 |
| base | lost daughter | 43/56 (77%) | 0 | 13 | 7 | 14 | 33 | 0 | 2.8 |
| base | hired killer | 48/56 (86%) | 2 | 6 | 5 | 17 | 28 | 0 | 2.6 |
| base | Heaven | 46/52 (88%) | 2 | 4 | 4 | 4 | 26 | 8 | 2.7 |
| base | Buffet (Steady) | 43/52 (83%) | 0 | 9 | 0 | 1 | 20 | 0 | 2.6 |
| since | small talk | 48/60 (80%) | 0 | 12 | 0 | 6 | 16 | 0 | 2.2 |
| since | lost daughter | 42/56 (75%) | 0 | 14 | 10 | 20 | 35 | 0 | 2.6 |
| since | hired killer | 50/56 (89%) | 1 | 5 | 6 | 19 | 28 | 0 | 2.4 |
| since | Heaven | 43/52 (83%) | 2 | 7 | 4 | 4 | 29 | 8 | 2.6 |
| since | Buffet | 43/52 (83%) | 0 | 9 | 0 | 1 | 19 | 0 | 2.4 |
| buffet-story | Buffet | 40/52 (77%) | 0 | 12 | 0 | 0 | 23 | 0 | 2.6 |
| heaven-instrumental | Heaven | 45/52 (87%) | 0 | 7 | 5 | 5 | 31 | 0 | 2.7 |
| control-cinematic | small talk | 46/60 (77%) | 0 | 14 | 0 | 8 | 18 | 0 | 2.5 |

No runaway in any of it (about 1,500 Director and cue writer calls).

- **The whole story, not since the Cue began.** Base kept 231 of 276 Frames (84%), since 226 (82%), with more extra changes (47 against 41) and more sharp ones (50 against 40); reading less saved about 0.2 s a Frame. Settled: the Director reads the whole story. Not tested: a Roleplay long enough for the whole story to cost much more time, which is where since might be worth it.
- **Too many changes, not too few.** Of the misses, 41 were extra changes and 4 missed ones. The lost daughter, slow tender shifts in one place, ran 6–10 Cues in 14 Frames.
- **The Behaviour moves it the right way.** Steady against Follows the story on the Buffet: 9 extra changes and 20 Cues against 12 and 23. Cinematic against Follows the story on the control: 14 and 18 against 9 and 13. Small steps, in the right direction.
- **The Vocals setting holds.** Heaven with Instrumental only had no voiced Cue; allowed them, 8 of 26 Cues had voices, all in Heaven, none in the tavern or the Buffet.
- **"Sharp" for small shifts.** 40 sharp changes in base, 14 of them in the lost daughter, whose course has none: a narrowed look, a guarded thought, a warning. 16 changes kept came in the wrong way. The prompt described sharp as "a sudden turn (a blow, a revelation, a door kicked in)"; it was narrowed to events that break the scene (below).

## "Sharp" narrowed (the same day)

`director.md` now says a gentle entry is almost every change, and a sharp one only "a sudden event that breaks the scene at once: a blow, a weapon drawn, a death, someone bursting in. A look, a guarded word, a warning or a growing unease is never sharp, however tense." The same 20 stories directed again (base):

| Replay | Kept, before → after | Missed | Extra | Wrong entry | Sharp | Cues |
|---|---|---|---|---|---|---|
| small talk (control) | 51 → 52 of 60 | 0 → 0 | 9 → 8 | 0 → 0 | 4 → 0 | 13 → 12 |
| lost daughter | 43 → 48 of 56 | 0 → 3 | 13 → 5 | 7 → 0 | 14 → 0 | 33 → 22 |
| hired killer | 48 → 50 of 56 | 2 → 3 | 6 → 3 | 5 → 0 | 17 → 4 | 28 → 24 |
| Heaven | 46 → 48 of 52 | 2 → 1 | 4 → 3 | 4 → 0 | 4 → 0 | 26 → 26 |
| Buffet (Steady) | 43 → 45 of 52 | 0 → 0 | 9 → 7 | 0 → 0 | 1 → 0 | 20 → 18 |
| **All** | **231 → 243 of 276 (84% → 88%)** | 4 → 7 | 41 → 26 | 16 → 0 | 40 → 4 | 120 → 102 |

- **Sharp only where the scene breaks.** The 4 left are the hired killer's blade, on Frame 10 in each of the 4 runs; none came in the wrong way.
- **Fewer changes as well.** Extra changes fell from 41 to 26, and the lost daughter from 33 Cues to 22: sharp readings had been pulling changes in with them. Three gentle turns were missed in the lost daughter, the cost of a calmer Director.
- **The menace heard before the blade.** In the hired killer the first change came at the hand on the knife (Frame 5), a Frame after the glance at the bolt where the course has it, in 3 runs of 4.
- No runaway (about 300 calls).

## Score the Roleplay, with hindsight (2026-11-07, Mac)

The pass (`server/roleplay/hindsight.ts`) over the same 20 stories, and over a long one. `direct hindsight` reads each story as the app does (whole, up to 100 Frames), `hindsight-chunked` in chunks of 5 Frames with 2 more read either side, `hindsight-whole` in one call however long; `AS=<name>` keeps each wording's results apart.

**Three wordings**, against the Director as you play (`base`, after "sharp" was narrowed), Frames kept of 276:

| Replay | As you play | Turns only, first | Turns only, few | Course, then turns | Course, chunks of 5 |
|---|---|---|---|---|---|
| small talk (control) | 52 of 60 | 1 of 15 (seed 1) | 46 | 49 | 33 |
| lost daughter | 48 of 56 | | 42 | 50 | 39 |
| hired killer | 50 of 56 | | 52 | 49 | 40 |
| Heaven | 48 of 52 | | 40 | 48 | 44 |
| Buffet (Steady) | 45 of 52 | | 47 | 49 | 44 |
| **All** | **243 (88%), 26 extra** | | **227 (82%), 44 extra** | **245 (89%), 17 extra** | **200 (72%), 73 extra** |

- **Turns only, first**: with no "continue" among a turn's decisions, the model accounted for every Frame and marked nearly each a transition (14 of 15 on the control). Stopped after one story.
- **Turns only, few**: saying only the turns are listed, few and several exchanges apart, and one for a story whose ground never shifts. Better, but more changes than the Director as you play, clustered late (Heaven changed at nearly every Frame of its second half) and often a silence or change on the last Frame. Saying the story goes on after its last Frame changed nothing (75–77% on three replays).
- **Course, then turns**: the reply first gives "course", three or four sentences on where things between them begin, really turn and stand at the end, and only then the turns ("mark a turn only where it really turns"). It beat the Director as you play, with a third fewer extra changes, at 0.9–1.4 s a Frame (the cue writer's calls included) against 2.6–2.9.
- **Small chunks** still make it worse: each finds turns of its own.
- No runaway, and no reply cut off at its cap, in about 200 calls of the pass under the last two wordings.

**A long story** (`music-tavern-long-night`, 61 Frames in six movements, turns at Frames 12, 22, 33 (sharp), 42 and 52; seeds 1 and 2):

| | Kept, seed 1 / 2 | Extra | s/Frame |
|---|---|---|---|
| As you play | 54 / 52 of 61 (87%) | 15 | 2.9 |
| Course, chunks of 30 (6 either side) | 56 / 50 (87%) | 15 | 0.9 |
| Course, the whole story in one call | 56 / 54 (90%) | 11 | 0.65 |

Read whole, the 61 Frames took about 40 s in all; in chunks of 30, seed 2 put four changes near the boundary at Frame 31.

**100 Frames** (`music-tavern-hundred`: the long night's 60 Messages, then a calm morning, the excise men back with a warrant, a shot and flight to the boat (sharp), and peace at sea; nine turns, two sharp). Played once through the app under Score as you play (Session `20261107-055229-e1e2`, kept), then the pass run over that story at seeds 1 and 2:

| | Kept, seed 1 / 2 | Extra | s/Frame |
|---|---|---|---|
| As you play (the app's run, scored the bench's way) | 84 of 100 | 13 | 4.2 |
| Course, the whole story in one call | 84 / 84 | 14 / 14 | 0.85 |
| Course, two chunks of 50 (10 either side) | 88 / 89 | 11 / 9 | 0.7 |

Read whole, 100 Frames is too much: its changes crowd the last ten Frames. So the app reads a story whole up to 75 Frames and splits a longer one evenly into chunks of no more than 75, 10 more read either side: 61 Frames whole, 100 as two of 50, 150 as two of 75 (untried).

**Thinking on** (`THINK=1`), the same course-first wording:

| | Kept | Missed | Extra | s/Frame |
|---|---|---|---|---|
| The 20 short stories, thinking off | 245 of 276 (89%) | 14 | 17 | 0.9–1.4 |
| The 20 short stories, thinking on | 241 (87%) | 22 | 13 | 7–12 |
| 100 Frames in two chunks, thinking off | 88 / 89 | 3 / 3 | 11 / 9 | 0.7 |
| 100 Frames in two chunks, thinking on | 88 / 89 | 3 / 3 | 9 / 8 | 5.8–6.5 |

Thinking makes it quieter (fewer changes, more of them missed, Heaven 83%) and about ten times slower, about 10 minutes for 100 Frames against 70 s, for no gain. The app follows the Session's Thinking switch as for every text job; each call's limit with thinking is 10 minutes, which a 50-Frame chunk kept well inside (about 5); a 75-Frame one is untried.

## Gemma 4 12B (2026-11-07, Mac)

The same stories directed with `MODEL=gemma-4-12b-heretic:nvfp4` (the MLX build; the PC runs the GGUF Q4_K_M of the same model, assumed close), thinking off. The stories were played by the 26B; only the directing changes model.

| | 12B | 26B |
|---|---|---|
| The Director as you play, 20 short stories | 212 of 276 (77%), 56 extra, 4.5–5.5 s/Frame | 243 (88%), 26 extra, 2.6–2.9 |
| Score the Roleplay, 20 short stories | 245 (89%), 18 extra, 1.7–2.9 s/Frame | 245 (89%), 17 extra, 0.9–1.4 |
| 61 Frames, whole / chunks of 30 | 111 / 105 of 122 (91% / 86%) | 90% / 87% |
| 100 Frames, whole / two of 50 / four of 25 | 178 / 184 / 175 of 200 (89% / 92% / 88%) | 84% / 88.5% / not run |

- **The 12B as you play changes far too often** (56 extra changes against 26); with hindsight it keeps to the course as well as the 26B. The 12B gains the most from Score the Roleplay.
- **It agrees on chunks**: whole is best at 61 Frames, two chunks of 50 at 100, and smaller chunks add changes. So one rule, whole up to 75 Frames and even chunks of no more beyond, suits both models.
- No runaway in any run.

## One call against two (2026-11-07, Mac)

The Director and the cue writer merged (a bench variant, removed once benched and never committed): one reply with the decision and then the music from this Frame on, always written (a schema can't ask for it only on a change) and kept only on a change. Against the two calls (`base`):

| | Two calls | One call |
|---|---|---|
| 26B, 20 short stories | 243 of 276 (88%), 7 missed, 26 extra, 2.6–2.9 s/Frame | 240 (87%), 14 missed, 22 extra, 3.2–3.5 s/Frame |
| 12B, 20 short stories | 212 (77%), 8 missed, 56 extra, 4.5–5.5 s/Frame | 223 (81%), 10 missed, 43 extra, 6.0–6.2 s/Frame |
| 26B, 61 Frames (seeds 1, 2) | 106 of 122 (87%), 15 extra, 2.8 s/Frame | 113 (93%), 8 extra, 3.6 s/Frame |

The Cues each wrote (changes only):

| | Instruments outside the Score's palette | Voiced Cues (Heaven allows them) | Same energy, density and tempo as the Cue before |
|---|---|---|---|
| 26B, two calls / one | 0 of 238 / 6 of 245 | 10 / 4 | 20 / 9 |
| 12B, two calls / one | 0 of 399 / 0 of 394 | 10 / 7 | 7 / 10 |
| 26B, 61 Frames, two calls / one | 0 of 61 / 18 of 52 | 0 / 0 | 5 / 3 |

- **Decisions**: about even on the 26B's short stories (a few more turns missed, a few fewer extra), better on the 12B (fewer extra changes) and on the long story.
- **Slower, not quicker**: every Frame now writes a Cue's values, though most continue; the second call came only on a change.
- **Its Cues are looser**: on the 26B the instruments drift from the palette's names ("fiddles", "low fiddle"), and on one long run the mood ran into them ("low, mourning cello", "dull wooden thud", "single low fiddle note"), which a music model's adapter would need clean. It used voices less where they're allowed.
- No runaway in about 1,000 calls under the merged schema.

Decided with the owner: **the two calls stay**, and the merged variant was removed. The decisions' gain is small and could be noise (20 stories, one long one), and Score the Roleplay reaches 89% on both models anyway, so it would help only the music as you play, and mostly on the 12B; the looser Cues and the slower Frames weigh more. If the 12B's music as you play falls short on the PC, the in-between is worth benching: a merged call that only names the music's direction ("warmer", "darker") and leaves the values to the cue writer on a change.

## Not checked

- **A Roleplay over 100 Frames**, and Score the Roleplay's 75-Frame chunks, read with or without thinking.
- **Thinking on for the Director as you play** (Score the Roleplay's is above), and the PC's GGUF build of the 12B itself.
- **The Behaviour's sentences** against each other beyond the two single-replay checks above.
