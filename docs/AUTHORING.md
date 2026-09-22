# Контент-контракт: как писать страницы тренажёра

Этот файл — обязательная инструкция для всех, кто добавляет страницы в `site/`.
Нарушение контракта ловит `node tools/check.mjs` в CI.

## 1. Структура

```
site/
  index.html                  # главная (глубина 0)
  <module>/<page>.html        # все страницы модулей — ровно один уровень вложенности
  assets/css/main.css
  assets/js/*.js
  data/*.json                 # «JSON API» полигона
  data/tasks/<module>.json    # задания модуля, ключ — id страницы
dist/                         # сборка, в git не попадает
```

Глубина важна: все пути в HTML **относительные** (`../data/products.json`, `../assets/js/trainer.js`).
Абсолютные пути вида `/data/x.json` запрещены — сайт живёт в подпапке `https://user.github.io/parser-tester/`.

Модули: `basics`, `selectors`, `http`, `markup`, `pagination`, `forms`, `js`, `scrapy`, `exam`.

## 2. Шаблон страницы

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Название страницы · Селекторы · Парсинг-тренажёр</title>
  <link rel="stylesheet" href="../assets/css/main.css" />
  <meta name="description" content="Описание для урока." />
</head>
<body data-page="selectors/nesting" data-module="selectors">
<!-- inject:nav -->
<main class="page">
  <h1>…</h1>
  <p class="lede">Что тренируем на этой странице.</p>
  <!-- учебный контент -->
<!-- inject:tasks -->
</main>
<!-- inject:footer -->
<script src="../assets/js/trainer.js" defer></script>
</body>
</html>
```

- Маркеры `<!-- inject:nav -->`, `<!-- inject:tasks -->`, `<!-- inject:footer -->` заменяются на сборке (`tools/build.mjs`). Навигацию и футер руками не пишем.
- `data-page` = путь страницы без `.html` (`basics/hello`, `index`). Используется для подстановки заданий и для `sitemap.xml`.
- `<script src="../assets/js/trainer.js" defer></script>` — на **всех** учебных страницах, кроме `index.html`.
- Обязательные элементы каждой страницы: `<title>`, один `<h1>`, `lang="ru"`, `<meta charset="utf-8">`.

## 3. Задания

Файл `site/data/tasks/<module>.json`:

```json
{
  "selectors/nesting": [
    {
      "id": "S-03",
      "level": 2,
      "q": "Соберите text всех <li> второго уровня вложенности",
      "solution": {
        "css": "ul.tree ul.tree > li",
        "xpath": "//ul[@class='tree']//ul[@class='tree']/li",
        "bs4": "[li.get_text(strip=True) for li in soup.select('ul.tree ul.tree > li')]"
      },
      "answer": "4 элемента"
    }
  ]
}
```

- `id` — уникальный в рамках всего сайта, префикс модуля: `B-` basics, `S-` selectors, `H-` http, `M-` markup, `P-` pagination, `F-` forms, `J-` js, `C-` scrapy, `EX-` exam («E-NN» заняты id экзаменационных вопросов).
- `level` — 1…5 (1 = новичок, 5 = экзамен).
- `q` — условие; `solution` — словарь «библиотека/синтаксис → строка»; `answer` — опциональный самопроверочный ответ.
- В решениях не использовать `id`-костыли вроде `#main`, если цель урока — научиться обходиться без них.
- `css`/`xpath`/`bs4` обязаны что-то находить на той же странице, чей это блок: `python tools/validate_tasks.py --zero` прогоняет селекторы по `dist/` и падает на пустой выборке.
- Решения печатаются на странице открыто: это учебник. В `exam/` ответов нет — там автопроверка: у заданий `exam/index` и `exam/arena` поля `answer` не ставят вовсе (смоук-тест ищет «Ответ:» в собранном HTML обеих страниц экзамена), а сами ответы живут только в `site/data/exam-answers.json` в base64.
- Учебная страница обязана иметь `<!-- inject:tasks -->`; исключение — массовка (`pagination/page-*`, `scrapy/item-*`, `private/*`, `exam/arena`).

## 4. data-атрибуты и классы

- Учебные сущности размечаем стабильно: `data-test="product-card"`, `data-sku`, `data-price`, `data-category`, `data-currency`, `data-stock`, `data-updated`.
- Рядом намеренно кладём «шум»: повторяющиеся классы (`.card`, `.item`, `.row` в разных секциях), `class` из трёх значений, элементы-двойники, скрытые блоки (`.hidden-block`, `hidden`, `display:none`) — их видит BeautifulSoup, но не видит Selenium без `visibility_of`.
- Вымышленные данные: бренд «Тихая бухта», города/имена/телефоны/почты фейковые, домены `@example.com`, телефоны `+7 000 …`, цены в ₽.

## 5. Чего не делаем

- Никаких внешних ресурсов (CDN, шрифты, аналитика, iframe на чужие домены) — только локальные файлы. Иначе урок падает без сети, а Pages это не любит.
- Никакого `<form action>` на чужие домены; POST-формы ведут на локальные страницы-«эхо» или `action="#"`.
- Не кладём реальные персональные данные и не называем реальные компании.
- Не зависим от серверной логики: куки, редиректы, «API» и пагинация — честная статика плюс JavaScript на клиенте.

## 6. Проверка перед коммитом

```bash
node tools/generate.mjs --verify   # генерируемые страницы совпадают с исходниками
node tools/build.mjs               # сборка в dist/
node tools/check.mjs               # ссылки, контракты, чек-лист фич
python tools/validate_tasks.py --zero   # селекторы из карточек заданий работают
```
