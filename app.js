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
  host.innerHTML = '<p class="hint">Уроки не открылись. В папке сайта выполните python3 -m http.server 8000 и откройте http://localhost:8000</p>';
}

async function loadData() {
  const res = await fetch("data.json", { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  DATA = await res.json();
  if (!DATA || !Array.isArray(DATA.subjects)) throw new Error("shape");
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
  if (softModeActive()) return true;
  if (index === 0) return true;
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
}

function toggleSubjects() {
  const list = document.getElementById("subjects-list");
  if (list) list.classList.toggle("hidden");
}

function renderSubjects() {
  const list = document.getElementById("subjects-list");
  list.innerHTML = "";
  DATA.subjects.forEach((subj) => {
    const lessons = subj.lessons || [];
    const total = lessons.length;
    const done = lessons.filter((lesson) => getLessonState(lesson.id).passed).length;
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="card-title">${esc(subj.name || subj.title)}</div>
      <div class="card-status">${done} из ${total} уроков пройдено</div>
    `;
    div.onclick = () => openSubject(subj);
    list.appendChild(div);
  });
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
  (currentSubject.lessons || []).forEach((lesson, i) => {
    const unlocked = isLessonUnlocked(currentSubject, i);
    const state = getLessonState(lesson.id);
    const div = document.createElement("div");
    div.className = "card" + (unlocked ? "" : " locked") + (state.passed ? " done" : "");
    let status = "🔒 закрыт";
    if (state.passed) status = "✅ пройден";
    else if (unlocked && state.attempts > 0) status = "🟡 в процессе";
    else if (unlocked) status = "▶️ можно начать";
    if (readExplained()[lesson.id]) status += " ★";
    div.innerHTML = `
      <div class="card-title">${i + 1}. ${esc(lesson.title)}</div>
      <div class="card-status">${status}</div>
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
  showTeachCard();
  startSessionTimer();
}

const SESSION_MS = 15 * 60 * 1000;
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
  if (time) time.textContent = "15:00";
  if (note) note.classList.add("hidden");
  tickSession();
  sessionTimer = setInterval(tickSession, 1000);
}

function stopSessionTimer() {
  if (sessionTimer) clearInterval(sessionTimer);
  sessionTimer = null;
}

function tickSession() {
  const time = document.getElementById("session-time");
  const note = document.getElementById("session-note");
  if (!time) return;
  const left = sessionEndsAt - Date.now();
  if (left > 0) {
    const total = Math.ceil(left / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    time.textContent = minutes + ":" + String(seconds).padStart(2, "0");
    return;
  }
  time.textContent = "0:00";
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
  next.onclick = () => {
    backToLessons();
    renderLessons();
  };
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

function showTeachCard() {
  const card = teachCards[teachIndex];
  const body = document.getElementById("teach-body");
  const label = document.getElementById("step-label");
  const button = document.getElementById("teach-next");
  if (!card) {
    startPractice();
    return;
  }
  label.textContent = card.label;
  body.innerHTML = `<h3>${esc(card.kicker)}. ${esc(card.title)}</h3><p>${esc(card.body)}</p>`;
  const last = teachIndex >= teachCards.length - 1;
  const hasPractice = currentLesson && Array.isArray(currentLesson.practice) && currentLesson.practice.length;
  if (!last) button.textContent = "Дальше";
  else if (stage === "corrective") button.textContent = "Ещё одна попытка";
  else button.textContent = hasPractice ? "Потренироваться" : "К проверке";
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
  document.getElementById("practice-block").classList.remove("hidden");
  showPractice();
}

function showPractice() {
  const items = currentLesson.practice || [];
  const item = items[practiceIndex];
  practiceAnswered = false;
  const label = document.getElementById("practice-label");
  const body = document.getElementById("practice-body");
  const why = document.getElementById("practice-why");
  const next = document.getElementById("practice-next");
  label.textContent = `Тренировка ${practiceIndex + 1} из ${items.length}`;
  why.classList.add("hidden");
  why.textContent = "";
  next.classList.add("hidden");
  const order = displayOrder(item, optionOrderKey("practice", practiceIndex));
  const opts = order.map((originalIndex, displayIndex) => (
    `<button type="button" class="option" data-o="${displayIndex}" onclick="answerPractice(${displayIndex})"><span>${esc(item.options[originalIndex])}</span></button>`
  )).join("");
  body.innerHTML = `<div class="question"><p>${esc(item.q)}</p><div class="options">${opts}</div></div>`;
}

function answerPractice(displayIndex) {
  if (practiceAnswered) return;
  practiceAnswered = true;
  const item = currentLesson.practice[practiceIndex];
  const order = displayOrder(item, optionOrderKey("practice", practiceIndex));
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
  why.textContent = (chosen === right ? "Верно. " : "Почти. ") + (item.why || ("Правильно: " + right));
  why.classList.remove("hidden");
  const next = document.getElementById("practice-next");
  const last = practiceIndex >= currentLesson.practice.length - 1;
  next.textContent = last ? "К проверке" : "Дальше";
  next.classList.remove("hidden");
}

function nextPractice() {
  if (!practiceAnswered) return;
  if (practiceIndex < currentLesson.practice.length - 1) {
    practiceIndex += 1;
    showPractice();
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
      : "Ответь на вопросы.";
  }
  currentAnswers = {};
  quizLocked = false;
  renderQuestions(currentLesson);
  const result = document.getElementById("result");
  result.classList.add("hidden");
  result.classList.remove("is-wait");
  result.textContent = "";
  document.getElementById("check-btn").classList.remove("hidden");
  document.getElementById("quiz-block").scrollIntoView({ behavior: "smooth", block: "start" });
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
  document.getElementById("check-btn").classList.add("hidden");
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
  body.innerHTML = `<div class="question"><p>${esc(item.question.q)}</p><div class="options">${buttons}</div></div>`;
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
    return `<h3>${esc(group.subject)}</h3><div class="grid">${cards}</div>`;
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
  host.innerHTML = gaps.map((item) => (
    `<div class="err"><div class="err-type">${esc(item.subject)}</div><div>${esc(item.title)} — потренируем</div></div>`
  )).join("");
}

/* ================= ПАНЕЛЬ ТЬЮТОРА ================= */
function renderTutorPanel() {
  loadData().then(() => {
    renderTutorToday();
    renderTutorCalendar();
    renderSoftMode();
    renderTutorScout();
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

function progressFileName() {
  const day = new Date();
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return "progress-" + day.getFullYear() + "-" + month + "-" + date + ".json";
}

function downloadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || "{}";
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    const blob = new Blob([JSON.stringify(parsed)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = progressFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  } catch (e) {
    window.alert("Не получилось скачать прогресс.");
  }
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      renderTutorPanel();
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
  if (kind === "lesson") return "Новый урок";
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

    month.days.forEach((day) => {
      const passed = day.lessonId && getLessonState(day.lessonId).passed;
      const row = document.createElement("div");
      row.className = "plan-row mom-day kind-" + day.kind + (day.date === today ? " is-today" : "") + (passed ? " is-done" : "");
      const title = day.kind === "lesson" || day.kind === "return"
        ? day.subject + ". " + day.title
        : day.title;
      const topic = day.lessonId ? lessonGoal(day.lessonId) : (day.text || "");
      row.innerHTML = `
        <span class="plan-date">${esc(formatPlanDate(day.date))}</span>
        <span class="plan-what">
          <strong>${esc(dayKindLabel(day.kind))}. ${esc(title)}</strong>
          <span class="mom-topic">${esc(topic)}</span>
        </span>`;
      host.appendChild(row);
    });
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

    (subj.lessons || []).forEach((lesson) => {
      const st = getLessonState(lesson.id);
      let cls = "";
      let icon = "⚪";
      if (st.stuck || (st.attempts >= 2 && !st.passed)) {
        cls = "stuck";
        icon = "🔴";
      } else if (st.passed) {
        cls = "done";
        icon = "🟢";
      } else if (st.attempts > 0) {
        icon = "🟡";
      }

      const row = document.createElement("div");
      row.className = "row " + cls;
      const button = !st.passed
        ? `<button onclick="tutorExplain('${esc(lesson.id)}')">Я объяснила →</button>`
        : "";
      row.innerHTML = `
        <span>${icon} ${esc(lesson.title)}</span>
        <span>
          ${st.lastPercent !== undefined ? st.lastPercent + "%" : ""}
          ${button}
        </span>
      `;
      wrap.appendChild(row);
    });
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
    const div = document.createElement("div");
    div.className = "err";
    const types = [...new Set(st.lastErrors)].map((type) => typeNames[type] || type).join(", ");
    div.innerHTML = `<div class="err-type">${esc(types)}</div><div>${esc(title)}</div>`;
    wrap.appendChild(div);
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
    hanoi: "#9b3d5c",
    hue: "#7e2e4a",
    danang: "#14635f",
    hoian: "#a67c12",
    nhatrang: "#1f6b4a",
    dalat: "#1f6b4a",
    hochiminh: "#14635f",
    phuquoc: "#9b3d5c",
  }[id] || "#14635f" : "#b7aea4";
  const paper = "#fff6ea";
  const shapes = {
    hanoi: `<ellipse cx="14" cy="24" rx="10" ry="3" fill="${color}" opacity="0.35"/><path d="M14 3 L20 9 H8 Z M14 8 L22 15 H6 Z M14 14 L24 23 H4 Z" fill="${color}"/>`,
    hue: `<path d="M3 25 V11 H8 V5 H20 V11 H25 V25 Z" fill="${color}"/><path d="M11 25 V16 a3 3 0 0 1 6 0 V25 Z" fill="${paper}"/>`,
    danang: `<path d="M2 16 Q14 4 26 16" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/><path d="M2 22 H26" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`,
    hoian: `<rect x="6" y="5" width="6" height="14" rx="3" fill="${color}"/><rect x="16" y="8" width="6" height="14" rx="3" fill="${color}"/><circle cx="9" cy="11" r="1.2" fill="${paper}"/><circle cx="19" cy="14" r="1.2" fill="${paper}"/>`,
    nhatrang: `<path d="M2 20 Q8 15 14 20 T26 20 V25 H2 Z" fill="${color}" opacity="0.45"/><path d="M18 22 V7" stroke="${color}" stroke-width="2"/><path d="M18 10 Q25 8 22 18" fill="${color}"/>`,
    dalat: `<path d="M4 24 L11 8 L18 24 Z" fill="${color}"/><circle cx="20" cy="11" r="3" fill="${color}"/><circle cx="23" cy="16" r="2.2" fill="${color}"/>`,
    hochiminh: `<path d="M3 25 V14 H9 V5 H16 V12 H25 V25 Z" fill="${color}"/>`,
    phuquoc: `<ellipse cx="14" cy="17" rx="11" ry="6" fill="${color}"/><path d="M14 16 V7 M14 9 Q19 8 17 14" stroke="${paper}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  };
  return `<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">${shapes[id] || ""}</svg>`;
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
    return `<g><circle cx="${point.x}" cy="${point.y}" r="${next ? 12 : 8}" fill="${fill}" stroke="${stroke}" stroke-width="${next ? 4 : 2}"></circle><g transform="translate(${point.x + 18}, ${point.y - 14})">${cityMark(point.city.id, open)}</g><text x="${point.x + 52}" y="${point.y}" dominant-baseline="middle" font-size="16" fill="#2c2416">${esc(point.city.name)}</text></g>`;
  }).join("");
  path.innerHTML = `<svg viewBox="0 0 320 ${height}" role="img" aria-label="Путь по Вьетнаму"><path d="${line}" fill="none" stroke="#9fd4d0" stroke-width="4" stroke-linecap="round"></path>${marks}</svg>${openCount >= JOURNEY_CITIES.length ? '<p class="hint">Ты добралась до конца пути!</p>' : ''}`;
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
  if (day.kind === "lesson") return day.subject + ". " + day.title;
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

function renderToday() {
  const view = document.getElementById("today-view");
  if (!view) return;
  const days = planDays();
  if (!days.length) {
    view.classList.add("hidden");
    return;
  }
  view.classList.remove("hidden");
  const heading = document.getElementById("today-heading");
  const card = document.getElementById("today-card");
  const choice = homeChoices();
  const pair = [choice.primary, choice.alternative].filter(Boolean);
  heading.textContent = "Выбери одно";
  const primary = choice.primary;
  const start = primary && primary.lessonId
    ? `<button type="button" class="start-day" onclick="openScheduledLesson('${esc(primary.lessonId)}', ${primary.kind === "return"})">Начать сегодняшний урок</button><p class="hint">${esc(primary.subject || "")}${primary.subject ? ". " : ""}${esc(primary.title || "")}</p>`
    : "";
  if (!pair.length) {
    card.innerHTML = start + '<div class="today-card"><p>Новых уроков нет. Можно открыть все предметы.</p></div>';
  } else {
    card.innerHTML = start + `<p class="hint">Можно любое. Второе подождёт.</p><div class="choice-grid">${pair.map((day, index) => {
      const label = index === 0 ? "Урок дня" : "Другой предмет";
      const asReturn = day.kind === "return";
      return `<button type="button" class="card choice-card" onclick="openScheduledLesson('${esc(day.lessonId)}', ${asReturn})"><div class="card-status">${label}</div><div class="card-title">${esc(day.subject || "")}</div><p>${esc(day.title || "")}</p></button>`;
    }).join("")}</div>`;
  }
  const weekHeading = document.getElementById("week-heading");
  const weekList = document.getElementById("week-list");
  if (weekHeading) weekHeading.classList.add("hidden");
  if (weekList) {
    weekList.classList.add("hidden");
    weekList.innerHTML = "";
  }
}

function renderTutorToday() {
  const host = document.getElementById("tutor-today");
  if (!host) return;
  const today = todayISO();
  const due = dueWork();
  const current = planDays().find((day) => day.date === today) || nearestPlanDay();
  const shown = due || current;
  if (!shown) {
    host.innerHTML = '<p class="hint">График закончился.</p>';
    return;
  }
  const behind = due && (!current || due.lessonId !== current.lessonId);
  const when = behind ? "Сначала несданное" : shown.date === today ? "Сегодня" : "Ближайшее";
  host.innerHTML = `<div class="today-card"><div class="card-status">${esc(when)} · ${esc(formatPlanDate(shown.date))}</div><div class="card-title">${esc(planDayText(shown))}</div><p class="hint"><a href="plan.html">Весь график</a></p></div>`;
}

function renderPlanPage() {
  loadData().then(() => {
    const lead = document.getElementById("plan-lead");
    const plan = DATA.plan || {};
    lead.textContent = plan.pace === "slow"
      ? "Темп для медленного усвоения. С понедельника по четверг — один новый урок, около 30 минут. Пятница — диктант или чтение вслух с мамой. Суббота — около 20 минут повтора темы, которая уже была. Новую тему не начинаем, пока прошлый урок не пройден: график подождёт. Таблица умножения идёт по одному числу за урок. Жи-ши, ча-ща и чу-щу — тремя уроками. Новые уроки до " + formatPlanDate(plan.lessonsUntil) + ", повторы до " + formatPlanDate(plan.reviewUntil) + ". Каникулы: 31 декабря – 10 января, 23 февраля, 8 марта, 27 марта – 4 апреля."
      : "Домашние занятия к переводу в 3 класс.";

    const subjects = document.getElementById("plan-subjects");
    subjects.innerHTML = "";
    DATA.subjects.forEach((subject) => {
      const block = document.createElement("div");
      block.className = "plan-subject";
      const items = (subject.lessons || []).map((lesson) => `<li>${esc(lesson.title)}</li>`).join("");
      block.innerHTML = `<h3>${esc(subject.name)} <span class="hint">${esc(lessonsWord(subject.lessons.length))}</span></h3><ol>${items}</ol>`;
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
      const passed = day.lessonId && getLessonState(day.lessonId).passed;
      const cls = ["plan-row", "kind-" + day.kind];
      if (day.date === today) cls.push("is-today");
      if (passed) cls.push("is-done");
      const label = day.kind === "lesson"
        ? day.subject + ". " + day.title
        : day.kind === "return"
          ? "Повтор. " + day.subject + ". " + day.title
          : day.title + (day.text ? ". " + day.text : "");
      if (day.kind === "lesson" || day.kind === "return") {
        const link = document.createElement("a");
        link.className = cls.join(" ");
        link.href = "index.html?lesson=" + encodeURIComponent(day.lessonId) + (day.kind === "return" ? "&return=1" : "");
        link.innerHTML = `<span class="plan-date">${esc(formatPlanDate(day.date))}</span><span class="plan-what">${esc(label)}</span>`;
        calendar.appendChild(link);
      } else {
        const row = document.createElement("div");
        row.className = cls.join(" ");
        row.innerHTML = `<span class="plan-date">${esc(formatPlanDate(day.date))}</span><span class="plan-what">${esc(label)}</span>`;
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
  }).catch(showLoadError);
}
