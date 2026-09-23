// Сборка: site/ -> dist/ с внедрением навигации, заданий и футера.
// dist/ — это ровно то, что отдаётся на GitHub Pages: статичные файлы, без сервера.
import { mkdir, rm, cp, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { nav, footer, taskCards, lessonNav, pageIdOf, prefixFor, escapeHtml, SITE_NAME, PROJECT, LESSON_ROUTES } from './templates.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = path.join(ROOT, 'site');
const DIST = path.join(ROOT, 'dist');
const BASE_URL = (process.env.SITE_BASE_URL || '/').replace(/\/$/, '');

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function relOf(full) {
  return path.relative(DIST, full).split(path.sep).join('/');
}

async function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(await readFile(file, 'utf8'));
}

// 1. Копия исходников
await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(SITE, DIST, { recursive: true });

// 2. Задачи: site/data/tasks/<module>.json -> dist/data/tasks.json
const tasksDir = path.join(SITE, 'data', 'tasks');
const allTasks = {};
if (existsSync(tasksDir)) {
  for (const file of await readdir(tasksDir)) {
    if (!file.endsWith('.json')) continue;
    const chunk = await readJson(path.join(tasksDir, file), {});
    Object.assign(allTasks, chunk);
  }
}
await writeFile(path.join(DIST, 'data', 'tasks.json'), JSON.stringify(allTasks, null, 2) + '\n');

// 3. Маршруты уроков: заголовки страниц нужны, чтобы подпись «Дальше» была осмысленной
const titles = {};
for (const [mod, route] of Object.entries(LESSON_ROUTES)) {
  for (const file of route) {
    const rel = `${mod}/${file}`;
    const full = path.join(DIST, rel);
    if (!existsSync(full)) throw new Error(`LESSON_ROUTES: нет страницы ${rel}`);
    const src = await readFile(full, 'utf8');
    const h1 = src.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    titles[rel] = h1 ? h1[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : file;
  }
}

// 4. Внедрение маркеров
let pages = 0;
for await (const full of walk(DIST)) {
  if (!full.endsWith('.html')) continue;
  const rel = relOf(full);
  let html = await readFile(full, 'utf8');
  const pageId = pageIdOf(rel);

  html = html.replace(/<!--\s*inject:nav\s*-->/g, () => nav(rel));
  html = html.replace(/<!--\s*inject:footer\s*-->/g, () => footer(rel));
  html = html.replace(/<!--\s*inject:tasks\s*-->/g, () => {
    const list = allTasks[pageId];
    if (!list || !list.length) return `<!-- tasks: none declared for ${pageId} -->`;
    return taskCards(pageId, list);
  });

  const route = lessonNav(rel, titles);
  if (route) html = html.replace(/<\/main>/, () => `${route}\n</main>`);

  html = html.replace(/<script[^>]+assets\/js\/trainer\.js"[^>]*><\/script>/g, (match) => {    const p = prefixFor(rel);
    return `${match}\n<script src="${p}assets/js/common.js" defer></script>`;
  });

  html = html.replace(/<link rel="stylesheet" href="([^"]*)assets\/css\/main\.css" \/>/, (match, p) => `${match}\n  <link rel="icon" href="${p}favicon.svg" type="image/svg+xml" />`);

  // 404 отдаётся сервером на любом пути, поэтому её относительные ссылки разрешались бы
  // относительно папки запроса (/forms/post.html -> /forms/assets/...). base это чинит.
  if (rel === '404.html') {
    html = html.replace(/(<meta name="viewport"[^>]*\/>)/, `$1\n  <base href="${BASE_URL}/" />`);
  }

  if (/<title>/.test(html) === false) throw new Error(`${rel}: нет <title>`);
  await writeFile(full, html);
  pages += 1;
}

// 5. sitemap.xml и RSS из собранной карты страниц
const urls = [];
for await (const full of walk(DIST)) {
  if (!full.endsWith('.html')) continue;
  const rel = relOf(full);
  if (rel === '404.html') continue;
  urls.push(rel === 'index.html' ? '' : rel);
}
urls.sort();
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((u) => `  <url><loc>${BASE_URL}/${u}</loc><changefreq>yearly</changefreq><priority>0.7</priority></url>`)
  .join('\n')}
</urlset>
`;
await writeFile(path.join(DIST, 'sitemap.xml'), sitemap);

// robots.txt: ссылки на sitemap/rss должны быть абсолютными и соответствовать адресу деплоя
const robotsSrc = await readFile(path.join(SITE, 'robots.txt'), 'utf8');
const absolute = /^https?:\/\//.test(BASE_URL);
const robots = absolute
  ? robotsSrc
      .replace(/^Sitemap:\s*.+$/m, `Sitemap: ${BASE_URL}/sitemap.xml`)
      .replace(/^Rss:\s*.+$/m, `Rss: ${BASE_URL}/feed.xml`)
  : robotsSrc;
await writeFile(path.join(DIST, 'robots.txt'), robots);

const articles = await readJson(path.join(SITE, 'data', 'articles.json'), { articles: [] });
const channel = `${SITE_NAME} — ${PROJECT}`;
const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(channel)}</title>
    <link>${BASE_URL || ''}/index.html</link>
    <description>Лента новостей учебного полигона для тренировки парсинга.</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${(articles.articles || [])
  .map(
    (a) => `    <item>
      <title>${escapeHtml(a.title)}</title>
      <link>${BASE_URL}/${a.url}</link>
      <guid isPermaLink="false">${escapeHtml(a.id)}</guid>
      <pubDate>${new Date(a.date + 'T09:00:00Z').toUTCString()}</pubDate>
      <category>${escapeHtml(a.category)}</category>
      <description>${escapeHtml(a.summary)}</description>
    </item>`
  )
  .join('\n')}
  </channel>
</rss>
`;
await writeFile(path.join(DIST, 'feed.xml'), feed);

console.log(`build: страниц ${pages}, задач ${Object.keys(allTasks).length}, url в sitemap ${urls.length}`);
