"""Reference portraits on the PC's other Image Models: FLUX.3 Klein, FIBO 2.0 Edit Turbo, Qwen-Image 2.1 Turbo.
For each: its plain render, its render with the portrait, and a face edit of the Qwen pictures with the portrait as a second image."""
import sys, json, time, urllib.request, urllib.parse
ADDR, REPO, OUT = sys.argv[1].rstrip('/'), sys.argv[2], sys.argv[3]
WF = f'{REPO}/server/images/comfyui/workflows'
def get(p):
    with urllib.request.urlopen(ADDR + p, timeout=60) as r: return r.read()
def post(p, b):
    req = urllib.request.Request(ADDR + p, data=json.dumps(b).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())
def load(name, vals):
    w = json.load(open(f'{WF}/{name}.json')); w.pop('_note')
    def fill(x):
        if isinstance(x, dict): return {k: fill(v) for k, v in x.items()}
        if isinstance(x, list): return [fill(v) for v in x]
        return vals.get(x, x) if isinstance(x, str) else x
    w = fill(w); w['save']['class_type'] = 'PreviewImage'; return w
def run(name, w):
    t0 = time.time(); pid = post('/prompt', {'prompt': w, 'client_id': 'lrs-bench'})['prompt_id']
    while True:
        h = json.loads(get('/history/' + pid))
        if pid in h: break
        time.sleep(0.5)
    e = h[pid]
    if e.get('status', {}).get('status_str') != 'success':
        line = f'{name}: FAILED ' + json.dumps([m for m in e['status'].get('messages', []) if m[0] == 'execution_error'])[:500]
    else:
        img = e['outputs']['save']['images'][0]
        open(f'{OUT}/{name}.png', 'wb').write(get('/view?' + urllib.parse.urlencode({k: img[k] for k in ('filename', 'subfolder', 'type')})))
        line = f'{name}: {time.time() - t0:.0f} s'
    print(line, flush=True); open(f'{OUT}/others.txt', 'a').write(line + '\n')

STYLE = "A moody, cinematic oil painting with heavy, visible brushstrokes, utilizing a chiaroscuro lighting scheme with deep shadows and warm, flickering amber highlights to evoke a gritty, 18th-century atmospheric realism."
KAEL = "Kael, a 42-year-old man with a lean, rigid build, weathered tanned skin marked by old scars, short unkempt brown hair, and a scarred, angular face with tired, piercing eyes."
ELARA = "Elara Vance, a 20-year-old woman with a slender build, pale skin flushed by the cold, dark hair pulled back neatly, and a face with sharp, intelligent features and focused, calculating eyes."
SCENE = {
 'cry': f"{ELARA} Elara Vance sits on a narrow bed in a small attic room, crying, tears running down her cheeks, her face crumpled with grief, a crumpled letter in her lap, seen from the waist up in grey morning light from a small window. {STYLE}",
 'profile': f"{KAEL} Kael seen in profile, facing left, half his face in deep shadow, as he stands at a rain-streaked window holding a guttering candle, from the chest up, in a dark tavern at night. {STYLE}",
}
WHO = {'cry': ('Elara Vance', 'her', 'woman', 'lrs-bench-portrait-elara.png'), 'profile': ('Kael', 'his', 'man', 'lrs-bench-portrait-kael.png')}
KEEP = {'cry': "keep her expression exactly as it is: crying, tears running down her cheeks, her face crumpled with grief",
        'profile': "keep him exactly as he is: seen in profile facing left, half his face in shadow, lit by the candle"}
BOX = {'cry-8': (370, 90, 260, 320), 'cry-9': (370, 40, 280, 360), 'profile-8': (360, 80, 330, 420), 'profile-9': (390, 60, 330, 410)}
FLUX = {'$unet': 'flux3_image_klein_sd_int8_convrot.safetensors', '$clip': 'qwen3vl_4b_int8_convrot.safetensors', '$vae': 'flux2-vae.safetensors', '$steps': 16, '$cfg': 1, '$width': 1024, '$height': 1024}
FIBO = {'$unet': 'fibo2_edit_turbo_int8_convrot.safetensors', '$clip': 'qwen3vl_4b_int8_convrot.safetensors', '$vae': 'flux2-vae_fibo2.safetensors', '$steps': 4, '$cfg': 1, '$width': 1024, '$height': 1024}
TURBO = {'$unet': 'qwen_image_2.1_turbo_int8_convrot.safetensors', '$clip': 'qwen3vl_8b_int8_convrot.safetensors', '$vae': 'qwen_image_2.1_vae_bf16.safetensors', '$cfg': 1, '$width': 1024, '$height': 1024, '$fitWidth': 1024, '$fitHeight': 1024}
gpu_cache = lambda w: w['cache']['inputs'].update(device='gpu', dtype='int8')

