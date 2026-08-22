from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import pandas as pd

SRC = Path('/home/ubuntu/upload')
OUT = Path('/home/ubuntu/ServiceWriterFinal/data/moms-mobile-oil-change/cleaned')
OUT.mkdir(parents=True, exist_ok=True)

CONTROL_RE = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')
SPACE_RE = re.compile(r'\s+')
NON_DIGIT_RE = re.compile(r'\D+')
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
FORMULA_PREFIXES = ('=', '+', '-', '@')


def text(v: Any) -> str:
    if v is None or pd.isna(v):
        return ''
    return SPACE_RE.sub(' ', CONTROL_RE.sub('', str(v)).strip())


def clean_cell(v: Any) -> str:
    s = text(v)
    return "'" + s if s.startswith(FORMULA_PREFIXES) else s


def norm(v: Any) -> str:
    return text(v).casefold()


def norm_email(v: Any) -> str:
    s = norm(v)
    return s if EMAIL_RE.match(s) else ''


def norm_phone(v: Any) -> str:
    s = NON_DIGIT_RE.sub('', text(v))
    return s[-10:] if len(s) >= 10 else s


def name_parts(v: Any) -> tuple[str, str]:
    s = norm(v)
    parts = s.split(' ', 1)
    return (parts[0], parts[1]) if len(parts) == 2 else (s, '')


def read_csv(name: str) -> pd.DataFrame:
    return pd.read_csv(SRC / name, dtype='string', keep_default_na=False).fillna('')


def read_xlsx(name: str) -> pd.DataFrame:
    sheets = pd.read_excel(SRC / name, sheet_name=None, dtype='string')
    if not sheets:
        return pd.DataFrame()
    return next(iter(sheets.values())).fillna('')


def raw_get(raw: dict[str, Any], *names: str) -> Any:
    lowered = {str(k).casefold().strip(): v for k, v in raw.items()}
    for name in names:
        value = lowered.get(name.casefold().strip())
        if value is not None and not pd.isna(value) and text(value) != '':
            return value
    return ''


def append_flag(row: dict[str, Any], flag: str) -> None:
    flags = row.setdefault('data_quality_flags', [])
    if flag not in flags:
        flags.append(flag)


def customer_key(row: dict[str, Any]) -> str:
    email = norm_email(row.get('email'))
    phone = norm_phone(row.get('phone'))
    first = norm(row.get('first_name'))
    last = norm(row.get('last_name'))
    address = norm(row.get('address_line1'))
    if email:
        return 'email:' + email
    if phone:
        return 'phone:' + phone
    if first or last:
        return 'name:' + '|'.join((first, last, address))
    return 'row:' + hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest()[:16]


def canonical_customer(raw: dict[str, Any], source: str) -> dict[str, Any]:
    row = {
        'external_key': '', 'first_name': '', 'last_name': '', 'email': '', 'phone': '',
        'address_line1': '', 'city': '', 'state': '', 'postal_code': '', 'notes': '',
        'source_records': source, 'data_quality_flags': [],
    }
    name = clean_cell(raw_get(raw, 'name', 'customer'))
    first, last = name_parts(name)
    row['first_name'] = clean_cell(raw_get(raw, 'first name', 'first_name') or first)
    row['last_name'] = clean_cell(raw_get(raw, 'last name', 'last_name') or last)
    row['email'] = clean_cell(raw_get(raw, 'email'))
    row['phone'] = clean_cell(raw_get(raw, 'phone', 'mobile', 'telephone'))
    row['address_line1'] = clean_cell(raw_get(raw, 'address', 'location'))
    row['notes'] = clean_cell(raw_get(raw, 'notes', 'note'))
    row['external_key'] = customer_key(row)
    if row['email'] and not norm_email(row['email']): append_flag(row, 'invalid_email_format')
    if not row['first_name'] and not row['last_name']: append_flag(row, 'missing_name')
    if not row['email'] and not row['phone']: append_flag(row, 'missing_contact_method')
    if not row['address_line1']: append_flag(row, 'missing_address')
    return row


def merge_customer(existing: dict[str, Any], incoming: dict[str, Any], source: str) -> None:
    for field in ('first_name', 'last_name', 'email', 'phone', 'address_line1', 'city', 'state', 'postal_code', 'notes'):
        if not existing.get(field) and incoming.get(field):
            existing[field] = incoming[field]
    sources = set(filter(None, (existing.get('source_records', '') + ';' + source).split(';')))
    existing['source_records'] = ';'.join(sorted(sources))
    for flag in incoming.get('data_quality_flags', []): append_flag(existing, flag)


