import json
from pathlib import Path

result_path = Path('/home/ubuntu/.mcp/tool-results/2026-08-21_15-22-10.662141822_supabase_generate_typescript_types_46be8da6.json')
target_path = Path('/home/ubuntu/ServiceWriterFinal/src/integrations/supabase/types.ts')
payload = json.loads(result_path.read_text())
generated = payload.get('types')
if not isinstance(generated, str) or 'export type Database' not in generated:
    raise SystemExit('Supabase generated types were not found in the MCP result')
target_path.write_text(generated.rstrip() + '\n')
print(f'wrote {len(generated)} characters to {target_path}')
