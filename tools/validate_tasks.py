"""Проверка решений из карточек заданий: селекторы обязаны синтаксически работать на dist/.

    pip install beautifulsoup4 lxml
    python tools/validate_tasks.py            # падает только на синтаксических ошибках
    python tools/validate_tasks.py --zero     # дополнительно ругаться на пустые выборки

Зачем: карточка задания — это обещание («решение в одну строку»). Если студент вставит
селектор, который падает или ничего не находит, обещание нарушается, а страницы со временем
меняются. Прогоняем каждое css/xpath-выражение по фактической сборке.

Выражения достаём из сниппетов через ast: решения пишутся и как «article.product-card»,
и как «len(soup.select('article.product-card'))», и как «tree.xpath('//article')».
"""

from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

from bs4 import BeautifulSoup
from lxml import html as lh

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
TASKS = DIST / "data" / "tasks.json"

CSS_METHODS = {"select", "select_one", "cssselect"}
XPATH_METHODS = {"xpath"}
# Только выборки от корня документа проверимы в отрыве от контекста.
SOUP_ROOTS = {"soup", "page", "doc", "document", "root", "soup_page"}
# На этих страницах разметку рисует браузер: пустая выборка от requests — и есть урок.
JS_RENDERED = {"http/cookies", "pagination/load-more", "pagination/infinite-scroll",
               "pagination/query", "js/dynamic-table", "js/spa", "js/hidden-lazy", "js/shadow-dom"}


def looks_like_selector(text: str) -> bool:
    if not text or "\n" in text or len(text) > 200:
        return False
    if text.startswith(("//", "(//", "@")):
        return False
    return text[0].isalnum() or text[0] in ".#*[>"


def expressions(tool: str, snippet: str) -> list[tuple[str, str]]:
    """Пары (вид, выражение) для всех селекторов, которые видно в сниппете."""
    if tool == "css":
        text = snippet.strip()
        return [("css", text)] if looks_like_selector(text) else []

    try:
        parsed = ast.parse(snippet.strip(), mode="eval")
    except SyntaxError:
        try:
            parsed = ast.parse(snippet.strip())
        except SyntaxError:
            return []

    found: list[tuple[str, str]] = []
    for node in ast.walk(parsed):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        kind = "css" if node.func.attr in CSS_METHODS else ("xpath" if node.func.attr in XPATH_METHODS else None)
        if not kind or not node.args:
            continue
        first = node.args[0]
        if not (isinstance(first, ast.Constant) and isinstance(first.value, str)):
            continue
        receiver = getattr(node.func.value, "id", "")
        if kind == "css" and receiver and receiver not in SOUP_ROOTS:
            continue  # выборка из узла: :scope и «> …» здесь проверяются в контексте элемента, не документа
        found.append((kind, first.value))
    return found


def main() -> int:
    strict_zero = "--zero" in sys.argv
    if not TASKS.exists():
        print("validate_tasks: нет dist/data/tasks.json — сначала node tools/build.mjs")
        return 1

    tasks = json.loads(TASKS.read_text(encoding="utf-8"))
    errors: list[str] = []
    warnings: list[str] = []
    checked = 0

    for page_id, items in tasks.items():
        page = DIST / f"{page_id}.html"
        if not page.exists():
            errors.append(f"{page_id}: страницы нет в сборке")
            continue
        raw = page.read_text(encoding="utf-8")
        soup = BeautifulSoup(raw, "lxml")
        tree = lh.fromstring(raw)

        for task in items:
            tid = task.get("id", "?")
            for tool, snippet in (task.get("solution") or {}).items():
                if not isinstance(snippet, str):
                    continue
                for kind, expr in expressions(tool, snippet):
                    checked += 1
                    try:
                        found = len(soup.select(expr)) if kind == "css" else tree.xpath(expr)
                    except Exception as exc:
                        errors.append(f"{tid} [{tool}]: {kind} «{expr}» — {type(exc).__name__}: {str(exc).splitlines()[0]}")
                        continue
                    if not found:
                        line = f"{tid} [{tool}]: {kind} «{expr}» пустой на {page_id}"
                        if page_id in JS_RENDERED:
                            continue  # так и задумано: узлы появляются только после работы JS
                        (errors if strict_zero else warnings).append(line)

    print(f"validate_tasks: страниц {len(tasks)}, выражений проверено {checked}, ошибок {len(errors)}, предупреждений {len(warnings)}")
    for line in errors[:40]:
        print(f"  × {line}")
    for line in warnings[:25]:
        print(f"  ! {line}")
    if len(warnings) > 25:
        print(f"  ! … ещё {len(warnings) - 25}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
