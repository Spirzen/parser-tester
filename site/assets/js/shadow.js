// Кастомный элемент <tb-price-table> с open-тенью.
// Используется на js/shadow-dom.html.
// Урок: внутри shadowRoot — обычная таблица, но ни document.querySelector,
// ни BeautifulSoup в исходном HTML её не увидят: в исходнике у хоста пустое содержимое,
// строки создаются только в рантайме и только внутри тени.
// mode:'open' выбран намеренно — тень можно прочитать через element.shadowRoot
// (execute_script в Selenium, evaluate в Playwright) или достать стилевыми частями ::part.
(function () {
  'use strict';

  if (!('customElements' in window) || !('attachShadow' in Element.prototype)) {
    // Очень старый браузер: оставляем хост без содержимого.
    return;
  }

  var ROWS = [
    { sku: 'TB-1001', title: 'Складной стул «Бриз»', price: 2490 },
    { sku: 'TB-2010', title: 'Куртка штормовая «Маяк»', price: 8990 },
    { sku: 'TB-4030', title: 'Палатка двухместная «Бухта 2»', price: 15900 },
    { sku: 'TB-6050', title: 'Рюкзак забросный 65 л', price: 9800 }
  ];

  function money(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';
  }

  function rowHtml(r) {
    return (
      '<tr part="price-row" data-sku="' + r.sku + '">' +
      '<td part="sku-cell">' + r.sku + '</td>' +
      '<td>' + r.title + '</td>' +
      '<td class="price" part="price-cell" data-price="' + r.price + '">' + money(r.price) + '</td>' +
      '</tr>'
    );
  }

  class TbPriceTable extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      const root = this.attachShadow({ mode: 'open' });
      const total = ROWS.reduce((s, r) => s + r.price, 0);
      root.innerHTML =
        '<style>' +
        ':host { display: block; }' +
        'table { border-collapse: collapse; width: 100%; background: #fff; font-size: 14px; }' +
        'th, td { border: 1px solid #d8e2df; padding: 7px 9px; text-align: left; }' +
        'thead th { background: #e7efed; }' +
        'tfoot td { background: #f2f6f5; font-weight: 600; }' +
        '.price { font-weight: 700; color: #1b5e20; white-space: nowrap; }' +
        '.inside { margin: 8px 0 0; font-size: 13px; color: #5c6b68; }' +
        '</style>' +
        '<table part="price-table">' +
        '<caption class="inside">Таблица внутри shadowRoot — снаружи её не видно</caption>' +
        '<thead><tr><th>Артикул</th><th>Товар</th><th>Цена</th></tr></thead>' +
        '<tbody>' + ROWS.map(rowHtml).join('') + '</tbody>' +
        '<tfoot><tr><td>Суммарно</td><td></td><td class="price">' + money(total) + '</td></tr></tfoot>' +
        '</table>' +
        '<p class="inside" part="note">Режим тени: open — читайте через <code>element.shadowRoot</code>.</p>';
    }
  }

  window.customElements.define('tb-price-table', TbPriceTable);
})();
