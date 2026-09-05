import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPinnedImageReference, validateLocalLabWorkspaces } from './check-labs.mjs';
import { packageRelease } from './package-release.mjs';

test('standalone workspaces satisfy contracts without importing the website', () => {
  assert.deepEqual(validateLocalLabWorkspaces(), []);
});
test('reject floating and environment-dependent Docker image versions', () => {
  assert.equal(isPinnedImageReference('postgres:17.5-alpine3.21'), true);
  assert.equal(isPinnedImageReference('postgres:latest'), false);
  assert.equal(isPinnedImageReference('postgres:${POSTGRES_TAG}'), false);
});
test('release version cannot inject paths or mutable refs', () => {
  for (const version of ['latest', '../other', 'v1.2', 'main', 'v1.0.0/escape']) {
    assert.throws(() => packageRelease({ version }), /Expected version/);
  }
});
