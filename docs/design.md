# Design

How it works, as agreed during design and adjusted since. Which models to run is in
[models.md](models.md). Terms in **bold** are defined
in [CONTEXT.md](../CONTEXT.md). The reasoning behind the bigger choices is in [adr/](adr/).

## What it is

A text-to-image prompt generator. Every Session starts from a **Brief** (typed, or a saved
**Scenario**) and is one of two kinds: a **Chain**, where each Frame is made from the previous
one by an Action, or a **Storyboard**, whose Frames are planned together and then edited and
rendered one by one. (The Storyboard screen is being built; its engine and API are below.) The
player starts a **Session** from it and plays **Frames**: each Frame, the player writes an
**Action** (what to change), the **Text Model** edits the **Image Prompt**, and the **Image
Model** renders it. There is no score and no end; a Session lasts until it's deleted.

The Image Prompt is one paragraph of nine sentences, one per aspect in a fixed order: subject
and identity → pose and limbs → expression → camera angle and framing → clothing → environment
→ lighting → color → art style and medium ([ADR 0005](adr/0005-image-prompt-is-the-state.md)).
Anything in it can be changed; the engine's four **Limits** are the only lines an Action can't
cross ([ADR 0002](adr/0002-guardrails-enforced-by-the-engine.md)).

The first Scenario is a studio photoshoot with Maya, a fictional fitness model.

## The Frame loop

```
Action ──► Limits check (term list; a real-person question if it names someone)
   │           └─ crossed ──► Declined: prompt and image unchanged
   ▼
current Image Prompt + Action ──► Text Model (Ollama) ──► { outcome, narration, prompt }
                                                              │
     engine: declined / unclear / Limit crossed / unchanged? keep the previous prompt and image
                                                              │
                  "adult, " + the paragraph ──► Image Model (mflux) ──► frame-N-xxxx.png
                                                              │
                                        commit: append the Frame to session.json
```

1. **Limits on the Action.** The Action is checked against the Limits' term list before the Text
   Model is asked. An Action that looks like it names someone (a capitalised full name, "look
   like", "resemble"; names inside a style clause such as "in the style of Michelangelo" don't
   count) also gets a narrow yes/no question to the Text Model about real people. A
   crossed Limit declines the Frame at once: the Narration names the Limit.
2. **Text step.** The system message is the engine's rules (the nine sentences and what each
   covers; rewrite only the affected sentences and copy the rest word for word; remove whatever
   a change contradicts; the Limits; the reply format), then the Scenario's notes, plus its **Setup** on the Opening Frame
   only. The user message is **only** the current Image Prompt and the Action; the Text Model
   never sees earlier Frames ([ADR 0001](adr/0001-scene-is-sole-frame-state.md)). The reply is
   constrained by a JSON schema (Ollama's `format`), with `outcome` (`done`, `declined` or
   `unclear`) first, so the model decides before it writes. The Narration is a terse list of what
   changed ("Pose: crouching low. Environment: teal backdrop."). Ollama's reply is streamed. With
   **Thinking** on (a Setting, for models that support it) the model reasons first; its
   reasoning streams to the player and is saved with the Frame. Models that can't think are asked
   again without it.
3. **Retry and limits on the call.** An unusable reply (bad JSON, an empty prompt, or
   one cut off by the length cap) is retried once, then the Frame fails. Every Text Model call has
   a token cap (2,048 tokens; 12,288 with thinking; 32 for the real-person question) and a time
   limit (2 minutes; 10 with thinking; 30 s for the real-person question). Small models writing
   JSON under a schema occasionally never stop, padding with whitespace; without the caps one
   such reply blocked Ollama, and every later request behind it, for 14 minutes.
4. **Engine rules** ([ADR 0002](adr/0002-guardrails-enforced-by-the-engine.md)):
   - The new Image Prompt is checked against the Limits too; crossing one declines the Frame.
   - A **Declined Frame** or an **Unclear Frame** keeps the previous Image Prompt and image,
     whatever the model returned, and renders nothing.
   - A done Frame whose Image Prompt came back unchanged also reuses the previous image.
   - The Opening Frame always counts as done; if its prompt crosses a Limit, it fails.
   - The text rendered is `adult, ` followed by the paragraph.
