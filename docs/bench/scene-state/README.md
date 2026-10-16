# Scene state in a Roleplay (2026-10-16, Windows PC)

The test behind "Scene state stays in the conversation" in [ADR 0007](../../adr/0007-roleplay-is-a-conversation-with-a-cast.md), first an open thread, "Scene state in a Roleplay". A Roleplay keeps no state of the scene: where things are, the light, the weather, the time and the Character's mood live only in the conversation, sent whole with every Reply (ADR 0007). Does the Character keep track of what was set many exchanges back?

## What was run

A scripted Roleplay of the public tavern scenario through the app's own engine (`writeCast`, `beginRoleplay`, `sendMessage`) in a scratch folder, the player as the traveller, Gemma 4 12B Heretic (GGUF, Thinking off), seeds 1 and 2, about 2.5 minutes each. Twenty-seven Messages (`SCRIPT` in run.ts):

- **Facts, set early:** her cloak hung by the fire; the front door bolted by her, its key in her pocket; the bar lamp blown out; the rain stopped; the clock striking midnight; news that Kael's brother was hanged.
- **Time passing:** "we talk on through the night … until grey dawn", then a dozen unrelated exchanges; later "we doze … when I wake, the sun is high".
- **Probes:** Messages that lean on a fact without restating it ("I go to the front door to leave", "Is it still raining?", "What hour do you make it?", "Is it night already?").

    deno run -A docs/bench/scene-state/run.ts <seed>

`transcripts/`: each run, the probes marked with what they test.

## What it showed

| Set | Probe, ~15 exchanges on | Seed 1 | Seed 2 |
|---|---|---|---|
| Midnight, then talk till dawn | "What hour do you make it?" | right: "close enough to breakfast", grey light | right: "close enough to six" |
| Dozing till the sun is high | "Is it night already?" | right: midday sun | right: "the midday simmer" |
| His brother hanged | "Do you still think of him?" | right: grief | right: grief |
| The lamp out, then dawn | "It looks different now." | dim light, nothing contradicted | the sunrise |
| The rain stopped at midnight | "Is it still raining out there?" | wrong: "more of a drizzle now" | wrong: "just a drizzle now" |
| The door bolted, its key in her pocket | "I go to the front door to leave." | not used: no word of the lock | not used; later Kael takes "a small brass key" from his own apron |
| Her cloak by the fire | "I reach for my cloak." | neither used nor contradicted | the same |

- **Time is kept well**, through a night of talk and a jump to midday, and so is the Character's own mood.
- **The physical facts the player set drift**: the stopped rain came back as drizzle in both runs, and the bolted door was ignored when she went to leave, its key then in Kael's hands (seed 2). Small, and easy to miss in play, but what a tracked scene state would catch.

## With the scene noted (the same day)

    deno run -A docs/bench/scene-state/run.ts <seed> scene

Each Reply also wrote the scene as it stood, first, as short facts ("the place, the time of day, the weather, the light, where everyone is, the things that matter and where they are (doors, keys, clothes), the character's mood"), and the next Message was sent with the scene last noted (`withScene` in run.ts; only the bench's chat, not the app). Same script and seeds, transcripts `<seed>-scene.md`:

| Probe | Without | With the scene noted |
|---|---|---|
| "Is it still raining?" | drizzle, drizzle (wrong) | "not rain, just a damp mist", "rain's ceased" (right) |
| The hour; midday | right, right | right, right |
| His grief | right, right | right, right |
| Her cloak by the fire | not used | "the garment draped near the fire" once |
| The bolted door, its key | ignored; once the key in Kael's apron | ignored both times |
| A run of 27 | 133–137 s | 166–173 s |

The 12B's notes held only the place, the time, the weather and Kael's mood ("Location: Tavern | Time: Dawn | Weather: Overcast | Kael_Status: Vulnerable, Exhausted"), never the door, the key or the cloak, so those were no better kept. Not built: see ADR 0007, "Scene state stays in the conversation".

## Not checked

The Mac's 26B; more seeds; facts the Character sets himself rather than the player; a Roleplay long enough to near the context.
