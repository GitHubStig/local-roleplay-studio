<!--
Looking over a reference sheet before the face pass uses it (`lookOver`, `server/heads/heads.ts`),
to the Qwen3-VL in Qwen-Image 2.1: how many times the sheet shows its Subject, and which way each is
turned, for `sheetFlaw` to check it has three, from the front, at a three-quarter turn and in
profile. The bench's words (docs/bench/reference-sheets/2026-11-26/check/), which read every clean
sheet's turns in order and flagged a sheet's views out of order, two alike, and four lanterns; the
face pass's own question (`find.md`) answered only the sheet's thirds there, and one on Krea 2's.

Values: who (the Subject's identity, which starts with its name), name
-->

This picture is meant to show {{who}} several times side by side. Count every time {{name}} is shown, then answer with JSON only: a list, left to right, one object per time {{name}} is shown, each {"bbox_2d": [x1, y1, x2, y2] in coordinates from 0 to 1000 tightly around that one alone, "facing": which way it's turned as seen in the picture, one of "front", "three-quarter left", "profile left", "three-quarter right", "profile right"}.
