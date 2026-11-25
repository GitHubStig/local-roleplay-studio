"""MediaPipe faces and RT-DETR people on the Mac's ComfyUI, against Qwen3-VL's head boxes (the PC's)."""
import json, sys, time, uuid, urllib.request
ADDR = 'http://127.0.0.1:8188'
def get(p):
    with urllib.request.urlopen(ADDR + p, timeout=120) as r: return r.read()
def post(p, body, ctype='application/json'):
    req = urllib.request.Request(ADDR + p, data=body, headers={'Content-Type': ctype})
    with urllib.request.urlopen(req, timeout=120) as r: return json.loads(r.read())
def upload(name):
    b = uuid.uuid4().hex; data = open(f'{name}.png', 'rb').read()
    body = (f'--{b}\r\nContent-Disposition: form-data; name="image"; filename="lrs-bench-{name}.png"\r\nContent-Type: image/png\r\n\r\n').encode() + data + f'\r\n--{b}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--{b}--\r\n'.encode()
    return post('/upload/image', body, f'multipart/form-data; boundary={b}')['name']
def submit(w):
    t0 = time.time(); pid = post('/prompt', json.dumps({'prompt': w, 'client_id': 'lrs-bench'}).encode())['prompt_id']
    while pid not in (h := json.loads(get('/history/' + pid))): time.sleep(0.1)
    e = h[pid]
    if e['status'].get('status_str') != 'success':
        return None, json.dumps([m for m in e['status']['messages'] if m[0] == 'execution_error'])[:600], time.time() - t0
    return e, None, time.time() - t0
def detector(kind, img, variant='both'):
    w = {'img': {'class_type': 'LoadImage', 'inputs': {'image': img}}}
    if kind == 'mediapipe':
        w['m'] = {'class_type': 'LoadMediaPipeFaceLandmarker', 'inputs': {'model_name': 'mediapipe_face_fp32.safetensors'}}
        w['d'] = {'class_type': 'MediaPipeFaceLandmarker', 'inputs': {'face_detection_model': ['m', 0], 'image': ['img', 0], 'detector_variant': variant, 'num_faces': 0, 'min_confidence': 0.3, 'missing_frame_fallback': 'empty'}}
        out = ['d', 1]
    else:
        w['m'] = {'class_type': 'UNETLoader', 'inputs': {'unet_name': 'rt_detr_v4-x-hgnet_fp16.safetensors', 'weight_dtype': 'default'}}
        w['d'] = {'class_type': 'RTDETR_detect', 'inputs': {'model': ['m', 0], 'image': ['img', 0], 'threshold': 0.4, 'class_name': 'person', 'max_detections': 10}}
        out = ['d', 0]
    w['show'] = {'class_type': 'PreviewAny', 'inputs': {'source': out}}
    w['draw'] = {'class_type': 'DrawBBoxes', 'inputs': {'bboxes': out, 'image': ['img', 0]}}
    w['save'] = {'class_type': 'PreviewImage', 'inputs': {'images': ['draw', 0]}}
    return w
PICS = ['kael', 'kael-low', 'kael-high', 'kael-face', 'elara', 'elara-low', 'elara-high', 'elara-face', 'grax', 'quay']
out = {}
for kind in ('mediapipe', 'rtdetr'):
    for i, p in enumerate(PICS):
        img = upload(p)
        if i == 0:  # the first run loads the model: timed apart
            e, err, t = submit(detector(kind, img)); print(f'{kind} first run (load) {t:.2f} s', flush=True)
        e, err, t = submit(detector(kind, img))
        if err:
            # A missing_frame_fallback name may differ: show the error once.
            print(kind, p, 'ERROR', err, flush=True); continue
        text = e['outputs']['show']['text'][0]
        im = e['outputs']['save']['images'][0]
        open(f'det-{kind}-{p}.png', 'wb').write(get(f"/view?filename={im['filename']}&subfolder={im['subfolder']}&type={im['type']}"))
        print(f'{kind} {p} {t:.2f} s {text[:300]}', flush=True)
        out[f'{kind} {p}'] = text
json.dump(out, open('detect.json', 'w'))
