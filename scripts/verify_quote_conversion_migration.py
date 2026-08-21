#!/usr/bin/env python3
"""Audit quote-conversion data after the schema migration.

Read-only by default. Required environment variables:
  SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
Optional:
  QUOTE_CONVERSION_WORKSPACE_ID   Limit the audit to one workspace.
  QUOTE_CONVERSION_PAGE_SIZE      REST page size, default 500.
  QUOTE_CONVERSION_FAIL_ON_WARN   Treat warnings as failures when set to 1.

The script intentionally uses the service-role key only from a server/CI shell.
Never expose that key to the browser or commit it to the repository.
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any

import requests


@dataclass
class Finding:
    severity: str
    code: str
    message: str
    sample: list[str]


class AuditClient:
    def __init__(self) -> None:
        url = (os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not url or not key:
            raise SystemExit("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        self.base = f"{url}/rest/v1"
        self.session = requests.Session()
        self.session.headers.update({"apikey": key, "Authorization": f"Bearer {key}"})
        self.page_size = max(1, min(int(os.getenv("QUOTE_CONVERSION_PAGE_SIZE", "500")), 1000))
        self.workspace_id = os.getenv("QUOTE_CONVERSION_WORKSPACE_ID", "").strip() or None

    def rows(self, table: str, columns: str, extra: dict[str, str] | None = None) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        offset = 0
        while True:
            params: dict[str, str] = {
                "select": columns,
                "limit": str(self.page_size),
                "offset": str(offset),
            }
            if self.workspace_id:
                params["workspace_id"] = f"eq.{self.workspace_id}"
            if extra:
                params.update(extra)
            response = self.session.get(f"{self.base}/{table}", params=params, timeout=30)
            if not response.ok:
                raise RuntimeError(f"GET {table} failed ({response.status_code}): {response.text[:500]}")
            page = response.json()
            if not isinstance(page, list):
                raise RuntimeError(f"GET {table} returned a non-list response")
            result.extend(page)
            if len(page) < self.page_size:
                return result
            offset += self.page_size


def ids(rows: list[dict[str, Any]], key: str = "id") -> set[str]:
    return {str(row[key]) for row in rows if row.get(key)}


def add(findings: list[Finding], severity: str, code: str, message: str, sample: list[str] = ()) -> None:
    findings.append(Finding(severity, code, message, list(sample[:10])))


def main() -> int:
    client = AuditClient()
    findings: list[Finding] = []

    quotes = client.rows("quotes", "id,workspace_id,status,created_by,updated_at,total,subtotal,tax_total")
    quote_items = client.rows("quote_items", "id,quote_id,workspace_id,quantity,unit_price,total_price")
    conversions = client.rows("quote_conversions", "id,workspace_id,quote_id,service_record_id,idempotency_key,status,created_by,created_at")
    records = client.rows("service_records", "id,workspace_id,quote_id,status,subtotal,total_amount,currency_code")
    line_items = client.rows("service_record_line_items", "id,workspace_id,service_record_id,source_quote_id,source_quote_item_id,quantity,unit_price,total_price,item_type")

    quote_by_id = {str(row["id"]): row for row in quotes}
    record_by_id = {str(row["id"]): row for row in records}
    conversion_by_id = {str(row["id"]): row for row in conversions}
    quote_item_by_id = {str(row["id"]): row for row in quote_items}

    missing_quote_workspace = [str(row["id"]) for row in quotes if not row.get("workspace_id")]
    missing_item_workspace = [str(row["id"]) for row in quote_items if not row.get("workspace_id")]
    if missing_quote_workspace:
        add(findings, "error", "quote_workspace_missing", "Quotes without workspace ownership.", missing_quote_workspace)
    if missing_item_workspace:
        add(findings, "error", "quote_item_workspace_missing", "Quote items without workspace ownership.", missing_item_workspace)

    successful = [row for row in conversions if row.get("status") == "converted"]
    success_by_quote: defaultdict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in successful:
        success_by_quote[(str(row.get("workspace_id")), str(row.get("quote_id")))].append(row)
    duplicate_success = [f"{workspace}:{quote}" for (workspace, quote), rows in success_by_quote.items() if len(rows) > 1]
    if duplicate_success:
        add(findings, "error", "duplicate_successful_conversions", "More than one successful conversion exists for a workspace/quote pair.", duplicate_success)

    conversion_keys = Counter((str(row.get("workspace_id")), str(row.get("quote_id")), str(row.get("idempotency_key"))) for row in conversions)
    duplicate_keys = [": ".join(key) for key, count in conversion_keys.items() if count > 1]
    if duplicate_keys:
        add(findings, "error", "duplicate_idempotency_keys", "Duplicate workspace/quote/idempotency-key rows exist.", duplicate_keys)

    successful_quote_ids = set()
    for conversion in successful:
        workspace = str(conversion.get("workspace_id"))
        quote_id = str(conversion.get("quote_id"))
        record_id = str(conversion.get("service_record_id")) if conversion.get("service_record_id") else ""
        quote = quote_by_id.get(quote_id)
        record = record_by_id.get(record_id)
        successful_quote_ids.add((workspace, quote_id))
        if not quote:
            add(findings, "error", "conversion_quote_missing", "Successful conversion references a missing quote.", [quote_id])
        elif str(quote.get("workspace_id")) != workspace:
            add(findings, "error", "conversion_quote_cross_workspace", "Conversion and quote workspace IDs differ.", [quote_id])
        elif quote.get("status") != "converted":
            add(findings, "error", "converted_quote_status_mismatch", "Successful conversion exists but quote status is not converted.", [quote_id])
        if not record:
            add(findings, "error", "conversion_service_record_missing", "Successful conversion references a missing service record.", [record_id])
        elif str(record.get("workspace_id")) != workspace:
            add(findings, "error", "conversion_record_cross_workspace", "Conversion and service-record workspace IDs differ.", [record_id])
        elif str(record.get("quote_id")) != quote_id:
            add(findings, "error", "record_quote_link_mismatch", "Service record quote_id does not match the conversion quote.", [record_id])

    for row in records:
        if row.get("quote_id") and str(row["quote_id"]) not in quote_by_id:
            add(findings, "error", "orphan_service_record_quote", "Service record quote_id references a missing quote.", [str(row["id"])])

    lines_by_record: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    lines_by_quote_item: defaultdict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for line in line_items:
        record_id = str(line.get("service_record_id"))
        lines_by_record[record_id].append(line)
        if line.get("source_quote_item_id"):
            lines_by_quote_item[(str(line.get("workspace_id")), str(line["source_quote_item_id"]))].append(line)
        if record_id not in record_by_id:
            add(findings, "error", "orphan_line_item_record", "Line item references a missing service record.", [str(line["id"])])
        elif str(line.get("workspace_id")) != str(record_by_id[record_id].get("workspace_id")):
            add(findings, "error", "line_item_cross_workspace", "Line item and service record workspace IDs differ.", [str(line["id"])])
        if line.get("source_quote_item_id") and str(line["source_quote_item_id"]) not in quote_item_by_id:
            add(findings, "error", "orphan_line_item_quote_item", "Line item references a missing quote item.", [str(line["id"])])

    duplicate_source_items = [f"{workspace}:{item}" for (workspace, item), rows in lines_by_quote_item.items() if len(rows) > 1]
    if duplicate_source_items:
        add(findings, "error", "duplicate_source_quote_items", "A source quote item was converted into multiple line items.", duplicate_source_items)

    for conversion in successful:
        record_id = str(conversion.get("service_record_id"))
        if record_id in record_by_id and not lines_by_record.get(record_id):
            add(findings, "warning", "converted_record_without_lines", "Converted service record has no line items; verify zero-item quote is intentional.", [record_id])

    quote_ids_with_conversion = {quote_id for _, quote_id in successful_quote_ids}
    converted_status_without_conversion = [str(row["id"]) for row in quotes if row.get("status") == "converted" and str(row["id"]) not in quote_ids_with_conversion]
    if converted_status_without_conversion:
        add(findings, "error", "converted_quote_without_audit", "Quote is marked converted but has no successful conversion audit row.", converted_status_without_conversion)

    summary = {
        "scope_workspace_id": client.workspace_id,
        "counts": {
            "quotes": len(quotes),
            "quote_items": len(quote_items),
            "quote_conversions": len(conversions),
            "successful_conversions": len(successful),
            "service_records": len(records),
            "service_record_line_items": len(line_items),
        },
        "findings": [finding.__dict__ for finding in findings],
        "result": "fail" if any(f.severity == "error" for f in findings) or (os.getenv("QUOTE_CONVERSION_FAIL_ON_WARN") == "1" and findings) else "pass",
    }
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 1 if summary["result"] == "fail" else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except requests.RequestException as exc:
        print(json.dumps({"result": "fail", "error": str(exc)}), file=sys.stderr)
        raise SystemExit(2)
    except ValueError as exc:
        print(json.dumps({"result": "fail", "error": str(exc)}), file=sys.stderr)
        raise SystemExit(2)
