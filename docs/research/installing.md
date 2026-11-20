# Installing the app

What it takes to ship the app as something a player installs rather than clones: a `deno compile` binary or a `deno desktop` app. The aim (the owner, 2026-11-20): it works on first run on a machine with nothing installed by the app, given a Text Model's address (Ollama or the OpenAI chat API); pictures and the rest are the player's to install. Where an install keeps the player's data is [ADR 0040](../adr/0040-the-players-data-in-the-systems-folders.md); the server serves the built web app itself (`server/webApp.ts`). The open thread is in [open-threads.md](../open-threads.md).

## Trying both on the Mac (2026-11-20, Deno 2.9.8)

Both built from `server/` with the dev task's permissions, and with what the server reads beside its code included:

```sh
deno task build   # web/dist
cd server
deno compile --allow-net --allow-read --allow-write --allow-run --allow-env \
  --allow-sys=hostname,networkInterfaces \
  --include ../web/dist --include ../python --include prompts --include ../example-scenarios \
  --include images/comfyui/workflows --include voice/comfyui/workflows \
  --include video/comfyui/workflows --include music/comfyui/workflows \
  --exclude-unused-npm --node-modules-dir=none -o lrs main.ts
# deno desktop: the same flags, -o <a name without .app>
```

Each was run from outside the repo with `HOME` in a scratch folder, so its data couldn't touch the real one, and checked with the tavern Chain replay (`deno task replay server/replay/replays/tavern-chain.yaml --server …`) on Gemma 4 26B through Ollama.

- **`deno compile`** builds in about 10 s. It ran from any folder: `Deno.build.standalone` was true, so the data went to `~/Library/Application Support/Local Roleplay Studio/`, the example Scenarios were copied in, every page and the API answered, and the Chain's Opening Frame and four Actions ran on the Text Model (31 s), the prompts read from inside the binary. Pictures were placeholders (`IMAGE_GENERATOR=placeholder`).
- **Its size: 381 MB, or 78 MB.** By default it embeds the whole `node_modules` (382 MB, nearly all the web app's build and test tools). `--exclude-unused-npm` alone changed nothing, as the repo has a `node_modules` folder; with `--node-modules-dir=none` too it embeds only what the server imports (the `@jsquash` image packages), and the binary is 78 MB, against Deno's own 82 MB. The 78 MB build ran the same Chain with placeholder pictures; the `@jsquash` packages themselves (edits, exports) weren't exercised.
- **`deno desktop`** (experimental in 2.9) builds a 74 MB `.app` in about 5 s, ad-hoc signed, on the system's web view (`laufey_webview`), so nothing was downloaded. `Deno.build.standalone` is true there too, so the data went to Application Support. The runtime picked a free port on 127.0.0.1 and set `DENO_SERVE_ADDRESS`, which the server listened on over `PORT`. The Chain ran through it as through the binary, and the window showed Home with that Session, titled from `index.html`, in the system's dark mode.
  - The window opened only when the app was started as one (`open`, or from Finder); started from a shell, its executable ran the server but showed no window.
  - `-o LocalRoleplayStudio.app` made `LocalRoleplayStudio.app.app`: give the name without `.app`. The bundle's identifier defaulted to `com.deno.desktop.<name>`; `desktop.app.identifier` in `deno.json` sets it.

## What doesn't work yet in either

- **Exports.** `server/export/page.ts` builds the export page when asked, running `deno task build:export` in `web/` with `Deno.execPath()`. In an install that's the app itself, and `web/` isn't there: the job fails with "No such cwd …/web". The page wants building with the release and reading from the bundle.
- **The Python tools were said to be available, but couldn't run** (fixed the same day). The startup checks (`server/features.ts`) found `uv` and mlx-audio on this Mac, so Voices, SHARP, TripoSplat, LiTo and Style scores said "available", but each is a script in `python/` run as `uv run <path>`, and a path inside the executable exists only to Deno: with `python/` included, Deno read `python/style/make.py` from it, and `uv run` on the same path failed with "No such file or directory". Piping it to `uv run -` worked (the script's `--help`), but a script from stdin has no lock beside it, so its versions float, and TripoSplat imports its `vendor/` code from beside its script. So an install copies `python/` beside its Sessions at every start (`server/pythonTools.ts`) and runs them from there. Checked with the binary (`--include ../python`, still 79 MB): the 14 files were copied out with their locks and `vendor/`, and a Roleplay's first Reply was spoken (the Character's voice designed, then spoken, 39 s) by the voice service the app started as `uv run …/python/voice/serve.py` from the copy; stopping the app stopped it too. The copied script is a new path to uv, so it builds an environment of its own the first time (1.1 GB in uv's cache here, mostly hard links).
- **A ComfyUI listed whether or not there is one** (fixed the same day). Where mflux or the voice service can't run, Settings start with a ComfyUI at `127.0.0.1:8188` (`machineDefaults`), as the PC has always done; while the Python tools were off, a fresh install on the Mac got one too, so Voices and Clips said available through a ComfyUI that wasn't there. An installed app now starts with none, and says to add one for what this machine can't do.
- **Not tried:** Windows and Linux builds; a clean machine (no `uv`, mflux or ComfyUI); signing beyond ad-hoc; `Deno.autoUpdate()`.
