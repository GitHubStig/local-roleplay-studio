"""The head count on mflux: its own Qwen3-VL (Qwen-Image 2.1's text encoder) asked for every head,
before and after each face pass made on the PC; no picture is made."""
import sys, time, json, re
from PIL import Image
from mflux.models.common.resolution.config_resolution import ConfigResolution
from mflux.models.qwen21.variants.edit.qwen_image_21_edit import QwenImage21Edit
# The app's copy (server/images/mflux/models.ts): the short name would fetch Qwen's own repo, 31 GB more.
REPO = 'mflux-community/qwen-image-2-1-mflux-bf16'
t0 = time.time()
cfg = ConfigResolution.resolve_restricted(None, 'qwen-image-2.1', model_path=REPO, extra_keys=('qwen-image-2.1-turbo',), base_model=None)
model = QwenImage21Edit(quantize=None, model_path=REPO, model_config=cfg)
print(f'loaded in {time.time()-t0:.0f} s', flush=True)
ASK = ('Locate the head of every person or creature in the picture: the face and the hair only, not the neck, shoulders or body. '
       'Answer with JSON only: a list, one object per head, each {"label": who it is, "bbox_2d": [x1, y1, x2, y2]} in coordinates from 0 to 1000.')
PAIRS = [('kael', 'kael-fp-soft'), ('kael-low', 'kael-low-fp-soft'), ('kael-high', 'kael-high-fp-soft'), ('kael-face', 'kael-face-fp-soft'),
         ('elara', 'elara-fp-named'), ('elara-low', 'elara-low-fp-soft'), ('elara-high', 'elara-high-fp-named'), ('elara-face', 'elara-face-fp-soft'),
         ('grax', 'grax-fp-soft'), ('quay', 'quay-fp-view'), ('kael-above', 'kael-above-fp'), ('kael-below', 'kael-below-fp'),
         ('elara-above', 'elara-above-fp'), ('elara-below', 'elara-below-fp')]
def heads(name):
    img = Image.open(f'{name}.png').convert('RGBA')
    t = time.time(); r = model._vision_reply(ASK, [img], 300); t = time.time() - t
    m = re.search(r'\[.*\]', r, re.S)
    try: hs = json.loads(m.group(0)) if m else []
    except Exception: hs = []
    return hs, t, r.strip()
times = []
for before, after in PAIRS:
    b, tb, _ = heads(before); a, ta, ra = heads(after); times += [tb, ta]
    flag = '  <-- redo' if len(a) > len(b) else ''
    print(f'{after}: {len(b)} before ({tb:.1f} s), {len(a)} after ({ta:.1f} s){flag}  {[h.get("label") for h in a]}', flush=True)
print(f'each look: {min(times):.1f}-{max(times):.1f} s', flush=True)
