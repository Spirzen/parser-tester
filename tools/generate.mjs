// Генератор массовых страниц полигона: пагинация отзывов, каталог и карточки Scrapy,
// длинный список для тренировок с объёмом, а также site/data/reviews.json.
// Всё детерминировано (сид в коде), поэтому dist/ и исходники воспроизводимы.
// Запуск: node tools/generate.mjs --write   |   проверка: node tools/generate.mjs --verify
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const MODE = process.argv.includes('--verify') ? 'verify' : 'write';

const products = JSON.parse(await readFile(path.join(SITE, 'data', 'products.json'), 'utf8')).products;

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ['Илья Соловьёв', 'Марина Ким', 'Фёдор Лыжин', 'Аня Грибоедова', 'Пётр Ожерельев', 'Лидия Нос', 'Тимур Абрамов', 'Светлана Ровова', 'Дмитрий Пан', 'Ольга Верхова', 'Никита Хвостов', 'Ева Кузьмина'];
const CITIES = ['Севск', 'Тихая Бухта', 'Верхние Ключи', 'Озёрный', 'Приморск-2', 'Старый Лог'];
const TITLES = ['Беру второй раз', 'Нормально для своей цены', 'Взял на сезон', 'Есть нюансы', 'Качество порадовало', 'Упаковка подвела', 'Хорошо за свои деньги', 'Стоит своих денег', 'Хожу вторую зиму', 'Компрессионный мешок — плюс'];
const TEXTS = [
  'Взял перед походом, за неделю показал себя честно. Швы ровные, ничего не торчит.',
  'Для города в самый раз, но в сильный дождь промокает по молнии — приходится закрывать клапаном.',
  'Доставка быстрая, товар соответствует описанию. Единственное — инструкция только на английском.',
  'Пользуюсь месяц: заметных следов износа нет. Соседи по лагерю тоже заинтересовались.',
  'Размер мерит мало: взял на размер больше, село как надо. Учитывайте при заказе.',
  'Хорошая вещь за свои деньги. Тяжеловато, зато живуче: упал на камень, вмятина есть, работа есть.',
  'Второй сезон. Заменили по гарантии без разговоров — это отдельно радует.',
  'Сначала показалось, что брак: не держал клапан. Оказалось, перепутал сторону уплотнения.',
];

const reviewRng = rng(20260314);
const reviews = Array.from({ length: 30 }, (_, i) => {
  const product = products[Math.floor(reviewRng() * products.length)];
  const rating = 3 + Math.floor(reviewRng() * 3);
  const day = String(1 + Math.floor(reviewRng() * 27)).padStart(2, '0');
  return {
    id: `R-${String(i + 1).padStart(3, '0')}`,
    product: product.sku,
    productTitle: product.title,
    author: NAMES[Math.floor(reviewRng() * NAMES.length)],
    city: CITIES[Math.floor(reviewRng() * CITIES.length)],
    rating,
    date: `2026-0${1 + Math.floor(reviewRng() * 3)}-${day}`,
    title: TITLES[Math.floor(reviewRng() * TITLES.length)],
    text: TEXTS[Math.floor(reviewRng() * TEXTS.length)],
    helpful: Math.floor(reviewRng() * 40),
    verified: reviewRng() > 0.35,
    photos: Math.floor(reviewRng() * 4),
  };
});

const PAGE_SIZE = 5;
const reviewPages = [];
for (let p = 0; p * PAGE_SIZE < reviews.length; p += 1) {
  reviewPages.push({ page: p + 1, items: reviews.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE) });
}

const HEAD = (title, desc) => `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="../assets/css/main.css" />
  <meta name="description" content="${desc}" />
`;

function shell({ title, desc, page, module, h1, lede, body, rel }) {
  const links = rel.map(([label, href]) => `  <link rel="${label}" href="${href}" />`).join('\n');
  return `${HEAD(title, desc)}${links ? links + '\n' : ''}</head>
<body data-page="${page}" data-module="${module}">
<!-- inject:nav -->
<main class="page">
  <h1>${h1}</h1>
  <p class="lede">${lede}</p>
${body}
<!-- inject:tasks -->
</main>
<!-- inject:footer -->
<script src="../assets/js/trainer.js" defer></script>
</body>
</html>
`;
}

