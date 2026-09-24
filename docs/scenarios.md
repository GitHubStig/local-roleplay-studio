# Writing a Scenario

A **Scenario** is one Markdown file in `scenarios/`. The file name, minus `.md`, is its id
(`photoshoot.md` → `photoshoot`). Files are read fresh on every request, so a new or edited
Scenario shows up on Home, under *Start a new Session*, without a restart. A running Session picks up an
edited Scenario from its next Turn.

[`scenarios/photoshoot.md`](../scenarios/photoshoot.md) is a complete, working example.

## Layout

```markdown
---
title: Studio Photoshoot
description: One or two sentences for its card on Home.
setup:
  location: …
  subject: …
imagePrefix: >-
  professional commercial photograph, adult woman in her thirties, fully clothed in …
sceneSchema:
  type: object
  properties: …
  required: […]
---

## System

Standing instructions for the Text Model on every Turn.

## Opening

How to write the opening Scene.
```

## Frontmatter

| Field | Required | What it is |
|---|---|---|
| `title` | yes | Shown on the Scenario's card on Home |
| `description` | yes | Shown under the title |
| `setup` | yes | A YAML mapping of fixed facts (place, characters, tone, …). Passed to the Text Model on every Turn as a `# Setup` section. Every Scene must stay within it. For the photoshoot, this is the Shoot Brief. |
| `declinedNarration` | no | A line, or a list of lines (one is picked at random), shown **instead of** the Text Model's narration on a Declined Turn. Small models sometimes narrate the refused Action happening; this makes a refusal always read as one. |
| `imagePrefix` | yes | Text the **engine** puts in front of every image prompt, whatever the Text Model writes. Put the facts that must hold in every image here: who the characters are, what they wear, the style. |
| `sceneSchema` | yes | A JSON Schema, written in YAML, with `type: object`. It defines the shape of this Scenario's Scene. |

Use YAML's `>-` for long text: it folds lines into one paragraph.

## Body sections

Only `##` headings count, matched case-insensitively. Other text outside these two sections is
ignored.

- **`## System`:** the rules of the world and the characters, including what a character
  refuses. The engine appends the Setup and the output rules (the `outcome` / `narration` /
  `scene` JSON), so don't restate the JSON format here.
- **`## Opening`:** what the opening Scene should be. Be concrete. The Opening Turn always
  counts as done.

## Designing the Scene schema

The Scene is the only state carried from Turn to Turn, and the image is rendered from it alone
([ADR 0001](adr/0001-scene-is-sole-turn-state.md)). So:

- **Anything that should persist needs a field.** If it isn't in the Scene, the next Turn
  forgets it.
- **Keep fields visual and concrete.** Each field becomes a labelled phrase in the image prompt,
  e.g. `subject: { pose: … }` → `subject pose: …`. Nested objects add their key to the label;
  arrays are joined with commas; empty values are skipped.
- **Mark fields `required`.** Replies missing a required top-level field are rejected and
  retried.
- **Use `description`** on a property to steer what the Text Model writes there, e.g.
  `angle: { type: string, description: e.g. eye level, low angle, overhead. }`.

## Refusals and guardrails

A character can refuse an Action: the Text Model sets `outcome: declined`, and the engine keeps the
previous Scene and image ([ADR 0002](adr/0002-guardrails-enforced-by-the-engine.md)). What a
character refuses is up to the Scenario, in its `## System` section:

- List the refusal reasons explicitly, and say that everything else is accepted. Small models
  otherwise refuse ordinary Actions too.
- Say how a character reacts to an Action that makes no sense (e.g. "asks what you mean").
  The engine asks the Text Model to mark it `outcome: unclear` and keeps the Scene; without
  this guidance, small models tend to invent a change from gibberish.
- Set `declinedNarration`, so refusals read the same whichever model is playing.
- Anything that can change during a Session (a jacket on or off) belongs in the Scene schema,
  ideally as an `enum`, not in `imagePrefix`; the prefix is for what never changes.
- Anything that must never appear in an image belongs in `imagePrefix` as a positive fact
  (e.g. "fully clothed in …"), not only as a rule in the System prompt. Some Image Models
  ignore negative prompts, and the engine doesn't send one.

## Checking a Scenario

Open Home. A file that fails to parse is listed under *Start a new Session* with every problem
found (missing fields, a schema that isn't `type: object`, a missing section). A valid file
appears as a card.
