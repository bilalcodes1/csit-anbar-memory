import { requireUser } from "./_guard.js";

const MAX_LIMIT = 1000;
const limitOf = (value, fallback = 50) => Math.min(MAX_LIMIT, Math.max(1, value && Number.isInteger(Number(value)) ? Number(value) : fallback));

async function mediaPage(env, url) {
  if (!env.IMAGES) return { objects: [], pagination: { limit: 0, cursor: null, truncated: false } };
  const prefix = String(url.searchParams.get("prefix") || "").replace(/[^a-zA-Z0-9_./-]/g, "");
  const search = String(url.searchParams.get("search") || "").trim().toLowerCase();
  const limit = limitOf(url.searchParams.get("media_limit"), 50);
  const listed = await env.IMAGES.list({
    prefix,
    limit,
    cursor: url.searchParams.get("media_cursor") || undefined
  });
  return {
    objects: listed.objects
      .filter(object => !search || object.key.toLowerCase().includes(search))
      .map(object => ({ key: object.key, size: object.size, uploaded: object.uploaded, etag: object.etag, url: `/media/${object.key}` })),
    pagination: { limit, cursor: listed.truncated ? listed.cursor : null, truncated: Boolean(listed.truncated) }
  };
}

export async function onRequestGet({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const summary = url.searchParams.get("summary") === "1";
  const isAdmin = auth.session.role === "admin";
  const prefix = String(url.searchParams.get("prefix") || "").replace(/[^a-zA-Z0-9_./-]/g, "");
  if (prefix.split("/").includes("..")) return Response.json({ error: "المسار غير صالح" }, { status: 422 });

  const statements = [
    env.DB.prepare(`
      SELECT (SELECT COUNT(*) FROM batches) AS batches, (SELECT COUNT(*) FROM albums) AS albums,
             (SELECT COUNT(*) FROM photos) AS photos, (SELECT COUNT(*) FROM students) AS students,
             ${isAdmin ? "(SELECT COUNT(*) FROM users)" : "NULL"} AS users
    `),
    env.DB.prepare(`
      SELECT audit_log.id, audit_log.action, audit_log.entity_type, audit_log.entity_id,
             ${summary ? "" : "audit_log.details,"}
             audit_log.created_at, users.username, users.name
      FROM audit_log LEFT JOIN users ON users.id = audit_log.user_id
      ORDER BY audit_log.created_at DESC, audit_log.id DESC LIMIT ?
    `).bind(limitOf(url.searchParams.get("audit_limit"), summary ? 7 : 25)),
    env.DB.prepare(summary ? `
      SELECT id, year, title, published,
             (SELECT COUNT(*) FROM albums WHERE batch_id = batches.id) AS album_count,
             (SELECT COUNT(*) FROM albums JOIN photos ON photos.album_id = albums.id
              WHERE albums.batch_id = batches.id) AS photo_count
      FROM batches ORDER BY year DESC, id DESC LIMIT 5
    ` : "SELECT * FROM batches ORDER BY year DESC, id DESC")
  ];
  if (!summary) {
    statements.push(
      env.DB.prepare("SELECT * FROM albums ORDER BY batch_id, sort_order, id"),
      env.DB.prepare("SELECT * FROM students ORDER BY batch_id, sort_order, id"),
      env.DB.prepare(`
        SELECT photos.*, (SELECT json_group_array(student_id) FROM photo_students WHERE photo_id = photos.id) AS student_ids
        FROM photos ORDER BY album_id, sort_order, id
      `)
    );
    if (isAdmin) statements.push(env.DB.prepare("SELECT id, username, name, role, active, created_at FROM users ORDER BY id"));
  }

  const [[countRows, auditRows, batchRows, albumRows, studentRows, photoRows, userRows], media] =
    await Promise.all([env.DB.batch(statements), summary ? null : mediaPage(env, url)]);
  const data = {
    user: { id: auth.session.user_id, username: auth.session.username, name: auth.session.name, role: auth.session.role },
    counts: countRows.results[0],
    batches: batchRows.results,
    audit: auditRows.results
  };
  if (summary) return Response.json(data);

  const batchesById = new Map(data.batches.map(batch => {
    Object.assign(batch, { albums: [], students: [] });
    return [batch.id, batch];
  }));
  const albumsById = new Map(albumRows.results.map(album => {
    album.photos = [];
    batchesById.get(album.batch_id)?.albums.push(album);
    return [album.id, album];
  }));
  for (const student of studentRows.results) batchesById.get(student.batch_id)?.students.push(student);
  for (const photo of photoRows.results) {
    photo.student_ids = JSON.parse(photo.student_ids);
    photo.url = `/media/${photo.object_key}`;
    albumsById.get(photo.album_id)?.photos.push(photo);
  }
  for (const entry of data.audit) {
    try { entry.details = JSON.parse(entry.details); } catch { /* preserve legacy text */ }
  }
  data.media = media;
  data.counts.media = media.objects.length;
  data.counts.storage_bytes = media.objects.reduce((total, object) => total + Number(object.size || 0), 0);
  if (isAdmin) data.users = userRows.results;
  return Response.json(data);
}
