---
status: accepted
---

# Text calls take turns with heavy jobs, and clips go last

A Reply asked for while mflux rendered on the Mac loaded the Text Model beside the image model: the Reply came, but the render went on in swap and finished much slower (seen in play, 2026-11-02). Heavy jobs took turns per machine ([ADR 0020](0020-jobs-take-turns-per-machine.md)) and unloaded the Text Model at their go ([ADR 0013](0013-unload-the-text-model-on-the-job-machine.md)), but the Text Model's own calls (Replies, the Cast, a Storyboard's plan and Frames, Suggest, a clip's prompt, an Image Prompt) took no turn: only a `picture` job went ahead of image jobs, in its own Session. Since 2026-11-02:

- **Every Text Model call takes a turn on the Text Model's machine** (`turnTakingChat` in `server/text/turns.ts`, around every `Chat`; `textTurn` in `server/renderQueue.ts`). It runs at once unless a heavy job runs there; else it waits for that job to end, and goes ahead of every heavy job waiting. Text calls run side by side, and one asked for while others run joins them. The next heavy job starts once the last has ended, and unloads the Text Model as before. So with render 1 of 9 at step 4, a Reply is written after render 1, before render 2.
- **Clips wait behind other heavy jobs** (renders, upscales, edits, voices, 3D), across Sessions in the render queue and in a Session's own queue (`clipsAhead` in `server/jobs.ts`), as they're made from pictures and take minutes. Image work on a Frame doesn't go ahead of that Frame's own clip, so a clip is made from the picture as it was when asked for.

A text call on a Backend elsewhere (Ollama on the PC, a server on the OpenAI API) takes its turn there, so it never waits for a render here.

## Considered Options

- **Text calls as Session jobs**, queued and polled like renders. Replies, a plan and Suggest stream to the page and hold the Session's lock, and setups and Briefs come before there's a Session to queue in; all of that would change, for what a turn around `Chat` does at one place.
- **A text call goes ahead without waiting for the running job.** What happened before: the job runs on in swap.
- **Text waits for no light job** (a spoken line, which doesn't unload the Text Model). Left for now: a line is short (~15 s), and a voice model beside the Text Model still takes memory.

## Consequences

- A Reply asked for during a render waits for it: seconds to a minute behind a picture, minutes behind a clip when the Text Model and ComfyUI share the PC. The page still shows it writing while it waits (a phase for waiting is still to do).
- A burst of text calls (a Storyboard writing its Frames) holds back the renders waiting until it's done, as it keeps the Text Model loaded. If renders sit idle too long in play, cap how many text calls go ahead of one.
- A text call made while a heavy job holds its machine's turn would wait for itself. None does (a voice is described, and a line directed, before its turn; a Chain's checks before its render); keep it so.
- The render queue is made in `server/main.ts` and handed to the app (`AppDeps.renderQueue`), as the Text Model's chats are made there.
- Checked on the Mac (2026-11-02, krea-2-lora on mflux, gemma4 26B heretic): a Message sent at step 1 of 8 waited; Ollama stayed unloaded through the render (96 s), and the Reply came 3.4 s after it, reloading the model. With the render on the PC's ComfyUI, a Reply on the Mac came mid-render, as it should. Not yet checked on the PC, where the Text Model and ComfyUI share one machine.
