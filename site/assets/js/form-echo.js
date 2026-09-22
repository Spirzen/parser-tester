// Страница результатов учебной формы: читает location.search, показывает принятые
// параметры таблицей и фильтрует ../data/products.json.
// Режима нет: всё поведение определяется набором query-параметров, как на реальном сайте.
// Запуск: node tools/serve.mjs → http://localhost:8000/forms/results.html?q=термос
(function () {
  'use strict';

  var SOURCE = '../data/products.json';

  var FIELDS = [
    { name: 'q', note: 'подстрока в названии, описании и тегах; регистр не важен' },
    { name: 'category', note: 'точное совпадение категории (мебель, горелки, одежда, свет, лагерь, посуда, снаряжение)' },
    { name: 'tags', note: 'повторяющийся параметр: ?tags=титан&tags=поход — товар должен содержать все отмеченные теги' },
    { name: 'price_min', note: 'число, цена не меньше' },
    { name: 'price_max', note: 'число, цена не больше' },
    { name: 'sort', note: 'price-asc | price-desc | rating | reviews' },
    { name: 'in_stock', note: 'любое непустое значение — только позиции со stock > 0' },
    { name: 'page', note: 'на этой странице не используется: пример параметра, который парсер обязан проигнорировать' },
  ];

  function num(value) {
    var n = parseFloat(value);
    return isNaN(n) ? null : n;
  }

  function formatPrice(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';
  }

  function textOf(product) {
    return (product.title + ' ' + product.description + ' ' + product.tags.join(' ')).toLowerCase();
  }

  function filter(products, params) {
    var query = (params.get('q') || '').trim().toLowerCase();
    var category = (params.get('category') || '').trim();
    var tags = params.getAll('tags').filter(Boolean);
    var min = num(params.get('price_min'));
    var max = num(params.get('price_max'));
    var onlyStock = params.get('in_stock');

    var out = products.filter(function (p) {
      if (query && textOf(p).indexOf(query) === -1) return false;
      if (category && p.category !== category) return false;
      if (tags.length && !tags.every(function (t) { return p.tags.indexOf(t) !== -1; })) return false;
      if (min !== null && p.price < min) return false;
      if (max !== null && p.price > max) return false;
      if (onlyStock && !p.stock) return false;
      return true;
    });

    var sort = params.get('sort');
    if (sort === 'price-asc') out.sort(function (a, b) { return a.price - b.price; });
    else if (sort === 'price-desc') out.sort(function (a, b) { return b.price - a.price; });
    else if (sort === 'rating') out.sort(function (a, b) { return b.rating - a.rating; });
    else if (sort === 'reviews') out.sort(function (a, b) { return b.reviews - a.reviews; });
    return out;
  }

  function renderEcho(params) {
    var box = document.getElementById('echo');
    if (!box) return;
    box.innerHTML = '';
    var given = 0;
    FIELDS.forEach(function (field) {
      var values = params.getAll(field.name);
      if (values.length) given += 1;
      var tr = document.createElement('tr');
      var name = document.createElement('th');
      name.scope = 'row';
      name.textContent = field.name;
      var value = document.createElement('td');
      value.setAttribute('data-param', field.name);
      value.className = 'mono';
      value.textContent = values.length ? values.join(' · ') : '—';
      var note = document.createElement('td');
      note.className = 'muted';
      note.textContent = field.note;
      tr.appendChild(name);
      tr.appendChild(value);
      tr.appendChild(note);
      box.appendChild(tr);
    });

    var raw = document.getElementById('raw-query');
    if (raw) raw.textContent = window.location.search ? decodeURIComponent(window.location.search) : '(пусто)';
    var encoded = document.getElementById('encoded-query');
    if (encoded) encoded.textContent = window.location.search || '(пусто)';
    var counter = document.getElementById('params-count');
    if (counter) counter.textContent = String(given);

    var hint = document.getElementById('no-params');
    if (hint) hint.hidden = given !== 0;
  }

  function renderResults(products) {
    var list = document.getElementById('results');
    if (!list) return;
    list.innerHTML = '';
    products.forEach(function (p) {
      var card = document.createElement('article');
      card.className = 'result card';
      card.setAttribute('data-sku', p.sku);
      card.setAttribute('data-category', p.category);
      card.setAttribute('data-price', String(p.price));
      card.setAttribute('data-stock', String(p.stock));

      var title = document.createElement('h3');
      title.className = 'result__title';
      var link = document.createElement('a');
      link.setAttribute('href', '../scrapy/' + p.url);
      link.textContent = p.title;
      title.appendChild(link);

      var price = document.createElement('p');
      price.className = 'result__price';
      var amount = document.createElement('span');
      amount.className = 'price';
      amount.setAttribute('data-price', String(p.price));
      amount.setAttribute('data-currency', p.currency);
      amount.textContent = formatPrice(p.price);
      price.appendChild(amount);

      var meta = document.createElement('p');
      meta.className = 'result__meta muted';
      meta.textContent = p.category + ' · ' + p.seller + ' · рейтинг ' + p.rating.toFixed(1) +
        ' · ' + (p.stock ? 'в наличии: ' + p.stock : 'нет в наличии');

      card.appendChild(title);
      card.appendChild(price);
      card.appendChild(meta);
      list.appendChild(card);
    });

    var counter = document.getElementById('results-count');
    if (counter) counter.textContent = String(products.length);
    var empty = document.getElementById('empty-note');
    if (empty) empty.hidden = products.length !== 0;
  }

  function fail(message) {
    var status = document.getElementById('query-status');
    if (!status) return;
    status.className = 'warn';
    status.textContent = message;
  }

  function boot() {
    var params = new URLSearchParams(window.location.search);
    renderEcho(params);

    fetch(SOURCE, { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (payload) {
        var products = payload.products || [];
        var found = filter(products, params);
        renderResults(found);
        var status = document.getElementById('query-status');
        if (status) {
          status.textContent = 'получено ' + params.toString().length + ' символов запроса, ' +
            'параметров со значением: ' + Array.from(new Set(params.keys())).length +
            ', товаров в ответе: ' + found.length + ' из ' + products.length;
        }
        var total = document.getElementById('catalog-count');
        if (total) total.textContent = String(products.length);
      })
      .catch(function (err) {
        renderResults([]);
        fail('Не удалось прочитать ' + SOURCE + ' (' + err.message +
          '). Откройте страницу через локальный сервер: node tools/serve.mjs — по file:// fetch блокируется.');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
