# Idle animation: blink, lamp light and flame (2026-10-06)

Demos behind "Idle animation between Frames", the thread below (moved here from open-threads.md on 2026-10-29), on
Frame 9 of the Kael tavern Roleplay (Qwen-Image 2.1, from [reference-portraits](../reference-portraits/README.md)).

- **[index.html](index.html)**, the picture: open it straight from disk.
- **[3d/index.html](3d/index.html)**, the same in SHARP's 2.5D scene: serve the folder (a page
  opened from disk can't load the scene), e.g. `python3 -m http.server -d docs/bench/idle-animation`
  then `/3d/`. [3d/build.py](3d/build.py) rebuilds its meshes from the pictures here.

## What's in them

- **Blink.** Elara's eyes edited half closed and closed (`mflux-generate-qwen-2.1-edit` with a
  hand-drawn mask over her eyes), pasted into the same picture, shown half, closed, half (~160 ms),
  every 2–6 s. The auto-mask (`--auto-mask "her eyes"`) found too small a region, or one eye, and
  left them open; "blink" isn't a state a picture model can draw, "eyelids fully closed" is.
  Kael's "closed" came out blank-eyed, a visible failure that would need catching.
- **Lamp light.** *Flat glow*: a warm radial glow on the lantern and the wall candle, wavering on
  calm layered noise. *Depth glow*: the same falling off with distance in 3D from SHARP's depth and
  facing the flame. *Painted*: the picture faded with an edit of the lantern flaring up (a mask
  around the lantern and what it lights), which lights the wall and Elara's shoulder.
- **Flame.** *Wobble*: the flame's own pixels swayed row by row in the browser, the tip most.
  *Painted shapes*: three edits of just the flame (a face crop upscaled, a tight mask), faded
  between.
- **In 3D:** the glow as a light in the room (a Spark `SplatEdit` sphere adding warm colour at the
  lantern's and candle's 3D positions), the painted light and the blink as small meshes on the
  same splats faded between the picture's colours and the edits' (SHARP's splats come in the same
  order for every picture, so the edits' colours map one to one), and the wobble as a small
  `displace` sphere at the flame. Sways ±8°, or turns ±15°.

## What the owner thought

- **Blink:** half-closed then closed, or a crossfade, look great and can't be told apart; a
  flashed "closed" alone is too cartoony.
- **Lamp light:** flat glow, *calm*, is the default without SHARP. Depth glow is too much in the
  tavern (the room pumps, random patches catch light: tuning, mostly the brightened mid-tones and
  noisy depth-derived surface directions), maybe for a bright outdoor scene. **Painted light is
  the standout**, her shoulder lighting up; the room dimming with the flame couldn't be seen with
  calm on.
- **Flame:** the 2D wobble looks good; painted shapes change too much (and draw crisp flames in a
  soft painting). In 3D the wobble isn't visible (the flame is a soft blur of a few splats).
- **3D:** "looks amazing": glow, painted light and blink all hold as the scene turns.

## Costs, for the app

Painted light: an edit per lamp (~2 min at 1024², the 33 GB full weights). Blink: two edits per
person (half, closed), ~4 min, plus an eye mask the app must place reliably (a face-landmark
detector; the auto-mask won't do). Glow and wobble: free, but the app must know where the lamps
and flames are (a brightness search also found the white towels). 3D: one SHARP run per edited
picture (~11 s) on top of the Frame's scene.

## The thread, as it stood (moved from open-threads.md, 2026-10-29)

Closed by the owner on 2026-10-29: true image-to-video is built, as a clip of the Frame's picture, the Idle Loop ([ADR 0025](../../adr/0025-clips-by-kind.md)), so the cheaper ways of keeping a picture alive below aren't being pursued. Kept for what was tried.

**Idle animation between Frames.** Keep the image alive while the player is thinking: flickering candles, drifting haze, the Subject blinking or shifting her weight, with the Image Prompt itself unchanged. Idle work must never block a Frame: it runs only after a commit, and is cancelled the moment the player sends an Action, since it competes for the same GPU and memory. Options, cheapest first:
  1. *Browser-only effects.* A slow pan and zoom over the still, plus ambient overlays picked from Image Prompt keywords (haze gives drifting fog, candles give a warm flicker, a rim light gives a soft pulse). Instant, and no extra rendering. Effects can't know *where* the candles are, so they stay generic.
  2. *Subject mask plus layered effects.* Cut the Subject out of the finished image with a background-removal model (mflux lists `fibo-edit-rmbg`; not downloaded yet, unverified), then animate only the background layer (fog, flicker, slight parallax) behind her. Better than rendering the background and Subject separately and compositing: separate renders don't share lighting, shadows or perspective, so the Subject looks pasted on.
  3. *Idle variant frames via image editing.* After commit, edit the Frame's image into a few near-identical frames ("eyes closed", "weight on the other foot", "candle flames taller") and crossfade or flash between them; a 150 ms eyes-closed frame every few seconds reads as a blink. Instruction-based editors in mflux 0.20: `mflux-generate-flux2-edit` (FLUX.2 Klein; weights already cached, likely ~15 s per frame), `mflux-generate-qwen-edit` (Qwen Image Edit, ~20B, not downloaded, much slower), `mflux-generate-kontext`, and `mflux-generate-fibo-edit`, which takes a `--mask-path` to edit only the background. The engine, not the player, writes these edit instructions, from a fixed list, so they stay within the Shoot Brief. *Revisited 2026-10-06 for mflux 0.21:* `mflux-generate-qwen-2.1-edit --auto-mask "his eyes"` finds a region from a description (its Qwen3-VL) and repaints only that ("his eyes closed"); pasting just that region back onto the original through a feathered mask keeps every other pixel exact (a whole-picture edit re-encodes it, and the swap would shimmer). Good for brief swaps (a blink, a flicker, a glance); not for motion (two poses crossfaded double-expose, so options 1 and 2 stay better for that). Each variant is a full edit render (unmeasured, likely a minute or more at 1024²) on the full Qwen-Image 2.1 weights (33 GB; the saved 8-bit copy can't edit), and renders unload the Text Model first, so variants made while the player types would make the next Reply reload it: make them after a pause, or when the picture viewer opens. *Tried 2026-10-06* ([bench/reference-portraits](bench/reference-portraits/README.md)): the composite works (99.75% of pixels byte-identical, only a box around the eyes touched), but the blink didn't (Elara's eyes stayed open; 0.01% of pixels moved). Retried the same day with demos ([bench/idle-animation](bench/idle-animation/README.md), in 2D and in SHARP's 3D): a hand-drawn eye mask and "eyelids fully closed" (not "blink") work; shown half, closed, half, the blink looks natural, and so does a crossfade, but a flashed "closed" alone is cartoony. The owner's picks: a calm flat glow on the lamps by default; **the painted light (an edit of the lamp flaring, faded in and out) is the standout**; a 2D flame wobble; depth glow too much indoors; painted flame shapes too much. All of it held up in 3D (glow as a light in the room, the edits as colour fades on the same splats), apart from the wobble there. For the app, the open problems are finding the lamps, flames and eyes reliably (the auto-mask and a brightness search both miss), and the edits' cost: ~2 min per lamp, ~4 min per person's blink.
  4. *True image-to-video* (a 2–4 s loop from the still): built as a clip, an Idle Loop, on a ComfyUI with LTX 2.5 (2026-10-29, ADR 0025). It's made on request, not while the player thinks, and isn't shown on its own between Frames; doing that is what's left of this thread.
