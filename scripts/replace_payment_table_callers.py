from pathlib import Path

root = Path('/home/ubuntu/ServiceWriterFinal')
files = [
    *root.glob('src/**/*.ts'),
    *root.glob('src/**/*.tsx'),
    *root.glob('apps/web-next/**/*.ts'),
    *root.glob('apps/web-next/**/*.tsx'),
]
for path in files:
    if 'node_modules' in path.parts or '.next' in path.parts:
        continue
    text = path.read_text()
    original = text
    text = text.replace('.from("payment_records")', '.from("payments")')
    text = text.replace('Database["public"]["Tables"]["payment_records"]', 'Database["public"]["Tables"]["payments"]')
    if text != original:
        path.write_text(text)
        print(path)
