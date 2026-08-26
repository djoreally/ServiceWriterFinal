from pathlib import Path

root = Path('/home/ubuntu/ServiceWriterFinal')
for base in (root / 'src', root / 'app'):
    if not base.exists():
        continue
    for path in base.rglob('*'):
        if path.suffix not in {'.ts', '.tsx'}:
            continue
        text = path.read_text()
        updated = text.replace('from "sonner"', 'from "@/components/ui/sonner"').replace("from 'sonner'", "from '@/components/ui/sonner'")
        if updated != text:
            path.write_text(updated)
