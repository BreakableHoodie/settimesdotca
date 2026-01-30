export async function onRequestGet(context) {
  const { data } = context;

  // Middleware has already verified the session and populated data.user
  // If we're here, the user is authenticated
  
  return new Response(
    JSON.stringify({
      user: data.user,
      session: data.session,
      authenticated: true
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
