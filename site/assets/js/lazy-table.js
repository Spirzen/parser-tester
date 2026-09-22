// Динамическая таблица остатков + ленивые карточки по прокрутке.
// Используется двумя страницами модуля «JS-страницы»:
//   js/dynamic-table.html — таблица появляется через 1,5 с, кнопка обновляет числа;
//   js/hidden-lazy.html   — IntersectionObserver догружает JSON по атрибуту data-src.
// Никаких зависимостей: только чистый DOM API и fetch.
(function () {
  'use strict';

  // Стартовые строки: sku, название, количество, дата последней приёмки.
  var ROWS = [
    { sku: 'TB-3020', title: 'Фонарь налобный «Светляк 400»', qty: 23, restock: '2026-03-05' },
    { sku: 'TB-4030', title: 'Палатка двухместная «Бухта 2»', qty: 3, restock: '2026-03-13' },
    { sku: 'TB-4031', title: 'Спальник пуховый −7 °C', qty: 9, restock: '2026-02-27' },
    { sku: 'TB-5040', title: 'Термос 0.75 л «Полночь»', qty: 31, restock: '2026-03-09' },
    { sku: 'TB-5041', title: 'Котелок титановый 700 мл', qty: 12, restock: '2026-01-22' },
    { sku: 'TB-6051', title: 'Гермомешок 25 л', qty: 55, restock: '2026-02-14' }
  ];

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function stamp() {
    var d = new Date();
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  // Детерминированный «шум»: при каждом обновлении количество меняется
  // в пределах ±40 % от базы, но не становится отрицательным.
  function shuffleRows(salt) {
    return ROWS.map(function (row, i) {
      var wave = Math.round(row.qty * 0.4 * Math.sin(salt + i * 1.7));
      var qty = Math.max(0, row.qty + wave + (salt % 3));
      return { sku: row.sku, title: row.title, qty: qty, restock: row.restock };
    });
  }

  function renderTable(tbody, rows) {
    tbody.textContent = '';
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.className = 'row-stock';
      tr.setAttribute('data-sku', row.sku);
      tr.setAttribute('data-qty', String(row.qty));

      var tdSku = document.createElement('td');
      tdSku.className = 'mono';
      tdSku.textContent = row.sku;

      var tdTitle = document.createElement('td');
      tdTitle.textContent = row.title;

      var tdQty = document.createElement('td');
      tdQty.className = 'price';
      tdQty.textContent = String(row.qty);

      var tdDate = document.createElement('td');
      tdDate.textContent = row.restock;

      tr.appendChild(tdSku);
      tr.appendChild(tdTitle);
      tr.appendChild(tdQty);
      tr.appendChild(tdDate);
      tbody.appendChild(tr);
    });
  }

  function initDynamicTable() {
    var tbody = document.getElementById('stock-body');
    if (!tbody) return;

    setText('status', 'загрузка данных…');
    var updateCount = 0;

    // Урок: строки физически отсутствуют в HTML первые 1,5 секунды.
    window.setTimeout(function () {
      renderTable(tbody, ROWS);
      setText('status', 'данные готовы: ' + ROWS.length + ' строк отрисованы (' + stamp() + ')');
    }, 1500);

    var btn = document.getElementById('refresh-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        setText('status', 'обновление…');
        window.setTimeout(function () {
          updateCount += 1;
          renderTable(tbody, shuffleRows(updateCount));
          setText('status', 'данные обновлены (' + stamp() + ')');
        }, 600);
      });
    }
  }

  // ---------- Ленивые карточки: загрузка по прокрутке ----------

  function countRecords(json) {
    // В наших файлах записи лежат в первом массиве-значении: products / quotes / reviews.
    var values = Object.keys(json).map(function (k) { return json[k]; });
    for (var i = 0; i < values.length; i += 1) {
      if (Array.isArray(values[i])) return values[i].length;
    }
    return 0;
  }

  function loadCard(card) {
    if (card.getAttribute('data-loaded') === 'true') return;
    card.setAttribute('data-loaded', 'true');
    var state = card.querySelector('.lazy-status');
    if (state) state.textContent = 'загрузка…';
    var src = card.getAttribute('data-src');
    fetch(src)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) {
        var n = countRecords(json);
        if (state) {
          state.textContent = 'эндпоинт «' + src + '» отдаёт ' + n + ' записей — данные лежат в JSON, прокрутка была нужна только для отрисовки';
        }
        card.setAttribute('data-count', String(n));
        card.classList.add('is-loaded');
      })
      .catch(function (err) {
        if (state) state.textContent = 'ошибка: ' + err.message + ' (откройте через локальный сервер)';
        card.setAttribute('data-loaded', 'error');
      });
  }

  function initLazyCards() {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.lazy-card[data-src]'));
    if (!cards.length) return;

    // Кнопка «Догрузить всё» — тот же путь, что и у IntersectionObserver, только по клику.
    var rest = document.getElementById('load-rest');
    if (rest) {
      rest.addEventListener('click', function () { cards.forEach(loadCard); });
    }

    if (!('IntersectionObserver' in window)) {
      cards.forEach(loadCard);
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          loadCard(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    cards.forEach(function (c) { observer.observe(c); });
  }

  function boot() {
    initDynamicTable();
    initLazyCards();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
