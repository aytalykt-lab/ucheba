"""Собирает учебный график по учебникам «Школы России» и Spotlight 2.

Запуск из папки сайта:  python3 tools/build_plan.py
Скрипт переписывает поле plan и books в data.json и копию в data.js.

Страницы взяты из электронных учебников на LECTA (издания 2019 года),
которые открываются по кнопке «Учебник» на сайте.
"""
import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

START = dt.date(2026, 11, 23)
END = dt.date(2027, 5, 28)
HOLIDAYS = {
    "Зимние каникулы": (dt.date(2026, 12, 31), dt.date(2027, 1, 8)),
    "День защитника Отечества": (dt.date(2027, 2, 23), dt.date(2027, 2, 23)),
    "8 Марта": (dt.date(2027, 3, 8), dt.date(2027, 3, 8)),
    "Весенние каникулы": (dt.date(2027, 3, 29), dt.date(2027, 4, 2)),
    "Праздник весны": (dt.date(2027, 5, 3), dt.date(2027, 5, 3)),
    "День Победы": (dt.date(2027, 5, 10), dt.date(2027, 5, 10)),
}
# Четыре урока в день, порядок предметов по дням недели (пн = 0).
WEEK = {
    0: ["math", "russian", "reading", "english"],
    1: ["math", "russian", "reading", "world"],
    2: ["math", "russian", "world", "sakha"],
    3: ["math", "russian", "reading", "english"],
    4: ["world", "reading", "sakha", "return"],
}
NAMES = {
    "math": "Математика", "russian": "Русский язык", "reading": "Литературное чтение",
    "world": "Окружающий мир", "english": "Английский язык", "sakha": "Саха тыла",
}

VIEWER = "https://media.prosv.ru/static/books-viewer/index.html?path=/media/ebook/{}/"
BOOKS = {
    "math-1": ("Математика. Моро", 1, 342322, 95),
    "math-2": ("Математика. Моро", 2, 342326, 111),
    "russian-1": ("Русский язык. Канакина", 1, 342698, 129),
    "russian-2": ("Русский язык. Канакина", 2, 342700, 129),
    "reading-1": ("Литературное чтение. Климанова", 1, 342748, 152),
    "reading-2": ("Литературное чтение. Климанова", 2, 342754, 153),
    "world-1": ("Окружающий мир. Плешаков", 1, 342361, 141),
    "world-2": ("Окружающий мир. Плешаков", 2, 342363, 141),
    "english-1": ("Английский в фокусе (Spotlight 2)", 1, 322061, 64),
    "english-2": ("Английский в фокусе (Spotlight 2)", 2, 322704, 67),
}

