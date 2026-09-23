// Блок-тренажёр: проверяет селектор прямо на открытой странице.
// Подключается одним тегом <script> — сам достраивает панель, если её нет в разметке.
(function () {
  'use strict';

  var MODES = {
    css: {
      label: 'CSS',
      placeholder: 'div.product-card > h3.title',
      hint: 'CSS ищет узлы: .класс, #id, tag > child, [data-price], :nth-child(2n)',
    },
    xpath: {
      label: 'XPath',
      placeholder: "//div[@class='product-card']//h3",
      hint: 'XPath ищет узлы: //tag[@attr="x"], text(), contains(), ../following-sibling::',
    },
    regex: {
      label: 'Regex',
      placeholder: '<h3[^>]*>(.*?)</h3>',
      hint: 'Regex ищет по тексту разметки: совпадения — строки, группы в скобках показываются первыми',
    },
  };

  var OUT = {
    node: 'узел',
    text: 'текст',
    html: 'outerHTML',
    attr: 'атрибут',
  };

  var state = {
    mode: 'css',
    out: 'node',
    highlight: true,
    open: false,
  };

  try {
    Object.assign(state, JSON.parse(localStorage.getItem('trainer:v1') || '{}'));
  } catch (e) {
    /* пустое состояние — нормально */
  }

  function save() {
    try {
      localStorage.setItem('trainer:v1', JSON.stringify(state));
    } catch (e) {
      /* приватный режим браузера — просто не сохраняем */
    }
  }

  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function esc(value) {
    return String(value).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function build() {
    var panel = document.getElementById('trainer');
    if (!panel) {
      panel = el('aside', 'trainer');
      panel.id = 'trainer';
      panel.setAttribute('data-page', document.body.getAttribute('data-page') || location.pathname);
      document.body.appendChild(panel);
    }
    panel.setAttribute('data-collapsed', String(!state.open));

    panel.innerHTML =
      '<div class="trainer__head">' +
      '<strong>Тренажёр селекторов</strong>' +
      '<span class="trainer__badge" data-role="count">0</span>' +
      '<button class="ghost" type="button" data-role="toggle" title="Свернуть/развернуть (Ctrl+Shift+S)">+</button>' +
      '</div>' +
      '<div class="trainer__body">' +
      '<div class="trainer__modes" data-role="modes"></div>' +
      '<p class="trainer__hint" data-role="mode-hint"></p>' +
      '<div class="trainer__row">' +
      '<input type="text" data-role="sel" spellcheck="false" autocomplete="off" />' +
      '<button type="button" data-role="run">Найти</button>' +
      '</div>' +
      '<div class="trainer__row">' +
      '<select data-role="out">' +
      Object.keys(OUT).map(function (k) { return '<option value="' + k + '">' + OUT[k] + '</option>'; }).join('') +
      '</select>' +
      '<input type="text" data-role="attrname" placeholder="имя атрибута" style="display:none;max-width:130px" />' +
      '<label class="trainer__hint" style="margin:0"><input type="checkbox" data-role="hl" /> подсветка</label>' +
      '</div>' +
      '<div class="trainer__out" data-role="out-box"></div>' +
      '<p class="trainer__hint" data-role="py"></p>' +
      '<p class="trainer__hint">CSS и XPath ищут по текущему DOM: то, что дорисовал JavaScript, тоже видно. BeautifulSoup видит исходный HTML — сравни с <code>curl</code>.</p>' +
      '</div>';

    var modes = panel.querySelector('[data-role=modes]');
    Object.keys(MODES).forEach(function (key) {
      var b = el('button', null, MODES[key].label);
      b.type = 'button';
      b.setAttribute('data-mode', key);
      b.setAttribute('aria-pressed', String(state.mode === key));
      b.addEventListener('click', function () {
        setMode(key);
        run();
      });
      modes.appendChild(b);
    });

    panel.querySelector('[data-role=toggle]').addEventListener('click', toggle);
    panel.querySelector('[data-role=run]').addEventListener('click', run);
    panel.querySelector('[data-role=sel]').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') run();
    });
    panel.querySelector('[data-role=out]').addEventListener('change', function (e) {
      state.out = e.target.value;
      syncAttrField();
      save();
      run();
    });
    panel.querySelector('[data-role=attrname]').addEventListener('input', run);
    panel.querySelector('[data-role=hl]').addEventListener('change', function (e) {
      state.highlight = e.target.checked;
      save();
      run();
    });

    setMode(state.mode);
    panel.querySelector('[data-role=out]').value = state.out;
    panel.querySelector('[data-role=hl]').checked = state.highlight;
    syncAttrField();
  }

  function setMode(key) {
    if (!MODES[key]) return;
    var panel = document.getElementById('trainer');
    state.mode = key;
    if (!panel) return;
    panel.querySelectorAll('[data-role=modes] button').forEach(function (x) {
      x.setAttribute('aria-pressed', String(x.getAttribute('data-mode') === key));
    });
    panel.querySelector('[data-role=sel]').placeholder = MODES[key].placeholder;
    panel.querySelector('[data-role=mode-hint]').textContent = MODES[key].hint;
    save();
  }

  function syncAttrField() {
    var box = document.querySelector('.trainer [data-role=attrname]');
    if (box) box.style.display = state.out === 'attr' ? '' : 'none';
  }

  function toggle() {
    state.open = !state.open;
    var panel = document.getElementById('trainer');
    panel.setAttribute('data-collapsed', String(!state.open));
    document.querySelector('.trainer [data-role=toggle]').textContent = state.open ? '−' : '+';
    save();
  }

  function clearHighlights() {
    document.querySelectorAll('.trainer-match').forEach(function (n) {
      n.classList.remove('trainer-match', 'trainer-match--first');
    });
  }

  function describe(node) {
    if (node.nodeType === 2) return '<span class="trainer__attr">атрибут</span>';
    if (node.nodeType === 3) return '#text ' + short(node.nodeValue);
    if (node.nodeType === 8) return '#comment ' + short(node.nodeValue);
    var id = node.id ? '#' + node.id : '';
    var cls = node.classList && node.classList.length ? '.' + Array.prototype.join.call(node.classList, '.') : '';
    return '<span class="trainer__tag">&lt;' + node.tagName.toLowerCase() + id + cls + '&gt;</span> ' + short(textOf(node));
  }

  function textOf(node) {
    return (node.textContent || '').trim().replace(/\s+/g, ' ');
  }

  function short(text, max) {
    text = String(text == null ? '' : text);
    var limit = max || 90;
    return esc(text.length > limit ? text.slice(0, limit) + '…' : text);
  }

  // Текст для regex-режима: разметка страницы БЕЗ самой панели, иначе тренажёр
  // начинает находить собственные подсказки и только что введённую строку.
  function regexSource() {
    var clone = document.documentElement.cloneNode(true);
    var panel = clone.querySelector ? clone.querySelector('#trainer') : null;
    if (panel) panel.parentNode.removeChild(panel);
    return clone.outerHTML || new XMLSerializer().serializeToString(clone);
  }

  function collectCss(sel) {
    return Array.prototype.slice.call(document.querySelectorAll(sel));
  }

  // Эвристика «это выражение из другого синтаксиса»: нужна, чтобы вместо текста из недр
  // браузера показать кнопку «найти как XPath/regex». Ошибается — только в лишнюю подсказку.
  function looksLike(expr) {
    var s = String(expr || '').trim();
    if (!s) return null;
    if (/^(\/\/|\/[a-z*(]|\(\s*\/)/i.test(s) || /\]\s*\//.test(s) || /(^|\[)@[\w-]/.test(s) ||
        /\b(contains|starts-with|normalize-space|text|following-sibling|preceding-sibling|not)\s*\(/i.test(s)) return 'xpath';
    if (/\\[wdWsSdDBb]|\.\*|\[\^|\(\?:|\{\d+(,\d*)?\}/.test(s)) return 'regex';
    if (/^[.#][\w-]/.test(s) || /^[a-z][\w-]*([.:#[>]|$)/i.test(s)) return 'css';
    return null;
  }

  function currentSel() {
    return (document.querySelector('.trainer [data-role=sel]').value || '').trim();
  }

  function humanError(err, mode) {
    var name = (err && err.name) || '';
    if (/SyntaxError|InvalidExpressionError|DOMException|InvalidCharacterError/.test(name)) {
      return {
        css: 'Браузер не распознал CSS-селектор.',
        xpath: 'Такое выражение не проходит как XPath — проверьте слэши, кавычки и скобки.',
        regex: 'Такое выражение не проходит как регулярка — проверьте скобки, классы [...] и экранирование.',
      }[mode];
    }
    return name + ': ' + ((err && err.message) || 'ошибка');
  }

  function suggestBox(box, expr) {
    var kind = looksLike(expr);
    if (!kind || kind === state.mode || !MODES[kind]) return;
    var tip = el('span', 'trainer__suggest');
    var swap = el('button', 'trainer__swap', 'Найти как ' + MODES[kind].label);
    swap.type = 'button';
    swap.addEventListener('click', function () { setMode(kind); run(); });
    tip.appendChild(swap);
    var note = document.createElement('span');
    note.textContent = ' — выражение написано в другом синтаксисе, вкладки слева.';
    tip.appendChild(note);
    box.appendChild(tip);
  }

  function collectXPath(expr) {
    var snapshot = document.evaluate(expr, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    var list = [];
    for (var i = 0; i < snapshot.snapshotLength; i += 1) list.push(snapshot.snapshotItem(i));
    return list;
  }

  function collectRegex(source, expr) {
    var out = [];
    var re = new RegExp(expr, 'g');
    var m;
    while ((m = re.exec(source)) !== null) {
      out.push(m);
      if (m.index === re.lastIndex) re.lastIndex += 1;
      if (out.length > 999) break;
    }
    return out;
  }

  // Кавычки в Python-эквиваленте подбираем так, чтобы не экранировать лишнего:
  // «\'request-anatomy\'» внутри "...'..." не нужно, а студент читает эту строку как образец.
  function pyString(expr) {
    if (expr.indexOf('"') === -1) return '"' + expr + '"';
    if (expr.indexOf("'") === -1) return "'" + expr + "'";
    return '"' + expr.replace(/"/g, '\\"') + '"';
  }

  function pyEquivalent(sel, n) {
    if (state.mode === 'css') return 'soup.select(' + pyString(sel) + ')   # bs4 · len() = ' + n;
    if (state.mode === 'xpath') return 'tree.xpath(' + pyString(sel) + ')   # lxml · len() = ' + n;
    return 're.findall(r' + pyString(sel) + ', html)   # re · len() = ' + n;
  }

  function render(list) {
    var box = document.querySelector('.trainer [data-role=out-box]');
    var count = document.querySelector('.trainer [data-role=count]');
    count.textContent = String(list.length);
    box.innerHTML = '';

    if (!list.length) {
      box.appendChild(el('span', 'trainer__err',
        'На этой странице совпадений нет: поиск идёт только по текущему документу (' +
        location.pathname.split('/').pop() + '), а задания разбросаны по всем страницам модуля.'));
      suggestBox(box, currentSel());
      return;
    }

    var attrName = (document.querySelector('.trainer [data-role=attrname]').value || '').trim();

    list.slice(0, 300).forEach(function (item, i) {
      var line = el('span', 'trainer__line');
      if (state.mode === 'regex') {
        var groups = item.slice(1).filter(function (g) { return g != null; });
        line.innerHTML = '<span class="trainer__tag">' + (i + 1) + '</span> ' + short(groups.length ? groups[0] : item[0], 120);
      } else if (state.out === 'text') {
        line.innerHTML = '<span class="trainer__tag">' + (i + 1) + '</span> ' + short(textOf(item), 160);
      } else if (state.out === 'html') {
        line.innerHTML = '<span class="trainer__tag">' + (i + 1) + '</span> ' + short(item.outerHTML || item, 160);
      } else if (state.out === 'attr') {
        var value = item.getAttribute ? item.getAttribute(attrName) : null;
        line.innerHTML =
          '<span class="trainer__tag">' + (i + 1) + '</span> ' +
          '<span class="trainer__attr">' + esc(attrName || '?') + '=</span>' + short(value === null ? '—' : value, 140);
      } else {
        line.innerHTML = '<span class="trainer__tag">' + (i + 1) + '</span> ' + describe(item);
      }
      line.addEventListener('click', function () {
        if (item.nodeType === 1) item.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      box.appendChild(line);
    });

    if (list.length > 300) {
      box.appendChild(el('span', 'trainer__hint', '…ещё ' + (list.length - 300) + ' совпадений не показаны.'));
    }
  }

  function highlight(list) {
    clearHighlights();
    if (!state.highlight) return;
    list.slice(0, 200).forEach(function (node, i) {
      if (node.nodeType !== 1) return;
      node.classList.add('trainer-match');
      if (i === 0) node.classList.add('trainer-match--first');
    });
  }

  function run() {
    var sel = document.querySelector('.trainer [data-role=sel]').value.trim();
    var py = document.querySelector('.trainer [data-role=py]');
    var box = document.querySelector('.trainer [data-role=out-box]');
    if (!sel) {
      box.innerHTML = '';
      document.querySelector('.trainer [data-role=count]').textContent = '0';
      py.textContent = 'Режим «' + MODES[state.mode].label + '»: ' + MODES[state.mode].hint + '.';
      return;
    }
    try {
      var list = state.mode === 'css' ? collectCss(sel) : state.mode === 'xpath' ? collectXPath(sel) : collectRegex(regexSource(), sel);
      highlight(list);
      render(list);
      py.textContent = pyEquivalent(sel, list.length);
    } catch (err) {
      clearHighlights();
      box.innerHTML = '';
      box.appendChild(el('span', 'trainer__err', esc(humanError(err, state.mode))));
      suggestBox(box, sel);
      var raw = document.createElement('span');
      raw.className = 'trainer__raw';
      raw.textContent = err.name + ': ' + err.message;
      box.appendChild(raw);
      document.querySelector('.trainer [data-role=count]').textContent = '!';
      py.textContent = '';
    }
  }

  function init() {
    build();
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        toggle();
      }
    });
    var params = new URLSearchParams(location.search);
    if (params.get('q')) {
      var expr = params.get('q');
      document.querySelector('.trainer [data-role=sel]').value = expr;
      // Выражение можно передать ссылкой: режим подбирается по синтаксису, ?syntax= перекрывает.
      var kind = params.get('syntax') || looksLike(expr);
      if (kind && kind !== state.mode) setMode(kind);
      if (!state.open) toggle();
      run();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
