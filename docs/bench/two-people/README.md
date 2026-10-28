# Two people in a Storyboard Frame (2026-10-16, Windows PC)

The test behind the each-person wording in [ADR 0012](../../adr/0012-storyboard-look-lists-each-person.md) ("Each sentence about every person shown"), first an open thread, "One Image Prompt shape for one to three people". With two people in a Storyboard Frame, its sentences were
written as if for one subject ("Kael looks at her with suspicion; the traveller looks at him…"),
and an Image Model could swap who did what. Three ways of writing a plan, each planned twice from
the public tavern scenario and its two-person Frames rendered on two Image Models:

- **today**: the Storyboard's plan prompt as it was (`server/prompts/storyboard/plan.md` before
  this test).
- **wording**: the same shape, with the Roleplay Art Agent's wording for the seven aspects (each
  about every person shown), anyone not in the picture left out, clothing carried from Frame to
  Frame, and at most 40 words a sentence. Now the Storyboard's plan and edit prompts
  (`server/prompts/shared/each-person.md`).
- **people**: a new shape (`people-plan.md`): a block per person shown (their identity, then where
  they are, pose, expression and clothing, naming them by a visual handle such as "the scarred
  man", not their name), one sentence for what they do to each other, then the camera,
  environment, lighting, color and style.

## What was run

Windows PC (RTX 4070 12 GB), Ollama with Gemma 4 12B Heretic (`hf.co/igorls/gemma-4-12B-it-heretic-GGUF:Q4_K_M`,
Thinking off), ComfyUI 0.41.1. Six Frames per plan, plan seeds 1 and 2, the Text Model unloaded
before rendering. The first two two-person Frames of each plan, at 1216×832, render seed 42, on
Qwen-Image 2.1 (25 steps, ~21 s each) and FLUX.3 Klein (16 steps, ~10.5 s each).

    deno run -A docs/bench/two-people/run.ts plan <today|wording|people> <seed>
    deno run -A docs/bench/two-people/run.ts render
    <ComfyUI's venv python> -I docs/bench/two-people/grid.py

`prompts/`: each plan, with every Frame's Image Prompt. `grids/`: a sheet per shape, a row per
Frame, Qwen-Image 2.1 on the left, FLUX.3 Klein on the right. `out/` (the full-size renders) isn't
committed.

## What it showed

| Shape | Plan time | Two-person Frames rendered | Qwen-Image 2.1 | FLUX.3 Klein |
|---|---|---|---|---|
| today | 30 s (118 s with the model's load) | 4 | 2 wrong: who's where swapped (Kael in the doorway, her inside; 1-f2), an extra person in the doorway (2-f5) | all right |
| wording | 30–31 s | 3 | all right (her hand on the door, the letter and the mug where the prompt put them) | all right |
| people | 38–40 s | 4 | all right, left and right as asked every time | all right |

- **The wording alone fixed what went wrong**, on this sample: no swap and no extra person on
  either model. It costs nothing (the same shape, the same plan time) and touches nothing else, so
  it's now the Storyboard's.
- **The per-person shape did as well, not better**, and gave the most control (left and right
  followed in every picture), but the 12B cut corners with it: clothing sentences as bare noun
  phrases without the handle, a name written as "Kael, the scarred man" (so it didn't match the
  Look's, and the bench dropped his identity until it matched by name or handle), a name the Brief
  didn't give ("Elara"), and a handle the same as the name ("the young woman"). Not worth the
  change to every part of the app on this evidence.
- FLUX.3 Klein got all eleven right, and puts Kael's scars on his arms and shirt as well as his
  face in every shape (seen before, research/image-models.md).

## The Chain (the same day)

A Chain's whole state is one paragraph, rewritten each Action (ADR 0005), and its subject sentence
was described for one person. The tavern Opening, then seven Actions: Kael slides her the letter;
she reads it while he leans in; she steps out into the rain; a close-up of him pouring a drink; she
comes back soaked and sits across from him; a hooded stranger appears on the balcony; Kael points a
knife up at him while she ducks (`ACTIONS` in run.ts). Three versions of the Chain's prompt, seeds
1 and 2, and seed 1's Frames with two or three people (the Opening, 2, 3, 6, 7, 8) rendered as
above:

    deno run -A docs/bench/two-people/run.ts chain <today|each|remember> <seed>
    deno run -A docs/bench/two-people/run.ts render chain-today-1

- **today**: `server/prompts/chain/frame.md` as it was.
- **each**: the subject sentence describes each person in the picture, one after another; the
  other sentences use the shared each-person wording; an Action that brings someone in or takes
  them out adds or removes them in every sentence.
- **remember**: as `each`, plus the subject sentences of earlier Frames unlike the current one,
  the latest three, sent after the Action, and someone brought back is described as the latest of
  them that has them, word for word. (Since replaced: see the long Chain below.)

| Version | Who's missing | The traveller's look | Otherwise |
|---|---|---|---|
| today | her, from the Opening and Frame 2 (both seeds' subject sentence is Kael's alone, every Frame) | a generic woman when she's drawn, never described | Frame 4 moved Kael outside when she left; in 6 and 7 he's still pouring |
| each | no one | back from the rain blonde (seed 1) or "Elara, 30, athletic, long damp hair" (seed 2): her description left with her | the stranger on the balcony, Kael's knife up |
| remember | no one | the Opening's, word for word, back in Frame 6 (both seeds) | FLUX.3 Klein put the stranger on the floor beside her, not up on the balcony (7, 8) |

Each version took 46–60 s for its eight calls.

## A long Chain (the same day)

Twenty-five Actions with four people coming and going (`LONG_ACTIONS` in run.ts): the traveller
leaves; Mira the barmaid comes down and a hooded stranger comes in; Mira goes; the stranger lowers
his hood (a grey beard, a missing eye); the traveller comes back, five changes of who's in the
picture after she left; the stranger storms out; Mira comes and goes again; Kael leaves her alone
and comes back; the stranger bursts back in and flees. Text only, three seeds, each person's part
of the subject sentence compared with their last appearance (about 3 minutes a run):

    deno run -A docs/bench/two-people/run.ts long <seed>

- **The latest three subject sentences** (`remember` above) weren't enough: the traveller came
  back after five, wasn't among them, and the 12B left her out for the rest of the Chain, giving
  "she" to Mira (Mira alone at the bar when Kael left "her" there) and bringing the stranger back
  when told "Kael and the traveller lean over the letter".
- **Everyone away instead** (`peopleAway`, `chain/away.md`): each person pictured before but not
  now, as their part of the last subject sentence that had them, one line each. The subject
  sentence is now "Kael is …; the traveller is …", so the engine can tell its people apart. With
  it, once the subject sentence was read to its first full stop (the 12B started later sentences
  in lower case, which ran the whole paragraph together) and the list said to bring back only whom
  the Action brings in (one seed had swapped the stranger for the listed traveller), every return
  in all three seeds was word for word: the traveller, Mira, and the unhooded stranger.
- **Then:** when the traveller came back while the stranger was there, the 12B dropped him for one
  to three Frames in all three seeds (in one, Kael then argued with her, not him), though the
  prompt says everyone else stays; and once it ran the whole paragraph into one sentence of
  semicolons from Frame 22 on.
- **Names.** Told to call an unnamed person what the story calls them ("the woman is …"), a
  one-person Chain (below) stopped making up names, but "the woman" can't tell two women apart,
  in the sentences or in the list of who's away. So someone unnamed gets a short first name,
  followed by what the story calls them, as Actions will ("Silas, the hooded stranger, is …"):
  given only a name, the 12B lost the link to "the stranger" in Actions and brought back Mira, or
  a new "Elara", when he burst back in. With the name and what he's called, and a line that only
  the subject sentence joins people with semicolons, two seeds kept the stranger when the
  traveller came back, kept nine sentences throughout, and brought Silas back word for word.
- **Left** (that last version, seeds 2 and 3): Mira stayed three Frames after going out to the
  kitchen (one seed); Kael left in the picture when he goes to bolt the back door (one seed,
  arguable in a wide shot); "unkempt" misspelt once in Kael's description, then copied. A Chain's
  next Action, or an edit of its Image Prompt, fixes any of these, so they were left there.

## One person (the same day)

To check the wording for several people didn't break a Chain of one: an unnamed subject ("a woman
with long red hair reads a book in a sunlit café") and eight ordinary edits (`SOLO_ACTIONS`: a
smile, night, a watercolour, a coat, a close-up, short black hair, a rainy street, 1980s anime),
two seeds each, against the Chain's prompt before the day's work:

    deno run -A docs/bench/two-people/run.ts solo <label> <seed>

Both kept nine sentences, her description word for word until the hair changed (then only the
hair), and both changes of style rewrote the light and color sentences. The one difference: the
new prompt names her ("Elena is …", "Elara is …"), as above.

## Not checked

The Mac's 26B on the same plans and Chains; more seeds or three people in a Storyboard.
