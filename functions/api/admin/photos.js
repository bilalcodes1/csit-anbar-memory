import { requireUser, audit } from "./_guard.js";

export async function onRequestPatch({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: "بيانات غير صالحة" }, { status: 400 }); }
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "معرف الصورة غير صالح" }, { status: 422 });
  const existing = await env.DB.prepare("SELECT * FROM photos WHERE id = ?").bind(id).first();
  if (!existing) return Response.json({ error: "الصورة غير موجودة" }, { status: 404 });
  const albumId = payload.album_id === undefined ? existing.album_id : Number(payload.album_id);
  if (!Number.isInteger(albumId) || albumId < 1) return Response.json({ error: "معرف الألبوم غير صالح" }, { status: 422 });
  const album = await env.DB.prepare("SELECT id FROM albums WHERE id = ?").bind(albumId).first();
  if (!album) return Response.json({ error: "الألبوم غير موجود" }, { status: 404 });
  const altText = payload.alt_text === undefined ? existing.alt_text : String(payload.alt_text || "").trim();
  const caption = payload.caption === undefined ? existing.caption : String(payload.caption || "").trim();
  const sortOrder = payload.sort_order === undefined ? existing.sort_order : Number(payload.sort_order);
  const published = payload.published === undefined ? existing.published : (payload.published ? 1 : 0);
  if (!Number.isInteger(sortOrder) || sortOrder < 0) return Response.json({ error: "الترتيب غير صالح" }, { status: 422 });
  await env.DB.prepare(`
    UPDATE photos SET album_id = ?, alt_text = ?, caption = ?, sort_order = ?, published = ? WHERE id = ?
  `).bind(albumId, altText, caption, sortOrder, published, id).run();
  await audit(env, auth.session, "update", "photo", id, { album_id: albumId, alt_text: altText, caption, sort_order: sortOrder, published });
  return Response.json({ ok: true, id, album_id: albumId, alt_text: altText, caption, sort_order: sortOrder, published });
}

export async function onRequestDelete({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: "بيانات غير صالحة" }, { status: 400 }); }
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "معرف الصورة غير صالح" }, { status: 422 });
  const photo = await env.DB.prepare("SELECT object_key FROM photos WHERE id = ?").bind(id).first();
  if (!photo) return Response.json({ error: "الصورة غير موجودة" }, { status: 404 });
  if (env.IMAGES) await env.IMAGES.delete(photo.object_key);
  await env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(id).run();
  await audit(env, auth.session, "delete", "photo", id, { key: photo.object_key });
  return Response.json({ ok: true, id, key: photo.object_key });
}
