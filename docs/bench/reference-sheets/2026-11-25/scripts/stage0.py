"""Reference sheets, stage 0 (docs/reference-sheets-plans.md): camera moves then the face pass, a
hard box against a softened one, and sheets for a creature and an object. Qwen-Image 2.1 on a
ComfyUI across the network; pictures come back as PreviewImage, so nothing is left in its output
folder. Usage: python3 -I stage0.py <comfy address> <repo> <out dir>"""
import json, re, sys, time, uuid, urllib.request, io, subprocess
ADDR, REPO, OUT = sys.argv[1].rstrip('/'), sys.argv[2], sys.argv[3]
def get(p):
    with urllib.request.urlopen(ADDR + p, timeout=120) as r: return r.read()
def post(p, body, ctype='application/json'):
    req = urllib.request.Request(ADDR + p, data=body, headers={'Content-Type': ctype})
    with urllib.request.urlopen(req, timeout=120) as r: return json.loads(r.read())
def files(node, field): return json.loads(get('/object_info/' + node))[node]['input']['required'][field][0]
def pick(names, *pats):
    for p in pats:
        for n in names:
            if re.search(p, n): return n
    raise SystemExit(f'none of {pats}')
UNET = pick(files('UNETLoader', 'unet_name'), r'^qwen_image_2\.1_int8', r'^qwen_image_2\.1_fp8')
CLIP = pick(files('CLIPLoader', 'clip_name'), r'qwen.*3.*vl.*8b')
VAE = pick(files('VAELoader', 'vae_name'), r'qwen_image_2\.1_vae')
def upload(name):
    b = uuid.uuid4().hex; data = open(f'{OUT}/{name}.png', 'rb').read()
    body = (f'--{b}\r\nContent-Disposition: form-data; name="image"; filename="lrs-bench-{name}.png"\r\nContent-Type: image/png\r\n\r\n').encode() + data + f'\r\n--{b}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--{b}--\r\n'.encode()
    return post('/upload/image', body, f'multipart/form-data; boundary={b}')['name']
def log(line): print(line, flush=True); open(f'{OUT}/results.txt', 'a').write(line + '\n')
def submit(w):
    t0 = time.time(); pid = post('/prompt', json.dumps({'prompt': w, 'client_id': 'lrs-bench'}).encode())['prompt_id']
    while pid not in (h := json.loads(get('/history/' + pid))): time.sleep(0.5)
    e = h[pid]
    if e['status'].get('status_str') != 'success':
        raise SystemExit('FAILED ' + json.dumps([m for m in e['status']['messages'] if m[0] == 'execution_error'])[:800])
    return e, time.time() - t0
def run(name, w):
    import os
    if os.path.exists(f'{OUT}/{name}.png'): return
    e, t = submit(w); img = e['outputs']['save']['images'][0]
    open(f'{OUT}/{name}.png', 'wb').write(get(f"/view?filename={img['filename']}&subfolder={img['subfolder']}&type={img['type']}"))
    log(f'{name}: {t:.0f} s')
CACHE = {'class_type': 'QwenImage21Cache', 'inputs': {'model': ['attention', 0], 'device': 'gpu', 'dtype': 'int8'}}
def base_nodes():
    return {'unet': {'class_type': 'UNETLoader', 'inputs': {'unet_name': UNET, 'weight_dtype': 'default'}},
            'attention': {'class_type': 'ModelAttentionBackend', 'inputs': {'model': ['unet', 0], 'attention': 'comfy kitchen attention'}},
            'clip': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': CLIP, 'type': 'qwen_image', 'device': 'default'}},
            'vae': {'class_type': 'VAELoader', 'inputs': {'vae_name': VAE}}, 'cache': CACHE}
def render(name, prompt, seed, w_=1024, h_=1024):
    w = base_nodes(); w.update({
        'text': {'class_type': 'TextEncodeQwenImage21', 'inputs': {'clip': ['clip', 0], 'prompt': prompt, 'negative_prompt': '', 'resolution': 1024}},
        'latent': {'class_type': 'EmptyLatentImage', 'inputs': {'width': w_, 'height': h_, 'batch_size': 1}},
        'sampler': {'class_type': 'KSampler', 'inputs': {'model': ['cache', 0], 'seed': seed, 'steps': 25, 'cfg': 1, 'sampler_name': 'euler', 'scheduler': 'simple', 'positive': ['text', 0], 'negative': ['text', 1], 'latent_image': ['latent', 0], 'denoise': 1}},
        'decode': {'class_type': 'VAEDecode', 'inputs': {'samples': ['sampler', 0], 'vae': ['vae', 0]}},
        'rgb': {'class_type': 'SplitImageWithAlpha', 'inputs': {'image': ['decode', 0]}},
        'save': {'class_type': 'PreviewImage', 'inputs': {'images': ['rgb', 0]}}})
    run(name, w)
