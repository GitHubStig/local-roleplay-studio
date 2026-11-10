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
| A piece of work too big for one session | `docs/<piece>-plans.md` (such as [docs/music-plans.md](docs/music-plans.md)): a plan in stages, updated as it goes, so a new session picks it up from the file. When the work is done, its pieces move into the design doc, ADRs, CONTEXT.md and `docs/research/`, and the plan is deleted |
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

## Conventions

- `deno task test` runs the server's tests (Deno) and the web's (Vitest); `deno task check` lints both (`deno lint`, which doesn't read `.vue` files) and type-checks them; `deno fmt` formats. Run tests and the check before asking to commit.
- Keep tests quick, as they run file by file in parallel and a slow file holds up the whole run (since 2026-10-23). Don't sleep past a poll or a debounce: use fake timers (`vi.useFakeTimers()`) in the web app, and on the server an option for the interval (`checkEveryMs`, `retryAfterMs`). Wait for what a test is waiting for, rather than for a helper to time out. Reach a stand-in server at `127.0.0.1`, not `localhost`: on Windows, `localhost` tries IPv6 first, which adds 300 ms to each connection, and connecting to a port nothing listens on takes 2 s there, not an instant. Keep a test file to one part of the app, sharing its harness (`server/appTesting.ts`), so no one file grows long enough to be the slowest.
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
  `ImageGenerator`, `VoiceEngine`, `VideoGenerator`, `MusicGenerator`, `SceneMaker`, `FigureMaker`, `StyleEmbedder`), chosen in `server/main.ts`. The
  Text Model is reached only through `Chat` (`server/text/`), so its client can be replaced in one
  place.
  Which extras a machine can run is worked out at startup (`server/features.ts`).

## Where things go

The README's "Where things live" maps the folders. When adding a file:

- **A folder per part of the app, not one flat folder.** On the server: `chain/`, `storyboard/`,
  `roleplay/` for each kind of Session; `text/`, `images/`, `voice/`, `3d/` for each service. Only
  what several parts share stays at the top of `server/` (`app.ts`, `session.ts`, `frames.ts`…).
  Don't put shared code in one part's folder for another to import; move it up instead.
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

**No upgrade code: upgrade the data by hand.** There's no versioning yet and the shapes are still changing, so a new field in `session.json` or `settings.json` is required, not optional for files from before, and the code carries no fallback (`?? []`, a default for a missing field, a conversion of an old value). Instead, upgrade every Session and `settings.json` on the Mac by hand as the change lands (back them up first, and check each still loads), and say in the change's summary what was upgraded. A field stays optional only where its absence means something (a thumbnail not picked, a Frame not yet pictured). The PC keeps no Sessions.
No Sessions are kept as test fixtures: to test against a story, make one through the app, by hand or with `deno task replay server/replay/replays/<name>.yaml` (a Roleplay's Messages, a Chain's Actions or a Storyboard's Brief, with a seed, sent through the running app's API, so it survives changes to `session.json` and gives the same Replies each time), and delete it after.

**What's in a Session stays out of the repo** unless the owner OKs it: no Roleplay text, Image
Prompts, voice clips or pictures from real Sessions copied into `docs/`, tests or commits.
Describe what was measured instead, or use the public tavern scenario (`example-scenarios/tavern.md`).

## 3D trial pages

Scratch pages that show several splat scenes or meshes side by side must stay light: one renderer
for every panel (scissored viewports in one canvas), redraw only while the camera moves, about
500k splats per panel, and the raw `.ply` (no SOG compression: they're local).
