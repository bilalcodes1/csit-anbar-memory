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
  if (!env.DB) return Response.json({ error: "قاعدة البيانات غير مربوطة" }, { status: 503 });
  const url = new URL(request.url);
  const prefix = String(url.searchParams.get("prefix") || "").replace(/[^a-zA-Z0-9_./-]/g, "");
  if (prefix.split("/").includes("..")) return Response.json({ error: "المسار غير صالح" }, { status: 422 });
  const [batchRows, albumCount, photoCount, studentCount, userCount, auditRows, media] = await Promise.all([
    env.DB.prepare("SELECT * FROM batches ORDER BY year DESC, id DESC").all(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM albums").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM photos").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM students").first(),
    auth.session.role === "admin" ? env.DB.prepare("SELECT COUNT(*) AS count FROM users").first() : Promise.resolve(null),
    env.DB.prepare(`
      SELECT audit_log.id, audit_log.action, audit_log.entity_type, audit_log.entity_id, audit_log.details,
             audit_log.created_at, users.username, users.name
      FROM audit_log LEFT JOIN users ON users.id = audit_log.user_id
      ORDER BY audit_log.created_at DESC, audit_log.id DESC LIMIT ?
    `).bind(limitOf(url.searchParams.get("audit_limit"), 25)).all(),
    mediaPage(env, url)
  ]);
  const batches = [];
  for (const batch of batchRows.results) {
    const [albums, students] = await Promise.all([
      env.DB.prepare("SELECT * FROM albums WHERE batch_id = ? ORDER BY sort_order, id").bind(batch.id).all(),
      env.DB.prepare("SELECT * FROM students WHERE batch_id = ? ORDER BY sort_order, id").bind(batch.id).all()
    ]);
    const albumData = [];
    for (const album of albums.results) {
      const photos = await env.DB.prepare("SELECT * FROM photos WHERE album_id = ? ORDER BY sort_order, id").bind(album.id).all();
      albumData.push({ ...album, photos: photos.results.map(photo => ({ ...photo, url: `/media/${photo.object_key}` })) });
    }
    batches.push({ ...batch, albums: albumData, students: students.results });
  }
  const audit = auditRows.results.map(entry => {
    let details = entry.details;
    try { details = JSON.parse(entry.details); } catch { /* preserve legacy text */ }
    return { ...entry, details };
  });
  const response = {
    user: { id: auth.session.user_id, username: auth.session.username, name: auth.session.name, role: auth.session.role },
    counts: {
      batches: batchRows.results.length, albums: albumCount?.count || 0, photos: photoCount?.count || 0,
      students: studentCount?.count || 0, users: userCount?.count ?? null, media: media.objects.length,
      storage_bytes: media.objects.reduce((total, object) => total + Number(object.size || 0), 0)
    },
    batches,
    audit,
    media
  };
  if (auth.session.role === "admin") {
    response.users = (await env.DB.prepare("SELECT id, username, name, role, active, created_at FROM users ORDER BY id").all()).results;
  }
  return Response.json(response);
}