# (книга, первая страница, тема). Конец темы — страница перед следующей.
TOC = {
    "math": [
        ("math-1", 4, "Числа от 1 до 20 (повторение)"),
        ("math-1", 6, "Десяток. Счёт десятками до 100"),
        ("math-1", 8, "Числа от 11 до 100"),
        ("math-1", 9, "Однозначные и двузначные числа"),
        ("math-1", 10, "Миллиметр"),
        ("math-1", 12, "Число 100"),
        ("math-1", 13, "Метр"),
        ("math-1", 14, "Сложение и вычитание вида 30 + 5, 35 – 5, 35 – 30"),
        ("math-1", 16, "Рубль. Копейка"),
        ("math-1", 18, "Странички для любознательных"),
        ("math-1", 20, "Что узнали. Чему научились"),
        ("math-1", 22, "Проверим себя"),
        ("math-1", 24, "Странички для любознательных"),
        ("math-1", 26, "Задачи, обратные данной"),
        ("math-1", 28, "Краткая запись задачи, схематический чертёж"),
        ("math-1", 31, "Час. Минута"),
        ("math-1", 32, "Длина ломаной"),
        ("math-1", 36, "Странички для любознательных"),
        ("math-1", 38, "Порядок выполнения действий. Скобки"),
        ("math-1", 40, "Числовые выражения"),
        ("math-1", 41, "Сравнение числовых выражений"),
        ("math-1", 42, "Периметр многоугольника"),
        ("math-1", 44, "Свойства сложения"),
        ("math-1", 48, "Наши проекты"),
        ("math-1", 50, "Странички для любознательных"),
        ("math-1", 52, "Что узнали. Чему научились"),
        ("math-1", 57, "Устные вычисления"),
        ("math-1", 58, "Вычисления вида 36 + 2, 36 + 20"),
        ("math-1", 59, "Вычисления вида 36 – 2, 36 – 20"),
        ("math-1", 60, "Вычисления вида 26 + 4"),
        ("math-1", 61, "Вычисления вида 30 – 7"),
        ("math-1", 62, "Вычисления вида 60 – 24"),
        ("math-1", 63, "Запись решения задачи выражением"),
        ("math-1", 66, "Вычисления вида 26 + 7"),
        ("math-1", 67, "Вычисления вида 35 – 7"),
        ("math-1", 70, "Странички для любознательных"),
        ("math-1", 72, "Что узнали. Чему научились"),
        ("math-1", 76, "Буквенные выражения"),
        ("math-1", 80, "Уравнение"),
        ("math-1", 84, "Проверка сложения"),
        ("math-1", 86, "Проверка вычитания"),
        ("math-1", 88, "Решение задач"),
        ("math-1", 90, "Что узнали. Чему научились"),
        ("math-1", 94, "Проверим себя"),
        ("math-2", 4, "Письменное сложение вида 45 + 23"),
        ("math-2", 5, "Письменное вычитание вида 57 – 26"),
        ("math-2", 6, "Проверка сложения и вычитания"),
        ("math-2", 8, "Угол. Виды углов"),
        ("math-2", 10, "Решение задач"),
        ("math-2", 12, "Письменное сложение вида 37 + 48"),
        ("math-2", 13, "Письменное сложение вида 37 + 53"),
        ("math-2", 16, "Письменное сложение вида 87 + 13"),
        ("math-2", 17, "Решение задач"),
        ("math-2", 18, "Сложение вида 32 + 8, вычитание вида 40 – 8"),
        ("math-2", 19, "Письменное вычитание вида 50 – 24"),
        ("math-2", 20, "Странички для любознательных"),
        ("math-2", 22, "Что узнали. Чему научились"),
        ("math-2", 28, "Странички для любознательных"),
        ("math-2", 29, "Письменное вычитание вида 52 – 24"),
        ("math-2", 30, "Сумма одинаковых слагаемых"),
        ("math-2", 32, "Противоположные стороны прямоугольника"),
        ("math-2", 36, "Наши проекты"),
        ("math-2", 38, "Странички для любознательных"),
        ("math-2", 40, "Что узнали. Чему научились"),
        ("math-2", 46, "Странички для любознательных"),
        ("math-2", 48, "Умножение"),
        ("math-2", 52, "Периметр прямоугольника"),
        ("math-2", 53, "Умножение единицы и нуля"),
        ("math-2", 54, "Названия чисел при умножении"),
        ("math-2", 56, "Переместительное свойство умножения"),
        ("math-2", 58, "Деление"),
        ("math-2", 62, "Названия чисел при делении"),
        ("math-2", 63, "Что узнали. Чему научились"),
        ("math-2", 64, "Странички для любознательных"),
        ("math-2", 66, "Что узнали. Чему научились"),
        ("math-2", 71, "Странички для любознательных"),
        ("math-2", 72, "Связь множителей и произведения"),
        ("math-2", 74, "Умножение и деление на 10"),
        ("math-2", 76, "Решение задач"),
        ("math-2", 78, "Проверим себя"),
        ("math-2", 80, "Умножение числа 2. Умножение на 2"),
        ("math-2", 83, "Деление на 2"),
        ("math-2", 86, "Странички для любознательных"),
        ("math-2", 88, "Что узнали. Чему научились"),
        ("math-2", 90, "Умножение числа 3. Умножение на 3"),
        ("math-2", 92, "Деление на 3"),
        ("math-2", 95, "Странички для любознательных"),
        ("math-2", 96, "Что узнали. Чему научились"),
        ("math-2", 100, "Проверим себя"),
        ("math-2", 102, "Что узнали во 2 классе"),
        ("math-2", 110, "Годовая проверка"),
    ],
    "russian": [
        ("russian-1", 6, "Виды речи"),
        ("russian-1", 10, "Диалог и монолог"),
        ("russian-1", 16, "Текст"),
        ("russian-1", 20, "Части текста"),
        ("russian-1", 24, "Предложение"),
        ("russian-1", 29, "Члены предложения"),
        ("russian-1", 42, "Слово и его значение"),
        ("russian-1", 52, "Синонимы и антонимы"),
        ("russian-1", 58, "Однокоренные слова"),
        ("russian-1", 65, "Слог. Ударение. Перенос слова"),
        ("russian-1", 78, "Звуки и буквы"),
        ("russian-1", 81, "Русский алфавит"),
        ("russian-1", 89, "Гласные звуки"),
        ("russian-1", 112, "Согласные звуки"),
        ("russian-1", 119, "Проект «И в шутку и всерьёз»"),
        ("russian-1", 124, "Мягкий знак"),
        ("russian-1", 129, "Проект «Пишем письмо»"),
        ("russian-2", 4, "Буквосочетания с шипящими"),
        ("russian-2", 16, "Звонкие и глухие согласные"),
        ("russian-2", 31, "Разделительный мягкий знак"),
        ("russian-2", 40, "Части речи"),
        ("russian-2", 44, "Имя существительное"),
        ("russian-2", 68, "Глагол"),
        ("russian-2", 86, "Имя прилагательное"),
        ("russian-2", 100, "Местоимение"),
        ("russian-2", 108, "Предлоги"),
        ("russian-2", 114, "Проект «В словари — за частями речи»"),
        ("russian-2", 116, "Повторение"),
    ],
    "reading": [
        ("reading-1", 3, "Самое великое чудо на свете. Как рассказать о книге"),
        ("reading-1", 6, "История книги. Библиотека"),
        ("reading-1", 9, "Наши проекты. Проверим себя"),
        ("reading-1", 11, "Устное народное творчество. В мире книг"),
        ("reading-1", 14, "Шибаев «Вспомни сказку»"),
        ("reading-1", 16, "Пословицы и поговорки"),
        ("reading-1", 18, "Русские народные песни"),
        ("reading-1", 20, "Потешки и прибаутки"),
        ("reading-1", 22, "Считалки и небылицы"),
        ("reading-1", 24, "Загадки"),
        ("reading-1", 26, "Ю. Коваль «Сказки»"),
        ("reading-1", 28, "«Петушок и бобовое зёрнышко»"),
        ("reading-1", 31, "«У страха глаза велики»"),
        ("reading-1", 34, "«Лиса и тетерев»"),
        ("reading-1", 37, "«Каша из топора»"),
        ("reading-1", 40, "«Лиса и журавль»"),
        ("reading-1", 42, "«Гуси-лебеди»"),
        ("reading-1", 46, "Проверим себя"),
        ("reading-1", 53, "Осень. Как читать выразительно"),
        ("reading-1", 56, "В. Волина, Г. Сапгир"),
        ("reading-1", 58, "Ф. Тютчев, К. Бальмонт"),
        ("reading-1", 60, "А. Плещеев, А. Фет"),
        ("reading-1", 62, "Осенние листья: А. Толстой, С. Есенин"),
        ("reading-1", 64, "В. Брюсов, И. Токмакова"),
        ("reading-1", 66, "В. Берестов «Хитрые грибы». «Грибы»"),
        ("reading-1", 68, "«Блокадный хлеб». М. Пришвин «Осеннее утро»"),
        ("reading-1", 70, "Проверим себя"),
        ("reading-1", 71, "Русские писатели. Как составить план"),
        ("reading-1", 74, "И. Токмакова, Ю. Могутин"),
        ("reading-1", 76, "А. С. Пушкин «У лукоморья дуб зелёный…»"),
        ("reading-1", 79, "А. С. Пушкин «Сказка о рыбаке и рыбке»"),
        ("reading-1", 88, "И. А. Крылов"),
        ("reading-1", 90, "И. Крылов «Лебедь, Щука и Рак»"),
        ("reading-1", 92, "И. Крылов «Стрекоза и Муравей»"),
        ("reading-1", 94, "Л. Н. Толстой. «Котёнок»"),
        ("reading-1", 98, "Л. Толстой «Правда всего дороже»"),
        ("reading-1", 99, "Л. Толстой «Филипок»"),
        ("reading-1", 103, "Проверим себя"),
        ("reading-1", 105, "О братьях наших меньших. Как составить отзыв"),
        ("reading-1", 108, "С. Брезкун, М. Бородицкая"),
        ("reading-1", 110, "И. Пивоварова, В. Берестов «Кошкин щенок»"),
        ("reading-1", 112, "Как придумать рассказ"),
        ("reading-1", 113, "М. Пришвин «Ребята и утята»"),
        ("reading-1", 117, "Е. Чарушин «Страшный рассказ»"),
        ("reading-1", 120, "Б. Житков «Храбрый утёнок»"),
        ("reading-1", 122, "В. Бианки «Музыкант»"),
        ("reading-1", 125, "В. Бианки «Сова»"),
        ("reading-1", 129, "Е. Благинина «Мороз». Проверим себя"),
        ("reading-1", 133, "Зима. Как выучить стихотворение наизусть"),
        ("reading-1", 136, "С. Погореловский, А. Прокофьев"),
        ("reading-1", 138, "Первый снег: И. Бунин, К. Бальмонт, Я. Аким"),
        ("reading-1", 141, "Ф. Тютчев, С. Есенин «Поёт зима — аукает…»"),
        ("reading-1", 143, "С. Есенин «Берёза»"),
        ("reading-1", 144, "А. С. Пушкин о зиме"),
        ("reading-1", 146, "«Два мороза»"),
        ("reading-1", 149, "С. Михалков «Новогодняя быль». Проверим себя"),
        ("reading-2", 3, "Писатели — детям. Как рассказать о писателе"),
        ("reading-2", 8, "К. Чуковский «Путаница»"),
        ("reading-2", 13, "К. Чуковский «Радость»"),
        ("reading-2", 15, "К. Чуковский «Федорино горе»"),
        ("reading-2", 21, "Как читать по ролям"),
        ("reading-2", 23, "С. Михалков «Сила воли», «Мой щенок»"),
        ("reading-2", 28, "А. Барто «Верёвочка»"),
        ("reading-2", 32, "А. Барто «Мы не заметили жука», «Вовка — добрая душа»"),
        ("reading-2", 34, "Н. Носов «Затейники»"),
        ("reading-2", 38, "Н. Носов «Живая шляпа»"),
        ("reading-2", 42, "В. Осеева «Синие листья»"),
        ("reading-2", 43, "Н. Носов «На горке»"),
        ("reading-2", 47, "Проверим себя"),
        ("reading-2", 49, "Я и мои друзья. Е. Благинина, В. Орлов"),
        ("reading-2", 54, "Ю. Ермолаев «Два пирожных»"),
        ("reading-2", 55, "В. Осеева «Волшебное слово»"),
        ("reading-2", 60, "В. Осеева «Хорошее»"),
        ("reading-2", 63, "В. Лунин, Э. Мошковская, В. Берестов"),
        ("reading-2", 66, "В. Осеева «Почему?»"),
        ("reading-2", 72, "Проверим себя"),
        ("reading-2", 73, "Весна. И. Пивоварова"),
        ("reading-2", 78, "Ф. Тютчев о весне"),
        ("reading-2", 80, "А. Плещеев, С. Дрожжин, А. Блок"),
        ("reading-2", 82, "Женский день: А. Плещеев «В бурю»"),
        ("reading-2", 84, "И. Бунин «Матери», Е. Благинина"),
        ("reading-2", 86, "Э. Мошковская «Я маму мою обидел…»"),
        ("reading-2", 88, "С. Васильев «Белая берёза». Проект. Проверим себя"),
        ("reading-2", 91, "И в шутку и всерьёз. В мире книг"),
        ("reading-2", 94, "Ю. Тувим «Про пана Трулялинского»"),
        ("reading-2", 97, "А. Введенский «Учёный Петя»"),
        ("reading-2", 100, "Д. Хармс «Вы знаете?..»"),
        ("reading-2", 104, "И. Токмакова «Плим», «В чудной стране»"),
        ("reading-2", 107, "Б. Заходер «Песенки Винни-Пуха»"),
        ("reading-2", 109, "Э. Успенский: стихи"),
        ("reading-2", 113, "Э. Успенский «Чебурашка»"),
        ("reading-2", 117, "В. Драгунский «Тайное становится явным»"),
        ("reading-2", 122, "Г. Остер «Будем знакомы»"),
        ("reading-2", 126, "Проверим себя"),
        ("reading-2", 127, "Литература зарубежных стран. Песенки"),
        ("reading-2", 132, "«Перчатки», «Храбрецы»"),
        ("reading-2", 134, "Ш. Перро «Кот в сапогах»"),
        ("reading-2", 144, "Е. Шварц «Красная Шапочка»"),
        ("reading-2", 146, "Г. Х. Андерсен «Огниво»"),
        ("reading-2", 150, "«Сюзон и мотылёк», «Знают мамы, знают дети»"),
        ("reading-2", 152, "Проверим себя"),
    ],
    "world": [
        ("world-1", 3, "Как работать с учебником"),
        ("world-1", 6, "Родная страна"),
        ("world-1", 10, "Город и село"),
        ("world-1", 14, "Природа и предметы, созданные человеком"),
        ("world-1", 18, "Природа в опасности!"),
        ("world-1", 22, "Проект «Родной город». Чтобы не исчезли леопарды"),
        ("world-1", 26, "Проверим себя"),
        ("world-1", 32, "Неживая и живая природа"),
        ("world-1", 36, "Явления природы"),
        ("world-1", 40, "Что такое погода"),
        ("world-1", 44, "В гости к осени"),
        ("world-1", 48, "Звёздное небо"),
        ("world-1", 52, "Заглянем в кладовые Земли"),
        ("world-1", 56, "Про воздух"),
        ("world-1", 60, "…И про воду"),
        ("world-1", 64, "Какие бывают растения"),
        ("world-1", 68, "Какие бывают животные"),
        ("world-1", 72, "Невидимые нити"),
        ("world-1", 74, "Дикорастущие и культурные растения"),
        ("world-1", 78, "Дикие и домашние животные"),
        ("world-1", 82, "Комнатные растения"),
        ("world-1", 86, "Про кошек и собак"),
        ("world-1", 90, "Красная книга"),
        ("world-1", 94, "Будь природе другом!"),
        ("world-1", 98, "Проект «Красная книга». Легенды о растениях и животных"),
        ("world-1", 102, "Проверим себя"),
        ("world-1", 108, "Что такое экономика"),
        ("world-1", 112, "Из чего что сделано"),
        ("world-1", 116, "Как построить дом"),
        ("world-1", 120, "Какой бывает транспорт"),
        ("world-1", 122, "Все профессии важны"),
        ("world-1", 126, "В гости к зиме"),
        ("world-1", 130, "Проект «Профессии». Какие бывают музеи"),
        ("world-1", 134, "Проверим себя"),
        ("world-2", 4, "Строение тела человека"),
        ("world-2", 8, "Если хочешь быть здоров"),
        ("world-2", 12, "Берегись автомобиля!"),
        ("world-2", 16, "Домашние опасности"),
        ("world-2", 20, "Пожар!"),
        ("world-2", 24, "На воде и в лесу"),
        ("world-2", 28, "Опасные незнакомцы"),
        ("world-2", 32, "Проект о лесных опасностях. Олимпийские игры"),
        ("world-2", 36, "Проверим себя"),
        ("world-2", 42, "Наша дружная семья"),
        ("world-2", 46, "В школе"),
        ("world-2", 48, "Правила вежливости"),
        ("world-2", 52, "Ты и твои друзья"),
        ("world-2", 56, "Мы — зрители и пассажиры"),
        ("world-2", 60, "Проект «Родословная». Что такое этикет"),
        ("world-2", 64, "Проверим себя"),
        ("world-2", 70, "Посмотри вокруг"),
        ("world-2", 74, "Ориентирование на местности"),
        ("world-2", 78, "Формы земной поверхности"),
        ("world-2", 82, "Водные богатства"),
        ("world-2", 86, "В гости к весне"),
        ("world-2", 90, "Россия на карте"),
        ("world-2", 96, "Путешествие по Москве"),
        ("world-2", 100, "Московский Кремль и Красная площадь"),
        ("world-2", 106, "Город на Неве"),
        ("world-2", 110, "Земля на карте"),
        ("world-2", 114, "Материки и части света"),
        ("world-2", 120, "Страны мира"),
        ("world-2", 124, "Впереди лето"),
        ("world-2", 128, "Проекты «Города России», «Страны мира»"),
        ("world-2", 134, "Проверим себя"),
    ],
    "english": [
        ("english-1", 4, "Let's Go!"),
        ("english-1", 6, "My Letters! (a)"),
        ("english-1", 8, "My Letters! (b)"),
        ("english-1", 10, "My Letters! (c)"),
        ("english-1", 12, "Letter Blends (d)"),
        ("english-1", 14, "Letter Blends (e)"),
        ("english-1", 16, "Big and Small! (f)"),
        ("english-1", 18, "Hello! (a)"),
        ("english-1", 20, "Hello! (b)"),
        ("english-1", 22, "My Family! (a)"),
        ("english-1", 24, "My Family! (b)"),
        ("english-1", 26, "My Home (1a)"),
        ("english-1", 28, "My Home (1b)"),
        ("english-1", 30, "Where's Chuckles? (2a)"),
        ("english-1", 32, "Where's Chuckles? (2b)"),
        ("english-1", 34, "In the Bath! (3a)"),
        ("english-1", 36, "In the Bath! (3b)"),
        ("english-1", 38, "Portfolio, Fun at School"),
        ("english-1", 42, "Now I Know (Module 1)"),
        ("english-1", 44, "My Birthday! (4a)"),
        ("english-1", 46, "My Birthday! (4b)"),
        ("english-1", 48, "Yummy Chocolate! (5a)"),
        ("english-1", 50, "Yummy Chocolate! (5b)"),
        ("english-1", 52, "Favourite Food! (6a)"),
        ("english-1", 54, "Favourite Food! (6b)"),
        ("english-1", 56, "Portfolio, Fun at School"),
        ("english-1", 60, "Now I Know (Module 2)"),
        ("english-2", 4, "My Animals! (7a)"),
        ("english-2", 6, "My Animals! (7b)"),
        ("english-2", 8, "I Can Jump! (8a)"),
        ("english-2", 10, "I Can Jump! (8b)"),
        ("english-2", 12, "At the Circus! (9a)"),
        ("english-2", 14, "At the Circus! (9b)"),
        ("english-2", 16, "Portfolio, Fun at School"),
        ("english-2", 20, "Now I Know (Module 3)"),
        ("english-2", 22, "My Toys! (10a)"),
        ("english-2", 24, "My Toys! (10b)"),
        ("english-2", 26, "She's Got Blue Eyes! (11a)"),
        ("english-2", 28, "She's Got Blue Eyes! (11b)"),
        ("english-2", 30, "Teddy's Wonderful! (12a)"),
        ("english-2", 32, "Teddy's Wonderful! (12b)"),
        ("english-2", 34, "Portfolio, Fun at School"),
        ("english-2", 38, "Now I Know (Module 4)"),
        ("english-2", 40, "My Holidays! (13a)"),
        ("english-2", 42, "My Holidays! (13b)"),
        ("english-2", 44, "It's Windy! (14a)"),
        ("english-2", 46, "It's Windy! (14b)"),
        ("english-2", 48, "A Magic Island! (15a)"),
        ("english-2", 50, "A Magic Island! (15b)"),
        ("english-2", 52, "Portfolio, Fun at School"),
        ("english-2", 56, "Now I Know (Module 5)"),
        ("english-2", 64, "Showtime!"),
    ],
}

