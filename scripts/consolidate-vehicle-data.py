from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path('/home/ubuntu/upload')
OUT = Path('/home/ubuntu/ServiceWriterFinal/data/vehicle-catalog-staging')
OUT.mkdir(parents=True, exist_ok=True)

# Precedence is intentionally explicit. The full 2000–2027 oil/filter workbook is
# preferred for the fields it actually contains; the audited release workbook is
# next; the narrower YMM oil datasets are fallback sources only. No value is
# invented and conflicting values are retained in the conflict report.
SOURCES = [
    ('fulloilandfilter2022to2027', ROOT / 'fulloilandfilter2022to2027', 'full_oil_filter_workbook', 1),
    ('release_2022_2027_final_audit', ROOT / 'release_2022_2027_final_audit', 'release_audit_workbook', 2),
    ('autolubespecsYmm.xlsx', ROOT / 'autolubespecsYmm.xlsx', 'autolube_ymm_workbook', 3),
    ('yearmakemodel.json', ROOT / 'yearmakemodel.json', 'year_make_model_json', 4),
    ('completevehiclelist.xlsx-Sheet1.csv', ROOT / 'completevehiclelist.xlsx-Sheet1.csv', 'vehicle_list_csv', 5),
    ('car_data_2025-2.csv', ROOT / 'car_data_2025-2.csv', 'vehicle_2025_csv', 6),
]

FIELD_MAP = {
    'Engine Oil': 'oil_type',
    'Oil Type': 'oil_type',
    'Oil Capacity': 'oil_capacity',
    'Oil Plug Torque': 'oil_plug_torque',
    'WIX Oil Filter': 'wix_filter',
    'NAPA Gold Oil Filter': 'napa_gold_filter',
    'STP Oil Filter': 'stp_filter',
    'Automatic Transmission Fluid': 'automatic_transmission_fluid',
    'Transfer Case': 'transfer_case_fluid',
    'Rear Differential': 'rear_differential_fluid',
    'Front Differential': 'front_differential_fluid',
    'Manual Transmission Fluid:': 'manual_transmission_fluid',
    'Manual Transmission Fluid': 'manual_transmission_fluid',
    'Oil Life Reset Instructions': 'oil_life_reset_instructions',
    'Release Data Status': 'source_status',
}

SPEC_FIELDS = [
    'oil_type', 'oil_capacity', 'oil_plug_torque', 'wix_filter',
    'napa_gold_filter', 'stp_filter', 'automatic_transmission_fluid',
    'transfer_case_fluid', 'rear_differential_fluid',
    'front_differential_fluid', 'manual_transmission_fluid',
    'oil_life_reset_instructions', 'source_status',
]


