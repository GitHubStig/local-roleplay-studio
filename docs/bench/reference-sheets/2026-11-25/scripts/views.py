"""The face pass with one view of the sheet, the one nearest each head's angle (Qwen3-VL says which)."""
import sys, json, re, subprocess
src = open('stage0.py').read(); g = {'__name__': 'stage0'}
exec(compile(src[:src.index("STEP = ")], 'stage0.py', 'exec'), g)
submit, upload, edit, log, CLIP = g['submit'], g['upload'], g['edit'], g['log'], g['CLIP']
VIEWS = {'front': 0, 'three-quarter left': 1, 'profile left': 2, 'three-quarter right': 1, 'profile right': 2}
# Each sheet cut into its thirds, and mirrored for heads facing right.
for s in ('sheet-kael', 'sheet-elara', 'sheet-grax'):
    subprocess.run(['uv', 'run', '-q', '--with', 'pillow', 'python', '-c', f'''
from PIL import Image, ImageOps
im = Image.open("{s}.png")
for i in range(3):
    v = im.crop((i*512, 0, i*512+512, 640)); v.save(f"{s}-v{{i}}.png"); ImageOps.mirror(v).save(f"{s}-v{{i}}m.png")'''], check=True)
def find_angles(image, who):
    ask = (f'Locate the head of {who} in the picture: the face and the hair only, not the neck, shoulders or body. '
           'Answer with JSON only: a list, one object per head, each {"label": who it is, "bbox_2d": [x1, y1, x2, y2] in coordinates from 0 to 1000, '
           '"facing": which way the face is turned as seen in the picture, one of "front", "three-quarter left", "profile left", "three-quarter right", "profile right"}.')
    w = {'clip': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': CLIP, 'type': 'qwen_image', 'device': 'default'}},
         'img': {'class_type': 'LoadImage', 'inputs': {'image': upload(image)}},
         'gen': {'class_type': 'TextGenerate', 'inputs': {'clip': ['clip', 0], 'prompt': ask, 'max_length': 300, 'sampling_mode': 'off', 'image': ['img', 0]}},
         'show': {'class_type': 'PreviewAny', 'inputs': {'source': ['gen', 0]}}}
    e, t = submit(w); text = e['outputs']['show']['text'][0]
    heads = json.loads(re.search(r'\[.*\]', text, re.S).group(0))
    log(f'angles {image} | {t:.1f} s | ' + json.dumps(heads))
    return heads
def view_of(sheet, facing):
    i = VIEWS.get(facing, 0)
    return f'{sheet}-v{i}{"m" if "right" in facing else ""}'
def masks(name, boxes):
    subprocess.run(['uv', 'run', '-q', '--with', 'pillow', 'python', '-c', f'''
from PIL import Image, ImageDraw, ImageFilter
m = Image.new("L", (1024, 1024), 0); d = ImageDraw.Draw(m)
for b in {boxes}:
    x1,y1,x2,y2 = [v*1024/1000 for v in b]; px,py = (x2-x1)*0.2, (y2-y1)*0.2
    d.rectangle([max(0,x1-px),max(0,y1-py),min(1024,x2+px),min(1024,y2+py)], fill=255)
m.filter(ImageFilter.GaussianBlur(24)).convert("RGB").save("{name}.png")'''], check=True)
    return name
ONE = {'man': ('him', 'his'), 'woman': ('her', 'her'), 'troll': ('him', 'his')}
EXPR = {'kael': 'solemn and still, gazing out of the window', 'elara': 'crying, tears running down her cheeks, her face crumpled with grief', 'grax': 'laughing, his mouth open'}
for pic, who, noun, sheet, key in [(p, 'the man', 'man', 'sheet-kael', 'kael') for p in ('kael', 'kael-low', 'kael-high', 'kael-face')] + \
        [(p, 'the woman', 'woman', 'sheet-elara', 'elara') for p in ('elara', 'elara-low', 'elara-high', 'elara-face')] + [('grax', 'the troll', 'troll', 'sheet-grax', 'grax')]:
    h = find_angles(pic, who)[0]
    view = view_of(sheet, h.get('facing', 'front'))
    obj, pos = ONE[noun]
    prompt = (f"Give the {noun} in image 1 the face and hair of the {noun} in image 2, but keep {obj} exactly as in image 1: "
              f"{pos} expression ({EXPR[key]}), the way {pos} head is turned, and the light. Change nothing else.")
    edit(f'{pic}-fp-view', pic, prompt, 10, mask=masks(f'mask-{pic}-view', [h['bbox_2d']]), refs=[view])
    log(f'{pic}-fp-view used {view}')
# Two people, one edit, a view each.
hs = find_angles('quay', 'each person')
man = next(h for h in hs if 'woman' not in h['label'].lower()); woman = next(h for h in hs if 'woman' in h['label'].lower())
km, ew = view_of('sheet-kael', man.get('facing', 'front')), view_of('sheet-elara', woman.get('facing', 'front'))
prompt = ("Two areas of image 1 are to be repainted: the left one is the man's head, the right one is the woman's head. "
          "Repaint the left area with the face and hair of the man in image 2, Kael. Repaint the right area with the face and hair of the woman in image 3, Elara Vance. "
          "Both changes are needed. Keep their expressions, calm and watchful, the way each of them faces, and everything else exactly as in image 1.")
edit('quay-fp-view', 'quay', prompt, 10, mask=masks('mask-quay-view', [man['bbox_2d'], woman['bbox_2d']]), refs=[km, ew])
log(f'quay-fp-view used {km}, {ew}')
log('views done')
