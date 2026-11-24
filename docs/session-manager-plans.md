# The Session manager: plan

A page for keeping Sessions: what each holds and how big it is, renaming, deleting, exporting a Session as a zip (all of it or the parts ticked), importing one, removing parts in place, and switching between Session folders. Worked out with the owner on 2026-11-24 (the Mac), from the open thread "A folder manager and a Session export". Mockups: the owner's private canvas "Session manager layouts" (the row "Final: A with C's ticks, streamed export").

This file is the plan while it's built: each stage is ticked off as it lands. When all are done, what's here moves into `docs/design/` (a page for the Session manager), an ADR (the Session export and import), CONTEXT.md and the showcase list, and this file is deleted.

## Terms

- **Session manager**: the page. Added to CONTEXT.md.
- **Session export**: a zip of one Session, all of it or the parts ticked, which can always be imported. Kept apart from the Compare export (`server/export/`), which writes a page.
- **Session import**: a Session export unpacked into the Session folder as a new Session.
- **A Session's title**: stored, its own, renameable (today it's worked out by `titleOf` each time).

## What was decided

### The page

- Layout: a list of the Sessions on the left, the selected Session's pane on the right (layout A). On a phone, the list is one screen and a Session another.
- Reached from its own rail entry (the `folder` icon, under the Queue) and a fourth tab in the phone's bar; from Home, a card's hover action becomes **Manage** (always shown on touch screens), opening the page with that Session selected. Delete leaves Home: it's only here. It has its own address, so a reload or a bookmark stays on it.
- The list: thumbnail, title, kind, Frames, last changed, size; sorted by size, last changed, kind or title.
- The pane leads with the Session's picture (the one Home shows), which is its **Play** button. Beside the title, two icon buttons, each labelled for hover and screen readers: a folder for **Open in Finder** / **Open in Explorer** / **Open folder** (named for the OS; shown only when the browser is on the server's own machine), and a red bin for **Delete Session…** (`ask`, danger; refused while work is running). The bin is a new icon, `trash.svg`, drawn for the app.
- The pane shows the size on disk as a bar split by part (pictures, clips, 3D, sound, call logs) and counts: Frames, pictures (and how many Image Models), edits, video clips, speech and thoughts, 3D, music cues, call logs. All worked out by the server each time the page opens, not cached.
- The title, at the top of the pane, renames on a click.
- "The browser is on the server's own machine" (settled in stage 2): the request came from one of the machine's own addresses, loopback or any of its network interfaces' (so the app opened at the Mac's LAN address counts), and so did whoever a proxy on this machine forwarded it for (`X-Forwarded-For`, which Vite's dev proxy now sends). A header alone from elsewhere can't make it so. It only decides what the machine shows its player (its folder dialog, its file manager), never what anyone may do (`fromThisMachine`, `server/http.ts`).

### The Session folder

- Its control moves from Settings to the top of the page; the Settings tab becomes a link to it.
- Changing the folder never moves Sessions: folders are compartments.
- The folders used are remembered in `settings.json` (a migration), shown in a dropdown with how many Sessions each holds, or "not connected"; each has **Forget**, as the list could show a private folder's path to anyone using the app.
- **Change…** opens the OS's folder dialog only when the browser is on the server's machine; anywhere else (a phone, the other PC) it's a field for a full path, which `checkFolder` already checks.

### A Session's title

