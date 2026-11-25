# Reference sheets: a plan in stages

Keeping each person's face the same from Frame to Frame with a **reference sheet**: one picture of them from the front, three-quarter and in profile, made once from the Look, and used to repaint only the faces of each picture after it renders (the two-pass way). Why this way, and what was tried: [research/people-in-pictures.md](research/people-in-pictures.md#reference-portraits-for-subject-consistency-open-thread), the benches of [2026-11-22](bench/reference-portraits/2026-11-22/README.md) and [2026-11-25](bench/reference-portraits/2026-11-25/README.md). This file is updated as the stages go, so a new session picks it up from here; when it's done, its pieces move into the design doc, an ADR, CONTEXT.md and `docs/research/`, and the file is deleted.

Started 2026-11-25, from the owner's points after the sheet bench. Where things show on screen was picked from [reference-sheets-mockups.html](reference-sheets-mockups.html) the same day; each pick is in its stage below.

## What's settled

- **Two passes.** Each Frame renders from its Image Prompt as now, by any Image Model; then one edit repaints every face shown, with each person's sheet as a reference image. One pass (the sheet passed into the render) keeps the angle but pulls expression and clothes to the sheet's, so it isn't used.
- **The sheet is one render, passed whole**, by any Image Model, in the Look's style: three head-and-shoulders views on a plain dark backdrop. Cutting it into views gained little.
- **Only the face pass's edit model needs references**: Qwen-Image 2.1 (the best on 2026-11-22), on mflux and ComfyUI. FLUX.3 Klein's and FIBO 2.0 Edit Turbo's face edits were worse.
- **The heads are found by the Qwen3-VL Qwen-Image 2.1 already loads** (2–5 s), unless stage 0 finds better.
- **The cost**: about 2.6× a plain render (the Mac: ~86 s becomes ~230 s; the PC: 18 s becomes ~45 s). So it's the player's choice, made before a Session starts.

## Stages

### 0. Bench what's still open (the PC mostly, quick)

