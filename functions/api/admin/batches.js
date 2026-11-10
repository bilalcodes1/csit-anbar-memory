import { requireAdmin } from "./_auth.js";

export async function onRequestPost({ request, env }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  if (!env.DB) return Response.json({ error: "قاعدة البيانات غير مربوطة" }, { status: 503 });

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "بيانات JSON غير صالحة" }, { status: 400 });
  }

  const year = Number(payload.year);
  const title = String(payload.title || "").trim();
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !title) {
    return Response.json({ error: "السنة والعنوان مطلوبان" }, { status: 422 });
  }

  await env.DB.prepare(`
    INSERT INTO batches (year, title, status, quote, description, admission_year, graduation_year,
                         department, cover_key, published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    year,
    title,
    payload.status === "graduated" ? "graduated" : "current",
    String(payload.quote || ""),
    String(payload.description || ""),
    payload.admission_year ? Number(payload.admission_year) : null,
    payload.graduation_year ? Number(payload.graduation_year) : null,
    String(payload.department || "علوم الحاسوب وتكنولوجيا المعلومات"),
    payload.cover_key ? String(payload.cover_key) : null,
    payload.published ? 1 : 0
  ).run();

  return Response.json({ ok: true }, { status: 201 });
}