function pager(current, total, href) {
  const cells = [];
  cells.push(current === 1
    ? `<li class="is-disabled">← назад</li>`
    : `<li><a rel="prev" href="${href(current - 1)}">← назад</a></li>`);
  for (let p = 1; p <= total; p += 1) {
    cells.push(p === current
      ? `<li><span class="is-current" aria-current="page">${p}</span></li>`
      : `<li><a href="${href(p)}">${p}</a></li>`);
  }
  cells.push(current === total
    ? `<li class="is-disabled">вперёд →</li>`
    : `<li><a rel="next" href="${href(current + 1)}">вперёд →</a></li>`);
  return `<nav class="pager-wrap" aria-label="Страницы">\n  <ul class="pager">\n    <li>${cells.join('</li>\n    <li>')}</li>\n  </ul>\n</nav>`;
}

function reviewRow(r) {
  return `      <article class="card review" data-review="${r.id}" data-product="${r.product}" data-rating="${r.rating}" data-verified="${r.verified}" data-date="${r.date}">
        <p class="review__head"><span class="review__author">${r.author}</span>
          <span class="review__city">${r.city}</span>
          <span class="chip">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span></p>
        <h3 class="review__title">${r.title}</h3>
        <p class="review__text">${r.text}</p>
        <p class="review__meta">к товару <a href="../scrapy/${products.find((p) => p.sku === r.product).url}">${r.productTitle}</a>
          · полезно: <span class="review__helpful" data-count="${r.helpful}">${r.helpful}</span>
          · фото: <span class="review__photos">${r.photos}</span>
          ${r.verified ? '<span class="badge">покупка подтверждена</span>' : ''}</p>
      </article>`;
}

const paginationFiles = reviewPages.map(({ page, items }) => {
  const total = reviewPages.length;
  const href = (p) => (p === 1 ? 'index.html' : `page-${p}.html`);
  const rel = [];
  if (page > 1) rel.push(['prev', href(page - 1)]);
  if (page < total) rel.push(['next', href(page + 1)]);
  rel.push(['canonical', href(page)]);
  const body = `  <p class="muted">Страница <strong data-current="${page}">${page}</strong> из <span data-total="${total}">${total}</span>. Всего отзывов: ${reviews.length}.
  Адрес меняется — это самый простой случай пагинации: подставляйте номер в URL и не забудьте про задержку между запросами.</p>
  <div class="reviews">
${items.map(reviewRow).join('\n')}
  </div>
${pager(page, total, href)}
  <h2>Как идти дальше</h2>
  <ul>
    <li>Соберите адреса всех страниц одним регулярным выражением по <code>page-(\\d+)\\.html</code>.</li>
    <li>Остановитесь, когда <code>rel="next"</code> отсутствует: не гадайте по числу страниц в тексте.</li>
    <li>Проверьте, что не собрали один отзыв дважды из-за дублирующихся ссылок.</li>
  </ul>
  <p class="tip">Тот же массив доступен как JSON: <a href="../data/reviews.json">../data/reviews.json</a> — сравните, что быстрее и устойчивее.</p>`;
  const pageId = page === 1 ? 'pagination/index' : `pagination/page-${page}`;
  return [
    pageId + '.html',
    shell({
      title: `Отзывы, страница ${page} · Пагинация · Парсинг-тренажёр`,
      desc: `Страница ${page} учебной пагинации с отзывами вымышленного магазина.`,
      page: pageId,
      module: 'pagination',
      h1: `Отзывы покупателей — страница ${page}`,
      lede: 'Обход нумерованных страниц: ссылки, rel=next, признак конца.',
      body,
      rel,
    }),
  ];
});

const ITEMS_PER_PAGE = 4;
const catalogPages = [];
for (let p = 0; p * ITEMS_PER_PAGE < products.length; p += 1) {
  catalogPages.push({ page: p + 1, items: products.slice(p * ITEMS_PER_PAGE, (p + 1) * ITEMS_PER_PAGE) });
}

