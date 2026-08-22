from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import pandas as pd

SRC = Path('/home/ubuntu/upload')
OUT = Path('/home/ubuntu/ServiceWriterFinal/data/moms-mobile-oil-change/csv-processed')
OUT.mkdir(parents=True, exist_ok=True)
CONTROL_RE = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')
SPACE_RE = re.compile(r'\s+')
NON_DIGIT = re.compile(r'\D+')
FORMULA_PREFIXES = ('=', '+', '-', '@')


def text(v: Any) -> str:
    if v is None or pd.isna(v): return ''
    return SPACE_RE.sub(' ', CONTROL_RE.sub('', str(v)).strip())


def clean(v: Any) -> str:
    s = text(v)
    return "'" + s if s.startswith(FORMULA_PREFIXES) else s


def norm(v: Any) -> str:
    return text(v).casefold()


def raw_get(raw: dict[str, Any], *names: str) -> str:
    lowered = {str(k).casefold().strip(): v for k, v in raw.items()}
    for name in names:
        value = lowered.get(name.casefold().strip())
        if value is not None and text(value): return text(value)
    return ''


def key_hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:20]


def vehicle_key(row: dict[str, str]) -> str:
    if norm(row['vin']): return 'vin:' + norm(row['vin'])
    if norm(row['license_plate']): return 'plate:' + norm(row['license_plate'])
    return 'composite:' + '|'.join(norm(row[k]) for k in ('year','make','model','owner_name'))


def process_vehicles() -> tuple[pd.DataFrame, dict[str, Any]]:
    df = pd.read_csv(SRC / 'vehicles-2026-08-21.csv', dtype='string', keep_default_na=False).fillna('')
    registry: dict[str, dict[str, Any]] = {}
    exact_duplicate_rows = int(df.duplicated(keep=False).sum())
    for raw in df.to_dict('records'):
        row = {
            'external_key': '',
            'year': clean(raw_get(raw, 'year')),
            'make': clean(raw_get(raw, 'make')),
            'model': clean(raw_get(raw, 'model')),
            'vin': clean(raw_get(raw, 'vin')),
            'license_plate': clean(raw_get(raw, 'license plate', 'license_plate')),
            'color': clean(raw_get(raw, 'color')),
            'mileage': clean(raw_get(raw, 'mileage')),
            'owner_name': clean(raw_get(raw, 'owner')),
            'notes': clean(raw_get(raw, 'notes', 'note')),
            'source_file': 'vehicles-2026-08-21.csv',
            'data_quality_flags': [],
        }
        row['external_key'] = 'vehicle:' + key_hash(vehicle_key(row))
        if not row['make'] or not row['model']: row['data_quality_flags'].append('missing_make_or_model')
        if not row['vin'] and not row['license_plate']: row['data_quality_flags'].append('missing_vehicle_identifier')
        if row['year'] and (not row['year'].isdigit() or not 1886 <= int(row['year']) <= 2100): row['data_quality_flags'].append('invalid_year')
        if row['mileage'] and not row['mileage'].replace(',', '').replace('.', '').isdigit(): row['data_quality_flags'].append('invalid_mileage')
        key = row['external_key']
        if key not in registry: registry[key] = row
        else:
            for field in ('year','make','model','vin','license_plate','color','mileage','owner_name','notes'):
                if not registry[key][field] and row[field]: registry[key][field] = row[field]
            registry[key]['data_quality_flags'] = sorted(set(registry[key]['data_quality_flags'] + row['data_quality_flags'] + ['duplicate_merged']))
    rows = list(registry.values())
    for row in rows: row['data_quality_flags'] = ';'.join(row['data_quality_flags'])
    out = pd.DataFrame(rows).sort_values(['owner_name','make','model','external_key'])
    return out, {'source_rows': len(df), 'output_rows': len(out), 'exact_duplicate_rows': exact_duplicate_rows, 'deduplicated_rows': len(df) - len(out)}


