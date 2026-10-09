# Design

How it works, as agreed during design and adjusted since. Which models to run is in
[models.md](models.md). Terms in **bold** are defined
in [CONTEXT.md](../CONTEXT.md). The reasoning behind the bigger choices is in [adr/](adr/).

## What it is

A local roleplay studio that turns stories into pictures. It runs on a Mac with Apple silicon, a
Windows PC with an NVIDIA card, or both together: every AI service sits behind an interface with a
backend per machine (the Text Model on Ollama or a server with the OpenAI chat API, ADR 0008; the
Image Model on mflux or ComfyUI, ADR 0009), and each extra (pictures, Upscale, voices, 3D) is on
where its backend can run (`server/features.ts`). Every Session starts from a **Brief** (typed, or a saved
**Scenario**) and is one of three kinds: a **Chain**, where each Frame is made from the
previous one by an Action; a **Storyboard**, whose Frames are planned together and then edited
and rendered one by one; or a **Roleplay**, a conversation with a Character whose moments can be
pictured and rendered as it goes (see [Roleplays](#roleplays)). In a Chain, each Frame the player writes an **Action** (what to
change), the **Text Model** edits the **Image Prompt**, and the **Image Model** renders it.
There is no score and no end; a Session lasts until it's deleted.

The Image Prompt is one paragraph of nine sentences, one per aspect in a fixed order: subject
and identity → pose and limbs → expression → camera angle and framing → clothing → environment
→ lighting → color → art style and medium ([ADR 0005](adr/0005-image-prompt-is-the-state.md)).
Anything in it can be changed; the engine's four **Limits** are the only lines an Action can't
cross ([ADR 0002](adr/0002-guardrails-enforced-by-the-engine.md)).

The built-in Scenario is the Kael tavern (`scenarios/tavern.md`): an 18th-century tavern on a stormy
night, Kael the Character and a well-off traveller the player.

## The Frame loop

```
Action ──► Limits check (term list; a real-person question if it names someone)
   │           └─ crossed ──► Declined: prompt and image unchanged
   ▼
current Image Prompt + Action ──► Text Model (Text backend) ──► { outcome, narration, prompt }
                                                              │
     engine: declined / unclear / Limit crossed / unchanged? keep the previous prompt and image
                                                              │
                            the paragraph ──► Image Model (Image backend) ──► frame-N-xxxx.png
                                                              │
                                        commit: append the Frame to session.json
```

1. **Limits on the Action.** The Action is checked against the Limits' term list before the Text
   Model is asked. An Action that looks like it names someone (a capitalised full name, "look
   like", "resemble"; names inside a style clause such as "in the style of Michelangelo" don't
   count) also gets a narrow yes/no question to the Text Model about real people. A
   crossed Limit declines the Action at once, naming the Limit.
2. **Text step.** The system message is the engine's rules (the nine sentences and what each
   covers; rewrite only the affected sentences and copy the rest word for word; remove whatever
   a change contradicts; the Limits; the reply format), then the Scenario's notes, plus its **Setup** on the Opening Frame
   only. The user message is **only** the current Image Prompt and the Action; the Text Model
   never sees earlier Frames ([ADR 0001](adr/0001-scene-is-sole-turn-state.md)). The reply is
   constrained by a JSON schema (Ollama's `format`, or the OpenAI API's `response_format`), with `outcome` (`done`, `declined` or
   `unclear`) first, so the model decides before it writes. The Narration is a terse list of what
   changed ("Pose: crouching low. Environment: teal backdrop."). The reply is streamed. With
   **Thinking** on (a Setting, for models that support it) the model reasons first; its
   reasoning streams to the player and is saved with the Frame. Models that can't think are asked
   again without it.
3. **Retry and limits on the call.** An unusable reply (bad JSON, an empty prompt, or
   one cut off by the length cap) is retried once, then the Frame fails. Every Text Model call has
   a token cap (2,048 tokens; 12,288 with thinking; 32 for the real-person question) and a time
   limit (2 minutes; 10 with thinking; 30 s for the real-person question). Small models writing
   JSON under a schema occasionally never stop, padding with whitespace; without the caps one
   such reply blocked Ollama, and every later request behind it, for 14 minutes. A reply cut off
   because the conversation outgrew the backend's context isn't retried: it fails saying so.
