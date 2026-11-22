import sys, runpy, json
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2], sys.argv[3], 'attention', 'none']
g = runpy.run_path('refs-seed8.py')
wf = g['workflow']
CACHE = {}
def workflow(prompt, refs):
    w = wf(prompt, refs)
    if CACHE:
        w['cache'] = {'class_type': 'QwenImage21Cache', 'inputs': {'model': ['attention', 0], **CACHE}}
        w['sampler']['inputs']['model'] = ['cache', 0]
    return w
g['run'].__globals__['workflow'] = workflow
run, frame = g['run'], g['frame']
k, e = 'lrs-bench-portrait-kael.png', 'lrs-bench-portrait-elara.png'
p12 = f"{g['REF2']} {frame(12)}"
for name, c in [('c-auto-1', {}), ('c-auto-2', {}), ('c-gpu', {'device': 'gpu', 'dtype': 'default'}), ('c-gpu-int8', {'device': 'gpu', 'dtype': 'int8'}), ('c-cpu', {'device': 'cpu', 'dtype': 'default'}), ('c-off', {'device': 'off', 'dtype': 'default'})]:
    CACHE.clear(); CACHE.update(c); g['ONLY'][:] = [name]
    run(name, p12 + ' ' * len(name), [k, e])  # a trailing difference so ComfyUI doesn't reuse a result
