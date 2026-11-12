import { hashPassword } from "../auth/_crypto.js";
import { requireUser, audit, readPayload, validId } from "./_guard.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  const { results } = await env.DB.prepare("SELECT id, username, name, role, active, created_at FROM users ORDER BY id").all();
  return Response.json(results);
}

export async function onRequestPost({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  const payload = await readPayload(request);
  if (!payload) return Response.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const username = String(payload.username || "").trim().toLowerCase();
  const name = String(payload.name || "").trim();
  const password = String(payload.password || "");
  const role = payload.role === "admin" ? "admin" : "editor";
  if (!/^[a-z0-9_-]{3,32}$/.test(username) || name.length < 2 || password.length < 12 || password.length > 1024) {
    return Response.json({ error: "اسم المستخدم الإنجليزي والاسم وكلمة المرور (12 رمزًا على الأقل) مطلوبة" }, { status: 422 });
  }
  const result = await env.DB.prepare("INSERT INTO users (email, username, name, password_hash, role) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
    .bind(`${username}@local.invalid`, username, name, await hashPassword(password), role).run();
  if (!result.meta.changes) return Response.json({ error: "اسم المستخدم مستخدم بالفعل" }, { status: 409 });
  await audit(env, auth.session, "create", "user", username, { role });
  return Response.json({ ok: true }, { status: 201 });
}

export async function onRequestPatch({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  const payload = await readPayload(request);
  if (!payload) return Response.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const id = Number(payload.id);
  if (!validId(id) || id === auth.session.user_id) return Response.json({ error: "لا يمكن تعديل هذا الحساب" }, { status: 422 });
  const name = payload.name === undefined ? null : String(payload.name || "").trim();
  const role = payload.role === undefined ? null : payload.role;
  if ((name !== null && name.length < 2) || (role !== null && !["admin", "editor"].includes(role))) {
    return Response.json({ error: "راجع اسم الحساب ودوره" }, { status: 422 });
  }
  if (payload.active !== undefined && ![true, false, 1, 0].includes(payload.active)) {
    return Response.json({ error: "حالة الحساب غير صالحة" }, { status: 422 });
  }
  const active = payload.active === undefined ? null : Number(payload.active);
  const password = String(payload.password || "");
  if (password && (password.length < 12 || password.length > 1024)) {
    return Response.json({ error: "كلمة المرور يجب أن تكون بين 12 و1024 رمزًا" }, { status: 422 });
  }
  const hash = password ? await hashPassword(password) : null;
  const statements = [env.DB.prepare(`
    UPDATE users SET name = COALESCE(?, name), role = COALESCE(?, role), active = COALESCE(?, active),
      password_hash = COALESCE(?, password_hash), updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(name, role, active, hash, id)];
  if (hash || active === 0) statements.push(
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
    env.DB.prepare("UPDATE device_tokens SET revoked = 1 WHERE user_id = ?").bind(id)
  );
  const [updated] = await env.DB.batch(statements);
  if (!updated.meta.changes) return Response.json({ error: "الحساب غير موجود" }, { status: 404 });
  await audit(env, auth.session, "update", "user", id, { role, active, password_changed: Boolean(hash) });
  return Response.json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  const payload = await readPayload(request);
  if (!payload) return Response.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const id = Number(payload.id);
  if (!validId(id) || id === auth.session.user_id) {
    return Response.json({ error: "لا يمكن حذف هذا الحساب" }, { status: 422 });
  }
  const result = await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
  if (!result.meta.changes) return Response.json({ error: "الحساب غير موجود" }, { status: 404 });
  await audit(env, auth.session, "delete", "user", id);
  return Response.json({ ok: true });
}