def clean_text(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = unicodedata.normalize('NFKC', str(value))
    text = ''.join(ch for ch in text if ch.isprintable())
    text = re.sub(r'\s+', ' ', text).strip()
    return text or None


def clean_spec_value(field: str, value: Any) -> str | None:
    text = clean_text(value)
    if text is None or field == 'source_status':
        return text
    normalized = text.casefold().strip()
    if normalized in {'n/a', 'na', 'none', 'null', 'unknown', 'unverified', 'not available', 'not applicable', '-'} or normalized.startswith('n/a '):
        return None
    return text


def norm_key(value: Any) -> str:
    text = clean_text(value) or ''
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii').lower()
    return re.sub(r'[^a-z0-9]+', '', text)


def year_value(value: Any) -> int | None:
    try:
        year = int(float(str(value).strip()))
    except (TypeError, ValueError):
        return None
    return year if 1900 <= year <= 2100 else None


def load_source(source_name: str, path: Path, source_kind: str, precedence: int) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    if path.suffix.lower() == '.json':
        frame = pd.DataFrame(json.loads(path.read_text()))
    elif path.suffix.lower() == '.csv':
        frame = pd.read_csv(path, dtype='object')
    else:
        book = pd.ExcelFile(path, engine='openpyxl')
        frames = [pd.read_excel(path, sheet_name=sheet, engine='openpyxl', dtype='object') for sheet in book.sheet_names]
        frame = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    frame = frame.rename(columns={col: FIELD_MAP.get(str(col), str(col).strip().lower().replace(' ', '_')) for col in frame.columns})
    required = ['year', 'make', 'model']
    missing = [col for col in required if col not in frame.columns]
    if missing:
        raise ValueError(f'{source_name} missing required columns: {missing}')
    frame['source_file'] = source_name
    frame['source_kind'] = source_kind
    frame['source_precedence'] = precedence
    frame['year'] = frame['year'].map(year_value)
    frame['make'] = frame['make'].map(clean_text)
    frame['model'] = frame['model'].map(clean_text)
    frame['engine'] = frame.get('engine', pd.Series([None] * len(frame))).map(clean_text)
    for field in SPEC_FIELDS:
        if field in frame:
            frame[field] = frame[field].map(lambda value, field=field: clean_spec_value(field, value))
        else:
            frame[field] = None
    frame['year_key'] = frame['year']
    frame['make_key'] = frame['make'].map(norm_key)
    frame['model_key'] = frame['model'].map(norm_key)
    frame['engine_key'] = frame['engine'].map(norm_key)
    frame['merge_key'] = frame.apply(lambda r: f"{r.year_key}|{r.make_key}|{r.model_key}|{r.engine_key}", axis=1)
    return frame[['year', 'make', 'model', 'engine', *SPEC_FIELDS, 'source_file', 'source_kind', 'source_precedence', 'merge_key']]


def values_conflict(rows: pd.DataFrame, field: str) -> bool:
    values = {clean_text(v) for v in rows[field].tolist() if clean_text(v) is not None}
    return len(values) > 1

all_frames = []
source_summary = []
for source_name, path, source_kind, precedence in SOURCES:
    frame = load_source(source_name, path, source_kind, precedence)
    if frame.empty:
        source_summary.append({'source_file': source_name, 'rows': 0, 'status': 'missing'})
        continue
    all_frames.append(frame)
    source_summary.append({
        'source_file': source_name,
        'source_kind': source_kind,
        'rows': int(len(frame)),
        'valid_key_rows': int(frame['merge_key'].str.count(r'\|').eq(3).sum()),
        'year_min': int(frame['year'].dropna().min()) if frame['year'].notna().any() else None,
        'year_max': int(frame['year'].dropna().max()) if frame['year'].notna().any() else None,
        'status': 'loaded',
    })

if not all_frames:
    raise SystemExit('No supported vehicle sources were found')

raw = pd.concat(all_frames, ignore_index=True)
raw['make_key'] = raw['make'].map(norm_key)
raw['model_key'] = raw['model'].map(norm_key)
raw['engine_key'] = raw['engine'].map(norm_key)
raw = raw[raw['year'].notna() & raw['make_key'].ne('') & raw['model_key'].ne('')].copy()
raw['source_row_hash'] = raw.apply(lambda r: hashlib.sha256('|'.join('' if pd.isna(r[c]) else str(r[c]) for c in ['year','make','model','engine',*SPEC_FIELDS,'source_file']).encode()).hexdigest(), axis=1)

records = []
conflicts = []
for merge_key, group in raw.groupby('merge_key', sort=True):
    group = group.sort_values(['source_precedence', 'source_file'], kind='stable')
    winner = group.iloc[0]
    record = {
        'record_id': hashlib.sha256(merge_key.encode()).hexdigest()[:24],
        'merge_key': merge_key,
        'year': int(winner['year']),
        'make': winner['make'],
        'model': winner['model'],
        'engine': winner['engine'],
        'verification_status': 'verified' if (clean_text(winner['source_status']) and 'unverified' not in clean_text(winner['source_status']).lower()) else 'unverified',
        'primary_source_file': winner['source_file'],
        'primary_source_kind': winner['source_kind'],
        'source_files': ';'.join(dict.fromkeys(group['source_file'].tolist())),
    }
    for field in SPEC_FIELDS:
        non_empty = group[group[field].map(clean_text).notna()]
        chosen = non_empty.iloc[0][field] if not non_empty.empty else None
        record[field] = clean_spec_value(field, chosen)
        if values_conflict(group, field):
            distinct = sorted({clean_text(v) for v in group[field].tolist() if clean_text(v) is not None})
            conflicts.append({'merge_key': merge_key, 'field': field, 'chosen_value': record[field], 'alternative_values': ' || '.join(distinct), 'source_files': ';'.join(dict.fromkeys(group['source_file'].tolist()))})
    if record.get('source_status') and 'unverified' in record['source_status'].lower():
        record['verification_status'] = 'unverified'
    elif not record.get('oil_type') or not record.get('oil_capacity'):
        record['verification_status'] = 'incomplete'
    else:
        record['verification_status'] = 'verified'
    record['missing_fields'] = ';'.join(field for field in ['oil_type', 'oil_capacity', 'wix_filter', 'napa_gold_filter', 'stp_filter'] if not record.get(field))
    records.append(record)

canonical = pd.DataFrame(records).sort_values(['year', 'make', 'model', 'engine'], na_position='last').reset_index(drop=True)
canonical.to_csv(OUT / 'vehicle_catalog_canonical.csv', index=False)
pd.DataFrame(conflicts).to_csv(OUT / 'vehicle_catalog_conflicts.csv', index=False)

summary = {
    'generated_at_utc': pd.Timestamp.utcnow().isoformat(),
    'merge_key': 'normalized year|make|model|engine; blank engine remains distinct from populated engine',
    'source_precedence': [item[0] for item in SOURCES],
    'source_summary': source_summary,
    'input_rows_after_basic_validation': int(len(raw)),
    'canonical_rows': int(len(canonical)),
    'duplicate_rows_removed': int(len(raw) - len(canonical)),
    'year_min': int(canonical['year'].min()),
    'year_max': int(canonical['year'].max()),
    'verification_status_counts': {str(k): int(v) for k, v in canonical['verification_status'].value_counts(dropna=False).items()},
    'records_with_missing_required_oil_fields': int(((canonical['oil_type'].isna()) | (canonical['oil_capacity'].isna())).sum()),
    'conflict_cells': int(len(conflicts)),
    'safe_fill_rule': 'Only coalesce non-empty values from supplied sources with the same normalized vehicle key; no value is guessed or inferred from neighboring model years.',
    'sanitization': ['Unicode NFKC normalization', 'control/non-printable character removal', 'whitespace normalization', 'year range validation 1900-2100', 'blank key rejection'],
}
(OUT / 'vehicle_catalog_consolidation_summary.json').write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2))