- `session.json` gets a required `title`: set when the Session starts from what `titleOf` gives now (its Scenario's title, or the start of its Brief), and filled in the same way by the migration. Renaming changes only it, never the Session's copy of the Scenario.
- Not empty once trimmed, at most about 100 characters; two Sessions may share one.
- Renamed by clicking it, in the Session bar (`SessionBar.vue`) and in the Session manager's pane: it becomes a field, Enter or clicking away saves, Esc cancels. One route, `PATCH /api/sessions/:id` with `{ title }`, allowed while work is running.
- The browser keeps only the current Session's id and kind (`useCurrentSession`); `current-session-title` goes. The rail and the done notice read the title from one shared copy of the Session list, which Home and the Session manager use too, fetched when the app starts and refreshed on rename, delete and import.

### What to keep: the ticks

- One set of ticks, **What to keep**, folded into a row per part (as in layout C): each row says what's kept and its size, and opens to its ticks. All ticked to start with.
  - **Pictures**, a tick per Image Model, plus Upscales and Edits and masks, and **Chosen picture only**.
  - **Clips**, a line per video model (a tick for the model, and one per kind beside it: lead-in, play-out, idle loop, into next).
  - **3D**, per kind: SHARP scenes, TripoSplat figures, LiTo figures.
  - **Sound**: speech and thoughts, voices, music cues. Leaving out voices warns that the Session can't speak until new ones are made.
  - **Call logs**.
- A tick means keep, for both buttons: **Export ticked** writes what's ticked; **Remove the rest…** deletes what isn't from the Session itself, after `ask` names what goes and how much ("can't be undone"), refused while work is running. The Frames and their text always stay.
- What's made from a picture goes with it: leaving out an Image Model's pictures leaves out their upscales, edits, clips and 3D (their ticks grey out).
- **Chosen picture only** keeps, per Frame, only the picture it shows now: the Session's current Image Model, at its picked version. A picked edit becomes that Picture's Original, its history dropped. A Frame with no picture by the current model is left without one ("not yet pictured"). The per-model ticks grey out while it's on.
- Left out means never made: the record goes with its file, so nothing in the app meets a record whose file is missing. A picture can be made again from the Frame's Image Prompt and the Session's seed; a clip's own prompt and seed go with it.
- Caches are never exported (`thumbs/`, `style.json`, `export.json`): the app makes them again.
- On the server, each part (pictures, clips, voice, 3D, music, call logs) declares in one place which files are its own and how to clear them from a Session; the counts, the size bar, the export, Remove and Delete all use it. The existing "delete a model's pictures" route (`DELETE /api/sessions/:id/pictures`) is rebuilt on it.

### Session export

- One Session per zip, named from its title and id (`the-rain-soaked-tavern-20261011-083126-79c6.zip`).
- Streamed: the server zips the Session's files as the browser downloads them, so nothing is kept on the server, in memory or on disk, and there's no job. The Session's lock is held while it streams, so nothing changes mid-zip; it's refused while work is running. A broken download starts again (no resume).
- In the browser: a Save dialog where there is one (`showSaveFilePicker`, Chrome and Edge), streamed into the file picked; elsewhere a plain download. The pane shows how far it's got against the size it worked out (about, as compression changes it), with Cancel.
- Compressed by what each file is, picked by a bench (stage 3, [docs/bench/session-zip/](bench/session-zip/README.md)): pictures, clips, MP3 and FLAC are stored, as deflate left them at 96–100% for 20 to 60 times the time; the text, call logs, 3D and WAV are deflated, by the runtime's own deflate, twice as fast as zip.js's at any level. (This replaced "every entry compressed, at a fast level".)
- Not now: joining clips into one film (the app makes the clips; editing them together is for a video editor), and Markdown per Frame for reading outside the app (kept in open-threads).

### Session import

- **Import a zip…** at the top of the page. The browser uploads it (XHR, for its progress bar, with Cancel); the server streams it to a temporary file, never into memory, then checks and unpacks it in the request (no job).
- Refused whole if: there's no `session.json` at its root; any entry would land outside the Session's folder (`../`, an absolute path); any entry is a symlink; it would unpack to more than the free space; its `session.json` is a version newer than this app knows ("made by a newer version of the app: update first"). An older version is migrated as it's read, as usual.
- Unpacked into a temporary folder and moved into place only once it's all there, so a failed import leaves nothing.
- Always a new id: the folder is named for it and `id` in `session.json` rewritten. The title is kept, with " (imported)" added only if a Session in the folder already has it.
- Afterwards the page selects the new Session.

## Stages

Each is a commit (or a few) of its own, asked for as usual; check off as they land.

- [x] **1. A Session's title.** Done 2026-11-24 (the Mac): `session.json` version 3; the field opens in the Session bar of a real Chain (`deno task shot`), not yet seen at phone width. `title` in `session.json` (migration), set at start, used everywhere `titleOf` is now; `PATCH /api/sessions/:id`; renaming in the Session bar; the shared Session list for the rail and the done notice, `current-session-title` removed. Check: the migration's test, the route's tests (empty, too long, while work runs), renaming in the bar by `deno task shot`.
- [x] **2. The Session manager page.** Done 2026-11-24 (the Mac): at `/sessions` (`?id=` the Session selected); `settings.json` version 2 (`sessionsFolders`); the per-part declaration is `server/sessionParts.ts`, which also decides which files a Session serves. Sizes and counts matched the disk for a replayed Chain and, read only, for one of the owner's Roleplays; looked at by `deno task shot` at 1440 and 390 wide. The route and page, the rail entry and phone tab; the list with sizes and counts (from the per-part declaration, its first use); the pane with Play, Open in Finder/Explorer, Delete, rename; the Session folder control moved here, with remembered folders (migration), Forget, and a typed path away from the server's machine; Home's cards get Manage and lose Delete. Check: counts and sizes against a Session made by `deno task replay`, the pages at desktop and phone width by `deno task shot`, the folder dialog on the Mac and a typed path from another device.
- [x] **3. Session export and import, whole.** Done 2026-11-24 (the Mac): `server/manager/` (`zip.ts`, `unzip.ts`, `routes.ts`, with the manager's routes moved there), zip.js (`jsr:@zip-js/zip-js`) for writing and reading zips. The bench ran on the Mac; the PC's run is still to come. A round trip of one of the owner's Roleplays through the running app (343 MB, every part): 1.9 s to export, the zip checked by Info-ZIP's `unzip -t`, the 79 media files byte for byte the same in the copy, which the app read as the original but for its id and title, and played; a dropped download freed the Session, a dropped upload left nothing. Each refusal by a hand-made zip in `manager/routes_test.ts`. Not tried: the Save dialog in a real Chrome (the headless browser has none), and anything on Windows (the free space by PowerShell).  Streaming a zip of a whole Session; the import with every check above. A bench zipping a big Session stored, at deflate 1 and at deflate 6 (time, size, CPU), on the Mac and then the PC, its numbers in the bench's README; the level picked from it. Check: a round trip (export, import, play the copy), each refusal by a hand-made zip (`../`, absolute path, symlink, no `session.json`, a newer version), a cancelled download and a cancelled upload leaving nothing behind.
- [ ] **4. What to keep.** The ticks; partial export and Remove the rest, both from the per-part declaration; "delete a model's pictures" rebuilt on it; Chosen picture only. Check: for each tick, a Session with it left out loads and plays without errors (exported and imported, and removed in place), Chosen picture only with a picked edit, Remove's sizes against the disk.

When all four are done: `docs/design/session-manager.md`, an ADR for the Session export and import, CONTEXT.md's terms, the showcase list, `docs/open-threads.md` (the thread's line removed, Markdown per Frame kept), and this file deleted.
