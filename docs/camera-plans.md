# Camera plans

A plan in stages for how the player sets the camera: the angle, the shot type and what the picture is of. Updated as it goes; when done, its findings move into `docs/research/`, the design pages and an ADR, and this file is deleted. Asked for by the owner, 2026-11-11. What was measured is in [the camera bench](bench/camera/README.md).

## The question

When the player asks for a camera angle, a shot type or a target ("low angle, close-up on her face"), the picture should change only in its camera: the same people, in the same poses, in the same place.

## What's been found (2026-11-11)

- **Through a Chain's prompt, a re-render can't do it.** Today's Chain turns angles and shot types into the camera sentence alone, but a close-up on someone cuts everything out of frame from the prompt, which is all a Chain remembers, so it's lost for good. Keeping the scene whole doesn't help: with everything else described, no Image Model (Qwen-Image 2.1, Krea 2, MOSS-Image) moved the camera at all. And a re-render draws the people and the place afresh anyway.
- **An edit of the picture can.** Qwen-Image 2.1 Turbo Edit on the PC (16 s), told the move, kept the people, their clothes and the room, and moved the camera: low and high angles, overhead, close-ups on a face, hands or boots, over the shoulder. Qwen-Image 2.1 Edit did the same in 25 s; FLUX.3 Klein edit nearly as well; FIBO 2.0 Edit Turbo worst. (Qwen's edits on ComfyUI were grainy until fixed on 2026-11-11, `cb4d8c4`.)
- **Each kind of move needs its own wording.** A close-up works told what the result shows, and fails with a clause keeping everything (the model keeps everyone in frame); over the shoulder needs that clause (or the edit models draw the man twice). The player's own short words work for some moves and not others ("Over the man's shoulder." changed nothing).
- **A close-up can't be undone by another edit**: what it left out is gone. An edit of an edit drifted once and turned grainy.
- **Weak for now, kept for better models** (the owner, 2026-11-11): a Dutch angle only leans a little; overhead moves a seated person to the floor. Both stay as choices, in words, for a future edit model to do better; no rotating the picture in code.

## Decided

- **A camera move is an Edit of the picture** (the owner, 2026-11-11: better as an edit anyway), not a Chain Action. The Chain's prompt needn't change for it.
- **A camera picker in the Edit dialog fills the edit's text box** with the wording the bench found works for the move picked, which the player can change before sending (the owner, 2026-11-11). The box stays free text, so a typed edit can still ask for any camera.
- **The moves**: Angle: low, high, overhead (weak today, kept for better models). Close-up: face, eyes, hands, legs, feet. Viewpoint: over the shoulder (two people), from behind. Left out: the Dutch angle (no one needs it, the owner), and the waist up, a wider shot and POV, which didn't work as worded (README, six moves not tried before).
- **No names**: the wording speaks of "the woman", "the man", "her", "him", as an image-to-video prompt does, with "the woman" filled in as an example for the player to change.
- **A camera move is an edit like any other** (ADR 0021, unchanged; the owner, 2026-11-11): made from that edit model's newest version (the Original for its first), so moves stack, and starting over means deleting the last or using another edit model, as several angles of one picture aren't expected. Degradation from a couple of edits doesn't matter (the owner). The Frame's Image Prompt stays as it was, so a Chain's next Frame is rendered from its prompt, with its camera.

## Next

1. **The camera picker**: built (2026-11-11), the Camera list in the Edit dialog (`web/src/cameraMoves.ts`). Its wording was benched on the PC's ComfyUI only: check it on mflux's Turbo Edit, the Mac's default, when a picture is edited there.
2. **In a Roleplay**: a camera direction after a Message ("*sits down* — low angle, close-up on her face") becoming the same edit of the Frame's picture, rather than reaching the Art Agent or the Character. To discuss after 1.

## Where things go

The bench in `docs/bench/camera/` (`README.md`, `run.ts`, `scene.ts`, `grid.py`, the grids); the findings, dated, in `docs/research/image-models.md` (which edit model follows what); what's decided in an ADR.
