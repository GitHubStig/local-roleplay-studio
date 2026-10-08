/**
 * A stand-in ComfyUI for tests: lists `files`, takes a workflow, reports `steps` over the WebSocket,
 * then `finish` ('success', or an error message, or 'hang' until interrupted), sending a picture
 * (`SaveImageWebsocket`) and, with `audio`, an output node's clip (`PreviewAudio`, served by `/view`).
 */
export function fakeComfyUI(
  opts: {
    files?: Record<string, string[]>
    steps?: number
    finish?: string
    /** Once a workflow is queued, stop answering, keeping the port and WebSocket open (a crash). */
    dies?: boolean
    /** A clip the workflow's `out` node made, in temp. */
    audio?: { filename: string; bytes: Uint8Array<ArrayBuffer> }
    /** The custom nodes it has (`/object_info/<node>`). */
    nodes?: string[]
  } = {},
) {
  const queued: Record<string, unknown>[] = []
  const posted: { path: string; body: unknown }[] = []
  const uploads: {
    name: string
    type: string
    subfolder: string
    overwrite: string
    bytes: number
  }[] = []
  const sockets = new Map<string, WebSocket>()
  /** Requests left hanging by a dead ComfyUI, answered when the server closes. */
  const hung: (() => void)[] = []
  const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    const url = new URL(req.url)
    const path = url.pathname
    if (path === '/ws') {
      const { socket, response } = Deno.upgradeWebSocket(req)
      sockets.set(url.searchParams.get('clientId')!, socket)
      return response
    }
    if (opts.dies && queued.length) {
      await new Promise<void>((r) => hung.push(r))
      return new Response(null, { status: 503 })
    }
    if (path === '/system_stats') {
      return Response.json({ system: { comfyui_version: '0.39.1' }, devices: [{ name: 'mps' }] })
    }
    if (path.startsWith('/models/')) {
      return Response.json(opts.files?.[path.slice('/models/'.length)] ?? [])
    }
    if (path.startsWith('/object_info/')) {
      const node = path.slice('/object_info/'.length)
      return Response.json(opts.nodes?.includes(node) ? { [node]: { input: {} } } : {})
    }
    if (path === '/view') {
      return opts.audio && url.searchParams.get('filename') === opts.audio.filename &&
          url.searchParams.get('type') === 'temp'
        ? new Response(opts.audio.bytes)
        : new Response('not found', { status: 404 })
    }
    if (path === '/prompt') {
      const body = await req.json()
      queued.push(body.prompt)
      const promptId = 'p1'
      const socket = sockets.get(body.client_id)!
      const send = (type: string, data: object) =>
        socket.send(JSON.stringify({ type, data: { prompt_id: promptId, ...data } }))
      setTimeout(() => {
        for (let i = 1; i <= (opts.steps ?? 2); i++) {
          send('progress', { value: i, max: opts.steps ?? 2 })
        }
        const finish = opts.finish ?? 'success'
        // A sampler preview (a JPEG) and then the picture (a PNG), as binary image messages.
        const image = (format: number, bytes: number[]) =>
          socket.send(new Uint8Array([0, 0, 0, 1, 0, 0, 0, format, ...bytes]))
        image(1, [255, 216, 255])
        if (finish === 'success') {
          image(2, [137, 80, 78, 71])
          if (opts.audio) {
            send('executed', {
              node: 'out',
              output: { audio: [{ filename: opts.audio.filename, subfolder: '', type: 'temp' }] },
            })
          }
          send('execution_success', {})
          // As ComfyUI: written to the history after it says so, then "executing" with no node.
          setTimeout(() => {
            posted.push({ path: '(in history)', body: null })
            send('executing', { node: null })
          }, 30)
        } else if (finish !== 'hang') {
          send('execution_error', { node_type: 'KSampler', exception_message: finish })
        }
      }, 10)
      return Response.json({ prompt_id: promptId, number: 1, node_errors: {} })
    }
    if (path === '/upload/image') {
      const form = await req.formData()
      const image = form.get('image') as File
      uploads.push({
        name: image.name,
        type: String(form.get('type')),
        subfolder: String(form.get('subfolder') ?? ''),
        overwrite: String(form.get('overwrite')),
        bytes: image.size,
      })
      return Response.json({ name: image.name, subfolder: '', type: form.get('type') })
    }
    if (['/interrupt', '/queue', '/free', '/history'].includes(path)) {
      const body = await req.json()
      posted.push({ path, body })
      if (path === '/interrupt') {
        // As ComfyUI: the prompt stops a moment later ("execution_interrupted"), then it's written
        // to the history, then "executing" with no node says it's done.
        const send = (type: string, data: object) => {
          for (const socket of sockets.values()) socket.send(JSON.stringify({ type, data }))
        }
        setTimeout(() => send('execution_interrupted', { prompt_id: 'p1' }), 50)
        setTimeout(() => {
          posted.push({ path: '(in history)', body: null })
          send('executing', { node: null, prompt_id: 'p1' })
        }, 80)
      }
      return new Response(null, { status: 200 })
    }
    return new Response('not found', { status: 404 })
  })
  return {
    // Not `localhost`: on Windows it tries IPv6 first, and a new connection can take 300 ms or more.
    url: `http://127.0.0.1:${server.addr.port}`,
    queued,
    posted,
    uploads,
    close: () => {
      for (const release of hung) release()
      for (const socket of sockets.values()) socket.close()
      return server.shutdown()
    },
  }
}
