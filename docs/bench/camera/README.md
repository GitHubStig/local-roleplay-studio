# The camera bench

How the camera can be moved (an angle, a shot type, a target) with the people, poses and place kept: first through a Chain's Image Prompt and a re-render, which can't, then as an edit of the picture, which can, and in what wording. What was decided from it is [ADR 0038](../../adr/0038-the-camera-is-moved-by-an-edit.md).

- `scene.ts`: the scene, a small bedroom with two people (Ana packing a suitcase on the bed, Tom leaning in the doorway), written by hand as a Chain's nine sentences; the Actions; and two sequences of Actions.
- `run.ts`: `deno run -A docs/bench/camera/run.ts text 1-8` sends each Action through the Chain's own call (`server/prompts/chain/frame.md`, as checked out) on the Settings' Text Model, one call per Action and seed, and writes every reply to `out/` (not committed).

## Stage 1: the Chain as it is, with camera Actions (2026-11-11, Mac)

Gemma 4 26B-A4B Heretic (`gemma-4-26b-heretic:nvfp4`, Thinking off), Limits off, seeds 1–8: 30 Actions on the scene, and two sequences of three. 288 calls, none failed or ran away, every one "done"; 5.7 s median, 9 s at most.

| Actions | Only the camera sentence changed | What else changed |
|---|---|---|
| Angles: low, high, Dutch, bird's-eye, overhead, worm's-eye | 48 of 48 | nothing |
| Wide shot, medium shot, zoom out, over the shoulder, from above full body, from the window, the camera in the doorway | 52 of 56 | the pose sentence now and then, to say what's in frame |
| Targets that keep both people in view: Tom from the waist down, Ana's legs | 16 of 16 | nothing |
| Close-up, extreme close-up, zoom in | 11 of 24 | the clothing cut to what's in frame in 10 |
| POV, over Tom's shoulder at Ana, Tom from behind | 2 of 24 | the pose sentence, to say what's in frame (Tom's shoulder in the foreground, his hands at the edges): what those shots need |
| A close-up or a body part as the target: Ana's face, her hands, Tom's boots, Ana from the waist up, Tom's chest, a low-angle close-up on Tom's face, Tom laughs with a close-up on his face | 1 of 56 | **what's out of frame cut from the prompt**: outfits cut in 46 (Ana's to "a mustard-yellow knit sweater", Tom's gone), the room rewritten as the backdrop in 8 (Tom laughing changes his expression too, as asked) |
| "Dutch angle, medium shot of Ana" | 1 of 8 | **Tom taken out of the picture** in 7 of 8: the subject, pose, room and colour sentences rewritten without him |

The sequences:

- **A camera stays until told otherwise**: a low angle was kept when Tom then walked over and sat beside Ana, 8 of 8; Ana's close-up was kept when she stood up 5 of 8 (the other three widened to a medium shot to show her standing).
- **What a close-up cut doesn't come back**: after "Close-up on Ana's face", "Ana stands up" and "Back to the full shot of both of them", the clothing was as at the start in 2 of 8; in the rest Ana wears only her sweater and Tom "a green shirt", or nothing is said of him. The Image Prompt is all a Chain remembers (ADR 0005), so a close-up loses the rest of the picture for good.

So angles and shot types need nothing from the Chain's prompt. What fails is a close-up on someone, or a part of them: the Text Model takes "the picture is of her face" to mean the prompt should describe only her face, as `frame.md` asks each sentence to describe the picture. Whether it should keep the whole scene and put the target in the camera sentence alone depends on whether the Image Models still frame the target with everything else described: Stage 2's question.

## Stage 2, first slice: a close-up with the scene kept whole or cut down (2026-11-11, PC's ComfyUI, sent from the Mac)

The 8 close-up Actions above, each rendered two ways with the same camera sentence (seed 1's reply) and render seed 42: **trimmed**, the Text Model's reply as the Chain keeps it today; and **whole**, the scene's nine sentences with only the camera sentence swapped for that reply's. Plus the scene itself as a baseline. Qwen-Image 2.1 (25 steps), Krea 2 (8) and MOSS-Image (25) on ComfyUI 0.45.2 on the Windows PC, 51 renders, 18–25 s each. The sheets are `grids/targets-<model>.jpg` (`uv run --with pillow docs/bench/camera/grid.py`).

- **With the scene whole, no model moved the camera at all**: all 24 renders are the baseline's full shot of both people across the room, whatever the camera sentence said ("an extreme close-up shot, macro lens, focusing solely on the hands"). Eight other sentences describing both people head to toe and the whole room outweigh one sentence about the framing, fourth of nine.
- **Trimmed, every model came closer, but rarely as close as asked**: her hands were a true close-up on all three; Tom laughing was a close-up on MOSS-Image and nearly on Qwen; the rest came out as medium shots, the named person nearer the camera and the other still there behind (Ana's face; Tom's chest; the low-angle close-up on Tom's face). Tom's boots were a full shot of him on Qwen-Image and MOSS-Image, his legs cut off at the waist on Krea 2. The Dutch angle tilted on none.
- Qwen-Image 2.1 gave Tom Ana's braid in four of the trimmed renders.

So cutting the scene down to what's in frame isn't the Text Model's mistake: it's what makes the Image Models frame closer at all. The trouble is that the Chain keeps that cut-down prompt as all it remembers.

## Stage 3, first look: Qwen-Image 2.1 Edit on the whole picture (2026-11-11)

A camera move as an edit of Qwen-Image 2.1's baseline render (1216×832), with nothing painted, seed 42: `run.ts edits` and `run.ts editcheck`, kept in `out/edits/` and `out/editcheck/`.

- **On the PC's ComfyUI (0.45.2), every whole-picture edit came out noisy**: the walls, ceiling and floor over-sharpened into a grainy texture, a mean change of 23–29 from the baseline even where nothing was asked. The same with the app's workflow, without its int8 attention, and at 40 steps rather than 25 (22–36 s each), so neither causes it. The instruction does reach the model: "make the man's flannel shirt bright red" made it red; but three camera moves (low, high, overhead) gave nearly the same picture (a mean change of 0.7–1.2 between them), the camera not moved.
- **On the Mac's mflux (0.24.0, `--quantize 8 --low-ram`), the same edits came out clean**, in 177 s each: the shirt red and the rest as it was (a mean change of 9.6, most of it the shirt); and the low angle moved the camera down, the floor larger and the ceiling higher, the two people, their poses and the room the same.

So the edit route may work, on mflux at least; the ComfyUI workflow has a fault of its own, which masked edits hide, as only the painted area is kept (the earlier note that Qwen's repainted hand came out "brighter and more sharply textured" than the painting around it, in docs/research/image-models.md, may be the same thing).

**What's wrong on ComfyUI** (2026-11-11, the same baseline and seed, `run.ts editcheck2`): the canvas's size. The app's workflows give `TextEncodeQwenImage21` a `resolution` of 0 (the reference at its own size, as ComfyUI's template starts), so the sampler's canvas is the picture's 1216×832; at 1024 (a 1024² pixel budget, as the app's text-to-image workflows use) it's 1248×832, and the edit comes out clean. A canvas of 1216×832 is noisy whatever the reference's size (an empty latent at the picture's own size, with the reference at 1024, was as noisy as before); turning `QwenImage21Cache` off changed nothing.

| Qwen-Image 2.1 on ComfyUI, at the 1024 budget | Time | Shirt red | Low angle |
|---|---:|---|---|
| Edit (25 steps) | 24 s | clean, the rest kept (a mean change of 4.6) | the camera moved down, as mflux's did, the people and room the same |
| Turbo Edit (8 steps) | 16 s | clean (5.2) | the same |

The edit then comes out 1248×832, not the picture's size, which the app needs (an edit is a version of the picture, and a painted area is pasted back into it).

**Fixed in the app** (2026-11-11): Qwen's edits on ComfyUI are now worked on the picture scaled to the budget and scaled back ([image-models.md](../../research/image-models.md#qwen-image-21s-edits-on-comfyui-at-a-1024-budget-2026-11-11-windows-pc-from-the-mac)). Through the app's own `edit()`: clean on a whole picture and on a painted area, in 25 s (Edit) or 16 s (Turbo Edit). The three camera moves made before the fix are kept in `out/edits-before-fix/`.

## Stage 3: eight camera moves as edits, after the fix (2026-11-11, PC's ComfyUI 0.45.2, from the Mac)

The 8 moves in `scene.ts`'s `EDITS`, each saying what the new picture shows ("The same room and the same two people, seen from a low angle: the camera near the floor, looking up at them."), as whole-picture edits of Qwen-Image 2.1's baseline, seed 42, on the four edit models the PC has. `run.ts edits`; the sheet is `grids/edits.jpg`. Qwen-Image 2.1 Edit 24.5–25 s each, its Turbo Edit 16 s, FLUX.3 Klein edit 16 s, FIBO 2.0 Edit Turbo 13–14 s.

| Move | Qwen-Image 2.1 Edit and Turbo Edit (alike) | FLUX.3 Klein edit | FIBO 2.0 Edit Turbo |
|---|---|---|---|
| Low angle | done, the camera near the floor | done | barely: more floor, the camera hardly lower |
| High angle | done, strongly | done | done |
| Overhead | done, looking straight down; but Ana now sits on the floor, not the bed | the same | the same |
| Dutch angle | a slight lean | a slight lean | none |
| Close-up on her face | done, her braid and gaze kept | done | done, but she now looks into the camera |
| Close-up on her hands with the shirt | done | done | done, the shirt held up as a T-shirt |
| Close-up on his boots | done | done | done |
| Over his shoulder at her | **Tom twice**: his back in the foreground, and still in the doorway | Tom twice | done, one Tom |

- **Each kept the people, their clothes and the room** from the picture, which no re-render did (Stage 2): the close-ups are of this Ana and these boots.
- **The Turbo Edit is as good as the Edit** on every move, in two thirds of the time.
- **What goes wrong is where the instruction leaves something to guess**: over the shoulder, the edit models drew a second Tom rather than move the one there; overhead, they put Ana on the floor; a Dutch angle hardly tilts.

### Three wordings on the Turbo Edit (2026-11-11, PC)

The same 8 moves on Qwen-Image 2.1 Turbo Edit, worded three ways (`scene.ts`'s `MOVES` and `WORDINGS`, `run.ts wordings`; the sheet is `grids/wordings.jpg`): **A** what the result shows, as above; **B** a template found online, keeping everything first ("Keep the exact same two people, clothing, lighting, and room from the image. *The move.* Keep the woman in the mustard-yellow sweater sitting on the bed on the left and the man … on the right, maintaining their exact poses."); **C** as Qwen's own prompt enhancer for edits advises (its system prompt, in ComfyUI's template: lead with the operation, and "prefer one blanket preservation clause", as "a preservation description reads to the model as a generation instruction"): the move, then "Keep everything else exactly as in the image."

| Moves | A: what the result shows | B: keep everything, the move, each person | C: the move, then keep everything else |
|---|---|---|---|
| Low, high, overhead, Dutch | done (Ana on the floor overhead; the Dutch angle slight) | the same; the Dutch angle a little more | the same as B |
| Close-ups: her face, her hands, his boots | done, all three | **none**: a medium shot of both, as everyone is to be kept | **none** for her face and hands; his boots halfway (his legs and the floor) |
| Over his shoulder | Tom twice | **one Tom**, turned, his back to the camera | **one Tom**, as B |

So a clause keeping everything helps where everything is to stay in the picture (over the shoulder: no second Tom), and stops any move that leaves something out (a close-up). Neither wording suits every move: each kind of move needs its own.

### Short words, two fixes, and moves in a row (2026-11-11, PC, Turbo Edit)

`run.ts next`; the sheet is `grids/next.jpg`. 14 edits, 16 s each.

- **The player's short words work for some moves**: "High angle.", "Overhead shot.", "Close-up on her hands.", "Close-up on the man's boots." came out as the fuller wordings did. "Low angle." moved the camera only a little; "Close-up on the woman's face." (or "on Ana's face": a name the edit model can't know did no harm here) gave a medium shot of her, Tom beside; "Dutch angle." a slight lean; **"Over the man's shoulder." changed nothing**.
- **Overhead, told she stays sitting on the edge of the bed: still on the floor** beside it.
- **The Dutch angle can't be had from the model**: "tilt the camera 30 degrees" leaned the door a little, as before; "rotate the whole picture 45 degrees" rotated the picture itself, white corners and all. But a Dutch angle is the camera rolled about its lens, which is the picture rotated: it can be done in code (rotate and crop), with no model.
- **A close-up can't be undone by another edit**: from her face's close-up, "move the camera back across the room to show the whole bedroom…" gave a different room, a dark-haired man in a white T-shirt, and her in a white blouse. What a close-up leaves out is gone, for an edit as for a Chain's prompt (Stage 1); going back has to start from the picture before it (in the app, an edit is a version beside the original).
- **An edit of an edit drifts and degrades**: from the low angle, "move the camera directly overhead…" kept the low angle, and the walls turned grainy again.

### A wider check: another seed, another picture (2026-11-11, PC, Turbo Edit)

The best wording for each kind of move (the move and "Keep everything else exactly as in the image." for the angles and over the shoulder; what the result shows for a close-up), on the bedroom rendered at seed 43, and on a second picture: one man alone in a kitchen, slicing bread, portrait-shaped (832×1216), both by Qwen-Image 2.1 on the PC. `run.ts wider`; the sheets are `grids/wider-two-43.jpg` and `grids/wider-solo.jpg`.

| Move | The bedroom, seed 43 | One man, portrait |
|---|---|---|
| Low angle | a little lower | barely |
| High angle | done | done |
| Overhead | done, Ana still on the bed this time | done, but he now crouches |
| Dutch angle | a slight lean | a slight lean |
| Close-up on the face | done; she now smiles into the camera | done |
| Close-up on the hands | done | done |
| Close-up on the feet | done | done |
| Over the shoulder | done, one Tom | half: from behind and to one side |

So the wordings hold on another picture and seed; the low angle is the weak one beyond the first picture, and a face's close-up can change where its person looks.

### Intimate poses, clothed (2026-11-11, PC, Turbo Edit)

As the owner asked: poses Roleplays often use, which an edit has to keep as the camera moves. One woman on a bed, fully clothed (a black top, grey sweatpants, white socks), in two poses: on all fours looking back over her shoulder, and lying on her back with her knees up. Rendered by Qwen-Image 2.1 on the PC (landscape, seed 42), then the 8 moves in the best wordings. `run.ts poses`, which reads the prompts from `out/poses/poses.json`: they, the pictures and the sheets stay in `out/`, out of the repo.

- **The poses and the clothes were kept through every angle**: low, high and the Dutch angle's slight lean left her on all fours, or on her back with her knees up, dressed as she was.
- **Overhead came out as a high angle** on all fours, and a steeper high angle on her back: not straight down.
- **The close-ups all worked**: her face (her look back at the camera kept), her hands on the sheets, her socked feet. On her back, her hands' close-up showed her sitting up, though.
- **Over the shoulder came out as from behind**, the whole of her seen from behind on all fours, and from beside her head lying down: the camera moved round, her pose kept.
- Qwen-Image 2.1 drew her knees up but together, not apart as asked, before any edit.

### Six moves not tried before (2026-11-11, PC, Turbo Edit)

For the camera picker: on the bedroom (seed 42's render) and the kitchen (one man), `run.ts untried`; the sheet is `grids/untried.jpg`.

| Move | Two people | One man |
|---|---|---|
| Extreme close-up of the eyes | done | done (his face changed a little) |
| From behind ("Move the camera behind …, seeing her from behind. Keep everything else …") | done, Tom kept | done |
| Close-up of the legs | done, her legs and sneakers | done, his lower half |
| From the waist up | her waist up, but Tom taken out | no change |
| Wider ("Move the camera back to show more of the room …") | a little wider | no change |
| POV ("Seen through the man's eyes …") | no change | a closer view of him, not his view |

So the extreme close-up, from behind and the legs join the moves that work; the waist up, a wider shot and POV don't, as worded.

### The Camera list's hardest moves on mflux (2026-11-11, Mac)

Over the shoulder, a close-up of the face and a low angle, in the Camera list's own wording (`web/src/cameraMoves.ts`), on mflux 0.24.0's Qwen-Image 2.1 Turbo Edit (`--quantize 8 --low-ram`, the Mac's default), from the bedroom picture the PC's edits started from, seed 42. `run.ts mflux`; kept in `out/mflux/`. 47–48 s each, against 16 s on the PC.

All three came out as on the PC's ComfyUI: one Tom, his back large in the foreground, Ana on the bed beyond; a true close-up of Ana's face, her braid and sweater kept; the camera near the floor, the two people and their poses as they were.
