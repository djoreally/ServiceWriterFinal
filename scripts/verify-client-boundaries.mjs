import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const sourceRoot = join(root, 'src');
const extensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const violations = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (extensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

function report(file, rule, detail) {
  violations.push({ file: relative(root, file), rule, detail });
}

for (const file of await walk(sourceRoot)) {
  const source = await readFile(file, 'utf8');
  const firstLines = source.split(/\r?\n/).slice(0, 8).join('\n');
  const isClient = /(^|\n)\s*['"]use client['"];?/.test(firstLines);
  if (!isClient) continue;

  const forbiddenImports = [
    ['database', /(?:from\s*|import\s*)['"](?:@\/db|@\/server\/repositories|drizzle-orm|postgres)(?:\/[^'"]*)?['"]/],
    ['server modules', /(?:from\s*|import\s*)['"]@\/server(?:\/[^'"]*)?['"]/],
    ['privileged platform', /(?:from\s*|import\s*)['"]@\/platform\/auth(?:\/[^'"]*)?['"]/],
    ['Supabase', /(?:from\s*|import\s*)['"](?:@supabase\/supabase-js|@\/libs\/supabase\/supabase-admin)['"]/],
    ['Stripe', /(?:from\s*|import\s*)['"]stripe['"]/],
    ['Hono', /(?:from\s*|import\s*)['"](?:hono|hono\/client)(?:\/[^'"]*)?['"]/],
  ];
  for (const [label, pattern] of forbiddenImports) {
    if (pattern.test(source)) report(file, 'client-forbidden-import', label);
  }

  if (/\bfetch\s*\(\s*[\`'"][^\`'"]*\/api\/v1(?:\/|[\`'"])/.test(source)) {
    report(file, 'client-internal-api-fetch', 'Client Components must not call the first-party /api/v1 business API.');
  }
  if (/\b(?:createClient|supabase)\s*\.\s*(?:from|rpc|functions)\b/.test(source)) {
    report(file, 'client-direct-backend-call', 'Client Components must not access Supabase business persistence/functions.');
  }
}

if (violations.length) {
  console.error('Architecture boundary verification failed:');
  for (const v of violations) console.error(`- ${v.file}: [${v.rule}] ${v.detail}`);
  process.exit(1);
}
console.log('Architecture boundary verification passed.');
