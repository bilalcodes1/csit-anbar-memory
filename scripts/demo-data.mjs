import { readFile } from 'node:fs/promises';

const base = new URL(process.env.ARCHIVE_DEMO_URL || 'http://127.0.0.1:8790');
const token = process.env.ARCHIVE_DEMO_SETUP_TOKEN;
const password = process.env.ARCHIVE_DEMO_PASSWORD;
if (!['localhost', '127.0.0.1'].includes(base.hostname) || !token || !password) {
  throw new Error('Run the local demo launcher.');
}

const username = 'demo_admin';
let cookie;
async function api(path, method = 'GET', body, headers = {}, accepted = [200, 201]) {
  if (cookie) headers.Cookie = cookie;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch(new URL(path, base), { method, body, headers });
  if (!accepted.includes(response.status)) throw new Error(method + ' ' + path + ': ' + await response.text());
  return response;
}

await api('/api/auth/setup', 'POST', { username, password, name: 'مدير العرض التجريبي' },
  { Authorization: 'Bearer ' + token }, [201, 409]);
const login = await api('/api/auth/login', 'POST', { username, password });
cookie = login.headers.get('set-cookie').split(';')[0];
const overview = await (await api('/api/admin/overview')).json();

const years = [2026, 2024, 2023, 2022];
for (const year of years) {
  if (overview.batches.some(batch => batch.year === year)) continue;
  const batch = {
    year, title: 'دفعة ' + year, status: year === 2026 ? 'current' : 'graduated',
    description: 'بيانات محلية للعرض التجريبي. الأسماء المدرجة أمثلة توضيحية.',
    published: false
  };
  const { id } = await (await api('/api/admin/batches', 'POST', batch)).json();
  const album = await (await api('/api/admin/albums', 'POST', {
    batch_id: id, title: 'صورة الدفعة', slug: 'group', published: true
  })).json();
  const form = new FormData();
  const key = 'demo/' + year + '.jpg';
  const source = await readFile(new URL('../assets/batches/' + year + '.jpg', import.meta.url));
  form.set('file', new File([source], year + '.jpg', { type: 'image/jpeg' }));
  form.set('key', key);
  form.set('album_id', String(album.id));
  form.set('published', '1');
  form.set('alt_text', 'صورة أرشيفية من ملفات المشروع');
  await api('/api/admin/upload', 'POST', form);
  await api('/api/admin/students', 'POST', { batch_id: id, full_name: 'اسم طالب تجريبي', published: true });
  await api('/api/admin/batches/' + id, 'PATCH', { ...batch, cover_key: key, published: true });
}
await api('/api/auth/logout', 'POST', undefined, {}, [200, 204]);
