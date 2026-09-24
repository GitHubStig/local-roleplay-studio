# RPG

A turn-based, text-driven role-playing simulator: the player types what they do, a text model rewrites the scene, and an image model renders it.

## Language

### Game loop

**Scenario**:
A file that defines how a Session begins: the opening premise the first Scene is written from.
_Avoid_: Prompt file, template, level

**Setup**:
The fixed facts a Scenario declares, such as place, characters and tone, that every Scene in its Sessions must stay within.
_Avoid_: Config, context, world

**Session**:
One playthrough of a Scenario, from its opening Scene onwards; it can be left and returned to at any time, and lasts until deleted.
_Avoid_: Game, run, playthrough

**Scene**:
The single authoritative description of the current situation, in whatever shape its Scenario defines; the only state carried from one Turn to the next.
_Avoid_: Setting, room, context, history

**Action**:
The free text the player submits describing what they do next.
_Avoid_: Prompt, input, command

**Turn**:
One step of a Session: an Action applied to the current Scene, producing a new Scene and its image. A Turn commits whole or not at all; until its image arrives, its Scene is provisional.
_Avoid_: Round, step, move

**Opening Turn**:
The first Turn of a Session, which writes the opening Scene from the Scenario instead of from an Action.
_Avoid_: Turn 0, intro, setup

**Narration**:
The short account of what happened in a Turn, written for the player; like the rest of the Turn Log, never fed back to the text model.
_Avoid_: Description, message, response

**Outcome**:
How a Turn's Action was received: done, declined or unclear. Only a done Action can change the Scene.
_Avoid_: Result, status, verdict

**Declined Turn**:
A Turn whose Action a character refused; its Scene and image are the previous Turn's, unchanged.
_Avoid_: Rejected, refused, blocked

**Unclear Turn**:
A Turn whose Action couldn't be understood (gibberish, or too vague to act on); a character asks what was meant, and the Scene and image are unchanged.
_Avoid_: Invalid, failed, error

**Turn Log**:
The ordered record of a Session's Turns, kept for the player to review; never fed back into the text model.
_Avoid_: History, conversation, chat log

**Cancel**:
Abandoning the Turn in progress so the Scene stays as it was; cancelling the Opening Turn abandons the Session.
_Avoid_: Abort, stop, undo

**Undo**:
Removing the latest Turn so the Scene is the previous Turn's again; the Opening Turn can't be undone.
_Avoid_: Delete turn, revert, rollback

### Photoshoot

**Subject**:
The fictional adult professional being photographed; a working model who follows every Direction within the Shoot Brief's limits, with a voice of their own.
_Avoid_: Model, victim, character, person

**Shoot Brief**:
The Setup of a photoshoot Scenario: the location, the Subject's appearance and wardrobe (including what may change), the tone, and the limits no Direction can cross.
_Avoid_: Brief, prompt, goal, objectives

**Direction**:
An Action in a photoshoot, aimed at the Subject's pose, the camera, the lighting, or the set.
_Avoid_: Instruction, command, order

### Configuration

**Text Model**:
The Ollama language model that turns the current Scene and an Action into the next Scene.
_Avoid_: LLM, model, AI

**Image Model**:
The mflux model that renders a Scene into an image.
_Avoid_: Model, diffusion model, generator
