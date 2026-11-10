import { getSession, unauthorized } from "./_session.js";

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return unauthorized();
  return Response.json({ id: session.user_id, username: session.username, name: session.name, role: session.role });
}