const scrapyFiles = [];
catalogPages.forEach(({ page, items }) => {
  const total = catalogPages.length;
  const href = (p) => (p === 1 ? 'index.html' : `catalog-${p}.html`);
  const rel = [];
  if (page > 1) rel.push(['prev', href(page - 1)]);
  if (page < total) rel.push(['next', href(page + 1)]);
  const cards = items
    .map((p) => `      <li class="catalog-item" data-sku="${p.sku}" data-category="${p.category}" data-page="${page}">
        <a class="catalog-item__link" href="${p.url}">${p.title}</a>
        <span class="price" data-price="${p.price}" data-currency="${p.currency}">${p.price.toLocaleString('ru-RU')} ₽</span>
        <span class="product-card__meta">${p.stock > 0 ? `в наличии: ${p.stock}` : 'нет в наличии'}</span>
        <time class="updated" datetime="${p.updatedAt}">${p.updatedAt.slice(0, 10)}</time>
      </li>`)
    .join('\n');
  const body = `  <p class="lede">Сценарий для Scrapy: три страницы списка и двенадцать карточек. Задача — один паук, который проходит список и собирает детали.</p>
  <section class="note">
    <p style="margin:0"><strong>start_urls</strong> — только страницы списка: <code>index.html</code>, <code>catalog-2.html</code>, <code>catalog-3.html</code>.
    Ссылки на карточки забираем через <code>response.css('.catalog-item__link::attr(href)')</code>, переход — <code>response.follow(...)</code>.</p>
  </section>
  <ul class="catalog-list">
${cards}
  </ul>
${pager(page, total, href)}
  <h2>Правила краулера</h2>
  <table class="table--striped">
    <thead><tr><th>Что</th><th>Значение</th><th>Зачем на этом полигоне</th></tr></thead>
    <tbody>
      <tr><td><code>ROBOTSTXT_OBEY</code></td><td>True</td><td>раздел <code>/private/</code> запрещён — краулер его не увидит</td></tr>
      <tr><td><code>DOWNLOAD_DELAY</code></td><td>1</td><td>вежливость: тот же <code>Crawl-delay</code> в robots.txt</td></tr>
      <tr><td><code>CONCURRENT_REQUESTS</code></td><td>4</td><td>не превращаем урок в атаку</td></tr>
      <tr><td><code>FEEDS</code></td><td>items.jsonl</td><td>выгрузка без pipeline</td></tr>
    </tbody>
  </table>`;
  const pageId = page === 1 ? 'scrapy/index' : `scrapy/catalog-${page}`;
  scrapyFiles.push([pageId + '.html', shell({
    title: `Каталог, страница ${page} · Scrapy · Парсинг-тренажёр`,
    desc: 'Страница списка товаров для учебной паука Scrapy.',
    page: pageId,
    module: 'scrapy',
    h1: `Каталог «Тихая бухта» — страница ${page}`,
    lede: 'Ссылки на карточки, дата обновления, признак наличия.',
    body,
    rel,
  })]);
});

products.forEach((p, i) => {
  const catPage = catalogPages.find((c) => c.items.includes(p)).page;
  const catHref = catPage === 1 ? 'index.html' : `catalog-${catPage}.html`;
  const specs = Object.entries(p.specs)
    .map(([k, v]) => `      <dt>${k}</dt>\n      <dd>${v}</dd>`)
    .join('\n');
  const oldPrice = p.oldPrice ? `<span class="price price--old">${p.oldPrice.toLocaleString('ru-RU')} ₽</span>` : '';
  const body = `  <ul class="breadcrumbs">
    <li><a href="index.html">Каталог</a></li>
    <li><a href="index.html">${p.category}</a></li>
    <li>${p.title}</li>
  </ul>
  <section class="grid grid--2">
    <div class="product-card" data-sku="${p.sku}" data-category="${p.category}" data-subcategory="${p.subcategory}" data-stock="${p.stock}" data-updated="${p.updatedAt}">
      <h2 class="product-card__title">${p.title}</h2>
      <p class="product-card__price"><span class="price" data-price="${p.price}" data-currency="${p.currency}">${p.price.toLocaleString('ru-RU')} ₽</span> ${oldPrice}</p>
      <p class="product-card__meta">Артикул <span class="sku mono">${p.sku}</span> · продавец <span class="seller">${p.seller}</span></p>
      <p class="stock ${p.inStock ? 'stock--in' : 'stock--out'}">${p.inStock ? 'в наличии' : 'нет в наличии'}</p>
      <ul class="tag-list">
${p.tags.map((t) => `        <li class="tag" data-tag="${t}">${t}</li>`).join('\n')}
      </ul>
    </div>
    <div class="card">
      <h3>Описание</h3>
      <p class="product-description">${p.description}</p>
      <dl class="spec">
${specs}
      </dl>
    </div>
  </section>
  <h2>Рейтинг и отзывы</h2>
  <table class="table--striped">
    <thead><tr><th>Показатель</th><th>Значение</th></tr></thead>
    <tbody>
      <tr><td>Рейтинг</td><td><span data-rating="${p.rating}">${p.rating.toFixed(1)}</span> из 5</td></tr>
      <tr><td>Отзывов</td><td><span data-reviews="${p.reviews}">${p.reviews}</span></td></tr>
      <tr><td>Обновлено</td><td><time datetime="${p.updatedAt}">${p.updatedAt}</time></td></tr>
    </tbody>
  </table>
  <p class="tip">Та же карточка есть в JSON: <a href="../data/products.json">../data/products.json</a> — сравните разметку и данные, найдите, что потерялось при парсинге HTML.</p>`;
  const pageId = `scrapy/item-${String(p.id).padStart(2, '0')}`;
  scrapyFiles.push([pageId + '.html', shell({
    title: `${p.title} · Scrapy · Парсинг-тренажёр`,
    desc: p.description,
    page: pageId,
    module: 'scrapy',
    h1: p.title,
    lede: `Карточка товара ${p.sku} для извлечения полей в Item.`,
    body,
    rel: [['up', catHref]],
  })]);
});

