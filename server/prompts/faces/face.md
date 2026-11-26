<!--
The face pass's instruction to its edit model (Qwen-Image 2.1 Edit), one edit per Subject a
picture shows with a reference sheet (`server/faces/`, ADR 0045), after a
render or after an edit of the whole picture (a camera move; an edit of a painted area is told
`face-edited.md`): image 1 is the picture, its painted area that Subject's head (the box grown by a
fifth, its edge softened), and image 2 the view of the Subject's sheet nearest the head's turn. The words
are the 2026-11-25 bench's for an edit each (docs/bench/reference-sheets/2026-11-25/scripts/b0.py,
"an edit each kept the scowl"), with "and tilted" from its steep angles (seed2.py), and the
expression named, as "the same expression" alone lost it (stage 0).

Values: name (the Subject's name in the Look), expression (the Frame's expression sentence, whole,
for everyone it shows)
-->

Give {{name}}, the one in the marked area of image 1, the face and hair of the one in image 2. Keep {{name}}'s expression exactly as in image 1 ({{expression}}), the way the head is turned and tilted, and everything else.
