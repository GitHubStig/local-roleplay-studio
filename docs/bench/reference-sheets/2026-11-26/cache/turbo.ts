/**
 * The Turbo edit's `QwenImage21Cache` (`qwen-image-2.1-turbo-edit.json`), as the workflow stands:
 * the app's own ComfyUI edit (`comfyuiImageGenerator().edit`) with Qwen-Image 2.1 Turbo Edit on
 * the cases given, at each seed, timing each edit (in all, and its steps from the first progress
 * to the last) and watching the PC's free RAM and VRAM (`/system_stats`) while it runs. Run once
 * per setting of the workflow's cache, as the generator reads the workflow from disk each time.
 *
 *   deno run -A turbo.ts <comfy address> <session folder> <out> <label> <seeds> <case>...
 *
 * Each case is `name:picture.png:mask.png|-:instruction`, the files in the session folder (`-` for
 * nothing painted). The results are `<out>/<name>-<label>-seed<seed>.png`.
 */
import { join } from 'node:path'
import { comfyuiImageGenerator } from '../../../../../server/images/comfyui/comfyui.ts'

const [address, folder, out, label, seedList, ...cases] = Deno.args
await Deno.mkdir(out, { recursive: true })
const generator = comfyuiImageGenerator({ address })

interface Stats {
  system: { ram_free: number }
  devices: { vram_free: number }[]
}
const GB = 1024 ** 3
const stats = async (): Promise<Stats> =>
  (await fetch(`${address}/system_stats`, { signal: AbortSignal.timeout(3000) })).json()

for (const c of cases) {
  const [name, picture, mask, ...rest] = c.split(':')
  const instruction = rest.join(':')
  for (const file of [picture, ...(mask === '-' ? [] : [mask])]) {
    await Deno.copyFile(join(folder, file), join(out, file))
  }
  for (const seed of seedList.split(',').map(Number)) {
    let ram = Infinity, vram = Infinity
    let watching = true
    const watch = (async () => {
      while (watching) {
        const s = await stats().catch(() => undefined)
        if (s) {
          ram = Math.min(ram, s.system.ram_free)
          vram = Math.min(vram, s.devices[0].vram_free)
        }
        await new Promise((r) => setTimeout(r, 1000))
      }
    })()
    const started = performance.now()
    let first = 0, last = 0
    const made = await generator.edit(
      {
        model: 'qwen-image-2.1-turbo-edit',
        image: picture,
        ...(mask !== '-' && { mask }),
        instruction,
        seed,
        dir: out,
        name: `${name}-${label}-seed${seed}`,
      },
      new AbortController().signal,
      () => {
        const now = performance.now()
        if (!first) first = now
        last = now
      },
    )
    const took = (performance.now() - started) / 1000
    watching = false
    await watch
    console.log(
      `${name} ${label} seed ${seed}: ${made}, ${took.toFixed(1)} s in all, steps ${
        ((last - first) / 1000).toFixed(1)
      } s, least free RAM ${(ram / GB).toFixed(1)} GB, VRAM ${(vram / GB).toFixed(1)} GB`,
    )
  }
}