4. **Engine rules** ([ADR 0002](adr/0002-guardrails-enforced-by-the-engine.md)):
   - The new Image Prompt is checked against the Limits too; crossing one declines the Action.
   - A **Declined Action** (a crossed Limit, or the Text Model declining it) or an **Unclear
     Action** (the Text Model can't tell what to change, and asks) saves no Frame, as a declined
     Roleplay Message saves nothing: the stream ends with `declined` or `unclear` (`message`), the
     Action stays in the box, and the reason or question shows beside it, amber or blue (since
     2026-10-05; older Chains may still hold Declined and Unclear Frames).
   - A done Frame whose Image Prompt came back unchanged also reuses the previous image.
   - The Opening Frame always counts as done; if its prompt crosses a Limit, it fails.
   - The paragraph is rendered as it is (no "adult, " in front since 2026-10-08; ADR 0002).
5. **Image step.** Images render one at a time across all Sessions: if another Session is
   rendering, this Frame waits in a queue (shown as "Waiting for another render…", and
   cancellable). Then the Session's Image backend renders it with the Session's seed and settings:
   the mflux CLI, one process per image ([ADR 0004](adr/0004-images-from-the-mflux-cli.md)), or a
   workflow queued on ComfyUI, followed over its WebSocket
   ([ADR 0009](adr/0009-comfyui-image-backend.md)). Its step counter is streamed to the player as
   progress. With "Render each Frame" off (a Chain's switch, and always without pictures), this
   step is skipped and the Frame waits for its **Render** button.
6. **Commit.** The Frame is appended to `session.json`.

### All or nothing

A Frame commits whole or not at all ([ADR 0003](adr/0003-turns-are-all-or-nothing.md)):

| What happens | Result |
|---|---|
| Text Model fails twice | Frame fails; Image Prompt unchanged; the Action stays in the text box |
| Image Model fails | Frame fails; Image Prompt unchanged; any partial image is deleted |
| Player presses **Cancel** | Text request aborted; the mflux process killed, or the ComfyUI prompt interrupted; Image Prompt unchanged |
| Opening Frame fails or is cancelled | The Session is discarded; back Home with the error |

While a Frame runs, the new Narration is shown **provisionally** (dimmed) as soon as the Text
Model returns, with "Rendering the image… step 2 of 4" beneath it. It becomes real only when the image
arrives.

Only one Frame runs per Session at a time; the server refuses a second with `409`. Frames, Undo and
deleting a Session all take a per-Session lock *before* reading the Session, so two requests can
never act on the same Session at once (e.g. two tabs sending at the same moment, or an Undo
racing a Frame).

## Storyboards

A Storyboard is started from a Brief and a Frame count (1–32, default 8), then **planned** in one
Text Model call ([ADR 0006](adr/0006-storyboards-plan-in-one-call.md)):

1. **Limits on the Brief:** the term list and, if it names someone, the real-person question.
   The Brief is also checked with the term list when the Storyboard is created.
2. **The plan streams in:** the **Look** (an identity for each person the Brief depicts, and the
   art style, shared by every Frame), the **Beats** (one line per Frame), then each Frame's seven
   sentences (pose, expression, camera, clothing, environment, lighting, color) and who it shows,
   each shown the moment it's complete.
3. **Frames are assembled:** the identities of the people the Frame shows (at most three, the most
   prominent first; none for a picture of the place alone) + the Frame's sentences + the Look's
   style, rendered as it is ([ADR 0012](adr/0012-storyboard-look-lists-each-person.md)). A Frame whose prompt crosses a Limit is saved **blocked** and can't be
   rendered until edited.
4. **All or nothing:** a failed or cancelled plan discards the Storyboard.

After planning, each Frame is independent:

| Operation | What it does |
|---|---|
| **Render** | Renders one Frame through the shared queue; a re-render replaces its image (the old file is deleted once the new one is saved). |
| **Edit by hand** | Replaces a Frame's seven sentences and who it shows; stray labels are stripped. A rendered Frame is marked **stale** until re-rendered. Refused if it crosses a Limit. |
| **Edit the Look** | Edits, adds or removes people, or the style, and rewrites every Frame's prompt; rendered Frames whose prompt changed become stale. Someone renamed stays shown where they were. |
| **Upscale** | As for a Chain Frame (below); a re-render or Undo deletes the upscale with the image. |
| **Edit by Action** | The Text Model rewrites that Frame and who it shows (and the Look, if the Action changes or adds a person, or the style), after the same Action Limits check as a Chain. Declined or unclear Actions change nothing. |

Each Frame records how long its text took (the wait for its part of the plan, or its latest
edit) and its latest render.

## Roleplays

A Roleplay is its own module (`server/roleplay/`, `web/src/roleplay/`), with its own routes
under `/api/sessions/:id/roleplay/` ([ADR 0007](adr/0007-roleplay-is-a-conversation-with-a-cast.md)).

1. **The Cast** (when the screen first opens): one Text Model call writes the **Cast** (the
   Character, the Persona the player plays, the Setting) from the Brief, checked against every
   Limit. The player reviews it: edits it, or has it rewritten. A failed or cancelled first Cast
   discards the Session.
2. **Begin**: the Character's opening Reply, written under the same system message as every
   later Reply (so it follows the Cast as edited), becomes the Opening Frame.
3. **Each Message**: checked against every Limit (the term list, then the real-person question
   if it names someone), then the whole conversation goes to the Text Model: the system message
   (rules, Cast, reply format, Limits; the same every call), the opening Reply, each Message and
   Reply in turn, and the new Message. The Reply streams in field by field (`internal`,
   `actions`, `dialogue`) and is checked for minors (without the colloquial "kid") and sexual
   content. Either declined saves nothing and leaves the Message in the box.
4. **Undo** removes the latest exchange and puts its Message back in the box; the opening can't
   be undone. **The Cast** can be edited by hand at any time; it applies from the next Reply.
5. **Suggest**, beside Send, writes a Message for the player into the box, streamed as it's
   written, to edit or send (nothing is saved, and a sent suggestion is checked like any other
   Message). The Session's Text Model, Thinking off, reads the story as the Persona knows it (each
   Message and what the Character did and said; no thoughts), the Persona, and the player's last
   five Messages with their usual length in words, and writes the next Message as the player would
   type it: their capitalisation, person and length, only the Persona's own actions and words, and
   a move that takes the scene on. Anything already in the box is the player's steer ("ask about
   the cargo"), written out as a whole Message. The suggestion is tidied (an introduction, the
   Persona's name in front, or quotes around it are dropped) and checked against the Limits' term
   list; a failed or cancelled one puts back what was typed. It holds the Roleplay's lock while it
   writes, so a Message can't be sent meanwhile.
6. **Voices**: the Character can speak their lines (`server/roleplay/voice.ts`). The first time a
   line is spoken, the Art Agent's model describes the Character's voice from the Cast in plain
   acoustic terms (`voice.md`: age, pitch, texture, manner), and the voice service designs a voice
   from it as a reference clip (`voice-…wav`, saved with the Roleplay as `voice.ref`). Every line
   is then spoken by cloning that clip (`frame.speech`, `speech-<index>-…mp3`; 96 kbps, a quarter
   of the WAV it was before 2026-10-02, whose lines still play), so the Character
   sounds the same throughout; a line whose `speech.ref` isn't the voice's clip now was spoken in
   an earlier voice. Only `dialogue` is spoken, without emphasis marks; a line of only "…" has
   nothing to say. The description is editable: changing it removes the clip, and the next line
   (or a new take) designs one from the new description. Designing and speaking are queued jobs
   (`voice`, `speak`) that wait their turn in the render queue, so a voice and an image never
   compete for memory. Undo removes the undone exchange's audio. Voices come from the backend
   Settings choose (`voiceBackend`, ADR 0010). The voice service
   (`python/voice/serve.py`, mlx-audio) is a Python process the server starts on first use and talks to
   over HTTP on localhost: Qwen3-TTS VoiceDesign designs, Higgs TTS 3 clones, one model loaded at a
   time and unloaded after a minute unused (it reloads in 2–3 s), its MLX cache cleared after
   every request. ComfyUI (`server/voice/comfyui/`, with TTS Audio Suite's nodes) runs the same two
   models as workflows, keeping no audio (its clips are read from its temp folder and blanked);
   its files are FLAC (`voice-…flac`, `speech-…flac`), and as Higgs takes most of a 12 GB card, the
   Text Model is unloaded before each voice, as before a render. Lines carry no emotion tags: in testing they pulled
   the cloned voice off the Character, up to a woman's pitch (docs/models.md). Each line is
   directed instead: before it's spoken, the Art Agent's model reads the moment (the Message
   before it, what the Character does and thinks) and picks a pace (normal, slow or fast) and a
   sound before it (none, a sigh, a laugh, a cough) (`voice-delivery.md`); the voice service turns
   them into Higgs's pace, pause and sound tags, which held the voice. The pick is saved with the
   line (`speech.delivery`) and shown beside Listen ("slowly, with a sigh"). If directing fails,
   the line is spoken as written, and says so beside Listen (why on hover, `speech.undirected`)
   with **Speak again**. A Reply's thought (`internal`) has its own Listen, hidden with
   the thoughts: it's spoken whispered (Higgs's whispering style, which kept the voice), with a
   pace but never a sound (a cough in the mind sounded wrong), and saved apart from the dialogue's
   (`thoughtSpeech`, `thought-<index>-…mp3`). Speak replies speaks the dialogue only.
   On screen, a Reply with something to say has **Listen**: it plays the line, speaking it first
   (or again, if it was spoken in an earlier voice) and playing it once it's ready. **Speak
   replies** (remembered per browser) speaks each new Reply as it arrives. The **Voice** panel in
   Look & Cast shows the description: **Play voice** plays the reference clip, **New take**
   designs the voice again from the same description, and an edited one is saved with **Save and
   design**. Designing the voice shows its progress there, not on the opening Frame.
7. **3D, by model (experimental)**: each rendered picture has two more buttons, named by the
   model they use, since each is an experiment with its own strengths: **SHARP** (Apple) makes the
   whole picture a 2.5D scene that turns ~30°, and **TripoSplat** (VAST) lifts the person in it
   out as a 3D figure that turns all the way round. Once made, they read **View SHARP** and **View
   TripoSplat**; the viewer (`SceneViewer`, drawn with Spark on three.js, which load only then) is
   titled by model ("Frame 8 · SHARP, 2.5D"). Both are queued jobs (`scene`, `figure`) that wait
   their turn in the render queue, and both are made from the upscale when the Frame has one; a
   re-render or Undo deletes them, and making one again replaces it. A **Chain** has all three
   buttons too, beside Upscale on the shown Frame, queued like a Roleplay's (below); as with the
   upscale, every Frame showing that picture shares what was made from it, and Undo deletes it only
   with the picture.
   - **SHARP** (`server/3d/scene.ts`, `python/sharp/make.py`) turns the picture into about 1.2 million
     Gaussian splats (SHARP works at 1536 px, so the 2048 px upscale has more to give it; a scene
     made before its picture was upscaled offers **SHARP again from upscale**). SHARP peaks near
     15 GB; each scene runs `uv run python/sharp/make.py` once, like mflux once per picture, so the memory
     is freed when it's done (~11 s on the Mac: 4 s loading, 6 s making; ~31 s on an RTX 4070,
     peaking at 11.9 GB of its 12). The scene is saved lossless
     (`scene-<index>-….ply`, ~63 MB) as `frame.scene`, with the picture it was made from (`from`)
     and what the viewer needs: the depth to orbit around (a quarter of the splats are nearer, so
     near subjects stay in view) and the camera SHARP assumed (a 30 mm lens, as a vertical field
     of view and an aspect), so the viewer opens on exactly the picture's view. It turns 15° or 30°
     either way, or back to the picture's view; dragging turns it freely. Esc, Close or a click outside the scene closes it, as in the picture viewer, but a turn let go past the scene's edge doesn't (VueUse's `onClickOutside`). SHARP invents what the
     picture never showed, so the further it turns, the more is made up. Its limits (a fixed
     splat count, what turning shows) are in docs/research/image-to-3d.md.
   - **TripoSplat** (`server/3d/figure.ts`, `python/triposplat/make.py`; its code is vendored in
     `python/triposplat/vendor/`, MIT) cuts the person out of the picture, leaves the room behind, and
     builds them whole, back included, as 524,288 Gaussians (past TripoSplat's cap of 262,144,
     which is only an input check): `frame.figure`, `figure-<index>-….ply`, ~34 MB. Anyone
     overlapping them takes parts of them away, and two people in the picture may come out as one;
     it's best with one person, unobstructed (docs/research/image-to-3d.md, "TripoSplat trial").
     ~75 s and ~11 GB on the Mac; ~52 s and 6.5 GB on an RTX 4070. It's given the picture as RGB,
     so it always cuts the person out (it takes any alpha below 255 for a cut-out already made).
     The viewer orbits a figure round its middle from the front, with turns to
     the sides and the back.
   - **LiTo** (Apple, `python/lito/make.py`, through mlx-spatial at a pinned commit) does the same job:
     its button sits beside TripoSplat's, and its figure is kept apart (`frame.lito`,
     `lito-<index>-….ply`, its own job kind `lito`). The script cuts the person out with
     TripoSplat's BiRefNet (LiTo reads the picture's alpha), runs LiTo, and scales the result to
     ~1 unit tall; LiTo writes its own axes, so the viewer stands it up with a quarter turn about x
     instead of TripoSplat's half turn. ~400k splats with full view-dependent colour (~95 MB),
     ~4½ min on the M5 Pro. Apple Silicon only (mlx-spatial is MLX; Apple's own code is Linux and
     Mac only). LiTo's weights are research-only. It made the cleanest profile of the
     figure models tried (docs/research/image-to-3d.md).

