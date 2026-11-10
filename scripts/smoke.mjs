import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const base = process.env.ARCHIVE_TEST_URL || 'http://127.0.0.1:8788';
const setupToken = process.env.ARCHIVE_TEST_SETUP_TOKEN;
assert.ok(setupToken, 'Use an isolated local D1/R2 instance and provide ARCHIVE_TEST_SETUP_TOKEN.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'This test writes to a local instance only.');

const run = Date.now().toString(36);
const password = 'Local-smoke-' + run;
const editorName = 'editor_' + run;
const adminName = 'review_admin';
const adminPassword = process.env.ARCHIVE_TEST_ADMIN_PASSWORD || 'Review-local-2026-only';
const imagePath = process.env.ARCHIVE_TEST_IMAGE;
const extension = imagePath ? extname(imagePath).slice(1).toLowerCase() : 'png';
const contentType = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[extension];
assert.ok(contentType, 'Use a PNG, JPEG, or WebP image for ARCHIVE_TEST_IMAGE.');
const key = 'smoke/' + run + '.' + extension;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X3f0AAAAASUVORK5CYII=', 'base64');
const fixture = imagePath ? await readFile(imagePath) : png;
let checks = 0;

async function request(path, { method = 'GET', body, cookie, headers = {}, status = 200 } = {}) {
  if (cookie) headers.Cookie = cookie;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch(base + path, { method, headers, body });
  assert.ok([status].flat().includes(response.status),
    method + ' ' + path + ' expected ' + status + ', got ' + response.status + ' ' + await response.clone().text());
  checks++;
  return response;
}

function cookie(response) {
  const header = response.headers.get('set-cookie');
  assert.match(header || '', /HttpOnly; Secure; SameSite=Lax/);
  return header.split(';')[0];
}

const home = await request('/');
assert.match(await home.text(), /ذاكرة الكلية/);
await request('/privacy');
const deepLink = await request('/batch/2026');
assert.match(await deepLink.text(), /id="batch-modal"/);
await request('/admin');
await request('/api/admin/overview', { status: 401 });
await request('/api/activities', { status: 410 });
await request('/api/batches/not-a-year', { status: 404 });

await request('/api/auth/setup', {
  method: 'POST', body: { username: adminName, name: 'مدير اختبار محلي', password: adminPassword },
  headers: { Authorization: 'Bearer ' + setupToken }, status: [201, 409]
});
await request('/api/auth/login', {
  method: 'POST', body: { username: adminName, password: 'incorrect' }, status: 401
});
const admin = cookie(await request('/api/auth/login', {
  method: 'POST', body: { username: adminName, password: adminPassword }
}));
assert.equal((await (await request('/api/auth/me', { cookie: admin })).json()).role, 'admin');

const initial = await (await request('/api/admin/overview', { cookie: admin })).json();
const year = Array.from({ length: 101 }, (_, index) => 2100 - index)
  .find(value => !initial.batches.some(batch => batch.year === value));
assert.ok(year);
const batchData = { year, title: 'دفعة اختبار محلي', status: 'graduated' };
const batch = await (await request('/api/admin/batches', {
  method: 'POST', cookie: admin, body: batchData, status: 201
})).json();
await request('/api/batches/' + year, { status: 404 });
await request('/api/admin/batches', { method: 'POST', cookie: admin, body: batchData, status: 409 });
await request('/api/admin/batches/' + batch.id, {
  method: 'PATCH', cookie: admin, body: { ...batchData, admission_year: 2026, graduation_year: 2022 }, status: 422
});
await request('/api/admin/albums', {
  method: 'POST', cookie: admin, body: { batch_id: batch.id, slug: 'smoke', title: 'ألبوم اختبار', published: true }, status: 201
});
await request('/api/admin/students', {
  method: 'POST', cookie: admin, body: { batch_id: batch.id, full_name: 'اسم اختبار منشور', published: true }, status: 201
});
await request('/api/admin/students', {
  method: 'POST', cookie: admin, body: { batch_id: batch.id, full_name: 'اسم اختبار مسودة', published: false }, status: 201
});
const overview = await (await request('/api/admin/overview', { cookie: admin })).json();
const managedBatch = overview.batches.find(item => item.id === batch.id);
const album = managedBatch.albums[0];
function uploadForm({ replace = false, valid = true } = {}) {
  const form = new FormData();
  form.set('file', new File([valid ? fixture : 'invalid'], 'test.' + extension, { type: contentType }));
  form.set('key', key);
  form.set('upload_id', run);
  if (replace) form.set('replace', '1');
  else {
    form.set('album_id', String(album.id));
    form.set('published', '1');
    form.set('caption', 'وصف صورة اختبار');
  }
  return form;
}
await request('/api/admin/upload', { method: 'POST', cookie: admin, body: uploadForm({ valid: false }), status: 415 });
await request('/api/admin/upload', { method: 'POST', cookie: admin, body: uploadForm(), status: 201 });
await request('/api/admin/upload', { method: 'POST', cookie: admin, body: uploadForm() });
await request('/media/' + key, { status: 404 });
await request('/media/' + key, { cookie: admin });
await request('/api/admin/batches/' + batch.id, {
  method: 'PATCH', cookie: admin, body: { ...batchData, published: true }
});
const albumFields = { id: album.id, title: 'ألبوم اختبار' };
await request('/api/admin/albums', {
  method: 'PATCH', cookie: admin, body: { ...albumFields, published: false }
});
assert.deepEqual((await (await request('/api/batches/' + year)).json()).albums, []);
await request('/media/' + key, { status: 404 });
await request('/api/admin/albums', {
  method: 'PATCH', cookie: admin, body: { ...albumFields, published: true }
});
const published = await (await request('/api/batches/' + year)).json();
assert.deepEqual(published.students, ['اسم اختبار منشور']);
assert.equal(published.albums[0].photos.length, 1);
assert.equal(published.albums[0].photos[0].caption, 'وصف صورة اختبار');
const photoId = published.albums[0].photos[0].id;
const studentIds = managedBatch.students.map(student => student.id);
async function findStudent(name) {
  return (await request('/api/student-search', { method: 'POST', body: { name } })).json();
}
assert.deepEqual((await findStudent('اسم اختبار')).students.find(student => student.year === year).albums, []);
await request('/api/admin/photos', {
  method: 'PATCH', cookie: admin, body: { id: photoId, student_ids: [...studentIds, 9007199254740991] }, status: 422
});
await request('/api/admin/photos', {
  method: 'PATCH', cookie: admin, body: { id: photoId, student_ids: studentIds }
});
let found = (await findStudent('إسم اِختبار')).students.filter(student => student.year === year);
assert.equal(found.length, 1);
assert.equal(found[0].full_name, 'اسم اختبار منشور');
assert.equal(found[0].albums[0].photos[0].id, photoId);
assert.deepEqual((await findStudent('اسم اختبار مسودة')).students, []);
await request('/api/admin/photos', {
  method: 'PATCH', cookie: admin, body: { id: photoId, published: false }
});
found = (await findStudent('اسم اختبار')).students.filter(student => student.year === year);
assert.deepEqual(found[0].albums, []);
await request('/api/admin/photos', {
  method: 'PATCH', cookie: admin, body: { id: photoId, published: true }
});
found = (await findStudent('اسم اختبار')).students.filter(student => student.year === year);
assert.equal(found[0].albums[0].photos[0].id, photoId);
await request('/api/admin/photos', {
  method: 'PATCH', cookie: admin, body: { id: photoId, student_ids: [] }
});
assert.deepEqual((await findStudent('اسم اختبار')).students.find(student => student.year === year).albums, []);
const publicPhoto = await request('/media/' + key);
assert.equal(publicPhoto.headers.get('content-type'), contentType);
assert.deepEqual(Buffer.from(await publicPhoto.arrayBuffer()), fixture);
assert.match(publicPhoto.headers.get('cache-control'), /no-store/);
await request('/api/admin/upload', { method: 'POST', cookie: admin, body: uploadForm({ replace: true }) });
assert.equal((await (await request('/api/batches/' + year)).json()).albums[0].photos[0].caption, 'وصف صورة اختبار');

await request('/api/admin/users', {
  method: 'POST', cookie: admin, body: { username: editorName, password, name: 'مشرف اختبار محلي' }, status: 201
});
const editor = cookie(await request('/api/auth/login', {
  method: 'POST', body: { username: editorName, password }
}));
await request('/api/admin/users', { cookie: editor, status: 403 });
await request('/api/admin/media', { method: 'DELETE', cookie: editor, body: { key }, status: 403 });
const device = await (await request('/api/auth/device', {
  method: 'POST', cookie: admin, body: { label: 'جهاز اختبار محلي' }, status: 201
})).json();
assert.match(device.login_url, /^\/admin#device=/);
const deviceCookie = cookie(await request('/api/auth/device', { method: 'PUT', body: { token: device.token } }));
await request('/api/auth/me', { cookie: deviceCookie });
const devices = await (await request('/api/auth/device', { cookie: admin })).json();
await request('/api/auth/device', { method: 'DELETE', cookie: admin, body: { id: devices[0].id } });
await request('/api/auth/device', { method: 'PUT', body: { token: device.token }, status: 403 });
await request('/api/auth/me', { cookie: deviceCookie, status: 401 });

if (!process.env.ARCHIVE_KEEP_FIXTURES) {
  await request('/api/admin/media', { method: 'DELETE', cookie: admin, body: { key } });
  await request('/media/' + key, { status: 404 });
  await request('/api/admin/batches/' + batch.id, { method: 'DELETE', cookie: admin });
}
await request('/api/auth/logout', { method: 'POST', cookie: editor, status: [200, 204] });
await request('/api/auth/me', { cookie: editor, status: 401 });
if (process.env.ARCHIVE_KEEP_FIXTURES) console.log('Fixture batch:', year);
console.log(`Passed ${checks} HTTP checks with D1 and R2.`);
