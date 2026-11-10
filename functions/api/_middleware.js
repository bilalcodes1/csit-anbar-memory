export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const mutable = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (mutable && origin && origin !== url.origin) {
    return Response.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  }

  let response;
  try {
    response = await next();
  } catch {
    response = Response.json({ error: "تعذر تنفيذ الطلب. حاول مرة أخرى." }, { status: 500 });
  }
  const result = new Response(response.body, response);
  result.headers.set("Cache-Control", "no-store");
  result.headers.set("X-Content-Type-Options", "nosniff");
  return result;
}
