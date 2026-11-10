import { destroySession } from "./_session.js";

export async function onRequestPost({ request, env }) {
  return new Response(null, { status: 204, headers: { "Set-Cookie": await destroySession(request, env) } });
}
