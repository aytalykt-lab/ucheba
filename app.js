/* ================= ХРАНИЛИЩЕ ================= */
const STORAGE_KEY = "study_progress_v1";

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveProgress(p) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch (e) {
    /* private mode: the lesson still works */
  }
}

function getLessonState(id) {
  const p = loadProgress();
  return p[id] || { attempts: 0, passed: false, lastErrors: [] };
}

function setLessonState(id, state) {
  const p = loadProgress();
  p[id] = state;
  saveProgress(p);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

/* ================= ДАННЫЕ ================= */
let DATA = null;
let currentSubject = null;
let currentLesson = null;
let currentAnswers = {};
let quizLocked = false;
let teachCards = [];
let teachIndex = 0;
let practiceIndex = 0;
let practiceAnswered = false;
let stage = "teach";
let quizForm = "a";
let keepPassed = false;
let optionOrders = {};
const TUTOR_CODE_KEY = "study_tutor_code_v1";
const TUTOR_SESSION_KEY = "study_tutor_session_ok";
const SOFT_MODE_KEY = "study_soft_mode_v1";
const SOFT_MODE_MS = 7 * 24 * 60 * 60 * 1000;

function showLoadError() {
  const host = document.getElementById("subjects-list") || document.getElementById("tutor-progress") || document.getElementById("plan-calendar");
  if (!host) return;
  host.innerHTML = '<p class="hint">Уроки не открылись. Откройте index.html из папки сайта.</p>';
}

async function loadData() {
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    DATA = await res.json();
  } catch (e) {
    if (!window.STUDY_DATA) throw e;
    DATA = window.STUDY_DATA;
  }
  if (!DATA || !Array.isArray(DATA.subjects)) throw new Error("shape");
  const extra = window.STUDY_GRADE3;
  if (extra && Array.isArray(extra.subjects)) {
    extra.subjects.forEach((subject) => {
      if (!DATA.subjects.some((item) => item.id === subject.id)) DATA.subjects.push(subject);
    });
  }
}

function videoSrc(url) {
  const value = String(url || "").trim();
  if (!value || /^javascript:/i.test(value) || /^data:/i.test(value)) return "";
  const match = value.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (match) return "https://www.youtube-nocookie.com/embed/" + match[1] + "?rel=0";
  if (/^[\w-]{11}$/.test(value)) return "https://www.youtube-nocookie.com/embed/" + value + "?rel=0";
  return value;
}

/* ================= ЛОГИКА ДОСТУПА ================= */
function isLessonUnlocked(subject, index) {
  if (subject.grade === 3) {
    const needs = (subject.lessons[index] && subject.lessons[index].needs) || [];
    return needs.every((id) => getLessonState(id).passed === true);
  }
  if (softModeActive()) return true;
  if (index === 0) return true;
  if (scheduledByNow(subject.lessons[index].id)) return true;
  const prev = subject.lessons[index - 1];
  return getLessonState(prev.id).passed === true;
}

