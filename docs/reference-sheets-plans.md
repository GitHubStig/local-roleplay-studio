# Reference sheets: a plan in stages

Keeping each person's face the same from Frame to Frame with a **reference sheet**: one picture of them from the front, three-quarter and in profile, made once from the Look, and used to repaint only the faces of each picture after it renders (the two-pass way). Why this way, and what was tried: [research/people-in-pictures.md](research/people-in-pictures.md#reference-portraits-for-subject-consistency-open-thread), the benches of [2026-11-22](bench/reference-portraits/2026-11-22/README.md) and [2026-11-25](bench/reference-portraits/2026-11-25/README.md). This file is updated as the stages go, so a new session picks it up from here; when it's done, its pieces move into the design doc, an ADR, CONTEXT.md and `docs/research/`, and the file is deleted.

Started 2026-11-25, from the owner's points after the sheet bench. Where things show on screen was picked from [reference-sheets-mockups.html](reference-sheets-mockups.html) the same day; each pick is in its stage below.

## What's settled

- **Two passes, by default.** Each Frame renders from its Image Prompt as now, by any Image Model; then an edit per person repaints each face shown, with that one's sheet as a reference image (stage 0b: one edit for two lost expressions and turns). One pass (the sheet passed into the render) keeps the angle but pulls expression and clothes to the sheet's, so it isn't the default; it stays possible (open questions).
- **The sheet is one render, passed whole**, by any Image Model, in the Look's style: three head-and-shoulders views on a plain dark backdrop.
- **The face pass is Qwen-Image 2.1's edit**, on mflux and ComfyUI; FLUX.3 Klein's and FIBO 2.0 Edit Turbo's face edits were worse (2026-11-22).
- **The heads are found by the Qwen3-VL Qwen-Image 2.1 already loads**: the only finder of five that found every head and says whose it is (stage 0).
- **The instruction names what to keep**: the expression of each person, the state of an object, from the Frame's Image Prompt; "the same expression" alone loses it (stage 0).
- **Checked after**: Qwen3-VL counts the heads, and a picture with more than before (a close-up can paste the sheet's three heads in) is done again with one view (stage 0).
- **The area is the head's box grown by a fifth, its edge softened**; neither a hard nor a soft edge showed a seam (stage 0).
- **The cost**: find the heads, the face pass, count them: about 3.2× a plain render on the PC (17 s becomes ~54 s), 2.7× on the Mac (~86 s becomes ~236 s, its face edit ~140 s). Each further person in a Frame adds an edit, ~28 s on the PC, ~140 s on the Mac; another Image Model for the render adds nothing on the PC (stage 0b). So it's the player's choice, made before a Session starts.

## Stages

### 0. Bench what's still open: done (2026-11-25)

**Found** (2026-11-25, the PC's ComfyUI sent from the Mac, Qwen-Image 2.1 int8, one seed; the heads found by its Qwen3-VL in 4.8–6.4 s each, every one found; pictures and scripts in [bench/reference-sheets/2026-11-25/](bench/reference-sheets/2026-11-25/README.md)):

- **The face pass must name the expression.** "Keep the same expression" lost Elara's tears and the troll's laugh, though her face then took the sheet's; naming it ("crying, tears running down her cheeks") kept the tears, at eye level and from a high angle, with her face nearer the sheet's than on 2026-11-25. The Frame's own expression sentence (its Image Prompt has one) is what to name.
- **A close-up can paste the whole sheet in.** Where the head fills most of the picture (Elara's face close-up, its box 70% of the width), the face pass drew the sheet's three heads; the three-quarter view cut from it repainted her face, though turned a little towards the view's angle and without the tears. What to do about it is below (how the sheet is passed).
- **Camera moves then the face pass keep the sheet's face**, Kael in profile through the low and high angles and the face close-up. But Qwen's low and high angles mostly stepped back rather than tilting, so a steep angle is still untried.
- **No seam** showed with a hard box (8% round the head) or a softened one (20%, blurred 24 px) at this size: the softened one, as it costs nothing.
- **A creature and an object take a sheet.** The troll's face came from its sheet (found as "the troll"). The lantern took its sheet's etching and lost its green glow to the sheet's unlit glass while the instruction said only "in the same light"; with its state named ("its green glass glowing, lit from within") it kept the glow, the etching still the sheet's, its outline nearer the scene's than the sheet's. So the pass names the state it keeps, for an object as for a face: the Frame's Image Prompt has it. (Depth for objects, the owner's idea, was dropped the same day: a depth map holds the shape at one angle, and the sheet's isn't the scene's.)
- **Finding heads: Qwen3-VL stays.** Against MediaPipe's face detector (5.4 MB) and RT-DETR (124 MB) on the Mac's ComfyUI 0.46.3, on the same eleven pictures (the owner chose the small two before SAM 3.1 and SDPose, 3.65 GB). MediaPipe took 0.1 s a picture, fifty times faster than Qwen3-VL's ~5 s, but its boxes stop at the brow, leaving out the hair the face pass repaints; it boxed a wall lamp beside Kael (0.49) and his ear on the close-up (0.44), found the troll only at 0.31, under its default 0.5; and it says nothing of who each face is. RT-DETR (0.3 s) boxes whole people, not heads, so it's only a start for SDPose. Qwen3-VL found every head, the troll's and the lantern, with the hair, and labelled the man and the woman on the quay; its ~5 s is a sixth of a face pass's ~27 s, and needs no other model. Then SAM 3.1 (1.75 GB) and SDPose (1.9 GB, with RT-DETR for its people), as the owner asked: SAM 3.1 asked for "head" took 2.5 s but missed Kael twice (from the high angle it boxed a small figure behind him; on the quay it found only Elara); SDPose took 1.4–2.7 s and found every head, the troll's too, and small figures in the background, its boxes stopping at the hairline. Neither says who's who.
- **How the sheet is passed** (the face pass on the same pictures, seed 10). Whole, it's best on every picture but one: Elara's close-up, where it pasted the three heads in. One view, the one nearest the head's angle as Qwen3-VL said it, can't do that, and gave the quay's two people their sheets' faces in one edit (35 s); but with the three-quarter view Elara stopped crying (named, and kept with the whole sheet), Kael's close-up was reframed, smaller with a window beside him, and Qwen3-VL misread the angle on two Kael pictures of four ("profile right" for a man facing left). Its three views as three reference images were worse: both close-ups became three people, at 39–48 s an edit. Starting the repaint part-way from the picture (denoise 0.6–0.9, the edit's `strength` on mflux) kept every close-up's framing and expression but barely changed the face, even at 0.9: the face changes only between 0.9 and 1, where the layout comes with it. So the whole sheet, checked after: **Qwen3-VL counts the heads before and after the pass** (2–7 s), and a picture with more after is done again with one view. On the ten face passes with the whole sheet it flagged only Elara's close-up (one head before, three after), and none of the other nine, the quay's two people included.
- **Steep angles hold** (from above and from below, rendered so from the prompt): the face pass gave Kael the sheet's face with his head still tilted, and kept Elara crying, though the sheet has no view from above or below; the heads' count unchanged on all four.
- **The count on mflux too** (the Mac, mflux 0.24.0, its own Qwen3-VL, `_vision_reply`, on the same fourteen pairs): it flagged only Elara's close-up (one head before, three after), as on the PC; 2.5 s for a picture with one head, ~5 s with two, 7.2 s with three. Qwen-Image 2.1 is loaded for the face pass anyway, so it costs no memory.
- **A second seed** (the scenes at 9, the camera moves at 10, the face passes at 11; everything as settled above): Kael took the sheet's face in all six of his, profile, angles, close-up and steep tilts kept; Elara kept crying in all six, her face again moving only a little; the lantern kept its glow. The count never rose: no false alarm, and neither close-up pasted the sheet in. Two things the first seed didn't show: the troll's grin closed though "laughing, his mouth open" was named, so naming keeps an expression often, not always; and on the quay Elara, facing the viewer, came out looking aside, so with two people in one edit a head's turn isn't always kept.

### 0b. Bench what stage 0 didn't: done (2026-11-25)

Found missing on review, then benched the same day (the PC's ComfyUI sent from the Mac, Qwen-Image 2.1 int8; the Mac's mflux 0.24.0 for its edit settings; [bench](bench/reference-sheets/2026-11-25/README.md#stage-0b)):

- **Two people alike are told apart, and an edit each keeps more.** Two men (Kael and Doran, a bearded man near his age) and two women (Elara and Mira, both young and dark-haired), seeds 8 and 9: asked by name and identity, Qwen3-VL found each by name, and no face went to the wrong sheet. One edit for both lost Kael's scowl and turned him to face the viewer, on both seeds (as Elara on the quay, stage 0's second seed); an edit each kept the scowl and his look at Doran. So **an edit per person**, ~28 s each on the PC. The women's faces barely moved either way, their expressions kept.
- **Another Image Model costs nothing more to switch.** Three Frames rendered by FLUX.3 Klein, each then found, face-passed and counted with Qwen-Image 2.1, took 51 s a Frame, against 55 s all by Qwen-Image 2.1 (Klein renders in 11 s to its 17): every step as fast on each Frame, so nothing reloaded on the PC. On mflux every job loads its model anyway. But the Klein Kael kept most of his own face after the pass, as some faces do (open questions).
- **Other sizes work**: 832×1216 and 1216×832, the edit sized as the app sizes one (`budgetSize`), the count unchanged.
- **The Mac's 8-bit edit is as good**: the face pass on mflux at 8-bit (the app's default, quantized from the same files as they load) came out as at full weights, in 138 s to 222 s, at 40.0 GB to 39.3 GB. The default stays.
- **Where each person's expression comes from**: the Art Agent writes the expression as a field of its own (`frameSchema`, `server/frameBody.ts`), one sentence for everyone shown ("each person's facial expression and where they look"), but the Frame keeps only the seven joined into its body. The face pass names it by quoting that sentence whole, so the Frame keeps it apart (stage 2), not by a new call.
- **A face turned away: not settled.** Qwen-Image 2.1, asked for Kael from behind, drew him in profile or over his shoulder each time, and the face pass treated those well; asked which way a head faced, Qwen3-VL never said "away", calling Elara's near back view "profile right". So it can't be relied on to skip a back of a head; what the pass does to one is untried.

Reordered 2026-11-25 (the owner allowed it, once everything was raised), so each stage can be built and checked on its own, in the order they depend on each other.

### 1. A Roleplay's Look in the Cast review

On its own, before anything of sheets: it's worth having without them, and everything after needs the Look to exist before the story begins.

- **A Roleplay's Look is written in the Cast review** (the owner, 2026-11-25: "might be better moving forward"), not at the first picture, so its sheets are made while the player reads the Cast and are usually ready by the first picture. Whether for every Roleplay or only one with sheets, and what happens to the Look when the Cast is edited after it's written (written again, or asked), is decided when stage 1 starts.

### 2. The data and the jobs (the server, no screens)

- **Stored in the Session**: a migration for `session.json` (the sheets, per Subject, with their seed, whether ticked, and which identity they were made from) and `settings.json` (the section's settings).
- **Sessions made before sheets** can't have them, as sheets are settled before the story begins; a Roleplay's Restart, back to its Cast review, may offer them.
- **A sheet job**, a kind of its own (`jobKinds.ts`), through the render queue so it takes turns with renders, cancelled like one; the Backend it goes to by `runOn`, as pictures do; a `sheets` Feature in `features.ts`, on only where Qwen-Image 2.1 is.
- **Its prompts as Markdown files** (`server/prompts/`): the sheet's, and Change…'s rewrite, a Text Model call under a schema, so it says how it ends and is checked over seeds 1–8 (AGENTS.md). The sheet's prompt and Change…'s rewritten identity are checked against the Limits, as every prompt is.
- **Its seed** from the Session's (ADR 0011): the seed plus the Subject's index, a Redo one more.
- **Cut once made**: its three views, and each mirrored, kept beside it for the face pass's redo with one view.
- **Events** that a sheet is queued, made or failed, as for a picture, for the Look to show; logged in the call log (`callLog`) as other calls are.
- **Finding and counting heads is a service of its own** (a `HeadFinder` interface on the server, as AGENTS.md has for every AI service), with a fake for the tests: Qwen3-VL through ComfyUI's `TextGenerate` and mflux's `_vision_reply`. Its questions (find, count) are prompt files too, as is the face pass's instruction.
- **Seeds**: the face pass at the render's seed plus one, its redo with one view plus two.
- **Each Frame's expression sentence kept apart** (stage 0b): the Art Agent and a Storyboard's writing already write it as a field; the Frame keeps it beside its body, for the face pass to quote (a migration with the rest).

Checked by the server's tests (the fakes) and a replay (`deno task replay`) that makes a Session with sheets on both runtimes.

### 3. Sheets on screen

As [reference-sheets-mockups.html](reference-sheets-mockups.html) draws them (redrawn 2026-11-25 with every decision, phone and dark included).

- **A Settings section of its own, "Reference sheets"**, in the models' group (the owner, 2026-11-25): on or off for new Sessions, which edit model does the face pass (only those that take references; the others listed greyed, saying why), and which Image Model makes the sheets (the Session's own by default). Its own section, not a row in Images or Advanced, as it has several settings and says what it costs.
- **Asked again when a Session starts**, set from Settings (the owner, 2026-11-25: a player may not remember whether the setting was on). A switch on the start screen, with what it costs; the Session keeps what it was started with, as it keeps its Image Model (ADR 0015). Not in the Session's model menu: turning it on or off mid-Session is more than it's worth. The switch is **in Start's menu** (the owner, 2026-11-25), opened from Start's caret, on the Scenario page and on Home, a sheet from the bottom on a phone; greyed for a Chain.
- **Sheets are settled before the story begins** (the owner, 2026-11-25): made, redone, changed and ticked only in a Storyboard's plan review (until Write Frames) and a Roleplay's Cast review (until Begin); after that they're fixed, as the rest of how a Session started is. Restart takes a Roleplay back to its Cast review, and so to its sheets. So no Frame is ever made with a sheet that later changes, and nothing is marked out of date by one.
- **The player picks which Subjects get a sheet** (the owner, 2026-11-25), objects and creatures as well as people (stage 0: the troll, the lantern): **every Subject starts ticked**, and the player unticks any, by a tick beside each in the Look, in the plan review or the Cast review. Ticked by default, so the sheets start at once. Unticking cancels that Subject's sheet if it's still queued, and its face is left as rendered; ticking it again makes the sheet. No pick on the start screen: it knows the Scenario's People, not the Subjects the Look will have.
- **A sheet per ticked Subject, made when the Look is**: a job in the Session's queue as soon as the Look exists, while the player reads the Beats or the Cast; A Storyboard's Write Frames waits for the sheets it needs; a Roleplay's Begin doesn't, as it writes only the opening Reply, and its first picture waits instead, if they're not done by then. **Shown in the Look, under each Subject's identity** (the owner, 2026-11-25), with Redo and Change… beneath; a picture among the Look & Cast panel's text, which the owner finds text-heavy.
- **Redo and Change…** (the owner, 2026-11-25). Redo makes it again with another seed. **Change…** takes a note ("fewer scars", "green eyes", "longer hair"): the Text Model rewrites the Subject's identity with the change, and the sheet is made again from it, so the identity and the sheet always agree (a sheet with green eyes and an identity saying brown would fight in every Frame: the render draws brown, the face pass green). The rewritten identity is shown before the sheet is made. Three sheets to pick from was drawn and not chosen.

### 4. The face pass after each render

- **Part of the render job**, after the picture is made and before it's saved as the Original: find the heads of the ticked Subjects the Frame shows, by name and identity, then **an edit per person**, each with that one's sheet and the Frame's expression sentence quoted (stage 0b: one edit for two lost a scowl and a turn of the head, an edit each kept them). Seeded apart from the render (one more), as every picture made from a picture is.
- **When a head isn't found, or the Frame shows no one with a sheet**, the render is saved as it is, and the job says so.
- **The render without the face pass is kept** beside the Original. The picture shows a **"Faces from sheets" chip** (the owner, 2026-11-25), as it shows Edited now: clicking it says whose faces were repainted, holding it shows the render before (on a phone too, where a long press on the picture opens its menu, ADR 0039: the owner, 2026-11-25), and **Without the face pass** uses the render for that Frame. Not a version in the versions list, which would give every Frame an edit.
- **Progress shows two steps** in one job, in the queue and on the picture: rendered, then faces (the owner agreed, 2026-11-25: there's no way round the second step). One job, so Cancel and the queue's order stay as they are; the render shows on the stage as soon as it's made, and the faces change when the pass is done. A Frame where no one with a sheet is found says the faces were skipped.
- **Built behind one interface with both ways** (open questions: one pass stays possible), two passes the default.

### 5. Edits, and the rest of the app it touches

The owner asked how an edit works when a Session has sheets: does the edit model get the reference, the painted area and a prompt with both instructions at once? The plan is **no: two edits in a row, never one with both.** The player's edit runs as now (the picture, its painted area, its instruction, no sheet), and then the face pass runs on its result, in the same job. Folding both into one edit would bring back what one pass does: a reference passed into an edit that redraws a person pulls their expression, pose and clothes towards the sheet's, so "make her smile" or "turn him to the window" would fight the sheet; and the benches found an edit follows one clear instruction better than two.

- **Only when it touches a face.** An edit whose painted area misses every head found keeps the faces it had, so no face pass; one over a head, or of the whole picture, gets one.
- **Camera moves** (ADR 0038) redraw the whole picture from a new angle, so a face pass always follows them. Steep angles hold, though the sheet has no view from above or below (stage 0).
- **Each edit's face pass is part of that version** (ADR 0021): the version shows the result after the pass, with "Without the face pass" as for a render.
- **An edit model that takes no references** still does the player's edit; the face pass is always by the section's edit model.

The rest of the app (the owner, 2026-11-25: the Session manager wasn't in any stage). Sheets add two kinds of file to a Session, which its parts (`server/sessionParts.ts`) must own:

- **The renders before the face pass**, one per pictured Frame and per edit that had one, always kept (the owner, 2026-11-25): about as many bytes again as its pictures. A tick under Pictures in What to keep, beside upscales and edits ("Renders before the face pass"); without them the chip says whose faces were repainted, with nothing to hold. **Chosen picture only** drops them too, unless a Frame uses its render without the pass, which is then the picture it keeps.
- **The sheets**: a part of their own ("Reference sheets"), in the size bar and the counts, and not removable, as later pictures and edits need them for their face pass; one 1536×640 picture per ticked Subject is too small to be worth freeing.
- **Export, import and Clone** carry both, as files a part owns: a Clone keeps its sheets, so the copy carries on with the same faces.
- **Chain from a Frame** copies the picture after the face pass, not the sheets: a Chain has no Look, so its later Frames render plainly.
- **Compare**: each Image Model's render has its own face pass, so Compare shows every model's faces repainted.
- **Re-render** runs the face pass again; **Undo** and deleting a Frame remove its files as now.

### 6. Finishing

- **Checking a sheet before it's used**: three distinct angles, a dark backdrop, no writing (FIBO 2.0 Turbo's wrote "Kael," and turned only the head, 2026-11-25), by the Qwen3-VL already loaded; a sheet that fails is made again, or shown to the player with why.
- **The model pickers say what sheets need**: the face pass's edit model in the Edit dialog, and a Session's Image Model when it can't make a clean sheet.
- **Docs**: the design page (pictures.md, session-manager.md, and the Roleplay's and Storyboard's), an ADR (two passes with a sheet), CONTEXT.md's terms (reference sheet, face pass), the showcase line; this file deleted. The mockups deleted with it.

## Open questions

- **Without Qwen-Image 2.1** (the owner, 2026-11-25: neither it nor mflux can be assumed). The face pass needs an edit model that takes a reference and something to find heads; Qwen-Image 2.1 brings both (its edit, the best of 2026-11-22's, and its Qwen3-VL). The first version needs it: reference sheets are offered only where Qwen-Image 2.1 is installed, on mflux or ComfyUI (`server/features.ts`), the Settings section saying what to install. The Text Model as the finder is out (the owner: Gemma 4 can't be assumed either, and is large); other edit models and finders can come later.
- **One pass stays possible** (the owner, 2026-11-25). One pass (the reference in the render) is the usual way to use a reference image; two passes are the usual way to fix faces after (ComfyUI's FaceDetailer, ADetailer). Two passes are the default because today's models pull expression and clothes in one pass: a workaround for today's models, so measured, and removable. The face pass is built behind one interface with both ways, one pass benched again when an edit model is added or upgraded, and the way may differ per model. Whether the player also chooses (one pass ~1.3× a render, two ~2.6×; one needs the Session's Image Model to take references) is to be decided.
- **Many people in one Frame**: an edit each is ~28 s a person on the PC, ~140 s on the Mac. Repaint only the most prominent few (as a Storyboard's identities put them first)?
- **A back of a head**: Qwen3-VL doesn't say "away" (stage 0b), so the pass can't skip one by that; what it does to one is untried. Watch for it in play, or ask Qwen3-VL whether a face shows.
- Whether a Chain gets sheets: it has no Look, only nine sentences per Frame. Left out for now.
- **Some faces barely move**: Elara's hardly changed in the face edits of the portrait and sheet trials, and Mira's (stage 0b); with the expression named Elara's moved more (stage 0), but less than Kael's; and a FLUX.3 Klein Kael kept most of his own (stage 0b). Watch for it in play.

## Ideas for later

From the owner, 2026-11-25; none tried.

- **A better reference** as models change: a layout that suits a model, a sheet with a transparent background (models that make RGBA pictures exist), a new node or option.
- **A 3D figure as the reference.** The app already makes TripoSplat and LiTo figures that turn all the way round: rendered at each head's own angle, from above or below too, it would match every Frame, where three views can't, and a close-up would get one view at its own angle.
