const grid = document.getElementById('batch-grid');
const status = document.getElementById('archive-status');
const count = document.getElementById('batch-count');
const search = document.getElementById('batch-search');
const retry = document.getElementById('retry');
const modal = document.getElementById('batch-modal');
const modalContent = document.getElementById('modal-content');
const filters = [...document.querySelectorAll('[data-filter]')];
const archiveCovers = new Set([2022, 2023, 2024, 2026]);
let batches;
let activeFilter = 'all';
let detailRequest;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function mediaUrl(value) {
  return typeof value === 'string' && /^\/media\/[a-zA-Z0-9_./-]+$/.test(value) ? value : '';
}

function photo(url, title, classes) {
  return url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(title)}" class="${classes}" loading="lazy">` : '';
}

function publicBatch(batch) {
  const year = Number(batch.year);
  const graduated = batch.status === 'graduated';
  return {
    ...batch,
    year,
    label: graduated ? 'دفعة متخرجة' : 'الدفعة الحالية',
    type: graduated ? 'graduated' : 'current',
    image: mediaUrl(batch.cover_url) || (archiveCovers.has(year) ? `/assets/batches/${year}.jpg` : ''),
    tone: graduated ? 'from-[#9b7740] to-[#102a43]' : 'from-[#1f6f78] to-[#102a43]',
    albums: Array.isArray(batch.albums) ? batch.albums : [],
    students: Array.isArray(batch.students) ? batch.students : []
  };
}

function icons() {
  window.ArchiveIcons?.renderIcons();
}

function normalize(value) {
  return String(value ?? '').normalize('NFKC').replace(/[٠-٩۰-۹]/g, digit =>
    String(digit.charCodeAt(0) - (digit <= '٩' ? 0x660 : 0x6f0))
  ).replace(/[أإآ]/g, 'ا').replace(/[\u064b-\u065f]/g, '').toLowerCase().trim();
}

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw Object.assign(new Error('Request failed'), { status: response.status });
  return response.json();
}

async function load() {
  retry.hidden = true;
  status.textContent = 'جارٍ تحميل الدفعات…';
  try {
    const data = await fetchJson('/api/batches');
    if (!Array.isArray(data)) throw new Error('Invalid archive response');
    batches = data.map(publicBatch);
    count.textContent = batches.length;
    render();
  } catch {
    status.textContent = 'تعذّر تحميل الأرشيف الآن.';
    retry.hidden = false;
  }
}

function render() {
  if (!batches) return;
  const query = normalize(search.value);
  const visible = batches.filter(batch =>
    (activeFilter === 'all' || batch.type === activeFilter) &&
    normalize([batch.year, batch.title, batch.department].join(' ')).includes(query)
  );
  status.textContent = visible.length ? 'الدفعات المعروضة: ' + visible.length
    : batches.length ? 'لا توجد دفعات تطابق البحث.' : 'لا توجد دفعات منشورة حاليًا.';
  grid.innerHTML = visible.map(b => `
        <article class="year-card group relative overflow-hidden rounded-3xl bg-white shadow-lg" data-type="${b.type}">
          <a href="/batch/${b.year}" data-year="${b.year}" class="relative block h-80 w-full overflow-hidden bg-gradient-to-br ${b.tone} text-right">${photo(b.image, b.title, "photo-frame h-full w-full object-cover")}<span class="photo-shine absolute inset-0"></span><div class="absolute inset-0 bg-gradient-to-t from-[#102a43]/95 via-[#102a43]/20 to-transparent"></div><div class="absolute inset-x-6 top-6 flex items-start justify-between text-white"><span class="rounded-full border border-white/25 bg-black/10 px-3 py-1 text-xs">${b.label}</span><span class="display text-6xl font-bold text-[#e3c98d]">${b.year}</span></div><div class="absolute inset-x-6 bottom-6 text-white"><i data-lucide="camera" class="mb-3 h-7 w-7 text-[#e3c98d]"></i><h3 class="display text-2xl font-bold">${escapeHtml(b.title)}</h3><p class="mt-2 text-sm text-white/75">${escapeHtml(b.quote)}</p></div></a>
          <div class="flex items-center justify-between gap-4 p-5"><span class="text-sm text-slate-500">${b.albums.length} ألبوم</span><a href="/batch/${b.year}" data-year="${b.year}" class="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#eee8da] px-4 py-2 text-sm font-bold text-[#102a43] transition hover:bg-[#c8a96b]">افتح الصورة <i data-lucide="maximize-2" class="h-4 w-4"></i></a></div>
        </article>`).join('');
  icons();
}

