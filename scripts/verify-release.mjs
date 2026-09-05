import { readFileSync, mkdtempSync, mkdirSync, rmSync, lstatSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runLocalLabSmoke, validateLocalLabWorkspaces } from './check-labs.mjs';

const directory = path.resolve(process.argv[2] ?? 'release');
const runtime = process.argv.includes('--runtime');
const manifest = JSON.parse(readFileSync(path.join(directory, 'community-labs.json'), 'utf8'));
const root = mkdtempSync(path.join(tmpdir(), 'sds-release-'));
try {
  for (const lab of manifest.labs) {
    const filename = `${lab.id}-${manifest.version}.tar.gz`;
    if (lab.archive.path !== filename || !/^[a-z0-9-]+-v\d+\.\d+\.\d+\.tar\.gz$/.test(filename)) throw new Error('Unexpected archive path');
    const archive = path.join(directory, filename);
    if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== lab.archive.sha256) throw new Error('Archive digest mismatch');
    const names = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
    if (names.some(name => name.includes('..') || !(name === 'LICENSE' || name === 'labs/' || name.startsWith(`labs/${lab.id}/`)))) throw new Error('Unexpected archive member');
    execFileSync('tar', ['-xzf', archive, '-C', root]);
  }
  const inspect = directory => { for (const name of readdirSync(directory)) { const file = path.join(directory, name); const stat = lstatSync(file); if (stat.isSymbolicLink()) throw new Error('Archive symlink'); if (stat.isDirectory()) inspect(file); } };
  inspect(root);
  const errors = validateLocalLabWorkspaces(root);
  if (errors.length) throw new Error(errors.join('\n'));
  if (runtime) runLocalLabSmoke(root);
  console.log(`Verified ${manifest.labs.length} extracted labs; runtime=${runtime}`);
} finally { rmSync(root, { recursive: true, force: true }); }
