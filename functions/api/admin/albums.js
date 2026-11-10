import { requireUser, audit } from "./_guard.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const payload = await request.json();
  const batchId = Number(payload.batch_id);
  const title = String(payload.title || "").trim();
  const slug = String(payload.slug || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!batchId || !title || !slug) return Response.json({ error: "الدفعة والعنوان والمعرف مطلوبة" }, { status: 422 });
  const result = await env.DB.prepare("INSERT INTO albums (batch_id, slug, title, subtitle, sort_order, published) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(batchId, slug, title, String(payload.subtitle || ""), Number(payload.sort_order || 0), payload.published ? 1 : 0).run();
  await audit(env, auth.session, "create", "album", result.meta.last_row_id, payload);
  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}

export async function onRequestPatch({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const payload = await request.json();
  await env.DB.prepare("UPDATE albums SET title = ?, subtitle = ?, sort_order = ?, published = ? WHERE id = ?")
    .bind(String(payload.title || ""), String(payload.subtitle || ""), Number(payload.sort_order || 0), payload.published ? 1 : 0, Number(payload.id)).run();
  await audit(env, auth.session, "update", "album", payload.id, payload);
  return Response.json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  const payload = await request.json();
  await env.DB.prepare("DELETE FROM albums WHERE id = ?").bind(Number(payload.id)).run();
  await audit(env, auth.session, "delete", "album", payload.id);
  return Response.json({ ok: true });
}
