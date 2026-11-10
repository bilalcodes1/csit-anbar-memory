export async function onRequestGet({ env }) {
  if (!env.DB) return Response.json({ error: "قاعدة البيانات غير مربوطة" }, { status: 503 });

  const [batchRows, albumRows] = await env.DB.batch([
    env.DB.prepare(`
      SELECT id, year, title, status, quote, description, admission_year, graduation_year, department, cover_key
      FROM batches WHERE published = 1 ORDER BY year DESC
    `),
    env.DB.prepare(`
      SELECT albums.id, albums.batch_id, albums.slug, albums.title, albums.subtitle
      FROM albums JOIN batches ON batches.id = albums.batch_id
      WHERE albums.published = 1 AND batches.published = 1 ORDER BY albums.sort_order, albums.id
    `)
  ]);
  const albumsByBatch = new Map();
  for (const { batch_id, ...album } of albumRows.results) {
    if (!albumsByBatch.has(batch_id)) albumsByBatch.set(batch_id, []);
    albumsByBatch.get(batch_id).push(album);
  }
  return Response.json(batchRows.results.map(batch => ({
    ...batch,
    cover_url: batch.cover_key ? `/media/${batch.cover_key}` : null,
    albums: albumsByBatch.get(batch.id) || []
  })));
}
