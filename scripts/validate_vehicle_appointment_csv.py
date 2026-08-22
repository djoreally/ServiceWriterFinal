from pathlib import Path
import re
import pandas as pd

ROOT = Path('/home/ubuntu/ServiceWriterFinal/data/moms-mobile-oil-change/csv-processed')
FORMULA_RE = re.compile(r"^[=+\-@]")

for name in ('vehicles.cleaned.csv', 'appointments.cleaned.csv'):
    df = pd.read_csv(ROOT / name, dtype='string', keep_default_na=False).fillna('')
    flags = df['data_quality_flags']
    formula_cells = int(sum(df.astype(str).apply(lambda col: col.str.match(FORMULA_RE).sum())))
    print(name)
    print(f"rows={len(df)} unique_keys={df.external_key.is_unique} flagged_rows={int(flags.ne('').sum())} formula_like_cells={formula_cells}")
    print(flags[flags.ne('')].str.split(';').explode().value_counts().to_string())
    print()
