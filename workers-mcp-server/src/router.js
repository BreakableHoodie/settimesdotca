import { isAuthorized } from "./auth.js";

// The order is the security property: authorization runs before routing and
// before the MCP handler, for every method and path. An unauthenticated caller
// gets the same bare 401 for /mcp, /.well-known/*, an OPTIONS preflight or a
// path that does not exist, so it learns nothing and reaches nothing.
export async function routeRequest(request, env, ctx, handler) {
  if (!(await isAuthorized(request, env))) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (new URL(request.url).pathname !== "/mcp") {
    return new Response("Not Found", { status: 404 });
  }

  return handler(request, env, ctx);
}
