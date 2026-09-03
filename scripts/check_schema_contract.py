#!/usr/bin/env python3
"""Reject new runtime dependencies on retired ServiceWriter schema contracts.

This guard is intentionally diff-scoped: the repository still contains historical
import/migration code and some legacy feature debt, but changed runtime code may not
introduce or preserve a retired dependency without first migrating it.
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_PREFIXES = ("src/", "app/", "packages/")
RUNTIME_SUFFIXES = (".ts", ".tsx", ".js", ".jsx", ".mjs")
SKIP_PARTS = ("/__tests__/", "/test/", "/tests/", "/fixtures/", "/generated/")

RULES: list[tuple[str, re.Pattern[str], str]] = [
    ("retired table business_profiles", re.compile(r"\.from\(\s*['\"]business_profiles['\"]\s*\)"), "use workspaces/workspace_settings"),
    ("retired table blocked_dates", re.compile(r"\.from\(\s*['\"]blocked_dates['\"]\s*\)"), "use workspace_blackout_dates"),
    ("retired table intake_questions", re.compile(r"\.from\(\s*['\"]intake_questions['\"]\s*\)"), "use workspace_intake_questions"),
    ("retired table client_error_events", re.compile(r"(?:\.from\(\s*['\"]client_error_events['\"]\s*\)|/rest/v1/client_error_events)"), "use server observability/logging"),
    ("retired table customer_accounts", re.compile(r"\.from\(\s*['\"]customer_accounts['\"]\s*\)"), "use customers + customer_users"),
    ("retired customer account RPC", re.compile(r"\.rpc\(\s*['\"]create_customer_account['\"]"), "use link_customer_portal_account_v1"),
    ("retired customer appointments RPC", re.compile(r"\.rpc\(\s*['\"]get_customer_portal_appointments['\"]"), "use get_customer_portal_appointments_v1"),
    ("retired table services", re.compile(r"\.from\(\s*['\"]services['\"]\s*\)"), "use service_catalog"),
    ("retired table appointment_services", re.compile(r"\.from\(\s*['\"]appointment_services['\"]\s*\)"), "use appointment_items"),
    ("retired table fleet_work_orders", re.compile(r"\.from\(\s*['\"]fleet_work_orders['\"]\s*\)"), "use work_orders/fleet_service_requests"),
    ("retired table fleet_vehicles", re.compile(r"\.from\(\s*['\"]fleet_vehicles['\"]\s*\)"), "use vehicles"),
    ("retired table technicians", re.compile(r"\.from\(\s*['\"]technicians['\"]\s*\)"), "use profiles + workspace membership/assignments"),
    ("retired cash collection view", re.compile(r"\.from\(\s*['\"]cash_collection_receipts_v1['\"]\s*\)"), "use canonical payments/invoices APIs"),
    ("retired access edge function", re.compile(r"functions\.invoke\(\s*['\"]gate-app-access['\"]"), "use canonical Supabase session/workspace RBAC"),
    ("legacy appointments.user_id scope", re.compile(r"\.from\(\s*['\"]appointments['\"]\s*\)[\s\S]{0,1400}?\.eq\(\s*['\"]user_id['\"]"), "scope appointments by workspace_id"),
    ("legacy appointment title column", re.compile(r"\.from\(\s*['\"]appointments['\"]\s*\)[\s\S]{0,900}?\.select\([^)]*\btitle\b"), "appointments.title does not exist; derive display text"),
    ("legacy appointment scheduled_date column", re.compile(r"\.from\(\s*['\"]appointments['\"]\s*\)[\s\S]{0,900}?\.select\([^)]*\bscheduled_date\b"), "use starts_at"),
    ("legacy appointment scheduled_time column", re.compile(r"\.from\(\s*['\"]appointments['\"]\s*\)[\s\S]{0,900}?\.select\([^)]*\bscheduled_time\b"), "use starts_at"),
]


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def is_runtime(path: str) -> bool:
    normalized = "/" + path.replace("\\", "/")
    if not path.startswith(RUNTIME_PREFIXES) or not path.endswith(RUNTIME_SUFFIXES):
        return False
    return not any(part in normalized for part in SKIP_PARTS)


def changed_paths(base: str, head: str) -> list[str]:
    output = git("diff", "--name-only", "--diff-filter=ACMR", base, head)
    return [p for p in output.splitlines() if is_runtime(p) and (ROOT / p).is_file()]


def all_runtime_paths() -> list[str]:
    paths: list[str] = []
    for prefix in RUNTIME_PREFIXES:
        root = ROOT / prefix
        if not root.exists():
            continue
        for item in root.rglob("*"):
            if item.is_file():
                rel = item.relative_to(ROOT).as_posix()
                if is_runtime(rel):
                    paths.append(rel)
    return sorted(paths)


def check(paths: list[str]) -> list[str]:
    violations: list[str] = []
    for path in paths:
        text = (ROOT / path).read_text(encoding="utf-8", errors="replace")
        for name, pattern, replacement in RULES:
            match = pattern.search(text)
            if not match:
                continue
            line = text.count("\n", 0, match.start()) + 1
            violations.append(f"{path}:{line}: {name}; {replacement}")
    return violations


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit", action="store_true", help="scan all runtime code instead of only changed files")
    parser.add_argument("--report-only", action="store_true", help="print violations without failing")
    parser.add_argument("--base", default=os.environ.get("BASE_SHA"))
    parser.add_argument("--head", default=os.environ.get("GITHUB_SHA", "HEAD"))
    args = parser.parse_args()

    if args.audit:
        paths = all_runtime_paths()
    else:
        base = args.base or "HEAD^"
        paths = changed_paths(base, args.head)

    violations = check(paths)
    print(f"schema-contract: checked {len(paths)} runtime file(s)")
    if not violations:
        print("schema-contract: PASS")
        return 0

    print("schema-contract: retired schema dependencies detected:", file=sys.stderr)
    for violation in violations:
        print(f"- {violation}", file=sys.stderr)
    print("Canonical replacements are documented in scripts/schema-contract.json.", file=sys.stderr)
    return 0 if args.report_only else 1


if __name__ == "__main__":
    raise SystemExit(main())
