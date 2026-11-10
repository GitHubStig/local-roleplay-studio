# People in pictures

How the app's prompts handle the people in a picture: who a Storyboard Frame shows, side characters joining a Roleplay's Look, and clothing carried from picture to picture. Moved here from docs/models.md on 2026-10-16, which keeps to the models themselves; the decisions are in ADR 0007 and ADR 0012. Two people in one picture, and a Chain's people, are in [bench/two-people](../bench/two-people/README.md).

## Storyboard plans: who each Frame shows (2026-10-08, Mac)

ADR 0012 gave the Look an identity per person and each Frame a `shown` list. Checked by planning a
16-Frame Storyboard from a Brief with five named people twice on `gemma-4-26b-heretic:nvfp4`
(Ollama, Thinking off, the Session's seed), plus one Action on the result; nothing was rendered.

- Each plan took 44–47 s, the same as before the change, and listed all five people.
- Every name in `shown` matched the Look exactly (none needed `matchShown`'s word matching).
- Frames about one person showed only them; the four Frames of the scenery showed no one. Group
  Frames named four people, cut to the first three. The two runs disagreed on whether a Frame
  where one person signals the others shows just him or the whole group.
- An Action bringing a second person into a Frame ("X stands beside Y") put them in `shown` and
  left the Look alone.
- Faults the engine now handles: identity sentences without a full stop (they ran into each
  other), and "No people." written as an empty Frame's clothing sentence, despite the prompt saying
  not to (before the change, the same model wrote "N/A (Environmental focus)" there).

**32 Frames** (the most since 2026-10-08, from 16), from the `contact` Scenario, four plans, not
seeded:

- 60–83 s each (16 Frames took 44–47 s); about 2.5 s per Frame once the Look and Beats are written.
  No escaped line breaks, "N/A" or broken JSON, all five people in every Look.
- In three plans every Frame's sentences and `shown` matched its Beat. In the first, `shown` sat one
  Frame late in two runs of four Frames (the Frame about Dillon naming Dutch, and so on); its
  sentences weren't printed, so whether they lagged too is unknown. Not seen again.
- Close-ups of guns and brass named the men until the prompt said a close-up of an object shows no
  one; then they came back empty. Frames of no one sometimes name something else instead ("The
  jungle", "style"), which the engine drops as it isn't a person in the Look.
- Every Beat started with its number ("Frame 12: …", as the 16-Frame plans' "01: …"); the engine
  strips it.
- The owner's first 16-Frame plan of the `contact` Scenario in the app (seed 42) ran away inside
  Frame 1 on both attempts, each running to the 12,400-token cap (3 min 53 s and 4 min 1 s by
  Ollama's log) before failing. Replayed with the same seed outside the app it finished in 45 s,
  twice: Ollama doesn't repeat a reply exactly here. What it wrote wasn't kept. Since then a plan is
  stopped once 8,000 characters pass without the next part (the Look, the Beats, a Frame)
  complete (`RUNAWAY_CHARS`), logging its last words, and retried; stopping the stream ends
  Ollama's request at once ("Request terminated", checked).
- **Whitespace between the parts (2026-10-09, Mac).** A 15-Frame plan in the app ran away on both
  attempts, padding with spaces and blank lines. Replayed outside the app on
  `gemma-4-26b-heretic:nvfp4`, short one-line Briefs failed 6 of 12 times; the `tavern` and
  `contact` Scenarios, 0 of 5. The whitespace always began right after a part closed: after the
  Look's `}`, or after the Beats' `]` with all 15 written. The model took its answer as done there,
  and with `}` barred by the schema (the next part still required) it padded instead. The plan's
  user message now says the reply holds all three parts, in order, and is done only after the last
  Frame: the same Briefs then failed 0 of 10.

## Side characters joining the Look (2026-10-09, Mac)

gemma-4 26B heretic (`gemma-4-26b-heretic:nvfp4`), prose, on a copy of the Kael tavern Roleplay
(its Look ported to people) with two made-up exchanges added, in which a named city guard comes in,
is served, and keeps looking at the Persona (ADR 0012, "Roleplays too"):

| Frame | Times pictured | Newcomers | Shown | Art Agent time |
|---|---|---|---|---|
| An ordinary Frame (only the two of them) | 1 | none | both | 7.8 s |
| The guard's first | 4 | him, once; then none | the Character and him | 5.6–8.1 s (37 s once, with a retry) |
| The guard's second | 4 | none | the Character and him, plus the Persona 2 times in 4 | 4.7–8.9 s |

- **It adds the right person once**: an identity sentence in the Look's own style (name, age,
  build, beard, skin), and reuses it afterwards; the Look stayed at three people. A passing
  mention of "a man" in the story added no one.
- **One reply in nine ran past the length limit** (1,600 tokens, about four times a picture) and
  was retried; the other eight didn't. Worth watching: it's the kind of stall gemma4 showed when
  yes/no answers came first.
- Whether the Persona, watching from a corner, is in the picture varied run to run: a judgement
  call, which Write again settles.

## Clothing carried from picture to picture (2026-10-09, Mac)

gemma-4 26B heretic (`gemma-4-26b-heretic:nvfp4`), prose, Limits off, on a 30-Frame Roleplay
replayed from the Kael tavern's Messages (in which the Persona undresses in stages, a towel comes
and goes, the Character is stabbed, and two men join). Every Frame pictured in order, without and
then with each person's last clothing sentence given to the Art Agent to copy forward (design.md):

- **Without it, clothing was re-imagined every picture**: the Character's clothes were described
  differently from one Frame to the next (a linen shirt, a tunic, "practical garments"), and the
  Persona's dress came back in 6 of the 16 Frames after she had taken it off.
- **With it**, the Character's clothing sentence was the same in all 30 Frames, his wound's blood
  stayed from the stabbing to the end, and the Persona's state followed the story (the dress
  unfastened, a towel, then without it) and never came back.
- **One miss, fixed by the prompt**: she undressed in a Frame whose picture didn't show her, so the
  next picture copied her last-known dress. Told that the story after that Frame wins over the
  copied clothing, the next picture had her undressed, 2 times in 2.
- Passing states stick too: the steam dampened the Character's clothes in one Frame, and "damp"
  carries forward until the story changes it.
- 2 of 30 replies ran past the length limit and were retried (1 in 9 before, with newcomers).
- **Replayed with seed 42** (the same 30 Replies, word for word) after one person per Look
  entry: the two men who come in together joined the Look as two people, each kept in his 11
  pictures, and no reply ran past the length limit. With all four people in a picture, only three
  identities are carried (`MAX_SHOWN`); in the one picture that went wrong, the image model put the
  Persona's top back on though her prompt said she was bare from the waist up.
- **Replayed with the Limits on** (seed 42, same Messages): one Message declined (the towel), no
  nudity in any picture, and her clothing consistent from Frame to Frame (her cloak off, then her
  undergarments, then a wrap). One picture was blocked wrongly by the clothing check: "the two men
  wear…" dressed both men, but the check looked for "man"; a name's plural now counts.

### Where the first picture's clothing comes from (2026-11-03, Mac)

Before anyone had been pictured, the Art Agent had nothing to copy forward. The Scenario's Wears didn't reach it: the Cast summed up a Person's Wears into its appearance, or dropped them, and the Look holds only what doesn't change. With the Limits off, a new Roleplay's first picture showed both men undressed. The Character's Wears was stated in the Scenario, and the Persona had none. Frame 1 replayed straight to Ollama (seeds 1–8):

- **Before:** 7 of 8 clothing sentences dressed no one. They said "wear no visible garments", "obscured by the golden haze", or "no clothes yet, so he is draped in a heavy, dark fabric". One gave "simple, era-appropriate garments".
- **Each Person not yet pictured now starts from their Wears** ("At the start, …" among what each wore when last pictured), and anyone whose clothes aren't given is told to wear what suits them, the story and the moment, unless the story says otherwise. Result: 8 of 8 copied the Character's Wears word for word and dressed the Persona ("simple, soft-textured garments").
- **With both Wears blanked**, the instruction alone dressed both men in 8 of 8 (a dark jacket and trousers, a linen tunic).

## Posing a Character with a ControlNet (open thread)

*Moved from open-threads.md on 2026-11-10, as it stood; its short entry stays there.*

**Posing a Character with a ControlNet** (the owner's idea; first noted 2026-10-09 for mflux 0.22, as composition control). Prompts pose people badly: arms, hands, how someone sits. A ControlNet renders a picture to follow a control picture as well as its prompt; given a pose (an OpenPose skeleton, which a posed 3D figure can make), it directs the body and limbs and leaves the rest to the prompt. The idea: pose a figure (a small 3D mannequin in the app, or a pose picked from saved ones) and render the Frame to it. It pairs with "Reference portraits for Subject consistency" below, a portrait holding the face and the pose the body. What's there: `mflux-generate-qwen-2.1-controlnet` runs Alibaba's Fun ControlNet Union on Qwen-Image 2.1 (one checkpoint for a pose, depth, canny, lineart and more; `--controlnet-strength`, 1.0 the strongest), and mflux 0.23 adds ControlNets for Z-Image (`mflux-generate-z-image-controlnet`) and Krea 2 (`mflux-generate-krea2-controlnet`). All mflux, so the Mac only. *The PC's route* (noted 2026-11-02, from its model card; not downloaded or tried): MOSS-Image's colour/depth control on ComfyUI (`darask0/MOSS-Image-color-depth-control`, Apache-2.0, a community adapter; Comfy-Org repackages it as `moss_image_color_depth_control.safetensors`, supported since ComfyUI 0.43.0), on an Image Model the PC already runs. It takes a depth map (near is white), a colour map (flat colours marking regions, one prompt per colour), or both, and is made for "posing scenes with 3D mannequins and for region-painted layouts": placement, scale and pose follow the map, the prompt the rest. The region prompts could also say where each of two people stands. Its card warns that pose is coarse ("fingers and face details are generated by the model"), that a mannequin's surface can show through unless control ends halfway (`color_end` and `depth_end` 0.5), and that it was checked on a handful of scenes. A first try needs no mannequin: a depth map made from an existing picture. Not downloaded or tried: size, peak memory, speed, and whether it loads from the saved 8-bit copy. The same ControlNet with a depth map is the second way in "The next Frame's picture made from this one", above.

## Reference portraits for Subject consistency (open thread)

*Moved from open-threads.md on 2026-11-10, as it stood; its short entry stays there.*

**Reference portraits for Subject consistency** (rethought 2026-10-06 for mflux 0.21; split from picture edits 2026-10-22). The people in a Roleplay or Storyboard drift between Frames (a new seed, a new face), and the Look's words can only hold them so far. The idea: a portrait of each person, made once from the Look, passed with every render ("image 1 is Kael, image 2 is Elara Vance", then the Image Prompt). Each picture is still composed from its prompt, so the story leads and ADR 0005 holds (the Image Prompt is the state); the portraits only hold faces, hair and build steady. mflux 0.21's `mflux-generate-qwen-2.1-edit` runs Qwen-Image 2.1 with up to ten reference images, the references' attention cached across steps (`--use-kv-cache`, on by default); Viggle's turbo LoRA does it with 1–3 references in 6 steps. *Inputs must be RGB* (noted 2026-10-07): Qwen-Image 2.1's fourth channel is an edit mask, and a transparent input stays transparent, so a reference with alpha would come back see-through where it isn't opaque. ComfyUI's pictures were RGBA with alpha at 240–255 until 2026-10-07 (comfyui.md, "Alpha"), and older ones in Sessions still are: convert them to RGB first. The one deliberate exception is a cut-out on transparency (BiRefNet), e.g. a person alone as a reference. *Tried 2026-10-06* ([bench/reference-portraits](../bench/reference-portraits/README.md)): portraits of Kael and Elara from the Kael tavern Roleplay's Look, then Frames 6, 9 and 12 without and with them. **The portraits hold identity well**: without them Elara is two different women in 9 and 12 and Kael's face changes in 12; with them both match their portraits in every Frame, and the two people stay apart. Costs: 1.4–1.7× the time (122–142 s against 84–86 s at 1024², Mac, some of it likely the edit tool's guidance), the same ~39 GB peak, the full 33 GB weights (the saved 8-bit copy can't take references), and the references pulling against the prompt (wider shots, smaller people; Frame 12 lost Elara's knives). Next: whether prompt wording or guidance fixes the composition, then portraits made once per Roleplay and passed with every render (Qwen-Image 2.1 only). Slots in behind `ImageGenerator`. *Another way, from mflux 0.23* (noted 2026-10-17): `mflux-generate-flux3-edit` runs FLUX.3 Klein (an Image Model since 2026-10-17) with up to ten reference images, in 16 steps, and takes `-q 8` (Qwen-Image 2.1's saved 8-bit copy can't take references). Smaller than Qwen-Image 2.1 (a 5.6B transformer, ~20 GB against 33 GB); mflux's README: an edit is described as a full caption of the result, not an instruction. Not tried: whether its portraits hold identity as well as Qwen-Image 2.1's did, or its speed with references. Nor whether ComfyUI (the PC) can pass references with either model. *When someone's looks change* (noted 2026-10-22): a portrait holds a face against the prompt, so after "I turn into a demon" it would pull the picture back towards the old face. But a Roleplay's pictures already keep the old looks, since the Look is copied word for word into every one ("Bringing a Roleplay's Look up to date with the story", below): portraits make that problem stronger, not new. So a portrait belongs to the Look: made again when the Look is edited (one render), and dropped from a Frame whose prompt changes that person's looks for a while (a disguise, a mask, a one-scene transformation). Re-rendering a Frame from before the change would get the new portrait, as it gets the new Look today. FIBO 2.0 Edit Turbo is another route for these and for idle variant Frames (noted 2026-10-27): 4 steps, up to 5 reference images on mflux and 16 on ComfyUI.

## Bringing a Roleplay's Look up to date with the story (parked)

*Moved from open-threads.md on 2026-11-10, as it stood; its short entry stays there.*

**Bringing a Roleplay's Look up to date with the story** (noted 2026-10-19; parked the same day). The Look is one timeless description, copied word for word into every picture, while how people look depends on when in the story: after a ten-year skip, pictures keep the old age unless the Look is edited by hand, and a Look edit rebuilds every pictured Frame's Image Prompt, so an early Frame re-rendered would show the later looks. Considered: an "Update from the story" button (one Text Model call on request, reviewed before it's saved), which alone has the same problem, and Undo past it leaves the Look ahead of the story; keeping the replaced Look on the Frame for Undo to put back, which fixes Undo only; or Look versions anchored to Frames ("from Frame 40"), each picture using the version in effect at its index, an Undo of that Frame dropping its version, which gets both right but changes what the Look is (an ADR's worth). Parked as too much work for a rare event: edit the Look by hand, and leave early Frames unrendered. Rejected: the Art Agent updating the Look while it pictures (costs every picture, and faces could drift). Trigger to revisit: time skips or lasting changes becoming common in play, or early pictures needing re-renders after one.
