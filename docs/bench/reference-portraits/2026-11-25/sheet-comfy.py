"""A character sheet as the reference in Qwen-Image 2.1's face edit, on a ComfyUI across the network.
Pictures come back as PreviewImage (ComfyUI's temp folder), so nothing is left in its output folder.
Usage: python3 -I sheet-comfy.py <comfy address> <repo> <out dir> <step> [args], from the out dir,
which holds the Mac run's scenes and portraits (run-mac.sh); each step's arguments are beside it below."""
import json, re, sys, time, uuid, urllib.request
ADDR, REPO, OUT, STEP = sys.argv[1].rstrip('/'), sys.argv[2], sys.argv[3], sys.argv[4]
def get(p):
    with urllib.request.urlopen(ADDR + p, timeout=60) as r: return r.read()
def post(p, body, ctype='application/json'):
    req = urllib.request.Request(ADDR + p, data=body, headers={'Content-Type': ctype})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())
def files(node, field): return json.loads(get('/object_info/' + node))[node]['input']['required'][field][0]
def pick(names, *pats):
    for p in pats:
        for n in names:
            if re.search(p, n): return n
    raise SystemExit(f'none of {pats}')
UNET = pick(files('UNETLoader', 'unet_name'), r'^qwen_image_2\.1_int8', r'^qwen_image_2\.1_fp8')
CLIP = pick(files('CLIPLoader', 'clip_name'), r'qwen.*3.*vl.*8b')
VAE = pick(files('VAELoader', 'vae_name'), r'qwen_image_2\.1_vae')
def upload(path, name):
    b = uuid.uuid4().hex; data = open(path, 'rb').read()
    body = (f'--{b}\r\nContent-Disposition: form-data; name="image"; filename="{name}"\r\nContent-Type: image/png\r\n\r\n').encode() + data + f'\r\n--{b}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--{b}--\r\n'.encode()
    return post('/upload/image', body, f'multipart/form-data; boundary={b}')['name']
CACHE = {'class_type': 'QwenImage21Cache', 'inputs': {'model': ['attention', 0], 'device': 'gpu', 'dtype': 'int8'}}
def run(name, w):
    t0 = time.time(); pid = post('/prompt', json.dumps({'prompt': w, 'client_id': 'lrs-bench'}).encode())['prompt_id']
    while pid not in (h := json.loads(get('/history/' + pid))): time.sleep(0.5)
    e = h[pid]
    if e['status'].get('status_str') != 'success':
        print(name, 'FAILED', json.dumps([m for m in e['status']['messages'] if m[0] == 'execution_error'])[:800], flush=True); return
    img = e['outputs']['save']['images'][0]
    q = f"/view?filename={img['filename']}&subfolder={img['subfolder']}&type={img['type']}"
    open(f'{OUT}/{name}.png', 'wb').write(get(q))
    line = f'{name}: {time.time()-t0:.0f} s'; print(line, flush=True); open(f'{OUT}/results.txt', 'a').write(line + '\n')
