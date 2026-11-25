"""Reference sheets, stage 0b: two people alike, another Image Model before the face pass, other
sizes, faces turned away. Qwen-Image 2.1 int8 on the PC's ComfyUI; pictures come back as previews.
Usage: python3 -I b0.py <comfy address> <repo> . [part]"""
import sys, json, re, time, subprocess
src = open('stage0.py').read(); G = {'__name__': 'stage0'}
exec(compile(src[:src.index("STEP = ")], 'stage0.py', 'exec'), G)
render, submit, upload, log, run, get, post = G['render'], G['submit'], G['upload'], G['log'], G['run'], G['get'], G['post']
UNET, CLIP, VAE, CACHE, REPO = G['UNET'], G['CLIP'], G['VAE'], G['CACHE'], G['REPO']
KAEL, ELARA, STYLE, sheet_prompt = G['KAEL'], G['ELARA'], G['STYLE'], G['sheet_prompt']
DORAN = "Doran, a 38-year-old man with a lean build, olive skin, short dark brown hair, a short dark beard, and a narrow face with heavy brows and dark eyes."
MIRA = "Mira, a 24-year-old woman with a slender build, pale skin, long dark hair worn loose, and a heart-shaped face with large grey eyes."
PART = sys.argv[4] if len(sys.argv) > 4 else 'all'
def budget(w, h):
    r = w / h; x = (1024 * 1024 * r) ** 0.5; side = lambda n: max(32, round(n / 32) * 32)
    return side(x), side(x / r)
def edit(name, image, prompt, seed, mask, refs, size=(1024, 1024)):
    import os
    if os.path.exists(f'{name}.png'): return
    w = json.load(open(f'{REPO}/server/images/comfyui/workflows/qwen-image-2.1-edit.json')); w.pop('_note')
    fw, fh = budget(*size)
    vals = {'$unet': UNET, '$clip': CLIP, '$vae': VAE, '$image': upload(image), '$mask': upload(mask), '$prompt': prompt, '$seed': seed, '$steps': 25, '$width': size[0], '$height': size[1], '$fitWidth': fw, '$fitHeight': fh}
    fill = lambda x: {k: fill(v) for k, v in x.items()} if isinstance(x, dict) else [fill(v) for v in x] if isinstance(x, list) else vals.get(x, x) if isinstance(x, str) else x
    w = fill(w)
    for i, r in enumerate(refs, 2):
        w[f'p{i}'] = {'class_type': 'LoadImage', 'inputs': {'image': upload(r)}}
        w['conditioning']['inputs'][f'images.image_{i}'] = [f'p{i}', 0]
    w['cache'] = CACHE; w['sampler']['inputs']['model'] = ['cache', 0]
    w['save'] = {'class_type': 'PreviewImage', 'inputs': {'images': w['save']['inputs']['images']}}
    run(name, w)
def ask(image, question, n=400):
    w = {'clip': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': CLIP, 'type': 'qwen_image', 'device': 'default'}},
         'img': {'class_type': 'LoadImage', 'inputs': {'image': upload(image)}},
         'gen': {'class_type': 'TextGenerate', 'inputs': {'clip': ['clip', 0], 'prompt': question, 'max_length': n, 'sampling_mode': 'off', 'image': ['img', 0]}},
         'show': {'class_type': 'PreviewAny', 'inputs': {'source': ['gen', 0]}}}
    e, t = submit(w); text = e['outputs']['show']['text'][0]
    m = re.search(r'\[.*\]', text, re.S)
    try: heads = json.loads(m.group(0)) if m else []
    except Exception: heads = []
    log(f'ask {image} | {t:.1f} s | {json.dumps(heads)}')
    return heads, t
FACING = '"facing": which way the face is turned as seen in the picture, one of "front", "three-quarter left", "profile left", "three-quarter right", "profile right", "away" (only the back of the head shows)'
def find_named(image, people):
    names = '; '.join(people)
    return ask(image, f'The picture shows these people: {names}. Locate the head of each of them: the face and the hair only. '
               'Answer with JSON only: a list, one object per head, each {"label": the person\'s name, "bbox_2d": [x1, y1, x2, y2] in coordinates from 0 to 1000, ' + FACING + '}.')
def find_any(image):
    return ask(image, 'Locate the head of every person or creature in the picture: the face and the hair only, not the neck, shoulders or body. '
               'Answer with JSON only: a list, one object per head, each {"label": who it is, "bbox_2d": [x1, y1, x2, y2] in coordinates from 0 to 1000, ' + FACING + '}.')
