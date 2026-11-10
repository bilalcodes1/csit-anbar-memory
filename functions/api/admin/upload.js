import { requireUser, audit } from "./_guard.js";

const MAX_BYTES = 20 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

async function hasImageHeader(file) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  if (file.type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (file.type === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => value === bytes[index]);
  return text.startsWith("RIFF") && text.slice(8) === "WEBP";
}

export async function onRequestPost({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  if (!env.IMAGES) return Response.json({ error: "تخزين الصور غير مربوط" }, { status: 503 });
  if (Number(request.headers.get("Content-Length")) > MAX_BYTES + 65536) {
    return Response.json({ error: "حجم الطلب أكبر من الحد المسموح" }, { status: 413 });
  }

  let form;
  try { form = await request.formData(); }
  catch { return Response.json({ error: "بيانات الرفع غير صالحة" }, { status: 400 }); }

  const file = form.get("file");
  const key = String(form.get("key") || "");
  const replace = form.get("replace") === "1";
  const albumValue = String(form.get("album_id") || "").trim();
  const albumId = albumValue ? Number(albumValue) : null;
  const altText = String(form.get("alt_text") || "").trim();
  const caption = String(form.get("caption") || "").trim();
  const published = ["1", "true", "on"].includes(String(form.get("published") || "").toLowerCase()) ? 1 : 0;
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_BYTES) {
    return Response.json({ error: "اختر صورة حجمها لا يتجاوز 20 ميغابايت" }, { status: 422 });
  }
  if (!/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(key) || key.length > 512 ||
      key.split("/").some(part => part === "." || part === "..")) {
    return Response.json({ error: "مسار الصورة غير صالح" }, { status: 422 });
  }
  if (!TYPES.includes(file.type) || !await hasImageHeader(file)) {
    return Response.json({ error: "يسمح فقط بصور JPG وPNG وWebP صالحة" }, { status: 415 });
  }

  const existing = await env.IMAGES.head(key);
  const metadata = { httpMetadata: { contentType: file.type } };
  if (replace) {
    if (!existing) return Response.json({ error: "الصورة غير موجودة" }, { status: 404 });
    const updated = await env.IMAGES.put(key, file.stream(), { ...metadata, onlyIf: { etagMatches: existing.etag } });
    if (!updated) return Response.json({ error: "تغيّرت الصورة. حدّث المكتبة وأعد المحاولة" }, { status: 409 });
    await audit(env, auth.session, "update", "image", key, { size: file.size, type: file.type });
    return Response.json({ ok: true, key });
  }

  if (albumValue && (!Number.isSafeInteger(albumId) || albumId < 1)) {
    return Response.json({ error: "معرف الألبوم غير صالح" }, { status: 422 });
  }
  if (published && !albumId) return Response.json({ error: "اختر ألبومًا قبل نشر الصورة" }, { status: 422 });
  if (albumId && !await env.DB.prepare("SELECT id FROM albums WHERE id = ?").bind(albumId).first()) {
    return Response.json({ error: "الألبوم غير موجود" }, { status: 404 });
  }
  const uploadId = String(form.get("upload_id") || "");
  const owner = String(auth.session.user_id);
  const options = { ...metadata, customMetadata: { uploadId, owner }, onlyIf: { etagDoesNotMatch: "*" } };
  const uploaded = existing ? null : await env.IMAGES.put(key, file.stream(), options);
  if (!uploaded) {
    const object = existing || await env.IMAGES.head(key);
    if (uploadId && object?.customMetadata?.uploadId === uploadId && object.customMetadata.owner === owner) {
      const photo = await env.DB.prepare("SELECT id FROM photos WHERE object_key = ?").bind(key).first();
      if (photo || !albumId) return Response.json({ ok: true, key, photo });
    }
    return Response.json({ error: "مسار الصورة مستخدم بالفعل" }, { status: 409 });
  }

  let photo = null;
  try {
    const entries = [];
    if (albumId) {
      entries.push(env.DB.prepare(`
        INSERT INTO photos (album_id, object_key, alt_text, caption, published) VALUES (?, ?, ?, ?, ?)
      `).bind(albumId, key, altText, caption, published));
    }
    entries.push(env.DB.prepare(`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, 'upload', 'image', ?, ?)
    `).bind(auth.session.user_id, key, JSON.stringify({ size: file.size, type: file.type, album_id: albumId })));
    const [result] = await env.DB.batch(entries);
    if (albumId) photo = { id: result.meta.last_row_id, album_id: albumId, alt_text: altText, caption, published };
  } catch (error) {
    await env.IMAGES.delete(key);
    throw error;
  }

  return Response.json({ ok: true, key, url: `/media/${key}`, size: file.size, content_type: file.type, photo }, { status: 201 });
}