KAEL = "Kael, a 42-year-old man with a lean, rigid build, weathered tanned skin marked by old scars, short unkempt brown hair, and a scarred, angular face with tired, piercing eyes."
STYLE = "A moody, cinematic oil painting with heavy, visible brushstrokes, utilizing a chiaroscuro lighting scheme with deep shadows and warm, flickering amber highlights to evoke a gritty, 18th-century atmospheric realism."
ELARA = "Elara Vance, a 20-year-old woman with a slender build, pale skin flushed by the cold, dark hair pulled back neatly, and a face with sharp, intelligent features and focused, calculating eyes."
EL = "Give the woman in image 1 the face and hair of the woman in image 2, Elara Vance, but keep her expression exactly as it is in image 1: crying, tears running down her cheeks, her face crumpled with grief. Change nothing else."
KA = "Give the man in image 1 the face and hair of the man in image 2, Kael, but keep him exactly as he is in image 1: seen in profile facing left, half his face in shadow, lit by the candle. Change nothing else."
CRY = f"{ELARA} Elara Vance sits on a narrow bed in a small attic room, crying, tears running down her cheeks, her face crumpled with grief, a crumpled letter in her lap, seen from the waist up in grey morning light from a small window. {STYLE}"
PROFILE = f"{KAEL} Kael seen in profile, facing left, half his face in deep shadow, as he stands at a rain-streaked window holding a guttering candle, from the chest up, in a dark tavern at night. {STYLE}"
if STEP == 'onepass':
    # onepass <kael|elara> <seed> <name> [ref.png]: the scene rendered with the reference passed in.
    who, seed, name, refs = sys.argv[5], int(sys.argv[6]), sys.argv[7], sys.argv[8:]
    scene = PROFILE if who == 'kael' else CRY
    lead = ("Image 1 is Kael. Keep his face, hair and build exactly as in image 1. " if who == 'kael' else "Image 1 is Elara Vance. Keep her face, hair and build exactly as in image 1. ") if refs else ''
    w = {
        'unet': {'class_type': 'UNETLoader', 'inputs': {'unet_name': UNET, 'weight_dtype': 'default'}},
        'attention': {'class_type': 'ModelAttentionBackend', 'inputs': {'model': ['unet', 0], 'attention': 'comfy kitchen attention'}},
        'clip': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': CLIP, 'type': 'qwen_image', 'device': 'default'}},
        'vae': {'class_type': 'VAELoader', 'inputs': {'vae_name': VAE}},
        'text': {'class_type': 'TextEncodeQwenImage21', 'inputs': {'clip': ['clip', 0], 'prompt': lead + scene, 'negative_prompt': '', 'resolution': 1024}},
        'latent': {'class_type': 'EmptyLatentImage', 'inputs': {'width': 1024, 'height': 1024, 'batch_size': 1}},
        'sampler': {'class_type': 'KSampler', 'inputs': {'model': ['cache', 0], 'seed': seed, 'steps': 25, 'cfg': 1, 'sampler_name': 'euler', 'scheduler': 'simple', 'positive': ['text', 0], 'negative': ['text', 1], 'latent_image': ['latent', 0], 'denoise': 1}},
        'decode': {'class_type': 'VAEDecode', 'inputs': {'samples': ['sampler', 0], 'vae': ['vae', 0]}},
        'rgb': {'class_type': 'SplitImageWithAlpha', 'inputs': {'image': ['decode', 0]}},
        'save': {'class_type': 'PreviewImage', 'inputs': {'images': ['rgb', 0]}},
        'cache': CACHE,
    }
    for i, r in enumerate(refs, 1):
        w[f'p{i}'] = {'class_type': 'LoadImage', 'inputs': {'image': upload(r, 'lrs-bench-' + r.split('/')[-1])}}
        w['text']['inputs'][f'images.image_{i}'] = [f'p{i}', 0]
    if refs: w['text']['inputs']['vae'] = ['vae', 0]
    run(name, w)
elif STEP == 'sheetx':
    # sheetx <flux3-klein|fibo-2.0-turbo> <kael|elara> <seed>: the same sheet by another model, through the app's workflow.
    model, who, seed = sys.argv[5], sys.argv[6], int(sys.argv[7])
    look, name, noun = (KAEL, 'Kael', 'man') if who == 'kael' else (ELARA, 'Elara Vance', 'woman')
    prompt = f"{look} A character turnaround sheet of {name}: three head-and-shoulders views of the same {noun} side by side, evenly spaced, on a plain dark grey backdrop, from left to right: facing the viewer, in a three-quarter turn to the left, and in profile facing left. The same face, hair and plain dark clothes in each, each face clearly and evenly lit. {STYLE}"
    if model == 'flux3-klein':
        unet = pick(files('UNETLoader', 'unet_name'), r'^flux3_image_klein_sd_int8', r'^flux3_image_klein_sd_bf16'); steps = 16
        vae = pick(files('VAELoader', 'vae_name'), r'^flux2-vae.*\.safetensors$')
    else:
        unet = pick(files('UNETLoader', 'unet_name'), r'^fibo2_edit_turbo_int8_convrot', r'^fibo2_edit_turbo_bf16'); steps = 4
        vae = pick(files('VAELoader', 'vae_name'), r'^flux2-vae_fibo2')
    clip = pick(files('CLIPLoader', 'clip_name'), r'^qwen3vl_4b_int8_convrot', r'^qwen3vl_4b_bf16')
    base = json.load(open(f'{REPO}/server/images/comfyui/workflows/{model}.json')); base.pop('_note')
    vals = {'$unet': unet, '$clip': clip, '$vae': vae, '$prompt': prompt, '$seed': seed, '$steps': steps, '$cfg': 1, '$width': 1536, '$height': 640}
    fill = lambda x: {k: fill(v) for k, v in x.items()} if isinstance(x, dict) else [fill(v) for v in x] if isinstance(x, list) else vals.get(x, x) if isinstance(x, str) else x
    w = fill(base); w['save'] = {'class_type': 'PreviewImage', 'inputs': {'images': w['save']['inputs']['images']}}
    run(f'sheet-{who}-{model}-{seed}', w)