def edit(name, image, prompt, seed, mask=None, refs=()):
    """The app's Qwen-Image 2.1 edit workflow; no mask repaints the whole picture, as comfyui.ts does."""
    import os
    if os.path.exists(f'{OUT}/{name}.png'): return
    w = json.load(open(f'{REPO}/server/images/comfyui/workflows/qwen-image-2.1-edit.json')); w.pop('_note')
    vals = {'$unet': UNET, '$clip': CLIP, '$vae': VAE, '$image': upload(image), '$mask': upload(mask) if mask else '', '$prompt': prompt, '$seed': seed, '$steps': 25, '$width': 1024, '$height': 1024, '$fitWidth': 1024, '$fitHeight': 1024}
    fill = lambda x: {k: fill(v) for k, v in x.items()} if isinstance(x, dict) else [fill(v) for v in x] if isinstance(x, list) else vals.get(x, x) if isinstance(x, str) else x
    w = fill(w)
    if not mask:
        w['save']['inputs']['images'] = w['composite']['inputs']['source']
        for n in ('mask', 'encode', 'masked', 'composite'): del w[n]
        w['sampler']['inputs']['latent_image'] = ['conditioning', 2]
    for i, r in enumerate(refs, 2):
        w[f'p{i}'] = {'class_type': 'LoadImage', 'inputs': {'image': upload(r)}}
        w['conditioning']['inputs'][f'images.image_{i}'] = [f'p{i}', 0]
    w.update({'cache': CACHE}); w['sampler']['inputs']['model'] = ['cache', 0]
    w['save'] = {'class_type': 'PreviewImage', 'inputs': {'images': w['save']['inputs']['images']}}
    run(name, w)
def find(image, who):
    """The head's box from the Qwen3-VL Qwen-Image 2.1 loads, in thousandths, or None."""
    ask = (f'Locate {who} in the picture. ' if who.startswith('the lantern') else f'Locate the head of {who} in the picture: the face and the hair only, not the neck, shoulders or body. ') + (
           'Answer with JSON only: a list, one object per head, each {"label": who it is, "bbox_2d": [x1, y1, x2, y2]} in coordinates from 0 to 1000.')
    w = {'clip': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': CLIP, 'type': 'qwen_image', 'device': 'default'}},
         'img': {'class_type': 'LoadImage', 'inputs': {'image': upload(image)}},
         'gen': {'class_type': 'TextGenerate', 'inputs': {'clip': ['clip', 0], 'prompt': ask, 'max_length': 300, 'sampling_mode': 'off', 'image': ['img', 0]}},
         'show': {'class_type': 'PreviewAny', 'inputs': {'source': ['gen', 0]}}}
    e, t = submit(w); text = e['outputs']['show']['text'][0]
    m = re.search(r'\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\]', text)
    box = json.loads(m.group(0)) if m else None
    log(f'find {image} | {who} | {t:.1f} s | {box} | {text.strip()[:160]}')
    return box
def mask(name, box, pad, feather):
    """A white area over the head on black: the box grown by `pad` of its size, its edge blurred by `feather` px."""
    subprocess.run(['uv', 'run', '-q', '--with', 'pillow', 'python', '-c', f'''
from PIL import Image, ImageDraw, ImageFilter
x1,y1,x2,y2=[v*1024/1000 for v in {box}]; px,py=(x2-x1)*{pad},(y2-y1)*{pad}
m=Image.new("L",(1024,1024),0); ImageDraw.Draw(m).rectangle([max(0,x1-px),max(0,y1-py),min(1024,x2+px),min(1024,y2+py)],fill=255)
if {feather}: m=m.filter(ImageFilter.GaussianBlur({feather}))
m.convert("RGB").save("{OUT}/{name}.png")'''], check=True)
    return name

