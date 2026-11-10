/* Зарядка для ума: «Счёт в уме» (беглый счёт с умным повторением) и «Задача на смекалку».
   Опирается на функции из app.js. */

/* ================= СЧЁТ В УМЕ ================= */
const FACTS_KEY = "study_facts_v1";
const FACT_GAPS = [0, 1, 3, 7, 16]; /* через сколько дней пример вернётся, по ступеням */
const FACT_FAST_MS = 7000;           /* быстрее этого — «знает уверенно»; ребёнку время не показываем */
const FACT_SESSION = 10;
const FACT_NEW = 5;
let factRun = null;

function readFacts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FACTS_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { items: {}, lastDay: "" };
    return { items: parsed.items && typeof parsed.items === "object" ? parsed.items : {}, lastDay: parsed.lastDay || "" };
  } catch (e) {
    return { items: {}, lastDay: "" };
  }
}

function writeFacts(state) {
  try {
    localStorage.setItem(FACTS_KEY, JSON.stringify(state));
  } catch (e) {
    /* зарядка работает и без сохранения */
  }
}

/* Какие примеры уже можно давать. Сложение и вычитание до 20 — сразу,
   остальное открывается вместе с пройденными уроками. */
function factPool() {
  const pool = [];
  const passed = (id) => getLessonState(id).passed === true;
  const put = (group, text, answer) => pool.push({ key: text, group, text, answer });
  for (let a = 1; a <= 9; a += 1) for (let b = 1; a + b <= 10; b += 1) put("Сложение до 10", a + " + " + b, a + b);
  for (let a = 2; a <= 10; a += 1) for (let b = 1; b < a; b += 1) put("Вычитание до 10", a + " − " + b, a - b);
  for (let a = 2; a <= 9; a += 1) for (let b = 2; b <= 9; b += 1) if (a + b > 10) put("Сложение через десяток", a + " + " + b, a + b);
  for (let s = 11; s <= 18; s += 1) for (let b = 2; b <= 9; b += 1) if (s - b >= 2 && s - b <= 9) put("Вычитание через десяток", s + " − " + b, s - b);
  if (passed("math-01")) {
    for (let a = 10; a <= 80; a += 10) for (let b = 10; a + b <= 100; b += 10) put("Круглые десятки", a + " + " + b, a + b);
  }
  for (let n = 2; n <= 9; n += 1) {
    if (!passed("math-f-x" + n)) continue;
    for (let k = 2; k <= 9; k += 1) put("Умножение на " + n, k + " × " + n, k * n);
    if (passed("math-f-link")) for (let k = 2; k <= 9; k += 1) put("Деление на " + n, (k * n) + " : " + n, k);
  }
  return pool;
}

function factsDoneToday() {
  return readFacts().lastDay === todayISO();
}

function buildFactSession() {
  const state = readFacts();
  const today = todayISO();
  const pool = factPool();
  const seen = pool.filter((fact) => state.items[fact.key]);
  const due = fisherYates(seen.filter((fact) => (state.items[fact.key].due || "") <= today))
    .sort((a, b) => state.items[a.key].box - state.items[b.key].box);
  const fresh = pool.filter((fact) => !state.items[fact.key]);
  const firstGroup = fresh.length ? fresh[0].group : "";
  const newOnes = fisherYates(fresh.filter((fact) => fact.group === firstGroup)).slice(0, FACT_NEW);
  let picked = due.slice(0, FACT_SESSION - Math.min(newOnes.length, FACT_NEW)).concat(newOnes);
  if (picked.length < FACT_SESSION) {
    /* Добираем: сначала уже знакомые слабые примеры, потом новые из самой ранней группы. */
    const groupOrder = pool.map((fact) => fact.group).filter((group, i, all) => all.indexOf(group) === i);
    const rank = (fact) => (state.items[fact.key] ? state.items[fact.key].box : 100 + groupOrder.indexOf(fact.group));
    const rest = fisherYates(pool.filter((fact) => picked.indexOf(fact) < 0)).sort((a, b) => rank(a) - rank(b));
    picked = picked.concat(rest.slice(0, FACT_SESSION - picked.length));
  }
  return fisherYates(picked.slice(0, FACT_SESSION));
}

function showExtraView(title, lead) {
  document.getElementById("subjects-view").classList.add("hidden");
  document.getElementById("lessons-view").classList.add("hidden");
  document.getElementById("lesson-view").classList.add("hidden");
  hideScoutView();
  stopSessionTimer();
  document.getElementById("extra-view").classList.remove("hidden");
  document.getElementById("extra-title").textContent = title;
  document.getElementById("extra-lead").textContent = lead;
  window.scrollTo(0, 0);
}

