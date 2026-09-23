// Динамические страницы модуля «Пагинация»: три режима подгрузки товаров из ../data/products.json.
// Запускать по HTTP: node tools/serve.mjs   (по file:// fetch блокируется браузером — это ожидаемо)
//
// Режим задаётся атрибутом data-mode у контейнера:
//   data-mode="load-more"  — кнопка «Показать ещё», порциями по data-page-size
//   data-mode="infinite"   — IntersectionObserver по контейнер data-sentinel
//   data-mode="query"      — одна страница из query-параметров ?page=&size=&category=
//
// Контейнеру доступны атрибуты: data-src, data-page-size, data-item-class, data-button,
// data-status, data-sentinel, data-count, data-total. После загрузки контейнер получает
// data-shown, data-pages, data-current и data-empty="true", когда больше загружать нечего.
(function () {
  'use strict';

  var SOURCE_DEFAULT = '../data/products.json';
  var BATCH_NOTE = 'уценка';

  function formatPrice(value) {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';
  }

  // 12 товаров каталога + 12 позиций партии уценки = 24 позиции: список достаточно длинный,
  // чтобы подгрузка была заметна, и достаточно короткий, чтобы сверять его руками.
  function buildCatalog(products) {
    var main = products.map(function (p, i) {
      return {
        index: i + 1,
        sku: p.sku,
        title: p.title,
        category: p.category,
        price: p.price,
        stock: p.stock,
        batch: 'основная партия',
        url: '../scrapy/' + p.url,
      };
    });
    var discount = products.map(function (p, i) {
      return {
        index: main.length + i + 1,
        sku: p.sku + '-У',
        title: p.title + ' — уценка',
        category: p.category,
        price: Math.round(p.price * 0.8),
        stock: p.stock > 4 ? p.stock - 4 : 0,
        batch: BATCH_NOTE,
        url: '../scrapy/' + p.url,
      };
    });
    return main.concat(discount);
  }

  function itemMarkup(item, cls) {
    var li = document.createElement('li');
    li.className = cls;
    li.setAttribute('data-sku', item.sku);
    li.setAttribute('data-index', String(item.index));
    li.setAttribute('data-category', item.category);
    li.setAttribute('data-price', String(item.price));
    li.setAttribute('data-batch', item.batch);
    if (!item.stock) li.setAttribute('data-out-of-stock', 'true');
    var link = document.createElement('a');
    link.className = cls + '__link';
    link.setAttribute('href', item.url);
    link.textContent = item.title;
    var price = document.createElement('span');
    price.className = 'price';
    price.setAttribute('data-price', String(item.price));
    price.setAttribute('data-currency', 'RUB');
    price.textContent = formatPrice(item.price);
    var meta = document.createElement('span');
    meta.className = 'product-card__meta';
    meta.textContent = item.category + ' · ' + item.sku + ' · ' +
      (item.stock ? 'в наличии: ' + item.stock : 'нет в наличии') + ' · ' + item.batch;
    li.appendChild(link);
    li.appendChild(price);
    li.appendChild(meta);
    return li;
  }

  function setText(node, value) {
    if (node) node.textContent = value;
  }

  function findNode(selector) {
    return selector ? document.querySelector(selector) : null;
  }

  function warnOffline(box, message) {
    if (!box) return;
    box.className = 'warn';
    box.textContent = message;
  }

  function readProducts(src) {
    return fetch(src, { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (payload) {
        return buildCatalog(payload.products || []);
      });
  }

  // ---------- режим 1: кнопка «Показать ещё» ----------
  function initLoadMore(box, config) {
    var status = findNode(config.status);
    var button = findNode(config.button);
    var shown = 0;

    return readProducts(config.src).then(function (catalog) {
      var size = config.pageSize;
      box.setAttribute('data-total-items', String(catalog.length));

      function render() {
        setText(findNode(config.count), String(shown));
        setText(findNode(config.totalNode), String(catalog.length));
        box.setAttribute('data-shown', String(shown));
        if (button) {
          if (shown >= catalog.length) {
            button.disabled = true;
            button.textContent = 'Загружать больше нечего';
            setText(status, 'всё: показано ' + catalog.length + ' из ' + catalog.length + ', новых позиций сервер не отдаёт');
          } else {
            button.disabled = false;
            button.textContent = 'Показать ещё ' + Math.min(size, catalog.length - shown);
            setText(status, 'готово: показано ' + shown + ' из ' + catalog.length);
          }
        }
      }

      function load() {
        if (shown >= catalog.length) return;
        setText(status, 'идёт загрузка…');
        if (button) button.disabled = true;
        // Имитация сетевого запроса: данные уже в памяти, но статус виден глазом.
        window.setTimeout(function () {
          var frag = document.createDocumentFragment();
          catalog.slice(shown, shown + size).forEach(function (item) {
            frag.appendChild(itemMarkup(item, config.itemClass));
          });
          box.appendChild(frag);
          shown += Math.min(size, catalog.length - shown);
          render();
        }, 250);
      }

      if (button) button.addEventListener('click', load);
      load();
    }).catch(function (err) {
      warnOffline(status, 'Не удалось прочитать ' + config.src + ' (' + err.message +
        '). Откройте страницу через локальный сервер: node tools/serve.mjs');
    });
  }

  // ---------- режим 2: бесконечная прокрутка ----------
  function initInfinite(box, config) {
    var status = findNode(config.status);
    var sentinel = findNode(config.sentinel);
    var shown = 0;

    return readProducts(config.src).then(function (catalog) {
      var size = config.pageSize;
      box.setAttribute('data-total-items', String(catalog.length));
      box.setAttribute('data-empty', 'false');

      function finish() {
        box.setAttribute('data-empty', 'true');
        box.setAttribute('data-shown', String(shown));
        setText(status, 'всё: долистали до конца, дальше data-empty="true"');
        if (observer) observer.disconnect();
      }

      function step() {
        if (shown >= catalog.length) return finish();
        setText(status, 'идёт загрузка…');
        var frag = document.createDocumentFragment();
        catalog.slice(shown, shown + size).forEach(function (item) {
          frag.appendChild(itemMarkup(item, config.itemClass));
        });
        box.appendChild(frag);
        shown += Math.min(size, catalog.length - shown);
        box.setAttribute('data-shown', String(shown));
        setText(findNode(config.count), String(shown));
        setText(findNode(config.totalNode), String(catalog.length));
        if (shown >= catalog.length) finish();
        else {
          setText(status, 'загружено ' + shown + ' из ' + catalog.length + ' — крутите дальше');
          // Наблюдатель сообщает только об изменении пересечения. Если маркер после догрузки
          // всё ещё в области видимости (порция короче экрана), второго вызова не будет и
          // лента встанет на первой же пачке — поэтому пересечение проверяем заново.
          if (observer) {
            observer.unobserve(sentinel);
            observer.observe(sentinel);
          }
        }
      }

      var observer = null;
      if ('IntersectionObserver' in window && sentinel) {
        observer = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) step();
          });
        }, { rootMargin: '120px 0px' });
        observer.observe(sentinel);
        // Наблюдатель сообщает только об изменении пересечения: резкий прыжок через маркер
        // (scrollTo до низа, Ctrl+End) он не заметит, и лента встанет на первой порции.
        // Поэтому ту же проверку дублируем на событии прокрутки.
        window.addEventListener('scroll', function () {
          var vh = window.innerHeight || document.documentElement.clientHeight;
          if (shown < catalog.length && sentinel.getBoundingClientRect().top <= vh + 120) step();
        }, { passive: true });
      } else {
        // Браузер без IntersectionObserver: грузим сразу, урок всё равно показывается.
        while (shown < catalog.length) step();
      }
    }).catch(function (err) {
      warnOffline(status, 'Не удалось прочитать ' + config.src + ' (' + err.message +
        '). Откройте страницу через локальный сервер: node tools/serve.mjs');
    });
  }

  // ---------- режим 3: страницы через query-параметры ----------
  function initQuery(box, config) {
    var status = findNode(config.status);
    var params = new URLSearchParams(window.location.search);

    return readProducts(config.src).then(function (catalog) {
      var size = Math.max(Number(params.get('size')) || config.pageSize, 1);
      var category = (params.get('category') || '').trim();
      var pool = category ? catalog.filter(function (item) {
        return item.category.toLowerCase() === category.toLowerCase();
      }) : catalog;
      var pages = Math.max(Math.ceil(pool.length / size), 1);
      var requested = Math.max(Number(params.get('page')) || 1, 1);
      var page = requested;

      if (page > pages) {
        // Как честный API: за концом выборки — пустая страница, а не перенаправление на последнюю.
        box.setAttribute('data-shown', '0');
        box.setAttribute('data-pages', String(pages));
        box.setAttribute('data-current', String(page));
        box.setAttribute('data-total-items', String(pool.length));
        box.setAttribute('data-empty', 'true');
        setText(findNode(config.count), '0');
        setText(findNode(config.totalNode), String(pool.length));
        setText(status, 'получено ?' + window.location.search.replace(/^\?/, '') +
          ' → страница ' + page + ' вне диапазона: страниц в выборке — ' + pages + ', позиций на странице: 0');
      } else {
        var items = pool.slice((page - 1) * size, page * size);
        items.forEach(function (item) {
          box.appendChild(itemMarkup(item, config.itemClass));
        });
        box.setAttribute('data-shown', String(items.length));
        box.setAttribute('data-pages', String(pages));
        box.setAttribute('data-current', String(page));
        box.setAttribute('data-total-items', String(pool.length));
        box.setAttribute('data-empty', page >= pages ? 'true' : 'false');
        setText(findNode(config.count), String(items.length));
        setText(findNode(config.totalNode), String(pool.length));
        setText(status, 'получено ?' + (window.location.search.replace(/^\?/, '') || 'без параметров') +
          ' → страница ' + page + ' из ' + pages + ', позиций: ' + items.length +
          (category ? ' в категории «' + category + '»' : ''));
      }

      var echo = findNode('[data-role="query-echo"]');
      if (echo) {
        echo.innerHTML = '';
        [['page', params.get('page')], ['size', params.get('size')], ['category', params.get('category')]]
          .forEach(function (pair) {
            var tr = document.createElement('tr');
            var name = document.createElement('th');
            name.scope = 'row';
            name.textContent = pair[0];
            var value = document.createElement('td');
            value.textContent = pair[1] === null ? '— (нет в URL, взято значение по умолчанию)' : pair[1];
            tr.appendChild(name);
            tr.appendChild(value);
            echo.appendChild(tr);
          });
      }

      var pager = findNode('[data-role="query-pager"]');
      if (pager) {
        for (var p = 1; p <= pages; p += 1) {
          var li = document.createElement('li');
          var query = new URLSearchParams();
          query.set('page', String(p));
          query.set('size', String(size));
          if (category) query.set('category', category);
          if (p === page) {
            var span = document.createElement('span');
            span.className = 'is-current';
            span.setAttribute('aria-current', 'page');
            span.textContent = String(p);
            li.appendChild(span);
          } else {
            var a = document.createElement('a');
            a.setAttribute('href', window.location.pathname.split('/').pop() + '?' + query.toString());
            if (p === page + 1) a.setAttribute('rel', 'next');
            if (p === page - 1) a.setAttribute('rel', 'prev');
            a.textContent = String(p);
            li.appendChild(a);
          }
          pager.appendChild(li);
        }
      }
    }).catch(function (err) {
      warnOffline(status, 'Не удалось прочитать ' + config.src + ' (' + err.message +
        '). Откройте страницу через локальный сервер: node tools/serve.mjs');
    });
  }

  function boot() {
    // Селектор по трём известным режимам: блок-тренажёр тоже вешает data-mode на свои кнопки.
    var boxes = document.querySelectorAll(
      '[data-mode="load-more"], [data-mode="infinite"], [data-mode="query"]'
    );
    Array.prototype.forEach.call(boxes, function (box) {
      var config = {
        mode: box.getAttribute('data-mode'),
        src: box.getAttribute('data-src') || SOURCE_DEFAULT,
        pageSize: Number(box.getAttribute('data-page-size')) || 8,
        itemClass: box.getAttribute('data-item-class') || 'product-item',
        button: box.getAttribute('data-button'),
        status: box.getAttribute('data-status'),
        sentinel: box.getAttribute('data-sentinel'),
        count: box.getAttribute('data-count'),
        totalNode: box.getAttribute('data-total'),
      };
      if (config.mode === 'load-more') initLoadMore(box, config);
      else if (config.mode === 'infinite') initInfinite(box, config);
      else if (config.mode === 'query') initQuery(box, config);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
