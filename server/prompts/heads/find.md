<!--
The head finder's question for one Subject of a Look, by its name and identity, to the Qwen3-VL in
Qwen-Image 2.1 (`server/heads/`): where its head is, for the face pass to repaint, and which way
it's turned, for the face pass to take the view of its sheet nearest that turn (ADR 0045).
One wording for a person, a creature or a thing, as a Look doesn't say which. The bench's, with
`facing` from its views test (docs/bench/reference-sheets/2026-11-25/).

Values: who (the Subject's identity, which starts with its name)
-->

Locate {{who}} in the picture: for a person or creature, the head only (the face and the hair, not the neck, shoulders or body); for a thing, all of it. Answer with JSON only: a list, one object per one found, each {"label": who it is, "bbox_2d": [x1, y1, x2, y2] in coordinates from 0 to 1000, "facing": which way it's turned as seen in the picture, one of "front", "three-quarter left", "profile left", "three-quarter right", "profile right"}.
