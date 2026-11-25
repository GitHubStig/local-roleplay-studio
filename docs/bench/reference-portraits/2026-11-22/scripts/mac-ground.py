"""Ask mflux's built-in Qwen3-VL (Qwen-Image 2.1's text encoder) for head boxes, without making any picture."""
import sys, time, json, re
from PIL import Image
from mflux.models.common.resolution.config_resolution import ConfigResolution
from mflux.models.qwen21.variants.edit.qwen_image_21_edit import QwenImage21Edit
from mflux.models.qwen21.model.qwen21_text_encoder.grounding import QwenImage21Grounding
P = sys.argv[1]
# The app's copy (server/images/mflux/models.ts): the short name would fetch Qwen's own repo, 31 GB more.
REPO = 'mflux-community/qwen-image-2-1-mflux-bf16'
t0 = time.time()
cfg = ConfigResolution.resolve_restricted(None, 'qwen-image-2.1', model_path=REPO, extra_keys=('qwen-image-2.1-turbo',), base_model=None)
model = QwenImage21Edit(quantize=None, model_path=REPO, model_config=cfg)
print(f'loaded in {time.time()-t0:.0f} s', flush=True)
LIST = ('Locate the head of every person in the picture: the face and the hair only, not the neck, shoulders or body. '
        'Answer with JSON only: a list, one object per person, each {"label": who they are (for example "man on the left"), "bbox_2d": [x1, y1, x2, y2]} in coordinates from 0 to 1000.')
PICS = {'sc-cry-plain-8': ["the woman's head: her face and hair"], 'sc-cry-plain-9': ["the woman's head: her face and hair"],
        'sc-profile-plain-8': ["the man's head: his face and hair"],
        'sc-far-plain-8': ["the head of the man on the left: his face and hair", "the head of the woman on the right: her face and hair"],
        'sc-far-plain-9': ["the head of the man on the left: his face and hair", "the head of the woman on the right: her face and hair"],
        'plain-9': ["the head of the man on the left: his face and hair", "the head of the woman on the right: her face and hair"]}
out = {}
for name, queries in PICS.items():
    img = Image.open(f'{P}/{name}.png').convert('RGBA')
    one = []
    for q in queries:
        t = time.time(); r = model._vision_reply(QwenImage21Grounding.GROUNDING_PROMPT.format(query=q), [img], 64)
        b = QwenImage21Grounding.parse_bbox(r); one.append([round(v * 1000) for v in b] if b else None)
        print(f'{name} | {q} | {time.time()-t:.1f} s | {r.strip()[:120]}', flush=True)
    t = time.time(); r = model._vision_reply(LIST, [img], 300)
    print(f'{name} | list | {time.time()-t:.1f} s | {r.strip()[:300]}', flush=True)
    out[name] = {'one': one, 'list': r}
json.dump(out, open(f'{P}/../refs-mac/ground.json', 'w'))
