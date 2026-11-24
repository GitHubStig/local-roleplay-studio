# The Session manager

The **Session manager** is the page for keeping Sessions (`web/src/views/SessionManagerView.vue`, its server side in `server/manager/`). It lists the Sessions in the Session folder with their sizes, and shows the one selected: its picture (the one Home shows) as its Play button, its title, renamed by clicking it, its size on disk split by part, and how many of each thing it holds. From there it's opened in Finder or Explorer, deleted, exported or imported, and parts of it removed in place. A Home card's Manage opens it at that Session; Delete is only here.

## The parts of a Session

What a Session's folder holds is declared once, per part, in `server/sessionParts.ts`: pictures (renders, upscales, edits and their painted areas), clips, 3D, sound (speech and thoughts, the voice, music cues) and call logs. Each part says which files are its own (by name), how many of what it holds there are, which files its records name, and how what's left out of it goes from a Session's records. Everything here is built on it: the sizes and counts, the export, Remove the rest, and deleting an Image Model's pictures from Compare; the server serves a Session's files by it too. The Session's text (`session.json`) and its caches (`thumbs/`, `style.json`, `export.json`) belong to no part. Sizes and counts are worked out from the disk each time the page asks, never cached.

## The Session folder

The folder Sessions are kept in is chosen at the top of the page (Settings links to it). Changing it never moves a Session: folders are compartments, and the ones used are remembered in `settings.json` (`sessionsFolders`), offered with how many Sessions each holds, or "not connected" when it isn't there, each with Forget. Change… opens the machine's folder dialog only when the browser is on the server's own machine; anywhere else the folder's full path is typed. Moving is refused while work runs.

**On the server's machine** means the request came from one of the machine's own addresses (loopback, or any of its network interfaces', so the app opened at its own LAN address counts), and so did whoever a proxy on the machine forwarded it for (`X-Forwarded-For`, which Vite's dev proxy sends): `fromThisMachine`, `server/http.ts`. It decides only what the machine shows its player, the folder dialog and its file manager, never what anyone may do.

## What to keep

One set of ticks, a row per part, says what to keep, for both of the pane's buttons: **Export ticked** writes what's ticked, and **Remove the rest…** deletes what isn't from the Session itself, after asking, naming what goes and how much; it's refused while work runs. The browser sends what's unticked (`LeftOut`, `shared/keep.ts`), so work finished since the ticks were shown is kept, never removed unasked; the server answers what a choice keeps as the ticks change.

- **Pictures**: a tick per Image Model, upscales, edits with their painted areas, and **Chosen picture only**, which keeps per Frame only the picture it shows now, the Session's Image Model's at its picked version, a picked edit becoming that picture's Original with its history dropped; a Frame with no picture by that model is left not yet pictured.
- **Clips**, by video model and kind; **3D**, by kind (SHARP scenes, TripoSplat and LiTo figures); **sound** (speech and thoughts, the voice, music cues: without the voice, speaking designs a new one); **call logs**.

What's made from a picture goes with it: leaving out an Image Model's pictures leaves out their upscales, edits, clips and 3D, and a tick with nothing left greys out. Left out means never made: a record goes with its file, so nothing in the app meets a record whose file is missing (Home's chosen picture too). The Frames and their text always stay. This is done in `server/keep.ts`: the Session as it's left, part by part, and the files that go, those its records named and no longer do.

## Session export and import

A **Session export** is a zip of one Session, named from its title and id, streamed as it's written: nothing is kept on the server, in memory or on disk, and there's no job ([ADR 0043](../adr/0043-session-export-and-import.md)). The Session's lock is held until the download ends or is dropped, and nothing is queued on it meanwhile, so it can't change mid-zip; it's refused while work runs. It holds `session.json` first (as it would be left, for an export of what's ticked) and the files a part owns; caches stay out. Where the browser has a Save dialog (Chrome, Edge) it's streamed into the file picked, with how far it's got and Cancel; elsewhere it's a plain download. Files already compressed (pictures, clips, MP3, FLAC) are stored, the rest deflated by the runtime's own deflate (`docs/bench/session-zip/`). zip.js writes and reads the zips (`server/manager/zip.ts`, `unzip.ts`).

A **Session import** uploads a zip (with its progress and Cancel), which the server streams to a file beside the Sessions, then checks whole before unpacking anything. It's refused, leaving nothing, if there's no `session.json` at its root, an entry would land outside the Session's folder, an entry is a link, it would unpack to more than the drive has free, or its `session.json` is newer than this app; an older one is migrated as it's read. Only `session.json` and what a part owns are unpacked, each file capped at the size the zip declares, into a temporary folder moved into place once it's all there. The Session always gets a new id, its title kept, marked "(imported)" only when a Session in the folder has it already, and the page selects it.