elif STEP == 'sheet':
    seed, who, w_, h_ = int(sys.argv[5]), sys.argv[6], 1536, 640
    look, name, noun = (KAEL, 'Kael', 'man') if who == 'kael' else (ELARA, 'Elara Vance', 'woman')
    prompt = f"{look} A character turnaround sheet of {name}: three head-and-shoulders views of the same {noun} side by side, evenly spaced, on a plain dark grey backdrop, from left to right: facing the viewer, in a three-quarter turn to the left, and in profile facing left. The same face, hair and plain dark clothes in each, each face clearly and evenly lit. {STYLE}"
    w = {
        'unet': {'class_type': 'UNETLoader', 'inputs': {'unet_name': UNET, 'weight_dtype': 'default'}},
        'attention': {'class_type': 'ModelAttentionBackend', 'inputs': {'model': ['unet', 0], 'attention': 'comfy kitchen attention'}},
        'clip': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': CLIP, 'type': 'qwen_image', 'device': 'default'}},
        'vae': {'class_type': 'VAELoader', 'inputs': {'vae_name': VAE}},
        'text': {'class_type': 'TextEncodeQwenImage21', 'inputs': {'clip': ['clip', 0], 'prompt': prompt, 'negative_prompt': '', 'resolution': 1024}},
        'latent': {'class_type': 'EmptyLatentImage', 'inputs': {'width': w_, 'height': h_, 'batch_size': 1}},
        'sampler': {'class_type': 'KSampler', 'inputs': {'model': ['attention', 0], 'seed': seed, 'steps': 25, 'cfg': 1, 'sampler_name': 'euler', 'scheduler': 'simple', 'positive': ['text', 0], 'negative': ['text', 1], 'latent_image': ['latent', 0], 'denoise': 1}},
        'decode': {'class_type': 'VAEDecode', 'inputs': {'samples': ['sampler', 0], 'vae': ['vae', 0]}},
        'rgb': {'class_type': 'SplitImageWithAlpha', 'inputs': {'image': ['decode', 0]}},
        'save': {'class_type': 'PreviewImage', 'inputs': {'images': ['rgb', 0]}},
    }
    run(f'sheet-{who}-{seed}', w)
elif STEP == 'edit':
    # edit <kael|elara> <scene.png> <mask.png> <seed> <name> <ref.png>...
    who, scene, mask, seed, name, refs = sys.argv[5], sys.argv[6], sys.argv[7], int(sys.argv[8]), sys.argv[9], sys.argv[10:]
    base = json.load(open(f'{REPO}/server/images/comfyui/workflows/qwen-image-2.1-edit.json')); base.pop('_note')
    vals = {'$unet': UNET, '$clip': CLIP, '$vae': VAE, '$image': upload(scene, 'lrs-bench-' + scene.split('/')[-1]), '$mask': upload(mask, 'lrs-bench-' + mask.split('/')[-1]),
            '$prompt': KA if who == 'kael' else EL, '$seed': seed, '$steps': 25, '$width': 1024, '$height': 1024, '$fitWidth': 1024, '$fitHeight': 1024}
    fill = lambda x: {k: fill(v) for k, v in x.items()} if isinstance(x, dict) else [fill(v) for v in x] if isinstance(x, list) else vals.get(x, x) if isinstance(x, str) else x
    w = fill(base)
    for i, r in enumerate(refs, 2):
        w[f'p{i}'] = {'class_type': 'LoadImage', 'inputs': {'image': upload(r, 'lrs-bench-' + r.split('/')[-1])}}
        w['conditioning']['inputs'][f'images.image_{i}'] = [f'p{i}', 0]
    w['cache'] = CACHE; w['sampler']['inputs']['model'] = ['cache', 0]
    w['save'] = {'class_type': 'PreviewImage', 'inputs': {'images': ['composite', 0]}}
    run(name, w)
