# Design

How the app works now: its main behaviours, not its screens, which change too often to describe here. Which models to run is in [models.md](models.md). Terms in **bold** are defined in [CONTEXT.md](../CONTEXT.md). Why the bigger choices were made is in [adr/](adr/); what changed when is in git.

## What it is

The original aim was to make it easy to iterate on Image Prompts and test them across image-generation models. I found [Draw Things](https://drawthings.ai) and [ComfyUI](https://www.comfy.org) hard to learn and overwhelming when all I wanted was to iterate on prompts; discovering [mflux](https://github.com/mflux-community/mflux) and Qwen-Image 2.1 led me to a simpler, more playful interface. Chain began as one-step-at-a-time prompt editing; Storyboard grew from wanting to build a short comic more quickly, and Roleplay added prompt-making to an ongoing character conversation.

The app runs on a Mac with Apple silicon, a Windows PC with an NVIDIA card, or both together: every AI service sits behind an interface with a backend per machine (the Text Model on Ollama or a server with the OpenAI chat API, ADR 0008; the Image Model on mflux or ComfyUI, ADR 0009), Settings list the Backends on each machine and which each kind of work prefers (ADR 0022), and each extra (pictures, Upscale, edits, voices, 3D, clips) is on where a Backend can run it (`server/features.ts`).

Every Session starts from a **Brief** (typed, or a saved **Scenario**) and is one of three kinds: a **Chain**, where each Frame is made from the previous one by an **Action**; a **Storyboard**, whose Frames are planned together, reviewed and written out from the plan, then edited and rendered one by one; or a **Roleplay**, a conversation with a Character whose moments can be pictured and rendered as it goes. There is no score and no end; a Session lasts until it's deleted.

The **Image Prompt** is one paragraph covering nine aspects in a fixed order: subject and identity → pose and limbs → expression → camera angle and framing → clothing → environment → lighting → color → art style and medium ([ADR 0005](adr/0005-image-prompt-is-the-state.md)). A Chain's is nine sentences, one per aspect, which the Text Model rewrites. A Storyboard's and a Roleplay's are put together by the engine from a **Look**: the identity of each Subject shown, the seven sentences the Text Model wrote for that Frame (pose to color), then the art style ([ADR 0012](adr/0012-storyboard-look-lists-each-person.md)). Anything in it can be changed; the engine's two **Limits** are the only lines an Action can't cross ([ADR 0002](adr/0002-guardrails-enforced-by-the-engine.md)).

The built-in Scenario is the Kael tavern (`example-scenarios/tavern.md`): an 18th-century tavern on a stormy night, Kael the Character and a well-off traveller the player.

## The parts

Read the part you're working on, not all of them.

| Part | What's in it | Code |
|---|---|---|
| [Chains](design/chain.md) | The Frame loop: an Action, the Limits, the Text Model's reply, the engine's rules, the render; Undo, hand edits, and what happens when a Frame fails | `server/chain/`, `server/textModel.ts`, `server/frames.ts` |
| [Storyboards](design/storyboard.md) | Plan, review, write; what can be done to a written Frame; Chain from here | `server/storyboard/`, `server/textModel.ts` |
| [Roleplays](design/roleplay.md) | The Cast, a Message and its Reply, the Truths' judge, Undo, Restart, Suggest; picturing a Frame (the Art Agent, the Look); voices | `server/roleplay/`, `web/src/roleplay/` |
| [Music](design/music.md) | A Roleplay's Score, the Music Director, the cue writer, Tracks and the player | `server/roleplay/` (`score.ts`, `director.ts`, `hindsight.ts`, `music.ts`), `server/music/` |
| [The Scenario page](design/scenario-page.md) | How a Session starts: Expand, Suggest, who plays whom, saving a Scenario | `server/scenario.ts`, `server/scenario/`, `web/src/scenario/` |
| [Jobs](design/jobs.md) | The queue: turns per machine, what waits for what, text calls among heavy jobs, the queue file and restarts, the Queue page | `server/jobs.ts`, `server/machine.ts`, `server/renderQueue.ts`, `server/text/turns.ts` |
| [Pictures](design/pictures.md) | The seed, a picture per Image Model, Upscale, edits, clips, 3D, the Pictures table and its export, style scores, the thumbnail | `server/pictures.ts`, `server/pictureEdits.ts`, `server/pictureJobs.ts`, `server/images/`, `server/video/`, `server/3d/`, `server/style/`, `server/export/` |
| [Settings, storage and the API](design/settings-and-storage.md) | What Settings hold and when they apply, autosave, where everything is kept, the call log, the API's shape | `server/settings.ts`, `server/session.ts`, `server/calls.ts`, `server/app.ts` |

## Stack

Deno workspace: `server/` (Deno HTTP, no framework) and `web/` (Vue 3, Vite, Tailwind 4, vue-router, VueUse), both run by Deno. Everything remembered per browser goes through one helper, `useStoredString` (`web/src/composables/storage.ts`): saved at once, never synced from other tabs, and held in memory for the visit when the browser blocks storage. Tests: `deno test` for the server, Vitest with happy-dom for the web app; the mflux CLI is exercised through a fake executable, and ComfyUI's API through a fake server (HTTP and WebSocket).
