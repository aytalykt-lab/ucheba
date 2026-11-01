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
let teachCards = [];
let teachIndex = 0;
let practiceIndex = 0;
let practiceAnswered = false;
let stage = "teach";
let quizForm = "a";
let keepPassed = false;

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
  if (index === 0) return true;
  const prev = subject.lessons[index - 1];
  return getLessonState(prev.id).passed === true;
}

/* ================= ЭКРАН ПРЕДМЕТОВ ================= */
function showSubjects() {
  document.getElementById("subjects-view").classList.remove("hidden");
  document.getElementById("lessons-view").classList.add("hidden");
  document.getElementById("lesson-view").classList.add("hidden");
  renderToday();
  renderSubjects();
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
      <div class="card-status">${done} из ${total} уроков усвоено</div>
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
  document.getElementById("subject-title").textContent = subj.name || subj.title || "";
  renderLessons();
}

function backToLessons() {
  document.getElementById("lesson-view").classList.add("hidden");
  document.getElementById("lessons-view").classList.remove("hidden");
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
    if (state.passed) status = "✅ усвоен";
    else if (unlocked && state.attempts > 0) status = "🟡 в процессе";
    else if (unlocked) status = "▶️ можно начать";
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

function openLesson(lesson) {
  currentLesson = lesson;
  keepPassed = getLessonState(lesson.id).passed === true;
  currentAnswers = {};
  teachCards = lessonCards(lesson);
  teachIndex = 0;
  practiceIndex = 0;
  practiceAnswered = false;
  stage = "teach";
  quizForm = "a";
  document.getElementById("lessons-view").classList.add("hidden");
  document.getElementById("lesson-view").classList.remove("hidden");
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
  const old = document.getElementById("explain");
  if (old) old.remove();
  renderVideo(lesson);
  showTeachCard();
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
  else if (stage === "corrective") button.textContent = "Вторая проверка";
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
  const opts = (item.options || []).map((opt, oi) => (
    `<button type="button" class="option" onclick="answerPractice(${oi})"><span>${esc(opt)}</span></button>`
  )).join("");
  body.innerHTML = `<div class="question"><p>${esc(item.q)}</p><div class="options">${opts}</div></div>`;
}

function answerPractice(oi) {
  if (practiceAnswered) return;
  practiceAnswered = true;
  const item = currentLesson.practice[practiceIndex];
  const buttons = document.querySelectorAll("#practice-body .option");
  buttons.forEach((button, index) => {
    button.disabled = true;
    if (index === item.correct) button.classList.add("correct");
    else if (index === oi) button.classList.add("wrong");
  });
  const why = document.getElementById("practice-why");
  const right = item.options[item.correct];
  why.textContent = (oi === item.correct ? "Верно. " : "Пока не так. ") + (item.why || ("Правильно: " + right));
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
  if (title) title.textContent = quizForm === "b" ? "Вторая проверка" : "Проверка";
  if (hint) {
    hint.textContent = quizForm === "b"
      ? "Другие вопросы про то же умение. Снова нужно не меньше 80%."
      : "Первая проверка. Урок усвоен, если верно не меньше 80%.";
  }
  currentAnswers = {};
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
    kicker: "Коррекция",
    title: "Другое объяснение",
    body: step,
    label: `Коррекция, шаг ${i + 1} из ${steps.length}`,
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
  activeQuestions().forEach((q, qi) => {
    const div = document.createElement("div");
    div.className = "question";
    const opts = (q.options || []).map((opt, oi) => `
      <label class="option" data-q="${qi}" data-o="${oi}">
        <input type="radio" name="q${qi}" value="${oi}" onchange="selectAnswer(${qi}, ${oi})">
        <span>${esc(opt)}</span>
      </label>
    `).join("");
    div.innerHTML = `<p>${qi + 1}. ${esc(q.q)}</p><div class="options">${opts}</div>`;
    wrap.appendChild(div);
  });
}

function selectAnswer(qi, oi) {
  currentAnswers[qi] = oi;
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
  let correct = 0;
  const errors = [];

  list.forEach((q, qi) => {
    const chosen = currentAnswers[qi];
    const labels = document.querySelectorAll(`.option[data-q="${qi}"]`);
    labels.forEach((label) => label.classList.remove("correct", "wrong"));

    const correctLabel = document.querySelector(`.option[data-q="${qi}"][data-o="${q.correct}"]`);
    if (correctLabel) correctLabel.classList.add("correct");

    if (chosen === q.correct) {
      correct += 1;
    } else {
      if (chosen !== undefined) {
        const wrongLabel = document.querySelector(`.option[data-q="${qi}"][data-o="${chosen}"]`);
        if (wrongLabel) wrongLabel.classList.add("wrong");
      }
      if (q.type) errors.push(q.type);
    }
  });

  const percent = total ? Math.round((correct / total) * 100) : 0;
  const state = getLessonState(lesson.id);
  state.attempts = (state.attempts || 0) + 1;
  state.lastErrors = errors;
  state.lastPercent = percent;

  const result = document.getElementById("result");
  result.classList.remove("hidden");

  if (percent >= 80) {
    state.passed = true;
    state.stuck = false;
    state.shaky = false;
    setLessonState(lesson.id, state);
    result.classList.remove("is-wait");
    result.textContent = `Урок усвоен: ${correct} из ${total} (${percent}%). Следующий можно открывать.`;
    document.getElementById("check-btn").classList.add("hidden");
    document.getElementById("stuck-block").classList.add("hidden");
    setTimeout(() => {
      backToLessons();
      renderLessons();
    }, 2500);
  } else if (keepPassed) {
    state.passed = true;
    state.shaky = true;
    state.stuck = false;
    setLessonState(lesson.id, state);
    result.classList.add("is-wait");
    result.textContent = `Повтор: ${correct} из ${total} (${percent}%). Завтра снова эта тема. Новую не начинаем.`;
  } else {
    state.passed = false;
    const canCorrect = quizForm === "a" && Array.isArray(lesson.recheck) && lesson.recheck.length;
    if (!canCorrect) state.stuck = true;
    setLessonState(lesson.id, state);
    result.classList.add("is-wait");
    result.textContent = "";
    const note = document.createElement("p");
    note.textContent = canCorrect
      ? `Пока ${correct} из ${total} (${percent}%). Для усвоения нужно 80%. Сейчас будет другое объяснение и вторая проверка.`
      : `Пока ${correct} из ${total} (${percent}%). После двух проверок порог не взят.`;
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
  note.textContent = "Мама видит, что ты зовёшь. В панели тьютора этот блок отмечен как «застрял».";
}

/* ================= ПАНЕЛЬ ТЬЮТОРА ================= */
function renderTutorPanel() {
  loadData().then(() => {
    renderTutorToday();
    renderTutorCalendar();
    renderTutorProgress();
    renderTutorErrors();
  }).catch(showLoadError);
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
  st.passed = true;
  st.stuck = false;
  st.attempts = 0;
  setLessonState(lessonId, st);
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

function renderToday() {
  const view = document.getElementById("today-view");
  if (!view) return;
  const days = planDays();
  if (!days.length) {
    view.classList.add("hidden");
    return;
  }
  const today = todayISO();
  const due = dueWork();
  const current = days.find((day) => day.date === today);
  const next = nearestPlanDay();
  const shown = due || current || next;
  const heading = document.getElementById("today-heading");
  const card = document.getElementById("today-card");
  if (!shown) {
    heading.textContent = "График закончился";
    card.innerHTML = '<div class="today-card"><p>Новых дат нет. Повторяй уроки, которые ещё не зелёные.</p></div>';
  } else {
    const behind = due && (!current || due.lessonId !== (current && current.lessonId));
    heading.textContent = behind ? "Сначала этот урок" : current ? "Сегодня" : "Ближайшее занятие";
    let action = "";
    let note = behind ? "<p>По графику уже другая тема. Она подождёт, пока эта не сдана на 80%.</p>" : "";
    const asReturn = shown.kind === "return";
    if (shown.lessonId) {
      const found = findLesson(shown.lessonId);
      const open = found && isLessonUnlocked(found.subject, found.index);
      if (open) {
        action = `<button class="action-btn" type="button" onclick="openScheduledLesson('${esc(shown.lessonId)}', ${asReturn})">Начать урок</button>`;
      } else {
        note += "<p>Этот урок ещё закрыт: сначала предыдущий урок по этому предмету.</p>";
        action = `<button class="action-btn" type="button" onclick="openSubjectById('${esc(shown.subjectId)}')">Открыть предмет</button>`;
      }
    } else if (shown.subjectId) {
      action = `<button class="action-btn" type="button" onclick="openSubjectById('${esc(shown.subjectId)}')">Открыть предмет</button>`;
    }
    const when = behind ? "" : current ? "" : " · сегодня выходной или каникулы";
    card.innerHTML = `
      <div class="today-card">
        <div class="card-status">${esc(formatPlanDate(shown.date))}${when}</div>
        <div class="card-title">${esc(shown.kind === "lesson" || shown.kind === "return" ? shown.subject : shown.title)}</div>
        <p>${esc(shown.kind === "lesson" || shown.kind === "return" ? shown.title : (shown.text || ""))}</p>
        ${shown.kind === "return" ? "<p>Повтор уже знакомой темы, около 20 минут.</p>" : ""}
        ${note}
        ${action}
      </div>`;
  }

  const anchor = shown || days[days.length - 1];
  const week = weekOf(anchor.date);
  const weekHasToday = week.some((day) => day.date === today) || (today >= week[0].date && today <= week[week.length - 1].date);
  document.getElementById("week-heading").textContent = weekHasToday ? "Эта неделя" : "Ближайшая неделя";
  const list = document.getElementById("week-list");
  list.innerHTML = "";
  week.forEach((day) => {
    const div = document.createElement("div");
    const passed = day.lessonId && getLessonState(day.lessonId).passed;
    div.className = "card" + (passed ? " done" : "") + (day.date === today ? " is-today" : "");
    div.innerHTML = `
      <div class="card-status">${esc(formatPlanDate(day.date))}</div>
      <div class="card-title">${esc(day.kind === "lesson" ? day.title : day.title)}</div>
      <div class="card-status">${esc(day.kind === "lesson" ? day.subject : day.kind === "return" ? "повтор" : day.kind === "mama" ? "с мамой, без новой темы" : day.kind === "review" ? "повтор" : "выходной")}</div>`;
    if (day.kind === "lesson" || day.kind === "return") div.onclick = () => openScheduledLesson(day.lessonId, day.kind === "return");
    else if (day.subjectId) div.onclick = () => openSubjectById(day.subjectId);
    else div.style.cursor = "default";
    list.appendChild(div);
  });
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
      ? "Темп для медленного усвоения. С понедельника по четверг — один новый урок, около 30 минут. Пятница — диктант или чтение вслух с мамой. Суббота — около 20 минут повтора темы, которая уже была. Новую тему не начинаем, пока прошлая не сдана на 80%: график подождёт. Таблица умножения идёт по одному числу за урок. Жи-ши, ча-ща и чу-щу — тремя уроками. Новые уроки до " + formatPlanDate(plan.lessonsUntil) + ", повторы до " + formatPlanDate(plan.reviewUntil) + ". Каникулы: 31 декабря – 10 января, 23 февраля, 8 марта, 27 марта – 4 апреля."
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
