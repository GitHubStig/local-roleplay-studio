# Idle animation: blink, lamp light and flame (2026-10-06)

Demos behind "Idle animation between Frames" in [open-threads.md](../../open-threads.md), on
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
