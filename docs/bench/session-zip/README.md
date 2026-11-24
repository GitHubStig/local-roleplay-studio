# Session zip: how to compress a Session export

Which compression a Session export uses (`EXPORT_ZIP`, `server/manager/zip.ts`). zip.js writes the zip itself (each file's header and checksum, the directory at its end, Zip64); what's measured is how each entry is compressed inside it, by zip.js's own deflate or by the runtime's `CompressionStream`, which only deflates bytes and knows nothing of zips: how fast it zips, how big the zip is and how much CPU it takes, for stored, zip.js's deflate at levels 1 and 6, the runtime's own deflate (`CompressionStream`), and what's already compressed stored with the rest deflated by the runtime. The zip goes into a sink that only counts bytes, so the numbers are the zipping alone, not a disk or a network; each setting runs twice and the second is kept, so the files are in the OS's cache alike.

```
deno run --allow-read --allow-sys docs/bench/session-zip/bench.ts <Session folder>
```

It only reads the Session. "By part" is each part's size in the zip against its files'.

## The Mac (M-series, 48 GB), 2026-11-24

A Roleplay with every part (80 files, 343 MB: pictures, clips, two SHARP scenes, speech and music):

| Setting | Seconds | MB/s | CPU seconds | Zip MB | Of the files | By part (zip / files) |
|---|---|---|---|---|---|---|
| stored | 0.3 | 1153 | 0.4 | 342.8 | 100.0% | text 100%, clips 100%, pictures 100%, sound 100%, 3d 100% |
| deflate 1 (zip.js) | 5.9 | 58 | 6.0 | 331.3 | 96.7% | text 22%, clips 100%, pictures 96%, sound 97%, 3d 94% |
| deflate 6 (zip.js) | 6.6 | 52 | 6.7 | 331.5 | 96.7% | text 17%, clips 100%, pictures 97%, sound 97%, 3d 93% |
| deflate (native) | 3.6 | 96 | 3.7 | 331.5 | 96.7% | text 17%, clips 100%, pictures 97%, sound 97%, 3d 93% |
| stored, the rest deflated (native) | 1.6 | 212 | 1.7 | 333.9 | 97.4% | text 17%, clips 100%, pictures 100%, sound 99%, 3d 93% |

A Chain of pictures alone (1,029 MB):

| Setting | Seconds | MB/s | CPU seconds | Zip MB | Of the files | By part (zip / files) |
|---|---|---|---|---|---|---|
| stored | 0.9 | 1084 | 1.2 | 1028.6 | 100.0% | text 100%, pictures 100% |
| deflate 1 (zip.js) | 15.7 | 65 | 16.2 | 1023.9 | 99.6% | text 10%, pictures 100% |
| deflate 6 (zip.js) | 16.8 | 61 | 17.2 | 1024.7 | 99.6% | text 8%, pictures 100% |
| deflate (native) | 10.3 | 100 | 10.7 | 1024.9 | 99.6% | text 8%, pictures 100% |
| stored, the rest deflated (native) | 1.0 | 1005 | 1.3 | 1028.5 | 100.0% | text 8%, pictures 100% |

## What was picked

**What's already compressed stored, the rest deflated by the runtime** (`deflateUncompressed`, native). A Session is mostly PNGs, MP4s, MP3s and FLACs, which deflate leaves at 96–100%: deflating every entry saved 3% of the Roleplay and 0.4% of the Chain, for 20 to 60 times the time. What does shrink is the text (`session.json` and call logs, to 8–22%) and a little of the 3D (93%), and those are deflated. zip.js's level 1 was no faster than its level 6 (its JavaScript deflate is the cost, not the level), and the runtime's deflate did the same work twice as fast, so the level doesn't matter and the runtime's is used. At 200 MB/s and up it zips faster than a gigabit network carries it, so the download sets the pace.

This departs from the plan's "every entry compressed, at a fast level": the numbers show compressing every entry costs time for nothing.

## The PC

Not run yet: `deno run --allow-read --allow-sys docs/bench/session-zip/bench.ts <a big Session's folder>` on the PC, its table added here with the date. The pick stands unless storing and deflating natively turn out slower than its network there.
