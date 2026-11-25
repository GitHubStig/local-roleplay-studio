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

## The PC (Windows 11, RTX 4070, 16 GB), 2026-11-25

The biggest Session on the PC is a Roleplay of one Frame (2 files, 2.4 MB: `session.json` and a picture), too small to time:

| Setting | Seconds | MB/s | CPU seconds | Zip MB | Of the files | By part (zip / files) |
|---|---|---|---|---|---|---|
| stored | 0.0 | 161 | 0.0 | 2.4 | 100.0% | text 100%, pictures 100% |
| deflate 1 (zip.js) | 0.1 | 19 | 0.1 | 2.3 | 95.8% | text 37%, pictures 96% |
| deflate 6 (zip.js) | 0.1 | 17 | 0.2 | 2.3 | 96.5% | text 33%, pictures 97% |
| deflate (native) | 0.2 | 14 | 0.2 | 2.3 | 96.5% | text 33%, pictures 97% |
| stored, the rest deflated (native) | 0.0 | 219 | 0.0 | 2.4 | 99.8% | text 33%, pictures 100% |

So it was also run on a stand-in Session built in a temporary folder, mixed like the Mac's Roleplay (313 files, 1,027 MB): 200 copies of that picture, 20 clips, 30 music cues and 40 speech MP3s of random bytes (as incompressible as the real ones), two `.ply` of float data and 20 call logs:

| Setting | Seconds | MB/s | CPU seconds | Zip MB | Of the files | By part (zip / files) |
|---|---|---|---|---|---|---|
| stored | 3.4 | 304 | 4.1 | 1026.9 | 100.0% | text 100%, calls 100%, clips 100%, pictures 100%, sound 100%, 3d 100% |
| deflate 1 (zip.js) | 42.7 | 24 | 43.3 | 934.7 | 91.0% | text 37%, calls 1%, clips 100%, pictures 96%, sound 100%, 3d 58% |
| deflate 6 (zip.js) | 49.7 | 21 | 49.8 | 936.1 | 91.2% | text 33%, calls 1%, clips 100%, pictures 97%, sound 100%, 3d 56% |
| deflate (native) | 60.1 | 17 | 60.5 | 943.3 | 91.9% | text 33%, calls 1%, clips 100%, pictures 97%, sound 100%, 3d 62% |
| stored, the rest deflated (native) | 8.6 | 119 | 8.9 | 958.7 | 93.4% | text 33%, calls 1%, clips 100%, pictures 100%, sound 100%, 3d 62% |

Its `.ply` were more regular than a real scene's (62% against the Mac's 93%), so 3D alone was run again with four `.ply` of random floats (400 MB), which deflate to 93% as the Mac's real scenes did:

| Setting | Seconds | MB/s | CPU seconds | Zip MB | Of the files | By part (zip / files) |
|---|---|---|---|---|---|---|
| stored | 1.5 | 260 | 1.7 | 400.0 | 100.0% | text 100%, 3d 100% |
| deflate 1 (zip.js) | 20.2 | 20 | 20.5 | 374.0 | 93.5% | text 37%, 3d 94% |
| deflate 6 (zip.js) | 22.4 | 18 | 22.3 | 373.0 | 93.3% | text 33%, 3d 93% |
| deflate (native) | 26.2 | 15 | 26.1 | 372.7 | 93.2% | text 33%, 3d 93% |
| stored, the rest deflated (native) | 26.0 | 15 | 26.2 | 372.7 | 93.2% | text 33%, 3d 93% |

What it shows:

- **Deflate is 4 to 6 times slower here than on the Mac**, and the runtime's is slower than zip.js's (15–17 MB/s against 18–24), where on the Mac it was twice as fast.
- **The pick only just keeps up with a gigabit network here** (119 MB/s for the Roleplay's mix, against about 110), and falls far behind it as a Session's share of 3D grows: a Session that's mostly SHARP scenes zips at 15 MB/s, as 3D is deflated, to 93% of its size.
- Proposed, not changed: store `.ply` too, as deflate leaves it at 93% for 17 times the time on the PC (and the 3D in the Mac's Roleplay at 93–94%). The pick then deflates only the text and call logs, and zips at about the speed of storing on both machines.

A real download, measured the same day: the export of the 959 MB stand-in streamed at 96 MB/s from the server over loopback (`curl`), and Edge wrote it to a file in OneDrive's Documents at about 30 MB/s in its first second (cancelled then).
