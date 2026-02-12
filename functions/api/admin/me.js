export async function onRequestGet(context) {
  const { data } = context;

  // Middleware has already verified the session and populated data.user
  // If we're here, the user is authenticated
  
  const safeSession = data?.session
    ? {
        expires_at: data.session.expires_at || null,
      }
    : null;

  return new Response(
    JSON.stringify({
      user: data.user,
      session: safeSession,
      authenticated: true
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
