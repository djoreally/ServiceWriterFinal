from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import pandas as pd

SRC = Path('/home/ubuntu/upload')
OUT = Path('/home/ubuntu/ServiceWriterFinal/data/moms-mobile-oil-change/remaining-processed')
OUT.mkdir(parents=True, exist_ok=True)
CONTROL_RE = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')
SPACE_RE = re.compile(r'\s+')
FORMULA_PREFIXES = ('=', '+', '-', '@')


def text(v: Any) -> str:
    if v is None or pd.isna(v): return ''
    return SPACE_RE.sub(' ', CONTROL_RE.sub('', str(v)).strip())


def clean(v: Any) -> str:
    s = text(v)
    return "'" + s if s.startswith(FORMULA_PREFIXES) else s


def norm(v: Any) -> str:
    return text(v).casefold()


def digest(v: str) -> str:
    return hashlib.sha256(v.encode()).hexdigest()[:20]


def process_calendar() -> tuple[pd.DataFrame, dict[str, Any]]:
    raw = next(iter(pd.read_excel(SRC / 'bigcustomerlist2.xlsx', sheet_name=None, dtype='string').values())).fillna('')
    rows = []
    seen: set[str] = set()
    exact_dupes = int(raw.duplicated(keep=False).sum())
    for item in raw.to_dict('records'):
        row = {
            'external_key': '',
            'summary': clean(item.get('Summary')),
            'description': clean(item.get('Description')),
            'starts_at': clean(item.get('Event Begins')),
            'ends_at': clean(item.get('Event Ends')),
            'location': clean(item.get('Location')),
            'status': clean(item.get('Status')),
            'event_id': clean(item.get('Id')),
            'ical_uid': clean(item.get('ICalUID')),
            'html_link': clean(item.get('HtmlLink')),
            'event_type': clean(item.get('EventType')),
            'timezone': clean(item.get('Start TimeZone') or item.get('End TimeZone')),
            'source_file': 'bigcustomerlist2.xlsx',
            'data_quality_flags': [],
        }
        identity = row['event_id'] or row['ical_uid'] or '|'.join(norm(row[k]) for k in ('summary','starts_at','ends_at','location'))
        row['external_key'] = 'calendar:' + digest(identity)
        if not row['summary']: row['data_quality_flags'].append('missing_summary')
        if not row['starts_at']: row['data_quality_flags'].append('missing_start')
        if not row['event_id'] and not row['ical_uid']: row['data_quality_flags'].append('missing_event_identifier')
        if not row['location']: row['data_quality_flags'].append('missing_location')
        if row['external_key'] in seen: row['data_quality_flags'].append('duplicate_merged')
        seen.add(row['external_key'])
        rows.append(row)
    out = pd.DataFrame(rows).drop_duplicates('external_key', keep='first').sort_values(['starts_at','external_key'])
    for row in out.to_dict('records'):
        pass
    stats = {'source_rows': len(raw), 'output_rows': len(out), 'exact_duplicate_rows': exact_dupes, 'deduplicated_rows': len(raw) - len(out), 'flagged_rows': int(out.data_quality_flags.ne('').sum())}
    return out, stats


def process_metrics() -> tuple[pd.DataFrame, dict[str, Any]]:
    raw = pd.read_csv(SRC / 'Returningcustomers(1).csv', dtype='string', keep_default_na=False).fillna('')
    rows = []
    for item in raw.to_dict('records'):
        row = {key.casefold().replace(' ', '_'): clean(value) for key, value in item.items()}
        row['source_file'] = 'Returningcustomers(1).csv'
        row['data_quality_flags'] = ''
        if not row.get('cohort'): row['data_quality_flags'] = 'missing_cohort'
        for key in ('customers','year_1','year_2','year_3','year_4'):
            if row.get(key) and not row[key].replace(',', '').replace('.', '').isdigit():
                row['data_quality_flags'] = ';'.join(filter(None, [row['data_quality_flags'], f'invalid_numeric_{key}']))
        row['external_key'] = 'cohort:' + digest('|'.join(norm(row.get(k, '')) for k in ('cohort','customers','year_1','year_2','year_3','year_4')))
        rows.append(row)
    out = pd.DataFrame(rows).drop_duplicates('external_key', keep='first').sort_values('cohort')
    stats = {'source_rows': len(raw), 'output_rows': len(out), 'deduplicated_rows': len(raw) - len(out), 'flagged_rows': int(out.data_quality_flags.ne('').sum())}
    return out, stats


def main() -> None:
    calendar, calendar_stats = process_calendar()
    metrics, metrics_stats = process_metrics()
    calendar.to_csv(OUT / 'calendar-events.cleaned.review.csv', index=False)
    metrics.to_csv(OUT / 'returning-customer-cohorts.cleaned.review.csv', index=False)
    report = {
        'business_name': 'MOMS Mobile Oil Change',
        'calendar_export': calendar_stats,
        'returning_customer_metrics': metrics_stats,
        'sanitization': ['trimmed whitespace', 'removed control characters', 'protected formula-like cells', 'normalized deterministic keys'],
        'semantic_boundary': {
            'calendar_export': 'review-only calendar events; not imported as appointments until event ownership and service semantics are confirmed',
            'returning_customer_metrics': 'review-only aggregate cohort metrics; not customer records and not suitable for customer-table import',
        },
        'import_gate': 'review_required',
    }
    (OUT / 'processing-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    (OUT / 'README.md').write_text('# MOMS Mobile Oil Change — Remaining Source Review\n\nThese outputs are sanitized review artifacts. The calendar workbook is not treated as an appointment source without deliberate mapping and ownership validation. The returning-customer CSV contains aggregate cohort metrics, not customer records. Missing values are retained and flagged; no values are invented and nothing is imported into Supabase.\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
