import { requireUser, audit } from "./_guard.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const payload = await request.json();
  const batchId = Number(payload.batch_id);
  const fullName = String(payload.full_name || "").trim();
  if (!batchId || fullName.length < 2) return Response.json({ error: "الدفعة واسم الطالب مطلوبان" }, { status: 422 });
  const result = await env.DB.prepare("INSERT INTO students (batch_id, full_name, sort_order, published) VALUES (?, ?, ?, ?)")
    .bind(batchId, fullName, Number(payload.sort_order || 0), payload.published ? 1 : 0).run();
  await audit(env, auth.session, "create", "student", result.meta.last_row_id, payload);
  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}

export async function onRequestPatch({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const payload = await request.json();
  await env.DB.prepare("UPDATE students SET full_name = ?, sort_order = ?, published = ? WHERE id = ?")
    .bind(String(payload.full_name || ""), Number(payload.sort_order || 0), payload.published ? 1 : 0, Number(payload.id)).run();
  await audit(env, auth.session, "update", "student", payload.id, payload);
  return Response.json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  const payload = await request.json();
  await env.DB.prepare("DELETE FROM students WHERE id = ?").bind(Number(payload.id)).run();
  await audit(env, auth.session, "delete", "student", payload.id);
  return Response.json({ ok: true });
}
