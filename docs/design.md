# Design

How it works, as agreed during design and adjusted since. Which models to run is in
[models.md](models.md). Terms in **bold** are defined
in [CONTEXT.md](../CONTEXT.md). The reasoning behind the bigger choices is in [adr/](adr/).

## What it is

A local roleplay studio that turns stories into pictures. It runs on a Mac with Apple silicon, a
Windows PC with an NVIDIA card, or both together: every AI service sits behind an interface with a
backend per machine (the Text Model on Ollama or a server with the OpenAI chat API, ADR 0008; the
Image Model on mflux or ComfyUI, ADR 0009), Settings list the Backends on each machine and which
each kind of work prefers (ADR 0022), and each extra (pictures, Upscale, voices, 3D) is on where a
Backend can run it (`server/features.ts`). Every Session starts from a **Brief** (typed, or a saved
**Scenario**) and is one of three kinds: a **Chain**, where each Frame is made from the
previous one by an Action; a **Storyboard**, whose Frames are planned together, reviewed and written
out from the plan, then edited and rendered one by one; or a **Roleplay**, a conversation with a Character whose moments can be
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
     engine: declined / unclear / Limit crossed / unchanged? save no Frame
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
   only. The user message is the current Image Prompt and the Action, and nothing else of earlier Frames
   ([ADR 0001](adr/0001-scene-is-sole-turn-state.md)) but who has been in the picture and isn't now, each
   as last described (`peopleAway`), so someone who left comes back described as before (since 2026-10-16).
   The subject sentence describes each person in the picture ("Kael is …; the traveller is …"), and the
   others are about every person shown. The reply is
   constrained by a JSON schema (Ollama's `format`, or the OpenAI API's `response_format`), with `outcome` (`done`, `declined` or
   `unclear`) first, so the model decides before it writes. The Narration is a terse list of what
   changed ("Pose: crouching low. Environment: teal backdrop."): the model's own account, not
   checked against the prompt, so it can miss or overstate a change; the Prompt tab's word diff is
   always right. The reply is streamed. With
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
   - A done Action whose Image Prompt came back unchanged saves no Frame either (since
     2026-10-10; it used to reuse the previous picture): there'd be nothing new to see, and it's
     often a Narration claiming a change the prompt doesn't have. The stream ends with
     `unchanged`, and "Nothing in the picture changed. Try rewording the Action." shows in blue.
     So every Chain Frame has a picture of its own.
   - The Opening Frame always counts as done; if its prompt crosses a Limit, it fails.
   - The paragraph is rendered as it is (no "adult, " in front since 2026-10-08; ADR 0002).
