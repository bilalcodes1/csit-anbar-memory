export function requireAdmin(request, env) {
  const expected = env.ADMIN_TOKEN;
  const supplied = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied || supplied !== expected) {
    return Response.json({ error: "غير مصرح" }, { status: 401 });
  }
  return null;
}
