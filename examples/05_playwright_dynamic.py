"""05 · Playwright: тот же полигон, но без ручных ожиданий.

    pip install playwright
    playwright install chromium
    python examples/05_playwright_dynamic.py

Показываем: автоожидания локаторов, `expect`, переход по hash-роуту в SPA,
перехват сетевого ответа (находим настоящий JSON-эндпоинт), бесконечную прокрутку,
iframe через frame_locator и shadow DOM — Playwright piercing его видит сам.
"""

from __future__ import annotations

import json

from playwright.sync_api import expect, sync_playwright
from trainer import base_url, show


def dynamic_table(page) -> None:
    page.goto(base_url() + "/js/dynamic-table.html")
    rows = page.locator("#stock-body tr")
    show("строк через секунду", rows.count())
    expect(rows.first).to_be_visible(timeout=10000)
    expect(page.locator("#status")).to_contain_text("данные готовы", timeout=10000)
    show("после автоожидания", rows.count())
    show("первая строка", [c.inner_text() for c in page.locator("#stock-body tr.row-stock td").all()][:4])

    page.click("#refresh-btn")
    expect(page.locator("#status")).to_contain_text("обновление", timeout=2000)
    expect(page.locator("#status")).to_contain_text("данные обновлены", timeout=10000)
    show("после обновления", rows.count())


def find_real_api(page) -> None:
    """Ловим ответы, которые страница дёргает сама: часто это и есть настоящий источник."""
    caught = []

    def on_response(response):
        if "json" in (response.headers.get("content-type") or ""):
            caught.append(response.url)

    page.on("response", on_response)
    page.goto(base_url() + "/pagination/load-more.html")
    page.click("#load-more")
    page.wait_for_load_state("networkidle")
    show("JSON-ответы страницы", caught)
    if caught:
        body = page.evaluate("u => fetch(u).then(r => r.text())", caught[0])
        data = json.loads(body)
        items = data.get("products") or data.get("items") or []
        show("полей в первом объекте", sorted(items[0].keys()) if items else "пусто")


def spa_hash_routing(page) -> None:
    """Хэш не уходит на сервер: requests увидит только оболочку, браузер — содержимое."""
    page.goto(base_url() + "/js/spa.html#/prices")
    expect(page.locator("#spa-root")).to_contain_text("Цены", timeout=10000)
    show("роут #/prices", page.inner_text("#spa-root")[:60].replace("\n", " "))
    page.click("a[href='#/reviews']")
    expect(page.locator("#spa-root")).to_contain_text("Свежие отзывы", timeout=10000)
    show("роут #/reviews", page.inner_text("#spa-root")[:60].replace("\n", " "))
    show("адрес в браузере", page.url)
    show("что получил бы requests по этому адресу", "оболочка без разделов: хэш сервер не передаётся")


def shadow_and_iframe(page) -> None:
    page.goto(base_url() + "/js/shadow-dom.html")
    inside = page.locator("tb-price-table").locator("tbody tr")
    show("строк в shadowRoot (piercing работает сам)", inside.count())
    show("текст первой строки", inside.first.inner_text().replace("\n", " | ") if inside.count() else "пусто")

    page.goto(base_url() + "/js/iframe-outer.html")
    show("строк снаружи", page.locator(".row-stock").count())
    frame = page.frame_locator("#stock-frame")
    inner = frame.locator(".row-stock")
    show("строк в iframe", inner.count())
    show("первая строка из фрейма", inner.first.inner_text().replace("\n", " ")[:60])


def infinite_scroll(page) -> None:
    page.goto(base_url() + "/pagination/infinite-scroll.html")
    feed = page.locator(".feed-item")
    expect(feed.first).to_be_visible(timeout=10000)
    start = feed.count()
    # Крутим понемногу: IntersectionObserver реагирует на вход маркера в область видимости,
    # поэтому один резкий прыжок на несколько экранов маркер перескакивает — и порции не приходит.
    for _ in range(8):
        if page.locator("[data-empty='true']").count():
            break
        page.mouse.wheel(0, 500)
        page.wait_for_timeout(250)
    show("элементов до/после прокрутки", f"{start} → {feed.count()}")
    show("дошли ли до конца списка", page.locator("[data-empty='true']").count() > 0)
    show("сколько показано по data-shown", page.locator("#feed").get_attribute("data-shown"))
    page.locator("#feed-sentinel").scroll_into_view_if_needed()
    page.wait_for_timeout(400)
    show("после прокрутки к маркеру", feed.count())


def cookies_and_context(page) -> None:
    context = page.context
    page.goto(base_url() + "/http/cookies")
    show("куки после Set-Cookie", {c["name"]: c["value"] for c in context.cookies()})
    context.clear_cookies()
    show("после очистки", context.cookies())
    context.add_cookies([{"name": "referral_code", "value": "lesson-05", "url": base_url()}])
    page.reload()
    show("передали свою куку", {c["name"]: c["value"] for c in context.cookies()})


def block_images_for_speed(page) -> None:
    """Приём для больших обходов: отключить то, что парсеру не нужно."""
    context = page.context
    context.route("**/*.{png,jpg,jpeg,svg,woff2}", lambda route: route.abort())
    page.goto(base_url() + "/selectors/long-list.html")
    rows = page.locator("table.orders tbody tr").count()
    show("строк после отключения статики", rows)
    context.unroute("**/*.{png,jpg,jpeg,svg,woff2}")


if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent="ParsingTrainerCourse/1.0", locale="ru-RU")
        page = context.new_page()
        try:
            dynamic_table(page)
            find_real_api(page)
            spa_hash_routing(page)
            shadow_and_iframe(page)
            infinite_scroll(page)
            cookies_and_context(page)
            block_images_for_speed(page)
        finally:
            browser.close()
    print("\nГотово. Куки-раздел требует локального сервера: node tools/serve.mjs")
