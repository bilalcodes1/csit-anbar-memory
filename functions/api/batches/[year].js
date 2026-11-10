export async function onRequestGet({ env, params }) {
  if (!env.DB) return Response.json({ error: "الخدمات غير مربوطة" }, { status: 503 });

  if (!/^\d{4}$/.test(params.year)) return Response.json({ error: "الدفعة غير موجودة" }, { status: 404 });

  const batch = await env.DB.prepare(`
    SELECT id, year, title, status, quote, description, admission_year, graduation_year,
           department, cover_key
    FROM batches
    WHERE year = ? AND published = 1
  `).bind(Number(params.year)).first();

  if (!batch) return Response.json({ error: "الدفعة غير موجودة" }, { status: 404 });

  const [albums, photos, students] = await env.DB.batch([
    env.DB.prepare(`
      SELECT id, slug, title, subtitle FROM albums
      WHERE batch_id = ? AND published = 1 ORDER BY sort_order, id
    `).bind(batch.id),
    env.DB.prepare(`
      SELECT photos.id, photos.album_id, photos.object_key, photos.alt_text, photos.caption
      FROM photos JOIN albums ON albums.id = photos.album_id
      WHERE albums.batch_id = ? AND albums.published = 1 AND photos.published = 1
      ORDER BY photos.sort_order, photos.id
    `).bind(batch.id),
    env.DB.prepare(`
      SELECT full_name FROM students WHERE batch_id = ? AND published = 1 ORDER BY sort_order, id
    `).bind(batch.id)
  ]);
  const photosByAlbum = new Map();
  for (const { album_id, ...photo } of photos.results) {
    if (!photosByAlbum.has(album_id)) photosByAlbum.set(album_id, []);
    photosByAlbum.get(album_id).push({ ...photo, url: `/media/${photo.object_key}` });
  }

  return Response.json({
    ...batch,
    cover_url: batch.cover_key ? `/media/${batch.cover_key}` : null,
    albums: albums.results.map(album => ({ ...album, photos: photosByAlbum.get(album.id) || [] })),
    students: students.results.map(student => student.full_name)
  });
}
