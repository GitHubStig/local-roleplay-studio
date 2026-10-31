# Design

How the app works now: its main behaviours, not its screens, which change too often to describe here. Which models to run is in [models.md](models.md). Terms in **bold** are defined in [CONTEXT.md](../CONTEXT.md). Why the bigger choices were made is in [adr/](adr/); what changed when is in git.

## What it is

The original aim was to make it easy to iterate on Image Prompts and test them across image-generation models. I found [Draw Things](https://drawthings.ai) and [ComfyUI](https://www.comfy.org) hard to learn and overwhelming when all I wanted was to iterate on prompts; discovering [mflux](https://github.com/mflux-community/mflux) and Qwen-Image 2.1 led me to a simpler, more playful interface. Chain began as one-step-at-a-time prompt editing; Storyboard grew from wanting to build a short comic more quickly, and Roleplay added prompt-making to an ongoing character conversation.

The app runs on a Mac with Apple silicon, a Windows PC with an NVIDIA card, or both together: every AI service sits behind an interface with a backend per machine (the Text Model on Ollama or a server with the OpenAI chat API, ADR 0008; the Image Model on mflux or ComfyUI, ADR 0009), Settings list the Backends on each machine and which each kind of work prefers (ADR 0022), and each extra (pictures, Upscale, edits, voices, 3D, clips) is on where a Backend can run it (`server/features.ts`).

Every Session starts from a **Brief** (typed, or a saved **Scenario**) and is one of three kinds: a **Chain**, where each Frame is made from the previous one by an **Action**; a **Storyboard**, whose Frames are planned together, reviewed and written out from the plan, then edited and rendered one by one; or a **Roleplay**, a conversation with a Character whose moments can be pictured and rendered as it goes. There is no score and no end; a Session lasts until it's deleted.

The **Image Prompt** is one paragraph covering nine aspects in a fixed order: subject and identity → pose and limbs → expression → camera angle and framing → clothing → environment → lighting → color → art style and medium ([ADR 0005](adr/0005-image-prompt-is-the-state.md)). A Chain's is nine sentences, one per aspect, which the Text Model rewrites. A Storyboard's and a Roleplay's are put together by the engine from a **Look**: the identity of each Subject shown, the seven sentences the Text Model wrote for that Frame (pose to color), then the art style ([ADR 0012](adr/0012-storyboard-look-lists-each-person.md)). Anything in it can be changed; the engine's four **Limits** are the only lines an Action can't cross ([ADR 0002](adr/0002-guardrails-enforced-by-the-engine.md)).

The built-in Scenario is the Kael tavern (`scenarios/tavern.md`): an 18th-century tavern on a stormy night, Kael the Character and a well-off traveller the player.

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

1. **Limits on the Action.** The Action is checked against the Limits' term list before the Text Model is asked. An Action that looks like it names someone (a capitalised full name, "look like", "resemble"; names inside a style clause such as "in the style of Michelangelo" don't count) also gets a narrow yes/no question to the Text Model about real people. A crossed Limit declines the Action at once, naming the Limit.
2. **Text step.** The system message is the engine's rules (the nine sentences and what each covers; rewrite only the affected sentences and copy the rest word for word; remove whatever a change contradicts; the Limits; the reply format), then the Scenario's notes, plus its **Setup** on the Opening Frame only. The user message is the current Image Prompt and the Action, and nothing else of earlier Frames ([ADR 0001](adr/0001-scene-is-sole-turn-state.md)) but who has been in the picture and isn't now, each as last described (`peopleAway`), so someone who left comes back described as before. The reply is constrained by a JSON schema (Ollama's `format`, or the OpenAI API's `response_format`), with `outcome` (`done`, `declined` or `unclear`) first, so the model decides before it writes. The Narration is a terse list of what changed: the model's own account, not checked against the prompt, so it can miss or overstate a change; the word diff of the prompt is always right. With **Thinking** on, the model reasons first, and its reasoning is saved with the Frame; models that can't think are asked again without it.
3. **Retry and limits on the call.** An unusable reply (bad JSON, an empty prompt, or one cut off by the length cap) is retried once, then the Frame fails. Every Text Model call has a token cap and a time limit (`server/text/`): small models writing JSON under a schema occasionally never stop, padding with whitespace, and without the caps one such reply blocked Ollama, and every request behind it, for minutes. A reply cut off because the conversation outgrew the backend's context isn't retried: it fails saying so.
4. **Engine rules** ([ADR 0002](adr/0002-guardrails-enforced-by-the-engine.md)):
   - The new Image Prompt is checked against the Limits too; crossing one declines the Action.
   - A **Declined Action** (a crossed Limit, or the Text Model declining it) or an **Unclear Action** (the Text Model can't tell what to change, and asks) saves no Frame: the Action stays to reword, with the reason or the question beside it.
   - A done Action whose Image Prompt came back unchanged saves no Frame either: there'd be nothing new to see, and it's often a Narration claiming a change the prompt doesn't have. So every Chain Frame has a picture of its own.
   - The Opening Frame always counts as done; if its prompt crosses a Limit, it fails.
5. **Image step.** The render waits its turn on its machine (see [Jobs](#jobs)), then the Backend Settings send renders to renders it with the Session's Image Model, steps and seed, and the rest as Settings are now (see [Pictures](#pictures)): the mflux CLI, one process per image ([ADR 0004](adr/0004-images-from-the-mflux-cli.md)), or a workflow queued on ComfyUI, followed over its WebSocket ([ADR 0009](adr/0009-comfyui-image-backend.md)). The Text Model is unloaded first if it runs on the same machine ([ADR 0013](adr/0013-unload-the-text-model-on-the-job-machine.md)). Progress streams to the player by step; on ComfyUI the player also watches the picture form, from a preview at each step that the server keeps in memory only (`server/previews.ts`). With a Chain's "Render each Frame" off (and always without pictures), this step is skipped and the Frame waits to be rendered.
6. **Commit.** The Frame is appended to `session.json`.

A Chain's latest Frame can be undone (its Action goes back to the box, its pictures and what was made from them deleted; never the Opening), as a Roleplay's latest exchange can (see [Roleplays](#roleplays)); a Storyboard has no Undo, as Restart takes it back to its plan. Any Frame's Image Prompt can be replaced by hand (refused if it crosses a Limit), which marks its pictures out of date. A Frame between the Opening and the latest can be deleted, the Frames after it numbered down with their queued jobs; it's refused while a job runs on it or a later Frame, as the job's result would land on the wrong Frame.

### All or nothing

A Frame commits whole or not at all ([ADR 0003](adr/0003-turns-are-all-or-nothing.md)):

| What happens | Result |
|---|---|
| Text Model fails twice | Frame fails; Image Prompt unchanged; the Action stays in the text box |
| Image Model fails | Frame fails; Image Prompt unchanged; any partial image is deleted |
| Player presses **Cancel** | Text request aborted; the mflux process killed, or the ComfyUI prompt interrupted; Image Prompt unchanged |
| The page's connection drops (reload, tab closed) | As Cancel, so the browser asks before leaving while a Frame runs |
| Opening Frame fails or is cancelled | The Session is discarded |

Only one Frame runs per Session at a time; the server refuses a second with `409`. Frames, Undo and deleting a Session all take a per-Session lock *before* reading the Session, so two requests can never act on the same Session at once (two tabs sending at the same moment, or an Undo racing a Frame).

## Storyboards

A Storyboard is started from a Brief and a Frame count (1–32), then made in three steps ([ADR 0019](adr/0019-storyboards-plan-review-write.md)): **planned**, reviewed by the player, then **written** a Frame at a time.

1. **Limits on the Brief:** the term list and, if it names someone, the real-person question.
2. **Plan**, one Text Model call, streaming in: the **Look** (an identity for each **Subject**: everyone and everything the story follows, people, creatures, animals and objects with a part of their own, each named, a group that looks alike as one; and the art style, shared by every Frame), then the **Beats**, one line per Frame with who it shows. All or nothing: a failed or cancelled plan discards the Storyboard.
3. **Review:** the plan waits for the player, who can edit the Look and each Beat and who it shows, add, remove and reorder Beats. Nothing is written or rendered yet.
4. **Write Frames:** a Text Model call per Frame, in order, each given the Look, every Beat with who it shows, the Brief and the seven sentences of the Frames before it; it answers with the Frame's own seven sentences. The Beats are checked with the Limits first, as an Action is. Each Frame is saved as it comes, so a failure or Cancel keeps those written, and writing again carries on from the next.
5. **Frames are assembled:** the identities of the Subjects the Frame shows (at most three, the most prominent first; none for a picture of the place alone) + the Frame's sentences + the Look's style ([ADR 0012](adr/0012-storyboard-look-lists-each-person.md)). A Frame whose prompt crosses a Limit is saved **blocked** and can't be rendered until edited.

Once a Frame is written, the Look and Beats are fixed: **Restart** is the way back to them, deleting every Frame's sentences and pictures, cancelling its jobs and waiting for a render running to end. Each written Frame is then independent:

| Operation | What it does |
|---|---|
| **Render** | Renders the Frame through the shared queue; a re-render replaces its image. |
| **Edit by hand** | Replaces its seven sentences and who it shows. A rendered Frame is marked **stale** until re-rendered. Refused if it crosses a Limit. |
| **Edit by Action** | The Text Model rewrites the Frame's sentences and who it shows, from the Look as it is, after the same Limits check as a Chain; it gets the Look and the Frame, no Beats. An Action that would change the Look comes back unclear, pointing to Restart. |
| **Chain from here** | Makes a new Chain of the Frames up to that one, to carry on from it by Actions; the Storyboard stays as it is ([ADR 0018](adr/0018-carry-on-in-a-new-session.md)). Done in code, with no Text Model call: each Image Prompt becomes a Chain's nine sentences by joining the identities of the people shown into one subject sentence, every word kept; each later Frame has its Beat as the Action; blocked Frames are left out; the pictures are copied with their upscales and 3D. |

## Roleplays

A Roleplay is its own module (`server/roleplay/`, `web/src/roleplay/`), with its own routes under `/api/sessions/:id/roleplay/` ([ADR 0007](adr/0007-roleplay-is-a-conversation-with-a-cast.md)).

1. **The Cast:** one Text Model call writes the **Cast** (the Character, the Persona the player plays, the Setting) from the Brief, checked against every Limit. The player reviews it: edits it, or has it rewritten. A failed or cancelled first Cast discards the Session. A Scenario can start a Roleplay too: its Setup facts and Opening serve as the Brief.
2. **Begin:** the Character's opening Reply, written under the same system message as every later Reply, becomes the Opening Frame.
3. **Each Message:** checked against every Limit, then the whole conversation goes to the Text Model: the system message (rules, Cast, reply format, Limits; the same every call), the opening Reply, each Message and Reply in turn, and the new Message. The Reply streams in field by field (`internal`, `actions`, `dialogue`) and is checked for sexual content. Either declined saves nothing and leaves the Message in the box. Replies are written with Ollama's `repeat_penalty` 1.15, which stopped long Roleplays looping on their own refrains.
4. **Undo** removes the latest exchange and puts its Message back; the opening can't be undone. Once begun, only what steers the Character can be edited (personality, way of speaking, background, goal); how it started is fixed, and **Restart** takes the Roleplay back to reviewing its Cast, deleting every exchange and what was made from them, while the Cast, the Look and the voice stay.
5. **Suggest** writes a Message for the player, to edit or send (nothing is saved). The Text Model, Thinking off, reads the story as the Persona knows it (no thoughts), the Persona, and the player's last five Messages, and writes the next one as the player would type it: their capitalisation, person and length, only the Persona's own actions and words, and a move that takes the scene on. Anything already in the box is the player's steer. The suggestion is tidied and checked against the term list; it holds the Roleplay's lock while it writes.

**Picturing a Frame** (the Art Agent; the Session's Text Model, or the Art Agent model set in Settings, with Thinking off). Each new Reply is pictured as it arrives, while the Text Model is still loaded, so rendering later needs no reload between renders; it's done with Pictures off too, so a Roleplay played without them can be rendered later. The first time, a call writes the Roleplay's **Look** from the Cast and Brief, the same shape as a Storyboard's: an identity for the Character, the Persona and anyone else the Brief names, and an art style fitted to the story's period. Then a call reads the story up to the Frame (thoughts left out, as a picture can't show them), writes the Frame's seven sentences as prose ([ADR 0023](adr/0023-the-art-agent-writes-prose.md)), names anyone in the picture the Look doesn't have yet with their identity, and lists everyone in it, the most prominent first. Newcomers join the Look, so they look the same in every later picture. Clothing carries forward: the request gives each person's clothing sentence from the latest earlier picture showing them, and the Art Agent changes only what the story since changed (marks such as blood and dirt included), so a garment or a wound doesn't come and go between pictures. A picture that crosses a Limit is written once more, told which. With the Limits on, the Art Agent is told to dress anyone the story has undressed, and a picture of two or more people must name what each wears, or it's blocked and written again; with them off, those instructions and checks are skipped. Editing the Look rewrites every pictured Frame's Image Prompt, marking its pictures out of date.

**Voices** (`server/roleplay/voice.ts`; ADR 0010). The first time a line is spoken, the Art Agent's model describes the Character's voice from the Cast in plain acoustic terms (`voice.md`), and the voice service designs a voice from it as a reference clip, saved with the Roleplay. Every line is then spoken by cloning that clip, so the Character sounds the same throughout; editing the description drops the clip, and the next line designs a new one. Only `dialogue` is spoken. Lines carry no emotion tags, which pulled the cloned voice off the Character (docs/research/voices.md); instead each line is directed: the Art Agent's model reads the moment and picks a pace and a sound before it (a sigh, a laugh, a cough), which the voice service turns into Higgs's tags; if directing fails, the line is spoken as written, and says so. A Reply's thought can be spoken too, whispered, with a pace but never a sound. Designing and speaking are queued jobs that wait their turn with renders, so a voice and an image never compete for memory. On the Mac the voice service (`python/voice/serve.py`, mlx-audio) is started on first use, keeps one model loaded at a time and unloads it after a minute unused; on a PC, ComfyUI runs the same two models as workflows (`server/voice/comfyui/`), and the Text Model is unloaded before each voice when both are on that machine.

## Jobs

Everything slow beyond a Chain's Frame is a queued job (`server/jobs.ts`, one queue for every Session): pictures, renders, upscales, edits, voices, 3D, clips and the style scores. What every kind of Session does to a Frame's picture is one module (`server/pictureJobs.ts`); each kind's `jobs.ts` adds its own. The player can queue several and carry on with the conversation, the next Action or edits.

- **One job at a time on each machine** ([ADR 0020](adr/0020-jobs-take-turns-per-machine.md)), across all Sessions, in the order asked: a picture on the Text Model's server, a render on the Session's Image backend, an upscale, an edit or a voice on Settings' backends, 3D and the style scores here. So the Mac and a PC work side by side.
- **A job waits for what it needs**, wherever that runs: a render for its picture, an upscale for its render, 3D for its upscale, a spoken line for a voice being designed. One asked for before what it needs exists fails with a reason if that still isn't there when its turn comes.
- **A picture goes ahead of queued image jobs**, so a new Reply's Image Prompt is written while the Text Model is loaded, not after a batch of renders that each unload it.
- **A render keeps the Image Model it was queued with**, and a clip the Image Model of the picture it's made from, so switching mid-queue leaves queued work where it was.
- **Jobs don't hold the Session's lock**: every change to a Session (a Reply, a picture, a render, a Frame, an Undo) is saved by reloading it and applying just that change, one at a time (`server/update.ts`), so none overwrites another.
- **Failed and done jobs stay listed** until dismissed, failed ones with Retry. Undoing a Frame cancels its jobs; deleting the Session cancels all of them.
- **The queue lives in memory**: restarting the server forgets it.

## Pictures

- **Seed:** fixed for the whole Session: Settings' fixed seed, or a random one picked when it starts. Everything the Session makes is seeded from it ([ADR 0011](adr/0011-one-seed-per-session.md)): pictures and upscales with the seed itself; each spoken line with the seed plus its Frame's index; each take of the voice with the seed plus how many came before; and each Text Model call with the seed plus a hash of what's asked plus how many times the Session asked it before (`server/text/seeded.ts`). So a fixed-seed Session played the same way asks with the same seeds, while a retry or a new take gets a new one. 3D figures use seed 42; SHARP samples nothing.
- **A Session keeps what defines its pictures** ([ADR 0015](adr/0015-a-picture-per-image-model.md)): its Image Model, steps and seed, copied from Settings when it starts. The Image Model is switched in the Session, which resets the steps to the new model's default; a turbo with its own weights or LoRA is an Image Model of its own ([ADR 0016](adr/0016-turbos-are-image-models.md)). Where it renders and how (size, step cache, quantize, float16, the Backends) is read from Settings at each render (ADR 0022), so a change there reaches running Sessions too; a Session may prefer a kind of backend (`imageBackend`). A model of the same name is the same model on either backend.
- **A Frame keeps a picture per Image Model** (`pictures`, `server/pictures.ts`), each with its upscale, edits, 3D, clips and stale flag. It shows the Session's model's picture, or else its latest, marked as by another model; a picture whose Image Prompt changed since is stale. A render replaces only its own model's picture, so switching back shows the old ones without rendering.
- **Upscale** enlarges a picture to 2048 px on its shortest edge with SeedVR2 (7B or 3B, as Settings say), on mflux or ComfyUI. The screens show the upscale where there is one. Upscales and 3D are made from the picture shown when the job starts.
- **Edits** ([ADR 0021](adr/0021-picture-edits-are-versions.md), `server/pictureEdits.ts`): an `edit` job repaints a picture as told, in an area painted over it or all of it, with the edit model Settings or the Edit dialog choose (`server/images/editModels.ts`); on mflux, quantized as Settings say (`editQuantize`). Each edit is a version with its own image, instruction, seed and painted area, made from the newest by the same edit model, so each edit model's edits are a line of their own, its first made from the render. `picked` says which version is the picture; that one is shown, upscaled, made into 3D, compared and copied into a Chain. Only a line's newest edit can be made again or deleted. A render by the same model replaces the picture with its edits.
- **Clips** ([ADR 0025](adr/0025-clips-by-kind.md)): short videos made from a picture by kind (Lead In, Idle Loop, Play out, Into Next), on a ComfyUI, their prompt written by the Text Model from the story and editable. A clip belongs to the picture by the Session's Image Model; a picture by another model has none until that model renders the Frame.
- **3D (experimental)**, made from a picture: **SHARP** (Apple; `server/3d/scene.ts`) turns the whole picture into a 2.5D scene of Gaussian splats that turns about 30°, inventing more the further it turns; **TripoSplat** (VAST; `server/3d/figure.ts`) cuts the person out and builds them whole as a figure that turns all the way round, best with one person unobstructed; **LiTo** (Apple, Mac only, research-only weights) does the same as TripoSplat, kept apart. Each runs once per job as a uv script, so its memory is freed when it's done. Their limits are in [research/image-to-3d.md](research/image-to-3d.md).
- **Compare**, once two Image Models have rendered in a Session: every pictured Frame's picture by each model side by side, with an **Export** to a self-contained static page (`web/export.html`, pictures as WebP, written to `exports/<Session id>/`) that can optionally ask visitors to confirm they're 18 or older, a courtesy, not a lock. **Style scores** measure how varied each model's art style is across the Frames, from CSD and CLIP embeddings (`python/style/make.py`, kept in the Session's `style.json`); how and why: [research/style-scores.md](research/style-scores.md), [ADR 0017](adr/0017-no-vision-judge-for-style-scores.md).

In testing, FLUX.2 Klein 4B keeps a person's face, hair and outfit consistent across Frames. For drift, see *reference images and edits for Subject consistency* in [open-threads.md](open-threads.md).

## Settings

Kept on the server (`settings.json`). **Machines** lists the Backends there are, in the order a job tries them: this machine's own programs, and each ComfyUI, Ollama or server with the OpenAI chat API added, with its API key kept in the file and never sent back (ADR 0008). Each kind of work goes to the Backend its tab prefers, or the next that can do it, as Settings are when it's queued. A Session copies the Text Model, Thinking, the Image Model, steps and seed when it starts; everything else applies at once, to running Sessions too. The Limits can be switched off (on by default); the call log on (off by default).

Hand edits (a Look, a Cast, a Storyboard Frame) save themselves when the focus leaves their panel, and work that reads them saves them first. A change the server refuses (a Limit) stays as typed, saying why; a change from elsewhere replaces the draft unless it has unsaved edits.

## Storage

| What | Where | Notes |
|---|---|---|
| Settings | `settings.json` | Missing, corrupt or invalid → defaults; missing fields filled from defaults |
| Scenarios | `scenarios/*.md` | Read fresh on every request, so edits need no restart |
| Sessions | `<Session folder>/<id>/session.json` + its files | Id is `YYYYMMDD-HHMMSS-xxxx`; files are written to a temp file, then renamed, and carry a random suffix, so a Frame made after an Undo never reuses a file name |
| Call log | `<id>/calls/frame-N.json`, `calls/setup.json` | Only with Settings' call log on |

Frames are numbered from 1 on every screen and in the server's messages (`frameName`); `session.json`, the API and the file names count from 0.

**The call log** (`server/calls.ts`) is for studying what the models are sent. With it on, every call to the Text Model (its job, messages, schema, seed and caps, and the reply and reasoning), the Image Model, the voice engine, 3D and the style embedder is added to a JSON array in the Session's `calls/` folder as it's made: one file per Frame, and `setup.json` for what isn't one Frame's. A call is added over the file's closing `]`, so the file is never rewritten and stays valid JSON; one file per Frame keeps each small enough for an editor to fold. The calls are logged as they're made rather than rebuilt later, as each is built from what earlier calls returned.

## API

All under `/api`; the Vite dev server proxies it to the Deno server, and to list the routes, search `server/app.ts`, `server/roleplay/routes.ts` and `server/video/routes.ts` for `'(GET|PUT|POST|DELETE)',` with a line after it: each route is its method, its path (a Roleplay's under `/api/sessions/:id/roleplay/`) and its handler. A `POST` must say its body is JSON, or it's refused with `415`: any web page can send a form or plain text to another site without asking first, but not JSON, which needs a preflight the server never answers (it sends no CORS headers). So a page on another site can't make Sessions, queue jobs, or have a saved API key sent to an address of its choosing. Work that takes a while (a Frame, a plan, a Reply, Suggest) streams as server-sent events, ending in exactly one of done, failed or cancelled; the rest is queued as jobs and polled.

## Stack

Deno workspace: `server/` (Deno HTTP, no framework) and `web/` (Vue 3, Vite, Tailwind 4, vue-router, VueUse), both run by Deno. Everything remembered per browser goes through one helper, `useStoredString` (`web/src/composables/storage.ts`): saved at once, never synced from other tabs, and held in memory for the visit when the browser blocks storage. Tests: `deno test` for the server, Vitest with happy-dom for the web app; the mflux CLI is exercised through a fake executable, and ComfyUI's API through a fake server (HTTP and WebSocket).
