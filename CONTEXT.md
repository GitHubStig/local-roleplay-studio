# RPG

A turn-based, text-driven role-playing simulator: the player types what they do, a text model rewrites the scene, and an image model renders it.

## Language

### Game loop

**Scenario**:
A file that defines how a Session begins: the opening premise the first Scene is written from.
_Avoid_: Prompt file, template, level

**Session**:
One playthrough of a Scenario, from its opening Scene until the player ends or resets it.
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

**Turn Log**:
The ordered record of a Session's Turns, kept for the player to review; never fed back into the text model.
_Avoid_: History, conversation, chat log

**Cancel**:
Abandoning the Turn in progress so the Scene stays as it was; cancelling the Opening Turn abandons the Session.
_Avoid_: Abort, stop, undo

**End**:
Closing a Session for good, invoked only by a button, never by typing an Action.
_Avoid_: Stop, quit

**Reset**:
Discarding the current Session and starting a fresh one from the same Scenario, invoked only by a button.
_Avoid_: Restart, new game

### Photoshoot

**Subject**:
The fictional adult professional being photographed; a character with their own voice who can decline a direction in character.
_Avoid_: Model, victim, character, person

**Shoot Brief**:
The fixed setup of a photoshoot Scenario — location, the Subject's appearance and wardrobe, and tone — that every Scene must stay within.
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