def build_customers() -> tuple[pd.DataFrame, dict[str, str]]:
    registry: dict[str, dict[str, Any]] = {}
    for source, df in [
        ('customers-2026-08-21.csv', read_csv('customers-2026-08-21.csv')),
        ('appointments-2026-08-21.csv', read_csv('appointments-2026-08-21.csv')),
        ('appointments-2026-07-22.csv', read_csv('appointments-2026-07-22.csv')),
        ('appointments.xlsx', read_xlsx('appointments.xlsx')),
    ]:
        for _, r in df.iterrows():
            raw = r.to_dict()
            item = canonical_customer(raw, source)
            key = item['external_key']
            if key in registry: merge_customer(registry[key], item, source)
            else: registry[key] = item
    rows = list(registry.values())
    for r in rows:
        r['data_quality_flags'] = ';'.join(r['data_quality_flags'])
    return pd.DataFrame(rows).sort_values(['last_name', 'first_name', 'external_key']), {r['external_key']: r['external_key'] for r in rows}


def vehicle_key(row: dict[str, Any]) -> str:
    vin = norm(row.get('vin'))
    if vin: return 'vin:' + vin
    plate = norm(row.get('license_plate'))
    if plate: return 'plate:' + plate
    return 'vehicle:' + '|'.join(norm(row.get(k)) for k in ('year', 'make', 'model', 'owner'))


def build_vehicles() -> pd.DataFrame:
    df = read_csv('vehicles-2026-08-21.csv')
    registry: dict[str, dict[str, Any]] = {}
    for _, r in df.iterrows():
        raw = r.to_dict()
        item = {
            'external_key': '', 'year': clean_cell(raw_get(raw, 'year')), 'make': clean_cell(raw_get(raw, 'make')),
            'model': clean_cell(raw_get(raw, 'model')), 'vin': clean_cell(raw_get(raw, 'vin')),
            'license_plate': clean_cell(raw_get(raw, 'license plate', 'license_plate')), 'color': clean_cell(raw_get(raw, 'color')),
            'mileage': clean_cell(raw_get(raw, 'mileage')), 'owner_name': clean_cell(raw_get(raw, 'owner', 'owner name')),
            'notes': clean_cell(raw_get(raw, 'notes', 'note')), 'data_quality_flags': [],
        }
        item['external_key'] = vehicle_key(item)
        if not item['make'] or not item['model']: append_flag(item, 'missing_make_or_model')
        if not item['vin'] and not item['license_plate']: append_flag(item, 'missing_vehicle_identifier')
        if item['year'] and (not item['year'].isdigit() or not 1886 <= int(item['year']) <= 2100): append_flag(item, 'invalid_year')
        key = item['external_key']
        if key not in registry: registry[key] = item
        else:
            for f in ('year','make','model','vin','license_plate','color','mileage','owner_name','notes'):
                if not registry[key][f] and item[f]: registry[key][f] = item[f]
            append_flag(registry[key], 'duplicate_merged')
    rows = list(registry.values())
    for r in rows: r['data_quality_flags'] = ';'.join(r['data_quality_flags'])
    return pd.DataFrame(rows).sort_values(['owner_name', 'make', 'model', 'external_key'])


