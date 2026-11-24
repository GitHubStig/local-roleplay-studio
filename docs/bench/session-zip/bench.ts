/**
 * How fast, how small and how hard on the CPU a Session export is at each compression setting:
 * stored, zip.js's deflate at levels 1 and 6, the runtime's own deflate (`CompressionStream`), and
 * what's compressed already stored with the rest deflated by the runtime.
 * Zips one Session's folder into a sink that only counts bytes, so nothing is written, and reads
 * the Session only. Each setting is run twice and the second kept, so the files are in the OS's
 * cache for each alike.
 *
 *   deno run --allow-read --allow-sys docs/bench/session-zip/bench.ts <Session folder>
 */
import process from 'node:process'
import {
  deflateUncompressed,
  exportedFiles,
  zipFiles,
  type ZipOptions,
} from '../../../server/manager/zip.ts'
import { partOf } from '../../../server/sessionParts.ts'

const dir = Deno.args[0]
if (!dir) throw new Error('Give a Session folder')

const SETTINGS: [string, ZipOptions][] = [
  ['stored', { level: 0 }],
  ['deflate 1 (zip.js)', { level: 1 }],
  ['deflate 6 (zip.js)', { level: 6 }],
  ['deflate (native)', { level: 6, native: true }],
  ['stored, the rest deflated (native)', { level: deflateUncompressed(6), native: true }],
]

const files = await exportedFiles(dir)
const total = files.reduce((n, f) => n + f.size, 0)
const sizeOf = new Map(files.map((f) => [f.path, f.size]))
const mb = (n: number) => (n / 1e6).toFixed(1)
console.log(`${files.length} files, ${mb(total)} MB, on ${Deno.build.os} ${Deno.build.arch}\n`)
console.log('| Setting | Seconds | MB/s | CPU seconds | Zip MB | Of the files | By part (zip / files) |')
console.log('|---|---|---|---|---|---|---|')

async function run(options: ZipOptions) {
  const byPart = new Map<string, [number, number]>()
  const { stream } = zipFiles(dir, files, {
    ...options,
    onEntry: (path, compressed) => {
      const part = partOf(path) ?? 'text'
      const [z, f] = byPart.get(part) ?? [0, 0]
      byPart.set(part, [z + compressed, f + sizeOf.get(path)!])
    },
  })
  const cpu = process.cpuUsage()
  const start = performance.now()
  let bytes = 0
  for await (const chunk of stream) bytes += chunk.length
  const seconds = (performance.now() - start) / 1000
  const used = process.cpuUsage(cpu)
  return { seconds, cpu: (used.user + used.system) / 1e6, bytes, byPart }
}

for (const [name, options] of SETTINGS) {
  await run(options)
  const r = await run(options)
  const parts = [...r.byPart].map(([p, [z, f]]) => `${p} ${((z / f) * 100).toFixed(0)}%`).join(', ')
  console.log(
    `| ${name} | ${r.seconds.toFixed(1)} | ${(total / 1e6 / r.seconds).toFixed(0)} | ${
      r.cpu.toFixed(1)
    } | ${mb(r.bytes)} | ${((r.bytes / total) * 100).toFixed(1)}% | ${parts} |`,
  )
}
