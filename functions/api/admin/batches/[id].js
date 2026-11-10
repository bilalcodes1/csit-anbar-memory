import { requireUser, audit } from "../_guard.js";

export async function onRequestPatch({ request, env, params }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const payload = await request.json();
  await env.DB.prepare(`
    UPDATE batches SET year = ?, title = ?, status = ?, quote = ?, description = ?, admission_year = ?,
    graduation_year = ?, department = ?, cover_key = ?, published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(Number(payload.year), String(payload.title || ""), payload.status === "graduated" ? "graduated" : "current", String(payload.quote || ""), String(payload.description || ""), payload.admission_year || null, payload.graduation_year || null, String(payload.department || "علوم الحاسوب وتكنولوجيا المعلومات"), payload.cover_key || null, payload.published ? 1 : 0, Number(params.id)).run();
  await audit(env, auth.session, "update", "batch", params.id, payload);
  return Response.json({ ok: true });
}

export async function onRequestDelete({ request, env, params }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  await env.DB.prepare("DELETE FROM batches WHERE id = ?").bind(Number(params.id)).run();
  await audit(env, auth.session, "delete", "batch", params.id);
  return Response.json({ ok: true });
}
