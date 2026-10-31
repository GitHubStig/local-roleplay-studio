# Local Roleplay Studio

A local roleplay studio: in a Roleplay the player talks with a Character played by a text model, and any moment can be pictured by an image model, spoken aloud and made 3D. A Chain changes one picture step by step instead (a text model rewrites the image prompt, an image model renders it), and a Storyboard plans a sequence of pictures at once.

The terms below are the domain's terms. Refer to things by them in code, docs and the UI. How each works is in [docs/design.md](docs/design.md).

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
One piece of work: a sequence of Frames started from a Brief, as a Chain, a Storyboard or a Roleplay. It can be left and returned to at any time, and lasts until deleted.
_Avoid_: Game, run, project

**Chain**:
A kind of Session in which each new Frame is made from the previous Frame's Image Prompt by an Action.
_Avoid_: Game, iterative mode, turn-based

**Storyboard**:
A kind of Session whose Frames are planned together from the Brief, reviewed, then written out from the plan, and edited and rendered one by one.
_Avoid_: Comic, manga, shot list, sequence

**Roleplay**:
A kind of Session in which the player talks with a Character, one exchange per Frame. Any Frame can be pictured by the Art Agent, then rendered.
_Avoid_: Chat, conversation mode, story mode

**Frame**:
One step of a Session. In a Chain or a Storyboard, one image: its Image Prompt, and its image once rendered. In a Roleplay, one exchange: the player's Message and the Character's Reply. Numbered from 1 wherever it's shown.
_Avoid_: Turn, step, panel, shot

**Opening Frame**:
The first Frame of a Chain or a Roleplay, written from the Brief (or the Cast) instead of from an Action or a Message.
_Avoid_: Frame 0, intro

**Beat**:
One line of a Storyboard's plan: what happens in one Frame, and who it shows, reviewed before it is written out as an Image Prompt.
_Avoid_: Scene, step, moment

**Look**:
The identities and art style a Storyboard's or a Roleplay's pictures share, used word for word: an identity for each Subject, and one art style.
_Avoid_: Style guide, theme, bible

**Subject**:
One of a Look's: a person, creature, animal or object the story follows from picture to picture, with a name and an identity. A group that acts together and looks alike can be one.
_Avoid_: Person (for one of a Look's), character, entity

**Cast**:
Who a Roleplay is with and where it starts: the Character, the Persona and the Setting, written from its Brief. Once the scene has begun, only what steers the Character can change.
_Avoid_: Character card, world, config

**Character**:
Who the text model plays in a Roleplay: name, age, appearance, personality, way of speaking, background, and a goal they pursue.
_Avoid_: Bot, NPC, agent, AI

**Persona**:
Who the player plays in a Roleplay, so the Character knows who they're dealing with: a name, who they are to the Character, and a brief appearance.
_Avoid_: User, player character, avatar

**Setting**:
Where and when a Roleplay's scene starts: the place, the time of day and the weather. Not to be confused with a Scenario's Setup.
_Avoid_: Scene, location, world

**Message**:
What the player writes in a Roleplay: what their Persona says or does. **Suggest** can write one for them, to edit or send.
_Avoid_: Action, prompt, input

**Reply**:
The Character's answer to a Message: a brief thought, what they do, and what they say, as three separate fields.
_Avoid_: Response, completion, output, narration

**Art Agent**:
The Text Model's job of turning a Roleplay Frame into an Image Prompt: the Roleplay's Look, written once, then each pictured Frame's sentences from the story up to it.
_Avoid_: Illustrator, image agent, art bot

**Image Prompt**:
The single authoritative description of one Frame's image, and exactly what the Image Model renders: one paragraph covering nine aspects in a fixed order (subject and identity, pose and limbs, expression, camera angle and framing, clothing, environment, lighting, color, art style and medium). A Chain's is nine sentences the Text Model rewrites; a Storyboard's and a Roleplay's are the Look's identities of the Subjects shown, the Frame's own seven sentences, then the Look's style.
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
One of the three lines no Action, Brief or Message can cross while the Limits are on, enforced by the engine whatever the Scenario or text model says: no sexual or nude imagery, no real identifiable people, no restraint or captivity. Age is unrestricted. Settings can switch them off together.
_Avoid_: Rule, filter, guardrail, policy

**Outcome**:
How an Action was received: done, declined or unclear. Only a done Action changes an Image Prompt.
_Avoid_: Result, status, verdict

**Declined Action**:
An Action that crossed a Limit, or that the text model declined: no Frame is saved, and the Action stays with the player to reword.
_Avoid_: Rejected, refused, blocked

**Unclear Action**:
An Action the text model couldn't act on (gibberish, too vague, or about something that isn't there); it asks what to change. No Frame is saved, and the Action stays with the player to reword.
_Avoid_: Invalid, failed, error

**Cancel**:
Abandoning the work in progress so nothing changes; cancelling an Opening Frame abandons the Session.
_Avoid_: Abort, stop

**Undo**:
Removing the latest Frame of a Chain or a Roleplay, so the one before is current again; its Action or Message goes back into the text box. The Opening Frame can't be undone.
_Avoid_: revert, rollback

**Restart**:
Taking a Storyboard back to its plan, or a Roleplay back to reviewing its Cast, deleting what was made since. Unlike Undo, it can't be taken back.
_Avoid_: Reset, start over

**Delete** (a Chain Frame):
Removing a Chain Frame between the Opening and the latest, with its pictures; the Frames after it are numbered down and keep their Image Prompts. Unlike Undo, nothing goes back into the text box.
_Avoid_: Remove, drop

**Upscale**:
Enlarging a Frame's picture with an upscaler, keeping the original.
_Avoid_: Enhance, HD, super-resolution

**Edit** (a picture):
Repainting a picture, or an area painted over it, as the player says, with an edit model. Each edit is a version of the picture, beside the original.
_Avoid_: Inpaint, fix, retouch

**Clip**:
A few seconds of video made from a Frame's picture by the Video model, kept on that picture, one of each kind: a **Lead In** ends on the picture, a **Play out** starts on it, an **Idle Loop** starts and ends on it, and an **Into Next** starts on it and ends on the next Frame's picture.
_Avoid_: Video, animation, GIF, motion

### Configuration

**Text Model**:
The language model that does every text job: it writes and edits Image Prompts, plays the Character, pictures Roleplay Frames and suggests the player's Messages. It runs on a **Text backend**.
_Avoid_: LLM, model, AI

**Backend**:
One program that runs models, at an address: a ComfyUI, an Ollama, a server with the OpenAI chat API, or this machine's own programs, which count as one. Settings list them in the order work tries them, and each kind of work prefers one.
_Avoid_: server, provider

**Machine**:
The computer a Backend runs on, known by its address. Jobs on one Machine take turns; jobs on different Machines run side by side.
_Avoid_: host, node

**Text backend**:
A Backend that runs the Text Model: an Ollama, or a server with the OpenAI chat API. A Session keeps its Text Model, not the Backend.
_Avoid_: provider, engine

**Image Model**:
The model that renders an Image Prompt into an image, known by its name: the same name on mflux and on ComfyUI is the same model. A Session has one, and can be switched to another; each Frame keeps its picture by every model it was rendered with.
_Avoid_: Model, diffusion model, generator

**Image backend**:
What runs the Image Model: mflux (on a Mac) or a ComfyUI.
_Avoid_: renderer, provider, engine
