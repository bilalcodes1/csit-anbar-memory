export async function onRequestGet({ env, params }) {
  if (!env.DB || !env.IMAGES) return Response.json({ error: "الخدمات غير مربوطة" }, { status: 503 });

  const batch = await env.DB.prepare(`
    SELECT id, year, title, status, quote, description, admission_year, graduation_year,
           department, cover_key
    FROM batches
    WHERE year = ? AND published = 1
  `).bind(Number(params.year)).first();

  if (!batch) return Response.json({ error: "الدفعة غير موجودة" }, { status: 404 });

  const albums = await env.DB.prepare(`
    SELECT id, slug, title, subtitle
    FROM albums
    WHERE batch_id = ? AND published = 1
    ORDER BY sort_order, id
  `).bind(batch.id).all();

  const albumData = [];
  for (const album of albums.results) {
    const photos = await env.DB.prepare(`
      SELECT id, object_key, alt_text, caption
      FROM photos
      WHERE album_id = ? AND published = 1
      ORDER BY sort_order, id
    `).bind(album.id).all();
    albumData.push({
      ...album,
      photos: photos.results.map(photo => ({
        ...photo,
        url: `/media/${photo.object_key}`
      }))
    });
  }

  const students = await env.DB.prepare(`
    SELECT full_name
    FROM students
    WHERE batch_id = ? AND published = 1
    ORDER BY sort_order, id
  `).bind(batch.id).all();

  return Response.json({
    ...batch,
    cover_url: batch.cover_key ? `/media/${batch.cover_key}` : null,
    albums: albumData,
    students: students.results.map(student => student.full_name)
  });
}