5. **Image step.** Images render one at a time on each machine, across all Sessions (ADR 0020): if another Session is
   rendering there, this Frame waits in a queue (shown as "Waiting for another render…", and
   cancellable). Then the Session's Image backend renders it with the Session's Image Model, steps
   and seed, and the rest as Settings are now (size, step cache…; see Consistency):
   the mflux CLI, one process per image ([ADR 0004](adr/0004-images-from-the-mflux-cli.md)), or a
   workflow queued on ComfyUI, followed over its WebSocket
   ([ADR 0009](adr/0009-comfyui-image-backend.md)). When its turn comes, the Text Model is unloaded
   first if it runs on the same machine as the render
   ([ADR 0013](adr/0013-unload-the-text-model-on-the-job-machine.md)). Its step counter is streamed to the player as
   progress. On ComfyUI the player also **watches the picture form**: the render asks for a
   preview at each step (a half-size JPEG, at no cost: research/comfyui.md), the server keeps the
   latest per Session in memory only (`server/previews.ts`, never in the Session's folder) and
   serves it at `GET /sessions/:id/preview`, and the browser asks for it again at each step. A
   new Chain Frame shows it alone, in the new Frame's empty frame; a re-render (a Storyboard
   Frame, a Roleplay picture) lays it over the old picture, more opaque as the steps go (the first
   ones are dark smudges). The new picture then replaces it. Settings → "Show the picture forming" turns it off; mflux sends
   none, so its renders keep only the border sweep. With "Render each Frame" off (a Chain's switch, and always without pictures), this
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

While a Frame runs, it has its place at the end of the Frames list from the moment the Action is
sent (its number, the Action, what it's doing, then its Narration), and it's what the screen shows:
an empty frame, until its picture forms (on ComfyUI) or arrives. The new Narration is shown
**provisionally** (dimmed) as soon as the Text Model returns, with "Rendering the image… step 2 of
4" beneath it, and the Prompt tab shows the new prompt. It becomes real only when the image
arrives; a declined, failed or cancelled Frame leaves the list. Earlier Frames can be looked at
meanwhile, and picking the new one goes back to it.

Only one Frame runs per Session at a time; the server refuses a second with `409`. Frames, Undo and
deleting a Session all take a per-Session lock *before* reading the Session, so two requests can
never act on the same Session at once (e.g. two tabs sending at the same moment, or an Undo
racing a Frame).

## Storyboards

A Storyboard is started from a Brief and a Frame count (1–32, default 8), then made in three steps ([ADR 0019](adr/0019-storyboards-plan-review-write.md)): **planned**, reviewed by the player, then **written** a Frame at a time.

1. **Limits on the Brief:** the term list and, if it names someone, the real-person question. The Brief is also checked with the term list when the Storyboard is created.
2. **Plan**, one Text Model call, streaming in: the **Look** (an identity for each **Subject**: everyone and everything the story follows, people, creatures, animals and objects with a part of their own, each named, a group that looks alike as one; and the art style, shared by every Frame), then the **Beats**, one line per Frame with who it shows, each shown the moment it's complete. All or nothing: a failed or cancelled plan discards the Storyboard.
3. **Review:** the plan waits for the player. The Look (names, identities, the style) and each Beat's line and who it shows can be edited by hand, a Beat added after any Frame (up to 32 Frames; it shows who the Frame before it does, until changed; the Frames after it move up one), one removed (all but the last left; the Frames after it move down one), and the Beats put in a new order, with the call log kept by a Restart moving with them (2026-10-19). Nothing is written out or rendered yet.
4. **Write Frames:** a Text Model call per Frame, in order, each given the Look, every Beat with who it shows, the Brief and the seven sentences of the Frames before it; it answers with the Frame's own seven sentences (pose, expression, camera, clothing, environment, lighting, color). The Beats are checked with the Limits first, as an Action is. Each Frame is saved as it comes, so a failure or Cancel keeps those written, and writing again carries on from the next.
5. **Frames are assembled:** the identities of the Subjects the Frame shows (at most three, the most prominent first; none for a picture of the place alone) + the Frame's sentences + the Look's style, rendered as it is ([ADR 0012](adr/0012-storyboard-look-lists-each-person.md)). A Frame whose prompt crosses a Limit is saved **blocked** and can't be rendered until edited.

Once a Frame is written, the Look and Beats are fixed: **Restart** (once confirmed) is the way back to them, deleting every Frame's sentences and pictures. Each written Frame is then independent:

| Operation | What it does |
|---|---|
| **Render** | Renders one written Frame through the shared queue; a re-render replaces its image (the old file is deleted once the new one is saved). |
| **Edit by hand** | Replaces a Frame's seven sentences and who it shows, from the Look's Subjects; stray labels are stripped. A rendered Frame is marked **stale** until re-rendered. Refused if it crosses a Limit. Before the Frames are written, its Beat and who it shows instead. |
| **Edit the Look** | Only before the Frames are written: edits, adds or removes Subjects, or the style. Someone renamed stays shown where they were. |
| **Upscale** | As for a Chain Frame (below); a re-render or Undo deletes the upscale with the image. |
| **Edit by Action** | The Text Model rewrites that Frame's sentences and who it shows, from the Look as it is, after the same Action Limits check as a Chain; it gets the Look and the Frame, no Beats. An Action that would change the Look (who someone is, someone new, the style) comes back unclear, pointing to Restart. Declined or unclear Actions change nothing. |
| **Restart** | Back to the plan: every Frame's sentences, pictures and timings go (the files deleted), its Beat and who it shows stay. Its jobs are cancelled, and a render running is waited for. |
| **Chain from here** | On a written Frame in the Frames list (on hover, as a Chain's Delete): makes a new Chain of the Frames up to that one, to carry on from it by Actions; the Storyboard stays as it is ([ADR 0018](adr/0018-carry-on-in-a-new-session.md)). Done in code, with no Text Model call (2026-10-16): each Image Prompt becomes a Chain's nine sentences by joining the identities of the people shown into one subject sentence with semicolons, every word kept; a Frame of no one gets "No one is in the picture.". The first Frame is the Opening, each later one has its Beat as the Action (a Beat isn't updated by an Action edit, so it may be out of date), and blocked Frames are left out (the one it's made from can't be blocked). The Brief, Settings and seed are the Storyboard's, so its pictures are copied under new names, with their upscales and 3D; only those of a Frame of no one are marked stale. The Look goes no further than the copied prompts: someone in it but in none of them is unknown to the Chain. |

Each Frame records how long its text took (its Write, or its latest edit) and its latest render.

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
4. **Undo** removes the latest exchange and puts its Message back in the box; the opening can't be undone. **The Cast** can be edited by hand at any time; it applies from the next Reply. **Restart** (once confirmed, 2026-10-19) takes the Roleplay back to reviewing its Cast, to edit and begin again: every exchange goes, the opening too, with its pictures, upscales, 3D and spoken lines (the files deleted), while the Cast, the Look and the voice stay. Its jobs are cancelled (all but a voice design), and a render running is waited for, as a Storyboard's Restart does.
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
   compete for memory. Undo removes the undone exchange's audio. Voices come from the Backend
   Settings send them to (ADR 0010, 0022). The voice service
   (`python/voice/serve.py`, mlx-audio) is a Python process the server starts on first use and talks to
   over HTTP on localhost: Qwen3-TTS VoiceDesign designs, Higgs TTS 3 clones, one model loaded at a
   time and unloaded after a minute unused (it reloads in 2–3 s), its MLX cache cleared after
   every request. ComfyUI (`server/voice/comfyui/`, with TTS Audio Suite's nodes) runs the same two
   models as workflows, keeping no audio (its clips are read from its temp folder and blanked);
   its files are FLAC (`voice-…flac`, `speech-…flac`), and as Higgs takes most of a 12 GB card, the
   Text Model is unloaded before each voice, as before a render, when both are on that machine. Lines carry no emotion tags: in testing they pulled
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
   buttons too, beside Upscale on the shown Frame, queued like a Roleplay's (below), and Undo
   deletes them with the picture.
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

**Pictures, renders and upscales are queued jobs** (`server/jobs.ts`, one queue for every Session). What every kind does to a Frame's picture (upscale, SHARP, TripoSplat, LiTo) is one module, `server/pictureJobs.ts`; each kind's `jobs.ts` adds its own: `render` of a Frame made without its picture for a Chain, `render` for a Storyboard (`server/storyboard/jobs.ts`), and pictures, renders and voices for a Roleplay (`server/roleplay/jobs.ts`). A Roleplay's and a Storyboard's re-render share `replacePicture` (`server/frames.ts`), which drops the old picture's upscale and 3D. The player can ask for several and carry on with the conversation, a Chain's next Action or a Storyboard's edits; a job waiting on a picture can be queued behind the render or picture job that will make it. Each Session runs one job at a time on each machine, in the order asked (since 2026-10-19, [ADR 0020](adr/0020-jobs-take-turns-per-machine.md)): a picture on the Text Model's server, a render on the Session's Image backend, by the Image Model it had when queued (since 2026-10-20, so a switch mid-queue leaves the queued renders where they were and the Mac and the PC render side by side), an upscale and a voice on Settings' backends, 3D and the style scores here, so a line spoken here plays while a ComfyUI on another PC renders. A job also waits for the earlier ones it needs, wherever they run: on its Frame, a render for its picture, an upscale for its render, 3D for its upscale; a spoken line for a voice being designed. A picture (a Roleplay Frame's Image Prompt) goes ahead of queued image jobs, so a new Reply's is written while the Text Model is loaded for it, not after a batch of renders that each unload it. Renders, upscales, voices and 3D also wait their turn in the render queue every Session shares, one per machine. Jobs don't hold the Session's lock; every change to a Roleplay or a Chain (a Reply, a picture, a render, a Chain Frame, an Undo) is saved by reloading it and applying just that change, one at a time (`server/update.ts`), so none overwrites another. A Chain queues `upscale`, `scene`, `figure` and `lito`. The queue lives in memory: restarting the server forgets it. A job asked for before what it needs exists (a render queued behind its picture) waits its turn and fails with a reason if that still isn't there; failed jobs stay listed, with **Retry** (back to the end of the queue) and **Dismiss**. Undoing an exchange (or a Chain Frame) cancels its jobs; deleting the Session cancels all of them. On the screen, a Roleplay's Replies each list their jobs with Cancel (the running one sweeps its Reply), and a **Queue (N)** tab lists them all: beside **Look & Cast** in a Roleplay, and beside **Frames** in a Chain or a Storyboard (since 2026-10-10; it was a short list atop the Frames, too small for a Render all), in its place. In a Chain the running job sweeps the picture it's working on. Clicking one goes to its Frame. **Clear queue** cancels what's running and queued and dismisses what failed, at once. The screens share this (`useJobs`, `FrameJobs`, `JobQueue`, `PanelTabs`).

**Picturing a Frame** (the Art Agent; by the Session's Text Model, or the Art Agent model set in
Settings, recorded on each picture as `pictureModel` and on the Look as `lookModel`): **Picture this** under a Reply writes
that Frame's Image Prompt, in the same shape as a Storyboard Frame's. The first time, a call
writes the Roleplay's **Look** from the Cast and Brief, the same shape as a Storyboard's (ADR
0012): an identity sentence for the Character, the Persona and anyone else the Brief names, and
the art style, fitted to the story's period. Then a call reads the story up to the Frame (each
Message and what the Character did and said; thoughts left out, as a picture can't show them),
writes the Frame's seven sentences, then names anyone in the picture the Look doesn't have yet
(a guard who comes in, the barkeep who speaks) with their identity, and lists the names of
everyone in it, the most prominent first (someone upstairs or gone isn't; if no one is, the
picture is of the place alone, with no identity sentences and nothing said about people or their
absence). Newcomers join the Look, one person each (a group isn't added), unless already in it
under another name or crossing a Limit,
so they look the same in every later picture. Clothing carries forward too: the request gives
each person's clothing sentence from the latest earlier picture showing them, and the Art Agent
copies it, changing only what the story after that Frame changed (taken off, put on, torn,
bloodied); marks such as blood, bruises, dirt and wet are part of it, so a garment taken off or a
wound doesn't come and go between pictures. The seven sentences are each capped at 280 characters, written as a
third-person view of that moment (or, with Settings → Art Agent style set to tags, a few short tags per aspect,
recorded as `pictureStyle` and shown as "as tags"; prose is the default, as it did better, see
[models.md](models.md)). The Image Prompt is the identity sentences of the people shown, those
sentences, then the style; a picture that crosses a Limit is written once more, told which; it's checked against the Limits in
force and shown under the Reply (marked if it crosses one). While a Frame is pictured, the light
sweeps round that Reply, which says "Picturing this moment…" (or "Writing the Look, then
picturing…") with its own Cancel; the conversation doesn't scroll, and the text box stays still
and usable: Send doesn't wait for the picture, which is a job beside the conversation. With the Limits on, a picture of two or
more people must name what each wears in its clothing sentence (by any word of their name, or its
plural: "the two men" covers both), or it's blocked (and written once more): told to keep within the
Limits, the Art Agent sometimes left an undressed person's clothing out instead of dressing them.
Each new Reply (the opening too) is pictured as it arrives (since 2026-10-10, when a **Picture
replies** switch was dropped): its Image Prompt is written at once, while the Text Model is still
loaded, so rendering later (Render all) needs no reload between renders. It's written with
Pictures off too, as it needs only the Text Model (a `picture` job needs no Feature), so a Roleplay
played without pictures can be rendered later. It costs the Art Agent's time after each Reply (3–6
s with gemma4, models.md), beside the conversation. **Render replies** (beside "Speak replies" above
the conversation, off by default, as rendering is slow; only with Pictures on) queues Render after
it too, and is remembered per browser. Picture this stays for another try. **Render all (N)**
(in the button row under the text box, as on the other screens) queues a render of every Frame with no picture by the Roleplay's Image Model, or one
changed since, skipping blocked ones; a Frame without its Image Prompt (its picture failed or was
cancelled) is pictured first, all pictures queued before the renders. A job already queued isn't cancelled by the next Message: each Reply gets
its picture, in order. Cancelling a picture also cancels the render queued behind it. **Render** / **Re-render** under a pictured Reply renders it through the shared render queue with
the Session's Image Model, seed and size, and shows the picture beside its Reply (below it on
windows under 1024 px). Clicking a picture opens it in a viewer (`FrameViewer`, shared with the
Chain and Storyboard screens: `ImageViewer`, a dialog around `FrameImage`, which zooms and pans
only there); Esc, Close or a
click outside the image dismisses it, and "Open full size" opens the file itself. In the viewer,
← and → (or ↑ and ↓, or ‹ ›) step to the previous or next rendered Frame, scrolling the conversation behind to it,
with progress, the sweep and Cancel in place; **Upscale** works as on any Frame. Picturing a
rendered Frame again, or editing the Look, marks its pictures "Changed since render" until it's
re-rendered, as does a picture by another Image Model than the Roleplay's; the Image Prompt block
adds how the shown picture was rendered ("Rendered: Image 34.1 s · by Qwen-Image 2.1"). Undo
deletes the undone exchange's pictures. For debugging, each picture's time and the Art
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
- **A Session keeps what defines its pictures** ([ADR 0015](adr/0015-a-picture-per-image-model.md)): its Image backend, Image Model, steps and seed, copied from Settings when it starts, the first three changed only by switching in the Session. How a render runs is read from Settings at each render (`RENDER_SETTINGS`: size, step cache, quantize, float16, ComfyUI's address), so a change there reaches running Sessions too, as the Upscaler, Art Agent and Limits already did. The Text backend, Text Model and Thinking stay as the Session started.
- **The Image Model is switched in the Session** (2026-10-10), from the picker beside its switches
  (`ImageModelPicker`), which shows the steps a render takes next to it. Switching resets the steps
  to the new model's default and changes nothing else. A turbo with its own weights is an Image
  Model of its own (Qwen-Image 2.1 Viggle Turbo), so it's switched here too; a model's
  presets for the same weights are its steps (Ideogram 4: 12, 20 or 48;
  [ADR 0016](adr/0016-turbos-are-image-models.md)).
  Settings' Image Model is the one new Sessions start with. Renders under way finish on the old
  model; queued ones read the Session when their turn comes, so they use the new one.
  Where both Image backends can render (2026-10-19), the picker groups their models, and picking one on the other backend switches the backend too. A model of the same name counts as the same on either, so its pictures stay up to date; each picture says which backend made it.
- **A Frame keeps a picture per Image Model** (`pictures`, `server/pictures.ts`), each with its
  upscale, scene, figures, stale flag and render timings. It shows its picture by the Session's
  model, or else its latest, which then reads **Changed since render · by <model>**; a picture whose
  Image Prompt changed since is stale, whichever model made it. A render replaces only its own
  model's picture (deleting its files), so switching back shows the old ones without rendering.
  Upscales and 3D are made from the picture shown when the job starts, and saved onto that one.
- **A picture can be edited** (ADR 0021, 2026-10-23; `server/pictureEdits.ts`), in every kind of Session: an `edit` job repaints it as told, in an area painted over it or all of it, with the edit model in Settings (`editModel`; Qwen-Image 2.1 Edit on mflux, `-q 8 --low-ram`, ~3 minutes for a 1216×832 picture). Each edit is a version (`edits`), made from the newest, with its own image, instruction, seed and painted area (`mask-…png`); `picked` says which version is the picture (0, or none, for the render). The picked version is what's shown, upscaled, made into 3D, scored and copied into a Chain (`shownVersionOf`); each version keeps its own upscale and 3D. Only the newest edit can be made again (a retry, with the next seed, in its place) or deleted. A render by the same model replaces the picture with its edits. Not on ComfyUI yet: the `edits` Feature is on only where mflux runs.
  Render timings end "by <model> · <backend>" (older pictures may not say the backend). Older `session.json` files, with the picture on the Frame
  itself, aren't migrated: their pictures don't show.
- **Compare** (2026-10-10), beside the picker once two Image Models have rendered in a Session
  (`ModelComparison`): a full-window table with a row per pictured Frame and a column per model, in
  the order they first rendered, the Session's own marked "current", a stale picture dimmed and a
  gap marked "Not rendered". A picture opens in the viewer, where ← and → step through that Frame's
  pictures by the other models, and ↑ and ↓ through the Frames that model rendered; on a touch
  screen (2026-10-12), a swipe does the same (left for the next model, up for the next Frame,
  not while zoomed in or pinching), as do the viewer's arrow buttons. Each row is
  headed by its Frame's Image Prompt (2026-10-11), folded away to the Frames' names under 1024 px
  (a phone either way up, since 2026-10-14; 640 px before) and toggled from the table's corner.
  Under the picture in the viewer (2026-10-14), what happens in its Frame: a Chain Frame's
  Narration, a Storyboard Frame's Beat, a Roleplay Reply's actions; always shown, in a box three
  lines high whatever its length (scrolling, not swiping, when longer), so the picture keeps its
  size stepping through, and the same for every model's picture of a Frame. Pictures in the table
  are 256 px high, or the window's height less 8rem when that's less (a short phone on its side,
  so a row and the headers fit). On a phone on its side (landscape, at most 500 px high: the
  `short:` variant), the viewer puts its controls, label and caption in a column beside the
  picture, which then has the whole height. A column moves by dragging the grip in its
  header (pointer events, so a phone can too; the table scrolls along near its edges), or with ←
  and → on the grip; the viewer's ← and → follow the new order, until the table is next opened.
  A column's checkbox hides it (folded to its header at the right end), leaving its model out of
  Export and the style scores; since 2026-10-15 the hidden ones are remembered per Session in the
  browser. A hidden column other than the Session's own Image Model offers **Delete pictures…**
  (2026-10-15): after a confirmation counting them, every picture that model made in the Session
  goes, with its upscales and 3D (`DELETE /api/sessions/:id/pictures?imageModel=`), for a model
  whose pictures aren't worth keeping (ideogram-4's, many blocked by its safety filter).
  Both pages' viewports say `minimum-scale=1` (2026-10-14): without it, a phone browser widened the
  page to fit whatever overflowed (the app's header and toolbars, at 390 px), and the full-window
  dialogs sized to that, so Compare and the viewer were cut off and turning the phone didn't
  set them right. What overflows now scrolls sideways instead; the screens themselves aren't laid
  out for phones yet.
- **Export** (2026-10-11), in Compare's header: the same table as a page of its own (the table
  alone, without the header or the "current" mark), written by
  the server to `exports/<Session id>/` (gitignored; the next export replaces what this one wrote, and since 2026-10-14 leaves anything else there, such as here.now's `.herenow/` deploy state): `index.html`
  (`web/export.html`, built on each export by `deno task build:export` into one file with its
  script and styles inlined, the comparison as JSON in it; titled by the day it was exported and
  the Session's seed, "12 Oct 2026 · Seed 1282725757", since 2026-10-12), `images/` for the viewer (the upscaled
  picture where there is one, WebP quality 90) and `thumbs/` for the table (512 px high, quality
  85), each row with its caption. It opens from disk or any static host, with the viewer's zoom, arrow keys and swipes, and the app's
  Light / Dark / System toggle in its bottom-right corner (remembered by the browser; the top right
  would cover the model names in the sticky header row). Export first asks (2026-10-12) whether the
  page should **ask its visitors to confirm they're 18 or older**, under a notice the player can
  reword ("Some of these pictures show nude figures, as in classical painting." by default); both
  are remembered per Session in the browser. Such a page opens with the table blurred and inert
  behind the notice, on every visit (nothing is remembered), until the visitor confirms or leaves,
  and carries `<meta name="rating" content="adult">` for safe search and content filters. It's a
  courtesy, not a lock: the picture files can still be opened by their own addresses. The pictures
  are encoded in WebAssembly (jSquash), so it runs the same on both machines with nothing to
  install ([research/export-images.md](research/export-images.md) compares AVIF). Mac, 2026-10-11: a Storyboard's 41 pictures by 6 models, 70 MB of PNG, exported in
  7.5 s to 13 MB (10 MB of viewer pictures, 2.7 MB of thumbnails, a 116 KB page); a Chain's 85
  pictures by 4 models in 20.6 s to 32 MB. Viewer pictures load only when opened, and thumbnails
  as they near the screen (`loading="lazy"`): 28 of the Chain's 85 on opening it. Each thumbnail's
  size is written into the page, so its cell is as wide as it will be before it loads.
- **Style scores** (2026-10-14), in Compare's header: in place of the table, how varied each shown
  model's art style is across the Frames every shown model pictured, against a **base Frame** the
  player picks (the one without a style of its own; remembered per Session in the browser). Four
  measures, each a ranked bar chart under what it means: Spread, Away from the base Frame,
  Distinct styles (the Vendi score) and Matches its Frame (how often a picture is among the three
  nearest to its own Frame's caption); then each model's distance from the base Frame by Frame, a
  small chart per model, and a heatmap of every picture's caption rank; the numbers in a table
  under them. Hovering a bar, a point or a cell (2026-10-15) brings that model forward in every
  chart and fades the rest (in the line charts and the heatmap, the same Frame's less), marks the
  Frame across the line charts, and shows the model, its value, and for a point or a cell the
  Frame and its caption. Drawn with Observable Plot in the app's `--info` colour (one hue, so the models are
  told apart by name, not colour), loaded only when shown. **Score** queues a `style` job (filed
  under Frame 0, like a voice): `python/style/make.py`, through uv, embeds each picture not yet
  embedded with CSD and CLIP, and each caption with CLIP, in its turn behind renders but leaving
  the Text Model loaded (~3 GB). The vectors are kept in the Session's `style.json`, by picture
  file and caption, so the scores come back at once (`GET /api/sessions/:id/style-scores`) for any
  base Frame or set of shown models, and Score again takes in only what's new. The base Frame can be
  any Frame every shown model pictured (2026-10-15): when fewer than two are, the dialog names the
  models that pictured too few ("FLUX.2 Klein 4B pictured only 1 Frame: hide its column to compare
  the rest"). A Storyboard's or a Roleplay's Frames all share their Look's style, so there the
  descriptions (`StyleMeasure.oneStyle`, exported too) read lower as steadier, where a Chain's,
  whose Frames can each ask for a new style, read higher as more varied. A Feature
  (`style`), available wherever uv is, on the GPU (MPS or CUDA) or slowly on the CPU. How the
  measures and models were chosen: [research/style-scores.md](research/style-scores.md); why no
  vision model judges them: [ADR 0017](adr/0017-no-vision-judge-for-style-scores.md).
  **Exported** (2026-10-15) when the Session has been scored: Export offers to include them (on
  unless unticked, remembered per Session), for the exported columns against the base Frame last
  picked, and the page gets a Pictures / Style scores switch beside its theme toggle, showing the
  same charts and numbers (`StyleScoresView`, shared with the dialog). Showing them adds
  `?view=scores` to the address (replacing the history entry, not adding one), so a link with it
  opens straight onto them. To keep the page light,
  Observable Plot isn't in it: the page's build stands `src/export/plotGlobal.ts` in for it, and
  Plot is built on its own as `plot.js` (a classic script, as a module won't load from disk),
  written beside `index.html` only when the export carries scores and loaded only when they're
  opened. Mac, 2026-10-15: the page 152 KB (52 KB gzipped; 133 KB before), `plot.js` 273 KB (92
  KB gzipped); with Plot inlined, the page would have been 437 KB. A Chain's 279 pictures by 9 models, with scores,
  exported in 52 s.

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
  it never resizes as the text changes. **Render each Frame** (above the picture, as a Roleplay's switches are above its conversation; the
  Chain's own switch, saved with it as `renderFrames`) is on when pictures are available: each
  Action writes the new prompt and renders it. Off (and always, without pictures) each Action
  writes only the prompt; the Frame reads "Not rendered yet", with a dashed thumbnail, and its
  **Render** button queues its picture. **Re-render** is offered on every rendered Frame
  (2026-10-12; until then only on one out of date): the seed and steps stay the Chain's, but
  Settings' size, quantize, float16 and step cache apply at each render, and changing them
  marks nothing out of date. A Frame is out of date only after its prompt is edited by hand
  (below) or the Chain's Image Model is switched; its picture then shows **Changed since render ·
  by <model>**. **Render all** (2026-10-10, as a Storyboard's) queues a
  render of every such Frame, in order, and says how many. The Narration is a caption over the bottom of the photo
  (provisional text shows dimmed and in italics while a Frame runs); the caption can be hidden,
  and that choice is remembered per browser. The Frame's status ("Rendering the image… step 2 of 4") is a
  pill in the image's top corner. Enter sends; Shift+Enter adds a new line. A done Frame clears the text box; a declined or
  unclear Action makes no Frame at all and stays there to reword. While a Frame runs,
  the text box is locked and **Cancel** replaces **Send**; a failed Frame's error shows in the
  button row. Typed text is always treated as an Action; there are no typed commands.
  The right side has two panels: side by side on wide windows (1280 px and up), as tabs on
  narrower ones. **Frames list** shows a thumbnail, the Action and the Narration per
  Frame; clicking one shows that Frame, and ↑ and ↓ in the list step to the one before or after
  (a Storyboard's too; `useFrameKeys`). While an earlier Frame is shown, a pill on the image reads
  "Viewing Frame 1 of 4 · Back to latest", and the text box shows the Action that made that
  Frame, read-only (still selectable, to copy), with Send disabled; "Back to latest" brings your
  draft back. Actions always build on the latest Frame, never on the one being viewed. Declined Frames are labelled and tinted amber, Unclear
  Frames ("Didn't understand") blue, both in the log and on the caption. **Prompt** shows the
  viewed Frame's timings ("Text 9.8 s · Waited 12.3 s · Image 5.1 s", without the image until it's rendered; also
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
  `mflux-upscale-seedvr2`, or ComfyUI's built-in SeedVR2 when Settings send upscales to a ComfyUI,
  whichever backend rendered), through the
  same render queue, with the same sweep and step count, queued as a job so the next Action (or
  edit) needn't wait. The original stays as the thumbnail; the
  main view shows the upscaled image. The button reads **Upscaled**, disabled, once done (saved
  as `upscaled` on the picture, in a `-2048` file next to the original; a picture by another model
  has its own). Hovering the image shows its size in pixels in the top-left
  corner ("768×512", then "3072×2048" once upscaled), except while the status pill is there.
  Clicking the image opens it in the same viewer as a Roleplay's pictures (`FrameViewer`; ← and →, or ↑ and ↓,
  step through the Frames), and so does a Storyboard's. Only there does it zoom: pinching the
  trackpad, or a mouse wheel (25% a notch; Windows has no pinch on a mouse), zooms the image, not
  the page (up to 8×, toward the pointer, with the zoom level added to the size chip); while
  zoomed in, two-finger scrolling or dragging pans, and a double-click resets. A wheel's notch is
  told from a trackpad's scroll by its deltas: lines, or whole pixels of 50 or more straight up or
  down, against a trackpad's small, fractional, often diagonal ones (`usePinchZoom`). Each new image starts unzoomed. The 3D buttons (`Frame3dButtons`) and their viewers
  (`Frame3dViewers`) are shared with Roleplay too.
- **Editing a picture** (2026-10-23; ADR 0021), the same on every kind's screen, in the viewer (`FrameViewer`). A picture's versions sit in a column beside it, from its top (`PictureVersions`; in a row under it on a phone; a click within 48 px of the picture or the column doesn't close the viewer, so a near miss isn't a close): **Original**, each edit, and any edit being made or failed; choosing one picks it, and the caption gives its instructions. Under them, **Edit**, and for the newest edit when it's shown **Redo edit** and **Delete edit** (once confirmed). Edit, there or among the picture's buttons, paints over the newest version the area to repaint (`PaintLayer`, zoomed and panned with the image): a brush and an eraser, their size, **Undo** and **Redo** of strokes (⌘Z, ⇧⌘Z; **Clear** is one too), then what to paint there and **Send**. Esc or **Back** returns to the picture, the draft kept until the viewer closes; while painting, the arrow keys and swipes don't step and a click outside doesn't close. Redo edit paints over what the newest was made from, starting from its area and instruction, to change before **Make again**, which replaces it. Once sent, the edit shows among the versions as it's made: what it's made from with its area in red, the border sweeping, and its progress in the caption, with **Cancel edit**; one that fails stays, to redo or delete. While one is being made, Edit on the screen (reading **Editing…**) and an edit in the Queue tab open the viewer on it. The screens mark a picture showing an edit **Edited** (`EditedChip`). The Compare dialog compares each picture as its picked version, with an **Edited** mark whose tooltip gives what it was told, and so does its export. Settings has the **Edits** switch and the **Edit model**, on the Images tab.
- **Storyboard** (`/storyboards/:id`): opening a new Storyboard plans it straight away. The Frames list fills in with the Beats as the plan streams (each marked "Planning…"); the status pill counts "Planning Beat 3 of 8…". The plan then waits for review: each Frame is **Not written**, the Prompt panel has the **Look** (each Subject's name as a heading over its identity, which collapses to the name and a preview; Subjects can be added or removed; and the art style) and the selected Frame's **Shows** toggles (a Subject each) and its Beat, all editable by hand. Under the selected Frame's Beat, **+ Beat after** opens a box there to type a new Beat into, added after that Frame (Enter adds it and selects it; Esc, or picking another Frame, lets it go), and **Remove Beat** takes its Beat out once confirmed (an unsaved edit to it goes with it). In the list, each Frame has a grip to drag its Beat up or down (or ↑ and ↓ on it), saved when let go; the Frame shown goes with it. **Write N Frames** writes them, each listed as it's saved ("Writing Frame 3 of 8…"). While it writes, the Frame shown follows the one being written (until the player picks another), which sweeps in the list, in the main area ("Writing its sentences…") and in the Prompt panel, as a render or an Action edit does; the Frames after it read **Waiting**, and a bar beside Cancel counts those written (2026-10-19). After a write that stopped part-way it reads **Write the rest (N)**. Once a Frame is written, the Look, the Beats and their Shows are read-only, with **Restart…** at the right of the Look's heading (2026-10-19). The main area shows the selected Frame's image (or "Not written yet", "Not rendered yet"), its Beat as a caption and a pill with its status: **Not written**, **Draft** (never rendered), **Rendered**, **Changed since render** (stale, or by another Image Model than the Storyboard's) or **Blocked**. Below it: an Action box that edits the selected written Frame (Enter sends; a declined or unclear Action stays to reword; the Narration shows in the button row), the picture buttons every kind shares (**Render**/**Re-render**, **Upscale**, SHARP, TripoSplat, LiTo), each queued as a job, and **Render all (N)**, which queues a render of every written draft or changed Frame not already queued, skipping blocked ones. Editing carries on while they run. The Frames list shows each Frame's thumbnail (dimmed when stale), Beat and status (or the job working on it). For a written Frame, the Prompt panel has its Shows toggles and seven sentences, editable by hand, then the full prompt and the Frame's timings. Hand edits save themselves (see **Hand edits** below); a Frame's sentences are read-only while it renders, so its picture is of what they say. The panels, the render sweep and the unsent Action (remembered per Session) work as on the Session screen. A Chain opened at a Storyboard's address, or the other way round, is sent to its own screen.
- **Roleplay** (`/roleplay/:id`): a new Roleplay opens on its Cast, written from the Brief, with **Begin** and **Rewrite Cast** in the conversation area, and the text box stays locked until the scene begins. Then the conversation fills the main area: the player's Messages on the right, the Character's Replies on the left, each as the thought (small, muted; always shown, the **Hide thoughts** toggle having been dropped as redundant, 2026-10-19), the actions in italics and the dialogue in quotes. While the Character replies, the Message shows at once and the Reply fills in field by field, with the same light sweeping round the text box. Enter sends; Cancel, Undo and the unsent Message (remembered per Session) work as on the Session screen. Once the scene has begun, the Cast keeps only what steers the Character editable (Personality, Way of speaking, Background, Goal); how it started (the names, the Character's age and appearance, You play, Where it starts) comes first under **At the start**, in the same text boxes but greyed and read-only, collapsed by default, each of its parts (Character, You play, Where it starts) collapsing on its own while the boxes inside them don't, with the Character's editable fields below it, since the story moves on from it and Restart… is the way to change it; the server refuses a change to it too (2026-10-19). The right panel is the Cast, the Look and the Voice, in that order, styled alike on both kinds' panels: those three (and a Storyboard's Frame) as headings that collapse, each person and part under them as a smaller heading, and each field's label small and muted, a part with one field having no label (2026-10-19); editable, saving themselves (see **Hand edits** below); each heading says what reads it (the Cast for the Character's replies, the Look for every picture, the Voice for how the Character sounds aloud), and the Cast's field for how the Character talks is labelled **Way of speaking**, so it isn't taken for the Voice (2026-10-19). Once the scene has begun, **Restart…** at the right of the Cast's heading (once confirmed) takes it back to the Cast's review, with **Begin** and **Rewrite Cast** again (2026-10-19). On Home, a card without a picture shows text in its place: a Roleplay's the Character's latest line (in quotation marks), a Chain's its latest Narration, a Storyboard's its first Beat. In the Look & Cast panel every text box grows to fit its text (no inner scrolling, so the panel scrolls as one) and collapses to a one-line preview by its label, remembered per browser (`CollapsibleTextarea`, sized by VueUse's `useTextareaAutosize`). Each part of the Cast (Character, You play, Where it starts) collapses the same way to its title and a preview (the name, or the place), as the Look and its Subjects do, and so does the Voice, to its heading and description; its description, the section's only field, doesn't collapse on its own (2026-10-19).
- **Hand edits** (2026-10-15; they had Save buttons before): a Look, a Storyboard Frame's
  Beat (before it's written) or sentences and who it shows, and a Roleplay's Cast save themselves when the focus leaves their
  panel, so a Subject added (name, then identity) goes in one save; a Frame's Shows toggle and a
  person's Remove save at once (`useAutosave`). Work that reads them saves them first: Write
  Frames, Render, Render all, Upscale and 3D, an Action, Send, Suggest, Begin, Rewrite Cast. So do showing another
  Frame (the edit goes to the Frame it was typed for) and leaving the screen; reloading or closing
  it with an edit unsaved asks first. A Session's saves go one at a time, in order, since the server
  takes one edit to a Session at a time. One the server would refuse (someone without a name, two
  with one name) isn't sent, and one it refused (a Limit) stays as typed; either says why under the
  panel, which also says when it's saved. **Revert** saves back what was there when the panel was
  opened, or last changed by an Action. A change from elsewhere (an Action, another tab) replaces
  the draft unless it has unsaved edits, which win.
- **Navigation** (redone 2026-10-10): the app's name, then the screens as tabs, the one on show
  filled: **Home** (a house), **Settings** (a gear), then the **Session** opened last, named by its kind and title
  ("ROLEPLAY · The Rain-Soaked Tavern", as on its Home card; remembered per browser, not shown when
  there's none). On the right, a dot says the server is up (green), or "Server offline" (red),
  then the theme. Up to five Session screens stay alive in
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
- **Settings** (`/settings`), a tab each. **Machines** (ADR 0022, since 2026-10-26): the Backends there are, in the order a job tries them: this machine's own programs (mflux, the voice service, SHARP, TripoSplat, LiTo, the style scores, as far as it runs them), and each ComfyUI (ADR 0009), Ollama or server with the OpenAI chat API (with its API key, kept in `settings.json`, never sent back: ADR 0008) added, each with its address and whether it answers. **Text**: which Backend the Text Model runs on, the Text Model (that Backend's models; on Ollama minus OCR and dedicated vision-language models), Thinking (on or off; only for models that support it), Art Agent model (the model that pictures Roleplay Frames, with Thinking off, or "Same as the Text Model") and style (prose, recommended, or tags). **Images**: the Default Image Model (every backend's, in one list), where renders go, steps (reset to the model's default when the Image Model changes), quantization (8 or 4 bit, converted as the model loads), float16 (on by default, for the models that take it: faster on M1 and M2 Macs, the picture slightly different), size (six presets from 512×512 to 1216×832), the Default upscaler (SeedVR2 7B or 3B) and where upscales go, the Default edit model and where edits go. **Voice**: where voices are made. **3D**: SHARP, TripoSplat and LiTo. **Advanced**: the Limits (on by default; off leaves only "everyone depicted is an adult"), the seed (random per Session, or fixed), the call log (off by default; see Storage) and the Image comparison style scores. Each kind of work goes to the Backend its tab prefers, or the next on the Machines tab that can do it (it hasn't the model, say), as Settings are when it's queued. A Session copies the Text Model, Thinking, the Image backend and model, steps and seed when it starts (the Image backend, model and steps can be switched in it); the rest applies at once, to running Sessions too (see Consistency).
- **Theme:** Light (a parchment tint), Dark or System, remembered per browser. It's a display
  preference, not a Setting.

**Undo** removes the latest Frame: the previous Frame's Image Prompt is current again, its pictures
(by every Image Model) and what was made from them are deleted, and the undone Action goes back into the text
box (unless you've started typing a new one). It's offered in the button row and on the latest
Frame in the Frames list, never for the Opening Frame, and never while a Frame runs.

**Edit** (2026-10-11), in the Prompt tab, replaces the shown Frame's Image Prompt by hand, any Frame's,
the Opening's too: its pictures (by every Image Model) are marked out of date (**Changed since
render**) until rendered again, and Render all counts it. The Frames after it keep their own
prompts; the latest Frame's is what the next Action changes. Refused (`422`) if it crosses a Limit;
whitespace is folded to single spaces. Showing another Frame drops an unsaved edit.

**Delete** (2026-10-11) removes a Frame between the Opening and the latest, from its Delete
button in the Frames list, once confirmed: its pictures (by every Image Model) and what was made
from them go, and the Frames after it are numbered down, keeping their Image Prompts (written
from the deleted Frame's, which is fine: each Frame holds its whole prompt). The queue follows:
the deleted Frame's queued jobs go, later Frames' are renumbered with them, and while a job runs
on that Frame or a later one the delete is refused, as its result would land on the wrong Frame
(the queue is held meanwhile, so none starts). The request says how many Frames the Chain had and
when the Frame was made, so a repeat can't delete the Frame that took its place. With the call log
on, the deleted Frame's file is kept as `frame-N-deleted-xxxxxxxx.json` and later ones are
renumbered. Image files carry
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
| Call log | `sessions/<id>/calls/frame-N.json`, `calls/setup.json` | Only with Settings' Call log on; see below |

**The call log** (`server/calls.ts`) is for studying what the models are sent. With it on, every call to the Text Model (with its job: `cast`, `reply`, `look`, `picture`, `suggest`…, its messages, schema, seed and caps, and the reply and reasoning) and to the Image Model (each render's prompt, seed and settings, each upscale) is added to a JSON array in the Session's `calls/` folder as it's made: one file per Frame, numbered as the app shows them, and `setup.json` for what isn't one Frame's (a Cast, a Storyboard's plan). Suggest and a Chain's next Frame log under the Frame they'd make, and each of a Storyboard's Writes (`write-frame`) under its Frame. A call is added over the file's closing `]`, so the file is never rewritten and stays valid JSON; one file per Frame keeps each small enough for an editor to fold (VS Code stops folding past about 20 MB, which a whole long Roleplay, resending its conversation every Reply, would pass). The calls are logged as they're made rather than rebuilt later: each is built from what earlier calls returned, and the prompts change. An undone or redone Frame's calls stay in its file. Since 2026-10-16 the voice engine (each voice designed and line spoken: its text, delivery, seed and reference clip, by file name), SHARP, TripoSplat and LiTo (the picture and what came out) and the style embedder (which pictures and captions, counted, not the vectors) are logged too, under their jobs (`voice-design`, `speak`, `scene`, `figure`, `lito`, `style`). A spoken line or a 3D model goes with its Frame's calls; a voice's design and the style scores, which belong to the Session, go in `setup.json`.

## API

All under `/api`; the Vite dev server proxies it to the Deno server. A `POST` must say its body is JSON (`Content-Type: application/json`), or it's refused with `415` (2026-10-22): any web page can send a form or plain text to another site without asking first, but not JSON, which needs a preflight the server never answers (it sends no CORS headers). So a page on another site can't make Sessions, queue jobs, or have the saved API key sent to an address of its choosing through `/settings/text-models` (which, with no key given, uses the saved one, so Settings can list a new address's models before it's saved). `PUT` and `DELETE` always need a preflight.

| Route | Purpose |
|---|---|
| `GET /health` | Liveness |
| `GET`, `PUT /settings` | Read or save Settings (`400` with a list of issues if invalid). `apiKeysSet` lists the Backends with an API key saved; `apiKeys` in a `PUT` replaces them by Backend id (`''` removes one) |
| `GET /settings/options` | Text Models from the Backend the Text Model prefers, every Image backend's models and the ones a Session can switch to here (`imageBackends`), size presets, what can run (`features`) and what this machine runs itself (`here`); still answers if a Backend is down |
| `POST /settings/text-models` | The models on a text Backend not saved yet (`kind`, `address`, and `apiKey`, or the `id` of a Backend whose saved key to use) |
| `POST /settings/comfyui` | Whether a ComfyUI answers at an `address` not saved yet, and has the files for an `imageModel`, an `upscaler`, or `voices` |
| `GET /scenarios` | Scenario summaries plus files that failed to load |
| `GET /sessions` | Session summaries, newest first, with each one's current activity |
| `POST /sessions` | Start a Session: `{ kind?: "chain" \| "storyboard" \| "roleplay", scenarioId \| brief, frameCount? }`; every kind starts without pictures (a Chain then with `renderFrames` off) |
| `PUT /sessions/:id/image-model` | Switch the Session's Image Model, `{ imageModel, imageBackend? }` (one of that backend's, its own if left out; `400` otherwise; `409` for mflux where it can't run), resetting its steps to that model's default; returns the Session |
| `PUT /sessions/:id/render-frames` | Chain: whether each new Frame is rendered as it's made, `{ renderFrames }` (`409` to turn it on without pictures) |
| `DELETE /sessions/:id` | Delete a Session and its images (`409` while a Frame runs) |
| `GET /sessions/:id` | A Session with its Frames, plus `activity`: what a running Frame is doing, or `null` |
| `POST /sessions/:id/frames` | Chain: run a Frame (`{ action }`, or `{}` for the Opening Frame) as a server-sent event stream |
| `POST /sessions/:id/plan` | Storyboard: plan it, streaming `look`, `planned-beat` × N, then `planned` |
| `POST /sessions/:id/write` | Storyboard: write its Frames not written yet from the plan, a call per Frame, streaming `written-frame` as each is saved, then `written`. `409` if not planned, or all written. `422` if a Beat crosses a Limit |
| `POST /sessions/:id/restart` | Storyboard: back to the plan, every Frame's sentences and pictures deleted. Roleplay: back to the Cast, every exchange deleted, the opening too (`409` before it's begun). Cancels its jobs (a Roleplay's voice design aside) and waits for a render running to end |
| `POST /sessions/:id/frames/:index/edit` | Storyboard: edit one Frame by `{ action }`, streaming then `edited` (`outcome`, `narration`, `session`) |
| `POST /sessions/:id/beats` | Storyboard: add a Beat to the plan, `{ at, beat, shown? }`, before the Frame at `at` (0 to the number of Frames), the Frames from there on moving up one; `201` with the Storyboard. `409` if not planned, once a Frame is written, or at 32 Frames. `422` if it crosses a Limit |
| `PUT /sessions/:id/beats/order` | Storyboard: put the Beats in a new order, `{ order, seen }`: the index each had, in its new place, and their lines as seen, in the old order. `409` if they've changed since, or once a Frame is written; `400` unless `order` has each index once |
| `PUT /sessions/:id/frames/:index` | Storyboard: replace a written Frame's sentences and, if given, who it shows, `{ body, shown? }`, or before the Frames are written its Beat, `{ beat, shown? }` (`409` otherwise). Chain: replace a Frame's Image Prompt, `{ prompt }`, its pictures then out of date. `422` if it crosses a Limit |
| `POST /sessions/:id/frames/:index/chain` | Storyboard: make a new Chain of its Frames up to `:index`, with their pictures (`201`, the Chain); waits for a render running to end. `409` if Frame `:index` is blocked |
| `PUT /sessions/:id/look` | Storyboard: replace the Look, `{ subjects: [{ name, identity }], style }`, only before its Frames are written (`409` after) |
| `POST /sessions/:id/cancel` | Cancel the Frame in progress |
| `DELETE /sessions/:id/frames/:index` | Undo the latest Frame; `:index` must name it (`409` otherwise, and for the Opening Frame or while a Frame runs) |
| `POST /sessions/:id/frames/:index/delete` | Chain: delete Frame `:index`, any but the Opening: `{ frames, createdAt }` as seen (`409` if the Chain changed, for the Opening, or while a job runs on it or a later Frame). Storyboard: remove Beat `:index` from the plan, the same way (`409` if the plan changed, for the last Beat left, or once a Frame is written) |
| `GET /sessions/:id/images/:file` | A Frame's image, a Roleplay's audio (`voice-…wav`, `speech-…mp3`, `thought-…mp3`, or `.wav` from before), or a Roleplay Frame's 3D scene (`scene-…ply`), or a 3D figure (`figure-…ply`, `lito-…ply`) |
| `GET /sessions/:id/preview` | The latest preview of the Session's render in progress (a JPEG, ComfyUI's), while there is one and Settings show the picture forming; `404` otherwise. Never cached: asked for again at each step (`?step=`) |
| `POST /sessions/:id/roleplay/cast` | Roleplay: write (or, before it begins, rewrite) the Cast, streaming `phase`, `thinking`, then `cast` (`cast`, `session`) |
| `POST /sessions/:id/roleplay/begin` | Roleplay: the opening Reply, streaming `reply-part` per field, then `replied` (`frame`, `session`) |
| `POST /sessions/:id/roleplay/messages` | Roleplay: send `{ text }`, streaming `reply-part` (`key`, `value`) per field, then `replied`, or `declined` (`message`) |
| `POST /sessions/:id/roleplay/suggest` | Roleplay: suggest a Message from `{ draft? }`, streaming `suggestion-part` (`text`, all of it so far), then `suggestion` (`text`, tidied); nothing is saved |
| `DELETE /sessions/:id/roleplay/frames/:index` | Roleplay: undo the latest exchange (`409` for any other, and for the opening) |
| `GET /sessions/:id/jobs` | Roleplay or Chain: its background jobs (picture, render, upscale, voice, speak, scene, figure, lito): running, queued, then failed, each with its `phase`, `progress` or `error` |
| `POST /sessions/:id/jobs` | Every kind: a Chain `upscale`, `scene`, `figure`, `lito`, and `render` of a Frame with no picture by the Chain's Image Model; a Storyboard `render` too; a Roleplay all. Queue `{ kind: "picture" \| "render" \| "upscale" \| "voice" \| "speak" \| "speak-thought" \| "scene" \| "figure" \| "lito" \| "edit", frameIndex, edit? }` (`edit` repaints the picture as `edit: { instruction, mask? }` says, the painted area a PNG in base64, or makes the newest edit again with `edit: { retry: true }`, ADR 0021; `422` for an instruction crossing a Limit; `voice` designs a new take of the Character's voice; `speak-thought` speaks the Frame's thought, whispered; `scene` makes the picture into a 2.5D scene (SHARP); `figure` lifts its person out as a 3D figure (TripoSplat), and `lito` does so with LiTo; `409` to speak a Frame with nothing to say aloud, or no thought, or to make a picture job on a Frame with no picture and no render or picture queued to make one, or to render a blocked Storyboard Frame (`422`)); returns the queue (asking twice for the same job queues it once) |
| `PUT /sessions/:id/pictures/:index/picked` | Pick which version of Frame `index`'s picture is the picture, `{ picked }` (0 for its render, n for its edit n; `409` for none such); returns the Session |
| `DELETE /sessions/:id/pictures/:index/edits/newest` | Delete the newest edit of Frame `index`'s picture, with its upscale, 3D and painted area; the version before is picked if it was (`409` while an edit is queued or running on the Frame); returns the Session |
| `POST /sessions/:id/jobs/:job/retry` | Roleplay or Chain: put a failed job back at the end of the queue (`404` if there's no such failed job) |
| `DELETE /sessions/:id/jobs/:job` | Roleplay or Chain: cancel a queued or running job, or dismiss a failed one |
| `DELETE /sessions/:id/jobs` | Every kind: Clear queue: cancel every running and queued job, and dismiss the failed ones; returns what's left (a cancelled running job until it stops) |
| `PUT /sessions/:id/roleplay/look` | Roleplay: replace the Look, `{ subjects: [{ name, identity }], style }`, rewriting every pictured Frame (`400` if incomplete, `422` if it crosses a Limit); waits for a render running to end, holding the queue meanwhile |
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
| Settings | Server-side `settings.json`; apply from the next Session | Small sizes added; since 2026-10-10 how a render runs applies at once, and the Image Model is switched in the Session, keeping a picture per model (ADR 0015) |
| Side panel | Frames list with thumbnails; End/Reset as buttons only | End and Reset removed; Sessions are listed, opened and deleted on Home |
| Several Sessions rendering | Queue images one at a time across Sessions | A queued Frame keeps you in its Session; one at a time on each machine since 2026-10-19 (ADR 0020) |
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
