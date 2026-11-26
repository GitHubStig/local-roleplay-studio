# Working on this repo

Instructions for any coding agent (and person) working on Local Roleplay Studio. What the app is
and how to run it is in the [README](README.md); this is how the owner likes the work done.

## Read first

Always: [CONTEXT.md](CONTEXT.md), the domain's terms (Session, Frame, Action, Roleplay, Look, Limit…). Use them in code, docs and the UI.

Then only what the work needs, rather than every doc:

| Working on | Read |
|---|---|
| Any part of the app | [docs/design.md](docs/design.md), a short overview and index, then that part's page in [docs/design/](docs/design/): `chain.md`, `storyboard.md`, `roleplay.md`, `music.md`, `scenario-page.md`, `jobs.md`, `pictures.md`, `settings-and-storage.md`. How the app works now, its main behaviours only: no screen layout, timings or history (dates and what changed are in git and the ADRs) |
| Why something is the way it is | [docs/adr/](docs/adr/), which the design pages link to |
| What to do next, or an idea that came up | [docs/open-threads.md](docs/open-threads.md): plans and parked ideas, a few lines each with their status, the detail in the research file each links to. Finished work moves out of it, into the design doc, an ADR or `docs/research/` |
| The project's story: what was built, how, and what was dropped | [docs/showcase/](docs/showcase/README.md): material for a public page about the app, a line per piece with links to what tells it |
| A piece of work too big for one session | `docs/<piece>-plans.md`: a plan in stages, updated as it goes, so a new session picks it up from the file. When the work is done, its pieces move into the design doc, ADRs, CONTEXT.md and `docs/research/`, and the plan is deleted |
| Models: which, how fast, how much memory | [docs/models.md](docs/models.md): the picks now, and why, in short. The evidence and history are in [docs/research/](docs/research/): read those only when you need them |
| Installing or upgrading a runtime | [docs/setup.md](docs/setup.md), [docs/image-model-setup.md](docs/image-model-setup.md), and the upgrade guides ([mflux](docs/mflux-upgrade.md), [ComfyUI](docs/comfyui-upgrade.md), [mlx-audio](docs/mlx-audio-upgrade.md), [uv](docs/uv-upgrades.md)) |

## How the owner works

- **Don't ask to start; ask before committing.** Go straight into the next piece of work. At the
  end of each piece, summarise it for review and ask before committing. Never commit without a
  yes.
- **Conventional Commits** (`type(scope): subject`, with a body saying why). **No AI attribution**:
  no `Co-Authored-By` or "generated with" lines, whatever a tool suggests.
- **Push only when asked.** The repo is public on GitHub (`GitHubStig/local-roleplay-studio`).
- **Ask before heavy model runs**: big downloads, or long or memory-hungry GPU work. Quick checks
  (one render, one SHARP scene) are fine.
- **Ask before deleting** anything that isn't yours: Sessions, models, downloads. What you made
  yourself and no longer need, say so and clean it up.
- **Share code** rather than copy it, across screens and across the server. Look for an existing
  library function first (VueUse in the web app) before writing a helper.