function openFacts() {
  const queue = buildFactSession();
  if (!queue.length) return;
  factRun = { queue, index: 0, total: queue.length, typed: "", startedAt: 0, right: 0, retried: {}, locked: false };
  showExtraView("Счёт в уме", "Зарядка перед уроками. Не спеши, думай спокойно.");
  renderFact();
}

function renderFact() {
  const run = factRun;
  const fact = run.queue[run.index];
  run.typed = "";
  run.locked = false;
  run.startedAt = Date.now();
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"].map((key) => {
    const cls = key === "OK" ? "key-btn key-ok" : "key-btn";
    return `<button type="button" class="${cls}" onclick="factKey('${key}')">${key === "OK" ? "Готово" : key}</button>`;
  }).join("");
  document.getElementById("extra-body").innerHTML = `
    <p class="hint">${stepDots(Math.min(run.index, run.total - 1), run.total)}</p>
    <div class="fact-card">
      <p class="fact-line"><span>${esc(fact.text)} =</span> <span id="fact-typed" class="fact-typed">?</span></p>
      <p id="fact-note" class="fact-note"></p>
    </div>
    <div id="fact-keys" class="keypad">${keys}</div>
    <button id="fact-next" class="action-btn hidden" type="button" onclick="nextFact()">Дальше</button>`;
}

function factKey(key) {
  const run = factRun;
  if (!run || run.locked) return;
  if (key === "OK") {
    if (run.typed !== "") answerFact();
    return;
  }
  if (key === "⌫") run.typed = run.typed.slice(0, -1);
  else if (run.typed.length < 3) run.typed += key;
  document.getElementById("fact-typed").textContent = run.typed || "?";
}

function answerFact() {
  const run = factRun;
  const fact = run.queue[run.index];
  run.locked = true;
  const correct = Number(run.typed) === fact.answer;
  const fast = Date.now() - run.startedAt <= FACT_FAST_MS;
  const retry = run.retried[fact.key] === true;
  if (!retry) {
    const state = readFacts();
    const first = !state.items[fact.key];
    const entry = state.items[fact.key] || { box: 0, seen: 0, wrong: 0 };
    entry.seen += 1;
    if (!correct) {
      entry.box = 0;
      entry.wrong = (entry.wrong || 0) + 1;
    } else if (fast) {
      entry.box = first ? 3 : Math.min(FACT_GAPS.length - 1, entry.box + 1);
    }
    entry.due = shiftISO(todayISO(), FACT_GAPS[entry.box]);
    state.items[fact.key] = entry;
    writeFacts(state);
    if (correct) run.right += 1;
  }
  const note = document.getElementById("fact-note");
  const typed = document.getElementById("fact-typed");
  if (correct) {
    typed.classList.add("is-right");
    note.textContent = "Верно!";
    setTimeout(nextFact, 800);
    return;
  }
  typed.classList.add("is-wrong");
  note.textContent = "Почти. Правильно: " + fact.text + " = " + fact.answer + ". Этот пример ещё вернётся.";
  if (!retry) {
    run.retried[fact.key] = true;
    run.queue.push(fact);
  }
  document.getElementById("fact-keys").classList.add("hidden");
  document.getElementById("fact-next").classList.remove("hidden");
}

function nextFact() {
  const run = factRun;
  if (!run) return;
  run.index += 1;
  if (run.index < run.queue.length) {
    renderFact();
    return;
  }
  const state = readFacts();
  state.lastDay = todayISO();
  writeFacts(state);
  const stars = run.right >= run.total - 1 ? "★★★" : run.right >= run.total / 2 ? "★★" : "★";
  document.getElementById("extra-body").innerHTML = `
    <div class="control-result">
      <p class="control-done">Зарядка готова. Голова проснулась!</p>
      <p class="stars">${stars}</p>
      <button class="action-btn" type="button" onclick="showSubjects()">К урокам</button>
    </div>`;
  factRun = null;
}

document.addEventListener("keydown", (event) => {
  if (!factRun || document.getElementById("extra-view").classList.contains("hidden")) return;
  if (/^[0-9]$/.test(event.key)) factKey(event.key);
  else if (event.key === "Backspace") factKey("⌫");
  else if (event.key === "Enter") {
    if (factRun.locked && !document.getElementById("fact-next").classList.contains("hidden")) nextFact();
    else factKey("OK");
  }
});

