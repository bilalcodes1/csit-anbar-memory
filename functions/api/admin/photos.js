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
  const album = await env.DB.prepare("SELECT id, batch_id FROM albums WHERE id = ?").bind(albumId).first();
  if (!album) return Response.json({ error: "الألبوم غير موجود" }, { status: 404 });
  const altText = payload.alt_text === undefined ? existing.alt_text : String(payload.alt_text || "").trim();
  const caption = payload.caption === undefined ? existing.caption : String(payload.caption || "").trim();
  const sortOrder = payload.sort_order === undefined ? existing.sort_order : Number(payload.sort_order);
  const published = payload.published === undefined ? existing.published : (payload.published ? 1 : 0);
  if (!Number.isInteger(sortOrder) || sortOrder < 0) return Response.json({ error: "الترتيب غير صالح" }, { status: 422 });
  const studentIds = payload.student_ids;
  if (studentIds !== undefined) {
    if (!Array.isArray(studentIds) || studentIds.some(value => !Number.isSafeInteger(value) || value < 1)) {
      return Response.json({ error: "أسماء الطلبة غير صالحة" }, { status: 422 });
    }
    const { count } = await env.DB.prepare(`
      SELECT COUNT(*) AS count FROM students WHERE batch_id = ?
      AND id IN (SELECT value FROM json_each(?))
    `).bind(album.batch_id, JSON.stringify(studentIds)).first();
    if (count !== new Set(studentIds).size) {
      return Response.json({ error: "اختر طلبة من دفعة الألبوم فقط" }, { status: 422 });
    }
  }
  const statements = [env.DB.prepare(`
    UPDATE photos SET album_id = ?, alt_text = ?, caption = ?, sort_order = ?, published = ? WHERE id = ?
  `).bind(albumId, altText, caption, sortOrder, published, id)];

  if (studentIds === undefined) {
    statements.push(env.DB.prepare(`
      DELETE FROM photo_students WHERE photo_id = ?
      AND student_id IN (SELECT id FROM students WHERE batch_id <> ?)
    `).bind(id, album.batch_id));
  } else {
    statements.push(
      env.DB.prepare("DELETE FROM photo_students WHERE photo_id = ?").bind(id),
      env.DB.prepare(`
        INSERT INTO photo_students (photo_id, student_id)
        SELECT p.id, s.id FROM photos p JOIN albums a ON a.id = p.album_id
        JOIN students s ON s.batch_id = a.batch_id
        WHERE p.id = ? AND s.id IN (SELECT value FROM json_each(?))
      `).bind(id, JSON.stringify(studentIds))
    );
  }
  await env.DB.batch(statements);
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
  await env.DB.batch([
    env.DB.prepare("DELETE FROM photos WHERE object_key = ?").bind(photo.object_key),
    env.DB.prepare("UPDATE batches SET cover_key = NULL WHERE cover_key = ?").bind(photo.object_key)
  ]);
  await audit(env, auth.session, "delete", "photo", id, { key: photo.object_key });
  return Response.json({ ok: true, id, key: photo.object_key });
}
