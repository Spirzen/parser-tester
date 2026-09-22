// Проверки качества полигона: структура страниц, битые ссылки, контракты заданий,
// наличие всех учебных конструкций из списка требований. Падает с кодом 1 — так CI краснеет.
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULES } from './templates.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

if (!existsSync(DIST)) {
  console.error('dist/ не найден — сначала node tools/build.mjs');
  process.exit(1);
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const files = [];
for await (const full of walk(DIST)) files.push(path.relative(DIST, full).split(path.sep).join('/'));
const htmlFiles = files.filter((f) => f.endsWith('.html'));

if (!htmlFiles.length) fail('в dist нет ни одного HTML');

// ---------- 1. Контракт страницы ----------
const NO_TRAINER = new Set(['index.html', '404.html']);
const pages = new Map();

for (const r of htmlFiles) {
  const html = await readFile(path.join(DIST, r), 'utf8');
  pages.set(r, html);
  const depth = r.split('/').length - 1;
  if (depth > 1) fail(`${r}: вложенность больше одного уровня — сломает относительные пути`);

  const count = (re) => (html.match(re) || []).length;
  if (!/<title>/.test(html)) fail(`${r}: нет <title>`);
  if (count(/<h1[\s>]/g) !== 1) fail(`${r}: должно быть ровно один <h1> (найдено ${count(/<h1[\s>]/g)})`);
  if (!/lang="ru"/.test(html)) fail(`${r}: нет lang="ru"`);
  if (!/charset="utf-8"/i.test(html)) fail(`${r}: нет meta charset=utf-8`);
  if (!/class="module-nav"/.test(html)) fail(`${r}: не внедрена навигация (маркер <!-- inject:nav -->?)`);
  if (!/class="site-footer"/.test(html)) fail(`${r}: не внедрён футер (маркер <!-- inject:footer -->?)`);
  if (/<!--\s*inject:/.test(html)) fail(`${r}: маркер сборки остался в выводе`);
  if (!NO_TRAINER.has(r) && !/assets\/js\/trainer\.js/.test(html)) fail(`${r}: нет подключенного тренажёра селекторов`);
  if (!/<body[^>]+data-page="/.test(html)) fail(`${r}: у <body> нет data-page`);
  if (/\s(src|href)="\/(?!\/)/.test(html)) fail(`${r}: абсолютный путь «/...» — сайт лежит в подпапке, используйте относительные пути`);

  // внешние ресурсы
  for (const m of html.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/g)) {
    const url = m[0];
    if (/^\s*<a\b/.test(m[0]) === false && !/rel="canonical"/.test(url)) warn(`${r}: ссылка на внешний ресурс ${url.slice(0, 60)}`);
  }
}

// ---------- 2. Ссылки и якоря ----------
const ALLOW_BROKEN = [
  /basics\/etogostranicy-net\.html$/, // страница-ловушка для урока про 404
  /^\/(old|promo)\//, // редиректы для Netlify/Cloudflare из _redirects
];

function resolve(from, href) {
  const target = href.split('#')[0].split('?')[0];
  if (!target) return from;
  const baseDir = path.posix.dirname(from);
  return path.posix.normalize(path.posix.join(baseDir, target));
}

let linkCount = 0;
for (const [r, rawHtml] of pages) {
  // В учебном тексте много примеров разметки внутри <pre>/<code>: ссылки проверяем только в настоящей вёрстке.
  const html = rawHtml.replace(/<pre[\s\S]*?<\/pre>/g, '').replace(/<code[\s\S]*?<\/code>/g, '');
  for (const m of html.matchAll(/(?:href|src|action|data-src)="([^"#][^"]*)"/g)) {
    const href = m[1].trim();
    if (/^(https?:|mailto:|javascript:|data:|tel:)/.test(href)) continue;
    linkCount += 1;
    const target = resolve(r, href);
    if (ALLOW_BROKEN.some((re) => re.test(href) || re.test(target))) continue;
    const inDist = pages.has(target) || files.includes(target);
    if (!inDist) {
      fail(`${r}: битая ссылка "${href}" → ${target}`);
      continue;
    }
    const anchor = href.split('#')[1];
    if (anchor && pages.has(target)) {
      const dest = pages.get(target);
      if (!new RegExp(`id="${anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(dest)) {
        fail(`${r}: якорь #${anchor} не найден на ${target}`);
      }
    }
  }
}

// ---------- 3. Данные и задания ----------
const dataFiles = files.filter((f) => f.endsWith('.json') && !f.includes('node_modules'));
for (const f of dataFiles) {
  const raw = await readFile(path.join(DIST, f), 'utf8');
  try {
    JSON.parse(raw);
  } catch (err) {
    fail(`${f}: невалидный JSON — ${err.message}`);
  }
}

const tasksPath = path.join(DIST, 'data', 'tasks.json');
const tasks = JSON.parse(await readFile(tasksPath, 'utf8'));
const seenIds = new Set();
const taskPages = new Set();
for (const [pageId, list] of Object.entries(tasks)) {
  taskPages.add(pageId);
  const file = pageId === 'index' ? 'index.html' : `${pageId}.html`;
  if (!pages.has(file)) fail(`tasks.json: страница ${file} не существует`);
  if (!Array.isArray(list) || !list.length) fail(`tasks.json: ${pageId} — пустой список заданий`);
  for (const t of list || []) {
    if (!t.id || !t.q || !t.solution) fail(`tasks.json: ${pageId}/${t.id || '?'} — нужны id, q, solution`);
    if (!Number.isInteger(t.level) || t.level < 1 || t.level > 5) fail(`tasks.json: ${pageId}/${t.id} — level должен быть 1..5`);
    if (seenIds.has(t.id)) fail(`tasks.json: дублирующийся id задания ${t.id}`);
    seenIds.add(t.id);
    if (t.solution.bs4 && /soup\.find_all\(\s*\)\s*$/.test(t.solution.bs4)) warn(`tasks.json: ${t.id} — тривиальное решение`);
  }
}
// Задания нужны на учебных страницах. Массовка (сгенерированные каталоги, страницы пагинации,
// закрытый раздел, экзаменационный полигон) обвешивается структурными хуками, а не заданиями.
const BULK_PAGES = /^(pagination\/page-\d+|scrapy\/(item-\d+|catalog-\d+)|private\/\S+|exam\/arena)$/;
for (const [r, html] of pages) {
  const pageId = r.replace(/\.html$/, '');
  if (pageId === 'index' || pageId === '404' || BULK_PAGES.test(pageId)) continue;
  if (!/id="tasks"/.test(html)) warn(`${r}: нет блока заданий — добавьте <!-- inject:tasks --> и задания в site/data/tasks/`);
}

// ---------- 4. robots / sitemap / feed ----------
const robots = await readFile(path.join(DIST, 'robots.txt'), 'utf8');
if (!/Sitemap:\s+\S+sitemap\.xml/.test(robots)) fail('robots.txt: нет строки Sitemap с абсолютным URL');
if (!/User-agent: \*/.test(robots)) fail('robots.txt: нет блока User-agent: *');

const sitemap = await readFile(path.join(DIST, 'sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!locs.length) fail('sitemap.xml пуст');
for (const loc of locs) {
  const target = loc.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '');
  const key = target === '' ? 'index.html' : target;
  if (!pages.has(key)) fail(`sitemap.xml: страницы нет в сборке — ${key}`);
}
if (locs.length !== pages.size - 1) fail(`sitemap.xml: ${locs.length} URL, страниц ${pages.size} (без 404)`);

if (existsSync(path.join(DIST, 'feed.xml'))) {
  const feed = await readFile(path.join(DIST, 'feed.xml'), 'utf8');
  if (!/<rss/.test(feed) || !/<item>/.test(feed)) fail('feed.xml: нет структуры RSS или элементов item');
  const articlesPath = path.join(ROOT, 'site', 'data', 'articles.json');
  if (existsSync(articlesPath)) {
    const articles = JSON.parse(await readFile(articlesPath, 'utf8'));
    const items = (feed.match(/<item>/g) || []).length;
    if (items !== articles.articles.length) fail(`feed.xml: ${items} item, в articles.json ${articles.articles.length}`);
  }
}

// ---------- 5. Чек-лист учебных конструкций ----------
const all = [...pages.values()].join('\n');
const CHECKLIST = [
  ['заголовки h1–h6', [1, 2, 3, 4, 5, 6].every((n) => new RegExp(`<h${n}[\\s>]`).test(all))],
  ['вложенные div', /<div[^>]*>[\s\S]{0,600}?<div/.test(all)],
  ['ul/ol/dl списки', /<ul[\s>]/.test(all) && /<ol[\s>]/.test(all) && /<dl[\s>]/.test(all)],
  ['таблицы с thead/tbody/tfoot', /<thead/.test(all) && /<tbody/.test(all) && /<tfoot/.test(all)],
  ['соседние селекторы (+, ~)', /class="[^"]*sibling/.test(all) || /\+|~/.test(all)],
  ['атрибуты data-*', (all.match(/data-[a-z-]+="/g) || []).length > 30],
  ['относительные ссылки', /href="[a-z0-9./_-]+\.html"/i.test(all)],
  ['пагинация rel=next', /rel="next"/.test(all)],
  ['формы GET и POST', /method="get"/i.test(all) && /method="post"/i.test(all)],
  ['скрытые поля формы', /type="hidden"/i.test(all)],
  ['куки на клиенте', /document\.cookie/.test(await readFile(path.join(DIST, 'assets', 'js', 'cookies.js'), 'utf8').catch(() => ''))],
  ['редирект (meta refresh)', /http-equiv="refresh"/i.test(all)],
  ['битая разметка', /<!--\s*broken:start/.test(all)],
  ['динамическая подгрузка', /fetch\(/.test(await readFile(path.join(DIST, 'assets', 'js', 'dynamic.js'), 'utf8').catch(() => ''))],
  ['JSON API-файлы', files.some((f) => f.startsWith('data/') && f.endsWith('.json'))],
  ['robots.txt', files.includes('robots.txt')],
  ['sitemap.xml', files.includes('sitemap.xml')],
  ['RSS', files.includes('feed.xml')],
  ['iframe', /<iframe/.test(all)],
  ['shadow DOM', /attachShadow/.test(await readFile(path.join(DIST, 'assets', 'js', 'shadow.js'), 'utf8').catch(() => ''))],
  ['Scrapy-каталог', files.some((f) => f.startsWith('scrapy/catalog-'))],
  ['экзамен с автопроверкой', /exam-check/.test(all)],
];
for (const [name, ok] of CHECKLIST) {
  if (!ok) fail(`чек-лист: не найдено — ${name}`);
}

// ---------- 6. Контракт примеров: селекторы, на которые опираются examples/ и smoke_test ----------
// Если страница меняет структуру — падаем здесь, а не на уроке.
const REQUIRED = [
  ['basics/hello.html', [/id="main-title"/], 'h1 с id для первого запроса студента'],
  ['basics/index.html', [/robots\.txt/], 'ссылка на правила обхода'],
  ['selectors/products.html', [/<article class="product-card"/g, /data-price="/, /data-currency="/], 'карточки товаров'],
  ['selectors/nesting.html', [/class="lvl1/, /class="lvl5/, /sibling-target/, /<ul class="tree"/g], 'вложенность div, соседи, tree'],
  ['selectors/attributes.html', [/data-sku="/g, /data-currency="/, /aria-hidden="true"/, /data-no-attrs/], 'набор атрибутов'],
  ['selectors/long-list.html', [/class="[^"]*orders/, /data-order="/g], 'таблица заказов'],
  ['markup/tables.html', [/id="order-lines"/, /<thead/, /<tfoot/], 'orders-таблица с thead/tfoot'],
  ['markup/lists.html', [/<ol/, /<dl/, /class="[^"]*tree/], 'списки и определения'],
  ['markup/headings.html', [/<h2/, /<h3/, /<h4/, /<h5/, /<h6/], 'все уровни заголовков'],
  ['markup/broken.html', [/<!-- broken:start/, /<!-- broken:end/, /class="[^"]*product-row/, /id="threeparsers"/], 'маркеры битой разметки и сравнение парсеров'],
  ['pagination/index.html', [/rel="next"/, /data-review="/g], 'отзывы и признак следующей страницы'],
  ['pagination/load-more.html', [/id="catalog"/, /id="load-more"/], 'контейнер и кнопка догрузки'],
  ['pagination/infinite-scroll.html', [/feed-item/, /data-empty="true"/], 'лента и признак конца'],
  ['pagination/query.html', [/data-mode="query"/], 'query-режим рендера'],
  ['forms/search.html', [/method="get"/i, /action="results\.html"/], 'GET-форма с адресом результата'],
  ['forms/results.html', [/id="results"/], 'блок результатов'],
  ['forms/login.html', [/type="hidden"[^>]*name="[^"]*csrf[^"]*"|name="[^"]*csrf[^"]*"[^>]*type="hidden"/i], 'скрытое csrf-поле'],
  ['js/dynamic-table.html', [/id="status"/, /id="refresh-btn"/, /id="stock-body"/, /row-stock/, /данные обновлены/], 'таблица с ожиданиями'],
  ['js/hidden-lazy.html', [/lazy-card/, /data-src=/, /lazy-status/], 'ленивые блоки'],
  ['js/spa.html', [/id="spa-root"/, /#\/prices/, /#\/reviews/, /#\/authors/], 'хэш-роуты мини-SPA'],
  ['js/shadow-dom.html', [/<tb-price-table/, /shadow\.js/], 'хост shadow DOM'],
  ['js/iframe-outer.html', [/id="stock-frame"/, /row-stock/], 'iframe и карточки в двух контекстах'],
  ['scrapy/index.html', [/catalog-item__link/g, /rel="next"/], 'ссылки паука на карточки'],
  ['scrapy/item-01.html', [/data-sku="/, /<dl class="spec"/, /data-price="/], 'поля карточки для Item'],
  ['scrapy/quotes.html', [/<blockquote class="quote-block"/g, /class="author"/, /class="tags"/, /rel="next"/], 'цитаты и пагинация'],
  ['scrapy/quotes-2.html', [/<blockquote class="quote-block"/g], 'вторая страница цитат'],
  ['scrapy/authors.html', [/data-author="/, /data-quotes="/], 'поля автора для Item Loader'],
  ['exam/arena.html', [/data-question="/g], 'размеченные задания полигона'],
  ['exam/index.html', [/exam-check|exam\.js/], 'форма автопроверки'],
  ['http/cookies.html', [/id="cookie-table"/, /assets\/js\/cookies\.js/], 'таблица куки и скрипт'],
  ['http/redirect.html', [/http-equiv="refresh"/i, /final\.html/], 'meta refresh на целевую страницу'],
  ['http/api.html', [/data\/products\.json/], 'разбор JSON API'],
];
for (const [file, patterns, why] of REQUIRED) {
  const html = pages.get(file);
  if (html === undefined) {
    fail(`контракт: ${file} отсутствует в сборке — нужно для «${why}»`);
    continue;
  }
  for (const re of patterns) {
    const global = String(re).endsWith('/g');
    const flags = global ? 'g' : '';
    const found = html.match(new RegExp(re.source, flags)) || [];
    const needed = global ? 4 : 1;
    if (found.length < needed) fail(`контракт: ${file} — не найдено «${why}» (${re}, есть ${found.length}, нужно ${needed})`);
  }
}
const productCards = [...(pages.get('selectors/products.html') || '').matchAll(/<article class="product-card"/g)].length;
if (productCards && productCards !== 12) fail(`контракт: selectors/products.html — ${productCards} карточек, ждём 12`);
for (const quotesPage of ['scrapy/quotes.html', 'scrapy/quotes-2.html']) {
  const count = [...(pages.get(quotesPage) || '').matchAll(/<blockquote class="quote-block"/g)].length;
  if (count && count !== 10) fail(`контракт: ${quotesPage} — ${count} цитат, ждём 10`);
}
const examIds = [...(pages.get('exam/arena.html') || '').matchAll(/data-question="([^"]*)"/g)].map((m) => m[1]);
if (examIds.length && examIds.length < 12) fail(`контракт: exam/arena.html — ${examIds.length} размеченных заданий, ждём 12`);
if (examIds.some((id) => !/^E-\d{2}$/.test(id))) fail(`контракт: exam/arena.html — data-question должны быть вида E-01: ${examIds.filter((id) => !/^E-\d{2}$/.test(id)).join(', ')}`);

// ---------- 7. Раздатка для уроков ----------
for (const m of MODULES) {
  if (!pages.has(`${m.id}/index.html`)) fail(`модуль ${m.id}: нет страницы ${m.id}/index.html`);
}
if (pages.size < 40) warn(`страниц всего ${pages.size} — маловато для полигона`);

// ---------- 7. Смешение кириллицы и латиницы внутри одного слова («Беруsecond») ----------
// Дефис и прочие разделители не считаем: «HTTP-раздел», «RED-режим» — это норма.
async function* sourceFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      yield* sourceFiles(full);
    } else if (/\.(html|js|css|json|py|md)$/.test(entry.name)) {
      yield full;
    }
  }
}
let mixedHits = 0;
for (const dirName of ['site', 'examples', 'tools', 'docs']) {
  const dir = path.join(ROOT, dirName);
  if (!existsSync(dir)) continue;
  for await (const full of sourceFiles(dir)) {
    const text = (await readFile(full, 'utf8')).replace(/\\[nrt0'"\\]/g, ' ');
    text.split('\n').forEach((line, i) => {
      for (const word of line.split(/[^A-Za-zА-Яа-яЁё]+/)) {
        if (word.length < 4 || !/[А-Яа-яЁё]/.test(word) || !/[A-Za-z]/.test(word)) continue;
        mixedHits += 1;
        fail(`${path.relative(ROOT, full).split(path.sep).join('/')}:${i + 1}: в слове «${word}» смешаны алфавиты`);
      }
    });
  }
}

console.log(`check: страниц ${pages.size}, ссылок проверено ${linkCount}, заданий ${seenIds.size}, URL в sitemap ${locs.length}`);
for (const w of warnings) console.warn(`  ! ${w}`);
if (errors.length) {
  console.error(`\nОШИБКИ (${errors.length}):`);
  for (const e of errors) console.error(`  × ${e}`);
  process.exit(1);
}
console.log('check: ок');