const longRows = Array.from({ length: 240 }, (_, i) => {
  const seed = rng(700 + i);
  const product = products[Math.floor(seed() * products.length)];
  const qty = 1 + Math.floor(seed() * 9);
  return `      <tr class="order" data-order="ORD-${String(1000 + i)}" data-region="${CITIES[i % CITIES.length]}" data-status="${['new', 'paid', 'shipped', 'done', 'cancelled'][i % 5]}"${i % 37 === 0 ? ' style="display:none"' : ''}>
        <td class="order__id">ORD-${String(1000 + i)}</td>
        <td class="order__date"><time datetime="2026-0${1 + (i % 3)}-1${i % 9}">2026-0${1 + (i % 3)}-1${i % 9}</time></td>
        <td class="order__product">${product.title}</td>
        <td class="order__sku mono">${product.sku}</td>
        <td class="order__qty">${qty}</td>
        <td class="order__sum price" data-price="${qty * Math.round(product.price / 10) * 10}">${(qty * Math.round(product.price / 10) * 10).toLocaleString('ru-RU')} ₽</td>
      </tr>`;
}).join('\n');

const longList = shell({
  title: 'Большой список заказов · Селекторы · Парсинг-тренажёр',
  desc: '240 строк таблицы для тренировки работы с объёмом и скрытыми элементами.',
  page: 'selectors/long-list',
  module: 'selectors',
  h1: 'Журнал заказов: 240 строк',
  lede: 'Тренировка на объёме: считать, фильтровать, не терять скрытые строки и не выгружать всё подряд.',
  body: `  <p class="warn">Часть строк скрыта через <code>style="display:none"</code>: BeautifulSoup их найдёт, Selenium без <code>visibility_of</code> — нет. Это учебная ловушка, держите её в голове при сверке counts.</p>
  <table class="table--striped table--compact orders">
    <caption>Заказы за квартал</caption>
    <thead><tr><th>Номер</th><th>Дата</th><th>Товар</th><th>Артикул</th><th>Кол-во</th><th>Сумма</th></tr></thead>
    <tbody>
${longRows}
    </tbody>
    <tfoot><tr><td colspan="5">Итого позиций</td><td id="orders-total">240</td></tr></tfoot>
  </table>`,
  rel: [],
});

const files = [
  ['data/reviews.json', JSON.stringify({ meta: { count: reviews.length, perPage: PAGE_SIZE, pages: reviewPages.length }, reviews }, null, 2) + '\n'],
  ...paginationFiles,
  ...scrapyFiles,
  ['selectors/long-list.html', longList],
];

let changed = 0;
for (const [relPath, content] of files) {
  const full = path.join(SITE, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  const current = MODE === 'verify' ? await readFile(full, 'utf8').catch(() => null) : null;
  if (current !== null && current.replace(/\r\n/g, '\n') === content) continue;
  changed += 1;
  if (MODE === 'write') {
    await writeFile(full, content);
  } else {
    console.error(`verify: ${relPath} расходится с генератором — запустите node tools/generate.mjs --write`);
  }
}
if (MODE === 'verify' && changed) process.exit(1);
console.log(`generate(${MODE}): файлов ${files.length}, изменений ${changed}`);
