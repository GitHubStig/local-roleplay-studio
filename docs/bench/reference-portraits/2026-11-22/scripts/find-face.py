import sys, json, time, urllib.request
ADDR = sys.argv[1]
def post(p, b):
    req = urllib.request.Request(ADDR + p, data=json.dumps(b).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r: return json.loads(r.read())
def get(p):
    with urllib.request.urlopen(ADDR + p) as r: return json.loads(r.read())
ASK = ('Locate the head of every person in the picture: the face and the hair only, not the neck, shoulders or body. '
       'Answer with JSON only: a list, one object per person, each {"label": who they are (for example "man on the left"), "bbox_2d": [x1, y1, x2, y2]} in coordinates from 0 to 1000.')
for img in sys.argv[2:]:
    w = {
      'clip': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': 'qwen3vl_8b_int8_convrot.safetensors', 'type': 'qwen_image', 'device': 'default'}},
      'img': {'class_type': 'LoadImage', 'inputs': {'image': img}},
      'gen': {'class_type': 'TextGenerate', 'inputs': {'clip': ['clip', 0], 'prompt': ASK, 'max_length': 300, 'sampling_mode': 'off', 'image': ['img', 0]}},
      'show': {'class_type': 'PreviewAny', 'inputs': {'source': ['gen', 0]}},
    }
    t0 = time.time(); pid = post('/prompt', {'prompt': w, 'client_id': 'lrs-bench'})['prompt_id']
    while pid not in (h := get('/history/' + pid)): time.sleep(0.5)
    e = h[pid]
    if e['status'].get('status_str') != 'success':
        print(img, 'FAILED', json.dumps([m for m in e['status']['messages'] if m[0] == 'execution_error'])[:700]); continue
    print(img, f'{time.time()-t0:.0f} s', e['outputs']['show']['text'][0])