5. **Image step.** Images render one at a time across all Sessions: if another Session is
   rendering, this Frame waits in a queue (shown as "Waiting for another render…", and
   cancellable). Then the mflux CLI renders the image with the Session's seed and settings. Its
   step counter is streamed to the player as progress
   ([ADR 0004](adr/0004-images-from-the-mflux-cli.md)).
6. **Commit.** The Frame is appended to `session.json`.

### All or nothing

A Frame commits whole or not at all ([ADR 0003](adr/0003-frames-are-all-or-nothing.md)):

| What happens | Result |
|---|---|
| Text Model fails twice | Frame fails; Image Prompt unchanged; the Action stays in the text box |
| Image Model fails | Frame fails; Image Prompt unchanged; any partial image is deleted |
| Player presses **Cancel** | Ollama request aborted, mflux process killed; Image Prompt unchanged |
| Opening Frame fails or is cancelled | The Session is discarded; back Home with the error |

While a Frame runs, the new Narration is shown **provisionally** (dimmed) as soon as the Text
Model returns, with "Rendering the image… step 2 of 4" beneath it. It becomes real only when the image
arrives.

Only one Frame runs per Session at a time; the server refuses a second with `409`. Frames, Undo and
deleting a Session all take a per-Session lock *before* reading the Session, so two requests can
never act on the same Session at once (e.g. two tabs sending at the same moment, or an Undo
racing a Frame).

## Storyboards

A Storyboard is started from a Brief and a Frame count (1–16, default 8), then **planned** in one
Text Model call ([ADR 0006](adr/0006-storyboards-plan-in-one-call.md)):

1. **Limits on the Brief:** the term list and, if it names someone, the real-person question.
   The Brief is also checked with the term list when the Storyboard is created.
2. **The plan streams in:** the **Look** (identity and art style, shared by every Frame), the
   **Beats** (one line per Frame), then each Frame's seven sentences (pose, expression, camera,
   clothing, environment, lighting, color), each shown the moment it's complete.
3. **Frames are assembled:** Look subject + the Frame's sentences + Look style, rendered with
   "adult, " in front. A Frame whose prompt crosses a Limit is saved **blocked** and can't be
   rendered until edited.
4. **All or nothing:** a failed or cancelled plan discards the Storyboard.

After planning, each Frame is independent:

| Operation | What it does |
|---|---|
| **Render** | Renders one Frame through the shared queue; a re-render replaces its image (the old file is deleted once the new one is saved). |
| **Edit by hand** | Replaces a Frame's seven sentences; stray labels are stripped. A rendered Frame is marked **stale** until re-rendered. Refused if it crosses a Limit. |
| **Edit the Look** | Rewrites every Frame's prompt; rendered Frames become stale. |
| **Upscale** | As for a Chain Frame (below); a re-render or Undo deletes the upscale with the image. |
| **Edit by Action** | The Text Model rewrites that Frame (and the Look, if the Action changes identity or style), after the same Action Limits check as a Chain. Declined or unclear Actions change nothing. |

Each Frame records how long its text took (the wait for its part of the plan, or its latest
edit) and its latest render.

## Consistency

- **Seed:** fixed for the whole Session: the fixed seed from Settings, or a random one picked
  when the Session starts.
- **Subject description:** carried in the first sentence (subject and identity), which the Text
  Model copies word for word unless an Action changes it.
- **Settings are copied into each Session when it starts,** so changing Settings mid-Session
  never changes the Image Model, seed or size of a running Session. Changes apply from the next
  Session.

In testing, FLUX.2 Klein 4B keeps Maya's face, hair and outfit consistent across Frames. Z-Image
Turbo ignores her described appearance. If drift becomes a problem, see *edit-based rendering*
in [open-threads.md](open-threads.md).

## Screens

- **Home** (`/`, also reached by clicking **RPG**): **Your Sessions**, one card per saved
  Session, newest first: the latest rendered image, its title (the Scenario, or the start of the
  Brief), its kind (Chain or Storyboard), the Frame count, when it was last played,
  and what a running Frame is doing ("Writing…", "Waiting to render…", "Rendering…"; the list
  refreshes every 2 s while anything runs). Hovering a card shows **Delete**, which asks for
  confirmation and is disabled while that Session has a Frame running. Below, **Start a new
  Session**: the kind (Chain or Storyboard), then Scenario cards (a lone Scenario is preselected)
  or **Your own Brief** (a text box, up to 4000 characters), the Frame count for a Storyboard
  (1–16, default 8), a report of any Scenario files that failed to load, and the current Text and
  Image Models. Start is blocked, with the reason shown,
  if no Text Model is set or the chosen one is no longer installed.