- **Finding heads, faster or better** (the owner, 2026-11-25). Qwen3-VL was picked because it's already loaded on both machines, not because it was compared. ComfyUI has others (MediaPipe face landmarks, SAM 3, SDPose's face boxes, RT-DETR), none with its model on the PC on 2026-11-22. Compare them with Qwen3-VL on the benches' pictures for time, misses and box fit: painted styles, profiles, small faces, a face half in shadow, and a creature or a masked face, which a face detector trained on photos may miss and a VLM asked for "the dragon's head" may not. A detector is worth its download only if it beats Qwen3-VL on both, as it means a second model per machine; on the Mac, mflux offers only the VLM.
- **The seam** where a hard-edged box ends (2026-11-22's flaw): a softened edge, or more room round the head.
- **Camera moves and other edits, then the face pass** (see stage 3): a low angle, a high angle and a close-up from the camera list, then the face pass on each, as the sheet has no views from above or below.
- **A sheet for a creature and for an object**, to know which Subjects get one.

### 1. The setting, and the sheets

- **A Settings section of its own, "Reference sheets"**, in the models' group (the owner, 2026-11-25): on or off for new Sessions, which edit model does the face pass (only those that take references; the others listed greyed, saying why), and which Image Model makes the sheets (the Session's own by default). Its own section, not a row in Images or Advanced, as it has several settings and says what it costs.
- **Asked again when a Session starts**, set from Settings (the owner, 2026-11-25: a player may not remember whether the setting was on). A switch on the start screen, with what it costs; the Session keeps what it was started with, as it keeps its Image Model (ADR 0015). Not in the Session's model menu: turning it on or off mid-Session is more than it's worth.
- **A sheet per Subject, made when the Look is**: a job in the Session's queue as soon as the Look exists. A Storyboard's in the plan review, beside each Subject's identity, made while the player reads the Beats, with Write Frames waiting for the sheets it needs; a Roleplay's when its Look is written at the first picture, which then waits for the sheets it needs. **Shown in the Look, under each Subject's identity** (the owner, 2026-11-25), with Redo and Change… beneath; a picture among the Look & Cast panel's text, which the owner finds text-heavy.
- **Redo and Change…** (the owner, 2026-11-25). Redo makes it again with another seed. **Change…** takes a note ("fewer scars", "green eyes", "longer hair"): the Text Model rewrites the Subject's identity with the change, and the sheet is made again from it, so the identity and the sheet always agree (a sheet with green eyes and an identity saying brown would fight in every Frame: the render draws brown, the face pass green). The rewritten identity is shown before the sheet is made. Three sheets to pick from was drawn and not chosen.
- **A sheet redone marks the Frames made with the old one out of date**, as editing the Look does.
- **Stored in the Session**: a migration for `session.json` (the sheets, per Subject, with their seed and which identity they were made from) and `settings.json` (the section's settings).

### 2. The face pass after each render

- **Part of the render job**, after the picture is made and before it's saved as the Original: find the heads of the Subjects the Frame shows, then one edit with every face's area and each one's sheet, the instruction saying which area is whose (2026-11-22: one edit for every face works once each area is named). Seeded apart from the render (one more), as every picture made from a picture is.
- **The render without the face pass is kept** beside the Original. The picture shows a **"Faces from sheets" chip** (the owner, 2026-11-25), as it shows Edited now: clicking it says whose faces were repainted, holding it shows the render before, and **Without the face pass** uses the render for that Frame. Not a version in the versions list, which would give every Frame an edit.
- **When a head isn't found, or the Frame shows no one with a sheet**, the render is saved as it is, and the job says so.
- **Progress shows two steps** in one job, in the queue and on the picture: rendered, then faces (the owner agreed, 2026-11-25: there's no way round the second step). One job, so Cancel and the queue's order stay as they are; the render shows on the stage as soon as it's made, and the faces change when the pass is done. A Frame where no one with a sheet is found says the faces were skipped.

### 3. Edits by the player, with sheets on

The owner asked how an edit works when a Session has sheets: does the edit model get the reference, the painted area and a prompt with both instructions at once? The plan is **no: two edits in a row, never one with both.** The player's edit runs as now (the picture, its painted area, its instruction, no sheet), and then the face pass runs on its result, in the same job. Folding both into one edit would bring back what one pass does: a reference passed into an edit that redraws a person pulls their expression, pose and clothes towards the sheet's, so "make her smile" or "turn him to the window" would fight the sheet; and the benches found an edit follows one clear instruction better than two.

- **Only when it touches a face.** An edit whose painted area misses every head found keeps the faces it had, so no face pass; one over a head, or of the whole picture, gets one.
- **Camera moves** (ADR 0038) redraw the whole picture from a new angle, so a face pass always follows them. The sheet has no view from above or below, so a high or low angle may hold the face less well: stage 0 checks it.
- **Each edit's face pass is part of that version** (ADR 0021): the version shows the result after the pass, with "Without the face pass" as for a render.
- **An edit model that takes no references** still does the player's edit; the face pass is always by the section's edit model.

### 4. Finishing

- **Checking a sheet before it's used**: three distinct angles, a dark backdrop, no writing (FIBO 2.0 Turbo's wrote "Kael," and turned only the head, 2026-11-25), by the Qwen3-VL already loaded; a sheet that fails is made again, or shown to the player with why.
- **The model pickers say what sheets need**: the face pass's edit model in the Edit dialog, and a Session's Image Model when it can't make a clean sheet.
- **Docs**: the design page (pictures.md, and the Roleplay's and Storyboard's), an ADR (two passes with a sheet), CONTEXT.md's terms (reference sheet, face pass), the showcase line; this file deleted.

## Open questions

- Which Subjects get a sheet: people only, or creatures and objects too (stage 0)?
- A Frame showing more people than the edit model takes references (Qwen-Image 2.1 took three on the PC with room to spare): the most prominent first, as a Storyboard's identities are?
- Whether a Chain gets sheets: it has no Look, only nine sentences per Frame. Left out for now.
- Elara's face hardly moved in any face edit (2026-11-25): if that's common, the pass does little for some pictures. Watch for it in play.
