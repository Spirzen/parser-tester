// Локальный сервер учебного полигона: статика из dist/ + «живые» HTTP-ответы,
// которые невозможны на GitHub Pages: настоящие 301/302, коды 4xx/5xx, Set-Cookie,
// задержки, JSON API с параметрами, charset windows-1252/1251, сжатие.
// Запуск: node tools/serve.mjs [--port 8000]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number((process.argv.find((a, i) => process.argv[i - 1] === '--port') || 8000));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Кодировка windows-1251: таблицу разворачиваем из TextDecoder, чтобы не держать захардкоженную таблицу.
const CP1251 = (() => {
  const map = new Map();
  for (let byte = 0; byte < 256; byte += 1) {
    const ch = new TextDecoder('windows-1251').decode(new Uint8Array([byte]));
    if (ch !== '\ufffd' && !map.has(ch)) map.set(ch, byte);
  }
  return map;
})();

function toCp1251(text) {
  const bytes = [];
  for (const ch of text) bytes.push(CP1251.get(ch) ?? CP1251.get('?'));
  return Buffer.from(bytes);
}

function send(res, code, body, headers = {}) {
  const isBuffer = Buffer.isBuffer(body);
  const payload = isBuffer ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  res.writeHead(code, {
    'Content-Length': payload.length,
    'X-Powered-By': 'parsing-trainer',
    'Access-Control-Allow-Origin': '*',
    ...headers,
  });
  res.end(payload);
}

const html = (title, rows) => `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title>
<link rel="stylesheet" href="/assets/css/main.css"></head><body class="page">
<h1>${title}</h1>${rows}</body></html>`;

async function products() {
  const raw = await readFile(path.join(DIST, 'data', 'products.json'), 'utf8');
  return JSON.parse(raw).products;
}

