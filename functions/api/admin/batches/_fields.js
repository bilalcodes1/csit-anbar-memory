import { isImageKey, isImageType } from "../../../_images.js";

const DEPARTMENT = "علوم الحاسوب وتكنولوجيا المعلومات";
const validYear = (year, min, max) => Number.isInteger(year) && year >= min && year <= max;
const nullableYear = value => value === "" || value == null ? null : Number(value);

export async function parseBatch(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return { response: Response.json({ error: "بيانات غير صالحة" }, { status: 400 }) }; }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { response: Response.json({ error: "بيانات غير صالحة" }, { status: 400 }) };
  }

  const year = Number(body.year);
  const title = String(body.title || "").trim();
  const admission = nullableYear(body.admission_year);
  const graduation = nullableYear(body.graduation_year);
  const department = String(body.department || DEPARTMENT).trim() || DEPARTMENT;
  const quote = String(body.quote || "").trim();
  const description = String(body.description || "").trim();
  const cover = body.cover_key === "" ? null : body.cover_key ?? null;
  if (!validYear(year, 2000, 2100) || !title || title.length > 160 ||
      department.length > 160 || quote.length > 500 || description.length > 5000) {
    return { response: Response.json({ error: "راجع سنة الدفعة والعنوان وطول النصوص" }, { status: 422 }) };
  }
  if ([admission, graduation].some(value => value !== null && !validYear(value, 1900, 2200)) ||
      (admission !== null && graduation !== null && graduation < admission)) {
    return { response: Response.json({ error: "راجع سنوات القبول والتخرّج" }, { status: 422 }) };
  }
  if (cover !== null) {
    const image = isImageKey(cover) ? await env.IMAGES?.head(cover) : null;
    if (!isImageType(image?.httpMetadata?.contentType)) {
      return { response: Response.json({ error: "اختر صورة غلاف صالحة من المكتبة" }, { status: 422 }) };
    }
  }

  return {
    values: [year, title, body.status === "graduated" ? "graduated" : "current",
      quote, description, admission, graduation, department, cover, body.published === true ? 1 : 0]
  };
}
