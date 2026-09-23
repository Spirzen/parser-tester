// Общие HTML-блоки, которые build.mjs внедряет в страницы по маркерам.
// Маркеры в исходниках: <!-- inject:nav --> <!-- inject:tasks --> <!-- inject:footer -->

export const SITE_NAME = 'Парсинг-тренажёр';
export const SITE_TAGLINE = 'Учебный сайт-мишень для тренировки веб-парсинга';
export const PROJECT = 'Тихая бухта';

export const MODULES = [
  { id: 'basics', tab: 'Основы', title: 'Основы запросов', hint: 'Запрос, ответ, кодировка: с чего начинается любой парсер' },
  { id: 'selectors', tab: 'Селекторы', title: 'CSS и XPath селекторы', hint: 'Тренируем CSS/XPath: здесь есть тренажёр прямо на странице' },
  { id: 'http', tab: 'HTTP', title: 'HTTP, куки и API', hint: 'Заголовки, куки, редиректы, коды ошибок и JSON API' },
  { id: 'markup', tab: 'HTML-разметка', title: 'HTML-разметка и навигация по дереву', hint: 'Дерево документа: таблицы, списки, вложенные блоки' },
  { id: 'pagination', tab: 'Пагинация', title: 'Пагинация и обход страниц', hint: 'Как пройти все страницы без пропусков и дублей' },
  { id: 'forms', tab: 'Формы', title: 'Формы, POST и авторизация', hint: 'Что реально отправляет форма и как повторить это кодом' },
  { id: 'js', tab: 'JS-страницы', title: 'JavaScript-страницы', hint: 'Контент появляется после загрузки: Selenium и Playwright' },
  { id: 'scrapy', tab: 'Scrapy', title: 'Сценарии для Scrapy', hint: 'Пауки, правила обхода и выгрузка в JSON/CSV' },
  { id: 'exam', tab: 'Экзамен', title: 'Экзамен', hint: 'Двенадцать заданий на одном полигоне, ответы скрыты' },
];

export function prefixFor(relPath) {
  const depth = relPath.split('/').length - 1;
  return depth === 0 ? '' : '../'.repeat(depth);
}

// Порядок уроков внутри модуля. Страницы-мишени (item-*.html, page-3..6) сюда
// не входят: ученик переходит к ним по ссылке из задания, а не по маршруту.
export const LESSON_ROUTES = {
  basics: ['index.html', 'hello.html', 'anatomy.html', 'encoding.html', 'etiquette.html'],
  selectors: ['index.html', 'products.html', 'nesting.html', 'attributes.html', 'ambiguous.html', 'long-list.html'],
  http: ['index.html', 'headers.html', 'redirect.html', 'cookies.html', 'news.html', 'api.html', 'final.html'],
  markup: ['index.html', 'headings.html', 'lists.html', 'tables.html', 'broken.html'],
  pagination: ['index.html', 'page-2.html', 'query.html', 'load-more.html', 'infinite-scroll.html'],
  forms: ['index.html', 'search.html', 'results.html', 'login.html', 'multi.html'],
  js: ['index.html', 'spa.html', 'dynamic-table.html', 'shadow-dom.html', 'iframe-outer.html', 'iframe-inner.html', 'hidden-lazy.html'],
  scrapy: ['index.html', 'catalog-2.html', 'rules.html', 'quotes.html', 'quotes-2.html', 'authors.html', 'export.html'],
  exam: ['index.html', 'arena.html'],
};

export function moduleIdOf(relPath) {
  const parts = relPath.split('/');
  return parts.length > 1 ? parts[0] : '';
}

export function pageIdOf(relPath) {
  return relPath.replace(/\.html$/, '');
}

export function nav(relPath) {
  const p = prefixFor(relPath);
  const current = moduleIdOf(relPath);
  const items = MODULES.map((m) => {
    const active = m.id === current;
    return `        <li><a href="${p}${m.id}/index.html" title="${m.hint}"${active ? ' class="active" aria-current="page"' : ''}>${m.tab}</a></li>`;
  }).join('\n');

  const mod = MODULES.find((m) => m.id === current);
  const crumbs = mod
    ? ` <span class="sep">/</span> <a href="${p}${mod.id}/index.html">${mod.tab}</a>`
    : '';

  return `<header class="site-header">
  <div class="site-header__top">
    <a class="brand" href="${p}index.html">${SITE_NAME}<span class="brand__note">v1</span></a>
    <p class="tagline">${SITE_TAGLINE} · данные вымышлены · парсить разрешено</p>
  </div>
  <nav class="module-nav" aria-label="Модули тренажёра">
      <ul>
${items}
      </ul>
  </nav>
  <p class="crumbs"><a href="${p}index.html">Главная</a>${crumbs} <span class="sep">/</span> <code>${relPath}</code></p>
</header>`;
}

