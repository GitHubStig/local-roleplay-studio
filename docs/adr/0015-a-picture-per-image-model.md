---
status: accepted
---

# A Session switches Image Model, keeping a picture per model

A Session copied Settings when it started, so its Image Model was fixed. Trying another model
meant starting another Session, and changing Fast or the size in Settings never reached a running
one (a Roleplay kept rendering slowly after Fast was switched on, 2026-10-05). Since 2026-10-10:

- **The Image Model is switched in the Session** (the picker beside its switches;
  `PUT /sessions/:id/image-model`). Settings' Image Model is only the one new Sessions start with.
  Switching resets the Session's steps to the new model's default, and changes nothing else.
- **A Frame keeps a picture per Image Model** (`pictures`, `server/pictures.ts`). Each picture
  carries its upscale, scene, figures, stale flag and render timings. A Frame shows its picture by
  the Session's model, or else its latest, which then reads **Changed since render · by <model>**.
  A render replaces only its own model's picture, so switching back shows the old pictures with no
  render. A render that finishes after a switch is filed under the model it ran on.
- **How a render runs is read from Settings at each render** (`RENDER_SETTINGS`,
  `renderSettings`): size, Fast, step cache, quantize, float16 and ComfyUI's address. They're
  choices about this machine, like the upscaler, which already applied at once. A Session keeps
  what defines its pictures: its Image backend (whose models it names), Image Model, steps (the
  model's, switched with it) and seed (ADR 0011).

Older `session.json` files, with the picture fields on the Frame, aren't migrated: their pictures
no longer show.

**Changed 2026-10-19: the Image backend is switched with the model.** The picker lists every backend's models that can render on this machine (ComfyUI always, mflux where it's installed: `imageBackends` in `/api/settings/options`), and `PUT /sessions/:id/image-model` takes `{ imageModel, imageBackend }`. Nothing stopped it but the choice above; the one question was what to make of a model both backends have (Qwen-Image 2.1, its Turbo, FLUX.2 Klein 4B, FLUX.3 Klein, Z-Image Turbo):

- **A picture still belongs to a model by its name**, whichever backend made it. Moving to the same model on the other backend (to render on the PC's ComfyUI while it's on, and back to mflux when it isn't) costs no render, and no Frame reads as changed since render. A render on the new backend replaces the same model's picture from the other.
- **Each picture says which backend made it** (`imageBackend`), shown as "by Qwen-Image 2.1 · ComfyUI". Pictures from before lack it; a switch writes the Session's old backend onto them first, so none is left unknown.
- Renders under way finish on the backend they started with, as with a model. A ComfyUI render's preview stops showing if the Session switches to mflux while it runs (the screen asks for previews by the Session's backend); left as it is, as it only hides a preview.

Considered and not chosen: **a picture per backend and model**, honest about the two making different pixels, and able to compare them side by side, but every switch of backend would leave every Frame changed since render, a render each to put back for a picture that may barely differ. How much the two backends' pictures of one model differ hasn't been measured. If that comparison is wanted, matching on both is a change to `shownPicture` and `withPicture` only, since each picture now says its backend.

## Considered Options

- **The model follows Settings, like Fast.** One place to choose it, but changing it would switch
  every Session at once, each picture reading as changed since render, and no two Sessions could
  use different models.
- **One picture per Frame, the old one deleted on a re-render by another model.** Simplest, but
  every switch back costs a render per Frame.
- **Keep the old picture on the Frame only for switching back** (`otherPictures` beside the
  Frame's own picture fields, swapped in and out on a switch). Built first, then replaced the same
  day: a switch had to rewrite every Frame, and a render finishing after a switch was a special
  case. A list of pictures has neither.
- **"Try this Frame on another model"**, a per-Frame picker of alternatives. Set aside (2026-09-29)
  as too much to show and choose between.
- **Ask before switching**, naming how many pictures each model has. Tried and dropped
  (2026-10-10): nothing is lost on a switch, so the question only got in the way. The steps the new
  model renders at show beside the picker instead.
- **Size kept per Session**, so its pictures share one shape. Read from Settings instead: mixed
  shapes are only a matter of looks, as each picture is shown by its own size.