The prompts are Markdown files in `server/prompts/roleplay/` (`cast.md`, `cast-request.md`,
`character.md`, `opening-request.md`, `limits.md`, `limits-adults-only.md`, and Suggest's
`suggest.md`, `suggest-request.md`, `suggest-limits*.md`, and the voice's `voice.md`), each with a note at
the top saying when it's used and what it's filled with; edits apply on the next call. A Chain's
and a Storyboard's are the same way, in `server/prompts/chain/` and `server/prompts/storyboard/`
(moved out of `server/textModel.ts` on 2026-10-06, word for word), with what both use (the
nine-sentence format, how a changed sentence replaces the old, their Limits, the Scenario's notes
and Setup, the real-person question) in `server/prompts/shared/`.

**Pictures, renders and upscales are queued jobs** (`server/jobs.ts`, one queue for every
Session). What every kind does to a Frame's picture (upscale, SHARP, TripoSplat, LiTo) is one
module, `server/pictureJobs.ts`; each kind's `jobs.ts` adds its own: `render` of a Frame made without its picture for a Chain, `render`
for a Storyboard (`server/storyboard/jobs.ts`), and pictures, renders and voices for a Roleplay
(`server/roleplay/jobs.ts`). A Roleplay's and a Storyboard's re-render share `replacePicture`
(`server/frames.ts`), which drops the old picture's upscale and 3D. The player can ask for several
and carry on with the conversation, a Chain's next Action or a Storyboard's edits; a job waiting
on a picture can be queued behind the render or picture job that will make it. Each Session runs its jobs one at a time, in the order asked (renders,
upscales and 3D also wait their turn in the render queue every Session shares). Jobs don't hold the
Session's lock; every change to a Roleplay or a Chain (a Reply, a picture, a render, a Chain Frame,
an Undo) is saved by reloading it and applying just that change, one at a time
(`server/update.ts`), so none overwrites another. A Chain queues `upscale`, `scene`, `figure` and
`lito`; a Chain Frame that reuses the picture before it takes what has been made from it by then. The queue lives in memory: restarting the
server forgets it. A job asked for before what it needs exists (a render queued behind its
picture) waits its turn and fails with a reason if that still isn't there; failed jobs stay
listed, with **Retry** (back to the end of the queue) and **Dismiss**. Undoing an exchange (or a
Chain Frame) cancels its jobs; deleting the Session cancels all of them. On the screen, a
Roleplay's Replies each list their jobs with Cancel (the running one sweeps its Reply), and a
**Queue** lists them all: a tab beside **Look & Cast**, or atop a Chain's Frames while there are
any (a Chain lists them only there, so the picture keeps its room; the running job sweeps the
picture it's working on). Clicking one goes to its Frame. The screens share this (`useJobs`,
`FrameJobs`, `JobQueue`).

