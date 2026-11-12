import { requireUser, audit, readPayload, validId } from "./_guard.js";

function albumFields(payload) {
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const subtitle = typeof payload.subtitle === "string" ? payload.subtitle.trim() : "";
  const sortOrder = Number(payload.sort_order || 0);
  if (!title || title.length > 160 || !Number.isSafeInteger(sortOrder)) return null;
  return [title, subtitle, sortOrder, payload.published === true || payload.published === 1 ? 1 : 0];
}

export async function onRequestPost({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const payload = await readPayload(request);
  if (!payload) return Response.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const batchId = Number(payload.batch_id);
  const slug = typeof payload.slug === "string" ? payload.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-") : "";
  const fields = albumFields(payload);
  if (!validId(batchId) || !slug || !fields) {
    return Response.json({ error: "راجع الدفعة والعنوان والمعرف والترتيب" }, { status: 422 });
  }
  const result = await env.DB.prepare(`
    INSERT INTO albums (batch_id, slug, title, subtitle, sort_order, published)
    SELECT id, ?, ?, ?, ?, ? FROM batches WHERE id = ?
    ON CONFLICT(batch_id, slug) DO NOTHING
  `).bind(slug, ...fields, batchId).run();
  if (!result.meta.changes) {
    const batch = await env.DB.prepare("SELECT id FROM batches WHERE id = ?").bind(batchId).first();
    return batch ? Response.json({ error: "معرف الألبوم مستخدم في هذه الدفعة" }, { status: 409 })
      : Response.json({ error: "الدفعة غير موجودة" }, { status: 404 });
  }
  await audit(env, auth.session, "create", "album", result.meta.last_row_id, { batch_id: batchId });
  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}

export async function onRequestPatch({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const payload = await readPayload(request);
  if (!payload) return Response.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const id = Number(payload.id);
  const fields = albumFields(payload);
  if (!validId(id) || !fields) return Response.json({ error: "راجع عنوان الألبوم وترتيبه" }, { status: 422 });
  const result = await env.DB.prepare("UPDATE albums SET title = ?, subtitle = ?, sort_order = ?, published = ? WHERE id = ?")
    .bind(...fields, id).run();
  if (!result.meta.changes) return Response.json({ error: "الألبوم غير موجود" }, { status: 404 });
  await audit(env, auth.session, "update", "album", id);
  return Response.json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  const payload = await readPayload(request);
  if (!payload) return Response.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const id = Number(payload.id);
  if (!validId(id)) return Response.json({ error: "معرف الألبوم غير صالح" }, { status: 422 });
  const result = await env.DB.prepare("DELETE FROM albums WHERE id = ?").bind(id).run();
  if (!result.meta.changes) return Response.json({ error: "الألبوم غير موجود" }, { status: 404 });
  await audit(env, auth.session, "delete", "album", id);
  return Response.json({ ok: true });
}
