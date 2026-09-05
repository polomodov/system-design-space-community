import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function packageRelease({ version, ref = 'HEAD', output = 'release' }) {
  if (!/^v\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('Expected version vX.Y.Z');
  const commit = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { encoding: 'utf8' }).trim();
  const contracts = JSON.parse(execFileSync('git', ['show', `${commit}:contracts/labs.json`], { encoding: 'utf8' }));
  const manifest = { schemaVersion: 1, repository: 'polomodov/system-design-space-community', version, commit, labs: [] };
  mkdirSync(output, { recursive: true });
  for (const lab of contracts) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(lab.id)) throw new Error('Invalid lab ID');
    const files = execFileSync('git', ['ls-tree', '-r', '--name-only', commit, `labs/${lab.id}`], { encoding: 'utf8' }).trim().split('\n');
    if (files.some(file => file.includes('/.state/') || file.includes('/__pycache__/'))) throw new Error('Runtime state cannot be released');
    const tar = execFileSync('git', ['archive', '--format=tar', commit, `labs/${lab.id}`, 'LICENSE'], { maxBuffer: 20 * 1024 * 1024 });
    const bytes = gzipSync(tar, { level: 9 });
    const path = `${lab.id}-${version}.tar.gz`;
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(resolve(output, path), bytes);
    manifest.labs.push({ id: lab.id, checkIds: lab.checkIds, archive: { path, sha256 } });
  }
  writeFileSync(resolve(output, 'community-labs.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(resolve(output, 'SHA256SUMS'), manifest.labs.map(lab => `${lab.archive.sha256}  ${lab.archive.path}\n`).join(''));
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const version = args[0];
  if (args.length > 1) throw new Error('Usage: npm run package:release -- vX.Y.Z');
  console.log(JSON.stringify(packageRelease({ version }), null, 2));
}
