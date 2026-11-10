import { requireUser, audit } from "./_guard.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  if (!env.IMAGES) return Response.json({ error: "تخزين الصور غير مربوط" }, { status: 503 });

  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "بيانات الرفع غير صالحة" }, { status: 400 });
  }
  const file = form.get("file");
  const key = String(form.get("key") || "").replace(/[^a-zA-Z0-9_./-]/g, "");
  const albumIdValue = String(form.get("album_id") || "").trim();
  const albumId = albumIdValue ? Number(albumIdValue) : null;
  const altText = String(form.get("alt_text") || "").trim();
  const caption = String(form.get("caption") || "").trim();
  const published = ["1", "true", "on"].includes(String(form.get("published") || "").toLowerCase()) ? 1 : 0;
  if (!(file instanceof File) || !key || key.split("/").includes("..") || file.size > 100 * 1024 * 1024) {
    return Response.json({ error: "الملف مطلوب وحجمه يجب ألا يتجاوز 100 ميغابايت" }, { status: 422 });
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return Response.json({ error: "يسمح فقط بصور JPG وPNG وWebP" }, { status: 415 });
  }
  if (albumIdValue && (!Number.isInteger(albumId) || albumId < 1)) {
    return Response.json({ error: "معرف الألبوم غير صالح" }, { status: 422 });
  }
  if (albumId) {
    const album = await env.DB.prepare("SELECT id FROM albums WHERE id = ?").bind(albumId).first();
    if (!album) return Response.json({ error: "الألبوم غير موجود" }, { status: 404 });
  }

  await env.IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type }
  });

  let photo = null;
  if (albumId) {
    const existing = await env.DB.prepare("SELECT id FROM photos WHERE object_key = ? ORDER BY id LIMIT 1").bind(key).first();
    if (existing) {
      await env.DB.prepare(`
        UPDATE photos SET album_id = ?, alt_text = ?, caption = ?, published = ? WHERE id = ?
      `).bind(albumId, altText, caption, published, existing.id).run();
      photo = { id: existing.id, album_id: albumId, alt_text: altText, caption, published };
    } else {
      const result = await env.DB.prepare(`
        INSERT INTO photos (album_id, object_key, alt_text, caption, published)
        VALUES (?, ?, ?, ?, ?)
      `).bind(albumId, key, altText, caption, published).run();
      photo = { id: result.meta.last_row_id, album_id: albumId, alt_text: altText, caption, published };
    }
  }

  await audit(env, auth.session, "upload", "image", key, {
    size: file.size, type: file.type, album_id: albumId, photo_id: photo?.id || null
  });
  return Response.json({
    ok: true, key, url: `/media/${key}`, size: file.size, content_type: file.type, photo
  }, { status: 201 });
}
