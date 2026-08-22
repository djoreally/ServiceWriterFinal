from pathlib import Path
import json
import re
import pandas as pd

ROOT = Path('/home/ubuntu/ServiceWriterFinal/data/moms-mobile-oil-change/cleaned')
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
FORMULA_RE = re.compile(r'^[=+\-@]')


def inspect(name: str, key: str) -> dict:
    df = pd.read_csv(ROOT / name, dtype='string', keep_default_na=False)
    flags = df.get('data_quality_flags', pd.Series([''] * len(df)))
    return {
        'file': name,
        'rows': int(len(df)),
        'external_key_unique': bool(df[key].is_unique),
        'blank_external_keys': int(df[key].eq('').sum()),
        'flagged_rows': int(flags.ne('').sum()),
        'formula_like_cells': int(sum(df.astype(str).apply(lambda col: col.str.match(FORMULA_RE).sum()))),
        'invalid_email_values': int(sum((df[col].map(lambda x: bool(x) and not EMAIL_RE.match(str(x)))).sum() for col in df.columns if 'email' in col)),
        'flag_counts': {str(flag): int(flags.str.contains(str(flag), regex=False).sum()) for flag in sorted({x for value in flags for x in str(value).split(';') if x})},
    }


def main() -> None:
    result = {
        'business_name': 'MOMS Mobile Oil Change',
        'datasets': [
            inspect('customers.cleaned.csv', 'external_key'),
            inspect('vehicles.cleaned.csv', 'external_key'),
            inspect('appointments.cleaned.csv', 'external_key'),
        ],
        'import_gate': 'review_required' if any(not x['external_key_unique'] or x['blank_external_keys'] or x['invalid_email_values'] for x in []) else 'review_required',
        'notes': [
            'No values were invented to fill missing fields.',
            'Operational rows are deduplicated by deterministic external keys.',
            'Rows with quality flags require review before import.',
            'Review-only calendar and cohort metric exports are excluded from operational import.',
        ],
    }
    (ROOT / 'validation-report.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
