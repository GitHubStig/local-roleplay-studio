# Image model setup and prefetching

You do not need to pre-download mflux models to use the app: mflux fetches missing files on first use. ComfyUI models must be installed in ComfyUI before the app can use them.

## mflux

mflux runs on Apple Silicon Macs. Install mflux 0.24 or newer:

```sh
uv tool install --managed-python --python 3.14 mflux
```

On first use, mflux downloads the selected model and any associated files from Hugging Face into `~/.cache/huggingface`. The app reports the download while it is happening; subsequent renders use the cached files. You can let the first render in the app do this—there is no separate preload step. If you want to fetch a model before starting a Session, render one image with that model in a temporary Session; the downloaded files stay in the cache.

Some models are gated. For FLUX.3 Klein and Ideogram 4, accept the model's terms on Hugging Face and sign in on the Mac with `hf auth login` before the first render. Other models may have their own licenses; check the model card before use.

## ComfyUI

The app does not download ComfyUI models. ComfyUI is a separate server, and the app sends it a workflow through its API; the workflow can only use model files already installed in that ComfyUI's model folders.

Install the files using ComfyUI's own model templates or your usual ComfyUI model-install method. [ComfyUI-Manager](https://github.com/Comfy-Org/ComfyUI-Manager#how-to-use) also offers an optional Install Models catalog. The image workflows use files from `models/diffusion_models`, `models/text_encoders`, and `models/vae`; SeedVR2 upscaling also needs its model and VAE files there. The required file names vary by model, and ComfyUI may use different supported quantizations on different machines.

Add the ComfyUI server on Settings' Machines tab, then choose it for rendering or upscaling. The app checks whether it is reachable and reports missing model files; install those files in that ComfyUI instance before trying the job again. A ComfyUI on another machine needs its own model files installed there.

Edits reuse the files for their Image Model, so they do not need a separate model download. For the full list of models supported on each backend, see the [Pictures section in the README](../README.md#pictures-optional).
