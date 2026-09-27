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

const build = run('npx', ['next', 'build']);
writeFileSync('diagnostic-output/build-errors.txt', build);
writeFileSync(
  'diagnostic-output/index.html',
  '<!doctype html><meta charset="utf-8"><title>Service Writer build diagnostics</title><h1>Service Writer build diagnostics</h1><a href="/build-errors.txt">Next build report</a>'
);
