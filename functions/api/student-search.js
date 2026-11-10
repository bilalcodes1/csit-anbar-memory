function normalizeName(value) {
  return value.normalize("NFKC").toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ىی]/g, "ي")
    .replace(/[\u0640\u064B-\u065F\u0670]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export async function onRequestPost({ env, request }) {
  if (!env.DB) return Response.json({ error: "الخدمات غير مربوطة" }, { status: 503 });
  const body = await request.json().catch(() => null);
  const query = typeof body?.name === "string" && body.name.length <= 120 ? normalizeName(body.name) : "";
  if (query.length < 2) return Response.json({ error: "اكتب حرفين على الأقل للبحث." }, { status: 422 });

  const { results: students } = await env.DB.prepare(`
    SELECT s.id, s.full_name, b.year, b.title AS batch_title
    FROM students s JOIN batches b ON b.id = s.batch_id
    WHERE s.published = 1 AND b.published = 1
    ORDER BY b.year DESC, s.sort_order, s.id
  `).all();

  const terms = query.split(" ");
  const matches = students.filter(student => {
    const words = normalizeName(student.full_name).split(" ");
    return terms.every(term => words.some(word => word.startsWith(term)));
  });
  const selected = matches.slice(0, 24);
  if (!selected.length) return Response.json({ students: [], has_more: false });

  const { results: appearances } = await env.DB.prepare(`
    SELECT s.id AS student_id, a.id AS album_id, a.title AS album_title,
           p.id, p.object_key, p.alt_text, p.caption
    FROM photo_students ps
    JOIN students s ON s.id = ps.student_id AND s.published = 1
    JOIN batches b ON b.id = s.batch_id AND b.published = 1
    JOIN photos p ON p.id = ps.photo_id AND p.published = 1
    JOIN albums a ON a.id = p.album_id AND a.batch_id = b.id AND a.published = 1 AND a.is_activity = 0
    WHERE s.id IN (SELECT value FROM json_each(?))
    ORDER BY a.sort_order, a.id, p.sort_order, p.id
  `).bind(JSON.stringify(selected.map(student => student.id))).all();

  const byStudent = new Map(selected.map(student => [student.id, new Map()]));
  for (const { student_id, album_id, album_title, object_key, ...photo } of appearances) {
    const albums = byStudent.get(student_id);
    if (!albums.has(album_id)) albums.set(album_id, { title: album_title, photos: [] });
    albums.get(album_id).photos.push({ ...photo, url: `/media/${object_key}` });
  }

  return Response.json({
    students: selected.map(student => ({ ...student, albums: [...byStudent.get(student.id).values()] })),
    has_more: matches.length > selected.length
  });
}
