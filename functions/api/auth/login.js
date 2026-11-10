import { hashPassword, verifyPassword } from "./_crypto.js";
import { createSession } from "./_session.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB) return Response.json({ error: "قاعدة البيانات غير مربوطة" }, { status: 503 });
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: "بيانات غير صالحة" }, { status: 400 }); }
  const username = String(payload.username || "").trim().toLowerCase();
  const password = String(payload.password || "");
  if (username.length > 254 || !password || password.length > 1024) {
    return Response.json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, { status: 401 });
  }
  const user = await env.DB.prepare("SELECT id, username, name, role, password_hash, active FROM users WHERE username = ?").bind(username).first();
  if (!user || !user.active || !(await verifyPassword(password, user.password_hash))) {
    return Response.json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, { status: 401 });
  }
  if (user.password_hash.startsWith("pbkdf2$")) {
    await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ?")
      .bind(await hashPassword(password), user.id, user.password_hash).run();
  }
  const session = await createSession(env, user.id);
  await env.DB.prepare("INSERT INTO audit_log (user_id, action, entity_type, details) VALUES (?, 'login', 'session', ?)")
    .bind(user.id, JSON.stringify({ username: user.username })).run();
  return Response.json({ user: { id: user.id, username: user.username, name: user.name, role: user.role } }, {
    headers: { "Set-Cookie": session.cookie }
  });
}
