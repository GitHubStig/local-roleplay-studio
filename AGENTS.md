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
- **One Text Model for every text job** (the Character, the Art Agent, Suggest, a Chain's prompt
  edits). Don't suggest splitting jobs across models: switching models means reloading them.
- **Say what you checked, and what you didn't.** Real runs over assumptions; when something
  couldn't be tested (on Windows, say), say so.
- **Record findings in the docs**, dated: measurements in `docs/models.md` or `docs/research/`,
  deferred ideas in `docs/open-threads.md`.
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
- Running the tasks sometimes prunes `deno.lock`. If it shows up changed and you didn't change
  dependencies, restore it (`git checkout deno.lock`).
- Vue: `<script setup>`, template refs through `useTemplateRef`, Tailwind for styles.
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

## Local data

`sessions/`, `settings.json` and `models/` are gitignored, so a fresh clone starts without them.
On the owner's Mac, three Roleplays in `sessions/` are kept as test fixtures: ask before deleting
or rewriting them.

- `20260927-100327-07ac`: the Kael tavern Roleplay (30 Frames), the source of the image, Art
  Agent, Suggest and voice tests.
- `20261001-024055-e211`: the same story with the roles swapped; Elara is the Character.
- `20261001-024443-b215`: a third Roleplay in a 1700s harbour town; Elara the Character.

**What's in a Session stays out of the repo** unless the owner OKs it: no Roleplay text, Image
Prompts, voice clips or pictures from real Sessions copied into `docs/`, tests or commits.
Describe what was measured instead, or use the public tavern scenario (`scenarios/tavern.md`).

## 3D trial pages

Scratch pages that show several splat scenes or meshes side by side must stay light: one renderer
for every panel (scissored viewports in one canvas), redraw only while the camera moves, about
500k splats per panel, and the raw `.ply` (no SOG compression: they're local).