def appointment_key(row: dict[str, str]) -> str:
    identity = '|'.join(norm(row[k]) for k in ('appointment_date','appointment_time','customer_name','customer_email','customer_phone','vehicle','title'))
    return 'appointment:' + key_hash(identity)


def process_appointments() -> tuple[pd.DataFrame, dict[str, Any]]:
    sources = ['appointments-2026-08-21.csv', 'appointments-2026-07-22.csv']
    registry: dict[str, dict[str, Any]] = {}
    source_stats = {}
    for source in sources:
        df = pd.read_csv(SRC / source, dtype='string', keep_default_na=False).fillna('')
        source_stats[source] = {'source_rows': len(df), 'exact_duplicate_rows': int(df.duplicated(keep=False).sum())}
        for raw in df.to_dict('records'):
            row = {
                'external_key': '',
                'title': clean(raw_get(raw, 'title')),
                'appointment_date': clean(raw_get(raw, 'date')),
                'appointment_time': clean(raw_get(raw, 'time')),
                'duration_minutes': clean(raw_get(raw, 'duration minutes')),
                'customer_name': clean(raw_get(raw, 'customer')),
                'customer_email': clean(raw_get(raw, 'email')),
                'customer_phone': clean(raw_get(raw, 'phone', 'mobile')),
                'vehicle': clean(raw_get(raw, 'vehicle')),
                'status': clean(raw_get(raw, 'status')),
                'dispatch_status': clean(raw_get(raw, 'dispatch status')),
                'location': clean(raw_get(raw, 'location')),
                'source_system': source,
                'notes': clean(raw_get(raw, 'notes', 'note')),
                'data_quality_flags': [],
            }
            row['external_key'] = appointment_key(row)
            if not row['appointment_date']: row['data_quality_flags'].append('missing_appointment_date')
            if not row['customer_name'] and not row['customer_email'] and not row['customer_phone']: row['data_quality_flags'].append('missing_customer_identity')
            if not row['vehicle']: row['data_quality_flags'].append('missing_vehicle_description')
            if row['customer_email'] and '@' not in row['customer_email']: row['data_quality_flags'].append('invalid_email_format')
            key = row['external_key']
            if key not in registry: registry[key] = row
            else:
                registry[key]['source_system'] += ';' + source
                registry[key]['data_quality_flags'] = sorted(set(registry[key]['data_quality_flags'] + row['data_quality_flags'] + ['duplicate_merged']))
    rows = list(registry.values())
    for row in rows: row['data_quality_flags'] = ';'.join(row['data_quality_flags'])
    out = pd.DataFrame(rows).sort_values(['appointment_date','appointment_time','external_key'])
    source_stats['combined'] = {'source_rows': sum(x['source_rows'] for x in source_stats.values()), 'output_rows': len(out), 'deduplicated_rows': sum(x['source_rows'] for x in source_stats.values()) - len(out)}
    return out, source_stats


def main() -> None:
    vehicles, vehicle_stats = process_vehicles()
    appointments, appointment_stats = process_appointments()
    vehicles.to_csv(OUT / 'vehicles.cleaned.csv', index=False)
    appointments.to_csv(OUT / 'appointments.cleaned.csv', index=False)
    report = {
        'business_name': 'MOMS Mobile Oil Change',
        'vehicle_processing': vehicle_stats,
        'appointment_processing': appointment_stats,
        'sanitization': ['trimmed whitespace', 'removed control characters', 'protected formula-like cells with a leading apostrophe', 'normalized deterministic matching keys'],
        'missing_field_policy': 'Retain nullable fields and emit data_quality_flags; do not invent values.',
        'import_gate': 'review_required',
        'source_scope': ['vehicles-2026-08-21.csv', 'appointments-2026-08-21.csv', 'appointments-2026-07-22.csv'],
    }
    (OUT / 'processing-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
