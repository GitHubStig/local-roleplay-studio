# Turning a Roleplay picture into a 3D scene

Can a pictured Roleplay Frame (a 512–1216 px oil-painting-style image of a whole scene) become an
interactive 3D scene in the picture viewer, one you can rotate, zoom and move around in? This note
surveys the open-source options as of **2026-10-01**, judged for this app: local only, Apple
Silicon (48 GB unified memory, no CUDA), MLX or Mac-first, performance first.

Every claim links to the source that owns it: the project's repo, code, paper or model card. Where
a claim comes from a community port rather than the original authors, it says so. "Not verified"
means exactly that. Nothing here was installed or run. The only local check was reading the
installed mflux 0.20 package.

## Summary

- **The best fit is Apple's SHARP, run through its MLX port.** One feed-forward pass turns one
  image into about 1.2 million Gaussian splats, written as a standard 3DGS `.ply`. Apple's own code
  runs on MPS, and community MLX ports exist in Python and Swift. The catch is the license: the
  weights are for non-commercial research only. The other limit is that it is made for *nearby*
  views (small head movements, not walking around).
- **The cheapest fallback is 2.5D from a depth map.** mflux 0.20 already ships Depth Pro in MLX. A
  displaced mesh or a depth-to-splat cloud can be built in the browser from the picture plus its
  depth map. It is fast and permissively licensed, but edges stretch and nothing exists behind the
  people and objects.
