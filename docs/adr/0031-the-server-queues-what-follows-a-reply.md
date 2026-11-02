---
status: accepted
---

# The server queues what follows a Reply or a Frame; the switches are the browser's

A Chain's "Render each Frame" was kept on the Session, while a Roleplay's "Render replies" and "Speak replies" were kept per browser, and the Roleplay page queued a Reply's spoken line, picture and render itself once it heard of the Reply. Since 2026-11-02:

- **The switches are the browser's** (`localStorage`, `useStoredFlag`), for every kind of Session: whether to render, and speak, what's made is the player's choice where they play, as the machine they're on may be slow at pictures or they may not want any. "Render each Frame" starts on; "Render replies" and "Speak replies" start off. A Chain no longer keeps `renderFrames`.
- **They're sent with the work**: a Chain's Action (`/frames`, `render`) and a Roleplay's opening and Messages (`/roleplay/begin` and `/messages`, `speak` and `render`).
- **The server queues what follows as it saves** the Frame or Reply, before the page hears of it ([ADR 0030](0030-a-chain-frame-renders-as-a-job.md) for a Chain's render): for a Reply, its line spoken (if asked, Voices on, and it has words), its picture, then its render (if asked, and Pictures on), in that order, so a line isn't held up behind a render on the same machine. A Reply's picture is always written unless the request says `picture: false`, which the tests use to begin unpictured; the page never does.

## Considered Options

- **The page queues them after hearing of the Reply**, as before. Three requests where one save would do, and nothing for the replay tool or any other caller of the API. A closed tab lost nothing that matters: the Reply's stream is cancelled with it.
- **Each switch kept on the Session.** It would follow the Session to another browser, or machine, where the player may not want renders.

## Consequences

- The replay tool sends its pictures choice with each step and queues only a Storyboard's renders itself.
- A Session saved before this with `renderFrames` keeps the field, unread.
