---
status: accepted
---

# The player's data in the system's folders when installed

Until 2026-11-20 the server kept `settings.json`, `queue.json`, `scenarios/`, `exports/` and the default `sessions/` beside its code (`new URL('../…', import.meta.url)`). An installed app can't write there: `/Applications` and `Program Files` are read-only to it, and a `deno compile` binary's `import.meta.url` is inside its own read-only filesystem. Deno has no call for an app's data folder (unlike Electron's `app.getPath('userData')` or Tauri's `appDataDir()`), so each system's convention is followed by hand.

## Decision

- **One module works the folders out once** (`server/dataDirs.ts`), from `Deno.build.standalone`, `Deno.build.os` and the environment, and `main.ts` passes them to the stores.
- **A clone keeps its data in the repo**, as before, so development and the Mac's Sessions stay where they are. A run counts as installed only when it's a `deno compile` binary (`Deno.build.standalone`), not by looking for `.git` or a writable folder.
- **An install uses the system's folders**, each under `Local Roleplay Studio`: on a Mac, `~/Library/Application Support/`; on Windows, `%APPDATA%` for Settings and `%LOCALAPPDATA%` for Sessions, the queue and Scenarios, so pictures don't roam with the account; on Linux, `$XDG_CONFIG_HOME`, `$XDG_STATE_HOME` (the queue) and `$XDG_DATA_HOME`. Exports go in `~/Documents/Local Roleplay Studio/`, where the player can find them.
- **`DATA_DIR` puts it all in one folder**, from a clone or an install.
- **What ships is only read, from the install**: `web/`, `example-scenarios/` (copied into the Scenarios folder on first run), the prompts and workflows.
- **The Python tools are copied out**: an install copies `python/` beside its Sessions at every start (`server/pythonTools.ts`), as `uv` can't read a script inside the executable, and runs them from there, with their locks and `vendor/` code; a new version's scripts replace the old. (Piping a script to `uv run -` works too, but leaves its lock and `vendor/` behind.) The Session folder can still be moved in Settings (`sessionsFolder`).

## Considered

- **`npm:env-paths`**: much the same conventions, but a dependency for some fifteen lines, with a layout of its own (a `-nodejs` suffix unless switched off, `Config` and `Data` subfolders on Windows, Settings in `~/Library/Preferences` on a Mac) rather than one folder per system the player can find.
