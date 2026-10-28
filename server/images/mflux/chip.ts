/** How float16 is chosen: always, never, or by this Mac's chip (`float16On`). */
export const FLOAT16_CHOICES = ['auto', 'on', 'off'] as const
export type Float16 = (typeof FLOAT16_CHOICES)[number]

/**
 * The generation of this Mac's Apple chip (5 for an "Apple M5 Pro"), or null when it isn't one.
 * Asked of macOS once, as the chip can't change while the server runs.
 */
let generation: number | null | undefined
export function chipGeneration(): number | null {
  if (generation !== undefined) return generation
  try {
    const { stdout } = new Deno.Command('sysctl', {
      args: ['-n', 'machdep.cpu.brand_string'],
      stdout: 'piped',
      stderr: 'null',
    }).outputSync()
    generation = Number(/Apple M(\d+)/.exec(new TextDecoder().decode(stdout))?.[1]) || null
  } catch {
    generation = null
  }
  return generation
}

/**
 * Whether `--compute-precision float16` is on. Automatic is on for M1 to M3 and off from M4: mflux
 * says it helps on M1 and M2 (slow bfloat16) and little or nothing on M4 and M5, and on an M5 Pro
 * it made no difference to speed on any of 7 Image Models (docs/research/mflux-upgrade-log.md,
 * 2026-10-28) while changing the picture slightly. M3 is a guess: nobody has measured it.
 */
export function float16On(setting: Float16, chip: number | null = chipGeneration()): boolean {
  return setting === 'auto' ? chip !== null && chip <= 3 : setting === 'on'
}
