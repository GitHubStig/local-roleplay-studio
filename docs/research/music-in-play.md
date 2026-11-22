# Music in play: what's left

What playing with music has shown, and what was planned and not built, kept for when music is worked on again (2026-11-22). How music works now is in [design/music.md](../design/music.md); the models in [music-models.md](music-models.md), the Music Director in [music-director.md](music-director.md). The short list is in [open-threads.md](../open-threads.md).

## What still fits badly

Where to start, in this order:

1. **Play a whole story with its pictures, and list the moments where the music fits worst.** So far the music has mostly been judged a clip at a time, on the bench, where each sounded fine on its own. Judged as a whole, a story came out only "sort of passable" (2026-11-09), and that doesn't say which Cues are wrong or why. Playing one Roleplay through, with Pictures and Music on, hearing each Cue after the one before with its scene on screen, gives a list of Frames to fix, and shows whether the trouble is the Director (the music changing in the wrong place), the cue writer (the right moment, the wrong mood) or ACE-Step (the right caption, the wrong sound).
2. **Rework the Score's prompt.** The **Score** is a Roleplay's musical identity (its genre, instruments and mood), written once by Score the Roleplay, and every Cue's caption is built from it. So what's wrong in the Score is wrong in every Cue: the tavern's hammered dulcimer, say, which turns up in most Cues where the owner liked fiddle, cello and squeezebox. Fixing that one prompt fixes them all, so it comes before any single Cue's wording. It hasn't been changed since the bench.

- **How well the music fits the story.** The main open problem. It "sounds good", but a whole story was "sort of passable" (the owner, 2026-11-09). Prompts by rules alone sounded wrong, and Claude writing freely by hand did no better, so part of the limit is ACE-Step's ([bench](../bench/music-cues/README.md)). Judge it in play with the scene on screen, Cues heard after the one before, rather than from more single clips.
- **The Score's instruments.** A harbour tavern's Score has had harpsichord and viola, and a hammered dulcimer ends up in most Cues, where the owner liked fiddle, cello and squeezebox. The Score's prompt hasn't been touched since the bench.
- **Awe.** Heaven has never come out as awe, from anyone's words: "not awe", "churchlike but ok", "celebrative".
- **The `uneasy` shape.** It isn't from a clip the owner liked. Frame 8 of the hired-killer story, under `intimate`, was "less warm i guess"; the bolted door may still be better as `uneasy`.
- **How strongly danger comes in.** The fight's thriller score was "too strong or actiony" after the tavern, and its take on the PC "neither". Perhaps a track should start later, as the Mac's was "good 40 sec in".
- **A steer's limits.** "Slower" does nothing, as Cues are already at the slow tempo; a steered Cue can't have the danger score; and a shape's course stays.
- **A choir under a spoken line.** Not yet heard together. If it's a problem: lower the music further under a line when the Cue has voices, or have the cue writer avoid them while lines are spoken.
- **On the PC itself:** the player, the music job and the steer box haven't been run with the app's server and browser on Windows, only its ComfyUI from the Mac.

## End credits song

The owner's idea (2026-11-06): a song for the end of a story, the way a film ends, usually with vocals. A Roleplay lasts until deleted, but its story can end: the Persona or the Character dies, or the player wraps it up. The player can **trigger the song** (a button, pressed at any point and again later; it ends nothing), and the page plays it. Only the song: no credits roll with names or pictures, and nothing shown in time with its lines (corrected by the owner, 2026-11-08). With the story in hand, the Text Model writes the lyrics (checked against the Limits like any text), in the Score's identity.

**What the song is about** (the owner, 2026-11-08): mostly the ending, not the whole story. A Roleplay's start and middle are often the player trying all sorts of things, inconsistent and not meant to add up; when a player wraps a story up, it's the ending they've built towards that matters. So the lyrics draw on the last stretch (where Score the Roleplay's last chunk begins, or the last few turns of its course); earlier parts at most as a passing memory. How far back to reach may be the player's to set when triggering it ("from Frame 40"), as it differs by player.

Suggestions from the plan, not asked for by the owner, to raise when this is built: the Director noticing an ending (a decision of its own) and offering the song, rather than playing it, as a death can be undone two Messages later; and the lyrics working in a few of the lines that mattered, which each transition's note already quotes.

Whether the song has vocals is a choice of its own, as nothing is spoken over it. The bench's song was "decent, believable" on ACE-Step, and a song on the Mac takes about 7 minutes, on the PC about 40 s, so it holds up Replies on one machine as a Cue's track does ([ADR 0035](../adr/0035-music-from-ace-step-through-comfyui.md)).

## Music for Storyboards

Worth keeping (the owner, 2026-11-09). A Chain has no story to follow, but a Storyboard has a start and an end set before it's made, unlike a Roleplay. The owner's first idea of a Storyboard (2026-11-22) is something like a 30-second ad or a music video, so its music may not be Cues at all: for one under 30 or 60 seconds, a single continuous tune or song over the whole of it, or Cues so short they're really one piece. Which it is is open.

The prompts and code sit in the Roleplay's part for now (`server/roleplay/music/`, `server/prompts/roleplay/music/`): what doesn't read a Roleplay (the cue writer, the Behaviour prompts, the Cue types) moves to a shared `music/` part when this is built.
