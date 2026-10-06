# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy"]
# ///
"""
Builds the 3D demo's meshes from the 2D demo's pictures: runs SHARP (python/sharp/make.py) on Frame 9 and
on its edits (the bright lantern, Elara's half-closed and closed eyes), then splits the scene into
a base and small region meshes that keep the original splats' positions and take only the edits'
colours (SHARP read the brighter picture as slightly different depth, ~5% everywhere), and writes
where the lantern, candle and flame are. Finally compresses each to .sog with PlayCanvas's
splat-transform. Run from anywhere: `uv run docs/bench/idle-animation/3d/build.py`.
"""
import json
import subprocess
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
REPO = HERE.parents[3]
N = 1179648  # SHARP's splats per picture: one per pixel of its grid, in a fixed order
PROPS = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2',
         'rot_0', 'rot_1', 'rot_2', 'rot_3']


def sharp(picture, out):
    subprocess.run(['uv', 'run', '--quiet', str(REPO / 'python/sharp/make.py'), '--image', str(picture),
                    '--out', str(out)], check=True)


def load(path):
    raw = path.read_bytes()
    start = raw.index(b'end_header\n') + len(b'end_header\n')
    splats = np.frombuffer(raw, np.float32, N * 14, start).reshape(N, 14).copy()
    intrinsics = np.frombuffer(raw, np.float32, 9, start + N * 56 + 64).reshape(3, 3)
    return splats, intrinsics


def save(path, splats):
    header = f'ply\nformat binary_little_endian 1.0\nelement vertex {len(splats)}\n'
    header += ''.join(f'property float {p}\n' for p in PROPS) + 'end_header\n'
    path.write_bytes(header.encode() + splats.astype(np.float32).tobytes())


def main():
    pictures = {'scene9': 'open.jpg', 'bright': 'lantern-bright.jpg', 'half': 'half.jpg', 'closed': 'closed.jpg'}
    for name, picture in pictures.items():
        sharp(HERE.parent / picture, HERE / f'{name}.full.ply')
    base, K = load(HERE / 'scene9.full.ply')
    # Each splat's pixel in the 1024² picture, to pick the regions the edits changed.
    u = K[0, 0] * base[:, 0] / base[:, 2] + K[0, 2]
    v = K[1, 1] * base[:, 1] / base[:, 2] + K[1, 2]
    lantern = ((u - 1020) / 220) ** 2 + ((v - 200) / 240) ** 2 <= 1  # the edit's mask
    eyes = ((u - 671) / 45) ** 2 + ((v - 155) / 35) ** 2 <= 1

    def recoloured(name, region):
        edited, _ = load(HERE / f'{name}.full.ply')
        out = base[region].copy()
        out[:, 3:6] = edited[region, 3:6]
        return out

    meshes = {
        'base': base[~(lantern | eyes)],
        'lantern-a': base[lantern],
        'lantern-b': recoloured('bright', lantern),
        'eyes-open': base[eyes],
        'eyes-half': recoloured('half', eyes),
        'eyes-closed': recoloured('closed', eyes),
    }
    for name, splats in meshes.items():
        save(HERE / f'{name}.ply', splats)
        subprocess.run(['npx', '-y', '@playcanvas/splat-transform', '-w', str(HERE / f'{name}.ply'),
                        str(HERE / f'{name}.sog')], check=True)

    def at(px, py, r):
        """Where a light sits: the median of the nearest splats around its pixel."""
        near = (np.abs(u - px) < r) & (np.abs(v - py) < r) & (base[:, 2] > 0)
        p = base[near, :3]
        return np.median(p[p[:, 2] <= np.percentile(p[:, 2], 40)], axis=0).round(4).tolist()

    info = {'fov': 54.03, 'pivot': 1.165, 'lantern': at(1012, 194, 10), 'candle': at(622, 424, 8),
            'flame': at(1012, 196, 6)}
    (HERE / 'scene.json').write_text(json.dumps(info, indent=1) + '\n')


if __name__ == '__main__':
    main()
