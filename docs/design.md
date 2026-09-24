# Design

How the game works, as agreed during design and adjusted since. Terms in **bold** are defined
in [CONTEXT.md](../CONTEXT.md). The reasoning behind the bigger choices is in [adr/](adr/).

## The game

A single-player, turn-based sandbox. A **Scenario** file sets up the world. The player starts a
**Session** from it and plays **Turns**: each Turn, the player writes an **Action**, the **Text
Model** rewrites the **Scene**, and the **Image Model** renders it. There is no score and no win
condition; the Session runs until the player ends it.

The first Scenario is a studio photoshoot. The player is the photographer and directs the
**Subject** (Maya, a fictional adult professional model) within a fixed **Shoot Brief**.
Photoshoot Actions are called **Directions** and cover four areas: the Subject's pose,
expression and gaze; the camera; the lighting; and the set.

## The Turn loop

```
current Scene + Action ──► Text Model (Ollama) ──► { outcome, narration, scene }
                                                          │
             engine: declined / unclear / unchanged? keep the previous Scene and image
                                                          │
             imagePrefix + labelled Scene fields ──► Image Model (mflux) ──► turn-N.png
                                                          │
                                   commit: append the Turn to session.json
```

1. **Text step.** The Text Model receives the Scenario's System prompt, its **Setup** (as YAML)
   and the output rules as the system message, plus **only** the current Scene and the Action as
   the user message. It never sees earlier Turns ([ADR 0001](adr/0001-scene-is-sole-turn-state.md)).
   The reply is constrained by a JSON schema (Ollama's `format`) whose `scene` property is the
   Scenario's Scene schema. `outcome` (`done`, `declined` or `unclear`) comes first in the
   schema, so the model decides before it
   narrates. Ollama's reply is streamed. With **Thinking** on (a Setting, for models that
   support it) the model reasons first; its reasoning streams to the player as it's written
   and is saved with the Turn. Models that can't think are asked again without it.
2. **Retry.** An unusable reply (bad JSON, missing required Scene fields) is retried once, then
   the Turn fails.
3. **Engine rules** ([ADR 0002](adr/0002-guardrails-enforced-by-the-engine.md)):
   - A **Declined Turn** or an **Unclear Turn** keeps the previous Scene and image, whatever
     the model returned, and renders nothing.
   - A done Turn whose Scene came back unchanged also reuses the previous image rather than
     spending a render on the same picture.
   - The Opening Turn always counts as done.
   - The image prompt is built by the engine: the Scenario's `imagePrefix`, then every Scene
     field as a labelled phrase (`subject pose: …, camera angle: low, set backdrop: …`).
4. **Image step.** Images render one at a time across all Sessions: if another Session is
   rendering, this Turn waits in a queue (shown as "Waiting for another render…", and
   cancellable). Then the mflux CLI renders the image with the Session's seed and settings. Its step
   counter is streamed to the player as progress
   ([ADR 0004](adr/0004-images-from-the-mflux-cli.md)).
5. **Commit.** The Turn is appended to `session.json`.

### All or nothing

A Turn commits whole or not at all ([ADR 0003](adr/0003-turns-are-all-or-nothing.md)):

| What happens | Result |
|---|---|
| Text Model fails twice | Turn fails; Scene unchanged; the Action stays in the text box |
| Image Model fails | Turn fails; Scene unchanged; any partial image is deleted |
| Player presses **Cancel** | Ollama request aborted, mflux process killed; Scene unchanged |
| Opening Turn fails or is cancelled | The Session is discarded; back Home with the error |

While a Turn runs, the new Scene text is shown **provisionally** (dimmed) as soon as the Text
Model returns, with "Rendering the image… 2/4" beneath it. It becomes real only when the image
arrives.

Only one Turn runs per Session at a time; the server refuses a second with `409`. Turns, Undo and
deleting a Session all take a per-Session lock *before* reading the Session, so two requests can
never act on the same Session at once (e.g. two tabs sending at the same moment, or an Undo
racing a Turn).

## Consistency

- **Seed:** fixed for the whole Session: the fixed seed from Settings, or a random one picked
  when the Session starts.
