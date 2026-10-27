# Working on this repo

Instructions for any coding agent (and person) working on Local Roleplay Studio. What the app is
and how to run it is in the [README](README.md); this is how the owner likes the work done.

## Read first

- [CONTEXT.md](CONTEXT.md): the domain's terms (Session, Frame, Action, Roleplay, Look, Limit…).
  Use them in code, docs and the UI.
- [docs/design.md](docs/design.md): how the app works. [docs/adr/](docs/adr/): decisions and why.
- [docs/open-threads.md](docs/open-threads.md): plans and parked ideas, with their status. Finished
  work moves out of it, into the design doc, an ADR or `docs/research/`.
- [docs/models.md](docs/models.md) and [docs/research/](docs/research/): what's been measured, and
  why each model was picked.

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
- **Record findings in the docs**, dated, and deferred ideas in `docs/open-threads.md`. `docs/models.md` is for the models themselves: speed, memory, quality, comparisons, and why each was picked. Findings about the app's own prompts and behaviour (how a prompt shape works with two people, what a Roleplay keeps track of) go in the bench's README or `docs/research/`, with what was decided in an ADR.
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

- `deno task test` runs the server's tests (Deno) and the web's (Vitest); `deno task check`
  type-checks both; `deno fmt` formats. Run tests and the check before asking to commit.
- Keep tests quick, as they run file by file in parallel and a slow file holds up the whole run (since 2026-10-23). Don't sleep past a poll or a debounce: use fake timers (`vi.useFakeTimers()`) in the web app, and on the server an option for the interval (`checkEveryMs`, `retryAfterMs`). Wait for what a test is waiting for, rather than for a helper to time out. Reach a stand-in server at `127.0.0.1`, not `localhost`: on Windows, `localhost` tries IPv6 first, which adds 300 ms to each connection, and connecting to a port nothing listens on takes 2 s there, not an instant. Keep a test file to one part of the app, sharing its harness (`server/appTesting.ts`), so no one file grows long enough to be the slowest.
- Running the tasks sometimes prunes `deno.lock`. If it shows up changed and you didn't change
  dependencies, restore it (`git checkout deno.lock`).
- Vue: `<script setup>`, template refs through `useTemplateRef`, Tailwind for styles.
- Markdown docs: one line per paragraph and per list item, wrapped by the editor, not by hand (since 2026-10-16). Older docs are hard-wrapped at 100 characters; rewrap a paragraph as you edit it, rather than reformatting whole files.
- Icons: a plain SVG file per icon in `web/src/assets/icons/` (24×24, drawn in `currentColor`
  with a 2-wide stroke, no width or height, no comments), shown with `<Icon name="…" />`. Never inline an `<svg>`
  in a component. Draw them for the app, rather than copying from an icon set, so none needs a
  licence.
- Every AI service sits behind an interface on the server (`TextModel`, `RoleplayModel`,
  `ImageGenerator`, `VoiceEngine`, `SceneMaker`, `FigureMaker`), chosen in `server/main.ts`. The
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
- **Python programs** go in `python/<tool>/`, one folder each (`make.py` for a run-once script,
  `serve.py` for a service), with code copied from elsewhere in a `vendor/` folder beside them.
  Each has a lock beside it (`uv lock --script python/<tool>/make.py`, committed), which `uv run` follows, so both machines run the same versions. Upgrading is a change of its own: `uv lock --script … --upgrade-package <name>` (or `--upgrade`), checked on both machines where it runs there.
  For uv-only updates, managed Python patch updates, and the per-machine checks, follow [docs/uv-upgrades.md](docs/uv-upgrades.md); don't change the script locks or dependency versions just to update the uv executable.

## Local data

`sessions/`, `settings.json` and `models/` are gitignored, so a fresh clone starts without them.
No Sessions are kept as test fixtures: to test against a story, make one through the app (a
replay of the same Messages with a fixed seed gives the same Replies), and delete it after.

**What's in a Session stays out of the repo** unless the owner OKs it: no Roleplay text, Image
Prompts, voice clips or pictures from real Sessions copied into `docs/`, tests or commits.
Describe what was measured instead, or use the public tavern scenario (`scenarios/tavern.md`).

## 3D trial pages

Scratch pages that show several splat scenes or meshes side by side must stay light: one renderer
for every panel (scissored viewports in one canvas), redraw only while the camera moves, about
500k splats per panel, and the raw `.ply` (no SOG compression: they're local).