- **Workarounds for a weak model are measured, cheap and removable.** Add one (a list of who's away, state carried forward, a retry) only for a failure seen in a bench or in play, keep it cheap, and check it again when the Text Model changes, so a better model isn't held back by it. Prefer wording that's right for any model to scaffolding for one; and drop what a model no longer needs, as instructions that helped a weaker one can get in a stronger one's way.
- **One Text Model for every text job** (the Character, the Art Agent, Suggest, a Chain's prompt
  edits). Don't suggest splitting jobs across models: switching models means reloading them.
- **Say what you checked, and what you didn't.** Real runs over assumptions; when something
  couldn't be tested (on Windows, say), say so.
- **Record findings in the docs**, dated, and deferred ideas in `docs/open-threads.md`, a few lines each, with anything longer in the research file it links to. `docs/models.md` is the current picks only (speed, memory, quality, why each was picked), replaced as they change, never a log: each measurement goes, dated, in `docs/research/` (`text-models.md`, `image-models.md`, `voices.md`, `ollama.md`, or a runtime's upgrade log), and `models.md` takes the new numbers if they change a pick. Findings about the app's own prompts and behaviour (how a prompt shape works with two people, what a Roleplay keeps track of) go in the bench's README or `docs/research/`, with what was decided in an ADR.
- **Keep the showcase list current.** When a piece of work is finished, or something is dropped or replaced (an experiment, a model, a design), add a line to [docs/showcase/README.md](docs/showcase/README.md): what it was, why it went or how it got there, and links to its bench, research or ADR. Otherwise the reasons end up only in git history.
- **Agent instructions go in this file**, not in an agent-specific one, so any agent can use them.

## Two machines

The app is developed on two machines at once, each with its own agent: the owner's Mac (Apple
silicon, 48 GB) and a Windows PC (RTX 4070, 12 GB, 16 GB of RAM), sharing this repo through GitHub.

- **Pull before each piece of work, and push soon after** (once the owner says to push), so the two
  don't drift apart. `docs/open-threads.md` and `docs/research/` are the likeliest to conflict.
- **Say which machine a measurement was made on**, with the date, in the docs. Timings differ by
  several times between them.
- **Some things can only be checked on one**: mflux, voices and LiTo on the Mac; CUDA on the PC.
  Say so when a change can't be run where it's made, so the other machine can check it.
- **Measure memory in a bench with `docs/bench/memory.ts`** (`availableRam`, `watchMemory`), not Deno's `systemMemoryInfo()` directly: its `available` is always 0 on Windows, which has read as "no RAM free" more than once.

## Conventions

- `deno task test` runs the server's tests (Deno) and the web's (Vitest); `deno task check` checks the formatting (`deno fmt --check`), lints both (`deno lint`, which doesn't read `.vue` files) and type-checks them; `deno fmt` formats what it flags. Run tests and the check before asking to commit.
- Keep tests quick, as they run file by file in parallel and a slow file holds up the whole run (since 2026-10-23). Don't sleep past a poll or a debounce: use fake timers (`vi.useFakeTimers()`) in the web app, and on the server an option for the interval (`checkEveryMs`, `retryAfterMs`). Wait for what a test is waiting for, rather than for a helper to time out. A web test never reaches a server: one that sends a request it didn't mock fails, naming it (`web/src/testSetup.ts`), so mock what the component loads. Reach a stand-in server at `127.0.0.1`, not `localhost`: on Windows, `localhost` tries IPv6 first, which adds 300 ms to each connection, and connecting to a port nothing listens on takes 2 s there, not an instant. Keep a test file to one part of the app, sharing its harness (`server/appTesting.ts`), so no one file grows long enough to be the slowest.
- API tests read the server's answers through the typed readers in `server/appTesting.ts` (`getSession`, `eventOf`, `jobsIn`…), never raw `.json()` or a cast, so a field renamed in `shared/` fails `deno task check` there. A new route's answer gets its type in `shared/` and a reader there.
- To look at the running app (a layout, a click, a drag), `deno task shot <path> [options] [steps]` (`web/scripts/shot.ts`, on `playwright-core`) saves screenshots at a window size, after putting values in localStorage and running steps; its header lists them. It's a convenience for checks, not a contract: change it, extend it or replace it whenever there's a better way. It needs Playwright's Chromium headless shell once per machine (`npx playwright-core install chromium-headless-shell`; the Mac has it).
- Running the tasks sometimes prunes `deno.lock`. If it shows up changed and you didn't change
  dependencies, restore it (`git checkout deno.lock`).
- Vue: `<script setup>`, template refs through `useTemplateRef`, Tailwind for styles.
- To ask the player before doing something, `await ask(message, { action, danger })` (`web/src/ask.ts`, shown by `ConfirmDialog`), never the browser's `confirm()`, `alert()` or `prompt()`.
- Markdown docs: one line per paragraph and per list item, wrapped by the editor, not by hand (since 2026-10-16). Older docs are hard-wrapped at 100 characters; rewrap a paragraph as you edit it, rather than reformatting whole files.
- Icons: a plain SVG file per icon in `web/src/assets/icons/` (24×24, drawn in `currentColor`
  with a 2-wide stroke, no width or height, no comments), shown with `<Icon name="…" />`. Never inline an `<svg>`
  in a component. Draw them for the app, rather than copying from an icon set, so none needs a
  licence.
- Every AI service sits behind an interface on the server (`TextModel`, `RoleplayModel`,
  `ImageGenerator`, `VoiceEngine`, `VideoGenerator`, `MusicGenerator`, `SceneMaker`, `FigureMaker`, `StyleEmbedder`, `HeadFinder`), chosen in `server/main.ts`. The
  Text Model is reached only through `Chat` (`server/text/`), so its client can be replaced in one
  place.
  Which extras a machine can run is worked out at startup (`server/features.ts`).

## Where things go

The README's "Where things live" maps the folders. When adding a file:

- **A folder per part of the app, not one flat folder.** On the server: `chain/`, `storyboard/`,
  `roleplay/` for each kind of Session; `text/`, `images/`, `voice/`, `3d/` for each service. Only
  what several parts share stays at the top of `server/` (`app.ts`, `session.ts`, `frames.ts`…).
  Don't put shared code in one part's folder for another to import; move it up instead.
- **A part's routes are in its `routes.ts`** (`chain/routes.ts`, `roleplay/routes.ts`), a function from the app's context (`server/appContext.ts`: the stores, the queue, the Session locks and streams) to its routes, which `server/app.ts` puts together. What every kind of Session shares is in `sessionRoutes.ts`, `pictureRoutes.ts` and `settingsRoutes.ts` at the top. What the Text Model is asked for a part, its schema and its parser, is in that part's `text.ts`.
- **What the player can act on is thrown as a `Refusal`** (`server/refusal.ts`: a Limit crossed, a Frame gone, a job in the way), with its status, from wherever it's found; the router answers it. A part's own refusals extend it (`class UndoError extends Refusal {}`, 409 unless it sets `static override status`). Don't return a `Response` from a helper for the route to check, or catch a refusal in a route to turn it into one.
- **What the server sends and the web app reads is declared once, in `shared/`**: types and plain values only, with no imports from Deno, the server or the web app, so both can import them (the server by path, the web app through `web/src/api.ts`, which passes them on). Don't declare a type again in `web/src/api.ts` that the server has. So is what the server adds to something it stores, or a request adds (`Loaded`, `SentSettings`, `SavedSettings`); the server builds each answer with `satisfies`.
- **A folder per backend** inside a service's folder (`text/ollama/`, `text/openai/`), with what
  they share (the interface, helpers) beside them. A new backend is a new folder.
- **Tests beside the file**, as `name_test.ts`.
- **Prompts are Markdown files** in `server/prompts/<part>/`, never strings in code, each with a
  note at the top saying when it's used and what it's filled with. What more than one part uses
  goes in `server/prompts/shared/`.
- **A reply under a JSON schema says how it ends.** When a Text Model call's schema has several required parts, its request names them in order and says the reply is done only when the last is written ("Answer with one JSON object: "character", "persona", then "setting". You're done only when the setting is written."). Otherwise Gemma 4 26B can stop after an earlier part and write whitespace until its token cap ([text-models.md](docs/research/text-models.md#runaway-whitespace-under-a-schema) has the four times it happened). Don't fix it by putting the last part first, or by making it optional: both made it worse. Check a new call by sending it straight to Ollama over seeds 1–8 or more and looking for replies that end in whitespace; the same seed can fail once and pass the next time.
- **Python programs** go in `python/<tool>/`, one folder each (`make.py` for a run-once script,
  `serve.py` for a service), with code copied from elsewhere in a `vendor/` folder beside them.
  Each has a lock beside it (`uv lock --script python/<tool>/make.py`, committed), which `uv run` follows, so both machines run the same versions. Upgrading is a change of its own: `uv lock --script … --upgrade-package <name>` (or `--upgrade`), checked on both machines where it runs there.
  For uv-only updates, managed Python patch updates, and the per-machine checks, follow [docs/uv-upgrades.md](docs/uv-upgrades.md); don't change the script locks or dependency versions just to update the uv executable.

## Local data

`sessions/`, `scenarios/`, `exports/`, `settings.json` and `queue.json` are gitignored, so a fresh clone starts without them.

**A change to a stored shape comes with a migration** ([ADR 0041](docs/adr/0041-data-files-are-versioned-and-migrated.md)). `session.json`, `settings.json`, `queue.json` and each Scenario file (in its frontmatter) say their `version`, and each is migrated to the latest as it's read (`server/migrations/<file>/`), so the app's types in `shared/` describe only the latest version: a new field is required, and the code carries no fallback for older files (`?? []`, a default for a missing field, a conversion of an old value). A field stays optional only where its absence means something (a thumbnail not picked, a Frame not yet pictured). When `deno task check` fails in a `migrations/<file>/index.ts`, the change needs a version: copy the last `vN.ts` whole to `vN+1.ts`, change its types to match `shared/` and mark each change (`/** v3: added */`), write its step (taking `VN`, making `VN+1`) and its test, and add `.then(vN+1)`. Never edit, reorder or remove a version that has landed. A migrated file is written at the latest version only when the app next saves it. `style.json` (a cache) and `export.json` (an export's order, while it's queued) only say their version: one of another is made again, or its export is refused.
No Sessions are kept as test fixtures: to test against a story, make one through the app, by hand or with `deno task replay server/replay/replays/<name>.yaml` (a Roleplay's Messages, a Chain's Actions or a Storyboard's Brief, with a seed, sent through the running app's API, so it survives changes to `session.json` and gives the same Replies each time), and delete it after.

**What's in a Session stays out of the repo** unless the owner OKs it: no Roleplay text, Image
Prompts, voice clips or pictures from real Sessions copied into `docs/`, tests or commits.
Describe what was measured instead, or use the public tavern scenario (`example-scenarios/tavern.md`).

## 3D trial pages

Scratch pages that show several splat scenes or meshes side by side must stay light: one renderer
for every panel (scissored viewports in one canvas), redraw only while the camera moves, about
500k splats per panel, and the raw `.ply` (no SOG compression: they're local).