- **Subject description:** in the `imagePrefix`, so it's in every image prompt.
- **Settings are copied into each Session when it starts,** so changing Settings mid-Session
  never changes the Image Model, seed or size of a running Session. Changes apply from the next
  Session.

In testing, FLUX.2 Klein 4B keeps Maya's face, hair and outfit consistent across Turns. Z-Image
Turbo ignores her described appearance. If drift becomes a problem, see *edit-based rendering*
in [open-threads.md](open-threads.md).

## Screens

- **Home** (`/`, also reached by clicking **RPG**): **Your Sessions**, one card per saved
  Session, newest first: the latest image, the Scenario, the Turn count, when it was last played,
  and what a running Turn is doing ("Writing…", "Waiting to render…", "Rendering…"; the list
  refreshes every 2 s while anything runs). Hovering a card shows **Delete**, which asks for
  confirmation and is disabled while that Session has a Turn running. Below, **Start a new
  Session**: Scenario cards (a lone Scenario is preselected), a report of any Scenario files that
  failed to load, and the current Text and Image Models. Start is blocked, with the reason shown,
  if no Text Model is set or the chosen one is no longer installed.
- **Session** (`/sessions/:id`): the image fills everything above a fixed-height text box, so
  it never resizes as the text changes. The Narration is a caption over the bottom of the photo
  (provisional text shows dimmed and in italics while a Turn runs); the caption can be hidden,
  and that choice is remembered per browser. The Turn's status ("Rendering the image… 2/4") is a
  pill in the image's top corner. Enter sends; Shift+Enter adds a new line. While a Turn runs,
  the text box is locked and **Cancel** replaces **Send**; a failed Turn's error shows in the
  button row. Typed text is always treated as an Action; there are no typed commands.
  The right panel has two tabs. **Turn Log** shows a thumbnail, the Action and the Narration per
  Turn; clicking one shows that Turn. While an earlier Turn is shown, a pill on the image reads
  "Viewing Turn 1 of 4 · Back to latest", and the text box says the next Direction continues from
  the latest Turn: Directions always build on the latest Turn, never on the one being viewed. Declined Turns are labelled and tinted amber, Unclear
  Turns ("Didn't understand") blue, both in the log and on the caption. **Scene** shows the
  viewed Turn's Scene fields, its thinking (collapsed, when there was any) and its image prompt.
  While a thinking model reasons, the reasoning streams into the caption area under
  "Thinking…" and gives way to the Narration once it arrives. Because the Session id is in the URL,
  reloading the page keeps you in the Session. The image crossfades (700 ms) when a new Turn
  arrives or another Turn is picked; the next image is preloaded first, so there is no blank
  frame.
- **Navigation:** **RPG** leads Home; **Play** leads back to the Session opened last
  (remembered per browser), or Home when there is none. Up to five Session screens stay alive in
  memory while you visit Home, Settings or other Sessions, so each keeps its half-typed Direction,
  viewed Turn, tab and any running Turn. The unsent Direction is also saved per Session in the
  browser, so it survives a reload. Returning to a Session re-checks it with the server (unless a
  Turn is running there); a Session deleted meanwhile sends you Home. While a Session's Turn is
  **waiting in the render queue**, you can't leave that Session (links, Back and reload are
  blocked) until it starts rendering or you cancel it. A Session screen that finds a Turn already
  running which it didn't start (after a page reload, or from another tab) shows its progress
  with **Cancel** and follows it until it finishes. A Session in the background never navigates
  on its own: if its Opening Turn fails there, you're taken Home with the reason when you return
  to it.
- **Settings** (`/settings`): Text Model (installed Ollama models, minus OCR and dedicated
  vision-language models), Thinking (on or off; only for models that support it), Image Model, steps (reset to the model's default when the Image Model
  changes), quantization, size (six presets from 512×512 to 1216×832) and seed (random per
  Session, or fixed).
- **Theme:** Light (a parchment tint), Dark or System, remembered per browser. It's a display
  preference, not a Setting.