def canonical_appointment(raw: dict[str, Any], source: str) -> dict[str, Any]:
    first, last = name_parts(raw_get(raw, 'customer') or ((text(raw_get(raw, 'first name', 'first_name')) + ' ' + text(raw_get(raw, 'last name', 'last_name'))).strip()))
    date = clean_cell(raw_get(raw, 'date', 'booking date'))
    time = clean_cell(raw_get(raw, 'time', 'booking time'))
    item = {
        'external_key': '', 'title': clean_cell(raw_get(raw, 'title', 'service name', 'summary')),
        'appointment_date': date, 'appointment_time': time, 'duration_minutes': clean_cell(raw_get(raw, 'duration minutes')),
        'customer_first_name': clean_cell(raw_get(raw, 'first name', 'first_name') or first), 'customer_last_name': clean_cell(raw_get(raw, 'last name', 'last_name') or last),
        'customer_email': clean_cell(raw_get(raw, 'email')), 'customer_phone': clean_cell(raw_get(raw, 'phone')),
        'vehicle_make': clean_cell(raw_get(raw, 'vehicle make')), 'vehicle_model': clean_cell(raw_get(raw, 'vehicle model', 'vehicle')),
        'vehicle_year': clean_cell(raw_get(raw, 'vehicle year')), 'status': clean_cell(raw_get(raw, 'status', 'booking status')),
        'dispatch_status': clean_cell(raw_get(raw, 'dispatch status')), 'location': clean_cell(raw_get(raw, 'location', 'address')),
        'source_system': source, 'notes': clean_cell(raw_get(raw, 'notes', 'note')),
        'data_quality_flags': [],
    }
    fingerprint = '|'.join(norm(item.get(k)) for k in ('appointment_date','appointment_time','customer_email','customer_phone','customer_first_name','customer_last_name','vehicle_make','vehicle_model','title'))
    item['external_key'] = 'appointment:' + hashlib.sha256(fingerprint.encode()).hexdigest()[:20]
    if not date: append_flag(item, 'missing_appointment_date')
    if not item['customer_email'] and not item['customer_phone'] and not item['customer_first_name'] and not item['customer_last_name']: append_flag(item, 'missing_customer_identity')
    if not item['vehicle_make'] and not item['vehicle_model']: append_flag(item, 'missing_vehicle_description')
    return item


def build_appointments() -> pd.DataFrame:
    sources = [
        ('appointments-2026-08-21.csv', read_csv('appointments-2026-08-21.csv')),
        ('appointments-2026-07-22.csv', read_csv('appointments-2026-07-22.csv')),
        ('appointments.xlsx', read_xlsx('appointments.xlsx')),
    ]
    registry: dict[str, dict[str, Any]] = {}
    for source, df in sources:
        for _, r in df.iterrows():
            item = canonical_appointment(r.to_dict(), source)
            if item['external_key'] not in registry: registry[item['external_key']] = item
            else:
                registry[item['external_key']]['source_system'] += ';' + source
                append_flag(registry[item['external_key']], 'duplicate_merged')
    rows = list(registry.values())
    for r in rows: r['data_quality_flags'] = ';'.join(r['data_quality_flags'])
    return pd.DataFrame(rows).sort_values(['appointment_date','appointment_time','external_key'])


def main() -> None:
    customers, _ = build_customers()
    vehicles = build_vehicles()
    appointments = build_appointments()
    customers.to_csv(OUT / 'customers.cleaned.csv', index=False)
    vehicles.to_csv(OUT / 'vehicles.cleaned.csv', index=False)
    appointments.to_csv(OUT / 'appointments.cleaned.csv', index=False)
    # Keep non-operational source artifacts separate and explicitly excluded from import.
    read_csv('Returningcustomers(1).csv').to_csv(OUT / 'returning-customers.metrics.review.csv', index=False)
    read_xlsx('bigcustomerlist2.xlsx').to_csv(OUT / 'calendar-export.review.csv', index=False)
    report = {
        'business_name': 'MOMS Mobile Oil Change',
        'operational_outputs': {
            'customers': {'rows': len(customers), 'flagged_rows': int(customers.data_quality_flags.ne('').sum())},
            'vehicles': {'rows': len(vehicles), 'flagged_rows': int(vehicles.data_quality_flags.ne('').sum())},
            'appointments': {'rows': len(appointments), 'flagged_rows': int(appointments.data_quality_flags.ne('').sum())},
        },
        'excluded_review_outputs': {
            'returning_customers_metrics': 'review only; cohort metrics are not customer records',
            'calendar_export': 'review only; requires deliberate calendar-to-appointment mapping before import',
        },
        'sanitization': ['trimmed whitespace', 'removed control characters', 'protected formula-like cells with a leading apostrophe', 'normalized email and phone matching keys'],
        'deduplication': ['customer match priority: normalized email, then normalized phone, then normalized name+address', 'vehicle match priority: VIN, then license plate, then normalized vehicle composite', 'appointment match: normalized date/time/customer/vehicle/service fingerprint'],
        'missing_field_policy': 'retained nullable fields as empty strings in CSV and emitted data_quality_flags for review; no invented values were filled',
    }
    (OUT / 'cleaning-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
