# Video models

Measurements behind clips ([ADR 0025](../adr/0025-clips-by-kind.md)); what's still to do is in [open-threads.md](../open-threads.md), "Clips". Newest first.

## Play out and Into Next, told the story differently (2026-10-29, Mac)

The owner found a Play out's prompt read like an Into Next's and the other way round. The call log showed each was told its own kind; what they were told around it was the cause: a Play out got the next Frame's story as "What happens next, after the picture", and an Into Next got its own Frame's story as "What happens in this part of the story". Tried on the tavern replay (`server/replay/replays/tavern-arrival.yaml`, seed 7, its Image Prompts written by the Art Agent, nothing rendered), Frames 1 to 4, 5 s, no speech, with the Mac's Text Model (Gemma 4 26B heretic, NVFP4, on Ollama, Thinking off), from one copy of the Session so both versions read the same Image Prompts. One prompt per Frame and kind, each version; 2–3 s a prompt.

- **Before, a Play out acted out the next Frame** on 3 of 4: on Frame 2 (shaking off the rain) it took the stool and paid, Frame 3's action; on Frame 4 it served the soup, Frame 5's. That is the way to the next picture, Into Next's job.
- **Before, an Into Next replayed its own Frame first** on 2 of 4 (the polishing on Frame 1, the coin weighed on Frame 3), then moved on, which read like a Play out; on Frame 4 it never reached the next Frame's main action.
- **Changed** (the owner: a Play out "should decide for itself what happens next"): a Play out is no longer told the next Frame at all, only its own story as already happened, and decides what follows (`play-out.md`; `clip-after.md` and `clip-after-none.md` went); an Into Next is told its own story as already happened too (`clip-story-done.md`); and the system message's "no one and nothing it doesn't have" became "the people, the place and the things you're told of", so deciding what happens isn't ruled out.
- **After**: no Play out used the next Frame's action; each carried the moment on with something of its own choosing (a breath, the cloak dripping, a hand going to the pot), quiet ones rather than anything that moves the story. Every Into Next started where the picture is and reached the next Frame's action, with a camera move where the framing changed.
- **Names crept in**: the new Into Next named the people (Kael, Elara) on 3 of 4, the old on 1 of 4, though the system message says the video model doesn't know names: the story it's told as already happened names them. Whether LTX minds wasn't tried (open-threads.md).
- **The Art Agent numbered from 1** at the same time (its story and clothing lists, and "Picture Frame N", as the screens number Frames): the five Frames pictured again showed the same people, each at its own Frame's moment, worded a little differently (a new seed, as the request changed).

## Into Next on a Chain, whose pictures agree (2026-10-29, Windows PC)

