# The Music Director

What the Music Director and the cue writer do in play, measured on the bench replays (`server/replay/replays/music-*.yaml`, docs/music-plans.md). Each replay's `course` gives what the music should do at each Frame; `deno task replay` prints each decision against it.

## First run of the replays (2026-11-06, Mac)

Gemma 4 26B Heretic (`gemma-4-26b-heretic:nvfp4`), Thinking off, one run of each replay at its seed (7), no pictures. Each Frame's direction took a few seconds and kept up with the Replies: the last finished 3–6 s after the last Reply.

| Replay | Behaviour, Vocals | Kept to the course |
|---|---|---|
| Tavern small talk (the control) | Follows the story, Instrumental | 12 of 15 |
| The Buffet of Souls | Steady, Instrumental | 12 of 13 |
| Tavern, a hired killer | Follows the story, Instrumental | 10 of 14 |
| Tavern, a lost daughter | Follows the story, Instrumental | 7 of 14 |
| Knocking on Heaven's Door | Follows the story, wordless voices allowed | 4 of 13 |

What the misses were:

- **"Sharp" for small shifts.** About 10 of the 14 sharp changes came on a narrowed look, a guarded thought or a warning, not on a blow or a revelation: in the control, Kael freezing at a question about a road, and warning Elara off asking about a ship in a bottle. The Scenario's Kael is nervous about his letter, so the small talk does turn tense in his Replies, and the Director hears that rightly; it's the entry that's too strong. Readings that say "sharpened" or "piercing" tend to come with "sharp". To check over several seeds before changing the prompt.
- **A turn a Frame early or late.** In Heaven the grief came at the confession, a Frame before the course had it, and the relief a Frame after the mercy; a Reply can turn a scene before the Message the course expected, or after it. The arc was followed; the course was too exact. The bench should allow a Frame either side for a change.
- **Wordless voices where they fit.** Allowed them, the cue writer used none in the tavern's Cues and none in Heaven until relief and the opening gates (Frames 10–13 of 13).
- **Odd ends.** One Cue's mood ended in a stray `</` (now trimmed by `cleanCue`). Heaven's Score left out the Scenario's pipe organ this time (it kept it in 8 of 8 when the Score was benched): seed variance.

## Over several seeds (2026-11-06, Mac)

The bench ([docs/bench/music-director/](../bench/music-director/README.md)) ran these replays over seeds 1–4 under variants, a change a Frame either side counting as kept. It confirmed "sharp" for small shifts (40 in 20 runs); the prompt's narrower "sharp" took the same stories from 84% of Frames kept to 88%, sharp to 4 (the hired killer's blade), and none the wrong way.

