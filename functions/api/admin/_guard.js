import { getSession, unauthorized, forbidden } from "../auth/_session.js";

export async function requireUser(request, env, adminOnly = false) {
  const session = await getSession(request, env);
  if (!session) return { response: unauthorized() };
  if (adminOnly && session.role !== "admin") return { response: forbidden() };
  return { session };
}

export async function readPayload(request) {
  const value = await request.json().catch(() => null);
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function validId(id) {
  return Number.isSafeInteger(id) && id > 0;
}

export async function audit(env, session, action, entityType, entityId = "", details = {}) {
  await env.DB.prepare(`
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?)
  `).bind(session.user_id, action, entityType, String(entityId), JSON.stringify(details)).run();
}
