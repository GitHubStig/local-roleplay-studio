# RPG

A local text-to-image prompt generator: the player describes what to make, a text model writes image prompts, and an image model renders them, one image at a time (a Chain) or as a planned sequence (a Storyboard).

## Language

### Sessions

**Brief**:
What a Session starts from: a description of what to make, typed by the player or loaded from a Scenario.
_Avoid_: Premise, idea, opening prompt, pitch

**Scenario**:
A saved, reusable Brief in a file, optionally with Setup facts.
_Avoid_: Prompt file, template, level

**Setup**:
Facts a Scenario gives the text model when a Session starts, such as who is shown, where, and the look; any of it can change afterwards.
_Avoid_: Config, context, world

**Session**:
One piece of work: a sequence of Frames started from a Brief, as either a Chain or a Storyboard. It can be left and returned to at any time, and lasts until deleted.
_Avoid_: Game, run, project

**Chain**:
A kind of Session in which each new Frame is made from the previous Frame's Image Prompt by an Action.
_Avoid_: Game, iterative mode, turn-based

**Storyboard**:
A kind of Session whose Frames are all planned and written together from the Brief, then edited and rendered one by one.
_Avoid_: Comic, manga, shot list, sequence

**Frame**:
One image in a Session: its Image Prompt, and its image once rendered.
_Avoid_: Turn, step, panel, shot

**Opening Frame**:
The first Frame of a Chain, written from the Brief instead of from an Action.
_Avoid_: Frame 0, intro

**Beat**:
One line of a Storyboard's plan: what happens in one Frame, before it is written out as an Image Prompt.
_Avoid_: Scene, step, moment

**Look**:
The identity and art style a Storyboard's Frames share, written once and used word for word in every Frame's Image Prompt.
_Avoid_: Style guide, theme, bible

**Image Prompt**:
The single authoritative description of one Frame's image: one paragraph of nine sentences, one per aspect in a fixed order (subject and identity, pose and limbs, expression, camera angle and framing, clothing, environment, lighting, color, art style and medium), and exactly what the Image Model renders.
_Avoid_: Scene, sections, description, state

**Frames**:
The ordered list of a Session's Frames, shown to the player; in a Chain, never fed back to the text model.
_Avoid_: Turn log, history, timeline

### Changing Frames

**Action**:
The free text the player submits describing what to change: in a Chain it makes a new Frame from the latest one; in a Storyboard it rewrites the selected Frame.
_Avoid_: Prompt, input, command, direction

**Narration**:
A terse list of what an Action changed, one short phrase per changed aspect, written for the player.
_Avoid_: Description, message, response, story

**Limit**:
One of the lines no Action or Brief can cross, enforced by the engine whatever the Scenario or text model says: everyone depicted is an adult, no sexual or nude imagery, no real identifiable people, no restraint or captivity.
_Avoid_: Rule, filter, guardrail, policy

**Outcome**:
How an Action was received: done, declined or unclear. Only a done Action changes an Image Prompt.
_Avoid_: Result, status, verdict

**Declined Frame**:
A Chain Frame whose Action crossed a Limit; its Image Prompt and image are the previous Frame's, unchanged.
_Avoid_: Rejected, refused, blocked

**Unclear Frame**:
A Chain Frame whose Action couldn't be understood (gibberish, or too vague to act on); the text model asks what to change, and the Image Prompt and image are unchanged.
_Avoid_: Invalid, failed, error

**Cancel**:
Abandoning the work in progress so nothing changes; cancelling a Chain's Opening Frame abandons the Session.
_Avoid_: Abort, stop

**Undo**:
Removing a Chain's latest Frame so the previous Frame is current again; the Opening Frame can't be undone.
_Avoid_: Delete frame, revert, rollback

### Configuration

**Text Model**:
The Ollama language model that writes and edits Image Prompts.
_Avoid_: LLM, model, AI

**Image Model**:
The mflux model that renders an Image Prompt into an image.
_Avoid_: Model, diffusion model, generator
