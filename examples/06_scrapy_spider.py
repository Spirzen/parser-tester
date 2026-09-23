"""06 · Scrapy: два учебных паука на одном полигоне.

    pip install scrapy
    python examples/06_scrapy_spider.py catalog -O items.jsonl
    python examples/06_scrapy_spider.py quotes  -O quotes.jsonl
    # адрес полигона: PARSER_BASE_URL=http://127.0.0.1:8000 перед командой, по умолчанию он и так этот

Важная деталь про `scrapy runspider`: у этой команды нет способа выбрать паука по имени,
а в файле их двое — runspider молча берёт последнего. Поэтому файл сам разбирает аргументы:
так один и тот же пример запускается и как модуль, и как сценарий, и студент не получает
«странные» 20 строк там, где ждал двенадцать карточек.

Первый паук идёт по каталогу «Тихой бухты» явными ссылками (список → карточка),
второй собирает цитаты и обходит пагинацию по rel="next".
Оба уважают robots.txt: закрытый раздел /private/ им недоступен ровно так, как задумано.
"""

from __future__ import annotations

import os
import re

import scrapy

BASE = os.environ.get("PARSER_BASE_URL", "http://127.0.0.1:8000").rstrip("/")

COMMON_SETTINGS = {
    "ROBOTSTXT_OBEY": True,  # читает и Disallow, и Crawl-delay из robots.txt
    "DOWNLOAD_DELAY": 1,
    "RANDOMIZE_DOWNLOAD_DELAY": True,
    "CONCURRENT_REQUESTS": 4,
    "CONCURRENT_REQUESTS_PER_DOMAIN": 2,
    # Значение заголовка обязано быть латиницей: на кириллице Twisted падает с UnicodeEncodeError,
    # и падает не при сборе данных, а на первом же запросе — выглядит как поломка полигона.
    "USER_AGENT": "ParsingTrainerCourse/1.0 (+educational spider; contact: student@example.com)",
    "FEED_EXPORT_ENCODING": "utf-8",
    "RETRY_TIMES": 2,
    "RETRY_HTTP_CODES": [429, 500, 502, 503],
    "HTTPCACHE_ENABLED": False,  # включите, чтобы не долбить полигон во время демонстрации
    "LOG_LEVEL": "INFO",
}


def parse_price(raw):
    """'1 290,50 ₽' → 1290.5, '1 290 ₽' → 1290.0. Разделители приводим к одному виду."""
    if raw is None:
        return None
    cleaned = re.sub(r"[^\d.,]", "", str(raw))
    if not cleaned:
        return None
    last = max(cleaned.rfind(","), cleaned.rfind("."))
    if last == -1:
        value = cleaned
    else:
        decimals = cleaned[last + 1 :]
        if len(decimals) != 2:  # «1.290» — это тысячи, а не дробь
            value = cleaned.replace(".", "").replace(",", "")
        else:
            value = cleaned[:last].replace(".", "").replace(",", "") + "." + decimals
    try:
        return float(value)
    except ValueError:
        return None


def clean_item(item):
    """Мини-pipeline: без артикула запись не идёт в выгрузку, без цены — с флагом.

    В реальном проекте это отдельный класс в ITEM_PIPELINES; здесь он функцией,
    чтобы файл оставался самодостаточным и запускался из любой папки.
    """
    if not item.get("sku"):
        raise scrapy.exceptions.DropItem("нет артикула — вероятно, спарсил не карточку")
    if item.get("price") is None:
        item["price_missing"] = True
    return item


