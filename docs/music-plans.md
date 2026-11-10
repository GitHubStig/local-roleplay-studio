# Plan: what's left for music

Music in a Roleplay is built: how it works is in [design/music.md](design/music.md), its terms in [CONTEXT.md](../CONTEXT.md), the decisions in [ADR 0035](adr/0035-music-from-ace-step-through-comfyui.md) and [ADR 0036](adr/0036-a-director-follows-the-story.md), and the evidence in [research/music-models.md](research/music-models.md) and the benches ([music-cues](bench/music-cues/README.md), [music-director](bench/music-director/README.md), [music-models](bench/music-models/README.md)). This is only what's left. When it's done or moved to [open-threads.md](open-threads.md), this file goes.

## Suggested order

1. Play a whole story with its pictures, and pick the moments that fit worst.
2. Work on the Score's prompt, as it feeds every Cue.
3. The end song.

## What still needs work

- **How well the music fits the story.** The main open problem. It "sounds good", but a whole story was "sort of passable" (the owner, 2026-11-09). Prompts by rules alone sounded wrong, and Claude writing freely by hand did no better, so part of the limit is ACE-Step's ([bench](bench/music-cues/README.md)). Judge it in play with the scene on screen, Cues heard after the one before, rather than from more single clips.
- **The Score's instruments.** A harbour tavern's Score has had harpsichord and viola, and a hammered dulcimer ends up in most Cues, where the owner liked fiddle, cello and squeezebox. The Score's prompt hasn't been touched since the bench.
- **Awe.** Heaven has never come out as awe, from anyone's words: "not awe", "churchlike but ok", "celebrative".
- **The `uneasy` shape.** It isn't from a clip the owner liked. Frame 8 of the hired-killer story, under `intimate`, was "less warm i guess"; the bolted door may still be better as `uneasy`.
- **How strongly danger comes in.** The fight's thriller score was "too strong or actiony" after the tavern, and its take on the PC "neither". Perhaps a track should start later, as the Mac's was "good 40 sec in".
- **A steer's limits.** "Slower" does nothing, as Cues are already at the slow tempo; a steered Cue can't have the danger score; and a shape's course stays.
- **A choir under a spoken line.** Not yet heard together. If it's a problem: lower the music further under a line when the Cue has voices, or have the cue writer avoid them while lines are spoken.

## Not built

## End credits song (the owner's idea, 2026-11-06)

A song for the end of a story, the way a film ends, usually with vocals. A Roleplay lasts until deleted, but its story can end: the Persona or the Character dies, or the player wraps it up. The player can **trigger the song** (a button, pressed at any point and again later; it ends nothing), and the page plays it. Only the song: no credits roll with names or pictures, and nothing shown in time with its lines (corrected by the owner, 2026-11-08, after the plan had grown both). With the story in hand, the Text Model writes the lyrics (checked against the Limits like any text), in the Score's identity.

**What the song is about** (the owner, 2026-11-08): mostly the ending, not the whole story. A Roleplay's start and middle are often the player trying all sorts of things, inconsistent and not meant to add up; when a player wraps a story up, it's the ending they've built towards that matters. So the lyrics draw on the last stretch (where Score the Roleplay's last chunk begins, or the last few turns of its course); earlier parts at most as a passing memory. How far back to reach may be the player's to set when triggering it ("from Frame 40"), as it differs by player.

Suggestions from the plan, not asked for by the owner, to raise when this is built: the Director noticing an ending (a decision of its own) and offering the song, rather than playing it, as a death can be undone two Messages later; and the lyrics working in a few of the lines that mattered, which each transition's note already quotes.

Whether the song has vocals is a choice of its own, as nothing is spoken over it. The bench's song was "decent, believable" on ACE-Step, and a song on the Mac takes about 7 minutes, on the PC about 40 s, so it holds up Replies on one machine as a Cue's track does ([ADR 0035](adr/0035-music-from-ace-step-through-comfyui.md)).

### Reminiscing: music following the scroll

The owner's idea (2026-11-09): when a Roleplay is finished and the player is only reading it back, with all its music already made, the Frame in view is selected once scrolling has stopped for a second or so, without a click, so the music follows as selecting a Frame already makes it. Not while playing: not knowing where the music is felt immersive. VueUse's `useIntersectionObserver`, debounced. How it knows the story is finished is open: a mode the player turns on, perhaps.

### Music for Storyboards

Worth keeping (the owner, 2026-11-09). A scoring pass over the plan suits them, as their Beats are known up front; a Chain has no story to follow. The prompts and code sit in the Roleplay's part for now: what doesn't read a Roleplay (the cue writer, the Behaviour prompts, the Cue types) moves to a shared `music/` part when this is built.

### Stingers: undecided

Score the Roleplay can already mark a stinger on a Frame, in its prompt and its data, and the Music tab shows it as text, but nothing makes a sound. To decide: whether ACE-Step can make a short, exact hit at all, which hasn't been tried. If not, take them out of the prompt and the data.

## Housekeeping

- **On the PC itself:** the player, the music job and the steer box haven't been run with the app's server and browser on Windows, only its ComfyUI from the Mac.
