import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  GlassButton, GlassCard, GlassInput, GlassNav, GlassSegmented, GlassSheet, GlassSlider, GlassSwitch
} from '@zakisheriff/liquid-glass';
import '@zakisheriff/liquid-glass/styles.css';
import './glass.css';

const ink = '#205b64';
const gold = '#e2c78e';
const paths = {
  arrow: 'M19 12H5m7 7-7-7 7-7',
  archive: 'M4 6h16M6 6v13h12V6m-8 5h4',
  search: 'M16 16l4 4M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  story: 'M12 6v14m0-14c-3-2-7-3-10-2v14c3-1 7 0 10 2m0-14c3-2 7-3 10-2v14c-3-1-7 0-10 2'
};
function Icon({ name }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

const sections = [
  { id: 'batches', label: 'الدفعات', icon: <Icon name="archive" /> },
  { id: 'find-photos', label: 'ابحث عن صورك', icon: <Icon name="search" /> },
  { id: 'story', label: 'حكايتنا', icon: <Icon name="story" /> }
];
// The package measures track slots from the left. Reverse Arabic choices
// and leave that geometry LTR so the pressed lens and the visible tab agree.
const navItems = [...sections].reverse();
const batchFilters = [
  { key: 'current', label: 'حاليون' },
  { key: 'graduated', label: 'متخرجون' },
  { key: 'all', label: 'الكل' }
];

function ArchiveNav() {
  function indexFromHash() {
    const index = navItems.findIndex(item => location.hash === '#' + item.id);
    return index < 0 ? navItems.length - 1 : index;
  }
  const [selected, setSelected] = useState(indexFromHash);
  useEffect(() => {
    const update = () => setSelected(indexFromHash());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  function navigate(index) {
    const item = navItems[index];
    if (!item) return;
    setSelected(index);
    if (location.hash !== '#' + item.id) location.hash = item.id;
    else document.getElementById(item.id)?.scrollIntoView();
  }
  return (
    <div className="zaki-track-shell" dir="ltr" onClickCapture={event => {
      const tab = event.target.closest('[data-lg-item]');
      // The library only emits onChange for a different tab.
      if (tab?.getAttribute('aria-selected') === 'true') navigate(Number(tab.dataset.lgItem));
    }}>
      <GlassNav items={navItems} activeIndex={selected} onChange={navigate} intensity={3} aria-label="أقسام الأرشيف" />
    </div>
  );
}

function MobileNavigation() {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const links = useRef(null);

  useEffect(() => {
    if (!open) return;
    const page = [...document.querySelectorAll('body > header, body > main, body > footer, body > .archive-skip')].filter(node => !node.inert);
    page.forEach(node => { node.inert = true; });
    function trapTab(event) {
      if (event.key !== 'Tab') return;
      const entries = [...(links.current?.querySelectorAll('a') || [])];
      if (!entries.length) return;
      const current = entries.indexOf(document.activeElement);
      if (current < 0 || (event.shiftKey ? current === 0 : current === entries.length - 1)) {
        event.preventDefault();
        (event.shiftKey ? entries.at(-1) : entries[0]).focus();
      }
    }
    const desktop = matchMedia('(min-width: 761px)');
    const onResize = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener('change', onResize);
    document.addEventListener('keydown', trapTab);
    return () => {
      page.forEach(node => { node.inert = false; });
      desktop.removeEventListener('change', onResize);
      document.removeEventListener('keydown', trapTab);
      if (trigger.current?.getClientRects().length) trigger.current.focus({ preventScroll: true });
    };
  }, [open]);

  return <>
    <GlassButton ref={trigger} variant="glass" icon={<span aria-hidden="true">•••</span>} aria-label="روابط الأرشيف"
      aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} intensity={3} />
    <GlassSheet open={open} onClose={() => setOpen(false)} aria-label="روابط الأرشيف" intensity={3}>
      <nav className="zaki-sheet-links" ref={links} aria-label="أقسام الأرشيف">
        {sections.map(item => <GlassButton key={item.id} href={'#' + item.id} icon={item.icon}
          onClick={() => setOpen(false)} variant="glass" intensity={2}>{item.label}</GlassButton>)}
      </nav>
    </GlassSheet>
  </>;
}

function HeroActions() {
  return <>
    <GlassButton href="#batches" variant="filled" tint={gold} className="zaki-gold" size="lg" icon={<Icon name="arrow" />}>ابدأ الرحلة</GlassButton>
    <GlassButton href="#find-photos" variant="clear" size="lg" icon={<Icon name="search" />} intensity={3}>ابحث عن صورك</GlassButton>
    <a href="#story" className="hero-story-link">عن الفكرة</a>
  </>;
}

function ArchiveSearch({ initial, ...props }) {
  const [value, setValue] = useState(initial);
  const wrapper = useRef(null);
  useLayoutEffect(() => {
    wrapper.current?.querySelector('.lg-input__clear')?.setAttribute('aria-label', 'مسح البحث');
  }, [value]);
  return <div className="zaki-search" ref={wrapper}>
    <GlassInput {...props} type="search" value={value} onChange={event => setValue(event.target.value)}
      tint={ink} intensity={3} autoComplete="off" />
  </div>;
}

function StudentSearch({ initial }) {
  return <>
    <ArchiveSearch initial={initial} id="student-name" name="name" aria-label="اسم الطالب"
      maxLength={120} placeholder="اكتب الاسم الأول أو الاسم الكامل" />
    <GlassButton type="submit" variant="filled" tint={ink} icon={<Icon name="search" />}>ابحث عن الصور</GlassButton>
  </>;
}

function ArchiveTools({ host, initial, filter }) {
  const [selected, setSelected] = useState(() => Math.max(0, batchFilters.findIndex(item => item.key === filter)));
  return <GlassCard className="archive-tools zaki-archive-tools" padding=".75rem" radius="1.65rem" intensity={3}>
    <ArchiveSearch initial={initial} id="batch-search" label="البحث في الدفعات" placeholder="ابحث بالسنة أو باسم الدفعة" />
    <div className="zaki-track-shell zaki-batch-segments" dir="ltr">
      <GlassSegmented options={batchFilters.map(item => item.label)} value={selected} intensity={3}
        aria-label="فلترة الدفعات" onChange={index => {
          setSelected(index);
          host.dispatchEvent(new CustomEvent('archive:filter', { detail: batchFilters[index].key }));
        }} />
    </div>
  </GlassCard>;
}

function PhotoSlider({ native }) {
  const snapshot = () => ({ value: native.valueAsNumber, max: Number(native.max), hidden: native.hidden });
  const [position, setPosition] = useState(snapshot);
  useLayoutEffect(() => {
    native.dataset.enhanced = '';
    const sync = () => setPosition(snapshot());
    native.addEventListener('archive:photo-position', sync);
    sync();
    return () => {
      native.removeEventListener('archive:photo-position', sync);
      delete native.dataset.enhanced;
    };
  }, [native]);

  if (position.hidden) return null;
  return <div className="zaki-photo-range" dir="ltr">
    <GlassSlider min={1} max={position.max} step={1} value={position.value} tint={gold}
      aria-label="موضع الصورة" aria-valuetext={`الصورة ${position.value} من ${position.max}`}
      onChange={value => {
        if (native.valueAsNumber === value) return;
        native.valueAsNumber = value;
        native.dispatchEvent(new Event('input', { bubbles: true }));
      }} />
  </div>;
}

function PublishSwitch({ native, fallback, label }) {
  const id = useId();
  const [checked, setChecked] = useState(native.checked);
  useLayoutEffect(() => {
    fallback.hidden = true;
    const sync = () => setChecked(native.checked);
    native.addEventListener('change', sync);
    return () => {
      fallback.hidden = false;
      native.removeEventListener('change', sync);
    };
  }, [native, fallback]);
  return <span className="zaki-switch-label">
    <GlassSwitch id={id} checked={checked} tint={ink} intensity={3} onChange={value => {
      native.checked = value;
      native.dispatchEvent(new Event('change', { bubbles: true }));
    }} />
    <label htmlFor={id}>{label}</label>
  </span>;
}

function observeAdminSwitches() {
  const roots = new Map();
  const selector = '[data-zaki-switch]';
  function reconcile() {
    for (const [host, root] of roots) {
      if (!host.isConnected) {
        root.unmount();
        roots.delete(host);
      }
    }
    for (const row of document.querySelectorAll(selector)) {
      const host = row.querySelector('[data-switch-control]');
      if (roots.has(host)) continue;
      const fallback = row.querySelector('[data-switch-fallback]');
      const native = fallback.querySelector('input');
      const root = createRoot(host);
      roots.set(host, root);
      root.render(<PublishSwitch native={native} fallback={fallback} label={fallback.textContent.trim()} />);
    }
  }
  const isSwitch = node => node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector));
  const observer = new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(isSwitch))) reconcile();
  });
  observer.observe(document.getElementById('root'), { childList: true, subtree: true });
  observer.observe(document.getElementById('modal-root'), { childList: true, subtree: true });
  reconcile();
}

const islands = {
  navigation: () => <ArchiveNav />,
  'mobile-navigation': () => <MobileNavigation />,
  'hero-actions': () => <HeroActions />,
  'student-search': host => <StudentSearch initial={host.querySelector('input').value} />,
  'archive-tools': host => <ArchiveTools host={host} initial={host.querySelector('input').value} filter={host.dataset.activeFilter || 'all'} />
};
for (const host of document.querySelectorAll('[data-zaki]')) {
  const component = islands[host.dataset.zaki]?.(host);
  if (component) createRoot(host).render(component);
}
const scrubber = document.getElementById('photo-seek-control');
if (scrubber) createRoot(scrubber).render(<PhotoSlider native={document.getElementById('photo-seek')} />);
if (document.body.classList.contains('admin-page')) observeAdminSwitches();
