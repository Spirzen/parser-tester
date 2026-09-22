// Общие HTML-блоки, которые build.mjs внедряет в страницы по маркерам.
// Маркеры в исходниках: <!-- inject:nav --> <!-- inject:tasks --> <!-- inject:footer -->

export const SITE_NAME = 'Парсинг-тренажёр';
export const SITE_TAGLINE = 'Учебный сайт-мишень для тренировки веб-парсинга';
export const PROJECT = 'Тихая бухта';

export const MODULES = [
  { id: 'basics', tab: 'Основы', title: 'Основы запросов' },
  { id: 'selectors', tab: 'Селекторы', title: 'CSS и XPath селекторы' },
  { id: 'http', tab: 'HTTP', title: 'HTTP, куки и API' },
  { id: 'markup', tab: 'HTML-разметка', title: 'HTML-разметка и навигация по дереву' },
  { id: 'pagination', tab: 'Пагинация', title: 'Пагинация и обход страниц' },
  { id: 'forms', tab: 'Формы', title: 'Формы, POST и авторизация' },
  { id: 'js', tab: 'JS-страницы', title: 'JavaScript-страницы' },
  { id: 'scrapy', tab: 'Scrapy', title: 'Сценарии для Scrapy' },
  { id: 'exam', tab: 'Экзамен', title: 'Экзамен' },
];

export function prefixFor(relPath) {
  const depth = relPath.split('/').length - 1;
  return depth === 0 ? '' : '../'.repeat(depth);
}

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
    return `        <li><a href="${p}${m.id}/index.html"${active ? ' class="active" aria-current="page"' : ''}>${m.tab}</a></li>`;
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
  <p class="site-footer__links">
    <a href="${p}robots.txt">robots.txt</a> ·
    <a href="${p}sitemap.xml">sitemap.xml</a> ·
    <a href="${p}feed.xml">feed.xml</a> ·
    <a href="${p}data/products.json">data/products.json</a> ·
    <a href="${p}basics/index.html">как пользоваться тренажёром</a>
  </p>
  <p class="site-footer__meta">Учебный полигон: нагрузки бояться не нужно, но отрабатывайте вежливость — <code>User-Agent</code>, задержка между запросами, <code>robots.txt</code>.</p>
</footer>`;
}

export function levelLabel(level) {
  return ['', 'новичок', 'база', 'уверенно', 'сложно', 'экзамен'][level] || 'база';
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

  return `<section class="tasks" id="tasks" data-page="${pageId}">
  <h2 class="tasks__heading">Задания этой страницы</h2>
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
