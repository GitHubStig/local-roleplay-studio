# Settings, storage and the API

Part of the [design](../design.md). Terms in **bold** are defined in [CONTEXT.md](../../CONTEXT.md).

## Settings

Kept on the server (`settings.json`). **Machines** lists the Backends there are, in the order a job tries them: this machine's own programs, and each ComfyUI, Ollama or server with the OpenAI chat API added, with its API key kept in the file and never sent back (ADR 0008). Each kind of work goes to the Backend its tab prefers, or the next that can do it, as Settings are when it's queued. A Session copies the Text Model, Thinking, the Image Model, steps and seed when it starts, and switches its Text Model and Image Model in it ([ADR 0037](../adr/0037-a-session-switches-text-model.md), ADR 0015); everything else applies at once, to running Sessions too. The Limits can be switched off (on by default); the call log on (off by default).

Hand edits (a Look, a Cast, a Storyboard Frame) save themselves when the focus leaves their panel, and work that reads them saves them first. A change the server refuses (a Limit) stays as typed, saying why; a change from elsewhere replaces the draft unless it has unsaved edits.

## Storage

| What | Where | Notes |
|---|---|---|
| Settings | `settings.json` | Missing, corrupt or invalid → defaults; missing fields filled from defaults |
| The job queue | `queue.json` | Every Session's jobs; written through a temp file, then renamed; missing → empty |
| Scenarios | `scenarios/*.md` (the player's, gitignored) | Read fresh on every request, so edits need no restart. The examples (`example-scenarios/*.md`) are copied in at startup when there's no such folder yet (a fresh install, a new worktree), then the player's to keep or delete; an emptied folder stays empty. A Session keeps its own copy in `session.json` (`scenario`), as the Scenario page left it, so editing or deleting the file leaves it alone ([ADR 0032](../adr/0032-scenarios-are-stories-kept-in-each-session.md)) |
| Sessions | `<Session folder>/<id>/session.json` + its files | Id is `YYYYMMDD-HHMMSS-xxxx`; files are written to a temp file, then renamed, and carry a random suffix, so a Frame made after an Undo never reuses a file name |
| Call log | `<id>/calls/frame-N.json`, `calls/setup.json` | Only with Settings' call log on |

Frames are numbered from 1 on every screen and in the server's messages (`frameName`); `session.json`, the API and the file names count from 0.

**The call log** (`server/calls.ts`) is for studying what the models are sent. With it on, every call to the Text Model (its job, messages, schema, seed and caps, and the reply and reasoning), the Image Model, the voice engine, 3D and the style embedder is added to a JSON array in the Session's `calls/` folder as it's made: one file per Frame, and `setup.json` for what isn't one Frame's. A call is added over the file's closing `]`, so the file is never rewritten and stays valid JSON; one file per Frame keeps each small enough for an editor to fold. The calls are logged as they're made rather than rebuilt later, as each is built from what earlier calls returned.

## API

All under `/api`; the Vite dev server proxies it to the Deno server, and to list the routes, search `server/` for `'(GET|PUT|POST|DELETE)',` with a line after it: each route is its method, its path (a Roleplay's under `/api/sessions/:id/roleplay/`) and its handler, in its part's `routes.ts` (`chain/`, `storyboard/`, `roleplay/`, `scenario/`, `video/`) or, for what every kind shares, `sessionRoutes.ts`, `pictureRoutes.ts`, `settingsRoutes.ts` and `jobs.ts` at the top. A `POST` must say its body is JSON, or it's refused with `415`: any web page can send a form or plain text to another site without asking first, but not JSON, which needs a preflight the server never answers (it sends no CORS headers). So a page on another site can't make Sessions, queue jobs, or have a saved API key sent to an address of its choosing. Work that takes a while (a Frame, a plan, a Reply, Suggest) streams as server-sent events, ending in exactly one last event: its result, `failed` or `cancelled`; the rest is queued as jobs and polled.
