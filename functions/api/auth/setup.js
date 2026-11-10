import { hashPassword } from "./_crypto.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.ADMIN_SETUP_TOKEN) return Response.json({ error: "إعداد التهيئة غير مكتمل" }, { status: 503 });
  if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_SETUP_TOKEN}`) {
    return Response.json({ error: "رمز التهيئة غير صحيح" }, { status: 401 });
  }
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first();
  if (Number(count?.count) > 0) return Response.json({ error: "تم إنشاء المدير الأول مسبقًا" }, { status: 409 });
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: "بيانات غير صالحة" }, { status: 400 }); }
  const username = String(payload.username || "").trim().toLowerCase();
  const name = String(payload.name || "").trim();
  const password = String(payload.password || "");
  if (!/^[a-z0-9_-]{3,32}$/.test(username) || name.length < 2 || password.length < 12) {
    return Response.json({ error: "أدخل اسم مستخدم إنجليزيًا وكلمة مرور لا تقل عن 12 رمزًا" }, { status: 422 });
  }
  const passwordHash = await hashPassword(password);
  await env.DB.prepare("INSERT INTO users (email, username, name, password_hash, role) VALUES (?, ?, ?, ?, 'admin')")
    .bind(`${username}@local.invalid`, username, name, passwordHash).run();
  return Response.json({ ok: true }, { status: 201 });
}
