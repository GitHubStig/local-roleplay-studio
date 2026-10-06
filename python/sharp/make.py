# /// script
# requires-python = ">=3.14,<3.15"
# dependencies = [
#   "sharp @ git+https://github.com/apple/ml-sharp@aed6527499ef91cba3b54c18d49a870f25947190",
#   "huggingface-hub",
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
Turns one picture into a 3D scene of Gaussian splats with Apple's SHARP, on the GPU: the Mac's
(MPS), or NVIDIA's (CUDA; torch then comes from PyTorch's CUDA index, as PyPI's is CPU-only on
Windows).
The Deno server runs it once per scene (`uv run python/sharp/make.py --image … --out ….ply`), as it
runs mflux once per picture, so the ~15 GB it peaks at is freed as soon as it's done. Measured
2026-10-01 on an M5 Pro (docs/research/image-to-3d.md): ~15 s to load, ~4 s per picture,
1,179,648 splats in a 63 MB `.ply`.

Prints one line of JSON: the splat count; the pivot to orbit around (the 25th percentile of the
splats' depths; orbiting the median swept near subjects out of view); the camera SHARP assumed, as
a vertical field of view and an aspect ratio, so a viewer's first view lines up with the picture;
and how long it took.

The weights are under Apple's research-only model license. They come from Hugging Face
(apple/Sharp, the same file Apple's own CLI fetches from its CDN) into the Hugging Face cache, with
the other models, the first time they're needed (2.8 GB): it says "Downloading SHARP" on stderr,
then "Downloaded" once it has them. `--download` fetches them ahead of time and exits.
"""
import argparse
import json
import logging
import math
import sys
import time
from pathlib import Path

from huggingface_hub import hf_hub_download, try_to_load_from_cache

REPO, FILE = 'apple/Sharp', 'sharp_2572gikvuh.pt'


def checkpoint():
    """The weights' path in the Hugging Face cache, downloading them on first use."""
    if isinstance(try_to_load_from_cache(REPO, FILE), str):
        return hf_hub_download(REPO, FILE)
    print('Downloading SHARP', file=sys.stderr, flush=True)
    path = hf_hub_download(REPO, FILE)
    print('Downloaded', file=sys.stderr, flush=True)
    return path


def device():
    """NVIDIA's GPU (CUDA) on Windows and Linux, the Mac's (MPS) on a Mac, else the CPU (slow)."""
    import torch
    if torch.cuda.is_available():
        return torch.device('cuda')
    if torch.backends.mps.is_available():
        return torch.device('mps')
    return torch.device('cpu')


def synchronize(dev):
    """Waits for the GPU to finish, so the timing is the real one."""
    import torch
    if dev.type == 'cuda':
        torch.cuda.synchronize()
    elif dev.type == 'mps':
        torch.mps.synchronize()


def make(image_path, out):
    import torch
    from sharp.cli.predict import predict_image
    from sharp.models import PredictorParams, create_predictor
    from sharp.utils import io
    from sharp.utils.gaussians import save_ply

    start = time.time()
    predictor = create_predictor(PredictorParams())
    predictor.load_state_dict(torch.load(checkpoint(), weights_only=True))
    dev = device()
    predictor.eval().to(dev)
    loaded = time.time()
    # Pictures carry no camera data, so SHARP assumes a 30 mm lens.
    image, _, f_px = io.load_rgb(Path(image_path))
    gaussians = predict_image(predictor, image, f_px, dev)
    save_ply(gaussians, f_px, image.shape[:2], Path(out))
    depth = gaussians.mean_vectors[..., 2].flatten().float().cpu()
    height, width = image.shape[:2]
    print(json.dumps({
        'splats': depth.numel(),
        'pivot': round(torch.quantile(depth[::16], 0.25).item(), 3),
        'fov': round(math.degrees(2 * math.atan(height / 2 / f_px)), 2),
        'aspect': round(width / height, 4),
        'seconds': {'load': round(loaded - start, 1), 'make': round(time.time() - loaded, 1)},
    }))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', help='the picture')
    parser.add_argument('--out', help='where to write the .ply')
    parser.add_argument('--download', action='store_true', help='fetch the weights and exit')
    args = parser.parse_args()
    if args.download:
        return print(f'SHARP is downloaded to {checkpoint()}.')
    if not (args.image and args.out):
        parser.error('--image and --out are required')
    logging.disable(logging.WARNING)
    make(args.image, args.out)


if __name__ == '__main__':
    main()