function showDetail(b) {
  const albums = [
    ...(b.image ? [{ title: 'صورة الدفعة', subtitle: 'اللحظة التي جمعتنا', icon: 'users', image: b.image,
      count: 'صورة الدفعة', photos: [{ url: b.image, alt_text: b.title }] }] : []),
    ...b.albums.map(album => ({
      title: album.title,
      subtitle: album.subtitle || 'أيام صنعت الذكرى',
      icon: 'images',
      image: mediaUrl(album.photos[0]?.url),
      count: album.photos.length + ' صور',
      photos: album.photos.map(entry => ({ ...entry, url: mediaUrl(entry.url) })).filter(entry => entry.url)
    }))
  ];

  modalContent.innerHTML = `
        <div class="overflow-hidden rounded-[1.7rem] bg-gradient-to-br ${b.tone} p-6 text-white md:p-8">
          <p class="text-sm font-bold tracking-widest text-[#e3c98d]">${b.label} · الألبوم السنوي الرقمي</p>
          <div class="mt-3 flex flex-wrap items-end justify-between gap-4"><div><span class="display text-7xl font-bold text-[#e3c98d]">${b.year}</span><h2 id="detail-title" class="display mt-1 text-3xl font-bold">${escapeHtml(b.title)}</h2></div><div class="flex flex-wrap items-center gap-2"><button id="share-batch" class="inline-flex items-center gap-2 rounded-full bg-[#e3c98d] px-4 py-2 text-sm font-bold text-[#102a43] transition hover:bg-white"><i data-lucide="share-2" class="h-4 w-4"></i> مشاركة الدفعة</button><span class="rounded-full border border-white/20 px-4 py-2 text-sm text-white/75">أرشيف الدفعة</span></div></div>
          <p class="mt-5 max-w-xl text-lg leading-loose text-white/75">${escapeHtml(b.quote || b.description)}</p>
        </div>
        <p id="share-feedback" role="status" class="break-all"></p>
        <div class="mt-7 overflow-hidden rounded-3xl bg-white shadow-lg">${photo(b.image, b.title, "max-h-[28rem] w-full object-cover")}<div class="flex flex-wrap items-center justify-between gap-3 p-5"><span class="text-sm text-slate-500">${b.students.length} أسماء منشورة</span><span class="rounded-full bg-[#eee8da] px-4 py-2 text-sm font-bold text-[#102a43]">كل صورة لها حكاية</span></div></div>
        <div class="mt-8 flex items-end justify-between gap-4"><div><p class="text-sm font-bold tracking-widest text-[#1f6f78]">أقسام الألبوم السنوي</p><h3 class="display mt-2 text-3xl font-bold text-[#102a43]">استكشف فصول الدفعة</h3></div><span class="text-sm text-slate-500">${albums.length} أقسام</span></div>
        <div class="mt-5 grid gap-4 sm:grid-cols-2">${albums.map((album, index) => `<button data-album="${index}" class="album-tile group relative h-44 overflow-hidden rounded-2xl bg-[#102a43] text-right shadow-md">${photo(album.image, album.title, "h-full w-full object-cover opacity-70")}<span class="absolute inset-0 bg-gradient-to-t from-[#102a43] via-[#102a43]/25 to-transparent"></span><span class="absolute inset-x-4 bottom-4 text-white"><i data-lucide="${album.icon}" class="mb-2 h-5 w-5 text-[#e3c98d]"></i><strong class="block text-lg">${escapeHtml(album.title)}</strong><small class="text-white/70">${escapeHtml(album.subtitle)} · ${album.count}</small></span></button>`).join('')}</div>
        <div id="album-viewer" class="mt-7 hidden rounded-3xl border border-[#102a43]/10 bg-white p-5"><div class="flex items-center justify-between gap-4"><div><p class="text-xs font-bold tracking-widest text-[#1f6f78]">الألبوم المختار</p><h4 id="album-title" class="mt-1 text-xl font-bold text-[#102a43]"></h4></div><button id="album-close" class="rounded-full bg-[#eee8da] p-2 text-[#102a43]" aria-label="إغلاق الألبوم"><i data-lucide="x" class="h-4 w-4"></i></button></div><div id="album-images" class="mt-4 grid grid-cols-2 gap-3"></div></div>
    <section class="mt-7 rounded-3xl border border-[#102a43]/10 bg-white p-5">
      <h3 class="display mb-2 text-xl font-bold text-[#102a43]">أسماء الطلبة</h3>
      ${b.students.length ? `<ul class="list-inside list-disc">${b.students.map(name => `<li>${escapeHtml(name)}</li>`).join('')}</ul>`
        : '<p class="text-sm text-slate-600">لا توجد أسماء منشورة لهذه الدفعة.</p>'}
    </section>`;

  const viewer = modalContent.querySelector('#album-viewer');
  modalContent.querySelectorAll('[data-album]').forEach(tile => tile.addEventListener('click', () => {
    const album = albums[Number(tile.dataset.album)];
    modalContent.querySelector('#album-title').textContent = album.title;
    modalContent.querySelector('#album-images').innerHTML = album.photos.length ? album.photos.map((entry, index) => `
      <figure>${thumbnail(entry, index, album.title)}
        ${entry.caption ? `<figcaption class="mt-2 text-sm">${escapeHtml(entry.caption)}</figcaption>` : ''}
      </figure>`).join('') : '<p class="col-span-2 text-sm text-slate-600">لا توجد صور منشورة في هذا الألبوم.</p>';
    modalContent.querySelectorAll('#album-images [data-photo]').forEach(button => {
      button.addEventListener('click', () => openPhoto(album, Number(button.dataset.photo)));
    });
    viewer.classList.remove('hidden');
    viewer.scrollIntoView({ block: 'nearest' });
  }));
  modalContent.querySelector('#album-close').addEventListener('click', () => viewer.classList.add('hidden'));
  modalContent.querySelector('#share-batch').addEventListener('click', () => shareBatch(b));
  icons();
}

