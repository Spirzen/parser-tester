// Куки-тренажёр страницы http/cookies.html.
// Читает, пишет и удаляет cookies через document.cookie и рисует таблицу в #cookie-table.
// Внешних зависимостей нет: чистый DOM API, работает и на file:// (с предупреждением),
// и на http://localhost:8000, и в подпапке на GitHub Pages.
(function () {
  'use strict';

  var TABLE_ID = 'cookie-table';
  var STATUS_ROLE = '[data-role="cookie-status"]';
  var WEEK = 60 * 60 * 24 * 7;

  // Каталог текущей страницы: для /http/cookies.html это /http,
  // для /parser-tester/http/cookies.html — /parser-tester/http.
  function currentDirPath() {
    var parts = location.pathname.split('/');
    parts.pop();
    return parts.length > 1 ? parts.join('/') : '/';
  }

  var ROOT = '/';
  var DEMO = [
    { name: 'session_id', value: 'demo-session-42', path: ROOT, maxAge: 3600, note: 'идентификатор визита' },
    { name: 'cart', value: 'wagon-7', path: ROOT, maxAge: WEEK, note: 'состав корзины' },
    { name: 'theme', value: 'dark', path: ROOT, maxAge: 600, note: 'тема интерфейса' },
    { name: 'consent', value: 'granted', path: ROOT, maxAge: WEEK * 4, note: 'согласие на обработку' },
    { name: 'referral_code', value: 'TICHAJA-2026', path: currentDirPath(), maxAge: 3600, note: 'партнёрская метка, живёт только в каталоге страницы' }
  ];

  function encode(value) {
    return encodeURIComponent(String(value));
  }

  function write(name, value, options) {
    var o = options || {};
    var parts = [name + '=' + encode(value)];
    parts.push('Path=' + (o.path || ROOT));
    if (o.maxAge != null) parts.push('Max-Age=' + o.maxAge);
    if (o.expires) parts.push('Expires=' + o.expires.toUTCString());
    if (o.sameSite) parts.push('SameSite=' + o.sameSite);
    if (o.secure) parts.push('Secure');
    // HttpOnly из JavaScript поставить нельзя: так работает только Set-Cookie от сервера.
    document.cookie = parts.join('; ');
    return document.cookie.indexOf(name + '=') !== -1;
  }

  function readAll() {
    var raw = document.cookie ? document.cookie.split(';') : [];
    var out = [];
    raw.forEach(function (chunk) {
      var pair = chunk.trim();
      if (!pair) return;
      var i = pair.indexOf('=');
      var name = i === -1 ? pair : pair.slice(0, i);
      var value = i === -1 ? '' : pair.slice(i + 1);
      var demo = null;
      DEMO.forEach(function (d) {
        if (d.name === name) demo = d;
      });
      out.push({
        name: name,
        raw: value,
        value: decodeValue(value),
        path: demo ? demo.path : '—',
        note: demo ? demo.note : 'куки нет в демо-наборе: возможно, его поставил сервер'
      });
    });
    return out;
  }

  function decodeValue(value) {
    try {
      return decodeURIComponent(value.replace(/\+/g, ' '));
    } catch (e) {
      return value;
    }
  }

  // Удалить куки можно только тем же путём, которым её поставили: перебираем кандидаты.
  function erase(name) {
    var paths = [ROOT, currentDirPath(), location.pathname];
    var seen = {};
    paths.forEach(function (p) {
      if (seen[p]) return;
      seen[p] = true;
      document.cookie = name + '=; Path=' + p + '; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
      document.cookie = name + '=; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
    });
    return readAll().every(function (c) { return c.name !== name; });
  }

  function issueDemo() {
    var failed = [];
    DEMO.forEach(function (d) {
      if (!write(d.name, d.value, { path: d.path, maxAge: d.maxAge, sameSite: 'Lax' })) failed.push(d.name);
    });
    return failed;
  }

  function eraseAll() {
    readAll().forEach(function (c) { erase(c.name); });
  }

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function rowFor(cookie) {
    return '<tr class="cookie-row" data-cookie-name="' + esc(cookie.name) + '">'
      + '<td class="cookie-cell mono">' + esc(cookie.name) + '</td>'
      + '<td class="cookie-cell mono">' + esc(cookie.value) + '</td>'
      + '<td class="cookie-cell mono">' + esc(cookie.path) + '</td>'
      + '<td class="cookie-cell"><span class="dot dot--on" aria-hidden="true"></span>да</td>'
      + '<td class="cookie-cell">' + esc(cookie.note) + '</td>'
      + '<td class="cookie-cell"><button class="btn ghost" type="button" data-cookie-op="delete" data-cookie-name="' + esc(cookie.name) + '">удалить</button></td>'
      + '</tr>';
  }

  function render(table, status) {
    var list = readAll();
    var body = table.querySelector('tbody') || table;
    var head = '<tr><th>Имя</th><th>Значение</th><th>Path</th><th>Доступна из JS</th><th>Комментарий</th><th>Действие</th></tr>';
    if (body.tagName.toLowerCase() === 'tbody') {
      body.innerHTML = list.length ? list.map(rowFor).join('') : '';
      var thead = table.querySelector('thead');
      if (thead && !thead.querySelector('tr')) thead.innerHTML = head;
      status.textContent = list.length
        ? 'document.cookie вернул куки: ' + list.length + '. куки HttpOnly сюда не попадают — их не отдаёт браузерный API.'
        : 'Куки нет: нажмите «Выдать набор демо-куки» или зайдите через node tools/serve.mjs.';
    } else {
      table.innerHTML = '<thead>' + head + '</thead><tbody>' + list.map(rowFor).join('') + '</tbody>';
    }
    var count = document.querySelector('[data-role="cookie-count"]');
    if (count) count.textContent = String(list.length);
  }

  function init() {
    var table = document.getElementById(TABLE_ID);
    if (!table) return; // страница без виджета: скрипт ничего не делает
    var status = document.querySelector(STATUS_ROLE) || document.querySelector('.status');

    if (location.protocol === 'file:') {
      if (status) status.textContent = 'Открыт файл с диска: document.cookie на file:// не работает. Запустите node tools/serve.mjs и откройте http://localhost:8000/http/cookies.html';
      return;
    }

    document.addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('[data-cookie-op]') : null;
      if (!button) return;
      var action = button.getAttribute('data-cookie-op');
      if (action === 'issue') {
        var failed = issueDemo();
        if (status) {
          status.textContent = failed.length
            ? 'Не удалось записать: ' + failed.join(', ') + ' — проверьте, что страница открыта по http.'
            : 'Записали ' + DEMO.length + ' куки: ' + DEMO.map(function (d) { return d.name; }).join(', ') + '.';
        }
      } else if (action === 'clear') {
        eraseAll();
        if (status) status.textContent = 'Видимые из JS куки удалены. HttpOnly-куки остались: их удаляет только сервер.';
      } else if (action === 'read') {
        if (status) status.textContent = 'document.cookie → ' + (document.cookie || '(пусто)');
      } else if (action === 'delete') {
        var name = button.getAttribute('data-cookie-name');
        var ok = erase(name);
        if (status) status.textContent = (ok ? 'Кука ' : 'Не сняли куку ') + name + ': путь при удалении должен совпадать с путём записи.';
      } else {
        return;
      }
      render(table, status || document.createElement('p'));
      event.preventDefault();
    });

    render(table, status || document.createElement('p'));
    window.TikhayaCookies = { read: readAll, write: write, erase: erase, issueDemo: issueDemo, demo: DEMO };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
