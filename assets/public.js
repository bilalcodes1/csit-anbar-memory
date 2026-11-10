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
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const reveal = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    if (!motionPreference.matches) entry.target.classList.add('archive-reveal');
    reveal.unobserve(entry.target);
  }
}, { threshold: 0.12 }) : null;

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
  grid.querySelectorAll('.year-card').forEach(card => reveal?.observe(card));
  icons();
}

function showDetail(b) {
  const cover = b.image ? { title: 'غلاف الدفعة', photos: [{ url: b.image, alt_text: b.title }] } : null;
  const albums = b.albums.map(album => ({
    title: album.title,
    subtitle: album.subtitle || 'أيام صنعت الذكرى',
    image: mediaUrl(album.photos[0]?.url),
    count: album.photos.length + ' صور',
    photos: album.photos.map(entry => ({ ...entry, url: mediaUrl(entry.url) })).filter(entry => entry.url)
  }));

  modalContent.innerHTML = `
        <div class="overflow-hidden rounded-[1.7rem] bg-gradient-to-br ${b.tone} p-6 text-white md:p-8">
          <p class="text-sm font-bold tracking-widest text-[#e3c98d]">${b.label} · الألبوم السنوي الرقمي</p>
          <div class="mt-3 flex flex-wrap items-end justify-between gap-4"><div><span class="display text-7xl font-bold text-[#e3c98d]">${b.year}</span><h2 id="detail-title" class="display mt-1 text-3xl font-bold">${escapeHtml(b.title)}</h2></div><div class="flex flex-wrap items-center gap-2"><button id="share-batch" class="inline-flex items-center gap-2 rounded-full bg-[#e3c98d] px-4 py-2 text-sm font-bold text-[#102a43] transition hover:bg-white"><i data-lucide="share-2" class="h-4 w-4"></i> مشاركة الدفعة</button><span class="rounded-full border border-white/20 px-4 py-2 text-sm text-white/75">أرشيف الدفعة</span></div></div>
          <p class="mt-5 max-w-xl text-lg leading-loose text-white/75">${escapeHtml(b.quote || b.description)}</p>
        </div>
        <p id="share-feedback" role="status" class="break-all"></p>
        <div class="mt-7 overflow-hidden rounded-3xl bg-white shadow-lg">${cover ? `<button type="button" id="batch-cover" class="block w-full" aria-label="عرض غلاف الدفعة">${photo(b.image, b.title, "max-h-[28rem] w-full object-cover")}</button>` : ''}<div class="flex flex-wrap items-center justify-between gap-3 p-5"><span class="text-sm text-slate-500">${b.students.length} أسماء منشورة</span><span class="rounded-full bg-[#eee8da] px-4 py-2 text-sm font-bold text-[#102a43]">كل صورة لها حكاية</span></div></div>
        <div class="mt-8 flex items-end justify-between gap-4"><div><p class="text-sm font-bold tracking-widest text-[#1f6f78]">أقسام الألبوم السنوي</p><h3 class="display mt-2 text-3xl font-bold text-[#102a43]">استكشف فصول الدفعة</h3></div><span class="text-sm text-slate-500">${albums.length} أقسام</span></div>
        <div class="mt-5 grid gap-4 sm:grid-cols-2">${albums.map((album, index) => `<button data-album="${index}" class="album-tile group relative h-44 overflow-hidden rounded-2xl bg-[#102a43] text-right shadow-md">${photo(album.image, album.title, "h-full w-full object-cover opacity-70")}<span class="absolute inset-0 bg-gradient-to-t from-[#102a43] via-[#102a43]/25 to-transparent"></span><span class="absolute inset-x-4 bottom-4 text-white"><i data-lucide="images" class="mb-2 h-5 w-5 text-[#e3c98d]"></i><strong class="block text-lg">${escapeHtml(album.title)}</strong><small class="text-white/70">${escapeHtml(album.subtitle)} · ${album.count}</small></span></button>`).join('')}</div>
        <div id="album-viewer" class="mt-7 hidden rounded-3xl border border-[#102a43]/10 bg-white p-5"><div class="flex items-center justify-between gap-4"><div><p class="text-xs font-bold tracking-widest text-[#1f6f78]">الألبوم المختار</p><h4 id="album-title" tabindex="-1" class="mt-1 text-xl font-bold text-[#102a43]"></h4></div><button id="album-close" type="button" class="rounded-full bg-[#eee8da] text-[#102a43]" aria-label="إغلاق الألبوم"><i data-lucide="x" class="h-5 w-5" aria-hidden="true"></i></button></div><div id="album-images" class="mt-4 grid grid-cols-2 gap-3"></div></div>
    <section class="mt-7 rounded-3xl border border-[#102a43]/10 bg-white p-5">
      <h3 class="display mb-2 text-xl font-bold text-[#102a43]">أسماء الطلبة</h3>
      ${b.students.length ? `<ul class="list-inside list-disc">${b.students.map(name => `<li>${escapeHtml(name)}</li>`).join('')}</ul>`
        : '<p class="text-sm text-slate-600">لا توجد أسماء منشورة لهذه الدفعة.</p>'}
    </section>`;

  modalContent.querySelector('#batch-cover')?.addEventListener('click', () => openPhoto(cover, 0));
  const viewer = modalContent.querySelector('#album-viewer');
  const albumTitle = modalContent.querySelector('#album-title');
  let activeTile;
  modalContent.querySelectorAll('[data-album]').forEach(tile => {
    tile.setAttribute('aria-controls', viewer.id);
    tile.setAttribute('aria-expanded', 'false');
  });
  modalContent.querySelectorAll('[data-album]').forEach(tile => tile.addEventListener('click', () => {
    const album = albums[Number(tile.dataset.album)];
    activeTile?.setAttribute('aria-expanded', 'false');
    activeTile = tile;
    activeTile.setAttribute('aria-expanded', 'true');
    albumTitle.textContent = album.title;
    modalContent.querySelector('#album-images').innerHTML = album.photos.length ? album.photos.map((entry, index) => `
      <figure>${thumbnail(entry, index, album.title)}
        ${entry.caption ? `<figcaption class="mt-2 text-sm">${escapeHtml(entry.caption)}</figcaption>` : ''}
      </figure>`).join('') : '<p class="col-span-2 text-sm text-slate-600">لا توجد صور منشورة في هذا الألبوم.</p>';
    modalContent.querySelectorAll('#album-images [data-photo]').forEach(button => {
      button.addEventListener('click', () => openPhoto(album, Number(button.dataset.photo)));
    });
    viewer.classList.remove('hidden');
    albumTitle.focus({ preventScroll: true });
    viewer.scrollIntoView({ block: 'nearest' });
  }));
  modalContent.querySelector('#album-close').addEventListener('click', () => {
    viewer.classList.add('hidden');
    activeTile?.setAttribute('aria-expanded', 'false');
    activeTile?.focus();
  });
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
      item.setAttribute('aria-pressed', String(item === button));
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
let photoTransition;

function thumbnail(entry, index, title) {
  const alt = entry.alt_text || title;
  return `<button type="button" class="photo-thumb" data-photo="${index}" aria-label="عرض ${escapeHtml(alt)}">${photo(entry.url, '', '')}</button>`;
}

function displayPhoto() {
  const entry = photoAlbum.photos[photoIndex];
  photoTitle.textContent = photoAlbum.title;
  fullPhoto.alt = entry.alt_text || photoAlbum.title;
  fullPhoto.src = entry.url;
  if (!motionPreference.matches) {
    photoTransition?.cancel();
    photoTransition = fullPhoto.animate?.([{ opacity: .55 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
  }
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

document.querySelectorAll('[data-reveal]').forEach(section => reveal?.observe(section));

const progress = document.querySelector('.archive-progress');
let scrollFrame;
function syncProgress() {
  scrollFrame = undefined;
  const distance = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.transform = `scaleX(${distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0})`;
}
function scheduleProgress() {
  scrollFrame ??= requestAnimationFrame(syncProgress);
}
window.addEventListener('scroll', scheduleProgress, { passive: true });
window.addEventListener('resize', scheduleProgress);
syncProgress();

const collage = document.querySelector('.hero-collage');
let touchedPhoto;
let touchEffectTimer;

function clearTouchEffect() {
  clearTimeout(touchEffectTimer);
  touchedPhoto?.classList.remove('is-touched');
  touchedPhoto = undefined;
}

collage?.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'touch' || motionPreference.matches) return;
  const frame = event.target.closest('.hero-photo');
  if (!frame) return;
  clearTouchEffect();
  touchedPhoto = frame;
  frame.classList.add('is-touched');
  touchEffectTimer = setTimeout(clearTouchEffect, 420);
});
collage?.addEventListener('pointercancel', clearTouchEffect);

const studentForm = document.getElementById('student-search');
const studentName = document.getElementById('student-name');
const studentStatus = document.getElementById('student-search-status');
const studentResults = document.getElementById('student-results');
let studentTimer;
let studentRequest;

function showStudentResults({ students, has_more }) {
  studentStatus.textContent = students.length
    ? has_more ? 'ظهرت أول 24 نتيجة. أضف جزءاً من الاسم حتى تضيق البحث.' : `الأسماء المطابقة: ${students.length}`
    : 'ما لقينا اسم مطابق. جرّب الاسم الأول أو تأكد من كتابة الاسم.';

  const galleries = [];
  studentResults.innerHTML = students.map((student, index) => {
    const albums = student.albums.map(album => ({
      ...album,
      photos: album.photos.map(entry => ({ ...entry, url: mediaUrl(entry.url) })).filter(entry => entry.url)
    })).filter(album => album.photos.length);
    const total = albums.reduce((sum, album) => sum + album.photos.length, 0);
    const year = Number(student.year);

    return `<details class="student-result" style="--entry-delay:${Math.min(index, 5) * 40}ms" ${students.length === 1 ? 'open' : ''}>
      <summary><strong>${escapeHtml(student.full_name)}</strong>
        <span>${year} · ${total ? `عدد الصور: ${total}` : 'ماكو صور مرتبطة بعد'}</span>
      </summary>
      <div class="student-result-content">
        <a href="/batch/${year}">${escapeHtml(student.batch_title)}</a>
        ${albums.map(album => {
          const gallery = galleries.push(album) - 1;
          return `<section class="student-album">
            <h3>${escapeHtml(album.title)}</h3>
            <div class="student-photos" data-gallery="${gallery}">${album.photos.map((entry, i) => thumbnail(entry, i, album.title)).join('')}</div>
          </section>`;
        }).join('') || '<p>الاسم منشور ضمن الدفعة، ولسه ماكو صور منشورة مرتبطة بيه.</p>'}
      </div>
    </details>`;
  }).join('');

  studentResults.onclick = event => {
    const button = event.target.closest('[data-photo]');
    if (!button) return;
    const gallery = galleries[Number(button.closest('[data-gallery]').dataset.gallery)];
    openPhoto(gallery, Number(button.dataset.photo));
  };
}

async function searchStudents(name) {
  const controller = new AbortController();
  studentRequest = controller;
  studentStatus.textContent = 'جارٍ البحث عن الاسم…';
  try {
    const response = await fetch('/api/student-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      signal: controller.signal
    });
    const data = await response.json();
    if (controller.signal.aborted) return;
    if (response.status === 422) studentStatus.textContent = data.error;
    else if (response.ok) showStudentResults(data);
    else throw new Error('Search failed');
  } catch {
    if (!controller.signal.aborted) studentStatus.textContent = 'تعذّر البحث هسه. اضغط زر البحث حتى تعيد المحاولة.';
  }
}

function scheduleStudentSearch(delay) {
  clearTimeout(studentTimer);
  studentRequest?.abort();
  studentResults.replaceChildren();
  studentStatus.textContent = '';
  const name = studentName.value.trim();
  if (name.length < 2) {
    if (name || !delay) studentStatus.textContent = 'اكتب حرفين على الأقل للبحث.';
    return;
  }
  studentTimer = setTimeout(() => searchStudents(name), delay);
}

studentForm.addEventListener('submit', event => {
  event.preventDefault();
  scheduleStudentSearch(0);
});
studentName.addEventListener('input', event => {
  if (!event.isComposing) scheduleStudentSearch(280);
});
