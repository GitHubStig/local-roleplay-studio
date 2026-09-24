# RPG

A turn-based text-to-image prompt generator: the player types what to change, a text model rewrites the image prompt, and an image model renders it.

## Language

### Game loop

**Scenario**:
A file that defines how a Session begins: the facts and instructions the opening Image Prompt is written from.
_Avoid_: Prompt file, template, level

**Setup**:
The facts a Scenario starts from, such as who is shown, where, and the look; used only to write the opening Image Prompt, after which any of it can change.
_Avoid_: Config, context, world, brief

**Session**:
One playthrough of a Scenario, from its opening Image Prompt onwards; it can be left and returned to at any time, and lasts until deleted.
_Avoid_: Game, run, playthrough

**Image Prompt**:
The single authoritative description of the current image, written as nine Sections in a fixed order; the only state carried from one Turn to the next, and exactly what the Image Model renders.
_Avoid_: Scene, prompt string, description, state

**Section**:
One of the nine fixed parts of an Image Prompt: subject and identity, pose and limbs, expression, camera angle and framing, clothing, environment, lighting, color, art style and medium.
_Avoid_: Field, part, slot

**Action**:
The free text the player submits describing what to change in the image.
_Avoid_: Prompt, input, command, direction

**Turn**:
One step of a Session: an Action applied to the current Image Prompt, producing a new Image Prompt and its image. A Turn commits whole or not at all; until its image arrives, its Image Prompt is provisional.
_Avoid_: Round, step, move

**Opening Turn**:
The first Turn of a Session, which writes the opening Image Prompt from the Scenario instead of from an Action.
_Avoid_: Turn 0, intro, setup

**Narration**:
A terse list of what a Turn changed, one short phrase per changed Section, written for the player; like the rest of the Turn Log, never fed back to the text model.
_Avoid_: Description, message, response, story

**Limit**:
One of the lines no Action can cross, enforced by the engine whatever the Scenario or text model says: everyone depicted is an adult, no sexual or nude imagery, no real identifiable people, no restraint or captivity.
_Avoid_: Rule, filter, guardrail, policy

**Outcome**:
How a Turn's Action was received: done, declined or unclear. Only a done Action can change the Image Prompt.
_Avoid_: Result, status, verdict

**Declined Turn**:
A Turn whose Action crossed a Limit; its Image Prompt and image are the previous Turn's, unchanged.
_Avoid_: Rejected, refused, blocked

**Unclear Turn**:
A Turn whose Action couldn't be understood (gibberish, or too vague to act on); the text model asks what to change, and the Image Prompt and image are unchanged.
_Avoid_: Invalid, failed, error

**Turn Log**:
The ordered record of a Session's Turns, kept for the player to review; never fed back into the text model.
_Avoid_: History, conversation, chat log

**Cancel**:
Abandoning the Turn in progress so the Image Prompt stays as it was; cancelling the Opening Turn abandons the Session.
_Avoid_: Abort, stop, undo

**Undo**:
Removing the latest Turn so the Image Prompt is the previous Turn's again; the Opening Turn can't be undone.
_Avoid_: Delete turn, revert, rollback

### Configuration

**Text Model**:
The Ollama language model that turns the current Image Prompt and an Action into the next Image Prompt.
_Avoid_: LLM, model, AI

**Image Model**:
The mflux model that renders an Image Prompt into an image.
_Avoid_: Model, diffusion model, generator