export function footer(relPath) {
  const p = prefixFor(relPath);
  return `<footer class="site-footer">
  <p><strong>${PROJECT}</strong> — вымышленный проект. Все названия, цены, e-mail, телефоны и тексты придуманы и не содержат реальных данных.</p>
  <ul class="site-footer__links">
    <li><a href="${p}basics/index.html">С чего начать: как пользоваться тренажёром</a></li>
    <li><a href="${p}robots.txt">robots.txt — правила обхода, которые стоит прочитать первым</a></li>
    <li><a href="${p}sitemap.xml">sitemap.xml — полный список страниц полигона</a></li>
    <li><a href="${p}feed.xml">feed.xml — RSS, ещё один формат данных без парсинга HTML</a></li>
    <li><a href="${p}data/products.json">data/products.json — тот же каталог сразу в JSON</a></li>
  </ul>
  <p class="site-footer__meta">Учебный полигон: нагрузки бояться не нужно, но отрабатывайте вежливость — <code>User-Agent</code>, задержка между запросами, <code>robots.txt</code>. Локально эти ответы отдаёт <code>node tools/serve.mjs</code>: редиректы, коды 401/403/429 и куки на GitHub Pages не воспроизводятся.</p>
</footer>`;
}

export function levelLabel(level) {
  return ['', 'новичок', 'база', 'уверенно', 'сложно', 'экзамен'][level] || 'база';
}

// Маршрут урока: куда идти дальше и откуда вернуться. relPath — путь вида
// 'http/headers.html'; titles — карта 'http/headers.html' -> текст <h1>.
export function lessonNav(relPath, titles = {}) {
  const parts = relPath.split('/');
  if (parts.length !== 2) return '';
  const route = LESSON_ROUTES[parts[0]];
  if (!route) return '';
  const i = route.indexOf(parts[1]);
  if (i === -1) return '';

  const mod = MODULES.find((m) => m.id === parts[0]);
  const link = (file, dir) => {
    const key = `${parts[0]}/${file}`;
    const title = titles[key] || file;
    return `<a class="lesson-nav__link lesson-nav__link--${dir}" href="${file}">
      <span class="lesson-nav__dir">${dir === 'prev' ? 'Назад' : 'Дальше'} · ${title}</span>
      <span class="lesson-nav__file">${file}</span>
    </a>`;
  };

  const prev = i > 0 ? link(route[i - 1], 'prev') : '<span class="lesson-nav__link lesson-nav__link--prev is-empty" aria-hidden="true"></span>';
  const next = i < route.length - 1 ? link(route[i + 1], 'next') : '<span class="lesson-nav__link lesson-nav__link--next is-empty" aria-hidden="true"></span>';

  return `<nav class="lesson-nav" aria-label="Маршрут по модулю ${mod ? mod.tab : parts[0]}">
  <p class="lesson-nav__note">${mod ? mod.tab : parts[0]}: урок ${i + 1} из ${route.length}. Страницы-мишени (карточки товаров, страницы каталога) в маршрут не входят — к ним ведут ссылки из заданий.</p>
  <div class="lesson-nav__row">
${prev}
${next}
  </div>
</nav>`;
}

export function taskCards(pageId, tasks) {
  const cards = tasks
    .map((t) => {
      const solutions = Object.entries(t.solution || {})
        .map(([k, v]) => `        <dt>${k}</dt>\n        <dd><code>${escapeHtml(v)}</code></dd>`)
        .join('\n');
      const answer = t.answer
        ? `\n      <p class="task__answer">Ответ: <code>${escapeHtml(String(t.answer))}</code></p>`
        : '';
      return `  <details class="task" data-task="${t.id}" data-level="${t.level}" open>
    <summary><span class="task__id">${t.id}</span> ${t.q} <span class="task__level">ур. ${t.level} · ${levelLabel(t.level)}</span></summary>
    <dl class="task__solution">
${solutions}
    </dl>${answer}
  </details>`;
    })
    .join('\n');

  const p = prefixFor(`${pageId}.html`);
  const hasAnswers = tasks.some((t) => t.answer);
  const legend = [
    'Откройте карточку: <code>css</code> и <code>xpath</code> решают одну задачу двумя способами, третья строка показывает то же самое кодом — bs4, requests или lxml, как в задании.',
    hasAnswers ? '<span class="with-hints">Последняя плашка — проверка: сверьте со своим результатом, прежде чем идти дальше.</span>' : '',
    `<span class="with-hints">Справа внизу живёт <a href="${p}basics/index.html">тренажёр селекторов</a>: вставьте туда своё выражение и посмотрите число совпадений, ещё не написав ни строчки кода.</span>`,
  ].filter(Boolean).join(' ');

  return `<section class="tasks" id="tasks" data-page="${pageId}">
  <h2 class="tasks__heading">Задания этой страницы</h2>
  <p class="tasks__legend">${legend}</p>
${cards}
</section>`;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
