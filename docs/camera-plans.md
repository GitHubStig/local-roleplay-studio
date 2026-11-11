# Camera plans

A plan in stages for how the player sets the camera: the angle, the shot type and what the picture is of. Updated as it goes; when done, its findings move into `docs/research/`, the design pages and an ADR, and this file is deleted. Asked for by the owner, 2026-11-11. What was measured is in [the camera bench](bench/camera/README.md).

## The question

When the player asks for a camera angle, a shot type or a target ("low angle, close-up on her face"), the picture should change only in its camera: the same people, in the same poses, in the same place.

## What's been found (2026-11-11)

- **Through a Chain's prompt, a re-render can't do it.** Today's Chain turns angles and shot types into the camera sentence alone, but a close-up on someone cuts everything out of frame from the prompt, which is all a Chain remembers, so it's lost for good. Keeping the scene whole doesn't help: with everything else described, no Image Model (Qwen-Image 2.1, Krea 2, MOSS-Image) moved the camera at all. And a re-render draws the people and the place afresh anyway.
- **An edit of the picture can.** Qwen-Image 2.1 Turbo Edit on the PC (16 s), told the move, kept the people, their clothes and the room, and moved the camera: low and high angles, overhead, close-ups on a face, hands or boots, over the shoulder. Qwen-Image 2.1 Edit did the same in 25 s; FLUX.3 Klein edit nearly as well; FIBO 2.0 Edit Turbo worst. (Qwen's edits on ComfyUI were grainy until fixed on 2026-11-11, `cb4d8c4`.)
- **Each kind of move needs its own wording.** A close-up works told what the result shows, and fails with a clause keeping everything (the model keeps everyone in frame); over the shoulder needs that clause (or the edit models draw the man twice). The player's own short words work for some moves and not others ("Over the man's shoulder." changed nothing).
- **Every move starts from the original picture.** An edit of an edit drifts and turns grainy, and a close-up can't be undone by another edit: what it left out is gone.
- **Weak for now, kept for better models** (the owner, 2026-11-11): a Dutch angle only leans a little; overhead moves a seated person to the floor. Both stay as choices, in words, for a future edit model to do better; no rotating the picture in code.

## Decided

- **A camera move is an Edit of the picture** (the owner, 2026-11-11: better as an edit anyway), not a Chain Action. The Chain's prompt needn't change for it.

## Next

1. **Check wider before building** (PC, Turbo Edit): a second picture (one person, portrait-shaped) and a second seed, so the wording isn't tuned to one picture.
2. **A camera picker in the Edit dialog** (an idea, to discuss): pick an angle, a shot type and a target, and the app writes the wording the bench found works for that kind of move, always from the original picture. No Text Model call. Open: the choices and their wording, how a target names a person (the edit model doesn't know names), whether a typed edit can still ask for a camera, and what a Chain shows after (its Image Prompt no longer describes the picture).
3. **In a Roleplay**: a camera direction after a Message ("*sits down* — low angle, close-up on her face") becoming the same edit of the Frame's picture, rather than reaching the Art Agent or the Character. To discuss after 2.

## Where things go

The bench in `docs/bench/camera/` (`README.md`, `run.ts`, `scene.ts`, `grid.py`, the grids); the findings, dated, in `docs/research/image-models.md` (which edit model follows what); what's decided in an ADR.
