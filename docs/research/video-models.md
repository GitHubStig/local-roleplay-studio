# Video models

Measurements behind the video plan ([video-plan.md](../video-plan.md)). Newest first.

## LTX 2.5 on ComfyUI, each kind of clip (2026-10-29, Windows PC)

The RTX 4070 (12 GB), ComfyUI 0.43.1, the files from ComfyUI's LTX 2.5 template: the 22B distilled transformer and the Gemma 4 12B text encoder (both `int8-convrot`), the video and audio VAEs (bf16). One workflow for every kind of clip, built from the template's first–last-frame graph (one pass, 8 steps, CFG 1, no upscale): an `LTXVAddGuide` at frame 0, at frame −1, or both, each at the template's strength 0.7; no prompt enhancer. 1280×704 at 24 fps, seed 7. The two pictures are the tavern scenario's, rendered with Z-Image Turbo at 1280×704 (seed 7, ~12 s each): Kael alone behind the bar, then the traveller arrived.

| Clip | Frames | Time | Peak VRAM |
|---|---|---|---|
| Idle (Kael at both ends), 4 s | 97 | 134 s | 11.5 GB |
| Lead in (arrived at the end), 5 s, with a line of dialogue | 121 | 149 s | 11.7 GB |
| Lead in, 5 s, no dialogue | 121 | 141 s | 11.5 GB |
| Play out (arrived at the start), 5 s | 121 | 135 s | 11.8 GB |
| Into next (Kael → arrived), 5 s | 121 | 138 s | 11.5 GB |
| Into next, 8 s | 193 | 208 s | 11.7 GB |
| Play out, 10 s | 241 | 260 s | 11.8 GB |

- **Time** is about 70 s fixed (loading the models) plus ~19 s per second of clip, so a longer clip costs little more than a short one; each run loaded the models afresh. VRAM sits at the card's limit for every length (ComfyUI offloads what doesn't fit), so length is limited by time and drift, not memory, at least up to 10 s. RAM wasn't measured.
- **A picture at the last frame only works**: Lead in rebuilt the room from its end picture and began with the traveller outside the door's window, Kael's head down. So the four kinds of clip are one workflow, with the guides switched.
- **The ends land near the pictures, not on them**: at strength 0.7 the first and last frames keep the room, the people and the light, but poses shift (in Idle, Kael's eyes went from the viewer to the letter). An Idle loop may jump at the seam; a higher strength at both ends is the next thing to try.
- **The pictures disagree with each other, as the owner predicted**: asked for the traveller "just inside the door", Z-Image put her at the bar, and the room changed between the two pictures (the window, the stairs, the bar). Into next still lands on both ends; how it gets from one room to the other is for watching.
- **10 s Play out held the faces and the room** but the prompt drifted: Kael drank the wine too, which nothing asked for.
- **Judged by the owner** (same day): the clip without dialogue has no voices (the negative prompt adds speech, talking, dialogue, voices). Into next between the two disagreeing pictures doesn't move from one to the other: at 5 s it cuts in the middle, at 8 s it dissolves. So Into next helps only when the pictures agree.
- Not tried: the template's two-pass image-to-video (half size, then the x2 upscaler), the prompt enhancer, lower resolutions, and the Mac.

## How hard to hold the ends (2026-10-29, Windows PC)

The Idle clip above again (Kael at both ends, 4 s, the same seed and prompt) with the guides at 0.85 and 1.0, scored with ffmpeg's SSIM (1 is identical): each end against the picture, the last frame against the first (the loop's seam), and the middle frame (48) against the first, for how much it moves.

| Strength | Time | First ~ picture | Last ~ picture | Seam (last ~ first) | Middle ~ first |
|---|---|---|---|---|---|
| 0.7 (the template's) | 134 s | 0.83 | 0.82 | 0.956 | 0.87 |
| 0.85 | 128 s | 0.88 | 0.86 | 0.962 | 0.86 |
| 1.0 | 118 s | 0.89 | 0.88 | 0.966 | 0.93 |

- Holding harder brings the ends closer to the picture and closes the seam a little, and the clip still moves at 1.0 (Kael looks down at the letter mid-clip, as at 0.7), but less.
- Even at 1.0 the ends aren't the picture (0.89): some of it is the guide's own compression (`LTXVPreprocess`, 18) and the VAE's round trip. So a clip never joins its still, or the next clip, exactly: clips joined one after another won't match exactly at the cuts.
- For comparison, the other clips' ends at 0.7: Play out's first frame 0.79 against its picture, Lead in's last 0.73, Into next's 0.81 and 0.75.
