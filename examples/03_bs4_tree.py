"""03 · BeautifulSoup: дерево, соседи, атрибуты и три парсера на одной битой странице.

    pip install beautifulsoup4 lxml
    python examples/03_bs4_tree.py

Здесь вся «школа навигации»: find/find_all, select (CSS), parent/children,
next_sibling/previous_sibling, атрибуты и data-*, отличия html.parser / lxml /
html5lib и главное — BeautifulSoup видит исходный HTML, а не дорисованный браузером.
"""

from __future__ import annotations

import re

from bs4 import BeautifulSoup
from trainer import polite_get, show


def soup_for(path: str, parser: str = "lxml") -> BeautifulSoup:
    return BeautifulSoup(polite_get(path).text, parser)


def css_and_find() -> None:
    soup = soup_for("selectors/products.html")
    cards = soup.select("article.product-card")
    show("карточек через CSS", len(cards))
    show("то же через find_all", len(soup.find_all("article", class_="product-card")))
    first = cards[0]
    show("заголовок первой карточки", first.select_one("h3").get_text(strip=True))
    show("цена из атрибута", first.select_one(".price")["data-price"], )
    show("все теги первой карточки", [li.get_text(strip=True) for li in first.select(".tag-list li")])
    hidden = [c for c in cards if "display:none" in (c.get("style") or "")]
    show("скрытые карточки (bs4 их видит)", [c.get("data-sku") for c in hidden])


def tree_navigation() -> None:
    soup = soup_for("selectors/nesting.html")
    deep = soup.select_one("div.lvl5")
    chain = []
    node = deep
    while node is not None and getattr(node, "name", None):
        chain.append(node.name + "".join(f".{c}" for c in (node.get("class") or [])[:1]))
        node = node.parent
    show("путь вверх от lvl5", " < ".join(chain))

    target = soup.select_one(".sibling-target")
    show("previous_sibling (может быть '\\n')", repr(target.previous_sibling))
    prev = target.find_previous_sibling()
    nexts = target.find_next_siblings()
    show("сосед сверху", prev.get("class"))
    show("соседи снизу", [n.get("class") for n in nexts])
    show("дети списка tree", [c.name for c in soup.select_one("ul.tree").children if c.name])
    show("все потомки через descendants", len(list(soup.select_one("div.lvl1").descendants)))


def attributes_data() -> None:
    soup = soup_for("selectors/attributes.html")
    items = soup.select("[data-sku]")
    show("элементов с data-sku", len(items))
    rows = [(i["data-sku"], i.get("data-price"), i.get("data-currency")) for i in items[:8]]
    show("первые строки", rows)
    show("сумма в рублях", sum(float(r[1]) for r in rows if r[1] and r[2] == "RUB"))
    show("узел без attrs", soup.select_one("[data-no-attrs]") is not None)
    aria = soup.select("[aria-hidden='true']")
    show("aria-hidden", [a.get_text(strip=True)[:20] for a in aria])


def tables_and_lists() -> None:
    """Таблицы markup/tables.html: двухстрочная шапка, вложенная таблица, съехавшие колонки."""
    soup = soup_for("markup/tables.html")

    stock = soup.find("table", id="stock-table")
    show("подпись таблицы", stock.caption.get_text(strip=True))
    show("th в шапке (больше, чем колонок: rowspan и colspan)", len(stock.select("thead th")))
    widths = [sum(int(td.get("colspan", 1)) for td in tr.find_all("td")) for tr in stock.select("tbody > tr")]
    show("ширина строк tbody", widths)
    show("итог из tfoot", soup.select("#stock-table tfoot td")[-1].get_text(strip=True))
    show("скрытая строка (bs4 её вернёт)", [tr.get_text(" ", strip=True)[:24] for tr in stock.select("tr.is-hidden-row")])

    # Вложенная таблица: find_all("tr") без фильтра захватывает и внутренние строки.
    show("tr во внешней (recursive)", len(soup.find("table", id="orders-nested").find_all("tr")))
    show("tr только внешней", len(soup.select("#orders-nested > tbody > tr")))
    show("tr внутренней order-lines", len(soup.select("#order-lines > tbody > tr")))

    headers = [th.get_text(strip=True) for th in soup.select("#shifted-table > thead th")]
    show("шапка выгрузки", headers)
    for i, tr in enumerate(soup.select("#shifted-table > tbody > tr"), start=1):
        cells = tr.find_all("td")
        if len(cells) != len(headers):
            show(f"строка {i}: колонки не совпали ({len(cells)})", [c.get_text(strip=True) for c in cells])

    lists = soup_for("markup/lists.html")
    dl = lists.select_one("dl.spec")
    show("dl как словарь", {dt.get_text(strip=True): dd.get_text(strip=True)
                            for dt, dd in zip(dl.find_all("dt"), dl.find_all("dd"))})
    show("li без закрывающего тега", len(lists.select("#nested ul > li")))


def three_parsers() -> None:
    """Один и тот же битый фрагмент через три парсера — разные деревья и разное число узлов."""
    html = polite_get("markup/broken.html").text
    match = re.search(r"<!--\s*broken:start\s*-->([\s\S]*?)<!--\s*broken:end\s*-->", html)
    frag = match.group(1)
    for parser in ("html.parser", "lxml", "html5lib"):
        try:
            soup = BeautifulSoup(frag, parser)
        except Exception as exc:  # html5lib ставится отдельно: pip install html5lib
            print(f"   {parser:11} -> пропущен ({exc})")
            continue
        print(
            f"   {parser:11} → div.product-row: {len(soup.select('div.product-row')):2}, "
            f"p внутри p: {len(soup.select('p p')):2}, "
            f"td: {len(soup.select('td')):2}, "
            f"li: {len(soup.select('li')):2}, "
            f"всего узлов: {len(soup.find_all(True))}"
        )


def xpath_for_comparison() -> None:
    """XPath живёт не в bs4, а в lxml: сравните выражение с тем же CSS из bs4."""
    from lxml import html as lh

    tree = lh.fromstring(polite_get("selectors/products.html").text)
    # Классическая ловушка: текст заголовка лежит внутри <a>, поэтому h3/text() молчит — нужен h3//text()
    show("h3/text() — пусто", tree.xpath("//article[contains(@class,'product-card')]//h3/text()"))
    titles = tree.xpath("//article[contains(@class,'product-card')]//h3//text()")
    show("lxml xpath, заголовков", len(titles))
    prices = [float(p) for p in tree.xpath("//span[@data-price]/@data-price")]
    current = [float(p) for p in tree.xpath("//span[contains(@class,'price') and not(contains(@class,'price--old'))]/@data-price")]
    show("ценай всего (с зачёркнутыми)", len(prices))
    show("только актуальные", len(current))
    show("средняя цена по xpath", round(sum(current) / len(current), 2) if current else "нет данных")
    show("первый xpath-результат", titles[0] if titles else None)


def js_only_page() -> None:
    soup = soup_for("js/dynamic-table.html")
    show("строк таблицы в исходном HTML", len(soup.select("#stock-body tr")))
    show("вывод", "данных нет в исходнике — нужен Selenium/Playwright или поиск эндпоинта")


if __name__ == "__main__":
    css_and_find()
    tree_navigation()
    attributes_data()
    tables_and_lists()
    three_parsers()
    xpath_for_comparison()
    js_only_page()
    print("\nГотово.")
