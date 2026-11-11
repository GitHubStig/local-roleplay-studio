---
status: accepted
---

# The camera is moved by an edit of the picture, not by the Image Prompt

The owner wanted to ask for a camera angle, a shot type or a target ("low angle", "close-up on her face", "over his shoulder") and get the same people, in the same poses, in the same place, with only the camera changed, in a Chain and later in a Roleplay. Since 2026-11-11 that's an **edit of the picture** (ADR 0021): the Edit dialog's Camera list writes a move into the edit's instruction (`web/src/cameraMoves.ts`), for the player to change before sending. What was measured is in [the camera bench](../bench/camera/README.md).

- **Not through the Image Prompt.** A Chain turns "low angle" into its camera sentence alone, but "close-up on her face" made the Text Model cut everything out of frame from the prompt (the outfits in 46 of 56 runs), and a Chain remembers only its prompt, so it's lost for good. Keeping the scene whole doesn't help: with the rest described, none of Qwen-Image 2.1, Krea 2 or MOSS-Image moved the camera at all. And a re-render draws the people and the place again anyway.
- **An edit keeps what's there.** Qwen-Image 2.1 Turbo Edit on the PC (16 s) moved the camera and kept the people, their clothes and poses, and the room, on two scenes, two seeds and two clothed intimate poses. Qwen-Image 2.1 Edit did the same in 25 s, FLUX.3 Klein edit nearly as well, FIBO 2.0 Edit Turbo worst. (On ComfyUI, Qwen's edits had first to be fixed to work at a 1024² budget: [image-models.md](../research/image-models.md).)
- **Each kind of move has its own wording.** A close-up says what the result shows ("A close-up of the woman's face, filling the picture, …"): a clause keeping everything made the model keep everyone in frame. An angle or a viewpoint is the move and one line, "Keep everything else exactly as in the image.": without it, over the shoulder drew the man twice. The player's own short words worked for some moves and not others ("Over the man's shoulder." changed nothing), so the list writes the wording and the player edits it.
- **No names.** The wording speaks of "the woman", "the man", "her", "him", as an edit model, like an image-to-video one, knows no names; "the woman" is there for the player to change.
- **The moves offered**: low, high and overhead angles; close-ups on a face, eyes, hands, legs or feet; over the shoulder, from behind. Overhead is weak today (a steep high angle, or a seated person moved to the floor) and kept for better edit models (the owner).
- **A camera move is an edit like any other**: a version beside the Original, made from that edit model's newest (ADR 0021, unchanged), so moves stack, and the Image Prompt stays as it was: a Chain's next Frame is rendered from its prompt, with its camera.

## Considered Options

- **A camera Action in a Chain, the Text Model rewriting the camera sentence.** Kept as it is for angles (it changes only that sentence), but it can't give a close-up without losing the rest of the story, and no re-render keeps the picture.
- **The camera sentence first in the prompt**, as models weigh the start most. Not tried once edits worked: it would mean changing the nine aspects' order (ADR 0005) for a re-render that still draws everything again.
- **Remembering the whole scene and rendering a cut-down prompt.** Two prompts per Frame against ADR 0005, and still a re-render.
- **Three dropdowns, an angle, a shot and a target, combined freely.** Combinations weren't benched, and each kind of move needs its own wording; one list of tested moves, editable, instead.
- **Camera moves always from the Original**, branching from ADR 0021's straight line, to try several angles of one picture. Not expected (the owner): a couple of edits at most, and degradation over them doesn't matter.
- **A camera direction written with a Roleplay's Message, made into the edit automatically.** Scrapped (the owner, 2026-11-11): the Camera list already works on a Roleplay's pictures, and a direction in the Message would have to be kept from the Character.
- **Rotating the picture in code for a Dutch angle** (a roll is the picture rotated). Not wanted; the Dutch angle is left out of the list, as no one needs it (the owner); the edit models only leaned the walls a little.
- **A LoRA for camera moves** (Multiple-Angles for Qwen-Image-Edit 2511). An older edit model the app doesn't run; not needed once the plain edit worked.

## Consequences

- **A close-up can't be undone by another edit**: what it left out is gone, so going back is the Original, or deleting the close-up.
- **What the picture shows can differ from its prompt by the camera**, as by any edit (ADR 0021): a Chain's next Frame comes back to the prompt's camera.
- **The wording was benched on ComfyUI, and its three hardest moves checked on mflux** (over the shoulder, a face's close-up, a low angle, on the Mac's Turbo Edit, 47 s each, 2026-11-11): the same pictures as on the PC.
- **Some moves don't work as worded yet**: the waist up (it took the other person out), a wider shot, POV. Anyone can still type them; they're left out of the list until an edit model does them.
