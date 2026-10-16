/* napomni — local-first reminders */
const KEY = 'napomni.v1';
const $ = (s, r = document) => r.querySelector(s);
const listEl = $('#list');
const tpl = $('#cardTpl');
const emptyEl = $('#empty');
const todayLine = $('#todayLine');
const activeCount = $('#activeCount');
const doneCount = $('#doneCount');
const toastEl = $('#toast');

const sheet = $('#sheet');
const scrim = $('#scrim');
const textInput = $('#textInput');
const timeInput = $('#timeInput');
const dateInput = $('#dateInput');

let filter = 'all';
let cat = 'time';
let deferredPrompt = null;

const CATS = {
  time: 'Время',
  place: 'Место',
  task: 'Дело',
  star: 'Важное',
};

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function seed() {
  return [
    { id: crypto.randomUUID(), text: 'Позвонить маме', time: '10:00', date: todayISO(), cat: 'star', done: false, ts: Date.now() - 3000 },
    { id: crypto.randomUUID(), text: 'Купить продукты после работы', time: '18:30', date: todayISO(), cat: 'place', done: false, ts: Date.now() - 2000 },
    { id: crypto.randomUUID(), text: 'Полить цветы', time: '19:00', date: todayISO(), cat: 'task', done: true, ts: Date.now() - 1000 },
  ];
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const s = seed();
      localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    }
    return JSON.parse(raw);
  } catch {
    return seed();
  }
}
let items = load();
function save() { localStorage.setItem(KEY, JSON.stringify(items)); }

function fmtDate(iso) {
  if (!iso) return '';
  const t = todayISO();
  if (iso === t) return 'Сегодня';
  const tm = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  if (iso === tm) return 'Вчера';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function render() {
  const active = items.filter(i => !i.done).length;
  const done = items.filter(i => i.done).length;
  activeCount.textContent = active;
  doneCount.textContent = done;

  const d = new Date();
  todayLine.textContent = d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  let view = [...items].sort((a, b) => Number(a.done) - Number(b.done) || b.ts - a.ts);
  if (filter === 'active') view = view.filter(i => !i.done);
  if (filter === 'done') view = view.filter(i => i.done);

  listEl.innerHTML = '';
  emptyEl.hidden = view.length > 0;
  for (const it of view) {
    const node = tpl.content.cloneNode(true);
    const card = node.querySelector('.card');
    card.dataset.id = it.id;
    if (it.done) card.classList.add('done');
    node.querySelector('.card-text').textContent = it.text;
    node.querySelector('.chip-time').textContent = `${fmtDate(it.date)} · ${it.time || '—'}`;
    node.querySelector('.chip-cat').textContent = CATS[it.cat] || 'Дело';
    node.querySelector('.check').addEventListener('click', () => toggle(it.id));
    node.querySelector('.del').addEventListener('click', () => remove(it.id));
    listEl.appendChild(node);
  }
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => (toastEl.hidden = true), 2200);
}

function toggle(id) {
  items = items.map(i => (i.id === id ? { ...i, done: !i.done } : i));
  save(); render();
}
function remove(id) {
  items = items.filter(i => i.id !== id);
  save(); render();
  toast('Удалено');
}

/* sheet */
function openSheet() {
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  scrim.hidden = false;
  dateInput.value = dateInput.value || todayISO();
  setTimeout(() => textInput.focus({ preventScroll: true }), 250);
}
function closeSheet() {
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  scrim.hidden = true;
  textInput.blur();
}

function saveNew() {
  const text = textInput.value.trim();
  if (!text) {
    textInput.focus();
    textInput.style.borderColor = 'rgba(255,255,255,.6)';
    setTimeout(() => (textInput.style.borderColor = ''), 1200);
    return;
  }
  items.unshift({
    id: crypto.randomUUID(),
    text: text.slice(0, 120),
    time: timeInput.value || '09:00',
    date: dateInput.value || todayISO(),
    cat,
    done: false,
    ts: Date.now(),
  });
  save(); render(); closeSheet();
  textInput.value = '';
  toast('Сохранено');
  if (Notification?.permission === 'granted') schedulePing(items[0]);
}

$('#openSheetBtn').addEventListener('click', openSheet);
$('#closeSheetBtn').addEventListener('click', closeSheet);
scrim.addEventListener('click', closeSheet);
$('#saveBtn').addEventListener('click', saveNew);
textInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveNew(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

document.querySelectorAll('.seg').forEach(b =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.seg').forEach(x => x.classList.remove('is-active'));
    b.classList.add('is-active');
    filter = b.dataset.filter;
    render();
  })
);

document.querySelectorAll('.cat').forEach(b =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.cat').forEach(x => {
      x.classList.remove('is-active');
      x.setAttribute('aria-checked', 'false');
    });
    b.classList.add('is-active');
    b.setAttribute('aria-checked', 'true');
    cat = b.dataset.cat;
  })
);

$('#clearDoneBtn').addEventListener('click', () => {
  if (!items.some(i => i.done)) return toast('Нет выполненных');
  items = items.filter(i => !i.done);
  save(); render();
  toast('Очищено');
});
$('#todayBtn').addEventListener('click', () => {
  dateInput.value = todayISO();
  filter = 'all';
  document.querySelectorAll('.seg').forEach(x => x.classList.toggle('is-active', x.dataset.filter === 'all'));
  render();
  openSheet();
});

/* PWA install */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
});
$('#installBtn').addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  } else {
    toast('Меню браузера → «Установить приложение»');
  }
});

/* Notifications (best-effort, local) */
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission().catch(() => {});
}
function schedulePing() { /* placeholder: local-only, no push server */ }

dateInput.value = todayISO();
render();
