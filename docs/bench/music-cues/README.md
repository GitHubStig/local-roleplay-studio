# The cue writer's bench (2026-11-09, Mac)

Does the cue writer (`server/roleplay/director.ts`, `server/prompts/roleplay/cue*.md`) write what ACE-Step renders well, by the rules the music-model bench found ([research/music-models.md](../../research/music-models.md#prompting-it)), and does its reply end?

    deno run -A docs/bench/music-cues/run.ts write <label> <seed>...
    python3 docs/bench/music-cues/scan.py docs/bench/music-cues/out/<label>.jsonl
    deno run -A docs/bench/music-cues/run.ts render <label> <comfyui address> <index>...

**Write** takes each change the Music Director made in its saved runs at that seed (`docs/bench/music-director/stories/` and `results/`, gitignored, from that bench's `run.ts`: five replays of the example Scenarios, with their real Scores and readings) and writes its Cue with the Session's call straight, so a retry can't hide a runaway. **Scan** looks for what the prompt says not to do. **Render** makes tracks through the app's `MusicGenerator`. Output goes to `out/`, gitignored.

## The caption's prompt, tried three ways

Gemma 4 26B (`gemma-4-26b-heretic:nvfp4`) through Ollama on the Mac, thinking off, music rendered on the PC's ComfyUI.

| Run | Prompt | Cues | Failed | Look back at the Cue before | Median call |
|---|---|---|---|---|---|
| first | the rules, shown the Cue before's caption | 28 | 0 | not scanned; read by hand, common | 3.8 s |
| second | + begin with the genre, stand alone, voices written in the caption and without brackets | 53 | 0 | 16 | 3.7 s |
| third | + not shown the Cue before's caption, only its values | 53 | 0 | 6, two of them false hits | 3.6 s |

- **The reply ends**: none failed in 134 calls, the longest 6.0 s. The request names the parts in order and says it's done at the lyrics (AGENTS.md).
- **Shown the previous caption, the model continues it** ("the heavy organ presence vanishes, replaced by…"), which the music model can't follow, as it hears only this caption. Asking it to stand alone wasn't enough; not showing it was. Relation between Cues comes from the Score, as ADR 0035 says.
- **Followed without trouble**: no story names in any caption, one or two negations in 53, genre first, 56–82 words, three to six section tags.
- **Not fully followed**: of 14 Cues with voices in the third run, 7 name them in the caption and 10 give them lines to sing. The tension exception (leaving folk for a suspense score) wasn't used, even for the fight.
- The lyrics of a Cue with no voices keep only section tags, in code (`cleanCue`), as anything else would be sung.
- **Level**: all eight tracks rendered from the third run have the same mean volume, −14.0 dB (one −14.8), where earlier soft takes were far quieter. Not looked into.

## By ear, and what it missed

The third run's eight, on seed 1, by the owner (2026-11-09). This run looked fine by every scan and it wasn't:

- Opening, wary: "terrible, no idea what's going on". Melancholic: "somewhat but not really". Confinement: "maybe? instruments too strong?"
- The fight: "folky and not really tense". Awe, with voices: "not awe", and a short choir, "screechy ish". Rising, with voices: "too high?"
- A personal ache: "decent and fit". A brief lightness: ok, "maybe a bit high".

**The model and workflow weren't why**: a clip the owner had heard, rendered again through the new adapter from its caption and seed, matched at 0.9991 (waveform, against its `.m4a`). The prompt was: it carried the music-model bench's findings as rules, not its captions, and they didn't hold.

| What the bench had found | Third run |
|---|---|
| A course over the track, "the first tense track that felt tense" | 1 of 53 with an opening, a middle and an end |
| The Cues liked ran at 60–70 BPM, tension at 100 or more | `bpmOf` gave the tavern 56, Heaven 45, the fight 79 |
| Folk can't carry tension | allowed as an exception, never used |
| "High" raised again and again; low and warm liked | 1.5 thin-sounding words a caption; 49% of energy under 300 Hz, against 65% in the liked clips |
| A choir needs to be in the caption, with lines | half had it in the caption |

So the prompt now shows two of the owner's liked captions for their shape, tells the danger story in full ("a low pulse opens it, stabs break in and it builds; midway it drops to a near-silent held note; then it surges back"), asks for low, warm, soft music with a melody to follow, and names sections Intro, Verse, Middle and Outro. `bpmOf` moved up. The check for a new prompt should be the liked clips, not only whether the reply ends.

| Run | Course | Repeated tags | Thin words a caption | Thriller | Energy under 300 Hz |
|---|---|---|---|---|---|
| third | 1 of 53 | 21 | 1.51 | 0 | 49% |
| fourth (liked captions as examples) | 23 of 28 | 0 | 0.16 | 3 | 59% (16 tracks) |
| fifth (+ the danger story in full) | 19 of 28 | 0 | 0.24 | 3 | not measured |

The liked clips are at 65%. The scan's "course" is a rough word search. Still imperfect in the fifth: the confinement moment stays folk, and a wary moment and a hollow one are called thriller scores without being written as one.

### The fourth and fifth, by ear (the owner, 2026-11-09)

| Moment | Seed 1 | Seed 2 |
|---|---|---|
| Opening, wary | better, but a weird slow vibration, too long at the start | "not satisfactory" |
| Melancholic | not bad, the first stage too long | decent |
| Confinement (fifth) | "ok yeah better, has tension" | instruments off, not really tension |
| The fight (fifth) | "a final fantasy game battle music" | "what the heck is this" |
| Awe, with voices | not awe, no voices | no awe, no voices |
| Rising, with voices | "rising is good", no voices | "monotonous note for 50 sec", then one high note: "bad" |
| A personal ache | "long monotonous notes", "warbly, like my speaker is busted" | "better a lot" |
| A brief lightness | "too silent first 20 sec", odd instruments | "long loopy notes for 45 sec" |

- **The first stage is too long** (the owner): someone reading a Roleplay has read on before the music reaches its second stage, which is usually the one that gets it right, and that's before rendering time. So a track opens on a melody, with the second part in by about ten seconds, and has no Intro.
- **"Long notes" made it monotonous**: the prompt asked for low sound and long notes, so 17 of 28 opened on a held note or a swell. The liked captions open on a melody.
- **A measure follows it, a hint only**: the longest time between note onsets is 0.3–4.2 s in the liked clips, against 13.9–21.2 s in the takes called monotonous, broken or silent. A take that "has tension" at 14.5 s disagrees. Not built on; to set against later verdicts before it's used to flag takes.
- **Voices need the caption too**: both Heaven captions the owner couldn't hear voices in didn't name them, and the first scan was wrong about it, reading "rising" as "sing". So code now adds the choir to a caption without one, and the liked Heaven's lines to lyrics with fewer than three.
- **The model can't write tension**: told the shape, it wrote battle music; told the words, it wrote the words over a fiddle. So it only marks a Cue as danger, and that Cue takes the owner's liked caption and tags word for word (`cue-danger-*.md`), at 100 BPM in D minor. Every danger Cue then differs only by its seed.

| Run | Opens on a held sound | Course | Energy under 300 Hz | Longest gap, average | Seconds to full level |
|---|---|---|---|---|---|
| liked clips | | | 63% | 2.0 s | 4.2 |
| fourth | 17 of 28 | 23 of 28 | 59% | 8.0 s | 7.5 |
| seventh (all this) | 1 of 28 | 22 of 28 | 59% | 4.9 s | 3.8 |

### The seventh, by ear (the owner, 2026-11-09)

"All the clips now feel a little upbeat, so all felt like not what the scene is." Openings are now "near instantaneous, maybe a little too much". The tavern "too much action", or its foreground "too happy"; confinement "weird instrument choices and a weird high note at the end"; the fight "neither" and "better than s1 but not it either"; awe "warbly" and "a little dread-y"; voices heard in one take of six, faintly, "more like an instrument than a person"; the Buffet's four "ok sounding but not really the scene".

- **The push for movement overshot**: told to keep a melody moving, the captions' "slow" fell from 18 to 7, "pattern" rose from 4 to 18, "dance" or "weave" from 5 to 21. The keys and the set tempo didn't change, and neither did measured onsets a second (2.1 to 2.3, liked clips 2.7): it's in the arrangement the words ask for.
- **The fight wasn't a take the owner had liked**: its caption, tags, tempo, key and seed are the liked ones, and it matches the PC's `tense-d-60-s1` (0.997), but not the Mac's that the owner liked (0.23, 0.30 for seed 2). A seed gives another take on another machine, so "the liked caption" isn't "the liked clip", and the caption hasn't been shown to be reliable there.
- **The blind test of the gap between notes failed**: of the eight takes over 6 s, the owner called one decent, three "ok sounding" and four worse; of the ten under, one "better", six missing what was asked, and three flat-out "too much action", "neither" or "too happy". It doesn't follow the ear, so it's dropped.
- **Seven prompts in a day have swung between faults** (droning, then busy), each fix for one listening's remark. And the moments were judged from a label, without the scene they're meant to fit.

### A control, then captions from what worked

The owner listened again to clips liked before, to tell a real gap from a shifted ear: the Mac's `tavern-d-60-s1` "good"; its `tense-d-60-s1` "not so much, but good 40 sec in"; its `heaven-e-60-s1` "passable, slightly audible"; the PC's `heaven-e-60-s1` "decent, more audible". So the gap is real, the ear has moved somewhat too, and the PC isn't why voices were missing: the captions were.

So the cue writer no longer writes a caption from rules. It picks the nearest of four good ones (`intimate`, `reflective`, `sacred`, `danger`), keeps its course and production, and changes only the instruments and a few words of feeling; danger is word for word. Over 28 Cues (the eighth run): 16 intimate, 7 reflective, 3 danger, 2 sacred, no failed reply. Open: whether a story's Cues now sound too alike, and the instrument swaps aren't always sensible ("intimate hammered dulcimer folk"; a piano kept where the Score has none). By ear (the owner, 2026-11-09), the first round the scenes came out usable: the tavern "good, less upbeat, usable in the scene"; the Buffet's lightness, both seeds, "decent"; Heaven's two moments "passable" to "decent", voices heard though "not strong", "churchlike but ok", and "no awe", the rise late, near 40 s. So this is what's kept. What's left is judged in play with the scene on screen, rather than from more clips: awe, the voices' strength, how late a track's change comes, and whether a story's Cues sound too alike.

The danger shape was also picked for a wary moment and a hollow one. Its wording was narrowed to a real threat to someone's body or life, which didn't help: over two seeds, it was still picked for wary, hollow and confined moments as well as fights. Left to fix with the music job.

### Would a better writer do better freely?

The owner asked for the test (2026-11-09), since adapted captions could hold back a better Text Model: Claude wrote the same eight moments by hand, from what the cue writer sees (the Score, the reading and the line), with the bench's findings in mind, choosing its own tempos and keys ([by-hand.jsonl](by-hand.jsonl)). Two seeds each, on the PC. By ear (the owner):

- Opening, wary: "both works, slow but works, feel safe". A half-remembered tune: "weird foreground tune", "passable".
- Bolted door: the same four notes "over and over till the end", though the take where it lasts half the time is better.
- The fight: "ok I get it, but too strong or actiony" as "a transition from previous tavern ones and not standalone".
- Awe: "notes too high", "hovering on celebrative", "not really awe", no choir heard. Rising: "so so, passable", the second seed better.
- A personal ache: "fancy restaurant music, no ache". A brief lightness: "both decent".

**About level with the adapted captions, and no better**: free writing by a stronger writer hit the same walls. So the limit isn't only Gemma's: ACE-Step takes direction loosely, and awe and a heard choir haven't come reliably from anyone's words. Asked plainly for a tune, a repeated figure or a clearly heard choir, it does the first too much and not always the last. The adapted captions stay, and the rules are kept in [rules-prompt.md](rules-prompt.md) to try again with any new Text Model or music model, by ear.

**New for judging**: a Cue is heard as a change from the one before, not alone, so a fight can be right alone and too strong after the tavern. Isolated clips can't test that, which is one more reason to judge the rest in play.