- **Nothing scene-level and walkable runs on a Mac today.** HunyuanWorld 1.0, Voyager and HY-World
  2.0's world generation, NVIDIA Lyra, FlashWorld and WonderWorld all depend on CUDA, and most need
  24–80 GB GPUs or several of them. Of HunyuanWorld, the only MLX code found is
  [mlx-spatial](https://github.com/appautomaton/mlx-spatial)'s port of WorldMirror 2.0. From one
  image it gives a point cloud, not splats or a world.
- **Object models (TRELLIS, Hunyuan3D, SAM 3D) make single objects, not scenes.** Several now have
  MLX ports. They could later lift a Character out of a picture, but they will not rebuild a tavern.
- **For the viewer, use Spark** ([sparkjs.dev](https://sparkjs.dev), MIT, by World Labs). It is
  built on three.js and WebGL2, reads `.ply`, `.spz`, `.splat`, `.ksplat` and `.sog`, can render
  only on demand, and is actively maintained. The other three.js option, GaussianSplats3D, is no
  longer developed by its author.

## What the user will see, plainly

A single picture shows only one side of everything. Any method has to *invent* what the camera
never saw: the back of the staircase, the wall behind the two people, the far side of a candle.
Methods differ in how much they invent and how well:

| Approach | What it invents | What orbiting looks like |
|---|---|---|
| 2.5D depth (mesh or splats) | Nothing | Fine for a few degrees. Then edges smear into "rubber sheets" or tear into holes, and the backs of things are empty. |
| SHARP (layered splats) | A second, hidden layer behind foreground edges | Clean for small head movements. Breaks down when moving far from the original camera ([paper](https://arxiv.org/abs/2512.10685)). |
| Panorama world (HunyuanWorld, HY-World 2.0) | The whole 360° surround, then depth | You can turn all the way around from roughly the original spot. The picture is outpainted, so new content appears. |
| Video-diffusion world (Lyra, Voyager, HY-World 2.0 worldgen) | Many new views along a camera path, fused into 3D | Walkable, but heavy multi-GPU CUDA jobs. |
| Object model (TRELLIS, Hunyuan3D, SAM 3D) | The full back of one object | A complete object with no scene around it. |

For this app, keeping the picture exactly as rendered (its composition, its characters, its
painting) matters more than being able to walk far. That favors SHARP and 2.5D, which keep the
original pixels at the original viewpoint.

## 1. Apple SHARP

[apple/ml-sharp](https://github.com/apple/ml-sharp), from the paper *Sharp Monocular View
Synthesis in Less Than a Second* ([arXiv 2512.10685](https://arxiv.org/abs/2512.10685)).

**What it does.** "Given a single photograph, SHARP regresses the parameters of a 3D Gaussian
representation of the depicted scene … in less than a second on a standard GPU via a single
feedforward pass", and the result is metric (absolute scale)
([README](https://github.com/apple/ml-sharp#readme)). The paper puts the time at about 0.91 s on an
A100. It reports about 1.2 million Gaussians per image on a 768×768 grid with two layers, a
1536×1536 input, and 702 M parameters, of which 340 M are trainable, built on a Depth Pro encoder
([paper](https://arxiv.org/html/2512.10685)). The code agrees: input is resized to 1536×1536
([predict.py](https://github.com/apple/ml-sharp/blob/main/src/sharp/cli/predict.py)), the
initializer uses stride 2 and `num_layers = 2`, and it has inpainting-layer options
([params.py](https://github.com/apple/ml-sharp/blob/main/src/sharp/models/params.py)). The second
layer is what fills in a little of what is hidden behind foreground edges. Raw depth methods lack
it.

**Output.** One 3DGS `.ply` per image, "compatible to various public 3DGS renderers", in OpenCV
axes (x right, y down, z forward), with the scene centre near (0, 0, +z), so third-party viewers
need to rotate and re-centre it ([README](https://github.com/apple/ml-sharp#readme)). Each vertex
has `x y z`, `f_dc_0..2` (degree-0 colour only, no view-dependent spherical harmonics), `opacity`,
`scale_0..2` and `rot_0..3`, plus extra elements for intrinsics, image size and disparity range.
Colours are converted from linear RGB to sRGB on export so that ordinary viewers show them right
([gaussians.py](https://github.com/apple/ml-sharp/blob/main/src/sharp/utils/gaussians.py)). By
arithmetic, 1,179,648 splats × 14 float32 values comes to about 66 MB per `.ply`. That is not
measured. Compressing to `.sog` or `.spz` (see [viewers](#7-web-viewers-for-gaussian-splats))
should shrink it about 10–20× ([PlayCanvas formats](https://developer.playcanvas.com/user-manual/gaussian-splatting/formats/)).

**Focal length matters.** SHARP reads the focal length from EXIF. If none is found, it logs a
warning and assumes 30 mm (35 mm-equivalent)
([io.py](https://github.com/apple/ml-sharp/blob/main/src/sharp/utils/io.py)). mflux renders carry
no camera EXIF, so every picture would be treated as a 30 mm shot unless the app passes a focal
length. The Image Prompt's camera sentence ("wide shot", "close-up") could choose one. This is
untested.

**License.** The code is under Apple's sample-code license, which permits use, modification and
redistribution ([LICENSE](https://github.com/apple/ml-sharp/blob/main/LICENSE)). The **weights**
are under the *Apple Machine Learning Research Model* license, "exclusively for Research Purposes",
which "does not include any commercial exploitation, product development or use in any commercial
product or service" ([LICENSE_MODEL](https://github.com/apple/ml-sharp/blob/main/LICENSE_MODEL)).
For a personal, local, non-commercial app that is arguably within scope. It rules out shipping the
weights in anything commercial.

**Mac status.**

- Official PyTorch: "the gaussians prediction works for all CPU, CUDA, and MPS". Only the optional
  video rendering (`--render`, through gsplat) needs CUDA, and the CLI turns it off on non-CUDA
  devices ([README](https://github.com/apple/ml-sharp#readme),
  [predict.py](https://github.com/apple/ml-sharp/blob/main/src/sharp/cli/predict.py)). The project
  targets Python 3.13
  ([pyproject.toml](https://github.com/apple/ml-sharp/blob/main/pyproject.toml)). The checkpoint
  is 2.81 GB (HTTP `Content-Length` of
  [the checkpoint URL](https://ml-site.cdn-apple.com/models/sharp/sharp_2572gikvuh.pt)).
- MLX, Python and Swift: [starkdmi/ml_sharp_mlx](https://github.com/starkdmi/ml_sharp_mlx)
  (Apache-2.0 code, five commits, December 2025) converts the checkpoint to safetensors and runs
  `generate.py --input … --output out.ply`. It claims to be faster than the PyTorch original but
  publishes no numbers. The fork [agg23/ml_sharp_mlx](https://github.com/agg23/ml_sharp_mlx) adds
  an "aggressive memory management" option to the Swift code
  ([Configuration.swift](https://github.com/agg23/ml_sharp_mlx/blob/main/swift/Sources/SharpMLX/Core/Configuration.swift))
  and hosts a ready fp16 conversion, 1.40 GB
  ([agg23/Sharp-mlx-f16](https://huggingface.co/agg23/Sharp-mlx-f16), weights still under Apple's
  research license). Video rendering in that port depends on gsplat-mps, which is AGPL-3.0, and
  sits on a separate branch ([README](https://github.com/agg23/ml_sharp_mlx#video-rendering)).
- mlx-swift: [mnmly/mlx-swift-ml-sharp](https://github.com/mnmly/mlx-swift-ml-sharp) reports a
  `.ply` numerically matching the Python pipeline. It has six commits and gives no timings.
- Core ML: [pearsonkyle/Sharp-coreml](https://huggingface.co/pearsonkyle/Sharp-coreml) states
  "Inference on an Apple M4 Max takes ~1.9 seconds." That is the only published Apple Silicon
  timing found.
- **Peak memory on a Mac is not published anywhere.** Measure it.

**View range.** The paper aims at "nearby views", that is "natural posture shifts in AR/VR
headsets". It says the approach "need not support substantial travel ('walking around') within
the photograph", and it names synthesis of faraway views as future work
([paper](https://arxiv.org/html/2512.10685)). It was trained on synthetic renders and photographs,
not paintings ([paper](https://arxiv.org/html/2512.10685)). How well it handles oil-painting
textures and stylised anatomy is **not verified** and is the first thing to test.

## 2. HunyuanWorld (Tencent)

All Tencent world models carry a Tencent community license that "DOES NOT APPLY IN THE EUROPEAN
UNION, UNITED KINGDOM AND SOUTH KOREA" and is "EXPRESSLY LIMITED TO THE TERRITORY" (worldwide
excluding those). This is checked in the LICENSE file of
[HunyuanWorld-1.0](https://github.com/Tencent-Hunyuan/HunyuanWorld-1.0/blob/main/LICENSE),
[Voyager](https://github.com/Tencent-Hunyuan/HunyuanWorld-Voyager/blob/main/LICENSE),
[Mirror](https://github.com/Tencent-Hunyuan/HunyuanWorld-Mirror/blob/main/License.txt) and
[HY-World 2.0](https://github.com/Tencent-Hunyuan/HY-World-2.0/blob/main/License.txt), each of
which also has an Acceptable Use Policy. (A summarising fetch of the 1.0 README wrongly reported
"MIT". The LICENSE file is authoritative.)

| Release | What it does | Output | Hardware (as stated) | Mac |
|---|---|---|---|---|
| [HunyuanWorld 1.0](https://github.com/Tencent-Hunyuan/HunyuanWorld-1.0) (Jul 2025) | Text or image → 360° panorama → semantically layered mesh | Panorama PNG, layered mesh (optional Draco) | Tested on PyTorch 2.5 + CUDA 12.4. An FP8 "lite" version targets an RTX 4090 ([README](https://github.com/Tencent-Hunyuan/HunyuanWorld-1.0#readme)) | No. CUDA conda env, FP8 GEMM/attention flags |
| [HunyuanWorld-Voyager](https://github.com/Tencent-Hunyuan/HunyuanWorld-Voyager) (Sep 2025) | Image + camera path → RGB-D video → point cloud | Video, `ply` point cloud | 60 GB minimum, 80 GB recommended, at 540p ([README](https://github.com/Tencent-Hunyuan/HunyuanWorld-Voyager#readme)) | No |
| [HunyuanWorld-Mirror / WorldMirror 1.1](https://github.com/Tencent-Hunyuan/HunyuanWorld-Mirror) (Oct 2025) | Feed-forward reconstruction from multi-view images or video, single image allowed | Point cloud, depth, normals, cameras, 3D Gaussians (`gaussians.ply`) | CUDA 12.4, gsplat ([README](https://github.com/Tencent-Hunyuan/HunyuanWorld-Mirror#readme)) | Official: CPU fallback only. MLX port below |
| [HY-WorldPlay (1.5)](https://github.com/Tencent-Hunyuan/HY-WorldPlay) (Dec 2025) | Real-time interactive world *video* | Pixel video, which HY-World 2.0's README calls non-editable ([README](https://github.com/Tencent-Hunyuan/HY-World-2.0#readme)) | Not checked | Not checked |
| [HY-World 2.0](https://github.com/Tencent-Hunyuan/HY-World-2.0) (Apr–May 2026) | Text or single image → panorama (HY-Pano 2.0) → planned trajectory → WorldStereo 2.0 keyframes → trained 3DGS world. Also WorldMirror 2.0 reconstruction | Meshes, 3DGS, point clouds | World generation: "≥4 GPUs recommended (tested with 8× H20)"; ~17 B WorldStereo, ~80 B HY-Pano 2 ([worldgen README](https://github.com/Tencent-Hunyuan/HY-World-2.0/blob/main/hyworld2/worldgen/README.md), [README](https://github.com/Tencent-Hunyuan/HY-World-2.0#readme)) | No |

Notes:

- HunyuanWorld 1.0's panorama models are LoRAs (478 MB each) on **FLUX.1-dev** and **FLUX.1
  Fill-dev**, loaded through diffusers
  ([demo_panogen.py](https://github.com/Tencent-Hunyuan/HunyuanWorld-1.0/blob/main/demo_panogen.py),
  [model table](https://github.com/Tencent-Hunyuan/HunyuanWorld-1.0#readme)). Scene generation
  then adds Real-ESRGAN, ZIM, Grounding DINO, MoGe and open3d. Its custom panorama pipeline
  (circular blending) is more than a plain LoRA call.
- HY-Pano 2.0 has a lighter backend: a **425 M LoRA on `Qwen/Qwen-Image-Edit-2509`**, at
  1952×960, 40 steps, true-CFG 7.5, with 32 px edge blending
  ([pipeline_with_qwen_image.py](https://github.com/Tencent-Hunyuan/HY-World-2.0/blob/main/hyworld2/panogen/pipeline_with_qwen_image.py),
  [panogen README](https://github.com/Tencent-Hunyuan/HY-World-2.0/blob/main/hyworld2/panogen/README.md)).
  The installed mflux 0.20 knows `qwen-edit-2509` and takes `--lora`
  (`mflux-generate-qwen-edit --help`;
  `mflux/models/common/config/model_config.py`). So an MLX image → 360° panorama step *might* run
  through mflux with Tencent's LoRA. Whether mflux maps that LoRA's keys, and whether the result
  matches without Tencent's edge blending, is **not verified**.
- **The MLX "HunyuanWorld".** No MLX port of HunyuanWorld 1.0, Voyager, WorldPlay or HY-World 2.0
  world generation was found on GitHub or Hugging Face (searched 2026-10-01). The MLX code that
  exists is [appautomaton/mlx-spatial](https://github.com/appautomaton/mlx-spatial) (MIT, 34
  commits, last pushed 2026-09-13). Its `mlx-spatial-hyworld2` command runs **HY-WorldMirror 2.0**
  from Tencent's safetensors without conversion. It accepts one scene image or a folder of frames,
  and outputs camera parameters, depth, normals and `points/points.ply`. The Gaussian head "is not
  release-ready" and is not exposed. Memory profiles run at 392, 518 or 952 px. Its own docs say a
  single image "can run, but it gives the model less geometric evidence"
  ([docs/hyworld2.md](https://github.com/appautomaton/mlx-spatial/blob/main/docs/hyworld2.md)).
  The README marks the pipeline "Stable" but publishes no timings or peak memory
  ([README](https://github.com/appautomaton/mlx-spatial#readme)). If this is the port the user
  found, it reconstructs what the picture shows (a coloured point cloud, which Spark can display)
  but does not build a world. The same package also ports SAM 3D Objects, TRELLIS.2, LiTo,
  MapAnything and Pixal3D (see section 4). Other Tencent MLX ports are of **Hunyuan3D**, the object
  model, not HunyuanWorld (section 4).

## 3. Depth-based 2.5D

### Depth Pro, and what mflux 0.20 does with it

[apple/ml-depth-pro](https://github.com/apple/ml-depth-pro) predicts metric depth and a focal
length from one image. It claims "a 2.25-megapixel depth map in 0.3 seconds on a standard GPU"
([README](https://github.com/apple/ml-depth-pro#readme),
[arXiv 2410.02073](https://arxiv.org/abs/2410.02073)). Code and weights both use Apple's
permissive sample-code license ([LICENSE](https://github.com/apple/ml-depth-pro/blob/main/LICENSE),
README "License"), not the research-only one SHARP uses. Upstream turns the network's
*canonical inverse depth* into metres with `inverse_depth = canonical_inverse_depth * (W / f_px)`,
where `f_px` comes from a separate FOV head when none is given
([depth_pro.py](https://github.com/apple/ml-depth-pro/blob/main/src/depth_pro/depth_pro.py)).

The installed mflux 0.20 (`~/.local/share/uv/tools/mflux/lib/python3.14/site-packages/mflux/models/depth_pro/`)
works differently:

- **CLI:** `mflux-save-depth --image-path X.png [--quantize 3|4|5|6|8]` writes `X_depth.png` next
  to the input (`cli/save_depth.py`). Weights come from Apple's CDN
  (`depth_pro.pt`, 1.90 GB per `Content-Length`; `weights/depth_pro_weight_definition.py`).
  Conv layers are never quantized.
- **No FOV head and no metric depth.** `DepthProModel` is encoder → decoder → one head. The class
  named `FOVHead` is in fact the depth head (conv layers ending in a ReLU, one channel)
  (`model/depth_pro_model.py`, `model/head/fov_head.py`). The output is upstream's
  *canonical inverse depth*, with no focal length.
- **PNG output is min-max normalised inverse depth in 8 bits**: bright means near, and there are
  only 256 levels, resized back to the image size (`model/depth_pro.py`, `_post_process`). That is
  fine as a FLUX Depth control image but coarse for 3D. Through Python,
  `DepthPro().create_depth_map(path)` also returns `depth_array`, the raw float result at the
  internal 1536×1536 resolution, with `min_depth` and `max_depth`. For 3D, use that, not the PNG.
- Input is resized to 1536×1536 with nearest-neighbour sampling
  (`DepthPro._resize`, `DepthProUtil.interpolate`), so non-square pictures are stretched inside the
  model and stretched back.

So mflux gives a good *relative* depth with no extra install, but the app has to choose a focal
length and a depth scale itself.

### Other monocular depth models

| Model | Output | License | Mac / MLX |
|---|---|---|---|
| [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2) | Relative disparity (metric variants exist) | Small: Apache-2.0. Base, Large, Giant: CC-BY-NC-4.0 ([README](https://github.com/DepthAnything/Depth-Anything-V2#license)) | Apple publishes Core ML Small ([apple/coreml-depth-anything-v2-small](https://huggingface.co/apple/coreml-depth-anything-v2-small)). No maintained MLX port found |
| [Depth Anything 3](https://github.com/ByteDance-Seed/Depth-Anything-3) (Nov 2025) | Depth, rays and pose from any number of views. Giant models also predict 3D Gaussians. DA3Metric-Large gives metric depth via `focal * out / 300`. Exports `glb`, `ply`, `npz` | Code Apache-2.0. Small, Base, Metric-Large, Mono-Large: Apache-2.0. Large, Giant, Nested: CC BY-NC 4.0 ([model table](https://github.com/ByteDance-Seed/Depth-Anything-3#readme)) | Gaussian head needs gsplat (CUDA). Community MLX: [mlx-community/DA3Mono-LARGE-MLX](https://huggingface.co/mlx-community/DA3Mono-LARGE-MLX), fixed 504×504 input. Its card says CC-BY-NC-4.0, but upstream lists DA3Mono-Large as Apache-2.0 |
| [MoGe](https://github.com/microsoft/MoGe) 2 / 3 | Metric **point map**, depth, normals, mask and **camera intrinsics** from one image | MIT code ([README](https://github.com/microsoft/MoGe#️-license)). MoGe-2 and MoGe-3 weights tagged MIT on Hugging Face ([moge-3-vitl](https://huggingface.co/Ruicheng/moge-3-vitl)) | Upstream: "macOS is not supported" for MoGe-3 (FlexGEMM → Triton) ([README](https://github.com/microsoft/MoGe#-installation)). MLX: [mlx-community/moge-3-vitl-mlx-fp32](https://huggingface.co/mlx-community/moge-3-vitl-mlx-fp32), via [mlx-vlm's `moge3`](https://github.com/Blaizzy/mlx-vlm/tree/main/mlx_vlm/models/moge3), "validated against the torch reference … <0.2% median relative depth error" (card claim) |

MoGe is the most useful for 3D because it also returns the intrinsics, which removes the guessing
about focal length. HunyuanWorld 1.0 uses MoGe for its panorama depth
([pano_depth_utils.py](https://github.com/Tencent-Hunyuan/HunyuanWorld-1.0/blob/main/hy3dworld/utils/pano_depth_utils.py)).

### Turning one depth map into something you can orbit

Two standard ways, both doable in the browser from the picture plus a depth image or array:

1. **Displaced mesh.** A grid of vertices (for example one per 2–4 pixels) is pushed along each
   pixel's camera ray to its depth, and the picture is used as the texture. Cheap and smooth. At
   depth jumps, such as a person's outline against the far wall, the triangles stretch into
   "rubber sheet" smears. The usual fix is to cut triangles whose depth jump is above a threshold,
   which turns smears into holes.
2. **Back-projected splats.** One small Gaussian per pixel (or per few pixels) at its 3D point,
   sized to cover its footprint. Spark builds splats in JavaScript with `PackedSplats.pushSplat`
   ([procedural splats](https://github.com/sparkjsdev/spark/blob/main/docs/docs/procedural-splats.md)),
   and also loads plain `x y z r g b` point-cloud `.ply` files directly
   ([loading splats](https://github.com/sparkjsdev/spark/blob/main/docs/docs/loading-splats.md)).
   There are no smears, but disoccluded areas show as see-through gaps.

**Filling the holes.** The classic open tool is 3D Photo Inpainting
([vt-vl-lab/3d-photo-inpainting](https://github.com/vt-vl-lab/3d-photo-inpainting), MIT). It
layers the depth, inpaints colour and depth behind edges, and exports an inpainted `.ply` mesh in
"about 2–3 minutes" ([README](https://github.com/vt-vl-lab/3d-photo-inpainting#readme)). It is
pinned to PyTorch 1.4 and CUDA 10.1, so whether it runs on a modern Mac is **not verified**. A
practical home-grown version: mask the disoccluded band, inpaint it with an mflux fill model
(`mflux-generate-fill` is installed), and push the filled pixels back to the background depth.
That is a second layer, which is what SHARP learns to do in one pass.

**How 2.5D helps, and where it stops.** It gives real parallax at once: candle flames, figures and
the staircase separate from the wall as you move. It costs well under a second after the depth
model and needs no new model. It never shows anything the camera did not see. Past roughly 10–20°
of orbit (an estimate, not measured), the stretched edges and empty backs dominate. It is best
presented as "look around the painting" with the orbit clamped, not as a free 3D scene.

## 4. Object-level image-to-3D

These reconstruct **one object** (from a cut-out or a masked object), not a room. On a Roleplay
picture they could lift out a Character or a prop, not the scene.

| Model | Output | License | CUDA-only parts | Mac / MLX |
|---|---|---|---|---|
| [TRELLIS](https://github.com/microsoft/TRELLIS) | Gaussians, radiance field, GLB mesh | MIT | Linux, NVIDIA ≥16 GB. setup installs spconv, kaolin, nvdiffrast, diffoctreerast, mip-splatting, flash-attn/xformers ([README](https://github.com/microsoft/TRELLIS#readme)) | No official Mac support. No MLX port verified |
| [TRELLIS.2](https://github.com/microsoft/TRELLIS.2) (4 B) | Textured PBR mesh (O-Voxel) | MIT (nvdiffrast and nvdiffrec under their own licenses) ([README](https://github.com/microsoft/TRELLIS.2#️-license)) | Linux, NVIDIA ≥24 GB. flash-attn, nvdiffrast, nvdiffrec, CuMesh, FlexGEMM, o-voxel. ~3 s / 17 s / 60 s at 512³ / 1024³ / 1536³ on an H100 ([README](https://github.com/microsoft/TRELLIS.2#readme)) | MLX in [mlx-spatial](https://github.com/appautomaton/mlx-spatial): "textured GLB export works; texture and mesh quality are actively improving" |
| [Hunyuan3D 2.0 / 2mini / 2mv](https://github.com/Tencent-Hunyuan/Hunyuan3D-2) | Mesh (shape) + texture | Tencent Hunyuan 3D 2.0 community license (excludes EU, UK, South Korea) | Official README says it "supports Macos". Shape runs on MPS (`schedulers.py` has MPS handling). The texture rasterizer is a `CUDAExtension` ([setup.py](https://github.com/Tencent-Hunyuan/Hunyuan3D-2/blob/main/hy3dgen/texgen/custom_rasterizer/setup.py)). 6 GB VRAM for shape, 16 GB with texture ([README](https://github.com/Tencent-Hunyuan/Hunyuan3D-2#readme)). 2mini is 0.6 B | MLX/Swift: [ZimengXiong/Hunyuan3D-Swift](https://github.com/ZimengXiong/Hunyuan3D-Swift) (MIT code), shape in 20.9 s at ~5.6 GB, shape plus PBR paint chained 360 s at ~33 GB. Hardware not stated ([README](https://github.com/ZimengXiong/Hunyuan3D-Swift#readme)) |
| [Hunyuan3D 2.1](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1) | Mesh + PBR texture | Tencent Hunyuan 3D 2.1 community license (same territory limit) | 10 GB shape, 21 GB texture, 29 GB together. Custom rasterizer ([README](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1#readme)) | MLX fork: [dgrauet/Hunyuan3D-2.1-mlx](https://github.com/dgrauet/Hunyuan3D-2.1-mlx) (the "MLX Hunyuan" the user found): both stages ported to MLX and checked against PyTorch (to 1e-5); shape peaks ~10 GB at fp16, ~6 GB int8, ~4 GB int4; PBR texture adds a few GB and takes ~9 min for 6 views at 512 px on an M2 Pro; outputs a textured GLB; weights auto-download from [dgrauet/hunyuan3d-2.1-mlx](https://huggingface.co/dgrauet/hunyuan3d-2.1-mlx); updated July 2026 ([README](https://github.com/dgrauet/Hunyuan3D-2.1-mlx#readme)). Object only: the reference picture must show the one subject |
| [SAM 3D Objects](https://github.com/facebookresearch/sam-3d-objects) (Meta) | Image + mask → Gaussian splat or mesh of the object | SAM License ([README](https://github.com/facebookresearch/sam-3d-objects#license)) | CUDA upstream | MLX: [mlx-spatial](https://github.com/appautomaton/mlx-spatial) (called "the strongest object-reconstruction path here"); [Hey-Meadow/meadow-world-builder](https://github.com/Hey-Meadow/meadow-world-builder) (Apache-2.0 + upstream licenses, alpha, ~18–35 s per object on an M1 Max per its README) |

None of these handles a whole scene. A possible later hybrid is to reconstruct the Character with
SAM 3D and place it inside a SHARP or 2.5D background. That is out of scope for a first prototype.

## 5. Other scene-level single-image options

| Method | What it is | License | Hardware (stated) | Mac |
|---|---|---|---|---|
| [NVIDIA Lyra 1](https://github.com/nv-tlabs/lyra/tree/main/Lyra-1) | Feed-forward 3DGS from one image or video, distilled from a camera-controlled video model (Cosmos/GEN3C) | Code Apache-2.0. Models under the NVIDIA Open Model License ([README](https://github.com/nv-tlabs/lyra/blob/main/Lyra-1/README.md)) | Tested only on H100 and A100. ~43 GB peak with full offload | No (CUDA, torchrun) |
| [NVIDIA Lyra 2](https://github.com/nv-tlabs/lyra/tree/main/Lyra-2) | Explorable generative 3D worlds, long-horizon (Wan 2.1-based) | Code Apache-2.0. Models under NVIDIA's *Internal Scientific Research and Development* license ([README](https://github.com/nv-tlabs/lyra/blob/main/Lyra-2/README.md)) | ~9 min per 80 frames (~35 s with DMD) plus ~1 min reconstruction on one H100 80 GB | No |
| [FlashWorld](https://github.com/imlixinyang/FlashWorld) (linked from Tencent's HunyuanWorld news) | Single image or text → 3DGS scene in seconds; exports `.ply` and `.spz` | Code Apache-2.0. Weights CC-BY-NC-SA-4.0 ([model card](https://huggingface.co/imlixinyang/FlashWorld)) | 7 s on A100, 4 s on H100. 51 GB at full speed, 24 GB with offload, 9 GB at ~10 min (A800) ([README](https://github.com/imlixinyang/FlashWorld#readme)) | No (gsplat CUDA build, Triton). Its web demo renders with Spark |
| [WonderWorld](https://github.com/KovenYu/WonderWorld) | Interactive scene extension from one image | No LICENSE file in the repo, so terms are unclear | "requires 48GB GPU memory", CUDA, pytorch3d ([README](https://github.com/KovenYu/WonderWorld#readme)) | No |
| [WonderJourney](https://github.com/KovenYu/WonderJourney) | Perpetual "journey" of generated scenes | MIT | 24 GB, CUDA ([README](https://github.com/KovenYu/WonderJourney#readme)) | No |
| [LGM](https://github.com/3DTopia/LGM) | Object-level multi-view → Gaussians (2024) | MIT | ~10 GB, CUDA ([readme](https://github.com/3DTopia/LGM/blob/main/readme.md)) | No. Object-level anyway |
| [Splatt3R](https://github.com/btsmart/splatt3r) | Two *uncalibrated images* → splats (MASt3R-based) | CC BY-NC 4.0 ([README](https://github.com/btsmart/splatt3r#license)) | CUDA kernels optional | Needs two views, so it does not fit |
| [ZipSplat, mlx-swift port](https://github.com/mnmly/mlx-swift-ZipSplat) | "A handful of unposed photos in, a 3DGS scene out" | Upstream terms not checked | macOS 15+, ~6.1 GB peak footprint (port README) | MLX native, but needs several photos |
| Depth Anything 3 Giant ([repo](https://github.com/ByteDance-Seed/Depth-Anything-3)) | Feed-forward Gaussians from images | CC BY-NC 4.0 | gsplat for the GS head | No MLX GS port found |

SHARP is the only feed-forward, single-image, scene-level splat model found that both runs on a
Mac officially (MPS) and has MLX ports.

## 6. Text straight to Gaussian splats

Several of the systems above also take a text prompt directly: FlashWorld ("from a single image or
text prompt", [README](https://github.com/imlixinyang/FlashWorld#readme)), Lyra 1
([README](https://github.com/nv-tlabs/lyra/blob/main/Lyra-1/README.md)), HunyuanWorld 1.0 and
HY-World 2.0 ([README](https://github.com/Tencent-Hunyuan/HY-World-2.0#readme)). All are CUDA-bound
(see above). Even if they ran locally, going from the **picture** is better for this app. The
Frame's image is already the authoritative render of the Image Prompt, with the Look's art style,
the Characters' faces and clothing, and the exact composition the player saw. A text-to-3D model
would render a *different* tavern with different people. Image-to-3D keeps the picture as the
front view and only adds depth.

## 7. Web viewers for Gaussian splats

| Viewer | License | Formats | Needs three.js | Size (min / gzip, measured from jsDelivr) | Graphics API, mobile | Status |
|---|---|---|---|---|---|---|
| [Spark](https://github.com/sparkjsdev/spark) 2.3.0 (World Labs) | MIT | `.ply` (incl. compressed and plain point clouds), `.spz`, `.splat`, `.ksplat`, `.sog`, `.rad` ([README](https://github.com/sparkjsdev/spark#features), [loading](https://github.com/sparkjsdev/spark/blob/main/docs/docs/loading-splats.md)) | Yes, peer `three >= 0.180` ([package.json](https://github.com/sparkjsdev/spark/blob/main/package.json)) | 2.67 MB / 0.92 MB, Rust/WASM sorter embedded | WebGL2, "targeting 98%+ WebGL2 support", "renders fast even on low-powered mobile devices" (project claims). LoD streaming, on-demand rendering (2.3.0), built-in mouse, touch and keyboard controls ([controls](https://github.com/sparkjsdev/spark/blob/main/docs/docs/controls.md), [CHANGELOG](https://github.com/sparkjsdev/spark/blob/main/CHANGELOG.md)) | Active, 2.3.0 released 2026-09-29 |
| [GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D) 0.4.7 | MIT | `.ply`, `.splat`, `.ksplat` | Yes, peer `three >= 0.160` | 0.27 MB / 0.07 MB | WebGL2, WebXR. Uses `SharedArrayBuffer` by default ([README](https://github.com/mkkellogg/GaussianSplats3D#readme)), which browsers only expose on cross-origin-isolated pages ([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)) | "no longer in active development … I recommend checking out Spark" (author) |
| [PlayCanvas engine](https://github.com/playcanvas/engine) 2.22.6 | MIT | `.ply`, `.sog`, streamed SOG, glTF `KHR_gaussian_splatting`, `.spz` ([formats](https://developer.playcanvas.com/user-manual/gaussian-splatting/formats/)) | No, a whole engine | 2.47 MB / 0.63 MB | WebGL2 and WebGPU ([README](https://github.com/playcanvas/engine#readme)) | Active. Also [SuperSplat](https://github.com/playcanvas/supersplat) editor (MIT) and [splat-transform](https://github.com/playcanvas/splat-transform) CLI (MIT) |
| [antimatter15/splat](https://github.com/antimatter15/splat) | MIT | `.splat` (converts `.ply`) | No, a single-file WebGL demo | Tiny | WebGL | A reference demo. Its README points to Spark |
| [Babylon.js](https://doc.babylonjs.com/features/featuresDeepDive/mesh/gaussianSplatting) 9.x | Apache-2.0 | `.ply`, `.splat`, `.spz`, `.sog` and LoD streaming ([docs source](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/mesh/gaussianSplatting.md)) | No, a whole engine | Modular and tree-shakeable. Not measured | WebGL2 and WebGPU | Active |

three.js 0.186.1 itself (`three.module.min.js` plus `three.core.min.js`) measured 0.81 MB minified
and about 0.19 MB gzipped.

**Fit for this Vue 3 app**, which has no 3D dependencies today: Spark is the best fit. It is one
three.js scene in a `<canvas>` that a Vue component owns. It reads SHARP's `.ply` as is, and also
the compressed `.spz` and `.sog` that `splat-transform` writes
([splat-transform](https://github.com/playcanvas/splat-transform#readme): reads `.ply`, `.ksplat`,
`.splat`; writes `.ply`, `.sog`, `.spz`, `.compressed.ply`). It can render a 2.5D fallback built in
JavaScript, and its on-demand rendering keeps an idle viewer from burning GPU. The ~1.1 MB gzipped
cost of three.js plus Spark should be paid only when the 3D view opens, through a dynamic
`import()` in the viewer component, so the rest of the app is unaffected. PlayCanvas is the
runner-up (WebGPU, smaller than Spark alone, first-party SOG tooling) but brings a whole engine and
its own app loop. SHARP's OpenCV axes (y down) need a 180° rotation about x in any of these viewers
([README](https://github.com/apple/ml-sharp#readme)).

## Ranked recommendation

1. **SHARP via MLX** (the starkdmi Python port to start, or Swift later), viewed in Spark. It is the
   only option that makes real layered splats from one picture on a Mac, about 1–2 s per picture
   (the 1.9 s M4 Max figure is from the Core ML port; MLX is unmeasured). It keeps the picture
   exactly as rendered from the original viewpoint. Accept the limits: nearby views only, and
   research-only weights. Run the official PyTorch MPS build once as a correctness reference.
2. **2.5D from depth, as the fallback and the "instant" mode.** Depth Pro is already in mflux, and
   MoGe-3 through mlx-vlm adds intrinsics (MIT). Build a clamped-orbit displaced mesh or splats in
   the browser. It is the most permissive, fastest and simplest option, and the best fallback where
   SHARP fails on painted styles.
3. **Experimental: a 360° panorama, then depth.** HY-Pano-2's Qwen-Image-Edit-2509 LoRA through
   `mflux-generate-qwen-edit`, then MoGe or Depth Pro on the panorama. This gives look-all-around
   from the original spot, but it outpaints new content, takes a full image-model render (tens of
   seconds or more), is unverified in mflux, and carries Tencent's territory-limited license.
   Worth trying only after 1 and 2.

Not worth pursuing now: HunyuanWorld 1.0, Voyager and HY-World 2.0 world generation, Lyra,
FlashWorld and WonderWorld (CUDA, 24–80 GB or multi-GPU); TRELLIS, TRELLIS.2 and Hunyuan3D (object
only); mlx-spatial's WorldMirror (single image gives a point cloud only, and the Gaussian head is
not ready).

## Prototype plan

**Test pictures (4).** Take them from the kept test Roleplays in `sessions/`, plus one made for the
purpose:

1. The Kael tavern: candle-lit interior, two people on a staircase. Depth layers, thin railings,
   fire.
2. An Elara close-up or medium shot: a face and hair against a background. Checks portrait edges.
3. A wide exterior with sky and distant landscape. Checks infinite depth and the horizon.
4. A dark, low-key interior scene. Checks depth on dim, painterly areas.

Render each at the largest size the app uses (1216 px long side) and at one square size.

**Candidates.**

- **A. SHARP-MLX** (`starkdmi/ml_sharp_mlx`, Python, fp16 weights from `agg23/Sharp-mlx-f16`, or
  self-converted). Run each picture at the default 30 mm and at one focal length guessed from the
  Image Prompt's camera sentence (for example 24 mm wide, 50 mm medium, 85 mm close-up). Also run
  `apple/ml-sharp` on MPS once per picture, as the reference for quality and speed.
- **B. Depth Pro through the mflux Python API** (`DepthPro().create_depth_map`, using
  `depth_array`, not the 8-bit PNG), turned into a displaced mesh and depth-splats in the browser.
  Try it with and without cutting triangles at depth edges.
- **C. MoGe-3 through mlx-vlm** (`mlx-community/moge-3-vitl-mlx-fp32`), giving a metric point map
  plus intrinsics, shown as a point-cloud `.ply` in Spark and as a mesh. Compare with B on the same
  pictures.

**What to measure, per picture and candidate.**

| Measure | How |
|---|---|
| Model load time, and inference time warm | Wall clock. Report cold and warm separately (the app would run it as a one-off CLI process, like mflux, per [ADR 0004](../adr/0004-images-from-the-mflux-cli.md)) |
| Peak memory | `/usr/bin/time -l` (maximum resident set size) plus `mx.get_peak_memory()` inside MLX runs. Also check it fits alongside a loaded Image Model |
| Output size | Raw `.ply` bytes. After `splat-transform` to `.sog` and `.spz`. Splat count |
| Viewer cost | Time to first frame and fps in Spark on the Mac (Safari and Chrome) and on a phone. Time and size of the dynamic import |
| How far it holds | Orbit yaw and pitch, and dolly as a fraction of scene depth, at which artifacts become obvious (smears, holes, floaters, warped faces). Record the angle and a screenshot at 0°, 5°, 10°, 20° and 30° |
| Fidelity | At 0° the view should match the picture. Note colour shifts (linear/sRGB), softening, and whether faces and hands survive |

**Viewer for the prototype.** Spark 2.3 on three.js inside a Vue component, lazily imported. It
starts at SHARP's camera (identity extrinsics, the stored focal length), clamps orbit and dolly to
the range that measurement shows holds, and renders only on demand. Leave PlayCanvas as the
alternative if WebGPU or a smaller bundle turns out to matter.

**Decision rule.** If SHARP holds about ±15° or more with faces intact on the painted pictures,
ship it as the 3D view with the 2.5D mode as the fallback. If it degrades on oil-painting textures,
ship the 2.5D view with clamped orbit, and revisit the panorama route.

## Trial results (measured 2026-10-01)

Four pictures from the Kael tavern Roleplay (1024×1024, Qwen-Image 2.1): the wide room (Frame 0),
the staircase (8), a close-up of two faces (10) and the dark empty room (7), on an M5 Pro Mac.

**SHARP, Apple's official code on the Mac GPU (`sharp predict --device mps`), works well.** About
4 s of inference per picture (plus ~15 s the first time, loading), ~15 GB peak memory, 1,179,648
splats in a 63 MB `.ply`, scene depths sensible (e.g. 0.77–7.06 for the staircase). In Spark, it
stays coherent at 15° and 30° from the original view, with faces intact and the areas the picture
never showed (behind heads, beside the bar) filled with plausible, blurred content. SHARP assumes a
30 mm lens without EXIF; it shows the picture slightly zoomed in.

**The MLX port (starkdmi/ml_sharp_mlx) gave flat output** with the checkpoint Apple publishes now:
every splat at almost the same distance (1.42–1.52), a picture on a card, though its speed (4.7 s)
and memory (15.1 GB) matched. The official code is as fast, so the port isn't needed.

**2.5D from Depth Pro (mflux)** took ~1.7 s per picture (plus ~72 s the first time, downloading its
1.9 GB weights), ~16 GB peak, 0.41M splats (640² grid) in 23 MB. It breaks visibly at 15°: holes and
loose specks wherever something near meets something far. SHARP is clearly better.

Orbiting around the scene's median depth swept near subjects out of frame; orbiting around a nearer
point (the 25th percentile of SHARP's depths) keeps the main subjects in view.

### Compression (for later; the app keeps the lossless `.ply` for now)

Converted with [splat-transform](https://github.com/playcanvas/splat-transform) 3.8.0 (1–2 s per
picture; runnable with `deno run npm:@playcanvas/splat-transform`, so no Node install), loaded in
Spark 2.3.0 in Chromium on the M5 Pro, averaged over the four pictures:

| Format | Size | Load and decode | Drawing | Against the `.ply` (PSNR, same view) |
| ------ | ---- | --------------- | ------- | ----------------------------------- |
| `.ply` | 63 MB | ~118 ms | 60 fps (display cap) | reference |
| `.compressed.ply` | 19 MB (3.3× smaller) | ~114 ms | 60 fps | 57–62 dB |
| `.sog` | 11.6 MB (5.4× smaller) | ~240 ms | 60 fps | 53–57 dB |
| `.spz` | ~14.6 MB | Spark rejected splat-transform's file ("Invalid gzip header") | | |

The formats are lossy (lower-precision positions, colours, sizes and rotations), but above ~40 dB
the difference isn't visible. Smaller than the 10–20× expected above: SHARP writes no higher-order
spherical harmonics, usually the bulk of a splat file. Compression saves only disk and transfer:
Spark unpacks every format into the same 16 bytes per splat on the GPU (~19 MB for 1.18M splats),
so graphics memory and drawing cost are the same; the JavaScript heap stayed at 68 MB. SOG only
costs ~120 ms more to decode, once, in Spark's workers. If space matters later, SOG is the pick
(`.compressed.ply` if opening speed matters more).

## Built into the app (2026-10-01)

Roleplays now have **Make 3D** (docs/design.md). It runs Apple's official code on MPS
(`scene/make.py`), not the MLX port. Each scene is a fresh process: ~11 s on the M5 Pro (3.8 s
loading, 6 s making), plus a one-time install of its Python packages. The trial viewer's camera
was wrong: it assumed a focal length of 1.2 × the width, but SHARP assumes a 30 mm lens on the
picture's diagonal (`convert_focallength` in `sharp/utils/io.py`), about 0.98 × the width of a
square picture: a 54° vertical field of view, not 45°. With that, the first view lines up with
the picture exactly. The app keeps the lossless `.ply`.

### SHARP on Windows with an RTX 4070 (2026-10-07)

Windows 11, RTX 4070 (12 GB), 16 GB of RAM; `python/sharp/make.py` through uv 0.12.23 (Python
3.14.8), PyTorch from PyTorch's CUDA 12.8 index. The first `uv run … --download` fetched PyTorch,
SHARP's code and its 2.8 GB of weights in 3.6 minutes; uv's cache then held 9.8 GB, mostly PyTorch's
CUDA libraries. Hugging Face warned that Windows allows it no symlinks without Developer Mode, so
its cache keeps plain copies (harmless; more disk only when files are shared).

- **It works, picking `cuda` by itself.** From a 2048×2992 upscale: 1,179,648 splats in a 63 MB
  `.ply`, as on the Mac. In the app's viewer the picture view lines up with the picture, and turned
  (even to −62°, twice what SHARP is meant for) the door frame stands in front of the two people,
  breaking up at the edges as expected.
- **Time:** 30.6 s run directly (~8.7 s starting uv and Python and importing PyTorch, 11.6 s
  loading SHARP onto the GPU, 10.3 s making the scene); 31 s through the app; 49 s for the very
  first scene, the new PyTorch's first start. The Mac's is ~11 s (3.8 s loading, 6 s making).
- **Memory is tight: the card peaked at 11.9 GB of 12.3** (0.7 GB in use before). It fits only
  because the app frees Ollama before a scene and ComfyUI frees its models after each job; anything
  else holding the card could push it over (Windows' driver then spills into system RAM, much
  slower, or it fails). Not tried: a smaller picture than 2048 px (SHARP resizes to 1536² anyway,
  so the peak is likely the model's, not the picture's).

### SHARP's limits, as found building it in

- **The splat count is fixed: always 1,179,648.** Every picture is resized to 1536×1536 (a
  portrait or landscape is stretched to that square, and un-stretched in 3D by the camera), and
  splats are predicted on a 768×768 grid (stride 2), two layers per grid point: the visible
  surface, and one behind it that fills in what foreground edges hide. 768 × 768 × 2 = 1,179,648,
  whatever the input's size or shape (`predict.py`'s `internal_shape`, `InitializerParams` in
  `sharp/models/params.py`).
- **Not configurable in practice.** `params.py` has `stride` and `num_layers`, but the published
  weights were trained at stride 2 with two layers; other values don't give more or fewer good
  splats, they break the model. To have fewer, thin them afterwards (drop near-transparent ones,
  or subsample: splat-transform can do both); to have smaller files, compress (SOG, ~5×, above).
  Spark draws all 1.18M at 60 fps on the M5 Pro, so neither is needed on a Mac.
- **The file size follows:** each splat is 14 float32 values (position 3, colour 3, opacity 1,
  scale 3, rotation 4), so 56 bytes, and 66,061,086 bytes per `.ply` with its header and extra
  elements. Colour is degree-0 only (no view-dependent shading), which is also why compression
  saves less here than on trained 3DGS scenes.
- **Nearby views only.** SHARP is made for small head movements, not walking around (the
  paper). In practice: clean at 15°, still coherent at 30°, with what the picture never showed
  (behind people, past the end of a bar) filled with blurred, plausible content that smears
  further out. Panning or zooming far from the original camera shows the edges of the scene.
- **A fixed lens, and it hardly matters.** Without EXIF it assumes 30 mm (35 mm equivalent);
  generated pictures carry none. Tried 2026-10-02 with the lens matched to the Image Prompt's camera
  sentence: a close-up (Frame 18) at 30, 50 and 85 mm and a wide shot (Frame 25) at 30, 24 and
  18 mm, passing SHARP the focal length. SHARP doesn't rebuild the scene for the lens: it keeps
  the same shape and scales its depth in proportion to the focal length (the close-up's orbit
  pivot 0.90, 1.50, 2.55 for 30, 50, 85 mm), and since the viewer orbits at that depth too, a turn
  looks nearly the same. At 30° the close-up's faces held equally at every lens (85 mm turned the
  head a touch more), and the wide shot's views were nearly indistinguishable (18 mm stretched the
  floor slightly). Not worth reading the camera sentence for; the app keeps 30 mm.
- **Weights:** 2.8 GB (`sharp_2572gikvuh.pt`), the same file on Apple's CDN and on Hugging Face
  (`apple/Sharp`, SHA-256 `94211a75…`), under Apple's research-only model license: fine for
  personal use, not for anything commercial. ~15 GB peak while making a scene.

**The upscale as input** (Frame 0 of the Kael tavern, 1024 px original against its 2048 px
SeedVR2 upscale, 2026-10-02): the same splat count and nearly the same depth (orbit pivot 1.03
against 1.01), and turning held up the same, with the same smearing at 30°. What changed was the
surface: SHARP reproduces whatever the upscale did, and here SeedVR2 had smoothed the oil-paint
brushwork into something more photographic and slightly hazier. Since SHARP works at 1536 px, a
2048 px upscale gives it more real pixels than a 1024 px original, so the app uses the upscale
when there is one; whether the upscale itself looks right is the upscaler's doing.

## Panorama trial (2026-10-02): tried, not adopted

The experimental route above, run on the Kael tavern's wide shot (Frame 0, 1024 px): HY-Pano 2.0's
LoRA (810 MB, `tencent/HY-World-2.0`, `HY-Pano-2.0/pytorch_lora_weights.safetensors`) on
Qwen-Image-Edit-2509 through mflux 0.20, at 1952×960, then MoGe (`Ruicheng/moge-vitl`, MIT, on
MPS) for depth, one splat per pixel, viewed from the middle in Spark.

- **mflux loads the LoRA as is**, once its keys are renamed (`transformer.` → `diffusion_model.`):
  every layer it touches (attention, `img_mlp`, `txt_mlp`) maps. Its CFG matches Tencent's
  (norm-rescaled, scale 7.5). Qwen-Image 2.1 can't take it: a different design (32 layers of
  4096 against 2509's 60 of 3072), and text-to-image only in mflux. Qwen-Image-2512 is
  text-to-image too; Qwen-Image-Edit-2511 shares 2509's design, so the LoRA would load, but it
  was trained on 2509 (not tried).
- **mflux's edit command gave a stretched copy, not a panorama.** It encodes the input picture at
  the *output* size, so the square picture arrived already filling the 2:1 frame and was only
  repainted. Tencent's pipeline (diffusers) encodes it at ~1024² in its own shape, as a separate
  picture; with mflux's sizing patched to do the same, the model expanded it into a full room.
  This affects any mflux Qwen edit whose output size differs from its input.
- **Result:** a true 360° (the left and right edges joined about as smoothly as neighbouring
  columns), and looking around from the middle was convincing: a coherent invented room (bar
  and shelves, a candle, a window, a door onto the rain, beamed ceiling) with no gaps. But it
  **repaints the picture**: faces, poses and clothes change, and oil-paint brushwork turns into
  smoother digital painting. One depth layer means turning works and stepping doesn't (holes and
  specks behind people half a metre from the middle); MoGe put the room ~1 m around the viewer,
  so near things looked blurry. MoGe took ~20 s and 8 GB.
- **Cost on the 48 GB M5 Pro:** a 58 GB download (2509 at full precision). Loaded with
  `--quantize 8` it peaked at 62.6 GB, swapped, and ran 81 s per step (50 min for a first run,
  mostly loading). From a saved 8-bit copy (`mflux-save`, LoRA baked in; 35 GB: transformer
  20 GB, text encoder 14 GB kept at full precision): 17 min for 20 steps, 55.6 GB peak, still
  over memory. Tencent's 40 steps would be ~35 min.
- **The download stalled once:** after ~40 min Hugging Face closed the connections and the
  downloader waited on them indefinitely; resuming with `snapshot_download` and
  `HF_HUB_DOWNLOAD_TIMEOUT=60` finished it.

Not adopted: tens of minutes per picture, memory beyond the Mac, and the picture redrawn, against
SHARP's 11 s that keeps the picture exactly. Revisit if a smaller panorama model or a LoRA for a
lighter edit model appears.

## TripoSplat trial (2026-10-02): a Character as a full 3D figure

[TripoSplat](https://github.com/VAST-AI-Research/TripoSplat) (VAST/Tripo, MIT code and weights,
4.2 GB from `VAST-AI/TripoSplat`) makes one *object* from one picture, back included: it cuts the
subject out (BiRefNet), scales it into a 1024×1024 canvas, encodes it (DINOv3 and the FLUX.2
VAE), samples a latent of 8,192 tokens × 16 by flow matching, and decodes Gaussians from it. It
ran unchanged on MPS (`device='mps'`), M5 Pro:

- **Cost:** ~3 s to load; 70–100 s to cut out and sample (20 steps); 2–8 s to decode;
  10.6–13 GB peak. Output `.ply` is 17 MB at 262,144 Gaussians, 34 MB at 524,288, 68 MB at
  1,048,576. It sits on the origin, ~1 unit tall, in OpenCV axes like SHARP (flip with
  `quaternion (1,0,0,0)` in Spark), facing +x.
- **Past the 262,144 cap:** the cap is only `_validate_num_gaussians`; calling `decode_latent`
  directly decoded 524,288 and 1,048,576 without errors or blur. Up close 256k looked slightly
  speckled and 512k smoother; at normal distance all three looked the same. 512k is a fair
  bump; 1M adds little.
- **Steps and guidance don't add detail:** 50 steps instead of 20 gave a different take at the
  same detail, for 2.5× the time; guidance 2, 3, 4 and 5 gave the same figure with small face
  differences, and 5 at 20 steps once broke a figure (her face on the back of the head). The
  detail is bounded by the fixed-size latent; keep the defaults (20 steps, guidance 3).
- **The picture is what matters.** From Roleplay scenes: Kael (Frame 4, alone) and Elara cropped
  from a two-person picture (Frame 19) came out whole but with coarse hair and flecked eyes;
  Elara from Frame 20 lost her forearms where another person overlapped them (the cut-out
  removes what overlaps another person). From pictures made for it (Qwen-Image 2.1, her Look,
  "alone, plain dark grey backdrop, soft even light"): **full length** gave the best figure (dress,
  collar, cuffs, hands, boots, a convincing back) but a blotchy face, which got ~80 px of the
  canvas; **waist-up** gave a clear face (eyes, brows, lips, ear) but a pale ghost of the face on
  the back of her head, the "Janus" failure of single-picture 3D models.
- **What it is for:** one Character to turn all the way round, without the room. SHARP keeps the
  whole picture from near its own view in 11 s; the two do different jobs.

### TripoSplat on Windows with an RTX 4070 (2026-10-07)

The same `python/triposplat/make.py` on CUDA, with the environment SHARP's install left (uv
reused the cached PyTorch). `--download` fetched the 4.16 GB of weights in 91 s (the DINOv3
encoder 1.57 GB, the model 0.69, its encoder 0.64 and decoder 0.54, BiRefNet 0.41, the FLUX.2 VAE
0.31). From a picture of one person (the lighthouse keeper alone by the fire, 2048×2992 upscale):

- **Faster than the Mac:** 50 s run directly (~5 s starting Python, 13.4 s loading, **31.2 s
  making**), 52 s through the app, 64 s the very first time. The Mac's: ~3 s loading, 70-100 s
  making. 524,288 splats in a 34 MB `.ply`.
- **Light on the card:** it peaked at **6.5 GB** of 12.3 (SHARP: 11.9).
- **The first figure kept the whole room** (fireplace, chair, floor): no cut-out had been made.
  The picture came from ComfyUI as RGBA with alpha at 240-255, and TripoSplat skips BiRefNet for
  any alpha below 255, taking the picture as cut out already
  ([research/comfyui.md](comfyui.md), "Alpha"). Handed the picture as RGB, BiRefNet cut out just
  the woman, and the figure turns all the way round: from behind, an invented back of the raincoat
  and hood. mflux's pictures are RGB, so this never showed on the Mac.

## Turnaround trial (2026-10-02): text → four views → mesh

A Character drawn from several sides, then built from all of them, instead of guessing their back
from one picture.

- **Four views in one picture.** Qwen-Image 2.1 (8-bit saved copy) drew a clean turnaround sheet
  of Elara from her Look in one try: "a character turnaround reference sheet … four full-length
  views side by side … front, left side in profile, back, right side in profile … the same dress
  … plain light grey background, soft even lighting". 1536×768 (four 384×768 panels), 116 s,
  38.6 GB peak. Face, hair, dress, collar, cuffs and boots matched across the views. Flaw: **both
  side views faced the same way** (common with turnaround prompts); with a symmetrical outfit,
  mirroring one gives the other side.
- **Transparency:** mflux 0.20's Qwen-Image 2.1 can't output it (the VAE's fourth channel carries
  edit masks; decoding returns RGB). [mflux PR #741](https://github.com/mflux-community/mflux/pull/741)
  (merged 2026-09-27, unreleased; 0.20.0 is from 2026-09-21) adds `mflux-generate-qwen-2.1-edit`,
  reference editing with up to ten pictures, which keeps a transparent input transparent; text-only
  generation is unchanged. A plain backdrop cut out (BiRefNet, rembg) does the same job. The
  reference editing is itself a way to bigger views: one picture per side, each from the front
  view as reference.
- **Views to shape: [Hunyuan3D-2mv](https://huggingface.co/tencent/Hunyuan3D-2mv)** (Tencent,
  March 2025; Tencent community license, not for the EU, UK or South Korea), the only open
  multi-view shape model. It takes named views; its **left** view faces left in the picture
  (checked against its own examples), so `left` was panel 2 mirrored and `right` panel 2. Runs
  on MPS with plain PyTorch (`hy3dgen` from the repo at `f8db630`) but **needs transformers 4.x**:
  5.x renamed its DINOv2 encoder's layers, and the checkpoint won't load. The mesh's outline
  matched each view's cut-out at IoU 0.89–0.95: it followed the drawings, and the back of the head
  was hair, with no ghost face (TripoSplat's single-picture failure).

  | Model | Steps | Octree | Triangles | Time | Peak | Detail |
  |---|---|---|---|---|---|---|
  | mv-turbo | 5 | 380 | 347k | 14 s | ~13 GB | soft bodice, blobby buttons |
  | mv-turbo | 5 | 640 | 961k | 14 s | 23 GB | smoother, same detail |
  | mv (full) | 30 | 380 | 335k | 98 s | 10 GB | pointed waist, distinct buttons, collar edge, cuffs, fingers |
  | mv (full) | 30 | 512 | 590k | 96 s | 15 GB | the same, smoother curves |

  Triangle count (octree resolution) only samples the shape more finely; the full model at ~30
  steps makes finer shapes. The face stayed soft in all of them: it had ~60 px in each 384 px view.
- **Colour:** 2mv makes shape only, and Tencent's texture painter needs CUDA. Projecting the four
  views onto the vertices (each vertex coloured from the views that face it, weighted by how
  directly, with a depth test per view so a torso doesn't take an arm's colour; the 14 % of
  vertices no view saw take the nearest coloured neighbour's) gave a body right all the way round
  (deep blue dress, white lace, boots, dark hair), the most consistent figure of the trials, but a
  blurry face, smeared at 45° where the front and side views meet slightly out of line. An 8 MB
  `.glb`; three.js shows it with its GLTF loader (no splats needed). Two catches in the viewer:
  trimesh's export has no normals (compute them, or the lit shape renders black), and vertex
  colours painted from sRGB pictures must be converted to linear.
- **Bigger views:** the same prompt at 2048×1024 gave 512 px views (229 s): a much clearer face
  and buttons. Both side views faced the same way again (mirrored as before). The full model at
  512 built a 646k-triangle shape from them in 95 s.
- **Baking the views onto the surface as splats** (the user's idea): the mesh as the surface and
  depth test only; 1.5M flat discs scattered evenly over it (`trimesh.sample.sample_surface_even`),
  each sized to the spacing and thin along the normal, coloured from the views with bilinear
  sampling, written as a standard 3DGS `.ply` in three.js axes (80 MB). Softer and more painterly
  than the painted mesh (16 MB, polygon seams up close), and finer colour than vertices can hold.
  ~70 s. The whole pipeline is ~6½ min on the Mac: sheet 229 s, shape 95 s, bake 70 s.
- **What went wrong in baking, and what fixed it:**
  1. *Orientation.* Hunyuan3D's mesh faces +z; a silhouette can't tell front from back (the
     search once picked the back), so fix it rather than search. Seen from +x (90°) the face
     points left in the picture, so the `right` view (nose pointing right) goes at 90° and `left`
     at 270°; swapping them paints each profile onto the back of the head, facing backwards.
  2. *Fit.* Fitting each view to the mesh by its outline's edges let one edge shift a whole view;
     search the shift and scale whose outline best matches the cut-out (IoU 0.92–0.95), and fit the
     head separately for the side views.
  3. *Edges.* A cut-out's outermost pixels are darker; don't colour from the 2 px edge.
  4. *The face.* The real limit: the drawn profile puts her eyes and nose further forward than the
     mesh's flatter face, so wherever a side view paints the face its features land on the cheek
     (a second face, or dark streaks under the eyes). Sharper view weights (power 3, 12, 40; 40
     leaves hard patches), a looser depth test, and choosing views by the surface direction
     averaged over 2–4 cm all left the streaks; a bake from the front view alone was clean.
     Painting the face from the front view only (head points facing forward with dot > 0.3)
     gave a clean face from the front to ~30° but a seam down the cheek in profile; fading the side
     views across the cheek instead brought back a ghost of the profile's eye. Blending can only
     move the mismatch, not remove it.
- **Next step, if it's pursued:** make the side views agree with the mesh: render the bare mesh
  from each side and have the Image Model paint over that render (image to image) in the Look's
  style, so the profile matches the geometry exactly. Warping the side views to the mesh's
  outline would help less.
- **Other Hunyuan3D releases** (Hugging Face, checked 2026-10-02): 2.1 (June 2025) has a better
  shape model and a PBR painter but takes one picture only; Omni (September 2025, on 2.1) adds
  point cloud, voxel, bounding-box and skeleton controls, not views; **2.5 and 3.0 have no open
  weights** (Tencent's site and API only). HunyuanWorld 1.0 is scenes and worlds (panorama, then
  layered meshes), not characters.

### Other models to try (surveyed 2026-10-02)

The strong open models now take one picture and invent the rest, and several paint their own
texture to match their own shape, which avoids the mismatch above (hand-drawn views that disagree
with the geometry). Among open models, only Hunyuan3D-2mv takes several views.

| Model | Gives | On a Mac | License | Notes |
|---|---|---|---|---|
| [TRELLIS.2](https://github.com/microsoft/TRELLIS.2) (Microsoft, Dec 2025, 4B) | one picture → textured mesh (GLB, PBR) | MLX in [mlx-spatial](https://github.com/appautomaton/mlx-spatial) (stable; "texture and mesh quality are actively improving") | MIT | called the best open image-to-3D for 2026, 1–3 min ([comparison](https://www.3daistudio.com/blog/trellis-2-vs-hunyuan-3d-differences-explained), [guide](https://app.cinevva.com/guides/ai-3d-model-generators)) |
| [Hunyuan3D 2.1](https://github.com/dgrauet/Hunyuan3D-2.1-mlx) | one picture → mesh + PBR texture | full MLX port (dgrauet), ~10 GB fp16 | Tencent (not EU/UK/KR) | its painter generates views from the mesh itself, so they line up with it; ~9 min for 6 views at 512 px on an M2 Pro ([paper](https://arxiv.org/html/2506.15442v1)) |
| SAM 3D Objects (Meta) | picture + mask → Gaussian splats | MLX in mlx-spatial, "the strongest object-reconstruction path here" | SAM License | splats directly, no baking |
| LiTo | one picture → Gaussian splats | MLX in mlx-spatial (stable) | not checked | |
| Step1X-3D, TripoSG | one picture → mesh | TripoSG reported to run on Apple Silicon | Apache-2.0 / MIT | rated below TRELLIS.2 and Hunyuan3D 2.1 |

**Tried: Hunyuan3D 2.1's MLX painter on the 2mv mesh** (dgrauet port at `5fe2194`, weights
`dgrauet/hunyuan3d-2.1-mlx`, front view as the reference, six views at 512 px, defaults): 105 s to
load the first time, then **188 s to paint** on the M5 Pro (12.6 GB peak in MLX; it remeshes to
~40k faces first, which needs `pymeshlab` and `fast_simplification`), a 14 MB textured GLB. It
solved the alignment problem (its views come from the mesh) but lost what mattered: white and
grey patches over the dress, collar and back of the head; a younger, generic face with a grey
patch across one eye, not Elara's; flat colour without the painting's brushwork. It sees one
picture and invents the rest, so the likeness goes. One run, at defaults, given a cut-out on
transparency; a centred reference on white might reduce the patches, not restore the likeness.
Worse than baking the turnaround views as splats. (The 2mv environment needed
`transformers==4.57.6` pinned: an unpinned `<5` resolved to 4.12, whose tokenizer needs Rust.)

**Tried: SAM 3D and LiTo through mlx-spatial** (`d2cc98e`, its own Python 3.13 env via `uv
sync`), on the turnaround's front view (512×1024, the cut-out as mask or alpha), 2026-10-02:

| | SAM 3D Objects (Meta) | LiTo (Apple) |
|---|---|---|
| Weights | `appautomaton/sam-3d-objects-mlx`, 13.7 GB, public | `appautomaton/lito-research-mlx`, 4.4 GB, public |
| License | SAM License | Apple research-only, non-commercial (like SHARP) |
| Time | 170 s | ~1 min |
| Output | 237k splats, 16 MB `.ply` | 313k splats, 78 MB `.ply` |
| Body | good from every side; dense lace, saturated blue | clean all round: bodice buttons, collar, cuffs, skirt, boots |
| Face | poor: pale and mask-like, red-rimmed eyes and lips | best of the single-picture models: clear at 35°, a clean profile at 70° (eye, nose, lips, ear, bun) with no seam; a soft smear across the eyes from the front |
| Back of the head | dark hair | the bun, with a grey patch |

LiTo gave the first clean side face of all the trials, from one picture in about a minute; the
turnaround bake's face was sharper from the front to ~30°. A hybrid (LiTo's shape and profile with
the front view baked onto its face) would combine them. Tooling: SAM 3D's script only writes under
its own `outputs/` folder; both write splats turned differently from three.js's axes (both stand up
with −90° about x; SAM 3D then faces +z, LiTo +x).

**Tried: LiTo with the drawn face (two hybrids), 2026-10-02.** LiTo's front face is soft, the
turnaround's front view sharp, so: (1) *recolour* LiTo's front-facing head splats from the front
view (outline fit IoU 0.955 body, 0.905 head; base colour from the drawing, LiTo's 45
view-dependent SH terms faded by the same weight); (2) *graft* SHARP's splats of the front view
in place of LiTo's front-facing head splats, placed across by where they land in the picture and
in depth by SHARP's relief scaled to LiTo's units (SHARP's quaternions turned from OpenCV to
three.js to LiTo's axes, and its scales by the unit change). Both were worse than LiTo alone: the
drawn eyes and brows land on her forehead, because LiTo had her head tipped down while the
drawing looks ahead, so the outlines match but the features inside them don't; the graft added a
ghost of SHARP's face (a shallow shell made for the front) beside the head at 35° and a smear in
profile. Lining them up would need facial landmarks in both and a warp of one onto the other.
**LiTo alone stays the best figure from one picture.**

**Tried: a figure inside its 2.5D scene** (2026-10-04, Kael, Frame 4 of the tavern). SHARP's scene
of the picture with the person's splats removed (those landing inside BiRefNet's mask, grown 4 px,
and not far behind it: 353k of 1.18M), and a TripoSplat or LiTo figure placed in the gap: turned to
face the camera, then scaled and moved (and tried at ±20° of turn) to best cover the mask from the
picture's camera, starting at the person's median depth; written in SHARP's axes so the 2.5D viewer
shows it unchanged. The fits needed no turn: outline overlap 0.90 (TripoSplat) and 0.95 (LiTo).
Both sat naturally in the room at 0° and ±15–30°, lit like it, with no hole visible behind him
(the wall there is dark). At the picture's own view the person is the figure's redrawing, not the
painting (TripoSplat gave him a different, upturned face; LiTo a softer, darker one), and at ±30°
SHARP alone already held him nearly as well. Against SHARP alone it's no gain; against the figure
alone on black, which is how figures show now, it looks far better, and that's the comparison that
counts for the figure buttons. ~10 s to combine (the cut-out, then numpy), plus the scene and the
figure.

**Tried and dropped: SHARP's person in front, the figure behind** (2026-10-04, same Frame). Two
ways to keep the painting's own person from the front: (1) *slice*, SHARP's full scene plus only
the figure's back half, cut by a plane facing the camera (the figures' fronts already sat within
~1 cm of SHARP's person, so the halves met); clean at 0–30° and from behind, but at 60–90° SHARP's
thin front relief went flat and smeared, with a lighter patch at the cut. (2) *Crossfade* in the
viewer: SHARP's person fading into the figure's own front between 20° and 45° (Spark's per-mesh
`opacity`, four meshes: room, figure back, SHARP person, figure front); seamless, and the figure's
profile at 60–90°, but once faded the painting's person becomes a different-looking one. The user
judged it not good. Not pursued.

**The slice again, on Elara** (2026-10-04, a test picture of her alone in the tavern, Qwen-Image
2.1; SHARP, TripoSplat and LiTo on it). Fits: LiTo 0.92 at no turn; TripoSplat 0.88 only when
turned −30° (0.75 held straight: its figure is built ~30° off). From the front to 60° it was the
painting in its room. Behind her, SHARP's wall (the bar and shelves, ~0.4 m+ behind her) stood
between the camera and her, and SHARP's front shell showed through from behind as a reversed,
see-through face. Fixes tried: fading the far wall and SHARP's person out between 70° and 100° by
viewing angle (separate meshes, Spark `opacity`), and a wider turn search. Behind, TripoSplat then
gave a good back (bun, collar, dress); LiTo lost most of her head (it leans forward, into the half
the slice drops). Around 90° the join still showed: two heads with TripoSplat's turned fit, a thin
half-faded figure with LiTo. The user judged it not great. Stopped; a cut that follows each
figure's head and shoulders, not one plane, was the next idea.

**Tried: TRELLIS.2 through mlx-spatial** (weights `microsoft/TRELLIS.2-4B`, 15 GB; it also needs
DINOv3, `facebook/dinov3-vitl16-pretrain-lvd1689m`, gated by Meta with manual approval, and, for
RGB input only, RMBG-2.0, `briaai/RMBG-2.0`, gated and non-commercial: an RGBA cut-out skips it;
and the original TRELLIS's sparse-structure decoder, `ss_dec_conv3d_16l8_fp16`, which isn't in
the TRELLIS.2 download but is bundled with LiTo's). On the front view: **98 s**, a 13 MB textured
GLB (512 pipeline, 1024 texture, 200k faces). The body held together all round, but the face was
the worst of all the models (a flat, doll-like mask with smeared eyes and lips), it gave her a
long ponytail instead of the bun, and the colours were flat and dark with no brushwork; mlx-spatial
says its TRELLIS.2 texture quality is still "actively improving".

[image-to-3dlab](https://github.com/Bingeljell/image-to-3dlab) is a local app running TRELLIS.2,
Hunyuan3D, Pixal3D and SF3D on Apple Silicon side by side. Order to try: TRELLIS.2 and SAM 3D (one
mlx-spatial install) on the turnaround's front view, and Hunyuan3D 2.1's painter on the 2mv mesh,
which keeps the multi-view shape and lets a painter that sees the mesh texture it.

## Could not verify

- SHARP's timing and peak memory on Apple Silicon through MLX or MPS (only the Core ML port's
  1.9 s on an M4 Max is published), and its quality on paintings rather than photographs.
- Whether mflux loads HY-Pano-2's Qwen-Image-Edit LoRA correctly, and whether the panorama matches
  Tencent's pipeline without its edge blending.
- Timings and memory for mlx-spatial's HY-WorldMirror 2.0 port. The repo publishes none.
- Which MLX "HunyuanWorld" the user found. None exists for HunyuanWorld 1.0, Voyager or HY-World
  2.0 world generation. The closest are mlx-spatial's WorldMirror 2.0 port and the Hunyuan3D
  (object) MLX ports.
- Whether 3D Photo Inpainting runs on a current Mac.
- The licenses of WonderWorld (no LICENSE file) and of upstream ZipSplat.
