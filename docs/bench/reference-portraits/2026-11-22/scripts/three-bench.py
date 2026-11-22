import sys, runpy, json, urllib.request
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2], sys.argv[3], 'attention', 'none']
ADDR, OUT = sys.argv[1], sys.argv[3]
g = runpy.run_path('refs-seed8.py')
wf = g['workflow']
OPT = {}
def workflow(prompt, refs):
    w = wf(prompt, refs)
    w['latent']['inputs'].update(width=OPT['w'], height=OPT['h'])
    w['sampler']['inputs']['seed'] = OPT.get('seed', 8)
    if OPT.get('cache'):
        w['cache'] = {'class_type': 'QwenImage21Cache', 'inputs': {'model': ['attention', 0], 'device': OPT['cache'], 'dtype': 'int8' if OPT['cache'] == 'gpu' else 'default'}}
        w['sampler']['inputs']['model'] = ['cache', 0]
    return w
g['run'].__globals__['workflow'] = workflow
run, frame, up = g['run'], g['frame'], g['upload']
def vram():
    with urllib.request.urlopen(ADDR + '/system_stats') as r:
        d = json.load(r)
    return f"VRAM free {d['devices'][0]['vram_free']/2**30:.1f} GiB, RAM free {d['system']['ram_free']/2**30:.1f} GiB"
BRAM = "Bram, a 60-year-old sailor with a stocky, barrel-chested build, ruddy wind-burned skin, a bald head, a thick grey beard braided at the chin, a gold ring in one ear, and a broad, lined face with small, shrewd eyes."
STYLE = g['STYLE']
portrait = lambda who, pron: f"{who} A head-and-shoulders portrait of {pron} alone, facing the viewer in a slight three-quarter turn, face clearly and evenly lit, in plain dark clothes, against a plain dark grey backdrop. {STYLE}"
SCENE = ("Kael stands behind the warped wooden bar of a small 18th-century harbour tavern, wiping a cracked mug with a rag and watching the two across from him. "
 "Elara Vance sits on a stool at the bar in a damp dark travelling cloak, leaning forward with her elbows on it, a folded letter under her hand. "
 "Bram sits on the stool beside her in a salt-stained sailor's coat, laughing, a tankard of ale raised in his fist. "
 "The three are shown at eye level from across the room, all of them fully in view, with oil lamps on the bar and a rain-lashed window behind. " + STYLE)
REF3 = "Image 1 is Kael, image 2 is Elara Vance and image 3 is Bram. Keep each one's face, hair and build exactly as in their image."
k, e = 'lrs-bench-portrait-kael.png', 'lrs-bench-portrait-elara.png'
def go(name, prompt, refs, **o):
    OPT.clear(); OPT.update(o); g['ONLY'][:] = [name]
    run(name, prompt, refs)
    print('   ', vram(), flush=True)
go('bram', portrait(BRAM, 'him'), [], w=1024, h=1024, seed=7)
b = up(f'{OUT}/bram.png', 'lrs-bench-portrait-bram.png')
three = [k, e, b]
go('t-plain-1024', SCENE, [], w=1024, h=1024)
go('t-refs-1024', f'{REF3} {SCENE}', three, w=1024, h=1024, cache='gpu')
go('t-plain-land', SCENE, [], w=1216, h=832)
go('t-refs-land', f'{REF3} {SCENE}', three, w=1216, h=832, cache='gpu')
go('t-refs-land-off', f'{REF3} {SCENE} ', three, w=1216, h=832, cache='off')
go('two-refs-land', f"{g['REF2']} {frame(9)}", [k, e], w=1216, h=832, cache='gpu')
go('t-plain-big', SCENE, [], w=1536, h=1024)
go('t-refs-big', f'{REF3} {SCENE}', three, w=1536, h=1024, cache='gpu')
go('t-refs-big-off', f'{REF3} {SCENE} ', three, w=1536, h=1024, cache='off')
