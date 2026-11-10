import { parseBatch } from "./_fields.js";
import { requireUser, audit } from "../_guard.js";

export async function onRequestPatch({ request, env, params }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "معرف الدفعة غير صالح" }, { status: 422 });
  const { values, response } = await parseBatch(request, env);
  if (response) return response;
  const [year] = values;
  const result = await env.DB.prepare(`
    UPDATE OR IGNORE batches SET year = ?, title = ?, status = ?, quote = ?, description = ?, admission_year = ?,
    graduation_year = ?, department = ?, cover_key = ?, published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(...values, id).run();
  if (!result.meta.changes) {
    const existing = await env.DB.prepare("SELECT id FROM batches WHERE id = ?").bind(id).first();
    return existing ? Response.json({ error: "هذه السنة موجودة بالفعل" }, { status: 409 })
      : Response.json({ error: "الدفعة غير موجودة" }, { status: 404 });
  }
  await audit(env, auth.session, "update", "batch", id, { year });
  return Response.json({ ok: true });
}

export async function onRequestDelete({ request, env, params }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "معرف الدفعة غير صالح" }, { status: 422 });
  const result = await env.DB.prepare("DELETE FROM batches WHERE id = ?").bind(id).run();
  if (!result.meta.changes) return Response.json({ error: "الدفعة غير موجودة" }, { status: 404 });
  await audit(env, auth.session, "delete", "batch", params.id);
  return Response.json({ ok: true });
}