class CatalogSpider(scrapy.Spider):
    """Двухстадийный обход: страницы списка → карточки товаров."""

    name = "catalog"
    custom_settings = COMMON_SETTINGS
    start_urls = [f"{BASE}/scrapy/index.html"]

    def parse(self, response):
        seen = 0
        for link in response.css("a.catalog-item__link"):
            seen += 1
            yield response.follow(link, callback=self.parse_item, meta={"list_url": response.url})
        self.logger.info("на странице списка %d ссылок на карточки", seen)

        next_href = response.css('link[rel="next"]::attr(href)').get() or response.css('.pager a[rel="next"]::attr(href)').get()
        if next_href:
            yield response.follow(next_href, callback=self.parse)

    def parse_item(self, response):
        specs = {
            dt.strip(): dd.strip()
            for dt, dd in zip(
                response.css("dl.spec dt::text").getall(),
                response.css("dl.spec dd::text").getall(),
            )
        }
        # .get() вместо воображаемого .css_first(): у SelectorList.get() ровно та же
        # семантика — значение первого совпадения или None, — но он действительно существует.
        item = {
            "url": response.url,
            "list_url": response.meta["list_url"],
            "sku": response.css("article.product-card::attr(data-sku)").get() or response.css(".sku::text").get(),
            "category": response.css("article.product-card::attr(data-category)").get(),
            "title": (response.css("h1::text").get() or "").strip(),
            "price": parse_price(response.css(".price::attr(data-price)").get() or response.css(".price::text").get()),
            "currency": response.css(".price::attr(data-currency)").get(),
            "old_price": parse_price(response.css(".price--old::text").get()),
            "stock": response.css("article.product-card::attr(data-stock)").get(),
            "in_stock": "нет в наличии" not in (response.css(".stock::text").get() or ""),
            "seller": (response.css(".seller::text").get() or "").strip(),
            "rating": response.css("[data-rating]::attr(data-rating)").get(),
            "reviews": response.css("[data-reviews]::attr(data-reviews)").get(),
            "tags": [t.strip() for t in response.css(".tag-list .tag::text").getall()],
            "updated_at": response.css("article.product-card::attr(data-updated)").get(),
            "specs": specs,
            "breadcrumbs": [b.strip() for b in response.css(".breadcrumbs li::text").getall() if b.strip()],
        }
        yield clean_item(item)


class QuotesSpider(scrapy.Spider):
    """Цитаты и теги: пагинация через rel="next", авторы — отдельной стадией."""

    name = "quotes"
    custom_settings = {**COMMON_SETTINGS, "DEPTH_LIMIT": 3}
    start_urls = [f"{BASE}/scrapy/quotes.html"]

    def parse(self, response):
        for quote in response.css("blockquote.quote-block"):
            yield {
                "url": response.url,
                "text": (quote.css(".quote-text::text").get() or quote.css("::text").get() or "").strip("«» \n"),
                "author": (quote.css(".author::text").get() or "").strip(),
                "author_link": quote.css("a.author::attr(href)").get(),
                "tags": [t.strip() for t in quote.css(".tags a.tag::text").getall()],
            }
        next_href = response.css('a[rel="next"]::attr(href)').get()
        if next_href:
            yield response.follow(next_href, callback=self.parse)

    def parse_authors(self, response):  # отдельная стадия: заходим по ссылке автора
        yield {
            "author": (response.css("h1::text").get() or "").strip(),
            "born": response.css("[data-born]::attr(data-born)").get(),
            "born_country": response.css("[data-born-country]::attr(data-born-country)").get(),
            "quotes": len(response.css("blockquote.quote-block")),
        }


SPIDERS = {"catalog": CatalogSpider, "quotes": QuotesSpider}


def main(argv=None):
    """Выбор паука именем: в файле их двое, а runspider берёт последний и молчит об этом."""
    import argparse

    from scrapy.crawler import CrawlerProcess

    ap = argparse.ArgumentParser(description="Учебные пауки полигона «Тихая бухта».")
    ap.add_argument("spider", nargs="?", default="catalog", choices=sorted(SPIDERS))
    ap.add_argument("-O", "--output", metavar="FILE", help="выгрузить items в файл (jsonl)")
    args = ap.parse_args(argv)

    settings = dict(COMMON_SETTINGS)
    if args.output:
        settings["FEEDS"] = {args.output: {"format": "jsonlines", "overwrite": True}}

    process = CrawlerProcess(settings)
    process.crawl(SPIDERS[args.spider])
    process.start()  # блокирует до конца работы краулера
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
