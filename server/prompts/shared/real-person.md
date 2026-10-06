<!--
The narrow question asked when an Action (or a Brief) looks like it names someone (ADR 0002): a
single call, Thinking off, answered as {"realPerson": true or false}. Only asked when
mightNameAPerson (server/textModel.ts) finds a capitalised full name or talk of resembling
someone.

Values: action
-->

Does this image-editing instruction ask to SHOW a real, identifiable person in the image: a celebrity, public figure or named real individual, or someone made to look like one? Naming an artist, art movement or style to imitate ("in the style of Michelangelo") does not count, nor do fictional characters, generic descriptions or places. Answer in JSON.

Instruction: {{action}}
