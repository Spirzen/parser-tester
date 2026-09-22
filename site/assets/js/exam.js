// Автопроверка экзамена для exam/index.html.
// Ответы лежат в ../data/exam-answers.json в base64 — студент не читает их глазами,
// а скрипт на странице никогда не печатает открытый ответ.
// Никакой отправки куда-либо: сравнение происходит локально в браузере.
(function () {
  'use strict';

  var ANSWERS_URL = '../data/exam-answers.json';

  function b64decode(b64) {
    var binary = window.atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  // Нормализация: регистр, лишние пробелы, неразрывный пробел,
  // пробелы после запятых в списках; чисто числовые ответы — без разделителей тысяч.
  function canon(value) {
    var s = String(value == null ? '' : value)
      .replace(/ /g, ' ')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ',');
    if (s && /^[\d.,\s]+$/.test(s)) {
      return s.replace(/[^\d]/g, '');
    }
    return s;
  }

  function fetchAnswers(done, fail) {
    fetch(ANSWERS_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(done)
      .catch(function (err) {
        fail(err);
      });
  }

  function init() {
    var root = document.querySelector('.exam-check');
    if (!root) return;

    var items = Array.prototype.slice.call(root.querySelectorAll('[data-task]'));
    var scoreNode = document.getElementById('exam-score');
    var solved = {};
    var data = null;

    function updateScore() {
      if (!scoreNode) return;
      var n = Object.keys(solved).length;
      scoreNode.textContent = 'Верно: ' + n + ' из ' + items.length;
      if (n === items.length) {
        scoreNode.textContent += ' — экзамен сдан. Сравните решения с разметкой полигона ещё раз: ответ должен быть получаем из HTML, а не угадан.';
      }
    }

    function wire(item) {
      var id = item.getAttribute('data-task');
      var input = item.querySelector('[data-exam-answer]');
      var result = item.querySelector('[data-result]');
      var checkBtn = item.querySelector('[data-check]');
      var hintBtn = item.querySelector('[data-hint]');
      var hintBox = item.querySelector('[data-hint-text]');

      if (checkBtn) {
        checkBtn.addEventListener('click', function () {
          if (!data) {
            if (result) result.textContent = 'Файл с эталоном ещё не загружен — подождите пару секунд.';
            return;
          }
          var entry = data[id];
          if (!entry) {
            if (result) result.textContent = 'Эталон для ' + id + ' не найден.';
            return;
          }
          var expected = b64decode(entry.a);
          if (canon(input.value) === canon(expected) && input.value.trim() !== '') {
            solved[id] = true;
            if (result) result.textContent = 'Верно.';
            item.className = 'task exam-item is-correct';
            updateScore();
          } else {
            delete solved[id];
            if (result) result.textContent = 'Неверно. Ответ на странице не печатается — переформулируйте или возьмите подсказку.';
            item.className = 'task exam-item is-wrong';
            updateScore();
          }
        });
      }
      if (input) {
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && checkBtn) checkBtn.click();
        });
      }
      if (hintBtn && hintBox) {
        hintBtn.addEventListener('click', function () {
          var entry = data && data[id];
          hintBox.textContent = entry ? 'Подсказка: ' + b64decode(entry.hint) : 'Подсказка будет доступна после загрузки эталона.';
          hintBox.hidden = false;
        });
      }
    }

    items.forEach(wire);

    fetchAnswers(
      function (json) {
        data = json;
        var status = document.getElementById('exam-load-status');
        if (status) status.textContent = 'Эталон загружен: ' + Object.keys(json).length + ' ответов (base64, на странице не печатаются).';
      },
      function (err) {
        var status = document.getElementById('exam-load-status');
        if (status) status.textContent = 'Не удалось загрузить ' + ANSWERS_URL + ': ' + err.message + '. Откройте сайт через node tools/serve.mjs.';
      }
    );

    updateScore();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
