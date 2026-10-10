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
