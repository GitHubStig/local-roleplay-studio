---
status: accepted
---

# Music from ACE-Step through ComfyUI

A Roleplay's music (docs/music-plans.md) needs a model that turns a Cue into a track. Two were benched on the Mac (2026-11-07 and -08, [research/music-models.md](../research/music-models.md)): MiniMax Music 3 through mlx-audio, and ACE-Step 1.5 through ComfyUI. Decided with the owner, by ear:

- **ACE-Step 1.5 makes the music, through ComfyUI**, on whichever machine runs ComfyUI, as pictures and clips can: the XL turbo (4B) with its 4B planner, one setup on both machines, about 170 s for a minute of music on the Mac and 20 s on the PC, with no quicker setting. It's the one that gives the length asked, follows the key and tempo, and fits the scenes; ComfyUI runs it on both machines (Metal and CUDA) with its own nodes, so there's no new service, and its client is the one pictures and voices already share (`server/comfyui/`).
- **The Text Model adapts a good caption to the moment**, rather than writing one or a code template filling in tags: it picks the nearest of four captions the owner found good (intimate, reflective, sacred, danger), keeps its course and production, and changes the instruments and a few words of feeling. Danger is used word for word. This replaced the first decision here, that it writes the caption by the bench's rules: seven prompts on the rules alone, on 2026-11-09, swung between droning and busy by ear, and the owner's own captions still beat them when listened to again ([bench](../bench/music-cues/README.md)). The rules stand behind the four captions (what's heard, not the subtext; a course over the track with section tags following it; voices given lines to sing; no negations). Other captions can join as they prove good.
- **Cues are related by text**, not by audio: the Score's genre, instruments and production in every caption. A cover from the Cue playing (ACE-Step's reference audio) didn't keep its sound by ear.
- **A Cue is rendered at the length it needs and looped** by the player, its fade-out cut and a 3 s crossfade into its start. Extending isn't possible through ComfyUI's nodes, and isn't needed.
- **The player picks between takes**: the seed matters as much as the caption, and no measure (CLAP, or how much a clip develops) picks the better take; measures may only flag a take's particular failures.

## Considered Options

- **MiniMax Music 3 through mlx-audio** (the Mac's runtime already, for voices). Its length is the model's, 14–43 s for an instrumental whatever is asked; voices come in where none were asked; 4–5 s of rendering a second of music. By ear "much better" in its own prompt format than the bench's first captions, but not enough. Its builds were deleted.
- **ACE-Step's own repo** (PyTorch, as a Python service like the voice service). It has repaint and cover strength, which ComfyUI doesn't take; but it's another service and another copy of the weights, and ComfyUI's nodes do what the app needs.
- **Variations by audio** (each Cue a cover of the one before). Quick (29 s, as the planner doesn't run), but by ear "totally different" when the caption changes.
- **Extending a Cue** by repaint instead of looping. Not exposed by ComfyUI; ACE-Step renders 3 minutes directly, and the loop sounds fine.
- **A quicker setting on the Mac**: the 1.7B planner, about 80 s a minute, or the 2B turbo. By ear "usable but not great" for Cues, and it saves only 5 s on the PC. Quality matters as much as speed (the owner, 2026-11-09), so both were deleted on both machines. Their measurements stay in the research and the bench.

## Consequences

- A music job is heavy: ComfyUI keeps ~21 GB loaded and reaches 26–34 GB on the Mac, so it unloads the Text Model first, as a render does (ADR 0013), takes its turn with the machine's other jobs (ADR 0020), and frees ComfyUI after.
- On one machine, music holds up the story: a Reply arriving during a track waits for it, up to about 3.5 minutes on the Mac (2026-11-09, [research/music-models.md](../research/music-models.md#music-on-the-macs-own-comfyui-through-the-app-2026-11-09-mac)). Left so, with a warning in Settings: cancelling the track for each Message could mean none ever finishes. Music is best sent to another machine.
- The XL with its 4B planner fits the PC's 12 GB card and 16 GB of RAM, and runs about nine times the Mac's speed, about 20 s for a minute of music; ComfyUI frees it at once when asked, so no fallback is needed there (2026-11-09, [research/music-models.md](../research/music-models.md#on-the-pc-2026-11-09-windows-pc)).
- The plan's stage 3 builds the `MusicGenerator` on this, with no quicker setting to choose. A story's Cues may sound too alike, with so few captions: to judge in play.
- Adapting captions is a workaround, to check again whenever the Text Model or the music model changes: try the rules (docs/bench/music-cues/rules-prompt.md) on the new one, judged by ear, and drop the captions if it writes better freely, so it isn't held back. Claude writing freely by hand did no better on ACE-Step (2026-11-09), so it may be the music model's limit too. A new music model starts on its own captions. It keeps an adapter per model, for other models that may be tried later (docs/open-threads.md).
