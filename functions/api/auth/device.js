import { getSession, unauthorized, forbidden, createSession } from "./_session.js";
import { hashToken, randomToken } from "./_crypto.js";

const DEVICE_DAYS = 90;

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return unauthorized();
  let payload = {};
  try { payload = await request.json(); } catch {}
  const raw = randomToken();
  const expires = new Date(Date.now() + DEVICE_DAYS * 86400000).toISOString();
  await env.DB.prepare("INSERT INTO device_tokens (user_id, token_hash, label, expires_at) VALUES (?, ?, ?, ?)")
    .bind(session.user_id, await hashToken(raw), String(payload.label || "جهاز موثوق"), expires).run();
  return Response.json({ token: raw, expires_at: expires, login_url: `/admin.html?device=${encodeURIComponent(raw)}` }, { status: 201 });
}

export async function onRequestPut({ request, env }) {
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: "بيانات غير صالحة" }, { status: 400 }); }
  const tokenHash = await hashToken(String(payload.token || ""));
  const device = await env.DB.prepare(`
    SELECT device_tokens.id, device_tokens.user_id, users.active
    FROM device_tokens JOIN users ON users.id = device_tokens.user_id
    WHERE token_hash = ? AND revoked = 0 AND expires_at > CURRENT_TIMESTAMP
  `).bind(tokenHash).first();
  if (!device || !device.active) return forbidden();
  await env.DB.prepare("UPDATE device_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(device.id).run();
  const session = await createSession(env, device.user_id);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": session.cookie } });
}

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return unauthorized();
  const { results } = await env.DB.prepare("SELECT id, label, expires_at, revoked, created_at, last_used_at FROM device_tokens WHERE user_id = ? ORDER BY id DESC").bind(session.user_id).all();
  return Response.json(results);
}

export async function onRequestDelete({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return unauthorized();
  const payload = await request.json();
  await env.DB.prepare("UPDATE device_tokens SET revoked = 1 WHERE id = ? AND user_id = ?").bind(Number(payload.id), session.user_id).run();
  return Response.json({ ok: true });
}
