# Pictures in an exported Compare page: format and encoder (2026-10-11)

What the Compare export ([design.md](../design.md), *Export*) writes its pictures as, and with
what. Measured on the Mac (Apple silicon, 48 GB), 2026-10-11.

## WebP or AVIF

Two 1024 × 1024 renders from a Storyboard (PNG 1.56 and 1.60 MB), encoded with jSquash in Deno,
one picture at a time. PSNR is against the PNG: a rough measure that undersells AVIF, whose
smoothing it counts as error more than the eye does.

| Encoding | Size (KB) | Time | PSNR (dB) |
| --- | --- | --- | --- |
| WebP quality 85 | 147 / 178 | 80–90 ms | 39.5 / 38.7 |
| WebP quality 90 (what the export uses) | 189 / 225 | ~80 ms | 41.4 / 40.5 |
| AVIF quality 60, speed 6 | 92 / 124 | ~0.95 s | 38.2 / 37.5 |
| AVIF quality 70, speed 6 | 118 / 155 | ~0.6 s | 39.8 / 39.1 |
| AVIF quality 75, speed 6 | 132 / 172 | ~0.65 s | 40.6 / 40.0 |
| AVIF quality 70, speed 4 | 114 / 150 | 6–8 s | 40.3 / 39.6 |

At about the same PSNR, AVIF is 20–30 % smaller than WebP and 7–8 times slower to encode. Slower
speeds barely shrink it further and cost ten times as long. An upscaled (2048 px) picture has four
times the pixels, so AVIF would take seconds per picture: an 85-picture export would go from about
20 s to minutes.

Browser support, from what was known when written (not checked against a live source): WebP works
in every current browser (Safari since 14, 2020). AVIF in Chrome, Firefox and Safari 16+, and is
Baseline since Edge added it in January 2024, which makes it *widely available* from about mid-2026.
JPEG XL isn't Baseline: Safari only.

Kept WebP: every browser opens it, and an export takes seconds. AVIF is the step to take if size
matters more than export time; thumbnails, at 512 px, would cost a quarter of the time.

## The encoder

jSquash (Squoosh's codecs built for WebAssembly) runs in Deno with nothing to install, the same on
both machines. Measured against `sharp` 0.35.4 (libvips, native, through Deno's npm support; it
loaded in Deno 2 on the Mac with no setup beyond the npm install). Twenty 1024 × 1024 Storyboard
renders, 35.6 MB of PNG, PSNR as above (the thumbnails' against the full PNG, so only comparable
with each other):

| Job | jSquash, one at a time | sharp, one at a time | sharp, all at once |
| --- | --- | --- | --- |
| Viewer pictures, WebP q90 | 2.01 s, 5,029 KB, 40.4 dB | 1.43 s, same file sizes | **0.14 s** |
| Thumbnails 512 px, WebP q85 | 1.37 s, 1,317 KB, 28.8 dB | 0.57 s, 1,274 KB, 29.0 dB | **0.07 s** |
| Viewer pictures, AVIF | q70 speed 6: 13.4 s, 3,146 KB, 38.1 dB | q70 effort 4: 8.2 s, 3,056 KB, 38.6 dB | q70: **2.9 s** |

- **WebP comes out the same**: both wrap libwebp, so at one quality the files are the same size
  and quality. sharp is only faster: 1.4× one at a time, about 15× when it's given every picture at
  once (libvips spreads them over the cores).
- **AVIF at the same quality setting comes out close**: sharp's q70 against jSquash's q70 is
  38.6 against 38.1 dB, and 3 % smaller (both wrap libaom, at different speed settings). sharp's
  q60 is 36.6 dB at 2,082 KB.
- **For AVIF, sharp makes it affordable**: about 0.15 s a picture all at once, against 0.67 s for
  jSquash, so an 85-picture export would take seconds rather than a minute or more.
- **What sharp costs**: a native binary per platform (prebuilt for macOS arm64 and Windows x64,
  fetched by npm): 18 MB on the Mac, 17 MB of it libvips. Not tried on the Windows PC.

Kept jSquash for WebP: an export already takes seconds, and it needs nothing per machine. sharp is
the encoder to move to with AVIF, or when exports get large.
