import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('diagnostic-output', { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
    env: process.env,
  });
  return [
    '$ ' + [command, ...args].join(' '),
    '',
    result.stdout || '',
    result.stderr || '',
    '',
    'exitCode=' + (result.status ?? 'null'),
  ].join('\n');
}

const tsc = run('npx', ['tsc', '--noEmit', '--pretty', 'false']);
const lint = run('npx', ['next', 'lint']);

writeFileSync('diagnostic-output/tsc-errors.txt', tsc);
writeFileSync('diagnostic-output/lint-errors.txt', lint);
writeFileSync(
  'diagnostic-output/index.html',
  '<!doctype html><meta charset="utf-8"><title>Service Writer diagnostics</title><h1>Service Writer diagnostics</h1><ul><li><a href="/tsc-errors.txt">TypeScript report</a></li><li><a href="/lint-errors.txt">Lint report</a></li></ul>'
);