**Picturing a Frame** (the Art Agent; by the Session's Text Model, or the Art Agent model set in
Settings, recorded on each picture as `pictureModel` and on the Look as `lookModel`): **Picture this** under a Reply writes
that Frame's Image Prompt, in the same shape as a Storyboard Frame's. The first time, a call
writes the Roleplay's **Look** from the Cast and Brief: an identity sentence for the Character,
one for the Persona, and the art style, fitted to the story's period. Then a call reads the story
up to the Frame (each Message and what the Character did and said; thoughts left out, as a
picture can't show them), says whether each person is in the picture (someone upstairs or gone
isn't; if neither is, the picture is of the place alone, with no identity sentences and nothing
said about people or their absence), and writes the Frame's seven sentences, each capped at 280 characters, as a third-person
view of that moment (or, with Settings → Art Agent style set to tags, a few short tags per aspect,
recorded as `pictureStyle` and shown as "as tags"; prose is the default, as it did better, see
[models.md](models.md)). The Image Prompt is the identity sentences of the people shown, those
sentences, then the style; a picture that crosses a Limit is written once more, told which; it's checked against the Limits in
force and shown under the Reply (marked if it crosses one). While a Frame is pictured, the light
sweeps round that Reply, which says "Picturing this moment…" (or "Writing the Look, then
picturing…") with its own Cancel; the conversation doesn't scroll, and the text box stays still
and usable, with Send waiting until the picture is done. With the Limits on, a picture of both people must name what each
wears in its clothing sentence, or it's blocked (and written once more): told to keep within the
Limits, the Art Agent sometimes left an undressed person's clothing out instead of dressing them.
**Render** / **Re-render** under a pictured Reply renders it through the shared render queue with
the Session's Image Model, seed and size, and shows the picture beside its Reply (below it on
windows under 1024 px). Clicking a picture opens it in a viewer (`FrameViewer`, shared with the
Chain and Storyboard screens: `ImageViewer`, a dialog around `FrameImage`, which zooms and pans
only there); Esc, Close or a
click outside the image dismisses it, and "Open full size" opens the file itself. In the viewer,
← and → (or ‹ ›) step to the previous or next rendered Frame, scrolling the conversation behind to
it,
with progress, the sweep and Cancel in place; **Upscale** works as on any Frame. Picturing a
rendered Frame again, or editing the Look, marks its picture "Changed since render" until it's
re-rendered; Undo deletes the undone exchange's picture. For debugging, each picture's time and the Art
Agent's reasoning (when Thinking is on) are saved on the Frame (`pictureTimings`,
`pictureThinking`) and the Look's on the Session (`lookTimings`, `lookThinking`); the Image
Prompt block shows the time, with the reasoning collapsed under it. While the Limits are on, the Art
Agent is told to dress anyone the story has undressed; while they're off, only that everyone shown
is an adult. The Look is editable in the side panel, rewriting every pictured Frame. Replies are
written with Ollama's `repeat_penalty` 1.15 over the whole conversation, which stopped long
Roleplays looping on their own refrains.

