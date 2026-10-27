/** A PNG's width and height, from its header. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 24 || view.getUint32(12) !== 0x49484452) throw new Error('Not a PNG')
  return { width: view.getUint32(16), height: view.getUint32(20) }
}
