---
status: accepted
---

# A Chain Frame renders as a job

A Chain's Frame used to commit whole or not at all ([ADR 0003](0003-turns-are-all-or-nothing.md)): it was saved only once both its Image Prompt and its picture existed, rendered inside the Frame's own step, and Cancel abandoned both. Since then the rule had been undone everywhere else: a Chain with "Render each Frame" off saves Frames with no picture and renders them as jobs, a Roleplay saves a Reply and then pictures and renders it as jobs, a Storyboard renders its Frames as jobs, and the Image Prompt is the state whatever pictures there are ([ADR 0005](0005-image-prompt-is-the-state.md), [ADR 0015](0015-a-picture-per-image-model.md)). A Chain's render was the one render that wasn't a job, so it didn't show on the Queue page, couldn't be kept in a saved queue, and left nowhere to record what a ComfyUI run leaves behind. Since 2026-11-02:

- **A Chain Frame is saved once its Image Prompt is written**, with no picture (`runChainFrame`, `server/chain/frames.ts`), and the server queues its render as a job at once, while the Chain renders each Frame and pictures are on (the `/frames` route, `server/app.ts`), so the page that hears of the Frame finds its render in the queue.
- **The render is an ordinary `render` job**: it waits its turn on its machine, its picture forms on the Frame as any job's does, and it keeps the Image Model the Chain had when the Frame was saved.

## Considered Options

- **Keep the render inside the Frame.** One meaning of Cancel, but a Chain's renders stay out of the queue, the Queue page and a saved queue.
- **The page queues the render after the Frame**, as a Roleplay does after a Reply. A closed tab, or the replay tool, would leave the Frame unrendered; the server knows when it saved the Frame.

## Consequences

- Cancel during a Frame abandons its text step only. Its render is a job: cancelled in the Queue tab, and Undo removes the Frame with its jobs.
- The next Action can be sent while the last Frame's render waits or runs.
- A render that fails leaves the Frame, its job failed in the queue to retry, and no longer discards a new Chain: only a failed Opening text step does.
- The Chain's screen no longer blocks leaving while its Frame waits for a render; the Frame's own wait is only for its text call's turn ([ADR 0029](0029-text-calls-take-turns-with-heavy-jobs.md)), which carries on while the screen is away.
- Supersedes ADR 0003.
