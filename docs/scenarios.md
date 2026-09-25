# Writing a Scenario

A **Scenario** is a saved Brief: one Markdown file in `scenarios/` that a Session can start from
instead of a typed Brief. The
file name, minus `.md`, is its id (`photoshoot.md` → `photoshoot`). Files are read fresh on
every request, so a new or edited Scenario shows up on Home, under *Start a new Session*,
without a restart.

A Scenario only shapes the **opening** Image Prompt. After that, any of it can be changed by
an Action; the only lines no Action can cross are the engine's four Limits
([ADR 0002](adr/0002-guardrails-enforced-by-the-engine.md)).

[`scenarios/photoshoot.md`](../scenarios/photoshoot.md) is a complete, working example.

## Layout

```markdown
---
title: Studio Photoshoot
description: One or two sentences for its card on Home.
setup:
  subject: Maya Okafor, a fictional 31-year-old fitness model…
  location: A bright daylight photo studio…
---

## System

Optional notes for the Text Model on every Frame.

## Opening

What the opening image should be.
```

## Frontmatter

| Field | Required | What it is |
|---|---|---|
| `title` | yes | Shown on the Scenario's card on Home |
| `description` | yes | Shown under the title |
| `setup` | no | A YAML mapping of facts (who, where, what they wear, the tone). Given to the Text Model **only on the Opening Frame**, to write the opening Image Prompt from. |

Use YAML's `>-` for long text: it folds lines into one paragraph.

## Body sections

Only `##` headings count, matched case-insensitively.

- **`## Opening`** (required): what the opening image should be. Be concrete: the Text Model
  frames it, plus the Setup, into the nine sentences.
- **`## System`** (optional): notes the Text Model gets on every Frame, after the engine's own
  rules. Use it for things like "keep Maya recognisably the same person". Don't restate the
  prompt format, the Limits or the reply format; the engine supplies those.

## The Image Prompt

Every Scenario produces the same shape: one paragraph of nine sentences, one per aspect, in this
order, with details inside a sentence separated by commas or semicolons:

| # | Aspect | Covers |
|---|---|---|
| 1 | subject and identity | who they are: age, build, skin, hair, face |
| 2 | pose and limbs | body position, limbs and hands |
| 3 | expression | facial expression and where they look |
| 4 | camera angle and framing | angle, lens, how much is in frame |
| 5 | clothing | every garment and accessory |
| 6 | environment | location, backdrop and props |
| 7 | lighting | light sources, direction and quality |
| 8 | color | palette and grading |
| 9 | art style and medium | photograph, painting, render… and its style |

The engine renders "adult, " plus the paragraph. Keep each Setup fact in its own aspect: a
subject described as having "an easy smile" puts an expression into the identity sentence, and
it will contradict a later "make her scared".

## Checking a Scenario

Open Home. A file that fails to parse is listed under *Start a new Session* with every problem
found (missing title or description, a Setup that isn't a mapping, a missing `## Opening`). A
valid file appears as a card.
