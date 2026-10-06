/** Splits a byte stream into lines, without their line endings. */
async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  let buffer = ''
  for await (const chunk of body.pipeThrough(new TextDecoderStream())) {
    buffer += chunk
    let end: number
    while ((end = buffer.indexOf('\n')) !== -1) {
      yield buffer.slice(0, end).replace(/\r$/, '')
      buffer = buffer.slice(end + 1)
    }
  }
  if (buffer) yield buffer
}

/** Splits an NDJSON byte stream (Ollama's) into parsed objects. */
export async function* ndjson(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  for await (const line of lines(body)) {
    if (line.trim()) yield JSON.parse(line)
  }
}

/**
 * The parsed `data:` payloads of a server-sent event stream (the OpenAI API's), up to its
 * `[DONE]`. Each of its events is one line of data.
 */
export async function* sseData(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  for await (const line of lines(body)) {
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (data === '[DONE]') return
    if (data) yield JSON.parse(data)
  }
}
