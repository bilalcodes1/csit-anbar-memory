import { requireUser, audit } from "./_guard.js";

const MAX_LIMIT = 100;
const parseLimit = value => Math.min(MAX_LIMIT, Math.max(1, value && Number.isInteger(Number(value)) ? Number(value) : 50));

export async function onRequestGet({ request, env }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  if (!env.IMAGES) return Response.json({ error: "تخزين الصور غير مربوط" }, { status: 503 });
  const url = new URL(request.url);
  const prefix = String(url.searchParams.get("prefix") || "").replace(/[^a-zA-Z0-9_./-]/g, "");
  const search = String(url.searchParams.get("search") || "").trim().toLowerCase();
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = url.searchParams.get("cursor") || undefined;
  if (prefix.split("/").includes("..")) return Response.json({ error: "المسار غير صالح" }, { status: 422 });
  const listed = await env.IMAGES.list({ prefix, limit, cursor });
  const objects = listed.objects
    .filter(object => !search || object.key.toLowerCase().includes(search))
    .map(object => ({
      key: object.key,
      size: object.size,
      uploaded: object.uploaded,
      etag: object.etag,
      http_metadata: object.httpMetadata || {},
      url: `/media/${object.key}`
    }));
  return Response.json({
    objects,
    pagination: { limit, cursor: listed.truncated ? listed.cursor : null, truncated: Boolean(listed.truncated) }
  });
}

export async function onRequestDelete({ request, env }) {
  const auth = await requireUser(request, env, true);
  if (auth.response) return auth.response;
  if (!env.IMAGES) return Response.json({ error: "تخزين الصور غير مربوط" }, { status: 503 });
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: "بيانات غير صالحة" }, { status: 400 }); }
  const keys = Array.isArray(payload.keys) ? payload.keys : [payload.key];
  const safeKeys = [...new Set(keys.map(value => String(value || "").replace(/[^a-zA-Z0-9_./-]/g, "")))];
  if (!safeKeys.length || safeKeys.length > 100 || safeKeys.some(key => !key || key.split("/").includes(".."))) {
    return Response.json({ error: "مسارات الصور غير صالحة" }, { status: 422 });
  }
  await env.IMAGES.delete(safeKeys);
  const placeholders = safeKeys.map(() => "?").join(", ");
  const [removed] = await env.DB.batch([
    env.DB.prepare(`DELETE FROM photos WHERE object_key IN (${placeholders})`).bind(...safeKeys),
    env.DB.prepare(`UPDATE batches SET cover_key = NULL WHERE cover_key IN (${placeholders})`).bind(...safeKeys)
  ]);
  const photosRemoved = removed.meta.changes || 0;
  await audit(env, auth.session, "delete", "image", safeKeys.join(","), { keys: safeKeys.length, photos_removed: photosRemoved });
  return Response.json({ ok: true, keys: safeKeys, photos_removed: photosRemoved });
}