**Undo** removes the latest Turn: the previous Turn's Scene is current again, its image is
deleted unless an earlier Turn still shows it, and the undone Direction goes back into the text
box (unless you've started typing a new one). It's offered in the button row and on the latest
Turn in the Turn Log, never for the Opening Turn, and never while a Turn runs. Image files carry
a random suffix, so a Turn made after an Undo never reuses the undone Turn's file name, and the
browser can't show a stale cached image.

There is no End or Reset. A Session is simply left and returned to; to start over, start a new
Session from Home, and delete old ones there.

## Storage

| What | Where | Notes |
|---|---|---|
| Settings | `settings.json` | Missing, corrupt or invalid → defaults; missing fields filled from defaults |
| Scenarios | `scenarios/*.md` | Read fresh on every request, so edits need no restart |
| Sessions | `sessions/<id>/session.json` + `turn-N-xxxxxxxx.png` | Id is `YYYYMMDD-HHMMSS-xxxx`; files are written to a temp file, then renamed |

## API

All under `/api`; the Vite dev server proxies it to the Deno server.

| Route | Purpose |
|---|---|
| `GET /health` | Liveness |
| `GET`, `PUT /settings` | Read or save Settings (`400` with a list of issues if invalid) |
| `GET /settings/options` | Text Models from Ollama, Image Models, size presets; still answers if Ollama is down |
| `GET /scenarios` | Scenario summaries plus files that failed to load |
| `GET /sessions` | Session summaries, newest first, with each one's current activity |
| `POST /sessions` | Start a Session from `{ scenarioId }` |
| `DELETE /sessions/:id` | Delete a Session and its images (`409` while a Turn runs) |
| `GET /sessions/:id` | A Session with its Turns, plus `activity`: what a running Turn is doing, or `null` |
| `POST /sessions/:id/turns` | Run a Turn (`{ action }`, or `{}` for the Opening Turn) as a server-sent event stream |
| `POST /sessions/:id/cancel` | Cancel the Turn in progress |
| `DELETE /sessions/:id/turns/:index` | Undo the latest Turn; `:index` must name it (`409` otherwise, and for the Opening Turn or while a Turn runs) |
| `GET /sessions/:id/images/:file` | A Turn's image |

A Turn's stream emits `phase` (`text`, then `queued` if another Session is rendering, then
`image`), `thinking` (reasoning chunks; `restart` when a retry begins afresh), `text` (the provisional Scene and Narration),
`progress` (image steps), then exactly one of `committed`, `failed` or `cancelled`.
`sessionDiscarded` on the last two tells the client that an Opening Turn took the Session with it.

## Stack

Deno workspace: `server/` (Deno HTTP, no framework) and `web/` (Vue 3, Vite, Tailwind 4,
vue-router), both run by Deno. Tests: `deno test` for the server, Vitest with happy-dom for the
web app. The mflux CLI is also exercised in tests through a fake executable.

## Decisions log

The design Q&A, and what changed later.

| Decision | Chosen | Changed since |
|---|---|---|
| Premise | Studio photoshoot with a fictional adult professional Subject and guardrails | — |
| Goal | Open sandbox; no scoring | — |
| Backend | Deno HTTP server; Vite proxies `/api` | — |
| Images | mflux CLI per image, behind `ImageGenerator` | Downloads blocked (ADR 0004) |
| Turn state | The Scene only, no history (ADR 0001) | — |
| Text Model output | One JSON call | Originally `{ scene, imagePrompt }`; now the engine builds the image prompt from the Scene |
| Settings | Server-side `settings.json`; apply from the next Session | Small sizes added |
| Side panel | Turn Log with thumbnails; End/Reset as buttons only | End and Reset removed; Sessions are listed, opened and deleted on Home |
| Several Sessions rendering | Queue images one at a time across Sessions | A queued Turn keeps you in its Session |
| Direction areas | Pose, camera, lighting, set: defined by the Scenario, not the engine | — |
| Every Turn renders | Yes; no separate "take the shot" | — |
| Subject consistency | Fixed description + fixed seed; edit-based rendering deferred | — |
| Failures | All or nothing (ADR 0003) | — |
| Waiting | Show text first, then the image, over SSE | Step progress added |
| During a Turn | Text box locked; Cancel button | — |
| Scenario format | Markdown with YAML frontmatter in `scenarios/` | — |
| Persistence | Sessions saved to disk; resume UI deferred | — |
| Toolchain | Deno for everything | `vue-tsc` runs on Node |
