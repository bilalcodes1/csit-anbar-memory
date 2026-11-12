(function () {
  const pageSize = 24;

  function bind(form, batch, { api, esc }) {
    const picker = form.querySelector('[data-cover-picker]');
    const value = form.elements.cover_key;
    const preview = picker.querySelector('[data-cover-preview]');
    const toggle = picker.querySelector('[data-cover-toggle]');
    const clear = picker.querySelector('[data-cover-clear]');
    const panel = picker.querySelector('[data-cover-panel]');
    const search = panel.querySelector('input');
    const grid = panel.querySelector('[data-cover-grid]');
    const status = panel.querySelector('[role="status"]');
    const more = panel.querySelector('[data-cover-more]');
    const photos = new Map();
    const controller = new AbortController();
    let cursor = '';
    let limit = pageSize;
    let loading = false;
    let failed = false;

    function addPhoto(key, label) {
      if (!key || photos.has(key)) return;
      const name = key.split('/').at(-1);
      const url = '/media/' + key.split('/').map(encodeURIComponent).join('/');
      photos.set(key, { key, name, url, label: label?.trim() || name });
    }
    for (const album of batch.albums || []) {
      for (const photo of album.photos || []) addPhoto(photo.object_key, photo.alt_text);
    }
    addPhoto(value.value);

    function thumbnail(photo, lazy = false) {
      return `<span class="cover-thumbnail" aria-hidden="true">
        <span class="cover-image-fallback">تعذرت معاينة الصورة</span>
        <img src="${esc(photo.url)}" alt="" ${lazy ? 'loading="lazy"' : ''} decoding="async">
      </span>`;
    }

    function updatePreview() {
      const photo = photos.get(value.value);
      preview.innerHTML = photo
        ? `${thumbnail(photo)}<span class="cover-current-text"><strong>الغلاف المختار</strong><bdi>${esc(photo.label)}</bdi></span>`
        : '<span class="cover-current-text"><strong>بدون غلاف</strong></span>';
      clear.hidden = !photo;
      toggle.textContent = photo ? 'تغيير صورة الغلاف' : 'اختيار صورة الغلاف';
    }

    function matchingPhotos() {
      const query = search.value.trim().toLowerCase();
      return [...photos.values()].filter(photo => !query ||
        photo.key.toLowerCase().includes(query) || photo.label.toLowerCase().includes(query));
    }

    function optionFor(photo) {
      if (!photo.option) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cover-option';
        button.dataset.coverKey = photo.key;
        button.title = photo.name;
        button.innerHTML = `${thumbnail(photo, true)}
          <span class="cover-option-name"><bdi>${esc(photo.label)}</bdi></span>`;
        photo.option = button;
      }
      photo.option.setAttribute('aria-pressed', String(photo.key === value.value));
      return photo.option;
    }

    function draw() {
      const matches = matchingPhotos();
      const options = matches.slice(0, limit).map(optionFor);
      if (options.length !== grid.children.length || options.some((option, index) => option !== grid.children[index])) {
        grid.replaceChildren(...options);
      }
      status.textContent = loading ? 'جارٍ تحميل الصور…' : failed ? 'تعذّر تحميل صور المكتبة. أعد المحاولة.'
        : matches.length ? '' : 'لا توجد صور مطابقة ضمن الصور المعروضة.';
      grid.setAttribute('aria-busy', String(loading));
      more.hidden = matches.length <= limit && cursor === null;
      more.disabled = loading;
      more.textContent = failed ? 'إعادة تحميل الصور' : 'عرض صور أخرى';
    }

    async function load() {
      if (loading || cursor === null) return;
      loading = true;
      failed = false;
      draw();
      try {
        const params = new URLSearchParams({ limit: pageSize, cursor });
        const page = await api('/api/admin/media?' + params, { signal: controller.signal });
        for (const file of page.objects) addPhoto(file.key);
        cursor = page.pagination.cursor;
      } catch (error) {
        if (controller.signal.aborted) return;
        failed = true;
      } finally {
        loading = false;
        if (picker.isConnected) draw();
      }
    }

    function setOpen(open) {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    }

    picker.addEventListener('error', event => {
      if (!event.target.matches?.('.cover-thumbnail img')) return;
      event.target.hidden = true;
      const button = event.target.closest('[data-cover-key]');
      if (button) button.disabled = true;
    }, true);
    toggle.addEventListener('click', () => {
      const open = panel.hidden;
      setOpen(open);
      if (open && cursor === '') void load();
    });
    clear.addEventListener('click', () => {
      value.value = '';
      updatePreview();
      draw();
      toggle.focus();
    });
    search.addEventListener('input', () => { limit = pageSize; draw(); });
    grid.addEventListener('click', event => {
      const option = event.target.closest('[data-cover-key]');
      if (!option) return;
      value.value = option.dataset.coverKey;
      updatePreview();
      setOpen(false);
      draw();
      toggle.focus();
    });
    more.addEventListener('click', async () => {
      const count = matchingPhotos().length;
      const before = Math.min(count, limit);
      if (count <= limit) await load();
      limit += pageSize;
      if (!picker.isConnected) return;
      draw();
      const added = grid.children[before];
      if (!failed && added && !added.disabled) added.focus();
      else if (!more.hidden) more.focus();
    });
    form.closest('dialog').addEventListener('close', () => controller.abort(), { once: true });
    updatePreview();
    draw();
  }

  window.adminCoverPicker = { bind };
})();