function renderTutorFacts() {
  const host = document.getElementById("tutor-facts");
  if (!host) return;
  const state = readFacts();
  const groups = [];
  factPool().forEach((fact) => {
    let group = groups.find((item) => item.name === fact.group);
    if (!group) {
      group = { name: fact.group, total: 0, firm: 0, learning: 0, hard: [] };
      groups.push(group);
    }
    group.total += 1;
    const entry = state.items[fact.key];
    if (!entry) return;
    if (entry.box >= 3) group.firm += 1;
    else group.learning += 1;
    if (entry.box === 0 && (entry.wrong || 0) >= 2) group.hard.push(fact.text + " = " + fact.answer);
  });
  const rows = groups.map((group) => (
    `<tr><td>${esc(group.name)}</td><td><span class="status-done">${group.firm}</span> из ${group.total}</td><td>${group.learning}</td><td>${esc(group.hard.join("; "))}</td></tr>`
  )).join("");
  host.innerHTML = `<table class="desk-table"><thead><tr><th>Группа</th><th>Знает быстро</th><th>Учит</th><th>Трудные примеры</th></tr></thead><tbody>${rows}</tbody></table>`
    + `<p class="hint">Последняя зарядка: ${state.lastDay ? esc(formatPlanDate(state.lastDay)) : "ещё не было"}.</p>`;
}

/* ================= ЗАДАЧА НА СМЕКАЛКУ ================= */
const PUZZLE_KEY = "study_puzzle_v1";
const PUZZLES = [
  ["Продолжи ряд: 2, 4, 6, 8, …", "10", "9", "12", "Каждое число на 2 больше прежнего."],
  ["Что лишнее: яблоко, груша, морковь, слива?", "морковь", "слива", "груша", "Морковь — овощ, а остальное — фрукты."],
  ["У Маши 3 сестры. Сколько всего девочек в семье?", "4", "3", "2", "Три сестры и сама Маша: 3 + 1 = 4."],
  ["Продолжи ряд: 1, 3, 5, 7, …", "9", "8", "10", "Каждое число на 2 больше прежнего."],
  ["Петя выше Коли, а Коля выше Саши. Кто самый низкий?", "Саша", "Коля", "Петя", "Петя выше Коли, Коля выше Саши. Значит, Саша ниже всех."],
  ["У стола 4 угла. Один угол отпилили. Сколько углов стало?", "5", "3", "4", "На месте одного угла появилось два новых: 4 − 1 + 2 = 5."],
  ["Продолжи ряд: 10, 20, 30, …", "40", "31", "50", "Считаем десятками."],
  ["Сколько концов у двух палок?", "4", "2", "3", "У каждой палки 2 конца. 2 + 2 = 4."],
  ["Что тяжелее: килограмм ваты или килограмм железа?", "одинаково", "железо", "вата", "И там и там ровно один килограмм."],
  ["Продолжи ряд: 20, 18, 16, 14, …", "12", "13", "10", "Каждое число на 2 меньше прежнего."],
  ["На дереве сидели 5 птиц. 2 улетели, потом 1 прилетела. Сколько птиц на дереве?", "4", "3", "6", "5 − 2 = 3. Потом 3 + 1 = 4."],
  ["Что лишнее: круг, квадрат, треугольник, красный?", "красный", "круг", "треугольник", "Красный — это цвет, а остальное — фигуры."],
  ["Какое число пропущено: 3, 6, 9, …, 15?", "12", "10", "11", "Каждое число на 3 больше прежнего."],
  ["Аня старше Веры на 2 года. Вере 7 лет. Сколько лет Ане?", "9", "5", "7", "Старше — значит, лет больше: 7 + 2 = 9."],
  ["Сколько лап у трёх кошек?", "12", "6", "8", "У одной кошки 4 лапы. 4 + 4 + 4 = 12."],
  ["Какой день идёт после вторника?", "среда", "понедельник", "четверг", "Понедельник, вторник, среда."],
  ["Продолжи ряд: А, Б, А, Б, А, …", "Б", "А", "В", "Буквы идут по очереди: А, потом Б."],
  ["У квадрата 4 стороны. Сколько сторон у двух квадратов?", "8", "4", "6", "4 + 4 = 8."],
  ["В вазе 6 конфет. Две сестры поделили их поровну. Сколько у каждой?", "3", "2", "4", "3 + 3 = 6. У каждой по 3."],
  ["Что лишнее: 2, 4, 7, 8?", "7", "2", "8", "2, 4 и 8 — чётные числа. 7 — нечётное."],
  ["Продолжи ряд: 1, 2, 4, 8, …", "16", "10", "12", "Каждое число в 2 раза больше прежнего: 8 + 8 = 16."],
  ["Мама положила на стол 4 ложки и столько же вилок. Сколько всего предметов?", "8", "4", "6", "Вилок тоже 4. 4 + 4 = 8."],
  ["Кот легче собаки, собака легче коровы. Кто самый тяжёлый?", "корова", "собака", "кот", "Корова тяжелее собаки, а собака тяжелее кота."],
  ["Сегодня среда. Какой день был вчера?", "вторник", "четверг", "понедельник", "Перед средой идёт вторник."],
  ["Сколько раз нужно разрезать верёвку, чтобы получилось 3 куска?", "2", "3", "1", "Один разрез — 2 куска. Второй разрез — 3 куска."],
  ["Какое число пропущено: 5, 10, …, 20, 25?", "15", "12", "11", "Считаем пятёрками: 5, 10, 15, 20, 25."],
  ["У Оли было 10 рублей. Она купила булочку за 6 рублей. Сколько осталось?", "4", "6", "16", "10 − 6 = 4."],
  ["Что лишнее: стол, стул, шкаф, чашка?", "чашка", "стул", "шкаф", "Чашка — посуда, а остальное — мебель."],
  ["В комнате 4 угла. В каждом углу сидит одна кошка. Сколько кошек в комнате?", "4", "8", "16", "В каждом из 4 углов по одной кошке."],
  ["Продолжи ряд: 1, 4, 7, 10, …", "13", "11", "12", "Каждое число на 3 больше прежнего."],
  ["У брата 5 конфет, у сестры на 2 меньше. Сколько конфет у сестры?", "3", "7", "5", "Меньше — значит, вычитаем: 5 − 2 = 3."],
  ["Сколько месяцев в году?", "12", "10", "7", "В году 12 месяцев: от января до декабря."],
];

