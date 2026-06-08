"""Regression for issue #78: a file whose symbol list has two symbols with the
same name must not crash indexing (overloads / repeated defs / LLM dupes).

The symbols PK is (file_path, name), so upsert must be conflict-safe
(last-write-wins) rather than raising on the duplicate.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from mira.index.store import FileSummary, IndexStore, SymbolInfo


@pytest.fixture
def store(tmp_path: Path) -> IndexStore:
    return IndexStore(str(tmp_path / "index.db"))


def _summary(symbols: list[SymbolInfo]) -> FileSummary:
    return FileSummary(
        path="src/overloads.py",
        language="python",
        summary="file with duplicate symbol names",
        symbols=symbols,
        imports=[],
        symbol_refs=[],
        external_refs=[],
    )


def test_duplicate_symbol_names_do_not_crash(store: IndexStore):
    summary = _summary(
        [
            SymbolInfo(name="handle", kind="function", signature="handle(a)", description="first"),
            SymbolInfo(
                name="handle", kind="function", signature="handle(a, b)", description="second"
            ),
        ]
    )
    # Must not raise IntegrityError.
    store.upsert_summary(summary)


def test_last_write_wins_for_duplicate_name(store: IndexStore):
    store.upsert_summary(
        _summary(
            [
                SymbolInfo(
                    name="handle", kind="function", signature="handle(a)", description="first"
                ),
                SymbolInfo(
                    name="handle", kind="function", signature="handle(a, b)", description="second"
                ),
            ]
        )
    )
    syms = [s for s in store.get_summary("src/overloads.py").symbols if s.name == "handle"]
    assert len(syms) == 1
    assert syms[0].signature == "handle(a, b)"  # last one kept


def test_reindex_same_file_is_idempotent(store: IndexStore):
    s = _summary([SymbolInfo(name="f", kind="function", signature="f()", description="d")])
    store.upsert_summary(s)
    store.upsert_summary(s)  # re-index must not crash or duplicate
    assert len([x for x in store.get_summary("src/overloads.py").symbols if x.name == "f"]) == 1
