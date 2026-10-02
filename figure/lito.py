# /// script
# requires-python = ">=3.13,<3.14"
# dependencies = [
#   "mlx-spatial @ git+https://github.com/appautomaton/mlx-spatial@d2cc98ef7fb2166dc7e3b826b487e80f6f5027dc",
#   "torch",
#   "torchvision",
#   "safetensors",
#   "pillow",
#   "numpy",
#   "tqdm",
#   "huggingface-hub",
# ]
# [tool.uv]
# python-preference = "only-managed"
# ///
"""
Turns the person in a picture into a full 3D figure of Gaussian splats with Apple's LiTo, through
mlx-spatial's MLX port (on the Mac's GPU). The person is cut out first with TripoSplat's BiRefNet
(figure/triposplat/), and LiTo builds them from the cut-out, back included. The Deno server runs it
once per figure (`uv run figure/lito.py --image … --out ….ply`), as it runs TripoSplat. Measured
2026-10-02 on an M5 Pro (docs/research/image-to-3d.md): about a minute, ~313k splats with full
view-dependent colour (spherical harmonics to degree 3), ~78 MB.

Prints one line of JSON: the splat count, and how long it took. The figure is written standing on
the origin, about 1 unit tall, in LiTo's own axes: the viewer stands it up (-90° about x), facing +x
like TripoSplat's.

The weights (LiTo's 4.4 GB, `appautomaton/lito-research-mlx`, under Apple's research-only,
non-commercial license; BiRefNet's 0.4 GB from `VAST-AI/TripoSplat`) come from Hugging Face the
first time they're needed: it says "Downloading LiTo" on stderr, then "Downloaded". `--download`
fetches them ahead of time and exits. Needs Python 3.13 (mlx-spatial's range), which uv fetches.
"""
import argparse
import contextlib
import io
import json
import logging
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
from huggingface_hub import snapshot_download

LITO = 'appautomaton/lito-research-mlx'
RMBG = ('VAST-AI/TripoSplat', 'background_removal/birefnet.safetensors')


def weights():
    """LiTo's and BiRefNet's folders in the Hugging Face cache, downloading them on first use."""
    def fetch(local_only):
        lito = snapshot_download(LITO, local_files_only=local_only)
        rmbg = snapshot_download(RMBG[0], allow_patterns=[RMBG[1]], local_files_only=local_only)
        return lito, f'{rmbg}/{RMBG[1]}'
    try:
        return fetch(True)
    except Exception:
        print('Downloading LiTo', file=sys.stderr, flush=True)
        found = fetch(False)
        print('Downloaded', file=sys.stderr, flush=True)
        return found


def cut_out(image_path, rmbg_path, out_path):
    """The person on transparency, as LiTo reads them (it crops by the alpha itself)."""
    import torch
    from PIL import Image
    sys.path.insert(0, str(Path(__file__).parent / 'triposplat'))
    from triposplat import load_rmbg
    rmbg = load_rmbg(rmbg_path, device=torch.device('mps'), dtype=torch.float16)
    image = Image.open(image_path).convert('RGB')
    rmbg.remove_background(image).save(out_path)
    del rmbg
    torch.mps.empty_cache()


def read_ply(path):
    with open(path, 'rb') as f:
        header = b''
        while not header.endswith(b'end_header\n'):
            header += f.readline()
        data = f.read()
    lines = header.split(b'\n')
    n = int(next(l for l in lines if l.startswith(b'element vertex')).split()[-1])
    props = [l.split()[-1].decode() for l in lines if l.startswith(b'property')]
    return header, props, np.frombuffer(data, np.float32)[:n * len(props)].reshape(n, len(props)).copy()


def make(image_path, out):
    from mlx_spatial.lito import main as lito_main
    lito_root, rmbg_path = weights()
    start = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        cut = f'{tmp}/cut.png'
        cut_out(image_path, rmbg_path, cut)
        raw = f'{tmp}/raw.ply'
        # mlx-spatial prints its own progress and settings on stdout: keep ours the one JSON line.
        said = io.StringIO()
        with contextlib.redirect_stdout(said):
            code = lito_main(['generate', cut, '--root', lito_root, '--output', raw,
                              '--format', 'ply', '--seed', '42'])
        if code:
            why = [l for l in said.getvalue().splitlines() if l.strip()][-3:]
            sys.exit(f'LiTo failed: {" / ".join(why)}')
        header, props, d = read_ply(raw)
    # About 1 unit tall, centred, like TripoSplat's figures; a uniform scale leaves the colour be.
    col = {p: i for i, p in enumerate(props)}
    xyz = d[:, [col['x'], col['y'], col['z']]]
    lo, hi = xyz.min(0), xyz.max(0)
    k = 1 / (hi - lo).max()
    d[:, [col['x'], col['y'], col['z']]] = (xyz - (lo + hi) / 2) * k
    for i in range(3):
        d[:, col[f'scale_{i}']] += np.log(k)
    with open(out, 'wb') as f:
        f.write(header)
        f.write(d.astype(np.float32).tobytes())
    print(json.dumps({'splats': len(d), 'seconds': {'make': round(time.time() - start, 1)}}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', help='the picture')
    parser.add_argument('--out', help='where to write the .ply')
    parser.add_argument('--download', action='store_true', help='fetch the weights and exit')
    args = parser.parse_args()
    if args.download:
        lito, rmbg = weights()
        return print(f'LiTo is downloaded to {lito}, BiRefNet to {rmbg}.')
    if not (args.image and args.out):
        parser.error('--image and --out are required')
    logging.disable(logging.WARNING)
    make(args.image, args.out)


if __name__ == '__main__':
    main()
