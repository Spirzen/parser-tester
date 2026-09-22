"""Общие мелочи для примеров курса: адрес полигона и вежливый запрос.

Полигон доступен двумя способами, примеры работают с обоими:

    export PARSER_BASE_URL=http://127.0.0.1:8000   # node tools/serve.mjs
    export PARSER_BASE_URL=https://<user>.github.io/parser-tester

По умолчанию берётся локальный сервер: только на нём живые HTTP-эндпоинты
(/http/echo, /http/status?code=429, /http/api/products, /http/charset).
"""

from __future__ import annotations

import os
import time

DEFAULT_BASE = "http://127.0.0.1:8000"
USER_AGENT = "ParsingTrainerCourse/1.0 (+educational requests; contact: student@example.com)"
DELAY = float(os.environ.get("PARSER_DELAY", "0.2"))  # вежливость: пауза между запросами


def base_url() -> str:
    return os.environ.get("PARSER_BASE_URL", DEFAULT_BASE).rstrip("/")


def url(path: str = "") -> str:
    """Собирает адрес от корня полигона: url('selectors/products.html')."""
    return f"{base_url()}/{path.lstrip('/')}"


def session():
    """requests.Session с нормальным User-Agent — как надо представиться серверу."""
    import requests

    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "ru,en;q=0.8"})
    return s


def polite_get(path: str, **kwargs):
    """GET с паузой перед запросом, чтобы группа из 20 студентов не выглядела атакой."""
    import requests

    time.sleep(DELAY)
    response = requests.get(url(path), timeout=kwargs.pop("timeout", 15), **kwargs)
    response.raise_for_status()
    return response


def show(title: str, value) -> None:
    print(f"\n— {title}")
    if isinstance(value, (list, tuple)):
        for item in value[:12]:
            print(f"   {item}")
        if len(value) > 12:
            print(f"   … ещё {len(value) - 12}")
    else:
        print(f"   {value}")
