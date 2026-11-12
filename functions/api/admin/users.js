import { hashPassword } from "../auth/_crypto.js";
import { ROOT_ADMIN_USERNAME, isRootAdmin, managedAccount } from "../auth/_accounts.js";
import { forbidden } from "../auth/_session.js";
import { requireUser, readPayload, validId } from "./_guard.js";

const MANAGEABLE_ACCOUNT = `
  users.id = ? AND lower(users.username) IS NOT ?
  AND EXISTS (
    SELECT 1 FROM users AS manager
    WHERE manager.id = ? AND manager.id <> users.id AND manager.active = 1 AND manager.role = 'admin'
      AND (lower(manager.username) = ? OR (users.role = 'editor' AND ? IS NOT 'admin'))
  )
`;

function logUserChange(env, session, action, entityId, details = {}) {
  return env.DB.prepare(`
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
    SELECT ?, ?, 'user', ?, ? WHERE changes() = 1
  `).bind(session.user_id, action, String(entityId), JSON.stringify(details));
}

async function deniedOrMissing(env, id) {
  const account = await env.DB.prepare("SELECT 1 FROM users WHERE id = ?").bind(id).first();
  return account ? forbidden() : Response.json({ error: "الحساب غير موجود" }, { status: 404 });
}

export async function onRequestGet({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  const { results } = await env.DB.prepare("SELECT id, username, name, role, active, created_at FROM users ORDER BY id").all();
  return Response.json(results.map(account => managedAccount(account, auth.session)));
}

export async function onRequestPost({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  const payload = await readPayload(request);
  if (!payload) return Response.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const username = String(payload.username || "").trim().toLowerCase();
  const name = String(payload.name || "").trim();
  const password = String(payload.password || "");
  const role = payload.role ?? "editor";
  if (!/^[a-z0-9_-]{3,32}$/.test(username) || name.length < 2 || password.length < 12 || password.length > 1024) {
    return Response.json({ error: "اسم المستخدم الإنجليزي والاسم وكلمة المرور (12 رمزًا على الأقل) مطلوبة" }, { status: 422 });
  }
  if (role !== "admin" && role !== "editor") {
    return Response.json({ error: "دور الحساب غير صالح" }, { status: 422 });
  }
  if (username === ROOT_ADMIN_USERNAME || (role === "admin" && !isRootAdmin(auth.session))) return forbidden();

  const email = `${username}@local.invalid`;
  const hash = await hashPassword(password);
  const [insert] = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO users (email, username, name, password_hash, role)
      SELECT ?, ?, ?, ?, ? FROM users AS manager
      WHERE manager.id = ? AND manager.active = 1 AND manager.role = 'admin'
        AND (? = 'editor' OR lower(manager.username) = ?)
      ON CONFLICT DO NOTHING RETURNING id, username, name, role, active, created_at
    `).bind(email, username, name, hash, role, auth.session.user_id, role, ROOT_ADMIN_USERNAME),
    logUserChange(env, auth.session, "create", username, { role })
  ]);
  const [user] = insert.results;
  if (!user) {
    const duplicate = await env.DB.prepare("SELECT 1 FROM users WHERE username = ? OR email = ?").bind(username, email).first();
    return duplicate ? Response.json({ error: "اسم المستخدم مستخدم بالفعل" }, { status: 409 }) : forbidden();
  }
  return Response.json({ ok: true, user: managedAccount(user, auth.session) }, { status: 201 });
}

export async function onRequestPatch({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  const payload = await readPayload(request);
  if (!payload) return Response.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const id = Number(payload.id);
  if (!validId(id)) return Response.json({ error: "معرف الحساب غير صالح" }, { status: 422 });
  if (id === auth.session.user_id) return forbidden();
  const name = payload.name === undefined ? null : String(payload.name || "").trim();
  const role = payload.role === undefined ? null : payload.role;
  if ((name !== null && name.length < 2) || (role !== null && !["admin", "editor"].includes(role))) {
    return Response.json({ error: "راجع اسم الحساب ودوره" }, { status: 422 });
  }
  if (role === "admin" && !isRootAdmin(auth.session)) return forbidden();
  if (payload.active !== undefined && ![true, false, 1, 0].includes(payload.active)) {
    return Response.json({ error: "حالة الحساب غير صالحة" }, { status: 422 });
  }
  const active = payload.active === undefined ? null : Number(payload.active);
  const password = String(payload.password || "");
  if (password && (password.length < 12 || password.length > 1024)) {
    return Response.json({ error: "كلمة المرور يجب أن تكون بين 12 و1024 رمزًا" }, { status: 422 });
  }
  const hash = password ? await hashPassword(password) : null;
  const accountParams = [id, ROOT_ADMIN_USERNAME, auth.session.user_id, ROOT_ADMIN_USERNAME, role];
  const statements = [
    env.DB.prepare(`
      UPDATE users SET name = COALESCE(?, name), role = COALESCE(?, role), active = COALESCE(?, active),
        password_hash = COALESCE(?, password_hash), updated_at = CURRENT_TIMESTAMP
      WHERE ${MANAGEABLE_ACCOUNT}
    `).bind(name, role, active, hash, ...accountParams),
    logUserChange(env, auth.session, "update", id, { role, active, password_changed: Boolean(hash) })
  ];
  // Apply the same restriction to session and device changes, including when the account update is denied.
  if (hash || active === 0) statements.push(
    env.DB.prepare(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE ${MANAGEABLE_ACCOUNT})`)
      .bind(...accountParams),
    env.DB.prepare(`UPDATE device_tokens SET revoked = 1 WHERE user_id IN (SELECT id FROM users WHERE ${MANAGEABLE_ACCOUNT})`)
      .bind(...accountParams)
  );
  const [updated] = await env.DB.batch(statements);
  if (!updated.meta.changes) return deniedOrMissing(env, id);
  return Response.json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  const payload = await readPayload(request);
  if (!payload) return Response.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const id = Number(payload.id);
  if (!validId(id)) return Response.json({ error: "معرف الحساب غير صالح" }, { status: 422 });
  if (id === auth.session.user_id) return forbidden();
  const [deleted] = await env.DB.batch([
    env.DB.prepare(`DELETE FROM users WHERE ${MANAGEABLE_ACCOUNT}`)
      .bind(id, ROOT_ADMIN_USERNAME, auth.session.user_id, ROOT_ADMIN_USERNAME, null),
    logUserChange(env, auth.session, "delete", id)
  ]);
  if (!deleted.meta.changes) return deniedOrMissing(env, id);
  return Response.json({ ok: true });
}
