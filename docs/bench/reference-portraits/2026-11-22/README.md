# Reference portraits, a day of trials (2026-11-22)

A follow-up to the October trial ([2026-10-06/](../2026-10-06/README.md)): whether a portrait of each person, made once, can keep their face the same from picture to picture. Run in one day, mostly on the Windows PC's ComfyUI (Qwen-Image 2.1, int8, RTX 4070) sent from the Mac, then checked on the Mac with mflux. Nothing was built; the findings, with every number, are in [research/people-in-pictures.md](../../../research/people-in-pictures.md#reference-portraits-for-subject-consistency-open-thread). This page keeps the pictures, for the [showcase](../../../showcase/README.md).

Everyone in them is from the public tavern scenario (`example-scenarios/tavern.md`): Kael and Elara Vance, plus Bram, an old sailor made up for the three-person tests. Each collage carries a caption saying what its rows and columns are.

## In short

- **One pass** (the portraits passed into the render) keeps the faces, but pulls each person's expression, pose and any clothes the prompt doesn't name towards the portrait's. Nothing loosened that: not wording, not a face crop, not a smaller reference.
- **Two passes** (render without portraits, then repaint only the faces with the portraits) keep the moment: the tears, the profile. It works on both machines, with every face in one edit, and with the heads found by the vision model Qwen-Image 2.1 already loads. About 2.6× a plain render.
- Four of the day's conclusions were wrong: three caught by the owner's questions, one by looking closer when the owner asked for more detail ([below](#where-the-first-conclusions-were-wrong)).

## The seed: a bug found on the way

The first run gave garish copies of the portraits instead of scenes. It wasn't the portraits: every render used seed 7, the seed the portraits and the pictures were made with, and on ComfyUI the same seed at the same size is the same starting noise, so the model redrew its own picture ("noise replay"). The app's own edits did the same, and were fixed the same day (`fix(edits): never seed an edit with its picture's seed`).

![](01-noise-replay-first-run.jpg)
![](02-noise-replay-app-edit.jpg)
![](03-noise-replay-fixed-by-seed.jpg)

## One pass: the portraits in the render

The faces hold, Kael especially, who is a different man in every picture without them.

![](04-one-pass-faces-hold.jpg)

With three people, the picture without portraits left Kael out (though its prompt described no one's looks, so it says little); with them, all three were there.

![](07-one-pass-three-people.jpg)

The wider framing seen on the Mac in October didn't show at seed 8, and none of three fixes for it helped. Full-length portraits held the face least.

![](05-composition-tries.jpg)
![](06-composition-tries-kael-face.jpg)

## What one pass can't do: the pull

Across five kinds of picture the faces held, but a crying Elara stopped crying, Kael turned out of his profile, and clothes the prompt didn't name became the portrait's black. Clothes it named (the blue gown, the straw hat) stayed.

![](08-one-pass-scenes-a.jpg)
![](09-one-pass-scenes-b-the-pull.jpg)

Telling it to take only the face and hair changed nothing; nor did a face crop with no clothes in it, nor 512 px references.

![](10-pull-wording-tried.jpg)
![](11-pull-crop-and-size-tried.jpg)

## Two passes: repaint only the faces

The picture is made without portraits, so its expression, pose and clothes are the prompt's; then an edit repaints only the face, with the portrait as a second image. The tears and the profile stay, with no seam at the edges.

![](12-two-pass-face-edit.jpg)
![](13-two-pass-close-up.jpg)

The same on the Mac with mflux: the same behaviour both ways, about five times slower.

![](14-mac-mflux-both-ways.jpg)

## Other models

None did better than Qwen-Image 2.1's two passes. FLUX.3 Klein's one pass kept more of the moment but its face edit barely moved the face; the Turbo's face edit lost the tears once in two; FIBO 2.0 Edit Turbo's drew Elara's face larger and higher, so the box's edge cut across her mouth.

![](15-other-models-flux3-klein.jpg)
![](16-other-models-qwen-turbo.jpg)
![](17-other-models-fibo2-edit-turbo.jpg)

## Every face, found without a hand

Qwen-Image 2.1's text encoder is Qwen3-VL, which can also answer with boxes: asked for each person's head, it found every one in 2–3 s, small faces included, labelled left and right. The same on the Mac through mflux's copy. Then the whole chain with no hand: the found boxes as the mask, one edit for both faces. The one flaw: a line across Kael's neck where his box ends. It's the same seam as FIBO's (see [detail/d8](detail/d8-flaws.jpg)): the edit draws the head at a slightly different size, and a hard-edged box shows the join.

![](22-heads-found-automatically.jpg)
![](23-whole-chain-automatic.jpg)

## Full size

The collages shrink whole pictures; these crops are at the pictures' own resolution, where faces, tears and seams show.

![](detail/d1-crying-one-pass-vs-two.jpg)
![](detail/d2-profile-one-pass-vs-two.jpg)
![](detail/d3-quay-two-faces-one-edit.jpg)
![](detail/d4-three-portraits.jpg)
![](detail/d5-three-people.jpg)
![](detail/d6-noise-replay.jpg)
![](detail/d7-two-passes-mac-and-pc.jpg)
![](detail/d8-flaws.jpg)

## Where the first conclusions were wrong

Kept on purpose: each was stated as a finding, then checked and withdrawn, the first three because the owner questioned them.

1. **"A ComfyUI regression broke Qwen-Image 2.1's edits."** The garish renders above were first put down to a change in ComfyUI 0.46 ("Fix dynamo", #17808), written into the upgrade log as the suspect. Asked to look through ComfyUI's issues, a comment on #16435 explained it: the seed. The regression section was taken out, and the app's edit seeds fixed.
2. **"One edit can only repaint one face."** One edit with both faces changed only Kael, so two edits seemed needed. Asked how we knew it wasn't the prompt: with Elara named first only Elara changed, and with each painted area given its person ("the left one is the man's head… both changes are needed") both changed in one pass.

   ![](18-two-faces-first-wording.jpg)
   ![](19-two-faces-it-was-the-wording.jpg)

3. **"Bram lost his looks to the prompt's order", and then, from it, a worry that the Art Agent's crowded pictures lose people's looks in play.** Bram, without a portrait, came out young with curly hair, not the bald, braided sailor; written again with him first and his looks in, he came out right. But the first prompt never described anyone's looks: they were only in the portraits' prompts. As the order and the looks changed together, it showed nothing about order, and the Art Agent worry was withdrawn before it was recorded. What held: someone without a portrait keeps a face of their own.

   ![](20-no-portrait-newcomer.jpg)
   ![](21-newcomer-described.jpg)

4. **"FIBO 2.0 Edit Turbo leaves a dark band across the mouth."** Judged from the shrunk collage, and written into the research that way. When the owner asked for more detail to be kept, the full-size crop showed what it was: FIBO drew Elara's face larger and higher, her mouth fell below the painted box, and the box's hard edge showed the join. The same seam as the line across Kael's neck, so one fix for both, not a fault of FIBO's alone.

   ![](detail/d8-flaws.jpg)

## Files

- The collages, numbered in the order above; their captions drawn by `scripts/captions.py`.
- `scripts/`: what made them, run from a scratch folder (`python3 -I <script> <ComfyUI address> <repo> <out folder>`); they lean on each other (`refs-comfy.py` is the base) and on the portraits and pictures uploaded to ComfyUI as `lrs-bench-*.png`. `mac-run.sh` and `mac-ground.py` are the Mac's (mflux 0.24.0).
- `results/`: the times, and the head boxes each machine found.
- `detail/`: full-resolution crops, drawn by `scripts/details.py`.
- Not kept: the full-size pictures (about 150, all in the collages) and the uploads on the PC.