async function shareBatch(batch) {
  const url = new URL('/batch/' + batch.year, location.origin).href;
  const feedback = document.getElementById('share-feedback');
  try {
    if (navigator.share) await navigator.share({ title: batch.title, url });
    else {
      await navigator.clipboard.writeText(url);
      feedback.textContent = 'تم نسخ الرابط.';
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    const link = document.createElement('a');
    link.href = url;
    link.textContent = url;
    feedback.replaceChildren(link);
  }
}

async function openBatch(year) {
  detailRequest?.abort();
  const controller = new AbortController();
  detailRequest = controller;
  modalContent.innerHTML = '<h2 id="detail-title" class="display text-xl font-bold" role="status">جارٍ تحميل الدفعة…</h2>';
  if (!modal.open) modal.showModal();
  modal.scrollTop = 0;
  try {
    const batch = await fetchJson('/api/batches/' + encodeURIComponent(year), controller.signal);
    if (!controller.signal.aborted) showDetail(publicBatch(batch));
  } catch (error) {
    if (controller.signal.aborted) return;
    modalContent.querySelector('#detail-title').textContent = error.status === 404
      ? 'هذه الدفعة غير متاحة.' : 'تعذّر تحميل تفاصيل الدفعة.';
  }
}

function route() {
  const batch = location.pathname.match(/^\/batch\/(\d{4})\/?$/) || location.hash.match(/^#batch-(\d{4})$/);
  if (batch) openBatch(batch[1]);
  else if (modal.open) modal.close();
}

grid.addEventListener('click', event => {
  const link = event.target.closest('[data-year]');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  history.pushState({ batch: true }, '', link.href);
  openBatch(link.dataset.year);
});
modal.addEventListener('click', event => {
  if (event.target === modal) modal.close();
});
modal.addEventListener('close', () => {
  detailRequest?.abort();
  if (!/^\/batch\//.test(location.pathname) && !/^#batch-/.test(location.hash)) return;
  if (history.state?.batch) history.back();
  else history.replaceState(null, '', '/#batches');
});
window.addEventListener('popstate', route);
search.addEventListener('input', render);
retry.addEventListener('click', load);
filters.forEach(button => {
  button.setAttribute('aria-pressed', String(button.dataset.filter === activeFilter));
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    for (const item of filters) {
      const active = item === button;
      item.setAttribute('aria-pressed', String(active));
      item.classList.toggle('bg-[#102a43]', active);
      item.classList.toggle('text-white', active);
      item.classList.toggle('text-slate-500', !active);
    }
    render();
  });
});
icons();
load();
route();

const photoModal = document.getElementById('photo-modal');
const fullPhoto = document.getElementById('full-photo');
const photoTitle = document.getElementById('photo-title');
const photoCaption = document.getElementById('photo-caption');
const photoCount = document.getElementById('photo-count');
const prevPhoto = document.getElementById('photo-prev');
const nextPhoto = document.getElementById('photo-next');
let photoAlbum;
let photoIndex = 0;

function thumbnail(entry, index, title) {
  const alt = entry.alt_text || title;
  return `<button type="button" class="photo-thumb" data-photo="${index}" aria-label="عرض ${escapeHtml(alt)}">${photo(entry.url, '', '')}</button>`;
}

function displayPhoto() {
  const entry = photoAlbum.photos[photoIndex];
  photoTitle.textContent = photoAlbum.title;
  fullPhoto.alt = entry.alt_text || photoAlbum.title;
  fullPhoto.src = entry.url;
  photoCaption.textContent = entry.caption || '';
  photoCount.textContent = `${photoIndex + 1} / ${photoAlbum.photos.length}`;
  prevPhoto.disabled = nextPhoto.disabled = photoAlbum.photos.length < 2;
}

function openPhoto(album, index) {
  photoAlbum = album;
  photoIndex = index;
  displayPhoto();
  if (!photoModal.open) photoModal.showModal();
}

function stepPhoto(delta) {
  if (!photoAlbum || photoAlbum.photos.length < 2) return;
  photoIndex = (photoIndex + delta + photoAlbum.photos.length) % photoAlbum.photos.length;
  displayPhoto();
}

prevPhoto.addEventListener('click', () => stepPhoto(-1));
nextPhoto.addEventListener('click', () => stepPhoto(1));
photoModal.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  stepPhoto(event.key === 'ArrowLeft' ? 1 : -1);
});
photoModal.addEventListener('click', event => {
  if (event.target === photoModal) photoModal.close();
});
let swipeStart;
const stage = photoModal.querySelector('.photo-stage');
stage.addEventListener('touchstart', event => {
  const touch = event.touches.length === 1 ? event.touches[0] : null;
  swipeStart = touch && { x: touch.clientX, y: touch.clientY };
}, { passive: true });
stage.addEventListener('touchend', event => {
  const touch = event.changedTouches[0];
  if (!swipeStart || !touch) return;
  const dx = touch.clientX - swipeStart.x;
  const dy = touch.clientY - swipeStart.y;
  if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.5) stepPhoto(dx > 0 ? 1 : -1);
  swipeStart = null;
}, { passive: true });

