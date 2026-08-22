from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import pandas as pd

SOURCE_DIR = Path('/home/ubuntu/upload')
OUT_DIR = Path('/home/ubuntu/ServiceWriterFinal/data/moms-mobile-oil-change/profile')
FILES = [
    'vehicles-2026-08-21.csv',
    'appointments-2026-08-21.csv',
    'customers-2026-08-21.csv',
    'appointments-2026-07-22.csv',
    'appointments.xlsx',
    'Returningcustomers(1).csv',
    'bigcustomerlist2.xlsx',
]

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
PHONE_RE = re.compile(r'\D+')
SPACE_RE = re.compile(r'\s+')


def norm_text(value: Any) -> str:
    if pd.isna(value):
        return ''
    return SPACE_RE.sub(' ', str(value).strip().casefold())


def norm_phone(value: Any) -> str:
    if pd.isna(value):
        return ''
    return PHONE_RE.sub('', str(value))


def norm_email(value: Any) -> str:
    return norm_text(value)


def safe_columns(df: pd.DataFrame) -> list[str]:
    return [str(c).strip() for c in df.columns]


def load_sources() -> list[dict[str, Any]]:
    loaded: list[dict[str, Any]] = []
    for name in FILES:
        path = SOURCE_DIR / name
        if path.suffix.lower() == '.csv':
            loaded.append({'file': name, 'sheet': None, 'df': pd.read_csv(path, dtype='string', keep_default_na=False)})
        else:
            sheets = pd.read_excel(path, sheet_name=None, dtype='string')
            for sheet, df in sheets.items():
                loaded.append({'file': name, 'sheet': str(sheet), 'df': df})
    return loaded


def profile_df(df: pd.DataFrame) -> dict[str, Any]:
    df = df.copy()
    df.columns = safe_columns(df)
    rows: list[dict[str, Any]] = []
    for col in df.columns:
        series = df[col].astype('string')
        blank = series.fillna('').str.strip().eq('').sum()
        rows.append({
            'column': col,
            'dtype': str(series.dtype),
            'blank_count': int(blank),
            'blank_pct': round(float(blank / len(df) * 100), 2) if len(df) else 0.0,
            'unique_nonblank': int(series.replace('', pd.NA).dropna().nunique()),
            'sample_values_hash': [hashlib.sha256(norm_text(v).encode()).hexdigest()[:12] for v in series.replace('', pd.NA).dropna().head(3)],
        })
    exact_dupes = int(df.duplicated(keep=False).sum()) if len(df) else 0
    normalized: dict[str, int] = {}
    for col in df.columns:
        key = norm_email if 'email' in col.casefold() else norm_phone if any(x in col.casefold() for x in ('phone', 'mobile', 'telephone')) else norm_text
        vals = df[col].map(key)
        nonblank = vals[vals != '']
        if len(nonblank):
            normalized[col] = int(nonblank.duplicated(keep=False).sum())
    return {
        'rows': int(len(df)),
        'columns': profile_columns(df),
        'column_profiles': rows,
        'exact_duplicate_rows': exact_dupes,
        'normalized_duplicate_candidates_by_column': normalized,
    }


def profile_columns(df: pd.DataFrame) -> list[str]:
    return [str(c) for c in df.columns]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    loaded = load_sources()
    report: dict[str, Any] = {'business_name': 'MOMS Mobile Oil Change', 'source_count': len(FILES), 'datasets': []}
    for item in loaded:
        report['datasets'].append({
            'file': item['file'],
            'sheet': item['sheet'],
            **profile_df(item['df']),
        })
    (OUT_DIR / 'profile.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    summary = pd.DataFrame([
        {
            'file': item['file'],
            'sheet': item['sheet'] or '',
            'rows': len(item['df']),
            'columns': len(item['df'].columns),
            'exact_duplicate_rows': int(item['df'].duplicated(keep=False).sum()),
        }
        for item in loaded
    ])
    summary.to_csv(OUT_DIR / 'source-summary.csv', index=False)
    print(json.dumps({'output': str(OUT_DIR), 'datasets': len(loaded), 'rows_total': int(summary['rows'].sum())}, indent=2))


if __name__ == '__main__':
    main()