- **Session** (`/sessions/:id`): the image fills everything above a fixed-height text box, so
  it never resizes as the text changes. The Narration is a caption over the bottom of the photo
  (provisional text shows dimmed and in italics while a Frame runs); the caption can be hidden,
  and that choice is remembered per browser. The Frame's status ("Rendering the image… step 2 of 4") is a
  pill in the image's top corner. Enter sends; Shift+Enter adds a new line. A done Frame clears the text box; a declined or
  unclear one leaves your Action there to reword. While a Frame runs,
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
  and dimmer. The image crossfades (700 ms) when a new Frame
  arrives or another Frame is picked; the next image is preloaded first, so there is no blank
  frame.
  **Upscale** (beside Send, and beside Render all on a Storyboard) enlarges the shown Frame's
  image to 2048 px on its shortest edge with the SeedVR2 model chosen in Settings (7B by default, or 3B;
  `mflux-upscale-seedvr2`), through the
  same render queue, with the same sweep and step count. The original stays as the thumbnail; the
  main view shows the upscaled image. The button reads **Upscaled**, disabled, once done, and
  every Chain Frame that reuses that image shares the upscale (saved as `upscaled` on the Frame,
  in a `-2048` file next to the original). Hovering the image shows its size in pixels in the top-left
  corner ("768×512", then "3072×2048" once upscaled), except while the status pill is there.
  Pinching the trackpad over the image zooms the image, not the page (up to 8×, toward the
  pointer, with the zoom level added to the size chip); while zoomed in, two-finger scrolling or
  dragging pans, and a double-click resets. Each new image starts unzoomed.
- **Storyboard** (`/storyboards/:id`): opening a new Storyboard plans it straight away. The
  Frames list fills in as the plan streams: Beats first (each marked "Writing…"), then each
  Frame's sentences; the status pill counts "Writing Frame 3 of 8…". The main area shows the
  selected Frame's image (or "Not rendered yet"), its Beat as a caption and a pill with its status:
  **Draft** (never rendered), **Rendered**, **Changed since render** (stale) or **Blocked**. Below
  it: an Action box that edits the selected Frame (Enter sends; a declined or unclear Action stays
  to reword; the Narration shows in the button row), **Render / Re-render Frame N**, and
  **Render all (N)**, which renders every draft or stale Frame in turn, skipping blocked ones,
  until done or cancelled. The Frames list shows each Frame's thumbnail (dimmed when stale), Beat
  and status. The Prompt panel has the **Look** (subject and art style, saved for every Frame) and
  the selected Frame's seven sentences, each editable by hand with its own Save, then the full
  prompt and the Frame's timings. The panels, the render sweep and the unsent Action (remembered
  per Session) work as on the Session screen. A Chain opened at a Storyboard's address, or the
  other way round, is sent to its own screen.
