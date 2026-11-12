import { requireUser, audit, readPayload, validId } from "./_guard.js";

function studentFields(payload) {
  const name = typeof payload.full_name === "string" ? payload.full_name.trim() : "";
  const sortOrder = Number(payload.sort_order || 0);
  if (name.length < 2 || !Number.isSafeInteger(sortOrder)) return null;
  return [name, sortOrder, payload.published === true || payload.published === 1 ? 1 : 0];
}

export async function onRequestPost({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const payload = await readPayload(request);
  if (!payload) return Response.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const batchId = Number(payload.batch_id);
  const fields = studentFields(payload);
  if (!validId(batchId) || !fields) return Response.json({ error: "راجع الدفعة واسم الطالب وترتيبه" }, { status: 422 });
  const result = await env.DB.prepare(`
    INSERT INTO students (batch_id, full_name, sort_order, published)
    SELECT id, ?, ?, ? FROM batches WHERE id = ?
  `).bind(...fields, batchId).run();
  if (!result.meta.changes) return Response.json({ error: "الدفعة غير موجودة" }, { status: 404 });
  await audit(env, auth.session, "create", "student", result.meta.last_row_id, { batch_id: batchId });
  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}

export async function onRequestPatch({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const payload = await readPayload(request);
  if (!payload) return Response.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const id = Number(payload.id);
  const fields = studentFields(payload);
  if (!validId(id) || !fields) return Response.json({ error: "راجع اسم الطالب وترتيبه" }, { status: 422 });
  const result = await env.DB.prepare("UPDATE students SET full_name = ?, sort_order = ?, published = ? WHERE id = ?")
    .bind(...fields, id).run();
  if (!result.meta.changes) return Response.json({ error: "الاسم غير موجود" }, { status: 404 });
  await audit(env, auth.session, "update", "student", id);
  return Response.json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  const payload = await readPayload(request);
  if (!payload) return Response.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const id = Number(payload.id);
  if (!validId(id)) return Response.json({ error: "معرف الاسم غير صالح" }, { status: 422 });
  const result = await env.DB.prepare("DELETE FROM students WHERE id = ?").bind(id).run();
  if (!result.meta.changes) return Response.json({ error: "الاسم غير موجود" }, { status: 404 });
  await audit(env, auth.session, "delete", "student", id);
  return Response.json({ ok: true });
}
