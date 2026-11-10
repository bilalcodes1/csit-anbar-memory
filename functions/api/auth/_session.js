import { randomToken } from "./_crypto.js";

const COOKIE_NAME = "college_memory_session";
const SESSION_DAYS = 7;

function parseCookies(request) {
  return Object.fromEntries((request.headers.get("Cookie") || "").split(";").filter(Boolean).map(part => {
    const index = part.indexOf("=");
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }));
}

export async function createSession(env, userId) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, userId, expires).run();
  return {
    token,
    cookie: `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`
  };
}

export async function getSession(request, env) {
  const token = parseCookies(request)[COOKIE_NAME];
  if (!token || !env.DB) return null;
  const session = await env.DB.prepare(`
    SELECT sessions.id, sessions.user_id, users.email, users.name, users.role
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ? AND sessions.expires_at > CURRENT_TIMESTAMP AND users.active = 1
  `).bind(token).first();
  return session ? { ...session, token } : null;
}

export async function destroySession(request, env) {
  const token = parseCookies(request)[COOKIE_NAME];
  if (token && env.DB) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function unauthorized() {
  return Response.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
}

export function forbidden() {
  return Response.json({ error: "لا تملك صلاحية تنفيذ هذا الإجراء" }, { status: 403 });
}
