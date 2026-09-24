# Writing a Scenario

A **Scenario** is one Markdown file in `scenarios/`: the starting point for a Session. The
file name, minus `.md`, is its id (`photoshoot.md` → `photoshoot`). Files are read fresh on
every request, so a new or edited Scenario shows up on Home, under *Start a new Session*,
without a restart.

A Scenario only shapes the **opening** Image Prompt. After that, every Section can be changed by
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

Optional notes for the Text Model on every Turn.

## Opening

What the opening image should be.
```

## Frontmatter

| Field | Required | What it is |
|---|---|---|
| `title` | yes | Shown on the Scenario's card on Home |
| `description` | yes | Shown under the title |
| `setup` | no | A YAML mapping of facts (who, where, what they wear, the tone). Given to the Text Model **only on the Opening Turn**, to write the opening Image Prompt from. |

Use YAML's `>-` for long text: it folds lines into one paragraph.

## Body sections

Only `##` headings count, matched case-insensitively.

- **`## Opening`** (required): what the opening image should be. Be concrete: the Text Model
  turns it, plus the Setup, into the nine Sections.
- **`## System`** (optional): notes the Text Model gets on every Turn, after the engine's own
  rules. Use it for things like "keep Maya recognisably the same person". Don't restate the
  Sections, the Limits or the reply format; the engine supplies those.

## The Image Prompt

Every Scenario produces the same nine Sections, in this order:

| Section | Covers |
|---|---|
| subject and identity | who is shown: age, build, skin, hair, face |
| pose and limbs | body position, limbs and hands |
| expression | facial expression and where they look |
| camera angle and framing | angle, lens, how much is in frame |
| clothing | every garment and accessory |
| environment | location, backdrop and props |
| lighting | light sources, direction and quality |
| color | palette and grading |
| art style and medium | photograph, painting, render… and its style |

The engine joins them in order, starting with "adult", and that exact text is what the Image
Model renders.

## Checking a Scenario

Open Home. A file that fails to parse is listed under *Start a new Session* with every problem
found (missing title or description, a Setup that isn't a mapping, a missing `## Opening`). A
valid file appears as a card.
