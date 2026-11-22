"""Reference portraits trial on a ComfyUI across the network: the Mac trial's portraits and Frames
(docs/bench/reference-portraits/run.sh), on Qwen-Image 2.1, rendered by the PC's ComfyUI.
Pictures come back as PreviewImage (ComfyUI's temp folder, cleared at its restart), so nothing is
left in its output folder. Usage: python3 -I refs-comfy.py <comfy address> <repo> <out dir>"""
import json, re, sys, time, uuid, urllib.request, urllib.parse

ADDR, REPO, OUT = sys.argv[1].rstrip('/'), sys.argv[2], sys.argv[3]

def get(path):
    with urllib.request.urlopen(ADDR + path, timeout=30) as r:
        return r.read()

def post(path, body, ctype='application/json'):
    req = urllib.request.Request(ADDR + path, data=body, headers={'Content-Type': ctype})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

def files(node, field):
    info = json.loads(get('/object_info/' + node))[node]['input']['required'][field][0]
    return info

def pick(names, *patterns):
    for p in patterns:
        for n in names:
            if re.search(p, n):
                return n
    raise SystemExit(f'none of {patterns} in {names}')

unets = files('UNETLoader', 'unet_name')
clips = files('CLIPLoader', 'clip_name')
vaes = files('VAELoader', 'vae_name')
UNET = pick(unets, r'^qwen_image_2\.1_int8', r'^qwen_image_2\.1_fp8', r'^qwen_image_2\.1_(?!vae|turbo).*\.safetensors$')
CLIP = pick(clips, r'qwen.*3.*vl.*8b', r'qwen')
VAE = pick(vaes, r'qwen_image_2\.1_vae', r'qwen.*vae')
print('files:', UNET, CLIP, VAE, flush=True)

def upload(path, name):
    boundary = uuid.uuid4().hex
    data = open(path, 'rb').read()
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{name}"\r\n'
            f'Content-Type: image/png\r\n\r\n').encode() + data + \
           f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--{boundary}--\r\n'.encode()
    return post('/upload/image', body, f'multipart/form-data; boundary={boundary}')['name']

def workflow(prompt, refs):
    w = {
        'unet': {'class_type': 'UNETLoader', 'inputs': {'unet_name': UNET, 'weight_dtype': 'default'}},
        'attention': {'class_type': 'ModelAttentionBackend', 'inputs': {'model': ['unet', 0], 'attention': 'comfy kitchen attention'}},
        'clip': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': CLIP, 'type': 'qwen_image', 'device': 'default'}},
        'vae': {'class_type': 'VAELoader', 'inputs': {'vae_name': VAE}},
        'text': {'class_type': 'TextEncodeQwenImage21', 'inputs': {'clip': ['clip', 0], 'prompt': prompt, 'negative_prompt': '', 'resolution': 1024}},
        'latent': {'class_type': 'EmptyLatentImage', 'inputs': {'width': 1024, 'height': 1024, 'batch_size': 1}},
        'sampler': {'class_type': 'KSampler', 'inputs': {'model': ['attention', 0], 'seed': 7, 'steps': 25, 'cfg': 1, 'sampler_name': 'euler', 'scheduler': 'simple', 'positive': ['text', 0], 'negative': ['text', 1], 'latent_image': ['latent', 0], 'denoise': 1}},
        'decode': {'class_type': 'VAEDecode', 'inputs': {'samples': ['sampler', 0], 'vae': ['vae', 0]}},
        'rgb': {'class_type': 'SplitImageWithAlpha', 'inputs': {'image': ['decode', 0]}},
        'save': {'class_type': 'PreviewImage', 'inputs': {'images': ['rgb', 0]}},
    }
    if refs:
        w['text']['inputs']['vae'] = ['vae', 0]
        for i, name in enumerate(refs, 1):
            w[f'ref{i}'] = {'class_type': 'LoadImage', 'inputs': {'image': name}}
            w['text']['inputs'][f'images.image_{i}'] = [f'ref{i}', 0]
    return w

def run(name, prompt, refs=()):
    t0 = time.time()
    pid = post('/prompt', json.dumps({'prompt': workflow(prompt, list(refs)), 'client_id': 'lrs-bench'}).encode())['prompt_id']
    while True:
        h = json.loads(get('/history/' + pid))
        if pid in h:
            break
        time.sleep(1)
    entry = h[pid]
    st = entry.get('status', {})
    if st.get('status_str') != 'success':
        msgs = [m for m in st.get('messages', []) if m[0] == 'execution_error']
        line = f'{name}: FAILED {json.dumps(msgs)[:600]}'
    else:
        img = entry['outputs']['save']['images'][0]
        q = urllib.parse.urlencode({'filename': img['filename'], 'subfolder': img['subfolder'], 'type': img['type']})
        open(f'{OUT}/{name}.png', 'wb').write(get('/view?' + q))
        line = f'{name}: {time.time() - t0:.0f} s'
    print(line, flush=True)
    open(f'{OUT}/results.txt', 'a').write(line + '\n')

P = json.load(open(f'{REPO}/docs/bench/art-tags/prompts/gemma4-31b.json'))
frame = lambda i: [e['prompt'] for e in P if e['style'] == 'prose' and e['index'] == i][0]
KAEL = "Kael, a 42-year-old man with a lean, rigid build, weathered tanned skin marked by old scars, short unkempt brown hair, and a scarred, angular face with tired, piercing eyes."
ELARA = "Elara Vance, a 20-year-old woman with a slender build, pale skin flushed by the cold, dark hair pulled back neatly, and a face with sharp, intelligent features and focused, calculating eyes."
STYLE = "A moody, cinematic oil painting with heavy, visible brushstrokes, utilizing a chiaroscuro lighting scheme with deep shadows and warm, flickering amber highlights to evoke a gritty, 18th-century atmospheric realism."
portrait = lambda who, pron: f"{who} A head-and-shoulders portrait of {pron} alone, facing the viewer in a slight three-quarter turn, face clearly and evenly lit, in plain dark clothes, against a plain dark grey backdrop. {STYLE}"
REF = "Image 1 is Kael. Keep his face, hair and build exactly as in image 1."
REF2 = "Image 1 is Kael and image 2 is Elara Vance. Keep each one's face, hair and build exactly as in their image."

open(f'{OUT}/results.txt', 'w').close()
run('warmup', portrait(KAEL, 'him'))  # loads the model; its time isn't a render's
run('portrait-kael', portrait(KAEL, 'him'))
run('portrait-elara', portrait(ELARA, 'her'))
for i in (6, 9, 12):
    run(f'plain-{i}', frame(i))
kael = upload(f'{OUT}/portrait-kael.png', 'lrs-bench-portrait-kael.png')
elara = upload(f'{OUT}/portrait-elara.png', 'lrs-bench-portrait-elara.png')
run('refs-6', f'{REF} {frame(6)}', [kael])
for i in (9, 12):
    run(f'refs-{i}', f'{REF2} {frame(i)}', [kael, elara])
print('done', flush=True)
