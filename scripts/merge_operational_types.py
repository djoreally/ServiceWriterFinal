import re
from pathlib import Path

base_path = Path('/tmp/servicewriter-local-types-before-live-generation.ts')
live_path = Path('/tmp/servicewriter-generated-live-types.ts')
target_path = Path('/home/ubuntu/ServiceWriterFinal/src/integrations/supabase/types.ts')
base = base_path.read_text()
live = live_path.read_text()

def block(source, table):
    pattern = rf'(?ms)^      {re.escape(table)}: \{{.*?^      \}}\n'
    match = re.search(pattern, source)
    if not match:
        raise SystemExit(f'missing table block: {table}')
    return match.group(0)

def replace_or_insert(source, table, replacement):
    pattern = rf'(?ms)^      {re.escape(table)}: \{{.*?^      \}}\n'
    if re.search(pattern, source):
        return re.sub(pattern, lambda _: replacement, source, count=1)
    marker = '    Tables: {\n'
    index = source.find(marker)
    if index < 0:
        raise SystemExit('Tables marker not found')
    insert_at = index + len(marker)
    return source[:insert_at] + replacement + source[insert_at:]

for table in ('service_records', 'dispatch_events'):
    base = replace_or_insert(base, table, block(live, table))
target_path.write_text(base)
print('merged live operational blocks into preserved local type surface')
