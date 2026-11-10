export function onRequestGet() {
  return Response.json({ error: "هذا القسم أُلغي" }, { status: 410 });
}
