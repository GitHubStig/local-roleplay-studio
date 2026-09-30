<!--
The Suggest call's user message (see suggest.md). The story leaves out the Character's thoughts,
as the Persona can't know them.

Values: character.name, character.appearance, persona (a YAML block), persona.name, setting (a
YAML block), story, examples, length (how long the player's messages usually are), draft
-->

# {{persona.name}}, played by the player

{{persona}}

# {{character.name}}, as {{persona.name}} sees them

{{character.appearance}}

# Where the scene started

{{setting}}

# The story so far

{{story}}

# The player's earlier messages, for their style

{{examples}}

Their messages usually run to {{length}}.

# The player's notes for this message

{{draft}}

If the notes above aren't "none", write the message from them: keep what the player meant, in
their style, and add only what makes it a whole message. Otherwise, write the message the player
would most likely send next.

Write {{persona.name}}'s next message.
