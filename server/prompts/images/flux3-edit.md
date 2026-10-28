<!--
FLUX.3 Klein's edit prompt, on ComfyUI, for an edit with a painted area (server/images/comfyui/comfyui.ts).
FLUX.3 sees the picture as <ref_image_0> and is told where to paint by boxes: each painted area is
one (<obj_1>, <obj_2>…), in the layout table that ends the prompt, as ComfyUI's Flux3LayoutPrompt
writes it. Without them it paints the change wherever it likes, and the mask cuts it off
(docs/research/image-models.md, 2026-10-26).

Values: areas ("<obj_1>", or "<obj_1> and <obj_2>"), instruction (as typed), layout (the table, JSON)
-->

In <ref_image_0>, repaint {{areas}}: {{instruction}} Keep everything else unchanged. {{layout}}
