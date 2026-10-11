export async function onRequestGet(context) {
  const { data } = context;

  // Middleware has already verified the session and populated data.user
  // If we're here, the user is authenticated

  const safeSession = data?.session
    ? {
        expires_at: data.session.expires_at || null,
      }
    : null;

  // A key learns its own role and nothing about the person behind it. data.user
  // on the key path is the CREATOR's identity, and handing their email and name to
  // any key, a viewer one included, tells whoever holds a leaked key which admin
  // to phish (security review, 2026-10-11).
  if (data?.apiKey) {
    return new Response(
      JSON.stringify({
        apiKey: { keyPrefix: data.apiKey.keyPrefix, role: data.apiKey.role },
        authenticated: true,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      user: data.user,
      session: safeSession,
      authenticated: true,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
