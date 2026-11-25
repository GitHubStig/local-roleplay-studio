/**
 * Builds the app as one executable: `deno task compile [--target <triple>]`, such as
 * `--target aarch64-unknown-linux-gnu` for Linux on Apple silicon's containers. Builds the web app
 * and the export page, then compiles the server with what it reads beside its code, into `dist/`
 * (named for the target when one is given). Notes: docs/research/installing.md.
 */
import { fromFileUrl, join } from '@std/path'

const root = fromFileUrl(new URL('../', import.meta.url))
const at = Deno.args.indexOf('--target')
const target = at >= 0 ? Deno.args[at + 1] : undefined
if (at >= 0 && !target) throw new Error('Give a target after --target')

async function run(cwd: string, args: string[]) {
  const { success } = await new Deno.Command(Deno.execPath(), { args, cwd }).output()
  if (!success) Deno.exit(1)
}

await run(join(root, 'web'), ['task', 'build'])
await run(join(root, 'web'), ['task', 'build:export'])
await run(join(root, 'server'), [
  'compile',
  // The dev task's permissions.
  '--allow-net',
  '--allow-read',
  '--allow-write',
  '--allow-run',
  '--allow-env',
  '--allow-sys=hostname,networkInterfaces',
  // What the server reads beside its code: the web app, the export page, the Python tools (copied
  // out for uv, `pythonTools.ts`), the example Scenarios, the prompts and the workflows.
  ...[
    '../web/dist',
    '../web/dist-export',
    '../python',
    '../example-scenarios',
    'prompts',
    'images/comfyui/workflows',
    'voice/comfyui/workflows',
    'video/comfyui/workflows',
    'music/comfyui/workflows',
    'heads/workflows',
  ].flatMap((path) => ['--include', path]),
  // Only the npm packages the server imports, not the whole node_modules (79 MB, not 381).
  '--exclude-unused-npm',
  '--node-modules-dir=none',
  ...(target ? ['--target', target] : []),
  '-o',
  join(root, 'dist', target ? `local-roleplay-studio-${target}` : 'local-roleplay-studio'),
  'main.ts',
])
