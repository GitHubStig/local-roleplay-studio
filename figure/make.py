# /// script
# requires-python = ">=3.14,<3.15"
# dependencies = ["torch", "torchvision", "numpy", "safetensors", "pillow", "tqdm", "huggingface-hub"]
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
Turns a picture of one person into a full 3D figure of Gaussian splats, back included, with
TripoSplat (VAST, MIT; its code is in figure/triposplat/) on the GPU: the Mac's (MPS), or NVIDIA's
(CUDA; torch then comes from PyTorch's CUDA index, as PyPI's is CPU-only on Windows). It cuts the
person out first, so the room is left behind. The Deno server runs it once per figure
(`uv run figure/make.py --image … --out ….ply`), as it runs SHARP once per scene. Measured
2026-10-02 on an M5 Pro (docs/research/image-to-3d.md): ~3 s to load, 70-100 s to make, ~11 GB.

Prints one line of JSON: the splat count, and how long it took. The figure stands on the origin,
about 1 unit tall, facing +x, in OpenCV axes (y down), like SHARP's scenes.

The weights (4.2 GB, `VAST-AI/TripoSplat`) come from Hugging Face the first time they're needed:
it says "Downloading TripoSplat" on stderr, then "Downloaded". `--download` fetches them ahead of
time and exits.
"""
import argparse
import json
import logging
import sys
import time
from pathlib import Path

from huggingface_hub import snapshot_download

REPO = 'VAST-AI/TripoSplat'
# 524,288 rather than TripoSplat's cap of 262,144, which is only an input check: past it the
# figure is a little smoother up close, and decoding takes 2-4 s more.
GAUSSIANS = 524288


def weights():
    """The weights' folder in the Hugging Face cache, downloading them on first use."""
    try:
        return snapshot_download(REPO, allow_patterns=['*.safetensors'], local_files_only=True)
    except Exception:
        print('Downloading TripoSplat', file=sys.stderr, flush=True)
        path = snapshot_download(REPO, allow_patterns=['*.safetensors'])
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


def make(image_path, out, gaussians):
    import torch
    sys.path.insert(0, str(Path(__file__).parent / 'triposplat'))
    from triposplat import TripoSplatPipeline

    w = weights()
    dev = device()
    start = time.time()
    pipe = TripoSplatPipeline(
        ckpt_path=f'{w}/diffusion_models/triposplat_fp16.safetensors',
        decoder_path=f'{w}/vae/triposplat_vae_decoder_fp16.safetensors',
        dinov3_path=f'{w}/clip_vision/dino_v3_vit_h.safetensors',
        flux2_vae_encoder_path=f'{w}/vae/flux2-vae.safetensors',
        rmbg_path=f'{w}/background_removal/birefnet.safetensors',
        device=str(dev),
    )
    loaded = time.time()
    # TripoSplat's own defaults: more steps or guidance didn't add detail (they're bounded by its
    # fixed-size latent), and its run() would refuse more than 262,144 Gaussians.
    gen = torch.Generator(device=dev.type).manual_seed(42)
    prepared = pipe.preprocess_image(image_path, erode_radius=1)
    cond = pipe.encode_image(prepared, generator=gen)
    latent = pipe.sample_latent(cond, steps=20, guidance_scale=3.0, shift=3.0, generator=gen)
    figure = pipe.decode_latent(latent['latent'], num_gaussians=gaussians)
    figure.save_ply(out)
    synchronize(dev)
    print(json.dumps({
        'splats': gaussians,
        'seconds': {'load': round(loaded - start, 1), 'make': round(time.time() - loaded, 1)},
    }))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', help='the picture')
    parser.add_argument('--out', help='where to write the .ply')
    parser.add_argument('--gaussians', type=int, default=GAUSSIANS)
    parser.add_argument('--download', action='store_true', help='fetch the weights and exit')
    args = parser.parse_args()
    if args.download:
        return print(f'TripoSplat is downloaded to {weights()}.')
    if not (args.image and args.out):
        parser.error('--image and --out are required')
    logging.disable(logging.WARNING)
    make(args.image, args.out, args.gaussians)


if __name__ == '__main__':
    main()