A Scenario can start a Roleplay too: its Setup facts and Opening serve as the Brief (its notes,
written for image prompts, are left out).

## Consistency

- **Seed:** fixed for the whole Session: the fixed seed from Settings (on its own Seed tab), or a
  random one picked when the Session starts. Everything the Session makes is seeded from it
  (2026-10-08; ADR 0011): pictures and upscales with the seed itself; each spoken line with the seed
  plus its Frame's index; each take of the voice with the seed plus how many takes came before; and
  each Text Model call with the seed plus a hash of what's asked plus how many times the Session
  asked it before (`server/text/seeded.ts`). So a fixed-seed Session played the same way asks with
  the same seeds, while a retry, a second Suggest or a new take gets a new one. On the Mac's Ollama
  (2026-10-08) the same seed and prompt gave the same reply word for word, and the next seed a
  different one. 3D figures (TripoSplat, LiTo) always use seed 42 for now; SHARP samples nothing.
- **Subject description:** carried in the first sentence (subject and identity), which the Text
  Model copies word for word unless an Action changes it.
- **Settings are copied into each Session when it starts,** so changing Settings mid-Session
  never changes the Image Model, seed or size of a running Session. Changes apply from the next
  Session.

In testing, FLUX.2 Klein 4B keeps a person's face, hair and outfit consistent across Frames. Z-Image
Turbo ignores a described appearance. For drift, see *reference images and edits for Subject
consistency* in [open-threads.md](open-threads.md).

## Screens

- **Home** (`/`, also reached by clicking **Local Roleplay Studio**): **Your Sessions**, one card per saved
  Session, newest first: the latest rendered image, its title (the Scenario, or the start of the
  Brief), its kind (Chain or Storyboard), the Frame count, when it was last played,
  and what a running Frame is doing ("Writing…", "Waiting to render…", "Rendering…"; the list
  refreshes every 2 s while anything runs). Hovering a card shows **Delete**, which asks for
  confirmation and is disabled while that Session has a Frame running. Below, **Start a new
  Session**: the kind (Chain or Storyboard), then Scenario cards (a lone Scenario is preselected)
  or **Your own Brief** (a text box, up to 4000 characters), the Frame count for a Storyboard
  (1–32, default 8), a report of any Scenario files that failed to load, and the current Text and
  Image Models. Start is blocked, with the reason shown,
  if no Text Model is set or the chosen one is no longer installed.
- **Session** (`/sessions/:id`): the image fills everything above a fixed-height text box, so
  it never resizes as the text changes. **Render each Frame** (beside the picture buttons; the
  Chain's own switch, saved with it as `renderFrames`) is on when pictures are available: each
  Action writes the new prompt and renders it. Off (and always, without pictures) each Action
  writes only the prompt; the Frame reads "Not rendered yet", with a dashed thumbnail, and its
  **Render** button queues the picture, which every Frame sharing that prompt then shows. A Chain
  Frame's picture never changes once made, so there's no Re-render. The Narration is a caption over the bottom of the photo
  (provisional text shows dimmed and in italics while a Frame runs); the caption can be hidden,
  and that choice is remembered per browser. The Frame's status ("Rendering the image… step 2 of 4") is a
  pill in the image's top corner. Enter sends; Shift+Enter adds a new line. A done Frame clears the text box; a declined or
  unclear Action makes no Frame at all and stays there to reword. While a Frame runs,
  the text box is locked and **Cancel** replaces **Send**; a failed Frame's error shows in the
  button row. Typed text is always treated as an Action; there are no typed commands.
  The right side has two panels: side by side on wide windows (1280 px and up), as tabs on
  narrower ones. **Frames list** shows a thumbnail, the Action and the Narration per
  Frame; clicking one shows that Frame. While an earlier Frame is shown, a pill on the image reads
  "Viewing Frame 1 of 4 · Back to latest", and the text box shows the Action that made that
  Frame, read-only (still selectable, to copy), with Send disabled; "Back to latest" brings your
  draft back. Actions always build on the latest Frame, never on the one being viewed. Declined Frames are labelled and tinted amber, Unclear
  Frames ("Didn't understand") blue, both in the log and on the caption. **Prompt** shows the
  viewed Frame's timings ("Text 9.8 s · Waited 12.3 s · Image 5.1 s", or "Image reused"; also
  saved per Frame in `session.json`), its Image Prompt as a word-level diff against the Frame before it (added words
  highlighted, removed words struck through; a "Show removed words" switch hides the struck-out
  words, remembered per browser), then its thinking (collapsed, when there was any).
  While a thinking model reasons, the reasoning streams into the caption area under
  "Thinking…" and gives way to the Narration once it arrives. Because the Session id is in the URL,
  reloading the page keeps you in the Session. While the Text Model writes the new prompt, a blue-to-violet light
  sweeps around the text box; while an image renders, the same light sweeps around the
  image frame's edge, sized to the image; while it waits in the render queue the sweep is slower
  and dimmer. A new image replaces the last at once when a new Frame arrives or another is picked
  (the 700 ms crossfade went on 2026-10-06: browsing a Storyboard waited on it); the next image is
  preloaded first, so there is no blank frame.
  **Upscale** (beside Send; with the 3D buttons in `PictureButtons`, shared by every kind) enlarges the shown Frame's
  image to 2048 px on its shortest edge with the SeedVR2 model chosen in Settings (7B by default, or 3B;
  `mflux-upscale-seedvr2`, or ComfyUI's built-in SeedVR2 when Settings' "Upscale with" says ComfyUI,
  whichever backend rendered), through the
  same render queue, with the same sweep and step count, queued as a job so the next Action (or
  edit) needn't wait. The original stays as the thumbnail; the
  main view shows the upscaled image. The button reads **Upscaled**, disabled, once done, and
  every Chain Frame that reuses that image shares the upscale (saved as `upscaled` on the Frame,
  in a `-2048` file next to the original). Hovering the image shows its size in pixels in the top-left
  corner ("768×512", then "3072×2048" once upscaled), except while the status pill is there.
  Clicking the image opens it in the same viewer as a Roleplay's pictures (`FrameViewer`; ← and →
  step through the Frames), and so does a Storyboard's. Only there does it zoom: pinching the
  trackpad, or a mouse wheel (25% a notch; Windows has no pinch on a mouse), zooms the image, not
  the page (up to 8×, toward the pointer, with the zoom level added to the size chip); while
  zoomed in, two-finger scrolling or dragging pans, and a double-click resets. A wheel's notch is
  told from a trackpad's scroll by its deltas: lines, or whole pixels of 50 or more straight up or
  down, against a trackpad's small, fractional, often diagonal ones (`usePinchZoom`). Each new image starts unzoomed. The 3D buttons (`Frame3dButtons`) and their viewers
  (`Frame3dViewers`) are shared with Roleplay too.
