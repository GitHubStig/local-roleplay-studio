# Reference sheets, stage 0 (2026-11-25)

The quick benches before building reference sheets: what [reference sheets](../../../research/people-in-pictures.md#reference-sheets-as-built-2026-11-26) left open after the [portrait and sheet trials](../../reference-portraits/2026-11-25/README.md). What was found is in [research](../../../research/people-in-pictures.md#0-bench-whats-still-open-done-2026-11-25), stage 0; this page keeps the pictures, for the [showcase](../../../showcase/README.md).

Everything is the two-pass way: a picture rendered without a reference, then a face pass (an edit by Qwen-Image 2.1, the head's area painted, the sheet as the second image). On the Windows PC's ComfyUI 0.46.3, sent from the Mac (Qwen-Image 2.1 int8, its cache on the GPU, 1024², the scenes at seed 8, the edits at 9 and 10); the finders other than Qwen3-VL on the Mac's ComfyUI 0.46.3. Kael and Elara Vance from the public tavern scenario (`example-scenarios/tavern.md`), with Grax, a troll, and the Lantern of Vael made up for it.

`scripts/` runs it all (`stage0.py` first, then the others, each from the folder its pictures are in: `python3 -I <script> <comfy address> <repo> .`; `detect.py` and `det2.py` need the Mac's ComfyUI and the detector models, deleted after); `results/` has every timing and every box.

## In short

- **The face pass must name what it keeps**: the expression for a person (Elara stopped crying, the troll stopped laughing, until it was named), the state for an object (the lantern went dark until "glowing" was named). The Frame's Image Prompt has both. On a second seed it kept Elara's tears every time, but not the troll's grin.
- **Camera moves, then the face pass, keep the sheet's face**, Kael in profile through each. Qwen's low and high angles mostly stepped back rather than tilting, so steep angles were rendered from the prompt: from above and below, the face pass kept the tilt and the tears.
- **No seam** with a hard box or a softened one.
- **A creature and an object take a sheet**, the troll's face and the lantern's etching.
- **Qwen3-VL finds the heads best**, the only finder to get every one and say whose it is.
- **The whole sheet is the way to pass it**; on a close-up it can paste the three heads in, which **a count of the heads before and after** catches (one in fourteen, no false alarms, on the PC's ComfyUI and on mflux alike: `scripts/mac-count.py`), to do again with one view. One view, three views apart and a partial repaint (denoise) were each worse.

## The sheets

![](00-sheets.jpg)

## Camera moves, then the face pass

Each picture whole, then the head before, after the face pass with a hard box (8% round the head) and with a softened one (20%, blurred 24 px). The instruction here said only "the same expression", which is why Elara stops crying; see the next picture.

![](01-camera-kael.jpg)
![](02-camera-elara.jpg)

## Naming the expression, the close-up, the lantern

Elara with "the same expression", then with it named; the close-up with the whole sheet (three heads) and with one view; the lantern before and after "in the same light".

![](03-named-expression-close-up-lantern.jpg)

The troll, its sheet, and the face pass ("the same expression": the laugh went).

![](04-troll.jpg)

The lantern again, with its state named: the glow kept, the etching the sheet's.

![](05-lantern-glow-named.jpg)

## Finding the heads

Each finder's boxes on the same pictures. Qwen3-VL (~5 s, already loaded with Qwen-Image 2.1) found every head with its hair and said who each was; MediaPipe (0.1 s) boxed a wall lamp and an ear, and stops at the brow; RT-DETR (0.3 s) boxes whole people; SAM 3.1 (2.5 s) missed Kael from the high angle and on the quay; SDPose (1.4–2.7 s) found every head, stopping at the hairline. None but Qwen3-VL says whose a head is.

![](06-finders.jpg)

## How the sheet is passed

The whole sheet against one view, the one nearest the head's angle as Qwen3-VL said it (it misread two of Kael's four).

![](07-one-view.jpg)

Two people in one edit, each with their view.

![](08-quay-two-faces-one-edit.jpg)

The three views as three reference images: both close-ups became three people.

![](09-three-views-apart.jpg)

Repainting part-way from the picture (denoise below 1): the framing and expression kept, the face barely changed, even at 0.9.

![](10-denoise.jpg)

## Steep angles

Rendered from above and from below straight from the prompt, then the face pass with the whole sheet and the expression named: the tilt and the tears kept, the heads' count unchanged.

![](11-steep-angles.jpg)

## A second seed

The scenes at seed 9, the camera moves at 10, the face passes at 11 (`scripts/seed2.py`), each as settled: the whole sheet, what it keeps named, the heads counted after. Each pair is the head before and after the face pass. Kael took the sheet's face in all six, Elara kept crying in all six; the troll's grin closed though it was named.

![](12-second-seed-faces.jpg)

The quay, before and after (Elara turned aside), and the lantern, its glow kept.

![](13-second-seed-quay-lantern.jpg)

## Stage 0b

What stage 0 hadn't tried (`scripts/b0.py`, `away.py`, `mac-q.sh`; `results/b0.log`, `mac-results.txt`).

Two people alike, before, one edit for both, an edit each, and their sheets' front views: no face went to the wrong sheet; one edit turned Kael to the viewer and lost his scowl, an edit each kept them.

![](14-0b-two-alike.jpg)

The face pass on the Mac's mflux at full weights and at 8-bit (the app's default), beside the PC's: the same face.

![](15-0b-mflux-8-bit.jpg)

Other sizes; "from behind", which Qwen-Image 2.1 drew in profile or over the shoulder; a FLUX.3 Klein render, whose Kael kept most of his own face after the pass.

![](16-0b-sizes-away-klein.jpg)
