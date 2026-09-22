"""01 · requests: первый обход полигона.

    pip install requests beautifulsoup4 lxml
    node tools/build.mjs && node tools/serve.mjs      # в отдельном окне
    python examples/01_requests_basics.py

Что отрабатываем: timeout, raise_for_status, заголовки, кодировка, сессия и куки,
повторная попытка на 429, запрос к «JSON API» вместо разбора HTML.
"""

from __future__ import annotations

import time

from trainer import polite_get, session, show, url


def first_page() -> None:
    response = polite_get("basics/hello.html")
    show("код ответа", response.status_code)
    show("итоговый URL после редиректов", response.url)
    show("Content-Type из заголовков", response.headers.get("Content-Type"))
    show("во что requests решил, что страница закодирована", response.encoding)
    show("заголовок страницы", response.text.split("<title>")[1].split("</title>")[0])


def check_status_codes() -> None:
    """requests не считает 404 ошибкой: поднимаем её сами, иначе парсер молча проглотит глушку."""
    import requests

    for code in (200, 404, 429, 503):
        time.sleep(0.1)
        response = requests.get(url(f"http/status?code={code}"), timeout=10)
        note = response.headers.get("Retry-After")
        print(f"   code={code} → {response.status_code}, Retry-After={note}, json={response.text[:60]}")
    show("raise_for_status на 429", "ожидаем исключение HTTPError")
    try:
        polite_get("http/status?code=429")
    except requests.HTTPError as exc:
        print(f"   поймали: {exc}")


def with_headers() -> None:
    # Значение заголовка обязано быть latin-1: «урок-01» на русском HTTP клиент не отправит.
    response = polite_get("http/echo", headers={"X-Trainer": "lesson-01"})
    data = response.json()
    show("что увидел сервер в User-Agent", data["headers"].get("user-agent"))
    show("наш заголовок дошёл", data["headers"].get("x-trainer"))
    show("query", data["query"])


def encoding_rescue() -> None:
    """Старый сайт в windows-1251: берём bytes и декодируем сами, не доверяя автоопределению."""
    response = polite_get("http/charset")
    show("response.text (может быть кракозябрами)", response.text[:80])
    fixed = response.content.decode("windows-1251", errors="replace")
    show("response.content.decode('windows-1251')", fixed[fixed.find("<h1>") :][:60])


def session_and_cookies() -> None:
    s = session()
    show("выдача куки", s.get(url("http/cookies"), timeout=10).cookies.get_dict())
    echo = s.get(url("http/echo"), timeout=10).json()
    show("сервер вернул наши куки обратно", echo["cookies"])
    show("401 без ключа", s.get(url("http/protected"), timeout=10).status_code)
    show("200 с ключом", s.get(url("http/protected"), headers={"X-API-Key": "trainer-demo-key"}, timeout=10).json())


def prefer_json_api() -> None:
    """Два способа получить одни и те же данные и сравнение объёма ответа."""
    html_len = len(polite_get("selectors/products.html").text)
    api = polite_get("http/api/products?page=1&size=8").json()
    show("размер HTML-страницы каталога", f"{html_len} символов")
    show("размер JSON-ответа", f"{len(api['items'])} товаров, страница {api['page']} из {api['pages']}")
    show("первый товар", api["items"][0]["title"])
    show("куда вести следующий запрос", api["next"])


def retry_on_throttle() -> None:
    """Как реагировать на 429: читаем Retry-After и повторяем конечное число раз."""
    import requests

    attempts = 0
    response = None
    while attempts < 3:
        attempts += 1
        response = requests.get(url("http/status?code=429"), timeout=10)
        wait = float(response.headers.get("Retry-After", 1))
        print(f"   попытка {attempts}: {response.status_code}, ждём {wait} с")
        if response.status_code != 429:
            break
        time.sleep(wait)
    show("итог", f"{attempts} попыток, последний код {response.status_code}")


if __name__ == "__main__":
    first_page()
    check_status_codes()
    with_headers()
    encoding_rescue()
    session_and_cookies()
    prefer_json_api()
    retry_on_throttle()
    print("\nГотово. Если что-то из HTTP-раздела не отвечает — поднят ли node tools/serve.mjs?")