const activities = document.getElementById('activity-albums');
const activityStatus = document.getElementById('activity-status');
const activityViewer = document.getElementById('activity-viewer');
const activityTitle = document.getElementById('activity-title');
const activityPhotos = document.getElementById('activity-photos');
const activityMore = document.getElementById('activity-more');
const activityRetry = document.getElementById('activity-retry');
const photosPerPage = 12;
let activityAlbums = [];
let selectedActivity;
let activityTrigger;
let displayedPhotos = 0;

function showMorePhotos(moveFocus = false) {
  const end = Math.min(displayedPhotos + photosPerPage, selectedActivity.photos.length);
  const newPhotos = selectedActivity.photos.slice(displayedPhotos, end);
  activityPhotos.insertAdjacentHTML('beforeend', newPhotos.map((entry, offset) =>
    thumbnail(entry, displayedPhotos + offset, selectedActivity.title)
  ).join(''));
  if (moveFocus && newPhotos.length) activityPhotos.children[displayedPhotos].focus();
  displayedPhotos = end;
  activityMore.hidden = displayedPhotos >= selectedActivity.photos.length;
}

function showActivity(album, trigger) {
  activityTrigger?.setAttribute('aria-expanded', 'false');
  activityTrigger = trigger;
  activityTrigger.setAttribute('aria-expanded', 'true');
  selectedActivity = album;
  displayedPhotos = 0;
  activityTitle.textContent = album.title;
  activityPhotos.innerHTML = album.photos.length ? '' : '<p>لا توجد صور منشورة في هذا الألبوم.</p>';
  activityViewer.hidden = false;
  showMorePhotos();
  activityTitle.focus({ preventScroll: true });
  activityViewer.scrollIntoView({ block: 'nearest' });
}

