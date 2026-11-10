import { parseBatch } from "./_fields.js";
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
  const { values, response } = await parseBatch(request, env);
  if (response) return response;
  const [year] = values;
  const result = await env.DB.prepare(`
    INSERT INTO batches (year, title, status, quote, description, admission_year, graduation_year, department, cover_key, published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(year) DO NOTHING
  `).bind(...values).run();
  if (!result.meta.changes) return Response.json({ error: "هذه السنة موجودة بالفعل" }, { status: 409 });
  await audit(env, auth.session, "create", "batch", result.meta.last_row_id, { year });
  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}
