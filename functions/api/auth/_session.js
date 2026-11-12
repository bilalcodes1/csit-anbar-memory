import { randomToken } from "./_crypto.js";

const COOKIE_NAME = "college_memory_session";
const SESSION_DAYS = 7;

function sessionToken(request) {
  const cookie = (request.headers.get("Cookie") || "").split(";").map(part => part.trim())
    .find(part => part.startsWith(`${COOKIE_NAME}=`));
  const token = cookie?.slice(COOKIE_NAME.length + 1);
  return /^[a-f0-9-]{68}$/.test(token || "") ? token : null;
}

export function prepareSession(env, userId, deviceId = null) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  return {
    insert: env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at, device_id) VALUES (?, ?, ?, ?)")
      .bind(token, userId, expires, deviceId),
    cookie: `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`
  };
}

export async function getSession(request, env) {
  const token = sessionToken(request);
  if (!token || !env.DB) return null;
  const session = await env.DB.prepare(`
    SELECT sessions.id, sessions.user_id, users.username, users.name, users.role
    FROM sessions JOIN users ON users.id = sessions.user_id
    LEFT JOIN device_tokens ON device_tokens.id = sessions.device_id
    WHERE sessions.id = ? AND julianday(sessions.expires_at) > julianday('now') AND users.active = 1
      AND (sessions.device_id IS NULL OR (device_tokens.revoked = 0 AND julianday(device_tokens.expires_at) > julianday('now')))
  `).bind(token).first();
  return session ? { ...session, token } : null;
}

export async function destroySession(request, env) {
  const token = sessionToken(request);
  if (token && env.DB) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function unauthorized() {
  return Response.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
}

export function forbidden() {
  return Response.json({ error: "لا تملك صلاحية تنفيذ هذا الإجراء" }, { status: 403 });
}
