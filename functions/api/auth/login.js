import { verifyPassword } from "./_crypto.js";
import { createSession } from "./_session.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB) return Response.json({ error: "قاعدة البيانات غير مربوطة" }, { status: 503 });
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: "بيانات غير صالحة" }, { status: 400 }); }
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const user = await env.DB.prepare("SELECT id, email, name, role, password_hash, active FROM users WHERE email = ?").bind(email).first();
  if (!user || !user.active || !(await verifyPassword(password, user.password_hash))) {
    return Response.json({ error: "البريد أو كلمة المرور غير صحيحة" }, { status: 401 });
  }
  const session = await createSession(env, user.id);
  await env.DB.prepare("INSERT INTO audit_log (user_id, action, entity_type, details) VALUES (?, 'login', 'session', ?)")
    .bind(user.id, JSON.stringify({ email: user.email })).run();
  return Response.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } }, {
    headers: { "Set-Cookie": session.cookie }
  });
}
