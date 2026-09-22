// Мелкие общие улучшения страницы: год в футере, отправка готового селектора из решения
// в блок-тренажёр по клику, счётчик совпадений прямо в карточке задания.
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function currentMode() {
    var fromUrl = new URLSearchParams(location.search).get('mode');
    if (fromUrl === 'exam' || fromUrl === 'hints') return fromUrl;
    try {
      return localStorage.getItem('trainer:mode') === 'exam' ? 'exam' : 'hints';
    } catch (e) {
      return 'hints';
    }
  }

  function applyMode(mode) {
    var exam = mode === 'exam';
    document.body.classList.toggle('no-hints', exam);
    document.querySelectorAll('details.task').forEach(function (task) {
      task.open = !exam;
    });
    var button = document.querySelector('.mode-toggle');
    if (button) {
      button.textContent = exam ? 'Режим: без подсказок' : 'Режим: с подсказками';
      button.setAttribute('aria-pressed', String(exam));
      button.title = exam
        ? 'Вернуть разборы и блок-тренажёр: учебный режим'
        : 'Скрыть разборы и блок-тренажёр: самостоятельная работа';
    }
    try {
      localStorage.setItem('trainer:mode', mode);
    } catch (e) {
      /* приватный режим — режим не запоминается, и ладно */
    }
  }

  function setupMode() {
    var host = document.querySelector('.site-header__top');
    if (host) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'mode-toggle';
      button.addEventListener('click', function () {
        applyMode(document.body.classList.contains('no-hints') ? 'hints' : 'exam');
      });
      host.appendChild(button);
    }
    applyMode(currentMode());
  }

  ready(function () {
    setupMode();
    var footer = document.querySelector('.site-footer__meta');
    if (footer) {
      var stamp = document.createElement('span');
      stamp.className = 'muted';
      stamp.textContent = ' · страница собрана для учебного курса, год ' + new Date().getFullYear();
      footer.appendChild(stamp);
    }

    // Клик по CSS/XPath-решению в задании отправляет селектор в блок-тренажёр.
    document.querySelectorAll('.task__solution dt').forEach(function (dt) {
      var key = dt.textContent.trim().toLowerCase();
      if (key !== 'css' && key !== 'xpath') return;
      var code = dt.nextElementSibling && dt.nextElementSibling.querySelector('code');
      if (!code) return;
      var text = code.textContent.trim();
      code.classList.add('code-copy');
      code.title = 'Кликнуть, чтобы отправить селектор в тренажёр';
      code.addEventListener('click', function () {
        var input = document.querySelector('.trainer [data-role=sel]');
        if (!input) return;
        var mode = text[0] === '/' || text[0] === '(' ? 'xpath' : 'css';
        var modeButton = document.querySelector('.trainer [data-mode=' + mode + ']');
        if (modeButton) modeButton.click();
        input.value = text;
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        var panel = document.getElementById('trainer');
        if (panel && panel.getAttribute('data-collapsed') === 'true') {
          document.querySelector('.trainer [data-role=toggle]').click();
        }
        input.focus();
      });
    });
  });
})();
