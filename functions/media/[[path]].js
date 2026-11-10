export async function onRequestGet({ env, params }) {
  if (!env.IMAGES) return new Response("تخزين الصور غير مربوط", { status: 503 });
  const object = await env.IMAGES.get(params.path);
  if (!object) return new Response("الصورة غير موجودة", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}
