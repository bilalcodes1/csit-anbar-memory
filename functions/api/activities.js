export async function onRequestGet({ env }) {
  if (!env.DB) return Response.json({ error: "الأرشيف غير متاح" }, { status: 503 });

  const [albums, photos] = await env.DB.batch([
    env.DB.prepare(`
      SELECT id, slug, title, subtitle FROM albums
      WHERE is_activity = 1 AND published = 1 ORDER BY sort_order, id
    `),
    env.DB.prepare(`
      SELECT photos.album_id, photos.object_key, photos.alt_text, photos.caption
      FROM photos JOIN albums ON albums.id = photos.album_id
      WHERE albums.is_activity = 1 AND albums.published = 1 AND photos.published = 1
      ORDER BY photos.sort_order, photos.id
    `)
  ]);

  const galleries = new Map(albums.results.map(album => [album.id, { ...album, photos: [] }]));
  for (const { album_id, object_key, ...photo } of photos.results) {
    galleries.get(album_id)?.photos.push({ ...photo, url: `/media/${object_key}` });
  }
  return Response.json([...galleries.values()]);
}
