import json
exec(open('detect.py').read().split("PICS = ")[0])
def wf(kind, img, query='head'):
    w = {'img': {'class_type': 'LoadImage', 'inputs': {'image': img}}}
    if kind == 'sam3':
        w['ck'] = {'class_type': 'CheckpointLoaderSimple', 'inputs': {'ckpt_name': 'sam3.1_multiplex_fp16.safetensors'}}
        w['txt'] = {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['ck', 1], 'text': query}}
        w['d'] = {'class_type': 'SAM3_Detect', 'inputs': {'model': ['ck', 0], 'image': ['img', 0], 'threshold': 0.4, 'refine_iterations': 2, 'individual_masks': True, 'conditioning': ['txt', 0]}}
        out = ['d', 1]
    else:
        w['rt'] = {'class_type': 'UNETLoader', 'inputs': {'unet_name': 'rt_detr_v4-x-hgnet_fp16.safetensors', 'weight_dtype': 'default'}}
        w['people'] = {'class_type': 'RTDETR_detect', 'inputs': {'model': ['rt', 0], 'image': ['img', 0], 'threshold': 0.4, 'class_name': 'person', 'max_detections': 10}}
        w['ck'] = {'class_type': 'CheckpointLoaderSimple', 'inputs': {'ckpt_name': 'sdpose_wholebody_fp16.safetensors'}}
        w['kp'] = {'class_type': 'SDPoseKeypointExtractor', 'inputs': {'model': ['ck', 0], 'vae': ['ck', 2], 'image': ['img', 0], 'batch_size': 4, 'bboxes': ['people', 0]}}
        w['d'] = {'class_type': 'SDPoseFaceBBoxes', 'inputs': {'keypoints': ['kp', 0], 'scale': 1.5, 'force_square': False}}
        out = ['d', 0]
    w['show'] = {'class_type': 'PreviewAny', 'inputs': {'source': out}}
    w['draw'] = {'class_type': 'DrawBBoxes', 'inputs': {'bboxes': out, 'image': ['img', 0]}}
    w['save'] = {'class_type': 'PreviewImage', 'inputs': {'images': ['draw', 0]}}
    return w
PICS = ['kael', 'kael-low', 'kael-high', 'kael-face', 'elara', 'elara-low', 'elara-high', 'elara-face', 'grax', 'quay', 'lantern']
out = {}
for kind in ('sam3', 'sdpose'):
    for i, p in enumerate(PICS):
        img = upload(p)
        q = 'lantern' if p == 'lantern' else 'head'
        if i == 0:
            e, err, t = submit(wf(kind, img, q)); print(f'{kind} first run (load) {t:.2f} s', err or '', flush=True)
        e, err, t = submit(wf(kind, img, q))
        if err: print(kind, p, 'ERROR', err, flush=True); continue
        text = e['outputs']['show']['text'][0]; im = e['outputs']['save']['images'][0]
        open(f'det-{kind}-{p}.png', 'wb').write(get(f"/view?filename={im['filename']}&subfolder={im['subfolder']}&type={im['type']}"))
        bs = json.loads(text); bs = bs[0] if bs and isinstance(bs[0], list) else bs
        boxes = [[round(b['x']/1.024), round(b['y']/1.024), round((b['x']+b['width'])/1.024), round((b['y']+b['height'])/1.024)] + ([round(b['score'], 2)] if 'score' in b else []) for b in bs]
        print(f'{kind:7} {p:11} {t:5.2f} s {boxes}', flush=True)
        out[f'{kind} {p}'] = boxes
json.dump(out, open('detect2.json', 'w'))
