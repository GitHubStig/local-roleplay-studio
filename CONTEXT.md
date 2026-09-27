# RPG

A local text-to-image prompt generator: the player describes what to make, a text model writes image prompts, and an image model renders them, one image at a time (a Chain) or as a planned sequence (a Storyboard). A Roleplay is a conversation with a Character instead, text only for now.

The terms below are the domain's terms. Refer to things by them in code, docs and the UI.

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
A kind of Session whose Frames are all planned and written together from the Brief, then edited and rendered one by one.
_Avoid_: Comic, manga, shot list, sequence

**Roleplay**:
A kind of Session in which the player talks with a Character, one exchange per Frame. Text only for now: rendering is deferred to a planned Art Agent.
_Avoid_: Chat, conversation mode, story mode

**Frame**:
One step of a Session. In a Chain or a Storyboard, one image: its Image Prompt, and its image once rendered. In a Roleplay, one exchange: the player's Message and the Character's Reply.
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

**Cast**:
Who a Roleplay is with and where it starts: the Character, the Persona and the Setting. Written once when the Roleplay is set up, from its Brief; editable later.
_Avoid_: Character card, world, config

**Character**:
Who the text model plays in a Roleplay: name, age (18 or over), appearance, personality, voice, background, and a goal they pursue.
_Avoid_: Bot, NPC, agent, AI

**Persona**:
Who the player plays in a Roleplay, so the Character knows who they're dealing with: a name, who they are to the Character, and a brief appearance.
_Avoid_: User, player character, avatar

**Setting**:
Where and when a Roleplay's scene starts: the place, the time of day and the weather. The conversation carries it on from there. Not to be confused with a Scenario's Setup.
_Avoid_: Scene, location, world

**Message**:
What the player writes in a Roleplay: what their Persona says or does.
_Avoid_: Action, prompt, input

**Art Agent**:
The Text Model's job of turning a Roleplay Frame into an Image Prompt: a Look for the Roleplay, written once, then each pictured Frame's sentences from the story up to it.
_Avoid_: Illustrator, image agent, art bot

**Reply**:
The Character's answer to a Message: a brief thought, what they do, and what they say, as three separate fields.
_Avoid_: Response, completion, output, narration

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
One of the lines no Action or Brief can cross, enforced by the engine whatever the Scenario or text model says: everyone depicted is an adult, no sexual or nude imagery, no real identifiable people, no restraint or captivity. All but the first can be switched off in Settings.
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
Removing the latest Frame of a Chain (so the previous Frame is current again) or of a Roleplay (its last exchange); the opening can't be undone.
_Avoid_: Delete frame, revert, rollback

**Upscale**:
Enlarging a rendered Frame's image so its shortest edge is 2048 px, with the SeedVR2 upscaler; the original image is kept, and an upscaled Frame is flagged so it isn't upscaled twice. A re-render drops the upscale.
_Avoid_: Enhance, HD, super-resolution

### Configuration

**Text Model**:
The Ollama language model that writes and edits Image Prompts.
_Avoid_: LLM, model, AI

**Image Model**:
The mflux model that renders an Image Prompt into an image.
_Avoid_: Model, diffusion model, generator
