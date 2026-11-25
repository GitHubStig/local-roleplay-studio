---
status: accepted
---

# A Session export is a streamed zip, and its import is checked whole

A Session had no way to leave the machine it was made on, or to be kept somewhere else, but by copying its folder by hand. The Session manager (2026-11-24) exports one as a zip, all of it or the parts ticked, and imports one as a new Session.

## Decision

- **One Session per zip**, named from its title and id, holding its `session.json` and the files its parts own (`server/sessionParts.ts`), never its caches. An export of the parts ticked writes `session.json` as the Session would be left, so it imports like any other.
- **Streamed as it downloads**: the zip is written as the browser reads it, so nothing is kept on the server, in memory or on disk, and there's no job to queue or clean up. The Session's lock is held until the download ends or is dropped, and nothing is queued on it meanwhile, so it can't change mid-zip; it's refused while work runs. A broken download starts again (no resume). In the browser, a Save dialog where there is one (`showSaveFilePicker`), streamed into the file picked; elsewhere a plain download.
- **Compressed by what each file is**: pictures, clips, MP3 and FLAC are stored, as deflate left them at 96–100% for 20 to 60 times the time; the text, call logs and WAV are deflated by the runtime's own `CompressionStream`, twice as fast as zip.js's at any level on the Mac ([bench/session-zip/](../bench/session-zip/README.md), the Mac, 2026-11-24). This replaced the plan's "every entry compressed, at a fast level". 3D (`.ply`) was deflated too until the PC's run (2026-11-25): deflate left it at 93%, at 15 MB/s there, so a Session of mostly SHARP scenes zipped far slower than a gigabit network carries it, and it's stored since.
- **An import is checked whole before anything is unpacked**, and refused, leaving nothing, if there's no `session.json` at its root, an entry would land outside the Session's folder (`../`, an absolute path, a drive letter), an entry is a link, it would unpack to more than the drive has free, or its `session.json` is newer than this app ("update first"); an older one is migrated as it's read (ADR 0041). The upload goes to a file beside the Sessions, never into memory. Only `session.json` and what a part owns are unpacked, each file checked by its CRC-32 and capped at the size the zip declares (a `session.json` over 64 MB, read whole, and a file held twice are refused), into a temporary folder moved into place once it's all there.
- **Always a new id**, its folder named for it and `id` rewritten; the title kept, with " (imported)" added only if a Session in the folder has it already.
- **zip.js** (`jsr:@zip-js/zip-js`) writes and reads the zips: the headers, checksums, central directory and Zip64 (a Session can pass 4 GB), and on reading, each entry's declared size and whether it's a link, without reading the zip into memory.

## Considered

- **Zipping into a file first, as a job** (as Compare's export does): it needs as much free space again on the server, and a file to clean up, for a download the browser can stream as well.
- **Writing the zip format by hand**, over the runtime's `CompressionStream` and a CRC32: a few hundred lines of a format with many edge cases, the reader above all, which parses files from elsewhere and is where the import's checks live.
- **Compressing every entry**: measured, it cost far more time than it saved space.
- **Markdown per Frame in the zip**, for reading a Session outside the app: kept in open threads, as no one has asked for it; joining a Session's clips into one film is a video editor's work.
