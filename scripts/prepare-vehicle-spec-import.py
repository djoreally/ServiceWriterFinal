from __future__ import annotations

import json
from pathlib import Path
import pandas as pd

root = Path('/home/ubuntu/ServiceWriterFinal/data/vehicle-catalog-staging')
canonical = pd.read_csv(root / 'vehicle_catalog_canonical.csv', dtype='object')

# The live table has one oil_filter column. WIX is the selected primary filter
# reference because it is the official application field in the supplied audit;
# NAPA/STP alternatives remain in additional_specs and are never discarded.
def additional_specs(row):
    payload = {}
    for field in ['oil_plug_torque', 'automatic_transmission_fluid', 'transfer_case_fluid', 'rear_differential_fluid', 'front_differential_fluid', 'manual_transmission_fluid', 'oil_life_reset_instructions', 'napa_gold_filter', 'stp_filter', 'source_status', 'verification_status', 'source_files']:
        value = row.get(field)
        if pd.notna(value) and str(value).strip():
            payload[field] = str(value).strip()
    return json.dumps(payload, ensure_ascii=False, separators=(',', ':')) if payload else None

rows = []
for _, row in canonical.iterrows():
    rows.append({
        'record_id': row['record_id'],
        'year': int(row['year']),
        'make': row['make'],
        'model': row['model'],
        'engine': row['engine'] if pd.notna(row['engine']) else None,
        'oil_type': row['oil_type'] if pd.notna(row['oil_type']) else None,
        'oil_capacity': row['oil_capacity'] if pd.notna(row['oil_capacity']) else None,
        'oil_filter': row['wix_filter'] if pd.notna(row['wix_filter']) else None,
        'transmission_fluid': row['automatic_transmission_fluid'] if pd.notna(row['automatic_transmission_fluid']) else None,
        'source': f"consolidated:{row['primary_source_kind']}",
        'additional_specs': additional_specs(row),
        'verification_status': row['verification_status'],
        'missing_fields': row['missing_fields'] if pd.notna(row['missing_fields']) else '',
        'merge_key': row['merge_key'],
    })

prepared = pd.DataFrame(rows)
eligible = prepared[prepared['verification_status'].eq('verified')].copy()
review = prepared[~prepared['verification_status'].eq('verified')].copy()
prepared.to_csv(root / 'vehicle_specifications_import_all.csv', index=False)
eligible.to_csv(root / 'vehicle_specifications_import_eligible_verified.csv', index=False)
review.to_csv(root / 'vehicle_specifications_manual_review.csv', index=False)

report = {
    'target_table': 'public.vehicle_specifications',
    'all_rows': int(len(prepared)),
    'verified_import_rows': int(len(eligible)),
    'manual_review_rows': int(len(review)),
    'primary_filter_mapping': 'wix_filter -> oil_filter',
    'alternative_filter_mapping': 'napa_gold_filter and stp_filter -> additional_specs JSON',
    'safe_import_policy': 'Import only verification_status=verified by default. Keep unverified/incomplete rows in review queue until an authoritative source validates them.',
    'no_guessing': True,
    'source_provenance': 'source plus additional_specs.source_files/source_status',
    'output_files': [
        'vehicle_specifications_import_all.csv',
        'vehicle_specifications_import_eligible_verified.csv',
        'vehicle_specifications_manual_review.csv',
    ],
}
(root / 'vehicle_spec_import_report.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