# Урок сайта, который проходится перед страницами учебника: (книга, страница) → id урока.
SITE = {
    "math": {
        ("math-1", 6): "math-01", ("math-1", 8): "math-f-compare", ("math-1", 10): "math-08",
        ("math-1", 13): "math-f-length", ("math-1", 14): "math-02", ("math-1", 26): "math-03",
        ("math-1", 31): "math-f-time", ("math-1", 32): "math-09", ("math-1", 38): "math-f-order",
        ("math-1", 42): "math-f-perim", ("math-1", 63): "math-f-two", ("math-1", 66): "math-04",
        ("math-1", 76): "math-06", ("math-1", 80): "math-07", ("math-1", 84): "math-05",
        ("math-1", 90): "math-12", ("math-2", 4): "math-10", ("math-2", 8): "math-f-angle",
        ("math-2", 48): "math-11", ("math-2", 58): "math-f-div", ("math-2", 72): "math-f-link",
        ("math-2", 80): "math-f-x2", ("math-2", 90): "math-f-x3", ("math-2", 102): "math-13",
        ("math-2", 110): "math-f-exam",
        # Уроки из tools/lessons_math.py
        ("math-1", 4): "math-b-1to20", ("math-1", 9): "math-b-digits", ("math-1", 12): "math-b-100",
        ("math-1", 16): "math-b-money", ("math-1", 28): "math-b-short", ("math-1", 40): "math-b-expr",
        ("math-1", 41): "math-b-cmpexpr", ("math-1", 44): "math-b-props",
        ("math-1", 57): "math-b-oral", ("math-1", 58): "math-b-36p2", ("math-1", 59): "math-b-36m2",
        ("math-1", 60): "math-b-26p4", ("math-1", 61): "math-b-30m7", ("math-1", 62): "math-b-60m24",
        ("math-1", 67): "math-b-35m7", ("math-1", 86): "math-b-checksub", ("math-1", 88): "math-b-tasks2",
        ("math-2", 5): "math-b-57m26", ("math-2", 6): "math-b-check2", ("math-2", 10): "math-b-tasks3",
        ("math-2", 12): "math-b-37p48", ("math-2", 13): "math-b-37p53", ("math-2", 16): "math-b-87p13",
        ("math-2", 17): "math-b-tasks4", ("math-2", 18): "math-b-32p8", ("math-2", 19): "math-b-50m24",
        ("math-2", 29): "math-b-52m24", ("math-2", 30): "math-b-samesum", ("math-2", 32): "math-b-rectsides",
        ("math-2", 52): "math-b-perimrect", ("math-2", 53): "math-b-x10", ("math-2", 54): "math-b-mulnames",
        ("math-2", 56): "math-b-commut", ("math-2", 62): "math-b-divnames", ("math-2", 74): "math-b-x10div",
        ("math-2", 76): "math-b-tasks5", ("math-2", 83): "math-b-div2", ("math-2", 92): "math-b-div3",
    },
    "russian": {
        ("russian-1", 16): "rus-f-text", ("russian-1", 24): "rus-01", ("russian-1", 26): "rus-f-sent",
        ("russian-1", 58): "rus-07", ("russian-1", 65): "rus-f-syll", ("russian-1", 89): "rus-f-letters",
        ("russian-1", 95): "rus-02", ("russian-1", 105): "rus-f-dict", ("russian-1", 124): "rus-04",
        ("russian-2", 4): "rus-f-chk", ("russian-2", 6): "rus-f-zhi", ("russian-2", 8): "rus-f-cha",
        ("russian-2", 10): "rus-f-chu", ("russian-2", 16): "rus-03", ("russian-2", 31): "rus-05",
        ("russian-2", 44): "rus-08", ("russian-2", 48): "rus-06", ("russian-2", 56): "rus-09",
        ("russian-2", 68): "rus-10", ("russian-2", 86): "rus-11", ("russian-2", 108): "rus-f-prep",
        # Уроки из tools/lessons_russian.py
        ("russian-1", 6): "rus-b-speech", ("russian-1", 8): "rus-b-polite", ("russian-1", 10): "rus-b-dialog",
        ("russian-1", 18): "rus-b-title", ("russian-1", 20): "rus-b-parts", ("russian-1", 29): "rus-b-main",
        ("russian-1", 35): "rus-b-second", ("russian-1", 38): "rus-b-link", ("russian-1", 42): "rus-b-meaning",
        ("russian-1", 44): "rus-b-many", ("russian-1", 47): "rus-b-figur", ("russian-1", 52): "rus-b-syn",
        ("russian-1", 55): "rus-b-ant", ("russian-1", 61): "rus-b-rootcheck", ("russian-1", 71): "rus-b-stress",
        ("russian-1", 74): "rus-b-hyph", ("russian-1", 78): "rus-b-sounds", ("russian-1", 81): "rus-b-abc",
        ("russian-1", 85): "rus-b-caps", ("russian-1", 112): "rus-b-cons", ("russian-1", 115): "rus-b-yot",
        ("russian-1", 117): "rus-b-double", ("russian-2", 40): "rus-b-partsp", ("russian-2", 50): "rus-b-animate",
        ("russian-2", 72): "rus-b-verbnum", ("russian-2", 74): "rus-b-ne", ("russian-2", 81): "rus-b-narr",
        ("russian-2", 89): "rus-b-adjnum", ("russian-2", 96): "rus-b-descr", ("russian-2", 100): "rus-b-pron",
        ("russian-2", 104): "rus-b-reason",
    },
    "reading": {
        ("reading-1", 26): "lit-06", ("reading-1", 31): "lit-01", ("reading-1", 34): "lit-02",
        ("reading-1", 37): "lit-03", ("reading-1", 42): "lit-04", ("reading-1", 58): "lit-f-poem",
        ("reading-1", 62): "lit-05", ("reading-1", 71): "lit-f-plan", ("reading-1", 90): "lit-f-fable",
        ("reading-1", 98): "lit-f-idea", ("reading-1", 99): "lit-f-retell",
        # Уроки из tools/lessons_reading.py
        ("reading-1", 3): "lit-b-book", ("reading-1", 6): "lit-b-library", ("reading-1", 14): "lit-b-proverb",
        ("reading-1", 18): "lit-b-folk", ("reading-1", 22): "lit-b-riddle", ("reading-1", 28): "lit-b-petushok",
        ("reading-1", 40): "lit-b-foxcrane", ("reading-1", 53): "lit-b-express", ("reading-1", 60): "lit-b-compare",
        ("reading-1", 64): "lit-b-rhyme", ("reading-1", 76): "lit-b-lukomorye", ("reading-1", 79): "lit-b-fisherman",
        ("reading-1", 92): "lit-b-dragonfly", ("reading-1", 94): "lit-b-kitten", ("reading-1", 105): "lit-b-review",
        ("reading-1", 113): "lit-b-ducks", ("reading-1", 122): "lit-b-bianki", ("reading-1", 133): "lit-b-memorize",
        ("reading-1", 146): "lit-b-twofrosts", ("reading-2", 8): "lit-b-confusion", ("reading-2", 15): "lit-b-fedora",
        ("reading-2", 21): "lit-b-roles", ("reading-2", 38): "lit-b-livehat", ("reading-2", 55): "lit-b-magicword",
        ("reading-2", 73): "lit-b-spring", ("reading-2", 91): "lit-b-humor", ("reading-2", 113): "lit-b-cheburashka",
        ("reading-2", 127): "lit-b-foreign", ("reading-2", 134): "lit-b-puss", ("reading-2", 144): "lit-b-folkauthor",
    },
    "world": {
        ("world-1", 6): "world-f-rus", ("world-1", 10): "world-03", ("world-1", 22): "world-f-sakha",
        ("world-1", 32): "world-01", ("world-1", 44): "world-02", ("world-1", 48): "world-f-space",
        ("world-1", 56): "world-04", ("world-1", 64): "world-05", ("world-1", 68): "world-06",
        ("world-1", 74): "world-f-plants2", ("world-1", 78): "world-f-animals2", ("world-1", 90): "world-f-red",
        ("world-1", 126): "world-07", ("world-2", 8): "world-08", ("world-2", 16): "world-f-safe",
        ("world-2", 74): "world-f-map", ("world-2", 86): "world-f-spring", ("world-2", 124): "world-f-summer",
        # Уроки из tools/lessons_world.py
        ("world-1", 14): "world-b-made", ("world-1", 18): "world-b-danger", ("world-1", 36): "world-b-phenom",
        ("world-1", 40): "world-b-weather", ("world-1", 52): "world-b-stones", ("world-1", 60): "world-b-water",
        ("world-1", 72): "world-b-threads", ("world-1", 82): "world-b-houseplants", ("world-1", 86): "world-b-pets",
        ("world-1", 94): "world-b-friend", ("world-1", 108): "world-b-econ", ("world-1", 112): "world-b-materials",
        ("world-1", 116): "world-b-build", ("world-1", 120): "world-b-transport", ("world-1", 122): "world-b-jobs",
        ("world-1", 130): "world-b-museum", ("world-2", 4): "world-b-body", ("world-2", 12): "world-b-road",
        ("world-2", 20): "world-b-fire", ("world-2", 24): "world-b-waterforest", ("world-2", 28): "world-b-strangers",
        ("world-2", 42): "world-b-family", ("world-2", 46): "world-b-school", ("world-2", 48): "world-b-polite",
        ("world-2", 52): "world-b-friends", ("world-2", 56): "world-b-passenger", ("world-2", 70): "world-b-horizon",
        ("world-2", 78): "world-b-relief", ("world-2", 82): "world-b-waters", ("world-2", 90): "world-b-russiamap",
        ("world-2", 96): "world-b-moscow", ("world-2", 100): "world-b-kremlin", ("world-2", 106): "world-b-spb",
        ("world-2", 110): "world-b-earthmap", ("world-2", 114): "world-b-continents", ("world-2", 120): "world-b-countries",
    },
    "english": {
        ("english-1", 18): "en-hello", ("english-1", 20): "en-name", ("english-1", 22): "en-family",
        ("english-1", 26): "en-colors", ("english-1", 30): "en-this", ("english-1", 44): "en-numbers",
        ("english-2", 4): "en-animals", ("english-2", 22): "en-school", ("english-2", 26): "en-have",
        # Уроки из tools/lessons_english.py
        ("english-1", 4): "en-b-abc1", ("english-1", 8): "en-b-abc2", ("english-1", 12): "en-b-blends",
        ("english-1", 32): "en-b-rooms", ("english-1", 34): "en-b-furniture", ("english-1", 46): "en-b-age",
        ("english-1", 48): "en-b-food1", ("english-1", 52): "en-b-food2", ("english-2", 6): "en-b-ican",
        ("english-2", 8): "en-b-cancant", ("english-2", 12): "en-b-circus", ("english-2", 24): "en-b-prep",
        ("english-2", 28): "en-b-face", ("english-2", 30): "en-b-adjectives", ("english-2", 40): "en-b-clothes",
        ("english-2", 44): "en-b-weather", ("english-2", 48): "en-b-island",
    },
}

