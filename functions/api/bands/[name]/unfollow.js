// GET /api/bands/:name/unfollow?token=...
// Deletes the band follow associated with the unsubscribe token.
// Returns 200 regardless of whether the token exists (avoid enumeration).

export async function onRequestGet(context) {
  const { request, env } = context
  const { DB } = env

  try {
    const url = new URL(request.url)
    const token = url.searchParams.get('token')

    if (!token || token.length > 256) {
      return new Response('Invalid token.', { status: 400, headers: { 'Content-Type': 'text/plain' } })
    }

    await DB.prepare('DELETE FROM band_follows WHERE unsubscribe_token = ?').bind(token).run()

    return new Response(
      '<html><body style="font-family:sans-serif;padding:2rem"><h2>Unfollowed</h2><p>You have been removed from this band\'s follower list.</p></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    )
  } catch (err) {
    console.error('[band-unfollow] Error:', err)
    return new Response('An error occurred.', { status: 500, headers: { 'Content-Type': 'text/plain' } })
  }
}