async function loadActivities() {
  activityRetry.hidden = true;
  activityStatus.textContent = 'جارٍ تحميل النشاطات…';
  try {
    const data = await fetchJson('/api/activities');
    if (!Array.isArray(data)) throw new Error('Invalid activities response');
    activityAlbums = data.map(album => ({
      ...album,
      photos: album.photos.map(entry => ({ ...entry, url: mediaUrl(entry.url) })).filter(entry => entry.url)
    }));
    activities.innerHTML = activityAlbums.map((album, index) => `
      <button type="button" class="activity-card" data-activity="${index}" aria-expanded="false" aria-controls="activity-viewer">
        ${photo(album.photos[0]?.url, '', '')}
        <span class="activity-card-copy">
          <small>${escapeHtml(album.subtitle)} · ${album.photos.length} صورة</small>
          <strong class="display">${escapeHtml(album.title)}</strong>
          <span>افتح الألبوم</span>
        </span>
      </button>`).join('');
    activityStatus.textContent = activityAlbums.length ? '' : 'لا توجد نشاطات منشورة حاليًا.';
  } catch {
    activityStatus.textContent = 'تعذّر تحميل النشاطات الآن.';
    activityRetry.hidden = false;
  }
}

activities.addEventListener('click', event => {
  const trigger = event.target.closest('[data-activity]');
  if (trigger) showActivity(activityAlbums[Number(trigger.dataset.activity)], trigger);
});
activityPhotos.addEventListener('click', event => {
  const trigger = event.target.closest('[data-photo]');
  if (trigger) openPhoto(selectedActivity, Number(trigger.dataset.photo));
});
activityMore.addEventListener('click', () => showMorePhotos(true));
activityRetry.addEventListener('click', loadActivities);
document.getElementById('activity-close').addEventListener('click', () => {
  activityViewer.hidden = true;
  activityTrigger?.setAttribute('aria-expanded', 'false');
  activityTrigger?.focus();
});
loadActivities();