def flux(scene, s):
    name, pron, kind, portrait = WHO[scene]
    run(f'o-flux-{scene}-plain-{s}', load('flux3-klein', {**FLUX, '$prompt': SCENE[scene], '$seed': s}))
    w = load('flux3-klein', {**FLUX, '$prompt': f"<ref_image_0> is {name}. Keep {pron} face, hair and build exactly as in <ref_image_0>. {SCENE[scene]}", '$seed': s})
    w['ref'] = {'class_type': 'LoadImage', 'inputs': {'image': portrait}}
    w['conditioning'] = {'class_type': 'ReferenceMultiLatent', 'inputs': {'positive': ['text', 0], 'negative': ['negative', 0], 'vae': ['vae', 0], 'images.image0': ['ref', 0], 'resolution': 'keep resolution'}}
    w['sampler']['inputs'].update(positive=['conditioning', 0], negative=['conditioning', 1])
    run(f'o-flux-{scene}-refs-{s}', w)
    x, y, bw, bh = BOX[f'{scene}-{s}']; t = lambda n: round(n / 1024 * 1000)
    instr = f"give the {kind} the face and hair of the {kind} in <ref_image_1>, {name}, but {KEEP[scene]}."
    layout = json.dumps([{'id': 'obj_1', 'from': None, 'src_bbox': None, 'tgt_bbox': [t(y), t(x), t(y + bh), t(x + bw)], 'desc': instr}])
    w = load('flux3-klein-edit', {**FLUX, '$image': f'lrs-bench-sc-{scene}-{s}.png', '$mask': f'lrs-bench-mask-{scene}-{s}.png', '$seed': s + 1,
              '$prompt': f"In <ref_image_0>, repaint <obj_1>: {instr} Keep everything else unchanged. {layout}"})
    w['portrait'] = {'class_type': 'LoadImage', 'inputs': {'image': portrait}}
    w['conditioning']['inputs']['images.image1'] = ['portrait', 0]
    run(f'o-flux-{scene}-face-{s}', w)

def fibo(scene, s):
    name, pron, kind, portrait = WHO[scene]
    run(f'o-fibo-{scene}-plain-{s}', load('fibo-2.0-turbo', {**FIBO, '$prompt': SCENE[scene], '$seed': s}))
    w = load('fibo-2.0-turbo', {**FIBO, '$prompt': f"Image 1 is {name}. Keep {pron} face, hair and build exactly as in image 1. {SCENE[scene]}", '$seed': s})
    w['ref'] = {'class_type': 'LoadImage', 'inputs': {'image': portrait}}
    w['conditioning']['inputs'].update({'vae': ['vae', 0], 'images.image_1': ['ref', 0]})
    run(f'o-fibo-{scene}-refs-{s}', w)
    w = load('fibo-2.0-edit-turbo', {**FIBO, '$image': f'lrs-bench-sc-{scene}-{s}.png', '$mask': f'lrs-bench-mask-{scene}-{s}.png', '$seed': s + 1,
              '$prompt': f"Give the {kind} in image 1 the face and hair of the {kind} in image 2, {name}, but {KEEP[scene]}. Change nothing else."})
    w['portrait'] = {'class_type': 'LoadImage', 'inputs': {'image': portrait}}
    w['conditioning']['inputs']['images.image_2'] = ['portrait', 0]
    run(f'o-fibo-{scene}-face-{s}', w)

def turbo(scene, s):
    name, pron, kind, portrait = WHO[scene]
    w = load('qwen-image-2.1-turbo', {**TURBO, '$prompt': SCENE[scene], '$seed': s}); gpu_cache(w)
    run(f'o-turbo-{scene}-plain-{s}', w)
    w = load('qwen-image-2.1-turbo', {**TURBO, '$prompt': f"Image 1 is {name}. Keep {pron} face, hair and build exactly as in image 1. {SCENE[scene]}", '$seed': s}); gpu_cache(w)
    w['ref'] = {'class_type': 'LoadImage', 'inputs': {'image': portrait}}
    w['text']['inputs'].update({'vae': ['vae', 0], 'images.image_1': ['ref', 0]})
    run(f'o-turbo-{scene}-refs-{s}', w)
    w = load('qwen-image-2.1-turbo-edit', {**TURBO, '$image': f'lrs-bench-sc-{scene}-{s}.png', '$mask': f'lrs-bench-mask-{scene}-{s}.png', '$seed': s + 1,
              '$prompt': f"Give the {kind} in image 1 the face and hair of the {kind} in image 2, {name}, but {KEEP[scene]}. Change nothing else."}); gpu_cache(w)
    w['portrait'] = {'class_type': 'LoadImage', 'inputs': {'image': portrait}}
    w['conditioning']['inputs']['images.image_2'] = ['portrait', 0]
    run(f'o-turbo-{scene}-face-{s}', w)

open(f'{OUT}/others.txt', 'w').close()
for model in (flux, fibo, turbo):
    for scene in ('cry', 'profile'):
        for s in (8, 9):
            model(scene, s)
print('done', flush=True)