- **Navigation:** **RPG** leads Home; **Play** leads back to the Session opened last
  (remembered per browser), or Home when there is none. Up to five Session screens stay alive in
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
- **Settings** (`/settings`): Text Model (installed Ollama models, minus OCR and dedicated
  vision-language models), Thinking (on or off; only for models that support it), Image Model, steps (reset to the model's default when the Image Model
  changes), quantization, size (six presets from 512×512 to 1216×832), seed (random per
  Session, or fixed) and Upscaler (SeedVR2 7B or 3B). Settings are copied into a Session when it
  starts, except the Upscaler, which is read at each upscale: it can't change how Frames look.
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
| `GET`, `PUT /settings` | Read or save Settings (`400` with a list of issues if invalid) |
| `GET /settings/options` | Text Models from Ollama, Image Models, size presets; still answers if Ollama is down |
| `GET /scenarios` | Scenario summaries plus files that failed to load |
| `GET /sessions` | Session summaries, newest first, with each one's current activity |
| `POST /sessions` | Start a Session: `{ kind?: "chain" \| "storyboard", scenarioId \| brief, frameCount? }` |
| `DELETE /sessions/:id` | Delete a Session and its images (`409` while a Frame runs) |
| `GET /sessions/:id` | A Session with its Frames, plus `activity`: what a running Frame is doing, or `null` |
| `POST /sessions/:id/frames` | Chain: run a Frame (`{ action }`, or `{}` for the Opening Frame) as a server-sent event stream |
| `POST /sessions/:id/plan` | Storyboard: plan it, streaming `look`, `beats`, `planned-frame` × N, then `planned` |
| `POST /sessions/:id/frames/:index/render` | Storyboard: render one Frame, streaming progress then `rendered` |
| `POST /sessions/:id/frames/:index/edit` | Storyboard: edit one Frame by `{ action }`, streaming then `edited` (`outcome`, `narration`, `session`) |
| `PUT /sessions/:id/frames/:index` | Storyboard: replace a Frame's sentences, `{ body }` (`422` if it crosses a Limit) |
| `PUT /sessions/:id/look` | Storyboard: replace the Look, `{ subject, style }` |
| `POST /sessions/:id/cancel` | Cancel the Frame in progress |
| `POST /sessions/:id/frames/:index/upscale` | Either kind: upscale one rendered Frame's image to 2048 px, streaming progress then `upscaled` (`session`); `409` if it has no image or is already upscaled |
| `DELETE /sessions/:id/frames/:index` | Undo the latest Frame; `:index` must name it (`409` otherwise, and for the Opening Frame or while a Frame runs) |
| `GET /sessions/:id/images/:file` | A Frame's image |

A Frame's stream emits `phase` (`text`, then `queued` if another Session is rendering, then
`image`), `thinking` (reasoning chunks; `restart` when a retry begins afresh), `text` (the provisional Image Prompt and Narration),
`progress` (image steps), then exactly one of `committed`, `failed` or `cancelled`.
`sessionDiscarded` on the last two tells the client that an Opening Frame took the Session with it.

## Stack

Deno workspace: `server/` (Deno HTTP, no framework) and `web/` (Vue 3, Vite, Tailwind 4,
vue-router), both run by Deno. Tests: `deno test` for the server, Vitest with happy-dom for the
web app. The mflux CLI is also exercised in tests through a fake executable.

## Decisions log

The design Q&A, and what changed later.

| Decision | Chosen | Changed since |
|---|---|---|
| Premise | Studio photoshoot with a fictional adult professional Subject and guardrails | Now a text-to-image prompt generator; the photoshoot is its first Scenario |
| Goal | Open sandbox; no scoring | — |
| Backend | Deno HTTP server; Vite proxies `/api` | — |
| Images | mflux CLI per image, behind `ImageGenerator` | Downloads blocked (ADR 0004) |
| Frame state | The Scene only, no history (ADR 0001) | The Image Prompt: one paragraph of nine sentences (ADR 0005) |
| Text Model output | One JSON call | `{ outcome, narration, prompt }`, the prompt as one paragraph |
| Settings | Server-side `settings.json`; apply from the next Session | Small sizes added |
| Side panel | Frames list with thumbnails; End/Reset as buttons only | End and Reset removed; Sessions are listed, opened and deleted on Home |
| Several Sessions rendering | Queue images one at a time across Sessions | A queued Frame keeps you in its Session |
| What an Action can change | Pose, camera, lighting, set, per Scenario | Anything in the prompt, within the four Limits |
| Limits | Per-Scenario brief, character refusals | Four engine Limits: term list + real-person check (ADR 0002) |
| Narration | Character prose | A terse list of what changed |
| Every Frame renders | Yes; no separate "take the shot" | — |
| Subject consistency | Fixed description + fixed seed; edit-based rendering deferred | — |
| Failures | All or nothing (ADR 0003) | — |
| Waiting | Show text first, then the image, over SSE | Step progress added |
| During a Frame | Text box locked; Cancel button | — |
| Scenario format | Markdown with YAML frontmatter in `scenarios/` | — |
| Persistence | Sessions saved to disk; resume UI deferred | — |
| Toolchain | Deno for everything | `vue-tsc` runs on Node |
