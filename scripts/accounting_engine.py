#!/usr/bin/env python3
"""Service Writer accounting analysis worker reference.

This worker is intentionally decoupled from the web runtime so enabling the
accounting UI cannot break bookings/payments. It accepts a CSV bank export,
normalizes common bank columns, classifies conservatively, and emits a JSON
P&L/cash-flow summary. The TypeScript UI uses the same v1 classification
contract; a hosted/background Python runner can call this module later.
"""
from __future__ import annotations

import csv
import json
import re
import sys
from dataclasses import dataclass, asdict
from decimal import Decimal, ROUND_HALF_EVEN
from pathlib import Path

MONEY = Decimal("0.01")


def money(value: str | int | float | Decimal) -> Decimal:
    if isinstance(value, Decimal):
        raw = value
    else:
        raw = Decimal(str(value).replace("$", "").replace(",", "").strip() or "0")
    return raw.quantize(MONEY, rounding=ROUND_HALF_EVEN)


@dataclass
class Transaction:
    posted_on: str
    description: str
    amount: Decimal
    classification: str
    confidence: Decimal


def classify(description: str, amount: Decimal) -> tuple[str, Decimal]:
    d = description.upper()
    def anyof(*tokens: str) -> bool:
        return any(token in d for token in tokens)

    if amount > 0:
        if anyof("REVERSAL:", "REFUND"):
            return "merchant_refund", Decimal("0.90")
        if anyof("STRIPE", "MOMSOILCHANGE", "MOMS MOBILE OIL CHANGE", "VENMO"):
            return "revenue_card", Decimal("0.94")
        if anyof("CHECK DEPOSIT", "REMOTE ONLINE DEPOSIT"):
            return "revenue_fleet", Decimal("0.82")
        if "ATM CASH DEPOSIT" in d:
            return "revenue_cash", Decimal("0.78")
        if "DEPOSIT" in d:
            return "revenue_other", Decimal("0.55")
        return "unresolved", Decimal("0.20")

    if anyof("ANTHONY GIANNETTE", "LANDLORD"):
        return "rent", Decimal("0.97")
    if "WESTLAKE" in d:
        return "vehicle_payment", Decimal("0.98")
    if "THE GENERAL" in d:
        return "insurance", Decimal("0.98")
    if anyof("BOOST MOBILE", "T-MOBILE", "TMOBILE", "METRO BY T-MOBILE"):
        return "phone", Decimal("0.92")
    if anyof("NAPA", "AUTOZONE", "HARBOR FREIGHT", "TIRE CENTER", "FIRESTONE"):
        return "parts_tools", Decimal("0.87")
    if anyof("WALMART", "WAL-MART", "WM SUPERCENTER"):
        return "inventory", Decimal("0.62")
    if anyof("MINUTEMAN", "COPIES NOW", "QR.IO", "PRINT"):
        return "marketing", Decimal("0.90")
    if anyof("CHARGEPOINT", "BLINK", "IONNA", "TOLL", "SEPTA", "LYFT", "PARKING", "WAWA", "SHELL"):
        return "transport", Decimal("0.72")
    if anyof("MONTHLY SERVICE FEE", "ATM FEE"):
        return "bank_fee", Decimal("0.95")
    return "unresolved", Decimal("0.15")


def get(row: dict[str, str], *names: str) -> str:
    lowered = {k.strip().lower(): v for k, v in row.items()}
    for name in names:
        if name.lower() in lowered:
            return lowered[name.lower()]
    return ""


def parse_csv(path: Path) -> list[Transaction]:
    result: list[Transaction] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            posted = get(row, "Posting Date", "Date", "Transaction Date", "Posted Date").strip()
            description = get(row, "Description", "Details", "Transaction Detail", "Memo", "Name").strip()
            raw = get(row, "Amount", "Transaction Amount").strip()
            if raw:
                amount = money(raw)
            else:
                credit = money(get(row, "Credit", "Deposits", "Money In") or 0)
                debit = money(get(row, "Debit", "Withdrawals", "Money Out") or 0)
                amount = credit if credit else -abs(debit)
            if not posted or not description or amount == 0:
                continue
            category, confidence = classify(description, amount)
            result.append(Transaction(posted, description, amount, category, confidence))
    return result


def summarize(rows: list[Transaction]) -> dict[str, str | int]:
    revenue_categories = {"revenue_card", "revenue_fleet", "revenue_cash", "revenue_other"}
    expense_categories = {
        "rent", "vehicle_payment", "insurance", "phone", "inventory",
        "parts_tools", "marketing", "transport", "bank_fee",
    }
    revenue = sum((r.amount for r in rows if r.amount > 0 and r.classification in revenue_categories), Decimal("0"))
    expenses = sum((abs(r.amount) for r in rows if r.amount < 0 and r.classification in expense_categories), Decimal("0"))
    refunds = sum((r.amount for r in rows if r.amount > 0 and r.classification == "merchant_refund"), Decimal("0"))
    expenses -= refunds
    cash_in = sum((r.amount for r in rows if r.amount > 0), Decimal("0"))
    cash_out = sum((abs(r.amount) for r in rows if r.amount < 0), Decimal("0"))
    owner_draws = sum((abs(r.amount) for r in rows if r.amount < 0 and r.classification == "owner_draw"), Decimal("0"))
    investor_capital = sum((r.amount for r in rows if r.amount > 0 and r.classification == "investor_capital"), Decimal("0"))
    unresolved = [r for r in rows if r.classification == "unresolved"]
    unresolved_amount = sum((abs(r.amount) for r in unresolved), Decimal("0"))

    return {
        "revenue": str(money(revenue)),
        "operating_expenses": str(money(expenses)),
        "operating_profit": str(money(revenue - expenses)),
        "cash_in": str(money(cash_in)),
        "cash_out": str(money(cash_out)),
        "net_cash_change": str(money(cash_in - cash_out)),
        "owner_draws": str(money(owner_draws)),
        "investor_capital": str(money(investor_capital)),
        "unresolved_amount": str(money(unresolved_amount)),
        "unresolved_count": len(unresolved),
    }


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: accounting_engine.py BANK_EXPORT.csv", file=sys.stderr)
        return 2
    rows = parse_csv(Path(sys.argv[1]))
    print(json.dumps({
        "version": "accounting-v1",
        "summary": summarize(rows),
        "transactions": [
            {
                **asdict(row),
                "amount": str(row.amount),
                "confidence": str(row.confidence),
            }
            for row in rows
        ],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
