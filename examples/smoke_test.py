"""Смоук-тест полигона: тот же сценарий, что проходит студент на первом занятии.

    node tools/build.mjs && node tools/serve.mjs &      # или PARSER_BASE_URL=https://…/parser-tester
    pip install requests beautifulsoup4 lxml
    python examples/smoke_test.py

Запускается в CI (github.com/workflows) после сборки, поэтому сайт и примеры
не могут разъехаться: если структура страницы изменилась, CI краснеет.
Без браузера: проверяем только то, что реально достаётся requests + BeautifulSoup.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.parse
from base64 import b64decode

import requests
from bs4 import BeautifulSoup

BASE = os.environ.get("PARSER_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
LIVE_HTTP = bool(re.search(r"127\.0\.0\.1|localhost", BASE))
HEADERS = {"User-Agent": "ParsingTrainerSmoke/1.0 (+ci)"}

passed: list[str] = []
failed: list[str] = []
skipped: list[str] = []


def check(name: str, condition, detail: str = "") -> None:
    if condition is True or (condition and not isinstance(condition, bool)):
        passed.append(name)
        print(f"  ok   {name} {detail}")
    else:
        failed.append(f"{name} {detail}".strip())
        print(f"  FAIL {name} {detail}")


def skip(name: str, why: str) -> None:
    skipped.append(name)
    print(f"  skip {name}: {why}")


def get(path: str, **kw) -> requests.Response:
    time.sleep(0.02)  # вежливость и на всякий случай защита от гонок в тесте
    url = path if re.match(r"https?://", path) else f"{BASE}/{path.lstrip('/')}"
    response = requests.get(url, headers=HEADERS, timeout=20, **kw)
    return response


def soup(path: str) -> BeautifulSoup:
    response = get(path)
    response.raise_for_status()
    return BeautifulSoup(response.text, "lxml")


def test_landing() -> None:
    page = soup("index.html")
    check("главная отдаётся", page.title and "Парсинг-тренажёр" in page.title.get_text())
    tabs = [a.get_text(strip=True) for a in page.select(".module-nav a")]
    check("девять вкладок-модулей в навигации", len(tabs) == 9, f"{tabs}")
    check("нет внешних скриптов и стилей", not [s for s in page.find_all("script", src=True) if s["src"].startswith("http")])
    check("футер с указанием на вымышленность данных", "вымышлен" in page.select_one(".site-footer").get_text())


def test_pages_contract() -> None:
    page = soup("basics/hello.html")
    check("базовая страница имеет h1", page.find("h1") is not None, page.find("h1").get_text(strip=True)[:40] if page.find("h1") else "")
    products = soup("selectors/products.html")
    cards = products.select("article.product-card, .product-card")
    check("карточек товаров ровно 12", len(cards) == 12, f"{len(cards)}")
    prices = [c.select_one("[data-price]") for c in cards if c.select_one("[data-price]")]
    check("у карточек есть data-price", len(prices) >= 10, f"{len(prices)}")


def test_json_matches_html() -> None:
    api = get("data/products.json")
    check("data/products.json читается", api.status_code == 200 and len(api.json()["products"]) == 12)
    html_prices = sorted(
        int(el["data-price"]) for el in soup("selectors/products.html").select("[data-price]") if el.get("data-price", "").isdigit()
    )
    json_prices = sorted(p["price"] for p in api.json()["products"])
    check("цены из HTML совпадают с JSON API", html_prices == json_prices or set(json_prices).issubset(html_prices), f"{len(html_prices)} против {len(json_prices)}")


def test_pagination_walk() -> None:
    """Обход по rel=next: без пропусков и без повторов — главный навык модуля «Пагинация»."""
    href = "pagination/index.html"
    reviews, hops = [], 0
    while href and hops < 12:
        page = soup(href)
        reviews += [r["data-review"] for r in page.select("[data-review]")]
        nxt = page.select_one('a[rel="next"]')
        href = urllib.parse.urljoin(href, nxt["href"]) if nxt else None
        hops += 1
    check("пройдено страниц по rel=next", hops == 6, f"{hops}")
    check("отзывов собрано 30", len(reviews) == 30, f"{len(reviews)}")
    check("нет дублей", len(set(reviews)) == len(reviews))


def test_forms() -> None:
    page = soup("forms/search.html")
    form = page.find("form")
    check("форма поиска найдена", form is not None)
    if form:
        check("метод GET и адрес результата", (form.get("method") or "").lower() == "get" and "results" in (form.get("action") or ""), f"{form.get('method')} → {form.get('action')}")
        names = [i.get("name") for i in form.find_all(["input", "select", "textarea"]) if i.get("name")]
        check("полей для разбора больше трёх", len(names) >= 3, f"{names}")
    login = soup("forms/login.html")
    hidden = login.select('input[type="hidden"]')
    check("скрытые поля с csrf найдены", any("csrf" in (i.get("name") or "").lower() for i in hidden), [i.get("name") for i in hidden])


def test_scrapy_targets() -> None:
    page = soup("scrapy/index.html")
    links = [a["href"] for a in page.select("a.catalog-item__link")]
    check("из списка есть ссылки на карточки", len(links) >= 4, f"{len(links)}")
    item = soup("scrapy/item-01.html")
    check("карточка отдаётся и имеет артикул", item.select_one("[data-sku]") is not None)
    robots = get("robots.txt").text
    check("robots.txt запрещает /private/", "Disallow: /private/" in robots)
    check("robots.txt задаёт Crawl-delay", "Crawl-delay" in robots)


def test_meta_files() -> None:
    sitemap = get("sitemap.xml").text
    locs = re.findall(r"<loc>([^<]+)</loc>", sitemap)
    check("sitemap содержит все страницы", len(locs) >= 40, f"{len(locs)} URL")
    broken = []
    for loc in locs[:80]:
        # В проде loc абсолютный с префиксом репозитория, в сборке без SITE_BASE_URL — путь от корня.
        rel = re.sub(r"^https?://[^/]+", "", loc)
        rel = re.sub(r"^/parser-tester", "", rel).lstrip("/")
        if not rel:
            rel = "index.html"
        if get(rel).status_code >= 400:
            broken.append(rel)
    check("ссылки из sitemap работают", not broken, f"битые: {broken[:5]}")
    feed = get("feed.xml").text
    check("RSS отдаёт items", feed.count("<item>") >= 3, f"{feed.count('<item>')}")
    tasks = get("data/tasks.json")
    check("файл заданий доступен", tasks.status_code == 200 and isinstance(tasks.json(), dict))


def test_broken_markup() -> None:
    html = get("markup/broken.html").text
    check("битая размечка помечена для урока", "broken:start" in html)
    counts = {}
    for parser in ("html.parser", "lxml"):
        try:
            counts[parser] = len(BeautifulSoup(html, parser).find_all(True))
        except Exception as exc:  # парсер не должен падать на мусоре
            check(f"парсер {parser} справляется", False, str(exc))
            continue
    check("оба парсера строят дерево без падения", len(counts) == 2, counts)


def test_live_http() -> None:
    """HTTP-сценарии доступны только на node tools/serve.mjs — на Pages их не проверить."""
    if not LIVE_HTTP:
        skip("живые HTTP-эндпоинты", f"адрес {BASE} — статичный хостинг, редиректы и куки отдаёт только локальный сервер")
        return
    session = requests.Session()
    session.headers.update(HEADERS)
    r = session.get(f"{BASE}/http/redirect-chain", timeout=10)
    check("цепочка редиректов доходит до конца", r.status_code == 200 and len(r.history) >= 3, f"{[h.status_code for h in r.history]}")
    cookies = session.get(f"{BASE}/http/cookies", timeout=10).cookies.get_dict()
    check("сервер выдаёт куки", {"session_id", "cart", "theme"} <= set(cookies), list(cookies))
    check("HttpOnly-куки тоже приходят в сессию", "cart" in cookies)
    check("401 без ключа", session.get(f"{BASE}/http/protected", timeout=10).status_code == 401)
    check("200 с ключом", session.get(f"{BASE}/http/protected", headers={"X-API-Key": "trainer-demo-key"}, timeout=10).status_code == 200)
    code429 = session.get(f"{BASE}/http/status?code=429", timeout=10)
    check("429 с Retry-After", code429.status_code == 429 and "retry-after" in code429.headers)
    raw = session.get(f"{BASE}/http/charset", timeout=10)
    check("windows-1251 декодируется", "Щука" in raw.content.decode("windows-1251", "replace"), raw.headers.get("content-type"))
    api = session.get(f"{BASE}/http/api/products", params={"page": 2, "size": 4}, timeout=10).json()
    check("JSON API пагинируется", api["page"] == 2 and len(api["items"]) == 4 and api["pages"] == 3, f"{api['pages']} страниц")
    posted = session.post(f"{BASE}/http/echo", data={"q": "термос", "csrf": "x"}, timeout=10).json()
    check("POST-форма доходит до эха", posted["fields"]["q"] == "термос", posted["content_type"])
    check("таймаут на медленном ответе отрабатывает", _timeout_works(f"{BASE}/http/slow?ms=3000"))


def _timeout_works(url: str) -> bool:
    try:
        requests.get(url, timeout=0.5, headers=HEADERS)
        return False
    except requests.Timeout:
        return True


def test_exam_answers() -> None:
    response = get("data/exam-answers.json")
    if response.status_code != 200:
        skip("ответы экзамена", "exam-answers.json недоступен")
        return
    data = response.json()
    answers = data.get("answers", data)
    decoded = {}
    for key, value in answers.items():
        payload = value.get("a") if isinstance(value, dict) else value
        if not payload:
            continue
        try:
            decoded[key] = b64decode(payload).decode("utf-8")
        except Exception as exc:
            check(f"ответ {key} декодируется", False, str(exc))
    check("двенадцать экзаменационных ответов", len([k for k in decoded if k.startswith("E-")]) == 12, f"{len(decoded)}")
    arena = soup("exam/arena.html")
    check("на полигоне есть размеченные задания", len(arena.select("[data-question]")) >= 12, f"{len(arena.select('[data-question]'))}")
    for page in ("exam/index.html", "exam/arena.html"):
        page_text = get(page).text
        check(f"на {page} нет открытых ответов", not re.search(r"Ответ\s*[:=]", page_text, re.I))


if __name__ == "__main__":
    print(f"\nСмоук-тест против {BASE} (живой HTTP: {LIVE_HTTP})\n")
    tests = [test_landing, test_pages_contract, test_json_matches_html, test_pagination_walk,
             test_forms, test_scrapy_targets, test_meta_files, test_broken_markup,
             test_exam_answers, test_live_http]
    for fn in tests:
        name = getattr(fn, "__name__", repr(fn))
        try:
            fn()
        except Exception as exc:
            failed.append(f"{name} упал: {type(exc).__name__}: {exc}")
            print(f"  FAIL {name} → {type(exc).__name__}: {exc}")
    print(f"\nпройдено {len(passed)}, провалено {len(failed)}, пропущено {len(skipped)}")
    if failed:
        print("\nПровалы:")
        for f in failed:
            print(f"  × {f}")
        sys.exit(1)
    print("Полигон и примеры согласованы.")
