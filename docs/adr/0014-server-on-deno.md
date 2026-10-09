---
status: accepted
---

# The server runs on Deno

The server is TypeScript run by Deno: no build step, and formatting, linting, tests and a lockfile
built in (`deno fmt`, `deno lint`, `deno test`, `deno.lock`). Node is used only to type-check the
web app (`vue-tsc`).

Checked again on 2026-10-02 and kept. TypeScript isn't the reason: Node 24 runs it too, by stripping
the types. Moving would touch ~100 uses of Deno's APIs (file I/O, `Deno.serve`, `Deno.Command`,
`Deno.env`, signals), 207 `Deno.test` tests (then), the `@std/*` imports (path, assert, yaml,
front-matter), the `URLPattern` routing and the tasks: a day or two of mechanical work for little
gain.

## Considered Options

- **Node.** The larger ecosystem and the more familiar runtime, at the cost above, and with separate
  tools for formatting, linting and tests.
- **Another language later (Go, or WASM).** What would make a port easier isn't the types but the
  shape the server already has: each service behind a small interface with plain data in and out
  (AGENTS.md, "Conventions"), which carries over to any language.

## Consequences

- Everything runs on Deno, the web app's dev server and tests too; Node is needed only for the Vue
  type-check (README, "Known quirks").
- The server's permissions are named in its tasks (`server/deno.json`): net, read, write, run, env,
  and `sys` for this machine's name and addresses only (ADR 0013).
