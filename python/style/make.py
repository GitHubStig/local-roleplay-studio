# /// script
# requires-python = ">=3.14,<3.15"
# dependencies = [
#   "huggingface-hub",
#   "numpy",
#   "open_clip_torch",
#   "pillow",
#   "torch",
#   "torchvision",
# ]
# [tool.uv]
# python-preference = "only-managed"
# [tool.uv.sources]
# torch = { index = "pytorch-cuda", marker = "sys_platform != 'darwin'" }
# torchvision = { index = "pytorch-cuda", marker = "sys_platform != 'darwin'" }
# [[tool.uv.index]]
# name = "pytorch-cuda"
# url = "https://download.pytorch.org/whl/cu128"
# explicit = true
# ///
"""
Embeds pictures for the Compare dialog's style scores, on the GPU: the Mac's (MPS), or NVIDIA's
(CUDA), else the CPU (slow). Each picture gets two embeddings:

- CSD (Contrastive Style Descriptors, Somepalli et al. 2024; CC-BY-4.0): CLIP ViT-L/14 fine-tuned
  to tell art styles apart whatever the picture shows. The style scores are measured with it.
- CLIP ViT-L/14 (OpenAI): the picture, and each Frame's caption as text, in one space, so a
  picture can be checked against the caption it was meant to match.

The Deno server runs it once per scoring (`uv run python/style/make.py --in … --out …`), with only
the pictures and captions it hasn't embedded before. `--in` is a JSON file of
`{"images": [paths], "texts": [captions]}`; `--out` gets
`{"images": {path: {"csd": b64, "clip": b64}}, "texts": {caption: b64}}`, each a unit-length
float32 vector in base64. It prints "Embedded <n> of <total>" on stderr as it goes, and a line of
JSON on stdout when done: how many it embedded, and how long it took.

Measured 2026-10-14 on an M5 Pro (docs/research/style-scores.md): ~5 s to load, ~0.13 s per
picture for both models, while an Image Model rendered beside it.

The weights come from Hugging Face into its cache the first time they're needed (CLIP 1.7 GB, CSD
2.4 GB, of which only its 1.2 GB of weights are used): it says "Downloading CSD and CLIP" on
stderr, then "Downloaded". `--download` fetches them ahead of time and exits.
"""
import argparse
import base64
import json
import logging
import sys
import time
import warnings

from huggingface_hub import hf_hub_download, try_to_load_from_cache

CLIP = ('timm/vit_large_patch14_clip_224.openai', 'open_clip_model.safetensors')
CSD = ('tomg-group-umd/CSD-ViT-L', 'pytorch_model.bin')
# OpenAI's CLIP was trained with QuickGELU: the plain ViT-L-14 config gives slightly wrong vectors.
ARCH = 'ViT-L-14-quickgelu'
BATCH = 8


def checkpoints():
    """Both models' weights in the Hugging Face cache, downloading them on first use."""
    cached = all(isinstance(try_to_load_from_cache(*f), str) for f in (CLIP, CSD))
    if not cached:
        print('Downloading CSD and CLIP', file=sys.stderr, flush=True)
    paths = [hf_hub_download(*f) for f in (CLIP, CSD)]
    if not cached:
        print('Downloaded', file=sys.stderr, flush=True)
    return paths


def device():
    """NVIDIA's GPU (CUDA) on Windows and Linux, the Mac's (MPS) on a Mac, else the CPU (slow)."""
    import torch
    if torch.cuda.is_available():
        return torch.device('cuda')
    if torch.backends.mps.is_available():
        return torch.device('mps')
    return torch.device('cpu')


def load_csd(path, open_clip):
    """
    CSD's checkpoint is a training snapshot (a pickle): only its tensors are loaded, with the few
    plain-data types it also holds allowed, never code. Its backbone is CLIP ViT-L/14's image side,
    and its style head takes the place of CLIP's projection (the same shape).
    """
    import argparse as ap
    import numpy as np
    import torch
    torch.serialization.add_safe_globals([
        (np._core.multiarray.scalar, 'numpy.core.multiarray.scalar'),
        np.dtype,
        np.dtypes.Float64DType,
        ap.Namespace,
    ])
    state = torch.load(path, map_location='cpu', weights_only=True)['model_state_dict']
    weights = {
        k.removeprefix('module.backbone.'): v
        for k, v in state.items()
        if k.startswith('module.backbone.')
    }
    weights['proj'] = state['module.last_layer_style']
    model, _, _ = open_clip.create_model_and_transforms(ARCH, pretrained=None)
    model.visual.load_state_dict(weights, strict=True)
    return model.visual


def b64(vector):
    return base64.b64encode(vector.astype('<f4').tobytes()).decode()


def embed(images, texts):
    import open_clip
    import torch
    from PIL import Image

    start = time.time()
    clip_path, csd_path = checkpoints()
    dev = device()
    clip, _, preprocess = open_clip.create_model_and_transforms(ARCH, pretrained=clip_path)
    clip = clip.eval().to(dev)
    csd = load_csd(csd_path, open_clip).eval().to(dev)
    tokenizer = open_clip.get_tokenizer(ARCH)
    loaded = time.time()

    unit = lambda e: (e / e.norm(dim=-1, keepdim=True)).float().cpu().numpy()
    out = {'images': {}, 'texts': {}}
    with torch.no_grad():
        for i in range(0, len(images), BATCH):
            paths = images[i:i + BATCH]
            x = torch.stack([preprocess(Image.open(p).convert('RGB')) for p in paths]).to(dev)
            for path, a, b in zip(paths, unit(csd(x)), unit(clip.encode_image(x))):
                out['images'][path] = {'csd': b64(a), 'clip': b64(b)}
            print(f'Embedded {i + len(paths)} of {len(images)}', file=sys.stderr, flush=True)
        for i in range(0, len(texts), 64):
            batch = texts[i:i + 64]
            for text, v in zip(batch, unit(clip.encode_text(tokenizer(batch).to(dev)))):
                out['texts'][text] = b64(v)
    return out, {'load': round(loaded - start, 1), 'embed': round(time.time() - loaded, 1)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--in', dest='request', help='JSON: {"images": [...], "texts": [...]}')
    parser.add_argument('--out', help='where to write the embeddings (JSON)')
    parser.add_argument('--download', action='store_true', help='fetch the weights and exit')
    args = parser.parse_args()
    if args.download:
        return print(f'The style models are downloaded to {", ".join(checkpoints())}.')
    if not (args.request and args.out):
        parser.error('--in and --out are required')
    logging.disable(logging.WARNING)
    warnings.filterwarnings('ignore')
    with open(args.request, encoding='utf-8') as f:
        request = json.load(f)
    out, seconds = embed(request.get('images', []), request.get('texts', []))
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(out, f)
    print(json.dumps({'pictures': len(out['images']), 'texts': len(out['texts']), 'seconds': seconds}))


if __name__ == '__main__':
    main()
