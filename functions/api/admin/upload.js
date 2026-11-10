import { requireUser, audit } from "./_guard.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  if (!env.IMAGES) return Response.json({ error: "تخزين الصور غير مربوط" }, { status: 503 });

  const form = await request.formData();
  const file = form.get("file");
  const key = String(form.get("key") || "").replace(/[^a-zA-Z0-9_./-]/g, "");
  if (!(file instanceof File) || !key || file.size > 15 * 1024 * 1024) {
    return Response.json({ error: "الملف مطلوب وحجمه يجب ألا يتجاوز 15 ميغابايت" }, { status: 422 });
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return Response.json({ error: "يسمح فقط بصور JPG وPNG وWebP" }, { status: 415 });
  }

  await env.IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type }
  });
  await audit(env, auth.session, "upload", "image", key, { size: file.size, type: file.type });
  return Response.json({ ok: true, key, url: `/media/${key}` }, { status: 201 });
}
