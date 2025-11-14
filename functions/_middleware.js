// Shared middleware for Cloudflare Pages Functions
// Handles CORS, error handling, and common headers

export async function onRequest(context) {
  const { request, env } = context;

  // Allowed origins for CORS (production and development)
  const ALLOWED_ORIGINS = [
    "https://settimes.ca",
    "https://www.settimes.ca",
    "https://dev.settimes.pages.dev",
    "https://settimes.pages.dev",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:8788",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8788",
  ];

  // Check if origin is allowed
  const origin = request.headers.get("Origin");
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  // Add CORS headers for API requests
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "true",
  };

  // Handle preflight requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Continue to the next middleware/handler
    const response = await context.next();

    // Add CORS headers to response
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error) {
    console.error("Middleware error:", error);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  }
}
