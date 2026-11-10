export async function onRequestGet({ env }) {
  if (!env.DB) return Response.json({ error: "قاعدة البيانات غير مربوطة" }, { status: 503 });

  const { results } = await env.DB.prepare(`
    SELECT id, year, title, status, quote, description, admission_year, graduation_year,
           department, cover_key
    FROM batches
    WHERE published = 1
    ORDER BY year DESC
  `).all();

  const batches = [];
  for (const batch of results) {
    const albums = await env.DB.prepare(`
      SELECT id, slug, title, subtitle
      FROM albums
      WHERE batch_id = ? AND published = 1
      ORDER BY sort_order, id
    `).bind(batch.id).all();
    batches.push({ ...batch, albums: albums.results });
  }

  return Response.json(batches, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300" }
  });
}
