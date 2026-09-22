"""02 · urllib: стандартная библиотека без внешних зависимостей.

    python examples/02_urllib_stdlib.py

Годится, когда на машине студента нельзя ставить пакеты (школьный компьютер,
ограниченный CI). Показываем заголовки, редиректы, таймаут, gzip и POST-форму.
"""

from __future__ import annotations

import gzip
import json
import urllib.error
import urllib.parse
import urllib.request

from trainer import USER_AGENT, show, url


def open_request(path: str, data: dict | None = None, timeout: float = 15.0):
    """Один вход в HTTP: Request вместо «просто url», чтобы контролировать заголовки."""
    body = urllib.parse.urlencode(data).encode() if data else None
    request = urllib.request.Request(
        url(path),
        data=body,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "ru", "Accept-Encoding": "gzip"},
        method="POST" if data else "GET",
    )
    return urllib.request.urlopen(request, timeout=timeout)  # noqa: S310 (учебный полигон)


def read_page() -> None:
    with open_request("basics/hello.html") as response:
        raw = response.read()
        show("статус", response.status)
        show("итоговый адрес после редиректов", response.geturl())
        charset = response.headers.get_content_charset() or "utf-8"
        show("кодировка из заголовка", charset)
        show("заголовок h1", raw.decode(charset).split("<h1")[1].split(">")[1].split("<")[0])


def no_redirects() -> None:
    """Запрещаем редирект и видим 302 с Location — так находят настоящий адрес."""

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D102
            return None

    opener = urllib.request.build_opener(NoRedirect)
    try:
        opener.open(url("http/redirect-301"), timeout=10)
    except urllib.error.HTTPError as exc:
        show("код без следования редиректу", f"{exc.code} {exc.reason}")
        show("Location", exc.headers.get("Location"))
        exc.close()


def errors_and_retries() -> None:
    for path in ("http/status?code=404", "http/status?code=429", "basics/etogostranicy-net.html"):
        try:
            with open_request(path) as response:
                print(f"   {path} → {response.status}")
        except urllib.error.HTTPError as exc:
            print(f"   {path} → HTTPError {exc.code}, Retry-After={exc.headers.get('Retry-After')}")
        except urllib.error.URLError as exc:
            print(f"   {path} → URLError {exc.reason}")


def charset_windows() -> None:
    """Страница в windows-1251: read() → bytes, decode() делаем сами."""
    with open_request("http/charset") as response:
        raw = response.read()
        if response.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        charset = response.headers.get_content_charset() or "utf-8"
        text = raw.decode(charset, errors="replace")
        show("декодировано как", charset)
        show("фрагмент", text[text.find("<h1>") :][:60])


def post_form() -> None:
    payload = {"q": "термос", "category": "посуда", "csrf_token": "demo-csrf-token"}
    with open_request("http/echo", data=payload) as response:
        data = json.loads(response.read().decode("utf-8"))
        show("метод", data["method"])
        show("сервер получил поля", data["fields"])
        show("длина тела", data["raw_length"])


def json_api() -> None:
    with open_request("http/api/products?page=1&size=5") as response:
        data = json.loads(response.read().decode("utf-8"))
    show("всего страниц", f"{data['pages']} по {data['size']}")
    show("товары", [item["title"] for item in data["items"]])
    show("следующий запрос", data["next"])


if __name__ == "__main__":
    read_page()
    no_redirects()
    errors_and_retries()
    charset_windows()
    post_form()
    json_api()
    print("\nГотово. Нужен локальный сервер: node tools/serve.mjs")
