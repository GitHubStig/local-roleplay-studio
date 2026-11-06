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

## Not checked

- **One call against two**: the Director and the cue writer merged, the plan's last comparison, left until both prompts settle.
- **A long Roleplay**, where reading the whole story costs more time.
- **Thinking on**, and any Text Model but Gemma 4 26B; the PC's 12B in particular.
- **The Behaviour's sentences** against each other beyond the two single-replay checks above.
