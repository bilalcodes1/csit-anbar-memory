import { hashPassword } from "../auth/_crypto.js";
import { requireUser, audit } from "./_guard.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  const { results } = await env.DB.prepare("SELECT id, username, name, role, active, created_at FROM users ORDER BY id").all();
  return Response.json(results);
}

export async function onRequestPost({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: "بيانات غير صالحة" }, { status: 400 }); }
  const username = String(payload.username || "").trim().toLowerCase();
  const name = String(payload.name || "").trim();
  const password = String(payload.password || "");
  const role = payload.role === "admin" ? "admin" : "editor";
  if (!/^[a-z0-9_-]{3,32}$/.test(username) || name.length < 2 || password.length < 12) {
    return Response.json({ error: "اسم المستخدم الإنجليزي والاسم وكلمة المرور (12 رمزًا على الأقل) مطلوبة" }, { status: 422 });
  }
  await env.DB.prepare("INSERT INTO users (email, username, name, password_hash, role) VALUES (?, ?, ?, ?, ?)")
    .bind(`${username}@local.invalid`, username, name, await hashPassword(password), role).run();
  await audit(env, auth.session, "create", "user", username, { role });
  return Response.json({ ok: true }, { status: 201 });
}

export async function onRequestPatch({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: "بيانات غير صالحة" }, { status: 400 }); }
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id === auth.session.user_id) return Response.json({ error: "لا يمكن تعديل هذا الحساب" }, { status: 422 });
  const existing = await env.DB.prepare("SELECT id, name, role, active FROM users WHERE id = ?").bind(id).first();
  if (!existing) return Response.json({ error: "الحساب غير موجود" }, { status: 404 });
  const name = payload.name === undefined ? existing.name : String(payload.name || "").trim();
  const role = payload.role === undefined ? existing.role : (payload.role === "admin" ? "admin" : "editor");
  const active = payload.active === undefined ? existing.active : (payload.active ? 1 : 0);
  if (name.length < 2) return Response.json({ error: "الاسم مطلوب" }, { status: 422 });
  if (payload.password !== undefined && String(payload.password).length > 0 && String(payload.password).length < 12) {
    return Response.json({ error: "كلمة المرور يجب ألا تقل عن 12 رمزًا" }, { status: 422 });
  }
  if (payload.password !== undefined && String(payload.password).length > 0) {
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET name = ?, password_hash = ?, active = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(name, await hashPassword(String(payload.password)), active, role, id),
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
      env.DB.prepare("UPDATE device_tokens SET revoked = 1 WHERE user_id = ?").bind(id)
    ]);
  } else {
    await env.DB.prepare("UPDATE users SET name = ?, active = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(name, active, role, id).run();
  }
  await audit(env, auth.session, "update", "user", id, { name, role, active, password_changed: Boolean(payload.password) });
  return Response.json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: "بيانات غير صالحة" }, { status: 400 }); }
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id < 1 || id === auth.session.user_id) {
    return Response.json({ error: "لا يمكن حذف هذا الحساب" }, { status: 422 });
  }
  const existing = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(id).first();
  if (!existing) return Response.json({ error: "الحساب غير موجود" }, { status: 404 });
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
  await audit(env, auth.session, "delete", "user", id);
  return Response.json({ ok: true });
}
