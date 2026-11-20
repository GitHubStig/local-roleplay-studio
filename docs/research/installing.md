# Installing the app

What it takes to ship the app as something a player installs rather than clones: a `deno compile` binary or a `deno desktop` app. The aim (the owner, 2026-11-20): it works on first run on a machine with nothing installed by the app, given a Text Model's address (Ollama or the OpenAI chat API); pictures and the rest are the player's to install. Where an install keeps the player's data is [ADR 0040](../adr/0040-the-players-data-in-the-systems-folders.md); the server serves the built web app itself (`server/webApp.ts`). The open thread is in [open-threads.md](../open-threads.md).

## Trying both on the Mac (2026-11-20, Deno 2.9.8)

```sh
deno task compile                                    # dist/local-roleplay-studio, for this machine
deno task compile --target aarch64-unknown-linux-gnu # for Linux, as in Apple's containers
# deno desktop: the flags in server/compile.ts, -o <a name without .app>
```

The task (`server/compile.ts`) builds the web app and the export page, then compiles `server/main.ts` with the dev task's permissions, `--include` for what the server reads beside its code (`web/dist`, `web/dist-export`, `python/`, `example-scenarios/`, the prompts and the workflows), and `--exclude-unused-npm --node-modules-dir=none`.

Each was run from outside the repo with `HOME` in a scratch folder, so its data couldn't touch the real one, and checked with the tavern Chain replay (`deno task replay server/replay/replays/tavern-chain.yaml --server …`) on Gemma 4 26B through Ollama.

