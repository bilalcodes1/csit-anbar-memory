import { getSession, unauthorized } from "./_session.js";
import { accountIdentity } from "./_accounts.js";

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return unauthorized();
  return Response.json(accountIdentity(session, session.user_id));
}