function readPuzzle() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PUZZLE_KEY) || "{}");
    return { index: Number(parsed.index) || 0, lastDay: parsed.lastDay || "", solved: Number(parsed.solved) || 0 };
  } catch (e) {
    return { index: 0, lastDay: "", solved: 0 };
  }
}

function puzzleOffer() {
  if (readPuzzle().lastDay === todayISO()) return "";
  return '<button type="button" class="grade3-offer" onclick="openPuzzle()"><span>Если хочется ещё</span>Задача на смекалку</button>';
}

function openPuzzle() {
  const state = readPuzzle();
  const puzzle = PUZZLES[state.index % PUZZLES.length];
  showExtraView("Задача на смекалку", "Одна задача в день. Подумай, можно порисовать на листочке.");
  const order = fisherYates([1, 2, 3]);
  const options = order.map((slot) => (
    `<button type="button" class="option" data-right="${slot === 1 ? "1" : "0"}" onclick="answerPuzzle(this)"><span>${esc(puzzle[slot])}</span></button>`
  )).join("");
  document.getElementById("extra-body").innerHTML = `
    <div class="question scout-question"><p>${esc(puzzle[0])}</p><div class="options">${options}</div></div>
    <p id="practice-like" class="puzzle-why hidden"></p>
    <button id="puzzle-done" class="action-btn hidden" type="button" onclick="showSubjects()">На главную</button>`;
}

function answerPuzzle(button) {
  const state = readPuzzle();
  const puzzle = PUZZLES[state.index % PUZZLES.length];
  const right = button.getAttribute("data-right") === "1";
  document.querySelectorAll("#extra-body .option").forEach((option) => {
    option.disabled = true;
    if (option.getAttribute("data-right") === "1") option.classList.add("correct");
    else if (option === button) option.classList.add("wrong");
  });
  const why = document.getElementById("practice-like");
  why.textContent = (right ? "Верно! " : "Почти. ") + puzzle[4];
  why.classList.remove("hidden");
  document.getElementById("puzzle-done").classList.remove("hidden");
  try {
    localStorage.setItem(PUZZLE_KEY, JSON.stringify({ index: state.index + 1, lastDay: todayISO(), solved: state.solved + (right ? 1 : 0) }));
  } catch (e) {
    /* задача всё равно показана */
  }
}
