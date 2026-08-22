from pathlib import Path
import json
import pandas as pd

root = Path('/home/ubuntu/ServiceWriterFinal/data/vehicle-catalog-staging')
canonical = pd.read_csv(root / 'vehicle_catalog_canonical.csv', dtype='object')
conflicts = pd.read_csv(root / 'vehicle_catalog_conflicts.csv', dtype='object')
summary = json.loads((root / 'vehicle_catalog_consolidation_summary.json').read_text())

print('CANONICAL_ROWS', len(canonical))
print('CONFLICT_ROWS', len(conflicts))
print('STATUS_COUNTS', canonical['verification_status'].value_counts(dropna=False).to_dict())
print('YEAR_COUNTS')
print(canonical.groupby(['year', 'verification_status']).size().to_string())
print('CONFLICTS_BY_FIELD')
print(conflicts['field'].value_counts().to_string())
print('CONFLICTS_BY_YEAR')
conflicts = conflicts.merge(canonical[['merge_key', 'year']], on='merge_key', how='left')
print(conflicts.groupby(['year', 'field']).size().sort_values(ascending=False).head(40).to_string())
print('MISSING_FIELDS')
missing_counts = {}
for value in canonical['missing_fields'].fillna(''):
    for field in filter(None, value.split(';')):
        missing_counts[field] = missing_counts.get(field, 0) + 1
print(dict(sorted(missing_counts.items(), key=lambda item: (-item[1], item[0]))))
print('UNVERIFIED_SAMPLE')
print(canonical.loc[canonical['verification_status'].eq('unverified'), ['year','make','model','engine','oil_type','oil_capacity','wix_filter','napa_gold_filter','stp_filter','source_status']].head(20).to_csv(index=False))
print('INCOMPLETE_ROWS')
print(canonical.loc[canonical['verification_status'].eq('incomplete'), ['year','make','model','engine','oil_type','oil_capacity','wix_filter','napa_gold_filter','stp_filter','source_files']].to_csv(index=False))
