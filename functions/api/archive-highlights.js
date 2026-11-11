export async function onRequestGet({ env }) {
  if (!env.DB) return Response.json({ error: "قاعدة البيانات غير مربوطة" }, { status: 503 });

  const { results } = await env.DB.prepare(`
    WITH ranked AS (
      SELECT b.year, p.object_key,
             ROW_NUMBER() OVER (
               PARTITION BY b.id
               ORDER BY (p.object_key LIKE 'archive-illustrations/%'), p.id DESC
             ) AS position
      FROM photos p
      JOIN albums a ON a.id = p.album_id
      JOIN batches b ON b.id = a.batch_id
      WHERE p.published = 1 AND a.published = 1 AND a.is_activity = 0 AND b.published = 1
    )
    SELECT year, object_key FROM ranked
    WHERE position <= 8
    ORDER BY position, year DESC
    LIMIT 96
  `).all();

  return Response.json(results.map(({ year, object_key }) => ({
    year, url: `/media/${object_key}`
  })));
}