KAEL = "Kael, a 42-year-old man with a lean, rigid build, weathered tanned skin marked by old scars, short unkempt brown hair, and a scarred, angular face with tired, piercing eyes."
ELARA = "Elara Vance, a 20-year-old woman with a slender build, pale skin flushed by the cold, dark hair pulled back neatly, and a face with sharp, intelligent features and focused, calculating eyes."
GRAX = "Grax, a hulking troll with mossy grey-green skin, small deep-set yellow eyes, a broad flat nose, two chipped tusks jutting from his lower jaw, and a tangle of coarse black hair."
LANTERN = "the Lantern of Vael, an ornate brass lantern with a domed cap, a ring handle, and panes of green glass etched with spiralling vines."
STYLE = "A moody, cinematic oil painting with heavy, visible brushstrokes, utilizing a chiaroscuro lighting scheme with deep shadows and warm, flickering amber highlights to evoke a gritty, 18th-century atmospheric realism."
def sheet_prompt(look, name, noun, what='head-and-shoulders views'):
    return f"{look} A character turnaround sheet of {name}: three {what} of the same {noun} side by side, evenly spaced, on a plain dark grey backdrop, from left to right: facing the viewer, in a three-quarter turn to the left, and in profile facing left. The same in each, each clearly and evenly lit. {STYLE}"
KEEP = 'Keep everything else exactly as in the image.'
def face_pass(name, scene, who, noun, sheet, seed, pad, feather):
    box = find(scene, who)
    if not box: log(f'{name}: no head found'); return
    m = mask(f'mask-{name}', box, pad, feather)
    prompt = f"Give the {noun} in image 1 the face and hair of the {noun} in image 2, but keep {('him' if noun in ('man', 'troll') else 'her')} exactly as in image 1: the same expression, the same way the head is turned, and the same light. Change nothing else."
    edit(name, scene, prompt, seed, mask=m, refs=[sheet])

STEP = sys.argv[4] if len(sys.argv) > 4 else 'all'
render('sheet-kael', sheet_prompt(KAEL, 'Kael', 'man'), 3, 1536, 640)
render('sheet-elara', sheet_prompt(ELARA, 'Elara Vance', 'woman'), 3, 1536, 640)
render('kael', f"{KAEL} Kael seen in profile, facing left, half his face in deep shadow, as he stands at a rain-streaked window holding a guttering candle, from the chest up, in a dark tavern at night. {STYLE}", 8)
render('elara', f"{ELARA} Elara Vance sits on a narrow bed in a small attic room, crying, tears running down her cheeks, her face crumpled with grief, a crumpled letter in her lap, seen from the waist up in grey morning light from a small window. {STYLE}", 8)
# Camera moves (web/src/cameraMoves.ts), each then the face pass, with a hard box and a softened one.
MOVES = {'low': f'Move the camera down near the floor, looking up at them: a low angle. {KEEP}',
         'high': f'Move the camera up near the ceiling, looking down at them: a high angle. {KEEP}'}
for scene, who, noun, sheet in (('kael', 'the man', 'man', 'sheet-kael'), ('elara', 'the woman', 'woman', 'sheet-elara')):
    for mv, instr in MOVES.items():
        edit(f'{scene}-{mv}', scene, instr, 9)
    edit(f'{scene}-face', scene, f"A close-up of the {noun}'s face, filling the picture, in the same place and light.", 9)
    for v in (scene, f'{scene}-low', f'{scene}-high', f'{scene}-face'):
        face_pass(f'{v}-fp-hard', v, who, noun, sheet, 10, 0.08, 0)
        face_pass(f'{v}-fp-soft', v, who, noun, sheet, 10, 0.2, 24)
# A creature and an object.
render('sheet-grax', sheet_prompt(GRAX, 'Grax', 'troll'), 3, 1536, 640)
render('grax', f"{GRAX} Grax sits hunched at a tavern table, a tankard in his huge hand, turned three-quarters to the left and laughing, lit by the hearth, from the chest up. {STYLE}", 8)
face_pass('grax-fp-soft', 'grax', 'the troll', 'troll', 'sheet-grax', 10, 0.2, 24)
render('sheet-lantern', f"{LANTERN} A turnaround sheet of the Lantern of Vael: three views of the same lantern side by side, evenly spaced, on a plain dark grey backdrop, from the front, at a three-quarter turn and from the side. The same lantern in each, each clearly and evenly lit. {STYLE}", 3, 1536, 640)
render('lantern', f"{LANTERN} The Lantern of Vael hangs from a hook over a tavern table, its green glass glowing, with Kael's hand reaching for it, at night. {STYLE}", 8)
box = find('lantern', 'the lantern')
if box:
    edit('lantern-fp-soft', 'lantern', 'Make the lantern in image 1 exactly the lantern in image 2: its shape, its brass and its etched green glass, at the same size and angle and in the same light. Change nothing else.', 10, mask=mask('mask-lantern', box, 0.2, 24), refs=['sheet-lantern'])
log('done')