SAKHA = [
    ("Саха тыла с мамой", "Учебник Петровой и Игнатьевой, 2 класс. 20 минут: прочитать вслух, ответить на вопросы по-якутски, написать 3–4 строки."),
    ("Саха тыла: разговор", "15 минут говорим только по-якутски: что было сегодня, что на столе, какая погода. Мама подсказывает слова."),
]


def school_days():
    days, rest = [], []
    d = START
    while d <= END:
        holiday = next((name for name, (a, b) in HOLIDAYS.items() if a <= d <= b), None)
        if d.weekday() < 5:
            (rest.append((d, holiday)) if holiday else days.append(d))
        d += dt.timedelta(days=1)
    return days, rest


def entries_with_ends(subject):
    rows = TOC[subject]
    out = []
    for i, (book, page, title) in enumerate(rows):
        nxt = rows[i + 1] if i + 1 < len(rows) else None
        end = nxt[1] - 1 if nxt and nxt[0] == book else BOOKS[book][3]
        out.append({"book": book, "from": page, "to": max(page, end), "title": title})
    return out


def span(e):
    return e["to"] - e["from"] + 1


def fit(entries, count):
    """Делит большие темы и склеивает мелкие, пока уроков не станет ровно count."""
    units = [dict(e) for e in entries]
    while len(units) < count:
        i = max(range(len(units)), key=lambda k: span(units[k]))
        e = units[i]
        if span(e) < 2:
            break
        mid = e["from"] + span(e) // 2 - 1
        units[i:i + 1] = [dict(e, to=mid), dict(e, **{"from": mid + 1})]
    while len(units) > count:
        best = None
        for k in range(len(units) - 1):
            a, b = units[k], units[k + 1]
            if a["book"] != b["book"]:
                continue
            cost = span(a) + span(b)
            if best is None or cost < best[0]:
                best = (cost, k)
        k = best[1]
        a, b = units[k], units[k + 1]
        glue = " " if a["title"][-1] in ".!?»" else ". "
        title = a["title"] if a["title"] == b["title"] else a["title"] + glue + b["title"]
        units[k:k + 2] = [dict(a, to=b["to"], title=title)]
    return units


