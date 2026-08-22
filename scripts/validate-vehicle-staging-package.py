from pathlib import Path
import json
import pandas as pd

root = Path('/home/ubuntu/ServiceWriterFinal/data/vehicle-catalog-staging')
canonical = pd.read_csv(root / 'vehicle_catalog_canonical.csv', dtype='object')
all_import = pd.read_csv(root / 'vehicle_specifications_import_all.csv', dtype='object')
eligible = pd.read_csv(root / 'vehicle_specifications_import_eligible_verified.csv', dtype='object')
review = pd.read_csv(root / 'vehicle_specifications_manual_review.csv', dtype='object')
summary = json.loads((root / 'vehicle_catalog_consolidation_summary.json').read_text())
failures = []
if canonical['merge_key'].duplicated().any():
    failures.append('canonical merge_key is not unique')
if len(all_import) != len(canonical):
    failures.append('import_all row count does not match canonical')
if len(eligible) + len(review) != len(all_import):
    failures.append('eligible plus review row counts do not match import_all')
if not set(eligible['verification_status'].dropna()) <= {'verified'}:
    failures.append('eligible file contains non-verified rows')
if set(review['verification_status'].dropna()) & {'verified'}:
    failures.append('review file contains verified rows')
if canonical['year'].astype(int).min() < 1900 or canonical['year'].astype(int).max() > 2100:
    failures.append('invalid year range')
for column in ['make', 'model', 'source_files']:
    if canonical[column].isna().any() or canonical[column].astype(str).str.strip().eq('').any():
        failures.append(f'{column} contains blank values')
control_chars = canonical.astype(str).apply(lambda col: col.str.contains(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', regex=True, na=False)).sum().sum()
if int(control_chars):
    failures.append(f'control characters found: {control_chars}')
print('CANONICAL_ROWS', len(canonical))
print('IMPORT_ALL_ROWS', len(all_import))
print('ELIGIBLE_ROWS', len(eligible))
print('REVIEW_ROWS', len(review))
print('YEAR_RANGE', canonical['year'].astype(int).min(), canonical['year'].astype(int).max())
print('DUPLICATE_KEYS', int(canonical['merge_key'].duplicated().sum()))
print('CONTROL_CHARACTERS', int(control_chars))
if failures:
    print('FAILURES')
    for failure in failures:
        print(f'- {failure}')
    raise SystemExit(1)
print('VALIDATION PASS')
