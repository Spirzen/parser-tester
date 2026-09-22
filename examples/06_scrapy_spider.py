"""06 · Scrapy: два учебных паука на одном полигоне.

    pip install scrapy
    scrapy runspider examples/06_scrapy_spider.py -s TRAINER_BASE=http://127.0.0.1:8000 -O items.jsonl
    scrapy runspider examples/06_scrapy_spider.py -s TRAINER_BASE=http://127.0.0.1:8000 -t quotes -O quotes.jsonl

Первый паук идёт по каталогу «Тихой бухты» явными ссылками (список → карточка),
второй собирает цитаты и обходит пагинацию по rel="next".
Оба уважают robots.txt: закрытый раздел /private/ им недоступен ровно так, как задумано.
"""

from __future__ import annotations

import os
import re

import scrapy

BASE = os.environ.get("TRAINER_BASE", "http://127.0.0.1:8000").rstrip("/")

COMMON_SETTINGS = {
    "ROBOTSTXT_OBEY": True,  # читает и Disallow, и Crawl-delay из robots.txt
    "DOWNLOAD_DELAY": 1,
    "RANDOMIZE_DOWNLOAD_DELAY": True,
    "CONCURRENT_REQUESTS": 4,
    "CONCURRENT_REQUESTS_PER_DOMAIN": 2,
    "USER_AGENT": "ParsingTrainerCourse/1.0 (+учебный курс; contact: student@example.com)",
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
        item = {
            "url": response.url,
            "list_url": response.meta["list_url"],
            "sku": response.css_first("article.product-card::attr(data-sku)") or response.css_first(".sku::text"),
            "category": response.css_first("article.product-card::attr(data-category)"),
            "title": (response.css_first("h1::text") or "").strip(),
            "price": parse_price(response.css_first(".price::attr(data-price)") or response.css_first(".price::text")),
            "currency": response.css_first(".price::attr(data-currency)"),
            "old_price": parse_price(response.css_first(".price--old::text")),
            "stock": response.css_first("article.product-card::attr(data-stock)"),
            "in_stock": "нет в наличии" not in (response.css_first(".stock::text") or ""),
            "seller": (response.css_first(".seller::text") or "").strip(),
            "rating": response.css_first("[data-rating]::attr(data-rating)"),
            "reviews": response.css_first("[data-reviews]::attr(data-reviews)"),
            "tags": [t.strip() for t in response.css(".tag-list .tag::text").getall()],
            "updated_at": response.css_first("article.product-card::attr(data-updated)"),
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
                "text": (quote.css_first(".quote-text::text") or quote.css_first("::text") or "").strip("«» \n"),
                "author": (quote.css_first(".author::text") or "").strip(),
                "author_link": quote.css_first("a.author::attr(href)"),
                "tags": [t.strip() for t in quote.css(".tags a.tag::text").getall()],
            }
        next_href = response.css('a[rel="next"]::attr(href)').get()
        if next_href:
            yield response.follow(next_href, callback=self.parse)

    def parse_authors(self, response):  # отдельная стадия: заходим по ссылке автора
        yield {
            "author": (response.css_first("h1::text") or "").strip(),
            "born": response.css_first("[data-born]::attr(data-born)"),
            "born_country": response.css_first("[data-born-country]::attr(data-born-country)"),
            "quotes": len(response.css("blockquote.quote-block")),
        }