function readSoftMode() {
  try {
    const raw = localStorage.getItem(SOFT_MODE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function anyLessonAttempted() {
  const progress = loadProgress();
  return Object.keys(progress).some((id) => progress[id] && (progress[id].attempts || 0) > 0);
}

function saveSoftMode(state) {
  try {
    localStorage.setItem(SOFT_MODE_KEY, JSON.stringify(state));
  } catch (e) {
    /* the mode still works for this visit */
  }
}

function ensureSoftMode() {
  let state = readSoftMode();
  if (!state) state = { startedAt: null, manual: null };
  if (state.manual === undefined) state.manual = null;
  if (!state.startedAt) state.startedAt = null;
  if (state.startedAt && state.manual == null && !anyLessonAttempted()) state.startedAt = null;
  saveSoftMode(state);
  return state;
}

function noteSoftClock() {
  const state = ensureSoftMode();
  if (state.startedAt || !anyLessonAttempted()) return;
  state.startedAt = new Date().toISOString();
  saveSoftMode(state);
}

function softModeActive() {
  const state = ensureSoftMode();
  if (state.manual === true) return true;
  if (state.manual === false) return false;
  if (!state.startedAt) return true;
  const start = new Date(state.startedAt).getTime();
  if (!start) return true;
  return Date.now() - start < SOFT_MODE_MS;
}

function softModeNote() {
  const state = ensureSoftMode();
  if (state.manual === true) return "Включён вручную, пока вы сами не выключите. Ребёнок видит звёзды без чисел, следующий урок не закрывается.";
  if (state.manual === false) return "Выключен вручную. Следующий урок снова открывается после 80%.";
  if (!state.startedAt) return "Начнётся с первого урока и продлится 7 дней.";
  const end = new Date(new Date(state.startedAt).getTime() + SOFT_MODE_MS);
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  if (Date.now() >= end.getTime()) return "Семь дней прошли, режим выключился сам. Его можно включить снова.";
  return "Сам выключится " + end.getDate() + " " + months[end.getMonth()] + ". Ребёнок видит звёзды без чисел, следующий урок не закрывается. Для вас процент сохраняется.";
}

function renderSoftMode() {
  const note = document.getElementById("tutor-soft-note");
  const button = document.getElementById("tutor-soft-toggle");
  if (!note || !button) return;
  const on = softModeActive();
  note.textContent = softModeNote();
  button.textContent = on ? "Выключить мягкий режим" : "Включить мягкий режим";
}

function toggleSoftMode() {
  const state = ensureSoftMode();
  state.manual = !softModeActive();
  try {
    localStorage.setItem(SOFT_MODE_KEY, JSON.stringify(state));
  } catch (e) {
    window.alert("Не получилось сохранить настройку.");
    return;
  }
  renderSoftMode();
}

function showSoftResult(result, passed) {
  result.classList.remove("is-wait");
  result.textContent = "";
  const phrase = document.createElement("p");
  phrase.textContent = "Ты молодец. Можно спокойно идти дальше.";
  const stars = document.createElement("p");
  stars.className = "stars";
  stars.textContent = "★★★";
  result.appendChild(phrase);
  result.appendChild(stars);
  document.getElementById("check-btn").classList.add("hidden");
  document.getElementById("stuck-block").classList.add("hidden");
  if (passed) {
    offerExplain(result);
    return;
  }
  setTimeout(() => {
    backToLessons();
    renderLessons();
  }, 2500);
}

/* ================= ЭКРАН ПРЕДМЕТОВ ================= */
function showSubjects() {
  document.getElementById("subjects-view").classList.remove("hidden");
  document.getElementById("lessons-view").classList.add("hidden");
  document.getElementById("lesson-view").classList.add("hidden");
  hideScoutView();
  stopSessionTimer();
  renderToday();
  renderJourney();
  renderSubjects();
  maybeAutoBackup();
}

function toggleSubjects() {
  const list = document.getElementById("subjects-list");
  if (list) list.classList.toggle("hidden");
}

const SUBJECT_LOOK = {
  math: { mark: "1+2", tone: "sea" },
  russian: { mark: "Аа", tone: "lotus" },
  reading: { mark: "«»", tone: "lantern" },
  english: { mark: "Abc", tone: "rice" },
  world: { mark: "☀", tone: "lantern" },
  math3: { mark: "×÷", tone: "sea" },
  rus3: { mark: "Яя", tone: "lotus" },
};

function subjectCard(subj) {
  const lessons = subj.lessons || [];
  const total = lessons.length;
  const done = lessons.filter((lesson) => getLessonState(lesson.id).passed).length;
  const look = SUBJECT_LOOK[subj.id] || { mark: "•", tone: "sea" };
  const div = document.createElement("button");
  div.type = "button";
  div.className = "card subject-card tone-" + look.tone;
  const share = total ? Math.round((done / total) * 100) : 0;
  div.innerHTML = `
    <span class="subject-mark" aria-hidden="true">${esc(look.mark)}</span>
    <span class="subject-text">
      <span class="card-title">${esc(subj.name || subj.title)}</span>
      <span class="card-status">${done} из ${total}</span>
      <span class="bar" aria-hidden="true"><span style="width:${share}%"></span></span>
    </span>
  `;
  div.onclick = () => openSubject(subj);
  return div;
}

function renderSubjects() {
  const list = document.getElementById("subjects-list");
  list.innerHTML = "";
  const base = DATA.subjects.filter((subj) => subj.grade !== 3);
  const next = DATA.subjects.filter((subj) => subj.grade === 3);
  base.forEach((subj) => list.appendChild(subjectCard(subj)));
  if (next.length) {
    const head = document.createElement("h3");
    head.className = "grid-head";
    head.textContent = "Ступенька в 3 класс";
    list.appendChild(head);
    next.forEach((subj) => list.appendChild(subjectCard(subj)));
  }
}

function nextGrade3() {
  for (const subject of DATA.subjects) {
    if (subject.grade !== 3) continue;
    for (let i = 0; i < subject.lessons.length; i += 1) {
      const lesson = subject.lessons[i];
      if (isLessonUnlocked(subject, i) && !getLessonState(lesson.id).passed) return { subject, lesson };
    }
  }
  return null;
}

/* ================= ЭКРАН УРОКОВ ================= */
function openSubject(subj) {
  currentSubject = subj;
  document.getElementById("subjects-view").classList.add("hidden");
  document.getElementById("lessons-view").classList.remove("hidden");
  document.getElementById("lesson-view").classList.add("hidden");
  hideScoutView();
  document.getElementById("subject-title").textContent = subj.name || subj.title || "";
  renderLessons();
}

function backToLessons() {
  document.getElementById("lesson-view").classList.add("hidden");
  document.getElementById("lessons-view").classList.remove("hidden");
  hideScoutView();
  stopSessionTimer();
  renderLessons();
}

function renderLessons() {
  const list = document.getElementById("lessons-list");
  list.innerHTML = "";
  let nextShown = false;
  (currentSubject.lessons || []).forEach((lesson, i) => {
    const unlocked = isLessonUnlocked(currentSubject, i);
    const state = getLessonState(lesson.id);
    const isNext = unlocked && !state.passed && !nextShown;
    if (isNext) nextShown = true;
    const div = document.createElement("div");
    div.className = "card lesson-card" + (unlocked ? "" : " locked") + (state.passed ? " done" : "") + (isNext ? " is-next" : "");
    let status = "закрыт";
    if (state.passed) status = "пройден";
    else if (isNext) status = state.attempts > 0 ? "Продолжи отсюда" : "Начни отсюда";
    else if (unlocked && state.attempts > 0) status = "в процессе";
    else if (unlocked) status = "можно начать";
    else if (currentSubject.grade === 3) {
      const need = (lesson.needs || []).map((id) => findLesson(id)).filter((item) => item && !getLessonState(item.lesson.id).passed)[0];
      if (need) status = "Откроется после урока «" + need.lesson.title + "»";
    }
    if (readExplained()[lesson.id]) status += " ★";
    div.innerHTML = `
      <span class="lesson-num" aria-hidden="true">${state.passed ? "✓" : i + 1}</span>
      <span class="subject-text">
        <span class="card-title">${esc(lesson.title)}</span>
        <span class="card-status">${esc(status)}</span>
      </span>
    `;
    if (unlocked) div.onclick = () => openLesson(lesson);
    list.appendChild(div);
  });
}

/* ================= ЭКРАН УРОКА ================= */
function lessonCards(lesson) {
  const cards = [];
  if (lesson.goal) {
    cards.push({
      kicker: "Цель",
      title: "Это нужно уметь",
      body: lesson.goal,
      label: "Цель урока",
    });
  }
  const steps = Array.isArray(lesson.teach) && lesson.teach.length
    ? lesson.teach
    : (lesson.text ? [lesson.text] : []);
  steps.forEach((step, i) => {
    cards.push({
      kicker: "Урок",
      title: "Смотри и запоминай",
      body: step,
      label: `Урок, шаг ${i + 1} из ${steps.length}`,
    });
  });
  const walk = Array.isArray(lesson.walk) && lesson.walk.length
    ? lesson.walk
    : (lesson.example ? [lesson.example] : []);
  walk.forEach((step, i) => {
    cards.push({
      kicker: "Разберём вместе",
      title: i === 0 ? "Пример" : "Дальше по примеру",
      body: step,
      label: `Пример, шаг ${i + 1} из ${walk.length}`,
    });
  });
  return cards;
}

function fisherYates(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

function optionOrderKey(scope, index) {
  const lessonId = currentLesson ? currentLesson.id : "lesson";
  return lessonId + ":" + scope + ":" + index;
}

function displayOrder(question, key) {
  if (!optionOrders[key]) {
    const indexes = (question.options || []).map((_, index) => index);
    optionOrders[key] = fisherYates(indexes);
  }
  return optionOrders[key];
}

function correctOptionText(question) {
  const options = question.options || [];
  return String(options[question.correct] ?? "");
}

function openLesson(lesson) {
  currentLesson = lesson;
  keepPassed = getLessonState(lesson.id).passed === true;
  currentAnswers = {};
  optionOrders = {};
  teachCards = lessonCards(lesson);
  teachIndex = 0;
  practiceIndex = 0;
  practiceAnswered = false;
  stage = "teach";
  quizForm = "a";
  document.getElementById("lessons-view").classList.add("hidden");
  document.getElementById("lesson-view").classList.remove("hidden");
  hideScoutView();
  document.getElementById("lesson-title").textContent = lesson.title;
  const result = document.getElementById("result");
  result.classList.add("hidden");
  result.classList.remove("is-wait");
  result.textContent = "";
  document.getElementById("stuck-block").classList.add("hidden");
  document.getElementById("quiz-block").classList.add("hidden");
  document.getElementById("practice-block").classList.add("hidden");
  document.getElementById("practice-why").classList.add("hidden");
  document.getElementById("practice-next").classList.add("hidden");
  document.getElementById("teach-block").classList.remove("hidden");
  const old = document.getElementById("explain-mom");
  if (old) old.remove();
  renderVideo(lesson);
  practiceMode = "practice";
  warmItems = keepPassed ? [] : warmupFor(lesson);
  const warmStage = document.querySelector('#stage-strip [data-stage="warm"]');
  if (warmStage) warmStage.classList.toggle("hidden", !warmItems.length);
  if (warmItems.length) startWarmup();
  else showTeachCard();
  startSessionTimer();
}

const SESSION_MS = 20 * 60 * 1000;
const EXPLAIN_KEY = "study_explain_v1";
let sessionTimer = null;
let sessionEndsAt = 0;
let sessionNoted = false;

function startSessionTimer() {
  stopSessionTimer();
  sessionEndsAt = Date.now() + SESSION_MS;
  sessionNoted = false;
  const time = document.getElementById("session-time");
  const note = document.getElementById("session-note");
  if (time) time.textContent = "";
  paintSessionSun(0);
  if (note) note.classList.add("hidden");
  tickSession();
  sessionTimer = setInterval(tickSession, 1000);
}

function stopSessionTimer() {
  stopSpeak();
  if (sessionTimer) clearInterval(sessionTimer);
  sessionTimer = null;
}

function paintSessionSun(progress) {
  const timer = document.getElementById("session-timer");
  if (!timer) return;
  const value = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  timer.style.setProperty("--session", String(value));
}

function tickSession() {
  const time = document.getElementById("session-time");
  const note = document.getElementById("session-note");
  if (!time && !document.getElementById("session-timer")) return;
  const left = sessionEndsAt - Date.now();
  if (left > 0) {
    paintSessionSun(1 - left / SESSION_MS);
    if (time) time.textContent = "";
    return;
  }
  paintSessionSun(1);
  if (time) time.textContent = "";
  if (!sessionNoted && note) {
    sessionNoted = true;
    note.classList.remove("hidden");
  }
}

function finishSession() {
  stopSessionTimer();
  showSubjects();
}

function stayLonger() {
  sessionNoted = true;
  stopSessionTimer();
  const note = document.getElementById("session-note");
  const time = document.getElementById("session-time");
  if (note) note.classList.add("hidden");
  if (time) time.textContent = "можно ещё";
}

function readExplained() {
  try {
    const raw = localStorage.getItem(EXPLAIN_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch (e) {
    return {};
  }
}

function explainHints(lesson) {
  const steps = Array.isArray(lesson.teach) ? lesson.teach : [];
  return steps.slice(0, 3).map((step) => String(step).trim()).filter(Boolean);
}

function offerExplain(result) {
  const explain = document.createElement("button");
  explain.type = "button";
  explain.className = "action-btn";
  explain.textContent = "Объясни маме своими словами";
  explain.onclick = showExplainHints;
  result.appendChild(explain);
  const next = document.createElement("button");
  next.type = "button";
  next.className = "action-btn";
  next.textContent = "Дальше";
  next.onclick = () => showSubjects();
  result.appendChild(next);
}

function showExplainHints() {
  if (!currentLesson) return;
  const result = document.getElementById("result");
  let box = document.getElementById("explain-mom");
  if (!box) {
    box = document.createElement("div");
    box.id = "explain-mom";
    result.appendChild(box);
  }
  const hints = explainHints(currentLesson);
  const lines = hints.length ? hints : ["Расскажи своими словами, о чём был урок."];
  box.innerHTML = `<p>Расскажи маме своими словами. Это опоры, не готовый ответ.</p>${lines.map((line) => `<p>${esc(line)}</p>`).join("")}<button type="button" class="action-btn" onclick="gaveExplain()">Объяснила!</button>`;
}

function gaveExplain() {
  if (!currentLesson) return;
  const all = readExplained();
  all[currentLesson.id] = todayISO();
  localStorage.setItem(EXPLAIN_KEY, JSON.stringify(all));
  const box = document.getElementById("explain-mom");
  if (box) box.innerHTML = `<p class="stars">★</p><p>Звезда за рассказ.</p>`;
}

let practiceMode = "practice";
let warmItems = [];

function practiceItems() {
  if (practiceMode === "warm") return warmItems;
  return (currentLesson && currentLesson.practice) || [];
}

/* «Вспомним»: два вопроса из уже пройденного перед новой темой. */
function warmupFor(lesson) {
  const found = findLesson(lesson.id);
  if (!found) return [];
  let pool;
  if (found.subject.grade === 3) {
    pool = (lesson.needs || []).map((id) => findLesson(id)).filter(Boolean).map((item) => item.lesson);
  } else {
    pool = found.subject.lessons.slice(0, found.index).filter((item) => getLessonState(item.id).passed === true);
  }
  const shaky = pool.filter((item) => getLessonState(item.id).shaky);
  const picked = [];
  fisherYates(shaky).concat(fisherYates(pool.slice(-4))).forEach((item) => {
    if (picked.length < 2 && picked.indexOf(item) < 0) picked.push(item);
  });
  return picked.map((item) => {
    const all = (item.recheck || []).concat(item.questions || []).filter((one) => one && one.options && one.options.length);
    const one = all[Math.floor(Math.random() * all.length)];
    return one ? { q: one.q, options: one.options, correct: one.correct, from: item.title } : null;
  }).filter(Boolean);
}

function startWarmup() {
  practiceMode = "warm";
  practiceIndex = 0;
  document.getElementById("teach-block").classList.add("hidden");
  document.getElementById("practice-block").classList.remove("hidden");
  showPractice();
}

function plural(count, one, few, many) {
  const n10 = count % 10;
  const n100 = count % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

/* Картинка к карточке: ряды точек для умножения и деления, клетки для площади. */
function gridPic(perRow, total, caption, square) {
  const cell = 30;
  const rows = Math.ceil(total / perRow);
  const full = Math.floor(total / perRow) * perRow;
  let marks = "";
  for (let i = 0; i < total; i += 1) {
    const x = (i % perRow) * cell;
    const y = Math.floor(i / perRow) * cell;
    const cls = i >= full ? "pic-rest" : "pic-dot";
    marks += square
      ? `<rect class="${cls}" x="${x + 2}" y="${y + 2}" width="${cell - 4}" height="${cell - 4}" rx="4"></rect>`
      : `<circle class="${cls}" cx="${x + cell / 2}" cy="${y + cell / 2}" r="${cell / 2 - 5}"></circle>`;
  }
  return `<figure class="pic"><svg viewBox="0 0 ${perRow * cell} ${rows * cell}" width="${perRow * cell}" height="${rows * cell}" aria-hidden="true">${marks}</svg><figcaption>${esc(caption)}</figcaption></figure>`;
}

function placePic(text) {
  const seen = [];
  (String(text).match(/\d+/g) || []).forEach((raw) => {
    const n = Number(raw);
    if (n >= 10 && n <= 999 && seen.indexOf(n) < 0 && seen.length < 2) seen.push(n);
  });
  return seen.map((n) => {
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;
    const blocks = '<span class="b100"></span>'.repeat(h) + '<span class="b10"></span>'.repeat(t) + '<span class="b1"></span>'.repeat(u);
    const parts = [];
    if (h) parts.push(h + " сот.");
    parts.push(t + " дес.");
    parts.push(u + " ед.");
    return `<figure class="pic place"><div class="place-blocks" aria-hidden="true">${blocks}</div><figcaption><b>${n}</b> — ${parts.join(" · ")}</figcaption></figure>`;
  }).join("");
}

function lessonPic(text) {
  if (!currentLesson) return "";
  const found = findLesson(currentLesson.id);
  if (!found || (found.subject.id !== "math" && found.subject.id !== "math3")) return "";
  const id = currentLesson.id;
  if (currentLesson.pic === "place" || id === "math-01" || id === "math-f-compare") return placePic(text);
  if (id === "math-f-time") return "";
  const mul = /(\d+)\s*×\s*(\d+)/.exec(text);
  const div = /(\d+)\s*:\s*(\d+)/.exec(text);
  if (mul && (!div || mul.index < div.index)) {
    const a = Number(mul[1]);
    const b = Number(mul[2]);
    if (a < 1 || b < 1 || a > 10 || b > 10) return "";
    const square = currentLesson.pic === "area";
    const what = square ? plural(a, "клетке", "клетки", "клеток") : plural(a, "точке", "точки", "точек");
    return gridPic(a, a * b, b + " " + plural(b, "ряд", "ряда", "рядов") + " по " + a + " " + what, square);
  }
  if (div) {
    const n = Number(div[1]);
    const d = Number(div[2]);
    if (d < 2 || d > 10 || n < d || n > 40) return "";
    const rest = n % d;
    const rows = Math.floor(n / d);
    return gridPic(d, n, rows + " " + plural(rows, "ряд", "ряда", "рядов") + " по " + d + (rest ? ", осталось " + rest : ""), false);
  }
  return "";
}

function setStage(name) {
  const items = Array.from(document.querySelectorAll("#stage-strip li"));
  const index = items.findIndex((item) => item.getAttribute("data-stage") === name);
  items.forEach((item, i) => {
    item.classList.toggle("is-now", i === index);
    item.classList.toggle("is-done", i < index);
  });
}

function canSpeak() {
  return "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
}

function stopSpeak() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

function speak(text) {
  if (!canSpeak() || !text) return;
  window.speechSynthesis.cancel();
  const voice = new SpeechSynthesisUtterance(String(text));
  voice.lang = /[а-яё]/i.test(text) ? "ru-RU" : "en-US";
  voice.rate = 0.8;
  window.speechSynthesis.speak(voice);
}

function speakCard() {
  const card = teachCards[teachIndex];
  if (card) speak(card.body);
}

/* Одна мысль на строку; числа и слова в кавычках выделены. */
function richLines(text) {
  const lines = String(text || "").split(/(?<!ост\.)(?<=[.!?])\s+(?=[A-ZА-ЯЁ«0-9])/).filter(Boolean);
  return lines.map((line) => {
    const marked = esc(line).replace(/«[^»]+»|\d+(?:\s*[+−×:=·-]\s*\d+)*/g, (hit) => `<b class="key">${hit}</b>`);
    return `<p class="line">${marked}</p>`;
  }).join("");
}

function stepDots(index, total) {
  let dots = "";
  for (let i = 0; i < total; i++) {
    const mark = i === index ? " is-now" : i < index ? " is-done" : "";
    dots += `<span class="step-dot${mark}"></span>`;
  }
  return `<span class="step-dots" aria-hidden="true">${dots}</span>`;
}

function showTeachCard() {
  const card = teachCards[teachIndex];
  const body = document.getElementById("teach-body");
  const label = document.getElementById("step-label");
  const button = document.getElementById("teach-next");
  if (!card) {
    startPractice();
    return;
  }
  stopSpeak();
  setStage(card.kicker === "Разберём вместе" ? "walk" : "teach");
  label.innerHTML = stepDots(teachIndex, teachCards.length);
  body.innerHTML = `<h3>${esc(card.kicker)}. ${esc(card.title)}</h3>${richLines(card.body)}${lessonPic(card.body)}`;
  const back = document.getElementById("teach-back");
  if (back) back.classList.toggle("is-off", teachIndex === 0);
  const listen = document.getElementById("teach-listen");
  if (listen) listen.classList.toggle("hidden", !canSpeak());
  const last = teachIndex >= teachCards.length - 1;
  const hasPractice = currentLesson && Array.isArray(currentLesson.practice) && currentLesson.practice.length;
  if (!last) button.textContent = "Дальше";
  else if (stage === "corrective") button.textContent = "Ещё одна попытка";
  else button.textContent = hasPractice ? "Потренироваться" : "К проверке";
}

function prevTeachStep() {
  if (teachIndex <= 0) return;
  teachIndex -= 1;
  showTeachCard();
}

function nextTeachStep() {
  if (teachIndex < teachCards.length - 1) {
    teachIndex += 1;
    showTeachCard();
    return;
  }
  if (stage === "corrective") startQuiz("b");
  else startPractice();
}

function startPractice() {
  const items = (currentLesson && currentLesson.practice) || [];
  document.getElementById("teach-block").classList.add("hidden");
  if (!items.length) {
    startQuiz();
    return;
  }
  practiceIndex = 0;
  practiceMode = "practice";
  document.getElementById("practice-block").classList.remove("hidden");
  showPractice();
}

function showPractice() {
  const items = practiceItems();
  const item = items[practiceIndex];
  practiceAnswered = false;
  stopSpeak();
  const warm = practiceMode === "warm";
  setStage(warm ? "warm" : "practice");
  const heading = document.getElementById("practice-heading");
  if (heading) heading.textContent = warm ? "Вспомним, что уже было." : "Тренировка. Здесь можно пробовать спокойно.";
  const label = document.getElementById("practice-label");
  const body = document.getElementById("practice-body");
  const why = document.getElementById("practice-why");
  const next = document.getElementById("practice-next");
  label.innerHTML = stepDots(practiceIndex, items.length);
  why.classList.add("hidden");
  why.textContent = "";
  next.classList.add("hidden");
  const order = displayOrder(item, optionOrderKey(practiceMode, practiceIndex));
  const opts = order.map((originalIndex, displayIndex) => (
    `<button type="button" class="option" data-o="${displayIndex}" onclick="answerPractice(${displayIndex})"><span>${esc(item.options[originalIndex])}</span></button>`
  )).join("");
  body.innerHTML = `<div class="question"><p>${esc(item.q)}</p><div class="options">${opts}</div></div>`;
}

function answerPractice(displayIndex) {
  if (practiceAnswered) return;
  practiceAnswered = true;
  const item = practiceItems()[practiceIndex];
  const order = displayOrder(item, optionOrderKey(practiceMode, practiceIndex));
  const right = correctOptionText(item);
  const chosen = String(item.options[order[displayIndex]] ?? "");
  const buttons = document.querySelectorAll("#practice-body .option");
  buttons.forEach((button) => {
    const shown = String(item.options[order[Number(button.getAttribute("data-o"))]] ?? "");
    button.disabled = true;
    if (shown === right) button.classList.add("correct");
    else if (Number(button.getAttribute("data-o")) === displayIndex) button.classList.add("wrong");
  });
  const why = document.getElementById("practice-why");
  const warm = practiceMode === "warm";
  if (warm) {
    why.textContent = chosen === right
      ? "Верно. Ты это помнишь!"
      : "Почти. Правильно: " + right + ". Это было в уроке «" + item.from + "».";
  } else {
    why.textContent = (chosen === right ? "Верно. " : "Почти. ") + (item.why || ("Правильно: " + right));
  }
  why.classList.remove("hidden");
  const next = document.getElementById("practice-next");
  const last = practiceIndex >= practiceItems().length - 1;
  next.textContent = !last ? "Дальше" : warm ? "К новой теме" : "К проверке";
  next.classList.remove("hidden");
}

function nextPractice() {
  if (!practiceAnswered) return;
  if (practiceIndex < practiceItems().length - 1) {
    practiceIndex += 1;
    showPractice();
    return;
  }
  if (practiceMode === "warm") {
    practiceMode = "practice";
    document.getElementById("practice-block").classList.add("hidden");
    document.getElementById("practice-why").classList.add("hidden");
    document.getElementById("practice-next").classList.add("hidden");
    document.getElementById("teach-block").classList.remove("hidden");
    showTeachCard();
    return;
  }
  startQuiz();
}

function activeQuestions() {
  if (quizForm === "b" && currentLesson && Array.isArray(currentLesson.recheck) && currentLesson.recheck.length) {
    return currentLesson.recheck;
  }
  return (currentLesson && currentLesson.questions) || [];
}

function startQuiz(form) {
  quizForm = form === "b" ? "b" : "a";
  stage = "quiz";
  stopSpeak();
  setStage("quiz");
  document.getElementById("practice-block").classList.add("hidden");
  document.getElementById("teach-block").classList.add("hidden");
  document.getElementById("stuck-block").classList.add("hidden");
  document.getElementById("quiz-block").classList.remove("hidden");
  const title = document.getElementById("quiz-title");
  const hint = document.getElementById("quiz-hint");
  if (title) title.textContent = quizForm === "b" ? "Ещё одна попытка" : "Проверка";
  if (hint) {
    hint.textContent = quizForm === "b"
      ? "Другие вопросы про то же самое."
      : "Один вопрос за раз. Не спеши.";
  }
  currentAnswers = {};
  quizLocked = false;
  renderQuestions(currentLesson);
  const result = document.getElementById("result");
  result.classList.add("hidden");
  result.classList.remove("is-wait");
  result.textContent = "";
  quizIndex = 0;
  quizPaged = true;
  showQuizPage();
  document.getElementById("quiz-block").scrollIntoView({ behavior: "smooth", block: "start" });
}

let quizIndex = 0;
let quizPaged = false;

/* Проверка идёт по одному вопросу; после «Проверить» видны все сразу. */
function showQuizPage() {
  const cards = document.querySelectorAll("#questions .question");
  const total = cards.length;
  const last = quizIndex >= total - 1;
  cards.forEach((card, i) => card.classList.toggle("hidden", quizPaged && i !== quizIndex));
  const dots = document.getElementById("quiz-dots");
  const back = document.getElementById("quiz-back");
  const next = document.getElementById("quiz-next");
  const check = document.getElementById("check-btn");
  const pick = document.getElementById("quiz-pick");
  if (pick) pick.classList.add("hidden");
  if (dots) {
    dots.innerHTML = quizPaged ? stepDots(quizIndex, total) : "";
    dots.classList.toggle("hidden", !quizPaged);
  }
  if (back) {
    back.classList.toggle("hidden", !quizPaged);
    back.classList.toggle("is-off", quizIndex === 0);
  }
  if (next) next.classList.toggle("hidden", !quizPaged || last);
  if (check) check.classList.toggle("hidden", quizPaged && !last);
}

function quizStep(delta) {
  const total = document.querySelectorAll("#questions .question").length;
  if (delta > 0 && currentAnswers[quizIndex] === undefined) {
    const pick = document.getElementById("quiz-pick");
    if (pick) pick.classList.remove("hidden");
    return;
  }
  const target = quizIndex + delta;
  if (target < 0 || target >= total) return;
  quizIndex = target;
  showQuizPage();
}

function startCorrective() {
  const steps = currentLesson && Array.isArray(currentLesson.corrective) && currentLesson.corrective.length
    ? currentLesson.corrective
    : ["Посмотрим на это ещё раз, другими словами."];
  stage = "corrective";
  teachCards = steps.map((step, i) => ({
    kicker: "Ещё раз",
    title: "Другое объяснение",
    body: step,
    label: `Ещё раз, шаг ${i + 1} из ${steps.length}`,
  }));
  teachIndex = 0;
  document.getElementById("quiz-block").classList.add("hidden");
  document.getElementById("stuck-block").classList.add("hidden");
  document.getElementById("practice-block").classList.add("hidden");
  document.getElementById("teach-block").classList.remove("hidden");
  showTeachCard();
  document.getElementById("teach-block").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderVideo(lesson) {
  const block = document.getElementById("video-block");
  const container = document.getElementById("video-container");
  container.innerHTML = "";
  const src = videoSrc(lesson.video);
  if (!src) {
    block.classList.add("hidden");
    return;
  }
  block.classList.remove("hidden");
  if (src.includes("youtube") || src.includes("youtu.be")) {
    const iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.allowFullscreen = true;
    iframe.title = lesson.title;
    container.appendChild(iframe);
  } else {
    const video = document.createElement("video");
    video.src = src;
    video.controls = true;
    container.appendChild(video);
  }
}

function renderQuestions(lesson) {
  const wrap = document.getElementById("questions");
  wrap.innerHTML = "";
  const scope = quizForm === "b" ? "quiz-b" : "quiz-a";
  activeQuestions().forEach((q, qi) => {
    const div = document.createElement("div");
    div.className = "question";
    const order = displayOrder(q, optionOrderKey(scope, qi));
    const opts = order.map((originalIndex, displayIndex) => `
      <label class="option" data-q="${qi}" data-o="${displayIndex}">
        <input type="radio" name="q${qi}" value="${displayIndex}" onchange="selectAnswer(${qi}, ${displayIndex})">
        <span>${esc(q.options[originalIndex])}</span>
      </label>
    `).join("");
    div.innerHTML = `<p>${qi + 1}. ${esc(q.q)}</p><div class="options">${opts}</div>`;
    wrap.appendChild(div);
  });
}

function selectAnswer(qi, oi) {
  const same = currentAnswers[qi] === oi;
  currentAnswers[qi] = oi;
  const pick = document.getElementById("quiz-pick");
  if (pick) pick.classList.add("hidden");
  document.querySelectorAll(`#questions .option[data-q="${qi}"]`).forEach((label) => {
    label.classList.toggle("is-chosen", Number(label.getAttribute("data-o")) === oi);
  });
  if (same || !quizLocked) return;
  quizLocked = false;
  const button = document.getElementById("check-btn");
  if (button) button.classList.remove("hidden");
}

/* ================= ПРОВЕРКА ================= */
function checkAnswers() {
  const lesson = currentLesson;
  if (!lesson) return;
  const list = activeQuestions();
  const total = list.length;
  if (Object.keys(currentAnswers).length < total) {
    const result = document.getElementById("result");
    result.classList.remove("hidden");
    result.classList.add("is-wait");
    result.textContent = "Ответь на каждый вопрос.";
    return;
  }
  if (quizLocked) return;
  quizLocked = true;
  quizPaged = false;
  showQuizPage();
  document.getElementById("check-btn").classList.add("hidden");
  setTimeout(() => {
    const box = document.getElementById("result");
    if (box && !box.classList.contains("hidden")) box.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 60);
  let correct = 0;
  const errors = [];

  const scope = quizForm === "b" ? "quiz-b" : "quiz-a";
  list.forEach((q, qi) => {
    const chosen = currentAnswers[qi];
    const order = displayOrder(q, optionOrderKey(scope, qi));
    const right = correctOptionText(q);
    const chosenText = chosen === undefined ? "" : String(q.options[order[chosen]] ?? "");
    const labels = document.querySelectorAll(`#questions .option[data-q="${qi}"]`);
    labels.forEach((label) => label.classList.remove("correct", "wrong"));

    labels.forEach((label) => {
      const shown = String(q.options[order[Number(label.getAttribute("data-o"))]] ?? "");
      if (shown === right) label.classList.add("correct");
      else if (Number(label.getAttribute("data-o")) === chosen) label.classList.add("wrong");
    });

    if (chosenText === right) {
      correct += 1;
    } else if (q.type) {
      errors.push(q.type);
    }
  });

  const percent = total ? Math.round((correct / total) * 100) : 0;
  const state = getLessonState(lesson.id);
  state.attempts = (state.attempts || 0) + 1;
  state.lastQuizAt = todayISO();
  state.lastErrors = errors;
  state.lastPercent = percent;

  const result = document.getElementById("result");
  result.classList.remove("hidden");

  if (softModeActive()) {
    state.passed = percent >= 80 || keepPassed === true;
    state.stuck = false;
    if (percent >= 80) state.shaky = false;
    else if (keepPassed) state.shaky = true;
    setLessonState(lesson.id, state);
    noteSoftClock();
    if (percent >= 80) noteJourneyPass();
    showSoftResult(result, percent >= 80);
    return;
  }

  if (percent >= 80) {
    state.passed = true;
    state.stuck = false;
    state.shaky = false;
    setLessonState(lesson.id, state);
    noteSoftClock();
    noteJourneyPass();
    result.classList.remove("is-wait");
    result.textContent = `Получилось! Урок пройден. Верно: ${correct} из ${total}.`;
    const stars = document.createElement("p");
    stars.className = "stars";
    stars.textContent = "★★★";
    result.appendChild(stars);
    document.getElementById("check-btn").classList.add("hidden");
    document.getElementById("stuck-block").classList.add("hidden");
    offerExplain(result);
  } else if (keepPassed) {
    state.passed = true;
    state.shaky = true;
    state.stuck = false;
    setLessonState(lesson.id, state);
    noteSoftClock();
    result.classList.add("is-wait");
    result.textContent = `Верно: ${correct} из ${total}. Завтра спокойно повторим эту тему.`;
  } else {
    state.passed = false;
    const canCorrect = quizForm === "a" && Array.isArray(lesson.recheck) && lesson.recheck.length;
    if (!canCorrect) state.stuck = true;
    setLessonState(lesson.id, state);
    noteSoftClock();
    result.classList.add("is-wait");
    result.textContent = "";
    const note = document.createElement("p");
    note.textContent = canCorrect
      ? `Верно: ${correct} из ${total}. Хорошая попытка! Давай посмотрим ещё раз другим способом.`
      : `Верно: ${correct} из ${total}. Давай разберём вместе.`;
    result.appendChild(note);
    if (canCorrect) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "action-btn";
      button.textContent = "Другое объяснение";
      button.onclick = startCorrective;
      result.appendChild(button);
    } else {
      document.getElementById("stuck-block").classList.remove("hidden");
    }
  }
}

function replayVideo() {
  const block = document.getElementById("video-block");
  const container = document.getElementById("video-container");
  if (currentLesson && !videoSrc(currentLesson.video)) {
    container.innerHTML = "<p>Видео для этого урока ещё не добавлено. Прочитай объяснение ещё раз.</p>";
  }
  block.classList.remove("hidden");
  block.scrollIntoView({ behavior: "smooth" });
  const media = block.querySelector("video, iframe");
  if (media && media.tagName === "VIDEO") media.play();
}

function callTutor() {
  if (!currentLesson) return;
  const state = getLessonState(currentLesson.id);
  state.stuck = true;
  setLessonState(currentLesson.id, state);
  const stuck = document.getElementById("stuck-block");
  let note = stuck.querySelector(".sent");
  if (!note) {
    note = document.createElement("p");
    note.className = "sent";
    stuck.appendChild(note);
  }
  note.textContent = "Мама скоро придёт помочь.";
}

/* ================= РАЗВЕДКА ================= */
const SCOUT_KEY = "study_scout_v1";
let scoutItems = [];
let scoutIndex = 0;

function hideScoutView() {
  const view = document.getElementById("scout-view");
  if (view) view.classList.add("hidden");
  const control = document.getElementById("control-view");
  if (control) control.classList.add("hidden");
  const extra = document.getElementById("extra-view");
  if (extra) extra.classList.add("hidden");
}

function readScout() {
  try {
    const raw = localStorage.getItem(SCOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function saveScout(items) {
  const payload = {
    doneAt: new Date().toISOString(),
    items: items.map((item) => ({
      subjectId: item.subjectId,
      subject: item.subject,
      lessonId: item.lessonId,
      title: item.title,
      known: item.known === true,
    })),
  };
  localStorage.setItem(SCOUT_KEY, JSON.stringify(payload));
  return payload;
}

// TODO: когда появятся вопросы уровня 1 класса, добавить их в разведку перед уроками 2 класса.
function scoutPool() {
  const items = [];
  (DATA.subjects || []).forEach((subject) => {
    if (subject.grade === 3) return;
    (subject.lessons || []).slice(0, 4).forEach((lesson) => {
      const question = (lesson.questions || [])[0];
      if (!question || !question.options || !question.options.length) return;
      items.push({
        subjectId: subject.id,
        subject: subject.name || subject.title || "",
        lessonId: lesson.id,
        title: lesson.title,
        question: question,
        known: false,
      });
    });
  });
  return items;
}

function showScoutView() {
  document.getElementById("subjects-view").classList.add("hidden");
  document.getElementById("lessons-view").classList.add("hidden");
  document.getElementById("lesson-view").classList.add("hidden");
  document.getElementById("scout-view").classList.remove("hidden");
}

function openScout() {
  const saved = readScout();
  showScoutView();
  if (saved) renderScoutMap(saved);
  else startScout();
}

function startScout() {
  scoutItems = scoutPool();
  scoutIndex = 0;
  showScoutView();
  renderScoutQuestion();
}

function renderScoutQuestion() {
  const item = scoutItems[scoutIndex];
  const title = document.getElementById("scout-title");
  const lead = document.getElementById("scout-lead");
  const body = document.getElementById("scout-body");
  if (!item) {
    const payload = saveScout(scoutItems);
    renderScoutMap(payload);
    return;
  }
  title.textContent = "Разведка";
  lead.textContent = item.subject + ". Это не проверка и не оценка.";
  const order = fisherYates(item.question.options.map((_, index) => index));
  item.order = order;
  const buttons = order.map((originalIndex, displayIndex) => (
    `<button type="button" class="option" onclick="chooseScout(${displayIndex})"><span>${esc(item.question.options[originalIndex])}</span></button>`
  )).join("");
  body.innerHTML = `${stepDots(scoutIndex, scoutItems.length)}<div class="question scout-question"><p>${esc(item.question.q)}</p><div class="options">${buttons}</div></div>`;
}

function chooseScout(displayIndex) {
  const item = scoutItems[scoutIndex];
  if (!item || !item.order) return;
  const chosen = String(item.question.options[item.order[displayIndex]] ?? "");
  const right = correctOptionText(item.question);
  item.known = chosen === right;
  scoutIndex += 1;
  renderScoutQuestion();
}

function renderScoutMap(payload) {
  const title = document.getElementById("scout-title");
  const lead = document.getElementById("scout-lead");
  const body = document.getElementById("scout-body");
  if (!title || !body) return;
  title.textContent = "Карта умений";
  lead.textContent = "«Знаю» — уже знакомо. «Потренируем» — разберём спокойно, без спешки.";
  const groups = [];
  (payload.items || []).forEach((item) => {
    let group = groups.find((entry) => entry.subjectId === item.subjectId);
    if (!group) {
      group = { subjectId: item.subjectId, subject: item.subject, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  });
  body.innerHTML = groups.map((group) => {
    const cards = group.items.map((item) => {
      const mark = item.known ? "знаю" : "потренируем";
      const cls = item.known ? "known" : "practice";
      return `<button type="button" class="card scout-card ${cls}" onclick="openScoutLesson('${esc(item.lessonId)}')"><div class="card-title">${esc(item.title)}</div><div class="card-status">${mark}</div></button>`;
    }).join("");
    return `<h3>${esc(group.subject)}</h3><div class="grid scout-map">${cards}</div>`;
  }).join("") + '<button class="action-btn" type="button" onclick="startScout()">Пройти ещё раз</button>';
}

function openScoutLesson(lessonId) {
  openScheduledLesson(lessonId);
}

function renderTutorScout() {
  const host = document.getElementById("tutor-scout");
  if (!host) return;
  const payload = readScout();
  if (!payload) {
    host.innerHTML = '<p class="hint">Разведка ещё не пройдена.</p>';
    return;
  }
  const gaps = payload.items.filter((item) => !item.known);
  if (!gaps.length) {
    host.innerHTML = '<p class="hint">Пробелов нет. Можно идти по графику.</p>';
    return;
  }
  host.innerHTML = `<table class="desk-table"><thead><tr><th>Предмет</th><th>Тема</th></tr></thead><tbody>${gaps.map((item) => (
    `<tr class="err"><td class="err-type">${esc(item.subject)}</td><td>${esc(item.title)} — потренируем</td></tr>`
  )).join("")}</tbody></table>`;
}

/* ================= КОНТРОЛЬНЫЕ ПО ЧЕТВЕРТЯМ ================= */
/* Четверти идут по графику сайта. В контрольную входят только темы, которые ребёнок уже прошёл.
   Контрольная за 4 четверть — годовая: в неё входят темы всего года. */
const CONTROL_KEY = "study_control_v1";
const QUARTERS = [
  { id: "q2", name: "2 четверть", from: "2026-11-05", to: "2026-12-30" },
  { id: "q3", name: "3 четверть", from: "2027-01-11", to: "2027-03-26" },
  { id: "q4", name: "4 четверть, годовая", from: "2026-11-05", to: "2027-05-28", opens: "2027-05-17" },
];
const CONTROL_MIN_TOPICS = 3;
const CONTROL_MAX_QUESTIONS = 12;
let controlRun = null;

function readControls() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONTROL_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function quarterById(id) {
  return QUARTERS.find((quarter) => quarter.id === id) || null;
}

function quarterOpens(quarter) {
  return quarter.opens || shiftISO(quarter.to, -7);
}

/* Темы четверти по предмету: все по графику и те из них, что уже пройдены. */
function controlTopics(quarter, subjectId) {
  const all = [];
  planDays().forEach((day) => {
    if ((day.kind !== "lesson" && day.kind !== "return") || day.subjectId !== subjectId) return;
    if (day.date < quarter.from || day.date > quarter.to) return;
    const found = findLesson(day.lessonId);
    if (found && all.indexOf(found.lesson) < 0) all.push(found.lesson);
  });
  return { all, passed: all.filter((lesson) => getLessonState(lesson.id).passed === true) };
}

function controlSubjects() {
  return DATA.subjects;
}

function controlQuestions(lessons) {
  const picked = lessons.length > CONTROL_MAX_QUESTIONS ? fisherYates(lessons).slice(0, CONTROL_MAX_QUESTIONS) : lessons.slice();
  const target = Math.min(CONTROL_MAX_QUESTIONS, Math.max(6, picked.length));
  const pools = picked.map((lesson) => fisherYates((lesson.questions || []).concat(lesson.recheck || [])));
  const items = [];
  let round = 0;
  while (items.length < target && round < 6) {
    picked.forEach((lesson, i) => {
      const question = pools[i][round];
      if (question && items.length < target) {
        items.push({ lessonId: lesson.id, title: lesson.title, question, order: fisherYates(question.options.map((_, index) => index)), chosen: null });
      }
    });
    round += 1;
  }
  return items;
}

/* Одна ближайшая несданная контрольная для главной страницы. */
function pendingControl() {
  const today = todayISO();
  const done = readControls();
  for (const quarter of QUARTERS) {
    if (today < quarterOpens(quarter)) continue;
    for (const subject of controlSubjects()) {
      if (done[quarter.id + ":" + subject.id]) continue;
      if (controlTopics(quarter, subject.id).passed.length >= CONTROL_MIN_TOPICS) return { quarter, subject };
    }
  }
  return null;
}

function controlOffer() {
  const next = pendingControl();
  if (!next) return "";
  return `<button type="button" class="control-offer" onclick="openControl('${esc(next.quarter.id)}', '${esc(next.subject.id)}')"><span>Контрольная за ${esc(next.quarter.name)}</span>${esc(next.subject.name)}</button>`;
}

function openControl(quarterId, subjectId, force) {
  const quarter = quarterById(quarterId);
  const subject = DATA.subjects.find((item) => item.id === subjectId);
  if (!quarter || !subject) return;
  const topics = controlTopics(quarter, subjectId);
  const lessons = topics.passed.length || !force ? topics.passed : [];
  document.getElementById("subjects-view").classList.add("hidden");
  document.getElementById("lessons-view").classList.add("hidden");
  document.getElementById("lesson-view").classList.add("hidden");
  hideScoutView();
  stopSessionTimer();
  document.getElementById("control-view").classList.remove("hidden");
  document.getElementById("control-title").textContent = "Контрольная. " + subject.name;
  document.getElementById("control-lead").textContent = quarter.name + ". Не спеши. Времени сколько нужно.";
  controlRun = { quarter, subject, items: controlQuestions(lessons), index: 0, topicsAll: topics.all.length, topicsIn: lessons.length };
  if (!controlRun.items.length) {
    document.getElementById("control-body").innerHTML = '<p class="hint">Пока нет пройденных тем для этой контрольной.</p>';
    return;
  }
  renderControlQuestion();
  window.scrollTo(0, 0);
}

function renderControlQuestion() {
  const run = controlRun;
  const item = run.items[run.index];
  const last = run.index >= run.items.length - 1;
  const options = item.order.map((originalIndex, displayIndex) => (
    `<button type="button" class="option${item.chosen === displayIndex ? " is-chosen" : ""}" onclick="chooseControl(${displayIndex})"><span>${esc(item.question.options[originalIndex])}</span></button>`
  )).join("");
  document.getElementById("control-body").innerHTML = `
    <p class="hint">${stepDots(run.index, run.items.length)}</p>
    <div class="question scout-question"><p>${esc(item.question.q)}</p><div class="options">${options}</div></div>
    <p id="control-pick" class="hint hidden">Сначала выбери ответ.</p>
    <div class="step-nav">
      <button class="back-btn${run.index === 0 ? " is-off" : ""}" type="button" onclick="controlStep(-1)">← Назад</button>
      <button class="action-btn" type="button" onclick="controlStep(1)">${last ? "Закончить" : "Дальше"}</button>
    </div>`;
}

function chooseControl(displayIndex) {
  if (!controlRun) return;
  controlRun.items[controlRun.index].chosen = displayIndex;
  renderControlQuestion();
}

function controlStep(delta) {
  const run = controlRun;
  if (!run) return;
  if (delta > 0 && run.items[run.index].chosen === null) {
    document.getElementById("control-pick").classList.remove("hidden");
    return;
  }
  const target = run.index + delta;
  if (target < 0) return;
  if (target >= run.items.length) {
    finishControl();
    return;
  }
  run.index = target;
  renderControlQuestion();
}

function finishControl() {
  const run = controlRun;
  let correct = 0;
  const misses = [];
  run.items.forEach((item) => {
    const chosen = String(item.question.options[item.order[item.chosen]] ?? "");
    if (chosen === correctOptionText(item.question)) {
      correct += 1;
    } else if (!misses.some((miss) => miss.lessonId === item.lessonId)) {
      misses.push({ lessonId: item.lessonId, title: item.title });
    }
  });
  const total = run.items.length;
  const percent = Math.round((correct / total) * 100);
  const all = readControls();
  all[run.quarter.id + ":" + run.subject.id] = {
    doneAt: todayISO(), correct, total, percent, misses, topicsIn: run.topicsIn, topicsAll: run.topicsAll,
  };
  try {
    localStorage.setItem(CONTROL_KEY, JSON.stringify(all));
  } catch (e) {
    /* итог всё равно показан на экране */
  }
  /* Темы с ошибками помечаем: они первыми попадут во «Вспомним». */
  misses.forEach((miss) => {
    const state = getLessonState(miss.lessonId);
    state.shaky = true;
    setLessonState(miss.lessonId, state);
  });
  const stars = percent >= 80 ? "★★★" : percent >= 50 ? "★★" : "★";
  const count = softModeActive() ? "" : `<p>Верно: ${correct} из ${total}.</p>`;
  const again = misses.length
    ? `<p>Эти темы мы спокойно повторим:</p><ul class="control-misses">${misses.map((miss) => `<li>${esc(miss.title)}</li>`).join("")}</ul>`
    : "<p>Все темы ты помнишь.</p>";
  document.getElementById("control-body").innerHTML = `
    <div class="control-result">
      <p class="control-done">Контрольная готова. Ты молодец!</p>
      <p class="stars">${stars}</p>
      ${count}${again}
      <button class="action-btn" type="button" onclick="showSubjects()">На главную</button>
    </div>`;
  controlRun = null;
  window.scrollTo(0, 0);
}

function controlMark(percent) {
  if (percent >= 90) return "5";
  if (percent >= 70) return "4";
  if (percent >= 50) return "3";
  return "2";
}

function resetControl(key) {
  if (!window.confirm("Стереть итог этой контрольной? Ребёнок сможет написать её заново.")) return;
  const all = readControls();
  delete all[key];
  localStorage.setItem(CONTROL_KEY, JSON.stringify(all));
  renderTutorControls();
}

function renderTutorControls() {
  const host = document.getElementById("tutor-controls");
  if (!host) return;
  const done = readControls();
  const today = todayISO();
  const rows = [];
  QUARTERS.forEach((quarter) => {
    controlSubjects().forEach((subject) => {
      const topics = controlTopics(quarter, subject.id);
      if (!topics.all.length) return;
      const key = quarter.id + ":" + subject.id;
      const result = done[key];
      const link = `index.html?control=${encodeURIComponent(key)}`;
      let status;
      let cls = "status-wait";
      let action = "";
      if (result) {
        cls = result.percent >= 70 ? "status-done" : result.percent >= 50 ? "status-work" : "status-stuck";
        status = result.percent + "% (" + result.correct + " из " + result.total + "), примерно «" + controlMark(result.percent) + "» · " + formatPlanDate(result.doneAt);
        action = `<button type="button" onclick="resetControl('${esc(key)}')">Переписать</button>`;
      } else if (topics.passed.length < CONTROL_MIN_TOPICS) {
        status = "мало пройденных тем";
      } else if (today < quarterOpens(quarter)) {
        status = "появится у ребёнка " + formatPlanDate(quarterOpens(quarter));
        action = `<a href="${link}">Открыть сейчас</a>`;
      } else {
        cls = "status-work";
        status = "ждёт на главной";
        action = `<a href="${link}">Открыть</a>`;
      }
      const weak = result && result.misses && result.misses.length
        ? result.misses.map((miss) => miss.title).join("; ")
        : (result ? "ошибок нет" : "");
      rows.push(`<tr><td>${esc(quarter.name)}</td><td>${esc(subject.name)}</td><td>${topics.passed.length} из ${topics.all.length}</td><td><span class="${cls}">${esc(status)}</span></td><td>${esc(weak)}</td><td>${action}</td></tr>`);
    });
  });
  host.innerHTML = `<table class="desk-table"><thead><tr><th>Четверть</th><th>Предмет</th><th>Тем пройдено</th><th>Итог</th><th>Повторить темы</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

/* ================= ПАНЕЛЬ ТЬЮТОРА ================= */
function renderTutorPanel() {
  loadData().then(() => {
    renderTutorToday();
    renderTutorCalendar();
    renderSoftMode();
    renderTutorScout();
    renderTutorControls();
    if (typeof renderTutorFacts === "function") renderTutorFacts();
    renderBackupNote();
    renderTutorProgress();
    renderTutorErrors();
  }).catch(showLoadError);
}

function tutorCodeSaved() {
  return /^\d{4}$/.test(localStorage.getItem(TUTOR_CODE_KEY) || "");
}

function tutorSessionOpen() {
  try {
    return sessionStorage.getItem(TUTOR_SESSION_KEY) === "1";
  } catch (e) {
    return false;
  }
}

function openTutorPage() {
  const lock = document.getElementById("tutor-lock");
  const body = document.getElementById("tutor-body");
  if (!lock || !body) return;
  const title = document.getElementById("tutor-lock-title");
  const hint = document.getElementById("tutor-lock-hint");
  if (tutorSessionOpen() && tutorCodeSaved()) {
    lock.classList.add("hidden");
    body.classList.remove("hidden");
    renderTutorPanel();
    return;
  }
  lock.classList.remove("hidden");
  body.classList.add("hidden");
  if (!tutorCodeSaved()) {
    title.textContent = "Задайте код";
    hint.textContent = "Четыре цифры. Так ребёнок случайно не откроет панель. Это не настоящий замок.";
  } else {
    title.textContent = "Введите код";
    hint.textContent = "Четыре цифры, которые вы задали для этой панели.";
  }
}

function submitTutorCode() {
  const input = document.getElementById("tutor-code-input");
  if (!input) return;
  const value = String(input.value || "").trim();
  if (!/^\d{4}$/.test(value)) {
    window.alert("Нужны ровно 4 цифры.");
    return;
  }
  try {
    if (!tutorCodeSaved()) {
      localStorage.setItem(TUTOR_CODE_KEY, value);
    } else if (localStorage.getItem(TUTOR_CODE_KEY) !== value) {
      const msg = document.getElementById("tutor-code-msg");
      if (msg) msg.textContent = "Код не подошёл, попробуй ещё раз.";
      return;
    }
    const msg = document.getElementById("tutor-code-msg");
    if (msg) msg.textContent = "";
    sessionStorage.setItem(TUTOR_SESSION_KEY, "1");
    input.value = "";
    openTutorPage();
  } catch (e) {
    window.alert("Не получилось сохранить код.");
  }
}

function changeTutorCode() {
  const next = window.prompt("Новый код из 4 цифр");
  if (next === null) return;
  const value = String(next).trim();
  if (!/^\d{4}$/.test(value)) {
    window.alert("Нужны ровно 4 цифры.");
    return;
  }
  try {
    localStorage.setItem(TUTOR_CODE_KEY, value);
    window.alert("Код обновлён. Он заработает при следующем открытии вкладки.");
  } catch (e) {
    window.alert("Не получилось сохранить код.");
  }
}

/* ================= КОПИЯ ПРОГРЕССА ================= */
/* Прогресс хранится в браузере этого ноутбука и не зависит от вайфая и интернета.
   Копия — файл со всем сразу: уроки, контрольные, счёт в уме, путешествие, настройки. */
const BACKUP_AT_KEY = "study_backup_at";
const BACKUP_EVERY_DAYS = 7;

function progressFileName() {
  return "ucheba-progress-" + todayISO() + ".json";
}

function collectBackup() {
  const data = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.indexOf("study_") === 0 && key !== BACKUP_AT_KEY) data[key] = localStorage.getItem(key);
  }
  return { format: "ucheba-backup", version: 1, savedAt: new Date().toISOString(), data };
}

function saveBackupFile() {
  const blob = new Blob([JSON.stringify(collectBackup())], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = progressFileName();
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  localStorage.setItem(BACKUP_AT_KEY, todayISO());
}

function downloadProgress() {
  try {
    saveBackupFile();
    renderBackupNote();
  } catch (e) {
    window.alert("Не получилось скачать прогресс.");
  }
}

/* Раз в неделю копия сама сохраняется в папку «Загрузки» — когда ребёнок возвращается на главную. */
function maybeAutoBackup() {
  try {
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    if (!anyLessonAttempted()) return;
    const last = localStorage.getItem(BACKUP_AT_KEY) || "";
    if (last && last > shiftISO(todayISO(), -BACKUP_EVERY_DAYS)) return;
    saveBackupFile();
  } catch (e) {
    /* копия не получилась — учёбе это не мешает */
  }
}

function renderBackupNote() {
  const note = document.getElementById("backup-note");
  if (!note) return;
  const last = localStorage.getItem(BACKUP_AT_KEY) || "";
  note.textContent = last
    ? "Последняя копия: " + formatPlanDate(last) + ". Файл лежит в папке «Загрузки»."
    : "Копий ещё не было. Первая сохранится сама после первых уроков.";
}

function restoreBackup(parsed) {
  if (parsed && parsed.format === "ucheba-backup" && parsed.data && typeof parsed.data === "object") {
    Object.keys(parsed.data).forEach((key) => {
      if (key.indexOf("study_") === 0 && typeof parsed.data[key] === "string") localStorage.setItem(key, parsed.data[key]);
    });
    return true;
  }
  /* старый формат: в файле только уроки */
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && !parsed.format) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    return true;
  }
  return false;
}

function uploadProgress(input) {
  const file = input && input.files && input.files[0];
  if (input) input.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => window.alert("Файл не прочитался.");
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ""));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        window.alert("В файле нет прогресса.");
        return;
      }
      if (!window.confirm("Заменить прогресс на этом компьютере данными из файла?")) return;
      if (!restoreBackup(parsed)) {
        window.alert("В файле нет прогресса.");
        return;
      }
      window.alert("Прогресс загружен.");
      renderTutorPanel();
      renderBackupNote();
    } catch (e) {
      window.alert("Файл не прочитался.");
    }
  };
  try {
    reader.readAsText(file);
  } catch (e) {
    window.alert("Файл не прочитался.");
  }
}

function dayKindLabel(kind) {
  if (kind === "lesson") return "Урок и учебник";
  if (kind === "book") return "Учебник";
  if (kind === "return") return "Повтор";
  if (kind === "mama") return "С мамой";
  if (kind === "rest") return "Выходной";
  return "Занятие";
}

function lessonGoal(id) {
  const found = findLesson(id);
  return found && found.lesson.goal ? found.lesson.goal : "";
}

function renderTutorCalendar() {
  const host = document.getElementById("tutor-calendar");
  if (!host) return;
  host.innerHTML = "";
  const months = [];
  planDays().forEach((day) => {
    const key = day.date.slice(0, 7);
    if (!months.length || months[months.length - 1].key !== key) months.push({ key, days: [] });
    months[months.length - 1].days.push(day);
  });

  const nav = document.createElement("p");
  nav.className = "hint";
  nav.innerHTML = months.map((month) => {
    const d = parseISO(month.days[0].date);
    return `<a href="#month-${month.key}">${esc(MONTHS_NOM[d.getMonth()])}</a>`;
  }).join(" · ");
  host.appendChild(nav);

  const today = todayISO();
  months.forEach((month) => {
    const d = parseISO(month.days[0].date);
    const heading = document.createElement("h3");
    heading.className = "plan-month";
    heading.id = "month-" + month.key;
    heading.textContent = MONTHS_NOM[d.getMonth()] + " " + d.getFullYear();
    host.appendChild(heading);

    const table = document.createElement("table");
    table.className = "desk-table";
    table.innerHTML = "<thead><tr><th>Дата</th><th>Вид</th><th>Занятие</th><th>Итог</th></tr></thead>";
    const body = document.createElement("tbody");
    month.days.forEach((day) => {
      const counts = day.kind === "book" || !!day.lessonId;
      const passed = counts && planDone(day);
      const row = document.createElement("tr");
      row.className = "plan-row mom-day kind-" + day.kind + (day.date === today ? " is-today" : "") + (passed ? " is-done" : "");
      const title = day.kind === "lesson" || day.kind === "return" || day.kind === "book"
        ? day.subject + ". " + day.title
        : day.title;
      const goal = day.lessonId ? lessonGoal(day.lessonId) : (day.text || "");
      const topic = [bookPages(day), goal].filter(Boolean).join(". ");
      const result = !counts ? "" : (passed ? "сделано" : "ещё нет");
      row.innerHTML = `
        <td class="plan-date">${esc(formatPlanDate(day.date))}</td>
        <td>${esc(dayKindLabel(day.kind))}</td>
        <td class="plan-what">
          <strong>${esc(title)}</strong>
          <span class="mom-topic">${esc(topic)}</span>
        </td>
        <td class="desk-result${passed ? " status-done" : ""}">${esc(result)}</td>`;
      body.appendChild(row);
    });
    table.appendChild(body);
    host.appendChild(table);
  });
}

function renderTutorProgress() {
  const wrap = document.getElementById("tutor-progress");
  if (!wrap) return;
  wrap.innerHTML = "";
  DATA.subjects.forEach((subj) => {
    const title = document.createElement("h3");
    title.textContent = subj.name || subj.title || "";
    wrap.appendChild(title);

    const table = document.createElement("table");
    table.className = "desk-table";
    table.innerHTML = "<thead><tr><th>Урок</th><th>Статус</th><th>%</th><th></th></tr></thead>";
    const body = document.createElement("tbody");
    (subj.lessons || []).forEach((lesson) => {
      const st = getLessonState(lesson.id);
      let cls = "";
      let status = "status-wait";
      let label = "не начат";
      if (st.stuck || (st.attempts >= 2 && !st.passed)) {
        cls = "stuck";
        status = "status-stuck";
        label = "не усвоено";
      } else if (st.passed) {
        cls = "done";
        status = "status-done";
        label = "усвоено";
      } else if (st.attempts > 0) {
        status = "status-work";
        label = "в процессе";
      }

      const row = document.createElement("tr");
      row.className = "row " + cls;
      const button = !st.passed
        ? `<button onclick="tutorExplain('${esc(lesson.id)}')">Я объяснила →</button>`
        : "";
      row.innerHTML = `
        <td>${esc(lesson.title)}</td>
        <td><span class="${status}">${label}</span></td>
        <td>${st.lastPercent !== undefined ? st.lastPercent + "%" : "—"}</td>
        <td>${button}</td>
      `;
      body.appendChild(row);
    });
    table.appendChild(body);
    wrap.appendChild(table);
  });
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "back-btn";
  reset.textContent = "Стереть прогресс";
  reset.onclick = () => {
    if (!window.confirm("Стереть прогресс дочери на этом компьютере?")) return;
    saveProgress({});
    renderTutorProgress();
    renderTutorErrors();
  };
  wrap.appendChild(reset);
}

function tutorExplain(lessonId) {
  const st = getLessonState(lessonId);
  const fresh = st.passed !== true;
  st.passed = true;
  st.stuck = false;
  st.attempts = 0;
  setLessonState(lessonId, st);
  if (fresh) noteJourneyPass();
  renderTutorProgress();
  renderTutorErrors();
}

function renderTutorErrors() {
  const wrap = document.getElementById("tutor-errors");
  if (!wrap) return;
  wrap.innerHTML = "";
  const p = loadProgress();
  const entries = Object.entries(p).filter(([, st]) => st.lastErrors && st.lastErrors.length > 0);

  if (entries.length === 0) {
    wrap.innerHTML = '<p class="hint">Пока ошибок нет.</p>';
    return;
  }
  wrap.innerHTML = '<table class="desk-table"><thead><tr><th>Тип</th><th>Урок</th></tr></thead><tbody></tbody></table>';
  const errorBody = wrap.querySelector("tbody");

  const typeNames = {
    concept: "не поняла понятие",
    calc: "вычислительная ошибка",
    attention: "невнимательность",
  };

  entries.reverse().forEach(([id, st]) => {
    let title = id;
    DATA.subjects.forEach((subject) => {
      (subject.lessons || []).forEach((lesson) => {
        if (lesson.id === id) title = lesson.title;
      });
    });
    const div = document.createElement("tr");
    div.className = "err";
    const types = [...new Set(st.lastErrors)].map((type) => typeNames[type] || type).join(", ");
    div.innerHTML = `<td class="err-type">${esc(types)}</td><td>${esc(title)}</td>`;
    errorBody.appendChild(div);
  });
}

/* ================= ГРАФИК ================= */
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_NOM = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

const JOURNEY_KEY = "study_journey_v1";
const JOURNEY_CITIES = [
  { id: "hanoi", name: "Ханой" },
  { id: "hue", name: "Хюэ" },
  { id: "danang", name: "Дананг" },
  { id: "hoian", name: "Хойан" },
  { id: "nhatrang", name: "Нячанг" },
  { id: "dalat", name: "Далат" },
  { id: "hochiminh", name: "Хошимин" },
  { id: "phuquoc", name: "Фукуок" },
];

function readJourney() {
  try {
    const raw = localStorage.getItem(JOURNEY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { days: [], stamps: {} };
    return {
      days: Array.isArray(parsed.days) ? parsed.days.filter((day) => typeof day === "string") : [],
      stamps: parsed.stamps && typeof parsed.stamps === "object" && !Array.isArray(parsed.stamps) ? parsed.stamps : {},
    };
  } catch (e) {
    return { days: [], stamps: {} };
  }
}

function writeJourney(state) {
  localStorage.setItem(JOURNEY_KEY, JSON.stringify({ days: state.days, stamps: state.stamps }));
}

function lessonPassShare() {
  let total = 0;
  let passed = 0;
  (DATA.subjects || []).forEach((subject) => {
    (subject.lessons || []).forEach((lesson) => {
      total += 1;
      if (getLessonState(lesson.id).passed === true) passed += 1;
    });
  });
  return { total, passed, share: total ? passed / total : 0 };
}

function openedCityCount(passedCount) {
  const count = Math.floor((passedCount || 0) / 5);
  if (count >= JOURNEY_CITIES.length) return JOURNEY_CITIES.length;
  return count < 0 ? 0 : count;
}

function noteJourneyPass() {
  const state = readJourney();
  const today = todayISO();
  if (state.days.indexOf(today) < 0) state.days.push(today);
  writeJourney(state);
}

function shiftISO(iso, deltaDays) {
  const date = parseISO(iso);
  date.setDate(date.getDate() + deltaDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + month + "-" + day;
}

function journeyStreak(days) {
  const have = {};
  days.forEach((day) => { have[day] = true; });
  const today = todayISO();
  let cursor = have[today] ? today : (have[shiftISO(today, -1)] ? shiftISO(today, -1) : "");
  if (!cursor) return 0;
  let count = 0;
  while (have[cursor]) {
    count += 1;
    cursor = shiftISO(cursor, -1);
  }
  return count;
}

function journeyDayWord(count) {
  const n10 = count % 10;
  const n100 = count % 100;
  if (n10 === 1 && n100 !== 11) return "день";
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return "дня";
  return "дней";
}

function journeyDateLabel(iso) {
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const date = parseISO(iso);
  return date.getDate() + " " + months[date.getMonth()];
}

function syncJourneyStamps() {
  const state = readJourney();
  const openCount = openedCityCount(lessonPassShare().passed);
  const today = todayISO();
  let changed = false;
  JOURNEY_CITIES.slice(0, openCount).forEach((city) => {
    if (!state.stamps[city.id]) {
      state.stamps[city.id] = today;
      changed = true;
    }
  });
  if (changed) writeJourney(state);
  return state;
}

function cityMark(id, open) {
  const color = open ? {
    hanoi: "var(--lotus)",
    hue: "var(--lotus-deep)",
    danang: "var(--sea)",
    hoian: "var(--lantern)",
    nhatrang: "var(--sea)",
    dalat: "var(--rice)",
    hochiminh: "var(--sea)",
    phuquoc: "var(--lotus)",
  }[id] || "var(--sea)" : "var(--ink-soft)";
  const paper = "var(--paper)";
  const lantern = open ? "var(--lantern)" : color;
  const lamp = open ? "var(--lotus)" : color;
  const ink = open ? "var(--lantern-ink)" : color;
  const shapes = {
    hanoi: `<ellipse cx="14" cy="26" rx="9" ry="1.6" fill="${color}" opacity="0.35"/><path d="M14 1 L15.3 3.4 H12.7 Z" fill="${color}"/><path d="M9 7 L14 4 L19 7 L17.2 8.4 H10.8 Z" fill="${color}"/><path d="M6 12.2 L14 8.4 L22 12.2 L19.6 13.8 H8.4 Z" fill="${color}"/><path d="M3 18 L14 13.2 L25 18 L21.6 19.8 H6.4 Z" fill="${color}"/><rect x="12.3" y="19.2" width="3.4" height="5.2" fill="${color}"/>`,
    hue: `<path d="M3 25 V11 H8 V5 H20 V11 H25 V25 Z" fill="${color}"/><path d="M11 25 V16 a3 3 0 0 1 6 0 V25 Z" fill="${paper}"/>`,
    danang: `<path d="M2 16 Q14 4 26 16" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/><path d="M2 22 H26" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`,
    hoian: `<ellipse cx="9" cy="13" rx="5.4" ry="6.6" fill="${lantern}"/><ellipse cx="19" cy="14.5" rx="4.8" ry="6" fill="${lamp}"/><path d="M5.6 7.2 H12.4 M16 8.8 H22" stroke="${ink}" stroke-width="1.5" stroke-linecap="round"/><path d="M9 19.6 V24 M19 20.4 V24" stroke="${ink}" stroke-width="1.3" stroke-linecap="round"/>`,
    nhatrang: `<path d="M2 20 Q8 15 14 20 T26 20 V25 H2 Z" fill="${color}" opacity="0.45"/><path d="M18 22 V7" stroke="${color}" stroke-width="2"/><path d="M18 10 Q25 8 22 18" fill="${color}"/>`,
    dalat: `<path d="M4 24 L11 8 L18 24 Z" fill="${color}"/><circle cx="20" cy="11" r="3" fill="${color}"/><circle cx="23" cy="16" r="2.2" fill="${color}"/>`,
    hochiminh: `<path d="M3 25 V14 H9 V5 H16 V12 H25 V25 Z" fill="${color}"/>`,
    phuquoc: `<ellipse cx="14" cy="17" rx="11" ry="6" fill="${color}"/><path d="M14 16 V7 M14 9 Q19 8 17 14" stroke="${paper}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  };
  return `<svg width="42" height="42" viewBox="0 0 28 28" aria-hidden="true" opacity="${open ? "1" : "0.4"}">${shapes[id] || ""}</svg>`;
}

let vietnamMapMarkup = "";

function loadVietnamMap() {
  if (vietnamMapMarkup) return Promise.resolve(vietnamMapMarkup);
  const keep = (text) => {
    vietnamMapMarkup = text;
    return text;
  };
  return fetch("vietnam-map.svg?v=3").then((res) => {
    if (!res.ok) throw new Error("map");
    return res.text();
  }).then(keep).catch(() => {
    if (!window.VIETNAM_MAP_SVG) throw new Error("map");
    return keep(window.VIETNAM_MAP_SVG);
  });
}

function paintVietnamMap(root, openCount) {
  const next = openCount < JOURNEY_CITIES.length ? openCount : -1;
  JOURNEY_CITIES.forEach((city, index) => {
    const node = root.querySelector("#city-" + city.id);
    if (!node) return;
    node.classList.toggle("done", index < openCount);
    node.classList.toggle("current", index === next);
  });
  for (let step = 1; step < JOURNEY_CITIES.length; step += 1) {
    const route = root.querySelector("#route-" + step);
    if (route) route.classList.toggle("done", openCount > step);
  }
}

function renderJourney() {
  const path = document.getElementById("journey-path");
  const passport = document.getElementById("journey-passport");
  const streakEl = document.getElementById("journey-streak");
  if (!path || !passport) return;
  const saved = syncJourneyStamps();
  const openCount = openedCityCount(lessonPassShare().passed);
  const nextIndex = openCount < JOURNEY_CITIES.length ? openCount : -1;
  const streak = journeyStreak(saved.days);
  if (streakEl) {
    streakEl.textContent = streak > 0
      ? "В пути уже " + streak + " " + journeyDayWord(streak) + " подряд."
      : "";
  }
  const token = (path.dataset.journey || "0");
  const nextToken = String(Number(token) + 1);
  path.dataset.journey = nextToken;
  loadVietnamMap().then((markup) => {
    if (path.dataset.journey !== nextToken) return;
    path.innerHTML = markup;
    paintVietnamMap(path, openCount);
    if (openCount >= JOURNEY_CITIES.length) {
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent = "Ты добралась до конца пути!";
      path.appendChild(note);
    }
  }).catch(() => {
    if (path.dataset.journey !== nextToken) return;
    const step = 72;
    const height = 28 + JOURNEY_CITIES.length * step;
    const points = JOURNEY_CITIES.map((city, index) => ({
      city,
      index,
      x: index % 2 === 0 ? 28 : 96,
      y: 28 + index * step,
    }));
    const line = points.map((point, index) => (index === 0 ? "M" : "L") + point.x + " " + point.y).join(" ");
    const marks = points.map((point) => {
      const open = point.index < openCount;
      const next = point.index === nextIndex;
      const fill = open ? "#86efac" : (next ? "#dbeafe" : "#e5e7eb");
      const stroke = next ? "#14635f" : (open ? "#1f6b4a" : "#d1d5db");
      return `<g><circle cx="${point.x}" cy="${point.y}" r="${next ? 12 : 8}" fill="${fill}" stroke="${stroke}" stroke-width="${next ? 4 : 2}"></circle><g transform="translate(${point.x + 16}, ${point.y - 21})">${cityMark(point.city.id, open)}</g><text x="${point.x + 64}" y="${point.y}" dominant-baseline="middle" font-size="16" fill="#2c2416">${esc(point.city.name)}</text></g>`;
    }).join("");
    path.innerHTML = `<svg viewBox="0 0 320 ${height}" role="img" aria-label="Путь по Вьетнаму"><path d="${line}" fill="none" stroke="#9fd4d0" stroke-width="4" stroke-linecap="round"></path>${marks}</svg>${openCount >= JOURNEY_CITIES.length ? '<p class="hint">Ты добралась до конца пути!</p>' : ''}`;
  });
  const stamps = JOURNEY_CITIES.filter((city, index) => index < openCount && saved.stamps[city.id]);
  passport.innerHTML = stamps.length
    ? stamps.map((city) => `<div class="stamp"><div class="stamp-city">${esc(city.name)}</div><div class="stamp-date">${esc(journeyDateLabel(saved.stamps[city.id]))}</div></div>`).join("")
    : '<p class="hint">Первый штамп появится, когда откроется Ханой.</p>';
}

function parseISO(iso) {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function formatPlanDate(iso) {
  const d = parseISO(iso);
  return d.getDate() + " " + MONTHS_GEN[d.getMonth()] + ", " + WEEKDAYS_SHORT[d.getDay()];
}

function lessonsWord(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return count + " урок";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return count + " урока";
  return count + " уроков";
}

function planDays() {
  return (DATA && DATA.plan && DATA.plan.days) || [];
}

function findLesson(id) {
  for (const subject of DATA.subjects) {
    const index = (subject.lessons || []).findIndex((lesson) => lesson.id === id);
    if (index >= 0) return { subject, lesson: subject.lessons[index], index };
  }
  return null;
}

function openScheduledLesson(id, asReturn) {
  const found = findLesson(id);
  if (!found) return;
  if (!isLessonUnlocked(found.subject, found.index)) {
    openSubject(found.subject);
    return;
  }
  const already = getLessonState(id).passed === true;
  openSubject(found.subject);
  openLesson(found.lesson);
  if (asReturn && already) startQuiz("b");
}

function openSubjectById(id) {
  const subject = DATA.subjects.find((item) => item.id === id);
  if (subject) openSubject(subject);
}

function dueWork() {
  const today = todayISO();
  let shakyDay = null;
  for (const day of planDays()) {
    if (day.date > today) break;
    if (!day.lessonId || (day.kind !== "lesson" && day.kind !== "return")) continue;
    const found = findLesson(day.lessonId);
    if (!found || !isLessonUnlocked(found.subject, found.index)) continue;
    const state = getLessonState(day.lessonId);
    if (!state.passed) return day;
    if (state.shaky && !shakyDay) shakyDay = day;
  }
  return shakyDay;
}

function nearestPlanDay() {
  const today = todayISO();
  return planDays().find((day) => day.date >= today) || null;
}

function weekOf(iso) {
  const start = parseISO(iso);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  const end = new Date(start);
  end.setDate(end.getDate() + 5);
  const startISO = start.getFullYear() + "-" + String(start.getMonth() + 1).padStart(2, "0") + "-" + String(start.getDate()).padStart(2, "0");
  const endISO = end.getFullYear() + "-" + String(end.getMonth() + 1).padStart(2, "0") + "-" + String(end.getDate()).padStart(2, "0");
  return planDays().filter((item) => item.date >= startISO && item.date <= endISO);
}

function planDayText(day) {
  if (day.kind === "lesson" || day.kind === "book") return day.subject + ". " + day.title;
  if (day.kind === "review") return day.title + (day.text ? ". " + day.text : "");
  if (day.text) return day.title + ". " + day.text;
  return day.title;
}

function isChoiceOpen(day) {
  const found = day && day.lessonId && findLesson(day.lessonId);
  return !!(found && isLessonUnlocked(found.subject, found.index));
}

function homeChoices() {
  const today = todayISO();
  const days = planDays().filter((day) => day.lessonId && (day.kind === "lesson" || day.kind === "return"));
  const due = dueWork();
  const todayLesson = days.find((day) => day.date === today);
  const upcoming = days.find((day) => day.date >= today);
  let primary = (due && due.lessonId) ? due : (todayLesson || upcoming || null);
  if (primary && !isChoiceOpen(primary)) {
    primary = days.find((day) => isChoiceOpen(day) && !getLessonState(day.lessonId).passed) || primary;
  }
  const alternative = days.find((day) => {
    if (!primary || day.lessonId === primary.lessonId || day.subjectId === primary.subjectId) return false;
    if (day.date < primary.date) return false;
    return isChoiceOpen(day);
  });
  return { primary, alternative };
}

const LESSONS_PER_DAY = 4;
let studyOnRest = false;

/* ================= УЧЕБНИК ================= */
/* Урок по графику = тема учебника. Если к теме есть урок сайта, сначала он, потом страницы
   электронного учебника на LECTA и кнопка «Готово». Отметки «Готово» хранятся здесь. */
const BOOK_KEY = "study_book_v1";

function readBooks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BOOK_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function bookDone(id) {
  return !!readBooks()[id];
}

function finishBook(id) {
  const books = readBooks();
  books[id] = todayISO();
  try {
    localStorage.setItem(BOOK_KEY, JSON.stringify(books));
  } catch (e) {
    window.alert("Отметка не сохранилась: браузер не даёт записывать данные.");
    return;
  }
  renderToday();
}

function openBook(bookId) {
  const book = DATA && DATA.books && DATA.books[bookId];
  if (book) window.open(book.url, "_blank", "noopener");
}

function bookPages(day) {
  const b = day && day.book;
  if (!b) return "";
  const pages = b.from === b.to ? "страница " + b.from : "страницы " + b.from + "–" + b.to;
  return "Учебник, часть " + b.part + ", " + pages;
}

function scheduledByNow(lessonId) {
  const today = todayISO();
  return planDays().some((day) => day.kind === "lesson" && day.lessonId === lessonId && day.date <= today);
}

function planItemDone(day, state) {
  if (day.kind === "book") return bookDone(day.id);
  if (day.kind === "lesson") return state.passed === true && (!day.book || bookDone(day.id));
  return state.passed === true && !!state.lastQuizAt && state.lastQuizAt >= day.date;
}

function planDone(day) {
  if (day.kind === "book") return bookDone(day.id);
  if (!day.lessonId) return false;
  return planItemDone(day, getLessonState(day.lessonId));
}

/* Уроки дня: что уже сделано сегодня и что дальше по графику. Не больше трёх в день;
   несданное переходит на следующий день, старые повторы (больше недели) не копятся. */
function dayList() {
  const today = todayISO();
  const weekday = parseISO(today).getDay();
  const days = planDays();
  const restDay = days.find((day) => day.date === today && day.kind === "rest");
  const rest = !!restDay || weekday === 0 || weekday === 6;
  const progress = loadProgress();
  const books = readBooks();
  const done = [];
  /* Уроки сайта, привязанные к учебнику, засчитываются только после «Готово» в учебнике. */
  const withBook = new Set(days.filter((day) => day.kind === "lesson" && day.book).map((day) => day.lessonId));
  days.forEach((day) => {
    if (day.date > today || books[day.id] !== today) return;
    if (day.kind === "book" || (day.kind === "lesson" && planDone(day))) done.push({ subject: day.subject, title: day.title });
  });
  Object.keys(progress).forEach((id) => {
    const state = progress[id];
    if (!state || state.lastQuizAt !== today || state.passed !== true || withBook.has(id)) return;
    const found = findLesson(id);
    if (found) done.push({ lessonId: id, subject: found.subject.name, title: found.lesson.title });
  });
  const pending = [];
  const oldest = shiftISO(today, -7);
  for (const day of days) {
    if (day.date > today) break;
    if (day.kind === "book") {
      if (!books[day.id] && !pending.some((item) => item.id === day.id)) pending.push(day);
      continue;
    }
    if (!day.lessonId || (day.kind !== "lesson" && day.kind !== "return")) continue;
    const found = findLesson(day.lessonId);
    if (!found) continue;
    const state = getLessonState(day.lessonId);
    if (planItemDone(day, state)) continue;
    if (day.kind === "return" && state.passed === true && day.date < oldest) continue;
    if (day.kind === "return" && state.lastQuizAt === today && state.passed === true) continue;
    if (!isLessonUnlocked(found.subject, found.index)) continue;
    if (pending.some((item) => item.lessonId === day.lessonId)) continue;
    pending.push(day);
  }
  const slots = Math.max(0, LESSONS_PER_DAY - done.length);
  const mama = days.filter((day) => day.date === today && day.kind === "mama");
  return { rest, restTitle: restDay ? restDay.title : "Выходной", done, next: pending.slice(0, slots), waiting: pending.length, mama };
}

function dayRow(number, state, subject, title, action, note) {
  const mark = state === "done" ? "✓" : number;
  const extra = note ? `<span class="book-note">${esc(note)}</span>` : "";
  return `<li class="day-row is-${state}"><span class="lesson-num" aria-hidden="true">${mark}</span><span class="subject-text"><span class="card-status">${esc(subject)}</span><span class="card-title">${esc(title)}</span>${extra}</span>${action || ""}</li>`;
}

/* Что нажимать в строке урока: сначала урок сайта, потом учебник и «Готово». */
function dayAction(day) {
  const siteFirst = day.lessonId && (day.kind === "return" || getLessonState(day.lessonId).passed !== true);
  if (siteFirst) {
    return `<button type="button" class="start-day" onclick="openScheduledLesson('${esc(day.lessonId)}', ${day.kind === "return"})">Начать</button>`;
  }
  const open = day.book
    ? `<button type="button" class="start-day" onclick="openBook('${esc(day.book.id)}')">Открыть учебник</button>`
    : "";
  return `<div class="book-step">${open}<button type="button" class="start-day${day.book ? " is-second" : ""}" onclick="finishBook('${esc(day.id)}')">Готово</button></div>`;
}

function dayNote(day) {
  if (day.book) {
    const site = day.lessonId && day.kind === "lesson" && getLessonState(day.lessonId).passed !== true;
    return site ? "Сначала урок здесь, потом у" + bookPages(day).slice(1) : bookPages(day);
  }
  return day.kind === "book" ? day.text || "" : "";
}

function renderToday() {
  const view = document.getElementById("today-view");
  if (!view) return;
  const days = planDays();
  if (!days.length) {
    view.classList.add("hidden");
    return;
  }
  view.classList.remove("hidden");
  const card = document.getElementById("today-card");
  const list = dayList();
  const guide = document.getElementById("guide-line");
  const passed = lessonPassShare().passed;
  const resting = list.rest && !studyOnRest && !list.done.length;
  const allDone = !list.next.length && list.done.length > 0;
  if (guide) {
    if (resting) guide.textContent = "Сегодня выходной. Отдыхай и набирайся сил!";
    else if (allDone) guide.textContent = "На сегодня всё. Ты молодец!";
    else if (list.done.length) guide.textContent = "Отлично! Сделай перемену 10 минут: попей воды, подвигайся.";
    else if (passed > 0) guide.textContent = "Ты уже прошла " + lessonsWord(passed) + ". Сегодня " + lessonsWord(list.next.length) + ", с переменами.";
    else guide.textContent = "Я фонарик. Сегодня " + lessonsWord(list.next.length || LESSONS_PER_DAY) + ". Идём по одному, с переменами.";
    if (!resting && !allDone && !list.done.length && typeof factsDoneToday === "function" && factsDoneToday()) {
      guide.textContent = "Голова проснулась! Теперь " + lessonsWord(list.next.length) + ", по одному.";
    }
  }
  let html = "";
  if (resting) {
    html = `<p class="today-what"><span>${esc(list.restTitle)}</span>Уроков сегодня нет</p>`
      + (list.waiting ? '<button type="button" class="choice-link" onclick="studyAnyway()">Всё равно позаниматься</button>' : "");
  } else {
    let number = 0;
    const hasFacts = typeof factsDoneToday === "function";
    const factsDone = hasFacts && factsDoneToday();
    const factsFirst = hasFacts && !factsDone && list.next.length > 0;
    const factsRows = [];
    if (factsDone) factsRows.push(dayRow("✓", "done", "Зарядка", "Счёт в уме", "").replace('aria-hidden="true">✓', 'aria-hidden="true">✓'));
    if (factsFirst) factsRows.push(`<li class="day-row is-now"><span class="lesson-num" aria-hidden="true">★</span><span class="subject-text"><span class="card-status">Зарядка, 3 минуты</span><span class="card-title">Счёт в уме</span></span><button type="button" class="start-day" onclick="openFacts()">Начать</button></li>`);
    const rows = factsRows.concat(list.done.map((item) => {
      number += 1;
      return dayRow(number, "done", item.subject, item.title, "");
    }));
    list.next.forEach((day, i) => {
      number += 1;
      const asReturn = day.kind === "return";
      const subject = (day.subject || "") + (asReturn ? ". Повторение" : "");
      rows.push(i === 0 && !factsFirst
        ? dayRow(number, "now", subject, day.title, dayAction(day), dayNote(day))
        : dayRow(number, "later", subject, day.title, ""));
    });
    list.mama.forEach((day) => {
      rows.push(`<li class="day-row is-mama"><span class="lesson-num" aria-hidden="true">♥</span><span class="subject-text"><span class="card-status">Вместе с мамой</span><span class="card-title">${esc(day.title)}</span></span></li>`);
    });
    html = rows.length
      ? `<ol class="day-list">${rows.join("")}</ol>`
      : '<div class="today-card"><p>Новых уроков нет. Можно открыть все предметы.</p></div>';
  }
  const step = nextGrade3();
  const planned = step && planDays().some((day) => day.lessonId === step.lesson.id);
  const stepUp = step && !planned
    ? `<button type="button" class="grade3-offer" onclick="openScheduledLesson('${esc(step.lesson.id)}')"><span>Ты доросла до задания 3 класса</span>${esc(step.lesson.title)}</button>`
    : "";
  const bonus = (allDone || resting) && typeof puzzleOffer === "function" ? puzzleOffer() : "";
  card.innerHTML = html + (resting ? "" : controlOffer() + stepUp) + bonus;
  const weekHeading = document.getElementById("week-heading");
  const weekList = document.getElementById("week-list");
  if (weekHeading) weekHeading.classList.add("hidden");
  if (weekList) {
    weekList.classList.add("hidden");
    weekList.innerHTML = "";
  }
}

function studyAnyway() {
  studyOnRest = true;
  renderToday();
}

function toggleHomeChoices() {
  const box = document.getElementById("home-choices");
  if (box) box.classList.toggle("hidden");
}

function renderTutorToday() {
  const host = document.getElementById("tutor-today");
  if (!host) return;
  const list = dayList();
  const rows = [];
  list.done.forEach((item) => rows.push(`<tr><td><span class="status-done">сделано сегодня</span></td><td>${esc(item.subject)}. ${esc(item.title)}</td></tr>`));
  list.next.forEach((day) => {
    const late = day.date < todayISO() ? " (с " + formatPlanDate(day.date) + ")" : "";
    const kind = day.kind === "return" ? "повтор" : day.book ? "учебник" : "новый урок";
    const pages = day.book ? ". " + bookPages(day) : "";
    rows.push(`<tr><td><span class="status-work">${kind}${esc(late)}</span></td><td>${esc(planDayText(day) + pages)}</td></tr>`);
  });
  list.mama.forEach((day) => rows.push(`<tr><td>с мамой</td><td>${esc(planDayText(day))}</td></tr>`));
  const behind = list.waiting - list.next.length;
  const note = list.rest
    ? `<p class="hint">Сегодня выходной: ${esc(list.restTitle)}.</p>`
    : (behind > 0 ? `<p class="hint">В очереди ещё ${behind}: несданное переходит на следующие дни, больше ${LESSONS_PER_DAY} уроков в день сайт не даёт.</p>` : "");
  host.innerHTML = (rows.length
    ? `<table class="desk-table"><tbody>${rows.join("")}</tbody></table>`
    : '<p class="hint">На сегодня уроков нет.</p>') + note + '<p class="hint"><a href="plan.html">Весь график</a></p>';
}

function renderPlanPage() {
  loadData().then(() => {
    const lead = document.getElementById("plan-lead");
    const plan = DATA.plan || {};
    lead.textContent = plan.pace === "books"
      ? "Программа 2 класса по учебникам «Школа России» (Моро, Канакина, Климанова, Плешаков), «Английский в фокусе» и саха тыла. С понедельника по пятницу четыре урока в день по 20–30 минут, с переменами. Урок — тема из учебника по порядку. Если к теме есть урок на сайте, сначала проходится он, потом страницы электронного учебника на LECTA и кнопка «Готово». В пятницу один повтор темы, пройденной неделю назад или раньше. Несделанное переходит на следующий день. Каникулы: 31 декабря – 8 января, 23 февраля, 8 марта, 29 марта – 2 апреля, 3 и 10 мая. Контрольные в конце каждой четверти, годовая с 17 мая. График до " + formatPlanDate(plan.lessonsUntil) + "."
      : plan.pace === "three"
      ? "Сайт заменяет школьный день: " + plan.perDay + " урока в день с понедельника по пятницу, каждый 15–25 минут, между ними перемена. Первый круг до " + formatPlanDate(plan.lessonsUntil) + ": с понедельника по четверг три новые темы по разным предметам, в пятницу два повтора недели и занятие с мамой. Второй круг с января: короткая проверка каждой темы ещё раз и по два урока 3 класса в неделю. Третий круг с марта: повторение перед годовой контрольной. Несданный урок переходит на следующий день, больше трёх уроков в день сайт не даёт. Каникулы: 31 декабря – 8 января, 23 февраля, 8 марта, 29 марта – 2 апреля, 10 мая. График до " + formatPlanDate(plan.reviewUntil) + "."
      : plan.pace === "slow"
      ? "Темп для медленного усвоения. С понедельника по четверг — один новый урок, около 30 минут. Пятница — диктант или чтение вслух с мамой. Суббота — около 20 минут повтора темы, которая уже была. Новую тему не начинаем, пока прошлый урок не пройден: график подождёт. Таблица умножения идёт по одному числу за урок. Жи-ши, ча-ща и чу-щу — тремя уроками. Новые уроки до " + formatPlanDate(plan.lessonsUntil) + ", повторы до " + formatPlanDate(plan.reviewUntil) + ". Каникулы: 31 декабря – 10 января, 23 февраля, 8 марта, 27 марта – 4 апреля."
      : "Домашние занятия к переводу в 3 класс.";

    const subjects = document.getElementById("plan-subjects");
    subjects.innerHTML = "";
    const bySubject = [];
    planDays().forEach((day) => {
      if (day.kind !== "lesson" && day.kind !== "book") return;
      let group = bySubject.find((item) => item.id === day.subjectId);
      if (!group) bySubject.push(group = { id: day.subjectId, name: day.subject, days: [] });
      group.days.push(day);
    });
    bySubject.forEach((group) => {
      const block = document.createElement("div");
      block.className = "plan-subject";
      const first = group.days.find((day) => day.book);
      const book = first && DATA.books ? DATA.books[first.book.id] : null;
      const source = book ? book.title.replace(/^[^.]*\.\s*/, "") : "по учебнику с мамой";
      const items = group.days.map((day) => {
        const pages = day.book ? ` <span class="hint">ч. ${day.book.part}, с. ${day.book.from}${day.book.to > day.book.from ? "–" + day.book.to : ""}</span>` : "";
        return `<li>${esc(day.title)}${pages}</li>`;
      }).join("");
      block.innerHTML = `<h3>${esc(group.name)} <span class="hint">${esc(source)}, ${esc(lessonsWord(group.days.length))}</span></h3><ol>${items}</ol>`;
      subjects.appendChild(block);
    });

    const calendar = document.getElementById("plan-calendar");
    calendar.innerHTML = "";
    const today = todayISO();
    let month = "";
    planDays().forEach((day) => {
      const key = day.date.slice(0, 7);
      if (key !== month) {
        month = key;
        const d = parseISO(day.date);
        const h = document.createElement("h3");
        h.className = "plan-month";
        h.textContent = MONTHS_NOM[d.getMonth()] + " " + d.getFullYear();
        calendar.appendChild(h);
      }
      const passed = (day.kind === "book" || day.lessonId) && planDone(day);
      const cls = ["plan-row", "kind-" + day.kind];
      if (day.date === today) cls.push("is-today");
      if (passed) cls.push("is-done");
      const label = day.kind === "lesson" || day.kind === "book"
        ? day.subject + ". " + day.title + (day.book ? ". " + bookPages(day) : "")
        : day.kind === "return"
          ? "Повтор. " + day.subject + ". " + day.title
          : day.title + (day.text ? ". " + day.text : "");
      const marks = [];
      if (day.date === today) marks.push("сегодня");
      if (passed) marks.push("сделано");
      const mark = marks.length ? `<span class="plan-mark">${esc(marks.join(" · "))}</span>` : "";
      if (day.kind === "lesson" || day.kind === "return") {
        const link = document.createElement("a");
        link.className = cls.join(" ");
        link.href = "index.html?lesson=" + encodeURIComponent(day.lessonId) + (day.kind === "return" ? "&return=1" : "");
        link.innerHTML = `<span class="plan-date">${esc(formatPlanDate(day.date))}</span><span class="plan-what">${esc(label)}${mark}</span>`;
        calendar.appendChild(link);
      } else {
        const row = document.createElement("div");
        row.className = cls.join(" ");
        row.innerHTML = `<span class="plan-date">${esc(formatPlanDate(day.date))}</span><span class="plan-what">${esc(label)}${mark}</span>`;
        calendar.appendChild(row);
      }
    });
  }).catch(showLoadError);
}

/* ================= СТАРТ ================= */
if (document.getElementById("subjects-list")) {
  loadData().then(() => {
    showSubjects();
    const params = new URLSearchParams(location.search);
    const want = params.get("lesson");
    if (want) openScheduledLesson(want, params.get("return") === "1");
    const control = params.get("control");
    if (control) openControl(control.split(":")[0], control.split(":")[1], true);
  }).catch(showLoadError);
}
