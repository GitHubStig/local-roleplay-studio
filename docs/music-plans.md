# Plan: music in a Roleplay

A working plan, built in stages over several sessions. Update it as each piece lands: tick the step, note what changed in the design, and add what was learned. When the work is done, this file goes: the design moves into [design.md](design.md), the decisions into ADRs, the terms into [CONTEXT.md](../CONTEXT.md), measurements into `docs/research/`, and anything left over into [open-threads.md](open-threads.md).

Started 2026-11-06 (Mac), from a design discussion with the owner. Nothing is settled beyond what's marked agreed or settled; challenge the rest as it's built.

## Picking up

Read this file, then only what the next step needs. Its context in the app: how a Roleplay works, the Art Agent and the Look, and Voices ([design.md](design.md#roleplays)); what follows a Reply ([ADR 0031](adr/0031-the-server-queues-what-follows-a-reply.md)); jobs taking turns ([ADR 0020](adr/0020-jobs-take-turns-per-machine.md), [ADR 0029](adr/0029-text-calls-take-turns-with-heavy-jobs.md)). The rest of the app's rules are in [AGENTS.md](../AGENTS.md): in particular, a reply under a JSON schema says how it ends.

## The idea

Music that follows a Roleplay like a film composer quietly following the story: not background picked for each Message, but a score that responds to the emotional course of what's between the Character and the Persona. A conversation can start flirtatious, turn vulnerable, then awkward, and end unresolved without the place or the subject changing; the music should recognise that progression. Most Messages change nothing.

Roleplays first. Storyboards may follow (a scoring pass over the plan fits them, as their Beats are known up front); Chains have no story to follow, so not them.

## The shape (working terms, not yet in CONTEXT.md)

- **Score**: the Roleplay's musical identity, written once like the Look and used in every Cue: genre, a palette of instruments, the atmosphere, a tempo range (maybe a key), and what to avoid. Written from the Cast and Brief, the Music taste, and the Scenario's Music. Editable in the Music tab; editing it marks the Cues made from it out of date. Fixed in play at first; later the Director may propose a change, for the player to accept.
- **Cue**: a stretch of music spanning several Frames: the Score plus a few chosen values (below), the Director's note on why, and any steer that made it. Each Frame records the Cue it plays under.
- **Music Director**: a Text Model call after each Reply (when scoring as you play), on the same machine and while the model is loaded for the picture, queued with what follows a Reply. It reads the whole story, the current Cue, its note and the Frame it began on, and answers "has the ground between them shifted since then?": a reading of the scene, and a decision: `continue`, `transition` (gentle or sharp, which is how the music enters), `silence`, or `stinger` (only with hindsight, see Score the Roleplay). The note is what lets it follow a trajectory rather than react to each line. A Cue lasts a few Frames at least unless the shift is sharp, and every change gives its reason.
- **Cue writer**: a second call, only on a transition: from the reading, the previous Cue and the Score, it picks the new Cue's values. Small enough that it may merge into the Director; a bench decides (stage 1).
- **The line that mattered**: a transition's note quotes the line that caused it (for the end credits' lyrics).
- **A Cue's values**: lists the schema enforces for Energy (calm, restrained, building, intense), Density (sparse, layered, full), Tempo (slow, moderate, fast; the adapter turns it into BPM within the Score's range) and Vocals (none, wordless, choir; lyrics later), limited by the Vocals setting so the model can't break it. Short phrases for Mood (texture folded in). Instruments drawn from the Score's palette; one outside it is flagged in the Music tab, not blocked. Dynamics is dropped: how a Cue enters is the transition's.
- **MusicGenerator**: an interface on the server like `ImageGenerator`, an adapter per model in its own folder. An adapter is a code template turning the Score and a Cue into its model's prompt (ACE-Step's tags and BPM, MiniMax's caption and `[instrumental]`), with no Text Model call. The avoid list never reaches the music model (negations pull in what they name); it only binds the cue writer, unless a model takes a negative prompt.
- **The player** (in the page, Web Audio): it does the transitions the Director names (a crossfade of a fixed length, a cut), loops, fades, the music volume, and lowers the music while a line is spoken. The model never times anything.
- **Scrolling back**: as each Frame records its Cue, the page plays the Cue of the Frame in view (VueUse's `useIntersectionObserver`, debounced), crossfading as it changes, and goes live again at the latest Frame.

## End credits (the owner's idea, 2026-11-06)

A song over end credits, the way a film ends, usually with vocals. A Roleplay lasts until deleted, but its story can end: the Persona or the Character dies, or the player writes the end. The Director notices an ending (a decision of its own, `ending`) and the page offers **Roll credits?**, rather than rolling them, as a death can be undone two Messages later; the current Cue can fade out meanwhile. Score the Roleplay finds endings too, with hindsight. **Roll credits** can also be pressed at any point and again later, and ends nothing. With the whole story in hand, the Text Model writes the song's lyrics about what happened between the two (checked against the Limits like any text), in the Score's identity, ideally a reprise of the Roleplay's theme (by audio, if stage 2 finds a model that makes variations). The page plays it over credits: the Cast's names, and the Roleplay's rendered pictures in order.

**Lines that echo the song**, as in a music video. When the Director makes a transition, its note quotes the line that caused it, so a Roleplay collects the lines that mattered; the lyric writer works a few of them into the song, word for word or nearly, and the credits show each one's Frame while it's sung. When it's sung: music models don't say, but Whisper (in mlx-audio) can time each word of the song.

Lyrics are allowed here even when the Vocals setting keeps the scenes instrumental: that setting is about music under spoken lines, and nothing is spoken over the credits. Whether the credits have vocals is a setting of their own.

## Controls (agreed in outline)

- **Music** in Settings: the feature flag, off by default, so the work can go to `main` piece by piece.
- **Behaviour** (Settings default, a copy per Session): Steady (few changes, kept low), Follows the story (default), Cinematic (changes readily, comes forward). Three named steps, each a sentence the Director and cue writer are given; no percentage slider, as a model can't tell 35% from 40%.
- **Vocals** (Settings default, a copy per Session): Instrumental only, Allow wordless vocals and choir, and later Allow vocals and lyrics (with songs). Enforced by the Cue's schema.
- **Music in the Scenario** (agreed 2026-11-06): an optional `## Music` section beside `## Style`, and like it: what the story's music should be ("fiddle and sea shanties, low and smoky"); left out, the Text Model picks it in the Score. It joins the Scenario's type, its Markdown, the Scenario page (hand edits, and Suggest per part) and docs/scenarios.md, and the examples get one.
- **Music taste** (Settings default, a copy per Session): free text, given word for word to whatever writes the Score ("orchestral, no electronic instruments, ambience over melody").
- **Score as you play** (per browser, like Speak replies): whether the Director runs after each Reply.
- **Score the Roleplay** (a button): a pass over every Frame with hindsight, like a film's spotting session: it can start a Cue just before a turning point and place stingers exactly. Then the Cues are written and their music queued. Long Roleplays are read in overlapping chunks.
- **Steer box** (Music tab): "more piano", "darker": forces a transition, with the steer as the cue writer's main instruction; kept on the Cue so the next one doesn't drop it; "Keep for this Roleplay" adds it to the Session's Music taste.
- **Buttons, not words, for what's exact**: Keep this track (pin the Cue), Music off for now (mute; nothing generated or played), New take. Volume sits beside the music, per browser.

## Settled by bench, not by argument

Answered 2026-11-06 with the owner: each of these is decided by what sounds or reads better in a bench, not picked up front.

- **What the Director reads**: the whole story, or only the Frames since the Cue began. Whichever gives the better decisions (stage 1's bench).
- **Director and cue writer**: one call or two. Built as two first, so each is easy to tune and the Music tab shows both; merged and compared once both prompts are stable (stage 1's bench).
- **Track length, looping or extending**: no length fixed. The model bench tries lengths (from about 60 s), loops and extends, and the length follows from what each model does well and how a loop or an extension sounds (stage 2).
- **Vocals under a spoken line**: sung or hummed voices sit in the same range of pitch as speech, and the ear tries to follow both, so a choir can make a spoken line harder to follow than strings at the same volume would (why films keep songs out from under dialogue). Not something to build for: a listening check once music plays (stage 3). If it's a problem, either lower the music further while a line is spoken when the Cue has vocals, or have the cue writer avoid vocals while Voices are on.
- **Which music model, on which machine** (stage 2).

## Stages

### 1. The Director, with no music (text only)

No music model, no downloads. The aim is to read a few Roleplays' Cues and judge the Director's taste before generating anything.

- [x] The Music setting (feature flag): `music` in Settings, off by default, on a Music tab of its own, where its other settings will go too (2026-11-06).
- [x] Behaviour, Vocals and Music taste on the Music tab while Music is on (2026-11-06): `musicBehaviour` (steady, story, cinematic), `musicVocals` (instrumental, wordless; lyrics later, with songs) and `musicTaste`, kept by each new Session in its `settings`. Sessions made before them were upgraded by hand on the Mac (2026-11-06; the PC had none), so the code has no fallback for missing ones; the same for `scenario.music` in a Session's copy.
- [x] The Scenario's `## Music` section (2026-11-06): parsed and written like Style, checked by the Limits, left out of `factsOf` so the Character and the Art Agent never see it; on the Scenario page (shown while Music is on, or when the Scenario has some) with Suggest; in docs/scenarios.md; written for the tavern and the two afterlife examples. Expand writes it from a Brief that names music and can suggest it (checked for runaways over 32 calls, research/scenario-expand.md); otherwise it's left blank for the Score to pick. Every example has one, Contact too, as any Scenario can start any kind of Session.
- [x] The Score (2026-11-06): `score` on a Roleplay (`server/roleplay/score.ts`, prompts `roleplay/score*.md`): genre, a palette of instruments (voices left out, as the Cue's Vocals say), atmosphere, a tempo range (40–200 BPM) and what to avoid; no key until stage 2 shows a music model follows one. Written by the Session's Text Model from the Cast, the Brief, the Scenario's Music and the Session's Music taste, by Write the Score in the Music tab (a streamed call, `POST …/roleplay/score`, with its own lock); the Director will write it the first time it runs if there's none. Edited by hand (checked by the Limits); every route refused while Music is off. Checked straight against Ollama: no runaway in 96 ([text-models.md](research/text-models.md#runaway-whitespace-under-a-schema)).
- [x] The Roleplay's Music tab (2026-11-06), beside Frame and Look & Cast while Music is on: the Score to edit or write again, and the Roleplay's own Behaviour, Vocals and Music taste (`PUT …/roleplay/music`). The Cues' strip and counts come with the Director.
- [ ] How editing the Score marks Cues out of date (asked, not yet settled; matters once Cues exist). Proposed: derived, as pictures are: each track records the prompt the adapter made it from, and is out of date when the Score and its Cue would now make a different one; a Cue keeps its values, and an instrument no longer in the palette is flagged on it.
- [ ] The Director and cue writer calls, their schemas (checked straight against Ollama over seeds 1–8 for runaway whitespace), queued after a Reply when Score as you play is on; Frames record their Cue.
- [ ] The Music tab's Cues: for the Frame, the reading, decision and Cue; for the Session, the Cues as a strip across the Frames and counts (Cues, average length, decisions).
- [ ] The steer box.
- [ ] Score the Roleplay, the pass with hindsight.
- [ ] Bench replays (`server/replay/replays/`), longer than the ones there now (about 12–16 Messages), each with a planned emotional course written at its top: where the music should hold, where it should shift and how sharply. That's the answer key the Director's decisions are checked against. The Messages steer the turning points, so they land in the same place whatever the seeded Replies say:
  - **Tavern, a lost relative**: wary talk turns into recognition, Elara as Kael's long-lost daughter or old love; slow, tender shifts with no change of place.
  - **Tavern, a hired killer**: friendly on the surface, deceit underneath, then a fight; a sharp transition, and a test of whether the Director hears the menace before the blade comes out.
  - **Knocking on Heaven's Door** (an example Scenario since 2026-11-06, as is the Buffet, so their replays run on both machines): begins in awe, a test of choir and wordless vocals and of the Vocals setting holding them back.
  - **The Buffet of Souls**: somber, regret, maybe acceptance; slow shifts within one low mood, a test of Steady against Follows the story.
  - **A control where nothing shifts**: a long, even conversation (the tavern's small talk), for the Director to hold one Cue through; it catches a Director that changes too readily.
- [ ] A bench: those Roleplays, over several seeds: split against merged calls, whole story against since the Cue began; decisions, Cues, time per Frame, runaways. Findings in the bench's README.

### 2. Bench the music models (ask before the downloads)

ACE-Step and MiniMax Music 3, on both machines where each runs. Known so far (2026-11-06): MiniMax Music 3 runs through mlx-audio on the Mac (`mlx_audio.music`, in the locked 0.6.4; mlx-community copies: 4-bit 9.2 GB, mxfp8 13.9 GB, recommended for lyrics, bf16 28.5 GB); no local ComfyUI node for it was found. ACE-Step 1.5 is native in ComfyUI for text to music (since 2026-02); cover, repaint and a reference audio for style come from the official ACE-Step-ComfyUI pack and community nodes; native extend unconfirmed; how it runs on the Mac is unknown. YuE and HeartMuLa were thought slow.

- [ ] A song with lyrics (for the end credits): are the words sung as written, with a few lines quoted from a Roleplay among them, and how long does a 2–3 min song take?
- [ ] Whisper's word times on a generated song: close enough to show each quoted line's picture as it's sung?
- [ ] Time for instrumental music at a few lengths (from about 60 s); quality by ear.
- [ ] Variations: does a take made from a reference track sound like the same piece? (This decides how Cues stay related: by audio, or only by consistent text.)
- [ ] Looping against extending: how each sounds when a Cue goes on for several minutes, and which each model can do; the track length follows from it.
- [ ] Whether a key in the prompt is followed.
- [ ] Memory beside the Text Model and the Image Model.
- [ ] Record in `docs/research/` (a new `music.md`), the picks in `models.md`, and an ADR for the backend split if it mirrors voices (ADR 0010).

### 3. Music, played

- [ ] `MusicGenerator` and the adapter(s) picked in stage 2; a music job in the queue, behind lines and pictures (music is allowed to be late).
- [ ] Cues' music saved with the Session.
- [ ] The player: crossfades, loops or extends, fades, volume, lowering under spoken lines.
- [ ] Pin, mute, new take.
- [ ] Listen to vocal Cues under spoken lines (see Settled by bench).

### 4. Further

- [ ] Music following the Frame in view when scrolling back.
- [ ] Variations of the theme and extending a track, if stage 2 says a model can.
- [ ] Stingers from Score the Roleplay.
- [ ] End credits: the `ending` decision and the offer, Roll credits, the lyrics quoting the lines that mattered, the song, and the credits page with the Cast and the pictures, each quoted line's picture shown as it's sung. The first place lyrics appear, before songs a Character performs.
- [ ] Songs a Character performs (lyrics by the Character's model, played once like a line), with Allow vocals and lyrics.
- [ ] The Director proposing a change of Score.
- [ ] A scoring pass for Storyboards.

## Rejected, and why

- **A separate extractor feeding the Director a summary**: the Director would lose the details a trajectory depends on (she laughs while saying it). The Director reads the story itself.
- **A classifier model for emotions**: labels a line, not the course of a relationship; adds memory and swaps; and AGENTS.md wants a workaround only for a measured failure. A CLAP-style check that a track matches its Cue is the better case for another kind of model, if a bench shows bad matches.
- **Stingers in live play**: music made in 30–90 s lands after the moment; only Score the Roleplay can place them.
- **The story borrowing from a song** (a Character quoting or humming lyrics in their lines): the owner doesn't want it (2026-11-06). Songs echo the story, never the other way round, and the Character's prompt gets no lyrics.
- **A percentage for intensity**, and a fourth Off in Behaviour (the Music flag and Score as you play already say it).

## Log

- 2026-11-06 (Mac): plan written from the design discussion; the open questions answered (a Music section in the Scenario; the rest settled by bench).
- 2026-11-06 (Mac), later: stage 1's first three steps built and committed (the Music switch on its own Settings tab; the Scenario's Music, written by Expand and Suggest; Behaviour, Vocals and Music taste, kept by each Session). Real people stopped being a Limit the same day (ADR 0034), and the two afterlife Scenarios became examples for the bench replays. **Next: the Score**: when it's written (at Begin, or the first time the Director runs), its prompt and schema (checked against Ollama for runaways), where it's kept on a Roleplay, and the Roleplay's Music tab to show and edit it. mlx-audio upgraded to 0.6.4 the same day ([log](research/mlx-audio-upgrade-log.md)).
- 2026-11-06 (Mac), later still: the Score built (asked first: written lazily plus a button, no key, the Music tab with the Session's music settings); its call checked against Ollama, no runaway in 96. Sessions from before the music settings were upgraded by hand instead of read with a fallback. The prompt speaks of "the people in it", not two, as a Roleplay can have others. **Next: the Director and cue writer**, and settling how a Score edit marks Cues out of date.
- 2026-11-06 (Mac): Settings' Art Agent model removed, never used: the Score, the Director and the cue writer, like every text job, use the Session's Text Model. With the Director run right after a Reply, before its picture, the model stays loaded for both.
