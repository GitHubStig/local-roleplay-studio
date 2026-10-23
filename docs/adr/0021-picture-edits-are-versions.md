---
status: accepted
---

# A picture can be edited, as versions beside its render

A malformed hand or an artefact spoils a Frame whose prompt was right, and a re-render gives a different picture, losing what was good in it. Since 2026-10-23 a Frame's picture can be **edited**: an instruction, and optionally an area painted over the picture, repaint just that area with an edit model, leaving the rest exactly as it was. It works the same in every kind of Session, as a picture job beside upscale and 3D (`server/pictureJobs.ts`). Designed with the owner on 2026-10-23 (open-threads.md had it as "Editing a Frame's picture"); the first edit measured is in models.md, "Qwen-Image 2.1 Edit: fixing a hand with a painted mask".

- **An edit fixes the picture; it doesn't change the story.** The Image Prompt stays as it was, so this goes beside ADR 0005 (the Image Prompt is the state): what a Frame's picture shows may now differ from its prompt by the edits listed on it, which are shown with it. A change to the story goes the kind's own way (an Action, a Look edit, a Message), and a Chain's next Frame is rendered from its prompt, without the fix.
- **Versions in a straight line.** The render stays as the Original; each edit is a new version made from the newest, with its own image, instruction, edit model, seed and painted mask (a file beside it). All are kept, so how a model holds up over repeated edits can be seen. Only the newest can be deleted or made again (Redo, from its area and instruction as changed, with a new seed, in its place). An edit being made shows among the versions, its area saved when it's queued; no other can be asked for until it lands (since 2026-10-23, after the owner tried it).
- **The picked version is the picture everywhere.** A Picture keeps the Original's files where they always were and gains `edits` and `picked` (`server/pictures.ts`), so Sessions from before need nothing. Upscale, 3D, the Compare dialog and its export (which mark an edit), the style scores and a Chain made from a Storyboard all use the picked version (`shownVersion`). A new edit is picked when it lands. Each version has its own upscale and 3D, so stepping between versions loses nothing.
- **An edit belongs to one Image Model's picture**, and shares its fate: kept while it's stale, replaced with it by that model's next render.
- **One edit model, chosen in Settings** as the upscaler is (`server/images/editModels.ts`), any that takes a painted area, whichever model rendered the picture. Qwen-Image 2.1 Edit on mflux first, with `-q 8 --low-ram` (~3 minutes and 15.1 GB for a 1216×832 Frame on the Mac); ComfyUI's route is still to come, so edits are on only where mflux runs.
- **The instruction says what to paint, not what's wrong**, and goes to the edit model as typed, refused if it crosses a Limit: "fix the hand" gave the same hand back; describing the hand wanted repainted it.

## Considered Options

- **The edited picture replaces the render.** Simpler, but a bad edit can't be undone, and models can't be compared on repeated edits.
- **Editing whatever version is picked, branching.** Rejected for a straight line: a version is then always the newest's parent, and deleting only the newest keeps every edit's source.
- **A Chain's Actions as edits of the previous picture**, so what an Action doesn't mention stays exactly as it was. Left out: the picture would carry what the edits left rather than its prompt (against ADR 0005), flaws build up over many edits, and some Actions (a new art style) need a re-render anyway.
- **Finding the area from words** (`--auto-mask`, by the edit tool's own vision model). Painting is more precise, and needs no second model loaded.

## Consequences

Everything that reads a Frame's image asks for its picked version, not the Picture's own fields. A Chain made from a Storyboard copies the Original and the picked edit, if any (still picked; it carries every instruction that led to it, and can't be retried there).
