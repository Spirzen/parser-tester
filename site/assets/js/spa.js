// Мини-SPA на хэш-роутинге для js/spa.html.
// Маршруты: #/prices, #/reviews, #/authors. Контент каждого маршрута —
// из одного JSON-эндпоинта ../data/site-stats.json, который fetched после загрузки страницы.
// Урок: хэш (#/...) не уходит на сервер — requests видит один и тот же HTML
// независимо от маршрута, а данные забираются напрямую из JSON.
(function () {
  'use strict';

  var ROUTES = ['#/prices', '#/reviews', '#/authors'];
  var DATA_URL = '../data/site-stats.json';
  var cache = null;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderSection(root, slug, section) {
    root.textContent = '';
    var h2 = el('h2', null, section.title);
    h2.id = 'spa-' + slug;
    root.appendChild(h2);

    if (section.kind === 'table') {
      var table = el('table', 'table--striped');
      var thead = el('thead');
      var headRow = el('tr');
      section.columns.forEach(function (c) { headRow.appendChild(el('th', null, c)); });
      thead.appendChild(headRow);
      table.appendChild(thead);
      var tbody = el('tbody');
      section.rows.forEach(function (r) {
        var tr = el('tr', 'spa-row');
        var cells = slug === 'prices'
          ? [r.sku, r.title, r.price, r.stock]
          : [r.name, r.city, r.total, r.email];
        cells.forEach(function (v) { tr.appendChild(el('td', null, v)); });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      root.appendChild(table);
    } else {
      var ul = el('ul', 'tree spa-list');
      section.items.forEach(function (item) {
        var li = el('li', 'spa-item');
        li.appendChild(el('strong', null, item.author + ' · ' + item.rating + ' ★'));
        li.appendChild(el('span', null, ' — ' + item.text));
        ul.appendChild(li);
      });
      root.appendChild(ul);
    }
  }

  function show(hash) {
    var root = document.getElementById('spa-root');
    var status = document.getElementById('spa-status');
    var links = document.querySelectorAll('.spa-nav a');
    var slug = hash.replace('#/', '');
    var section = cache && cache.sections ? cache.sections[slug] : null;

    links.forEach(function (a) {
      var active = a.getAttribute('href') === '#/' + slug;
      a.className = active ? 'active' : '';
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    if (!section) {
      root.textContent = '';
      root.appendChild(el('p', 'warn', 'Маршрут «' + hash + '» неизвестен. Доступны: ' + ROUTES.join(', ')));
      if (status) status.textContent = 'маршрут: ' + (hash || '(пусто)') + ' — раздел не найден';
      return;
    }
    renderSection(root, slug, section);
    if (status) {
      status.textContent = 'маршрут: #/' + slug + ' · отрисовано из ' + DATA_URL + ' (' + new Date().toLocaleTimeString('ru-RU') + ')';
    }
  }

  function boot() {
    var root = document.getElementById('spa-root');
    if (!root) return;

    var status = document.getElementById('spa-status');
    if (status) status.textContent = 'загрузка ' + DATA_URL + '…';

    var next = document.getElementById('spa-next');
    if (next) {
      next.addEventListener('click', function () {
        var i = ROUTES.indexOf(location.hash);
        location.hash = ROUTES[(i + 1 + ROUTES.length) % ROUTES.length];
      });
    }

    window.addEventListener('hashchange', function () { show(location.hash); });

    fetch(DATA_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) {
        cache = json;
        if (ROUTES.indexOf(location.hash) === -1) {
          // прямой заход без маршрута (или с неизвестным) — идём на #/prices
          location.hash = '#/prices';
          if (location.hash !== '#/prices') show('#/prices');
        }
        show(location.hash);
      })
      .catch(function (err) {
        root.textContent = '';
        root.appendChild(el('p', 'warn', 'Не удалось получить ' + DATA_URL + ': ' + err.message + '. Откройте страницу через локальный сервер (npm run serve).'));
      });

    if (!location.hash) location.hash = '#/prices';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