- **`deno compile`** builds in about 10 s. It ran from any folder: `Deno.build.standalone` was true, so the data went to `~/Library/Application Support/Local Roleplay Studio/`, the example Scenarios were copied in, every page and the API answered, and the Chain's Opening Frame and four Actions ran on the Text Model (31 s), the prompts read from inside the binary. Pictures were placeholders (`IMAGE_GENERATOR=placeholder`).
- **Its size: 381 MB, or 78 MB.** By default it embeds the whole `node_modules` (382 MB, nearly all the web app's build and test tools). `--exclude-unused-npm` alone changed nothing, as the repo has a `node_modules` folder; with `--node-modules-dir=none` too it embeds only what the server imports (the `@jsquash` image packages), and the binary is 78 MB, against Deno's own 82 MB. The 78 MB build ran the same Chain with placeholder pictures; the `@jsquash` packages themselves ran later, in an export (below).
- **`deno desktop`** (experimental in 2.9) builds a 74 MB `.app` in about 5 s, ad-hoc signed, on the system's web view (`laufey_webview`), so nothing was downloaded. `Deno.build.standalone` is true there too, so the data went to Application Support. The runtime picked a free port on 127.0.0.1 and set `DENO_SERVE_ADDRESS`, which the server listened on over `PORT`. The Chain ran through it as through the binary, and the window showed Home with that Session, titled from `index.html`, in the system's dark mode.
  - The window opened only when the app was started as one (`open`, or from Finder); started from a shell, its executable ran the server but showed no window.
  - `-o LocalRoleplayStudio.app` made `LocalRoleplayStudio.app.app`: give the name without `.app`. The bundle's identifier defaulted to `com.deno.desktop.<name>`; `desktop.app.identifier` in `deno.json` sets it.

## Also checked with the binary

- **The Python tools run from a copy.** Each is a script in `python/` run as `uv run <path>`, and a path inside the executable exists only to Deno: with `python/` included, Deno read `python/style/make.py` from it, but `uv run` on the same path failed with "No such file or directory". Piping it to `uv run -` worked (the script's `--help`), but a script from stdin has no lock beside it, so its versions float, and TripoSplat imports its `vendor/` code from beside its script. So an install copies `python/` beside its Sessions at every start (`server/pythonTools.ts`). The 14 files were copied out with their locks and `vendor/`, and a Roleplay's first Reply was spoken (the Character's voice designed, then spoken, 39 s) by the voice service the app started from the copy; stopping the app stopped it too. The copy is a new path to uv, so it builds an environment of its own the first time (1.1 GB in uv's cache here, mostly hard links).
- **Exports.** A Compare export of a PNG and a placeholder SVG wrote the page, built with the app (`web/dist-export`), and the PNG as WebP in full and as a thumbnail (`@jsquash` inside the binary); the page showed both in a browser.
- **Not tried:** a clean Mac; signing beyond ad-hoc; `Deno.autoUpdate()`.

## On Windows (2026-11-20, the PC, Deno 2.9.8)

`deno task compile` built `dist/local-roleplay-studio.exe` in about 20 s, 91 MB. It ran from a folder outside the repo with `USERPROFILE`, `APPDATA` and `LOCALAPPDATA` pointed at a scratch folder, so its data couldn't touch the real one, and with `IMAGE_GENERATOR=placeholder`.

- **The data went where ADR 0040 says:** `settings.json` in `%APPDATA%\Local Roleplay Studio\` (once saved), and the queue, the Sessions, the Scenarios (the examples copied in) and the copied Python tools in `%LOCALAPPDATA%\Local Roleplay Studio\`.
- **The tavern Chain ran** on Gemma 4 12B Heretic through Ollama (the Opening Frame and four Actions, 48 s), its prompts read from inside the executable; Home and the Chain's page showed it in a headless browser.
- **An export** of a PNG wrote the page, built with the app, and the PNG as WebP in full and as a thumbnail (`@jsquash` inside the executable) to `Documents\Local Roleplay Studio\`; the page showed it in a browser.
- **With the PC's own Settings** (ComfyUI Desktop 0.46.1 on 127.0.0.1:8188, so every ComfyUI feature on): a Frame of the same Chain rendered on Qwen-Image 2.1 through ComfyUI in 26 s, its workflow read from inside the executable.
- **The Python tools ran from the copy** in `%LOCALAPPDATA%`, each on that picture: SHARP (a 66 MB scene, 245 s), TripoSplat (a 36 MB figure, 159 s) and the style embedding (`style.json`, 135 s). Each first run builds the copy's own environment with uv, which is most of those times.
- Stopping the executable left nothing of its own running.
- **Not tried on Windows:** a clean PC (this one has uv, Ollama and ComfyUI, and Windows 11 Home has no Windows Sandbox).

## A clean Linux machine, in Apple's `container` (2026-11-20, on the Mac)

Apple's [`container`](https://github.com/apple/container) (1.7.1; a signed `.pkg` from its releases, then `container system start --enable-kernel-install` once) runs Linux images in lightweight VMs on Apple silicon, so a fresh `debian:bookworm-slim` is a machine with nothing on it: no `uv`, mflux, ComfyUI or Python. The Linux build (`--target aarch64-unknown-linux-gnu`, 117 MB) ran in it, shared in from `dist/`, with its port published to the Mac and Ollama reached on the container network's gateway:

```sh
container run -d --rm --name lrs-clean -v "$PWD/dist:/app" -p 127.0.0.1:8799:8787 \
  -e OLLAMA_HOST=http://192.168.64.1:11434 debian:bookworm-slim \
  /app/local-roleplay-studio-aarch64-unknown-linux-gnu
container logs lrs-clean; container stop lrs-clean   # --rm deletes it on stop
```

- Every optional feature said it was off, with its reason (mflux and mlx-audio only on Apple silicon, `uv` not installed, a ComfyUI to add); Settings listed only this machine and Ollama, and Settings → Images showed Pictures off with that reason.
- The data went to the XDG folders: `~/.config/Local Roleplay Studio/` (Settings, once saved), `~/.local/state/…/queue.json`, and `~/.local/share/…/` for the Scenarios (the examples copied in) and the copied Python tools.
- Settings listed Ollama's models from inside the container, and the tavern Chain ran on Gemma 4 26B (the Opening Frame and four Actions, 28 s), with the pages and API answering on the Mac's 127.0.0.1:8799.
