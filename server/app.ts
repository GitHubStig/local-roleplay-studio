export function handler(req: Request): Response {
  const { pathname } = new URL(req.url)

  if (req.method === 'GET' && pathname === '/api/health') {
    return Response.json({ ok: true })
  }

  return Response.json({ error: 'Not found' }, { status: 404 })
}