def attach_site(subject, units):
    lost = []
    for key, lesson_id in SITE.get(subject, {}).items():
        book, page = key
        idx = next((i for i, u in enumerate(units) if u["book"] == book and u["from"] <= page <= u["to"]), None)
        if idx is None:
            lost.append(lesson_id)
            continue
        while idx < len(units) and units[idx].get("lessonId"):
            idx += 1
        if idx < len(units) and units[idx]["book"] == book:
            units[idx]["lessonId"] = lesson_id
        else:
            lost.append(lesson_id)
    return lost


def main():
    data_path = ROOT / "data.json"
    data = json.loads(data_path.read_text(encoding="utf-8"))
    site_ids = {l["id"] for s in data["subjects"] for l in s["lessons"]}

    days, rest = school_days()
    slots = [(d, subj) for d in days for subj in WEEK[d.weekday()]]
    need = {s: sum(1 for _, x in slots if x == s) for s in NAMES}
    units = {}
    report = []
    for subject in TOC:
        units[subject] = fit(entries_with_ends(subject), need[subject])
        lost = attach_site(subject, units[subject])
        bad = [u["lessonId"] for u in units[subject] if u.get("lessonId") and u["lessonId"] not in site_ids]
        report.append(f"{NAMES[subject]}: слотов {need[subject]}, уроков {len(units[subject])}, без места {lost}, неизвестные {bad}")

    plan = []
    cursor = {s: 0 for s in NAMES}
    seen_site = []
    returned = set()
    for d, subj in slots:
        iso = d.isoformat()
        if subj == "return":
            old = [x for x in seen_site if x[0] <= (d - dt.timedelta(days=7)).isoformat() and x[1] not in returned]
            if old:
                _, lesson_id, sid = old[0]
                returned.add(lesson_id)
                plan.append({"date": iso, "kind": "return", "subjectId": sid, "subject": NAMES[sid],
                             "lessonId": lesson_id, "title": next(l["title"] for s in data["subjects"] for l in s["lessons"] if l["id"] == lesson_id)})
            else:
                plan.append({"date": iso, "kind": "mama", "title": "Чтение вслух с мамой",
                             "text": "10 минут вслух любую книгу. В конце дочка рассказывает: кто герой и что случилось."})
            continue
        if subj == "sakha":
            title, text = SAKHA[cursor["sakha"] % len(SAKHA)]
            cursor["sakha"] += 1
            plan.append({"date": iso, "kind": "book", "subjectId": "sakha", "subject": NAMES["sakha"],
                         "id": f"sakha-{iso}", "title": title, "text": text})
            continue
        u = units[subj][cursor[subj]]
        cursor[subj] += 1
        b = BOOKS[u["book"]]
        item = {"date": iso, "kind": "lesson" if u.get("lessonId") else "book", "subjectId": subj,
                "subject": NAMES[subj], "id": f"{u['book']}-{u['from']}", "title": u["title"],
                "book": {"id": u["book"], "part": b[1], "from": u["from"], "to": u["to"]}}
        if u.get("lessonId"):
            item["lessonId"] = u["lessonId"]
            seen_site.append((iso, u["lessonId"], subj))
        plan.append(item)
    for d, name in rest:
        plan.append({"date": d.isoformat(), "kind": "rest", "title": name})
    plan.sort(key=lambda x: x["date"])

    # Уроки предмета идут в порядке учебника; уроки вне графика — в конце, как были.
    first = {}
    for item in plan:
        if item.get("lessonId") and item["kind"] == "lesson":
            first.setdefault(item["lessonId"], len(first))
    for subject in data["subjects"]:
        subject["lessons"].sort(key=lambda l: first.get(l["id"], len(first)))

    data["books"] = {k: {"title": v[0], "part": v[1], "url": VIEWER.format(v[2])} for k, v in BOOKS.items()}
    data["plan"] = {"from": START.isoformat(), "lessonsUntil": END.isoformat(), "reviewUntil": END.isoformat(),
                    "pace": "books", "perDay": 4, "days": plan}
    data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    (ROOT / "data.js").write_text("/* Копия data.json: уроки открываются двойным щелчком, без Python. */\nwindow.STUDY_DATA = " + text + ";\n", encoding="utf-8")
    print(f"Учебных дней {len(days)}, выходных {len(rest)}, записей {len(plan)}")
    print("\n".join(report))


if __name__ == "__main__":
    main()
