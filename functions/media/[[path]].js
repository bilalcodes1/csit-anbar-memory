import { getSession } from "../api/auth/_session.js";

export async function onRequestGet({ env, request, params }) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff"
  });
  if (!env.DB || !env.IMAGES) return new Response("خدمات الصور غير متاحة", { status: 503, headers });
  const key = Array.isArray(params.path) ? params.path.join("/") : params.path;
  if (!key) return new Response(null, { status: 404, headers });

  const published = await env.DB.prepare(`
    SELECT 1 FROM batches WHERE cover_key = ? AND published = 1
    UNION ALL
    SELECT 1 FROM photos
    JOIN albums ON albums.id = photos.album_id
    JOIN batches ON batches.id = albums.batch_id
    WHERE photos.object_key = ? AND photos.published = 1 AND albums.published = 1 AND (batches.published = 1 OR albums.is_activity = 1)
    LIMIT 1
  `).bind(key, key).first();
  if (!published && !await getSession(request, env)) return new Response(null, { status: 404, headers });

  const object = await env.IMAGES.get(key);
  if (!object) return new Response(null, { status: 404, headers });
  const type = object.httpMetadata?.contentType;
  if (!["image/jpeg", "image/png", "image/webp"].includes(type)) {
    return new Response(null, { status: 415, headers });
  }
  headers.set("Content-Type", type);
  return new Response(object.body, { headers });
}
