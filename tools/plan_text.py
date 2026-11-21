"""Пишет весь график в «План 2 класс.txt» для мамы: по неделям и дням.

Запуск из папки сайта после build_plan.py:  python3 tools/plan_text.py
"""
import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября",
          "октября", "ноября", "декабря"]
WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница"]

INTRO = """ПЛАН ЗАНЯТИЙ: 2 КЛАСС (по ФГОС)
С 23 ноября 2026 по 28 мая 2027

Уроки в неделю — как в школе по федеральному учебному плану (вариант с родным языком), всего 23:
русский язык 5, математика 4, литературное чтение 3, английский 2, окружающий мир 2,
саха тыла и чтение на саха тыла 2, ИЗО 1, музыка 1, труд 1, физкультура 2.

Как устроен день
• Сначала зарядка «Счёт в уме» на сайте, около 5 минут.
• Потом 4–5 уроков по 20–30 минут, между ними перемены. Сначала трудные предметы, в конце — ИЗО, музыка, труд, физкультура.
• «Сайт + учебник»: сначала урок на сайте, потом страницы электронного учебника на LECTA (media.prosv.ru, войти под нашим аккаунтом).
• «Только учебник»: урока на сайте нет, только страницы учебника.
• После учебника — домашнее задание в тетради (написано под уроком). Мама проверяет, потом дочка нажимает «Готово».
• Саха тыла — по учебнику Петровой и Игнатьевой, по порядку; темы ниже подсказывают, на что обратить внимание.
• ИЗО, музыка, труд, физкультура — занятия с мамой без учебника, задание написано под уроком.
• В понедельник — короткий повтор старой темы на сайте (10 минут).
• Не успели — переносится на следующий день.

Учебники: математика — Моро; русский язык — Канакина; литературное чтение — Климанова;
окружающий мир — Плешаков; английский — Spotlight 2 («Английский в фокусе»); саха тыла — Петрова, Игнатьева.
Все — часть 1 до Нового года, часть 2 с января.

1 четверть пройдена в школе. До Нового года — 2 четверть, с 11 января — 3 и 4 четверти.
«Проверим себя» в учебнике — это маленькая контрольная: дочка решает сама, мама потом проверяет.
Каникулы и выходные: 31 декабря – 8 января, 23 февраля, 8 марта, 29 марта – 2 апреля, 3 и 10 мая.
Подробные подсказки к каждому уроку — на сайте, страница «Шпаргалка для мамы».
В начале каждой недели — «Связь предметов» и практика из жизни."""


def day_str(d):
    return f"{d.day} {MONTHS[d.month - 1]}"


def pages(b):
    return f"ч. {b['part']}, " + (f"с. {b['from']}" if b["from"] == b["to"] else f"с. {b['from']}–{b['to']}")


def main():
    data = json.loads((ROOT / "data.json").read_text(encoding="utf-8"))
    titles = {l["id"]: l["title"] for s in data["subjects"] for l in s["lessons"]}
    practice = {w["week"]: w for w in data.get("practice", [])}
    by_date = {}
    for x in data["plan"]["days"]:
        by_date.setdefault(x["date"], []).append(x)
    out = [INTRO]
    start, end = dt.date(2026, 11, 23), dt.date(2027, 5, 28)
    monday, week = start, 1
    while monday <= end:
        out += ["", "=" * 44, f"НЕДЕЛЯ {week}: {day_str(monday)} – {day_str(monday + dt.timedelta(days=4))}", "=" * 44]
        w = practice.get(monday.isoformat())
        if w:
            out += ["", "Связь предметов: " + w["link"], "Практика из жизни (для тьютора):"]
            out += [f"  {k}) {t['title']} ({t['subjects']}). {t['do']} Итог: {t['result']}" for k, t in enumerate(w["tasks"], 1)]
        for i in range(5):
            d = monday + dt.timedelta(days=i)
            items = by_date.get(d.isoformat(), [])
            if not items:
                continue
            head = f"{WEEKDAYS[i]}, {day_str(d)}"
            out.append("")
            if all(x["kind"] == "rest" for x in items):
                out.append(f"{head} — выходной ({items[0]['title']})")
                continue
            out.append(head)
            n = 0
            for x in items:
                if x["kind"] == "rest":
                    continue
                n += 1
                if x["kind"] == "return":
                    out.append(f"  {n}. Повтор (10 минут): {x['subject']} — «{x['title']}» на сайте.")
                    continue
                if x["kind"] == "mama":
                    out.append(f"  {n}. {x['title']}. {x.get('text', '')}")
                    continue
                if not x.get("book"):
                    out.append(f"  {n}. {x['subject']} — {x['title']}. {x.get('text', '')}")
                    continue
                site = titles.get(x.get("lessonId", ""), "")
                if x["kind"] == "lesson":
                    extra = f" Урок сайта: «{site}»." if site and site.strip(".") != x["title"].strip(".") else ""
                    line = f"  {n}. {x['subject']} — {x['title']}. Сайт + учебник, {pages(x['book'])}.{extra}"
                else:
                    line = f"  {n}. {x['subject']} — {x['title']}. Только учебник, {pages(x['book'])}."
                out.append(line.replace("..", "."))
                if x.get("homework"):
                    out.append("     Домашнее: " + x["homework"])
        monday += dt.timedelta(days=7)
        week += 1
    (ROOT / "План 2 класс.txt").write_text("\n".join(out) + "\n", encoding="utf-8")
    print("Недель:", week - 1)


if __name__ == "__main__":
    main()
