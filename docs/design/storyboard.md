# Storyboards

Part of the [design](../design.md). Terms in **bold** are defined in [CONTEXT.md](../../CONTEXT.md).

A Storyboard is started from a Brief and a Frame count (1–32), then made in three steps ([ADR 0019](../adr/0019-storyboards-plan-review-write.md)): **planned**, reviewed by the player, then **written** a Frame at a time.

1. **Limits on the Brief:** the term list.
2. **Plan**, one Text Model call, streaming in: the **Look** (an identity for each **Subject**: everyone and everything the story follows, people, creatures, animals and objects with a part of their own, each named, a group that looks alike as one; and the art style, shared by every Frame), then the **Beats**, one line per Frame with who it shows. All or nothing: a failed or cancelled plan discards the Storyboard.
3. **Review:** the plan waits for the player, who can edit the Look and each Beat and who it shows, add, remove and reorder Beats. Nothing is written or rendered yet.
4. **Write Frames:** a Text Model call per Frame, in order, each given the Look, every Beat with who it shows, the Brief and the seven sentences of the Frames before it; it answers with the Frame's own seven sentences. The Beats are checked with the Limits first, as an Action is. Each Frame is saved as it comes, so a failure or Cancel keeps those written, and writing again carries on from the next.
5. **Frames are assembled:** the identities of the Subjects the Frame shows (the most prominent first, the Text Model told to show at most three; none for a picture of the place alone) + the Frame's sentences + the Look's style ([ADR 0012](../adr/0012-storyboard-look-lists-each-person.md)). A Frame whose prompt crosses a Limit is saved **blocked** and can't be rendered until edited.

Once a Frame is written, the Look and Beats are fixed: **Restart** is the way back to them, deleting every Frame's sentences and pictures, cancelling its jobs and waiting for a render running to end. Each written Frame is then independent:

| Operation | What it does |
|---|---|
| **Render** | Renders the Frame through the shared queue; a re-render replaces its image. |
| **Edit by hand** | Replaces its seven sentences and who it shows. A rendered Frame is marked **stale** until re-rendered. Refused if it crosses a Limit. |
| **Edit by Action** | The Text Model rewrites the Frame's sentences and who it shows, from the Look as it is, after the same Limits check as a Chain; it gets the Look and the Frame, no Beats. An Action that would change the Look comes back unclear, pointing to Restart. |
| **Chain from here** | Makes a new Chain of the Frames up to that one, to carry on from it by Actions; the Storyboard stays as it is ([ADR 0018](../adr/0018-carry-on-in-a-new-session.md)). Done in code, with no Text Model call: each Image Prompt becomes a Chain's nine sentences by joining the identities of the people shown into one subject sentence, every word kept; each later Frame has its Beat as the Action; blocked Frames are left out; the pictures are copied with their upscales and 3D. |