The tavern as a Chain (`server/replay/replays/tavern-chain.yaml`, seed 7, Qwen-Image 2.1 Turbo on ComfyUI), whose Frames change the Image Prompt only as far as each Action asks: Frames 1 to 3 are the same room (the bar and its lamp, the window, the stairs), the people in the same places, Frame 2 a little closer. Into Next from Frame 1 (she shuts the door) to Frame 2 (she sets a coin on the bar), its prompt by the Text Model with the camera-move direction, 5 s, no dialogue: no cut (biggest frame-to-frame scene score 0.015, against 0.142–0.173 for the Roleplay's tries); she shuts the door, crosses to the bar and puts the coin down in front of Kael, in the same room throughout, and it ends on Frame 2. Midway the camera swings with her toward the window and Kael is out of frame for a moment. So Into Next is for pictures that agree, as a Chain's do; a Roleplay's, each pictured afresh by the Art Agent, often don't.

## One clip of each kind from those prompts (2026-10-29, Windows PC)

The four prompts below, made into 5 s clips through the app (guides at 1.0, 1152×800 from a 1216×832 picture by Qwen-Image 2.1 Turbo), ~140 s each. Every clip landed on the right picture at the right end (SSIM ~0.71 against its own picture, 0.37–0.50 against the other, both scaled to the picture's size). Looked at as frames 0, 40, 80 and 120:

- **Lead In** works: she shakes out her cloak in the open doorway, steps in, and ends on the picture. The video model added a second figure outside the door that the story doesn't have.
- **Play out** goes wrong: from the picture she turns and walks back out of the door. Its prompt retold the Frame's own action (closing the door behind her), which comes before the picture, so the clip played it from the wrong place. A Play out needs what comes after: the next Frame's story, or what follows from this one, not this one's.
  - *Fixed the same day:* a Play out is now told the Frame's story as what has already happened (the picture shows its end), and given what happens next: the next Frame's story, or on the newest Frame, only the small movement that follows. Its new prompt went forward from the picture (she walks on to the bar, a coin, his answer with the next Frame's line), and so did the clip: she walks on into the room, a coin is on the table, he speaks. The camera moved, though asked to stay still, and the room beyond the frame was made up (with no picture at the end to hold it).
- **Idle Loop** works: small movement, back to the picture, the frames nearly the same.
- **Into Next** cut: she heads for the door, then the clip jumps to Frame 2, whose picture is another room, as on the bench above. Into Next stays for pictures that agree.
  - *Why, and two fixes tried the same day:* Frame 2's picture is another shot (a medium wide of the bar and hearth, against a medium shot of the table and door), the system message kept the camera still, and the prompt put "the bar in the background", where Frame 1 has only the door; so LTX walked her to the door and cut (biggest frame-to-frame scene score, ffmpeg's `scene`: 0.173 at 3.75 s). Two directions for Into Next, each written up by the Text Model and made into a 5 s clip, with the camera allowed to move when the kind of clip calls for it:
    - *A, shared ground*: join the pictures by what they share (the people, where each is, what's in front of them; a table in one and a counter in the other the same surface), small movement in place, the room changing around them. Continuous (0.011): the bar's shelves grow in behind them and the table becomes the counter, a morph more than a move.
    - *B, camera move*: compare the two framings and describe the move between them; what the first picture doesn't show is where the camera turns. Continuous (0.008): the camera pulls back and pans right after her, finds Kael in a booth and her at the bar, and reads as one shot through the room.
    - For comparison, Lead In's biggest jump was 0.025 and Idle Loop's 0.005.
    - The owner found both wanting: the two pictures are meant as one moment at the same counter (she steps up and puts a coin down), so neither a walk through the room nor a morph is right. *C, same shot*: the two pictures are one shot a moment apart, anything different the same thing seen again, no one travels, the camera still. The Text Model wrote just that (one step, the coin, he leans back), but the clip cut at 2.1 s (0.142). A prompt written by hand to the same effect cut too, at 1.9 s (0.135): with the camera held and everyone in place, LTX keeps the first room as long as it can and then cuts to the second. The limit is the two pictures, not the prompt.
    - *D, morph*: no one travels, the camera still, and the place transforms around them from the first picture into the second, said in so many words. At 5 s it cut (0.152 at 3.75 s); at 8 s it was continuous (0.007) and the room did morph, the table into the bar, but the people moved with it: Kael turned away, dropped out of view and came back. A morph needs time, and doesn't hold people still.
    - So Into Next can join two pictures only by a move (B), a morph (A, or D given 8 s), or a cut. A single moment at the same counter needs two pictures that agree, such as the next Frame's picture made as an edit of this one.

## Clip prompts by the Text Model (2026-10-29, Windows PC)

The first version of the prompts (`server/prompts/video/clip*.md` and the kinds' own), with the PC's Text Model (Gemma 4 12B heretic, Q4_K_M, on Ollama, Thinking off), on Frame 1 of a replay of the tavern (`server/replay/replays/tavern-arrival.yaml`): one prompt of each kind, 5 s, Play out with speech, the others without. Read, not yet made into clips.

- All four kept to one paragraph in the present tense, named no one (people are described by clothes and place, as told), kept the camera still or said so, and ended on a "Sound:" line.
- **Idle Loop** kept to small movement (a blink, breathing, a flicker) and brought no one out of place.
- **Into Next** told the next Frame's action (walking to the bar, a coin on the counter), so it used the next picture and story.
- **Play out with speech** quoted the Frame's lines exactly, with who speaks and how. Open: a Play out should go on from the picture, while these lines may already be in the picture's moment; a Frame's own dialogue may suit a Lead In better, and a Play out the next Frame's.
- **Lead In** told the Frame's own action as the lead-up, which is the intent; whether it lands on the picture depends on where in that action the picture was drawn.
- A fault found by the tests, not the model: stripping an introduction ("Here is the prompt:") ran to the line's last colon, so "Sound:" cut the prompt short; it now stops at the first colon (Suggest had the same, fixed too).

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