def masks(name, boxes, size=(1024, 1024)):
    subprocess.run(['uv', 'run', '-q', '--with', 'pillow', 'python', '-c', f'''
from PIL import Image, ImageDraw, ImageFilter
W,H={size}; m = Image.new("L", (W, H), 0); d = ImageDraw.Draw(m)
for b in {boxes}:
    x1,y1,x2,y2 = b[0]*W/1000, b[1]*H/1000, b[2]*W/1000, b[3]*H/1000; px,py = (x2-x1)*0.2, (y2-y1)*0.2
    d.rectangle([max(0,x1-px),max(0,y1-py),min(W,x2+px),min(H,y2+py)], fill=255)
m.filter(ImageFilter.GaussianBlur(24)).convert("RGB").save("{name}.png")'''], check=True)
    return name
side = lambda b: (b[0] + b[2]) / 2

if PART in ('all', 'alike'):
    for who, look, noun in (('kael', KAEL, 'man'), ('doran', DORAN, 'man'), ('elara', ELARA, 'woman'), ('mira', MIRA, 'woman')):
        render(f'sheet-{who}', sheet_prompt(look, who.capitalize() if who != 'elara' else 'Elara Vance', noun), 3, 1536, 640)
    PAIRS = {
        'men': ([('Kael', KAEL, 'sheet-kael'), ('Doran', DORAN, 'sheet-doran')],
                f"{KAEL} {DORAN} Kael and Doran stand side by side at a tavern bar, Kael on the left and Doran on the right, seen from the waist up. {STYLE}",
                "Kael scowls at Doran, his jaw clenched; Doran laughs, his head tipped back."),
        'women': ([('Elara Vance', ELARA, 'sheet-elara'), ('Mira', MIRA, 'sheet-mira')],
                  f"{ELARA} {MIRA} Elara Vance and Mira sit side by side on a narrow bed in an attic room, Elara on the left and Mira on the right, seen from the waist up. {STYLE}",
                  "Elara Vance cries, tears running down her cheeks; Mira looks at her, worried, her brow furrowed."),
    }
    for key, (people, scene, expr) in PAIRS.items():
        for seed in (8, 9):
            pic = f'{key}-{seed}'
            render(pic, f'{scene.replace(STYLE, "")}{expr} {STYLE}', seed)
            heads, _ = find_named(pic, [f'{n}, {l.split(", ", 1)[1]}' for n, l, _ in people])
            byname = {p[0]: next((h for h in heads if p[0].split()[0].lower() in h['label'].lower()), None) for p in people}
            log(f'{pic} found: ' + json.dumps({k: (v and [v['bbox_2d'], v.get('facing')]) for k, v in byname.items()}))
            if not all(byname.values()): continue
            order = sorted(people, key=lambda p: side(byname[p[0]]['bbox_2d']))
            where = ' and '.join(f"the area on the {'left' if i == 0 else 'right'} is {p[0]}'s head" for i, p in enumerate(order))
            # One edit for both, the expression sentence quoted.
            one = (f"Two areas of image 1 are to be repainted: {where}. " + ' '.join(f"Repaint {p[0]}'s area with the face and hair of image {i}, {p[0]}." for i, p in enumerate(order, 2)) +
                   f" Both changes are needed. Keep their expressions exactly as in image 1 ({expr}), the way each head is turned, and everything else.")
            edit(f'{pic}-one', pic, one, seed + 1, masks(f'mask-{pic}', [byname[p[0]]['bbox_2d'] for p in order]), [p[2] for p in order])
            after, _ = find_any(f'{pic}-one'); log(f'count {pic}-one: {len(heads)} before, {len(after)} after')
            # An edit each, in turn.
            cur = pic
            for j, p in enumerate(order):
                b = byname[p[0]]['bbox_2d']
                each = (f"Give {p[0]}, the person in the marked area of image 1, the face and hair of the person in image 2. "
                        f"Keep {p[0]}'s expression exactly as in image 1 ({expr}), the way the head is turned, and everything else.")
                nxt = f'{pic}-each{j + 1}'
                edit(nxt, cur, each, seed + 1 + j, masks(f'mask-{pic}-{j}', [b]), [p[2]]); cur = nxt
            after, _ = find_any(cur); log(f'count {cur}: {len(heads)} before, {len(after)} after')

