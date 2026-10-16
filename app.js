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

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
let items = load();
function save() { localStorage.setItem(KEY, JSON.stringify(items)); }

function dueTs(it) {
  if (!it.date) return null;
  const t = new Date(`${it.date}T${it.time || '09:00'}:00`).getTime();
  return Number.isFinite(t) ? t : null;
}
function isOverdue(it) {
  const d = dueTs(it);
  return !it.done && d !== null && d < Date.now();
}
/* Auto-done: when the due time passes, the reminder marks itself done.
   Rationale: the calendar/phone already fired once — it won't replay. */
function sweepOverdue() {
  const now = Date.now();
  let marked = 0;
  items = items.map(it => {
    if (it.done) return it;
    const d = dueTs(it);
    if (d !== null && d <= now) { marked++; return { ...it, done: true }; }
    return it;
  });
  return marked;
}
function relPast(ts) {
  const m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (m < 1) return 'только что';
  if (m < 60) return `${m} ${plural(m, 'минуту', 'минуты', 'минут')} назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`;
  const d = Math.floor(h / 24);
  return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
}
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/* --- Calendar (.ics): export + cancel. One-way: the file is a copy,
   the phone's Calendar owns the event after import. --- */
function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function icsDateLocal(dateISO, timeHM) {
  const d = (dateISO || todayISO()).replace(/-/g, '');
  const t = `${timeHM || '09:00'}:00`.replace(/:/g, '');
  return `${d}T${t}`;
}
function icsStamp() {
  const p = (n) => String(n).padStart(2, '0');
  const d = new Date();
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}
function calUid(it) {
  return `${String(it.id).replace(/-/g, '')}@napomni`;
}
function buildICS(it, cancel = false) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//napomni//reminder//RU',
    cancel ? 'METHOD:CANCEL' : 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${calUid(it)}`,
    `DTSTAMP:${icsStamp()}`,
    `DTSTART:${icsDateLocal(it.date, it.time)}`,
    `SEQUENCE:${cancel ? 1 : 0}`,
    cancel ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
    `SUMMARY:${icsEscape(it.text)}`,
    'DESCRIPTION:napomni',
  ];
  if (!cancel) {
    lines.push(
      'BEGIN:VALARM',
      'TRIGGER:-PT0M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(it.text)}`,
      'END:VALARM',
    );
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}
function downloadICS(it, cancel) {
  const blob = new Blob([buildICS(it, cancel)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cancel ? 'napomni-otmena.ics' : 'napomni.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function exportToCalendar(id) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  downloadICS(it, false);
  items = items.map(i => (i.id === id ? { ...i, cal: true } : i));
  save(); render();
  toast('Открой файл и нажми «Добавить»');
}
function cancelInCalendar(id) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  downloadICS(it, true);
  toast('Открой файл — событие удалится');
}
const SVG_CAL_ADD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="4" y="5.5" width="16" height="15" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/><path d="M12 13.2v4.6M9.7 15.5h4.6"/></svg>';
const SVG_CAL_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5.5" width="16" height="15" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/><path d="m10.4 14.2 3.2 3.2M13.6 14.2l-3.2 3.2"/></svg>';
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
  const auto = sweepOverdue();
  if (auto > 0) { save(); scheduleAll(); }

  const active = items.filter(i => !i.done).length;
  const done = items.filter(i => i.done).length;
  activeCount.textContent = `${active} ${plural(active, 'активное', 'активных', 'активных')}`;
  doneCount.textContent = `${done} ${plural(done, 'готовое', 'готовых', 'готовых')}`;
  document.title = active > 0 ? `(${active}) napomni` : 'napomni';

  const d = new Date();
  todayLine.textContent = d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  const rank = (it) => (it.done ? 2 : isOverdue(it) ? 0 : 1);
  let view = [...items].sort((a, b) => rank(a) - rank(b) || (dueTs(a) ?? Infinity) - (dueTs(b) ?? Infinity) || b.ts - a.ts);
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
    const chip = node.querySelector('.chip-time');
    const due = dueTs(it);
    if (!it.done && due !== null && due < Date.now()) {
      card.classList.add('overdue');
      chip.textContent = `Просрочено · ${relPast(due)}`;
      chip.classList.add('chip-alert');
    } else {
      chip.textContent = `${fmtDate(it.date)} · ${it.time || '—'}`;
    }
    node.querySelector('.chip-cat').textContent = CATS[it.cat] || 'Дело';
    const calBtn = node.querySelector('.cal');
    calBtn.innerHTML = it.cal ? SVG_CAL_DEL : SVG_CAL_ADD;
    calBtn.classList.toggle('is-in', Boolean(it.cal));
    const calLabel = it.cal ? 'Убрать из календаря' : 'Добавить в календарь';
    calBtn.setAttribute('aria-label', calLabel);
    calBtn.title = calLabel;
    calBtn.addEventListener('click', () => (it.cal ? cancelInCalendar(it.id) : exportToCalendar(it.id)));
    node.querySelector('.check').addEventListener('click', () => toggle(it.id));
    node.querySelector('.del').addEventListener('click', () => remove(it.id));
    listEl.appendChild(node);
  }
  if (auto > 0) toast(auto === 1 ? 'Время вышло — отмечено готовым' : `Время вышло — отмечено готовыми (${auto})`);
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => (toastEl.hidden = true), 2200);
}

function toggle(id) {
  items = items.map(i => (i.id === id ? { ...i, done: !i.done } : i));
  save(); render(); scheduleAll();
}
function remove(id) {
  items = items.filter(i => i.id !== id);
  save(); render(); scheduleAll();
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
  ensurePermission();
  scheduleAll();
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

/* Local alarms: fire while the app is open.
   A static site can't push to a closed app — that needs a server. */
const timers = new Map();
function clearTimers() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}
function fireAlarm(it) {
  const cur = items.find(i => i.id === it.id);
  if (!cur || cur.done) return;
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('napomni', {
        body: `${cur.text}${cur.time ? ' · ' + cur.time : ''}`,
        tag: cur.id,
        icon: './icons/icon-192.png',
      });
    } catch { /* ignore */ }
  }
  if (navigator.vibrate) navigator.vibrate(200);
  toast(cur.text);
  render();
}
function scheduleAll() {
  clearTimers();
  for (const it of items) {
    const d = dueTs(it);
    if (it.done || d === null) continue;
    const delay = d - Date.now();
    if (delay <= 0 || delay > 2147483647) continue;
    timers.set(it.id, setTimeout(() => fireAlarm(it), delay));
  }
}
function ensurePermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

ensurePermission();
dateInput.value = todayISO();
render();
scheduleAll();
setInterval(render, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
