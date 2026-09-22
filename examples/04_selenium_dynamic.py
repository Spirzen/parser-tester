"""04 · Selenium: страницы, где контент дорисовывает JavaScript.

    pip install selenium
    python examples/04_selenium_dynamic.py        # Chrome нужен установленным

Тренируем: явные ожидания вместо sleep, ожидание появления и исчезновения элементов,
клик «показать ещё», iframe, shadow DOM, куки браузера.
Все селекторы соответствуют списку обязательных конструкций в tools/check.mjs.
"""

from __future__ import annotations

from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as ec
from selenium.webdriver.support.ui import WebDriverWait
from trainer import base_url, show

TIMEOUT = 15


def make_driver():
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.set_capability("pageLoadStrategy", "eager")
    return webdriver.Chrome(options=options)


def wait_for_dynamic_table(d) -> None:
    """Таблица появляется через ~1.5 с: ждём условие, а не время."""
    d.get(base_url() + "/js/dynamic-table.html")
    wait = WebDriverWait(d, TIMEOUT)

    show("строк сразу после загрузки", len(d.find_elements(By.CSS_SELECTOR, "#stock-body tr")))
    rows = wait.until(ec.presence_of_all_elements_located((By.CSS_SELECTOR, "#stock-body tr")))
    show("строк после ожидания", len(rows))
    wait.until(ec.text_to_be_present_in_element((By.ID, "status"), "данные готовы"))
    show("индикатор дошёл до «готово»", d.find_element(By.ID, "status").text)

    d.find_element(By.ID, "refresh-btn").click()
    wait.until(lambda x: x.find_element(By.ID, "status").text.startswith("обновление"))
    wait.until(ec.staleness_of(rows[0]))
    fresh = d.find_elements(By.CSS_SELECTOR, "tr.row-stock")
    show("строк после обновления", len(fresh))
    show("артрикулы из data-sku", [r.get_attribute("data-sku") for r in fresh[:5]])
    show("колонки таблицы", [th.text for th in d.find_elements(By.CSS_SELECTOR, "#stock-table thead th")])


def lazy_scroll(d) -> None:
    """Ленивые блоки: карточка появляется только когда до неё доскроллили."""
    d.get(base_url() + "/js/hidden-lazy.html")
    before = len(d.find_elements(By.CSS_SELECTOR, ".lazy-card"))
    d.find_element(By.ID, "load-rest").click()  # кнопка «Догрузить всё»
    WebDriverWait(d, TIMEOUT).until(
        lambda x: len(x.find_elements(By.CSS_SELECTOR, ".lazy-card")) > before
    )
    show("карточек до и после", f"{before} → {len(d.find_elements(By.CSS_SELECTOR, '.lazy-card'))}")
    d.execute_script("window.scrollTo(0, document.body.scrollHeight)")
    loaded = d.find_elements(By.CSS_SELECTOR, ".lazy-card[data-loaded='true']")
    show("догруженных по прокрутке", len(loaded))
    show("значения лежали в атрибуте", [c.get_attribute("data-src") for c in loaded[:3]])


def inside_iframe(d) -> None:
    d.get(base_url() + "/js/iframe-outer.html")
    outer = d.find_elements(By.CSS_SELECTOR, ".row-stock")
    frame = d.find_element(By.ID, "stock-frame")
    d.switch_to.frame(frame)
    inner = d.find_elements(By.CSS_SELECTOR, ".row-stock")
    show("строк в основном документе", len(outer))
    show("строк внутри фрейма", len(inner))
    show("первая строка из фрейма", inner[0].text if inner else "пусто")
    d.switch_to.default_content()
    show("вернулись наружу (h1)", d.find_element(By.TAG_NAME, "h1").text)


def shadow_dom(d) -> None:
    """Внутри shadowRoot обычный CSS-лукатор слеп: достаём тень через execute_script."""
    d.get(base_url() + "/js/shadow-dom.html")
    host = d.find_element(By.TAG_NAME, "tb-price-table")
    root = d.execute_script("return arguments[0].shadowRoot", host)
    rows = root.find_elements(By.CSS_SELECTOR, "tbody tr")
    show("строк в shadowRoot", len(rows))
    if rows:
        show("первая строка", [c.text for c in rows[0].find_elements(By.TAG_NAME, "td")])
    try:
        d.find_element(By.CSS_SELECTOR, "tb-price-table tbody tr")
        show("поиск без тени", "нашёл — значит тень открыта наружу, используйте ::part")
    except Exception as exc:
        show("поиск без тени", type(exc).__name__)


def cookies_from_server(d) -> None:
    """Локальный сервер выдаёт три куки (одна HttpOnly, другая с Path=/http)."""
    d.get(base_url() + "/http/cookies")
    for name, value in sorted((c["name"], c["value"]) for c in d.get_cookies()):
        print(f"   {name}={value}")
    show("HttpOnly видно браузеру, но не document.cookie", [c["name"] for c in d.get_cookies() if c.get("httpOnly")])
    show("document.cookie", d.execute_script("return document.cookie"))
    d.delete_all_cookies()
    show("после delete_all_cookies", d.get_cookies())


if __name__ == "__main__":
    d = make_driver()
    try:
        wait_for_dynamic_table(d)
        lazy_scroll(d)
        inside_iframe(d)
        shadow_dom(d)
        cookies_from_server(d)
    finally:
        d.quit()
    print("\nГотово. HTTP-раздел (куки) требует локального сервера: node tools/serve.mjs")