if PART in ('all', 'switch'):
    # Another Image Model, then the face pass, Frame after Frame: wall time of each step, loads included.
    kl = lambda n: G['pick'](G['files']('UNETLoader', 'unet_name'), r'^flux3_image_klein_sd_int8', r'^flux3_image_klein_sd_bf16')
    KUNET = kl(0); KCLIP = G['pick'](G['files']('CLIPLoader', 'clip_name'), r'^qwen3vl_4b_int8_convrot', r'^qwen3vl_4b_bf16'); KVAE = G['pick'](G['files']('VAELoader', 'vae_name'), r'^flux2-vae.*\.safetensors$')
    def klein(name, prompt, seed):
        base = json.load(open(f'{REPO}/server/images/comfyui/workflows/flux3-klein.json')); base.pop('_note')
        vals = {'$unet': KUNET, '$clip': KCLIP, '$vae': KVAE, '$prompt': prompt, '$seed': seed, '$steps': 16, '$cfg': 1, '$width': 1024, '$height': 1024}
        fill = lambda x: {k: fill(v) for k, v in x.items()} if isinstance(x, dict) else [fill(v) for v in x] if isinstance(x, list) else vals.get(x, x) if isinstance(x, str) else x
        w = fill(base); w['save'] = {'class_type': 'PreviewImage', 'inputs': {'images': w['save']['inputs']['images']}}
        run(name, w)
    render('sheet-kael', sheet_prompt(KAEL, 'Kael', 'man'), 3, 1536, 640)
    scene = lambda i: f"{KAEL} Kael at a rain-streaked window holding a guttering candle, solemn, from the chest up, in a dark tavern at night, moment {i}. {STYLE}"
    for model in ('klein', 'qwen'):
        t0 = time.time()
        for i in range(3):
            name = f'sw-{model}-{i}'
            t = time.time(); (klein if model == 'klein' else render)(name, scene(i), 20 + i); tr = time.time() - t
            heads, tf = find_any(name)
            t = time.time()
            if heads: edit(f'{name}-fp', name, "Give the man in image 1 the face and hair of the man in image 2, but keep him exactly as in image 1: his expression (solemn), the way his head is turned, and the light. Change nothing else.", 21 + i, masks(f'mask-{name}', [heads[0]['bbox_2d']]), ['sheet-kael'])
            tp = time.time() - t
            after, tc = find_any(f'{name}-fp')
            log(f'switch {model} frame {i}: render {tr:.0f} s, find {tf:.1f} s, face pass {tp:.0f} s, count {tc:.1f} s')
        log(f'switch {model}: three Frames in {time.time() - t0:.0f} s')

if PART in ('all', 'sizes'):
    render('sheet-elara', sheet_prompt(ELARA, 'Elara Vance', 'woman'), 3, 1536, 640)
    render('sheet-kael', sheet_prompt(KAEL, 'Kael', 'man'), 3, 1536, 640)
    for name, prompt, size, sheet, instr in (
        ('tall', f"{ELARA} Elara Vance stands in a small attic room by the window, crying, tears running down her cheeks, seen full length. {STYLE}", (832, 1216), 'sheet-elara',
         "Give the woman in image 1 the face and hair of the woman in image 2, but keep her exactly as in image 1: her expression (crying, tears running down her cheeks), the way her head is turned, and the light. Change nothing else."),
        ('wide', f"{KAEL} Kael sits alone at a long tavern table, solemn, a candle beside him, seen from across the room. {STYLE}", (1216, 832), 'sheet-kael',
         "Give the man in image 1 the face and hair of the man in image 2, but keep him exactly as in image 1: his expression (solemn), the way his head is turned, and the light. Change nothing else.")):
        render(name, prompt, 8, *size)
        heads, _ = find_any(name)
        if heads:
            edit(f'{name}-fp', name, instr, 9, masks(f'mask-{name}', [heads[0]['bbox_2d']], size), [sheet], size)
            after, _ = find_any(f'{name}-fp'); log(f'count {name}-fp: {len(heads)} before, {len(after)} after')

if PART in ('all', 'away'):
    for name, prompt in (('away-kael', f"{KAEL} Kael seen from behind, the back of his head and shoulders towards the viewer, as he looks out of a rain-streaked window, in a dark tavern at night. {STYLE}"),
                         ('away-elara', f"{ELARA} Elara Vance seen from behind, the back of her head towards the viewer, as she looks out of a small attic window in grey morning light. {STYLE}"),
                         ('away-turning', f"{KAEL} Kael seen from behind and a little to the side, glancing back over his shoulder, a sliver of his face showing, in a dark tavern at night. {STYLE}")):
        render(name, prompt, 8)
        find_any(name)
log(f'b0 {PART} done')
