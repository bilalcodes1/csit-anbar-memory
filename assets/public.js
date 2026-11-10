const grid = document.getElementById('batches');
const status = document.getElementById('status');
const retry = document.getElementById('retry');
const search = document.getElementById('search');
const dialog = document.getElementById('details');
const content = document.getElementById('detail-content');
const filters = [...document.querySelectorAll('[data-filter]')];
let batches = [];
let filter = 'all';
let detailRequest;
let listState = 'loading';

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function image(url, alt, className) {
  if (typeof url !== 'string' || !url.startsWith('/media/')) return null;
  const node = element('img', undefined, className);
  node.alt = alt;
  node.loading = 'lazy';
  node.addEventListener('error', () => node.remove(), { once: true });
  node.src = url;
  return node;
}

function normalize(value) {
  return String(value ?? '').normalize('NFKC').replace(/[٠-٩۰-۹]/g, digit =>
    String(digit.charCodeAt(0) - (digit <= '٩' ? 0x660 : 0x6f0))
  ).replace(/[أإآ]/g, 'ا').replace(/[\u064b-\u065f]/g, '').toLowerCase().trim();
}

function card(batch) {
  const article = element('article', undefined, 'card');
  const cover = element('div', undefined, 'cover');
  cover.setAttribute('aria-hidden', 'true');
  cover.append(element('strong', batch.year));
  const photo = image(batch.cover_url, '');
  if (photo) cover.append(photo);
  const body = element('div', undefined, 'card-body');
  const title = element('h3', batch.title);
  const link = element('a', 'استعرض الدفعة');
  link.href = '/batch/' + encodeURIComponent(batch.year);
  link.setAttribute('aria-label', 'استعرض الدفعة ' + batch.year + '، ' + batch.title);
  link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    history.pushState({ batch: true }, '', link.href);
    openBatch(batch.year);
  });
  body.append(title, element('p', batch.year + ' · ' + (batch.status === 'graduated' ? 'دفعة متخرجة' : 'دفعة حالية'), 'muted'));
  if (batch.quote) body.append(element('p', batch.quote));
  body.append(link);
  article.append(cover, body);
  return article;
}

function render() {
  if (listState !== 'ready') return;
  const query = normalize(search.value);
  const matching = batches.filter(batch =>
    (filter === 'all' || batch.status === filter) &&
    normalize([batch.year, batch.title, batch.department].join(' ')).includes(query)
  );
  grid.replaceChildren(...matching.map(card));
  status.textContent = matching.length ? 'الدفعات المعروضة: ' + matching.length
    : batches.length ? 'لا توجد دفعات تطابق البحث.' : 'لا توجد دفعات منشورة حاليًا.';
}

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw Object.assign(new Error('Request failed'), { status: response.status });
  return response.json();
}

async function load() {
  listState = 'loading';
  retry.hidden = true;
  status.textContent = 'جارٍ تحميل الدفعات…';
  try {
    batches = await fetchJson('/api/batches');
    if (!Array.isArray(batches)) throw new Error('Invalid archive response');
    listState = 'ready';
    render();
  } catch {
    listState = 'error';
    status.textContent = 'تعذّر تحميل الأرشيف الآن.';
    retry.hidden = false;
  }
}

function section(title) {
  const node = element('section', undefined, 'detail-section');
  node.append(element('h3', title));
  return node;
}

function showDetail(batch) {
  const title = element('h2', batch.title);
  title.id = 'detail-title';
  const meta = [batch.year, batch.department, batch.admission_year && 'القبول ' + batch.admission_year,
    batch.graduation_year && 'التخرّج ' + batch.graduation_year].filter(Boolean).join(' · ');
  content.replaceChildren(title, element('p', meta, 'muted'));
  if (batch.description || batch.quote) content.append(element('p', batch.description || batch.quote));
  const cover = image(batch.cover_url, 'صورة دفعة ' + batch.year, 'dialog-cover');
  if (cover) content.append(cover);
  const share = element('button', 'مشاركة رابط الدفعة', 'button outline');
  const feedback = element('p', undefined, 'muted');
  feedback.setAttribute('role', 'status');
  share.addEventListener('click', async () => {
    const url = new URL('/batch/' + batch.year, location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title: batch.title, url });
      else {
        await navigator.clipboard.writeText(url);
        feedback.textContent = 'تم نسخ الرابط.';
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      const link = element('a', url);
      link.href = url;
      feedback.replaceChildren(link);
    }
  });
  content.append(share, feedback);

  const albums = section('الألبومات');
  if (!batch.albums.length) albums.append(element('p', 'لا توجد ألبومات منشورة.', 'muted'));
  for (const album of batch.albums) {
    const group = element('details');
    group.append(element('summary', album.title + ' · ' + album.photos.length + ' صورة'));
    if (album.subtitle) group.append(element('p', album.subtitle, 'muted'));
    if (!album.photos.length) group.append(element('p', 'لا توجد صور منشورة في هذا الألبوم.', 'muted'));
    const gallery = element('div', undefined, 'gallery');
    for (const photo of album.photos) {
      const thumbnail = image(photo.url, photo.alt_text || album.title);
      if (!thumbnail) continue;
      const figure = element('figure');
      const link = element('a');
      link.href = thumbnail.src;
      link.target = '_blank';
      link.rel = 'noopener';
      link.append(thumbnail);
      figure.append(link);
      if (photo.caption) figure.append(element('figcaption', photo.caption));
      gallery.append(figure);
    }
    group.append(gallery);
    albums.append(group);
  }
  const students = section('أسماء الطلبة');
  if (batch.students.length) {
    const list = element('ul', undefined, 'students');
    list.append(...batch.students.map(name => element('li', name)));
    students.append(list);
  } else students.append(element('p', 'لا توجد أسماء منشورة لهذه الدفعة.', 'muted'));
  content.append(albums, students);
}

async function openBatch(year) {
  detailRequest?.abort();
  const controller = new AbortController();
  detailRequest = controller;
  const pending = element('h2', 'جارٍ تحميل الدفعة…');
  pending.id = 'detail-title';
  content.replaceChildren(pending);
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  try {
    const batch = await fetchJson('/api/batches/' + encodeURIComponent(year), controller.signal);
    if (!controller.signal.aborted) showDetail(batch);
  } catch (error) {
    if (controller.signal.aborted) return;
    pending.textContent = error.status === 404 ? 'هذه الدفعة غير متاحة.' : 'تعذّر تحميل تفاصيل الدفعة.';
    if (error.status !== 404) {
      const reload = element('button', 'إعادة المحاولة', 'button outline');
      reload.addEventListener('click', () => openBatch(year));
      content.append(reload);
    }
  }
}

function route() {
  const batch = location.pathname.match(/^\/batch\/(\d{4})\/?$/) || location.hash.match(/^#batch-(\d{4})$/);
  if (batch) openBatch(batch[1]);
  else if (dialog.open) dialog.close();
}

dialog.addEventListener('close', () => {
  detailRequest?.abort();
  if (!/^\/batch\//.test(location.pathname) && !/^#batch-/.test(location.hash)) return;
  if (history.state?.batch) history.back();
  else history.replaceState(null, '', '/#archive');
});
window.addEventListener('popstate', route);
search.addEventListener('input', render);
retry.addEventListener('click', load);
filters.forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  filters.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  render();
}));
load();
route();