- **Storyboard** (`/storyboards/:id`): opening a new Storyboard plans it straight away. The
  Frames list fills in as the plan streams: Beats first (each marked "Writing…"), then each
  Frame's sentences; the status pill counts "Writing Frame 3 of 8…". The main area shows the
  selected Frame's image (or "Not rendered yet"), its Beat as a caption and a pill with its status:
  **Draft** (never rendered), **Rendered**, **Changed since render** (stale) or **Blocked**. Below
  it: an Action box that edits the selected Frame (Enter sends; a declined or unclear Action stays
  to reword; the Narration shows in the button row), the picture buttons every kind shares
  (**Render**/**Re-render**, **Upscale**, SHARP, TripoSplat, LiTo), each queued as a job, and
  **Render all (N)**, which queues a render of every draft or stale Frame not already queued,
  skipping blocked ones. Editing carries on while they run. The Frames list shows the queue above
  each Frame's thumbnail (dimmed when stale), Beat and status (or the job working on it). The Prompt panel has the **Look** (each person's name and identity in a card of their
  own, which collapses to the name and a preview; people can be added or removed; and the art style, saved for every Frame) and the selected Frame's **Shows**
  toggles (a person each) and seven sentences, each editable by hand with its own Save, then the full
  prompt and the Frame's timings. The panels, the render sweep and the unsent Action (remembered
  per Session) work as on the Session screen. A Chain opened at a Storyboard's address, or the
  other way round, is sent to its own screen.
- **Roleplay** (`/roleplay/:id`): a new Roleplay opens on its Cast, written from the Brief, with
  **Begin** and **Rewrite Cast** in the conversation area; Begin saves any unsaved Cast edits
  first, and the text box stays locked until the scene begins. Then the conversation fills the
  main area: the player's Messages
  on the right, the Character's Replies on the left, each as the thought (small, muted; hidden
  with **Hide thoughts**, remembered per browser), the actions in italics and the dialogue in
  quotes. While the Character replies, the Message shows at once and the Reply fills in field by
  field, with the same light sweeping round the text box. Enter sends; Cancel, Undo and the
  unsent Message (remembered per Session) work as on the Session screen. The right panel is the
  Cast, editable, with **Save Cast**. On Home, a card without a picture shows text in its place: a
  Roleplay's the Character's latest line (in quotation marks), a Chain's its latest Narration, a
  Storyboard's its first Beat. In the Look & Cast panel every text box grows to fit its text (no inner scrolling, so the
  panel scrolls as one) and collapses to a one-line preview by its label, remembered per browser
  (`CollapsibleTextarea`, sized by VueUse's `useTextareaAutosize`).
- **Navigation:** **Local Roleplay Studio** (the app's name) leads Home; **Current Session** leads back to the Session opened last
  (remembered per browser), and isn't shown when there is none. Up to five Session screens stay alive in
  memory while you visit Home, Settings or other Sessions, so each keeps its half-typed Action,
  viewed Frame, tab and any running Frame. The unsent Action is also saved per Session in the
  browser, so it survives a reload. Returning to a Session re-checks it with the server (unless a
  Frame is running there); a Session deleted meanwhile sends you Home. While a Session's Frame is
  **waiting in the render queue**, you can't leave that Session within the app either (links and
  Back are blocked) until it starts rendering or you cancel it. Reloading, closing the tab or leaving the
  site drops the page's connection to a running Frame, which **cancels** it (the Action stays in
  the text box, and a cancelled Opening Frame discards the Session); so while a Frame runs, the
  browser asks "Leave site?" first. A Session screen that finds a Frame already running which it
  didn't start (from another tab, or a screen that dropped out of memory) shows its progress with
  **Cancel** and follows it until it finishes. A Session in the background never navigates
  on its own: if its Opening Frame fails there, you're taken Home with the reason when you return
  to it.
- **Settings** (`/settings`): the Text backend (Ollama, or a server with the OpenAI chat API, with its
  address and API key: ADR 0008), Text Model (the backend's models; on Ollama minus OCR and dedicated
  vision-language models), Thinking (on or off; only for models that support it), the Image backend (mflux, or ComfyUI with
  its address: ADR 0009), Image Model (the backend's own), steps (reset to the model's default when the Image Model
  changes), quantization (8 or 4 bit, converted as the model loads), float16 (on by default, for the
  models that take it: faster on M1 and M2 Macs, the picture slightly different), size (six presets from 512×512 to 1216×832), Upscaler (SeedVR2 7B or 3B) and where it runs ("Upscale with": mflux, or
  ComfyUI at the address on the same tab, which may be another machine), Art Agent model (the model
  that pictures Roleplay Frames, with Thinking off, or "Same as the Text Model"), Art Agent style
  (prose, recommended, or tags), Limits (on by default; off leaves only "everyone depicted is an
  adult") and, on its own Seed tab as it seeds every model, the seed (random per Session, or
  fixed). Settings are copied into a Session when it starts, except the Upscaler and where it runs,
  Art Agent model and style, and Limits, which apply at once.
- **Theme:** Light (a parchment tint), Dark or System, remembered per browser. It's a display
  preference, not a Setting.

**Undo** removes the latest Frame: the previous Frame's Image Prompt is current again, its image is
deleted unless an earlier Frame still shows it, and the undone Action goes back into the text
box (unless you've started typing a new one). It's offered in the button row and on the latest
Frame in the Frames list, never for the Opening Frame, and never while a Frame runs. Image files carry
a random suffix, so a Frame made after an Undo never reuses the undone Frame's file name, and the
browser can't show a stale cached image.

There is no End or Reset. A Session is simply left and returned to; to start over, start a new
Session from Home, and delete old ones there.

## Storage

| What | Where | Notes |
|---|---|---|
| Settings | `settings.json` | Missing, corrupt or invalid → defaults; missing fields filled from defaults |
| Scenarios | `scenarios/*.md` | Read fresh on every request, so edits need no restart |
| Sessions | `sessions/<id>/session.json` + `frame-N-xxxxxxxx.png` | Id is `YYYYMMDD-HHMMSS-xxxx`; files are written to a temp file, then renamed |

## API

All under `/api`; the Vite dev server proxies it to the Deno server.

| Route | Purpose |
|---|---|
| `GET /health` | Liveness |
| `GET`, `PUT /settings` | Read or save Settings (`400` with a list of issues if invalid). `textApiKeySet` says whether an API key is saved; a `textApiKey` in a `PUT` replaces it (`''` removes it) |
| `GET /settings/options` | Text Models from the saved Text backend, Image Models, size presets; still answers if the backend is down |
| `POST /settings/text-models` | The models on a Text backend not saved yet (`textBackend`, `textBaseUrl`, optional `textApiKey`) |
| `GET /scenarios` | Scenario summaries plus files that failed to load |
| `GET /sessions` | Session summaries, newest first, with each one's current activity |
| `POST /sessions` | Start a Session: `{ kind?: "chain" \| "storyboard" \| "roleplay", scenarioId \| brief, frameCount? }`; every kind starts without pictures (a Chain then with `renderFrames` off) |
| `PUT /sessions/:id/render-frames` | Chain: whether each new Frame is rendered as it's made, `{ renderFrames }` (`409` to turn it on without pictures) |
| `DELETE /sessions/:id` | Delete a Session and its images (`409` while a Frame runs) |
| `GET /sessions/:id` | A Session with its Frames, plus `activity`: what a running Frame is doing, or `null` |
| `POST /sessions/:id/frames` | Chain: run a Frame (`{ action }`, or `{}` for the Opening Frame) as a server-sent event stream |
| `POST /sessions/:id/plan` | Storyboard: plan it, streaming `look`, `beats`, `planned-frame` × N, then `planned` |
| `POST /sessions/:id/frames/:index/edit` | Storyboard: edit one Frame by `{ action }`, streaming then `edited` (`outcome`, `narration`, `session`) |
| `PUT /sessions/:id/frames/:index` | Storyboard: replace a Frame's sentences and, if given, who it shows, `{ body, shown? }` (`422` if it crosses a Limit) |
| `PUT /sessions/:id/look` | Storyboard: replace the Look, `{ people: [{ name, identity }], style }` |
| `POST /sessions/:id/cancel` | Cancel the Frame in progress |
| `DELETE /sessions/:id/frames/:index` | Undo the latest Frame; `:index` must name it (`409` otherwise, and for the Opening Frame or while a Frame runs) |
| `GET /sessions/:id/images/:file` | A Frame's image, a Roleplay's audio (`voice-…wav`, `speech-…mp3`, `thought-…mp3`, or `.wav` from before), or a Roleplay Frame's 3D scene (`scene-…ply`), or a 3D figure (`figure-…ply`, `lito-…ply`) |
| `POST /sessions/:id/roleplay/cast` | Roleplay: write (or, before it begins, rewrite) the Cast, streaming `phase`, `thinking`, then `cast` (`cast`, `session`) |
| `POST /sessions/:id/roleplay/begin` | Roleplay: the opening Reply, streaming `reply-part` per field, then `replied` (`frame`, `session`) |
| `POST /sessions/:id/roleplay/messages` | Roleplay: send `{ text }`, streaming `reply-part` (`key`, `value`) per field, then `replied`, or `declined` (`message`) |
| `POST /sessions/:id/roleplay/suggest` | Roleplay: suggest a Message from `{ draft? }`, streaming `suggestion-part` (`text`, all of it so far), then `suggestion` (`text`, tidied); nothing is saved |
| `DELETE /sessions/:id/roleplay/frames/:index` | Roleplay: undo the latest exchange (`409` for any other, and for the opening) |
| `GET /sessions/:id/jobs` | Roleplay or Chain: its background jobs (picture, render, upscale, voice, speak, scene, figure, lito): running, queued, then failed, each with its `phase`, `progress` or `error` |
| `POST /sessions/:id/jobs` | Every kind: a Chain `upscale`, `scene`, `figure`, `lito`, and `render` of a Frame made without its picture; a Storyboard `render` too; a Roleplay all. Queue `{ kind: "picture" \| "render" \| "upscale" \| "voice" \| "speak" \| "speak-thought" \| "scene" \| "figure" \| "lito", frameIndex }` (`voice` designs a new take of the Character's voice; `speak-thought` speaks the Frame's thought, whispered; `scene` makes the picture into a 2.5D scene (SHARP); `figure` lifts its person out as a 3D figure (TripoSplat), and `lito` does so with LiTo; `409` to speak a Frame with nothing to say aloud, or no thought, or to make a picture job on a Frame with no picture and no render or picture queued to make one, or to render a blocked Storyboard Frame (`422`)); returns the queue (asking twice for the same job queues it once) |
| `POST /sessions/:id/jobs/:job/retry` | Roleplay or Chain: put a failed job back at the end of the queue (`404` if there's no such failed job) |
| `DELETE /sessions/:id/jobs/:job` | Roleplay or Chain: cancel a queued or running job, or dismiss a failed one |
| `PUT /sessions/:id/roleplay/look` | Roleplay: replace the Look, `{ subject, style }`, rewriting every pictured Frame (`400` if incomplete, `422` if it crosses a Limit) |
| `PUT /sessions/:id/roleplay/voice` | Roleplay: replace the voice description, `{ description }`, dropping the voice's clip until it's designed again (`400` if empty, too long, or it crosses a Limit) |
| `PUT /sessions/:id/roleplay/cast` | Roleplay: replace the Cast (`400` if incomplete or the Character is under 18, `422` if it crosses a Limit) |

A Frame's stream emits `phase` (`text`, then `queued` if another Session is rendering, then
`image`), `thinking` (reasoning chunks; `restart` when a retry begins afresh), `text` (the provisional Image Prompt and Narration),
`progress` (image steps), then exactly one of `committed`, `failed` or `cancelled`.
`sessionDiscarded` on the last two tells the client that an Opening Frame took the Session with it.

## Stack

Deno workspace: `server/` (Deno HTTP, no framework) and `web/` (Vue 3, Vite, Tailwind 4,
vue-router, VueUse), both run by Deno. VueUse handles the browser plumbing: the theme
(`useColorMode`), growing text boxes (`useTextareaAutosize`), event listeners and the server check
(`useEventListener`, `useIntervalFn`). Everything remembered per browser (toggles, drafts, the
theme, Play's last Session) goes through one helper, `useStoredString` in
`web/src/composables/storage.ts`: saved at once, never synced from other tabs (each tab keeps its
own draft), and held in memory for the visit when the browser blocks storage. Polling stays
hand-written: each poll has its own rules for when to stop. Tests: `deno test` for the server, Vitest with happy-dom for the
web app. The mflux CLI is also exercised in tests through a fake executable, and ComfyUI's API
through a fake server (HTTP and WebSocket).

## Decisions log

The design Q&A, and what changed later.

| Decision | Chosen | Changed since |
|---|---|---|
| Premise | One picture of a fictional adult Subject, changed step by step, with guardrails | Now a local roleplay studio: Roleplays, Chains and Storyboards |
| Goal | Open sandbox; no scoring | — |
| Backend | Deno HTTP server; Vite proxies `/api` | — |
| Images | mflux CLI per image, behind `ImageGenerator` | Downloads blocked (ADR 0004); since 2026-10-02 allowed on first use, shown as downloading; since 2026-10-07 also a ComfyUI server, chosen per Session (ADR 0009) |
| Text | Ollama, behind `TextModel` | Since 2026-10-06 also any server with the OpenAI chat API, through one `Chat` interface (ADR 0008) |
| Where it runs | A Mac with Apple silicon | Since 2026-10-07 also Windows with an NVIDIA card (ComfyUI, SHARP, TripoSplat), or both together |
| Frame state | The Scene only, no history (ADR 0001) | The Image Prompt: one paragraph of nine sentences (ADR 0005) |
| Text Model output | One JSON call | `{ outcome, narration, prompt }`, the prompt as one paragraph |
| Settings | Server-side `settings.json`; apply from the next Session | Small sizes added |
| Side panel | Frames list with thumbnails; End/Reset as buttons only | End and Reset removed; Sessions are listed, opened and deleted on Home |
| Several Sessions rendering | Queue images one at a time across Sessions | A queued Frame keeps you in its Session |
| What an Action can change | Pose, camera, lighting, set, per Scenario | Anything in the prompt, within the four Limits |
| Limits | Per-Scenario brief, character refusals | Four engine Limits: term list + real-person check (ADR 0002) |
| Narration | Character prose | A terse list of what changed |
| Every Frame renders | Yes; no separate "take the shot" | A Chain's "Render each Frame" can be switched off (2026-10-06) |
| Subject consistency | Fixed description + fixed seed; edit-based rendering deferred | — |
| Failures | All or nothing (ADR 0003) | — |
| Waiting | Show text first, then the image, over SSE | Step progress added |
| During a Frame | Text box locked; Cancel button | — |
| Scenario format | Markdown with YAML frontmatter in `scenarios/` | — |
| Persistence | Sessions saved to disk; resume UI deferred | — |
| Toolchain | Deno for everything | `vue-tsc` runs on Node |
