# Chains

Part of the [design](../design.md). Terms in **bold** are defined in [CONTEXT.md](../../CONTEXT.md).

## The Frame loop

```
Action ──► Limits check (term list)
   │           └─ crossed ──► Declined: prompt and image unchanged
   ▼
current Image Prompt + Action ──► Text Model (Text backend) ──► { outcome, narration, prompt }
                                                              │
     engine: declined / unclear / Limit crossed / unchanged? save no Frame
                                                              │
                            the paragraph ──► Image Model (Image backend) ──► frame-N-xxxx.png
                                                              │
                                        commit: append the Frame to session.json
```

1. **Limits on the Action.** The Action is checked against the Limits' term list before the Text Model is asked. A crossed Limit declines the Action at once, naming the Limit.
2. **Text step.** The system message is the engine's rules (the nine sentences and what each covers; rewrite only the affected sentences and copy the rest word for word; remove whatever a change contradicts; the Limits; the reply format), then the Scenario's **Truths**, plus what else it states (its place, time, style and People) on the Opening Frame only. The user message is the current Image Prompt and the Action, and nothing else of earlier Frames ([ADR 0001](../adr/0001-scene-is-sole-turn-state.md)) but who has been in the picture and isn't now, each as last described (`peopleAway`), so someone who left comes back described as before. The reply is constrained by a JSON schema (Ollama's `format`, or the OpenAI API's `response_format`), with `outcome` (`done`, `declined` or `unclear`) first, so the model decides before it writes. The Narration is a terse list of what changed: the model's own account, not checked against the prompt, so it can miss or overstate a change; the word diff of the prompt is always right. With **Thinking** on, the model reasons first, and its reasoning is saved with the Frame; models that can't think are asked again without it.
3. **Retry and limits on the call.** An unusable reply (bad JSON, an empty prompt, or one cut off by the length cap) is retried once, then the Frame fails. Every Text Model call has a token cap and a time limit (`server/textModel.ts`): small models writing JSON under a schema occasionally never stop, padding with whitespace, and without the caps one such reply blocked Ollama, and every request behind it, for minutes. A reply cut off because the conversation outgrew the backend's context isn't retried: it fails saying so.
4. **Engine rules** ([ADR 0002](../adr/0002-guardrails-enforced-by-the-engine.md)):
   - The new Image Prompt is checked against the Limits too; crossing one declines the Action.
   - A **Declined Action** (a crossed Limit, or the Text Model declining it) or an **Unclear Action** (the Text Model can't tell what to change, and asks) saves no Frame: the Action stays to reword, with the reason or the question beside it.
   - A done Action whose Image Prompt came back unchanged saves no Frame either: there'd be nothing new to see, and it's often a Narration claiming a change the prompt doesn't have. So every Chain Frame has a picture of its own.
   - The Opening Frame always counts as done; if its prompt crosses a Limit, it fails.
5. **Commit.** The Frame is appended to `session.json`, with no picture yet.
6. **Render job** ([ADR 0030](../adr/0030-a-chain-frame-renders-as-a-job.md)). While this browser's "Render each Frame" is on (sent with the Action, [ADR 0031](../adr/0031-the-server-queues-what-follows-a-reply.md)), the server queues the new Frame's `render` job as it's saved. It waits its turn on its machine (see [Jobs](jobs.md)), then the Backend Settings send renders to renders it with the Session's Image Model, steps and seed, and the rest as Settings are now (see [Pictures](pictures.md)): the mflux CLI, one process per image ([ADR 0004](../adr/0004-images-from-the-mflux-cli.md)), or a workflow queued on ComfyUI, followed over its WebSocket ([ADR 0009](../adr/0009-comfyui-image-backend.md)). The Text Model is unloaded first if it runs on the same machine ([ADR 0013](../adr/0013-unload-the-text-model-on-the-job-machine.md)). Progress streams to the player by step; on ComfyUI the player also watches the picture form, from a preview at each step that the server keeps in memory only (`server/previews.ts`). With a Chain's "Render each Frame" off (and always without pictures), no render is queued and the Frame waits to be rendered.

A Chain's latest Frame can be undone (its Action goes back to the box, its pictures and what was made from them deleted; never the Opening), as a Roleplay's latest exchange can (see [Roleplays](roleplay.md)); a Storyboard has no Undo, as Restart takes it back to its plan. Any Frame's Image Prompt can be replaced by hand (refused if it crosses a Limit), which marks its pictures out of date. A Frame between the Opening and the latest can be deleted, the Frames after it numbered down with their queued jobs; it's refused while a job runs on it or a later Frame, as the job's result would land on the wrong Frame.

### When a Frame fails

A Frame is saved once its Image Prompt is written; its picture comes from its render job (ADR 0030, replacing all or nothing, ADR 0003):

| What happens | Result |
|---|---|
| Text Model fails twice | Frame fails; Image Prompt unchanged; the Action stays in the text box |
| Player presses **Cancel** while it's written | Text request aborted; Image Prompt unchanged |
| The page's connection drops (reload, tab closed) | As Cancel, so the browser asks before leaving while a Frame is written |
| Opening Frame fails or is cancelled | The Session is discarded |
| Its render fails or is cancelled | The Frame stays, without a picture; a failed render job waits in the queue to retry |

Only one Frame runs per Session at a time; the server refuses a second with `409`. Frames, Undo and deleting a Session all take a per-Session lock *before* reading the Session, so two requests can never act on the same Session at once (two tabs sending at the same moment, or an Undo racing a Frame).
