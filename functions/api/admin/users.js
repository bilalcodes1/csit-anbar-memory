import { hashPassword } from "../auth/_crypto.js";
import { requireUser, audit } from "./_guard.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  const { results } = await env.DB.prepare("SELECT id, email, name, role, active, created_at FROM users ORDER BY id").all();
  return Response.json(results);
}

export async function onRequestPost({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: "بيانات غير صالحة" }, { status: 400 }); }
  const email = String(payload.email || "").trim().toLowerCase();
  const name = String(payload.name || "").trim();
  const password = String(payload.password || "");
  const role = payload.role === "admin" ? "admin" : "editor";
  if (!email.includes("@") || name.length < 2 || password.length < 12) {
    return Response.json({ error: "الاسم والبريد وكلمة المرور (12 رمزًا على الأقل) مطلوبة" }, { status: 422 });
  }
  await env.DB.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)")
    .bind(email, name, await hashPassword(password), role).run();
  await audit(env, auth.session, "create", "user", email, { role });
  return Response.json({ ok: true }, { status: 201 });
}

export async function onRequestPatch({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  const payload = await request.json();
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id === auth.session.user_id) return Response.json({ error: "لا يمكن تعديل هذا الحساب" }, { status: 422 });
  await env.DB.prepare("UPDATE users SET active = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(payload.active ? 1 : 0, payload.role === "admin" ? "admin" : "editor", id).run();
  await audit(env, auth.session, "update", "user", id, payload);
  return Response.json({ ok: true });
}