const routes = {
  'GET /http/redirect-301': (ctx, res) =>
    send(res, 301, '', { Location: '/http/final.html', 'X-Note': 'moved permanently, update your cache' }),

  'GET /http/redirect-302': (ctx, res) =>
    send(res, 302, '', { Location: '/http/final.html', 'X-Note': 'temporary redirect' }),

  'GET /http/redirect-chain': (ctx, res) => {
    const hop = Number(ctx.url.searchParams.get('hop') || 1);
    if (hop > 3) return send(res, 200, html('Конец цепочки', '<p>Вы прошли 3 редиректа. Итоговый URL: <code>' + ctx.path + '</code></p>'), { 'Content-Type': MIME['.html'] });
    return send(res, 302, '', { Location: `/http/redirect-chain?hop=${hop + 1}` });
  },

  'GET /http/status': (ctx, res) => {
    const code = Number(ctx.url.searchParams.get('code') || 200);
    if (code === 429) return send(res, 429, { error: 'too_many_requests', hint: 'усыпите и повторите' }, { 'Retry-After': '2' });
    if (code === 503) return send(res, 503, { error: 'service_unavailable' }, { 'Retry-After': '5' });
    if (code === 401) return send(res, 401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Basic realm="trainer"' });
    if (code === 403) return send(res, 403, { error: 'forbidden' });
    if (code === 404) return send(res, 404, { error: 'not_found' });
    return send(res, 200, { ok: true, code });
  },

  'GET /http/echo': (ctx, res) =>
    send(res, 200, { method: ctx.req.method, path: ctx.path, query: Object.fromEntries(ctx.url.searchParams), headers: ctx.req.headers, cookies: ctx.req.headers.cookie || null }, { 'Content-Type': MIME['.json'] }),

  'GET /http/cookies': (ctx, res) =>
    send(res, 200, html('Куки на сервере', `<pre>${JSON.stringify({ received: ctx.req.headers.cookie || 'нет куки' }, null, 2)}</pre>`), {
      'Content-Type': MIME['.html'],
      'Set-Cookie': [
        'session_id=demo-session-42; Path=/; Max-Age=3600',
        'cart=wagon-7; Path=/http; HttpOnly',
        'theme=dark; Path=/; Max-Age=600; SameSite=Lax',
      ],
    }),

  'GET /http/protected': (ctx, res) => {
    const key = ctx.req.headers['x-api-key'];
    if (key !== 'trainer-demo-key') return send(res, 401, { error: 'no_api_key', hint: 'заголовок X-API-Key: trainer-demo-key' });
    return send(res, 200, { secret: 'ключ подошёл', data: [1, 2, 3] });
  },

  'GET /http/slow': async (ctx, res) => {
    const ms = Math.min(Number(ctx.url.searchParams.get('ms') || 1500), 20000);
    await new Promise((r) => setTimeout(r, ms));
    return send(res, 200, html('Медленный ответ', `<p>Ждали ${ms} мс. Тренируйте <code>timeout=</code> у requests и <code>urlopen</code>.</p>`), { 'Content-Type': MIME['.html'] });
  },

  'GET /http/charset': (ctx, res) => {
    const body = '<html><head><meta charset="windows-1251"><title>Старый сайт</title></head><body><h1>Щука и флинт</h1><p class="note">Текст в windows-1251: «ёжик в тумане».</p></body></html>';
    return send(res, 200, toCp1251(body), { 'Content-Type': 'text/html; charset=windows-1251' });
  },

  'GET /http/api/product': async (ctx, res) => {
    const id = ctx.url.searchParams.get('id');
    const all = await products();
    const item = all.find((p) => String(p.id) === String(id));
    if (!item) return send(res, 404, { error: 'no_such_product', id });
    return send(res, 200, item, { 'Content-Type': MIME['.json'], ETag: `"p${id}"` });
  },

  'GET /http/api/products': async (ctx, res) => {
    const page = Math.max(Number(ctx.url.searchParams.get('page') || 1), 1);
    const size = Math.min(Math.max(Number(ctx.url.searchParams.get('size') || 8), 1), 50);
    const category = ctx.url.searchParams.get('category');
    let all = await products();
    if (category) all = all.filter((p) => p.category === category);
    const start = (page - 1) * size;
    return send(res, 200, {
      page,
      size,
      total: all.length,
      pages: Math.ceil(all.length / size) || 1,
      next: start + size < all.length ? `/http/api/products?page=${page + 1}&size=${size}${category ? `&category=${category}` : ''}` : null,
      items: all.slice(start, start + size),
    }, { 'Content-Type': MIME['.json'] });
  },
};
routes['POST /http/echo'] = async (ctx, res) => {
  const chunks = [];
  for await (const chunk of ctx.req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  let fields = null;
  const type = ctx.req.headers['content-type'] || '';
  if (type.startsWith('application/x-www-form-urlencoded')) fields = Object.fromEntries(new URLSearchParams(raw));
  else if (type.startsWith('application/json')) { try { fields = JSON.parse(raw); } catch { fields = { error: 'не валидный JSON' }; } }
  return send(res, 200, {
    method: 'POST',
    content_type: type || null,
    fields,
    raw_length: raw.length,
    raw_sample: raw.slice(0, 400),
    headers: ctx.req.headers,
  }, { 'Content-Type': MIME['.json'] });
};

const ENDPOINTS = [
  ['GET', '/http/redirect-301', 'настоящий 301 → /http/final.html'],
  ['GET', '/http/redirect-302', '302 → /http/final.html'],
  ['GET', '/http/redirect-chain', 'цепочка из 3 редиректов (?hop=)'],
  ['GET', '/http/status?code=429', 'любой код: 200 401 403 404 429 503 + Retry-After'],
  ['GET', '/http/echo', 'показывает заголовки, query и куки запроса'],
  ['POST', '/http/echo', 'то же для POST-формы'],
  ['GET', '/http/cookies', 'выдаёт три Set-Cookie и показывает принятые'],
  ['GET', '/http/protected', '401 без заголовка X-API-Key: trainer-demo-key'],
  ['GET', '/http/slow?ms=3000', 'отвечает с задержкой — тренировка timeout'],
  ['GET', '/http/charset', 'HTML в windows-1251 — борьба с кракозябрами'],
  ['GET', '/http/api/products?page=1&size=8&category=', 'JSON API с постраничной выдачей'],
  ['GET', '/http/api/product?id=3', 'карточка товара по id, ETag, 404 для неверного id'],
];

async function serveStatic(ctx, res) {
  let rel = decodeURIComponent(ctx.url.pathname).replace(/^\/+/, '');
  if (rel === '') rel = 'index.html';
  let file = path.join(DIST, rel);
  if (!file.startsWith(DIST)) return send(res, 403, { error: 'outside root' });
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = path.join(file, 'index.html');
  } catch {
    /* дальше попробуем .html */
  }
  for (const candidate of [file, file + '.html']) {
    try {
      const body = await readFile(candidate);
      const ext = path.extname(candidate);
      if (ext === '.html' && ctx.url.searchParams.get('debug') === '1') {
        return send(res, 200, body, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Debug': 'raw html' });
      }
      return send(res, 200, body, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    } catch {
      /* нет файла — идём к следующему кандидату */
    }
  }
  try {
    const notFound = await readFile(path.join(DIST, '404.html'));
    return send(res, 404, notFound, { 'Content-Type': MIME['.html'] });
  } catch {
    return send(res, 404, '404');
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const key = `${req.method} ${url.pathname}`;
  const ctx = { req, url, path: url.pathname };
  const route = routes[key];
  if (route) {
    try {
      return await route(ctx, res);
    } catch (err) {
      return send(res, 500, { error: String(err && err.message) });
    }
  }
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(ctx, res);
  return send(res, 405, { error: 'method_not_allowed' });
}).listen(PORT, () => {
  console.log(`\nПарсинг-тренажёр: http://localhost:${PORT}/\n`);
  console.log('Учебные HTTP-эндпоинты (работают только на локальном сервере, на Pages их заменяет JS):');
  for (const [m, p, note] of ENDPOINTS) console.log(`  ${m.padEnd(5)} ${p.padEnd(46)} ${note}`);
  console.log('');
});
