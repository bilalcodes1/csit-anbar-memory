import { requireUser, audit } from "../_guard.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const { results } = await env.DB.prepare("SELECT * FROM batches ORDER BY year DESC").all();
  return Response.json(results);
}

export async function onRequestPost({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const payload = await request.json();
  const year = Number(payload.year);
  const title = String(payload.title || "").trim();
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !title) return Response.json({ error: "السنة والعنوان مطلوبان" }, { status: 422 });
  const result = await env.DB.prepare(`
    INSERT INTO batches (year, title, status, quote, description, admission_year, graduation_year, department, cover_key, published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(year, title, payload.status === "graduated" ? "graduated" : "current", String(payload.quote || ""), String(payload.description || ""), payload.admission_year || null, payload.graduation_year || null, String(payload.department || "علوم الحاسوب وتكنولوجيا المعلومات"), payload.cover_key || null, payload.published ? 1 : 0).run();
  await audit(env, auth.session, "create", "batch", result.meta.last_row_id, { year });
  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}
