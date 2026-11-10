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
    .bind(session.user_id, await hashToken(raw), String(payload?.label || "جهاز موثوق").slice(0, 100), expires).run();
  return Response.json({ token: raw, expires_at: expires, login_url: `/admin#device=${encodeURIComponent(raw)}` }, { status: 201 });
}

export async function onRequestPut({ request, env }) {
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: "بيانات غير صالحة" }, { status: 400 }); }
  const token = String(payload?.token || "");
  if (!/^[a-f0-9-]{68}$/.test(token)) return forbidden();
  const tokenHash = await hashToken(token);
  const device = await env.DB.prepare(`
    SELECT device_tokens.id, device_tokens.user_id, users.active
    FROM device_tokens JOIN users ON users.id = device_tokens.user_id
    WHERE token_hash = ? AND revoked = 0 AND julianday(expires_at) > julianday('now')
  `).bind(tokenHash).first();
  if (!device || !device.active) return forbidden();
  await env.DB.prepare("UPDATE device_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(device.id).run();
  const session = await createSession(env, device.user_id, device.id);
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
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: "بيانات غير صالحة" }, { status: 400 }); }
  const id = Number(payload?.id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "معرف الجهاز غير صالح" }, { status: 422 });
  const [result] = await env.DB.batch([
    env.DB.prepare("UPDATE device_tokens SET revoked = 1 WHERE id = ? AND user_id = ?").bind(id, session.user_id),
    env.DB.prepare("DELETE FROM sessions WHERE device_id = ? AND user_id = ?").bind(id, session.user_id)
  ]);
  if (!result.meta.changes) return Response.json({ error: "الجهاز غير موجود" }, { status: 404 });
  return Response.json({ ok: true });
}
