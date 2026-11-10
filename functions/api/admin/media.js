import { requireUser, audit } from "./_guard.js";

export async function onRequestDelete({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  if (!env.IMAGES) return Response.json({ error: "تخزين الصور غير مربوط" }, { status: 503 });
  const payload = await request.json();
  const key = String(payload.key || "").replace(/[^a-zA-Z0-9_./-]/g, "");
  if (!key) return Response.json({ error: "مسار الصورة مطلوب" }, { status: 422 });
  await env.IMAGES.delete(key);
  await audit(env, auth.session, "delete", "image", key);
  return Response.json({ ok: true });
}
